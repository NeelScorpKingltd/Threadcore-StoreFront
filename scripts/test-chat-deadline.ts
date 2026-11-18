import assert from "node:assert/strict";
import { withMcpDeadline } from "../src/lib/chat/deadline";

async function main() {
  assert.equal(await withMcpDeadline(async () => "ok", 1000), "ok");
  const failure = new Error("operation failed");
  await assert.rejects(withMcpDeadline(async () => { throw failure; }), (error) => error === failure);
  let aborted = false;
  await assert.rejects(withMcpDeadline((signal) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true });
  }), 20), (error: unknown) => error instanceof Error && error.message === "MCP_TIMEOUT");
  assert.equal(aborted, true);
  console.log("PASS deadline success, original error, timeout and abort propagation");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
