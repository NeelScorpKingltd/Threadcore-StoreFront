import { DomainError } from "@/lib/domain/errors";
export const MAX_QUANTITY = 99;
export const MAX_CART_ITEMS = 100;
export const MAX_ADDRESSES = 50;

export function uuid(value: unknown, label = "ID"): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new DomainError(`Invalid ${label}`);
  return value.toLowerCase();
}

// A valid ID is not authentication; callers must derive it from a verified session.
export function customerId(value: unknown): string { return uuid(value, "customer ID"); }

export function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new DomainError(`Invalid ${label}`);
  return value.trim();
}

export function quantity(value: unknown, allowZero = false): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_QUANTITY) throw new DomainError(`Quantity must be an integer between ${allowZero ? 0 : 1} and ${MAX_QUANTITY}`);
  return value;
}

export type AddressInput = { street: string; city: string; state: string; postalCode: string; country?: string; isDefault?: boolean };
export function address(input: AddressInput) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DomainError("Invalid address");
  if (input.isDefault !== undefined && typeof input.isDefault !== "boolean") throw new DomainError("Invalid default flag");
  return { street: text(input.street, "street", 300), city: text(input.city, "city", 100), state: text(input.state, "state", 100), postalCode: text(input.postalCode, "postal code", 20), country: input.country === undefined ? "India" : text(input.country, "country", 100), isDefault: input.isDefault ?? false };
}

export type PageInput = { limit?: number; offset?: number };
export function pagination(input: PageInput = {}) {
  const { limit = 50, offset = 0 } = input;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100_000) throw new DomainError("Invalid pagination");
  return { limit, offset };
}

export function pageNumber(value: unknown): number {
  if (typeof value !== "string" || !/^[1-9]\d{0,3}$/.test(value)) return 1;
  const page = Number(value);
  return page <= 4167 ? page : 1;
}
