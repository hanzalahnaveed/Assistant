const INTENTS = Object.freeze(["MEETING_REQUEST", "RESCHEDULE", "DECLINE_INVITE", "TASK_DELEGATION", "OTHER"]);
const patterns = {
  sensitive: /\b(password|credential|secret|security breach|legal|lawsuit|contract|invoice|payment|bank|salary|termination|medical|confidential|complaint|negotiation)\b/i,
  decline: /\b(decline|can't attend|cannot attend|unable to attend|won't make it|reject the invitation|not available for this meeting)\b/i,
  reschedule: /\b(reschedule|move (?:the )?meeting|change (?:the )?meeting time|different time|another time|postpone|push (?:the )?meeting)\b/i,
  meeting: /\b(meeting|schedule a call|book a call|calendar invite|invitation|availability|free\s+(?:on|at|tomorrow|this))\b/i,
  task: /\b(action item|follow[- ]up|please\s+(?:prepare|send|review|complete|finish|update|create|deliver|submit|draft|analy[sz]e|summari[sz]e|investigate|fix|build|coordinate|approve|check)|(?:could|can|would)\s+you\s+(?:please\s+)?(?:prepare|send|review|complete|finish|update|create|deliver|submit|draft|analy[sz]e|summari[sz]e|investigate|fix|build|coordinate|approve|check))\b/i,
  highPriority: /\b(urgent|asap|immediately|critical|today|eod)\b/i,
};

export function classifyIntent({ subject = "", body = "" } = {}) {
  const text = `${subject} ${body}`.slice(0, 24000);
  if (patterns.decline.test(text)) return "DECLINE_INVITE";
  if (patterns.reschedule.test(text)) return "RESCHEDULE";
  if (patterns.meeting.test(text)) return "MEETING_REQUEST";
  if (patterns.task.test(text)) return "TASK_DELEGATION";
  return "OTHER";
}

/** Deterministic offline adapter; dummy results can never authorize external actions. */
export function generateDummyClassification({ subject = "", sender = "", body = "", settings = {}, timezone = "UTC", availableSlots = [] } = {}) {
  const intent = classifyIntent({ subject, body });
  const text = `${subject} ${body}`;
  const sensitive = patterns.sensitive.test(text);
  const category = sensitive ? "SENSITIVE" :
    intent === "MEETING_REQUEST" || intent === "RESCHEDULE" ? "MEETING" :
    intent === "TASK_DELEGATION" ? "TASK" :
    intent === "DECLINE_INVITE" ? "ROUTINE" : "OTHER";
  const firstSentence = (body || subject || "No message content supplied").split(/[.!?\n]/, 1)[0].trim().slice(0, 240);
  const slots = Array.isArray(availableSlots) ? availableSlots.slice(0, 3) : [];
  let replyBody;
  if (intent === "MEETING_REQUEST" || intent === "RESCHEDULE") {
    replyBody = slots.length
      ? `Thanks for reaching out. These are the available options for consideration: ${slots.map((slot) => slot.label || slot.startAt).join("; ")}. Please confirm which option works best. This is a draft for manager review; no meeting has been booked.`
      : "Thanks for reaching out. Could you share a few times that work for you? I will review availability before confirming. This is a draft for manager review; no meeting has been booked.";
  } else if (intent === "DECLINE_INVITE") {
    replyBody = "Thanks for the invitation. The manager's response needs review and confirmation before this invitation is declined.";
  } else if (intent === "TASK_DELEGATION") {
    replyBody = "Thanks for outlining this. I have captured the request for manager review and will confirm next steps after approval.";
  } else {
    replyBody = "Thanks for your email. This is an automatically prepared placeholder draft for manager review; verify details before sending.";
  }
  if (typeof settings.signature === "string" && settings.signature.trim()) replyBody += `\n\n${settings.signature.trim().slice(0, 1000)}`;
  return {
    category,
    sensitive: sensitive || intent === "OTHER",
    reason: `Deterministic offline classification: ${intent}. Review before acting; this is not an LLM judgment.`,
    summary: firstSentence || "Inbound email requires review.",
    replySubject: /^re:/i.test(subject) ? subject.slice(0, 250) : `Re: ${subject || "(no subject)"}`.slice(0, 250),
    replyBody,
    task: intent === "TASK_DELEGATION" ? {
      title: (firstSentence || subject || "Review delegated task").slice(0, 200),
      description: `Request extracted by offline rules from ${sender || "unknown sender"}: ${(body || subject).slice(0, 1500)}`.slice(0, 5000),
      priority: patterns.highPriority.test(text) ? "HIGH" : "MEDIUM",
      dueAt: null,
    } : null,
    meeting: intent === "MEETING_REQUEST" || intent === "RESCHEDULE" ? { durationMinutes: 30, requestText: firstSentence.slice(0, 1000) } : null,
    intent,
    mode: "DUMMY",
    timezone,
  };
}

export function normalizeIntent({ intent, category, subject = "", body = "" } = {}) {
  if (INTENTS.includes(intent)) return intent;
  const fromText = classifyIntent({ subject, body });
  if (fromText !== "OTHER") return fromText;
  if (category === "MEETING") return "MEETING_REQUEST";
  if (category === "TASK") return "TASK_DELEGATION";
  return "OTHER";
}

export function isAutomaticReplyAllowed(classification = {}) {
  return classification.mode === "LIVE" &&
    classification.category === "ROUTINE" &&
    classification.sensitive !== true &&
    !["MEETING_REQUEST", "RESCHEDULE", "DECLINE_INVITE", "TASK_DELEGATION"].includes(classification.intent);
}
