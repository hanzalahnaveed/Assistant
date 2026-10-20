# Sidebar frontend workflow audit

This inventory is the route-by-route baseline for completing the app's user-facing workflows. Keep it in sync with `src/components/workspace-header.jsx`.

## Routes and current workflow wiring

Google integration verification is available from Connections; its live checks are read-only and do not send mail or create events.

| Sidebar route | Page/client | Current user workflow | Main API dependencies |
| --- | --- | --- | --- |
| Overview (`/dashboard/briefing`) | `src/app/dashboard/briefing/page.jsx` → `briefing-client.jsx` | Review the daily briefing, tasks, calendar context, email follow-ups, and commitments; mark eligible tasks complete and manage follow-ups. | `/api/workspace/briefing`, task and follow-up endpoints |
| AI assistant (`/dashboard`) | `src/app/dashboard/page.jsx` → `assistant-client.jsx` | Start a conversation, search/open saved conversations, send messages, and review task-action cards returned by the assistant. | `/api/chat`, `/api/chat/[id]` |
| Schedule (`/dashboard/schedule`) | `src/app/dashboard/schedule/page.jsx` → `schedule-client.jsx` | Create and manage one persisted schedule-item collection; switch between a mixed list and day/week/month calendar; search, filter, edit, complete, bulk-complete, and archive local items; sync calendar-backed items with conflict checks and explicit confirmation. Existing `/dashboard/tasks` and `/dashboard/calendar` URLs redirect to Schedule. | `/api/tasks`, `/api/calendar-events`, `/api/preferences` |
| Email outreach (`/dashboard/email`) | `src/app/dashboard/email/page.jsx` → `email-client.jsx` | Create or generate a draft, edit recipients/content, filter drafts, and use the approval/send lifecycle. | `/api/email-drafts` and draft action endpoints |
| Action center (`/dashboard/actions`) | `src/app/dashboard/actions/page.jsx` → `actions-client.jsx` | Review and approve/reject pending actions, inspect action history, configure task automation, and pause/resume automation. | `/api/actions`, `/api/automation-rules`, preferences |
| Connections (`/dashboard/integrations`) | `src/app/dashboard/integrations/page.jsx` → `ui.jsx` | Connect/reconnect/disconnect Google Workspace, inspect recent Gmail/calendar context, update briefing/approval preferences, export account data, and log out. | `/api/workspace/overview`, `/api/preferences`, Google OAuth and disconnect endpoints, account export/logout |

## How to run the route coverage check

Run:

```sh
npm run test:sidebar-routes
```

The route check verifies that every sidebar link has a page module, mounts the expected client component, and retains key workflow markers and API wiring. It checks embedded task bulk completion and the in-progress view, plus unified task/event creation, timezone-aware date conversion, server-side event validation and permission/pause/availability enforcement, and E2E coverage for direct event creation denial without permission. Run `npm run test:calendar-timezone` for executable timezone conversion checks, including UTC, Karachi, New York daylight/standard time, and nonexistent daylight-saving times. These checks do not replace a full build and authenticated Google Calendar acceptance pass.

## Manual acceptance pass

For each route, use a signed-in test account and verify:

1. The sidebar highlights the current route and navigation works on desktop and narrow screens.
2. Loading, empty, success, and error states are understandable.
3. Forms reject invalid input without losing the user's work.
4. Mutations show success/failure feedback and the resulting data remains correct after refresh.
5. External actions remain behind the app's approval and automation-pause safeguards.
6. A failed API request can be retried without duplicating tasks or calendar events.

For Google-dependent checks, use a test Google account and verify connect, reconnect, revoked access, and disconnect states without using a production mailbox.
