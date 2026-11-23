"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { McpConfirmationCard } from "./McpConfirmationCard";
import { ChatResult } from "./ChatResult";
import { ArrowUpRight, ArrowUp, Sparkles, ShieldCheck, KeyRound, LockKeyhole, ShoppingBag, Compass, Package, LogIn, CircleCheck, Square, RefreshCw, Plus, X } from "lucide-react";
import styles from "./StoreChat.module.css";

type Message = { role: "user" | "assistant"; content: string; results?: { tool: string; data: unknown }[] };
type Action = { id: string; preview: Record<string, unknown>; status: string };
type PrivateTool = "profile_read" | "addresses_read" | "orders_read" | "addresses_write" | "orders_write";
const toolLabels: Record<string, string> = { catalog_read: "Finding your next favourite", cart_read: "Taking a look at your cart", cart_write: "Updating your selection", profile_read: "Opening your profile", addresses_read: "Opening saved addresses", addresses_write: "Preparing a private address form", orders_read: "Finding your orders", orders_write: "Preparing a cancellation request" };

export function StoreChat({ userId, stagingKeyAvailable }: { userId: string | null; stagingKeyAvailable: boolean }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [keyOpen, setKeyOpen] = useState(!stagingKeyAvailable);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [signedIn, setSignedIn] = useState(Boolean(userId));
  const [privateTool, setPrivateTool] = useState<PrivateTool>("profile_read");
  const [operation, setOperation] = useState("add");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [privateResult, setPrivateResult] = useState<unknown>();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const workspace = useRef<HTMLElement>(null);
  useEffect(() => { if (workspaceOpen) workspace.current?.scrollIntoView({ block: "nearest" }); }, [workspaceOpen, privateTool]);
  const [actions, setActions] = useState<Action[]>([]);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const identity = useRef(userId);
  const transcript = useRef<HTMLDivElement>(null);
  const approvalDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = approvalDialog.current;
    if (actions.length && dialog && !dialog.open) dialog.showModal();
    if (!actions.length && dialog?.open) dialog.close();
  }, [actions]);

  useEffect(() => {
    const node = transcript.current;
    if (node && node.scrollHeight - node.scrollTop - node.clientHeight < 180) node.scrollTop = node.scrollHeight;
  }, [messages]);

  function endSession() {
    generation.current++; active.current?.abort(); active.current = null;
    setKey(""); setMessages([]); setText(""); setPrivateResult(undefined); setActions([]); setFields({}); setBusy(false); setStatus("");
    setKeyOpen(true); setWorkspaceOpen(false);
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
    if (!key && !stagingKeyAvailable) { setKeyOpen(true); setStatus("Add your session key above to start chatting."); return; }
    if (key && text.includes(key)) { setText(""); setStatus("Enter your key only in the key field, not in chat."); return; }
    const current = generation.current;
    const history = [...messages, { role: "user" as const, content: text.trim() }].filter((message) => message.content.trim()).slice(-18).map((message) => ({ role: message.role, content: message.content.slice(0, 2000) }));
    setMessages([...messages, { role: "user", content: text.trim() }, { role: "assistant", content: "" }].slice(-20) as Message[]); setText(""); setBusy(true); setStatus("Getting ready to help…");
    const controller = new AbortController(); active.current = controller;
    let complete = false;
    let refreshCart = false;
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
            if (item.type === "activity") {
              setStatus(`${toolLabels[item.tool] || "Working on your request"}…`);
              if (item.tool === "cart_write" || item.tool === "cart_read") refreshCart = true;
            }
            if (item.type === "cart_changed") {
              setMessages(previous => previous.map(message => ({
                ...message,
                results: message.results?.filter(result => result.tool !== "cart_read"),
              })));
            }
            if (item.type === "result") {
              setMessages(previous => previous.map((message, index) => {
                if (index !== previous.length - 1) return message;
                const results = (message.results ?? []).filter(result => item.tool !== "cart_read" || result.tool !== "cart_read");
                return { ...message, results: [...results, { tool: item.tool, data: item.data }] };
              }));
            }
            if (item.type === "private") { setWorkspaceOpen(true); setPrivateTool(item.tool); setPrivateResult(item.data); if (item.operation) { setOperation(item.operation); setFields({}); } setStatus("Use the private form in this conversation."); }
            if (item.type === "error") throw new Error(item.message);
            if (item.type === "done") complete = true;
          }
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (!complete && generation.current === current) setStatus("The request ended early. Check your cart before requesting a change again.");
      else if (generation.current === current) setStatus("Ready");
    } catch (error) {
      if (generation.current === current) setStatus(controller.signal.aborted ? "Stopped. A requested change may have completed; check your cart." : error instanceof Error ? error.message : "I'm unable to help right now.");
    } finally { if (generation.current === current) { setBusy(false); active.current = null; if (refreshCart) router.refresh(); } }
  }

  async function privateRequest(confirmations = false) {
    if (busy) return;
    const current = generation.current;
    const controller = new AbortController(); active.current = controller; setBusy(true);
    try {
      let args: Record<string, unknown> = {};
      if (privateTool === "orders_read") args = { operation: fields.orderId ? "details" : "list", ...(fields.orderId ? { orderId: fields.orderId } : { limit: 10, offset: 0 }) };
      if (privateTool === "orders_write") args = { operation: "cancel", orderId: fields.orderId, reason: fields.reason };
      if (privateTool === "addresses_write") args = operation === "delete" ? { operation, addressId: fields.addressId } : { operation, ...(operation === "edit" ? { addressId: fields.addressId } : {}), street: fields.street, city: fields.city, state: fields.state, postalCode: fields.postalCode, country: fields.country || "India", isDefault: fields.isDefault === "true" };
      const response = await fetch(confirmations ? "/api/chat/confirm" : "/api/chat/tools", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, cache: "no-store",
        body: JSON.stringify(confirmations ? { operation: "list" } : { operation: "call", tool: privateTool, arguments: args }),
      });
      const result = await response.json();
      if (generation.current !== current) return;
      if (!response.ok) { setStatus(response.status === 401 ? "Please sign in for private actions." : "Private action unavailable. Please try again later."); return; }
      if (confirmations) {
        setActions((result.actions ?? []).filter((action: Action) => action.status === "pending"));
        setStatus(result.actions?.some((action: Action) => action.status === "pending") ? "Review your proposed changes." : "No changes are awaiting approval.");
      } else {
        setPrivateResult(result.uiResult ?? result);
        setStatus(result.uiResult?.isError ? "That action couldn’t be completed. Check the details and try again." : "Your private workspace is up to date.");
        if (privateTool.endsWith("_write") && !result.uiResult?.isError) {
          const pending = await fetch("/api/chat/confirm", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ operation: "list" }), signal: controller.signal, cache: "no-store",
          });
          if (!pending.ok) throw new Error("Approval unavailable");
          const proposals = await pending.json();
          if (generation.current === current) setActions((proposals.actions ?? []).filter((action: Action) => action.status === "pending"));
        }
      }
    } catch { if (generation.current === current) setStatus("Private action unavailable. Review its current state before retrying."); }
    finally { if (generation.current === current) { setBusy(false); active.current = null; } }
  }

  const names = privateTool === "addresses_write" ? operation === "delete" ? [] : ["street", "city", "state", "postalCode", "country"]
    : privateTool === "orders_write" ? ["orderId", "reason"] : privateTool === "orders_read" ? ["orderId"] : [];

  const section = privateTool.startsWith("addresses") ? "addresses" : privateTool.startsWith("orders") ? "orders" : "profile";
  const connected = Boolean(key || stagingKeyAvailable);
  const labels: Record<string, string> = { addressId: "Address reference", street: "Street address", city: "City", state: "State / region", postalCode: "Postal code", country: "Country", orderId: "Order reference", reason: "Reason for cancellation" };
  function chooseAction(tool: string, id: string, saved?: Record<string, unknown>) {
    if (tool === "addresses_edit" && saved) {
      setPrivateTool("addresses_write"); setOperation("edit");
      setFields({ addressId: id, ...Object.fromEntries(["street", "city", "state", "postalCode", "country"].map(key => [key, typeof saved[key] === "string" ? saved[key] : ""])), isDefault: String(saved.isDefault === true) });
      setPrivateResult(undefined); return;
    }
    setPrivateTool(tool as PrivateTool); setFields(tool === "addresses_write" ? { addressId: id } : { orderId: id });
    setOperation("delete"); setPrivateResult(undefined);
  }
  function chooseSection(name: string) {
    setPrivateTool((name === "addresses" ? "addresses_read" : name === "orders" ? "orders_read" : "profile_read"));
    setFields({}); setPrivateResult(undefined);
  }

  return <div className={styles.page}>
    <dialog ref={approvalDialog} className={styles.approvalDialog} aria-labelledby="approval-title" onCancel={() => setActions([])}>
      <div className={styles.panelTitle}><h2 id="approval-title">Review your changes</h2><button type="button" className={styles.textButton} aria-label="Close approval popup" onClick={() => setActions([])}><X size={18} /></button></div>
      {actions.map(action => <McpConfirmationCard key={action.id} id={action.id} preview={action.preview} initialStatus={action.status} onDecision={() => { setActions(previous => previous.filter(saved => saved.id !== action.id)); setWorkspaceOpen(false); setPrivateResult(undefined); setFields({}); router.refresh(); }} />)}
    </dialog>
    <header className={styles.topline}>
      <div className={styles.brandline}><div className={styles.brandMark}><Sparkles size={20} strokeWidth={1.4} /></div><div><p className={styles.eyebrow}>ThreadCore / Personal assistant</p><p className={styles.subheading}>A little guidance. A better find.</p></div></div>
      <div className={styles.topActions}><span className={styles.pill}><span className={styles.dot} />{signedIn ? "Member session" : "Guest session"}</span><button className={styles.textButton} onClick={endSession}><X size={13} />End session</button></div>
    </header>
    <div className={styles.layout}>
      <section className={styles.conversation} aria-label="Shopping chat">
        <div className={styles.conversationHead}><strong>Your shopping companion</strong><span className={styles.liveLabel}><span className={styles.dot} />{connected ? "Ready when you are" : "Set up your session"}</span></div>
        <details className={styles.session} open={keyOpen} onToggle={(event) => setKeyOpen(event.currentTarget.open)}>
          <summary><KeyRound size={13} />{key ? "Session key added" : stagingKeyAvailable ? "Using staging test access" : "Connect your OpenAI key"}<span>{connected ? "Manage access" : "Session only"} <ArrowUpRight size={11} className="inline" /></span></summary>
          <div className={styles.keyArea}><label className={styles.fieldLabel} htmlFor="chat-session-key">OpenAI API key</label><input id="chat-session-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(event) => setKey(event.target.value)} className={styles.input} placeholder={stagingKeyAvailable ? "Optional — staging test access is available" : "Paste your key to start chatting"} disabled={busy} /><p className={styles.keyHelp}>Your key is held in memory for this session and sent through our backend to OpenAI. Provider charges and data policies apply. End this session or refresh to clear it.</p></div>
        </details>
        <div ref={transcript} className={styles.transcript} role="log" aria-live="polite" aria-label="Conversation">
          {!messages.length && <div className={styles.empty}>
            <div className={styles.orbit}><Sparkles size={31} strokeWidth={1.2} /></div>
            <h1 className={styles.heroTitle}>Your next<br /><em>favourite find.</em></h1><p className={styles.heroCopy}>Thoughtfully chosen essentials, with a little help finding what feels like you.</p>
            <div className={styles.suggestions}>
              {[{ icon: Compass, label: "Explore the collection", prompt: "Show me five products in stock." }, { icon: ShoppingBag, label: "Review my selection", prompt: "What is in my cart?" }, { icon: Package, label: "Find my orders", prompt: "Show my orders in the private panel." }].map(({ icon: Icon, label, prompt }) => <button key={label} className={styles.suggestion} onClick={() => setText(prompt)}><Icon size={16} strokeWidth={1.3} /><span>{label}</span></button>)}
            </div>
          </div>}
          {messages.map((message, index) => <article key={index} className={styles.message + (message.role === "user" ? " " + styles.userMessage : "")}>
            <div className={styles.messageTitle}>{message.role === "assistant" && <span className={styles.assistantAvatar}><Sparkles size={13} /></span>}{message.role === "user" ? "You" : "ThreadCore"}</div>
            {message.content ? <p className={styles.messageText}>{message.content}</p> : busy && index === messages.length - 1 ? <div className={styles.typing} aria-label="Assistant is working"><span /><span /><span /></div> : <p className={styles.resultNote}>This reply ended before any text was received.</p>}
            {message.results?.map((result, resultIndex) => <ChatResult key={resultIndex} tool={result.tool} data={result.data} />)}
          </article>)}
        <section ref={workspace} className={styles.privatePanel}>
          <details open={workspaceOpen} onToggle={event => setWorkspaceOpen(event.currentTarget.open)}><summary className={styles.fieldLabel}>Private account actions</summary>
          <div className={styles.panelTitle}><h2>Your workspace</h2><LockKeyhole size={15} strokeWidth={1.4} /></div><p className={styles.panelCopy}>Personal details belong here. Your profile, addresses and orders stay out of the model’s context.</p>
          <div className={styles.tabs} role="group" aria-label="Account sections">{["profile", "addresses", "orders"].map((name) => <button key={name} className={styles.tab + (section === name ? " " + styles.activeTab : "")} disabled={busy} onClick={() => chooseSection(name)}>{name[0].toUpperCase() + name.slice(1)}</button>)}</div>
          {!signedIn ? <div className={styles.signIn}><LockKeyhole size={23} strokeWidth={1.2} /><h3>A space just for you</h3><p>Sign in to see your account, manage saved addresses and review your orders.</p><Link href="/login">Sign in to continue <LogIn size={13} /></Link></div> : <>
            <div className={styles.buttonRow}>{section === "addresses" && <button className={styles.secondary} disabled={busy} onClick={() => { setPrivateTool("addresses_write"); setOperation("add"); setFields({}); setPrivateResult(undefined); }}><Plus size={13} />Add address</button>}{section === "orders" && <button className={styles.secondary} disabled={busy} onClick={() => { setPrivateTool("orders_write"); setFields({}); setPrivateResult(undefined); }}>Cancel an order</button>}</div>
            <div className={styles.form}>
              {privateTool === "addresses_write" && <><label className={styles.fieldLabel} htmlFor="address-operation">What would you like to do?</label><select id="address-operation" className={styles.input} disabled={busy} value={operation} onChange={(event) => { setOperation(event.target.value); if (event.target.value !== "add") { setPrivateTool("addresses_read"); setPrivateResult(undefined); setFields({}); } }}><option value="add">Add a new address</option><option value="edit">Edit a saved address</option><option value="delete">Remove a saved address</option></select></>}
              {names.map((name) => <label key={name}><span className={styles.fieldLabel}>{labels[name]}{name === "orderId" && privateTool === "orders_read" ? " (optional)" : ""}</span><input className={styles.input} autoComplete="off" value={fields[name] || ""} maxLength={name === "reason" ? 500 : 300} disabled={busy} placeholder={name === "orderId" && privateTool === "orders_read" ? "Leave blank to see recent orders" : name === "country" ? "India" : ""} onChange={(event) => setFields({ ...fields, [name]: event.target.value })} /></label>)}
              {privateTool === "addresses_write" && operation !== "delete" && <label><input type="checkbox" checked={fields.isDefault === "true"} disabled={busy} onChange={event => setFields({ ...fields, isDefault: String(event.target.checked) })} /> Use as default address</label>}
              <button className={styles.primary} disabled={busy || (privateTool === "addresses_write" && operation !== "add" && !fields.addressId)} onClick={() => privateRequest()}>{privateTool.endsWith("_write") ? "Prepare for review" : section === "profile" ? "View my profile" : section === "addresses" ? "View saved addresses" : "View my orders"}<ArrowUpRight size={13} /></button>
            </div>
            {privateResult !== undefined && <div className={styles.privateResult}><ChatResult tool={privateTool} data={privateResult} onAction={chooseAction} /></div>}
            <button className={styles.textButton} disabled={busy} onClick={() => privateRequest(true)}><RefreshCw size={11} />Review pending changes</button>
          </>}
          </details>
        </section>
        </div>
        <div className={styles.composerArea}>
          {status && <p role="status" className={styles.status}>{status}</p>}
          <form onSubmit={send} className={styles.composer}><textarea aria-label="Message" rows={1} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} placeholder={connected ? "Find something you’ll love…" : "Add your session key above to get started…"} disabled={busy} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />{busy ? <button type="button" aria-label="Stop response" className={styles.send} onClick={() => active.current?.abort()}><Square size={12} fill="currentColor" /></button> : <button type="submit" aria-label="Send message" className={styles.send} disabled={!connected || !text.trim()}><ArrowUp size={18} /></button>}</form>
          <div className={styles.composerFoot}><span className={styles.footNote}><LockKeyhole size={10} />Session only. Nothing saved by ThreadCore.</span><span>Chat text, products & cart go to OpenAI.<br />Keep personal details in your private workspace.</span></div>
        </div>
      </section>
      <aside className={styles.sidebar} aria-label="Private account actions">

        <section className={styles.privacyCard}><ShieldCheck size={22} strokeWidth={1.2} /><h3>Designed around your privacy.</h3><p>You’re in control. Your key stays in this session, and sensitive changes always wait for your approval.</p><span><CircleCheck size={11} />No saved keys or chat history</span></section>
        <div className={styles.sidebarFooter}><span>Curated by ThreadCore.</span><Link href="/checkout">Go to checkout <ArrowUpRight size={11} /></Link></div>
      </aside>
    </div>
  </div>;
}
