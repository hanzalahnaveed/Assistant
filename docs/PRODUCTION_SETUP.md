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
7. Google sign-in is optional. If enabled, test it separately from email/password signup/login. Then use the Google integration connection to grant Gmail inbox-read, Gmail send, Calendar read, and Calendar event-creation access. Authentication alone does not connect Workspace data. Email sending is exposed only in the dedicated outreach workflow and requires both draft approval and a separate send confirmation. Calendar event creation is exposed only in the meeting workspace and requires proposal approval and a separate create confirmation; creating events can send attendee invitations.

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

## 6. End-to-end smoke test

Use credentials-based sign-up/sign-in for the core authentication checks. If Google OAuth is configured, also use a real Google test account and verify its optional flow:

- [ ] `/api/health` responds successfully.
- [ ] `/auth` loads and Google sign-up creates the first account.
- [ ] Sign out, then sign in with the existing account; signing in with an unregistered account should not create one.
- [ ] Create, update, complete, and archive a task; refresh and verify persistence.
- [ ] Open Assistant and send a message; confirm the configured AI provider returns a response and the conversation persists.
- [ ] Connect Google Workspace separately; confirm Gmail messages and primary-calendar events load.
- [ ] Confirm Gmail inbox and Calendar reads work as expected.
- [ ] Confirm outreach requires approval and a separate send confirmation; test sending only with a designated test recipient.
- [ ] Open the briefing page; check task metrics and connected Workspace context.
- [ ] Set the briefing preference to a suitable hour, manually run the scheduler, and confirm the briefing/notification is persisted. Re-running it for the same local date should not create duplicates.
- [ ] Verify sign-out protects all workspace routes and clears the session.
- [ ] Review deployment logs for OAuth, database, or AI-provider errors.

## 7. What this repository cannot configure on your behalf

Google Cloud OAuth clients, consent-screen publication/verification, billing/API access, hosting projects/domains, database instances, and secret values are owned by your external accounts. The GitHub repository connection does not grant access to those accounts or their secrets. Do not commit real credentials. Once those account-side resources and credentials exist, put the values in the appropriate secret manager and complete the smoke test above.
