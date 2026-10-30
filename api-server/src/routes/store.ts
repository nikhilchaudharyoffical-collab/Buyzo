import { randomBytes, randomUUID } from "node:crypto";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, gt, gte, lte, sql } from "drizzle-orm";
import {
  analyticsTable,
  analyticsDailyTable,
  db,
  ordersTable,
  productsTable,
} from "@workspace/db";
import {
  CreateProductBody,
  CreateOrderBody,
  UpdateProductBody,
  UpdateProductParams,
  DeleteProductParams,
  UpdateOrderParams,
  UpdateOrderBody,
  TrackAnalyticsEventBody,
  type Product,
  type Order,
  type AnalyticsSummary,
} from "@workspace/api-zod";
import { rateLimit } from "../lib/rateLimit";
import { DAY_MS, istDay } from "../lib/time";

const router: IRouter = Router();
const analyticsId = "summary";
const ADMIN_SESSION_COOKIE = "buydo_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 30 * 60;

const getSessionSecret = () => process.env.SESSION_SECRET ?? "";

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const createAdminSession = () => {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS;
  const payload = `admin:${expiresAt}`;
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

const readCookie = (req: Parameters<Parameters<IRouter["get"]>[1]>[0], name: string) => {
  const cookies = req.headers.cookie?.split(";") ?? [];
  const entry = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.trim().slice(name.length + 1)) : null;
};

