import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ordersTable, productsTable } from "@workspace/db";
import { rateLimit } from "../lib/rateLimit";
import { DAY_MS } from "../lib/time";
import { deviceHashFrom, toOrder } from "./store";

// "My orders": the customer's browser holds a secret id, the server keeps only its hash on each order.
// No login, no order ID to remember. Phone-OTP recovery can be added later on top of this.
const router: IRouter = Router();

const RETURN_WINDOW_DAYS = 7;
const CANCELLABLE = ["Processing", "Confirmed"];

type OrderRow = typeof ordersTable.$inferSelect;

const view = (row: OrderRow) => {
  const base = row.deliveredAt ?? row.deliveryDate;
  const canCancel = CANCELLABLE.includes(row.status);
  const canReturn =
    row.status === "Delivered" && !row.returnStatus && Date.now() - new Date(base).getTime() <= RETURN_WINDOW_DAYS * DAY_MS;
  return { ...toOrder(row), canCancel, canReturn, returnWindowDays: RETURN_WINDOW_DAYS };
};

router.get("/my/orders", rateLimit("my-orders", 120, 60_000), async (req, res) => {
  const hash = deviceHashFrom(req.headers["x-device-id"]);
  if (!hash) {
    res.json([]);
    return;
  }
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.deviceHash, hash)).orderBy(desc(ordersTable.createdAt)).limit(30);
  res.json(rows.map(view));
});

router.post("/my/orders/:orderId/cancel", rateLimit("my-cancel", 20, 10 * 60_000), async (req, res) => {
  const hash = deviceHashFrom(req.headers["x-device-id"]);
  if (!hash) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const outcome: { status: number; error?: string; row?: OrderRow } = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(and(eq(ordersTable.id, req.params.orderId), eq(ordersTable.deviceHash, hash))).for("update");
    if (!order) return { status: 404, error: "Order not found" };
    if (order.status === "Cancelled") return { status: 200, row: order };
    if (!CANCELLABLE.includes(order.status)) return { status: 409, error: "This order has already been shipped and can't be cancelled. You can request a return after it is delivered." };
    await tx.update(productsTable).set({ stock: sql`${productsTable.stock} + ${order.quantity}` }).where(eq(productsTable.id, order.productId));
    // Money already received for a UPI order has to go back to the customer: flag it for the admin.
    const [updated] = await tx.update(ordersTable)
      .set({ status: "Cancelled", ...(order.paidAt ? { refundStatus: "pending" } : {}) })
      .where(eq(ordersTable.id, order.id)).returning();
    return { status: 200, row: updated };
  });
  if (outcome.status !== 200 || !outcome.row) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }
  res.json(view(outcome.row));
});

router.post("/my/orders/:orderId/return", rateLimit("my-return", 20, 10 * 60_000), async (req, res) => {
  const hash = deviceHashFrom(req.headers["x-device-id"]);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const upiId = typeof req.body?.upiId === "string" ? req.body.upiId.trim().toLowerCase() : "";
  if (reason.length < 3 || reason.length > 300) {
    res.status(400).json({ error: "Please tell us the reason in a few words" });
    return;
  }
  // name@bank, e.g. rahul.k@okaxis. Needed so the refund can be sent to the right place.
  if (!/^[a-z0-9._-]{2,64}@[a-z][a-z0-9]{1,30}$/.test(upiId)) {
    res.status(400).json({ error: "Please enter a valid UPI ID, like name@bank" });
    return;
  }
  if (!hash) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const outcome: { status: number; error?: string; row?: OrderRow } = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(and(eq(ordersTable.id, req.params.orderId), eq(ordersTable.deviceHash, hash))).for("update");
    if (!order) return { status: 404, error: "Order not found" };
    if (order.status !== "Delivered") return { status: 409, error: "Returns can be requested after the order is delivered" };
    if (order.returnStatus) return { status: 409, error: "A return was already requested for this order" };
    if (Date.now() - new Date(order.deliveredAt ?? order.deliveryDate).getTime() > RETURN_WINDOW_DAYS * DAY_MS) {
      return { status: 409, error: `The ${RETURN_WINDOW_DAYS}-day return window for this order has closed` };
    }
    const [updated] = await tx.update(ordersTable)
      .set({ returnStatus: "requested", returnReason: reason, refundUpi: upiId, returnRequestedAt: new Date() })
      .where(eq(ordersTable.id, order.id)).returning();
    return { status: 200, row: updated };
  });
  if (outcome.status !== 200 || !outcome.row) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }
  res.json(view(outcome.row));
});

export default router;
