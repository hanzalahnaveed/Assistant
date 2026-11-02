import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const exportsFor = (text) => [...text.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g)].map((match) => match[1]).sort();
const requireMethods = async (path, expected) => {
  const text = await source(path);
  assert.deepEqual(exportsFor(text), [...expected].sort(), path + " methods");
  return text;
};

const checks = [
  ["src/app/api/tasks/route.js", ["GET", "POST"]],
  ["src/app/api/tasks/[id]/route.js", ["PATCH", "DELETE"]],
  ["src/app/api/calendar-events/route.js", ["GET", "POST"]],
  ["src/app/api/calendar-events/[id]/route.js", ["PATCH", "DELETE"]],
  ["src/app/api/automation-rules/route.js", ["GET", "POST"]],
  ["src/app/api/automation-rules/[id]/route.js", ["PATCH", "DELETE"]],
  ["src/app/api/email-drafts/route.js", ["GET", "POST"]],
  ["src/app/api/email-drafts/[id]/route.js", ["PATCH", "POST", "DELETE"]],
  ["src/app/api/chat/route.js", ["GET", "POST"]],
  ["src/app/api/chat/[id]/route.js", ["GET", "PATCH", "DELETE"]],
  ["src/app/api/notifications/route.js", ["GET", "PATCH", "DELETE"]],
  ["src/app/api/email-agent/inbox/[id]/route.js", ["GET", "PATCH", "DELETE"]],
  ["src/app/api/preferences/route.js", ["GET", "PATCH"]],
];

const files = new Map();
for (const [path, methods] of checks) {
  files.set(path, await requireMethods(path, methods));
}

assert.match(files.get("src/app/api/tasks/[id]/route.js"), /status:\s*"CANCELLED"/);
assert.match(files.get("src/app/api/calendar-events/[id]/route.js"), /eventRequest\([^)]*"(?:PATCH|DELETE)"/);
assert.match(files.get("src/app/api/email-drafts/[id]/route.js"), /status:\s*"CANCELLED"/);
assert.match(files.get("src/app/api/chat/[id]/route.js"), /AI_CONVERSATION_RENAMED/);
assert.match(files.get("src/app/api/chat/[id]/route.js"), /AI_CONVERSATION_DELETED/);
assert.match(files.get("src/app/api/email-agent/inbox/[id]/route.js"), /GMAIL_MODIFY_SCOPE/);
assert.match(files.get("src/app/api/email-agent/inbox/[id]/route.js"), /\/trash/);
assert.match(files.get("src/app/api/email-agent/inbox/[id]/route.js"), /\/untrash/);
assert.match(files.get("src/app/api/preferences/route.js"), /name:\s*name\s*\|\|\s*null/);

const assistant = await source("src/components/client/assistant-client.jsx");
assert.match(assistant, /Rename conversation/);
assert.match(assistant, /Delete conversation/);

const notificationCenter = await source("src/components/client/notification-center.jsx");
assert.match(notificationCenter, /Mark all read/);
assert.match(notificationCenter, /Delete all read items/);
assert.match(notificationCenter, /Saved briefings/);

const emailDraftManager = await source("src/components/client/email-draft-manager.jsx");
for (const marker of ["Compose email", "Edit", "Approve", "Send email", "Cancel draft"]) {
  assert.ok(emailDraftManager.includes(marker), "outbound email UI: " + marker);
}

const inboundEmail = await source("src/components/client/inbound-email-queue.jsx");
for (const marker of ["Gmail mailbox actions", "Mark read", "Move to Trash", "Restore from Trash", "Approve and add task"]) {
  assert.ok(inboundEmail.includes(marker), "integrated email UI: " + marker);
}

const integrations = await source("src/components/client/ui.jsx");
assert.match(integrations, /Display name/);
assert.match(integrations, /gmailModify/);

console.log("PASS CRUD API surface and end-user CRUD controls across local and integrated data");
