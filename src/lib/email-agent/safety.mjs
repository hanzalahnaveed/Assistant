const ACTION_VERBS = [
  "prepare", "send", "review", "complete", "finish", "update", "create", "deliver",
  "submit", "draft", "analy[sz]e", "summari[sz]e", "investigate", "fix", "build",
  "coordinate", "approve", "check", "compile", "share", "organize", "organise",
  "schedule", "confirm", "compare", "reconcile", "validate", "test", "contact",
  "book", "file", "upload", "publish", "delete",
].join("|");

const REQUEST_START = new RegExp(
  "^\\s*(?:[-*]\\s+|\\d+[.)]\\s+)?(?:(?:please|kindly)\\s+|(?:could|can|would|will)\\s+you\\s+(?:please\\s+)?|(?:i|we)\\s+need\\s+you\\s+to\\s+)?(?:" + ACTION_VERBS + ")\\b",
  "i",
);
const REQUEST_PHRASE = new RegExp(
  "\\b(?:please|kindly|could you|can you|would you|will you|i need you to|we need you to)\\s+(?:" + ACTION_VERBS + ")\\b",
  "i",
);
const ACTION_MATCH = new RegExp("\\b(?:" + ACTION_VERBS + ")\\b", "gi");
const NEGATED_REQUEST = new RegExp(
  "\\b(?:do not|don't|never|no need to|not necessary to|not required to)\\s+(?:please\\s+)?(?:" + ACTION_VERBS + ")\\b",
  "i",
);

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior|earlier)\s+instructions/i,
  /\b(?:system prompt|developer message|hidden instructions)\b/i,
  /\b(?:reveal|print|dump|exfiltrate|send|forward|email|copy)\b.{0,100}\b(?:passwords?|api keys?|secrets?|tokens?|credentials?|private keys?)\b/i,
  /\b(?:bypass|override|skip|disable)\b.{0,60}\b(?:approval|policy|safeguards?|security|review)\b/i,
  /\bdo not tell (?:the user|the manager|the account owner)\b/i,
  /\bact as (?:the )?(?:system|developer|admin|administrator)\b/i,
];

const QUOTE_BOUNDARY = /^(?:\s*>|\s*-{2,}\s*(?:original|forwarded) message\s*-{2,}\s*|\s*begin forwarded message:\s*|\s*_{5,}\s*forwarded message\s*_{5,}\s*|\s*on .+wrote:\s*)$/i;
const DUE_CUE = /\b(?:due(?:\s+date)?|deadline|no later than|submit by|deliver by|complete by|must be (?:sent|done|submitted|completed) by)\s+(?:on\s+)?((?:next\s+)?[a-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|(?:next\s+)?(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi;

function requestActionCount(text) {
  let count = 0;
  for (const segment of String(text || "").split(/\n|(?<=[.!?])\s+/)) {
    const candidate = segment.trim();
    if (!candidate || NEGATED_REQUEST.test(candidate)) continue;
    if (!REQUEST_START.test(candidate) && !REQUEST_PHRASE.test(candidate)) continue;
    const actions = candidate.match(ACTION_MATCH) || [];
    count += actions.length;
  }
  return count;
}

export function hasExplicitActionRequest({ subject = "", body = "" } = {}) {
  return requestActionCount(subject + "\n" + body) > 0;
}

function splitQuotedContent(body) {
  const lines = String(body || "").replace(/\r\n?/g, "\n").split("\n");
  const boundary = lines.findIndex((line) => QUOTE_BOUNDARY.test(line.trim()));
  if (boundary < 0) return { activeBody: lines.join("\n").trim(), quoteDetected: false, quotedBody: "" };
  return {
    activeBody: lines.slice(0, boundary).join("\n").trim(),
    quoteDetected: true,
    quotedBody: lines.slice(boundary).join("\n").trim(),
  };
}

function conflictingDueDates(text) {
  const found = [...String(text || "").matchAll(DUE_CUE)].map((match) => match[1].toLowerCase().replace(/\s+/g, " ").trim());
  return new Set(found).size > 1;
}

export function inspectInboundEmail({ subject = "", body = "" } = {}) {
  const sourceBody = String(body || "").slice(0, 20000);
  const split = splitQuotedContent(sourceBody);
  const forwarded = /^(?:fw|fwd):/i.test(String(subject || "").trim()) ||
    /begin forwarded message|forwarded message/i.test(split.quotedBody);
  const injectionDetected = INJECTION_PATTERNS.some((pattern) => pattern.test(String(subject) + "\n" + sourceBody));
  const actionCount = requestActionCount(split.activeBody);
  const multipleActionRequests = actionCount > 1;
  const vagueRequest = /\b(?:take care of|handle|sort out|deal with|do the needful|look into|proceed with)\s+(?:this|that|it|the same|as discussed)\b/i.test(split.activeBody);
  const ambiguousActionRequest = vagueRequest && actionCount === 0;
  const conflictingDeadlines = conflictingDueDates(split.activeBody);
  const forwardedWithoutContext = split.quoteDetected && !split.activeBody;
  const reviewReasons = [];
  if (injectionDetected) reviewReasons.push("Possible instruction-injection content");
  if (multipleActionRequests) reviewReasons.push("Multiple requested actions need to be separated");
  if (ambiguousActionRequest) reviewReasons.push("The requested action is too vague to turn into a task");
  if (conflictingDeadlines) reviewReasons.push("The message appears to contain conflicting deadlines");
  if (forwardedWithoutContext) reviewReasons.push("The message contains quoted or forwarded content but no new instruction");
  return {
    activeBody: split.activeBody,
    quoteDetected: split.quoteDetected,
    forwarded,
    injectionDetected,
    actionCount,
    multipleActionRequests,
    ambiguousActionRequest,
    conflictingDeadlines,
    requiresHumanReview: reviewReasons.length > 0,
    reviewReasons,
  };
}
