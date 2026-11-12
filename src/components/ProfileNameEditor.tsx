"use client";

import React, { useState, useTransition } from "react";
import { updateProfileName } from "@/app/actions/user.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, User, Edit2 } from "lucide-react";

interface ProfileNameEditorProps {
  initialName: string;
  email: string;
}

export function ProfileNameEditor({
  initialName,
  email,
}: ProfileNameEditorProps) {
  const [isEditing, setIsEditing] = useState(!initialName);
  const [name, setName] = useState(initialName || "");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setMessage(null);
    setIsError(false);

    startTransition(async () => {
      const res = await updateProfileName(name);
      if (res.success) {
        setIsEditing(false);
        setMessage("Name updated successfully");
        setTimeout(() => setMessage(null), 3000);
      } else {
        setIsError(true);
        setMessage(res.message ?? "Failed to update profile name");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-stone-100 pb-3">
        <div className="space-y-0.5">
          <Label className="text-xs uppercase tracking-wider text-stone-400 font-medium">
            Full Name
          </Label>
          {!isEditing ? (
            <p className="text-base font-semibold text-stone-900">
              {name || "Not provided"}
            </p>
          ) : null}
        </div>

        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center space-x-1 text-xs text-stone-500 hover:text-stone-900 transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Edit</span>
          </button>
        )}
      </div>

      {isEditing && (
        <form onSubmit={handleSave} className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Input
              id="name"
              placeholder="e.g. Neelansh Parashar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="text-sm"
              autoFocus
            />
          </div>

          <div className="flex items-center space-x-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                "Save Name"
              )}
            </Button>
            {initialName && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setName(initialName);
                  setIsEditing(false);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}

      {message && (
        <p
          className={`text-xs font-medium ${
            isError ? "text-red-600" : "text-emerald-700"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
