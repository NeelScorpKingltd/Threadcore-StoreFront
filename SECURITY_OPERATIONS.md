# Security operations

## Repository and deployment scans

Run `npm run security:source` and `npm run security:history`. The history check covers objects reachable from local refs; fetch all relevant remote refs before a release audit. Unreachable/deleted objects, third-party forks, remote logs and external backups are outside its coverage.

After a successful fresh `npm run build`, run `npm run security:artifacts`. The scanner refuses a missing completed build and scans local `.next` files, excluding cache. It does not assert the remote Vercel artifact is identical; run the artifact check in the deployment build pipeline for the actual release source. Signature rules cover selected provider credentials, private keys, credentialed database URLs and configured local secret values. No-match is not proof that arbitrary secrets are absent. Keep GitHub secret scanning/push protection enabled where available. Findings report location/rule only; never paste matched values into issues or logs. If a real secret is found, revoke/rotate it before history cleanup.

## Runtime configuration

- Remote PostgreSQL connections require TLS with certificate verification. Local non-production loopback tests use plaintext. Optional `THREADCORE_DB_CA_PEM` accepts the trusted database CA PEM for environments that need it. Obtain the CA from Supabase's trusted project connection settings; never disable verification.
- Pool settings per process: max 4, connect timeout 10 seconds, idle timeout 20 seconds, lifetime 300 seconds. With N active instances, plan for up to 4N connections plus administrative headroom. Review Vercel concurrency/regions and Supabase pooler limits before production. The process admission cap is eight active operations, including work that survives a caller timeout; it is not a global concurrency guarantee.
- Customer write transactions set local statement_timeout=10s, lock_timeout=3s and idle_in_transaction_session_timeout=15s. Catalogue/cart/address/order reads and proposal inserts use transaction-local 10-second statement and 3-second lock limits, reusing an active customer transaction when present. Session verification queries use a local 5-second statement timeout. Rate-counter queries use local 3-second statement and 1-second lock limits. These settings are compatible with transaction pooling. The pool connect timeout does not bound pool queue wait; caller deadlines and process admission bound the request path. A reviewed role-level default can provide defense in depth for future/unwrapped queries; do not alter Supabase's shared admin/browser roles blindly.
- Chat adapter, direct MCP and confirmation requests have a 20-second caller deadline; database mutations already executing may complete afterward. Reuse durable mutation/confirmation IDs on retry. The direct MCP route uses shared limits of 1800 requests globally and 180 requests per verified subject per minute. Browser limits remain 600/60 tools and 300/30 confirmations. Counts include SDK initialization requests; tune against observed legitimate traffic. Fixed windows permit boundary bursts. Platform firewall/perimeter protection remains necessary against floods before functions execute.
- The existing `mcp_rate_limits` migration is reused. No additional tables or grants are required for this increment. Keep private tables inaccessible to browser roles. Review inactive counter-row retention as user count grows.

## Log access, retention and alerts

Application events go to Vercel runtime logs, not an application-owned audit database. Events contain generated request ID, fixed route/stage, status, duration, tool name/outcome, and confirmation outcome. Error responses retain sanitized codes. No user IDs, proposal IDs, raw errors/stacks, credentials or argument/result bodies are collected by these events.

Production setup requires a project/team administrator:

1. Restrict Vercel log access to designated operators through team/project permissions; remove unused members and tokens. Check the plan's available roles and retention. Do not grant all staff log access by default.
2. If longer retention/alerting is needed, configure an approved Vercel log drain. Use an ingestion-only credential, encrypted transport and restricted storage. Review what additional platform metadata the drain includes; application redaction does not redact platform-added metadata. Target 14 days of searchable operational logs initially, then automatic expiry; approve a different retention if business needs require it. Verify expiry in the destination.
3. At the destination configure alerts: >=5 HTTP 5xx events for a route in five minutes; >=20 HTTP 429 events in five minutes; and p95 chat_request duration >15 seconds for ten minutes (minimum 20 events). Alert on the fixed `stage` field to identify configuration, supabase_user, session_database, transport, rate_limit and confirmation failures. Destination must deduplicate alerts and contain request IDs only, never payloads.
4. Test with synthetic staging events and verify delivery to the designated on-call destination. Do not create deliberate production failures. Record owner, destination, retention and test evidence in the release checklist.

No log drain, team permission change, external alert destination or production database role change is configured by this repository. Those items require the selected destination and authorized platform access. These events aid diagnostics; they are not a tamper-resistant durable transaction audit ledger. Receipts and pending-action records remain the durable mutation state.

Use `node scripts/evaluate-security-alerts.mjs` with normalized JSONL on stdin to dry-run the documented thresholds. Each input event requires a destination-added ISO `timestamp`; the output contains aggregate counts and fixed route/rule names only. It does not send notifications. Connect the same rules at the selected log destination and test delivery before marking alert operations complete.
