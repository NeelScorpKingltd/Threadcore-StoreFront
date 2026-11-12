import { db } from "../src/lib/db/client";
import { products, orders, orderItems, cartItems, addresses } from "../src/lib/db/schema";
import * as CatalogService from "../src/services/catalog.service";
import * as CartService from "../src/services/cart.service";
import * as OrderService from "../src/services/order.service";
import * as UserService from "../src/services/user.service";
import { eq } from "drizzle-orm";

async function runVerification() {
  console.log("==========================================");
  console.log("THREADCORE INVARIANT VERIFICATION SUITE");
  console.log("==========================================\n");

  const TEST_USER_ID = "test-user-verification-" + Date.now();

  try {
    // 1. Verify products seeded
    console.log("1. Verifying demo products in database...");
    const allProducts = await CatalogService.listProducts();
    console.log(`   Found ${allProducts.length} products.`);
    if (allProducts.length < 14) {
      throw new Error(`Expected at least 14 products, found ${allProducts.length}`);
    }
    console.log(`   ✅ Product count check passed (${allProducts.length} products found).\n`);

    // 2. Verify Sold Out item (APP-DEN-014) cannot be added to cart
    console.log("2. Testing sold-out product protection (APP-DEN-014)...");
    const zeroStockProduct = await CatalogService.getProductBySku("APP-DEN-014");
    if (!zeroStockProduct) throw new Error("SKU APP-DEN-014 not found");
    if (zeroStockProduct.inventoryCount !== 0) {
      throw new Error(`Expected APP-DEN-014 inventory 0, got ${zeroStockProduct.inventoryCount}`);
    }

    let blocked = false;
    try {
      await CartService.addToCart(TEST_USER_ID, zeroStockProduct.id, 1);
    } catch (err: any) {
      blocked = true;
      console.log(`   Expected block caught: "${err.message}"`);
    }
    if (!blocked) {
      throw new Error("Sold-out product was NOT blocked from being added to cart!");
    }
    console.log("   ✅ Sold-out product restriction verified.\n");

    // 3. Test In-stock product order creation & inventory decrement
    console.log("3. Testing atomic order creation & inventory decrement...");
    const testProduct = await CatalogService.getProductBySku("APP-JKT-001");
    if (!testProduct) throw new Error("SKU APP-JKT-001 not found");
    const initialStock = testProduct.inventoryCount;
    console.log(`   Initial stock for ${testProduct.title}: ${initialStock}`);

    // Add 2 units to cart
    await CartService.addToCart(TEST_USER_ID, testProduct.id, 2);
    const cart = await CartService.getCart(TEST_USER_ID);
    console.log(`   Cart contains ${cart.totalItems} items, subtotal: $${(cart.subtotalCents / 100).toFixed(2)}`);
    if (cart.totalItems !== 2) throw new Error("Cart item count mismatch");

    // Create shipping address
    const address = await UserService.addAddress(TEST_USER_ID, {
      street: "100 Fashion Avenue",
      city: "Mumbai",
      state: "MH",
      postalCode: "400001",
      country: "India",
      isDefault: true,
    });

    // Create order from cart
    const orderResult = await OrderService.createOrderFromCart({
      userId: TEST_USER_ID,
      shippingAddress: {
        street: address.street,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country,
      },
    });

    console.log(`   Order created: ${orderResult.orderNumber} (ID: ${orderResult.orderId})`);

    // Verify inventory decremented by 2
    const productAfterOrder = await CatalogService.getProductById(testProduct.id);
    console.log(`   Stock after order: ${productAfterOrder?.inventoryCount}`);
    if (productAfterOrder?.inventoryCount !== initialStock - 2) {
      throw new Error(
        `Inventory not decremented correctly! Expected ${initialStock - 2}, got ${productAfterOrder?.inventoryCount}`
      );
    }

    // Verify cart is cleared
    const cartAfterOrder = await CartService.getCart(TEST_USER_ID);
    if (cartAfterOrder.items.length !== 0) {
      throw new Error("Cart was not cleared after order creation!");
    }
    console.log("   Cart cleared: true");
    console.log("   ✅ Atomic order creation and inventory decrement verified.\n");

    // 4. Test self-service order cancellation and inventory restoration
    console.log("4. Testing atomic order cancellation and stock restoration...");
    const cancelResult = await OrderService.cancelOrder({
      userId: TEST_USER_ID,
      orderId: orderResult.orderId,
      reason: "Automated verification test cancellation",
    });

    console.log(`   Cancellation status for ${cancelResult.orderNumber}: success = ${cancelResult.success}`);

    // Verify order status is CANCELLED
    const cancelledOrder = await OrderService.getOrderDetails(TEST_USER_ID, orderResult.orderId);
    if (cancelledOrder?.status !== "CANCELLED") {
      throw new Error(`Expected order status CANCELLED, got ${cancelledOrder?.status}`);
    }
    console.log(`   Order status: ${cancelledOrder.status}`);

    // Verify inventory restored back to initialStock
    const productAfterCancel = await CatalogService.getProductById(testProduct.id);
    console.log(`   Stock after cancellation: ${productAfterCancel?.inventoryCount} (Initial was ${initialStock})`);
    if (productAfterCancel?.inventoryCount !== initialStock) {
      throw new Error(
        `Inventory was not restored! Expected ${initialStock}, got ${productAfterCancel?.inventoryCount}`
      );
    }
    console.log("   ✅ Order cancellation and stock restoration verified.\n");

    // Clean up test records
    console.log("5. Cleaning up test records...");
    await db.delete(orderItems).where(eq(orderItems.orderId, orderResult.orderId));
    await db.delete(orders).where(eq(orders.id, orderResult.orderId));
    await db.delete(addresses).where(eq(addresses.userId, TEST_USER_ID));
    console.log("   ✅ Clean up complete.\n");

    console.log("==========================================");
    console.log("ALL INVARIANTS VERIFIED SUCCESSFULLY! (5/5)");
    console.log("==========================================");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  }
}

runVerification();
