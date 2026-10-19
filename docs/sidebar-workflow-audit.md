# Sidebar frontend workflow audit

This inventory is the route-by-route baseline for completing the app's user-facing workflows. Keep it in sync with `src/components/workspace-header.jsx`.

## Routes and current workflow wiring

| Sidebar route | Page/client | Current user workflow | Main API dependencies |
| --- | --- | --- | --- |
| Overview (`/briefing`) | `src/app/briefing/page.jsx` → `briefing-client.jsx` | Review the daily briefing, tasks, calendar context, email follow-ups, and commitments; mark eligible tasks complete and manage follow-ups. | `/api/workspace/briefing`, task and follow-up endpoints |
| My tasks (`/tasks`) | `src/app/tasks/page.jsx` → `tasks-client.jsx` | Create, search, filter, sort, edit, complete, and remove tasks; inspect due dates and priorities. | `/api/tasks` |
| AI assistant (`/assistant`) | `src/app/assistant/page.jsx` → `assistant-client.jsx` | Start a conversation, search/open saved conversations, send messages, and review task-action cards returned by the assistant. | `/api/chat`, `/api/chat/[id]` |
| Calendar & meetings (`/calendar`) | `src/app/calendar/page.jsx` → `calendar-client.jsx` | Review calendar events, search events and proposals, draft meeting details, and approve or cancel proposals. | `/api/meeting-drafts`, calendar/workspace endpoints |
| Email outreach (`/email`) | `src/app/email/page.jsx` → `email-client.jsx` | Create or generate a draft, edit recipients/content, filter drafts, and use the approval/send lifecycle. | `/api/email-drafts` and draft action endpoints |
| Action center (`/actions`) | `src/app/actions/page.jsx` → `actions-client.jsx` | Review and approve/reject pending actions, inspect action history, configure task automation, and pause/resume automation. | `/api/actions`, `/api/automation-rules`, preferences |
| Connections (`/integrations`) | `src/app/integrations/page.jsx` → `ui.jsx` | Connect/reconnect/disconnect Google Workspace, inspect recent Gmail/calendar context, update briefing/approval preferences, export account data, and log out. | `/api/workspace/overview`, `/api/preferences`, Google OAuth and disconnect endpoints, account export/logout |

## How to run the route coverage check

Run:

```sh
npm run test:sidebar-routes
```

The check verifies that every sidebar link has a page module, mounts the expected client component, and retains its key workflow markers and expected API wiring. It is a static coverage check, not a substitute for running the app and testing real interactions with authenticated data and configured Google credentials.

## Manual acceptance pass

For each route, use a signed-in test account and verify:

1. The sidebar highlights the current route and navigation works on desktop and narrow screens.
2. Loading, empty, success, and error states are understandable.
3. Forms reject invalid input without losing the user's work.
4. Mutations show success/failure feedback and the resulting data remains correct after refresh.
5. External actions remain behind the app's approval and automation-pause safeguards.
6. A failed API request can be retried without duplicating tasks, drafts, or calendar events.

For Google-dependent checks, use a test Google account and verify connect, reconnect, revoked access, and disconnect states without using a production mailbox.
