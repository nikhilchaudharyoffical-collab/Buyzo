import { randomBytes, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { count, desc, eq, inArray, isNotNull, notInArray, and, sql } from "drizzle-orm";
import {
  adminAuditTable,
  analyticsDailyTable,
  analyticsTable,
  db,
  ordersTable,
  paymentEventsTable,
  productsTable,
  reviewsTable,
} from "@workspace/db";
import { rateLimit } from "../lib/rateLimit";
import { requireAdminAuth, safeEqual } from "./store";

// "Fresh start" for launch day: erase test orders, payments, reviews and visit counters.
// Several locks on purpose: admin session, a preview that issues a one-time ticket, the admin password again,
// a typed phrase, a backup step, and an extra tick when real money or open orders are involved.
const router: IRouter = Router();
router.use(requireAdminAuth);

const PHRASE = "RESET BUYDO";
const TICKET_TTL_MS = 5 * 60_000;
const tickets = new Map<string, { fingerprint: string; expires: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of tickets) if (value.expires <= now) tickets.delete(key);
}, 60_000).unref();

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

const snapshot = async () => {
  const [[orders], [paid], [events], [reviews], [days], [products]] = await Promise.all([
    db.select({ n: count(), newest: sql<string | null>`max(${ordersTable.createdAt})::text` }).from(ordersTable),
    db.select({ n: count() }).from(ordersTable).where(isNotNull(ordersTable.paidAt)),
    db.select({ n: count() }).from(paymentEventsTable),
    db.select({ n: count() }).from(reviewsTable),
    db.select({ n: count() }).from(analyticsDailyTable),
    db.select({ n: count() }).from(productsTable),
  ]);
  const [open] = await db.select({ n: count() }).from(ordersTable).where(notInArray(ordersTable.status, ["Delivered", "Cancelled"]));
  const [refunds] = await db.select({ n: count() }).from(ordersTable).where(eq(ordersTable.refundStatus, "pending"));
  const [summary] = await db.select().from(analyticsTable).where(eq(analyticsTable.id, "summary"));
  const [returnsOpen] = await db.select({ n: count() }).from(ordersTable).where(eq(ordersTable.returnStatus, "requested"));
  return {
    orders: orders?.n ?? 0,
    newestOrder: orders?.newest ?? null,
    paidOrders: paid?.n ?? 0,
    openOrders: open?.n ?? 0,
    pendingRefunds: refunds?.n ?? 0,
    openReturns: returnsOpen?.n ?? 0,
    paymentEvents: events?.n ?? 0,
    reviews: reviews?.n ?? 0,
    analyticsDays: days?.n ?? 0,
    visits: summary?.visits ?? 0,
    productClicks: summary?.productClicks ?? 0,
    products: products?.n ?? 0,
  };
};

const fingerprintOf = (s: Snapshot) => [s.orders, s.newestOrder, s.paidOrders, s.paymentEvents, s.reviews, s.products].join("|");

// Step 1: look before you leap. Nothing is deleted here.
router.get("/preview", rateLimit("reset-preview", 30, 10 * 60_000), async (_req, res) => {
  const snap = await snapshot();
  const ticket = randomBytes(24).toString("hex");
  tickets.set(ticket, { fingerprint: fingerprintOf(snap), expires: Date.now() + TICKET_TTL_MS });
  const history = await db.select().from(adminAuditTable).where(eq(adminAuditTable.action, "fresh-start")).orderBy(desc(adminAuditTable.createdAt)).limit(5);
  res.json({
    ...snap,
    phrase: PHRASE,
    ticket,
    ticketMinutes: TICKET_TTL_MS / 60_000,
    live: snap.openOrders > 0 || snap.pendingRefunds > 0 || snap.openReturns > 0,
    history: history.map((row) => ({ at: row.createdAt, detail: row.detail })),
  });
});

