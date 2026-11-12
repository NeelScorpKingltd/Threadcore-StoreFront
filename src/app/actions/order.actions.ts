"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as OrderService from "@/services/order.service";

async function getAuthUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  return user.id;
}

export async function createOrder(shippingAddress: {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}) {
  const userId = await getAuthUserId();
  try {
    const result = await OrderService.createOrderFromCart({
      userId,
      shippingAddress,
    });
    revalidatePath("/", "layout");
    revalidatePath("/cart");
    revalidatePath("/orders");
    return { success: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to place order";
    return { success: false, message };
  }
}

export async function getUserOrders() {
  const userId = await getAuthUserId();
  return OrderService.getUserOrders(userId);
}

export async function getOrderDetails(orderId: string) {
  const userId = await getAuthUserId();
  return OrderService.getOrderDetails(userId, orderId);
}

export async function cancelOrder(orderId: string, reason: string) {
  const userId = await getAuthUserId();
  try {
    const result = await OrderService.cancelOrder({ userId, orderId, reason });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/", "layout");
    return { ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel order";
    return { success: false, message };
  }
}
