export function getCompleteCalendarEvents(result) {
  if (result?.nextPageToken) {
    throw new Error("Calendar availability results are incomplete; cannot confirm free time safely.");
  }
  return Array.isArray(result?.items) ? result.items : [];
}
