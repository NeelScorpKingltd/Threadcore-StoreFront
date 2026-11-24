import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

// Report rule/location only. Never echo matched strings, blobs or credentials.
const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=\r\n]{64,}/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["provider-secret", /\b(?:sb_secret_[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,})\b/],
  ["credentialed-database-url", /postgres(?:ql)?:\/\/[^\s:@]+:((?!your-password|password|REPLACE|<)[^\s@]{12,})@/],
];
function detect(text, secrets = []) {
  return [...rules.filter(([, pattern]) => pattern.test(text)).map(([name]) => name),
    ...(secrets.some((secret) => text.includes(secret)) ? ["configured-secret-value"] : [])];
}
if (process.argv.includes("--self-test")) {
  assert(detect("ghp_" + "a".repeat(36)).includes("github-token"));
  assert(detect("hello", ["hello"]).includes("configured-secret-value"));
  assert.deepEqual(detect("postgresql://postgres:your-password@example.com/db"), []);
  console.log("PASS scanner detection and placeholder handling");
  process.exit(0);
}
const mode = process.argv[2] ?? "source";
const git = (...args) => execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
const findings = [];
const secrets = [];
for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith("THREADCORE_") && !["DATABASE_URL", "DIRECT_URL", "VERCEL_AUTOMATION_BYPASS_SECRET"].includes(name)) continue;
  if (!/KEY|SECRET|PASSWORD|DATABASE_URL|DIRECT_URL/.test(name) || !value || value.length < 16 || /your-|placeholder|example/.test(value)) continue;
  secrets.push(value);
  if (name === "THREADCORE_MCP_SIGNING_KEYS") {
    try { for (const key of Object.values(JSON.parse(value))) if (typeof key === "string" && key.length === 43) secrets.push(key); } catch { /* configuration validated elsewhere */ }
  }
}
for (const name of [".env", ".env.local"]) if (existsSync(name)) {
  for (const line of readFileSync(name, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !match[1].startsWith("NEXT_PUBLIC_") && /KEY|SECRET|PASSWORD|DATABASE_URL|DIRECT_URL/.test(match[1])) {
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (value.length >= 16 && !/your-|placeholder|example/.test(value)) secrets.push(value);
      if (match[1] === "THREADCORE_MCP_SIGNING_KEYS") {
        try { for (const key of Object.values(JSON.parse(value))) if (typeof key === "string" && key.length === 43) secrets.push(key); } catch { /* malformed config is checked by auth */ }
      }
    }
  }
}
function inspect(location, bytes) {
  if (bytes.includes(0)) return;
  const found = detect(bytes.toString("utf8"), secrets);
  for (const rule of found) findings.push({ location, rule });
}
if (mode === "source") {
  for (const path of git("ls-files", "-z").toString().split("\0").filter(Boolean)) {
    if (/^\.env(?!\.example$)/.test(path)) findings.push({ location: path, rule: "tracked-env-file" });
    if (existsSync(path)) inspect(path, readFileSync(path));
  }
} else if (mode === "history") {
  const entries = git("rev-list", "--objects", "--all").toString().trim().split("\n");
  for (const entry of entries) {
    const space = entry.indexOf(" ");
    if (space < 0) continue;
    const id = entry.slice(0, space), path = entry.slice(space + 1);
    if (git("cat-file", "-t", id).toString().trim() !== "blob") continue;
    inspect(`${id.slice(0, 12)}:${path}`, git("cat-file", "blob", id));
  }
} else if (mode === "artifacts") {
  if (!existsSync(".next/BUILD_ID")) throw new Error("A completed Next.js build is required before artifact scanning");
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isSymbolicLink() || entry.name === "cache") continue;
      if (entry.isDirectory()) walk(file);
      else inspect(file, readFileSync(file));
    }
  }
  walk(".next");
} else throw new Error("Use source, history or artifacts");
console.log(JSON.stringify({ mode, findings, result: findings.length ? "review_required" : "no_matches" }, null, 2));
if (findings.length) process.exitCode = 1;