const hasValidAdminSession = (req: Parameters<Parameters<IRouter["get"]>[1]>[0]) => {
  const token = readCookie(req, ADMIN_SESSION_COOKIE);
  if (!token || !getSessionSecret()) return false;

  const [payload, signature] = token.split(".");
  const [, expiresAt] = payload?.split(":") ?? [];
  if (!payload || !signature || !expiresAt || Number(expiresAt) <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expectedSignature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return safeEqual(signature, expectedSignature);
};

export const requireAdminAuth = (
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
  next: Parameters<Parameters<IRouter["get"]>[1]>[2],
) => {
  if (!hasValidAdminSession(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
};

router.post("/admin/login", rateLimit("login", 8, 15 * 60_000), async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const configuredUsername = process.env.ADMIN_USERNAME ?? "";
  const configuredPassword = process.env.ADMIN_PASSWORD ?? "";

  if (!configuredUsername || !configuredPassword || !getSessionSecret()) {
    res.status(503).json({ error: "Admin authentication is not configured" });
    return;
  }

  if (!safeEqual(username, configuredUsername) || !safeEqual(password, configuredPassword)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(createAdminSession())}; HttpOnly; Path=/; Max-Age=${ADMIN_SESSION_TTL_SECONDS}; SameSite=Lax${secureFlag}`,
  );
  res.json({ authenticated: true });
});

router.get("/admin/session", (req, res) => {
  res.json({ authenticated: hasValidAdminSession(req) });
});

router.post("/admin/logout", (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
  );
  res.json({ authenticated: false });
});

const seedImages = [
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1508057198894-247b23fe5ade?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=1200&q=85",
];

const initialProduct: Product = {
  id: "pulsewatch-pro",
  name: "PulseWatch Pro",
  category: "Wearables",
  description:
    "A focused everyday smartwatch with a bright AMOLED display, accurate health tracking, and enough battery for the week ahead.",
  price: 1299,
  compareAtPrice: 2499,
  rating: 4.7,
  reviewCount: 286,
  stock: 38,
  images: seedImages,
  highlights: [
    "AMOLED edge-to-edge display",
    "7-day battery with fast magnetic charging",
    "Heart rate, SpO2 and sleep tracking",
    "IP68 water and dust resistance",
  ],
};

type ProductRow = typeof productsTable.$inferSelect;
type OrderRow = typeof ordersTable.$inferSelect;

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  name: row.name,
  category: row.category,
  description: row.description,
  price: row.price,
  compareAtPrice: row.compareAtPrice,
  rating: row.rating,
  reviewCount: row.reviewCount,
  stock: row.stock,
  images: row.images,
  highlights: row.highlights,
});

const toOrder = (row: OrderRow): Order => ({
  id: row.id,
  productId: row.productId,
  productName: row.productName,
  quantity: row.quantity,
  total: row.total,
  paymentMethod: row.paymentMethod as Order["paymentMethod"],
  status: row.status as Order["status"],
  deliveryDate: row.deliveryDate,
  createdAt: row.createdAt,
  customerName: row.customerName,
  customerContact: row.customerContact,
  address: row.address,
  transactionId: row.transactionId ?? null,
  paidAt: row.paidAt ?? null,
});

// Payment reference for UPI orders, e.g. BDK7Q2M9XW4T. No 0/O/1/I so it is easy to read out and type.
const TXN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newTransactionId = () => "BD" + Array.from(randomBytes(10), (b) => TXN_ALPHABET[b % 32]).join("");

/**
 * Seed only a minimum catalog item and zeroed summary on an empty database.
 * Orders and visits are never fabricated during initialization.
 */
export const initializeStore = async (): Promise<void> => {
  // Adds the transaction_id column on existing databases by itself, so no manual migration is needed.
  try {
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS transaction_id text`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS orders_transaction_id_key ON orders (transaction_id)`);
  } catch (error) {
    console.warn("Could not prepare orders.transaction_id", error);
  }
  // Unique-amount payment matching (see routes/payments.ts)
  try {
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payable_paise integer`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS orders_payable_paise_idx ON orders (payable_paise)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS payment_events (
      id text PRIMARY KEY,
      amount_paise integer NOT NULL,
      sender text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      posted_at timestamptz NOT NULL,
      status text NOT NULL,
      order_id text,
      created_at timestamptz NOT NULL
    )`);
  } catch (error) {
    console.warn("Could not prepare payment matching tables", error);
  }
  const [existingAnalytics] = await db
    .select({ id: analyticsTable.id })
    .from(analyticsTable)
    .where(eq(analyticsTable.id, analyticsId));
  if (existingAnalytics) {
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(productsTable)
      .values({
        ...initialProduct,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await tx
      .insert(analyticsTable)
      .values({
        id: analyticsId,
        visits: 0,
        productClicks: 0,
        historicalOrders: 0,
        historicalRevenue: 0,
        daily: [],
      })
      .onConflictDoNothing();
  });
};

router.get("/products", async (_req, res) => {
  const rows = await db
    .select()
    .from(productsTable)
    .orderBy(desc(productsTable.createdAt));
  res.json(rows.map(toProduct));
});

router.post("/products", requireAdminAuth, async (req, res) => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid product details", details: parsed.error.flatten() });
    return;
  }

  const [row] = await db
    .insert(productsTable)
    .values({
      id: `product-${randomUUID()}`,
      ...parsed.data,
      createdAt: new Date(),
    })
    .returning();
  res.status(201).json(toProduct(row));
});

router.patch("/products/:productId", requireAdminAuth, async (req, res) => {
  const params = UpdateProductParams.safeParse(req.params);
  const body = UpdateProductBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid product update" });
    return;
  }

  const [row] = await db
    .update(productsTable)
    .set(body.data)
    .where(eq(productsTable.id, params.data.productId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(toProduct(row));
});

router.delete("/products/:productId", requireAdminAuth, async (req, res) => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const deleted = await db
    .delete(productsTable)
    .where(eq(productsTable.id, params.data.productId))
    .returning({ id: productsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.status(204).send();
});

router.get("/orders", rateLimit("admin-orders", 120, 60_000), requireAdminAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(ordersTable)
    .orderBy(desc(ordersTable.createdAt));
  res.json(rows.map(toOrder));
});

class OrderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const UPI_DISCOUNT_RATE = 0.015;
const UPI_MAX_OFFSET_PAISE = 99;
// An exact amount stays reserved this long after the order was placed (payment window + grace + quarantine),
// so a late payment can never be mistaken for somebody else's order.
const UPI_AMOUNT_HOLD_MS = 40 * 60_000;

router.post("/orders", rateLimit("orders", 10, 10 * 60_000), async (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid order details", details: parsed.error.flatten() });
    return;
  }

  const input = parsed.data;
  try {
    const row = await db.transaction(async (tx) => {
      if (input.quantity > 10) throw new OrderError(400, "You can order up to 10 units at a time");
      // Lock the product row so two buyers can't take the last unit together.
      const [product] = await tx
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, input.productId))
        .for("update");
      if (!product) throw new OrderError(404, "This product is no longer available");
      if (product.stock < input.quantity) {
        throw new OrderError(409, product.stock > 0 ? `Only ${product.stock} unit(s) left in stock` : "This product is out of stock");
      }

      // Price, discount and delivery date are decided by the server, not the browser.
      const isUpi = (input.paymentMethod as string) === "UPI";
      const subtotal = product.price * input.quantity;
      let total = subtotal - (isUpi ? Math.round(subtotal * UPI_DISCOUNT_RATE) : 0);
      const now = new Date();

      // UPI: take 1-99 paise off so this order has its own exact amount, which is how its payment is recognised.
      let payablePaise: number | null = null;
      if (isUpi) {
        const basePaise = Math.round(total * 100);
        payablePaise = basePaise;
        if (basePaise > 200) {
          // One buyer at a time per base amount, so two orders can never pick the same offset.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`upi-amount:${basePaise}`}))`);
          const taken = await tx
            .select({ paise: ordersTable.payablePaise })
            .from(ordersTable)
            .where(and(
              eq(ordersTable.paymentMethod, "UPI"),
              gte(ordersTable.payablePaise, basePaise - UPI_MAX_OFFSET_PAISE),
              lte(ordersTable.payablePaise, basePaise - 1),
              gt(ordersTable.createdAt, new Date(now.getTime() - UPI_AMOUNT_HOLD_MS)),
            ));
          const used = new Set(taken.map((row) => row.paise));
          const free: number[] = [];
          for (let offset = 1; offset <= UPI_MAX_OFFSET_PAISE; offset++) if (!used.has(basePaise - offset)) free.push(offset);
          if (!free.length) throw new OrderError(409, "Too many payments in progress right now. Please try again in a few minutes.");
          payablePaise = basePaise - free[Math.floor(Math.random() * free.length)];
        }
        total = payablePaise / 100;
      }

      await tx
        .update(productsTable)
        .set({ stock: sql`${productsTable.stock} - ${input.quantity}` })
        .where(eq(productsTable.id, product.id));

      const [createdOrder] = await tx
        .insert(ordersTable)
        .values({
          id: `BD-${Date.now()}-${randomUUID().slice(0, 8)}`,
          ...input,
          productName: product.name,
          total,
          deliveryDate: new Date(now.getTime() + (isUpi ? 5 : 10) * DAY_MS),
          status: "Processing",
          createdAt: now,
          transactionId: isUpi ? newTransactionId() : null,
          payablePaise,
        })
        .returning();
      return createdOrder;
    });
    res.status(201).json(toOrder(row));
  } catch (error) {
    if (error instanceof OrderError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});

