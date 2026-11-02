import assert from "node:assert/strict";
import { findAvailableCalendarSlots } from "../src/lib/calendar/availability.mjs";

const result = findAvailableCalendarSlots({
  events: [
    { start: { dateTime: "2026-11-02T09:30:00Z" }, end: { dateTime: "2026-11-02T10:30:00Z" } },
    { start: { date: "2026-11-03" }, end: { date: "2026-11-04" } },
    { status: "cancelled", start: { dateTime: "2026-11-02T10:30:00Z" }, end: { dateTime: "2026-11-02T11:30:00Z" } },
    { transparency: "transparent", start: { dateTime: "2026-11-02T11:00:00Z" }, end: { dateTime: "2026-11-02T12:00:00Z" } },
  ],
  startDate: "2026-11-02",
  endDate: "2026-11-03",
  durationMinutes: 60,
  timezone: "UTC",
  workdayStart: "09:00",
  workdayEnd: "12:00",
  maxSlots: 6,
});
assert.deepEqual(result.slots.map(slot => slot.localStart), ["2026-11-02T10:30", "2026-11-02T11:00"], "busy meetings block overlaps; cancelled and transparent events do not");
assert.equal(result.searchedDays, 2);

const weekend = findAvailableCalendarSlots({
  events: [],
  startDate: "2026-11-07",
  endDate: "2026-11-08",
  durationMinutes: 30,
  timezone: "UTC",
});
assert.equal(weekend.slots.length, 0, "weekends are excluded by default");

const dst = findAvailableCalendarSlots({
  events: [],
  startDate: "2026-03-08",
  endDate: "2026-03-08",
  durationMinutes: 30,
  timezone: "America/New_York",
  workdayStart: "02:00",
  workdayEnd: "04:00",
  weekdays: [0],
});
assert.equal(dst.slots[0]?.localStart, "2026-03-08T03:00", "nonexistent DST wall-clock times are skipped");

assert.throws(() => findAvailableCalendarSlots({
  events: [], startDate: "2026-11-01", endDate: "2026-12-05", durationMinutes: 30, timezone: "UTC",
}), /31 days/);
assert.throws(() => findAvailableCalendarSlots({
  events: [], startDate: "2026-11-02", endDate: "2026-11-02", durationMinutes: 10, timezone: "UTC",
}), /15 minutes/);
assert.throws(() => findAvailableCalendarSlots({
  events: [], startDate: "2026-11-02", endDate: "2026-11-02", durationMinutes: 30, timezone: "Not/A_Timezone",
}), /IANA timezone/);
console.log("All calendar availability checks passed.");
