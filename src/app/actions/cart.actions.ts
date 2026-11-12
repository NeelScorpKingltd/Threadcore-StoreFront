"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as CartService from "@/services/cart.service";

async function getAuthUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  return user.id;
}

export async function getCart() {
  const userId = await getAuthUserId();
  return CartService.getCart(userId);
}

export async function addToCart(productId: string, quantity: number = 1) {
  const userId = await getAuthUserId();
  try {
    await CartService.addToCart(userId, productId, quantity);
    revalidatePath("/", "layout");
    return { success: true, message: "Added to bag" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add item";
    return { success: false, message };
  }
}

export async function updateItemQuantity(cartItemId: string, quantity: number) {
  const userId = await getAuthUserId();
  try {
    await CartService.updateItemQuantity(userId, cartItemId, quantity);
    revalidatePath("/cart");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update quantity";
    return { success: false, message };
  }
}

export async function removeItem(cartItemId: string) {
  const userId = await getAuthUserId();
  try {
    await CartService.removeItem(userId, cartItemId);
    revalidatePath("/cart");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove item";
    return { success: false, message };
  }
}
