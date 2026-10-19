"use client";


import { Button, Input } from "antd";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Circle, LoaderCircle, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import WorkspaceHeader from "@/components/workspace-header";
const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const priorityStyle = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-orange-50 text-orange-700",
  URGENT: "bg-rose-50 text-rose-700",
};
export default function TasksClient() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueAt, setDueAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [view, setView] = useState("open");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [dueFilter, setDueFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("DUE_ASC");
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load tasks.");
      setTasks(body.tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function addTask(event) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title,
          description: description || null,
          priority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not create task.");
      setTasks((current) => [body.task, ...current]);
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setDueAt("");
      setShowComposer(false);
      setView("open");
      setQuery("");
      setPriorityFilter("ALL");
      setDueFilter("ALL");
      setNotice("Task saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create task.");
    } finally {
      setBusy(false);
    }
  }
  async function updateTask(task, patch) {
    setError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(patch),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update task.");
      setTasks((current) => current.map((item) => (item.id === task.id ? body.task : item)));
      setNotice("Task updated.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update task.");
      return false;
    }
  }
  async function removeTask(task) {
    if (!window.confirm(`Remove "${task.title}" from your active tasks?`)) return;
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not remove task.");
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setNotice("Task archived.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove task.");
    }
  }
  const open = tasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELLED");
  function toggleTaskSelection(taskId, checked) {
    setSelectedTaskIds((current) => checked ? [...new Set([...current, taskId])] : current.filter((id) => id !== taskId));
  }
  function toggleVisibleSelection(checked) {
    setSelectedTaskIds((current) => {
      const visibleIds = new Set(selectableVisibleTasks.map((task) => task.id));
      const retained = current.filter((id) => !visibleIds.has(id));
      return checked ? [...retained, ...selectableVisibleTasks.map((task) => task.id)] : retained;
    });
  }
  async function completeSelectedTasks() {
    if (!selectedOpenTasks.length || bulkBusy) return;
    setBulkBusy(true);
    setError("");
    let completedCount = 0;
    const failedIds = [];
    for (const task of selectedOpenTasks) {
      const success = await updateTask(task, { status: "DONE" });
      if (success) completedCount += 1;
      else failedIds.push(task.id);
    }
    setSelectedTaskIds(failedIds);
    setNotice(failedIds.length
      ? `Completed ${completedCount} of ${selectedOpenTasks.length} selected tasks. Retry the remaining selection.`
      : `Completed ${completedCount} selected task${completedCount === 1 ? "" : "s"}.`);
    setBulkBusy(false);
  }
  const done = tasks.filter((task) => task.status === "DONE");
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const overdueCount = open.filter((task) => task.dueAt && new Date(task.dueAt) < todayStart).length;
  const dueTodayCount = open.filter((task) => task.dueAt && new Date(task.dueAt) >= todayStart && new Date(task.dueAt) < tomorrowStart).length;
  const visibleTasks = tasks.filter((task) => {
    const matchesView =
      view === "all" ||
      (view === "completed"
        ? task.status === "DONE"
        : task.status !== "DONE" && task.status !== "CANCELLED");
    const needle = query.trim().toLowerCase();
    const matchesQuery =
      !needle ||
      task.title.toLowerCase().includes(needle) ||
      (task.description ?? "").toLowerCase().includes(needle);
    const due = task.dueAt ? new Date(task.dueAt) : null;
    const matchesDue =
      dueFilter === "ALL" ||
      (dueFilter === "OVERDUE" && due && due < todayStart && task.status !== "DONE") ||
      (dueFilter === "TODAY" && due && due >= todayStart && due < tomorrowStart) ||
      (dueFilter === "UPCOMING" && due && due >= tomorrowStart) ||
      (dueFilter === "NO_DUE" && !due);
    return matchesView && matchesQuery && matchesDue &&
      (priorityFilter === "ALL" || task.priority === priorityFilter);
  }).sort((a, b) => {
    if (sortBy === "NEWEST") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (sortBy === "PRIORITY") {
      const rank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return rank[a.priority] - rank[b.priority] ||
        (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity);
    }
    return (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) -
      (b.dueAt ? new Date(b.dueAt).getTime() : Infinity);
  });
  const selectableVisibleTasks = visibleTasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELLED");
  const selectedOpenTasks = selectableVisibleTasks.filter((task) => selectedTaskIds.includes(task.id));
  const allVisibleSelected = selectableVisibleTasks.length > 0 && selectableVisibleTasks.every((task) => selectedTaskIds.includes(task.id));
  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#212529] pl-[58px] min-[421px]:pl-[72px] min-[761px]:pl-[252px]">
      <WorkspaceHeader />
      <div className="mx-auto max-w-5xl px-5 sm:px-8 pt-[26px] min-[761px]:pt-[clamp(26px,4vw,48px)] pb-14">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#FA8500]">
          <Check size={14} /> Execution center
        </div>
        <div className="mb-7">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-[#FA8500] text-pretty">
            Your execution space
          </p>
          <h1 className="text-[clamp(1.8rem,3vw,2.5rem)] font-semibold tracking-[-0.045em] leading-[1.13]">
            My tasks
          </h1>
          <p className="mt-2 text-sm text-[#6B7280] text-pretty">
            Tasks are saved to your account and stay in sync across sessions.
          </p>
        </div>
        {error && (
          <div
            role="alert"
            className="mb-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 rounded-[13px]"
          >
            {error}
            {error.toLowerCase().includes("connect google") && (
              <a href="/api/auth/google/start" className="ml-2 font-semibold underline">
                Connect Google
              </a>
            )}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-4 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 rounded-[13px]"
          >
            {notice}
          </div>
        )}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#E3E7ED] bg-white p-4 sm:p-5 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)]">
          <div>
            <h2 className="font-semibold tracking-[-0.025em]">Capture a commitment</h2>
            <p className="mt-1 text-xs leading-5 text-[#6B7280] text-pretty">
              Turn a next step into a tracked task with an owner, priority, and deadline.
            </p>
          </div>
          <Button
            htmlType="button"
            onClick={() => setShowComposer((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#001d3d]"
          >
            {showComposer ? <X size={16} /> : <Plus size={16} />}{" "}
            {showComposer ? "Close form" : "New task"}
          </Button>
        </div>
        {showComposer && (
          <form
            onSubmit={addTask}
            className="mb-7 space-y-3 rounded-[18px] border border-[#E3E7ED] bg-white p-5 sm:p-6 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)]"
          >
            <h2 className="font-semibold tracking-[-0.025em]">New task details</h2>
            <Input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to get done?"
              className="w-full rounded-xl border border-[#dfe6dd] px-3.5 py-3 text-sm outline-none focus:border-[#176b52]"
            />
            <Input.TextArea
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full resize-y rounded-xl border border-[#dfe6dd] px-3.5 py-3 text-sm outline-none focus:border-[#176b52]"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-[#6B7280]">
                Priority
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm text-[#212529]"
                >
                  {priorities.map((item) => (
                    <option key={item} value={item}>
                      {item[0] + item.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-[#6B7280]">
                Due date and time
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm text-[#212529]"
                />
              </label>
            </div>
            <Button
              htmlType="submit"
              disabled={busy || !title.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus size={16} />
              {busy ? "Saving…" : "Save task"}
            </Button>
          </form>
        )}
        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-[18px] border border-[#E3E7ED] bg-white p-4 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)]">
            <p className="text-xs text-[#6B7280] text-pretty">Active commitments</p>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.045em]">{open.length}</div>
          </div>
          <div className="rounded-[18px] border border-[#E3E7ED] bg-white p-4 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)]">
            <p className="text-xs text-[#6B7280] text-pretty">Overdue</p>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.045em]">{overdueCount}</div>
          </div>
          <div className="rounded-[18px] border border-[#E3E7ED] bg-white p-4 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)]">
            <p className="text-xs text-[#6B7280] text-pretty">Due today</p>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.045em]">{dueTodayCount}</div>
          </div>
          <div className="rounded-[18px] border border-[#E3E7ED] bg-white p-4 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)]">
            <p className="text-xs text-[#6B7280] text-pretty">High / urgent</p>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.045em]">
              {open.filter((task) => task.priority === "HIGH" || task.priority === "URGENT").length}
            </div>
          </div>
          <div className="rounded-[18px] border border-[#E3E7ED] bg-white p-4 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)]">
            <p className="text-xs text-[#6B7280] text-pretty">Completed</p>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.045em]">{done.length}</div>
          </div>
        </section>
        <section className="mb-6 rounded-[18px] border border-[#E3E7ED] p-5 sm:p-6 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] bg-white">
          <div className="mb-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold tracking-[-0.025em]">Your task list</h2>
                <p className="mt-1 text-xs text-[#6B7280] text-pretty">
                  Search, filter, and update progress without losing your place.
                </p>
              </div>
              <Button
                onClick={() => void load()}
                disabled={loading}
                className="text-xs font-semibold text-[#FA8500] disabled:opacity-50"
              >
                Refresh
              </Button>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search tasks</span>
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#87918b]"
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by task or notes…"
                  className="w-full py-2.5 pl-9 pr-3 text-sm"
                />
              </label>
              <select
                aria-label="Filter by priority"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="md:w-40 rounded-xl border border-[#dfe6dd] bg-white px-3 py-2 text-sm"
              >
                <option value="ALL">All priorities</option>
                {priorities.map((item) => (
                  <option key={item} value={item}>
                    {item[0] + item.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by due date"
                value={dueFilter}
                onChange={(e) => setDueFilter(e.target.value)}
                className="md:w-40 rounded-xl border border-[#dfe6dd] bg-white px-3 py-2 text-sm"
              >
                <option value="ALL">Any due date</option>
                <option value="OVERDUE">Overdue</option>
                <option value="TODAY">Due today</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="NO_DUE">No due date</option>
              </select>
              <select
                aria-label="Sort tasks"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="md:w-40 rounded-xl border border-[#dfe6dd] bg-white px-3 py-2 text-sm"
              >
                <option value="DUE_ASC">Soonest due</option>
                <option value="PRIORITY">Highest priority</option>
                <option value="NEWEST">Recently created</option>
              </select>
            </div>
            {selectableVisibleTasks.length > 0 && view !== "completed" && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3e7ed] bg-[#f8faf8] px-3.5 py-3">
                <label className="flex items-center gap-2 text-xs font-medium text-[#526159]">
                  <input
                    type="checkbox"
                    aria-label="Select all visible active tasks"
                    checked={allVisibleSelected}
                    onChange={(event) => toggleVisibleSelection(event.target.checked)}
                    className="h-4 w-4 accent-[#FA8500]"
                  />
                  Select visible active tasks ({selectableVisibleTasks.length})
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {selectedOpenTasks.length > 0 && (
                    <span className="text-xs text-[#6B7280]">{selectedOpenTasks.length} selected</span>
                  )}
                  <Button
                    htmlType="button"
                    disabled={!selectedOpenTasks.length || bulkBusy}
                    onClick={() => void completeSelectedTasks()}
                    className="rounded-xl bg-[#FA8500] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {bulkBusy ? "Completing…" : `Complete selected (${selectedOpenTasks.length})`}
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Task status filter">
              {[
                {
                  id: "open",
                  label: "Active",
                  count: open.length,
                },
                {
                  id: "completed",
                  label: "Completed",
                  count: done.length,
                },
                {
                  id: "all",
                  label: "All tasks",
                  count: tasks.length,
                },
              ].map((tab) => (
                <Button
                  key={tab.id}
                  htmlType="button"
                  onClick={() => setView(tab.id)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold ${view === tab.id ? "bg-[#e7f3ed] text-[#FA8500]" : "border border-[#e2e8e0] text-[#6B7280] hover:bg-[#f8faf7]"}`}
                >
                  {tab.label}
                  <span className="ml-2 opacity-70">{tab.count}</span>
                </Button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[#6B7280]">
              <LoaderCircle size={16} className="animate-[spin_0.9s_linear_infinite]" />
              Loading tasks…
            </div>
          ) : visibleTasks.length ? (
            <div className="divide-y divide-[#edf1ed]">
              {visibleTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  updateTask={updateTask}
                  removeTask={removeTask}
                  selected={selectedTaskIds.includes(task.id)}
                  onSelect={toggleTaskSelection}
                />
              ))}
            </div>
          ) : (
            <div className="py-10 text-center">
              <div className="text-sm font-semibold">
                {query || priorityFilter !== "ALL" || dueFilter !== "ALL"
                  ? "No matching tasks"
                  : view === "completed"
                    ? "Nothing completed yet"
                    : "You’re all caught up"}
              </div>
              <p className="mt-2 text-xs leading-5 text-[#6B7280] text-pretty">
                {query || priorityFilter !== "ALL" || dueFilter !== "ALL"
                  ? "Try changing your search or filters."
                  : "Create a task when a new commitment comes in."}
              </p>
              {(query || priorityFilter !== "ALL" || dueFilter !== "ALL") && (
                <Button
                  onClick={() => {
                    setQuery("");
                    setPriorityFilter("ALL");
                    setDueFilter("ALL");
                  }}
                  className="mt-3 text-xs font-semibold text-[#FA8500]"
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
function toLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function TaskRow({ task, updateTask, removeTask, selected, onSelect }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [dueAt, setDueAt] = useState(toLocalDateTimeInput(task.dueAt));
  useEffect(() => {
    if (!editing) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setPriority(task.priority);
      setDueAt(toLocalDateTimeInput(task.dueAt));
    }
  }, [task, editing]);
  async function saveChanges(event) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    const ok = await updateTask(task, {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setSaving(false);
    if (ok) setEditing(false);
  }
  if (editing) {
    return (
      <form onSubmit={saveChanges} className="space-y-3 border-b border-[#edf1ed] py-4">
        <Input
          aria-label="Task title"
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Task title"
          className="w-full rounded-xl border border-[#dfe6dd] px-3 py-2.5 text-sm"
        />
        <Input.TextArea
          aria-label="Task notes"
          maxLength={5000}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Notes (optional)"
          className="w-full rounded-xl border border-[#dfe6dd] px-3 py-2.5 text-sm"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[#6B7280]">
            Priority
            <select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm">
              {priorities.map((item) => <option key={item} value={item}>{item[0] + item.slice(1).toLowerCase()}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-[#6B7280]">
            Due date and time
            <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm" />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button htmlType="submit" disabled={saving || !title.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50">
            <Save size={14} /> {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button htmlType="button" disabled={saving} onClick={() => setEditing(false)} className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] px-3.5 py-2 text-xs font-medium">
            <X size={14} /> Cancel
          </Button>
        </div>
      </form>
    );
  }
  return (
    <article className="flex flex-wrap items-start gap-3 py-4 min-w-0">
      {task.status !== "DONE" && task.status !== "CANCELLED" && (
        <input
          type="checkbox"
          aria-label={`Select task: ${task.title}`}
          checked={selected}
          onChange={(event) => onSelect(task.id, event.target.checked)}
          className="mt-2 h-4 w-4 shrink-0 accent-[#FA8500]"
        />
      )}
      <Button
        aria-label={task.status === "DONE" ? "Reopen task" : "Complete task"}
        onClick={() =>
          void updateTask(task, {
            status: task.status === "DONE" ? "TODO" : "DONE",
          })
        }
        className="mt-1 text-[#FA8500]"
      >
        {task.status === "DONE" ? <Check size={18} /> : <Circle size={18} />}
      </Button>
      <div className="min-w-0 flex-1">
        <div
          className={`text-sm font-medium ${task.status === "DONE" ? "text-[#929c95] line-through" : ""}`}
        >
          {task.title}
        </div>
        {task.description && (
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#6B7280] text-pretty">
            {task.description}
          </p>
        )}
        {task.dueAt && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-[#6B7280]">
            <CalendarClock size={13} />
            {new Date(task.dueAt).toLocaleString()}
          </div>
        )}
      </div>
      <select
        aria-label="Task status"
        value={task.status}
        onChange={(event) => void updateTask(task, { status: event.target.value })}
        className="rounded-lg border border-[#dfe6dd] bg-white px-2 py-1.5 text-xs"
      >
        <option value="TODO">To do</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="DONE">Completed</option>
      </select>
      <span
        className={`rounded-md px-2 py-1 text-[10px] font-semibold ${priorityStyle[task.priority]}`}
      >
        {task.priority}
      </span>
      <select
        aria-label="Task priority"
        value={task.priority}
        onChange={(e) =>
          void updateTask(task, {
            priority: e.target.value,
          })
        }
        className="rounded-lg border border-[#dfe6dd] bg-white px-2 py-1.5 text-xs"
      >
        {priorities.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <Button
          htmlType="button"
          aria-label="Edit task"
          title="Edit task"
          onClick={() => setEditing(true)}
          className="rounded-lg p-1.5 text-[#64746a] hover:bg-[#f0f4ef]"
        >
          <Pencil size={15} />
        </Button>
        <Button
          htmlType="button"
          aria-label="Archive task"
          onClick={() => void removeTask(task)}
          className="rounded-lg p-1.5 text-[#9b6a60] hover:bg-rose-50"
        >
          <Trash2 size={15} />
        </Button>
      </div>
    </article>
  );
}
