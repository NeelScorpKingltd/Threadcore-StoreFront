import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserOrders } from "@/services/order.service";
import { formatPrice } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { Package, ArrowRight } from "lucide-react";

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?message=Sign+in+to+view+your+orders");
  }

  const orders = await getUserOrders(user.id);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          Order Archive
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Complete history of all placed, fulfilled, and cancelled orders.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="mx-auto max-w-md py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
            <Package className="h-8 w-8 text-stone-400" />
          </div>
          <h2 className="mt-6 text-lg font-semibold text-stone-900">
            No orders found
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            You haven’t placed any orders yet.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center space-x-2 rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
            >
              <span>Explore Collection</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-200/80 bg-white shadow-sm">
          <div className="divide-y divide-stone-200/80">
            {orders.map((order) => {
              const formattedDate = new Date(order.createdAt).toLocaleDateString(
                "en-US",
                {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }
              );

              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between p-6 transition-colors hover:bg-stone-50/60"
                >
                  <div className="flex flex-col space-y-1 sm:space-y-0.5">
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-sm font-bold tracking-tight text-stone-900 group-hover:underline">
                        {order.orderNumber}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <span className="text-xs text-stone-500">
                      Placed on {formattedDate} · {order.itemCount}{" "}
                      {order.itemCount === 1 ? "item" : "items"}
                    </span>
                  </div>

                  <div className="mt-3 sm:mt-0 flex items-center justify-between sm:justify-end sm:space-x-6">
                    <span className="font-mono text-sm font-semibold tabular-nums text-stone-900">
                      {formatPrice(order.totalAmountCents)}
                    </span>
                    <span className="text-xs font-medium text-stone-400 group-hover:text-stone-900 flex items-center space-x-1">
                      <span>View Details</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
