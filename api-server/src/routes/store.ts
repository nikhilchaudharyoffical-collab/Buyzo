import { randomUUID } from "node:crypto";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  analyticsTable,
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

const router: IRouter = Router();
const analyticsId = "summary";
const ADMIN_SESSION_COOKIE = "dropcart_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

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

const requireAdminAuth = (
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

router.post("/admin/login", async (req, res) => {
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

const initialOrders: Order[] = [
  {
    id: "DC-1048",
    productId: "pulsewatch-pro",
    productName: "PulseWatch Pro",
    quantity: 1,
    total: 1299,
    paymentMethod: "COD",
    status: "Shipped",
    deliveryDate: new Date(Date.now() + 3 * 86400000),
    createdAt: new Date(Date.now() - 2 * 86400000),
    customerName: "Aarav Mehta",
    customerContact: "aarav@example.com",
    address: "14 Green Park, New Delhi, Delhi 110016",
  },
  {
    id: "DC-1047",
    productId: "pulsewatch-pro",
    productName: "PulseWatch Pro",
    quantity: 2,
    total: 2598,
    paymentMethod: "UPI",
    status: "Confirmed",
    deliveryDate: new Date(Date.now() + 2 * 86400000),
    createdAt: new Date(Date.now() - 86400000),
    customerName: "Sana Kapoor",
    customerContact: "sana@example.com",
    address: "22 Lake View Road, Bengaluru, Karnataka 560001",
  },
];

const initialAnalytics: AnalyticsSummary & {
  historicalOrders: number;
  historicalRevenue: number;
} = {
  visits: 12480,
  productClicks: 4892,
  orders: 0,
  revenue: 0,
  conversionRate: 0,
  historicalOrders: 384,
  historicalRevenue: 483210,
  daily: [
    { label: "Mon", visits: 1320, clicks: 440, orders: 32 },
    { label: "Tue", visits: 1680, clicks: 590, orders: 46 },
    { label: "Wed", visits: 1540, clicks: 520, orders: 40 },
    { label: "Thu", visits: 1910, clicks: 760, orders: 58 },
    { label: "Fri", visits: 2110, clicks: 840, orders: 71 },
    { label: "Sat", visits: 2040, clicks: 780, orders: 64 },
    { label: "Sun", visits: 1880, clicks: 962, orders: 73 },
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
});

/**
 * Populate an empty database once without replacing any existing catalog,
 * orders, or analytics. This keeps the existing demo experience while making
 * all subsequent changes durable.
 */
export const initializeStore = async (): Promise<void> => {
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
    await tx.insert(ordersTable).values(initialOrders).onConflictDoNothing();
    await tx
      .insert(analyticsTable)
      .values({
        id: analyticsId,
        visits: initialAnalytics.visits,
        productClicks: initialAnalytics.productClicks,
        historicalOrders: initialAnalytics.historicalOrders,
        historicalRevenue: initialAnalytics.historicalRevenue,
        daily: initialAnalytics.daily,
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

router.get("/orders", requireAdminAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(ordersTable)
    .orderBy(desc(ordersTable.createdAt));
  res.json(rows.map(toOrder));
});

router.post("/orders", async (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid order details", details: parsed.error.flatten() });
    return;
  }

  const row = await db.transaction(async (tx) => {
    const [createdOrder] = await tx
      .insert(ordersTable)
      .values({
        id: `DC-${Date.now()}-${randomUUID().slice(0, 8)}`,
        ...parsed.data,
        status: "Processing",
        createdAt: new Date(),
      })
      .returning();

    await tx
      .update(analyticsTable)
      .set({ visits: sql`${analyticsTable.visits} + 1` })
      .where(eq(analyticsTable.id, analyticsId));

    return createdOrder;
  });

  res.status(201).json(toOrder(row));
});

router.patch("/orders/:orderId", requireAdminAuth, async (req, res) => {
  const params = UpdateOrderParams.safeParse(req.params);
  const body = UpdateOrderBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid order update" });
    return;
  }

  const [row] = await db
    .update(ordersTable)
    .set({ status: body.data.status })
    .where(eq(ordersTable.id, params.data.orderId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(toOrder(row));
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

router.post("/analytics/events", async (req, res) => {
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
  res.status(204).send();
});

export default router;