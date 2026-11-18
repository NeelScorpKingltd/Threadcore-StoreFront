import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  primaryKey,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────────────────────
export const orderStatusEnum = pgEnum("order_status", [
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
]);

// ── Products ───────────────────────────────────────────────────────────
export const pendingActions = pgTable("pending_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  action: jsonb("action").notNull(),
  preview: jsonb("preview").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`now() + interval '5 minutes'`),
}, (table) => [check("pending_action_status", sql`${table.status} in ('pending','approved','rejected','executed','expired')`)]).enableRLS();

export const mutationReceipts = pgTable("mutation_receipts", {
  userId: text("user_id").notNull(),
  operation: text("operation").notNull(),
  requestId: uuid("request_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  result: jsonb("result").notNull().$type<unknown>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.operation, table.requestId] })]).enableRLS();

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  sku: text("sku").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  priceCents: integer("price_cents").notNull(),
  inventoryCount: integer("inventory_count").notNull().default(0),
  imageUrl: text("image_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [check("product_nonnegative", sql`${table.inventoryCount} >= 0 AND ${table.priceCents} >= 0`)]);

// ── Addresses ──────────────────────────────────────────────────────────
export const addresses = pgTable("addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  street: text("street").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull().default("India"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [uniqueIndex("unique_default_address").on(table.userId).where(sql`${table.isDefault}`)]);

// ── Orders ─────────────────────────────────────────────────────────────
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  userId: text("user_id").notNull(),
  shippingAddress: jsonb("shipping_address")
    .notNull()
    .$type<{
      street: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    }>(),
  totalAmountCents: integer("total_amount_cents").notNull(),
  status: orderStatusEnum("status").notNull().default("CONFIRMED"),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  check("order_total_nonnegative", sql`${table.totalAmountCents} >= 0`),
  index("orders_customer_page").on(table.userId, table.createdAt.desc(), table.id.desc()),
]);

// ── Order Items ────────────────────────────────────────────────────────
export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
}, (table) => [
  check("order_item_positive", sql`${table.quantity} > 0 AND ${table.unitPriceCents} >= 0`),
  index("order_items_order_lookup").on(table.orderId),
]);

// ── Cart Items ─────────────────────────────────────────────────────────
export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userProductIdx: uniqueIndex("unique_user_product").on(
      table.userId,
      table.productId
    ),
    quantityBounds: check("cart_quantity_bounds", sql`${table.quantity} BETWEEN 1 AND 99`),
  })
);
