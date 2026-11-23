import { DomainError } from "@/lib/domain/errors";
import { readTransaction } from "@/lib/domain/mutation";
import { orders, orderItems, cartItems, products } from "@/lib/db/schema";
import { eq, and, desc, asc, gte, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { once } from "@/lib/domain/mutation";
import { customerId, uuid, address, text, quantity, pagination, MAX_CART_ITEMS, type PageInput } from "@/lib/domain/validation";

function generateOrderNumber(): string { return "ORD-" + randomBytes(12).toString("hex").toUpperCase(); }

export async function createOrderFromCart(params: {
  requestId: string;
  userId: string;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}) {
  const userId = customerId(params.userId);
  const { isDefault: _unused, ...shippingAddress } = address(params.shippingAddress);
  void _unused;
  return once(userId, "checkout.create", params.requestId, Object.values(shippingAddress), async (tx) => {
    // 1. Fetch user's cart items
    const userCartItems = await tx
      .select({
        id: cartItems.id,
        productId: cartItems.productId,
        quantity: cartItems.quantity,
      })
      .from(cartItems)
      .where(eq(cartItems.userId, userId)).limit(MAX_CART_ITEMS + 1);

    if (userCartItems.length > MAX_CART_ITEMS) throw new DomainError("Cart exceeds supported item limit");
    if (userCartItems.length === 0) {
      throw new DomainError("Cart is empty");
    }

    // Consolidate quantities per product ID
    const qtyByProduct = new Map<string, number>();
    for (const item of userCartItems) {
      quantity(item.quantity);
      qtyByProduct.set(
        item.productId,
        (qtyByProduct.get(item.productId) ?? 0) + item.quantity
      );
    }

    // Sort product IDs deterministically to prevent deadlocks across concurrent transactions
    const sortedProductIds = Array.from(qtyByProduct.keys()).sort();

    // 2. Lock product rows in deterministic order using SELECT ... FOR UPDATE
    const lockedProducts = await tx
      .select()
      .from(products)
      .where(inArray(products.id, sortedProductIds))
      .orderBy(asc(products.id))
      .for("update");

    const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

    // 3. Verify existence and stock, then atomically decrement with conditional check
    let totalAmountCents = 0;
    const orderItemsToInsert: {
      productId: string;
      quantity: number;
      unitPriceCents: number;
    }[] = [];

    for (const productId of sortedProductIds) {
      const requiredQty = qtyByProduct.get(productId)!;
      const product = productMap.get(productId);

      if (!product) {
        throw new DomainError("Product not found");
      }

      if (product.inventoryCount < requiredQty) {
        throw new DomainError(
          `Insufficient stock for ${product.title}: only ${product.inventoryCount} available`
        );
      }

      // Atomic conditional decrement: only succeeds if inventory_count >= requiredQty
      const [updatedProduct] = await tx
        .update(products)
        .set({
          inventoryCount: sql`${products.inventoryCount} - ${requiredQty}`,
        })
        .where(
          and(
            eq(products.id, productId),
            gte(products.inventoryCount, requiredQty)
          )
        )
        .returning({ id: products.id, inventoryCount: products.inventoryCount });

      if (!updatedProduct) {
        throw new DomainError(
          `Insufficient stock for ${product.title}: unable to reserve inventory`
        );
      }

      if (!Number.isInteger(product.priceCents) || product.priceCents < 0) throw new DomainError("Invalid product price");
      totalAmountCents += product.priceCents * requiredQty;
      if (!Number.isSafeInteger(totalAmountCents) || totalAmountCents > 2147483647) throw new DomainError("Order total exceeds supported amount");
      orderItemsToInsert.push({
        productId,
        quantity: requiredQty,
        unitPriceCents: product.priceCents,
      });
    }

    // 4. Create order
    const orderNumber = generateOrderNumber();
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        userId,
        shippingAddress,
        totalAmountCents,
        status: "CONFIRMED",
      })
      .returning();

    // 5. Create order items
    await tx.insert(orderItems).values(
      orderItemsToInsert.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      }))
    );

    // 6. Clear cart
    await tx.delete(cartItems).where(eq(cartItems.userId, userId));

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmountCents,
    };
  });
}

