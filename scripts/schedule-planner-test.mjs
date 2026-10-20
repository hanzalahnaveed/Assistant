import assert from "node:assert/strict";
import { buildDailySchedule } from "../src/lib/schedule/planner.mjs";

const tasks = [
  { id: "low", title: "Low priority task", priority: "LOW", dueAt: null, createdAt: "2026-10-01T00:00:00.000Z" },
  { id: "urgent", title: "Urgent task", priority: "URGENT", dueAt: "2026-10-20T15:00:00.000Z", createdAt: "2026-10-02T00:00:00.000Z" },
  { id: "medium", title: "Medium priority task", priority: "MEDIUM", dueAt: null, createdAt: "2026-10-03T00:00:00.000Z" },
];

const schedule = buildDailySchedule({
  tasks,
  localDate: "2026-10-20",
  timezone: "UTC",
  events: [
    { id: "busy", title: "Existing meeting", startAt: "2026-10-20T10:00:00.000Z", endAt: "2026-10-20T11:30:00.000Z" },
    { id: "free", title: "Free hold", startAt: "2026-10-20T13:00:00.000Z", endAt: "2026-10-20T14:00:00.000Z", transparency: "transparent" },
  ],
});
assert.equal(schedule.blocks.length, 3);
assert.equal(schedule.blocks[0].taskId, "urgent");
assert.equal(schedule.blocks[0].startAt, "2026-10-20T09:00:00.000Z");
assert.equal(schedule.blocks[1].startAt, "2026-10-20T11:30:00.000Z");
assert.equal(schedule.blocks[2].startAt, "2026-10-20T12:30:00.000Z");
assert.ok(schedule.blocks.every((block) => new Date(block.endAt) > new Date(block.startAt)));
assert.ok(!schedule.blocks.some((block) =>
  new Date(block.startAt) < new Date("2026-10-20T11:30:00.000Z") &&
  new Date(block.endAt) > new Date("2026-10-20T10:00:00.000Z")
));

const allDay = buildDailySchedule({
  tasks,
  localDate: "2026-10-20",
  timezone: "UTC",
  events: [{ id: "holiday", title: "All day event", startAt: "2026-10-20", endAt: "2026-10-21", allDay: true }],
});
assert.equal(allDay.blocks.length, 0);
assert.equal(allDay.unscheduled.length, 3);

const dst = buildDailySchedule({
  tasks: [tasks[0]],
  localDate: "2026-03-08",
  timezone: "America/New_York",
});
assert.equal(dst.blocks.length, 1);
assert.equal(dst.blocks[0].startAt, "2026-03-08T13:00:00.000Z");
assert.equal(dst.blocks[0].endAt, "2026-03-08T14:00:00.000Z");

console.log("Daily schedule planner tests passed: priorities, timed conflicts, all-day events, and DST timezone handling.");
