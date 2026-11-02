# Milestone 8 — Unified AI orchestration

## Objective

Make the assistant conversation a practical entry point into existing application capabilities while preserving each module's ownership and approval lifecycle.

## Delivered in this increment

- Chat retains its existing task proposal tool, which routes task requests through the shared ActionRecord service and configured AUTO / CONFIRM / BLOCK policy.
- Chat can prepare an outbound email draft when the user explicitly asks for one and supplies an exact recipient address.
- Chat-created drafts are persisted as ordinary `EmailDraft` records with `DRAFT` status and an audit event identifying the AI chat source.
- The assistant explicitly states that the draft has not been approved or sent.
- The existing Email workflow remains responsible for editing, approving the exact draft version, and separately confirming Send. Chat does not send email.
- Chat continues to reuse the briefing intelligence service for current tasks, calendar events and evidence-based inbox follow-up candidates.

## Safety and ownership boundaries

- Connected email content, calendar content and user-provided text remain untrusted context, not instructions that can override system behavior.
- A recipient address must be supplied; the assistant must not invent one.
- Email drafting is a local application write only. No provider send call is made from chat.
- Task creation continues through the existing policy-controlled action service.
- Calendar event creation and other external actions remain in their dedicated confirmation workflows; chat must not bypass those controls.

## Current scope boundary

This increment establishes the first cross-module chat actions: task proposals and outbound email drafts. It does not yet provide multi-action execution in a single turn, direct calendar mutation, or a general-purpose workflow planner. Those are subsequent integration increments and must reuse the existing service and approval boundaries.

## Automated contract check

Run:

```sh
npm run test:chat-orchestration
```

CI runs this check alongside the existing API, CRUD, migration, build and end-to-end jobs.
