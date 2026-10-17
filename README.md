# Assistant

Personal AI Executive Assistant for individual managers, combining a proactive dashboard and chat with Google Workspace, tasks, daily briefings, and policy-controlled automation.

## Current status

- [x] Next.js + TypeScript application foundation
- [x] Interactive dashboard preview for priorities, inbox, calendar, and assistant chat
- [x] Initial PostgreSQL/Prisma data model
- [x] Server-side action policy foundation
- [x] Health endpoint
- [ ] Authentication and account isolation
- [ ] Google OAuth and Gmail/Calendar read-only sync
- [ ] Live AI chat, task extraction, and daily briefing
- [ ] Background jobs, action execution, and audit UI

The dashboard currently uses clearly labeled sample data. It does not access a mailbox, call an AI provider, or execute external actions yet.

## Requirements

- Node.js 20+
- PostgreSQL 15+
- npm

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Install dependencies with `npm install`.
3. Generate the Prisma client with `npm run db:generate`.
4. Create/apply a migration with `npm run db:migrate`.
5. Start the app with `npm run dev`.

## Security principles

- Keep credentials in environment variables or a managed secret store; never commit them.
- Use least-privilege Google OAuth scopes.
- Treat email and calendar contents as untrusted input, not instructions.
- Gate sensitive writes behind explicit user approval and audit every executed action.
- Enforce tenant ownership server-side on every data access.
