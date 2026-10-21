import assert from "node:assert/strict";
import { classifyIntent, generateDummyClassification, normalizeIntent } from "../src/lib/email-agent/dummy-classifier.mjs";

assert.equal(classifyIntent({ subject: "Please schedule a meeting", body: "Are you free next week?" }), "MEETING_REQUEST");
assert.equal(classifyIntent({ subject: "Move our meeting", body: "Can we reschedule to Friday?" }), "RESCHEDULE");
assert.equal(classifyIntent({ subject: "Calendar invite", body: "I cannot attend this meeting." }), "DECLINE_INVITE");
assert.equal(classifyIntent({ subject: "Action required", body: "Please review the proposal and send feedback." }), "TASK_DELEGATION");
assert.equal(classifyIntent({ subject: "Hello", body: "Just sharing an update." }), "OTHER");
assert.equal(normalizeIntent({ category: "TASK" }), "TASK_DELEGATION");

const meeting = generateDummyClassification({
  subject: "Schedule a meeting", sender: "colleague@example.com",
  body: "Could we meet next week?", settings: { signature: "Manager" },
  availableSlots: [{ startAt: "2030-01-01T10:00:00.000Z", label: "Tuesday at 10 AM" }]
});
assert.equal(meeting.mode, "DUMMY");
assert.equal(meeting.intent, "MEETING_REQUEST");
assert.equal(meeting.category, "MEETING");
assert.match(meeting.replyBody, /Tuesday at 10 AM/);
assert.match(meeting.replyBody, /no meeting has been booked/i);
assert.match(meeting.replyBody, /Manager$/);

const task = generateDummyClassification({ subject: "Please prepare report", body: "Please prepare the report by tomorrow." });
assert.equal(task.intent, "TASK_DELEGATION");
assert.equal(task.category, "TASK");
assert.ok(task.task);
assert.equal(task.task.dueAt, null);

const decline = generateDummyClassification({ subject: "Meeting invitation", body: "I cannot attend this meeting." });
assert.equal(decline.intent, "DECLINE_INVITE");
assert.equal(decline.meeting, null);

const sensitive = generateDummyClassification({ subject: "Invoice payment", body: "Please review the payment details." });
assert.equal(sensitive.category, "SENSITIVE");
assert.equal(sensitive.sensitive, true);
console.log("Email-agent dummy classifier tests passed.");
