function partsInTimezone(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
}

export function toLocalDateTime(value, timezone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const parts = partsInTimezone(date, timezone);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch {
    return "";
  }
}

export function localDateTimeToIso(value, timezone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let candidate = target;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const parts = partsInTimezone(new Date(candidate), timezone);
      const represented = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
      );
      const delta = target - represented;
      if (delta === 0) break;
      candidate += delta;
    }
    const verified = partsInTimezone(new Date(candidate), timezone);
    if (
      verified.year !== year ||
      verified.month !== month ||
      verified.day !== day ||
      verified.hour !== hour ||
      verified.minute !== minute
    ) return null;
    return new Date(candidate).toISOString();
  } catch {
    return null;
  }
}
