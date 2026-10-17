# Assistant

Personal AI Executive Assistant for individual managers, combining a proactive dashboard and chat with Google Workspace, tasks, daily briefings, and policy-controlled automation.

## Current status

- [x] Next.js + TypeScript application foundation
- [x] PostgreSQL/Prisma data model and tenant-scoped APIs
- [x] Email/password signup and login with salted scrypt password hashes
- [x] Optional Google OAuth identity sign-in and account creation
- [x] Encrypted Google access/refresh tokens for the optional Workspace integration
- [x] Gmail inbox and primary-calendar integration; sending is limited to explicitly approved drafts
- [x] Authenticated task CRUD, audit events, and soft-archive
- [x] Persistent conversations and messages with OpenAI-compatible AI chat
- [x] Daily briefing, inbox follow-up recommendations, and in-app notifications
- [x] Action Center with proposed task actions, approve/reject flow, idempotent execution, and audit history
- [x] Per-action automation rule for task creation (AUTO, CONFIRM, or BLOCK)
- [x] AI chat grounded in current task priorities, today’s calendar, and read-only inbox follow-up candidates
- [x] Chat tool calling for explicit task-creation requests, routed through the same approval rules and idempotent action service
- [x] Inbox follow-up recommendations routed through policy-controlled, idempotent task proposals instead of bypassing the Action Center
- [x] Daily briefing commitment candidates from explicit email next-step language and upcoming calendar events, with evidence, rationale, and policy-controlled task proposals
- [x] Timezone-aware scheduled briefing worker with idempotent daily generation
- [x] CI validation, production build, and end-to-end test workflow
- [x] Saved outreach drafts, AI-assisted generation, separate approval and send steps, and email audit events
- [ ] Real Google account verification and production deployment

## Production configuration

See **[Production setup and launch checklist](docs/PRODUCTION_SETUP.md)** for Google Cloud OAuth, Gmail/Calendar API enablement, Vercel deployment, PostgreSQL, production environment variables, GitHub Actions scheduling, migrations, and end-to-end smoke tests.

The repository can be configured in code, but live service access requires credentials and account-side setup in Google Cloud, the hosting provider, the database provider, and the AI provider. Never commit those values.

## Proactive daily briefing

Open `/briefing` to see open/overdue/due-today tasks, high-priority work, today's calendar, suggested inbox follow-ups, and a **Commitments & next steps** section. Follow-up and commitment scores use transparent heuristics over email subject, snippet, unread labels, explicit next-step/deadline language, and upcoming calendar times. These are recommendations, not proof that a response is required or a promise was made. Commitment suggestions show the supporting email snippet or meeting time and can be turned into tasks through the same `AUTO`, `CONFIRM`, or `BLOCK` policy. Use **Propose follow-up task** to route a persistent task proposal through the same `AUTO`, `CONFIRM`, or `BLOCK` policy used by the Action Center. With `CONFIRM`, review it in `/actions`; with `AUTO`, a local task is created immediately; with `BLOCK`, the proposal is refused. The source message ID is retained in the task context for traceability. This action does not send or modify email.

Daily briefing preferences are stored per user through `/api/preferences`. The scheduled worker checks users every 15 minutes, evaluates each user's configured timezone and delivery hour, then persists one briefing per local calendar day. Repeated scheduler calls are idempotent. Saved briefings appear in the authenticated notification inbox, and users can mark notifications read.

The worker endpoint is `POST /api/cron/daily-briefings` and requires `Authorization: Bearer $CRON_SECRET`. Configure the hosting environment variable `CRON_SECRET`, GitHub Actions repository variable `APP_BASE_URL` (the deployed app origin), and GitHub Actions repository secret `CRON_SECRET` with the same secret value. The workflow `.github/workflows/daily-briefings.yml` runs every 15 minutes and safely skips if either GitHub setting is missing. This delivers persistent in-app briefings, not external email or push notifications. Approval mode is a preference and does not authorize external actions by itself.

## Controlled actions and automation

Open `/actions` to propose a task, review pending proposals, approve or reject them, and inspect the action history. Task creation uses the existing `ActionRecord` and `AutomationRule` data models, is scoped to the signed-in user, records audit events, and uses an idempotency key so retries do not create duplicate tasks. Task-specific automation can override the user's default approval mode: `CONFIRM` requires an explicit approval, `AUTO` creates the task immediately, and `BLOCK` prevents new proposals. Removing the rule falls back to the default approval setting.

Task actions remain limited to creating tasks inside this application. Email sending is available only through the dedicated `/email` workflow: a saved draft must be approved and then separately confirmed for sending. Sending requires the Gmail `gmail.send` OAuth scope; existing Google connections must reconnect to grant it. The send outcome is audited, and uncertain outcomes are locked for manual Sent-folder verification to reduce duplicate sends. AI chat context and Gmail/Calendar reads remain read-only; email/calendar content is untrusted data.

## Local development

Requirements: Node.js 20+, PostgreSQL 15+, Google Cloud OAuth client (for live Workspace data), and an OpenAI-compatible API key (for live AI chat).

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `AUTH_SECRET`, and `CRON_SECRET`. Generate unique secrets with `openssl rand -base64 48`.
3. Install dependencies and initialize the database:
   ```bash
   npm install
   npm run db:generate
   npm run db:migrate
   ```
5. Set `OPENAI_API_KEY`; configure `OPENAI_MODEL` and `OPENAI_BASE_URL` if needed.
6. Optionally configure Google OAuth and enable Gmail/Calendar APIs if you want Google sign-in or Workspace data. The redirect URI must exactly match `GOOGLE_REDIRECT_URI`.
7. Run `npm run dev` and open `http://localhost:3000/auth` to create an account with email and password.

## Security principles

- Keep OAuth credentials and application secrets in environment variables or a managed secret store; never commit them.
- Google tokens are encrypted at rest with AES-256-GCM.
- Outreach drafts are never sent automatically; approval and sending require separate user actions.
- The Gmail send scope may require additional Google OAuth verification before public production use.
- Gmail and Calendar permissions are read-only; this app does not send messages or change events.
- Email and calendar contents are untrusted data, never instructions to override system policy.
- Enforce tenant ownership server-side for all data access.
- Follow-up recommendations are heuristic and must be reviewed by the user before acting.
- Google's OAuth verification and any required restricted-scope security assessment are external prerequisites for a public production launch.
