import { db } from "@/lib/db/client";
import { orders, orderItems, cartItems, products } from "@/lib/db/schema";
import { eq, and, desc, asc, gte, inArray, sql } from "drizzle-orm";

function generateOrderNumber(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "ORD-";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function createOrderFromCart(params: {
  userId: string;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}) {
  const { userId, shippingAddress } = params;

  return await db.transaction(async (tx) => {
    // 1. Fetch user's cart items
    const userCartItems = await tx
      .select({
        id: cartItems.id,
        productId: cartItems.productId,
        quantity: cartItems.quantity,
      })
      .from(cartItems)
      .where(eq(cartItems.userId, userId));

    if (userCartItems.length === 0) {
      throw new Error("Cart is empty");
    }

    // Consolidate quantities per product ID
    const qtyByProduct = new Map<string, number>();
    for (const item of userCartItems) {
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
        throw new Error("Product not found");
      }

      if (product.inventoryCount < requiredQty) {
        throw new Error(
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
        throw new Error(
          `Insufficient stock for ${product.title}: unable to reserve inventory`
        );
      }

      totalAmountCents += product.priceCents * requiredQty;
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

export async function getUserOrders(userId: string) {
  const userOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      totalAmountCents: orders.totalAmountCents,
      status: orders.status,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));

  // Get item counts for each order
  const ordersWithCounts = await Promise.all(
    userOrders.map(async (order) => {
      const items = await db
        .select({ quantity: orderItems.quantity })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
      return { ...order, itemCount };
    })
  );

  return ordersWithCounts;
}

export async function getOrderDetails(userId: string, orderId: string) {
  const [order] = await db
    .select()
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
    .where(eq(orderItems.orderId, orderId));

  return { ...order, items };
}

export async function cancelOrder(params: {
  userId: string;
  orderId: string;
  reason: string;
}) {
  const { userId, orderId, reason } = params;

  return await db.transaction(async (tx) => {
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
        throw new Error("Order not found");
      }
      throw new Error(`Cannot cancel order with status: ${existingOrder.status}`);
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
