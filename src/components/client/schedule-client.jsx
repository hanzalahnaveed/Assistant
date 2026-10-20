"use client";

import { Button, Input, Modal } from "antd";
import {
  CalendarDays,
  Clock3,
  ExternalLink,
  LayoutList,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import TasksClient from "@/components/client/tasks-client";
import { localDateTimeToIso, toLocalDateTime } from "@/lib/calendar-timezone.mjs";

const emptyForm = {
  title: "",
  description: "",
  priority: "MEDIUM",
  dueAt: "",
  location: "",
  startAt: "",
  endAt: "",
  allDay: false,
  timezone: "Asia/Karachi",
  attendees: "",
};
const pendingEventStorageKey = (userId) => `assistant.pendingScheduleEvent.${userId}`;

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDate(value, amount) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function shiftMonth(value, amount) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function calendarRange(date, view, timezone) {
  let startDate = date;
  let endDate;
  if (view === "day") {
    endDate = shiftDate(date, 1);
  } else if (view === "week") {
    const [year, month, day] = date.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    startDate = shiftDate(date, -((weekday + 6) % 7));
    endDate = shiftDate(startDate, 7);
  } else {
    const [year, month] = date.split("-").map(Number);
    startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    endDate = shiftDate(startDate, new Date(Date.UTC(year, month, 0)).getUTCDate());
  }
  return {
    startDate,
    endDate,
    start: localDateTimeToIso(startDate + "T00:00", timezone),
    end: localDateTimeToIso(endDate + "T00:00", timezone),
  };
}

function formatDate(value, timezone) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(localDateTimeToIso(value + "T12:00", timezone) || value + "T12:00:00Z"));
}

function eventOverlapsDate(event, date, timezone) {
  const dayStart = localDateTimeToIso(date + "T00:00", timezone);
  const dayEnd = localDateTimeToIso(shiftDate(date, 1) + "T00:00", timezone);
  if (!dayStart || !dayEnd) return false;
  const start = event.allDay
    ? localDateTimeToIso(event.startAt + "T00:00", timezone)
    : event.startAt;
  const end = event.allDay
    ? localDateTimeToIso(event.endAt + "T00:00", timezone)
    : event.endAt;
  if (!start || !end) return false;
  return new Date(start) < new Date(dayEnd) && new Date(end) > new Date(dayStart);
}

function formatEventTime(event, timezone) {
  if (event.allDay) return `All day · ${event.startAt}`;
  const eventTimezone = event.timezone || timezone;
  const options = { timeZone: eventTimezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return `${new Date(event.startAt).toLocaleString(undefined, options)} – ${new Date(event.endAt).toLocaleString(undefined, options)}`;
}

function validateForm(form, kind) {
  if (!form.title.trim()) return "Add a title before saving.";
  if (kind === "TASK") {
    if (form.dueAt && !localDateTimeToIso(form.dueAt, form.timezone)) {
      return "Choose a valid due date and time in the selected timezone.";
    }
    return "";
  }
  let start;
  let end;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: form.timezone }).format(new Date());
    if (form.allDay) {
      const validDate = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(value + "T00:00:00.000Z");
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
      };
      if (!validDate(form.startAt) || !validDate(form.endAt)) return "Choose valid all-day start and end dates.";
      start = localDateTimeToIso(form.startAt + "T00:00", form.timezone);
      end = localDateTimeToIso(shiftDate(form.endAt, 1) + "T00:00", form.timezone);
    } else {
      start = localDateTimeToIso(form.startAt, form.timezone);
      end = localDateTimeToIso(form.endAt, form.timezone);
    }
  } catch {
    return "Enter a valid IANA timezone, such as Asia/Karachi or America/New_York.";
  }
  if (!start || !end) return "Choose valid start and end times. Times skipped by daylight-saving changes are not valid.";
  if (new Date(end) <= new Date(start)) return "Event end must be after its start.";
  const attendees = form.attendees.split(/[;,\n]/).map((email) => email.trim()).filter(Boolean);
  if (attendees.length > 50) return "An event can have at most 50 attendee emails.";
  if (attendees.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return "Check attendee emails. Use comma- or semicolon-separated email addresses.";
  }
  return "";
}

async function readResponse(response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`The server returned an invalid response (HTTP ${response.status}).`);
  }
}

