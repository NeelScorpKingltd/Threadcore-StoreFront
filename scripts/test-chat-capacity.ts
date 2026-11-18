import assert from "node:assert/strict";
import { withChatCapacity } from "../src/lib/chat/concurrency";

async function main() {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const active = Array.from({ length: 8 }, () => withChatCapacity(() => waiting));
  await assert.rejects(withChatCapacity(async () => true), (error: unknown) =>
    error instanceof Error && error.message === "CAPACITY_UNAVAILABLE");
  release();
  await Promise.all(active);
  assert.equal(await withChatCapacity(async () => true), true);
  await assert.rejects(withChatCapacity(async () => { throw new Error("failed"); }));
  assert.equal(await withChatCapacity(async () => true), true);
  console.log("PASS capacity admission, release and error cleanup");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
