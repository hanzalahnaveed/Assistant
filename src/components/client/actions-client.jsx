"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, Clock3, LoaderCircle, Plus, ShieldCheck, X } from "lucide-react";
const statusLabels = {
    PENDING: "Needs your approval", APPROVED: "Approved", RUNNING: "In progress",
    SUCCEEDED: "Completed", FAILED: "Failed", CANCELLED: "Rejected"
};
export default function ActionsClient() {
    const [actions, setActions] = useState([]);
    const [rules, setRules] = useState([]);
    const [defaultApprovalMode, setDefaultApprovalMode] = useState("CONFIRM");
    const [ruleMode, setRuleMode] = useState("CONFIRM");
    const [savingRule, setSavingRule] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState("MEDIUM");
    const [dueAt, setDueAt] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const loadActions = useCallback(async () => {
        try {
            const [response, rulesResponse] = await Promise.all([
                fetch("/api/actions", { cache: "no-store" }),
                fetch("/api/automation-rules", { cache: "no-store" })
            ]);
            const [body, rulesBody] = await Promise.all([response.json(), rulesResponse.json()]);
            if (!response.ok)
                throw new Error(body.error || "Could not load action history.");
            if (!rulesResponse.ok)
                throw new Error(rulesBody.error || "Could not load automation rules.");
            setActions(body.actions);
            setRules(rulesBody.rules);
            setDefaultApprovalMode(rulesBody.defaultApprovalMode);
            const activeRule = rulesBody.rules.find((rule) => rule.actionType === "CREATE_TASK" && rule.enabled);
            setRuleMode(activeRule?.mode ?? rulesBody.defaultApprovalMode);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not load action history.");
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void loadActions(); }, [loadActions]);
    async function propose(event) {
        event.preventDefault();
        if (!title.trim() || saving)
            return;
        setSaving(true);
        setError("");
        setNotice("");
        try {
            const response = await fetch("/api/actions", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    actionType: "CREATE_TASK",
                    idempotencyKey: `create-task-${crypto.randomUUID()}`,
                    input: { title: title.trim(), description: description.trim() || null, priority, dueAt: dueAt ? new Date(dueAt).toISOString() : null }
                })
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || "Could not propose this action.");
            setTitle("");
            setDescription("");
            setPriority("MEDIUM");
            setDueAt("");
            setNotice(body.action.status === "SUCCEEDED" ? "Task created using your AUTO approval setting." : "Proposal saved. Review it below to approve or reject.");
            await loadActions();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not propose this action.");
        }
        finally {
            setSaving(false);
        }
    }
    async function saveRule(event) {
        event.preventDefault();
        setSavingRule(true);
        setError("");
        setNotice("");
        try {
            const activeRule = rules.find(rule => rule.actionType === "CREATE_TASK" && rule.enabled);
            const response = await fetch(activeRule ? `/api/automation-rules/${activeRule.id}` : "/api/automation-rules", {
                method: activeRule ? "PATCH" : "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(activeRule ? { mode: ruleMode, enabled: true } : { actionType: "CREATE_TASK", name: "Task creation", mode: ruleMode, enabled: true })
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || "Could not save this automation rule.");
            setNotice("Task automation rule saved. New proposals will use this rule.");
            await loadActions();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not save this automation rule.");
        }
        finally {
            setSavingRule(false);
        }
    }
    async function removeRule(id) {
        setSavingRule(true);
        setError("");
        setNotice("");
        try {
            const response = await fetch(`/api/automation-rules/${id}`, { method: "DELETE" });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || "Could not remove this rule.");
            setNotice("Automation rule removed. Task proposals will use your default approval setting.");
            await loadActions();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not remove this rule.");
        }
        finally {
            setSavingRule(false);
        }
    }
    async function decide(id, decision) {
        setBusyId(id);
        setError("");
        setNotice("");
        try {
            const response = await fetch(`/api/actions/${id}`, {
                method: "PATCH", headers: { "content-type": "application/json" },
                body: JSON.stringify({ decision })
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || "Could not update this action.");
            setNotice(decision === "APPROVE" ? "Approved. The task was created and the result recorded." : "Proposal rejected. No task was created.");
            await loadActions();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not update this action.");
        }
        finally {
            setBusyId("");
        }
    }
    const pending = actions.filter(action => action.status === "PENDING");
    const history = actions.filter(action => action.status !== "PENDING");
    return _jsxs("main", { className: "min-h-screen bg-[#f7f8f5] text-[#18211f]", children: [_jsxs("div", { className: "mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-7", children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[.16em] text-[#176b52]", children: "Controlled autonomy" }), _jsx("h1", { className: "mt-2 text-3xl font-semibold tracking-tight", children: "Action center" }), _jsx("p", { className: "mt-2 max-w-2xl text-sm leading-6 text-[#69756e]", children: "Review assistant-proposed work, approve safe actions, and keep a clear record of what happened." })] }), _jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-[#dce7df] bg-white px-3 py-2 text-xs text-[#526159]", children: [_jsx(ShieldCheck, { size: 16, className: "text-[#176b52]" }), " Your approval settings apply"] })] }), error && _jsx("div", { role: "alert", className: "rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800", children: error }), notice && _jsx("div", { role: "status", className: "rounded-xl border border-[#cde6d7] bg-[#eff8f1] px-4 py-3 text-sm text-[#176b52]", children: notice }), _jsxs("div", { className: "grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]", children: [_jsxs("section", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6", children: [_jsxs("div", { className: "mb-5 flex items-center gap-3", children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7f3ed] text-[#176b52]", children: _jsx(Plus, { size: 18 }) }), _jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: "Propose a task" }), _jsx("p", { className: "mt-1 text-xs text-[#7a857e]", children: "The first executable action type is task creation." })] })] }), _jsxs("form", { onSubmit: propose, className: "space-y-4", children: [_jsxs("label", { className: "block text-xs font-semibold text-[#526159]", children: ["Task title", _jsx("input", { required: true, maxLength: 200, value: title, onChange: event => setTitle(event.target.value), placeholder: "e.g. Prepare the weekly leadership update", className: "mt-2 w-full rounded-xl border border-[#dce4dd] bg-white px-3.5 py-3 text-sm font-normal text-[#18211f] outline-none focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/10" })] }), _jsxs("label", { className: "block text-xs font-semibold text-[#526159]", children: ["Details ", _jsx("span", { className: "font-normal text-[#89938d]", children: "(optional)" }), _jsx("textarea", { maxLength: 5000, value: description, onChange: event => setDescription(event.target.value), rows: 3, placeholder: "Context, expected outcome, or next steps", className: "mt-2 w-full resize-y rounded-xl border border-[#dce4dd] px-3.5 py-3 text-sm font-normal text-[#18211f] outline-none focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/10" })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsxs("label", { className: "block text-xs font-semibold text-[#526159]", children: ["Priority", _jsxs("select", { value: priority, onChange: event => setPriority(event.target.value), className: "mt-2 w-full rounded-xl border border-[#dce4dd] bg-white px-3 py-3 text-sm font-normal", children: [_jsx("option", { value: "LOW", children: "Low" }), _jsx("option", { value: "MEDIUM", children: "Medium" }), _jsx("option", { value: "HIGH", children: "High" }), _jsx("option", { value: "URGENT", children: "Urgent" })] })] }), _jsxs("label", { className: "block text-xs font-semibold text-[#526159]", children: ["Due date ", _jsx("span", { className: "font-normal text-[#89938d]", children: "(optional)" }), _jsx("input", { type: "datetime-local", value: dueAt, onChange: event => setDueAt(event.target.value), className: "mt-2 w-full rounded-xl border border-[#dce4dd] bg-white px-3 py-3 text-sm font-normal" })] })] }), _jsxs("button", { disabled: saving || !title.trim(), className: "flex w-full items-center justify-center gap-2 rounded-xl bg-[#176b52] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#125840] disabled:cursor-not-allowed disabled:opacity-60", children: [saving ? _jsx(LoaderCircle, { size: 16, className: "animate-spin" }) : _jsx(Plus, { size: 16 }), " Propose action"] }), _jsx("p", { className: "text-[11px] leading-5 text-[#89938d]", children: "With CONFIRM mode, nothing is created until you approve. AUTO mode can create this local task immediately. BLOCK mode prevents new proposals. No email or calendar changes are performed." })] })] }), _jsxs("section", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6", children: [_jsxs("div", { className: "mb-5 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: "Awaiting your decision" }), _jsx("p", { className: "mt-1 text-xs text-[#7a857e]", children: "Only pending proposals appear here." })] }), _jsxs("span", { className: "rounded-full bg-[#fff3dc] px-2.5 py-1 text-xs font-semibold text-[#94651a]", children: [pending.length, " pending"] })] }), loading ? _jsxs("div", { className: "flex items-center gap-2 py-8 text-sm text-[#7a857e]", children: [_jsx(LoaderCircle, { size: 16, className: "animate-spin" }), " Loading actions\u2026"] }) : pending.length === 0 ? _jsxs("div", { className: "rounded-xl border border-dashed border-[#dce4dd] px-4 py-10 text-center", children: [_jsx(CheckCircle2, { size: 24, className: "mx-auto text-[#8a9b90]" }), _jsx("p", { className: "mt-3 text-sm font-medium", children: "You\u2019re all caught up" }), _jsx("p", { className: "mt-1 text-xs text-[#87918b]", children: "New proposals that need approval will appear here." })] }) : _jsx("div", { className: "space-y-3", children: pending.map(action => _jsxs("article", { className: "rounded-xl border border-[#e6eae5] p-4", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold", children: action.input.title || "Proposed task" }), _jsxs("p", { className: "mt-1 text-xs text-[#7a857e]", children: [action.input.priority || "MEDIUM", " priority", action.input.dueAt ? ` · Due ${new Date(action.input.dueAt).toLocaleString()}` : ""] })] }), _jsx("span", { className: "rounded-full bg-[#fff3dc] px-2 py-1 text-[10px] font-semibold text-[#94651a]", children: "Approval required" })] }), action.input.description && _jsx("p", { className: "mt-3 whitespace-pre-wrap text-sm leading-6 text-[#526159]", children: action.input.description }), _jsxs("p", { className: "mt-3 text-[10px] text-[#9aa39d]", children: ["Proposed ", new Date(action.createdAt).toLocaleString()] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsxs("button", { disabled: busyId === action.id, onClick: () => void decide(action.id, "APPROVE"), className: "flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#176b52] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-60", children: [busyId === action.id ? _jsx(LoaderCircle, { size: 14, className: "animate-spin" }) : _jsx(Check, { size: 14 }), " Approve & create"] }), _jsxs("button", { disabled: busyId === action.id, onClick: () => void decide(action.id, "REJECT"), className: "flex items-center justify-center gap-2 rounded-lg border border-[#dce4dd] px-3 py-2.5 text-xs font-semibold text-[#526159] disabled:opacity-60", children: [_jsx(X, { size: 14 }), " Reject"] })] })] }, action.id)) })] })] }), _jsxs("section", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6", children: [_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx(ShieldCheck, { size: 17, className: "text-[#176b52]" }), _jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: "Task automation rule" }), _jsx("p", { className: "mt-1 text-xs text-[#7a857e]", children: "Choose how the assistant handles future task-creation proposals." })] })] }), _jsxs("form", { onSubmit: saveRule, className: "flex flex-col gap-3 sm:flex-row sm:items-end", children: [_jsxs("label", { className: "block flex-1 text-xs font-semibold text-[#526159]", children: ["Approval behavior", _jsxs("select", { value: ruleMode, onChange: event => setRuleMode(event.target.value), className: "mt-2 w-full rounded-xl border border-[#dce4dd] bg-white px-3 py-3 text-sm font-normal", children: [_jsx("option", { value: "CONFIRM", children: "Confirm \u2014 require my approval" }), _jsx("option", { value: "AUTO", children: "Auto \u2014 create tasks immediately" }), _jsx("option", { value: "BLOCK", children: "Block \u2014 do not accept proposals" })] })] }), _jsxs("button", { disabled: savingRule, className: "flex items-center justify-center gap-2 rounded-xl bg-[#176b52] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60", children: [savingRule ? _jsx(LoaderCircle, { size: 15, className: "animate-spin" }) : _jsx(ShieldCheck, { size: 15 }), " Save rule"] })] }), _jsxs("div", { className: "mt-4 flex flex-col gap-2 rounded-xl bg-[#f7f8f5] p-3 text-xs text-[#69756e] sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("span", { children: ["Default approval setting: ", _jsx("strong", { children: defaultApprovalMode })] }), rules.some(rule => rule.actionType === "CREATE_TASK" && rule.enabled) ? _jsx("button", { type: "button", disabled: savingRule, onClick: () => void removeRule(rules.find(rule => rule.actionType === "CREATE_TASK" && rule.enabled).id), className: "w-fit font-semibold text-[#176b52] underline underline-offset-2 disabled:opacity-60", children: "Remove rule and use default" }) : _jsx("span", { children: "Using default setting" })] })] }), _jsxs("section", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6", children: [_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx(Clock3, { size: 17, className: "text-[#176b52]" }), _jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: "Action history" }), _jsx("p", { className: "mt-1 text-xs text-[#7a857e]", children: "A record of completed, rejected, and other past actions." })] })] }), history.length === 0 ? _jsx("p", { className: "py-6 text-sm text-[#87918b]", children: "No previous actions yet." }) : _jsx("div", { className: "divide-y divide-[#edf0ec]", children: history.map(action => _jsxs("div", { className: "flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: action.input.title || action.result.title || "Task action" }), _jsx("p", { className: "mt-1 text-xs text-[#87918b]", children: new Date(action.createdAt).toLocaleString() })] }), _jsxs("span", { className: `w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${action.status === "SUCCEEDED" ? "bg-[#e7f3ed] text-[#176b52]" : action.status === "FAILED" ? "bg-rose-50 text-rose-700" : "bg-[#f1f3f0] text-[#68746d]"}`, children: [statusLabels[action.status], action.errorCode ? ` · ${action.errorCode}` : ""] })] }, action.id)) })] })] })] });
}
