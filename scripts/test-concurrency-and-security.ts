import { getSafeRedirectPath } from "@/app/api/auth/callback/route";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/supabase/config";
import { db } from "@/lib/db/client";
import { products, cartItems, orders, orderItems } from "@/lib/db/schema";
import { createOrderFromCart, cancelOrder } from "@/services/order.service";
import { eq, inArray } from "drizzle-orm";

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` (${detail})` : ""}`);
    throw new Error(`Test assertion failed: ${testName}`);
  }
}

async function runRedirectSecurityTests() {
  console.log("\n========================================================");
  console.log("Suite 1: Auth Callback Open Redirect Validation Tests");
  console.log("========================================================");

  // 1. Safe relative paths
  assert(getSafeRedirectPath("/checkout") === "/checkout", "Allows safe relative path (/checkout)");
  assert(getSafeRedirectPath("/") === "/", "Allows safe root path (/)");
  assert(
    getSafeRedirectPath("/orders?status=active#details") === "/orders?status=active#details",
    "Preserves query params and hash on internal path"
  );
  assert(getSafeRedirectPath("  /profile  ") === "/profile", "Trims whitespace from valid internal path");

  // 2. Protocol-relative URLs (open redirect bypass vector)
  assert(getSafeRedirectPath("//evil.com") === "/", "Rejects protocol-relative '//evil.com'");
  assert(getSafeRedirectPath("//evil.com/path") === "/", "Rejects protocol-relative '//evil.com/path'");
  assert(getSafeRedirectPath("///evil.com") === "/", "Rejects triple slash '///evil.com'");

  // 3. Backslash evasion tricks (Chrome/IE/Edge URL normalization)
  assert(getSafeRedirectPath("/\\evil.com") === "/", "Rejects backslash evasion '/\\evil.com'");
  assert(getSafeRedirectPath("\\evil.com") === "/", "Rejects leading backslash '\\evil.com'");
  assert(getSafeRedirectPath("/foo\\bar") === "/", "Rejects internal backslash '/foo\\bar'");

  // 4. Absolute external URLs
  assert(getSafeRedirectPath("https://evil.com") === "/", "Rejects external https URL");
  assert(getSafeRedirectPath("http://attacker.com/steal") === "/", "Rejects external http URL");

  // 5. Dangerous / Non-HTTP schemes
  assert(getSafeRedirectPath("javascript:alert(1)") === "/", "Rejects javascript: scheme");
  assert(getSafeRedirectPath("data:text/html,test") === "/", "Rejects data: scheme");

  // 6. Empty / Invalid types
  assert(getSafeRedirectPath("") === "/", "Handles empty string fallback");
  assert(getSafeRedirectPath(null) === "/", "Handles null fallback");
  assert(getSafeRedirectPath(undefined) === "/", "Handles undefined fallback");

  // 7. Custom fallback support
  assert(
    getSafeRedirectPath("https://evil.com", "/dashboard") === "/dashboard",
    "Uses custom fallback when input is invalid"
  );
}

async function runSupabaseConfigTests() {
  console.log("\n========================================================");
  console.log("Suite 2: Supabase Environment Configuration Defense Tests");
  console.log("========================================================");

  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    // 1. Accidental /rest/v1 appended (common dashboard copy-paste error causing 'Invalid path specified in request URL')
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co/rest/v1";
    assert(getSupabaseUrl() === "https://example.supabase.co", "Normalizes /rest/v1 suffix from Supabase URL");

    // 2. Accidental /rest/v1/ with trailing slash
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co/rest/v1/";
    assert(getSupabaseUrl() === "https://example.supabase.co", "Normalizes /rest/v1/ with trailing slash");

    // 3. Accidental /auth/v1 appended
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co/auth/v1";
    assert(getSupabaseUrl() === "https://example.supabase.co", "Normalizes /auth/v1 suffix from Supabase URL");

    // 4. Wrapping quotes
    process.env.NEXT_PUBLIC_SUPABASE_URL = '"https://example.supabase.co"';
    assert(getSupabaseUrl() === "https://example.supabase.co", "Strips wrapping double quotes");

    // 5. Trailing slash
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co/";
    assert(getSupabaseUrl() === "https://example.supabase.co", "Strips trailing slash");

    // 6. Whitespace and single quotes
    process.env.NEXT_PUBLIC_SUPABASE_URL = "  'https://example.supabase.co'  ";
    assert(getSupabaseUrl() === "https://example.supabase.co", "Strips whitespace and single quotes");

    // 7. Anon key quote stripping
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ' "eyJhbGciOi..." ';
    assert(getSupabaseAnonKey() === "eyJhbGciOi...", "Normalizes Anon Key quotes and whitespace");
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
}

async function runConcurrencyTests() {
  console.log("\n========================================================");
  console.log("Suite 2: Concurrent Checkout Overselling Prevention Tests");
  console.log("========================================================");

  const testSuffix = Date.now().toString().slice(-6);
  const testSku = `TEST-ITEM-${testSuffix}`;
  const userA = `test-user-a-${testSuffix}`;
  const userB = `test-user-b-${testSuffix}`;

  // Step 1: Insert test product with stock = 1
  const [testProduct] = await db
    .insert(products)
    .values({
      sku: testSku,
      title: `Concurrency Test Jacket ${testSuffix}`,
      description: "Test product for concurrency verification",
      category: "Outerwear",
      priceCents: 5000,
      inventoryCount: 1, // EXACTLY 1 in stock!
      imageUrl: "https://example.com/test.jpg",
    })
    .returning();

  assert(Boolean(testProduct && testProduct.id), "Inserted test product with inventory = 1");

  try {
    // Step 2: Add 1 unit of this product to User A's and User B's carts
    await db.insert(cartItems).values([
      { userId: userA, productId: testProduct.id, quantity: 1 },
      { userId: userB, productId: testProduct.id, quantity: 1 },
    ]);

    const shippingAddress = {
      street: "123 Test Street",
      city: "Bangalore",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
    };

    console.log("  Executing simultaneous concurrent checkouts for 2 users (available stock: 1)...");

    // Step 3: Trigger both checkouts concurrently
    const [resultA, resultB] = await Promise.allSettled([
      createOrderFromCart({ userId: userA, shippingAddress }),
      createOrderFromCart({ userId: userB, shippingAddress }),
    ]);

    const successes = [resultA, resultB].filter((r) => r.status === "fulfilled");
    const failures = [resultA, resultB].filter((r) => r.status === "rejected");

    assert(successes.length === 1, "Exactly ONE concurrent checkout succeeded", `Success count: ${successes.length}`);
    assert(failures.length === 1, "Exactly ONE concurrent checkout failed", `Failure count: ${failures.length}`);

    const failureReason = (failures[0] as PromiseRejectedResult).reason;
    const failureMsg = failureReason instanceof Error ? failureReason.message : String(failureReason);
    assert(
      failureMsg.toLowerCase().includes("insufficient stock"),
      "Failed checkout threw 'Insufficient stock' error",
      `Actual error: ${failureMsg}`
    );

    // Step 4: Verify remaining stock in DB is 0, never negative
    const [freshProduct] = await db
      .select({ inventoryCount: products.inventoryCount })
      .from(products)
      .where(eq(products.id, testProduct.id));

    assert(freshProduct.inventoryCount === 0, "Inventory count is exactly 0 (no oversell/negative stock)");

    // Step 5: Clean up created order
    const successfulResult = (successes[0] as PromiseFulfilledResult<{ orderId: string }>).value;
    await db.delete(orders).where(eq(orders.id, successfulResult.orderId));
  } finally {
    // Clean up carts and test product
    await db.delete(cartItems).where(eq(cartItems.productId, testProduct.id));
    await db.delete(products).where(eq(products.id, testProduct.id));
  }

  console.log("\n========================================================");
  console.log("Suite 3: Concurrent Cancellation Double-Restock Prevention");
  console.log("========================================================");

  const cancelSuffix = Date.now().toString().slice(-6);
  const cancelSku = `TEST-CANCEL-${cancelSuffix}`;
  const cancelUser = `test-cancel-user-${cancelSuffix}`;

  // Step 1: Insert product with stock = 10
  const [cancelProduct] = await db
    .insert(products)
    .values({
      sku: cancelSku,
      title: `Cancellation Test Polo ${cancelSuffix}`,
      description: "Test product for cancellation concurrency",
      category: "Polos",
      priceCents: 4000,
      inventoryCount: 10,
      imageUrl: "https://example.com/polo.jpg",
    })
    .returning();

  // Step 2: Create a confirmed order for 3 items
  const [testOrder] = await db
    .insert(orders)
    .values({
      orderNumber: `ORD-TEST-${cancelSuffix}`,
      userId: cancelUser,
      shippingAddress: {
        street: "456 Test Lane",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400001",
        country: "India",
      },
      totalAmountCents: 12000,
      status: "CONFIRMED",
    })
    .returning();

  await db.insert(orderItems).values({
    orderId: testOrder.id,
    productId: cancelProduct.id,
    quantity: 3,
    unitPriceCents: 4000,
  });

  try {
    console.log("  Executing simultaneous concurrent cancellations on the same order...");

    // Step 3: Trigger concurrent cancellations on the exact same order
    const [cancelResult1, cancelResult2] = await Promise.allSettled([
      cancelOrder({
        userId: cancelUser,
        orderId: testOrder.id,
        reason: "Customer changed mind (Request 1)",
      }),
      cancelOrder({
        userId: cancelUser,
        orderId: testOrder.id,
        reason: "Customer changed mind (Request 2)",
      }),
    ]);

    const cancelSuccesses = [cancelResult1, cancelResult2].filter((r) => r.status === "fulfilled");
    const cancelFailures = [cancelResult1, cancelResult2].filter((r) => r.status === "rejected");

    assert(cancelSuccesses.length === 1, "Exactly ONE cancellation request succeeded", `Success count: ${cancelSuccesses.length}`);
    assert(cancelFailures.length === 1, "Exactly ONE cancellation request failed", `Failure count: ${cancelFailures.length}`);

    const cancelFailReason = (cancelFailures[0] as PromiseRejectedResult).reason;
    const cancelFailMsg = cancelFailReason instanceof Error ? cancelFailReason.message : String(cancelFailReason);
    assert(
      cancelFailMsg.includes("Cannot cancel order with status: CANCELLED"),
      "Failed cancellation reported already CANCELLED status",
      `Actual message: ${cancelFailMsg}`
    );

    // Step 4: Verify stock was restored exactly ONCE (+3 from 10 = 13, NOT +6 = 16)
    const [restockedProduct] = await db
      .select({ inventoryCount: products.inventoryCount })
      .from(products)
      .where(eq(products.id, cancelProduct.id));

    assert(
      restockedProduct.inventoryCount === 13,
      "Inventory was restored exactly once (10 + 3 = 13, not 16)",
      `Actual inventory: ${restockedProduct.inventoryCount}`
    );
  } finally {
    // Clean up
    await db.delete(orderItems).where(eq(orderItems.orderId, testOrder.id));
    await db.delete(orders).where(eq(orders.id, testOrder.id));
    await db.delete(products).where(eq(products.id, cancelProduct.id));
  }

  console.log("\n========================================================");
  console.log("Suite 4: Guard Against Cancelling Shipped / Delivered Orders");
  console.log("========================================================");

  const shippedSuffix = Date.now().toString().slice(-6);
  const [shippedOrder] = await db
    .insert(orders)
    .values({
      orderNumber: `ORD-SHIP-${shippedSuffix}`,
      userId: cancelUser,
      shippingAddress: {
        street: "789 Test Road",
        city: "Delhi",
        state: "Delhi",
        postalCode: "110001",
        country: "India",
      },
      totalAmountCents: 5000,
      status: "SHIPPED",
    })
    .returning();

  try {
    let errorThrown = false;
    let errorMessage = "";
    try {
      await cancelOrder({
        userId: cancelUser,
        orderId: shippedOrder.id,
        reason: "Late cancellation attempt",
      });
    } catch (err) {
      errorThrown = true;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    assert(errorThrown, "Cancelling a SHIPPED order threw an error");
    assert(
      errorMessage.includes("Cannot cancel order with status: SHIPPED"),
      "Error correctly specifies status cannot be cancelled",
      `Message: ${errorMessage}`
    );
  } finally {
    await db.delete(orders).where(eq(orders.id, shippedOrder.id));
  }
}

async function main() {
  console.log("Starting Threadcore Security & Concurrency Verification Test Suite...\n");

  try {
    await runRedirectSecurityTests();
    await runSupabaseConfigTests();
    await runConcurrencyTests();

    console.log("\n========================================================");
    console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests} checks succeeded.`);
    console.log("========================================================\n");
    process.exit(0);
  } catch (error) {
    console.error("\nTEST SUITE FAILED WITH ERROR:", error);
    process.exit(1);
  }
}

main();
