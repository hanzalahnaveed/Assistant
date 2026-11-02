import assert from "node:assert/strict";
import { findFreeCalendarSlot, isCalendarSlotFree } from "./google-live-acceptance.mjs";

const now = Date.parse("2030-01-07T08:00:00.000Z");
const events = [
  { id: "busy", start: { dateTime: "2030-01-07T10:00:00.000Z" }, end: { dateTime: "2030-01-07T11:00:00.000Z" } },
  { id: "transparent", transparency: "transparent", start: { dateTime: "2030-01-07T11:00:00.000Z" }, end: { dateTime: "2030-01-07T12:00:00.000Z" } },
  { id: "cancelled", status: "cancelled", start: { dateTime: "2030-01-07T12:00:00.000Z" }, end: { dateTime: "2030-01-07T13:00:00.000Z" } },
  { id: "all-day", start: { date: "2030-01-08" }, end: { date: "2030-01-09" } },
];
assert.equal(isCalendarSlotFree(events, "2030-01-07T10:30:00.000Z", 30, "UTC"), false);
assert.equal(isCalendarSlotFree(events, "2030-01-07T11:00:00.000Z", 30, "UTC"), true);
assert.equal(isCalendarSlotFree(events, "2030-01-07T12:00:00.000Z", 30, "UTC"), true);
assert.equal(isCalendarSlotFree(events, "2030-01-08T10:00:00.000Z", 30, "UTC"), false);
assert.equal(findFreeCalendarSlot(events, { now, timeZone: "UTC", durationMinutes: 30, horizonDays: 2 }), "2030-01-07T09:00:00.000Z");

const karachiSlot = findFreeCalendarSlot([], {
  now: Date.parse("2030-01-07T03:00:00.000Z"),
  timeZone: "Asia/Karachi",
  durationMinutes: 30,
  horizonDays: 2,
});
assert.ok(karachiSlot);
const karachiHour = Number(new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Karachi", hour: "2-digit", hourCycle: "h23",
}).format(new Date(karachiSlot)));
assert.ok(karachiHour >= 9 && karachiHour <= 16);

const fridayEvening = Date.parse("2030-01-04T17:00:00.000Z");
const mondaySlot = findFreeCalendarSlot([], { now: fridayEvening, timeZone: "UTC", horizonDays: 4 });
assert.ok(mondaySlot);
assert.equal(new Date(mondaySlot).getUTCDay(), 1);

console.log("PASS Google live acceptance helper tests: timed/all-day conflicts, cancellation/transparency, timezone-aware free-slot search, and weekend handling");
