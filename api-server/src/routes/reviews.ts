import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ordersTable, reviewsTable } from "@workspace/db";
import { rateLimit } from "../lib/rateLimit";
import { deviceHashFrom } from "./store";
import { productsAcceptingReviews } from "../lib/settings";

const router: IRouter = Router();

// Small square profile photo, resized by the browser before upload. Only real image data URLs are accepted.
const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_AVATAR_CHARS = 40_000;

/** "devesh kumar" -> "Devesh K." so the public page never shows a full name. */
const publicName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  if (!parts.length) return "Customer";
  const first = cap(parts[0]);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first;
};

export const reviewView = (row: typeof reviewsTable.$inferSelect) => ({
  id: row.id,
  name: row.displayName,
  rating: row.rating,
  body: row.body,
  avatar: row.avatar ?? null,
  createdAt: row.createdAt,
});

// Public: the summary and the newest reviews (hidden ones are never returned).
router.get("/reviews", rateLimit("reviews", 120, 60_000), async (_req, res) => {
  const published = eq(reviewsTable.status, "published");
  const [summary] = await db
    .select({
      count: sql<number>`count(*)::int`,
      average: sql<number>`coalesce(avg(${reviewsTable.rating}), 0)::float`,
      r1: sql<number>`count(*) filter (where ${reviewsTable.rating} = 1)::int`,
      r2: sql<number>`count(*) filter (where ${reviewsTable.rating} = 2)::int`,
      r3: sql<number>`count(*) filter (where ${reviewsTable.rating} = 3)::int`,
      r4: sql<number>`count(*) filter (where ${reviewsTable.rating} = 4)::int`,
      r5: sql<number>`count(*) filter (where ${reviewsTable.rating} = 5)::int`,
    })
    .from(reviewsTable)
    .where(published);
  const rows = await db.select().from(reviewsTable).where(published).orderBy(desc(reviewsTable.createdAt)).limit(100);
  res.json({
    summary: {
      count: summary.count,
      average: Math.round(summary.average * 10) / 10,
      breakdown: { 1: summary.r1, 2: summary.r2, 3: summary.r3, 4: summary.r4, 5: summary.r5 },
    },
    reviews: rows.map(reviewView),
  });
});

// Customer: review a delivered order from "My orders". One review per order.
router.post("/my/orders/:orderId/review", rateLimit("review-post", 15, 10 * 60_000), async (req, res) => {
  const hash = deviceHashFrom(req.headers["x-device-id"]);
  const rating = Number(req.body?.rating);
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const avatar = typeof req.body?.avatar === "string" && req.body.avatar ? req.body.avatar : null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Please choose a star rating" });
    return;
  }
  if (body.length < 5 || body.length > 600) {
    res.status(400).json({ error: "Please write a few words about the product (5 to 600 characters)" });
    return;
  }
  if (avatar && (avatar.length > MAX_AVATAR_CHARS || !AVATAR_PATTERN.test(avatar))) {
    res.status(400).json({ error: "That photo couldn't be used. Please pick a different one." });
    return;
  }
  if (!hash) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const outcome: { status: number; error?: string } = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(and(eq(ordersTable.id, req.params.orderId), eq(ordersTable.deviceHash, hash))).for("update");
    if (!order) return { status: 404, error: "Order not found" };
    if (order.status !== "Delivered") return { status: 409, error: "You can review a product after it is delivered" };
    if (!(await productsAcceptingReviews([order.productId])).has(order.productId)) return { status: 409, error: "Reviews are closed for this product right now" };
    const inserted = await tx.insert(reviewsTable).values({
      id: `rev-${randomUUID()}`,
      orderId: order.id,
      productId: order.productId,
      displayName: publicName(order.customerName),
      rating,
      body,
      avatar,
      status: "published",
      createdAt: new Date(),
    }).onConflictDoNothing().returning({ id: reviewsTable.id });
    if (!inserted.length) return { status: 409, error: "You've already reviewed this order" };
    return { status: 200 };
  });
  if (outcome.status !== 200) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }
  res.status(201).json({ ok: true });
});

export default router;
