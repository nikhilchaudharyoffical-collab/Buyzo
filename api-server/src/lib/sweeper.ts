import { and, eq, lt, sql } from "drizzle-orm";
import { db, ordersTable, productsTable } from "@workspace/db";
import { logger } from "./logger";

// An unpaid UPI order keeps its stock reserved. Once the payment can no longer be matched automatically
// (12 minutes + a little grace) it is cancelled and the units go back on the shelf.
const UNPAID_UPI_MAX_AGE_MS = 15 * 60_000;
const SWEEP_EVERY_MS = 60_000;

export const cancelExpiredUpiOrders = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - UNPAID_UPI_MAX_AGE_MS);
  return db.transaction(async (tx) => {
    // The conditions are re-checked by the database as it updates, so an order paid at this very moment is left alone.
    const cancelled = await tx
      .update(ordersTable)
      .set({ status: "Cancelled" })
      .where(and(
        eq(ordersTable.paymentMethod, "UPI"),
        eq(ordersTable.status, "Processing"),
        sql`${ordersTable.paidAt} IS NULL`,
        lt(ordersTable.createdAt, cutoff),
      ))
      .returning({ productId: ordersTable.productId, quantity: ordersTable.quantity });
    const perProduct = new Map<string, number>();
    for (const row of cancelled) perProduct.set(row.productId, (perProduct.get(row.productId) ?? 0) + row.quantity);
    for (const [productId, units] of perProduct) {
      await tx.update(productsTable).set({ stock: sql`${productsTable.stock} + ${units}` }).where(eq(productsTable.id, productId));
    }
    return cancelled.length;
  });
};

export const startSweeper = () => {
  const run = async () => {
    try {
      const count = await cancelExpiredUpiOrders();
      if (count) logger.info({ count }, "Cancelled expired unpaid UPI orders and released their stock");
    } catch (err) {
      logger.error({ err }, "Expired UPI order sweep failed");
    }
  };
  void run();
  setInterval(run, SWEEP_EVERY_MS).unref();
};
