"use client";

import { useMutationRequest } from "@/lib/use-mutation-request";

import React, { useState, useTransition } from "react";
import { addAddress, deleteAddress } from "@/app/actions/user.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, MapPin } from "lucide-react";

interface Address {
  id: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export function ProfileAddressManager({
  initialAddresses,
}: {
  initialAddresses: Address[];
}) {
  const mutation = useMutationRequest();
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses);
  const [showAddForm, setShowAddForm] = useState(false);
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("India");
  const [isDefault, setIsDefault] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await addAddress({
        street,
        city,
        state,
        postalCode,
        country,
        isDefault,
      }, mutation.requestId("address.add", [street, city, state, postalCode, country, isDefault]));

      if (res.success && res.address) {
        mutation.complete("address.add");
        setAddresses((prev) => [res.address!, ...prev]);
        setShowAddForm(false);
        setStreet("");
        setCity("");
        setState("");
        setPostalCode("");
        setIsDefault(false);
      } else {
        setError(res.message ?? "Could not save address");
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteAddress(id, mutation.requestId("address.delete", [id]));
      if (res.success) {
        mutation.complete("address.delete");
        setAddresses((prev) => prev.filter((a) => a.id !== id));
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-stone-900">
          Saved Delivery Addresses
        </h2>
        {!showAddForm && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm(true)}
            className="text-xs"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Address
          </Button>
        )}
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border border-stone-200/80 bg-white p-5 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-semibold text-stone-900">
            Add Shipping Destination
          </h3>

          <div className="space-y-1.5">
            <Label htmlFor="street">Street Address</Label>
            <Input
              id="street"
              required
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="e.g. 102 Bandra Kurla Complex"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Mumbai"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                required
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Maharashtra"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                required
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="400051"
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

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-stone-300 text-stone-900 focus:ring-stone-400"
            />
            <label htmlFor="isDefault" className="text-xs text-stone-600">
              Set as primary default address
            </label>
          </div>

          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

          <div className="flex items-center justify-end space-x-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save Destination"
              )}
            </Button>
          </div>
        </form>
      )}

      {/* Address List */}
      {addresses.length === 0 && !showAddForm ? (
        <div className="rounded-lg border border-dashed border-stone-200 p-8 text-center text-xs text-stone-400">
          No saved addresses. Add an address for 1-click checkout.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className="flex flex-col justify-between rounded-lg border border-stone-200/80 bg-white p-4 shadow-sm"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center space-x-1.5 text-xs font-semibold text-stone-900">
                    <MapPin className="h-3.5 w-3.5 text-stone-400" />
                    <span>{addr.street}</span>
                  </span>
                  {addr.isDefault && (
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500">
                  {addr.city}, {addr.state} {addr.postalCode}
                </p>
                <p className="text-xs text-stone-400">{addr.country}</p>
              </div>

              <div className="mt-4 flex justify-end border-t border-stone-100 pt-3">
                <button
                  onClick={() => handleDelete(addr.id)}
                  disabled={isPending}
                  className="flex items-center space-x-1 text-xs text-stone-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
