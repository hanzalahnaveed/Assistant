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


## Milestone 7 — Safety gate and provider recovery

- Inbound content is untrusted. The worker detects instruction-injection language before invoking the classifier. Suspected injection, multiple independent requests, vague actions, conflicting explicit deadlines, and forwarded-only messages without a new instruction are routed to `SAFETY_REVIEW`.
- The classifier receives only the new, unquoted message text. Quoted and forwarded text is not treated as an instruction from the current sender. A task payload is suppressed unless an explicit action request exists outside forwarded content.
- A safety-review message receives a neutral clarification draft. No task proposal, meeting suggestion, calendar action, or substantive model-generated reply is created for that item. The manager inbox shows static review reasons, not the untrusted instruction text.
- Google 401 responses and explicit OAuth-scope failures mark the integration `REAUTH_REQUIRED`. Affected queue items become visible terminal failures and can be retried after the account is reconnected. Google rate limits and 5xx responses remain retryable; generic 403 policy errors are not mislabeled as token revocation.
- Automated tests cover injected instructions in current and quoted content, multiple and ambiguous requests, conflicting deadlines, forwarded-only messages, ordinary non-request language, OAuth revocation, missing scopes, rate limits, and transient provider failures.

This gate is deliberately conservative. It cannot prove that arbitrary natural-language messages are safe; ambiguous cases remain manager-reviewed and all replies remain drafts.


## Live provider acceptance and operational metrics

- Run deterministic helper checks with `npm run test:google-live-acceptance`.
- Run the provider smoke test locally with `npm run google:live-acceptance` after setting `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ACCEPTANCE_REFRESH_TOKEN`, and `GOOGLE_ACCEPTANCE_EMAIL`. It reads Gmail and Calendar; it does not write an event unless `GOOGLE_ACCEPTANCE_CREATE_TEST_INVITATION=true` and the recipient exactly matches the dedicated test account.
- The manual GitHub Actions job is gated by repository variable `GOOGLE_ACCEPTANCE_ENABLED=true`. It can also verify a separate already-revoked grant through `GOOGLE_ACCEPTANCE_REVOKED_REFRESH_TOKEN`.
- The inbox operational metrics include queue/processing ages, scan/worker freshness, measured last-attempt duration, recent classifier modes, retry-attempt distribution, and threshold alerts. These metrics contain counts/timestamps only, never email bodies or OAuth tokens.
