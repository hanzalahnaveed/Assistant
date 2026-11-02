"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Inbox,
  ListTodo,
  MailOpen,
  Paperclip,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";
import { readJsonResponse } from "@/lib/client/read-json-response.mjs";

const statusLabels = {
  RECEIVED: "New",
  PROCESSING: "Processing",
  DRAFTED: "Reply ready",
  AWAITING_APPROVAL: "Needs review",
  SAFETY_REVIEW: "Safety review",
  MEETING_REVIEW: "Meeting request",
  MEETING_BOOKED_REVIEW: "Meeting booked",
  TASK_REVIEW: "Task approval",
  TASK_CREATED: "Task created",
  REPLIED: "Replied",
  SKIPPED: "Skipped",
  RETRY_WAIT: "Retry scheduled",
  SEND_UNCERTAIN: "Check Gmail Sent",
  FAILED: "Needs attention",
};

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function mergeDrafts(current, incoming) {
  const byId = new Map(current.map((draft) => [draft.id, draft]));
  incoming.forEach((draft) => byId.set(draft.id, draft));
  return Array.from(byId.values());
}

export default function InboundEmailQueue() {
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [runResult, setRunResult] = useState("");
  const [edits, setEdits] = useState({});
  const [meetingBusy, setMeetingBusy] = useState("");
  const [taskBusyId, setTaskBusyId] = useState("");
  const [worker, setWorker] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async () => {
    try {
      const [settingsRes, inboxRes] = await Promise.all([
        fetch("/api/email-agent/settings", { cache: "no-store" }),
        fetch("/api/email-agent/inbox", { cache: "no-store" }),
      ]);
      const settingsData = await readJsonResponse(settingsRes, "Email settings");
      const inboxData = await readJsonResponse(inboxRes, "Email inbox");
      if (!inboxRes.ok) throw new Error(inboxData.error || "Could not load inbox.");
      setAgentEnabled(settingsRes.ok && settingsData.settings?.enabled === true);
      setMessages(inboxData.messages || []);
      setDrafts(inboxData.drafts || []);
      setWorker(inboxData.worker || null);
      setNextOffset(inboxData.nextOffset ?? null);
      setError("");
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

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError("");
      setDetailLoading(false);
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);

    fetch("/api/email-agent/inbox/" + encodeURIComponent(selectedId), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await readJsonResponse(response, "Email content");
        if (!response.ok) throw new Error(data.error || "Could not load the full email.");
        if (active) setDetail(data.message || null);
      })
      .catch((reason) => {
        if (active && reason?.name !== "AbortError") {
          setDetailError(reason instanceof Error ? reason.message : "Could not load the full email.");
        }
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedId("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedId]);

  function getDraft(message) {
    return drafts.find((draft) => draft.id === message.draftId);
  }

  function getEdit(draft) {
    return edits[draft.id] || { subject: draft.subject, body: draft.body };
  }

  function setEdit(draft, key, value) {
    setEdits((current) => {
      const existing = current[draft.id] || { subject: draft.subject, body: draft.body };
      return { ...current, [draft.id]: { ...existing, [key]: value } };
    });
  }

  async function loadOlder() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const response = await fetch("/api/email-agent/inbox?offset=" + nextOffset, { cache: "no-store" });
      const data = await readJsonResponse(response, "Older email");
      if (!response.ok) throw new Error(data.error || "Could not load older email.");
      setMessages((current) => {
        const ids = new Set(current.map((message) => message.id));
        return current.concat((data.messages || []).filter((message) => !ids.has(message.id)));
      });
      setDrafts((current) => mergeDrafts(current, data.drafts || []));
      setNextOffset(data.nextOffset ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load older email.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function runInboxNow() {
    setRunning(true);
    setError("");
    setNotice("");
    setRunResult("");
    try {
      const response = await fetch("/api/email-agent/run", { method: "POST", cache: "no-store" });
      const data = await readJsonResponse(response, "Inbox check");
      if (!response.ok) throw new Error(data.error || data.reason || "Inbox check failed.");
      setRunResult(
        "Scanned " + (data.scanned || 0) +
        " · queued " + (data.queued || 0) +
        " · processed " + (data.processed || 0) +
        " · drafted " + (data.drafted || 0) +
        " · " + (data.failed || 0) + " errors.",
      );
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
        const saved = await readJsonResponse(saveResponse, "Reply draft save");
        if (!saveResponse.ok) throw new Error(saved.error || "Could not save reply.");
      }
      if (action !== "SAVE") {
        const response = await fetch("/api/email-drafts/" + draft.id, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const result = await readJsonResponse(response, "Reply action");
        if (!response.ok) throw new Error(result.error || "Could not update reply.");
      }
      setNotice(
        action === "SAVE"
          ? "Reply draft saved."
          : action === "APPROVE"
            ? "Reply approved. Press Send reply when you are ready."
            : "Reply sent.",
      );
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
      const data = await readJsonResponse(response, "Meeting creation");
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
      const data = await readJsonResponse(response, "Email retry");
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
    if (!window.confirm(
      action === "APPROVE"
        ? "Add this email-derived task to Tasks & calendar?"
        : "Decline this task proposal? No task will be created.",
    )) return;
    setTaskBusyId(message.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/email-agent/inbox/" + message.id + "/task", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await readJsonResponse(response, "Task proposal review");
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
    const messageNeedsAttention = [
      "RECEIVED", "PROCESSING", "AWAITING_APPROVAL", "SAFETY_REVIEW",
      "MEETING_REVIEW", "TASK_REVIEW", "RETRY_WAIT", "FAILED",
    ].includes(message.status);
    return Boolean(draftNeedsAttention || messageNeedsAttention);
  }).length;

  const selectedMessage = messages.find((message) => message.id === selectedId) || null;
  const selectedDraft = selectedMessage ? getDraft(selectedMessage) : null;
  const classification = selectedMessage?.classification || {};
  const task = classification.task;

  return (
    <section className="rounded-2xl border border-[#E3E7ED] bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Inbox size={19} className="text-[#FA8500]" />
            <h2 className="text-lg font-semibold text-[#233044]">Incoming mail</h2>
          </div>
          <p className="mt-1 text-sm text-[#6B7280]">
            {messages.length} loaded · {pendingCount} need attention · newest first
          </p>
          <p className="mt-1 text-xs text-[#8A919C]">
            Select any email to read the full message and review its suggested reply.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runInboxNow()}
          disabled={running || loading || !agentEnabled}
          title={!agentEnabled ? "Enable “Check incoming email” in settings first" : undefined}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E3E7ED] bg-white px-3 py-2 text-sm font-semibold text-[#233044] transition hover:bg-[#F8F9FA] disabled:opacity-50"
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

      {worker && (
        <details className="mb-4 rounded-lg border border-[#E8EBF0] bg-[#FAFBFC] px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-[#596579]">
            <ChevronDown size={14} />
            Email processing status
            <span className="ml-auto font-normal">
              {worker.queuedCount || 0} queued · {worker.processingCount || 0} processing · {worker.failedCount || 0} stopped
            </span>
          </summary>
          <div className="mt-3 space-y-1 border-t border-[#E8EBF0] pt-3 text-xs text-[#6B7280]">
            <p>
              {worker.retryingCount || 0} retrying · {worker.pagesScanned || 0} pages scanned
              {worker.oldestQueuedAgeSeconds !== null && worker.oldestQueuedAgeSeconds !== undefined
                ? " · Oldest queued: " + Math.floor(worker.oldestQueuedAgeSeconds / 60) + "m"
                : ""}
            </p>
            <p>
              {worker.scanFreshnessSeconds !== null && worker.scanFreshnessSeconds !== undefined
                ? "Last scan: " + Math.floor(worker.scanFreshnessSeconds / 60) + "m ago · "
                : ""}
              {worker.averageProcessingDurationMs !== null && worker.averageProcessingDurationMs !== undefined
                ? "Average processing: " + (worker.averageProcessingDurationMs / 1000).toFixed(1) + "s"
                : ""}
            </p>
            {worker.lastError && <p className="text-amber-800">Latest worker issue: {worker.lastError}</p>}
            {worker.alerts?.length > 0 && (
              <p role="alert" className="text-amber-800">
                Alerts: {worker.alerts.join(", ").replaceAll("_", " ").toLowerCase()}
              </p>
            )}
          </div>
        </details>
      )}

      {loading ? (
        <div className="space-y-3 py-5">
          {[0, 1, 2].map((item) => (
            <div key={item} className="animate-pulse rounded-xl border border-[#E8EBF0] p-4">
              <div className="h-3 w-2/5 rounded bg-slate-100" />
              <div className="mt-3 h-3 w-1/4 rounded bg-slate-100" />
              <div className="mt-4 h-3 w-4/5 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : messages.length ? (
        <div className="divide-y divide-[#EDF0F3] overflow-hidden rounded-xl border border-[#E8EBF0]">
          {messages.map((message) => {
            const draft = getDraft(message);
            const label = statusLabels[message.status] || message.status;
            const pendingDetails = message.fromEmail === "pending@assistant.invalid";
            const subjectLabel = pendingDetails ? "Message details pending" : message.subject || "(no subject)";
            const senderLabel = pendingDetails ? "Waiting for Gmail message details" : message.fromEmail;
            const preview = message.summary || message.lastError || (pendingDetails ? "Queued for processing. Open to read the original email." : "Open to read the full email.");
            const time = formatDate(message.receivedAt || message.createdAt);
            return (
              <button
                key={message.id}
                type="button"
                onClick={() => setSelectedId(message.id)}
                aria-haspopup="dialog"
                className="group flex w-full items-start gap-3 bg-white px-4 py-4 text-left transition hover:bg-[#FAFBFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FA8500]"
              >
                <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF3E6] text-[#D97706]">
                  <MailOpen size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="truncate text-sm font-semibold text-[#233044]">
                      {subjectLabel}
                    </span>
                    <span className="whitespace-nowrap text-[11px] text-[#89919D]">{time}</span>
                  </span>
                  <span className="mt-1 block truncate text-xs font-medium text-[#596579]">{senderLabel}</span>
                  <span className="mt-2 block line-clamp-2 text-sm leading-5 text-[#6B7280]">
                    {preview}
                  </span>
                  <span className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#F3F5F7] px-2.5 py-1 text-[10px] font-semibold text-[#596579]">
                      {label}
                    </span>
                    {draft && (
                      <span className="rounded-full bg-[#ECFDF3] px-2.5 py-1 text-[10px] font-semibold text-[#167346]">
                        {draft.status === "APPROVED" ? "Ready to send" : draft.status === "SENT" ? "Sent" : "Reply draft"}
                      </span>
                    )}
                    {message.sensitive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-900">
                        <ShieldAlert size={11} /> Review carefully
                      </span>
                    )}
                  </span>
                </span>
                <span className="mt-3 text-xs font-semibold text-[#A1A8B3] transition group-hover:text-[#D97706]">Open</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#DDE2E8] px-5 py-12 text-center">
          <Inbox size={28} className="mx-auto text-[#A1A8B3]" />
          <p className="mt-3 text-sm font-semibold text-[#344054]">No incoming email found</p>
          <p className="mt-1 text-xs text-[#7B8492]">
            Enable the email agent, connect Gmail, then select “Check inbox now”.
          </p>
        </div>
      )}

      {nextOffset !== null && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void loadOlder()}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-lg border border-[#E3E7ED] bg-white px-4 py-2 text-sm font-semibold text-[#344054] transition hover:bg-[#F8F9FA] disabled:opacity-50"
          >
            <Clock3 size={14} />
            {loadingMore ? "Loading older email…" : "Load older email"}
          </button>
        </div>
      )}

      {selectedMessage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-[2px] sm:p-5"
          onClick={() => setSelectedId("")}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-detail-title"
            className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#E8EBF0] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D97706]">Incoming email</p>
                <h3 id="email-detail-title" className="mt-1 break-words text-lg font-semibold text-[#233044]">
                  {detail?.subject || selectedMessage.subject || "(no subject)"}
                </h3>
                <p className="mt-1 text-xs text-[#7B8492]">
                  {statusLabels[selectedMessage.status] || selectedMessage.status}
                  {" · "}
                  {formatDate(detail?.receivedAt || selectedMessage.receivedAt || selectedMessage.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId("")}
                aria-label="Close email"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E3E7ED] text-[#596579] transition hover:bg-[#F3F5F7]"
              >
                <X size={17} />
              </button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
              <section className="min-h-0 border-b border-[#E8EBF0] p-5 sm:p-6 lg:overflow-y-auto lg:border-b-0 lg:border-r">
                <div className="mb-4 rounded-xl bg-[#F8F9FA] p-4">
                  {detailLoading ? (
                    <div className="animate-pulse space-y-2">
                      <div className="h-3 w-2/5 rounded bg-slate-200" />
                      <div className="h-3 w-3/5 rounded bg-slate-200" />
                    </div>
                  ) : detail ? (
                    <div className="space-y-2 text-xs text-[#596579]">
                      <p><strong className="text-[#344054]">From:</strong> {detail.from || selectedMessage.fromEmail}</p>
                      {detail.to && <p><strong className="text-[#344054]">To:</strong> {detail.to}</p>}
                      {detail.cc && <p><strong className="text-[#344054]">Cc:</strong> {detail.cc}</p>}
                      {detail.replyTo && <p><strong className="text-[#344054]">Reply-To:</strong> {detail.replyTo}</p>}
                      <p><strong className="text-[#344054]">Received:</strong> {formatDate(detail.receivedAt)}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-[#7B8492]">Loading sender and message details…</p>
                  )}
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#233044]">Original message</h4>
                  {detail?.bodyTruncated && <span className="text-[10px] text-amber-800">Long message shortened</span>}
                </div>
                {detailError && (
                  <p role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{detailError}</p>
                )}
                {detailLoading ? (
                  <div className="space-y-3 py-3">
                    <div className="h-3 w-full rounded bg-slate-100" />
                    <div className="h-3 w-11/12 rounded bg-slate-100" />
                    <div className="h-3 w-4/5 rounded bg-slate-100" />
                    <div className="h-3 w-10/12 rounded bg-slate-100" />
                  </div>
                ) : detail?.body ? (
                  <pre className="whitespace-pre-wrap break-words rounded-xl border border-[#E8EBF0] bg-white p-4 font-sans text-sm leading-6 text-[#344054]">
                    {detail.body}
                  </pre>
                ) : !detailError ? (
                  <p className="rounded-xl border border-dashed border-[#DDE2E8] p-4 text-sm text-[#7B8492]">
                    No readable text body was returned for this email.
                  </p>
                ) : null}

                {detail?.attachments?.length > 0 && (
                  <div className="mt-4 rounded-xl border border-[#E8EBF0] p-3">
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#596579]">
                      <Paperclip size={13} /> Attachments
                    </p>
                    <ul className="space-y-1">
                      {detail.attachments.map((attachment, index) => (
                        <li key={attachment.name + "-" + index} className="break-all text-xs text-[#596579]">
                          {attachment.name}
                          {attachment.size ? " · " + Math.ceil(attachment.size / 1024) + " KB" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedMessage.lastError && (
                  <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                    <p>{selectedMessage.lastError}</p>
                    {selectedMessage.status === "RETRY_WAIT" && selectedMessage.nextAttemptAt && (
                      <p className="mt-1">Next automatic attempt: {formatDate(selectedMessage.nextAttemptAt)}</p>
                    )}
                    {selectedMessage.status === "FAILED" && (
                      <button
                        type="button"
                        disabled={Boolean(taskBusyId)}
                        onClick={() => void retryMessage(selectedMessage)}
                        className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {taskBusyId === selectedMessage.id ? "Retrying…" : "Retry processing"}
                      </button>
                    )}
                  </div>
                )}

                {classification.safetyReviewRequired && (
                  <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-semibold">Safety review required</p>
                    <p className="mt-1 text-xs leading-5">
                      Check the original message and clarify the request before approving or sending a substantive reply.
                    </p>
                    {Array.isArray(classification.reviewReasons) && classification.reviewReasons.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                        {classification.reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                {classification.taskId && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-950">
                    <ListTodo size={16} />
                    <span>Task added: {task?.title || "View in Tasks & calendar"}</span>
                    <a href="/dashboard/schedule" className="ml-auto inline-flex items-center gap-1 font-semibold underline">
                      Open task <ExternalLink size={12} />
                    </a>
                  </div>
                )}
                {task && classification.taskApprovalStatus === "PENDING" && selectedMessage.status === "TASK_REVIEW" && (
                  <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50 p-3 text-sm text-violet-950">
                    <div className="flex items-center gap-2 font-semibold"><ListTodo size={15} /> Task proposal — approval required</div>
                    <p className="mt-2 font-medium">{task.title}</p>
                    {task.description && <p className="mt-1 text-xs leading-5">{task.description}</p>}
                    <p className="mt-2 text-xs">
                      Priority: {task.priority || "MEDIUM"}
                      {task.dueAt ? " · Due " + formatDate(task.dueAt) : " · No due date"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={Boolean(taskBusyId)}
                        onClick={() => void reviewTask(selectedMessage, "APPROVE")}
                        className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {taskBusyId === selectedMessage.id ? "Saving…" : "Approve and add task"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(taskBusyId)}
                        onClick={() => void reviewTask(selectedMessage, "REJECT")}
                        className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        <XCircle size={13} /> Decline proposal
                      </button>
                    </div>
                  </div>
                )}
                {task && classification.taskApprovalStatus === "REJECTED" && (
                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    Task proposal declined. No schedule item was created.
                  </p>
                )}

                {(selectedMessage.category === "MEETING" ||
                  ["MEETING_REQUEST", "RESCHEDULE"].includes(classification.intent)) &&
                  !classification.meetingEventId && (
                    <div className="mt-4 rounded-lg bg-blue-50 p-3">
                      <p className="text-sm font-medium text-blue-950">
                        <CalendarClock size={15} className="mr-1 inline" /> Meeting request
                      </p>
                      {Array.isArray(classification.availableSlots) && classification.availableSlots.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {classification.availableSlots.map((slot) => (
                            <button
                              key={slot.startAt}
                              type="button"
                              disabled={Boolean(meetingBusy)}
                              onClick={() => void createMeeting(selectedMessage, slot)}
                              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
                            >
                              {meetingBusy === selectedMessage.id ? "Creating…" : slot.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-blue-900">No available times were found. Reply to ask for another time.</p>
                      )}
                    </div>
                  )}
              </section>

              <section className="min-h-0 p-5 sm:p-6 lg:overflow-y-auto">
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D97706]">Reply composer</p>
                  <h4 className="mt-1 text-base font-semibold text-[#233044]">Suggested reply</h4>
                  <p className="mt-1 text-xs leading-5 text-[#7B8492]">
                    Review the wording before approval. Sending remains a separate action.
                  </p>
                </div>
                {selectedDraft ? (
                  <ReplyDraftCard
                    draft={selectedDraft}
                    busy={busyId === selectedDraft.id}
                    value={getEdit(selectedDraft)}
                    onChange={(key, value) => setEdit(selectedDraft, key, value)}
                    onAction={(action) => void draftAction(selectedDraft, action)}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-[#DDE2E8] p-5 text-sm text-[#7B8492]">
                    A reply draft is not available yet. The email may still be processing, or it may have been skipped by the agent.
                  </div>
                )}
                {error && (
                  <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>
                )}
                {notice && (
                  <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ReplyDraftCard({ draft, busy, value, onChange, onAction }) {
  const editable = ["DRAFT", "FAILED"].includes(draft.status);
  const statusText =
    draft.status === "SENT" ? "Sent"
      : draft.status === "APPROVED" ? "Approved — ready to send"
        : draft.status === "SEND_UNCERTAIN" ? "Send outcome uncertain"
          : draft.status === "SENDING" ? "Sending…"
            : draft.status;
  const canSubmit = Boolean(value.subject.trim() && value.body.trim());

  return (
    <div className="rounded-xl border border-[#E3E7ED] bg-[#FAFBFC] p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold text-[#233044]">Reply to {draft.toEmail}</h5>
          {draft.ccEmail && <p className="mt-1 text-xs text-[#7B8492]">Cc: {draft.ccEmail}</p>}
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#596579]">{statusText}</span>
      </div>

      {draft.lastError && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{draft.lastError}</p>}

      {editable ? (
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-[#596579]">
            Subject
            <input
              value={value.subject}
              onChange={(event) => onChange("subject", event.target.value)}
              maxLength={250}
              className="mt-1 w-full rounded-lg border border-[#DDE2E8] bg-white px-3 py-2.5 text-sm font-normal text-[#344054] outline-none focus:border-[#FA8500]"
            />
          </label>
          <label className="block text-xs font-semibold text-[#596579]">
            Reply
            <textarea
              value={value.body}
              onChange={(event) => onChange("body", event.target.value)}
              rows={12}
              maxLength={30000}
              className="mt-1 w-full resize-y rounded-lg border border-[#DDE2E8] bg-white px-3 py-3 text-sm font-normal leading-6 text-[#344054] outline-none focus:border-[#FA8500]"
            />
          </label>
        </div>
      ) : (
        <div className="rounded-lg border border-[#E8EBF0] bg-white p-4">
          <p className="mb-3 break-words text-sm font-semibold text-[#344054]">{draft.subject}</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#596579]">{draft.body}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {editable && (
          <>
            <button
              type="button"
              disabled={busy || !canSubmit}
              onClick={() => onAction("SAVE")}
              className="inline-flex items-center gap-2 rounded-lg border border-[#DDE2E8] bg-white px-3 py-2.5 text-xs font-semibold text-[#344054] disabled:opacity-50"
            >
              <Save size={13} /> Save changes
            </button>
            {draft.status === "DRAFT" && (
              <button
                type="button"
                disabled={busy || !canSubmit}
                onClick={() => onAction("APPROVE")}
                className="rounded-lg bg-[#FA8500] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Saving approval…" : "Approve reply"}
              </button>
            )}
          </>
        )}
        {draft.status === "APPROVED" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction("SEND")}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FA8500] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#E87700] disabled:opacity-50"
          >
            <Send size={13} />
            {busy ? "Sending…" : "Send reply"}
          </button>
        )}
        {draft.status === "SENT" && (
          <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 size={13} /> Sent
          </span>
        )}
        {draft.status === "SEND_UNCERTAIN" && (
          <p className="text-xs leading-5 text-amber-900">
            Check Gmail Sent before retrying. The send is locked to prevent accidental duplicates.
          </p>
        )}
      </div>

      {draft.status === "DRAFT" && (
        <p className="mt-3 text-[11px] leading-5 text-[#7B8492]">
          First approve this exact version. The Send reply button appears after approval and requires a separate click.
        </p>
      )}
    </div>
  );
}
