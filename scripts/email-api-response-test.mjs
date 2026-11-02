import assert from "node:assert/strict";
import { readJsonResponse } from "../src/lib/client/read-json-response.mjs";

const valid = await readJsonResponse(new Response(JSON.stringify({ settings: { enabled: true } }), {
  status: 200, headers: { "content-type": "application/json" },
}), "Email settings");
assert.equal(valid.settings.enabled, true);

const unauthorized = await readJsonResponse(new Response(JSON.stringify({ error: "Sign in first." }), {
  status: 401, headers: { "content-type": "application/json" },
}), "Email inbox");
assert.equal(unauthorized.error, "Sign in first.");

await assert.rejects(() => readJsonResponse(new Response(null, { status: 500 }), "Email inbox"),
  /Email inbox returned an empty response \(HTTP 500\)/);
await assert.rejects(() => readJsonResponse(new Response("<html>Server error</html>", {
  status: 500, headers: { "content-type": "text/html" },
}), "Email settings"), /Email settings returned a non-JSON response \(HTTP 500; text\/html\)/);
await assert.rejects(() => readJsonResponse(new Response("", { status: 200 }), "Email settings"),
  /Email settings returned an empty response \(HTTP 200\)/);
await assert.rejects(() => readJsonResponse(new Response("null", { status: 200 }), "Email inbox"),
  /unexpected JSON payload/);

console.log("PASS Email API response parsing: valid JSON, API errors, empty responses, non-JSON errors, and invalid payloads");
