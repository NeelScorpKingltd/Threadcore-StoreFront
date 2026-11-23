"use client";
import { useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { money } from "./ChatResult";
import styles from "./StoreChat.module.css";
export function McpConfirmationCard({ id, preview, initialStatus = "pending", onDecision }: { id: string; preview: Record<string, unknown>; initialStatus?: string; onDecision?: () => void }) {
  const [status, setStatus] = useState(initialStatus);
  async function submit(confirm: boolean) {
    setStatus("working");
    try {
      const response = await fetch("/api/chat/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, confirm }), cache: "no-store" });
      const result = await response.json();
      setStatus(response.ok ? result.status : "failed");
      if (response.ok && ["executed", "rejected", "expired"].includes(result.status)) onDecision?.();
    } catch { setStatus("failed"); }
  }
  const address = preview.address && typeof preview.address === "object" ? preview.address as Record<string, unknown> : preview;
  const addressText = ["street", "city", "state", "postalCode", "country"].map((key) => typeof address[key] === "string" ? address[key] : "").filter(Boolean).join(", ");
  const actionable = ["pending", "failed"].includes(status);
  return <section className={styles.confirmation} aria-label="Confirm proposed change">
    <div className={styles.confirmationTitle}><ShieldCheck size={15} /><span>{preview.operation === "cancel" ? "Cancel order" : preview.operation === "delete" ? "Remove address" : preview.operation === "edit" ? "Edit address" : "Add address"}</span></div>
    {preview.operation === "cancel" ? <dl className={styles.confirmationDetails}><div><dt>Order</dt><dd>{String(preview.orderNumber ?? "")}</dd></div><div><dt>Amount</dt><dd>{money(preview.totalAmountCents)}</dd></div><div><dt>Reason</dt><dd>{String(preview.reason ?? "")}</dd></div></dl> : <p className={styles.confirmationAddress}>{addressText}</p>}
    {preview.operation === "edit" && preview.before && typeof preview.before === "object" ? <p className={styles.resultNote}>Previous address: {["street", "city", "state", "postalCode", "country"].map(key => { const value = (preview.before as Record<string, unknown>)[key]; return typeof value === "string" ? value : ""; }).filter(Boolean).join(", ")}</p> : null}
    <p className={styles.confirmationStatus} role="status">{status === "pending" ? "Review carefully. This change needs your approval." : status === "working" ? "Saving your decision…" : status === "expired" ? "This proposal expired. Request a new one." : status === "executed" ? "Change completed." : status === "rejected" ? "Declined. Nothing was changed." : "We couldn’t save your decision. You can safely retry."}</p>
    {actionable && <div className={styles.confirmationButtons}><button className={preview.operation === "cancel" ? styles.cancelOrder : undefined} onClick={() => submit(true)}>{preview.operation === "cancel" ? <X size={12} /> : <Check size={12} />}{preview.operation === "cancel" ? "Cancel order" : "Accept"}</button><button onClick={() => submit(false)}><X size={12} />Decline</button></div>}
  </section>;
}
