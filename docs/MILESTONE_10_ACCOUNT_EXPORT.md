# Milestone 10 — Complete account data export

## Objective

Make the existing account export cover all user-owned application records, including inbound email processing history and derived follow-ups, while excluding credentials and opaque provider cursors.

## Delivered

- Expanded the authenticated JSON export to include inbound email queue/classification records and follow-up recommendations.
- Included a safe operational snapshot of email-agent state: enable time, pages scanned, last scan/worker timestamps, last worker error, and record timestamps.
- Excluded encrypted Google access/refresh tokens and the opaque Gmail pagination token.
- Preserved existing account, preferences, integration metadata, schedule items, conversations/messages, automation rules, actions, audit events, briefings, notifications, and outbound drafts.
- Incremented the export format version to 2 so consumers can distinguish the expanded schema.
- Added a deterministic contract check and CI step.

## Privacy boundary

- Export remains authenticated and user-scoped through the session user ID.
- Provider credentials are never part of the export.
- The Gmail page token is intentionally omitted because it is an opaque operational cursor, not user content.
- Integration metadata (provider account, email, scopes, status and timestamps) remains exportable.
- Export responses retain no-store caching and attachment download headers.

## Verification

Run `npm run test:account-export`. CI runs the contract check with Prisma validation, migrations, production build, and end-to-end coverage.
