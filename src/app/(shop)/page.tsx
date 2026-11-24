import React from "react";
import Link from "next/link";
import { listProducts } from "@/services/catalog.service";
import { ProductCard } from "@/components/ProductCard";
import { pageNumber } from "@/lib/domain/validation";

const CATEGORIES = [
  "All",
  "Outerwear",
  "Shirts",
  "Polos",
  "Knitwear",
  "T-Shirts",
  "Trousers",
  "Bottoms",
];

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; inStock?: string; page?: string }>;
}) {
  const { category, inStock, page: rawPage } = await searchParams;
  const page = pageNumber(rawPage);

  const activeCategory = category && category !== "All" ? category : undefined;
  const inStockOnly = inStock === "true";

  const result = await listProducts({
    category: activeCategory,
    inStockOnly,
    limit: 25, offset: (page - 1) * 24,
  });
  const products = result.slice(0, 24);
  const pageUrl = (target: number) => {
    const query = new URLSearchParams({ page: String(target) });
    if (activeCategory) query.set("category", activeCategory);
    if (inStockOnly) query.set("inStock", "true");
    return `/?${query}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Editorial Header */}
      <div className="mb-8 text-center sm:text-left">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          The Collection
        </h1>
        <p className="mt-2 text-sm text-stone-500 whitespace-normal sm:whitespace-nowrap">
          Engineered essentials, precision tailoring, and timeless raw materials. Architected for longevity.
        </p>
      </div>

      {/* Continuous Category Ribbon */}
      <div className="mb-8 border-b border-stone-200/80">
        <div className="flex items-center justify-between gap-4">
          {/* Horizontally scrollable ribbon tabs */}
          <nav className="flex items-center space-x-8 overflow-x-auto pb-px scrollbar-none -mb-px">
            {CATEGORIES.map((cat) => {
              const isSelected =
                (!activeCategory && cat === "All") || activeCategory === cat;
              const queryUrl =
                cat === "All"
                  ? inStockOnly
                    ? "/?inStock=true"
                    : "/"
                  : inStockOnly
                  ? `/?category=${encodeURIComponent(cat)}&inStock=true`
                  : `/?category=${encodeURIComponent(cat)}`;

              return (
                <Link
                  key={cat}
                  href={queryUrl}
                  className={`whitespace-nowrap py-3 text-xs uppercase tracking-widest transition-all border-b-2 ${
                    isSelected
                      ? "border-stone-900 text-stone-900 font-semibold"
                      : "border-transparent text-stone-400 hover:text-stone-900 hover:border-stone-300 font-medium"
                  }`}
                >
                  {cat}
                </Link>
              );
            })}
          </nav>

          {/* Stock Toggle Pinned to Right of Ribbon */}
          <div className="flex-shrink-0 pb-2 sm:pb-3">
            <Link
              href={
                inStockOnly
                  ? activeCategory
                    ? `/?category=${encodeURIComponent(activeCategory)}`
                    : "/"
                  : activeCategory
                  ? `/?category=${encodeURIComponent(activeCategory)}&inStock=true`
                  : "/?inStock=true"
              }
              className={`inline-flex items-center space-x-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                inStockOnly
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  inStockOnly ? "bg-emerald-400" : "bg-stone-300"
                }`}
              />
              <span>In Stock Only</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Product Count Header */}
      <div className="mb-6 flex items-center justify-between">
        <span className="font-mono text-xs text-stone-400 tracking-wider uppercase">
          Showing {products.length} {products.length === 1 ? "piece" : "pieces"}
        </span>
      </div>

      {/* Catalog Grid */}
      {products.length === 0 ? (
        <div className="my-16 text-center">
          <p className="text-sm text-stone-500">No pieces match your selection.</p>
          <Link
            href="/"
            className="mt-4 inline-block font-mono text-xs text-stone-900 underline underline-offset-4"
          >
            Reset filters
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
      <nav aria-label="Collection pages" className="mt-8 flex justify-between text-sm">
        {page > 1 ? <Link href={pageUrl(page - 1)}>Previous</Link> : <span />}
        {result.length > 24 && page < 4167 && <Link href={pageUrl(page + 1)}>Next</Link>}
      </nav>
    </div>
  );
}
