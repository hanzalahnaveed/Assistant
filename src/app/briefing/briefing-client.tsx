"use client";

import { useCallback, useEffect, useState } from "react";
import WorkspaceHeader from "@/components/workspace-header";
import { Activity, AlertCircle, ArrowRight, Bell, CalendarDays, CheckCheck, CheckCircle2, Clock3, ExternalLink, Inbox, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Target, ListTodo } from "lucide-react";

type Task = { id: string; title: string; description: string | null; status: string; priority: string; dueAt: string | null; score?: number; reasons?: string[] };
type Email = { id: string; threadId: string; from: string; subject: string; snippet: string; date: string; score: number; reasons: string[] };
type Event = { id: string; title: string; start: string | null; end: string | null; location: string | null; link: string | null };
type Notice = { id: string; type: string; title: string; body: string; readAt: string | null; createdAt: string; payload: Record<string, unknown> };
type Briefing = {
  generatedAt: string; timezone: string; greeting: string; summary: string; connected: boolean;
  workspaceError: string | null; preferences: { dailyBriefingEnabled: boolean; briefingHour: number; defaultApprovalMode: string };
  metrics: { openTasks: number; overdueTasks: number; dueTodayTasks: number; highPriorityTasks: number; events: number; followUps: number };
  tasks: Task[]; events: Event[]; followUps: Email[];
};

function formatDate(value: string | null) {
  if (!value) return "Time not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(date);
}
function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-[#e7ebe7] bg-white p-4"><div className="flex items-center justify-between text-[#76817c]"><span className="text-xs">{label}</span>{icon}</div><div className="mt-3 text-2xl font-semibold tracking-tight text-[#18211f]">{value}</div></div>;
}

