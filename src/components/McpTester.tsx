"use client";

import { useState } from "react";
import { McpConfirmationCard } from "@/components/McpConfirmationCard";

type Tool = { name: string; description?: string; inputSchema?: unknown };
type Message = { id: number; role: "system" | "user" | "assistant"; text: string };
type Pending = { id: string; preview: Record<string, unknown>; status: string; expires_at: string };

const initialMessage: Message = {
  id: 0,
  role: "system",
  text: "MCP test console ready. There is no AI model connected: choose a tool and send its JSON arguments to exercise the authenticated MCP path.",
};

export function McpTester() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [toolName, setToolName] = useState("");
  const [argumentsText, setArgumentsText] = useState("{}");
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Not connected");

  function append(role: Message["role"], text: string) {
    setMessages((current) => [...current, { id: Date.now() + Math.random(), role, text }]);
  }

  async function readJson(response: Response): Promise<Record<string, unknown>> {
    try { return await response.json() as Record<string, unknown>; }
    catch { return { error: { code: "INVALID_SERVER_RESPONSE" } }; }
  }

  async function discoverTools() {
    setBusy(true);
    setStatus("Connecting…");
    try {
      const response = await fetch("/api/chat/tools", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "list" }), cache: "no-store",
      });
      const result = await readJson(response);
      const found = Array.isArray(result.tools) ? result.tools as Tool[] : [];
      if (!response.ok || found.length === 0) {
        const message = JSON.stringify(result, null, 2);
        setStatus(`Connection failed (HTTP ${response.status})`);
        append("assistant", message);
        return;
      }
      setTools(found);
      setToolName((current) => found.some((tool) => tool.name === current) ? current : found[0].name);
      setStatus(`Connected · ${found.length} tools discovered`);
      append("assistant", `Connected to ThreadCore MCP. Discovered ${found.length} tools: ${found.map((tool) => tool.name).join(", ")}.`);
    } catch {
      setStatus("Connection failed");
      append("assistant", "The request could not reach the chat adapter. Check the Preview function logs for /api/chat/tools.");
    } finally { setBusy(false); }
  }

  async function callTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let args: unknown;
    try { args = JSON.parse(argumentsText); }
    catch { append("assistant", "Arguments must be valid JSON."); return; }
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      append("assistant", "Tool arguments must be a JSON object."); return;
    }
    setBusy(true);
    append("user", `${toolName} ${JSON.stringify(args)}`);
    try {
      const response = await fetch("/api/chat/tools", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "call", tool: toolName, arguments: args }), cache: "no-store",
      });
      const result = await readJson(response);
      append("assistant", JSON.stringify({ httpStatus: response.status, ...result }, null, 2));
      if (!response.ok) setStatus(`Request failed (HTTP ${response.status})`);
      else setStatus("Request completed");
    } catch {
      setStatus("Request failed");
      append("assistant", "The request could not reach the chat adapter. Check the Preview function logs for /api/chat/tools.");
    } finally { setBusy(false); }
  }

  async function loadPending() {
    setBusy(true);
    try {
      const response = await fetch("/api/chat/confirm", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "list" }), cache: "no-store",
      });
      const result = await readJson(response);
      if (!response.ok) {
        append("assistant", JSON.stringify({ httpStatus: response.status, ...result }, null, 2));
        return;
      }
      setPending(Array.isArray(result.actions) ? result.actions as Pending[] : []);
    } catch {
      append("assistant", "Could not load confirmations. Check the Preview function logs for /api/chat/confirm.");
    } finally { setBusy(false); }
  }

  function loadExample() {
    const examples: Record<string, unknown> = {
      catalog_read: { operation: "list", limit: 10, offset: 0 },
      cart_read: {},
      cart_write: { operation: "add", productId: "REPLACE_WITH_CATALOG_PRODUCT_UUID", quantity: 1, requestId: crypto.randomUUID() },
      profile_read: {},
      addresses_read: {},
      addresses_write: { operation: "add", street: "10 Sample Street", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India", isDefault: false },
      orders_read: { operation: "list", limit: 10, offset: 0 },
      orders_write: { operation: "cancel", orderId: "REPLACE_WITH_STAGING_ORDER_UUID", reason: "Staging MCP test" },
    };
    setArgumentsText(JSON.stringify(examples[toolName] ?? {}, null, 2));
  }

  const selectedTool = tools.find((tool) => tool.name === toolName);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Preview environment only</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">MCP test console</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">Exercise the real signed-in chat adapter and MCP endpoint using your staging account. This console sends explicit tool calls; it does not include an AI model.</p>
        </div>
        <span className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600" role="status">{status}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm" aria-label="MCP chat test">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Tool conversation</h2>
            <button type="button" onClick={discoverTools} disabled={busy} className="rounded-md bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50">
              {busy && tools.length === 0 ? "Connecting…" : "Connect / refresh tools"}
            </button>
          </div>

          <div className="max-h-[28rem] min-h-64 space-y-3 overflow-y-auto bg-[#FAF9F6] p-4" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`max-w-[95%] rounded-lg border px-3 py-2 ${message.role === "user" ? "ml-auto border-stone-800 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-800"}`}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-60">{message.role === "user" ? "You · tool call" : "MCP tester"}</p>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{message.text}</pre>
              </article>
            ))}
          </div>

          <form onSubmit={callTool} className="space-y-3 border-t border-stone-200 p-4">
            <label className="block text-xs font-medium text-stone-700" htmlFor="mcp-tool">Tool</label>
            <select id="mcp-tool" value={toolName} onChange={(event) => setToolName(event.target.value)} disabled={!tools.length || busy} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm disabled:bg-stone-100">
              {tools.length ? tools.map((tool) => <option key={tool.name} value={tool.name}>{tool.name}</option>) : <option value="">Connect to discover tools</option>}
            </select>
            {selectedTool?.description && <p className="text-xs leading-relaxed text-stone-500">{selectedTool.description}</p>}
            {selectedTool?.inputSchema != null && <details className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-stone-700">View argument schema</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-stone-600">{JSON.stringify(selectedTool.inputSchema, null, 2)}</pre>
            </details>}
            <label className="block text-xs font-medium text-stone-700" htmlFor="mcp-args">Arguments (JSON)</label>
            <textarea id="mcp-args" value={argumentsText} onChange={(event) => setArgumentsText(event.target.value)} rows={6} spellCheck={false} className="w-full rounded-md border border-stone-300 bg-white p-3 font-mono text-xs focus:border-stone-500 focus:outline-none" />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={loadExample} disabled={!toolName || busy} className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">Load example</button>
              <button type="submit" disabled={!toolName || busy} className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50">{busy ? "Sending…" : "Send tool call"}</button>
              <button type="button" onClick={loadPending} disabled={busy} className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">Load confirmations</button>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <h2 className="font-semibold">Staging safety</h2>
            <p className="mt-2 text-xs leading-relaxed">Use only synthetic staging data. Tool calls can change this staging account’s cart. Address and order changes require your separate confirmation below. Checkout and payment are not available through MCP.</p>
          </section>
          <section className="space-y-3" aria-label="Pending confirmations">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Pending confirmations</h2>
              <button type="button" onClick={loadPending} disabled={busy} className="text-xs underline underline-offset-2 disabled:opacity-50">Refresh</button>
            </div>
            {pending.length === 0 ? <p className="rounded-lg border border-dashed border-stone-300 p-4 text-xs text-stone-500">No proposals loaded. Create one with an address or order write tool, then refresh.</p> : pending.map((action) => (
              <div key={action.id}>
                <McpConfirmationCard id={action.id} preview={action.preview} initialStatus={action.status} />
                <p className="mt-1 text-[10px] text-stone-500">Expires {new Date(action.expires_at).toLocaleString()}</p>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
