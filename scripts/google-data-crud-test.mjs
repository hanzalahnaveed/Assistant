import assert from "node:assert/strict";
import { GMAIL_MODIFY_SCOPE, getGmailModifyPayload } from "../src/lib/email-agent/gmail-mutations.mjs";

assert.equal(GMAIL_MODIFY_SCOPE, "https://www.googleapis.com/auth/gmail.modify");
assert.deepEqual(getGmailModifyPayload("MARK_READ"), { removeLabelIds: ["UNREAD"] });
assert.deepEqual(getGmailModifyPayload("MARK_UNREAD"), { addLabelIds: ["UNREAD"] });
assert.deepEqual(getGmailModifyPayload("STAR"), { addLabelIds: ["STARRED"] });
assert.deepEqual(getGmailModifyPayload("UNSTAR"), { removeLabelIds: ["STARRED"] });
assert.deepEqual(getGmailModifyPayload("ARCHIVE"), { removeLabelIds: ["INBOX"] });
assert.deepEqual(getGmailModifyPayload("MOVE_TO_INBOX"), {
  addLabelIds: ["INBOX"],
  removeLabelIds: ["TRASH"],
});
assert.throws(() => getGmailModifyPayload("PERMANENT_DELETE"), /Unsupported Gmail mailbox action/);

// Each returned array is a fresh value; callers cannot mutate the shared action map.
const first = getGmailModifyPayload("MARK_READ");
first.removeLabelIds.push("IMPORTANT");
assert.deepEqual(getGmailModifyPayload("MARK_READ"), { removeLabelIds: ["UNREAD"] });

console.log("PASS Gmail provider CRUD action mapping and safe, reversible mailbox mutations");
