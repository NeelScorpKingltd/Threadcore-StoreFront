import { db } from "@/lib/db/client";
import { cartItems, products } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function getCart(userId: string) {
  const items = await db
    .select({
      id: cartItems.id,
      userId: cartItems.userId,
      productId: cartItems.productId,
      quantity: cartItems.quantity,
      createdAt: cartItems.createdAt,
      product: {
        title: products.title,
        sku: products.sku,
        priceCents: products.priceCents,
        inventoryCount: products.inventoryCount,
        imageUrl: products.imageUrl,
      },
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.userId, userId));

  const subtotalCents = items.reduce(
    (sum, item) => sum + item.product.priceCents * item.quantity,
    0
  );
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return { items, subtotalCents, totalItems };
}

export async function addToCart(
  userId: string,
  productId: string,
  quantity: number
) {
  // Validate product exists and has stock
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) throw new Error("Product not found");
  if (product.inventoryCount <= 0) throw new Error(`${product.title} is sold out`);

  // Check existing cart quantity
  const [existingItem] = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)))
    .limit(1);

  const existingQty = existingItem?.quantity ?? 0;
  const newTotal = existingQty + quantity;

  if (newTotal > product.inventoryCount) {
    throw new Error(
      `Only ${product.inventoryCount} units of ${product.title} available (${existingQty} already in cart)`
    );
  }

  // Upsert
  await db
    .insert(cartItems)
    .values({ userId, productId, quantity })
    .onConflictDoUpdate({
      target: [cartItems.userId, cartItems.productId],
      set: { quantity: sql`${cartItems.quantity} + ${quantity}` },
    });

  return { success: true };
}

export async function updateItemQuantity(
  userId: string,
  cartItemId: string,
  quantity: number
) {
  if (quantity <= 0) {
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.id, cartItemId), eq(cartItems.userId, userId)));
    return { success: true };
  }

  // Verify ownership and stock
  const [item] = await db
    .select({
      id: cartItems.id,
      productId: cartItems.productId,
      inventoryCount: products.inventoryCount,
      title: products.title,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(and(eq(cartItems.id, cartItemId), eq(cartItems.userId, userId)))
    .limit(1);

  if (!item) throw new Error("Cart item not found");
  if (quantity > item.inventoryCount) {
    throw new Error(
      `Only ${item.inventoryCount} units of ${item.title} available`
    );
  }

  await db
    .update(cartItems)
    .set({ quantity })
    .where(and(eq(cartItems.id, cartItemId), eq(cartItems.userId, userId)));

  return { success: true };
}

export async function removeItem(userId: string, cartItemId: string) {
  await db
    .delete(cartItems)
    .where(and(eq(cartItems.id, cartItemId), eq(cartItems.userId, userId)));
  return { success: true };
}

export async function clearCart(userId: string) {
  await db.delete(cartItems).where(eq(cartItems.userId, userId));
  return { success: true };
}
