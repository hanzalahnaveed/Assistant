import assert from "node:assert/strict";
import { extractMessageText, isAutomatedSender, parseMessageId, parseSender } from "../src/lib/email-agent/format.mjs";
import { getCompleteCalendarEvents } from "../src/lib/email-agent/calendar-availability.mjs";

const encode = (value) => Buffer.from(value, "utf8").toString("base64url");

assert.equal(parseSender('Jane Doe <Jane.Doe@example.com>'), "jane.doe@example.com");
assert.deepEqual(getCompleteCalendarEvents({ items: [{ id: "event-1" }] }), [{ id: "event-1" }]);
assert.deepEqual(getCompleteCalendarEvents({}), []);
assert.throws(
  () => getCompleteCalendarEvents({ items: [{ id: "event-1" }], nextPageToken: "next-page" }),
  /availability results are incomplete/i,
);
assert.equal(parseSender("PERSON@example.test"), "person@example.test");
assert.equal(parseSender("not an email"), null);
assert.equal(parseSender(null), null);

assert.equal(parseMessageId("<message-123@example.test>"), "<message-123@example.test>");
assert.equal(parseMessageId("<message id@example.test>"), null);
assert.equal(parseMessageId("<message@example.test>\r\nBcc: victim@example.test"), null);
assert.equal(parseMessageId("not-a-message-id"), null);

assert.equal(isAutomatedSender({}, "noreply@example.com"), true);
assert.equal(isAutomatedSender({}, "do-not-reply@example.com"), true);
assert.equal(isAutomatedSender({ payload: { headers: [{ name: "Auto-Submitted", value: "auto-generated" }] } }, "system@example.com"), true);
assert.equal(isAutomatedSender({ payload: { headers: [{ name: "List-Unsubscribe", value: "<mailto:leave@example.test>" }] } }, "news@example.com"), true);
assert.equal(isAutomatedSender({}, "colleague@example.com"), false);

assert.equal(
  extractMessageText({
    snippet: "snippet fallback",
    payload: {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: encode("<p>HTML only</p>") } },
        { mimeType: "text/plain", body: { data: encode("Plain text reply") } },
      ],
    },
  }),
  "Plain text reply",
);

assert.equal(
  extractMessageText({
    payload: {
      mimeType: "text/html",
      body: { data: encode("<p>Hello&nbsp;world &amp; team</p><script>ignore()</script>") },
    },
  }),
  "Hello world & team",
);
assert.equal(extractMessageText({ snippet: "Snippet body", payload: {} }), "Snippet body");
assert.equal(extractMessageText({ payload: { mimeType: "text/plain", body: { data: encode("a\u0000b") } } }), "ab");
assert.equal(
  extractMessageText({ payload: { mimeType: "text/plain", body: { data: encode("x".repeat(25000)) } } }).length,
  20000,
);
assert.equal(
  extractMessageText({ payload: { mimeType: "text/plain", body: { data: encode("x".repeat(75000)) } } }, 100000).length,
  75000,
);
assert.equal(
  extractMessageText({ payload: { mimeType: "text/plain", body: { data: encode("x".repeat(75000)) } } }, 5000).length,
  5000,
);

console.log("PASS email-agent message parsing, HTML cleanup, sender validation, and message detail limits");
