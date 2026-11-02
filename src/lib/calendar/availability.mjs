import { localDateTimeToIso } from "../calendar-timezone.mjs";

function shiftDate(value, amount) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function minutesOfDay(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || "")) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function eventInterval(event, timezone) {
  if (event.status === "cancelled" || event.transparency === "transparent") return null;
  if (event.start?.date && event.end?.date) {
    const start = localDateTimeToIso(event.start.date + "T00:00", timezone);
    const end = localDateTimeToIso(event.end.date + "T00:00", timezone);
    return start && end ? { start: Date.parse(start), end: Date.parse(end) } : null;
  }
  const start = Date.parse(event.start?.dateTime || "");
  const end = Date.parse(event.end?.dateTime || "");
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

export function findAvailableCalendarSlots({
  events,
  startDate,
  endDate,
  durationMinutes,
  timezone,
  workdayStart = "09:00",
  workdayEnd = "17:00",
  weekdays = [1, 2, 3, 4, 5],
  stepMinutes = 30,
  maxSlots = 6,
}) {
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) {
    throw new Error("Choose a valid date range.");
  }
  const dayCount = Math.round((Date.parse(endDate + "T00:00:00Z") - Date.parse(startDate + "T00:00:00Z")) / 86400000) + 1;
  if (dayCount > 31) throw new Error("Availability searches are limited to 31 days.");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    throw new Error("Meeting duration must be between 15 minutes and 8 hours.");
  }
  const dayStart = minutesOfDay(workdayStart);
  const dayEnd = minutesOfDay(workdayEnd);
  if (dayStart === null || dayEnd === null || dayEnd <= dayStart || dayEnd - dayStart < durationMinutes) {
    throw new Error("Choose valid working hours that fit the requested meeting duration.");
  }
  if (!Array.isArray(weekdays) || weekdays.length === 0 || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("Choose at least one valid weekday.");
  }
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date()); }
  catch { throw new Error("Choose a valid IANA timezone."); }
  if (!Array.isArray(events)) throw new Error("Calendar events could not be verified.");

  const busy = events.map(event => eventInterval(event, timezone)).filter(Boolean).sort((a, b) => a.start - b.start);
  const slots = [];
  for (let date = startDate; date <= endDate && slots.length < maxSlots; date = shiftDate(date, 1)) {
    const [year, month, day] = date.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (!weekdays.includes(weekday)) continue;
    for (let minute = dayStart; minute + durationMinutes <= dayEnd && slots.length < maxSlots; minute += stepMinutes) {
      const startWall = date + "T" + String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
      const endMinute = minute + durationMinutes;
      const endWall = date + "T" + String(Math.floor(endMinute / 60)).padStart(2, "0") + ":" + String(endMinute % 60).padStart(2, "0");
      const startIso = localDateTimeToIso(startWall, timezone);
      const endIso = localDateTimeToIso(endWall, timezone);
      if (!startIso || !endIso) continue;
      const start = Date.parse(startIso), end = Date.parse(endIso);
      if (busy.some(interval => start < interval.end && end > interval.start)) continue;
      slots.push({ startAt: startIso, endAt: endIso, timezone, localStart: startWall, localEnd: endWall });
    }
  }
  return { slots, searchedDays: dayCount, durationMinutes, timezone, workdayStart, workdayEnd };
}
