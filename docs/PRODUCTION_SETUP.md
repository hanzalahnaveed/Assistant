# Production setup and launch checklist

This repository contains the application code and CI workflow. A real deployment still needs owner-controlled Google Cloud, hosting, database, and AI-provider accounts. Never commit credentials or paste secrets into issues or chat.

## 1. Recommended hosting layout

- **Web app:** Vercel, connected to `hanzalahnaveed/Assistant` and the `main` branch.
- **Database:** managed PostgreSQL 15+ (for example, a Vercel-connected PostgreSQL provider).
- **Account identity:** built-in email/password authentication; Google OAuth is optional for Google sign-in and Workspace data.
- **AI chat:** OpenAI API (or a compatible provider).
- **Scheduled briefings:** the existing GitHub Actions workflow at `.github/workflows/daily-briefings.yml`.

Keep production and preview databases/secrets separate where possible.

## 2. Google Cloud configuration

Use the Google Cloud project that will own this application:

1. Open [Google Cloud Console](https://console.cloud.google.com/), select/create a project, and configure the **Google Auth Platform** consent screen (branding, audience, developer contact email, and app information).
2. Enable **Gmail API** and **Google Calendar API** under APIs & Services → Library.
3. In Google Auth Platform → Audience, leave the app in **Testing** while validating and add each intended Google account under **Test users**. Testing mode is not a public production launch.
4. Under Clients, create an **OAuth client ID** of type **Web application**.
5. Add the deployed origin to **Authorized JavaScript origins** if requested by the client setup. Add the exact callback URL below to **Authorized redirect URIs**:
   - Local: `http://localhost:3000/api/auth/google/callback`
   - Production: `https://YOUR-REAL-APP-DOMAIN/api/auth/google/callback`
6. Store the generated client ID and client secret only in the deployment environment. Set `GOOGLE_REDIRECT_URI` to the exact same callback URL; protocol, domain, path, and trailing slash must match.
7. Google sign-in is optional. If enabled, test it separately from email/password signup/login. Then use the Google integration connection to grant Gmail inbox-read, Gmail send, Calendar read, and Calendar event-creation access. Authentication alone does not connect Workspace data. Email sending is exposed from the unified Email inbox and requires a saved draft, explicit approval, and a separate send confirmation. Calendar event creation is exposed from the unified Tasks & calendar workspace and requires explicit confirmation, event-write permission, an unpaused automation state, and a successful availability check; creating events can send attendee invitations.

The app requests identity scopes for sign-in/sign-up and the additional `gmail.readonly`, `gmail.send`, `calendar.readonly`, and `calendar.events` scopes only for the optional Workspace integration. Existing connections must reconnect to grant `gmail.send` and `calendar.events`. Gmail sending and Calendar event creation may require additional Google verification before public launch.

**Before opening the app to the public:** Google may require OAuth verification for sensitive/restricted scopes, a verified domain, a public privacy policy and homepage, and possibly a security assessment depending on the scopes and use. Review Google's [OAuth production-readiness guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification). Until verification is complete, keep the app in Testing and limit access to approved test users.

## 3. Production environment variables

Add these in the hosting provider's **Production** environment. Use unique random values for secrets; never reuse CI examples.

| Variable               | Required                    | Value                                                                                            |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`         | Yes                         | Production PostgreSQL connection string                                                          |
| `APP_URL`              | Yes                         | Canonical deployed origin, e.g. `https://your-real-domain.example` (no trailing slash preferred) |
| `AUTH_SECRET`          | Yes                         | Random secret, at least 32 characters; generate with `openssl rand -base64 48`                   |
| `GOOGLE_CLIENT_ID`     | Optional                    | OAuth web-client ID from Google Cloud, only if enabling Google sign-in/Workspace                 |
| `GOOGLE_CLIENT_SECRET` | Optional                    | OAuth web-client secret from Google Cloud, only if enabling Google sign-in/Workspace             |
| `GOOGLE_REDIRECT_URI`  | Optional                    | Exact production callback URL from section 2, only if enabling Google sign-in/Workspace          |
| `OPENAI_API_KEY`       | Yes for live AI chat        | API key from the selected OpenAI account/project                                                 |
| `OPENAI_MODEL`         | Yes for live AI chat        | Model available to that API project; default is `gpt-4o-mini`                                    |
| `OPENAI_BASE_URL`      | Yes for live AI chat        | `https://api.openai.com/v1`, or the compatible provider's API base URL                           |
| `CRON_SECRET`          | Yes for scheduled briefings | Separate random secret, at least 32 characters                                                   |
| `AI_PROVIDER`          | Optional                    | `openai` (current default)                                                                       |

Use `openssl rand -base64 48` separately for `AUTH_SECRET` and `CRON_SECRET`. Never use the same value for both. Keep secrets server-side; do not prefix them with `NEXT_PUBLIC_`.

## 4. Vercel deployment

1. Connect the Vercel integration to your account, then import `hanzalahnaveed/Assistant` and deploy `main`.
2. Set the environment variables listed above in Vercel Project Settings → Environment Variables for **Production**. Add equivalent but separate values for Preview only if you want Preview deployments to use real services.
3. Connect a managed PostgreSQL database and confirm its connection string is available as `DATABASE_URL`. Use the provider's recommended pooled connection string for serverless application traffic when available.
4. Confirm the Vercel build command is `npm run build`; the repository's build script generates Prisma Client before building.
5. Apply database migrations to the production database before relying on the app. From a trusted terminal with the production `DATABASE_URL` set, run:
   ```bash
   npm ci
   npx prisma migrate deploy
   ```
   Ensure that terminal is pointed at the intended production database before running the migration. Do not use `prisma db push` as the production migration process.
6. Redeploy after setting/changing environment variables. Visit `/api/health` to confirm the web process responds, then visit `/api/health/ready` to verify the production database schema is reachable and required configuration is present. A readiness response of HTTP 503 includes only missing variable names and a database status; it never returns secret values. Then run GitHub Actions → **Production smoke test** (manual workflow) after setting the repository variable `APP_BASE_URL`. It checks liveness, database/configuration readiness, and the public sign-in page.

## 5. Scheduled daily briefings (GitHub Actions)

The workflow `.github/workflows/daily-briefings.yml` runs every 15 minutes and calls the deployed worker.

In GitHub → repository Settings → Secrets and variables → Actions, add:

- **Repository variable** `APP_BASE_URL`: deployed app origin only, e.g. `https://your-real-domain.example` (no trailing slash).
- **Repository secret** `CRON_SECRET`: exactly the same value as the hosting environment's `CRON_SECRET`.

Run the workflow manually once using Actions → Scheduled daily briefings → Run workflow. It should return successfully. The worker only generates a briefing when a user's enabled briefing hour matches that user's timezone; a successful run with `generated: 0` can be expected outside a configured user's briefing hour. The worker creates in-app briefing/notification records; it does not send email or push notifications.

## 6. Scheduled inbound email agent

The worker endpoint is `POST /api/cron/email-agent`. The workflow `.github/workflows/email-agent.yml` runs every five minutes and uses `APP_BASE_URL` plus `CRON_SECRET`. It safely skips when those settings are missing.

Enable the feature from **Dashboard → Email → Email permissions & settings** after connecting a Google account with Gmail read access. The agent defaults to off. Its initial Gmail search starts at `enabledAt` and has no fixed five-page or seven-day scan cap. A per-user `EmailAgentState` row stores the Gmail page token and scan progress. Each discovered message is inserted into the durable `InboundEmail` queue with duplicate protection, then processed separately. An invalid/expired page token causes a safe restart from the newest page; repeated message IDs are ignored through the unique `(userId, gmailMessageId)` constraint.

The scheduled worker selects up to four enabled accounts per run in least-recently-served order. It fetches one 100-message Gmail page per selected account and processes at most two queued messages per account in parallel. This bounds one serverless run while allowing the persisted cursor and queue to continue on later runs. Automatic failures retry after 5, 10, 20, and 40 minutes; after five attempts they become visible stopped items. Stale `PROCESSING` claims are recovered, including a worker that terminated during its final attempt. A manager can manually retry a stopped message. The inbox displays queued/processing/retrying/stopped counts, oldest queue age, scan and worker freshness, measured average processing duration, classifier-mode counts, retry-attempt distribution, and threshold alerts for aged queues, stale workers/scans, or terminal failures. Message bodies and page tokens are never included in operational metric aggregates.

Set `EMAIL_AGENT_CLASSIFIER_MODE=dummy` for deterministic offline classification, or `EMAIL_AGENT_CLASSIFIER_MODE=groq` with `GROQ_API_KEY` for live classification. When the mode is omitted, the worker selects Groq when the key is present and dummy otherwise. An explicitly selected Groq mode without a key and unknown mode values fail closed. `OPENAI_API_KEY` is for separate chat/outreach features, not the inbound email classifier.

**Inbound replies are draft-only in every classifier mode.** The manager reviews or edits the draft, approves that exact version, and separately confirms Send. The settings API rejects automatic-send opt-in. Gmail sending requires the `gmail.send` scope. The manager remains responsible for sensitive message review.

Email-derived task requests are persisted as **task proposals**, not immediate schedule items. The email queue presents the title, description, priority, and due date. The manager must explicitly approve or decline the proposal. Approval creates one idempotent `ScheduleItem` linked to the source Gmail message; decline creates no task. Task proposal approval is tenant-scoped, audited, and blocked while the global automation pause is active.

For a meeting request, the agent checks primary-calendar availability and presents advisory time options. The account owner must explicitly choose a proposed slot and confirm creation. The server rechecks availability and refuses to create an invitation when the complete availability response cannot be verified. It creates an idempotent Calendar event with a Meet request and sends the calendar invitation to the sender. The resulting meeting details are appended to the reply draft, which still requires manager review, approval, and separate send confirmation. Sensitive meeting requests require approval of the reply draft before the calendar invitation can be created.

### Live Google provider acceptance (manual, dedicated test account)

The repository includes a live acceptance runner at `scripts/google-live-acceptance.mjs`. CI tests its deterministic slot-selection helpers, but the live runner only executes when manually enabled and configured with a dedicated Google test account.

In GitHub → Settings → Secrets and variables → Actions, configure:

**Repository secrets**
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the OAuth client used by the application.
- `GOOGLE_ACCEPTANCE_REFRESH_TOKEN`: refresh token for a dedicated test account with `gmail.readonly`, `calendar.readonly`, and `calendar.events` scopes.
- Optional `GOOGLE_ACCEPTANCE_REVOKED_REFRESH_TOKEN`: a separate, already-revoked test grant. Do not use the active acceptance token here.

**Repository variables**
- `GOOGLE_ACCEPTANCE_ENABLED=true`: enables the live job for manual workflow dispatches.
- `GOOGLE_ACCEPTANCE_EMAIL`: exact email address for the dedicated test account.
- `GOOGLE_ACCEPTANCE_TIME_ZONE`: IANA time zone, for example `Asia/Karachi`.
- Optional `GOOGLE_ACCEPTANCE_CREATE_TEST_INVITATION=true`: enables a temporary Calendar event/invitation test. Leave false for read-only acceptance.
- `GOOGLE_ACCEPTANCE_RECIPIENT`: must equal `GOOGLE_ACCEPTANCE_EMAIL`; invitations are deliberately restricted to the test account itself.

Seed the dedicated test inbox with at least one harmless email. Then use Actions → **Scheduled email agent** → **Run workflow**, select `dev`, and inspect the `google-live-acceptance` job. The read-only phase checks OAuth refresh, account identity, inbox listing, message retrieval, next-page cursor behavior when a second page exists, invalid-page-token rejection, Calendar availability reads, and the existence of a free 30-minute slot in the account's time zone. A separately revoked grant is verified only when its optional secret is configured.

The invitation phase is off by default. When explicitly enabled, the runner selects a free slot in the next seven days, inserts a temporary event with the test account as the sole attendee, verifies the attendee and event/Meet link, then deletes the event and sends the cancellation update. It logs only pass/fail labels and aggregate results, not message bodies, tokens, event subjects, or calendar contents. Run this phase only against the dedicated test account.

**Application-level acceptance still requires the deployed/staging app.** Connect the same test account in the app, enable the email agent, send a new harmless seed message, and verify the queue creates a manager-reviewed draft. Then test the manager's approve-and-send flow to the same test account, approve/decline a task proposal, and confirm one meeting slot. For OAuth recovery, revoke a separate test grant, verify the app marks the corresponding integration `REAUTH_REQUIRED`, reconnect interactively from Connections, and confirm the integration returns to `CONNECTED`. Do not revoke the only active acceptance grant used by the runner.

The workflow is gated by `GOOGLE_ACCEPTANCE_ENABLED` and is manual only. No live API write occurs unless the invitation variable is explicitly enabled.

### Local development check

1. Start PostgreSQL, apply migrations with `npx prisma migrate dev`, and run `npm run dev`.
2. Sign in to the local app and connect a dedicated Google test account with Gmail read/send and Calendar read/event permissions. For live inbound classification, set `EMAIL_AGENT_CLASSIFIER_MODE=groq` and `GROQ_API_KEY` in your local `.env`; for offline testing, use `EMAIL_AGENT_CLASSIFIER_MODE=dummy`.
3. In **Dashboard → Email → Email permissions & settings**, enable the agent. Use **Check inbox now** to enqueue the next Gmail page and process a bounded number of queued messages. The page cursor and queue state persist across invocations.
4. For continuous local polling, start the worker in a second terminal:

   ```bash
   npm run email-agent:local-worker
   ```

   It polls every 60 seconds by default. It targets `http://localhost:3000` unless `EMAIL_AGENT_BASE_URL` is set. `EMAIL_AGENT_POLL_INTERVAL_MS` is bounded between 15 seconds and five minutes. To run one pass:

   ```bash
   curl --fail-with-body -sS -X POST http://localhost:3000/api/cron/email-agent \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

5. Send a harmless test message to the connected test account. Verify queueing, summary/category, reply content, task proposal approval/rejection, and the edit/save/approve/send lifecycle. Use only a designated test recipient when confirming a send. Select a meeting slot only when ready for a real calendar invitation.
6. Run local checks:

   ```bash
   npm run test:email-agent
   npm run test:email-agent-dummy
   npm run test:email-agent-queue
   npm run test:e2e
   npm run verify:javascript
   ```

The scheduled GitHub Actions worker targets `APP_BASE_URL`; it does not run against localhost. Do not expose a local server or use a personal production inbox just to test the worker.

## 7. End-to-end smoke test

Use credentials-based sign-up/sign-in for the core authentication checks. If Google OAuth is configured, also use a real Google test account and verify its optional flow:

- [ ] `/api/health` responds successfully.
- [ ] `/auth` loads and Google sign-up creates the first account.
- [ ] Sign in with the existing account; signing in with an unregistered account should not create one.
- [ ] Create a schedule item, update its status, and verify it appears in both list and calendar views after refresh.
- [ ] Open Assistant and send a message; confirm the configured AI provider returns a response and the conversation persists.
- [ ] Connect Google Workspace separately; confirm Gmail messages and primary-calendar items load and are stored in the unified schedule.
- [ ] Confirm Gmail inbox and Calendar reads work as expected.
- [ ] Confirm outreach requires approval and a separate send confirmation; test sending only with a designated test recipient.
- [ ] Open the briefing page; check task metrics and connected Workspace context.
- [ ] Set the briefing preference to a suitable hour, manually run the scheduler, and confirm the briefing/notification is persisted. Re-running it for the same local date should not create duplicates.
- [ ] Verify the authenticated session protects all workspace routes.
- [ ] Review deployment logs for OAuth, database, or AI-provider errors.

## 8. What this repository cannot configure on your behalf

Google Cloud OAuth clients, consent-screen publication/verification, billing/API access, hosting projects/domains, database instances, and secret values are owned by your external accounts. The GitHub repository connection does not grant access to those accounts or their secrets. Do not commit real credentials. Once those account-side resources and credentials exist, put the values in the appropriate secret manager and complete the smoke test above.
