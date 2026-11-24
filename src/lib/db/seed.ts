// Catalogue seed prices are INR paise, converted at frozen USD/INR 93.322 on 2026-11-19.
import { db } from "./client";
import { products } from "./schema";

export const DEMO_PRODUCTS = [
  {
    sku: "APP-JKT-001",
    title: "Waxed Canvas Field Jacket",
    description:
      "Weather-resistant 10oz waxed cotton jacket with corduroy collar and brass snap closures.",
    category: "Outerwear",
    priceCents: 1726457,
    inventoryCount: 14,
    imageUrl:
      "https://images.unsplash.com/photo-1544441893-675973e31985?w=800&q=80",
  },
  {
    sku: "APP-SHR-002",
    title: "Structured Oxford Button-Down",
    description:
      "Heavyweight combed cotton Oxford weave tailored in a relaxed, classic fit.",
    category: "Shirts",
    priceCents: 634590,
    inventoryCount: 28,
    imageUrl:
      "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80",
  },
  {
    sku: "APP-SHR-003",
    title: "Japanese Selvedge Chambray",
    description:
      "6oz indigo-dyed selvedge chambray shirt featuring triple-needle chainstitch runoff.",
    category: "Shirts",
    priceCents: 886559,
    inventoryCount: 8,
    imageUrl:
      "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&q=80",
  },
  {
    sku: "APP-POL-004",
    title: "Supima Knit Ribbed Polo",
    description:
      "Fine-gauge knit polo shirt made from long-staple Supima cotton with a seamless collar.",
    category: "Polos",
    priceCents: 503939,
    inventoryCount: 32,
    imageUrl:
      "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=800&q=80",
  },
  {
    sku: "APP-KNT-005",
    title: "Chunky Waffle Knit Crewneck",
    description:
      "100% merino wool waffle pullover designed for thermal retention and clean layering.",
    category: "Knitwear",
    priceCents: 821234,
    inventoryCount: 19,
    imageUrl:
      "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800&q=80",
  },
  {
    sku: "APP-KNT-006",
    title: "Brushed Lambswool Cardigan",
    description:
      "Five-button tailored cardigan featuring genuine horn buttons and front patch pockets.",
    category: "Knitwear",
    priceCents: 1119864,
    inventoryCount: 6,
    imageUrl:
      "https://images.unsplash.com/photo-1614975058789-41316d0e2e9c?w=800&q=80",
  },
  {
    sku: "APP-TEE-007",
    title: "Heavyweight Tubular Tee (220 GSM)",
    description:
      "Ring-spun seamless tubular body jersey tee with a high rib collar that holds shape.",
    category: "T-Shirts",
    priceCents: 317295,
    inventoryCount: 50,
    imageUrl:
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&q=80",
  },
  {
    sku: "APP-TEE-008",
    title: "Washed Vintage Pocket Tee",
    description:
      "Garment-dyed cotton jersey tee with a chest patch pocket and pre-shrunk lived-in wash.",
    category: "T-Shirts",
    priceCents: 354624,
    inventoryCount: 22,
    imageUrl:
      "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800&q=80",
  },
  {
    sku: "APP-TRS-009",
    title: "Pleated Relaxed Chino Trousers",
    description:
      "Single-pleat wide-tapered chinos cut from 100% durable Japanese cotton twill.",
    category: "Trousers",
    priceCents: 765240,
    inventoryCount: 16,
    imageUrl:
      "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&q=80",
  },
  {
    sku: "APP-TRS-010",
    title: "French Terry Everyday Sweatpants",
    description:
      "450 GSM unbrushed French terry sweatpants with deep welt pockets and braided drawstrings.",
    category: "Bottoms",
    priceCents: 597261,
    inventoryCount: 25,
    imageUrl:
      "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=800&q=80",
  },
  {
    sku: "APP-TRS-011",
    title: "Ripstop Modular Cargo Pants",
    description:
      "Military-grade cotton ripstop construction with darted articulated knees and cargo bellows.",
    category: "Trousers",
    priceCents: 914556,
    inventoryCount: 12,
    imageUrl:
      "https://images.unsplash.com/photo-1517445312882-bc9910d016b7?w=800&q=80",
  },
  {
    sku: "APP-OVT-012",
    title: "Wool-Blend Overcoat",
    description:
      "Double-faced recycled wool overcoat with unstructured shoulders and satin interior lining.",
    category: "Outerwear",
    priceCents: 2239728,
    inventoryCount: 5,
    imageUrl:
      "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800&q=80",
  },
  {
    sku: "APP-SHR-013",
    title: "Camp Collar Linen Resort Shirt",
    description:
      "Breathable 100% European flax linen shirt featuring a straight hem and relaxed Cuban collar.",
    category: "Shirts",
    priceCents: 541268,
    inventoryCount: 18,
    imageUrl:
      "https://images.unsplash.com/photo-1604695573706-53170668f6a6?w=800&q=80",
  },
  {
    sku: "APP-DEN-014",
    title: "13.5oz Raw Selvedge Denim",
    description:
      "Untreated rigid raw denim woven on vintage shuttle looms. Standard straight cut.",
    category: "Bottoms",
    priceCents: 1259847,
    inventoryCount: 0,
    imageUrl:
      "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800&q=80",
  },
  {
    sku: "APP-KNT-015",
    title: "Fine Gauge Cashmere Turtleneck",
    description:
      "Sustainably sourced 100% Mongolian cashmere sweater spun in a fine 12-gauge knit with ribbed collar and cuffs.",
    category: "Knitwear",
    priceCents: 1539813,
    inventoryCount: 15,
    imageUrl:
      "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800&q=80",
  },
  {
    sku: "APP-OVT-016",
    title: "Double-Breasted Wool Trench",
    description:
      "Structured heavyweight Melton wool coat featuring storm flaps, horn buttons, and a removable waist belt.",
    category: "Outerwear",
    priceCents: 2659677,
    inventoryCount: 7,
    imageUrl:
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=80",
  },
  {
    sku: "APP-SHR-017",
    title: "Pure Belgian Linen Overshirt",
    description:
      "Pre-washed natural flax linen tailored for unstructured warm-weather layering with dual chest pockets.",
    category: "Shirts",
    priceCents: 830566,
    inventoryCount: 20,
    imageUrl:
      "https://images.unsplash.com/photo-1516826957135-700dedea698c?w=800&q=80",
  },
  {
    sku: "APP-JKT-018",
    title: "Italian Goat Suede Chore Jacket",
    description:
      "Supple velvet-finish Italian suede jacket with brass shanks, unlined interior, and piped seam construction.",
    category: "Outerwear",
    priceCents: 3172948,
    inventoryCount: 4,
    imageUrl:
      "https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=800&q=80",
  },
  {
    sku: "APP-TRS-019",
    title: "Double-Pleated Wide-Leg Wool Trousers",
    description:
      "High-rise double forward pleat trousers woven from durable tropical wool with side adjusters and a fluid drape.",
    category: "Trousers",
    priceCents: 1073203,
    inventoryCount: 14,
    imageUrl:
      "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&q=80",
  },
  {
    sku: "APP-TEE-020",
    title: "Mercerized Heavyweight Pima Tee",
    description:
      "Double-mercerized Peruvian Pima cotton tee with a discreet silk-like luster and bound neck trim.",
    category: "T-Shirts",
    priceCents: 391952,
    inventoryCount: 40,
    imageUrl:
      "https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?w=800&q=80",
  },
];

async function main() {
  console.log("🌱 Seeding products…");

  for (const product of DEMO_PRODUCTS) {
    await db
      .insert(products)
      .values(product)
      .onConflictDoUpdate({
        target: products.sku,
        set: { ...product },
      });
  }

  console.log(`✅ Seeded ${DEMO_PRODUCTS.length} products.`);
  process.exit(0);
}

main();
