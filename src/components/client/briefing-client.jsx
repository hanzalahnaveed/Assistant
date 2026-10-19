"use client";

import { useCallback, useEffect, useState } from "react";
import WorkspaceHeader from "@/components/workspace-header";
import {
  AlertCircle,
  CalendarDays,
  Clock3,
  Inbox,
  ListTodo,
  LoaderCircle,
  RefreshCw,
  Target,
} from "lucide-react";

function Metric({ label, value, icon }) {
  return (
    <article className="rounded-2xl border border-[#e7ebe7] bg-white p-5">
      <div className="flex items-center justify-between text-[#76817c]">
        <span className="text-xs font-medium">{label}</span>
        {icon}
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-[#18211f]">
        {value ?? 0}
      </div>
    </article>
  );
}

export default function BriefingClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/workspace/briefing", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Could not load your overview.");
      }
      setData(body);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load your overview. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = data?.metrics;

  return (
    <main className="min-h-screen bg-[#f8faf7] text-[#18211f]">
      <WorkspaceHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[.14em] text-[#176b52]">
              Overview
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {data?.greeting ?? "Your day, under control"}.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#76817c]">
              {data?.summary ??
                "A clear summary of your tasks, calendar, and inbox."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#fafbf9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 flex gap-2 rounded-xl border border-[#f0d6cc] bg-[#fff5f0] px-4 py-3 text-sm text-[#994b36]"
          >
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {data?.workspaceError && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-[#eadfc7] bg-[#fffaf0] px-4 py-3 text-sm text-[#87642c]"
          >
            Some Google Workspace data could not be refreshed.{" "}
            <a href="/integrations" className="font-semibold underline">
              Check connection
            </a>
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[#e7ebe7] bg-white p-8 text-sm text-[#76817c]">
            <LoaderCircle size={18} className="animate-spin" />
            Building your overview…
          </div>
        ) : data && metrics ? (
          <section
            aria-label="Today's summary"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <Metric
              label="Open tasks"
              value={metrics.openTasks}
              icon={<ListTodo size={18} />}
            />
            <Metric
              label="Overdue"
              value={metrics.overdueTasks}
              icon={<AlertCircle size={18} />}
            />
            <Metric
              label="Due today"
              value={metrics.dueTodayTasks}
              icon={<Clock3 size={18} />}
            />
            <Metric
              label="High priority"
              value={metrics.highPriorityTasks}
              icon={<Target size={18} />}
            />
            <Metric
              label="Today's events"
              value={metrics.events}
              icon={<CalendarDays size={18} />}
            />
            <Metric
              label="Follow-up emails"
              value={metrics.followUps}
              icon={<Inbox size={18} />}
            />
          </section>
        ) : (
          !error && (
            <div className="rounded-2xl border border-[#e7ebe7] bg-white p-6 text-sm text-[#76817c]">
              Your overview is not available yet. Refresh to try again.
            </div>
          )
        )}
      </div>
    </main>
  );
}
