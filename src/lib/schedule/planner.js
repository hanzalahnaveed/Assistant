import { localDateTimeToIso } from "@/lib/calendar-timezone.mjs";

const priorityWeight = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function shiftDate(date, amount) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return value.getUTCFullYear() + "-" + String(value.getUTCMonth() + 1).padStart(2, "0") + "-" + String(value.getUTCDate()).padStart(2, "0");
}

function intervalForEvent(event, timezone) {
  if (event.allDay || (event.startAt && /^\d{4}-\d{2}-\d{2}$/.test(event.startAt))) {
    const startAt = localDateTimeToIso(event.startAt + "T00:00", timezone);
    const endAt = localDateTimeToIso(event.endAt + "T00:00", timezone);
    return startAt && endAt ? { start: new Date(startAt).getTime(), end: new Date(endAt).getTime() } : null;
  }
  const start = new Date(event.startAt).getTime();
  const end = new Date(event.endAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

export function buildDailySchedule({ tasks, events = [], localDate, timezone }) {
  const dayStartIso = localDateTimeToIso(localDate + "T00:00", timezone);
  const dayEndIso = localDateTimeToIso(shiftDate(localDate, 1) + "T00:00", timezone);
  const workStartIso = localDateTimeToIso(localDate + "T09:00", timezone);
  const workEndIso = localDateTimeToIso(localDate + "T17:00", timezone);
  if (!dayStartIso || !dayEndIso || !workStartIso || !workEndIso) {
    throw new Error("This local date or work window is invalid in the selected timezone.");
  }
  const dayStart = new Date(dayStartIso).getTime();
  const dayEnd = new Date(dayEndIso).getTime();
  const workStart = new Date(workStartIso).getTime();
  const workEnd = new Date(workEndIso).getTime();
  const busy = events
    .map((event) => intervalForEvent(event, timezone))
    .filter((interval) => interval && interval.end > dayStart && interval.start < dayEnd)
    .map((interval) => ({ start: Math.max(interval.start, dayStart), end: Math.min(interval.end, dayEnd) }))
    .sort((a, b) => a.start - b.start);
  const orderedTasks = [...tasks].sort((a, b) =>
    (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0) ||
    (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity) ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const occupied = [...busy];
  const blocks = [];
  const unscheduled = [];
  const durationMs = 60 * 60 * 1000;
  for (const task of orderedTasks) {
    let candidate = workStart;
    let found = null;
    while (candidate + durationMs <= workEnd) {
      const conflict = occupied
        .filter((interval) => interval.start < candidate + durationMs && interval.end > candidate)
        .sort((a, b) => a.start - b.start)[0];
      if (!conflict) {
        found = { start: candidate, end: candidate + durationMs };
        break;
      }
      candidate = Math.max(candidate + 1, conflict.end);
    }
    if (!found) {
      unscheduled.push({ taskId: task.id, title: task.title, reason: "No 60-minute slot remains inside the 09:00–17:00 work window." });
      continue;
    }
    occupied.push(found);
    blocks.push({
      taskId: task.id,
      title: task.title,
      priority: task.priority,
      startAt: new Date(found.start).toISOString(),
      endAt: new Date(found.end).toISOString(),
      durationMinutes: 60,
    });
  }
  blocks.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  return {
    localDate,
    timezone,
    blocks,
    unscheduled,
    warnings: [],
    workWindow: { startAt: workStartIso, endAt: workEndIso },
  };
}
