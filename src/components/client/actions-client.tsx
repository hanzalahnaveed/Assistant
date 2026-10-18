"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import WorkspaceHeader from "@/components/workspace-header";
import { Check, CheckCircle2, Clock3, LoaderCircle, Plus, ShieldCheck, X } from "lucide-react";

type ActionItem = {
  id: string; actionType: string; status: "PENDING" | "APPROVED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  input: { title?: string; description?: string | null; priority?: string; dueAt?: string | null };
  result: { title?: string; taskId?: string; reason?: string };
  requiresApproval: boolean; createdAt: string; completedAt: string | null; errorCode: string | null;
};
type AutomationRule = { id: string; actionType: string; name: string; mode: "AUTO" | "CONFIRM" | "BLOCK"; enabled: boolean; updatedAt: string };

const statusLabels: Record<ActionItem["status"], string> = {
  PENDING: "Needs your approval", APPROVED: "Approved", RUNNING: "In progress",
  SUCCEEDED: "Completed", FAILED: "Failed", CANCELLED: "Rejected"
};

export default function ActionsClient() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [defaultApprovalMode, setDefaultApprovalMode] = useState<"AUTO" | "CONFIRM" | "BLOCK">("CONFIRM");
  const [ruleMode, setRuleMode] = useState<"AUTO" | "CONFIRM" | "BLOCK">("CONFIRM");
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
      if (!response.ok) throw new Error(body.error || "Could not load action history.");
      if (!rulesResponse.ok) throw new Error(rulesBody.error || "Could not load automation rules.");
      setActions(body.actions);
      setRules(rulesBody.rules);
      setDefaultApprovalMode(rulesBody.defaultApprovalMode);
      const activeRule = rulesBody.rules.find((rule: AutomationRule) => rule.actionType === "CREATE_TASK" && rule.enabled);
      setRuleMode(activeRule?.mode ?? rulesBody.defaultApprovalMode);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load action history."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadActions(); }, [loadActions]);

  async function propose(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true); setError(""); setNotice("");
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
      if (!response.ok) throw new Error(body.error || "Could not propose this action.");
      setTitle(""); setDescription(""); setPriority("MEDIUM"); setDueAt("");
      setNotice(body.action.status === "SUCCEEDED" ? "Task created using your AUTO approval setting." : "Proposal saved. Review it below to approve or reject.");
      await loadActions();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not propose this action."); }
    finally { setSaving(false); }
  }

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    setSavingRule(true); setError(""); setNotice("");
    try {
      const activeRule = rules.find(rule => rule.actionType === "CREATE_TASK" && rule.enabled);
      const response = await fetch(activeRule ? `/api/automation-rules/${activeRule.id}` : "/api/automation-rules", {
        method: activeRule ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(activeRule ? { mode: ruleMode, enabled: true } : { actionType: "CREATE_TASK", name: "Task creation", mode: ruleMode, enabled: true })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save this automation rule.");
      setNotice("Task automation rule saved. New proposals will use this rule.");
      await loadActions();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this automation rule."); }
    finally { setSavingRule(false); }
  }

  async function removeRule(id: string) {
    setSavingRule(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/automation-rules/${id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not remove this rule.");
      setNotice("Automation rule removed. Task proposals will use your default approval setting.");
      await loadActions();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove this rule."); }
    finally { setSavingRule(false); }
  }

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setBusyId(id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/actions/${id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update this action.");
      setNotice(decision === "APPROVE" ? "Approved. The task was created and the result recorded." : "Proposal rejected. No task was created.");
      await loadActions();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update this action."); }
    finally { setBusyId(""); }
  }

  const pending = actions.filter(action => action.status === "PENDING");
  const history = actions.filter(action => action.status !== "PENDING");

  return <main className="min-h-screen bg-[#f7f8f5] text-[#18211f]">
    <WorkspaceHeader />
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#176b52]">Controlled autonomy</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Action center</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#69756e]">Review assistant-proposed work, approve safe actions, and keep a clear record of what happened.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-[#dce7df] bg-white px-3 py-2 text-xs text-[#526159]"><ShieldCheck size={16} className="text-[#176b52]"/> Your approval settings apply</div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-[#cde6d7] bg-[#eff8f1] px-4 py-3 text-sm text-[#176b52]">{notice}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7f3ed] text-[#176b52]"><Plus size={18}/></span><div><h2 className="font-semibold">Propose a task</h2><p className="mt-1 text-xs text-[#7a857e]">The first executable action type is task creation.</p></div></div>
          <form onSubmit={propose} className="space-y-4">
            <label className="block text-xs font-semibold text-[#526159]">Task title<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Prepare the weekly leadership update" className="mt-2 w-full rounded-xl border border-[#dce4dd] bg-white px-3.5 py-3 text-sm font-normal text-[#18211f] outline-none focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/10"/></label>
            <label className="block text-xs font-semibold text-[#526159]">Details <span className="font-normal text-[#89938d]">(optional)</span><textarea maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} rows={3} placeholder="Context, expected outcome, or next steps" className="mt-2 w-full resize-y rounded-xl border border-[#dce4dd] px-3.5 py-3 text-sm font-normal text-[#18211f] outline-none focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/10"/></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-[#526159]">Priority<select value={priority} onChange={event => setPriority(event.target.value)} className="mt-2 w-full rounded-xl border border-[#dce4dd] bg-white px-3 py-3 text-sm font-normal"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
              <label className="block text-xs font-semibold text-[#526159]">Due date <span className="font-normal text-[#89938d]">(optional)</span><input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} className="mt-2 w-full rounded-xl border border-[#dce4dd] bg-white px-3 py-3 text-sm font-normal"/></label>
            </div>
            <button disabled={saving || !title.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#176b52] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#125840] disabled:cursor-not-allowed disabled:opacity-60">{saving ? <LoaderCircle size={16} className="animate-spin"/> : <Plus size={16}/>} Propose action</button>
            <p className="text-[11px] leading-5 text-[#89938d]">With CONFIRM mode, nothing is created until you approve. AUTO mode can create this local task immediately. BLOCK mode prevents new proposals. No email or calendar changes are performed.</p>
          </form>
        </section>

        <section className="rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Awaiting your decision</h2><p className="mt-1 text-xs text-[#7a857e]">Only pending proposals appear here.</p></div><span className="rounded-full bg-[#fff3dc] px-2.5 py-1 text-xs font-semibold text-[#94651a]">{pending.length} pending</span></div>
          {loading ? <div className="flex items-center gap-2 py-8 text-sm text-[#7a857e]"><LoaderCircle size={16} className="animate-spin"/> Loading actions…</div> : pending.length === 0 ? <div className="rounded-xl border border-dashed border-[#dce4dd] px-4 py-10 text-center"><CheckCircle2 size={24} className="mx-auto text-[#8a9b90]"/><p className="mt-3 text-sm font-medium">You’re all caught up</p><p className="mt-1 text-xs text-[#87918b]">New proposals that need approval will appear here.</p></div> : <div className="space-y-3">{pending.map(action => <article key={action.id} className="rounded-xl border border-[#e6eae5] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{action.input.title || "Proposed task"}</h3><p className="mt-1 text-xs text-[#7a857e]">{action.input.priority || "MEDIUM"} priority{action.input.dueAt ? ` · Due ${new Date(action.input.dueAt).toLocaleString()}` : ""}</p></div><span className="rounded-full bg-[#fff3dc] px-2 py-1 text-[10px] font-semibold text-[#94651a]">Approval required</span></div>{action.input.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#526159]">{action.input.description}</p>}<p className="mt-3 text-[10px] text-[#9aa39d]">Proposed {new Date(action.createdAt).toLocaleString()}</p><div className="mt-4 flex gap-2"><button disabled={busyId === action.id} onClick={() => void decide(action.id, "APPROVE")} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#176b52] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-60">{busyId === action.id ? <LoaderCircle size={14} className="animate-spin"/> : <Check size={14}/>} Approve & create</button><button disabled={busyId === action.id} onClick={() => void decide(action.id, "REJECT")} className="flex items-center justify-center gap-2 rounded-lg border border-[#dce4dd] px-3 py-2.5 text-xs font-semibold text-[#526159] disabled:opacity-60"><X size={14}/> Reject</button></div></article>)}</div>}
        </section>
      </div>

      <section className="rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><ShieldCheck size={17} className="text-[#176b52]"/><div><h2 className="font-semibold">Task automation rule</h2><p className="mt-1 text-xs text-[#7a857e]">Choose how the assistant handles future task-creation proposals.</p></div></div>
        <form onSubmit={saveRule} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-xs font-semibold text-[#526159]">Approval behavior
            <select value={ruleMode} onChange={event => setRuleMode(event.target.value as "AUTO" | "CONFIRM" | "BLOCK")} className="mt-2 w-full rounded-xl border border-[#dce4dd] bg-white px-3 py-3 text-sm font-normal">
              <option value="CONFIRM">Confirm — require my approval</option><option value="AUTO">Auto — create tasks immediately</option><option value="BLOCK">Block — do not accept proposals</option>
            </select>
          </label>
          <button disabled={savingRule} className="flex items-center justify-center gap-2 rounded-xl bg-[#176b52] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{savingRule ? <LoaderCircle size={15} className="animate-spin"/> : <ShieldCheck size={15}/>} Save rule</button>
        </form>
        <div className="mt-4 flex flex-col gap-2 rounded-xl bg-[#f7f8f5] p-3 text-xs text-[#69756e] sm:flex-row sm:items-center sm:justify-between">
          <span>Default approval setting: <strong>{defaultApprovalMode}</strong></span>
          {rules.some(rule => rule.actionType === "CREATE_TASK" && rule.enabled) ? <button type="button" disabled={savingRule} onClick={() => void removeRule(rules.find(rule => rule.actionType === "CREATE_TASK" && rule.enabled)!.id)} className="w-fit font-semibold text-[#176b52] underline underline-offset-2 disabled:opacity-60">Remove rule and use default</button> : <span>Using default setting</span>}
        </div>
      </section>

      <section className="rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><Clock3 size={17} className="text-[#176b52]"/><div><h2 className="font-semibold">Action history</h2><p className="mt-1 text-xs text-[#7a857e]">A record of completed, rejected, and other past actions.</p></div></div>
        {history.length === 0 ? <p className="py-6 text-sm text-[#87918b]">No previous actions yet.</p> : <div className="divide-y divide-[#edf0ec]">{history.map(action => <div key={action.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{action.input.title || action.result.title || "Task action"}</p><p className="mt-1 text-xs text-[#87918b]">{new Date(action.createdAt).toLocaleString()}</p></div><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${action.status === "SUCCEEDED" ? "bg-[#e7f3ed] text-[#176b52]" : action.status === "FAILED" ? "bg-rose-50 text-rose-700" : "bg-[#f1f3f0] text-[#68746d]"}`}>{statusLabels[action.status]}{action.errorCode ? ` · ${action.errorCode}` : ""}</span></div>)}</div>}
      </section>
    </div>
  </main>;
}