export default function ScheduleClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState("TASK");
  const [activeView, setActiveView] = useState("list");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi",
  }));
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi",
  );
  const [calendarDate, setCalendarDate] = useState(() => dateKey(new Date()));
  const [calendarView, setCalendarView] = useState("week");
  const [eventQuery, setEventQuery] = useState("");
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [editingEventId, setEditingEventId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const currentRange = calendarRange(calendarDate, calendarView, timezone);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!currentRange.start || !currentRange.end) {
        throw new Error("Could not calculate the selected calendar range in this timezone.");
      }
      const query = new URLSearchParams({ start: currentRange.start, end: currentRange.end });
      const response = await fetch("/api/calendar-events?" + query.toString(), { cache: "no-store" });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error || "Could not load the schedule.");
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the schedule.");
    } finally {
      setLoading(false);
    }
  }, [currentRange.start, currentRange.end]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(readResponse)
      .then((body) => {
        const currentUserId = body.user?.id;
        if (!currentUserId || cancelled) return;
        setUserId(currentUserId);
        const pending = JSON.parse(sessionStorage.getItem(pendingEventStorageKey(currentUserId)) || "null");
        if (
          pending?.userId === currentUserId &&
          pending.kind === "EVENT" &&
          typeof pending.idempotencyKey === "string" &&
          pending.form &&
          typeof pending.form.title === "string"
        ) {
          setKind("EVENT");
          setForm({ ...emptyForm, ...pending.form });
          setIdempotencyKey(pending.idempotencyKey);
          setIsModalOpen(true);
          setNotice("A calendar event request is waiting for confirmation. Retry it unchanged to safely resolve the outcome.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("The signed-in account could not be verified to restore the pending calendar event.");
        }
      });
    fetch("/api/preferences", { cache: "no-store" })
      .then(readResponse)
      .then((body) => {
        const userTimezone = body.preferences?.timezone;
        if (userTimezone && !cancelled) {
          setTimezone(userTimezone);
          setForm((current) => current.startAt || current.endAt
            ? current
            : { ...current, timezone: userTimezone });
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load your timezone preference.");
        }
      });
    return () => { cancelled = true; };
  }, []);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    if (typeof window !== "undefined") {
      try {
        if (userId) sessionStorage.removeItem(pendingEventStorageKey(userId));
      } catch {
        setError("Could not clear the pending calendar request from this browser session.");
        return;
      }
    }
    setEditingEventId("");
    setIdempotencyKey("");
    setKind("TASK");
    setForm({ ...emptyForm, timezone });
    setError("");
    setIsModalOpen(false);
  }

  async function save(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    const validationError = validateForm(form, kind);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (editingEventId && !window.confirm("Update this Google Calendar event? Google may notify its attendees.")) return;
    if (kind === "EVENT" && !editingEventId) {
      const attendees = form.attendees.split(/[;,\n]/).map((email) => email.trim()).filter(Boolean);
      const confirmation = attendees.length
        ? "Create this event in your primary Google Calendar and send invitations to the listed attendees?"
        : "Create this event directly in your primary Google Calendar?";
      if (!window.confirm(confirmation)) return;
    }

    setBusy(true);
    try {
      let response;
      let payload;
      let successNotice;
      if (kind === "TASK") {
        response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.description || null,
            priority: form.priority,
            dueAt: form.dueAt ? localDateTimeToIso(form.dueAt, form.timezone) : null,
          }),
        });
        payload = await readResponse(response);
        if (!response.ok) throw new Error(payload.error || "Could not save schedule item.");
        setTaskRefreshKey((value) => value + 1);
        setActiveView("list");
        successNotice = "Schedule item added.";
      } else {
        if (!userId) {
          throw new Error("The signed-in account could not be verified. Refresh before creating a calendar event.");
        }
        const eventPayload = {
          title: form.title,
          description: form.description,
          priority: form.priority,
          location: form.location,
          startAt: form.allDay
            ? form.startAt
            : localDateTimeToIso(form.startAt, form.timezone),
          endAt: form.allDay
            ? shiftDate(form.endAt, 1)
            : localDateTimeToIso(form.endAt, form.timezone),
          allDay: form.allDay,
          timezone: form.timezone,
          attendees: form.attendees.split(/[;,\n]/).map((email) => email.trim()).filter(Boolean),
        };
        if (editingEventId) {
          response = await fetch("/api/calendar-events/" + encodeURIComponent(editingEventId), {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(eventPayload),
          });
        } else {
          const operationKey = idempotencyKey || crypto.randomUUID();
          sessionStorage.setItem(pendingEventStorageKey(userId), JSON.stringify({
            userId,
            kind: "EVENT",
            idempotencyKey: operationKey,
            form,
          }));
          setIdempotencyKey(operationKey);
          response = await fetch("/api/calendar-events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...eventPayload, idempotencyKey: operationKey }),
          });
        }
        payload = await readResponse(response);
        if (!response.ok) throw new Error(payload.error || "Could not save calendar event.");
        sessionStorage.removeItem(pendingEventStorageKey(userId));
        setIdempotencyKey("");
        successNotice = editingEventId ? "Schedule item updated." : "Schedule item synced with Google Calendar.";
      }
      resetForm();
      setNotice(successNotice);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this schedule item.");
    } finally {
      setBusy(false);
    }
  }

  function editEvent(event) {
    setKind("EVENT");
    setEditingEventId(event.id);
    setIdempotencyKey("");
    setForm({
      ...emptyForm,
      title: event.title || "",
      description: event.description || "",
      priority: event.priority || "MEDIUM",
      location: event.location || "",
      startAt: event.allDay ? event.startAt : toLocalDateTime(event.startAt, event.timezone || timezone),
      endAt: event.allDay ? shiftDate(event.endAt, -1) : toLocalDateTime(event.endAt, event.timezone || timezone),
      allDay: Boolean(event.allDay),
      timezone: event.timezone || timezone,
      attendees: (event.attendees || []).join(", "),
    });
    setIsModalOpen(true);
    setError("");
    setNotice("");
  }

  async function cancelEvent(event) {
    if (!window.confirm(`Cancel "${event.title}"? Google may notify attendees.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/calendar-events/" + encodeURIComponent(event.id), { method: "DELETE" });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error || "Could not cancel the calendar event.");
      if (editingEventId === event.id) resetForm();
      setNotice("Calendar event cancelled.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel the calendar event.");
    } finally {
      setBusy(false);
    }
  }

  const dates = [];
  for (
    let day = currentRange.startDate;
    day < currentRange.endDate;
    day = shiftDate(day, 1)
  ) dates.push(day);
  const query = eventQuery.trim().toLowerCase();
  const calendarItems = (data?.items || [])
    .filter((item) => item.calendarEventId)
    .map((item) => ({
      ...item,
      id: item.calendarEventId,
      scheduleItemId: item.id,
      etag: item.calendarEventEtag,
      link: item.calendarEventLink,
    }));
  const visibleEvents = calendarItems.filter((event) =>
    !query || [event.title, event.description, event.location, ...(event.attendees || [])]
      .some((value) => (value || "").toLowerCase().includes(query)),
  );
  const eventsForDate = (date) => visibleEvents.filter((event) =>
    eventOverlapsDate(event, date, timezone),
  );
  function tasksForDate(date) {
    const search = eventQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      if (!task.dueAt) return false;
      if (search && ![task.title, task.description || ""].some((value) => value.toLowerCase().includes(search))) {
        return false;
      }
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(task.dueAt));
      const taskDate = `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
      return taskDate === date;
    });
  }

  return (
    <main className="min-h-screen bg-[#F8F9FA] p-4 text-[#212529]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[clamp(1.8rem,3vw,2.5rem)] font-semibold tracking-[-0.045em] text-[#233044]">
            <CalendarDays size={34} />
            Schedule
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280]">
            Keep every commitment in one schedule, then view it as a list or calendar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void load()}
            disabled={loading || busy}
            className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button
            type="primary"
            onClick={() => {
              if (!idempotencyKey) resetForm();
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={16} />
            Schedule new item
          </Button>
        </div>
      </div>

      {error && !isModalOpen && <div role="alert" className="mb-4 rounded-[13px] border border-[#f0d6cc] bg-[#fff5f0] px-4 py-3 text-sm text-[#994b36]">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-[13px] border border-[#d8e9dd] bg-[#eef7f0] px-4 py-3 text-sm text-[#24543f]">{notice}</div>}
      {data && !data.calendarConnected && (
        <div className="mb-4 rounded-xl border border-[#eadfc8] bg-[#fffaf0] p-4 text-sm text-[#76551e]">
          Connect Google Workspace to sync schedule items with your calendar. Your items remain available here.
        </div>
      )}
      {data?.calendarConnected && !data.canCreateEvents && (
        <div className="mb-4 rounded-xl border border-[#eadfc8] bg-[#fffaf0] p-4 text-sm text-[#76551e]">
          Calendar is read-only. Reconnect Google from{" "}
          <a className="font-semibold underline" href="/dashboard/integrations">Integrations</a>{" "}
          and grant Calendar event access to create events.
        </div>
      )}
      {data?.calendarError && (
        <div className="mb-4 rounded-xl border border-[#f0d6cc] bg-[#fff5f0] p-4 text-sm text-[#994b36]">
          Google Calendar could not be refreshed: {data.calendarError}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#E3E7ED] bg-white p-3 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)]">
        <div className="flex gap-2" role="group" aria-label="Schedule view">
          {[
            { id: "list", label: "List view", icon: <LayoutList size={15} /> },
            { id: "calendar", label: "Calendar view", icon: <CalendarDays size={15} /> },
          ].map((view) => (
            <Button
              key={view.id}
              aria-pressed={activeView === view.id}
              onClick={() => setActiveView(view.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold ${activeView === view.id ? "bg-[#e7f3ed] text-[#FA8500]" : "text-[#6B7280] hover:bg-[#f8faf7]"}`}
            >
              {view.icon}
              {view.label}
            </Button>
          ))}
        </div>
        <Input
          aria-label="Search scheduled items"
          value={eventQuery}
          onChange={(event) => setEventQuery(event.target.value)}
          placeholder="Search schedule items…"
          className="w-full rounded-xl border px-3 py-2 text-sm sm:max-w-xs"
        />
      </div>

      {activeView === "calendar" && (
        <section className="rounded-[18px] border border-[#E3E7ED] bg-white p-5 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold tracking-[-0.025em]">Schedule calendar</h2>
              <p className="mt-1 text-xs text-[#6B7280]">{timezone} · {calendarView} view</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button aria-label="Previous calendar range" onClick={() => setCalendarDate((date) =>
                calendarView === "day" ? shiftDate(date, -1)
                  : calendarView === "week" ? shiftDate(date, -7)
                    : shiftMonth(date, -1),
              )} disabled={loading || busy} className="rounded-lg border border-[#dfe6dd] px-3 py-2 text-xs">Previous</Button>
              <Button onClick={() => setCalendarDate(dateKey(new Date()))} disabled={loading || busy} className="rounded-lg border border-[#dfe6dd] px-3 py-2 text-xs">Today</Button>
              <Button aria-label="Next calendar range" onClick={() => setCalendarDate((date) =>
                calendarView === "day" ? shiftDate(date, 1)
                  : calendarView === "week" ? shiftDate(date, 7)
                    : shiftMonth(date, 1),
              )} disabled={loading || busy} className="rounded-lg border border-[#dfe6dd] px-3 py-2 text-xs">Next</Button>
              <select aria-label="Calendar time range" value={calendarView} onChange={(event) => setCalendarView(event.target.value)} className="rounded-lg border border-[#dfe6dd] bg-white px-3 py-2 text-xs">
                <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
              </select>
              <input aria-label="Choose calendar date" type="date" value={calendarDate} onChange={(event) => event.target.value && setCalendarDate(event.target.value)} className="min-w-0 rounded-lg border border-[#dfe6dd] bg-white px-3 py-2 text-xs" />
            </div>
          </div>
          {loading ? <p className="py-8 text-sm text-[#6B7280]">Loading schedule…</p> : (
            calendarView === "day" ? (
              <div>
                <h3 className="mb-3 text-sm font-semibold">{formatDate(calendarDate, timezone)}</h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {eventsForDate(calendarDate).map((event) => (
                    <CalendarEvent key={event.id} event={event} timezone={timezone} busy={busy} onEdit={editEvent} onCancel={cancelEvent} />
                  ))}
                  {tasksForDate(calendarDate).map((task) => <TaskCalendarItem key={task.id} task={task} />)}
                </div>
                {!eventsForDate(calendarDate).length && !tasksForDate(calendarDate).length && (
                  <p className="py-8 text-center text-sm text-[#87918b]">No scheduled items on this day.</p>
                )}
              </div>
            ) : (
              <div className={calendarView === "week" ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7" : "grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"}>
                {dates.map((date) => {
                  const events = eventsForDate(date);
                  const dueTasks = tasksForDate(date);
                  return (
                    <section key={date} className="min-w-0 rounded-xl border border-[#e5ebe3] bg-white p-2">
                      <h3 className="mb-2 text-xs font-semibold text-[#46544b]">{formatDate(date, timezone)}</h3>
                      {events.length || dueTasks.length ? (
                        <div className="space-y-2">
                          {events.map((event) => (
                            <CalendarEvent key={event.id} event={event} timezone={timezone} busy={busy} onEdit={editEvent} onCancel={cancelEvent} compact />
                          ))}
                          {dueTasks.map((task) => <TaskCalendarItem key={task.id} task={task} compact />)}
                        </div>
                      ) : <p className="py-3 text-center text-[11px] text-[#a0a8a0]">No items</p>}
                    </section>
                  );
                })}
              </div>
            )
          )}
        </section>
      )}

      <div className={activeView === "list" ? "mt-5" : "hidden"}>
        <TasksClient
          refreshKey={taskRefreshKey}
          onTasksChange={setTasks}
          scheduleEvents={visibleEvents}
          searchQuery={eventQuery}
          renderScheduleEvent={(event) => (
            <CalendarEvent event={event} timezone={timezone} busy={busy} onEdit={editEvent} onCancel={cancelEvent} />
          )}
        />
      </div>

      <Modal
        title={editingEventId ? "Edit schedule item" : "Schedule a new item"}
        open={isModalOpen}
        onCancel={() => {
          if (idempotencyKey) setIsModalOpen(false);
          else resetForm();
        }}
        footer={null}
        width={640}
        destroyOnHidden={false}
      >
        {error && <div role="alert" className="mb-4 rounded-[13px] border border-[#f0d6cc] bg-[#fff5f0] px-4 py-3 text-sm text-[#994b36]">{error}</div>}
        {idempotencyKey && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#eadfc8] bg-[#fffaf0] p-3 text-xs text-[#76551e]">
            <span>Retry this pending event unchanged, or verify it was not created before discarding it.</span>
            <Button
              onClick={() => {
                if (!window.confirm("If Google Calendar already created this event, confirm it is absent before discarding the retry.")) return;
                resetForm();
              }}
              htmlType="button"
              className="shrink-0 rounded-lg border border-[#dfe6dd] px-3 py-1.5 text-xs"
            >
              Discard pending event
            </Button>
          </div>
        )}
        <form onSubmit={save} className="max-h-[70vh] space-y-4 overflow-y-auto px-1">
          <Field label="Schedule item">
            <Input required maxLength={250} disabled={busy} value={form.title} onChange={(event) => setField("title", event.target.value)} placeholder="What do you need to schedule?" className="w-full rounded-xl border border-[#dfe6dd] px-3.5 py-3 text-sm" />
          </Field>
          <Field label="Details">
            <Input.TextArea rows={3} maxLength={kind === "TASK" ? 5000 : 10000} disabled={busy} value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Notes (optional)" className="w-full resize-y rounded-xl border border-[#dfe6dd] px-3.5 py-3 text-sm" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Priority">
              <select value={form.priority} disabled={busy} onChange={(event) => setField("priority", event.target.value)} className="w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm">
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((priority) => <option key={priority} value={priority}>{priority[0] + priority.slice(1).toLowerCase()}</option>)}
              </select>
            </Field>
            {!editingEventId && kind === "TASK" && (
              <Field label="Due date and time">
                <input type="datetime-local" value={form.dueAt} disabled={busy} onChange={(event) => setField("dueAt", event.target.value)} className="w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm" />
              </Field>
            )}
          </div>
          {!editingEventId && (
            <label className="flex items-center gap-2 text-xs font-medium text-[#526159]">
              <input
                type="checkbox"
                checked={kind === "EVENT"}
                disabled={busy || Boolean(idempotencyKey) || !data?.canCreateEvents}
                onChange={(event) => {
                  const addToCalendar = event.target.checked;
                  setKind(addToCalendar ? "EVENT" : "TASK");
                  if (!addToCalendar) {
                    setForm((current) => ({
                      ...current,
                      location: "",
                      startAt: "",
                      endAt: "",
                      allDay: false,
                      attendees: "",
                    }));
                  }
                }}
                className="h-4 w-4 accent-[#FA8500]"
              />
              Add time, location, and attendees in Google Calendar
            </label>
          )}
          {kind === "EVENT" && (
            <>
              <label className="flex items-center gap-2 text-xs font-medium text-[#526159]">
                <input type="checkbox" checked={form.allDay} disabled={busy} onChange={(event) => setField("allDay", event.target.checked)} className="h-4 w-4 accent-[#FA8500]" />
                All-day event
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start">
                  <input required type={form.allDay ? "date" : "datetime-local"} value={form.startAt} disabled={busy} onChange={(event) => setField("startAt", event.target.value)} className="w-full rounded-xl border border-[#dfe6dd] px-3 py-2.5 text-sm" />
                </Field>
                <Field label="End">
                  <input required type={form.allDay ? "date" : "datetime-local"} value={form.endAt} disabled={busy} onChange={(event) => setField("endAt", event.target.value)} className="w-full rounded-xl border border-[#dfe6dd] px-3 py-2.5 text-sm" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Timezone (IANA)">
                  <Input required maxLength={100} disabled={busy} value={form.timezone} onChange={(event) => setField("timezone", event.target.value)} placeholder="Asia/Karachi" className="w-full rounded-xl border border-[#dfe6dd] px-3 py-2.5 text-sm" />
                </Field>
                <Field label="Location (optional)">
                  <Input maxLength={500} disabled={busy} value={form.location} onChange={(event) => setField("location", event.target.value)} placeholder="Room, address, or video link" className="w-full rounded-xl border border-[#dfe6dd] px-3 py-2.5 text-sm" />
                </Field>
              </div>
              <Field label="Attendee emails (comma-separated)">
                <Input disabled={busy} value={form.attendees} onChange={(event) => setField("attendees", event.target.value)} placeholder="team@example.com" className="w-full rounded-xl border border-[#dfe6dd] px-3 py-2.5 text-sm" />
              </Field>
              <p className="text-xs leading-5 text-[#6B7280]">
                Saving creates the event immediately after confirmation. Attendee invitations may be sent.
              </p>
            </>
          )}
          <div className="flex justify-end gap-2 border-t border-[#edf1ed] pt-4">
            <Button htmlType="button" onClick={() => {
              if (idempotencyKey) setIsModalOpen(false);
              else resetForm();
            }} disabled={busy} className="rounded-xl border border-[#dfe6dd] px-4 py-2.5 text-sm">
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              <Save size={15} />
              {busy ? "Saving…" : editingEventId ? "Update item" : "Save schedule item"}
            </Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}

function TaskCalendarItem({ task, compact = false }) {
  return (
    <article className={`min-w-0 rounded-xl border border-[#f0e3d5] bg-[#fff9f2] p-3 ${compact ? "text-[11px]" : ""}`}>
      <div className="break-words text-sm font-semibold">{task.title}</div>
      {!compact && task.description && <p className="mt-1 whitespace-pre-wrap text-xs text-[#6B7280]">{task.description}</p>}
      <p className="mt-1 text-[11px] font-medium text-[#996126]">Priority · {task.priority.toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</p>
    </article>
  );
}

function CalendarEvent({ event, timezone, busy, onEdit, onCancel, compact = false }) {
  return (
    <article className="min-w-0 rounded-xl bg-[#f7f9f6] p-3">
      <div className="break-words text-sm font-semibold">{event.title}</div>
      <div className="mt-1 flex items-start gap-2 text-xs text-[#6B7280]">
        <Clock3 size={13} className="mt-0.5 shrink-0" />
        <span>{formatEventTime(event, timezone)}</span>
      </div>
      {!compact && event.location && <div className="mt-1 break-words text-xs text-[#87918b]">{event.location}</div>}
      {!compact && event.attendees?.length > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-[#6B7280]"><Users size={13} /> {event.attendees.length} attendees</div>
      )}
      {!compact && event.link && (
        <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#FA8500]" href={event.link} target="_blank" rel="noreferrer">
          Open event <ExternalLink size={12} />
        </a>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => onEdit(event)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-[#dfe6dd] px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">
          <Pencil size={12} /> Edit
        </Button>
        <Button onClick={() => void onCancel(event)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-[#e7d8d2] px-2.5 py-1.5 text-xs font-semibold text-[#994b36] disabled:opacity-50">
          <Trash2 size={12} /> Cancel
        </Button>
      </div>
    </article>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-medium text-[#6B7280]">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