export async function getUserOrders(userId: string, page: PageInput & { cancellableOnly?: boolean } = {}) {
  return readTransaction(async (db) => {
  userId = customerId(userId);
  const { limit, offset } = pagination(page);
  if (page.cancellableOnly !== undefined && typeof page.cancellableOnly !== "boolean") throw new DomainError("Invalid order filter");
  return db.select({
    id: orders.id, orderNumber: orders.orderNumber, totalAmountCents: orders.totalAmountCents,
    status: orders.status, createdAt: orders.createdAt, updatedAt: orders.updatedAt,
    itemCount: sql<number>`(select coalesce(sum(order_items.quantity), 0)::int from order_items where order_items.order_id = orders.id)`,
  }).from(orders).where(and(eq(orders.userId, userId), page.cancellableOnly ? inArray(orders.status, ["CONFIRMED", "PROCESSING"]) : undefined))
    .orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit).offset(offset);
  });
}

export async function getOrderDetails(userId: string, orderId: string) {
  return readTransaction(async (db) => {
  userId = customerId(userId);
  orderId = uuid(orderId, "order ID");
  const [order] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber,
      shippingAddress: orders.shippingAddress, totalAmountCents: orders.totalAmountCents,
      status: orders.status, cancellationReason: orders.cancellationReason,
      createdAt: orders.createdAt, updatedAt: orders.updatedAt })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);

  if (!order) return null;

  const items = await db
    .select({
      id: orderItems.id,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      product: {
        id: products.id,
        title: products.title,
        sku: products.sku,
        imageUrl: products.imageUrl,
      },
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orderItems.orderId, orderId), eq(orders.userId, userId)))
    .orderBy(asc(orderItems.id)).limit(MAX_CART_ITEMS + 1);

  if (items.length > MAX_CART_ITEMS) throw new DomainError("Order exceeds supported item limit");

  return { ...order, items };
  });
}

export async function cancelOrder(params: {
  userId: string;
  orderId: string;
  reason: string;
  requestId: string;
}) {
  const userId = customerId(params.userId);
  const orderId = uuid(params.orderId, "order ID");
  const reason = text(params.reason, "cancellation reason", 500);
  return once(userId, "order.cancel", params.requestId, [orderId, reason], async (tx) => {
    // 1. Atomically transition order status from a cancellable state (CONFIRMED or PROCESSING) to CANCELLED.
    // This atomic conditional update succeeds if and only if the order is currently
    // in CONFIRMED or PROCESSING, preventing concurrent cancellation requests from restoring inventory more than once.
    const cancellableStatuses = ["CONFIRMED", "PROCESSING"] as const;

    const [updatedOrder] = await tx
      .update(orders)
      .set({
        status: "CANCELLED",
        cancellationReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.userId, userId),
          inArray(orders.status, cancellableStatuses)
        )
      )
      .returning();

    if (!updatedOrder) {
      // Determine existing state to provide accurate failure reason
      const [existingOrder] = await tx
        .select({ status: orders.status })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
        .limit(1);

      if (!existingOrder) {
        throw new DomainError("Order not found");
      }
      throw new DomainError(`Cannot cancel order with status: ${existingOrder.status}`);
    }

    // 2. The order status transition succeeded; restore inventory
    const items = await tx
      .select({
        productId: orderItems.productId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    // Consolidate quantities per product ID and sort product IDs deterministically
    const qtyByProduct = new Map<string, number>();
    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new DomainError("Invalid order item quantity");
      qtyByProduct.set(
        item.productId,
        (qtyByProduct.get(item.productId) ?? 0) + item.quantity
      );
    }

    const sortedProductIds = Array.from(qtyByProduct.keys()).sort();
    for (const productId of sortedProductIds) {
      const restoreQty = qtyByProduct.get(productId)!;
      await tx
        .update(products)
        .set({
          inventoryCount: sql`${products.inventoryCount} + ${restoreQty}`,
        })
        .where(eq(products.id, productId));
    }

    return { success: true, orderNumber: updatedOrder.orderNumber };
  });
}
