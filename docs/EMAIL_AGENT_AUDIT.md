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
| Critical | The offline/dummy classifier existed and was documented/configured in `.env.example`, but the production email service always called the Groq API. A default local/CI configuration without `GROQ_API_KEY` therefore failed instead of creating test drafts. | Connected classifier selection to the inbound worker. `dummy` runs locally without network/API credentials; `groq` requires `GROQ_API_KEY`; omitted mode selects Groq only when a key exists and otherwise defaults to dummy. Unknown modes fail closed. Added unit coverage. |
| Critical | The inbox API returned only draft IDs/statuses, while the UI expected full draft data. As a result, the generated reply body and review controls could not render in the inbound queue. | The inbox API now returns the user-scoped draft fields required by the review UI. Added an end-to-end assertion that the linked draft body is present. |
| High | The settings UI advertised routine automatic replies, but the service forcibly disabled the option and the API did not consistently reject opt-in. The intended manager approval model was ambiguous and tests contradicted the implementation. | Removed the auto-send control, clarified the draft-only workflow, and made the settings API reject `autoReplyEnabled: true`. Inbound replies stay drafts in every classifier mode. |
| High | The UI enabled meeting scheduling from normalized meeting intent, but the route required category `MEETING`. A message with a valid `MEETING_REQUEST`/`RESCHEDULE` intent and a different category could show an action that the API rejected. | The meeting route now accepts either the meeting category or a recognized meeting intent. Added regression coverage using an intent/category mismatch. |
| High | CI only ran on pushes/PRs targeting `main`, so direct work on `dev` had no automated branch validation. | CI now runs on pushes and PRs for both `main` and `dev`; CI explicitly selects the deterministic dummy classifier. |

## Remaining risks and next milestones

### Milestone 5 — Worker fairness, bounded execution, and recovery

- The Gmail scan is bounded to five pages of 100 messages per invocation and processes at most two newly claimed messages per user. A mailbox with more than 500 matching messages can leave older messages beyond the scanned window unprocessed; continuous arrivals can also keep the newest pages busy.
- The scheduled worker processes users sequentially. A live classifier call can take up to 20 seconds and a meeting may require a second model call. With multiple users or slow Google/Groq responses, the endpoint can approach its 60-second execution limit.
- Add durable Gmail history/cursor handling (or a persisted resumable page/window strategy), bounded concurrency, explicit per-run time budgets, retry/backoff, and a visible dead-letter/retry state. Do not increase worker limits without a bounded execution strategy.

### Milestone 6 — Task approval and extraction quality

- Task extraction currently creates a schedule item immediately when a classifier supplies a task payload. The mutation is idempotent and internal, but the queue displays it as already added rather than as a manager-approved task proposal.
- Decide whether email-derived tasks should be auto-created or require a review/confirm action. If auto-created, make the UI and policy explicit and add a rollback/ignore path. If approval is required, persist a proposed task separately and create the ScheduleItem only after explicit manager confirmation.
- Add confidence/ambiguity handling and test false positives, forwarded threads, quoted instructions, vague requests, multiple action items, conflicting due dates, and sensitive content.

### Milestone 7 — Agent safety and integration acceptance

- Add adversarial prompt-injection fixtures in inbound emails, including requests to reveal secrets, forward data, override policies, or create external actions. Treat all email content and attachments as untrusted data.
- Add mocked provider integration tests for Gmail paging, duplicate deliveries, stale processing claims, token refresh/revocation, malformed model output, Groq timeout/rate-limit, calendar conflicts, and uncertain event-creation outcomes.
- Test the full lifecycle using a dedicated Google test account: inbox fetch → draft persistence → UI render/edit → approve → send; meeting intent → offered slots → explicit selection → invitation → draft re-review.
- Add operational metrics for scan counts, oldest unprocessed message age, classifier mode, processing latency, retry count, and terminal failures. Never log message bodies or OAuth tokens.

### Milestone 8 — Production readiness

- Complete Google OAuth scope verification and production account consent requirements before enabling real Gmail send or Calendar event creation for general users.
- Run restore/retention checks for the PostgreSQL database, review the account export/delete lifecycle, and confirm tenant scoping for every new query.
- Define a rollout plan with auto-processing disabled by default, an explicit pause switch, staged test users, and rollback procedures.

## Validation status

- Added regression tests to the repository's existing email-agent and end-to-end test suites.
- Enabled the CI workflow for `dev`; check the latest `CI` run on GitHub Actions for executed results.
- Source-level changes have been committed directly to `dev`. No new branch was created, and `main` was not changed.