export default function BriefingClient() {
  const [data, setData] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/briefing", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load your briefing.");
      setData(body);
      const notificationResponse = await fetch("/api/notifications", { cache: "no-store" });
      if (notificationResponse.ok) {
        const notificationBody = await notificationResponse.json();
        setNotifications(notificationBody.notifications ?? []);
        setUnreadCount(notificationBody.unreadCount ?? 0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your briefing.");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createTask(email: Email) {
    setCreating(email.id); setNotice(""); setError("");
    try {
      const response = await fetch("/api/actions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionType: "CREATE_TASK",
          idempotencyKey: `briefing-email-${email.id}`,
          input: {
            title: "Follow up: " + email.subject.slice(0, 175),
            description: [`Suggested from email by ${email.from}`, email.snippet, `Source Gmail message ID: ${email.id}`].filter(Boolean).join("\n\n"),
            priority: email.score >= 6 ? "HIGH" : "MEDIUM"
          }
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not propose follow-up task.");
      const status = body.action?.status;
      setNotice(status === "SUCCEEDED"
        ? "Follow-up task created under your AUTO rule. No email was sent or changed."
        : status === "PENDING"
          ? "Follow-up task proposal sent to the Action Center for your approval."
          : "An action for this email already exists. Check the Action Center for its current status.");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not propose follow-up task.");
    } finally { setCreating(null); }
  }

  async function saveBriefing(enabled: boolean) {
    if (!data) return;
    setNotice(""); setError("");
    try {
      const response = await fetch("/api/preferences", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ dailyBriefingEnabled: enabled })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save briefing preference.");
      setData({ ...data, preferences: body.preferences });
      setNotice(enabled ? "Daily briefing preference enabled." : "Daily briefing preference disabled.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save preference."); }
  }

  async function saveBriefingHour(hour: number) {
    if (!data) return;
    setNotice(""); setError("");
    try {
      const response = await fetch("/api/preferences", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefingHour: hour })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save delivery time.");
      setData({ ...data, preferences: body.preferences });
      setNotice(`Daily briefing scheduled for ${String(hour).padStart(2, "0")}:00 (${data.timezone}).`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save delivery time."); }
  }

  async function markNotificationRead(notificationId?: string) {
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify(notificationId ? { notificationId } : { markAllRead: true })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update notifications.");
      const notificationResponse = await fetch("/api/notifications", { cache: "no-store" });
      if (notificationResponse.ok) {
        const notificationBody = await notificationResponse.json();
        setNotifications(notificationBody.notifications ?? []);
        setUnreadCount(notificationBody.unreadCount ?? 0);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update notifications."); }
  }

  return <main className="min-h-screen bg-[#f8faf7] text-[#18211f]">
    <WorkspaceHeader />
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-[#176b52]"><Sparkles size={14}/> Live daily briefing</div><h1 className="text-3xl font-semibold tracking-tight">{data?.greeting ?? "Your day, under control"}.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#76817c]">{data?.summary ?? "Priorities from your tasks, calendar, and inbox follow-ups."}</p></div>
      <button onClick={() => void load(true)} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#fafbf9] disabled:opacity-50"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""}/> Refresh briefing</button></div>

      {error && <div role="alert" className="mb-5 flex gap-2 rounded-xl border border-[#f0d6cc] bg-[#fff5f0] px-4 py-3 text-sm text-[#994b36]"><AlertCircle size={17} className="mt-0.5 shrink-0"/>{error}</div>}
      {notice && <div role="status" className="mb-5 rounded-xl border border-[#d8e9dd] bg-[#eef7f0] px-4 py-3 text-sm text-[#24543f]">{notice}</div>}
      {data?.workspaceError && <div role="status" className="mb-5 rounded-xl border border-[#eadfc7] bg-[#fffaf0] px-4 py-3 text-sm text-[#87642c]">Google data could not be fully refreshed: {data.workspaceError} <a href="/integrations" className="ml-1 font-semibold underline">Check integration</a></div>}

      {loading && !data ? <div className="flex items-center gap-3 rounded-2xl border border-[#e7ebe7] bg-white p-8 text-sm text-[#76817c]"><LoaderCircle size={18} className="animate-spin"/> Building your briefing…</div> : data && <>
        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Open tasks" value={data.metrics.openTasks} icon={<ListTodo size={17}/>}/>
          <Metric label="Overdue" value={data.metrics.overdueTasks} icon={<AlertCircle size={17}/>}/>
          <Metric label="Due today" value={data.metrics.dueTodayTasks} icon={<Clock3 size={17}/>}/>
          <Metric label="High priority" value={data.metrics.highPriorityTasks} icon={<Target size={17}/>}/>
          <Metric label="Today's events" value={data.metrics.events} icon={<CalendarDays size={17}/>}/>
          <Metric label="Follow-up emails" value={data.metrics.followUps} icon={<Inbox size={17}/>}/>
        </section>
        <section className="mb-6 grid items-start gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#e7ebe7] bg-white p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><Target size={18} className="text-[#176b52]"/><h2 className="font-semibold">Recommended focus</h2></div>
            {data.tasks.length ? <div className="divide-y divide-[#edf0ec]">{data.tasks.slice(0, 8).map(task => <article key={task.id} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium">{task.title}</div><div className="mt-1 text-xs text-[#76817c]">{task.status.replace("_", " ")} · {task.priority}{task.dueAt ? " · due " + formatDate(task.dueAt) : ""}</div>{task.reasons?.length ? <div className="mt-2 flex flex-wrap gap-1">{task.reasons.slice(0, 2).map(reason => <span key={reason} className="rounded-full bg-[#eef7f0] px-2 py-1 text-[10px] text-[#37664d]">{reason}</span>)}</div> : null}</div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${task.priority === "URGENT" ? "bg-[#fff0eb] text-[#a94f36]" : task.priority === "HIGH" ? "bg-[#fff6e5] text-[#8c682e]" : "bg-[#f1f4f0] text-[#68756d]"}`}>{task.priority}</span></div></article>)}</div> : <p className="py-6 text-sm text-[#76817c]">No open tasks yet. <a href="/tasks" className="font-semibold text-[#176b52]">Add your first task <ArrowRight size={13} className="inline"/></a></p>}
          </div>
          <div className="rounded-2xl border border-[#e7ebe7] bg-white p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><CalendarDays size={18} className="text-[#176b52]"/><h2 className="font-semibold">Today's calendar</h2></div>
            {!data.connected && <p className="mb-3 rounded-xl bg-[#f8faf7] p-3 text-xs leading-5 text-[#76817c]">Connect Google Workspace to include your live calendar and inbox. <a href="/integrations" className="font-semibold text-[#176b52]">Connect Google</a></p>}
            {data.events.length ? <div className="space-y-2">{data.events.map(event => <article key={event.id} className="rounded-xl bg-[#f8faf7] p-3.5"><div className="flex items-start justify-between gap-3"><div className="text-sm font-semibold">{event.title}</div><span className="shrink-0 text-xs text-[#76817c]">{formatDate(event.start)}</span></div>{event.location && <p className="mt-1 text-xs text-[#76817c]">{event.location}</p>}{event.link && <a href={event.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#176b52]">Open event <ExternalLink size={12}/></a>}</article>)}</div> : <p className="py-5 text-sm text-[#76817c]">No calendar events available for today.</p>}
          </div>
        </section>
        <section className="mb-6 rounded-2xl border border-[#e7ebe7] bg-white p-5 sm:p-6"><div className="mb-1 flex items-center gap-2"><Inbox size={18} className="text-[#176b52]"/><h2 className="font-semibold">Inbox follow-up recommendations</h2></div><p className="mb-4 text-xs leading-5 text-[#76817c]">Rule-based suggestions from read-only email metadata and snippets. Review them yourself; the assistant never sends a reply automatically.</p>
          {!data.connected && <p className="mb-4 rounded-xl bg-[#f8faf7] p-3 text-xs text-[#76817c]">Connect Google Workspace to generate follow-up suggestions. <a href="/integrations" className="font-semibold text-[#176b52]">Connect Google</a></p>}
          {data.followUps.length ? <div className="divide-y divide-[#edf0ec]">{data.followUps.map(email => <article key={email.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{email.subject}</div><div className="mt-1 text-xs text-[#76817c]">{email.from}{email.date ? " · " + email.date : ""}</div><p className="mt-2 text-sm leading-6 text-[#5d6961]">{email.snippet || "No preview available."}</p><div className="mt-2 flex flex-wrap gap-1.5">{email.reasons.map(reason => <span key={reason} className="rounded-full bg-[#f1f4f0] px-2 py-1 text-[10px] text-[#68756d]">{reason}</span>)}</div></div><button onClick={() => void createTask(email)} disabled={creating === email.id} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#176b52] px-3 py-2 text-xs font-semibold text-white hover:bg-[#10543f] disabled:opacity-50">{creating === email.id ? <LoaderCircle size={13} className="animate-spin"/> : <CheckCircle2 size={13}/>} Propose follow-up task</button></div></article>)}</div> : <p className="py-6 text-sm text-[#76817c]">{data.connected ? "No messages currently meet the follow-up scoring threshold." : "No live email recommendations until Google Workspace is connected."}</p>}
        </section>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dce9de] bg-[#eef7f0] p-5"><div className="flex gap-3"><ShieldCheck size={20} className="mt-0.5 text-[#176b52]"/><div><div className="text-sm font-semibold">Your briefing, your rules</div><p className="mt-1 text-xs leading-5 text-[#5d7566]">No messages are sent and no calendar events are changed. Email content is treated as untrusted data.</p></div></div><div className="flex flex-wrap items-center gap-4"><label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#24543f]"><input type="checkbox" checked={data.preferences.dailyBriefingEnabled} onChange={e => void saveBriefing(e.target.checked)} className="h-4 w-4 accent-[#176b52]"/> Daily briefing enabled</label><label className="flex items-center gap-2 text-xs font-semibold text-[#24543f]">Delivery time <select value={data.preferences.briefingHour} onChange={e => void saveBriefingHour(Number(e.target.value))} className="rounded-lg border border-[#d5e3d8] bg-white px-2 py-1.5 text-xs">{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label></div></section>
        <section className="mt-6 rounded-2xl border border-[#e7ebe7] bg-white p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Bell size={18} className="text-[#176b52]"/><h2 className="font-semibold">Scheduled briefings & notifications</h2>{unreadCount > 0 && <span className="rounded-full bg-[#176b52] px-2 py-0.5 text-[10px] font-semibold text-white">{unreadCount} new</span>}</div><p className="mt-1 text-xs text-[#76817c]">Saved daily briefings and in-app notifications.</p></div>{unreadCount > 0 && <button onClick={() => void markNotificationRead()} className="inline-flex items-center gap-1 text-xs font-semibold text-[#176b52]"><CheckCheck size={14}/> Mark all read</button>}</div>
          {notifications.length ? <div className="divide-y divide-[#edf0ec]">{notifications.slice(0, 8).map(item => <article key={item.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="flex min-w-0 gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-[#d8dfd9]" : "bg-[#176b52]"}`}/><div><div className="text-sm font-medium">{item.title}</div><p className="mt-1 text-xs leading-5 text-[#76817c]">{item.body}</p><div className="mt-1 text-[10px] text-[#9aa39d]">{new Date(item.createdAt).toLocaleString()}</div></div></div>{!item.readAt && <button onClick={() => void markNotificationRead(item.id)} className="shrink-0 text-xs font-semibold text-[#176b52]">Mark read</button>}</article>)}</div> : <p className="py-4 text-sm text-[#76817c]">No scheduled briefing notifications yet. The worker will create one during your selected local delivery hour.</p>}
        </section>
        <div className="mt-4 flex items-center justify-between text-[11px] text-[#87918b]"><span>Generated {new Date(data.generatedAt).toLocaleString()} · {data.timezone}</span><span className="inline-flex items-center gap-1"><Activity size={12}/> Live data, when connected</span></div>
      </>}
    </div>
  </main>;
}
