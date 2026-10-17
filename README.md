# Assistant

Personal AI Executive Assistant for individual managers, combining a proactive dashboard and chat with Google Workspace, tasks, daily briefings, and policy-controlled automation.

## Current status

- [x] Next.js + TypeScript application foundation and interactive dashboard preview
- [x] Initial PostgreSQL/Prisma data model
- [x] Server-side action policy foundation and health endpoint
- [x] Google OAuth authorization-code flow with state validation
- [x] Signed, HTTP-only application session cookie
- [x] AES-256-GCM encryption for stored Google access and refresh tokens
- [x] Authenticated, read-only Gmail inbox and primary-calendar overview API
- [x] Token refresh, connection status, disconnect/revoke flow, and audit events
- [x] Google Workspace integration page for live connection and read-only data preview
- [ ] Persistent task API and live AI chat
- [ ] Production deployment, end-to-end tests, and Google OAuth verification

The main dashboard still includes sample content. Live Google data is available on the Integrations page after Google OAuth credentials and the database are configured. This milestone does not send emails or modify calendar events.

## Requirements

- Node.js 20+
- PostgreSQL 15+
- Google Cloud OAuth 2.0 web client

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` and generate a unique `AUTH_SECRET` using `openssl rand -base64 48`.
3. In Google Cloud Console, enable the Gmail API and Google Calendar API, configure the OAuth consent screen, and create a Web application OAuth client.
4. Add the exact value of `GOOGLE_REDIRECT_URI` to the client's authorized redirect URIs. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
5. Install dependencies: `npm install`.
6. Generate the Prisma client: `npm run db:generate`.
7. Apply the schema locally: `npm run db:migrate`.
8. Start the app: `npm run dev`, then open `http://localhost:3000/integrations`.

Google's OAuth consent-screen configuration and any required verification are separate from this repository. Gmail read access uses a restricted scope; Google may require verification and a security assessment before a public production launch.

## Security principles

- Keep OAuth credentials and application secrets in environment variables or a managed secret store; never commit them.
- The application stores Google tokens encrypted with AES-256-GCM. Use a strong, unique `AUTH_SECRET` and protect backups.
- Use the requested read-only Gmail and Calendar scopes; no message sending or calendar writes are implemented.
- Treat email and calendar contents as untrusted input, not instructions.
- Gate sensitive writes behind explicit approval and audit executed actions.
- Enforce tenant ownership server-side for all data access.
