import { DomainError } from "@/lib/domain/errors";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mutationReceipts } from "@/lib/db/schema";
import { customerId, uuid } from "./validation";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const activeTransaction = new AsyncLocalStorage<{ userId: string; tx: Transaction }>();

export async function readTransaction<T>(work: (tx: Transaction) => Promise<T>) {
  const current = activeTransaction.getStore();
  if (current) return work(current.tx);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    return work(tx);
  });
}

// Transaction locks work with transaction pooling. All customer writes acquire
// this before product/order locks; hash collisions only serialize unrelated users.
export async function lockCustomer(tx: Transaction, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 73129))`);
}

export async function customerTransaction<T>(userId: string, work: (tx: Transaction) => Promise<T>) {
  userId = customerId(userId);
  const current = activeTransaction.getStore();
  if (current) {
    if (current.userId !== userId) throw new DomainError("Transaction identity mismatch");
    return work(current.tx);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '15s'`);
    await lockCustomer(tx, userId);
    return activeTransaction.run({ userId, tx }, () => work(tx));
  });
}

export function fingerprint(args: readonly unknown[]) {
  return createHash("sha256").update(JSON.stringify(args)).digest("hex");
}

export async function once<T>(userId: string, operation: string, requestId: string, args: readonly unknown[], work: (tx: Transaction) => Promise<T>): Promise<T> {
  userId = customerId(userId);
  requestId = uuid(requestId, "request ID");
  const digest = fingerprint(args);
  return customerTransaction(userId, async (tx) => {
    const [receipt] = await tx.select().from(mutationReceipts).where(and(eq(mutationReceipts.userId, userId), eq(mutationReceipts.operation, operation), eq(mutationReceipts.requestId, requestId))).limit(1);
    if (receipt) {
      if (receipt.fingerprint !== digest) throw new DomainError("Request ID already used with different arguments");
      return receipt.result as T;
    }
    const result = await work(tx);
    // Receipt and mutation commit together. Do not expire receipts and allow replay.
    await tx.insert(mutationReceipts).values({ userId, operation, requestId, fingerprint: digest, result });
    return result;
  });
}
