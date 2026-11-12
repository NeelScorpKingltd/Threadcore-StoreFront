import React from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrderDetails } from "@/services/order.service";
import { formatPrice } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { CancelOrderButton } from "@/components/CancelOrderButton";
import { ArrowLeft, MapPin, Calendar, CheckCircle } from "lucide-react";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?message=Sign+in+to+view+order+details");
  }

  const order = await getOrderDetails(user.id, id);

  if (!order) {
    notFound();
  }

  const formattedDate = new Date(order.createdAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const canCancel =
    order.status === "CONFIRMED" || order.status === "PROCESSING";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/orders"
          className="inline-flex items-center space-x-2 text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Order Archive</span>
        </Link>
      </div>

      {/* Order Header */}
      <div className="rounded-lg border border-stone-200/80 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/80 pb-6">
          <div className="space-y-1">
            <div className="flex items-center space-x-3">
              <h1 className="font-mono text-2xl font-bold tracking-tight text-stone-900">
                {order.orderNumber}
              </h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="flex items-center text-xs text-stone-500 space-x-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>{formattedDate}</span>
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-xs text-stone-400 uppercase tracking-wider block">
              Total Amount
            </span>
            <span className="font-mono text-xl font-bold tabular-nums text-stone-900">
              {formatPrice(order.totalAmountCents)}
            </span>
          </div>
        </div>

        {/* Cancellation Notice if Cancelled */}
        {order.status === "CANCELLED" && (
          <div className="mt-6 rounded-md border border-stone-200 bg-stone-50 p-4 text-xs text-stone-600 space-y-1">
            <p className="font-semibold text-stone-900">Order Cancelled</p>
            {order.cancellationReason && (
              <p>Reason: {order.cancellationReason}</p>
            )}
            <p className="text-stone-400">
              All quantities have been returned to warehouse inventory.
            </p>
          </div>
        )}

        {/* Items List */}
        <div className="mt-8 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-900">
            Pieces in this Order ({order.items.length})
          </h2>

          <div className="divide-y divide-stone-100 border-y border-stone-100">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-4"
              >
                <div className="flex items-center space-x-4">
                  <div className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded bg-stone-100 border border-stone-200/80">
                    <Image
                      src={item.product.imageUrl}
                      alt={item.product.title}
                      fill
                      className="object-cover object-center"
                    />
                  </div>

                  <div className="flex flex-col space-y-0.5">
                    <Link
                      href={`/products/${item.product.id}`}
                      className="text-sm font-semibold text-stone-900 hover:underline"
                    >
                      {item.product.title}
                    </Link>
                    <span className="font-mono text-xs text-stone-400">
                      {item.product.sku}
                    </span>
                    <span className="text-xs text-stone-500">
                      Qty: {item.quantity} × {formatPrice(item.unitPriceCents)}
                    </span>
                  </div>
                </div>

                <div className="font-mono text-sm font-medium tabular-nums text-stone-900">
                  {formatPrice(item.unitPriceCents * item.quantity)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shipping Address */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-stone-200/80 pt-6">
          <div className="space-y-1.5">
            <h3 className="flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-stone-900">
              <MapPin className="h-3.5 w-3.5 text-stone-500" />
              <span>Destination</span>
            </h3>
            <p className="text-sm font-medium text-stone-800">
              {order.shippingAddress.street}
            </p>
            <p className="text-xs text-stone-500">
              {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
              {order.shippingAddress.postalCode}
            </p>
            <p className="text-xs text-stone-500">
              {order.shippingAddress.country}
            </p>
          </div>

          <div className="space-y-1.5 sm:text-right">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-900">
              Fulfillment
            </h3>
            <p className="text-xs text-stone-500">Complimentary Standard</p>
            <p className="font-mono text-xs text-emerald-700 font-medium">
              Carbon Neutral
            </p>
          </div>
        </div>

        {/* Self-Service Cancellation */}
        {canCancel && (
          <div className="mt-8 border-t border-stone-200/80 pt-6">
            <CancelOrderButton
              orderId={order.id}
              orderNumber={order.orderNumber}
            />
          </div>
        )}
      </div>
    </div>
  );
}
