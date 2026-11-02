# Inbound email agent: architecture audit and milestone plan

## Scope and audit baseline

This audit covers the existing Next.js/Prisma application on the `dev` branch: Gmail ingestion, classification, reply drafting, inbox review, meeting scheduling, task extraction, Google OAuth, and CI. It is a source-level review; live Gmail/Calendar behavior requires a dedicated test account and credentials. No production mailbox or external calendar action was used for this audit.

## Current end-to-end flow

1. `.github/workflows/email-agent.yml` invokes `POST /api/cron/email-agent` every five minutes with `CRON_SECRET`. The worker selects connected Google users, loads each user's email-agent settings, and calls `processInboundEmailForUser`.
2. The service queries Gmail inbox messages received after the agent was enabled, parses sender/subject/body, ignores automated senders, and creates or claims an `InboundEmail` row. A unique `(userId, gmailMessageId)` key and a stale-processing timeout are used to avoid duplicate work.
3. The classifier extracts category, sensitivity, summary, intent, an optional task payload, and a reply. Meeting classification can trigger an advisory availability lookup against the primary calendar.
4. A task intent with a task payload currently upserts an internal `ScheduleItem` keyed by source Gmail message. This is an internal database mutation, not an external message or calendar event.
5. The agent persists an `EmailDraft`, links it to the inbound row, records classification/evidence in JSON, and updates the inbound status. Replies are retained as drafts.
6. `/api/email-agent/inbox` feeds the unified email queue. The manager edits/saves the draft, approves that exact version, then separately confirms Send. The send route requires Gmail send permission, rechecks the approval state, uses a `SENDING` claim, and locks uncertain network outcomes for manual Sent-folder verification.
7. For meetings, the queue presents offered slots. The manager explicitly selects a slot and confirms that a Calendar invitation will be sent. The server rechecks availability, uses a stable event ID, creates the event/Meet link, appends event details to the draft, and resets the draft to `DRAFT`; the email still needs a new approval and separate send confirmation. Sensitive meeting requests require approval before the event invitation is created.

## Findings and changes applied

| Priority | Finding | Change in this pass |
| --- | --- | --- |
| Critical | The offline/dummy classifier existed but the inbound worker always called Groq. | Connected explicit dummy/Groq mode selection, added fail-closed configuration checks, and tests. |
| Critical | The inbox API returned only draft status, so the UI could not render generated replies. | Returned user-scoped draft details and added an E2E assertion. |
| High | Settings advertised automatic sending despite a manager approval requirement. | Removed auto-send controls and rejected API opt-in. All inbound replies remain drafts. |
| High | Meeting intent/category mismatches could display an action that the API rejected. | Aligned the meeting endpoint with normalized intent and added regression coverage. |
| High | The worker rescanned only five Gmail pages (500 messages), so older messages could remain undiscovered indefinitely. | Added `EmailAgentState` with a persistent per-user Gmail page token and enable-time watermark. Every pass enqueues one page of up to 100 IDs into `InboundEmail`; database uniqueness makes restarts and rescans safe. There is no fixed five-page or seven-day query cap. Invalid page tokens restart scanning from the newest page. |
| High | The cron worker processed accounts sequentially and a serverless crash could leave work stuck in `PROCESSING`. | The worker now selects up to four enabled accounts in least-recently-served order and runs them concurrently. Each account scans one page and processes at most two queued messages per pass. Atomic claims, ten-minute stale-claim recovery, retry backoff, final-attempt recovery, visible dead letters, and manual retry are implemented. |
| High | Email task classification immediately inserted `ScheduleItem` records without a manager decision. | The agent now stores a task proposal and sets `TASK_REVIEW`. The inbox provides Approve and Decline actions. Only an authenticated approval creates the idempotent schedule item; rejection creates nothing. Both actions are audited and tenant-scoped. |
| Medium | Worker observability was limited to response counts. | The inbox shows queued/retrying/stopped counts, page progress, last worker run, and the latest worker issue without exposing Gmail page tokens or message bodies. |
| High | CI did not run on `dev`. | CI triggers on pushes and PRs for both `main` and `dev`, including queue cursor/retry tests. |

## Milestone 5 — Worker fairness, bounded execution, and recovery

<badge>Implemented on `dev`</badge>

