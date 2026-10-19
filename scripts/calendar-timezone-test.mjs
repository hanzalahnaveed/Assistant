import assert from "node:assert/strict";
import { localDateTimeToIso, toLocalDateTime } from "../src/lib/calendar-timezone.mjs";

assert.equal(
  localDateTimeToIso("2026-01-15T10:30", "UTC"),
  "2026-01-15T10:30:00.000Z",
  "UTC wall-clock values should map directly to UTC",
);
assert.equal(
  localDateTimeToIso("2026-01-15T10:30", "Asia/Karachi"),
  "2026-01-15T05:30:00.000Z",
  "Karachi wall-clock values should preserve the selected timezone",
);
assert.equal(
  localDateTimeToIso("2026-01-15T10:30", "America/New_York"),
  "2026-01-15T15:30:00.000Z",
  "New York winter wall-clock values should use standard time",
);
assert.equal(
  localDateTimeToIso("2026-07-15T10:30", "America/New_York"),
  "2026-07-15T14:30:00.000Z",
  "New York summer wall-clock values should use daylight time",
);
assert.equal(
  toLocalDateTime("2026-07-15T14:30:00.000Z", "America/New_York"),
  "2026-07-15T10:30",
  "saved meeting instants should load back into the selected timezone",
);
assert.equal(
  localDateTimeToIso("2026-03-08T02:30", "America/New_York"),
  null,
  "nonexistent daylight-saving wall-clock times should be rejected",
);
assert.equal(
  localDateTimeToIso("2026-01-15T10:30", "Not/A_Real_Timezone"),
  null,
  "invalid timezones should be rejected",
);
assert.equal(localDateTimeToIso("not-a-date", "UTC"), null);
console.log("All calendar timezone conversion checks passed.");
