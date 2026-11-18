// Never loads .env/.env.local. All writes target a newly created loopback-only cluster.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { address, quantity, pagination, uuid } from "../src/lib/domain/validation";
import { DomainError, publicError } from "../src/lib/domain/errors";

async function main() {
  // Replacing, rather than falling back to, any inherited production configuration.
  delete process.env.DATABASE_URL;
  delete process.env.DIRECT_URL;
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const endpoint = probe.address();
  assert(endpoint && typeof endpoint === "object");
  const port = endpoint.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  const directory = await mkdtemp(join(tmpdir(), "threadcore-domain-test-"));
  assert(resolve(directory).startsWith(resolve(tmpdir()) + sep));
  assert(directory.includes("threadcore-domain-test-"));
  const password = randomBytes(24).toString("hex");
  const cluster = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password,
    persistent: false, authMethod: "scram-sha-256", autoRehydrateSymlinks: true,
    postgresFlags: ["-h", "127.0.0.1"], onLog: () => {}, onError: () => {} });
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  let admin: ReturnType<typeof postgres> | undefined;
  let closeApp: (() => Promise<void>) | undefined;
  let passed = 0;
  const check = async (name: string, work: () => void | Promise<void>) => {
    await work(); passed++; console.log(`PASS ${name}`);
  };
  try {
    await cluster.initialise();
    await cluster.start();
    admin = postgres(url, { prepare: false, onnotice: () => {} });
    const connection = admin;
    const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
    for (const statement of statements) await connection.unsafe(statement);
    await connection.unsafe("DROP TABLE pending_actions");
    // Reconstruct the pre-Phase-2 database and exercise the actual upgrade SQL.
    await connection.unsafe(`DROP TABLE mutation_receipts;
      ALTER TABLE cart_items DROP CONSTRAINT cart_quantity_bounds;
      ALTER TABLE products DROP CONSTRAINT product_nonnegative;
      ALTER TABLE order_items DROP CONSTRAINT order_item_positive;
      ALTER TABLE orders DROP CONSTRAINT order_total_nonnegative;
      DROP INDEX unique_default_address; DROP INDEX orders_customer_page; DROP INDEX order_items_order_lookup;
      CREATE ROLE anon; CREATE ROLE authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;`);
    await connection.unsafe(await readFile("migrations/phase2-domain-hardening.sql", "utf8"));
    // Minimal Supabase session metadata fixture; no real auth schema is contacted.
    await connection.unsafe("CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL, not_after timestamptz);");
    await connection.unsafe(await readFile("migrations/phase3-session-verification.sql", "utf8"));
    await connection.unsafe(await readFile("migrations/phase5-pending-actions.sql", "utf8"));
    await connection.unsafe("DROP TABLE mcp_rate_limits");
    await connection.unsafe(await readFile("migrations/phase7-rate-limits.sql", "utf8"));
    process.env.DATABASE_URL = url;
    const { db } = await import("../src/lib/db/client");
    closeApp = () => db.$client.end();
    const { enforceChatRateLimit } = await import("../src/lib/chat/rate-limit");
    await check("distributed rate limit serializes concurrent requests and resets expired window", async () => {
      const results = await Promise.allSettled(Array.from({ length: 12 }, () => enforceChatRateLimit("test:concurrent", 5)));
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 5);
      for (const result of results) if (result.status === "rejected") assert.equal(result.reason.status, 429);
      await connection`update mcp_rate_limits set window_start = now() - interval '2 minutes'`;
      await enforceChatRateLimit("test:concurrent", 5);
      await enforceChatRateLimit("test:separate-user", 5);
      const [permissions] = await connection`select has_table_privilege('anon', 'public.mcp_rate_limits', 'SELECT') as anon_read,
        has_table_privilege('authenticated', 'public.mcp_rate_limits', 'UPDATE') as browser_write`;
      assert.equal(permissions.anon_read, false);
      assert.equal(permissions.browser_write, false);
    });
    const cart = await import("../src/services/cart.service");
    const users = await import("../src/services/user.service");
    const orders = await import("../src/services/order.service");
    const catalog = await import("../src/services/catalog.service");
    const a = randomUUID(), b = randomUUID();
    const shipping = { street: "1 Test Street", city: "Mumbai", state: "MH", postalCode: "400001", country: "India" };
    const pending = await import("../src/lib/mcp/pending");
    const { confirmationBody } = await import("../src/lib/mcp/confirmation-schema");
    const proposalId = async () => {
      const rows = await pending.listPending(a);
      return String(rows[0].id);
    };
    await check("confirmation rejects replacement arguments, invalid IDs and malformed bodies", () => {
      for (const body of [null, [], {}, { id: "bad", confirm: true }, { id: randomUUID(), confirm: "true" }, { id: randomUUID(), confirm: true, action: shipping }]) assert.equal(confirmationBody.safeParse(body).success, false);
    });
    await check("confirmation ownership, readable previews, replay and expiry", async () => {
      const response = await pending.propose(a, { operation: "add", ...shipping });
      assert(!("id" in response));
      const id = await proposalId();
      await assert.rejects(pending.decide(b, id, true));
      assert.equal((await pending.decide(a, id, true)).status, "executed");
      assert.equal((await pending.decide(a, id, true)).status, "executed");
      assert.equal((await pending.decide(a, id, false)).status, "executed");
      assert.equal((await users.getAddresses(a)).length, 1);
      await pending.propose(a, { operation: "delete", addressId: (await users.getAddresses(a))[0].id });
      const deletion = await proposalId();
      assert((await pending.listPending(a))[0].preview);
      await connection`update pending_actions set expires_at=now()-interval '1 second' where id=${deletion}`;
      assert.equal((await pending.decide(a, deletion, true)).status, "expired");
      assert.equal((await users.getAddresses(a)).length, 1);
    });
    await check("concurrent confirmation/rejection produces one durable outcome", async () => {
      await pending.propose(a, { operation: "add", ...shipping });
      const id = await proposalId();
      const before = (await users.getAddresses(a)).length;
      const outcomes = await Promise.all([pending.decide(a,id,true),pending.decide(a,id,false),pending.decide(a,id,true)]);
      assert.equal(new Set(outcomes.map((o) => o.status)).size, 1);
      assert.equal((await users.getAddresses(a)).length, before + (outcomes[0].status === "executed" ? 1 : 0));
    });
    await check("completion persistence failure rolls back mutation and receipt; retry recovers", async () => {
      await pending.propose(a, { operation: "add", ...shipping });
      const id = await proposalId(), before = (await users.getAddresses(a)).length;
      await connection.unsafe(`CREATE FUNCTION fail_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='executed' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER fail_confirmation BEFORE UPDATE ON pending_actions FOR EACH ROW EXECUTE FUNCTION fail_confirmation();`);
      await assert.rejects(pending.decide(a,id,true));
      assert.equal((await users.getAddresses(a)).length, before);
      const [receipt] = await connection`select count(*)::int as count from mutation_receipts where request_id=${id}`;
      assert.equal(receipt.count, 0);
      await connection.unsafe("DROP TRIGGER fail_confirmation ON pending_actions; DROP FUNCTION fail_confirmation();");
      await pending.decide(a,id,true);
      assert.equal((await users.getAddresses(a)).length, before + 1);
      // Subsequent legacy domain assertions expect an empty address book.
      await connection`delete from addresses where user_id=${a}`;
    });
    const product = async (stock: number, title = "Test product") => (await db.insert(schema.products).values({
      sku: randomUUID(), title, description: "Untrusted description", category: "Test", priceCents: 100,
      inventoryCount: stock, imageUrl: "https://example.invalid/test.png",
    }).returning())[0];

    await check("confirmed cancellation rechecks business state and restocks only once", async () => {
      const p = await product(10);
      await cart.addToCart(a,p.id,2,randomUUID());
      const order = await orders.createOrderFromCart({ userId:a,shippingAddress:shipping,requestId:randomUUID() });
      await pending.propose(a,{ operation:"cancel",orderId:order.orderId,reason:"Changed mind" });
      const id = await proposalId();
      await Promise.all([pending.decide(a,id,true),pending.decide(a,id,true)]);
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount,10);
      await cart.addToCart(a,p.id,1,randomUUID());
      const later = await orders.createOrderFromCart({ userId:a,shippingAddress:shipping,requestId:randomUUID() });
      await pending.propose(a,{ operation:"cancel",orderId:later.orderId,reason:"Changed mind" });
      const stale = await proposalId();
      await db.update(schema.orders).set({status:"SHIPPED"}).where(eq(schema.orders.id,later.orderId));
      await assert.rejects(pending.decide(a,stale,true));
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount,9);
    });
    await check("confirmed deletion and rejection are replay-safe and browser grants are denied", async () => {
      const saved = await users.addAddress(a,shipping,randomUUID());
      await pending.propose(a,{operation:"delete",addressId:saved.id});
      const id = await proposalId();
      await pending.decide(a,id,false);
      assert.equal((await pending.decide(a,id,true)).status,"rejected");
      assert((await users.getAddresses(a)).some((v)=>v.id===saved.id));
      await pending.propose(a,{operation:"delete",addressId:saved.id});
      const accepted = await proposalId();
      await pending.decide(a,accepted,true);
      await pending.decide(a,accepted,true);
      assert(!(await users.getAddresses(a)).some((v)=>v.id===saved.id));
      for(const role of ["anon","authenticated"]) {
        const [row] = await connection`select has_table_privilege(${role},'public.pending_actions','SELECT,INSERT,UPDATE,DELETE') as allowed`;
        assert.equal(row.allowed,false);
      }
    });
    await check("live-session function isolates identities, revokes deleted sessions and denies browser roles", async () => {
      const sid = randomUUID();
      await connection`insert into auth.sessions(id, user_id) values (${sid}, ${a})`;
      const lookup = async (user: string) => (await connection`select public.threadcore_session_is_active(${user}::uuid, ${sid}::uuid) as active`)[0].active;
      assert.equal(await lookup(a), true);
      assert.equal(await lookup(b), false);
      for (const role of ["anon", "authenticated"]) {
        const [row] = await connection`select has_function_privilege(${role}, 'public.threadcore_session_is_active(uuid,uuid)', 'EXECUTE') as allowed`;
        assert.equal(row.allowed, false);
      }
      await connection.unsafe("CREATE ROLE threadcore_test_app; GRANT USAGE ON SCHEMA public TO threadcore_test_app; GRANT EXECUTE ON FUNCTION public.threadcore_session_is_active(uuid,uuid) TO threadcore_test_app;");
      await connection.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE threadcore_test_app");
        const [row] = await tx`select public.threadcore_session_is_active(${a}::uuid, ${sid}::uuid) as active`;
        assert.equal(row.active, true);
      });
      await assert.rejects(connection.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE threadcore_test_app");
        await tx.unsafe("SELECT * FROM auth.sessions");
      }));
      await connection`delete from auth.sessions where id=${sid}`;
      assert.equal(await lookup(a), false);
      await connection`insert into auth.sessions(id, user_id, not_after) values (${sid}, ${a}, now() - interval '1 second')`;
      assert.equal(await lookup(a), false);
    });

    await check("validation rejects invalid IDs, quantities, fields and pagination", () => {
      for (const value of [-1, 0, 0.5, NaN, Infinity, 100, "2", null]) assert.throws(() => quantity(value));
      assert.equal(quantity(0, true), 0);
      assert.throws(() => uuid("not-an-id"));
      assert.throws(() => address({ ...shipping, street: " " }));
      assert.throws(() => address({ ...shipping, postalCode: "x".repeat(21) }));
      assert.throws(() => address({ ...shipping, isDefault: "true" as unknown as boolean }));
      for (const value of [{ limit: 101 }, { offset: -1 }, { offset: 0.5 }]) assert.throws(() => pagination(value));
      assert.equal(publicError(new Error("SQL error with private address")), "Unable to complete request. Please try again.");
      assert.equal(publicError(new DomainError("Cart item not found")), "Cart item not found");
    });
    await check("migration denies browser roles access to retry records despite default grants", async () => {
      const [row] = await connection`select relrowsecurity from pg_class where oid='public.mutation_receipts'::regclass`;
      assert.equal(row.relrowsecurity, true);
      for (const role of ["anon", "authenticated"]) {
        const [priv] = await connection`select has_table_privilege(${role}, 'public.mutation_receipts', 'SELECT,INSERT,UPDATE,DELETE') as allowed`;
        assert.equal(priv.allowed, false);
      }
    });
    await check("negative quantity exploit rejected by service and database", async () => {
      const p = await product(5);
      await assert.rejects(cart.addToCart(a, p.id, -2, randomUUID()));
      await assert.rejects(cart.addToCart(a, p.id, 1, "invalid-request"));
      await assert.rejects(db.insert(schema.cartItems).values({ userId: a, productId: p.id, quantity: -1 }));
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount, 5);
    });
    await check("concurrent cart additions respect stock, retries execute once and tampering fails", async () => {
      const p = await product(5);
      const outcomes = await Promise.allSettled(Array.from({ length: 15 }, () => cart.addToCart(a, p.id, 1, randomUUID())));
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 5);
      const p2 = await product(20), key = randomUUID();
      await Promise.all(Array.from({ length: 8 }, () => cart.addToCart(a, p2.id, 2, key)));
      assert.equal((await cart.getCart(a)).items.find((i) => i.productId === p2.id)?.quantity, 2);
      await assert.rejects(cart.addToCart(a, p2.id, 3, key), /different arguments/);
      await cart.addToCart(b, p2.id, 1, key);
      assert.equal((await cart.getCart(b)).totalItems, 1);
      await cart.clearCart(a); await cart.clearCart(b);
    });
    await check("cart and address ownership survives guessed IDs", async () => {
      const p = await product(5);
      await cart.addToCart(a, p.id, 1, randomUUID());
      const item = (await cart.getCart(a)).items[0];
      await assert.rejects(cart.updateItemQuantity(b, item.id, 2, randomUUID()), /not found/);
      await cart.removeItem(b, item.id, randomUUID());
      assert.equal((await cart.getCart(a)).totalItems, 1);
      const saved = await users.addAddress(a, shipping, randomUUID());
      await users.deleteAddress(b, saved.id, randomUUID());
      assert((await users.getAddresses(a)).some((x) => x.id === saved.id));
      assert.equal((await users.getAddresses(b)).length, 0);
      await cart.clearCart(a);
    });
    await check("address retry and default changes are atomic under concurrency", async () => {
      const key = randomUUID();
      const copies = await Promise.all(Array.from({ length: 5 }, () => users.addAddress(a, { ...shipping, isDefault: true }, key)));
      assert.equal(new Set(copies.map((v) => v.id)).size, 1);
      await assert.rejects(users.addAddress(a, { ...shipping, city: "Changed" }, key), /different arguments/);
      await Promise.all(Array.from({ length: 5 }, (_, n) => users.addAddress(a, { ...shipping, street: `${n} Test Lane`, isDefault: true }, randomUUID())));
      assert.equal((await users.getAddresses(a)).filter((v) => v.isDefault).length, 1);
      // Force a DB failure after unsetting default; the transaction must restore it.
      await connection.unsafe(`CREATE FUNCTION fail_address_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test insert failure'; END $$;
        CREATE TRIGGER test_address_failure BEFORE INSERT ON addresses FOR EACH ROW EXECUTE FUNCTION fail_address_insert();`);
      await assert.rejects(users.addAddress(a, { ...shipping, isDefault: true }, randomUUID()));
      await connection.unsafe("DROP TRIGGER test_address_failure ON addresses; DROP FUNCTION fail_address_insert();");
      assert.equal((await users.getAddresses(a)).filter((v) => v.isDefault).length, 1);
    });
    await check("checkout retries return one order and concurrent new intents cannot double checkout", async () => {
      const p = await product(20);
      await cart.addToCart(a, p.id, 2, randomUUID());
      const request = { userId: a, shippingAddress: shipping, requestId: randomUUID() };
      const results = await Promise.all(Array.from({ length: 5 }, () => orders.createOrderFromCart(request)));
      assert.equal(new Set(results.map((v) => v.orderId)).size, 1);
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount, 18);
      await cart.addToCart(a, p.id, 1, randomUUID());
      const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => orders.createOrderFromCart({ ...request, requestId: randomUUID() })));
      assert.equal(outcomes.filter((v) => v.status === "fulfilled").length, 1);
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount, 17);
    });
    await check("set/remove retries cannot overwrite a later customer cart intent", async () => {
      const p = await product(20);
      await cart.addToCart(a, p.id, 1, randomUUID());
      const item = (await cart.getCart(a)).items[0];
      const setKey = randomUUID();
      await cart.updateItemQuantity(a, item.id, 2, setKey);
      await cart.updateItemQuantity(a, item.id, 4, randomUUID());
      await cart.updateItemQuantity(a, item.id, 2, setKey);
      assert.equal((await cart.getCart(a)).totalItems, 4);
      const removeKey = randomUUID();
      await cart.removeItem(a, item.id, removeKey);
      await cart.addToCart(a, p.id, 3, randomUUID());
      await cart.removeItem(a, item.id, removeKey);
      assert.equal((await cart.getCart(a)).totalItems, 3);
      await cart.clearCart(a);
    });
    await check("checkout racing an addition never loses paid or remaining quantities", async () => {
      const p = await product(20);
      await cart.addToCart(a, p.id, 1, randomUUID());
      const [order] = await Promise.all([
        orders.createOrderFromCart({ userId: a, shippingAddress: shipping, requestId: randomUUID() }),
        cart.addToCart(a, p.id, 2, randomUUID()),
      ]);
      const detail = await orders.getOrderDetails(a, order.orderId);
      assert(detail);
      const purchased = detail.items.reduce((sum, i) => sum + i.quantity, 0);
      assert.equal(purchased + (await cart.getCart(a)).totalItems, 3);
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount, 20 - purchased);
      await cart.clearCart(a);
    });
    await check("competing customers cannot oversell at checkout", async () => {
      const p = await product(1);
      await cart.addToCart(a, p.id, 1, randomUUID()); await cart.addToCart(b, p.id, 1, randomUUID());
      const outcomes = await Promise.allSettled([a, b].map((userId) => orders.createOrderFromCart({ userId, shippingAddress: shipping, requestId: randomUUID() })));
      assert.equal(outcomes.filter((v) => v.status === "fulfilled").length, 1);
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount, 0);
      await cart.clearCart(a); await cart.clearCart(b);
    });
    await check("cancellation ownership, retries, status checks and one-time restock", async () => {
      const p = await product(10);
      await cart.addToCart(a, p.id, 2, randomUUID());
      const created = await orders.createOrderFromCart({ userId: a, shippingAddress: shipping, requestId: randomUUID() });
      assert.equal(await orders.getOrderDetails(b, created.orderId), null);
      const request = { userId: a, orderId: created.orderId, reason: "Test cancellation", requestId: randomUUID() };
      await assert.rejects(orders.cancelOrder({ ...request, userId: b }), /not found/);
      await assert.rejects(orders.cancelOrder({ ...request, reason: " " }));
      await Promise.all(Array.from({ length: 5 }, () => orders.cancelOrder(request)));
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount, 10);
      await assert.rejects(orders.cancelOrder({ ...request, reason: "Changed" }), /different arguments/);
      await assert.rejects(orders.cancelOrder({ ...request, requestId: randomUUID() }), /CANCELLED/);
      await cart.addToCart(a, p.id, 1, randomUUID());
      const another = await orders.createOrderFromCart({ userId: a, shippingAddress: shipping, requestId: randomUUID() });
      const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => orders.cancelOrder({ ...request, orderId: another.orderId, requestId: randomUUID() })));
      assert.equal(attempts.filter((v) => v.status === "fulfilled").length, 1);
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount, 10);
      await cart.addToCart(a, p.id, 1, randomUUID());
      const shipped = await orders.createOrderFromCart({ userId: a, shippingAddress: shipping, requestId: randomUUID() });
      await db.update(schema.orders).set({ status: "SHIPPED" }).where(eq(schema.orders.id, shipped.orderId));
      await assert.rejects(orders.cancelOrder({ ...request, orderId: shipped.orderId, requestId: randomUUID() }), /SHIPPED/);
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount, 9);
    });
    await check("failed cancellation rolls back status, receipt and partial restock", async () => {
      const p = await product(10);
      await cart.addToCart(a, p.id, 1, randomUUID());
      const created = await orders.createOrderFromCart({ userId: a, shippingAddress: shipping, requestId: randomUUID() });
      const request = { userId: a, orderId: created.orderId, reason: "Retry after rollback", requestId: randomUUID() };
      await connection.unsafe(`CREATE FUNCTION fail_stock_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test stock failure'; END $$;
        CREATE TRIGGER test_stock_failure BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION fail_stock_update();`);
      await assert.rejects(orders.cancelOrder(request));
      assert.equal((await orders.getOrderDetails(a, created.orderId))?.status, "CONFIRMED");
      await connection.unsafe("DROP TRIGGER test_stock_failure ON products; DROP FUNCTION fail_stock_update();");
      await orders.cancelOrder(request);
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount, 10);
    });
    await check("bounded pagination and literal search return stable explicit fields", async () => {
      const p = await product(1, "Literal %_ test");
      const matches = await catalog.listProducts({ search: "%_", limit: 2 });
      assert.equal(matches.length, 1); assert.equal(matches[0].id, p.id);
      const first = await catalog.listProducts({ limit: 2 });
      const second = await catalog.listProducts({ limit: 2, offset: 2 });
      assert.equal(first.length, 2); assert(!second.some((v) => first.some((f) => f.id === v.id)));
      const page = await orders.getUserOrders(a, { limit: 1 });
      assert.equal(page.length, 1); assert.equal(typeof page[0].itemCount, "number");
      assert(!("userId" in page[0])); assert(!("shippingAddress" in page[0]));
      assert.equal((await orders.getUserOrders(randomUUID())).length, 0);
    });
    await check("legacy invalid cart cannot increase inventory at checkout", async () => {
      const p = await product(5);
      await connection.unsafe("ALTER TABLE cart_items DROP CONSTRAINT cart_quantity_bounds");
      await db.insert(schema.cartItems).values({ userId: a, productId: p.id, quantity: -2 });
      await assert.rejects(orders.createOrderFromCart({ userId: a, shippingAddress: shipping, requestId: randomUUID() }));
      assert.equal((await catalog.getProductById(p.id))?.inventoryCount, 5);
      await cart.clearCart(a);
    });
    await check("receipt and mutation rollback together if receipt persistence fails", async () => {
      const p = await product(5);
      await connection.unsafe(`CREATE FUNCTION fail_receipt_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test receipt failure'; END $$;
        CREATE TRIGGER test_receipt_failure BEFORE INSERT ON mutation_receipts FOR EACH ROW EXECUTE FUNCTION fail_receipt_insert();`);
      const key = randomUUID();
      await assert.rejects(cart.addToCart(a, p.id, 1, key));
      assert.equal((await cart.getCart(a)).totalItems, 0);
      await connection.unsafe("DROP TRIGGER test_receipt_failure ON mutation_receipts; DROP FUNCTION fail_receipt_insert();");
      await cart.addToCart(a, p.id, 1, key);
      assert.equal((await cart.getCart(a)).totalItems, 1);
    });
    // Ensure the application connection really uses independent concurrent sessions.
    const [{ sessions }] = await db.execute<{ sessions: number }>(sql`select count(*)::int as sessions from pg_stat_activity where datname=current_database()`);
    assert(sessions > 2);
    console.log(`${passed} isolated PostgreSQL test groups passed. No Supabase connections used.`);
  } finally {
    await closeApp?.();
    await admin?.end();
    await cluster.stop();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Isolated domain tests failed");
  process.exitCode = 1;
});
