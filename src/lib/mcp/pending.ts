import "server-only";
import { sql } from "drizzle-orm";
import { address, customerId, text, uuid } from "@/lib/domain/validation";
import { DomainError } from "@/lib/domain/errors";
import { customerTransaction, readTransaction } from "@/lib/domain/mutation";
import * as addresses from "@/services/user.service";
import * as orders from "@/services/order.service";

type Action = { operation: "add"; street: string; city: string; state: string; postalCode: string; country?: string; isDefault?: boolean }
  | { operation: "delete"; addressId: string }
  | { operation: "cancel"; orderId: string; reason: string };

export async function propose(user: string, input: Action) {
  user = customerId(user);
  const action: Action = input.operation === "add" ? { operation: "add", ...address(input) } : input.operation === "delete"
    ? { operation: "delete", addressId: uuid(input.addressId) }
    : { operation: "cancel", orderId: uuid(input.orderId), reason: text(input.reason, "reason", 500) };
  let preview: Record<string, unknown> = { ...action };
  if (action.operation === "delete") {
    const saved = (await addresses.getAddresses(user)).find((a) => a.id === action.addressId);
    if (!saved) throw new DomainError("Address not found");
    preview = { operation: "delete", address: saved };
  }
  if (action.operation === "cancel") {
    const order = await orders.getOrderDetails(user, action.orderId);
    if (!order) throw new DomainError("Order not found");
    if (!["CONFIRMED","PROCESSING"].includes(order.status)) throw new DomainError("Order cannot be cancelled");
    preview = { operation: "cancel", orderNumber: order.orderNumber, totalAmountCents: order.totalAmountCents, reason: action.reason };
  }
  await readTransaction((tx) => tx.execute(sql`insert into public.pending_actions(user_id, action, preview) values (${user}::uuid, ${JSON.stringify(action)}::jsonb, ${JSON.stringify(preview)}::jsonb)`));
  return { status: "AWAITING_CONFIRMATION", executed: false };
}

export async function listPending(user: string) {
  user = customerId(user);
  return customerTransaction(user, async (tx) => {
    await tx.execute(sql`update public.pending_actions set status='expired' where user_id=${user}::uuid and status='pending' and expires_at<=now()`);
    return tx.execute(sql`select id, preview, status, expires_at from public.pending_actions
      where user_id=${user}::uuid order by expires_at desc,id desc limit 20`);
  });
}

export async function decide(user: string, id: string, confirm: boolean) {
  user = customerId(user); id = uuid(id);
  return customerTransaction(user, async (tx) => {
    const [row] = await tx.execute<{ action: Action; status: string; expired: boolean }>(sql`
      select action,status,expires_at<=clock_timestamp() as expired from public.pending_actions
      where id=${id}::uuid and user_id=${user}::uuid for update`);
    if (!row) throw new DomainError("Action unavailable");
    if (["executed","rejected","expired"].includes(row.status)) return { status: row.status };
    if (row.status === "approved") throw new DomainError("Legacy approved action requires reconciliation");
    if (row.expired) {
      await tx.execute(sql`update public.pending_actions set status='expired' where id=${id}::uuid`);
      return { status: "expired" };
    }
    if (!confirm) {
      await tx.execute(sql`update public.pending_actions set status='rejected' where id=${id}::uuid`);
      return { status: "rejected" };
    }
    // Domain mutation, its retry receipt, and proposal consumption share ONE transaction.
    // AsyncLocalStorage propagates this transaction only within the same customer.
    const action = row.action;
    if (action.operation === "add") await addresses.addAddress(user, action, id);
    else if (action.operation === "delete") {
      if (!(await addresses.getAddresses(user)).some((a) => a.id === action.addressId)) throw new DomainError("Address no longer exists");
      await addresses.deleteAddress(user, action.addressId, id);
    } else await orders.cancelOrder({ userId: user, orderId: action.orderId, reason: action.reason, requestId: id });
    await tx.execute(sql`update public.pending_actions set status='executed' where id=${id}::uuid and user_id=${user}::uuid`);
    return { status: "executed" };
  });
}
