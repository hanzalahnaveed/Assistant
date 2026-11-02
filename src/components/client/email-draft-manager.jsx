"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, MailPlus, Pencil, RefreshCw, Save, Send, Trash2, X } from "lucide-react";

const emptyForm = { toEmail: "", ccEmail: "", subject: "", body: "" };

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("The email draft service returned an invalid response.");
  }
}

export default function EmailDraftManager() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newDraft, setNewDraft] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/email-drafts", { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not load outbound drafts.");
      setDrafts((data.drafts || []).filter((draft) => !draft.replyThreadId));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load outbound drafts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function beginEdit(draft) {
    setEditingId(draft.id);
    setEditForm({
      toEmail: draft.toEmail || "",
      ccEmail: draft.ccEmail || "",
      subject: draft.subject || "",
      body: draft.body || "",
    });
    setError("");
  }

  async function createDraft(event) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/email-drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newDraft),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not create draft.");
      setDrafts((current) => [data.draft, ...current]);
      setNewDraft(emptyForm);
      setCreateOpen(false);
      setNotice("Outbound email draft created. Review and approve it before sending.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create draft.");
    } finally {
      setCreating(false);
    }
  }

  async function saveDraft(draft) {
    setBusyId(draft.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/email-drafts/" + encodeURIComponent(draft.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not save draft.");
      setDrafts((current) => current.map((item) => item.id === draft.id ? data.draft : item));
      setEditingId("");
      setNotice("Draft changes saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save draft.");
    } finally {
      setBusyId("");
    }
  }

  async function approveDraft(draft) {
    setBusyId(draft.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/email-drafts/" + encodeURIComponent(draft.id), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not approve draft.");
      setDrafts((current) => current.map((item) => item.id === draft.id ? data.draft : item));
      setNotice("Draft approved. Press Send when you are ready.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not approve draft.");
    } finally {
      setBusyId("");
    }
  }

  async function sendDraft(draft) {
    if (!window.confirm("Send this email to " + draft.toEmail + "?")) return;
    setBusyId(draft.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/email-drafts/" + encodeURIComponent(draft.id), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "SEND" }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not send email.");
      setDrafts((current) => current.map((item) => item.id === draft.id ? data.draft : item));
      setNotice("Email sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send email.");
      await load();
    } finally {
      setBusyId("");
    }
  }

  async function deleteDraft(draft) {
    if (!window.confirm("Cancel this email draft? It will not be sent.")) return;
    setBusyId(draft.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/email-drafts/" + encodeURIComponent(draft.id), { method: "DELETE" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not cancel draft.");
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
      if (editingId === draft.id) setEditingId("");
      setNotice("Email draft cancelled.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel draft.");
    } finally {
      setBusyId("");
    }
  }

  const activeDrafts = drafts.filter((draft) => !["CANCELLED"].includes(draft.status));

  return (
    <section className="mb-5 rounded-2xl border border-[#E3E7ED] bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[#233044]">
            <MailPlus size={18} className="text-[#FA8500]" /> Outbound drafts
          </h2>
          <p className="mt-1 text-xs text-[#7B8492]">
            Compose, edit, approve, and send. Every email requires a separate approval and Send action.
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen((value) => !value)} className="rounded-lg bg-[#FA8500] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#E87700]">
          {createOpen ? "Close composer" : "Compose email"}
        </button>
      </div>

      {error && <p role="alert" className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><AlertCircle size={14} />{error}</p>}
      {notice && <p role="status" className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900"><CheckCircle2 size={14} />{notice}</p>}

      {createOpen && (
        <form onSubmit={createDraft} className="mb-5 space-y-3 rounded-xl border border-[#E8EBF0] bg-[#FAFBFC] p-4">
          <h3 className="text-sm font-semibold text-[#344054]">New email</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-[#596579]">To
              <input required type="email" maxLength={254} value={newDraft.toEmail} onChange={(event) => setNewDraft((current) => ({ ...current, toEmail: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#DDE2E8] bg-white px-3 py-2.5 text-sm font-normal" />
            </label>
            <label className="block text-xs font-semibold text-[#596579]">Cc (optional)
              <input type="email" maxLength={254} value={newDraft.ccEmail} onChange={(event) => setNewDraft((current) => ({ ...current, ccEmail: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#DDE2E8] bg-white px-3 py-2.5 text-sm font-normal" />
            </label>
          </div>
          <label className="block text-xs font-semibold text-[#596579]">Subject
            <input required maxLength={250} value={newDraft.subject} onChange={(event) => setNewDraft((current) => ({ ...current, subject: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#DDE2E8] bg-white px-3 py-2.5 text-sm font-normal" />
          </label>
          <label className="block text-xs font-semibold text-[#596579]">Message
            <textarea required rows={6} maxLength={30000} value={newDraft.body} onChange={(event) => setNewDraft((current) => ({ ...current, body: event.target.value }))} className="mt-1 w-full resize-y rounded-lg border border-[#DDE2E8] bg-white px-3 py-3 text-sm font-normal leading-6" />
          </label>
          <button type="submit" disabled={creating} className="inline-flex items-center gap-2 rounded-lg bg-[#FA8500] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            <Save size={13} /> {creating ? "Creating…" : "Save as draft"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="py-5 text-xs text-[#7B8492]">Loading drafts…</p>
      ) : activeDrafts.length ? (
        <div className="space-y-3">
          {activeDrafts.map((draft) => (
            <article key={draft.id} className="rounded-xl border border-[#E8EBF0] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold text-[#344054]">{draft.subject || "(no subject)"}</h3>
                  <p className="mt-1 text-xs text-[#7B8492]">To: {draft.toEmail}{draft.ccEmail ? " · Cc: " + draft.ccEmail : ""}</p>
                </div>
                <span className="rounded-full bg-[#F3F5F7] px-2.5 py-1 text-[10px] font-semibold text-[#596579]">{draft.status.replaceAll("_", " ")}</span>
              </div>

              {draft.lastError && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{draft.lastError}</p>}

              {editingId === draft.id ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-[#596579]">To
                      <input type="email" required maxLength={254} value={editForm.toEmail} onChange={(event) => setEditForm((current) => ({ ...current, toEmail: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#DDE2E8] bg-white px-3 py-2.5 text-sm font-normal" />
                    </label>
                    <label className="block text-xs font-semibold text-[#596579]">Cc
                      <input type="email" maxLength={254} value={editForm.ccEmail} onChange={(event) => setEditForm((current) => ({ ...current, ccEmail: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#DDE2E8] bg-white px-3 py-2.5 text-sm font-normal" />
                    </label>
                  </div>
                  <label className="block text-xs font-semibold text-[#596579]">Subject
                    <input required maxLength={250} value={editForm.subject} onChange={(event) => setEditForm((current) => ({ ...current, subject: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#DDE2E8] bg-white px-3 py-2.5 text-sm font-normal" />
                  </label>
                  <label className="block text-xs font-semibold text-[#596579]">Message
                    <textarea required rows={7} maxLength={30000} value={editForm.body} onChange={(event) => setEditForm((current) => ({ ...current, body: event.target.value }))} className="mt-1 w-full resize-y rounded-lg border border-[#DDE2E8] bg-white px-3 py-3 text-sm font-normal leading-6" />
                  </label>
                </div>
              ) : (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#596579]">{draft.body}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {["DRAFT", "FAILED"].includes(draft.status) && (
                  editingId === draft.id ? (
                    <>
                      <button type="button" disabled={busyId === draft.id} onClick={() => void saveDraft(draft)} className="inline-flex items-center gap-2 rounded-lg bg-[#FA8500] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save size={13} /> Save changes</button>
                      <button type="button" disabled={busyId === draft.id} onClick={() => setEditingId("")} className="rounded-lg border border-[#DDE2E8] px-3 py-2 text-xs font-semibold text-[#596579] disabled:opacity-50"><X size={13} /></button>
                    </>
                  ) : (
                    <>
                      <button type="button" disabled={Boolean(busyId)} onClick={() => beginEdit(draft)} className="inline-flex items-center gap-2 rounded-lg border border-[#DDE2E8] px-3 py-2 text-xs font-semibold text-[#344054] disabled:opacity-50"><Pencil size={13} /> Edit</button>
                      {draft.status === "DRAFT" && <button type="button" disabled={Boolean(busyId)} onClick={() => void approveDraft(draft)} className="rounded-lg bg-[#FA8500] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve</button>}
                    </>
                  )
                )}
                {draft.status === "APPROVED" && (
                  <button type="button" disabled={Boolean(busyId)} onClick={() => void sendDraft(draft)} className="inline-flex items-center gap-2 rounded-lg bg-[#FA8500] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Send size={13} /> Send email</button>
                )}
                {["DRAFT", "APPROVED", "FAILED"].includes(draft.status) && (
                  <button type="button" disabled={Boolean(busyId)} onClick={() => void deleteDraft(draft)} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"><Trash2 size={13} /> Cancel draft</button>
                )}
              </div>
              {draft.status === "DRAFT" && <p className="mt-3 text-[11px] leading-5 text-[#7B8492]">Approve this exact version before the separate Send action becomes available.</p>}
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[#DDE2E8] px-4 py-8 text-center text-xs text-[#7B8492]">
          No outbound drafts yet. Use Compose email to create one.
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => void load()} disabled={loading || Boolean(busyId)} className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold text-[#7B8492] hover:bg-[#F3F5F7] disabled:opacity-50"><RefreshCw size={12} /> Refresh drafts</button>
      </div>
    </section>
  );
}
