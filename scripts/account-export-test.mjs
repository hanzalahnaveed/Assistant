import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = async (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const route = await read("src/app/api/account/export/route.js");
const schema = await read("prisma/schema.prisma");

for (const field of ["inboundEmails:", "followUps:", "emailAgentState:", "pagesScanned:", "lastWorkerRunAt:", "formatVersion: 2"]) {
  assert.ok(route.includes(field), "export must include " + field);
}
assert.doesNotMatch(route, /accessTokenEnc\s*:/, "integration tokens must not be selected");
assert.doesNotMatch(route, /refreshTokenEnc\s*:/, "refresh tokens must not be selected");
const stateSelection = route.match(/emailAgentState:\s*\{\s*select:\s*\{([\s\S]*?)\}\s*\}/)?.[1] ?? "";
assert.ok(stateSelection, "email-agent operational state must be exported");
assert.ok(!stateSelection.includes("gmailPageToken"), "opaque Gmail pagination token must never be exported");
assert.match(schema, /model InboundEmail/);
assert.match(schema, /model EmailAgentState/);
assert.match(schema, /model FollowUp/);
console.log("PASS account export includes persisted email-agent and follow-up data without OAuth secrets or opaque provider cursors");
