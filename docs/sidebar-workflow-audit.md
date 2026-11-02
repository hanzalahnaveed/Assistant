# Sidebar frontend workflow audit

This inventory is the route-by-route baseline for user-facing CRUD. Keep it in sync with \`src/components/workspace-header.jsx\`.

## Routes and current workflow wiring

| Sidebar route | Page/client | Create | Read | Update | Delete / archive |
| --- | --- | --- | --- | --- | --- |
| Overview (\`/dashboard/briefing\`) | \`briefing-client.jsx\` | Propose a task from a commitment | Briefing, tasks, events, follow-up candidates | Complete/reopen tasks; dismiss/restore follow-ups | Follow-up dismissal is reversible; source email/calendar data stays provider-owned |
| AI assistant (\`/dashboard\`) | \`assistant-client.jsx\` | New conversation and messages | Conversation list and message history | Rename conversation | Delete conversation and its message history; individual chat messages remain part of an immutable transcript |
| Schedule (\`/dashboard/schedule\`) | \`schedule-client.jsx\` | Task or Google Calendar event | Unified task/event list and date-range views | Edit task fields/status and Google event details | Tasks are soft-cancelled; calendar events are cancelled in Google Calendar. Existing \`/dashboard/tasks\` and \`/dashboard/calendar\` URLs redirect to Schedule |
| Email (\`/dashboard/email\`) | \`email-client.jsx\` | Compose outbound draft; inbound messages are imported by the agent | Outbound drafts and chronological inbound list; popup loads full message from Gmail | Edit/cancel draft; approve exact draft; Gmail read/unread, star, archive/move-to-inbox | Cancel unsent drafts; move inbound message to Gmail Trash and restore it |
| Action center (\`/dashboard/actions\`) | \`actions-client.jsx\` | Propose action and automation rule | Pending and historical actions; configured rules | Approve/reject actions; edit rule and global pause state | Delete automation rule. Action/audit history is retained rather than erased |
| Connections (\`/dashboard/integrations\`) | \`ui.jsx\` | Connect Google | Connection status and permission checks | Reconnect, edit display name, timezone and preferences | Disconnect/revoke stored Google access; export account data |

## CRUD semantics and ownership

- **Tasks:** task APIs are tenant-scoped. A task deletion is a soft-cancel so schedule history and task references remain coherent.
- **Google Calendar:** event edits and cancellations go through the Google Calendar API, not just the local mirror. Availability is checked before updates; provider event IDs and etags are used where available. A provider failure does not pretend the local copy was changed successfully.
- **Gmail:** messages are provider-owned. Message details are loaded from Gmail on demand. Read/unread, star, archive, inbox restore, Trash, and untrash operations call Gmail APIs. Existing OAuth connections must reconnect to grant \`gmail.modify\`. The app does not request permanent-delete scope.
- **Email drafts:** outbound drafts are local records. Create, edit, cancel, approval and send are distinct actions. Sending stays behind approval of the exact version and a separate explicit Send confirmation.
- **Inbound email:** an imported message is a reference to Gmail rather than a second locally editable copy. The app can process/retry its classification, review task proposals and meeting options, and manage the original Gmail message through the provider controls.
- **Conversations:** rename and delete operate only on conversations owned by the signed-in user. Delete removes the conversation and its child messages. Individual transcript messages are intentionally not editable independently because they form the stored assistant conversation history.
- **Notifications and briefings:** individual items can be marked read and deleted. All unread items can be marked read and previously read items can be cleared in bulk.
- **Follow-ups:** follow-ups are derived from source email/calendar context. Dismiss/restore is the supported reversible lifecycle rather than editing generated evidence.
- **Actions and audit events:** action status follows its approval/execution state machine; audit events are append-only. They are not arbitrary CRUD records and are intentionally not hard-deleted through the workspace.
- **Account data:** display name and preferences can be updated; account data can be exported. OAuth credentials are never exposed to the browser.

## Automated coverage

Run:

\`\`\`sh
npm run test:crud-surface
npm run test:google-data-crud
npm run test:sidebar-routes
npm run verify:javascript
\`\`\`

The CRUD surface test checks route methods and verifies the visible CRUD controls are wired into the client pages. The Google action test validates the Gmail label mutations and confirms that no permanent-delete action is exposed. These are deterministic checks; they do not replace the live acceptance pass against a dedicated Google test account.

## Manual provider acceptance

Use a dedicated Google test account, never a production mailbox:

1. Reconnect Google and confirm the \`gmail.modify\` capability is granted on Connections.
2. Open an inbound message; mark it read/unread, star/unstar, archive it and move it back to the inbox.
3. Move a test message to Trash and restore it from the email popup.
4. Edit and cancel an outbound draft. Approve a separate draft, verify its exact content, then send it to the dedicated test address.
5. Create/edit/cancel a Calendar test event and verify the provider calendar reflects each change.
6. Confirm task, conversation, notification, briefing and automation-rule changes persist after refresh.
