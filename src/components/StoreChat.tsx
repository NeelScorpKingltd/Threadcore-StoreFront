"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { McpConfirmationCard } from "./McpConfirmationCard";

type Message = { role: "user" | "assistant"; content: string };
type Action = { id: string; preview: Record<string, unknown>; status: string };
type PrivateTool = "profile_read" | "addresses_read" | "orders_read" | "addresses_write" | "orders_write";
const inputClass = "w-full rounded-md border border-stone-300 bg-white p-2 text-sm";
const buttonClass = "rounded-md bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-40";

export function StoreChat({ userId, stagingKeyAvailable }: { userId: string | null; stagingKeyAvailable: boolean }) {
  const [key, setKey] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [signedIn, setSignedIn] = useState(Boolean(userId));
  const [privateTool, setPrivateTool] = useState<PrivateTool>("profile_read");
  const [operation, setOperation] = useState("add");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [privateResult, setPrivateResult] = useState<unknown>();
  const [actions, setActions] = useState<Action[]>([]);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const identity = useRef(userId);

  function endSession() {
    generation.current++; active.current?.abort(); active.current = null;
    setKey(""); setMessages([]); setText(""); setPrivateResult(undefined); setActions([]); setFields({}); setBusy(false); setStatus("");
  }
  useEffect(() => {
    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (identity.current !== next) { endSession(); identity.current = next; }
      setSignedIn(Boolean(next));
    });
    window.addEventListener("pagehide", endSession);
    return () => { subscription.unsubscribe(); window.removeEventListener("pagehide", endSession); active.current?.abort(); };
  }, []);

  async function send(event: React.FormEvent) {
    event.preventDefault(); if (busy || !text.trim()) return;
    if (key && text.includes(key)) { setText(""); setStatus("Enter your key only in the key field, not in chat."); return; }
    const current = generation.current;
    const history: Message[] = [...messages, { role: "user" as const, content: text.trim() }].filter((message) => message.content.trim()).slice(-18).map((message) => ({ ...message, content: message.content.slice(0, 2000) }));
    setMessages([...history, { role: "assistant", content: "" }]); setText(""); setBusy(true); setStatus("Connecting…");
    const controller = new AbortController(); active.current = controller;
    let complete = false;
    try {
      const response = await fetch("/api/chat/message", {
        method: "POST", headers: { "content-type": "application/json", ...(key ? { "x-openai-key": key } : {}) },
        body: JSON.stringify({ turnId: crypto.randomUUID(), messages: history }), signal: controller.signal, cache: "no-store",
      });
      if (!response.ok || !response.body) throw new Error("Chat unavailable. Check your key and try again later.");
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          buffer += decoder.decode(part.value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
            if (!line || generation.current !== current) continue;
            const item = JSON.parse(line);
            if (item.type === "text") setMessages((previous) => previous.map((message, index) => index === previous.length - 1 ? { ...message, content: message.content + item.text } : message));
            if (item.type === "activity") setStatus(`Using ${item.tool}…`);
            if (item.type === "private") { setPrivateTool(item.tool); setPrivateResult(item.data); setStatus("See the private action panel."); }
            if (item.type === "error") throw new Error(item.message);
            if (item.type === "done") complete = true;
          }
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (!complete && generation.current === current) setStatus("The request ended early. Check your cart before requesting a change again.");
      else if (generation.current === current) setStatus("Ready");
    } catch (error) {
      if (generation.current === current) setStatus(controller.signal.aborted ? "Stopped. A requested change may have completed; check your cart." : error instanceof Error ? error.message : "I'm unable to help right now.");
    } finally { if (generation.current === current) { setBusy(false); active.current = null; } }
  }

  async function privateRequest(confirmations = false) {
    if (busy) return;
    const current = generation.current;
    const controller = new AbortController(); active.current = controller; setBusy(true);
    try {
      let args: Record<string, unknown> = {};
      if (privateTool === "orders_read") args = { operation: fields.orderId ? "details" : "list", ...(fields.orderId ? { orderId: fields.orderId } : { limit: 10, offset: 0 }) };
      if (privateTool === "orders_write") args = { operation: "cancel", orderId: fields.orderId, reason: fields.reason };
      if (privateTool === "addresses_write") args = operation === "delete" ? { operation, addressId: fields.addressId } : { operation: "add", street: fields.street, city: fields.city, state: fields.state, postalCode: fields.postalCode, country: fields.country || "India", isDefault: false };
      const response = await fetch(confirmations ? "/api/chat/confirm" : "/api/chat/tools", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, cache: "no-store",
        body: JSON.stringify(confirmations ? { operation: "list" } : { operation: "call", tool: privateTool, arguments: args }),
      });
      const result = await response.json();
      if (generation.current !== current) return;
      if (!response.ok) { setStatus(response.status === 401 ? "Please sign in for private actions." : "Private action unavailable. Please try again later."); return; }
      if (confirmations) setActions(result.actions ?? []);
      else { setPrivateResult(result.uiResult?.structuredContent?.data ?? result.uiResult ?? result); setStatus("Private result updated. For proposals, load confirmations next."); }
    } catch { if (generation.current === current) setStatus("Private action unavailable. Review its current state before retrying."); }
    finally { if (generation.current === current) { setBusy(false); active.current = null; } }
  }

  const names = privateTool === "addresses_write" ? operation === "delete" ? ["addressId"] : ["street", "city", "state", "postalCode", "country"]
    : privateTool === "orders_write" ? ["orderId", "reason"] : privateTool === "orders_read" ? ["orderId"] : [];

  return <div className="mx-auto max-w-6xl px-4 py-8">
    <div className="mb-6 flex justify-between gap-4"><div><h1 className="text-2xl font-semibold">ThreadCore assistant</h1><p className="mt-1 text-sm text-stone-600">Browse products, manage your cart, and use private account actions.</p></div><button onClick={endSession} className="text-sm underline">End session</button></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4" aria-label="Shopping chat">
        <label className="block text-sm">Your OpenAI API key<input aria-label="OpenAI API key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(event) => setKey(event.target.value)} className={`${inputClass} mt-1`} placeholder={stagingKeyAvailable ? "Optional: staging test key is configured" : "Enter your session key"} disabled={busy} /></label>
        <p className="text-xs leading-relaxed text-stone-500">Your key stays in memory for this session and is sent over HTTPS through our backend to OpenAI. Provider charges and data policies apply. Chat messages, products and cart results go to OpenAI; use the private panel for profile, address and order details. We do not save keys or conversations.</p>
        <div className="max-h-[28rem] min-h-64 space-y-3 overflow-auto rounded-lg bg-stone-50 p-3" aria-live="polite">
          {!messages.length && <p className="text-sm text-stone-500">Try “Show me five products in stock” or “What is in my cart?”</p>}
          {messages.map((message, index) => <div key={index} className={`rounded-lg p-3 text-sm whitespace-pre-wrap break-words ${message.role === "user" ? "ml-6 bg-stone-900 text-white" : "mr-6 border border-stone-200 bg-white"}`}><span className="mb-1 block text-xs font-medium opacity-60">{message.role === "user" ? "You" : "Assistant"}</span>{message.content || "Working…"}</div>)}
        </div>
        <form onSubmit={send} className="flex gap-2"><input aria-label="Message" maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} className={inputClass} placeholder="Ask about the store…" disabled={busy} /><button className={buttonClass} disabled={busy || (!key && !stagingKeyAvailable) || !text.trim()}>Send</button></form>
        {busy && <button onClick={() => active.current?.abort()} className="text-sm underline">Stop</button>}
        <p role="status" className="text-sm text-stone-600">{status}</p>
        <div className="flex gap-4 text-sm underline"><Link href="/checkout">Go to checkout</Link>{!signedIn && <Link href="/login">Sign in for private actions</Link>}</div>
      </section>
      <aside className="space-y-4 rounded-xl border border-stone-200 bg-white p-4" aria-label="Private account actions">
        <h2 className="font-semibold">Private account actions</h2><p className="text-xs text-stone-500">Details here are sent to your account tools, never to the model. Changes require your confirmation.</p>
        {!signedIn && <Link href="/login" className="block text-sm underline">Sign in to continue</Link>}
        <select aria-label="Private action" className={inputClass} value={privateTool} disabled={busy || !signedIn} onChange={(event) => { setPrivateTool(event.target.value as PrivateTool); setFields({}); setPrivateResult(undefined); }}>
          <option value="profile_read">View profile</option><option value="addresses_read">View addresses</option><option value="addresses_write">Add / delete address</option><option value="orders_read">View orders</option><option value="orders_write">Propose cancellation</option>
        </select>
        {privateTool === "addresses_write" && <select aria-label="Address operation" className={inputClass} disabled={busy} value={operation} onChange={(event) => setOperation(event.target.value)}><option value="add">Add address</option><option value="delete">Delete address</option></select>}
        {names.map((name) => <label key={name} className="block text-xs">{name}{name === "orderId" && privateTool === "orders_read" ? " (optional; leave empty to list)" : ""}<input className={`${inputClass} mt-1`} autoComplete="off" value={fields[name] || ""} maxLength={name === "reason" ? 500 : 300} disabled={busy || !signedIn} onChange={(event) => setFields({ ...fields, [name]: event.target.value })} /></label>)}
        <button className={buttonClass} disabled={busy || !signedIn} onClick={() => privateRequest()}>Run private action</button>
        {privateResult !== undefined && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-stone-50 p-3 text-xs">{JSON.stringify(privateResult, null, 2)}</pre>}
        <button disabled={busy || !signedIn} onClick={() => privateRequest(true)} className="block text-sm underline disabled:opacity-40">Load confirmations</button>
        {actions.map((action) => <div className="rounded border border-stone-200 p-3 text-sm" key={`${action.id}:${action.status}`}><McpConfirmationCard id={action.id} preview={action.preview} initialStatus={action.status} /></div>)}
      </aside>
    </div>
  </div>;
}
