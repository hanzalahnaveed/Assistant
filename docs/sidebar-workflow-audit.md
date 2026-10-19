# Sidebar frontend workflow audit

This inventory is the route-by-route baseline for completing the app's user-facing workflows. Keep it in sync with `src/components/workspace-header.jsx`.

## Routes and current workflow wiring

Google integration verification is available from Connections; its live checks are read-only and do not send mail or create events.

| Sidebar route | Page/client | Current user workflow | Main API dependencies |
| --- | --- | --- | --- |
| Overview (`/briefing`) | `src/app/briefing/page.jsx` → `briefing-client.jsx` | Review the daily briefing, tasks, calendar context, email follow-ups, and commitments; mark eligible tasks complete and manage follow-ups. | `/api/workspace/briefing`, task and follow-up endpoints |
| My tasks (`/tasks`) | `src/app/tasks/page.jsx` → `tasks-client.jsx` | Create, search, filter, sort, edit, complete, and archive tasks; inspect due dates and priorities, switch directly to the in-progress queue, select visible active tasks, and complete multiple tasks in one operation with retry feedback for partial failures. API E2E coverage exercises invalid input, editing, due dates, status transitions, completion timestamps, and archive behavior. | `/api/tasks` |
| AI assistant (`/assistant`) | `src/app/assistant/page.jsx` → `assistant-client.jsx` | Start a conversation, search/open saved conversations, send messages, and review task-action cards returned by the assistant. | `/api/chat`, `/api/chat/[id]` |
| Calendar & meetings (`/calendar`) | `src/app/calendar/page.jsx` → `calendar-client.jsx` | Review and search upcoming calendar events; create, edit, approve, and cancel meeting proposals; validate title, chronological time range, IANA timezone, and attendee emails on both client and server; interpret datetime-local values in the selected timezone and reject nonexistent daylight-saving times. Creation remains a separate explicit action requiring approval, event-write scope, an unpaused automation state, and a successful availability check. | `/api/meeting-drafts`, calendar/workspace endpoints |
| Email outreach (`/email`) | `src/app/email/page.jsx` → `email-client.jsx` | Create or generate a draft, edit recipients/content, filter drafts, and use the approval/send lifecycle. | `/api/email-drafts` and draft action endpoints |
| Action center (`/actions`) | `src/app/actions/page.jsx` → `actions-client.jsx` | Review and approve/reject pending actions, inspect action history, configure task automation, and pause/resume automation. | `/api/actions`, `/api/automation-rules`, preferences |
| Connections (`/integrations`) | `src/app/integrations/page.jsx` → `ui.jsx` | Connect/reconnect/disconnect Google Workspace, inspect recent Gmail/calendar context, update briefing/approval preferences, export account data, and log out. | `/api/workspace/overview`, `/api/preferences`, Google OAuth and disconnect endpoints, account export/logout |

## How to run the route coverage check

Run:

```sh
npm run test:sidebar-routes
```

The route check verifies that every sidebar link has a page module, mounts the expected client component, and retains key workflow markers and API wiring. It checks task bulk completion and the in-progress view, plus calendar form validation, timezone-aware date conversion wiring, server-side IANA timezone and chronological-time validation, and E2E coverage for meeting proposal create/edit/approve/cancel and safe creation denial. Run `npm run test:calendar-timezone` for executable timezone conversion checks, including UTC, Karachi, New York daylight/standard time, and nonexistent daylight-saving times. These checks do not replace a full build and authenticated Google Calendar acceptance pass.

## Manual acceptance pass

For each route, use a signed-in test account and verify:

1. The sidebar highlights the current route and navigation works on desktop and narrow screens.
2. Loading, empty, success, and error states are understandable.
3. Forms reject invalid input without losing the user's work.
4. Mutations show success/failure feedback and the resulting data remains correct after refresh.
5. External actions remain behind the app's approval and automation-pause safeguards.
6. A failed API request can be retried without duplicating tasks, drafts, or calendar events.

For Google-dependent checks, use a test Google account and verify connect, reconnect, revoked access, and disconnect states without using a production mailbox.
