"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ExternalLink, ListTodo, RefreshCw, Save, Send, ShieldAlert, XCircle } from "lucide-react";

const statusLabels = {
  RECEIVED: "New", PROCESSING: "Processing", DRAFTED: "Reply ready",
  AWAITING_APPROVAL: "Needs review", SAFETY_REVIEW: "Safety review", MEETING_REVIEW: "Meeting request",
  MEETING_BOOKED_REVIEW: "Meeting booked", TASK_REVIEW: "Task approval",
  TASK_CREATED: "Task created", REPLIED: "Replied", SKIPPED: "Skipped",
  SEND_UNCERTAIN: "Check Gmail Sent", FAILED: "Needs attention",
};

export default function InboundEmailQueue() {
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [runResult, setRunResult] = useState("");
  const [edits, setEdits] = useState({});
  const [meetingBusy, setMeetingBusy] = useState("");
  const [taskBusyId, setTaskBusyId] = useState("");
  const [worker, setWorker] = useState(null);

  const load = useCallback(async () => {
    try {
      const [settingsRes, inboxRes] = await Promise.all([
        fetch("/api/email-agent/settings", { cache: "no-store" }),
        fetch("/api/email-agent/inbox", { cache: "no-store" }),
      ]);
      const settingsData = await settingsRes.json();
      const inboxData = await inboxRes.json();
      if (!inboxRes.ok) throw new Error(inboxData.error || "Could not load inbox.");
      setAgentEnabled(settingsRes.ok && settingsData.settings?.enabled === true);
      setMessages(inboxData.messages || []);
      setDrafts(inboxData.drafts || []);
      setWorker(inboxData.worker || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load inbox.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("email-agent-refresh", refresh);
    return () => window.removeEventListener("email-agent-refresh", refresh);
  }, [load]);

  function getDraft(message) {
    return drafts.find((draft) => draft.id === message.draftId);
  }
  function getEdit(draft) {
    return edits[draft.id] || { subject: draft.subject, body: draft.body };
  }
  function setEdit(draft, key, value) {
    setEdits((current) => ({ ...current, [draft.id]: { ...getEdit(draft), [key]: value } }));
  }

  async function runInboxNow() {
    setRunning(true);
    setError("");
    setNotice("");
    setRunResult("");
    try {
      const response = await fetch("/api/email-agent/run", { method: "POST", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.reason || "Inbox check failed.");
      setRunResult(`Scanned ${data.scanned || 0} · queued ${data.queued || 0} · processed ${data.processed || 0} · drafted ${data.drafted || 0} · ${data.failed || 0} errors.`);
      if (data.failed > 0) setError(data.failures?.[0]?.error || data.reason || "Some messages need attention.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Inbox check failed.");
    } finally {
      setRunning(false);
    }
  }

  async function draftAction(draft, action) {
    if (action === "SEND" && !window.confirm("Send this reply to " + draft.toEmail + "?")) return;
    setBusyId(draft.id);
    setError("");
    setNotice("");
    try {
      if (action === "SAVE" || action === "APPROVE") {
        const current = getEdit(draft);
        const saveResponse = await fetch("/api/email-drafts/" + draft.id, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            toEmail: draft.toEmail,
            ccEmail: draft.ccEmail || "",
            subject: current.subject,
            body: current.body,
            goal: draft.goal || "",
          }),
        });
        const saved = await saveResponse.json();
        if (!saveResponse.ok) throw new Error(saved.error || "Could not save reply.");
      }
      if (action !== "SAVE") {
        const response = await fetch("/api/email-drafts/" + draft.id, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not update reply.");
      }
      setNotice(action === "SAVE" ? "Reply draft saved." : action === "APPROVE" ? "Reply approved. Send it when ready." : "Reply sent.");
      setEdits((current) => {
        const next = { ...current };
        delete next[draft.id];
        return next;
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update reply.");
      await load();
    } finally {
      setBusyId("");
    }
  }

  async function createMeeting(message, slot) {
    if (!window.confirm("Create the calendar event and send an invitation to " + message.fromEmail + "?")) return;
    setMeetingBusy(message.id);
    setError("");
    try {
      const response = await fetch("/api/email-agent/inbox/" + message.id + "/meeting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startAt: slot.startAt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create meeting.");
      setNotice("Meeting added to your calendar.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create meeting.");
    } finally {
      setMeetingBusy("");
    }
  }

  async function retryMessage(message) {
    setTaskBusyId(message.id);
    setError("");
    try {
      const response = await fetch("/api/email-agent/inbox/" + message.id + "/retry", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not retry message.");
      setNotice("Message returned to the processing queue.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not retry message.");
    } finally {
      setTaskBusyId("");
    }
  }

  async function reviewTask(message, action) {
    if (!window.confirm(action === "APPROVE"
      ? "Add this email-derived task to Tasks & calendar?"
      : "Decline this task proposal? No task will be created.")) return;
    setTaskBusyId(message.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/email-agent/inbox/" + message.id + "/task", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update task proposal.");
      setNotice(action === "APPROVE" ? "Task approved and added to Tasks & calendar." : "Task proposal declined.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update task proposal.");
      await load();
    } finally {
      setTaskBusyId("");
    }
  }

  const pendingCount = messages.filter((message) => {
    const draft = getDraft(message);
    const draftNeedsAttention = draft && ["DRAFT", "FAILED", "APPROVED", "SEND_UNCERTAIN"].includes(draft.status);
    const messageNeedsAttention = ["RECEIVED", "PROCESSING", "AWAITING_APPROVAL", "SAFETY_REVIEW", "MEETING_REVIEW", "TASK_REVIEW", "RETRY_WAIT", "FAILED"].includes(message.status);
    return Boolean(draftNeedsAttention || messageNeedsAttention);
  }).length;

  return (
    <section className="rounded-2xl border border-[#E3E7ED] bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#233044]">Inbox activity</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            {pendingCount} item{pendingCount === 1 ? "" : "s"} need attention
            {worker ? ` · ${worker.queuedCount || 0} queued · ${worker.processingCount || 0} processing · ${worker.retryingCount || 0} retrying · ${worker.failedCount || 0} stopped · ${worker.pagesScanned || 0} pages scanned` : ""}
          </p>
          {worker && (
            <p className="mt-1 text-xs text-[#6B7280]">
              {worker.oldestQueuedAgeSeconds !== null && worker.oldestQueuedAgeSeconds !== undefined ? `Oldest queued: ${Math.floor(worker.oldestQueuedAgeSeconds / 60)}m · ` : ""}
              {worker.scanFreshnessSeconds !== null && worker.scanFreshnessSeconds !== undefined ? `Last scan: ${Math.floor(worker.scanFreshnessSeconds / 60)}m ago · ` : ""}
              {worker.averageProcessingDurationMs !== null && worker.averageProcessingDurationMs !== undefined ? `Avg processing: ${(worker.averageProcessingDurationMs / 1000).toFixed(1)}s (${worker.measuredProcessingSamples} samples) · ` : ""}
              {Object.entries(worker.classifierModes || {}).map(([mode, count]) => `${mode.toLowerCase()}: ${count}`).join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void runInboxNow()}
          disabled={running || loading || !agentEnabled}
          title={!agentEnabled ? "Enable “Check incoming email” in settings first" : undefined}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw size={14} className={running ? "animate-spin" : ""} />
          {running ? "Checking inbox…" : "Check inbox now"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle size={16} />
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 size={16} />
          {notice}
        </p>
      )}
      {runResult && (
        <p role="status" className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{runResult}</p>
      )}
      {worker?.lastError && (
        <p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Latest worker issue: {worker.lastError}
        </p>
      )}
      {worker?.alerts?.length > 0 && (
        <p role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Operational alerts: {worker.alerts.join(", ").replaceAll("_", " ").toLowerCase()}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-sm text-[#6B7280]">Loading inbox…</p>
      ) : messages.length ? (
        <div className="space-y-3">
          {messages.map((message) => {
            const draft = getDraft(message);
            const classification = message.classification || {};
            const task = classification.task;
            return (
              <article key={message.id} className="rounded-xl border border-[#E8EBF0] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-semibold text-[#233044]">{message.subject || "(no subject)"}</h3>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      {message.fromEmail}
                      {message.receivedAt ? " · " + new Date(message.receivedAt).toLocaleString() : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#F3F5F7] px-2.5 py-1 text-xs">
                    {statusLabels[message.status] || message.status}
                  </span>
                </div>

                {message.summary && <p className="mt-3 text-sm leading-6 text-[#4B5563]">{message.summary}</p>}

                {classification.safetyReviewRequired && (
                  <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-semibold">Safety review required</p>
                    <p className="mt-1 text-xs leading-5">No task or substantive reply was inferred. Check the original message and clarify the request before approving or sending a reply.</p>
                    {Array.isArray(classification.reviewReasons) && classification.reviewReasons.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                        {classification.reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-[#F3F5F7] px-2.5 py-1">
                    {classification.intent?.replaceAll("_", " ") || message.category}
                  </span>
                  {message.sensitive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-900">
                      <ShieldAlert size={12} />
                      Needs approval
                    </span>
                  )}
                </div>

                {classification.taskId && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-950">
                    <ListTodo size={16} />
                    <span>Task added: {task?.title || "View in Tasks & calendar"}</span>
                    <a href="/dashboard/schedule" className="ml-auto inline-flex items-center gap-1 font-semibold underline">
                      Open task <ExternalLink size={12} />
                    </a>
                  </div>
                )}
                {task && classification.taskApprovalStatus === "PENDING" && message.status === "TASK_REVIEW" && (
                  <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50 p-3 text-sm text-violet-950">
                    <div className="flex items-center gap-2 font-semibold"><ListTodo size={15} /> Task proposal — approval required</div>
                    <p className="mt-2 font-medium">{task.title}</p>
                    {task.description && <p className="mt-1 text-xs leading-5">{task.description}</p>}
                    <p className="mt-2 text-xs">Priority: {task.priority || "MEDIUM"}{task.dueAt ? " · Due " + new Date(task.dueAt).toLocaleString() : " · No due date"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={Boolean(taskBusyId)}
                        onClick={() => void reviewTask(message, "APPROVE")}
                        className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {taskBusyId === message.id ? "Saving…" : "Approve and add task"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(taskBusyId)}
                        onClick={() => void reviewTask(message, "REJECT")}
                        className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        <XCircle size={13} /> Decline proposal
                      </button>
                    </div>
                  </div>
                )}
                {task && classification.taskApprovalStatus === "REJECTED" && (
                  <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Task proposal declined. No schedule item was created.</p>
                )}

                {(message.category === "MEETING" || ["MEETING_REQUEST", "RESCHEDULE"].includes(classification.intent)) &&
                  !classification.meetingEventId && (
                    <div className="mt-3 rounded-lg bg-blue-50 p-3">
                      <p className="text-sm font-medium text-blue-950">
                        <CalendarClock size={15} className="mr-1 inline" />
                        Meeting request
                      </p>
                      {Array.isArray(classification.availableSlots) && classification.availableSlots.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {classification.availableSlots.map((slot) => (
                            <button
                              key={slot.startAt}
                              type="button"
                              disabled={Boolean(meetingBusy)}
                              onClick={() => void createMeeting(message, slot)}
                              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
                            >
                              {meetingBusy === message.id ? "Creating…" : slot.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-blue-900">No available times were found. Reply to ask for another time.</p>
                      )}
                    </div>
                  )}

                {draft && (
                  <ReplyDraftCard
                    draft={draft}
                    busy={busyId === draft.id}
                    value={getEdit(draft)}
                    onChange={(key, value) => setEdit(draft, key, value)}
                    onAction={(action) => void draftAction(draft, action)}
                  />
                )}

                {message.lastError && (
                  <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    {message.lastError}
                    {message.status === "RETRY_WAIT" && message.nextAttemptAt && (
                      <p className="mt-1 text-xs">Next automatic attempt: {new Date(message.nextAttemptAt).toLocaleString()}</p>
                    )}
                    {message.status === "FAILED" && (
                      <button
                        type="button"
                        disabled={Boolean(taskBusyId)}
                        onClick={() => void retryMessage(message)}
                        className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Retry processing
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-[#6B7280]">
          No inbox messages processed yet. Enable the agent and choose “Check inbox now”.
        </p>
      )}
    </section>
  );
}

function ReplyDraftCard({ draft, busy, value, onChange, onAction }) {
  const editable = ["DRAFT", "FAILED"].includes(draft.status);
  const statusText =
    draft.status === "SENT" ? "Sent"
    : draft.status === "APPROVED" ? "Approved"
    : draft.status === "SEND_UNCERTAIN" ? "Check Gmail Sent"
    : draft.status;
  const canSubmit = value.subject.trim() && value.body.trim();

  return (
    <div className="mt-4 rounded-xl border border-[#E3E7ED] bg-[#FAFBFC] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Reply draft</h4>
        <span className="text-xs text-[#6B7280]">{statusText}</span>
      </div>

      {draft.lastError && <p className="mb-3 text-xs text-amber-900">{draft.lastError}</p>}

      {editable ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium">
            Subject
            <input
              value={value.subject}
              onChange={(event) => onChange("subject", event.target.value)}
              maxLength={250}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium">
            Reply
            <textarea
              value={value.body}
              onChange={(event) => onChange("body", event.target.value)}
              rows={5}
              maxLength={30000}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm leading-6"
            />
          </label>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-6 text-[#374151]">{draft.body}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {editable && (
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() => onAction("SAVE")}
            className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            <Save size={13} />
            Save
          </button>
        )}
        {draft.status === "DRAFT" && (
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() => onAction("APPROVE")}
            className="rounded-lg bg-[#FA8500] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Working…" : "Approve reply"}
          </button>
        )}
        {draft.status === "APPROVED" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction("SEND")}
            className="inline-flex items-center gap-1 rounded-lg bg-[#FA8500] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Send size={13} />
            {busy ? "Sending…" : "Send reply"}
          </button>
        )}
        {draft.status === "SENT" && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <CheckCircle2 size={13} />
            Sent
          </span>
        )}
        {draft.status === "SEND_UNCERTAIN" && (
          <p className="text-xs text-amber-900">Check Gmail Sent before retrying to avoid sending a duplicate.</p>
        )}
      </div>
    </div>
  );
}