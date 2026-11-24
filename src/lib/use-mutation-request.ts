"use client";

import { useRef } from "react";

// Reuse a request ID after a lost response; a completed new intent gets a new ID.
// This ID is only a retry key, never an authorization capability.
export function useMutationRequest() {
  const pending = useRef(new Map<string, { args: string; id: string }>());
  return {
    requestId(operation: string, args: readonly unknown[]) {
      const serialized = JSON.stringify(args);
      const prior = pending.current.get(operation);
      if (prior?.args === serialized) return prior.id;
      const id = crypto.randomUUID();
      pending.current.set(operation, { args: serialized, id });
      return id;
    },
    complete(operation: string) { pending.current.delete(operation); },
  };
}
