import assert from "node:assert/strict";
import { extractMessageText, parseSender } from "../src/lib/email-agent/format.mjs";

const encode = (value) => Buffer.from(value, "utf8").toString("base64url");

assert.equal(parseSender('Jane Doe <Jane.Doe@example.com>'), "jane.doe@example.com");
assert.equal(parseSender("PERSON@example.test"), "person@example.test");
assert.equal(parseSender("not an email"), null);
assert.equal(parseSender(null), null);

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

console.log("PASS email-agent message parsing, HTML cleanup, sender validation, and size limits");
