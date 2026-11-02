import assert from "node:assert/strict";
import {
  buildInboxQuery,
  compareWorkerFairness,
  EMAIL_AGENT_MAX_ATTEMPTS,
  EMAIL_AGENT_PAGE_SIZE,
  getEmailRetryPlan,
  isInvalidGmailPageTokenError,
} from "../src/lib/email-agent/queue.mjs";

assert.equal(EMAIL_AGENT_PAGE_SIZE, 100);
assert.equal(EMAIL_AGENT_MAX_ATTEMPTS, 5);
assert.match(buildInboxQuery("2026-11-02T10:00:00.000Z"), /after:1793613600/);
assert.doesNotMatch(buildInboxQuery("2026-11-02T10:00:00.000Z"), /newer_than:7d/);
assert.equal(isInvalidGmailPageTokenError(new Error("Google Workspace API returned HTTP 400 (invalidArgument: Invalid page token).")), true);
assert.equal(isInvalidGmailPageTokenError(new Error("Google Workspace API returned HTTP 503 (backendError: unavailable).")), false);
assert.deepEqual(getEmailRetryPlan(1), { status: "RETRY_WAIT", retryAt: null, delayMs: 30000, terminal: false });
assert.deepEqual(getEmailRetryPlan(2), { status: "RETRY_WAIT", retryAt: null, delayMs: 60000, terminal: false });
assert.deepEqual(getEmailRetryPlan(3), { status: "RETRY_WAIT", retryAt: null, delayMs: 120000, terminal: false });
assert.deepEqual(getEmailRetryPlan(4), { status: "RETRY_WAIT", retryAt: null, delayMs: 240000, terminal: false });
assert.deepEqual(getEmailRetryPlan(5), { status: "FAILED", retryAt: null, delayMs: null, terminal: true });
assert.deepEqual(getEmailRetryPlan(99), { status: "FAILED", retryAt: null, delayMs: null, terminal: true });
const older = { id: "older", emailAgentState: { lastWorkerRunAt: "2026-11-02T09:00:00.000Z" } };
const neverRun = { id: "never-run", emailAgentState: null };
const newer = { id: "newer", emailAgentState: { lastWorkerRunAt: "2026-11-02T09:30:00.000Z" } };
assert.deepEqual([older, newer, neverRun].sort(compareWorkerFairness).map((user) => user.id), ["never-run", "older", "newer"]);

console.log("PASS durable email queue query, page-token recovery, retry backoff, and fair user ordering");
