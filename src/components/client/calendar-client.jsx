"use client";


import { Button, Input } from "antd";
import { useCallback, useEffect, useState } from "react";
import WorkspaceHeader from "@/components/workspace-header";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Users,
} from "lucide-react";
const blank = {
  title: "",
  description: "",
  location: "",
  startAt: "",
  endAt: "",
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
function toLocal(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function format(value) {
  if (!value) return "Time not set";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
function fromForm(f) {
  return {
    title: f.title,
    description: f.description,
    location: f.location,
    startAt: new Date(f.startAt).toISOString(),
    endAt: new Date(f.endAt).toISOString(),
    timezone: f.timezone,
    attendees: f.attendees
      .split(/[;,\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
export default function CalendarClient() {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(""),
    [form, setForm] = useState(blank);
  const load = useCallback(async () => {
    setError("");
    try {
      const r = await fetch("/api/meeting-drafts", {
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
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const chosen = data?.drafts.find((d) => d.id === selected);
  const editable = !chosen || chosen.status === "DRAFT" || chosen.status === "FAILED";
  function selectDraft(d) {
    setSelected(d.id);
    setForm({
      title: d.title,
      description: d.description,
      location: d.location || "",
      startAt: toLocal(d.startAt),
      endAt: toLocal(d.endAt),
      timezone: d.timezone,
      attendees: d.attendees.join(", "),
    });
    setError("");
    setNotice("");
  }
  function fresh() {
    setSelected("");
    setForm({
      ...blank,
      timezone: data?.drafts[0]?.timezone || "Asia/Karachi",
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
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = fromForm(form);
      const r = await fetch(selected ? "/api/meeting-drafts/" + selected : "/api/meeting-drafts", {
        method: selected ? "PATCH" : "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not save meeting.");
      setNotice("Meeting proposal saved. Review it before approving.");
      await load();
      selectDraft(d.draft);
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
  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#212529] pl-[58px] min-[421px]:pl-[72px] min-[761px]:pl-[252px]">
      <WorkspaceHeader />
      <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-[26px] min-[761px]:pt-[clamp(26px,4vw,48px)] pb-14">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#FA8500]">
          <CalendarDays size={14} />
          {" Calendar & meeting operations"}
        </div>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(1.8rem,3vw,2.5rem)] font-semibold tracking-[-0.045em] leading-[1.13]">
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
          <Stat label="Upcoming events" value={data?.events.length || 0} />
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
        <div className="grid items-start gap-5 xl:grid-cols-[.9fr_1.1fr]">
          <section className="rounded-[18px] border border-[#E3E7ED] p-5 sm:p-6 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] bg-white">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold tracking-[-0.025em]">Upcoming calendar</h2>
                <p className="mt-1 text-xs text-[#6B7280] text-pretty">
                  Next 30 days · primary Google Calendar
                </p>
              </div>
              <CalendarDays size={18} className="text-[#FA8500]" />
            </div>
            {loading ? (
              <Loading />
            ) : data?.events.length ? (
              <div className="space-y-2">
                {data.events.map((e) => (
                  <article key={e.id} className="rounded-xl bg-[#f7f9f6] p-3.5 min-w-0">
                    <div className="text-sm font-semibold">{e.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[#6B7280]">
                      <Clock3 size={13} />
                      {format(e.startAt)}
                    </div>
                    {e.location && <div className="mt-1 text-xs text-[#87918b]">{e.location}</div>}
                    {e.attendees.length > 0 && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-[#6B7280]">
                        <Users size={13} />
                        {e.attendees.length} attendees
                      </div>
                    )}
                    {e.link && (
                      <a
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#FA8500]"
                        href={e.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open event <ExternalLink size={12} />
                      </a>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <Empty text="No upcoming events found. Create a proposal for your next meeting." />
            )}
          </section>
          <section className="rounded-[18px] border border-[#E3E7ED] p-5 sm:p-6 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] bg-white">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold tracking-[-0.025em]">Meeting proposal</h2>
                <p className="mt-1 text-xs text-[#6B7280] text-pretty">
                  Save → approve → separately confirm creation
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
                    type="datetime-local"
                    required
                    disabled={!editable || busy}
                    value={form.startAt}
                    onChange={(e) => set("startAt", e.target.value)}
                    className="w-full rounded-xl border border-[#dfe6dd] bg-white px-3.5 py-3 text-sm disabled:bg-[#F8F9FA]"
                  />
                </Field>
                <Field label="End">
                  <input
                    type="datetime-local"
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
                  {busy ? "Saving…" : "Save proposal"}
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
            Select any editable proposal to revise it. Creation outcomes are retained for
            traceability.
          </p>
          {loading ? (
            <Loading />
          ) : data?.drafts.length ? (
            <div className="mt-4 divide-y divide-[#edf1ed]">
              {data.drafts.map((d) => (
                <Button
                  key={d.id}
                  onClick={() => selectDraft(d)}
                  className={`flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left ${selected === d.id ? "text-[#FA8500]" : ""}`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{d.title}</span>
                    <span className="mt-1 block text-xs text-[#6B7280]">
                      {format(d.startAt)} · {d.attendees.length} attendees
                    </span>
                  </span>
                  <span className="rounded-full bg-[#f0f4ef] px-2.5 py-1 text-xs font-semibold tracking-[0.01em]">
                    {labels[d.status]}
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <Empty text="Your saved meeting proposals will appear here." />
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
