import readline from "node:readline";

// A dry-run evaluator for normalized event JSONL from a reviewed log destination.
// Input timestamps must be destination-added ISO timestamps; never forward raw
// events to notifications. Output contains fixed route names and aggregate counts.
const now = Date.now();
const groups = new Map();
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let count = 0;
for await (const line of input) {
  if (++count > 100000 || line.length > 4096) throw new Error("Input limit exceeded");
  let event;
  try { event = JSON.parse(line); } catch { continue; }
  if (event.event !== "chat_request" || !["tools", "confirm", "mcp"].includes(event.route)) continue;
  const age = now - Date.parse(event.timestamp);
  if (!Number.isFinite(age) || age < 0 || age > 600000) continue;
  const group = groups.get(event.route) ?? { serverErrors: 0, rateLimited: 0, durations: [] };
  if (age <= 300000) {
    if (event.httpStatus >= 500 && event.httpStatus <= 599) group.serverErrors++;
    if (event.httpStatus === 429) group.rateLimited++;
  }
  if (Number.isFinite(event.durationMs) && event.durationMs >= 0) group.durations.push(event.durationMs);
  groups.set(event.route, group);
}
const alerts = [];
for (const [route, group] of groups) {
  if (group.serverErrors >= 5) alerts.push({ route, rule: "server_errors", count: group.serverErrors });
  if (group.rateLimited >= 20) alerts.push({ route, rule: "rate_limited", count: group.rateLimited });
  group.durations.sort((a, b) => a - b);
  const p95 = group.durations[Math.ceil(group.durations.length * 0.95) - 1];
  if (group.durations.length >= 20 && p95 > 15000) alerts.push({ route, rule: "slow_requests", p95Ms: p95 });
}
console.log(JSON.stringify({ alerts }, null, 2));
