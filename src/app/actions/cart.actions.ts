"use server";

import { publicError } from "@/lib/domain/errors";

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

export async function addToCart(productId: string, quantity: number, requestId: string) {
  const userId = await getAuthUserId();
  try {
    await CartService.addToCart(userId, productId, quantity, requestId);
    revalidatePath("/", "layout");
    return { success: true, message: "Added to bag" };
  } catch (error) {
    const message = publicError(error);
    return { success: false, message };
  }
}

export async function updateItemQuantity(cartItemId: string, quantity: number, requestId: string) {
  const userId = await getAuthUserId();
  try {
    await CartService.updateItemQuantity(userId, cartItemId, quantity, requestId);
    revalidatePath("/cart");
    return { success: true };
  } catch (error) {
    const message = publicError(error);
    return { success: false, message };
  }
}

export async function removeItem(cartItemId: string, requestId: string) {
  const userId = await getAuthUserId();
  try {
    await CartService.removeItem(userId, cartItemId, requestId);
    revalidatePath("/cart");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    const message = publicError(error);
    return { success: false, message };
  }
}
