"use client";
import { useState } from "react";
export function McpConfirmationCard({ id, preview, initialStatus = "pending" }: { id: string; preview: Record<string, unknown>; initialStatus?: string }) {
  const [status, setStatus] = useState(initialStatus);
  async function submit(confirm: boolean) {
    setStatus("working");
    try {
      const response = await fetch("/api/chat/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, confirm }), cache: "no-store" });
      const result = await response.json();
      setStatus(response.ok ? result.status : "failed");
    } catch { setStatus("failed"); }
  }
  return <section aria-label="Confirm proposed change"><h3>{preview.operation === "cancel" ? "Cancel order" : preview.operation === "delete" ? "Delete address" : "Add address"}</h3>
    <dl>{Object.entries(preview).filter(([key]) => key !== "operation").map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "object" && value !== null ? Object.entries(value).filter(([k]) => k !== "id").map(([k,v]) => `${k}: ${String(v)}`).join(", ") : String(value)}</dd></div>)}</dl>
    <p role="status">{status === "expired" ? "This proposal expired. Request a new proposal." : status === "executed" ? "Change completed." : status === "rejected" ? "Proposal rejected. No change executed." : status}</p><button disabled={!["pending", "failed"].includes(status)} onClick={() => submit(true)}>Confirm</button>
    <button disabled={status !== "pending"} onClick={() => submit(false)}>Reject</button></section>;
}
