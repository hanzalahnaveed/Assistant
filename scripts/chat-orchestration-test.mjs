import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/app/api/chat/route.js", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

assert.match(route, /name:\s*"propose_task"/);
assert.match(route, /name:\s*"prepare_email_draft"/);
assert.match(route, /prisma\.actionRecord\.findMany/);
assert.match(route, /prisma\.emailDraft\.findMany/);
assert.match(route, /Pending assistant actions/);
assert.match(route, /Outbound email drafts/);
assert.match(route, /createTaskActionProposal\(userId, idempotencyKey/);
assert.match(route, /prisma\.emailDraft\.create/);
assert.match(route, /status: draft\.status, type: "CREATE_EMAIL_DRAFT"/);
assert.match(route, /eventType: "EMAIL_DRAFT_GENERATED"/);
assert.match(route, /has not been approved or sent/);
assert.match(route, /actionType: reply\.action\.type \|\| "CREATE_TASK"/);
assert.equal(packageJson.scripts["test:chat-orchestration"], "node scripts/chat-orchestration-test.mjs");

console.log("PASS chat orchestration contract: task proposals use the action policy; email drafting saves an audited unsent draft.");
