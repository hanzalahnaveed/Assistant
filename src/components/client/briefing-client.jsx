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

function formatDateTime(value, timeZone) {
  if (!value) return "Time not set";
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

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
    <main className="min-h-screen bg-[#f8faf7] text-[#18211f] pl-[58px] min-[421px]:pl-[72px] min-[761px]:pl-[252px]">
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
        {data && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="briefing-priorities" className="rounded-2xl border border-[#e7ebe7] bg-white p-5 sm:p-6">
              <h2 id="briefing-priorities" className="font-semibold tracking-tight">Next actions</h2>
              <p className="mt-1 text-xs text-[#76817c]">The most important things to look at first.</p>
              {data.priorities?.length ? (
                <ul className="mt-4 divide-y divide-[#edf1ed]">
                  {data.priorities.slice(0, 6).map((item) => (
                    <li key={item.type + ":" + item.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{item.title}</span>
                        <span className="rounded-full bg-[#fff3e5] px-2 py-0.5 text-[10px] font-semibold text-[#995500]">{item.priority}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#76817c]">{item.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-[#76817c]">No urgent follow-ups surfaced. Review your open tasks below.</p>
              )}
            </section>

            <section aria-labelledby="briefing-tasks" className="rounded-2xl border border-[#e7ebe7] bg-white p-5 sm:p-6">
              <h2 id="briefing-tasks" className="font-semibold tracking-tight">Tasks to move forward</h2>
              <p className="mt-1 text-xs text-[#76817c]">Ranked by urgency, due date, and task context.</p>
              {data.tasks?.length ? (
                <ul className="mt-4 divide-y divide-[#edf1ed]">
                  {data.tasks.slice(0, 6).map((task) => (
                    <li key={task.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{task.title}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#176b52]">{task.priority}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#76817c]">
                        {task.reasons?.join(" · ") || task.status.replaceAll("_", " ").toLowerCase()}
                        {task.dueAt ? " · Due " + formatDateTime(task.dueAt, data.timezone) : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-[#76817c]">No open tasks. Add a task when a new commitment comes up.</p>
              )}
              <a href="/tasks" className="mt-4 inline-flex text-xs font-semibold text-[#176b52] hover:underline">Open task manager ↗</a>
            </section>

            <section aria-labelledby="briefing-calendar" className="rounded-2xl border border-[#e7ebe7] bg-white p-5 sm:p-6">
              <h2 id="briefing-calendar" className="font-semibold tracking-tight">Today’s calendar</h2>
              <p className="mt-1 text-xs text-[#76817c]">Use the source event to review details or prepare an agenda.</p>
              {data.events?.length ? (
                <ul className="mt-4 divide-y divide-[#edf1ed]">
                  {data.events.slice(0, 6).map((event) => (
                    <li key={event.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="text-sm font-medium">{event.title}</div>
                      <p className="mt-1 text-xs text-[#76817c]">
                        {formatDateTime(event.start, data.timezone)}
                        {event.end ? " – " + formatDateTime(event.end, data.timezone) : ""}
                        {event.location ? " · " + event.location : ""}
                      </p>
                      {event.link && <a href={event.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-xs font-semibold text-[#176b52] hover:underline">Open calendar event ↗</a>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-[#76817c]">No more calendar events scheduled for today.</p>
              )}
              <a href="/calendar" className="mt-4 inline-flex text-xs font-semibold text-[#176b52] hover:underline">Open calendar tools ↗</a>
            </section>

            <section aria-labelledby="briefing-followups" className="rounded-2xl border border-[#e7ebe7] bg-white p-5 sm:p-6">
              <h2 id="briefing-followups" className="font-semibold tracking-tight">Email follow-ups</h2>
              <p className="mt-1 text-xs text-[#76817c]">Heuristic suggestions based on inbox snippets and labels, not confirmed obligations.</p>
              {data.followUps?.length ? (
                <ul className="mt-4 divide-y divide-[#edf1ed]">
                  {data.followUps.slice(0, 6).map((email) => (
                    <li key={email.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="text-sm font-medium">{email.subject}</div>
                      <p className="mt-1 text-xs text-[#76817c]">{email.from || "Unknown sender"}{email.date ? " · " + email.date : ""}</p>
                      <p className="mt-2 text-xs leading-5 text-[#5d6961]">{email.snippet}</p>
                      {email.reasons?.length > 0 && <p className="mt-1 text-[10px] text-[#9a6a2c]">{email.reasons.join(" · ")}</p>}
                      {email.threadId && <a href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(email.threadId)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-[#176b52] hover:underline">Open source email ↗</a>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-[#76817c]">No likely follow-up messages surfaced. The assistant uses limited message metadata and snippets.</p>
              )}
              <a href="/email" className="mt-4 inline-flex text-xs font-semibold text-[#176b52] hover:underline">Open inbox tools ↗</a>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
