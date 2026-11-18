"use server";

import { publicError } from "@/lib/domain/errors";

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
}, requestId: string) {
  const userId = await getAuthUserId();
  try {
    const result = await OrderService.createOrderFromCart({
      userId,
      shippingAddress,
      requestId,
    });
    revalidatePath("/", "layout");
    revalidatePath("/cart");
    revalidatePath("/orders");
    return { success: true, ...result };
  } catch (error) {
    const message = publicError(error);
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

export async function cancelOrder(orderId: string, reason: string, requestId: string) {
  const userId = await getAuthUserId();
  try {
    const result = await OrderService.cancelOrder({ userId, orderId, reason, requestId });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/", "layout");
    return { ...result };
  } catch (error) {
    const message = publicError(error);
    return { success: false, message };
  }
}
