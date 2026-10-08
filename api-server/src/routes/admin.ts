import { Router, type IRouter } from "express";
import { and, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { analyticsDailyTable, db, ordersTable, productsTable } from "@workspace/db";
import { requireAdminAuth } from "./store";
import { DAY_MS, istDay, istHour, istLabel, istWeekday } from "../lib/time";

const router: IRouter = Router();
router.use(requireAdminAuth);

const STATUSES = ["Processing", "Confirmed", "Shipped", "Delivered", "Cancelled"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const round = (n: number, d = 0) => Number(n.toFixed(d));

// ================= Analytics (100% computed from real data) =================
router.get("/analytics", async (req, res) => {
  const requested = Number(req.query.days);
  const days = [7, 30, 90].includes(requested) ? requested : 30;
  const now = new Date();
  const keyAt = (i: number) => istDay(new Date(now.getTime() - i * DAY_MS));
  const curKeys = Array.from({ length: days }, (_, i) => keyAt(days - 1 - i));
  const prevKeys = Array.from({ length: days }, (_, i) => keyAt(2 * days - 1 - i));
  const curSet = new Set(curKeys);
  const prevSet = new Set(prevKeys);

  const [allOrders, dailyRows, products] = await Promise.all([
    db.select().from(ordersTable),
    db.select().from(analyticsDailyTable),
    db.select().from(productsTable),
  ]);
  const daily = new Map(dailyRows.map((r) => [r.day, r]));
  const valid = (o: (typeof allOrders)[number]) => o.status !== "Cancelled";
  const inCur = allOrders.filter((o) => curSet.has(istDay(o.createdAt)));
  const inPrev = allOrders.filter((o) => prevSet.has(istDay(o.createdAt)));

  const allTimeCount = new Map<string, number>();
  for (const o of allOrders) {
    const k = o.customerContact.toLowerCase();
    allTimeCount.set(k, (allTimeCount.get(k) ?? 0) + 1);
  }
  const firstSeen = new Map<string, Date>();
  for (const o of allOrders) {
    const k = o.customerContact.toLowerCase();
    const f = firstSeen.get(k);
    if (!f || o.createdAt < f) firstSeen.set(k, o.createdAt);
  }

  const summarize = (orders: typeof allOrders, keys: string[]) => {
    const ok = orders.filter(valid);
    const revenue = ok.reduce((s, o) => s + o.total, 0);
    const visits = keys.reduce((s, k) => s + (daily.get(k)?.visits ?? 0), 0);
    const clicks = keys.reduce((s, k) => s + (daily.get(k)?.clicks ?? 0), 0);
    const customers = new Set(ok.map((o) => o.customerContact.toLowerCase()));
    const repeat = [...customers].filter((c) => (allTimeCount.get(c) ?? 0) > 1).length;
    return {
      revenue: round(revenue, 2),
      orders: ok.length,
      units: ok.reduce((s, o) => s + o.quantity, 0),
      aov: ok.length ? round(revenue / ok.length, 2) : 0,
      visits,
      clicks,
      conversion: visits ? round((ok.length / visits) * 100, 2) : 0,
      clickRate: visits ? round((clicks / visits) * 100, 1) : 0,
      cancelRate: orders.length ? round(((orders.length - ok.length) / orders.length) * 100, 1) : 0,
      customers: customers.size,
      newCustomers: [...customers].filter((c) => firstSeen.get(c) && keys.includes(istDay(firstSeen.get(c)!))).length,
      repeatRate: customers.size ? round((repeat / customers.size) * 100, 1) : 0,
    };
  };
  const cur = summarize(inCur, curKeys);
  const prev = summarize(inPrev, prevKeys);

  const series = curKeys.map((key, i) => {
    const date = new Date(now.getTime() - (days - 1 - i) * DAY_MS);
    const dayOrders = inCur.filter((o) => istDay(o.createdAt) === key && valid(o));
    return {
      date: key,
      label: istLabel(date),
      visits: daily.get(key)?.visits ?? 0,
      clicks: daily.get(key)?.clicks ?? 0,
      orders: dayOrders.length,
      revenue: round(dayOrders.reduce((s, o) => s + o.total, 0), 2),
    };
  });

  const byStatus = STATUSES.map((name) => ({ name, count: inCur.filter((o) => o.status === name).length }));
  const byPayment = ["COD", "UPI"].map((name) => {
    const rows = inCur.filter((o) => valid(o) && o.paymentMethod === name);
    return { name, count: rows.length, revenue: round(rows.reduce((s, o) => s + o.total, 0), 2) };
  });

  const prodMap = new Map<string, { productId: string; name: string; units: number; revenue: number }>();
  for (const o of inCur.filter(valid)) {
    const e = prodMap.get(o.productId) ?? { productId: o.productId, name: o.productName, units: 0, revenue: 0 };
    e.units += o.quantity;
    e.revenue += o.total;
    prodMap.set(o.productId, e);
  }
  const topProducts = [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6).map((p) => ({ ...p, revenue: round(p.revenue, 2) }));

  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${h}:00`, orders: 0 }));
  const weekday = WEEKDAYS.map((name) => ({ name, orders: 0, revenue: 0 }));
  for (const o of inCur.filter(valid)) {
    hourly[istHour(o.createdAt)].orders += 1;
    const w = weekday.find((x) => x.name === istWeekday(o.createdAt));
    if (w) {
      w.orders += 1;
      w.revenue = round(w.revenue + o.total, 2);
    }
  }

  const custMap = new Map<string, { name: string; contact: string; orders: number; spent: number }>();
  for (const o of inCur.filter(valid)) {
    const k = o.customerContact.toLowerCase();
    const e = custMap.get(k) ?? { name: o.customerName, contact: o.customerContact, orders: 0, spent: 0 };
    e.orders += 1;
    e.spent += o.total;
    custMap.set(k, e);
  }
  const topCustomers = [...custMap.values()].sort((a, b) => b.spent - a.spent).slice(0, 5).map((c) => ({ ...c, spent: round(c.spent, 2) }));

  const inventory = products
    .map((p) => {
      const sold = prodMap.get(p.id)?.units ?? 0;
      const perDay = sold / days;
      return { id: p.id, name: p.name, stock: p.stock, soldInPeriod: sold, perDay: round(perDay, 2), daysLeft: perDay > 0 ? Math.floor(p.stock / perDay) : null };
    })
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  const last7 = series.slice(-7);
  const best = [...series].sort((a, b) => b.revenue - a.revenue)[0];
  const today = series[series.length - 1];
  const yesterday = series[series.length - 2];

  res.json({
    days,
    generatedAt: now.toISOString(),
    kpis: cur,
    previous: prev,
    today: { revenue: today?.revenue ?? 0, orders: today?.orders ?? 0, visits: today?.visits ?? 0, yRevenue: yesterday?.revenue ?? 0, yOrders: yesterday?.orders ?? 0 },
    series,
    byStatus,
    byPayment,
    topProducts,
    hourly,
    weekday,
    topCustomers,
    funnel: [
      { name: "Visits", value: cur.visits },
      { name: "Product clicks", value: cur.clicks },
      { name: "Orders", value: cur.orders },
    ],
    inventory,
    inventoryValue: round(products.reduce((s, p) => s + p.price * p.stock, 0), 2),
    pendingOrders: allOrders.filter((o) => o.status === "Processing").length,
    bestDay: best && best.revenue > 0 ? { label: best.label, revenue: best.revenue, orders: best.orders } : null,
    projection: { next7Revenue: round((last7.reduce((s, d) => s + d.revenue, 0) / Math.max(1, last7.length)) * 7, 0) },
  });
});

// ================= Customers (everything users typed at checkout) =================
router.get("/customers", async (_req, res) => {
  const rows = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
  const map = new Map<string, any>();
  for (const o of rows) {
    const key = o.customerContact.toLowerCase();
    const c = map.get(key) ?? {
      name: o.customerName, contact: o.customerContact, address: o.address, addresses: new Set<string>(),
      orders: 0, spent: 0, cancelled: 0, firstOrder: o.createdAt, lastOrder: o.createdAt, orderIds: [] as string[],
    };
    c.orders += 1;
    if (o.status === "Cancelled") c.cancelled += 1;
    else c.spent += o.total;
    c.addresses.add(o.address);
    c.orderIds.push(o.id);
    if (o.createdAt < c.firstOrder) c.firstOrder = o.createdAt;
    map.set(key, c);
  }
  const customers = [...map.values()]
    .map((c) => ({ ...c, addresses: [...c.addresses], spent: round(c.spent, 2) }))
    .sort((a, b) => +new Date(b.lastOrder) - +new Date(a.lastOrder));
  res.json(customers);
});

// ================= Database tools =================
router.get("/db/overview", async (_req, res) => {
  const [[p], [o], [a]] = await Promise.all([
    db.select({ n: count() }).from(productsTable),
    db.select({ n: count(), oldest: sql<Date | null>`min(${ordersTable.createdAt})`, newest: sql<Date | null>`max(${ordersTable.createdAt})` }).from(ordersTable),
    db.select({ n: count() }).from(analyticsDailyTable),
  ]);
  const statusRows = await db.select({ status: ordersTable.status, n: count() }).from(ordersTable).groupBy(ordersTable.status);
  let sizes: { name: string; bytes: number }[] = [];
  try {
    const r = await db.execute(sql`select c.relname as name, pg_total_relation_size(c.oid)::bigint as bytes from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by bytes desc`);
    sizes = (r.rows as any[]).map((x) => ({ name: String(x.name), bytes: Number(x.bytes) }));
  } catch { /* size info is optional */ }
  res.json({
    products: p?.n ?? 0,
    orders: o?.n ?? 0,
    analyticsDays: a?.n ?? 0,
    oldestOrder: o?.oldest ?? null,
    newestOrder: o?.newest ?? null,
    statuses: statusRows.map((s) => ({ status: s.status, count: s.n })),
    sizes,
  });
});

router.delete("/orders/:orderId", async (req, res) => {
  const deleted = await db.delete(ordersTable).where(eq(ordersTable.id, String(req.params.orderId))).returning({ id: ordersTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json({ deleted: 1 });
});

router.post("/orders/bulk-delete", async (req, res) => {
  const ids: unknown = req.body?.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every((i) => typeof i === "string")) {
    res.status(400).json({ error: "Provide 1-500 order ids" });
    return;
  }
  const deleted = await db.delete(ordersTable).where(inArray(ordersTable.id, ids as string[])).returning({ id: ordersTable.id });
  res.json({ deleted: deleted.length });
});

/** Purge data. Body: { target: "orders"|"analytics", status?, olderThanDays?, all?, confirm: "DELETE" } */
router.post("/data/purge", async (req, res) => {
  const { target, status, olderThanDays, all, confirm } = req.body ?? {};
  if (confirm !== "DELETE") {
    res.status(400).json({ error: 'Type "DELETE" to confirm' });
    return;
  }
  if (target === "analytics") {
    const cutoff = typeof olderThanDays === "number" && olderThanDays > 0 ? istDay(new Date(Date.now() - olderThanDays * DAY_MS)) : null;
    if (!cutoff && !all) {
      res.status(400).json({ error: "Choose a cutoff or 'all'" });
      return;
    }
    const deleted = await db.delete(analyticsDailyTable).where(cutoff ? lt(analyticsDailyTable.day, cutoff) : undefined).returning({ d: analyticsDailyTable.day });
    res.json({ deleted: deleted.length });
    return;
  }
  if (target === "orders") {
    const conds = [];
    if (typeof status === "string" && STATUSES.includes(status)) conds.push(eq(ordersTable.status, status));
    if (typeof olderThanDays === "number" && olderThanDays > 0) conds.push(lt(ordersTable.createdAt, new Date(Date.now() - olderThanDays * DAY_MS)));
    if (!conds.length && !all) {
      res.status(400).json({ error: "Choose a filter or 'all'" });
      return;
    }
    const deleted = await db.delete(ordersTable).where(conds.length ? and(...conds) : undefined).returning({ id: ordersTable.id });
    res.json({ deleted: deleted.length });
    return;
  }
  res.status(400).json({ error: "Unknown target" });
});

// Old sample orders created by the earlier version of the app
router.post("/data/purge-demo", async (_req, res) => {
  const deleted = await db.delete(ordersTable).where(inArray(ordersTable.id, ["DC-1047", "DC-1048"])).returning({ id: ordersTable.id });
  res.json({ deleted: deleted.length });
});

router.get("/export/orders.csv", async (_req, res) => {
  const rows = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
  const esc = (v: unknown) => `"${String(v instanceof Date ? v.toISOString() : v).replaceAll('"', '""')}"`;
  const head = ["Order ID", "Placed at", "Status", "Customer", "Contact", "Address", "Product", "Qty", "Payment", "Total", "Delivery date"];
  const lines = rows.map((o) => [o.id, o.createdAt, o.status, o.customerName, o.customerContact, o.address, o.productName, o.quantity, o.paymentMethod, o.total, o.deliveryDate].map(esc).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="buydo-orders-${istDay(new Date())}.csv"`);
  res.send("\uFEFF" + [head.map(esc).join(","), ...lines].join("\n"));
});

export default router;
