import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type AnalyticsDay = {
  label: string;
  visits: number;
  clicks: number;
  orders: number;
};

export const productsTable = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  price: real("price").notNull(),
  compareAtPrice: real("compare_at_price").notNull(),
  rating: real("rating").notNull(),
  reviewCount: integer("review_count").notNull(),
  stock: integer("stock").notNull(),
  images: text("images").array().notNull(),
  highlights: text("highlights").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  total: real("total").notNull(),
  paymentMethod: text("payment_method").notNull(),
  status: text("status").notNull(),
  deliveryDate: timestamp("delivery_date", { withTimezone: true, mode: "date" })
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull(),
  customerName: text("customer_name").notNull(),
  customerContact: text("customer_contact").notNull(),
  address: text("address").notNull(),
  // Payment reference that travels in the UPI note (UPI orders only). Separate from the order ID.
  transactionId: text("transaction_id"),
  // UPI orders: exact amount in paise the customer must pay (total minus a unique 1-99 paise offset).
  payablePaise: integer("payable_paise"),
  // Set when a matching "Received" notification arrives (or an admin assigns one by hand).
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  // "My orders": sha256 of the secret id kept in the customer's browser. The raw id is never stored.
  deviceHash: text("device_hash"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
  refundStatus: text("refund_status"), // null | pending | done
  returnStatus: text("return_status"), // null | requested | approved | rejected
  returnReason: text("return_reason"),
  returnRequestedAt: timestamp("return_requested_at", { withTimezone: true, mode: "date" }),
}, (table) => [uniqueIndex("orders_transaction_id_key").on(table.transactionId)]);

// Every "money received" notification sent by the listener app. Also the dedupe table (id = event id).
export const paymentEventsTable = pgTable("payment_events", {
  id: text("id").primaryKey(),
  amountPaise: integer("amount_paise").notNull(),
  sender: text("sender").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true, mode: "date" }).notNull(),
  status: text("status").notNull(), // matched | unmatched | dismissed
  orderId: text("order_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const analyticsTable = pgTable("analytics", {
  id: text("id").primaryKey(),
  visits: integer("visits").notNull(),
  productClicks: integer("product_clicks").notNull(),
  historicalOrders: integer("historical_orders").notNull(),
  historicalRevenue: real("historical_revenue").notNull(),
  daily: jsonb("daily").$type<AnalyticsDay[]>().notNull(),
});

export const analyticsDailyTable = pgTable("analytics_daily", {
  day: text("day").primaryKey(),
  visits: integer("visits").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
});

// Last time the payment listener app (on the Paytm phone) told the server it is alive.
export const listenerHeartbeatsTable = pgTable("listener_heartbeats", {
  deviceId: text("device_id").primaryKey(),
  lastSeen: timestamp("last_seen", { withTimezone: true, mode: "date" }).notNull(),
  listenerEnabled: boolean("listener_enabled"),
  batteryExempt: boolean("battery_exempt"),
  pending: integer("pending"),
});
