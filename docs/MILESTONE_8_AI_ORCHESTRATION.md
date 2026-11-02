# Milestone 8 — Unified AI orchestration

## Objective

Make assistant chat a unified entry point into task, email, and calendar workflows while preserving each module approval and execution boundaries.

## Delivered

- Chat processes every returned function tool call in order rather than selecting only the first task or email tool. Each action is persisted independently and invalid or unsupported calls are reported.
- Task proposals continue through the existing AUTO / CONFIRM / BLOCK policy and idempotent action service.
- Email requests create audited local EmailDraft records only. They remain DRAFT and chat never approves or sends them.
- Explicit calendar scheduling requests create pending CREATE_CALENDAR_EVENT actions. Chat does not write to Google Calendar.
- Action Center can review and approve calendar proposals. Approval checks Google connection and write scope, claims the action once, checks overlapping events, creates the event using a deterministic provider ID, saves the local schedule mirror, and records an audit event.
- Assistant context includes current tasks, calendar events, inbox follow-up candidates, pending actions, and email draft metadata.
- Action Center renders task and calendar proposals and reports the correct action outcome.

## Safety and ownership

- Connected content and user-supplied text remain untrusted context.
- Calendar creation requires explicit Action Center approval, a connected Google account with calendar event write permission, valid timestamps and timezone, and a conflict check. Attendee invitations are sent only after approval.
- Calendar proposals remain pending if Google Calendar is not connected; approval returns a clear connection or permission error without creating an event.
- Email drafts require an exact recipient address and are never sent from chat.
- Task actions retain the existing approval policy.

## Verification

Run `npm run test:chat-orchestration`. CI runs the contract check with the existing project checks. Live Google Calendar and Gmail acceptance require owner-provided connected test accounts and credentials.
