# Assistant

Personal AI Executive Assistant for individual managers, combining a proactive dashboard and chat with Google Workspace, tasks, daily briefings, and policy-controlled automation.

## Current status

- [x] Next.js + TypeScript application foundation
- [x] PostgreSQL/Prisma data model and tenant-scoped APIs
- [x] Google OAuth authorization-code flow with state validation and signed HTTP-only session
- [x] AES-256-GCM encryption for stored Google access and refresh tokens
- [x] Authenticated, read-only Gmail inbox and primary-calendar integration
- [x] Authenticated task CRUD, task audit events, and soft-archive
- [x] Persistent conversations and messages with OpenAI-compatible AI chat
- [x] Live daily briefing with task metrics, today's calendar, and inbox follow-up recommendations
- [x] Explainable rule-based email triage and one-click creation of a follow-up task
- [x] Persistent user preferences for daily briefing and approval mode
- [x] Timezone-aware scheduled briefing worker with idempotent daily generation
- [x] Persistent briefing history and in-app notifications with read/unread state
- [x] Context-aware task ranking based on priority, due-time urgency, age, and business-critical wording
- [x] CI validation, production build, and end-to-end test workflow
- [ ] Real Google account verification and production deployment

## Proactive daily briefing

Open `/briefing` to see open/overdue/due-today tasks, high-priority work, today's calendar, and suggested inbox follow-ups. Follow-up scores use transparent heuristics over email subject, snippet, and unread labels; they are recommendations, not proof that a response is required. Use **Create follow-up task** to save a persistent task. This action does not send or modify email.

Daily briefing preferences are stored per user through `/api/preferences`. The scheduled worker checks users every 15 minutes, evaluates each user’s configured timezone and delivery hour, then persists one briefing per local calendar day. Repeated scheduler calls are idempotent. Saved briefings appear in the authenticated notification inbox at `/api/notifications`; users can mark notifications read. Task ranking combines explicit priority, deadline urgency, in-progress status, task age, and business-critical keywords, with reasons exposed to the UI.\n\nThe worker endpoint is `POST /api/cron/daily-briefings` and requires `Authorization: Bearer $CRON_SECRET`. Configure a strong `CRON_SECRET` in the deployment environment, then configure GitHub repository variable `APP_BASE_URL` (the deployed app origin) and repository secret `CRON_SECRET`. The GitHub Actions workflow `.github/workflows/daily-briefings.yml` runs every 15 minutes and safely skips if either setting is missing. This milestone delivers persistent in-app briefings, not external email or push notifications. Approval mode remains a preference and does not authorize external actions by itself.

## Local setup

Requirements: Node.js 20+, PostgreSQL 15+, Google Cloud OAuth client (for live Workspace data), and an OpenAI-compatible API key (for live AI chat).

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, a unique `AUTH_SECRET`, and a unique `CRON_SECRET` using `openssl rand -base64 48`.
3. Configure Gmail API and Google Calendar API, OAuth consent, and an authorized redirect URI matching `GOOGLE_REDIRECT_URI`.
4. Install dependencies with `npm install`, then run `npm run db:generate` and `npm run db:migrate`.
5. Set `OPENAI_API_KEY`; optionally configure `OPENAI_MODEL` and `OPENAI_BASE_URL`.
6. Run `npm run dev`, then open `/briefing`.

Google's OAuth consent-screen verification and any restricted-scope security assessment are external prerequisites for public production launch.

## Security principles

- Keep OAuth credentials and application secrets in environment variables or a managed secret store; never commit them.
- Google tokens are encrypted at rest with AES-256-GCM.
- Gmail and Calendar permissions are read-only; this app does not send messages or change events.
- Email and calendar contents are untrusted data, never instructions to override system policy.
- Enforce tenant ownership server-side for all data access.
- A follow-up recommendation is heuristic and must be reviewed by the user before acting.
