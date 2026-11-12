"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { createOrder } from "@/app/actions/order.actions";
import { addAddress } from "@/app/actions/user.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";

interface Address {
  id: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

interface CartItem {
  id: string;
  quantity: number;
  product: {
    title: string;
    sku: string;
    priceCents: number;
    imageUrl: string;
  };
}

interface CheckoutClientProps {
  initialAddresses: Address[];
  cartItems: CartItem[];
  subtotalCents: number;
}

export function CheckoutClient({
  initialAddresses,
  cartItems,
  subtotalCents,
}: CheckoutClientProps) {
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    initialAddresses.find((a) => a.isDefault)?.id ?? initialAddresses[0]?.id ?? ""
  );

  // Address creation form state
  const [showAddForm, setShowAddForm] = useState(initialAddresses.length === 0);
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("India");

  const [isPending, startTransition] = useTransition();
  const [isAddingAddress, startAddressTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAddNewAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!street || !city || !state || !postalCode) return;

    startAddressTransition(async () => {
      const res = await addAddress({
        street,
        city,
        state,
        postalCode,
        country,
        isDefault: addresses.length === 0,
      });

      if (res.success && res.address) {
        setAddresses((prev) => [res.address!, ...prev]);
        setSelectedAddressId(res.address.id);
        setShowAddForm(false);
        setStreet("");
        setCity("");
        setState("");
        setPostalCode("");
      } else {
        setErrorMessage(res.message ?? "Failed to save address");
      }
    });
  };

  const handlePlaceOrder = () => {
    const selected = addresses.find((a) => a.id === selectedAddressId);
    if (!selected) {
      setErrorMessage("Please select or add a shipping address.");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const res = await createOrder({
        street: selected.street,
        city: selected.city,
        state: selected.state,
        postalCode: selected.postalCode,
        country: selected.country,
      });

      if (res.success && "orderId" in res && res.orderId) {
        router.push(`/orders/${res.orderId}`);
      } else {
        setErrorMessage(res.message ?? "Failed to place order.");
      }
    });
  };

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
      {/* Left: Shipping Address Selection */}
      <div className="space-y-8 lg:col-span-7">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-stone-900">
              1. Shipping Address
            </h2>
            {addresses.length > 0 && !showAddForm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(true)}
                className="text-xs"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add New Address
              </Button>
            )}
          </div>

          {/* Address List */}
          {addresses.length > 0 && !showAddForm && (
            <div className="space-y-3">
              {addresses.map((addr) => {
                const isSelected = addr.id === selectedAddressId;
                return (
                  <div
                    key={addr.id}
                    onClick={() => setSelectedAddressId(addr.id)}
                    className={`cursor-pointer rounded-lg border p-4 transition-all ${
                      isSelected
                        ? "border-stone-900 bg-stone-50/50 ring-1 ring-stone-900"
                        : "border-stone-200/80 bg-white hover:border-stone-300"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-stone-900">
                          {addr.street}
                        </p>
                        <p className="text-xs text-stone-500">
                          {addr.city}, {addr.state} {addr.postalCode}
                        </p>
                        <p className="text-xs text-stone-400">{addr.country}</p>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="h-5 w-5 text-stone-900" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border border-stone-300" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Address Form */}
          {showAddForm && (
            <form
              onSubmit={handleAddNewAddress}
              className="space-y-4 rounded-lg border border-stone-200/80 bg-white p-5 shadow-sm"
            >
              <h3 className="text-sm font-semibold text-stone-900">
                New Shipping Address
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="street">Street Address</Label>
                <Input
                  id="street"
                  required
                  placeholder="124 Oxford Lane, Suite 4B"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    required
                    placeholder="Mumbai"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    required
                    placeholder="Maharashtra"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input
                    id="postalCode"
                    required
                    placeholder="400001"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                {addresses.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowAddForm(false)}
                    disabled={isAddingAddress}
                  >
                    Cancel
                  </Button>
                )}
                <Button type="submit" disabled={isAddingAddress}>
                  {isAddingAddress ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save Address"
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="flex items-center space-x-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Right: Order Summary & 1-Click Checkout */}
      <div className="space-y-6 lg:col-span-5">
        <div className="rounded-lg border border-stone-200/80 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold tracking-tight text-stone-900">
            Order Review
          </h2>

          <div className="mt-4 divide-y divide-stone-100 border-y border-stone-100">
            {cartItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-3 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-stone-900">
                    {item.product.title}
                  </span>
                  <span className="font-mono text-xs text-stone-400">
                    Qty: {item.quantity} · {item.product.sku}
                  </span>
                </div>
                <span className="font-mono tabular-nums text-stone-900">
                  {formatPrice(item.product.priceCents * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between text-stone-500">
              <dt>Subtotal</dt>
              <dd className="font-mono tabular-nums text-stone-900">
                {formatPrice(subtotalCents)}
              </dd>
            </div>
            <div className="flex justify-between text-stone-500">
              <dt>Standard Shipping</dt>
              <dd className="font-mono text-emerald-700 font-medium">Free</dd>
            </div>
            <div className="flex justify-between border-t border-stone-200/80 pt-3 text-base font-semibold text-stone-900">
              <dt>Total Due</dt>
              <dd className="font-mono tabular-nums">
                {formatPrice(subtotalCents)}
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <button
              onClick={handlePlaceOrder}
              disabled={isPending || addresses.length === 0}
              className="flex w-full items-center justify-center space-x-2 rounded-md bg-stone-900 py-3.5 text-sm font-medium tracking-wide text-white transition-colors hover:bg-stone-800 disabled:opacity-50 uppercase"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing Atomic Order…</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  <span>Place Order (1-Click Instant)</span>
                </>
              )}
            </button>
          </div>

          <p className="mt-3 text-center text-xs text-stone-400">
            Stock is atomically verified and locked upon placement.
          </p>
        </div>
      </div>
    </div>
  );
}
