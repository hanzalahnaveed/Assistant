"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ExternalLink, ListTodo, RefreshCw, ShieldAlert } from "lucide-react";

const statusLabels = {
  RECEIVED: "Received",
  PROCESSING: "Processing",
  DRAFTED: "Draft ready",
  AWAITING_APPROVAL: "Manager review",
  MEETING_REVIEW: "Meeting review",
  MEETING_BOOKED_REVIEW: "Meeting booked · reply review",
  TASK_REVIEW: "Task review",
  REPLIED: "Replied",
  SEND_UNCERTAIN: "Check Sent folder",
  FAILED: "Needs attention",
};

export default function InboundEmailQueue({ onOpenDraft }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meetingBusy, setMeetingBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/email-agent/inbox", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load inbound email activity.");
      setMessages(data.messages || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load inbound email activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createMeeting(message, slot) {
    if (!window.confirm(
      "Create this Google Calendar event and send the calendar invitation to " +
      message.fromEmail +
      "? The email reply will remain a draft for you to review and send."
    )) return;
    setMeetingBusy(message.id + ":" + slot.startAt);
    setError("");
    try {
      const response = await fetch("/api/email-agent/inbox/" + message.id + "/meeting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startAt: slot.startAt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create the meeting.");
      await load();
      if (data.draft?.id) onOpenDraft(data.draft.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the meeting.");
    } finally {
      setMeetingBusy("");
    }
  }

  return (
    <section className="mb-5 rounded-[18px] border border-[#E3E7ED] bg-white p-5 shadow-[0_2px_4px_rgb(35_48_68/5%)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><h2 className="font-semibold text-[#233044]">Inbound email activity</h2><p className="mt-1 text-sm text-[#6B7280]">Recent messages processed by the agent, including items awaiting approval.</p></div>
        <button type="button" aria-label="Refresh inbound email activity" onClick={() => void load()} disabled={loading} className="rounded-lg border border-[#E3E7ED] p-2 text-[#6B7280] disabled:opacity-50"><RefreshCw size={15} /></button>
      </div>
      {error && <p role="alert" className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle size={16} />{error}</p>}
      {loading ? <p className="py-4 text-sm text-[#6B7280]">Loading inbox activity…</p> : messages.length ? (
        <div className="space-y-2">
          {messages.map((message) => (
            <article key={message.id} className="rounded-xl border border-[#E8EBF0] p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-[#233044]">{message.subject || "(no subject)"}</h3><p className="mt-1 truncate text-xs text-[#6B7280]">{message.fromEmail}{message.receivedAt ? " · " + new Date(message.receivedAt).toLocaleString() : ""}</p></div>
                <span className="rounded-full bg-[#F3F5F7] px-2.5 py-1 text-[11px] font-medium text-[#4B5563]">{statusLabels[message.status] || message.status}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#F3F5F7] px-2 py-1 text-[11px]">{message.category}</span>
                {message.sensitive && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900"><ShieldAlert size={12} />Sensitive</span>}
                {message.category === "MEETING" && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px]"><CalendarClock size={12} />Scheduling</span>}
                {message.category === "TASK" && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[11px]"><ListTodo size={12} />Task request</span>}
              </div>
              {message.summary && <p className="mt-2 text-sm leading-5 text-[#4B5563]">{message.summary}</p>}
              {message.lastError && <p className="mt-2 text-xs text-amber-900">{message.lastError}</p>}
              {message.category === "MEETING" && !message.classification?.meetingEventId && (
                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                  <p className="text-xs leading-5 text-[#374151]">Choose a free slot to create a calendar event and generate a Google Meet link. The calendar invitation is sent to the sender; your email reply stays in drafts until you approve and send it.</p>
                  {Array.isArray(message.classification?.availableSlots) && message.classification.availableSlots.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.classification.availableSlots.map((slot) => (
                        <button
                          key={slot.startAt}
                          type="button"
                          disabled={Boolean(meetingBusy)}
                          onClick={() => void createMeeting(message, slot)}
                          className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-900 disabled:opacity-50"
                        >
                          {meetingBusy === message.id + ":" + slot.startAt ? "Creating…" : slot.label}
                        </button>
                      ))}
                    </div>
                  ) : <p className="mt-2 text-xs text-[#6B7280]">No free slots were found. Review the draft and ask the sender for another time.</p>}
                </div>
              )}
              {message.classification?.meetingEventId && (
                <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
                  <p className="font-semibold text-emerald-900">Meeting created; reply still needs review</p>
                  {message.classification.meetingLink && <p className="mt-1"><a href={message.classification.meetingLink} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-800 underline">Open Google Meet</a></p>}
                  {message.classification.calendarEventLink && <p className="mt-1"><a href={message.classification.calendarEventLink} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-800 underline">Open calendar event</a></p>}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {message.draftId ? <button type="button" onClick={() => onOpenDraft(message.draftId)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#B45F00] hover:underline">Review reply draft <ExternalLink size={12} /></button> : <span className="text-xs text-[#6B7280]">No reply draft available</span>}
                {message.status === "REPLIED" && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={13} />Reply sent</span>}
              </div>
            </article>
          ))}
        </div>
      ) : <p className="py-5 text-center text-sm text-[#6B7280]">No inbound messages processed yet. Enable the agent and run the email worker to start.</p>}
    </section>
  );
}
