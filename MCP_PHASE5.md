# Phase 5 — trusted confirmations

Completed locally; no Supabase migration or deployment was performed.

Address add/delete and cancellation create validated, user-bound pending records expiring after five minutes. Model-visible responses contain neither proposal IDs nor approval capabilities. The authenticated browser fetches saved previews through the separate confirmation endpoint. Delete previews show the address; cancellation previews show the order number, amount and reason. React renders these as text, never HTML.

Confirm accepts only the proposal UUID and a Boolean. A strict schema rejects replacement arguments and invalid IDs; malformed JSON produces 400. Current Supabase identity, live session and CSRF/origin protection are checked by the existing authentication boundary on every request. Another account cannot fetch or consume the proposal. The harness clears cards on authentication changes and ignores responses from previous authentication generations.

## Integrity design

Confirmation now acquires the existing customer transaction lock and locks the owned proposal. Domain calls reuse that same transaction through AsyncLocalStorage, scoped to the identical customer. The business mutation, its durable retry receipt and the proposal's executed status commit together. Failure at any step rolls everything back; retries remain safe. No approved-but-unrecorded mutation window remains for new executions.

An executed proposal returns executed on retry, including after expiry or a lost response. Rejected/expired proposals remain terminal. Reject cannot report that an executed action was rejected. Confirm/Reject races serialize and return the durable winning state. Expiry is checked with database time; listing marks expired pending records explicitly. Existing approved records from the earlier partial implementation fail closed for manual reconciliation; they are not silently replayed.

Business conditions are rechecked at execution: the shared domain validates fields and ownership, cancellation checks current cancellable status and transactionally restores inventory once, and deletion verifies the address still exists. Failures leave the proposal pending until corrected/rejected/expired.

`pending_actions` is declared in the Drizzle schema with matching RLS/status constraints. The reviewed Phase 5 migration was revised because it has not been applied to Supabase. If any staging environment applied the earlier draft, do not rerun CREATE TABLE: first reconcile legacy approved records and prepare an explicit schema upgrade/backfill for the preview column and expired status. Never invent old previews or silently consume old approvals.

## Verification

The isolated PostgreSQL suite now exercises the actual Phase 5 migration and tests strict confirmation schemas, cross-user denial, capability-free proposal responses, saved previews, expiry, repeated Confirm/Reject, concurrent decisions, rollback of mutation AND receipt after an injected final-status failure, confirmed cancellation and stock restoration, changed order status, confirmed address deletion and browser-role denial despite default grants. Existing authentication tests cover logout, revoked sessions, account switching, CSRF and forged credentials. These tests do not contact Supabase or mutate production data.

Retained active tests, migrations and required integration components. Historical Phase 4–6 notes describing incomplete confirmations are superseded by this note. Live staging verification, actual database grants, migration application and the existing production-build worker failure remain deployment requirements, not evidence of local confirmation correctness.
