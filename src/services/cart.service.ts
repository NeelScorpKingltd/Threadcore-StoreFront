import { DomainError } from "@/lib/domain/errors";
import { readTransaction } from "@/lib/domain/mutation";
import { cartItems, products } from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { customerTransaction, once } from "@/lib/domain/mutation";
import { customerId, uuid, quantity as validQuantity, MAX_CART_ITEMS } from "@/lib/domain/validation";

export async function getCart(userId: string) {
  return readTransaction(async (db) => {
  userId = customerId(userId);
  const items = await db.select({
    id: cartItems.id, userId: cartItems.userId, productId: cartItems.productId,
    quantity: cartItems.quantity, createdAt: cartItems.createdAt,
    product: { title: products.title, sku: products.sku, priceCents: products.priceCents,
      inventoryCount: products.inventoryCount, imageUrl: products.imageUrl },
  }).from(cartItems).innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.userId, userId)).orderBy(asc(cartItems.id)).limit(MAX_CART_ITEMS + 1);
  if (items.length > MAX_CART_ITEMS) throw new DomainError("Cart exceeds supported item limit");
  for (const item of items) validQuantity(item.quantity);
  return { items, subtotalCents: items.reduce((sum, item) => sum + item.product.priceCents * item.quantity, 0),
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0) };
  });
}

export async function addToCart(userId: string, productId: string, quantity: number, requestId: string) {
  userId = customerId(userId);
  productId = uuid(productId, "product ID");
  quantity = validQuantity(quantity);
  return once(userId, "cart.add", requestId, [productId, quantity], async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
    if (!product) throw new DomainError("Product not found");
    const [existing] = await tx.select().from(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)));
    const newTotal = validQuantity((existing?.quantity ?? 0) + quantity);
    if (newTotal > product.inventoryCount) throw new DomainError(`Only ${product.inventoryCount} units available`);
    if (!existing) {
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(cartItems).where(eq(cartItems.userId, userId));
      if (count >= MAX_CART_ITEMS) throw new DomainError("Cart item limit reached");
    }
    await tx.insert(cartItems).values({ userId, productId, quantity })
      .onConflictDoUpdate({ target: [cartItems.userId, cartItems.productId], set: { quantity: newTotal } });
    return { success: true };
  });
}

export async function updateItemQuantity(userId: string, cartItemId: string, quantity: number, requestId: string) {
  userId = customerId(userId);
  cartItemId = uuid(cartItemId, "cart item ID");
  quantity = validQuantity(quantity, true);
  return once(userId, "cart.set", requestId, [cartItemId, quantity], async (tx) => {
    const owned = and(eq(cartItems.id, cartItemId), eq(cartItems.userId, userId));
    const [item] = await tx.select().from(cartItems).where(owned);
    if (!item) throw new DomainError("Cart item not found");
    if (quantity === 0) await tx.delete(cartItems).where(owned);
    else {
      const [product] = await tx.select().from(products).where(eq(products.id, item.productId)).for("update");
      if (!product || quantity > product.inventoryCount) throw new DomainError("Insufficient stock");
      await tx.update(cartItems).set({ quantity }).where(owned);
    }
    return { success: true };
  });
}

export async function removeItem(userId: string, cartItemId: string, requestId: string) {
  userId = customerId(userId);
  cartItemId = uuid(cartItemId, "cart item ID");
  return once(userId, "cart.remove", requestId, [cartItemId], async (tx) => {
    await tx.delete(cartItems).where(and(eq(cartItems.id, cartItemId), eq(cartItems.userId, userId)));
    return { success: true };
  });
}

// Internal only; never expose clear-cart through MCP.
export async function clearCart(userId: string) {
  userId = customerId(userId);
  return customerTransaction(userId, async (tx) => {
    await tx.delete(cartItems).where(eq(cartItems.userId, userId));
    return { success: true };
  });
}
