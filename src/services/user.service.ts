import { db } from "@/lib/db/client";
import { addresses } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

type AddressInput = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  isDefault?: boolean;
};

export async function getAddresses(userId: string) {
  return db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
}

export async function addAddress(userId: string, data: AddressInput) {
  if (data.isDefault) {
    // Unset previous defaults
    await db
      .update(addresses)
      .set({ isDefault: false })
      .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)));
  }

  const [address] = await db
    .insert(addresses)
    .values({
      userId,
      street: data.street,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      country: data.country ?? "India",
      isDefault: data.isDefault ?? false,
    })
    .returning();

  return address;
}

export async function deleteAddress(userId: string, addressId: string) {
  await db
    .delete(addresses)
    .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)));
  return { success: true };
}