// Step 2: the erase. Everything runs in one transaction, so it is all-or-nothing.
router.post("/run", rateLimit("reset-run", 5, 15 * 60_000), async (req, res) => {
  const body = req.body ?? {};
  const password = typeof body.password === "string" ? body.password : "";
  const configured = process.env.ADMIN_PASSWORD ?? "";
  if (!configured || !safeEqual(password, configured)) {
    res.status(403).json({ error: "Admin password is wrong. Nothing was deleted." });
    return;
  }
  if (body.phrase !== PHRASE) {
    res.status(400).json({ error: `Type ${PHRASE} exactly to confirm. Nothing was deleted.` });
    return;
  }
  if (body.backupDone !== true) {
    res.status(400).json({ error: "Download the backup first. Nothing was deleted." });
    return;
  }
  const scope = {
    orders: body.scope?.orders === true,
    reviews: body.scope?.reviews === true,
    analytics: body.scope?.analytics === true,
    products: body.scope?.products === true,
  };
  if (!scope.orders && !scope.reviews && !scope.analytics && !scope.products) {
    res.status(400).json({ error: "Choose what to erase. Nothing was deleted." });
    return;
  }
  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  const issued = tickets.get(ticket);
  tickets.delete(ticket); // one use only
  if (!issued || issued.expires <= Date.now()) {
    res.status(409).json({ error: "The check has expired. Press 'Check what will be erased' again. Nothing was deleted." });
    return;
  }
  const before = await snapshot();
  if (fingerprintOf(before) !== issued.fingerprint) {
    res.status(409).json({ error: "Orders or payments changed since you checked (a new order may have arrived). Check again. Nothing was deleted." });
    return;
  }
  const live = before.openOrders > 0 || before.pendingRefunds > 0 || before.openReturns > 0;
  if (scope.orders && live && body.acknowledgeLive !== true) {
    res.status(409).json({ error: "There are open orders, refunds or returns. Tick the box that you understand they will be erased. Nothing was deleted." });
    return;
  }
  if (scope.products && body.acknowledgeProducts !== true) {
    res.status(409).json({ error: "Tick the box to confirm erasing products too. Nothing was deleted." });
    return;
  }

  try {
    const erased = await db.transaction(async (tx) => {
      const out = { orders: 0, paymentEvents: 0, reviews: 0, analyticsDays: 0, products: 0 };
      if (scope.reviews || scope.orders) {
        // Reviews belong to orders: erasing orders without them would leave reviews that point nowhere.
        out.reviews = (await tx.delete(reviewsTable).returning({ id: reviewsTable.id })).length;
      }
      if (scope.orders) {
        out.orders = (await tx.delete(ordersTable).returning({ id: ordersTable.id })).length;
        out.paymentEvents = (await tx.delete(paymentEventsTable).returning({ id: paymentEventsTable.id })).length;
      }
      if (scope.analytics) {
        out.analyticsDays = (await tx.delete(analyticsDailyTable).returning({ d: analyticsDailyTable.day })).length;
        await tx
          .update(analyticsTable)
          .set({ visits: 0, productClicks: 0, historicalOrders: 0, historicalRevenue: 0, daily: [] })
          .where(eq(analyticsTable.id, "summary"));
      }
      if (scope.products) {
        out.products = (await tx.delete(productsTable).returning({ id: productsTable.id })).length;
      }
      await tx.insert(adminAuditTable).values({
        id: `audit-${randomUUID()}`,
        action: "fresh-start",
        detail: `Erased ${out.orders} orders, ${out.paymentEvents} payment records, ${out.reviews} reviews, ${out.analyticsDays} analytics days, ${out.products} products`,
        createdAt: new Date(),
      });
      return out;
    });
    res.json({ ok: true, erased });
  } catch (error) {
    console.error("Fresh start failed:", error);
    res.status(500).json({ error: "The reset failed and nothing was changed. Check the server logs." });
  }
});

export default router;
