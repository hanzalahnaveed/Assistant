import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

function partsInZone(date, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
}

function calendarDateKey(date, timeZone) {
  const parts = partsInZone(date, timeZone);
  return parts.year + "-" + parts.month + "-" + parts.day;
}

function timedInterval(event) {
  const startValue = event?.start?.dateTime;
  const endValue = event?.end?.dateTime;
  if (!startValue || !endValue) return null;
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

export function isCalendarSlotFree(events, startAt, durationMinutes = 30, timeZone = "UTC") {
  const start = new Date(startAt).getTime();
  const end = start + durationMinutes * 60_000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const firstLocalDay = calendarDateKey(new Date(start), timeZone);
  const lastLocalDay = calendarDateKey(new Date(end - 1), timeZone);
  return !(events || []).some((event) => {
    if (!event || event.status === "cancelled" || event.transparency === "transparent") return false;
    if (event.start?.date && event.end?.date) {
      return firstLocalDay < event.end.date && lastLocalDay >= event.start.date;
    }
    const interval = timedInterval(event);
    return interval ? start < interval.end && end > interval.start : false;
  });
}

export function findFreeCalendarSlot(events, {
  now = Date.now(),
  timeZone = "UTC",
  durationMinutes = 30,
  horizonDays = 7,
} = {}) {
  const roundedStart = new Date(now + 60_000);
  roundedStart.setUTCSeconds(0, 0);
  const minute = roundedStart.getUTCMinutes();
  roundedStart.setUTCMinutes(minute < 30 ? 30 : 0);
  if (minute >= 30) roundedStart.setUTCHours(roundedStart.getUTCHours() + 1);
  const deadline = now + horizonDays * 24 * 60 * 60_000;
  for (let candidate = roundedStart.getTime(); candidate < deadline; candidate += 30 * 60_000) {
    const local = partsInZone(new Date(candidate), timeZone);
    if (local.weekday === "Sat" || local.weekday === "Sun") continue;
    const hour = Number(local.hour);
    if (hour < 9 || hour > 16) continue;
    if (isCalendarSlotFree(events, new Date(candidate).toISOString(), durationMinutes, timeZone)) {
      return new Date(candidate).toISOString();
    }
  }
  return null;
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function refreshToken(clientId, clientSecret, refreshToken) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  return { response, body: await readJson(response) };
}

async function googleRequest(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: "Bearer " + accessToken,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const body = response.status === 204 ? null : await readJson(response);
  return { response, body };
}

function pass(label) {
  console.log("PASS " + label);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing required environment variable " + name + ".");
  return value;
}

async function runSelfTest() {
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
  pass("Google live acceptance helper self-test: event overlap, cancelled/transparent events, all-day blocks, and free-slot search");
}

async function runLiveAcceptance() {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const refresh = requireEnv("GOOGLE_ACCEPTANCE_REFRESH_TOKEN");
  const expectedEmail = requireEnv("GOOGLE_ACCEPTANCE_EMAIL").toLowerCase();
  const timeZone = process.env.GOOGLE_ACCEPTANCE_TIME_ZONE || "UTC";
  const tokenResult = await refreshToken(clientId, clientSecret, refresh);
  assert.equal(tokenResult.response.status, 200, "Dedicated acceptance refresh token must be valid.");
  assert.equal(typeof tokenResult.body.access_token, "string");
  const accessToken = tokenResult.body.access_token;
  pass("OAuth refresh succeeds for the dedicated acceptance account");

  const profileUrl = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
  const profileResult = await googleRequest(profileUrl, accessToken);
  assert.equal(profileResult.response.status, 200, "Gmail profile endpoint must be accessible.");
  assert.equal(String(profileResult.body.emailAddress || "").toLowerCase(), expectedEmail);
  pass("Gmail profile matches the configured dedicated test account");

  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", "25");
  listUrl.searchParams.set("q", "in:inbox");
  const inboxResult = await googleRequest(listUrl.toString(), accessToken);
  assert.equal(inboxResult.response.status, 200, "Gmail inbox listing must succeed.");
  const messages = Array.isArray(inboxResult.body.messages) ? inboxResult.body.messages : [];
  assert.ok(messages.length > 0, "Send or receive one harmless seed email in the dedicated test inbox before running acceptance.");
  const requestedMessageId = process.env.GOOGLE_ACCEPTANCE_MESSAGE_ID?.trim();
  const messageId = requestedMessageId || messages[0].id;
  assert.ok(messages.some((message) => message.id === messageId), "The selected seed message must be discoverable in the inbox.");
  const messageUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(messageId));
  messageUrl.searchParams.set("format", "full");
  const messageResult = await googleRequest(messageUrl.toString(), accessToken);
  assert.equal(messageResult.response.status, 200, "A discovered Gmail message must be retrievable.");
  assert.equal(messageResult.body.id, messageId);
  assert.ok(messageResult.body.threadId);
  pass("Gmail inbox discovery and message retrieval succeed");

  const onePageUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  onePageUrl.searchParams.set("maxResults", "1");
  onePageUrl.searchParams.set("q", "in:inbox");
  const firstPage = await googleRequest(onePageUrl.toString(), accessToken);
  assert.equal(firstPage.response.status, 200);
  if (firstPage.body.nextPageToken) {
    onePageUrl.searchParams.set("pageToken", firstPage.body.nextPageToken);
    const secondPage = await googleRequest(onePageUrl.toString(), accessToken);
    assert.equal(secondPage.response.status, 200, "Gmail next-page cursor must be accepted.");
    const secondIds = (secondPage.body.messages || []).map((message) => message.id);
    assert.ok(secondIds.length > 0);
    assert.equal(secondIds.includes(firstPage.body.messages?.[0]?.id), false);
    pass("Gmail pagination cursor retrieves a distinct next page");
  } else {
    console.log("SKIP Gmail second-page assertion: the test inbox currently has fewer than two pages of messages.");
  }

  const invalidPageUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  invalidPageUrl.searchParams.set("maxResults", "1");
  invalidPageUrl.searchParams.set("pageToken", "assistant-acceptance-invalid-page-token");
  const invalidPage = await googleRequest(invalidPageUrl.toString(), accessToken);
  assert.equal(invalidPage.response.status, 400, "Gmail must reject a deliberately invalid page token.");
  assert.match(String(invalidPage.body.error?.message || ""), /page.?token|invalid/i);
  pass("Gmail rejects invalid pagination tokens as expected");

  const now = Date.now();
  const calendarUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  calendarUrl.searchParams.set("timeMin", new Date(now - 60_000).toISOString());
  calendarUrl.searchParams.set("timeMax", new Date(now + 8 * 24 * 60 * 60_000).toISOString());
  calendarUrl.searchParams.set("singleEvents", "true");
  calendarUrl.searchParams.set("orderBy", "startTime");
  calendarUrl.searchParams.set("maxResults", "250");
  const calendarEvents = [];
  let calendarPageToken = null;
  for (let page = 0; page < 8; page++) {
    const pageUrl = new URL(calendarUrl);
    if (calendarPageToken) pageUrl.searchParams.set("pageToken", calendarPageToken);
    const result = await googleRequest(pageUrl.toString(), accessToken);
    assert.equal(result.response.status, 200, "Primary Calendar read must succeed.");
    calendarEvents.push(...(Array.isArray(result.body.items) ? result.body.items : []));
    calendarPageToken = result.body.nextPageToken || null;
    if (!calendarPageToken) break;
    if (page === 7) throw new Error("Calendar has more than eight pages; availability is not fully verifiable.");
  }
  pass("Primary Calendar availability read and bounded pagination succeed");
  const freeSlot = findFreeCalendarSlot(calendarEvents, { now: Date.now(), timeZone, durationMinutes: 30, horizonDays: 7 });
  assert.ok(freeSlot, "No free 30-minute primary-calendar slot was found in the next seven days.");
  pass("A free 30-minute Calendar slot was identified against live events");

  if (process.env.GOOGLE_ACCEPTANCE_REVOKED_REFRESH_TOKEN?.trim()) {
    const revoked = await refreshToken(clientId, clientSecret, process.env.GOOGLE_ACCEPTANCE_REVOKED_REFRESH_TOKEN.trim());
    assert.equal(revoked.response.status, 400);
    assert.equal(revoked.body.error, "invalid_grant", "The separate revoked refresh token must return invalid_grant.");
    pass("A separately revoked OAuth grant is rejected with invalid_grant");
  } else {
    console.log("SKIP revoked-grant assertion: configure a separate revoked test refresh token to exercise it.");
  }

  if (process.env.GOOGLE_ACCEPTANCE_CREATE_TEST_INVITATION === "true") {
    const recipient = requireEnv("GOOGLE_ACCEPTANCE_RECIPIENT").toLowerCase();
    assert.equal(recipient, expectedEmail, "Calendar invitations are restricted to the dedicated acceptance account itself.");
    const startAt = freeSlot;
    const eventId = randomBytes(16).toString("hex");
    const eventUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    eventUrl.searchParams.set("conferenceDataVersion", "1");
    eventUrl.searchParams.set("sendUpdates", "all");
    let cleanupError = null;
    try {
      const create = await googleRequest(eventUrl.toString(), accessToken, {
        method: "POST",
        body: JSON.stringify({
          id: eventId,
          summary: "Assistant live acceptance test",
          description: "Temporary acceptance event. This event is removed by the test runner.",
          start: { dateTime: startAt, timeZone },
          end: { dateTime: new Date(new Date(startAt).getTime() + 30 * 60_000).toISOString(), timeZone },
          attendees: [{ email: recipient }],
          conferenceData: {
            createRequest: {
              requestId: "assistant-acceptance-" + randomBytes(8).toString("hex"),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      });
      assert.ok([200, 201].includes(create.response.status), "Calendar event creation must succeed.");
      assert.equal(create.body.id, eventId);
      let verified = create.body;
      for (let attempt = 0; attempt < 12; attempt++) {
        const get = await googleRequest("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + eventId, accessToken);
        assert.equal(get.response.status, 200, "Created test event must be retrievable.");
        verified = get.body;
        const attendeePresent = (verified.attendees || []).some((attendee) => String(attendee.email || "").toLowerCase() === recipient);
        if (attendeePresent && (verified.htmlLink || verified.hangoutLink || verified.conferenceData?.entryPoints?.some((entry) => entry.entryPointType === "video"))) break;
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
      assert.ok((verified.attendees || []).some((attendee) => String(attendee.email || "").toLowerCase() === recipient));
      assert.ok(verified.htmlLink || verified.hangoutLink || verified.conferenceData?.entryPoints?.some((entry) => entry.entryPointType === "video"));
      pass("Calendar event creation, attendee invitation, and event-link retrieval succeed");
    } finally {
      const existing = await googleRequest(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/" + eventId,
        accessToken,
      );
      if (existing.response.status === 200) {
        const deletion = await googleRequest(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events/" + eventId + "?sendUpdates=all",
          accessToken,
          { method: "DELETE" },
        );
        if (deletion.response.status !== 204 && deletion.response.status !== 404) {
          cleanupError = "Could not delete temporary acceptance event; remove event " + eventId + " from the test calendar manually.";
        }
      } else if (existing.response.status !== 404) {
        cleanupError = "Could not verify whether temporary acceptance event " + eventId + " exists; inspect the test calendar manually.";
      }
      if (cleanupError) throw new Error(cleanupError);
    }
    pass("Temporary Calendar event and test invitation were removed");
  } else {
    console.log("SKIP Calendar write/invitation assertion: set GOOGLE_ACCEPTANCE_CREATE_TEST_INVITATION=true only for the dedicated test account.");
  }

  console.log("Google live acceptance completed. No message bodies, OAuth tokens, or calendar event contents were logged.");
}

if (process.argv.includes("--self-test")) {
  await runSelfTest();
} else {
  await runLiveAcceptance();
}
