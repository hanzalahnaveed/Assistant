"use client";


import { Button, Input } from "antd";
import { useCallback, useEffect, useState } from "react";
import WorkspaceHeader from "@/components/workspace-header";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  MailPlus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
const empty = {
  toEmail: "",
  ccEmail: "",
  subject: "",
  body: "",
  goal: "",
};
const labels = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  SENDING: "Sending…",
  SENT: "Sent",
  FAILED: "Send failed",
  SEND_UNCERTAIN: "Outcome uncertain",
  CANCELLED: "Cancelled",
};
export default function EmailClient() {
  const [drafts, setDrafts] = useState([]),
    [id, setId] = useState(""),
    [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/email-drafts", {
          cache: "no-store",
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not load drafts.");
      setDrafts(d.drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load drafts.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  function choose(d) {
    setId(d.id);
    setForm({
      toEmail: d.toEmail,
      ccEmail: d.ccEmail || "",
      subject: d.subject,
      body: d.body,
      goal: d.goal || "",
    });
    setError("");
    setNotice("");
  }
  function fresh() {
    setId("");
    setForm(empty);
    setError("");
    setNotice("");
  }
  function change(k, v) {
    setForm((f) => ({
      ...f,
      [k]: v,
    }));
  }
  async function save(e, generate = false) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const creating = !id || generate;
      const r = await fetch(creating ? "/api/email-drafts" : "/api/email-drafts/" + id, {
        method: creating ? "POST" : "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          generate,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not save draft.");
      choose(d.draft);
      setNotice(
        generate ? "AI draft created. Review all details before approval." : "Draft saved.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save draft.");
    } finally {
      setBusy(false);
    }
  }
  async function act(action) {
    if (!id) return;
    if (
      action === "SEND" &&
      !window.confirm("Send this exact approved email to " + form.toEmail + "?")
    )
      return;
    if (action === "CANCEL" && !window.confirm("Cancel this draft?")) return;
    if (
      action === "CONFIRM_SENT" &&
      !window.confirm("Confirm that you found this message in Gmail Sent?")
    )
      return;
    if (
      action === "CONFIRM_NOT_SENT" &&
      !window.confirm(
        "Confirm you checked Gmail Sent and this message is NOT there? It will be eligible for a new, separately confirmed send.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action === "APPROVE") {
        const edit = await fetch("/api/email-drafts/" + id, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(form),
        });
        const saved = await edit.json();
        if (!edit.ok) throw Error(saved.error || "Save your draft before approving.");
      }
      const r = await fetch("/api/email-drafts/" + id, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action,
          }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error || "Email action failed.");
      if (d.draft) choose(d.draft);
      setNotice(
        action === "APPROVE"
          ? "Draft approved. Sending still requires a separate confirmation."
          : action === "SEND"
            ? "Email sent successfully."
            : action === "CANCEL"
              ? "Draft cancelled."
              : action === "CONFIRM_SENT"
                ? "Marked sent based on your Gmail verification."
                : "Marked not sent after your Gmail verification. You must confirm sending again.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Email action failed.");
      await load();
    } finally {
      setBusy(false);
    }
  }
  const selected = drafts.find((d) => d.id === id),
    editable = !selected || selected.status === "DRAFT" || selected.status === "FAILED";
  const sent = drafts.filter((d) => d.status === "SENT").length,
    pending = drafts.filter((d) => d.status === "DRAFT" || d.status === "APPROVED").length;
  const filteredDrafts = drafts.filter((draft) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [draft.toEmail, draft.ccEmail, draft.subject, draft.body, draft.goal]
      .some((value) => (value || "").toLowerCase().includes(needle));
    return matchesSearch && (statusFilter === "ALL" || draft.status === statusFilter);
  });
  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#212529] pl-[58px] min-[421px]:pl-[72px] min-[761px]:pl-[252px]">
      <WorkspaceHeader />
      <div className="mx-auto max-w-7xl px-4 sm:px-7 pt-[26px] min-[761px]:pt-[clamp(26px,4vw,48px)] pb-14">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-[clamp(1.8rem,3vw,2.5rem)] text-[#233044] font-semibold tracking-[-0.045em] leading-[1.13]">
              <MailPlus size={40}/>
              {"Email & cold outreach"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280] text-pretty">
              Draft and review outreach, approve the exact message, then confirm sending separately.
              Nothing sends automatically.
            </p>
          </div>
          <Button
            onClick={fresh}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-4 py-3 text-sm font-semibold text-white"
          >
            <MailPlus size={16} /> New email
          </Button>
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Saved drafts" value={drafts.filter((d) => d.status === "DRAFT").length} />
          <Stat label="Awaiting your action" value={pending} />
          <Stat label="Sent by you" value={sent} />
        </div>
        {error && (
          <div
            role="alert"
            className="mb-4 flex gap-2 border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950 rounded-[13px]"
          >
            <AlertCircle size={17} />
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-4 flex gap-2 border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900 rounded-[13px]"
          >
            <CheckCircle2 size={17} />
            {notice}
          </div>
        )}
        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="rounded-[18px] border border-[#E3E7ED] p-4 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] bg-white">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-[-0.025em]">Your emails</h2>
              <Button
                aria-label="Refresh drafts"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-lg p-2 text-[#6B7280] hover:bg-[#f4f7f3] disabled:opacity-50"
              >
                <RefreshCw size={14} />
              </Button>
            </div>
            <div className="mb-3 space-y-2">
              <Input
                aria-label="Search email drafts"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search recipient, subject, or message…"
                className="w-full rounded-xl border px-3 py-2 text-xs"
              />
              <select
                aria-label="Filter email drafts by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2 text-xs"
              >
                <option value="ALL">All statuses</option>
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {(search || statusFilter !== "ALL") && (
                <button type="button" onClick={() => { setSearch(""); setStatusFilter("ALL"); }} className="text-xs font-semibold text-[#FA8500]">
                  Clear filters
                </button>
              )}
              <p className="text-[10px] text-[#87918b]">{filteredDrafts.length} of {drafts.length} emails</p>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-[#6B7280]">
                <LoaderCircle size={16} className="animate-[spin_0.9s_linear_infinite]" />
                Loading…
              </div>
            ) : filteredDrafts.length ? (
              <div className="space-y-1">
                {filteredDrafts.map((d) => (
                  <Button
                    key={d.id}
                    onClick={() => choose(d)}
                    className={
                      "w-full rounded-xl p-3 text-left " +
                      (id === d.id ? "bg-[#e8f3ec]" : "hover:bg-[#f7f9f6]")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-xs font-semibold">
                        {d.subject || "(No subject)"}
                      </span>
                      <span className="shrink-0 text-[9px] text-[#6B7280]">{labels[d.status]}</span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-[#6B7280]">{d.toEmail}</div>
                    <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[#8b958e] text-pretty">
                      {d.body || "No message body yet."}
                    </p>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-xs leading-5 text-[#6B7280] text-pretty">
                {drafts.length ? "No emails match these filters." : "No emails yet. Create your first outreach draft."}
              </p>
            )}
          </aside>
          <section className="rounded-[18px] border border-[#E3E7ED] p-5 sm:p-7 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] bg-white">
            <div className="mb-5 flex items-center gap-3 border-b border-[#E3E7ED] pb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ec] text-[#FA8500]">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="font-semibold tracking-[-0.025em]">
                  {selected ? "Review email draft" : "Compose an email"}
                </h2>
                <p className="mt-1 text-xs text-[#6B7280] text-pretty">
                  {selected
                    ? "Created " + new Date(selected.createdAt).toLocaleString()
                    : "Describe your goal and let AI prepare a starting point."}
                </p>
              </div>
            </div>
            {selected?.status === "SEND_UNCERTAIN" && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-6 text-amber-950">
                <strong>Check Gmail before any retry.</strong> The app locked this draft because the
                send outcome could not be confirmed. If you find it in Sent, confirm that below. If
                you verify it is absent, you can explicitly unlock it for a separately confirmed
                retry.
              </div>
            )}
            {selected?.lastError && selected.status !== "SEND_UNCERTAIN" && (
              <p className="mb-4 rounded-xl bg-[#f7f9f6] p-3 text-xs leading-5 text-[#6B7280] text-pretty">
                {selected.lastError}
              </p>
            )}
            <form onSubmit={(e) => void save(e)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Recipient email">
                  <Input
                    type="email"
                    required
                    disabled={!editable || busy}
                    value={form.toEmail}
                    onChange={(e) => change("toEmail", e.target.value)}
                    placeholder="person@company.com"
                    className="w-full border px-3.5 py-3 text-sm disabled:bg-[#F8F9FA]"
                  />
                </Field>
                <Field label="CC (optional)">
                  <Input
                    type="email"
                    disabled={!editable || busy}
                    value={form.ccEmail}
                    onChange={(e) => change("ccEmail", e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full border px-3.5 py-3 text-sm disabled:bg-[#F8F9FA]"
                  />
                </Field>
              </div>
              <Field label="Outreach goal">
                <Input.TextArea
                  rows={2}
                  maxLength={4000}
                  disabled={!editable || busy}
                  value={form.goal}
                  onChange={(e) => change("goal", e.target.value)}
                  placeholder="Introduce your service and ask for a 15-minute call…"
                  className="w-full resize-y border px-3.5 py-3 text-sm disabled:bg-[#F8F9FA]"
                />
              </Field>
              <Field label="Subject">
                <Input
                  required
                  maxLength={250}
                  disabled={!editable || busy}
                  value={form.subject}
                  onChange={(e) => change("subject", e.target.value)}
                  placeholder="A concise, relevant subject"
                  className="w-full border px-3.5 py-3 text-sm disabled:bg-[#F8F9FA]"
                />
              </Field>
              <Field label="Message">
                <Input.TextArea
                  required
                  rows={10}
                  maxLength={30000}
                  disabled={!editable || busy}
                  value={form.body}
                  onChange={(e) => change("body", e.target.value)}
                  placeholder="Write your message or generate a starting draft…"
                  className="w-full resize-y border px-3.5 py-3 text-sm leading-6 disabled:bg-[#F8F9FA]"
                />
              </Field>
              <div className="flex flex-wrap gap-2 border-t border-[#edf0ec] pt-5">
                {editable && (
                  <>
                    <Button
                      htmlType="submit"
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] px-4 py-2.5 text-sm font-semibold hover:bg-[#f7f9f6] disabled:opacity-50"
                    >
                      <Save size={15} />
                      Save draft
                    </Button>
                    <Button
                      htmlType="button"
                      disabled={busy || !form.toEmail.trim() || !form.goal.trim()}
                      onClick={(e) => {
                        e.preventDefault();
                        void save(e, true);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <Sparkles size={15} />
                      {busy ? "Working…" : "Generate with AI"}
                    </Button>
                  </>
                )}
                {selected?.status === "DRAFT" && (
                  <Button
                    htmlType="button"
                    disabled={busy || !form.toEmail || !form.subject.trim() || !form.body.trim()}
                    onClick={() => void act("APPROVE")}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <ShieldCheck size={15} />
                    Approve exact draft
                  </Button>
                )}
                {selected?.status === "APPROVED" && (
                  <Button
                    htmlType="button"
                    disabled={busy}
                    onClick={() => void act("SEND")}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Send size={15} />
                    {"Confirm & send"}
                  </Button>
                )}
                {selected?.status === "SEND_UNCERTAIN" && (
                  <>
                    <Button
                      htmlType="button"
                      disabled={busy}
                      onClick={() => void act("CONFIRM_SENT")}
                      className="rounded-xl border border-[#dfe6dd] px-4 py-2.5 text-sm font-semibold"
                    >
                      I found it in Sent
                    </Button>
                    <Button
                      htmlType="button"
                      disabled={busy}
                      onClick={() => void act("CONFIRM_NOT_SENT")}
                      className="rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      Verified absent — unlock retry
                    </Button>
                  </>
                )}
                {selected && ["DRAFT", "APPROVED", "FAILED"].includes(selected.status) && (
                  <Button
                    htmlType="button"
                    disabled={busy}
                    onClick={() => void act("CANCEL")}
                    className="rounded-xl border border-[#e2e8e0] px-4 py-2.5 text-sm font-medium text-[#6B7280] disabled:opacity-50"
                  >
                    Cancel draft
                  </Button>
                )}
              </div>
            </form>
            <p className="mt-5 text-[11px] leading-5 text-[#87918b] text-pretty">
              AI output is not verified fact. Review recipient, claims, links, tone, and subject.
              Approval and sending are separate actions.
            </p>
          </section>
        </div>
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
