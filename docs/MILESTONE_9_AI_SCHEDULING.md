# Milestone 9 — AI-assisted meeting scheduling

## Objective

Let the assistant find real free meeting times from the connected primary Google Calendar, then hand a selected time into the existing approval-controlled event workflow.

## Delivered

- Added the read-only `find_calendar_availability` chat tool. It accepts a date range, meeting duration, timezone, and local working hours.
- Availability is computed from live Google Calendar events, including recurring instances, all-day events, cancelled events, and transparent/free events.
- Suggestions default to weekdays and 09:00–17:00 local working hours, use 30-minute start increments, and return the earliest six matching slots.
- Time conversion is timezone-aware. Nonexistent daylight-saving wall-clock times are skipped; date ranges are bounded to 31 days.
- Google Calendar read permission and a live token are required. Large result sets fail closed rather than returning potentially incomplete availability.
- Availability lookup never creates, edits, or invites anyone. The user can select a suggested slot in a follow-up and ask the assistant to prepare an event; the existing Action Center approval remains required before provider-side creation.
- Added deterministic availability tests and a CI step.

## Safety and limits

- Only the signed-in user’s primary Google Calendar is queried.
- No calendar write call or invitation is sent by the availability tool.
- Working hours default to Monday–Friday, 09:00–17:00 in the requested IANA timezone. This milestone does not infer holidays, travel time, attendee calendars, or external availability.
- Searches are capped at 31 calendar days and 10 provider pages; incomplete event retrieval returns an error instead of claiming a slot is free.

## Verification

Run `npm run test:calendar-availability` and `npm run test:chat-orchestration`. CI runs both checks plus the existing production build and end-to-end suite. Live slot discovery requires an owner-connected Google Calendar test account.
