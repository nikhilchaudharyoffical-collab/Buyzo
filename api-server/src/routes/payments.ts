import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, ordersTable, paymentEventsTable } from "@workspace/db";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

const PAYTM_PACKAGE = "net.one97.paytm";
const SIGNATURE_TOLERANCE_MS = 10 * 60_000;
// The payment must be posted between a little before the order and 12 minutes after it
// (7 minute pay window + grace for slow notifications + small phone/server clock difference).
const EARLY_SKEW_MS = 2 * 60_000;
const LATE_GRACE_MS = 12 * 60_000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Marks a UPI order as paid exactly once. Returns false if it was already paid / not payable. */
export const markOrderPaid = async (tx: Tx, orderId: string): Promise<boolean> => {
  const updated = await tx
    .update(ordersTable)
    .set({ paidAt: new Date(), status: "Confirmed" })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "Processing"), sql`${ordersTable.paidAt} IS NULL`))
    .returning({ id: ordersTable.id });
  return updated.length === 1;
};

const hmacHex = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("hex");

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** "Received ₹497.37 from Name" -> { paise: 49737, sender: "Name" } */
export const parseReceived = (title: string): { paise: number; sender: string } | null => {
  const match = /received\s*(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:from\s+(.+))?/i.exec(title.trim());
  if (!match) return null;
  const [rupees, fraction = ""] = match[1].replace(/,/g, "").split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isFinite(paise) || paise <= 0) return null;
  return { paise, sender: (match[2] ?? "").trim() };
};

// The listener app posts every Paytm notification here, signed with the shared secret.
router.post("/payments/notify", rateLimit("pay-notify", 240, 60_000), async (req, res) => {
  const secret = process.env.NOTIFY_SECRET ?? "";
  if (!secret) {
    res.status(503).json({ error: "Payment notifications are not configured" });
    return;
  }
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  const timestamp = String(req.headers["x-timestamp"] ?? "");
  const signature = String(req.headers["x-signature"] ?? "");
  const sentAt = Number(timestamp) * 1000;
  if (!raw || !signature || !Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > SIGNATURE_TOLERANCE_MS) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  if (!safeEqual(signature, hmacHex(secret, `${timestamp}.${raw.toString("utf8")}`))) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const eventId = typeof body.id === "string" ? body.id : "";
  const title = typeof body.title === "string" ? body.title : "";
  const text = typeof body.text === "string" ? body.text : "";
  const postedAtMs = Number(body.postedAt);
  // Heartbeats, other apps and non-"received" notifications are acknowledged and ignored.
  if (body.type !== "notification" || body.packageName !== PAYTM_PACKAGE || !eventId) {
    res.json({ ok: true, ignored: true });
    return;
  }
  const received = parseReceived(title);
  if (!received || !Number.isFinite(postedAtMs)) {
    res.json({ ok: true, ignored: true });
    return;
  }

  const postedAt = new Date(postedAtMs);
  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentEventsTable)
      .values({
        id: eventId,
        amountPaise: received.paise,
        sender: received.sender,
        title: title.slice(0, 300),
        body: text.slice(0, 600),
        postedAt,
        status: "unmatched",
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: paymentEventsTable.id });
    if (!inserted.length) return { duplicate: true as const };

    const candidates = await tx
      .select()
      .from(ordersTable)
      .where(and(
        eq(ordersTable.paymentMethod, "UPI"),
        eq(ordersTable.payablePaise, received.paise),
        eq(ordersTable.status, "Processing"),
        sql`${ordersTable.paidAt} IS NULL`,
        gte(ordersTable.createdAt, new Date(postedAtMs - LATE_GRACE_MS)),
        lte(ordersTable.createdAt, new Date(postedAtMs + EARLY_SKEW_MS)),
      ))
      .for("update");
    // More than one candidate should not happen (amounts are unique); if it does, leave it for the admin.
    if (candidates.length !== 1) return { matched: false as const };

    const order = candidates[0];
    if (!(await markOrderPaid(tx, order.id))) return { matched: false as const };
    await tx.update(paymentEventsTable).set({ status: "matched", orderId: order.id }).where(eq(paymentEventsTable.id, eventId));
    return { matched: true as const, orderId: order.id };
  });

  res.json({ ok: true, ...result });
});

// The pay card polls this to find out whether the money has arrived.
router.get("/orders/:orderId/payment-status", rateLimit("pay-status", 240, 60_000), async (req, res) => {
  const transactionId = typeof req.query.transactionId === "string" ? req.query.transactionId : "";
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.orderId));
  if (!order || !transactionId || order.transactionId !== transactionId) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json({ paid: order.paidAt !== null, status: order.status });
});

export default router;
