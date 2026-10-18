"use client";

import { useCallback, useEffect, useState } from "react";
import WorkspaceHeader from "@/components/workspace-header";
import { AlertCircle, CalendarDays, Clock3, Inbox, ListTodo, LoaderCircle, RefreshCw, Target } from "lucide-react";

type Briefing = {
  greeting: string;
  summary: string;
  workspaceError: string | null;
  metrics: {
    openTasks: number;
    overdueTasks: number;
    dueTodayTasks: number;
    highPriorityTasks: number;
    events: number;
    followUps: number;
  };
};

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-[#e7ebe7] bg-white p-5">
    <div className="flex items-center justify-between text-[#76817c]"><span className="text-xs font-medium">{label}</span>{icon}</div>
    <div className="mt-4 text-3xl font-semibold tracking-tight text-[#18211f]">{value}</div>
  </div>;
}

export default function BriefingClient() {
  const [data, setData] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/briefing", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load your overview.");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your overview.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <main className="min-h-screen bg-[#f8faf7] text-[#18211f]">
    <WorkspaceHeader />
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[.14em] text-[#176b52]">Overview</div>
          <h1 className="text-3xl font-semibold tracking-tight">{data?.greeting ?? "Your day, under control"}.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#76817c]">{data?.summary ?? "A clear summary of your tasks, calendar, and inbox."}</p>
        </div>
        <button onClick={() => void load(true)} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#fafbf9] disabled:opacity-50">
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""}/> Refresh
        </button>
      </div>

      {error && <div role="alert" className="mb-5 flex gap-2 rounded-xl border border-[#f0d6cc] bg-[#fff5f0] px-4 py-3 text-sm text-[#994b36]"><AlertCircle size={17} className="mt-0.5 shrink-0"/>{error}</div>}
      {data?.workspaceError && <div role="status" className="mb-5 rounded-xl border border-[#eadfc7] bg-[#fffaf0] px-4 py-3 text-sm text-[#87642c]">Some Google Workspace data could not be refreshed. <a href="/integrations" className="ml-1 font-semibold underline">Check connection</a></div>}

      {loading && !data
        ? <div className="flex items-center gap-3 rounded-2xl border border-[#e7ebe7] bg-white p-8 text-sm text-[#76817c]"><LoaderCircle size={18} className="animate-spin"/> Building your overview…</div>
        : data && <section aria-label="Today's summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Open tasks" value={data.metrics.openTasks} icon={<ListTodo size={18}/>}/>
          <Metric label="Overdue" value={data.metrics.overdueTasks} icon={<AlertCircle size={18}/>}/>
          <Metric label="Due today" value={data.metrics.dueTodayTasks} icon={<Clock3 size={18}/>}/>
          <Metric label="High priority" value={data.metrics.highPriorityTasks} icon={<Target size={18}/>}/>
          <Metric label="Today's events" value={data.metrics.events} icon={<CalendarDays size={18}/>}/>
          <Metric label="Follow-up emails" value={data.metrics.followUps} icon={<Inbox size={18}/>}/>
        </section>}
    </div>
  </main>;
}
