export const EMAIL_AGENT_PAGE_SIZE = 100;
export const EMAIL_AGENT_MAX_ATTEMPTS = 5;
export const EMAIL_AGENT_RETRY_BASE_MS = 30_000;
export const EMAIL_AGENT_RETRY_MAX_MS = 60 * 60 * 1000;

export function buildInboxQuery(enabledAt) {
  const timestamp = enabledAt instanceof Date ? enabledAt.getTime() : Date.parse(enabledAt || "");
  const after = Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000);
  return "in:inbox after:" + after + " -from:me -category:promotions -category:social";
}

export function isInvalidGmailPageTokenError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /HTTP 400.*(?:invalidArgument|page.?token)|(?:invalid|expired).*page.?token/i.test(message);
}

export function getEmailRetryPlan(attempt) {
  const count = Math.max(1, Math.floor(Number(attempt) || 1));
  if (count >= EMAIL_AGENT_MAX_ATTEMPTS) {
    return { status: "FAILED", retryAt: null, delayMs: null, terminal: true };
  }
  const delayMs = Math.min(EMAIL_AGENT_RETRY_MAX_MS, EMAIL_AGENT_RETRY_BASE_MS * (2 ** (count - 1)));
  return { status: "RETRY_WAIT", retryAt: null, delayMs, terminal: false };
}

export function compareWorkerFairness(a, b) {
  const aTime = a?.emailAgentState?.lastWorkerRunAt ? new Date(a.emailAgentState.lastWorkerRunAt).getTime() : 0;
  const bTime = b?.emailAgentState?.lastWorkerRunAt ? new Date(b.emailAgentState.lastWorkerRunAt).getTime() : 0;
  return aTime - bTime || String(a?.id || "").localeCompare(String(b?.id || ""));
}
