"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as UserService from "@/services/user.service";

async function getAuthUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  return user.id;
}

export async function updateProfileName(fullName: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");

  try {
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });
    if (error) throw error;
    revalidatePath("/profile");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update profile name";
    return { success: false, message };
  }
}

export async function getAddresses() {
  const userId = await getAuthUserId();
  return UserService.getAddresses(userId);
}

export async function addAddress(data: {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  isDefault?: boolean;
}) {
  const userId = await getAuthUserId();
  try {
    const address = await UserService.addAddress(userId, data);
    revalidatePath("/profile");
    revalidatePath("/checkout");
    return { success: true, address };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add address";
    return { success: false, message };
  }
}

export async function deleteAddress(addressId: string) {
  const userId = await getAuthUserId();
  try {
    await UserService.deleteAddress(userId, addressId);
    revalidatePath("/profile");
    revalidatePath("/checkout");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete address";
    return { success: false, message };
  }
}
