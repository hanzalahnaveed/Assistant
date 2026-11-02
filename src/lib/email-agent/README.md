# Email agent classification

The inbound email worker supports two explicit classifier modes:

- **Dummy/offline** (`EMAIL_AGENT_CLASSIFIER_MODE=dummy`): deterministic local rules, no AI-provider request, no API key required. This is the default in `.env.example`.
- **Groq/live** (`EMAIL_AGENT_CLASSIFIER_MODE=groq`): uses the configured Groq-compatible chat-completions endpoint and requires `GROQ_API_KEY`.

When the mode is omitted, the worker uses Groq if `GROQ_API_KEY` is present; otherwise it uses the dummy classifier. An explicitly selected `groq` mode without a key fails with a configuration error instead of silently changing behavior. Unknown mode values also fail closed.

The dummy classifier produces a normalized intent (`MEETING_REQUEST`, `RESCHEDULE`, `DECLINE_INVITE`, `TASK_DELEGATION`, or `OTHER`) and a placeholder reply. It is intended for local development, CI, and safe fallback. Its output is always marked `DUMMY`; it cannot authorize automatic sending or create calendar events. Meeting times are suggestions only.

**All inbound replies remain drafts in every mode.** The manager must review/edit the draft, explicitly approve it, and separately choose Send. Meeting requests can show advisory calendar slots; creating an event requires a separate, explicit slot selection and confirmation, and the resulting reply still remains a draft.

Run the token-free unit tests with:

```sh
npm run test:email-agent-dummy
```

The full CI workflow also runs parsing, calendar-timezone, Prisma, build, and production end-to-end checks. Live Gmail/Calendar behavior still requires a configured Google OAuth connection and should be tested in a dedicated test account before production use.

## Durable queue and task review

Gmail discovery uses a per-user `EmailAgentState.gmailPageToken` and a stable `scanEnabledAt`. Each worker pass stores one page of up to 100 Gmail message IDs as `InboundEmail` queue rows. The database unique key makes repeated page scans safe. If a saved page token is rejected, the scanner clears it and restarts from the newest page; duplicate rows are skipped. A full scan has no fixed five-page or seven-day limit.

Each account processes at most two queued messages per worker pass. Claims use conditional updates, and stale claims are recovered after ten minutes. Failed processing retries after 5, 10, 20, and 40 minutes; the fifth failed attempt becomes a terminal `FAILED` item. A manager can explicitly restart a terminal item, which resets its attempt counter. Worker account selection is bounded to four enabled users per run and rotates by `lastWorkerRunAt`.

Task payloads are stored as pending proposals in the inbound classification. They do not create `ScheduleItem` rows until the signed-in account owner approves the proposal in the email inbox. Declining a proposal creates no schedule item. Approval is idempotent by `(userId, source, sourceRef)`, tenant-scoped, audited, and blocked during the global automation pause.

Run the cursor/retry policy tests with:

```sh
npm run test:email-agent-queue
```
