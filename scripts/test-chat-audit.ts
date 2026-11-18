import assert from "node:assert/strict";
import { auditRequest, auditStage, auditToolOutcome, auditConfirmation } from "../src/lib/chat/audit";

async function main() {
  const original = console.info;
  const events: string[] = [];
  try {
    console.info = (value: string) => { events.push(value); };
    const response = await auditRequest("tools", async () => {
      auditStage("tool");
      auditToolOutcome("cart_read", false);
      auditConfirmation(true, "executed");
      return Response.json({ privateData: "DO_NOT_LOG" });
    });
    const parsed = events.map((event) => JSON.parse(event));
    assert.equal(parsed.length, 3);
    for (const event of parsed) assert.equal(event.requestId, response.headers.get("x-threadcore-request-id"));
    assert.equal(parsed[2].stage, "tool");
    assert.equal(events.join("").includes("DO_NOT_LOG"), false);
    console.info = () => { throw new Error("logger down"); };
    assert.equal((await auditRequest("confirm", async () => Response.json({ status: "executed" }))).status, 200);
  } finally { console.info = original; }
  console.log("PASS audit correlation, payload exclusion and logging failure isolation");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
