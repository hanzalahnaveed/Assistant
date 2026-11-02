import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/app/api/chat/route.js", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

assert.match(route, /name:\s*"propose_task"/);
assert.match(route, /name:\s*"prepare_email_draft"/);
assert.match(route, /name:\s*"propose_calendar_event"/);
assert.match(route, /name:\s*"find_calendar_availability"/);
assert.match(route, /findAvailableCalendarSlots/);
assert.match(route, /maxResults", "250"/);
assert.match(route, /for \(let index = 0; index < toolCalls.length; index \+= 1\)/);
assert.match(route, /prisma\.actionRecord\.findMany/);
assert.match(route, /prisma\.emailDraft\.findMany/);
assert.match(route, /Pending assistant actions/);
assert.match(route, /Outbound email drafts/);
assert.match(route, /createTaskActionProposal/);
assert.match(route, /prisma\.emailDraft\.create/);
assert.match(route, /type: "CREATE_EMAIL_DRAFT", status: draft\.status/);
assert.match(route, /CREATE_CALENDAR_EVENT/);
assert.match(route, /eventType: "EMAIL_DRAFT_GENERATED"/);
assert.match(route, /has not been approved or sent/);
assert.match(route, /metadata: \{ actions: reply\.actions \|\| \[reply\.action\] \}/);
assert.equal(packageJson.scripts["test:chat-orchestration"], "node scripts/chat-orchestration-test.mjs");
assert.equal(packageJson.scripts["test:calendar-availability"], "node scripts/calendar-availability-test.mjs");

const availabilityService = fs.readFileSync(new URL("../src/lib/calendar/availability.mjs", import.meta.url), "utf8");
assert.match(availabilityService, /findAvailableCalendarSlots/);
assert.match(availabilityService, /localDateTimeToIso/);
const calendarService = fs.readFileSync(new URL("../src/lib/actions/calendar.js", import.meta.url), "utf8");
assert.match(calendarService, /executeCalendarEventAction/);
assert.match(calendarService, /calendar.events/);
assert.match(calendarService, /CALENDAR_CONFLICT/);
assert.match(calendarService, /createHash/);
assert.match(fs.readFileSync(new URL("../src/app/api/actions/[id]/route.js", import.meta.url), "utf8"), /executeCalendarEventAction/);
console.log("PASS multi-action orchestration and approved calendar execution contract.");
