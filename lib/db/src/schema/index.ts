import {
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
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
});

export const analyticsTable = pgTable("analytics", {
  id: text("id").primaryKey(),
  visits: integer("visits").notNull(),
  productClicks: integer("product_clicks").notNull(),
  historicalOrders: integer("historical_orders").notNull(),
  historicalRevenue: real("historical_revenue").notNull(),
  daily: jsonb("daily").$type<AnalyticsDay[]>().notNull(),
});