// Customer backs out of an unpaid UPI order from the pay card: release the reserved stock exactly once.
router.post("/orders/:orderId/cancel", rateLimit("order-cancel", 20, 10 * 60_000), async (req, res) => {
  const orderId = String(req.params.orderId ?? "");
  const transactionId = typeof req.body?.transactionId === "string" ? req.body.transactionId : "";
  if (!orderId || !transactionId) {
    res.status(400).json({ error: "Invalid cancel request" });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update");
      if (!current || current.transactionId !== transactionId) throw new OrderError(404, "Order not found");
      if (current.paymentMethod !== "UPI") throw new OrderError(409, "Only unpaid UPI orders can be cancelled here");
      if (current.paidAt) throw new OrderError(409, "Payment was already received for this order");
      if (current.status === "Cancelled") return current; // already released, never restock twice
      if (current.status !== "Processing") throw new OrderError(409, "This order can no longer be cancelled");
      await tx.update(productsTable).set({ stock: sql`${productsTable.stock} + ${current.quantity}` }).where(eq(productsTable.id, current.productId));
      const [updated] = await tx.update(ordersTable).set({ status: "Cancelled" }).where(eq(ordersTable.id, current.id)).returning();
      return updated;
    });
    res.json(toOrder(row));
  } catch (error) {
    if (error instanceof OrderError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.patch("/orders/:orderId", requireAdminAuth, async (req, res) => {
  const params = UpdateOrderParams.safeParse(req.params);
  const body = UpdateOrderBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid order update" });
    return;
  }

  try {
    const row = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, params.data.orderId))
        .for("update");
      if (!current) throw new OrderError(404, "Order not found");
      const next = body.data.status as string;
      // Keep stock honest: cancelling returns units, re-opening takes them again.
      if (current.status !== "Cancelled" && next === "Cancelled") {
        await tx.update(productsTable).set({ stock: sql`${productsTable.stock} + ${current.quantity}` }).where(eq(productsTable.id, current.productId));
      } else if (current.status === "Cancelled" && next !== "Cancelled") {
        const [p] = await tx.select().from(productsTable).where(eq(productsTable.id, current.productId)).for("update");
        if (p && p.stock < current.quantity) throw new OrderError(409, `Only ${p.stock} unit(s) in stock, cannot re-open this order`);
        if (p) await tx.update(productsTable).set({ stock: sql`${productsTable.stock} - ${current.quantity}` }).where(eq(productsTable.id, p.id));
      }
      const [updated] = await tx.update(ordersTable).set({ status: body.data.status }).where(eq(ordersTable.id, current.id)).returning();
      return updated;
    });
    res.json(toOrder(row));
  } catch (error) {
    if (error instanceof OrderError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.get("/analytics/summary", requireAdminAuth, async (_req, res) => {
  const [metrics] = await db
    .select()
    .from(analyticsTable)
    .where(eq(analyticsTable.id, analyticsId));
  if (!metrics) {
    res.status(503).json({ error: "Analytics are not initialized" });
    return;
  }

  const [totals] = await db
    .select({
      orders: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${ordersTable.total}), 0)::float8`,
    })
    .from(ordersTable);
  const orders = metrics.historicalOrders + (totals?.orders ?? 0);
  const revenue = metrics.historicalRevenue + (totals?.revenue ?? 0);

  const summary: AnalyticsSummary = {
    visits: metrics.visits,
    productClicks: metrics.productClicks,
    orders,
    revenue,
    conversionRate: metrics.visits
      ? Number(((orders / metrics.visits) * 100).toFixed(1))
      : 0,
    daily: metrics.daily,
  };
  res.json(summary);
});

router.post("/analytics/events", rateLimit("events", 120, 60_000), async (req, res) => {
  const parsed = TrackAnalyticsEventBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid analytics event", details: parsed.error.flatten() });
    return;
  }

  if (parsed.data.type === "visit") {
    await db
      .update(analyticsTable)
      .set({ visits: sql`${analyticsTable.visits} + 1` })
      .where(eq(analyticsTable.id, analyticsId));
  } else if (parsed.data.type === "click") {
    await db
      .update(analyticsTable)
      .set({ productClicks: sql`${analyticsTable.productClicks} + 1` })
      .where(eq(analyticsTable.id, analyticsId));
  }
  if (parsed.data.type === "visit" || parsed.data.type === "click") {
    const isVisit = parsed.data.type === "visit";
    await db
      .insert(analyticsDailyTable)
      .values({ day: istDay(new Date()), visits: isVisit ? 1 : 0, clicks: isVisit ? 0 : 1 })
      .onConflictDoUpdate({
        target: analyticsDailyTable.day,
        set: isVisit
          ? { visits: sql`${analyticsDailyTable.visits} + 1` }
          : { clicks: sql`${analyticsDailyTable.clicks} + 1` },
      });
  }
  res.status(204).send();
});

export default router;