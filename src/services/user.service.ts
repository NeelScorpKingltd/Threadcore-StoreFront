import { DomainError } from "@/lib/domain/errors";
import { readTransaction } from "@/lib/domain/mutation";
import { addresses } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { once } from "@/lib/domain/mutation";
import { address, customerId, uuid, MAX_ADDRESSES, type AddressInput } from "@/lib/domain/validation";

const fields = { id: addresses.id, street: addresses.street, city: addresses.city,
  state: addresses.state, postalCode: addresses.postalCode, country: addresses.country,
  isDefault: addresses.isDefault };

export async function getAddresses(userId: string) {
  return readTransaction(async (db) => {
  userId = customerId(userId);
  const result = await db.select(fields).from(addresses).where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt), desc(addresses.id)).limit(MAX_ADDRESSES + 1);
  if (result.length > MAX_ADDRESSES) throw new DomainError("Address book exceeds supported limit");
  return result;
  });
}

export async function addAddress(userId: string, data: AddressInput, requestId: string) {
  userId = customerId(userId);
  const value = address(data);
  return once(userId, "address.add", requestId, Object.values(value), async (tx) => {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(addresses).where(eq(addresses.userId, userId));
    if (count >= MAX_ADDRESSES) throw new DomainError("Address limit reached");
    if (value.isDefault) await tx.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)));
    const [result] = await tx.insert(addresses).values({ userId, ...value }).returning(fields);
    return result;
  });
}

export async function deleteAddress(userId: string, addressId: string, requestId: string) {
  userId = customerId(userId);
  addressId = uuid(addressId, "address ID");
  return once(userId, "address.delete", requestId, [addressId], async (tx) => {
    await tx.delete(addresses).where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)));
    return { success: true };
  });
}

export async function editAddress(userId: string, addressId: string, data: AddressInput, requestId: string) {
  userId = customerId(userId);
  addressId = uuid(addressId, "address ID");
  const value = address(data);
  return once(userId, "address.edit", requestId, [addressId, ...Object.values(value)], async (tx) => {
    const [saved] = await tx.select(fields).from(addresses).where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)));
    if (!saved) throw new DomainError("Address not found");
    if (value.isDefault) await tx.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)));
    const [result] = await tx.update(addresses).set(value).where(and(eq(addresses.id, addressId), eq(addresses.userId, userId))).returning(fields);
    return result;
  });
}
