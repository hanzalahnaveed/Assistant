"use client";


import { Button, Input } from "antd";
import { useCallback, useEffect, useState } from "react";
import WorkspaceHeader from "@/components/workspace-header";
import { localDateTimeToIso, toLocalDateTime } from "@/lib/calendar-timezone.mjs";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Plus,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
const blank = {
  title: "",
  description: "",
  location: "",
  startAt: "",
  endAt: "",
  allDay: false,
  timezone: "Asia/Karachi",
  attendees: "",
};
const labels = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CREATING: "Creating…",
  CREATED: "Created",
  FAILED: "Failed",
  CREATE_UNCERTAIN: "Check Calendar",
  CANCELLED: "Cancelled",
};
function format(value, timezone) {
  if (!value) return "Time not set";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, {
        ...(timezone ? { timeZone: timezone } : {}),
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
function dateKey(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
function shiftDateKey(value, amount) {
  const parts = value.split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + amount));
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");
}
function shiftMonthKey(value, amount) {
  const parts = value.split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1 + amount, 1));
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-01";
}
function calendarRange(date, view, timezone) {
  let startDate = date;
  let endDate;
  if (view === "day") {
    endDate = shiftDateKey(date, 1);
  } else if (view === "week") {
    const parts = date.split("-").map(Number);
    const weekday = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
    startDate = shiftDateKey(date, -((weekday + 6) % 7));
    endDate = shiftDateKey(startDate, 7);
  } else {
    const parts = date.split("-").map(Number);
    startDate = parts[0] + "-" + String(parts[1]).padStart(2, "0") + "-01";
    endDate = shiftDateKey(startDate, new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate());
  }
  return { startDate, endDate, start: localDateTimeToIso(startDate + "T00:00", timezone), end: localDateTimeToIso(endDate + "T00:00", timezone) };
}
function rangeLabel(range, timezone) {
  const formatter = new Intl.DateTimeFormat(undefined, { timeZone: timezone, month: "short", day: "numeric", year: "numeric" });
  const start = new Date(range.start);
  const end = new Date(new Date(range.end).getTime() - 1);
  if (range.startDate === range.endDate || shiftDateKey(range.startDate, 1) === range.endDate) return formatter.format(start);
  return formatter.format(start) + " – " + formatter.format(end);
}
function formatEventTime(event, fallbackTimezone) {
  if (event.allDay) return "All day · " + event.startAt;
  const timezone = event.timezone || fallbackTimezone;
  return format(event.startAt, timezone) + " – " + format(event.endAt, timezone);
}
function eventOverlapsDate(event, date, timezone) {
  const dayStartIso = localDateTimeToIso(date + "T00:00", timezone);
  const dayEndIso = localDateTimeToIso(shiftDateKey(date, 1) + "T00:00", timezone);
  if (!dayStartIso || !dayEndIso) return false;
  let start;
  let end;
  if (event.allDay || /^\d{4}-\d{2}-\d{2}$/.test(event.startAt || "")) {
    const startIso = localDateTimeToIso(event.startAt + "T00:00", timezone);
    const endIso = localDateTimeToIso(event.endAt + "T00:00", timezone);
    if (!startIso || !endIso) return false;
    start = new Date(startIso).getTime();
    end = new Date(endIso).getTime();
  } else {
    start = new Date(event.startAt).getTime();
    end = new Date(event.endAt).getTime();
  }
  return Number.isFinite(start) && Number.isFinite(end) && start < new Date(dayEndIso).getTime() && end > new Date(dayStartIso).getTime();
}
function formatDateLabel(date, timezone) {
  const instant = localDateTimeToIso(date + "T12:00", timezone);
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, weekday: "short", month: "short", day: "numeric" }).format(new Date(instant || date + "T12:00:00Z"));
}
function fromForm(f) {
  return {
    title: f.title,
    description: f.description,
    location: f.location,
    startAt: f.allDay ? f.startAt : localDateTimeToIso(f.startAt, f.timezone),
    endAt: f.allDay ? f.endAt : localDateTimeToIso(f.endAt, f.timezone),
    allDay: Boolean(f.allDay),
    timezone: f.timezone,
    attendees: f.attendees
      .split(/[;,\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function validateMeetingForm(f) {
  if (!f.title.trim()) return "Add a meeting title before saving.";
  let startIso;
  let endIso;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: f.timezone }).format(new Date());
    if (f.allDay) {
      const validDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date + "T00:00:00.000Z").toISOString().slice(0, 10) === date;
      if (!validDate(f.startAt) || !validDate(f.endAt)) return "Choose valid all-day start and end dates.";
      startIso = localDateTimeToIso(f.startAt + "T00:00", f.timezone);
      endIso = localDateTimeToIso(f.endAt + "T00:00", f.timezone);
    } else {
      startIso = localDateTimeToIso(f.startAt, f.timezone);
      endIso = localDateTimeToIso(f.endAt, f.timezone);
    }
  } catch {
    return "Enter a valid IANA timezone, such as Asia/Karachi or America/New_York.";
  }
  if (!startIso || !endIso) {
    return f.allDay ? "Choose valid all-day dates in the selected timezone." : "Choose valid start and end times in the selected timezone. Times skipped by daylight-saving changes are not valid.";
  }
  if (new Date(endIso) <= new Date(startIso)) return f.allDay ? "All-day end date must be after its start date." : "Meeting end must be after its start.";
  const attendees = f.attendees.split(/[;,\n]/).map((email) => email.trim()).filter(Boolean);
  if (attendees.length > 50) return "A meeting can have at most 50 attendee emails.";
  if (attendees.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return "Check attendee emails. Use comma- or semicolon-separated email addresses.";
  }
  return "";
}
export default function CalendarClient() {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(""),
    [form, setForm] = useState(() => ({
      ...blank,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi",
    }));
  const [defaultTimezone, setDefaultTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi",
  );
  const [editingEventId, setEditingEventId] = useState("");
  const [calendarDate, setCalendarDate] = useState(() => dateKey(new Date()));
  const [calendarView, setCalendarView] = useState("week");
  const currentRange = calendarRange(calendarDate, calendarView, defaultTimezone);
  const [calendarQuery, setCalendarQuery] = useState("");
  const [eventQuery, setEventQuery] = useState("");
  const [proposalStatusFilter, setProposalStatusFilter] = useState("ACTIVE");
  const [scheduleDate, setScheduleDate] = useState(() => dateKey(new Date()));
  const [schedule, setSchedule] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [scheduleWarnings, setScheduleWarnings] = useState([]);
  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const range = calendarRange(calendarDate, calendarView, defaultTimezone);
      if (!range.start || !range.end) throw Error("Could not calculate the selected calendar range in this timezone.");
      const query = new URLSearchParams({ start: range.start, end: range.end });
      const r = await fetch("/api/meeting-drafts?" + query.toString(), {
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not load meetings.");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load meetings.");
    } finally {
      setLoading(false);
    }
  }, [calendarDate, calendarView, defaultTimezone]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/preferences", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) return;
        const timezone = body.preferences?.timezone;
        if (timezone && !cancelled) {
          setDefaultTimezone(timezone);
          setForm((current) => current.startAt || current.endAt ? current : { ...current, timezone });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const chosen = data?.drafts.find((d) => d.id === selected);
  const needle = calendarQuery.trim().toLowerCase();
  const eventNeedle = eventQuery.trim().toLowerCase();
  const visibleEvents = (data?.events || []).filter((event) =>
    !eventNeedle || [event.title, event.description, event.location, ...(event.attendees || [])]
      .some((value) => (value || "").toLowerCase().includes(eventNeedle))
  );
  const rangeDays = Math.max(1, Math.round((Date.UTC(...currentRange.endDate.split("-").map(Number).map((value, index) => index === 1 ? value - 1 : value)) - Date.UTC(...currentRange.startDate.split("-").map(Number).map((value, index) => index === 1 ? value - 1 : value))) / 86400000));
  const calendarDates = Array.from({ length: rangeDays }, (_, index) => shiftDateKey(currentRange.startDate, index));
  function eventsForDate(date) {
    return visibleEvents.filter((event) => eventOverlapsDate(event, date, defaultTimezone));
  }
  const visibleDrafts = (data?.drafts || []).filter((draft) => {
    const matchesSearch = !needle || [draft.title, draft.description, draft.location, ...(draft.attendees || [])]
      .some((value) => (value || "").toLowerCase().includes(needle));
    const matchesStatus = proposalStatusFilter === "ALL" ||
      (proposalStatusFilter === "ACTIVE" && !["CANCELLED", "CREATED"].includes(draft.status)) ||
      (proposalStatusFilter === "CREATED" && draft.status === "CREATED") ||
      (proposalStatusFilter === "CANCELLED" && draft.status === "CANCELLED");
    return matchesSearch && matchesStatus;
  });
  const editable = !chosen || chosen.status === "DRAFT" || chosen.status === "FAILED";
  function selectDraft(d) {
    setEditingEventId("");
    setSelected(d.id);
    setForm({
      title: d.title,
      description: d.description,
      location: d.location || "",
      startAt: toLocalDateTime(d.startAt, d.timezone),
      endAt: toLocalDateTime(d.endAt, d.timezone),
      timezone: d.timezone,
      attendees: d.attendees.join(", "),
    });
    setError("");
    setNotice("");
  }
  function fresh() {
    setEditingEventId("");
    setSelected("");
    setForm({
      ...blank,
      timezone: data?.drafts[0]?.timezone || defaultTimezone,
    });
    setError("");
    setNotice("");
  }
  function set(key, value) {
    setForm((f) => ({
      ...f,
      [key]: value,
    }));
  }
  async function save(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    const validationError = validateMeetingForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (editingEventId && !window.confirm("Update this Google Calendar event? Google may notify its attendees.")) return;
    setBusy(true);
    try {
      const payload = fromForm(form);
      const updatingCalendarEvent = Boolean(editingEventId);
      const endpoint = editingEventId
        ? "/api/calendar-events/" + encodeURIComponent(editingEventId)
        : selected ? "/api/meeting-drafts/" + selected : "/api/meeting-drafts";
      const r = await fetch(endpoint, {
        method: editingEventId || selected ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not save meeting.");
      setNotice(updatingCalendarEvent ? "Google Calendar event updated. Refresh the calendar if the event no longer matches this view." : "Meeting proposal saved. Review it before approving.");
      setEditingEventId("");
      await load();
      if (d.draft) selectDraft(d.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save meeting.");
    } finally {
      setBusy(false);
    }
  }
  async function act(action) {
    if (!chosen) return;
    if (
      action === "CREATE" &&
      !window.confirm(
        "Create this approved meeting in your primary Google Calendar and send invitations to listed attendees?",
      )
    )
      return;
    if (
      action === "CONFIRM_NOT_CREATED" &&
      !window.confirm(
        "Only unlock retry after checking Google Calendar and confirming the event is absent.",
      )
    )
      return;
    if (
      action === "CONFIRM_CREATED" &&
      !window.confirm("Confirm that you found this event in Google Calendar?")
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/meeting-drafts/" + chosen.id, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Meeting action failed.");
      setNotice(
        action === "CREATE"
          ? "Meeting created in Google Calendar."
          : action === "APPROVE"
            ? "Proposal approved. Creating it is a separate action."
            : "Meeting proposal updated.",
      );
      await load();
      if (d.draft) selectDraft(d.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Meeting action failed.");
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function editCalendarEvent(event) {
    setSelected("");
    setEditingEventId(event.id);
    setForm({
      title: event.title || "",
      description: event.description || "",
      location: event.location || "",
      startAt: event.allDay ? event.startAt : toLocalDateTime(event.startAt, event.timezone || defaultTimezone),
      endAt: event.allDay ? event.endAt : toLocalDateTime(event.endAt, event.timezone || defaultTimezone),
      allDay: Boolean(event.allDay),
      timezone: event.timezone || defaultTimezone,
      attendees: (event.attendees || []).join(", "),
    });
    setError("");
    setNotice("");
  }

  async function cancelCalendarEvent(event) {
    if (!window.confirm("Cancel event: " + event.title + "? Google may notify attendees.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/calendar-events/" + encodeURIComponent(event.id), { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || "Could not cancel the calendar event.");
      if (editingEventId === event.id) fresh();
      setNotice("Calendar event cancelled.");
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not cancel the calendar event.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function scheduleCalendarAction(action) {
    if (!schedule?.id) return;
    const prompts = {
      CANCEL_EVENTS: "Remove the schedule blocks recorded for this plan from Google Calendar? Events that are already gone will be treated as cancelled.",
      CONFIRM_CREATED: "Confirm that you inspected Google Calendar and every scheduled block exists. This prevents another creation attempt.",
      CONFIRM_NONE_CREATED: "Only continue if you checked Google Calendar and confirmed none of this plan's blocks exist. This unlocks creation retry.",
    };
    if (!window.confirm(prompts[action])) return;
    setScheduleBusy(true);
    setScheduleError("");
    setScheduleNotice("");
    try {
      const response = await fetch("/api/schedule-plans/" + encodeURIComponent(schedule.id), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (body.plan) setSchedule(body.plan);
      if (!response.ok) throw Error(body.error || "Could not update calendar schedule status.");
      setSchedule(body.plan);
      setScheduleWarnings(body.plan?.warnings || []);
      setScheduleNotice(action === "CANCEL_EVENTS" ? "Schedule blocks removed from Google Calendar. The plan is editable again." : action === "CONFIRM_CREATED" ? "Calendar creation reconciled as complete." : "Creation retry unlocked after your confirmation.");
      await load();
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Could not update calendar schedule status.");
    } finally {
      setScheduleBusy(false);
    }
  }

  async function createCalendarBlocks() {
    if (!schedule?.id || schedule.status !== "APPROVED") return;
    if (!data?.canCreateEvents) {
      setScheduleError("Connect Google Calendar and grant calendar event permission before creating schedule blocks.");
      return;
    }
    if (!window.confirm("Create one Google Calendar event for each scheduled task block? This will not invite attendees, but it will write events to your primary calendar.")) return;
    setScheduleBusy(true);
    setScheduleError("");
    setScheduleNotice("");
    try {
      const response = await fetch("/api/schedule-plans/" + encodeURIComponent(schedule.id), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "CREATE_EVENTS" }),
      });
      const body = await response.json();
      if (body.plan) setSchedule(body.plan);
      if (!response.ok) throw Error(body.error || "Could not add schedule blocks to Google Calendar.");
      setSchedule(body.plan);
      setScheduleWarnings(body.plan?.warnings || []);
      setScheduleNotice("Approved schedule blocks were created in Google Calendar.");
      await load();
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Could not add schedule blocks to Google Calendar.");
    } finally {
      setScheduleBusy(false);
    }
  }

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError("");
    try {
      const response = await fetch("/api/schedule-plans?date=" + encodeURIComponent(scheduleDate), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Could not load your daily schedule.");
      setSchedule(body.plan);
      setScheduleWarnings(body.plan?.warnings || []);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Could not load your daily schedule.");
    } finally {
      setScheduleLoading(false);
    }
  }, [scheduleDate]);
  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  async function generateSchedule() {
    if (schedule?.status === "APPROVED" && !window.confirm("Regenerating replaces your approved plan with a new draft. Continue?")) return;
    setScheduleBusy(true);
    setScheduleError("");
    setScheduleNotice("");
    try {
      const response = await fetch("/api/schedule-plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localDate: scheduleDate, timezone: defaultTimezone }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Could not generate a schedule.");
      setSchedule(body.plan);
      setScheduleWarnings(body.warnings || []);
      setScheduleNotice("Draft schedule generated. Review and adjust each block before approving it.");
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Could not generate a schedule.");
    } finally {
      setScheduleBusy(false);
    }
  }

  function updateScheduleBlock(taskId, key, value) {
    if (!schedule) return;
    const iso = localDateTimeToIso(value, schedule.timezone || defaultTimezone);
    setSchedule((current) => ({
      ...current,
      status: "DRAFT",
      blocks: current.blocks.map((block) => block.taskId === taskId
        ? { ...block, [key]: iso || value, ...(key === "startAt" && iso && new Date(iso) >= new Date(block.endAt) ? { endAt: new Date(new Date(iso).getTime() + 60 * 60 * 1000).toISOString() } : {}) }
        : block),
    }));
  }

  function removeScheduleBlock(block) {
    if (!schedule) return;
    setSchedule((current) => ({
      ...current,
      status: "DRAFT",
      blocks: current.blocks.filter((item) => item.taskId !== block.taskId),
      unscheduled: [...(current.unscheduled || []), { taskId: block.taskId, title: block.title, reason: "Removed from the proposed schedule by you." }],
    }));
  }

  async function saveSchedule(status) {
    if (!schedule) return;
    setScheduleBusy(true);
    setScheduleError("");
    setScheduleNotice("");
    try {
      const response = await fetch("/api/schedule-plans", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          localDate: scheduleDate,
          timezone: schedule.timezone || defaultTimezone,
          status,
          blocks: schedule.blocks.map((block) => ({ taskId: block.taskId, startAt: block.startAt, endAt: block.endAt })),
          unscheduled: (schedule.unscheduled || []).map((item) => ({ taskId: item.taskId, reason: item.reason || "Not scheduled." })),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        const conflictText = body.conflicts?.map((conflict) => conflict.task + " conflicts with " + conflict.event).join("; ");
        throw Error(conflictText ? body.error + " " + conflictText : body.error || "Could not save your schedule.");
      }
      setSchedule(body.plan);
      setScheduleWarnings(body.warnings || []);
      setScheduleNotice(status === "APPROVED" ? "Daily plan approved and saved. No calendar events were created." : "Schedule changes saved.");
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Could not save your schedule.");
    } finally {
      setScheduleBusy(false);
    }
  }

  function renderCalendarEvent(e) {
    return (
      <article key={e.id} className="min-w-0 rounded-xl bg-[#f7f9f6] p-3.5">
        <div className="break-words text-sm font-semibold">{e.title}</div>
        <div className="mt-1 flex items-start gap-2 text-xs text-[#6B7280]">
          <Clock3 size={13} className="mt-0.5 shrink-0" />
          <span>{formatEventTime(e, defaultTimezone)}</span>
        </div>
        {e.location && <div className="mt-1 break-words text-xs text-[#87918b]">{e.location}</div>}
        {e.attendees.length > 0 && (
          <div className="mt-2 flex items-center gap-1 text-xs text-[#6B7280]">
            <Users size={13} /> {e.attendees.length} attendees
          </div>
        )}
        {e.link && (
          <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#FA8500]" href={e.link} target="_blank" rel="noreferrer">
            Open event <ExternalLink size={12} />
          </a>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void editCalendarEvent(e)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-[#dfe6dd] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
            <Pencil size={12} /> Edit
          </Button>
          <Button onClick={() => void cancelCalendarEvent(e)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-[#e7d8d2] px-3 py-1.5 text-xs font-semibold text-[#994b36] disabled:opacity-50">
            <Trash2 size={12} /> Cancel event
          </Button>
        </div>
      </article>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#212529] pl-[58px] min-[421px]:pl-[72px] min-[761px]:pl-[252px]">
      <WorkspaceHeader />
      <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-[26px] min-[761px]:pt-[clamp(26px,4vw,48px)] pb-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-[#233044] text-[clamp(1.8rem,3vw,2.5rem)] font-semibold tracking-[-0.045em] leading-[1.13]">
              <CalendarDays size={40} />
              Make every meeting intentional.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280] text-pretty">
              Review your next 30 days, prepare an agenda, and create meetings only after explicit
              approval and confirmation.
            </p>
          </div>
          <Button
            onClick={() => void load()}
            disabled={loading || busy}
            className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-[spin_0.9s_linear_infinite]" : ""} />{" "}
            Refresh
          </Button>
        </div>
        {error && (
          <div
            role="alert"
            className="mb-4 border border-[#f0d6cc] bg-[#fff5f0] px-4 py-3 text-sm text-[#994b36] rounded-[13px]"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-4 border border-[#d8e9dd] bg-[#eef7f0] px-4 py-3 text-sm text-[#24543f] rounded-[13px]"
          >
            {notice}
          </div>
        )}
        {data && !data.calendarConnected && (
          <div className="mb-5 rounded-xl border border-[#eadfc8] bg-[#fffaf0] p-4 text-sm text-[#76551e]">
            Connect Google Workspace to view and create calendar events. You can still prepare a
            meeting proposal here.
          </div>
        )}
        {data?.calendarConnected && !data.canCreateEvents && (
          <div className="mb-5 rounded-xl border border-[#eadfc8] bg-[#fffaf0] p-4 text-sm text-[#76551e]">
            Calendar is connected in read-only mode. Reconnect Google from{" "}
            <a className="font-semibold underline" href="/integrations">
              Connections
            </a>{" "}
            and grant Calendar event access to enable creation.
          </div>
        )}
        {data?.calendarError && (
          <div className="mb-5 rounded-xl border border-[#f0d6cc] bg-[#fff5f0] p-4 text-sm text-[#994b36]">
            Google Calendar could not be refreshed: {data.calendarError}
          </div>
        )}
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Events in range" value={data?.events.length || 0} />
          <Stat
            label="Meeting proposals"
            value={
              data?.drafts.filter((d) => !["CANCELLED", "CREATED"].includes(d.status)).length || 0
            }
          />
          <Stat
            label="Created by assistant"
            value={data?.drafts.filter((d) => d.status === "CREATED").length || 0}
          />
        </div>
        <section className="mb-5 rounded-[18px] border border-[#E3E7ED] bg-white p-5 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold tracking-[-0.025em]">Plan your day</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#6B7280]">
                Build a priority-first draft around calendar events. Blocks are one hour by default; nothing is written to Google Calendar by approving this plan.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Schedule date" type="date" value={scheduleDate} onChange={(event) => event.target.value && setScheduleDate(event.target.value)} disabled={scheduleBusy || scheduleLoading} className="rounded-lg border border-[#dfe6dd] bg-white px-3 py-2 text-xs" />
              <Button onClick={() => void generateSchedule()} disabled={scheduleBusy || scheduleLoading || ["CREATED", "CREATING", "CREATE_UNCERTAIN"].includes(schedule?.status)} className="rounded-xl bg-[#FA8500] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {scheduleBusy ? "Working…" : "Generate draft"}
              </Button>
            </div>
          </div>
          {scheduleError && <p role="alert" className="mt-4 rounded-lg border border-[#f0d6cc] bg-[#fff5f0] p-3 text-sm text-[#994b36]">{scheduleError}</p>}
          {scheduleNotice && <p role="status" className="mt-4 rounded-lg border border-[#d8e9dd] bg-[#eef7f0] p-3 text-sm text-[#24543f]">{scheduleNotice}</p>}
          {scheduleWarnings.map((warning, index) => <p key={index} className="mt-3 rounded-lg border border-[#eadfc8] bg-[#fffaf0] p-3 text-xs text-[#76551e]">{warning}</p>)}
          {scheduleLoading ? <Loading /> : schedule ? (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[#6B7280]">
                  <span className="font-semibold text-[#233044]">{schedule.blocks?.length || 0} scheduled</span>
                  {" · "}{schedule.unscheduled?.length || 0} need another time
                  {" · "}{schedule.timezone}
                  {" · "}<span className="font-semibold">{schedule.status}</span>
                </div>
                <div className="flex gap-2">
                  {schedule.status === "DRAFT" && (
                    <>
                      <Button onClick={() => void saveSchedule("DRAFT")} disabled={scheduleBusy} className="rounded-xl border border-[#dfe6dd] px-3 py-2 text-xs font-semibold">Save draft</Button>
                      <Button onClick={() => void saveSchedule("APPROVED")} disabled={scheduleBusy} className="rounded-xl bg-[#233044] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve plan</Button>
                    </>
                  )}
                  {schedule.status === "APPROVED" && (
                    <Button onClick={() => void createCalendarBlocks()} disabled={scheduleBusy || !data?.canCreateEvents} className="rounded-xl bg-[#FA8500] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Add blocks to Google Calendar</Button>
                  )}
                </div>
              </div>
              {schedule.blocks?.length ? (
                <div className="mt-4 space-y-3">
                  {[...schedule.blocks].sort((a, b) => new Date(a.startAt) - new Date(b.startAt)).map((block) => (
                    <article key={block.taskId} className="grid gap-3 rounded-xl border border-[#edf1ed] bg-[#f8faf7] p-3 sm:grid-cols-[minmax(0,1fr)_180px_180px_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#233044]">{block.title}</p>
                        <p className="mt-1 text-xs text-[#6B7280]">{block.priority || "MEDIUM"} priority · 60-minute focus block</p>
                      </div>
                      <label className="text-xs text-[#6B7280]">Start
                        <input aria-label={"Start time for " + block.title} type="datetime-local" value={toLocalDateTime(block.startAt, schedule.timezone || defaultTimezone)} onChange={(event) => updateScheduleBlock(block.taskId, "startAt", event.target.value)} disabled={scheduleBusy || schedule.status !== "DRAFT"} className="mt-1 w-full rounded-lg border border-[#dfe6dd] bg-white px-2 py-2 text-xs disabled:bg-[#f0f2f0]" />
                      </label>
                      <label className="text-xs text-[#6B7280]">End
                        <input aria-label={"End time for " + block.title} type="datetime-local" value={toLocalDateTime(block.endAt, schedule.timezone || defaultTimezone)} onChange={(event) => updateScheduleBlock(block.taskId, "endAt", event.target.value)} disabled={scheduleBusy || schedule.status === "APPROVED"} className="mt-1 w-full rounded-lg border border-[#dfe6dd] bg-white px-2 py-2 text-xs disabled:bg-[#f0f2f0]" />
                      </label>
                      <Button onClick={() => removeScheduleBlock(block)} disabled={scheduleBusy || schedule.status === "APPROVED"} className="rounded-lg border border-[#e7d8d2] px-3 py-2 text-xs font-semibold text-[#994b36] disabled:opacity-50">Remove</Button>
                    </article>
                  ))}
                </div>
              ) : <Empty text="No tasks are scheduled yet. Generate a draft after adding open tasks." />}
              {schedule.status === "CREATE_UNCERTAIN" && (
                <div role="alert" className="mt-4 rounded-lg border border-[#f0d6cc] bg-[#fff5f0] p-3 text-sm text-[#994b36]">
                  <p>Calendar creation has an uncertain or partial outcome. Inspect Google Calendar before choosing a recovery action.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => void scheduleCalendarAction("CONFIRM_CREATED")} disabled={scheduleBusy} className="rounded-lg border border-[#d9a99b] px-3 py-2 text-xs font-semibold">I verified all blocks exist</Button>
                    <Button onClick={() => void scheduleCalendarAction("CONFIRM_NONE_CREATED")} disabled={scheduleBusy} className="rounded-lg border border-[#d9a99b] px-3 py-2 text-xs font-semibold">I verified none exist</Button>
                  </div>
                </div>
              )}
              {schedule.status === "CREATED" && (
                <div className="mt-4 rounded-lg border border-[#d8e9dd] bg-[#f4faf5] p-3 text-sm text-[#24543f]">
                  Calendar blocks are live. Remove them here before editing this plan or generating a replacement.
                  <div className="mt-3">
                    <Button onClick={() => void scheduleCalendarAction("CANCEL_EVENTS")} disabled={scheduleBusy} className="rounded-lg border border-[#dfe6dd] px-3 py-2 text-xs font-semibold">Remove schedule blocks</Button>
                  </div>
                </div>
              )}
              {schedule.status === "CREATING" && (
                <p role="status" className="mt-4 rounded-lg border border-[#eadfc8] bg-[#fffaf0] p-3 text-sm text-[#76551e]">
                  A calendar write is still marked as processing. Refresh and verify Google Calendar before attempting any recovery.
                </p>
              )}
              {schedule.calendarEvents?.length > 0 && (
                <div className="mt-4 rounded-xl border border-[#d8e9dd] bg-[#f4faf5] p-4">
                  <h3 className="text-sm font-semibold text-[#24543f]">Calendar events created</h3>
                  <ul className="mt-2 space-y-2">
                    {schedule.calendarEvents.map((event) => (
                      <li key={event.eventId} className="text-xs leading-5">
                        {event.htmlLink ? <a href={event.htmlLink} target="_blank" rel="noreferrer" className="font-semibold text-[#24543f] underline">{event.title} <ExternalLink size={11} className="inline" /></a> : <span className="font-semibold">{event.title}</span>}
                        <span className="ml-2 text-[#6B7280]">{format(event.startAt, schedule.timezone)} – {format(event.endAt, schedule.timezone)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {schedule.unscheduled?.length > 0 && (
                <div className="mt-5 rounded-xl bg-[#fffaf0] p-4">
                  <h3 className="text-sm font-semibold text-[#76551e]">Needs another time</h3>
                  <ul className="mt-2 space-y-2">
                    {schedule.unscheduled.map((item) => <li key={item.taskId} className="text-xs leading-5 text-[#76551e]"><span className="font-semibold">{item.title}</span> — {item.reason}</li>)}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 rounded-xl bg-[#f7f9f6] p-4 text-sm text-[#6B7280]">No saved plan for this date. Generate a draft to schedule your open tasks around your calendar.</p>
          )}
        </section>
        <div className="grid items-start gap-5 xl:grid-cols-[.9fr_1.1fr]">
          <section className="rounded-[18px] border border-[#E3E7ED] p-5 sm:p-6 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] bg-white">
            <div className="mb-4 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="font-semibold tracking-[-0.025em]">Calendar</h2>
                <p className="mt-1 text-xs text-[#6B7280] text-pretty">
                  {rangeLabel(currentRange, defaultTimezone)} · {calendarView} view · {defaultTimezone}
                </p>
              </div>
              <CalendarDays size={18} className="shrink-0 text-[#FA8500]" />
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                aria-label="Previous calendar range"
                onClick={() => setCalendarDate((date) => {
                  if (calendarView === "day") return shiftDateKey(date, -1);
                  if (calendarView === "week") return shiftDateKey(date, -7);
                  return shiftMonthKey(date, -1);
                })}
                disabled={loading || busy}
                className="rounded-lg border border-[#dfe6dd] px-3 py-2 text-xs"
              >Previous</Button>
              <Button onClick={() => setCalendarDate(dateKey(new Date()))} disabled={loading || busy} className="rounded-lg border border-[#dfe6dd] px-3 py-2 text-xs">Today</Button>
              <Button
                aria-label="Next calendar range"
                onClick={() => setCalendarDate((date) => {
                  if (calendarView === "day") return shiftDateKey(date, 1);
                  if (calendarView === "week") return shiftDateKey(date, 7);
                  return shiftMonthKey(date, 1);
                })}
                disabled={loading || busy}
                className="rounded-lg border border-[#dfe6dd] px-3 py-2 text-xs"
              >Next</Button>
              <select aria-label="Calendar view" value={calendarView} onChange={(event) => setCalendarView(event.target.value)} disabled={loading || busy} className="rounded-lg border border-[#dfe6dd] bg-white px-3 py-2 text-xs">
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
              <input aria-label="Choose calendar date" type="date" value={calendarDate} onChange={(event) => event.target.value && setCalendarDate(event.target.value)} disabled={loading || busy} className="min-w-0 rounded-lg border border-[#dfe6dd] bg-white px-3 py-2 text-xs" />
            </div>
            {data?.eventsTruncated && (
              <p role="status" className="mb-3 rounded-lg bg-[#fff8e8] p-3 text-xs text-[#76551e]">
                This range contains many events. Showing up to 1,250; narrow the date range to see fewer events.
              </p>
            )}
            <Input
              aria-label="Search calendar events"
              value={eventQuery}
              onChange={(event) => setEventQuery(event.target.value)}
              placeholder="Search events, locations, attendees…"
              className="mb-3 w-full rounded-xl border px-3 py-2 text-xs"
            />
            {loading ? (
              <Loading />
            ) : visibleEvents.length ? (
              calendarView === "day" ? (
                <div className="space-y-2">{eventsForDate(calendarDate).map(renderCalendarEvent)}</div>
              ) : (
                <div className={calendarView === "week" ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7" : "grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"}>
                  {calendarDates.map((date) => {
                    const dayEvents = eventsForDate(date);
                    return (
                      <section key={date} className="min-w-0 rounded-xl border border-[#e5ebe3] bg-white p-2">
                        <h3 className="mb-2 text-xs font-semibold text-[#46544b]">{formatDateLabel(date, defaultTimezone)}</h3>
                        {dayEvents.length ? <div className="space-y-2">{dayEvents.map(renderCalendarEvent)}</div> : <p className="py-3 text-center text-[11px] text-[#a0a8a0]">No events</p>}
                      </section>
                    );
                  })}
                </div>
              )
            ) : (
              <Empty text={eventQuery ? "No calendar events match your search." : "No events in this date range. Create a proposal for your next meeting."} />
            )}
          </section>
          <section className="rounded-[18px] border border-[#E3E7ED] p-5 sm:p-6 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] bg-white">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold tracking-[-0.025em]">{editingEventId ? "Edit calendar event" : "Meeting proposal"}</h2>
                <p className="mt-1 text-xs text-[#6B7280] text-pretty">
                  {editingEventId ? "Update an existing event. Attendees may be notified." : "Save → approve → separately confirm creation"}
                </p>
              </div>
              <Button
                onClick={fresh}
                htmlType="button"
                className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] px-3 py-2 text-sm font-semibold"
              >
                <Plus size={15} /> New
              </Button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <Field label="Meeting title">
                <Input
                  required
                  maxLength={250}
                  disabled={!editable || busy}
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Weekly product review"
                  className="w-full rounded-xl border border-[#dfe6dd] bg-white px-3.5 py-3 text-sm disabled:bg-[#F8F9FA]"
                />
              </Field>
              <Field label="Agenda / description">
                <Input.TextArea
                  rows={3}
                  maxLength={10000}
                  disabled={!editable || busy}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Goals, topics, decisions needed…"
                  className="w-full rounded-xl border border-[#dfe6dd] bg-white px-3.5 py-3 text-sm disabled:bg-[#F8F9FA] resize-y"
                />
              </Field>
              <Field label="Location or video link (optional)">
                <Input
                  maxLength={500}
                  disabled={!editable || busy}
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Room, address, or video meeting link"
                  className="w-full rounded-xl border border-[#dfe6dd] bg-white px-3.5 py-3 text-sm disabled:bg-[#F8F9FA]"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start">
                  <input
                    type={form.allDay ? "date" : "datetime-local"}
                    required
                    disabled={!editable || busy}
                    value={form.startAt}
                    onChange={(e) => set("startAt", e.target.value)}
                    className="w-full rounded-xl border border-[#dfe6dd] bg-white px-3.5 py-3 text-sm disabled:bg-[#F8F9FA]"
                  />
                </Field>
                <Field label="End">
                  <input
                    type={form.allDay ? "date" : "datetime-local"}
                    required
                    disabled={!editable || busy}
                    value={form.endAt}
                    onChange={(e) => set("endAt", e.target.value)}
                    className="w-full rounded-xl border border-[#dfe6dd] bg-white px-3.5 py-3 text-sm disabled:bg-[#F8F9FA]"
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Timezone (IANA)">
                  <Input
                    required
                    maxLength={100}
                    disabled={!editable || busy}
                    value={form.timezone}
                    onChange={(e) => set("timezone", e.target.value)}
                    placeholder="Asia/Karachi"
                    className="w-full rounded-xl border border-[#dfe6dd] bg-white px-3.5 py-3 text-sm disabled:bg-[#F8F9FA]"
                  />
                </Field>
                <Field label="Attendee emails (comma-separated)">
                  <Input
                    disabled={!editable || busy}
                    value={form.attendees}
                    onChange={(e) => set("attendees", e.target.value)}
                    placeholder="team@example.com"
                    className="w-full rounded-xl border border-[#dfe6dd] bg-white px-3.5 py-3 text-sm disabled:bg-[#F8F9FA]"
                  />
                </Field>
              </div>
              {editable && (
                <Button
                  htmlType="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  <Save size={15} />
                  {busy ? "Saving…" : editingEventId ? "Update calendar event" : "Save proposal"}
                </Button>
              )}
            </form>
            {chosen && (
              <div className="mt-5 border-t border-[#edf0ec] pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold">Proposal status</div>
                  <span className="rounded-full bg-[#f0f4ef] px-2.5 py-1 text-xs font-semibold tracking-[0.01em]">
                    {labels[chosen.status]}
                  </span>
                </div>
                {chosen.lastError && (
                  <p className="mb-3 rounded-lg bg-[#fff5f0] p-3 text-xs leading-5 text-[#994b36] text-pretty">
                    {chosen.lastError}
                  </p>
                )}
                {chosen.createdEventLink && (
                  <a
                    className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-[#FA8500]"
                    href={chosen.createdEventLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open created event <ExternalLink size={13} />
                  </a>
                )}
                <div className="flex flex-wrap gap-2">
                  {chosen.status === "DRAFT" && (
                    <Button
                      disabled={busy}
                      onClick={() => void act("APPROVE")}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <ShieldCheck size={15} /> Approve exact proposal
                    </Button>
                  )}
                  {chosen.status === "APPROVED" && (
                    <Button
                      disabled={busy || !data?.canCreateEvents}
                      onClick={() => void act("CREATE")}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <CheckCircle2 size={15} />
                      {" Confirm & create event"}
                    </Button>
                  )}
                  {chosen.status === "CREATE_UNCERTAIN" && (
                    <>
                      <Button
                        disabled={busy}
                        onClick={() => void act("CONFIRM_CREATED")}
                        className="rounded-xl border border-[#dfe6dd] px-3 py-2 text-sm font-semibold"
                      >
                        I found it in Calendar
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => void act("CONFIRM_NOT_CREATED")}
                        className="rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-3 py-2 text-sm font-semibold text-white"
                      >
                        Verified absent — unlock retry
                      </Button>
                    </>
                  )}
                  {["DRAFT", "APPROVED", "FAILED"].includes(chosen.status) && (
                    <Button
                      disabled={busy}
                      onClick={() => void act("CANCEL")}
                      className="rounded-xl border border-[#e2e8e0] px-3 py-2 text-sm font-medium"
                    >
                      Cancel proposal
                    </Button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
        <section className="mt-5 rounded-[18px] border border-[#E3E7ED] p-5 sm:p-6 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] bg-white">
          <h2 className="font-semibold tracking-[-0.025em]">Saved proposals</h2>
          <p className="mt-1 text-xs text-[#6B7280] text-pretty">
            Search proposals and filter by lifecycle status. Creation outcomes remain available for traceability.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Search meeting proposals"
              value={calendarQuery}
              onChange={(event) => setCalendarQuery(event.target.value)}
              placeholder="Search title, agenda, location, or attendee…"
              className="w-full rounded-xl border px-3 py-2 text-xs"
            />
            <select
              aria-label="Filter meeting proposals by status"
              value={proposalStatusFilter}
              onChange={(event) => setProposalStatusFilter(event.target.value)}
              className="rounded-xl border border-[#dfe6dd] bg-white px-3 py-2 text-xs sm:min-w-44"
            >
              <option value="ACTIVE">Active proposals</option>
              <option value="ALL">All statuses</option>
              <option value="CREATED">Created</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          {loading ? (
            <Loading />
          ) : visibleDrafts.length ? (
            <div className="mt-4 divide-y divide-[#edf1ed]">
              {visibleDrafts.map((d) => (
                <Button
                  key={d.id}
                  onClick={() => selectDraft(d)}
                  className={`flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left ${selected === d.id ? "text-[#FA8500]" : ""}`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{d.title}</span>
                    <span className="mt-1 block text-xs text-[#6B7280]">
                      {format(d.startAt, d.timezone)} · {d.attendees.length} attendees
                    </span>
                  </span>
                  <span className="rounded-full bg-[#f0f4ef] px-2.5 py-1 text-xs font-semibold tracking-[0.01em]">
                    {labels[d.status]}
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <Empty text={data?.drafts.length ? "No proposals match your search and status filter." : "Your saved meeting proposals will appear here."} />
          )}
        </section>
        <p className="mt-5 text-xs leading-5 text-[#87918b] text-pretty">
          Creating an event can send invitations to attendees. This is never automatic: the exact
          proposal must be approved and event creation separately confirmed. If the result is
          uncertain, check Google Calendar before unlocking a retry.
        </p>
      </div>
    </main>
  );
}
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-[#46544b]">{label}</span>
      {children}
    </label>
  );
}
function Stat({ label, value }) {
  return (
    <div className="rounded-[18px] border border-[#E3E7ED] bg-white p-4 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)]">
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[#87918b] text-pretty">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-pretty tracking-[-0.045em]">{value}</p>
    </div>
  );
}
function Loading() {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-[#6B7280]">
      <LoaderCircle size={16} className="animate-[spin_0.9s_linear_infinite]" /> Loading meetings…
    </div>
  );
}
function Empty({ text }) {
  return <p className="py-8 text-sm text-[#6B7280] text-pretty">{text}</p>;
}
