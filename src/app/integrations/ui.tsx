"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, ExternalLink, Inbox, LoaderCircle, LogOut, RefreshCw, ShieldCheck, Sparkles, Unplug } from "lucide-react";
import WorkspaceHeader from "@/components/workspace-header";

type Email = { id: string; from: string; subject: string; snippet: string; date: string };
type Event = { id: string; title: string; start: string | null; end: string | null; location: string | null; link: string | null; attendeeCount: number };
type Overview = {
  connected: boolean; reauthRequired?: boolean; error?: string;
  user?: { email: string; name: string | null; imageUrl: string | null };
  integration?: { email?: string | null; status?: string; lastSyncedAt?: string | null };
  emails: Email[]; events: Event[]; emailCountEstimate?: number;
};

function formatDate(value: string | null) {
  if (!value) return "Time not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}

export default function IntegrationsClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/overview", { cache: "no-store" });
      const body = await response.json() as Overview & { error?: string };
      if (response.status === 401) {
        setData({ connected: false, emails: [], events: [] });
      } else {
        setData(body);
        if (!response.ok && body.error) setError(body.error);
        else if (body.error) setError(body.error);
      }
    } catch {
      setError("Could not reach the app server. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function disconnect() {
    if (!window.confirm("Disconnect Google Workspace and revoke this app's stored Google access?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/google/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Disconnect failed. Please retry.");
      setNotice("Google Workspace disconnected. Your app session remains active.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/");
  }

  return <main className="min-h-screen bg-[#f7f8f5] text-[#18211f]">
    <WorkspaceHeader />
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#176b52]"><ShieldCheck size={14} /> Workspace settings</div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#176b52]"><Sparkles size={14} /> Workspace connections</div><h1 className="text-3xl font-semibold tracking-tight">Connect your workday.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[#76817c]">Give your assistant read-only access to Gmail and Google Calendar so it can surface the work that matters.</p></div>
        <button onClick={() => void load()} disabled={loading || busy} className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#fafbf9] disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button>
      </div>

      {error && <div role="alert" className="mb-5 rounded-xl border border-[#f0d6cc] bg-[#fff5f0] px-4 py-3 text-sm text-[#994b36]">{error}</div>}
      {notice && <div role="status" className="mb-5 rounded-xl border border-[#d8e9dd] bg-[#eef7f0] px-4 py-3 text-sm text-[#24543f]">{notice}</div>}

      <section className="mb-6 rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f0ff] text-[#356ac3]"><span className="text-lg font-bold">G</span></div><div><h2 className="text-base font-semibold">Google Workspace</h2><p className="mt-1 text-sm text-[#76817c]">Gmail inbox and primary calendar</p><div className="mt-3 flex items-center gap-2 text-xs text-[#76817c]"><ShieldCheck size={14} className="text-[#176b52]" /> Read-only permissions · No email sending or calendar edits</div>{data?.connected && <div className="mt-3 flex items-center gap-2 text-sm font-medium text-[#176b52]"><CheckCircle2 size={16} /> Connected as {data.integration?.email ?? data.user?.email}</div>}</div></div>
          {loading ? <div className="flex items-center gap-2 text-sm text-[#76817c]"><LoaderCircle size={16} className="animate-spin" /> Checking connection…</div> : data?.connected ? <div className="flex gap-2"><button onClick={() => void disconnect()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-[#e2e8e0] px-3.5 py-2.5 text-sm font-medium hover:bg-[#fafbf9] disabled:opacity-50"><Unplug size={15} /> Disconnect</button><a href="/api/auth/google/start" className="inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#10543f]">Reconnect <ExternalLink size={14} /></a></div> : <a href="/api/auth/google/start" className="inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#10543f]">Connect Google <ExternalLink size={14} /></a>}
        </div>
        {data?.reauthRequired && <p className="mt-4 text-sm text-[#9b6425]">Your Google session needs reconnecting. Connect Google again to continue.</p>}
        <div className="mt-6 grid gap-3 border-t border-[#edf0ec] pt-5 sm:grid-cols-3">
          <Permission title="Gmail" description="Read inbox message metadata and snippets" icon={<Inbox size={16} />} />
          <Permission title="Calendar" description="Read events on your primary calendar" icon={<CalendarDays size={16} />} />
          <Permission title="Your control" description="Disconnect and revoke access at any time" icon={<ShieldCheck size={16} />} />
        </div>
      </section>

      {data?.connected && <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Recent inbox</h2><p className="mt-1 text-xs text-[#76817c]">Latest matching messages · snippets only</p></div><Inbox size={18} className="text-[#176b52]" /></div>
          {loading ? <Loading /> : data.emails.length ? <div className="divide-y divide-[#edf0ec]">{data.emails.map(email => <article key={email.id} className="py-3"><div className="truncate text-xs font-semibold">{email.subject}</div><div className="mt-1 truncate text-[11px] text-[#76817c]">{email.from}</div><p className="mt-2 text-xs leading-5 text-[#5d6961]">{email.snippet}</p>{email.date && <div className="mt-1 text-[10px] text-[#9aa39e]">{email.date}</div>}</article>)}</div> : <Empty text="No matching messages found in the recent inbox." />}</section>
        <section className="rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Today’s calendar</h2><p className="mt-1 text-xs text-[#76817c]">Upcoming events from your primary calendar</p></div><CalendarDays size={18} className="text-[#176b52]" /></div>
          {loading ? <Loading /> : data.events.length ? <div className="space-y-2">{data.events.map(event => <article key={event.id} className="rounded-xl bg-[#f8faf7] p-3.5"><div className="text-sm font-semibold">{event.title}</div><div className="mt-1 text-xs text-[#68756d]">{formatDate(event.start)}</div>{event.location && <div className="mt-1 text-xs text-[#87918b]">{event.location}</div>}{event.link && <a className="mt-2 inline-block text-xs font-semibold text-[#176b52]" href={event.link} target="_blank" rel="noreferrer">Open in Google Calendar ↗</a>}</article>)}</div> : <Empty text="No upcoming events found for today." />}</section>
      </div>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[#87918b]"><span>OAuth credentials stay server-side and stored tokens are encrypted at rest.</span>{data?.user && <button onClick={() => void logout()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white"><LogOut size={14} /> Sign out {data.user.email}</button>}</div>
    </div>
  </main>;
}

function Permission({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return <div className="flex gap-3 rounded-xl bg-[#f8faf7] p-3.5"><div className="mt-0.5 text-[#176b52]">{icon}</div><div><div className="text-xs font-semibold">{title}</div><p className="mt-1 text-[11px] leading-5 text-[#76817c]">{description}</p></div></div>;
}
function Loading() { return <div className="flex items-center gap-2 py-8 text-sm text-[#76817c]"><LoaderCircle size={16} className="animate-spin" /> Loading live Google data…</div>; }
function Empty({ text }: { text: string }) { return <p className="py-8 text-sm text-[#76817c]">{text}</p>; }
