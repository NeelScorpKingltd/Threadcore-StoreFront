import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { eq, ilike, desc, gt, and, type SQL } from "drizzle-orm";

export async function listProducts(params?: {
  category?: string;
  search?: string;
  inStockOnly?: boolean;
}) {
  const conditions: SQL[] = [];

  if (params?.category) {
    conditions.push(eq(products.category, params.category));
  }
  if (params?.search) {
    conditions.push(ilike(products.title, `%${params.search}%`));
  }
  if (params?.inStockOnly) {
    conditions.push(gt(products.inventoryCount, 0));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(products)
    .where(where)
    .orderBy(desc(products.createdAt));
}

export async function getProductById(id: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return product ?? null;
}

export async function getProductBySku(sku: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.sku, sku))
    .limit(1);
  return product ?? null;
}
