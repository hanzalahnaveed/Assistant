"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, MailPlus, RefreshCw, Save, Send, ShieldCheck, Sparkles } from "lucide-react";
import WorkspaceHeader from "@/components/workspace-header";
const empty = { toEmail: "", ccEmail: "", subject: "", body: "", goal: "" };
const labels = { DRAFT: "Draft", APPROVED: "Approved", SENDING: "Sending…", SENT: "Sent", FAILED: "Send failed", SEND_UNCERTAIN: "Outcome uncertain", CANCELLED: "Cancelled" };
export default function EmailClient() {
    const [drafts, setDrafts] = useState([]), [id, setId] = useState(""), [form, setForm] = useState(empty);
    const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
    const load = useCallback(async () => { try {
        const r = await fetch("/api/email-drafts", { cache: "no-store" }), d = await r.json();
        if (!r.ok)
            throw Error(d.error || "Could not load drafts.");
        setDrafts(d.drafts);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Could not load drafts.");
    }
    finally {
        setLoading(false);
    } }, []);
    useEffect(() => { void load(); }, [load]);
    function choose(d) { setId(d.id); setForm({ toEmail: d.toEmail, ccEmail: d.ccEmail || "", subject: d.subject, body: d.body, goal: d.goal || "" }); setError(""); setNotice(""); }
    function fresh() { setId(""); setForm(empty); setError(""); setNotice(""); }
    function change(k, v) { setForm(f => ({ ...f, [k]: v })); }
    async function save(e, generate = false) {
        e.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const creating = !id || generate;
            const r = await fetch(creating ? "/api/email-drafts" : "/api/email-drafts/" + id, { method: creating ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, generate }) });
            const d = await r.json();
            if (!r.ok)
                throw Error(d.error || "Could not save draft.");
            choose(d.draft);
            setNotice(generate ? "AI draft created. Review all details before approval." : "Draft saved.");
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not save draft.");
        }
        finally {
            setBusy(false);
        }
    }
    async function act(action) {
        if (!id)
            return;
        if (action === "SEND" && !window.confirm("Send this exact approved email to " + form.toEmail + "?"))
            return;
        if (action === "CANCEL" && !window.confirm("Cancel this draft?"))
            return;
        if (action === "CONFIRM_SENT" && !window.confirm("Confirm that you found this message in Gmail Sent?"))
            return;
        if (action === "CONFIRM_NOT_SENT" && !window.confirm("Confirm you checked Gmail Sent and this message is NOT there? It will be eligible for a new, separately confirmed send."))
            return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            if (action === "APPROVE") {
                const edit = await fetch("/api/email-drafts/" + id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
                const saved = await edit.json();
                if (!edit.ok)
                    throw Error(saved.error || "Save your draft before approving.");
            }
            const r = await fetch("/api/email-drafts/" + id, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }), d = await r.json();
            if (!r.ok)
                throw Error(d.error || "Email action failed.");
            if (d.draft)
                choose(d.draft);
            setNotice(action === "APPROVE" ? "Draft approved. Sending still requires a separate confirmation." : action === "SEND" ? "Email sent successfully." : action === "CANCEL" ? "Draft cancelled." : action === "CONFIRM_SENT" ? "Marked sent based on your Gmail verification." : "Marked not sent after your Gmail verification. You must confirm sending again.");
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Email action failed.");
            await load();
        }
        finally {
            setBusy(false);
        }
    }
    const selected = drafts.find(d => d.id === id), editable = !selected || selected.status === "DRAFT" || selected.status === "FAILED";
    const sent = drafts.filter(d => d.status === "SENT").length, pending = drafts.filter(d => d.status === "DRAFT" || d.status === "APPROVED").length;
    return _jsxs("main", { className: "min-h-screen bg-[#f7f8f5] text-[#18211f]", children: [_jsx(WorkspaceHeader, {}), _jsxs("div", { className: "mx-auto max-w-7xl px-4 py-7 sm:px-7", children: [_jsxs("div", { className: "mb-7 flex flex-wrap items-end justify-between gap-4", children: [_jsxs("div", { children: [_jsxs("div", { className: "mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[#176b52]", children: [_jsx(MailPlus, { size: 15 }), " Outreach workspace"] }), _jsx("h1", { className: "text-3xl font-semibold", children: "Email & cold outreach" }), _jsx("p", { className: "mt-2 max-w-2xl text-sm leading-6 text-[#76817c]", children: "Draft and review outreach, approve the exact message, then confirm sending separately. Nothing sends automatically." })] }), _jsxs("button", { onClick: fresh, className: "inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-3 text-sm font-semibold text-white", children: [_jsx(MailPlus, { size: 16 }), " New email"] })] }), _jsxs("div", { className: "mb-5 grid gap-3 sm:grid-cols-3", children: [_jsx(Stat, { label: "Saved drafts", value: drafts.filter(d => d.status === "DRAFT").length }), _jsx(Stat, { label: "Awaiting your action", value: pending }), _jsx(Stat, { label: "Sent by you", value: sent })] }), error && _jsxs("div", { role: "alert", className: "mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950", children: [_jsx(AlertCircle, { size: 17 }), error] }), notice && _jsxs("div", { role: "status", className: "mb-4 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900", children: [_jsx(CheckCircle2, { size: 17 }), notice] }), _jsxs("div", { className: "grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]", children: [_jsxs("aside", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-4", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsx("h2", { className: "text-sm font-semibold", children: "Your emails" }), _jsx("button", { "aria-label": "Refresh drafts", onClick: () => void load(), className: "rounded-lg p-2 text-[#76817c] hover:bg-[#f4f7f3]", children: _jsx(RefreshCw, { size: 14 }) })] }), loading ? _jsxs("div", { className: "flex items-center gap-2 py-8 text-sm text-[#76817c]", children: [_jsx(LoaderCircle, { size: 16, className: "animate-spin" }), "Loading\u2026"] }) : drafts.length ? _jsx("div", { className: "space-y-1", children: drafts.map(d => _jsxs("button", { onClick: () => choose(d), className: "w-full rounded-xl p-3 text-left " + (id === d.id ? "bg-[#e8f3ec]" : "hover:bg-[#f7f9f6]"), children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsx("span", { className: "truncate text-xs font-semibold", children: d.subject || "(No subject)" }), _jsx("span", { className: "shrink-0 text-[9px] text-[#68756d]", children: labels[d.status] })] }), _jsx("div", { className: "mt-1 truncate text-[11px] text-[#76817c]", children: d.toEmail }), _jsx("p", { className: "mt-2 line-clamp-2 text-[11px] leading-5 text-[#8b958e]", children: d.body || "No message body yet." })] }, d.id)) }) : _jsx("p", { className: "py-8 text-center text-xs leading-5 text-[#76817c]", children: "No emails yet. Create your first outreach draft." })] }), _jsxs("section", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-7", children: [_jsxs("div", { className: "mb-5 flex items-center gap-3 border-b border-[#edf0ec] pb-5", children: [_jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ec] text-[#176b52]", children: _jsx(Sparkles, { size: 18 }) }), _jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: selected ? "Review email draft" : "Compose an email" }), _jsx("p", { className: "mt-1 text-xs text-[#76817c]", children: selected ? "Created " + new Date(selected.createdAt).toLocaleString() : "Describe your goal and let AI prepare a starting point." })] })] }), selected?.status === "SEND_UNCERTAIN" && _jsxs("div", { className: "mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-6 text-amber-950", children: [_jsx("strong", { children: "Check Gmail before any retry." }), " The app locked this draft because the send outcome could not be confirmed. If you find it in Sent, confirm that below. If you verify it is absent, you can explicitly unlock it for a separately confirmed retry."] }), selected?.lastError && selected.status !== "SEND_UNCERTAIN" && _jsx("p", { className: "mb-4 rounded-xl bg-[#f8faf7] p-3 text-xs leading-5 text-[#68756d]", children: selected.lastError }), _jsxs("form", { onSubmit: e => void save(e), className: "space-y-4", children: [_jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Recipient email", children: _jsx("input", { type: "email", required: true, disabled: !editable || busy, value: form.toEmail, onChange: e => change("toEmail", e.target.value), placeholder: "person@company.com", className: "w-full border px-3.5 py-3 text-sm disabled:bg-[#f5f7f4]" }) }), _jsx(Field, { label: "CC (optional)", children: _jsx("input", { type: "email", disabled: !editable || busy, value: form.ccEmail, onChange: e => change("ccEmail", e.target.value), placeholder: "colleague@company.com", className: "w-full border px-3.5 py-3 text-sm disabled:bg-[#f5f7f4]" }) })] }), _jsx(Field, { label: "Outreach goal", children: _jsx("textarea", { rows: 2, maxLength: 4000, disabled: !editable || busy, value: form.goal, onChange: e => change("goal", e.target.value), placeholder: "Introduce your service and ask for a 15-minute call\u2026", className: "w-full resize-y border px-3.5 py-3 text-sm disabled:bg-[#f5f7f4]" }) }), _jsx(Field, { label: "Subject", children: _jsx("input", { required: true, maxLength: 250, disabled: !editable || busy, value: form.subject, onChange: e => change("subject", e.target.value), placeholder: "A concise, relevant subject", className: "w-full border px-3.5 py-3 text-sm disabled:bg-[#f5f7f4]" }) }), _jsx(Field, { label: "Message", children: _jsx("textarea", { required: true, rows: 10, maxLength: 30000, disabled: !editable || busy, value: form.body, onChange: e => change("body", e.target.value), placeholder: "Write your message or generate a starting draft\u2026", className: "w-full resize-y border px-3.5 py-3 text-sm leading-6 disabled:bg-[#f5f7f4]" }) }), _jsxs("div", { className: "flex flex-wrap gap-2 border-t border-[#edf0ec] pt-5", children: [editable && _jsxs(_Fragment, { children: [_jsxs("button", { type: "submit", disabled: busy, className: "inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] px-4 py-2.5 text-sm font-semibold hover:bg-[#f7f9f6] disabled:opacity-50", children: [_jsx(Save, { size: 15 }), "Save draft"] }), _jsxs("button", { type: "button", disabled: busy || !form.toEmail.trim() || !form.goal.trim(), onClick: e => { e.preventDefault(); void save(e, true); }, className: "inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50", children: [_jsx(Sparkles, { size: 15 }), busy ? "Working…" : "Generate with AI"] })] }), selected?.status === "DRAFT" && _jsxs("button", { type: "button", disabled: busy || !form.toEmail || !form.subject.trim() || !form.body.trim(), onClick: () => void act("APPROVE"), className: "inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50", children: [_jsx(ShieldCheck, { size: 15 }), "Approve exact draft"] }), selected?.status === "APPROVED" && _jsxs("button", { type: "button", disabled: busy, onClick: () => void act("SEND"), className: "inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50", children: [_jsx(Send, { size: 15 }), "Confirm & send"] }), selected?.status === "SEND_UNCERTAIN" && _jsxs(_Fragment, { children: [_jsx("button", { type: "button", disabled: busy, onClick: () => void act("CONFIRM_SENT"), className: "rounded-xl border border-[#dfe6dd] px-4 py-2.5 text-sm font-semibold", children: "I found it in Sent" }), _jsx("button", { type: "button", disabled: busy, onClick: () => void act("CONFIRM_NOT_SENT"), className: "rounded-xl bg-[#176b52] px-4 py-2.5 text-sm font-semibold text-white", children: "Verified absent \u2014 unlock retry" })] }), selected && ["DRAFT", "APPROVED", "FAILED"].includes(selected.status) && _jsx("button", { type: "button", disabled: busy, onClick: () => void act("CANCEL"), className: "rounded-xl border border-[#e2e8e0] px-4 py-2.5 text-sm font-medium text-[#68756d] disabled:opacity-50", children: "Cancel draft" })] })] }), _jsx("p", { className: "mt-5 text-[11px] leading-5 text-[#87918b]", children: "AI output is not verified fact. Review recipient, claims, links, tone, and subject. Approval and sending are separate actions." })] })] })] })] });
}
function Field({ label, children }) { return _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-2 block text-xs font-semibold text-[#46544b]", children: label }), children] }); }
function Stat({ label, value }) { return _jsxs("div", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-4", children: [_jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[.1em] text-[#87918b]", children: label }), _jsx("p", { className: "mt-2 text-2xl font-semibold", children: value })] }); }
