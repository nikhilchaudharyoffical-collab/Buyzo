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
  // Buy 1 get 1 free: the admin switches it on or off per product.
  bogoEnabled: boolean("bogo_enabled").notNull().default(true),
  // Customers can leave a review for this product (the store-wide switch must be on too).
  reviewsEnabled: boolean("reviews_enabled").notNull().default(true),
  // Percent taken off when the customer pays by UPI (what is really given), and the optional "up to" number shown on the store.
  upiDiscountPercent: real("upi_discount_percent").notNull().default(1.5),
  upiDiscountUpTo: real("upi_discount_up_to"),
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
  // Where the customer wants a refund sent (asked when they request a return).
  refundUpi: text("refund_upi"),
  returnRequestedAt: timestamp("return_requested_at", { withTimezone: true, mode: "date" }),
  // Buy 1 get 1 free: units given free with this order (0 when the product had no offer). Units shipped = quantity + free.
  freeQuantity: integer("free_quantity").notNull().default(0),
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

// Customer reviews. One per delivered order, so every review is from a verified buyer.
export const reviewsTable = pgTable("reviews", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  productId: text("product_id").notNull(),
  displayName: text("display_name").notNull(), // "Devesh K." (first name + last initial)
  rating: integer("rating").notNull(),
  body: text("body").notNull(),
  avatar: text("avatar"), // small square JPEG as a data URL, optional
  status: text("status").notNull(), // published | hidden
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [uniqueIndex("reviews_order_id_key").on(table.orderId)]);

// Store-wide switches the admin can flip (key/value). Example: reviews_enabled = "true" | "false".
export const storeSettingsTable = pgTable("store_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
