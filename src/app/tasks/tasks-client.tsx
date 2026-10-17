"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Circle, LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import WorkspaceHeader from "@/components/workspace-header";

type Task = {
  id: string; title: string; description: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueAt: string | null;
};
const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const priorityStyle: Record<Task["priority"], string> = {
  LOW: "bg-slate-100 text-slate-600", MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-orange-50 text-orange-700", URGENT: "bg-rose-50 text-rose-700"
};

export default function TasksClient() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("MEDIUM");
  const [dueAt, setDueAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [view, setView] = useState<"open" | "completed" | "all">("open");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | Task["priority"]>("ALL");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load tasks.");
      setTasks(body.tasks);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load tasks."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function addTask(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description: description || null, priority, dueAt: dueAt ? new Date(dueAt).toISOString() : null })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not create task.");
      setTasks(current => [body.task, ...current]); setTitle(""); setDescription(""); setPriority("MEDIUM"); setDueAt(""); setShowComposer(false);
      setNotice("Task saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create task."); }
    finally { setBusy(false); }
  }

  async function updateTask(task: Task, patch: Partial<Task>) {
    setError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update task.");
      setTasks(current => current.map(item => item.id === task.id ? body.task : item));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update task."); }
  }

  async function removeTask(task: Task) {
    if (!window.confirm(`Remove "${task.title}" from your active tasks?`)) return;
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not remove task.");
      setTasks(current => current.filter(item => item.id !== task.id)); setNotice("Task archived.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove task."); }
  }

  const open = tasks.filter(task => task.status !== "DONE" && task.status !== "CANCELLED");
  const done = tasks.filter(task => task.status === "DONE");
  const visibleTasks = tasks.filter(task => {
    const matchesView = view === "all" || (view === "completed" ? task.status === "DONE" : task.status !== "DONE" && task.status !== "CANCELLED");
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || task.title.toLowerCase().includes(needle) || (task.description ?? "").toLowerCase().includes(needle);
    return matchesView && matchesQuery && (priorityFilter === "ALL" || task.priority === priorityFilter);
  });
  return <main className="min-h-screen bg-[#f7f8f5] text-[#18211f]">
    <WorkspaceHeader />
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#176b52]"><Check size={14}/> Execution center</div>
      <div className="mb-7"><p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-[#176b52]">Your execution space</p><h1 className="text-3xl font-semibold tracking-tight">My tasks</h1><p className="mt-2 text-sm text-[#76817c]">Tasks are saved to your account and stay in sync across sessions.</p></div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}{error.toLowerCase().includes("connect google") && <a href="/api/auth/google/start" className="ml-2 font-semibold underline">Connect Google</a>}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e2e8e0] bg-white p-4 sm:p-5"><div><h2 className="font-semibold">Capture a commitment</h2><p className="mt-1 text-xs leading-5 text-[#76817c]">Turn a next step into a tracked task with an owner, priority, and deadline.</p></div><button type="button" onClick={() => setShowComposer(value => !value)} className="inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#10543f]">{showComposer ? <X size={16}/> : <Plus size={16}/>} {showComposer ? "Close form" : "New task"}</button></div>
      {showComposer && <form onSubmit={addTask} className="mb-7 space-y-3 rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6">
        <h2 className="font-semibold">New task details</h2>
        <input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to get done?" className="w-full rounded-xl border border-[#dfe6dd] px-3.5 py-3 text-sm outline-none focus:border-[#176b52]"/>
        <textarea maxLength={5000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full resize-y rounded-xl border border-[#dfe6dd] px-3.5 py-3 text-sm outline-none focus:border-[#176b52]"/>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[#68756d]">Priority<select value={priority} onChange={e => setPriority(e.target.value as Task["priority"])} className="mt-1.5 block w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm text-[#18211f]">{priorities.map(item => <option key={item} value={item}>{item[0] + item.slice(1).toLowerCase()}</option>)}</select></label>
          <label className="text-xs font-medium text-[#68756d]">Due date and time<input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} className="mt-1.5 block w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm text-[#18211f]"/></label>
        </div>
        <button disabled={busy || !title.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16}/>{busy ? "Saving…" : "Save task"}</button>
      </form>}
      <section className="mb-6 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-[#e2e8e0] bg-white p-4"><p className="text-xs text-[#76817c]">Active commitments</p><div className="mt-2 text-2xl font-semibold">{open.length}</div></div><div className="rounded-2xl border border-[#e2e8e0] bg-white p-4"><p className="text-xs text-[#76817c]">High / urgent</p><div className="mt-2 text-2xl font-semibold">{open.filter(task => task.priority === "HIGH" || task.priority === "URGENT").length}</div></div><div className="rounded-2xl border border-[#e2e8e0] bg-white p-4"><p className="text-xs text-[#76817c]">Completed</p><div className="mt-2 text-2xl font-semibold">{done.length}</div></div></section>
      <section className="mb-6 rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-col gap-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Your task list</h2><p className="mt-1 text-xs text-[#76817c]">Search, filter, and update progress without losing your place.</p></div><button onClick={() => void load()} disabled={loading} className="text-xs font-semibold text-[#176b52] disabled:opacity-50">Refresh</button></div>
          <div className="flex flex-col gap-3 md:flex-row"><label className="relative min-w-0 flex-1"><span className="sr-only">Search tasks</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#87918b]"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by task or notes…" className="w-full py-2.5 pl-9 pr-3 text-sm"/></label><select aria-label="Filter by priority" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as typeof priorityFilter)} className="md:w-44"><option value="ALL">All priorities</option>{priorities.map(item => <option key={item} value={item}>{item[0] + item.slice(1).toLowerCase()}</option>)}</select></div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Task status filter">{([{id:"open",label:"Active",count:open.length},{id:"completed",label:"Completed",count:done.length},{id:"all",label:"All tasks",count:tasks.length}] as const).map(tab => <button key={tab.id} type="button" onClick={() => setView(tab.id)} className={`rounded-xl px-3.5 py-2 text-xs font-semibold ${view === tab.id ? "bg-[#e7f3ed] text-[#176b52]" : "border border-[#e2e8e0] text-[#68756d] hover:bg-[#f8faf7]"}`}>{tab.label}<span className="ml-2 opacity-70">{tab.count}</span></button>)}</div>
        </div>
        {loading ? <div className="flex items-center gap-2 py-8 text-sm text-[#76817c]"><LoaderCircle size={16} className="animate-spin"/>Loading tasks…</div> : visibleTasks.length ? <div className="divide-y divide-[#edf0ec]">{visibleTasks.map(task => <TaskRow key={task.id} task={task} updateTask={updateTask} removeTask={removeTask}/>)}</div> : <div className="py-10 text-center"><div className="text-sm font-semibold">{query || priorityFilter !== "ALL" ? "No matching tasks" : view === "completed" ? "Nothing completed yet" : "You’re all caught up"}</div><p className="mt-2 text-xs leading-5 text-[#76817c]">{query || priorityFilter !== "ALL" ? "Try changing your search or filters." : "Create a task when a new commitment comes in."}</p>{(query || priorityFilter !== "ALL") && <button onClick={() => { setQuery(""); setPriorityFilter("ALL"); }} className="mt-3 text-xs font-semibold text-[#176b52]">Clear filters</button>}</div>}
      </section>
    </div>
  </main>;
}

function TaskRow({ task, updateTask, removeTask }: { task: Task; updateTask: (task: Task, patch: Partial<Task>) => Promise<void>; removeTask: (task: Task) => Promise<void> }) {
  return <article className="flex flex-wrap items-start gap-3 py-4">
    <button aria-label={task.status === "DONE" ? "Reopen task" : "Complete task"} onClick={() => void updateTask(task, { status: task.status === "DONE" ? "TODO" : "DONE" })} className="mt-1 text-[#176b52]">{task.status === "DONE" ? <Check size={18}/> : <Circle size={18}/>}</button>
    <div className="min-w-0 flex-1"><div className={`text-sm font-medium ${task.status === "DONE" ? "text-[#929c95] line-through" : ""}`}>{task.title}</div>{task.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#76817c]">{task.description}</p>}{task.dueAt && <div className="mt-2 flex items-center gap-1.5 text-xs text-[#76817c]"><CalendarClock size={13}/>{new Date(task.dueAt).toLocaleString()}</div>}</div>
    <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${priorityStyle[task.priority]}`}>{task.priority}</span>
    <select aria-label="Task priority" value={task.priority} onChange={e => void updateTask(task, { priority: e.target.value as Task["priority"] })} className="rounded-lg border border-[#dfe6dd] bg-white px-2 py-1.5 text-xs">{priorities.map(p => <option key={p} value={p}>{p}</option>)}</select>
    <button aria-label="Archive task" onClick={() => void removeTask(task)} className="rounded-lg p-1.5 text-[#9b6a60] hover:bg-rose-50"><Trash2 size={15}/></button>
  </article>;
}
