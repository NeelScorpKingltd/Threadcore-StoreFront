import { DomainError } from "@/lib/domain/errors";
import { readTransaction } from "@/lib/domain/mutation";
import { products } from "@/lib/db/schema";
import { eq, ilike, desc, gt, and, type SQL } from "drizzle-orm";
import { pagination, text, uuid, type PageInput } from "@/lib/domain/validation";

const fields = { id: products.id, sku: products.sku, title: products.title,
  description: products.description, category: products.category, priceCents: products.priceCents,
  inventoryCount: products.inventoryCount, imageUrl: products.imageUrl, createdAt: products.createdAt };

export async function listProducts(params?: {
  category?: string;
  search?: string;
  inStockOnly?: boolean;
} & PageInput) {
  return readTransaction(async (db) => {
  const { limit, offset } = pagination(params);
  if (params?.inStockOnly !== undefined && typeof params.inStockOnly !== "boolean") throw new DomainError("Invalid stock filter");
  const conditions: SQL[] = [];

  if (params?.category) {
    conditions.push(eq(products.category, text(params.category, "category", 100)));
  }
  if (params?.search) {
    const search = text(params.search, "search", 100).replace(/[\\%_]/g, "\\$&");
    conditions.push(ilike(products.title, `%${search}%`));
  }
  if (params?.inStockOnly) {
    conditions.push(gt(products.inventoryCount, 0));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select(fields)
    .from(products)
    .where(where)
    .orderBy(desc(products.createdAt), desc(products.id)).limit(limit).offset(offset);
  });
}

export async function getProductById(id: string) {
  return readTransaction(async (db) => {
  id = uuid(id, "product ID");
  const [product] = await db
    .select(fields)
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return product ?? null;
  });
}

export async function getProductBySku(sku: string) {
  return readTransaction(async (db) => {
  sku = text(sku, "SKU", 100);
  const [product] = await db
    .select(fields)
    .from(products)
    .where(eq(products.sku, sku))
    .limit(1);
  return product ?? null;
  });
}