- `EmailAgentState` stores one user's Gmail pagination cursor, `scanEnabledAt`, pages scanned, last page time, last worker time, and last error.
- Each scheduled pass discovers one page of up to 100 Gmail message IDs and inserts queue rows with `createMany(skipDuplicates: true)`. A unique `(userId, gmailMessageId)` key makes a repeated scan safe. The query starts at the agent enable timestamp and is not restricted to five pages or seven days.
- If Gmail rejects a persisted page token, the worker clears the token and restarts from the newest page. It relies on message-ID uniqueness to skip entries already discovered.
- Each account processes at most two oldest queued messages per pass. The cron worker handles up to four enabled accounts concurrently and sorts by `lastWorkerRunAt` so accounts deferred in one invocation move ahead in subsequent invocations.
- Queue claims are conditional updates; a `PROCESSING` row older than ten minutes can be reclaimed. A process killed on its fifth attempt is promoted to `FAILED` after its lease becomes stale.
- Automatic retry delays are 5, 10, 20, and 40 minutes. After five failed claims the item becomes a visible terminal error. A manager can manually reset that item to `RECEIVED`; the reset is audited.
- Queue status is visible in the email inbox. The API exposes counts and progress metadata only; the opaque Gmail page token is never sent to the browser.

### Current throughput boundary

The scheduled workflow runs every five minutes. A worker pass processes at most two queued messages per selected account and at most four accounts in parallel. This is deliberately bounded for the 60-second serverless limit and Groq/provider rate limits. A large historical mailbox is now fully discoverable across page-cursor checkpoints, but draining a large backlog takes multiple scheduler passes. Monitor `queuedCount`, `retryingCount`, `failedCount`, and pages scanned before increasing the per-account batch size.

## Milestone 6 — Manager approval for email-derived tasks

<badge>Implemented on `dev`</badge>

- Task extraction now stores a JSON proposal with `taskApprovalStatus: PENDING`; it does not write a `ScheduleItem`.
- The email queue displays the extracted title, description, priority, and due date and offers explicit Approve and Decline actions.
- Approval validates the extracted payload, checks the global automation pause, conditionally claims the inbound row, and upserts one `ScheduleItem` linked to the Gmail message. The transaction updates the inbound status and writes an audit event.
- Decline updates the proposal state and writes an audit event without creating a schedule item.
- Repeated approvals return the already-created task; concurrent or cross-account changes cannot create duplicate tasks.

## Milestone 7 — Agent safety and provider recovery

<badge>Implemented on `dev`</badge>

- Added a deterministic inbound safety gate that detects prompt-injection language, multiple independent requested actions, vague instructions, conflicting explicit deadlines, and forwarded-only content without a new instruction. These items are stored as `SAFETY_REVIEW` and never become task proposals.
- The classifier receives the sender's current, unquoted message only. Quoted or forwarded text is retained only as a safety signal and context marker; it cannot independently authorize a task. Model task extraction is discarded unless a clear action request appears in the sender's unquoted text.
- Safety-review messages receive a neutral clarification draft. No substantive reply, task, or meeting suggestion is generated for them. The manager inbox displays static review reasons without echoing the untrusted instructions.
- Added provider error classification. Google 401 and explicit missing-scope responses mark the integration `REAUTH_REQUIRED`; the current affected message becomes a visible terminal failure. Rate limits and 5xx responses remain eligible for retry, while unrelated 403 policy errors are not treated as revoked credentials.
- Added focused tests for injection in current/quoted content, quote boundaries, multi-action and ambiguous requests, conflicting deadlines, forwarded-only mail, non-request false positives, OAuth revocation, missing scopes, rate limits, and transient failures. E2E verifies that the inbox exposes a safety-review item without leaking the page cursor or source instructions.

### Remaining integration acceptance

- CI uses deterministic fixtures and a mocked classifier. It does not authenticate against a live Google account or exercise real Gmail/Calendar APIs. A dedicated test account is still required before enabling the feature for production mailboxes.
- Added per-user queue age, scan/worker freshness, measured processing duration, classifier-mode counts, retry-attempt buckets, and UI alerts for stale queues/scans/workers and terminal failures. Aggregates exclude message bodies and OAuth tokens.
- Added a gated, manual live Google acceptance runner for OAuth refresh, Gmail inbox/message reads, pagination, Calendar availability, and an optional temporary invitation to the test account. App-level end-to-end use and interactive reconnect still require a configured dedicated test account and a staging deployment.

## Production readiness

- Complete Google OAuth scope verification and production account consent requirements before enabling real Gmail send or Calendar event creation for general users.
- Run database restore/retention checks and confirm the account export/delete lifecycle covers `EmailAgentState` and inbound queue rows.
- Define staged rollout and rollback procedures. Keep the email agent disabled by default and retain the global automation pause.

## Validation status

- Added regression tests to the repository's existing email-agent and end-to-end test suites.
- Enabled the CI workflow for `dev`; check the latest `CI` run on GitHub Actions for executed results.
- Source-level changes have been committed directly to `dev`. No new branch was created, and `main` was not changed.

