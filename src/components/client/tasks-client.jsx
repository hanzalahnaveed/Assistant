"use client";

import { Button, Input } from "antd";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Circle, LoaderCircle, Pencil, Save, Trash2, X } from "lucide-react";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const PRIORITY_STYLE = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-orange-50 text-orange-700",
  URGENT: "bg-rose-50 text-rose-700",
};

const isActive = (task) => task.status !== "DONE" && task.status !== "CANCELLED";
const toDate = (value) => (value ? new Date(value) : null);
const timeOf = (value) => (value ? new Date(value).getTime() : Infinity);
const capitalize = (text) => text[0] + text.slice(1).toLowerCase();
const errorMessage = (e, fallback) => (e instanceof Error ? e.message : fallback);

/** Compare two timestamps; items without a date sort last. */
function compareDates(a, b) {
  const x = timeOf(a);
  const y = timeOf(b);
  return x === y ? 0 : x < y ? -1 : 1;
}

/** fetch + JSON parse + error handling in one place. */
async function api(url, fallbackError, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || fallbackError);
  return body;
}

function matchesView(task, view) {
  switch (view) {
    case "all":
      return true;
    case "completed":
      return task.status === "DONE";
    case "in_progress":
      return task.status === "IN_PROGRESS";
    case "open":
      return isActive(task);
    default:
      return false;
  }
}

function matchesDueFilter(filter, due, { todayStart, tomorrowStart }, isDone = false) {
  switch (filter) {
    case "OVERDUE":
      return !!due && due < todayStart && !isDone;
    case "TODAY":
      return !!due && due >= todayStart && due < tomorrowStart;
    case "UPCOMING":
      return !!due && due >= tomorrowStart;
    case "NO_DUE":
      return !due;
    default:
      return true;
  }
}

function compareItems(sortBy) {
  return (a, b) => {
    if (sortBy === "NEWEST") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (sortBy === "PRIORITY") {
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || compareDates(a.date, b.date);
    }
    return compareDates(a.date, b.date);
  };
}

function toLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function TasksClient({
  refreshKey = 0,
  onTasksChange,
  scheduleEvents = [],
  searchQuery = "",
  renderScheduleEvent,
}) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [dueFilter, setDueFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("DUE_ASC");
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    onTasksChange?.(tasks);
  }, [onTasksChange, tasks]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const body = await api("/api/tasks", "Could not load schedule items.", { cache: "no-store" });
      setTasks(body.tasks);
    } catch (e) {
      setError(errorMessage(e, "Could not load schedule items."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  /* ----------------------------- Mutations -------------------------------- */

  async function updateTask(task, patch, { quiet = false } = {}) {
    setError("");
    try {
      const body = await api(`/api/tasks/${task.id}`, "Could not update this schedule item.", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      setTasks((current) => current.map((item) => (item.id === task.id ? body.task : item)));
      if (!quiet) setNotice("Schedule item updated.");
      return true;
    } catch (e) {
      setError(errorMessage(e, "Could not update this schedule item."));
      return false;
    }
  }

  async function removeTask(task) {
    if (!window.confirm(`Remove "${task.title}" from your active schedule?`)) return;
    setError("");
    try {
      await api(`/api/tasks/${task.id}`, "Could not remove this schedule item.", { method: "DELETE" });
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setSelectedTaskIds((current) => current.filter((id) => id !== task.id));
      setNotice("Schedule item archived.");
    } catch (e) {
      setError(errorMessage(e, "Could not remove this schedule item."));
    }
  }

  /* ------------------------- Derived / filtered data ---------------------- */

  const now = new Date();
  const dayBounds = {
    todayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    tomorrowStart: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  };
  const needle = searchQuery.trim().toLowerCase();
  const hasActiveFilters = Boolean(searchQuery || priorityFilter !== "ALL" || dueFilter !== "ALL");

  const visibleTasks = tasks.filter((task) => {
    const matchesQuery =
      !needle ||
      task.title.toLowerCase().includes(needle) ||
      (task.description ?? "").toLowerCase().includes(needle);
    return (
      matchesView(task, view) &&
      matchesQuery &&
      matchesDueFilter(dueFilter, toDate(task.dueAt), dayBounds, task.status === "DONE") &&
      (priorityFilter === "ALL" || task.priority === priorityFilter)
    );
  });

  const visibleScheduleEvents = (view === "open" || view === "all" ? scheduleEvents : []).filter(
    (event) =>
      (priorityFilter === "ALL" || event.priority === priorityFilter) &&
      matchesDueFilter(dueFilter, toDate(event.dueAt || event.startAt), dayBounds),
  );

  const visibleScheduleItems = [
    ...visibleTasks.map((task) => ({
      id: task.id,
      task,
      priority: task.priority,
      date: task.dueAt,
      createdAt: task.createdAt,
    })),
    ...visibleScheduleEvents.map((event) => ({
      id: event.scheduleItemId || event.id,
      event,
      priority: event.priority || "MEDIUM",
      date: event.startAt,
      createdAt: event.createdAt,
    })),
  ].sort(compareItems(sortBy));

  /* ------------------------------ Selection ------------------------------- */

  const selectableVisibleTasks = visibleTasks.filter(isActive);
  const selectedOpenTasks = selectableVisibleTasks.filter((task) => selectedTaskIds.includes(task.id));
  const allVisibleSelected =
    selectableVisibleTasks.length > 0 && selectedOpenTasks.length === selectableVisibleTasks.length;

  function toggleTaskSelection(taskId, checked) {
    setSelectedTaskIds((current) =>
      checked ? [...new Set([...current, taskId])] : current.filter((id) => id !== taskId),
    );
  }

  function toggleVisibleSelection(checked) {
    const visibleIds = new Set(selectableVisibleTasks.map((task) => task.id));
    setSelectedTaskIds((current) => {
      const retained = current.filter((id) => !visibleIds.has(id));
      return checked ? [...retained, ...visibleIds] : retained;
    });
  }

  async function completeSelectedTasks() {
    if (!selectedOpenTasks.length || bulkBusy) return;
    setBulkBusy(true);
    setError("");

    const total = selectedOpenTasks.length;
    const failedIds = [];
    for (const task of selectedOpenTasks) {
      const success = await updateTask(task, { status: "DONE" }, { quiet: true });
      if (!success) failedIds.push(task.id);
    }
    const completedCount = total - failedIds.length;

    setSelectedTaskIds(failedIds);
    setNotice(
      failedIds.length
        ? `Completed ${completedCount} of ${total} selected items. Retry the remaining selection.`
        : `Completed ${completedCount} selected item${completedCount === 1 ? "" : "s"}.`,
    );
    setBulkBusy(false);
  }

  function clearFilters() {
    setPriorityFilter("ALL");
    setDueFilter("ALL");
  }

  /* -------------------------------- Render -------------------------------- */

  const emptyTitle = hasActiveFilters
    ? "No matching schedule items"
    : view === "completed"
      ? "Nothing completed yet"
      : "No schedule items yet";

  return (
    <section className="flex flex-col text-[#212529]">
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[13px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
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
          className="mb-4 rounded-[13px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      <section className="mb-6 rounded-[18px] border border-[#E3E7ED] bg-white p-5 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] sm:p-6">
        <div className="mb-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold tracking-[-0.025em]">Your schedule items</h2>
              <p className="mt-1 text-pretty text-xs text-[#6B7280]">
                The same schedule items appear in list and calendar views.
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

          {selectableVisibleTasks.length > 0 && view !== "completed" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3e7ed] bg-[#f8faf8] px-3.5 py-3">
              <label className="flex items-center gap-2 text-xs font-medium text-[#526159]">
                <input
                  type="checkbox"
                  aria-label="Select all visible active items"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleVisibleSelection(event.target.checked)}
                  className="h-4 w-4 accent-[#FA8500]"
                />
                Select visible active items ({selectableVisibleTasks.length})
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
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-[#6B7280]">
            <LoaderCircle size={16} className="animate-[spin_0.9s_linear_infinite]" />
            Loading schedule items…
          </div>
        ) : visibleScheduleItems.length ? (
          <div className="divide-y divide-[#edf1ed]">
            {visibleScheduleItems.map((item) =>
              item.task ? (
                <TaskRow
                  key={item.id}
                  task={item.task}
                  updateTask={updateTask}
                  removeTask={removeTask}
                  selected={selectedTaskIds.includes(item.task.id)}
                  onSelect={toggleTaskSelection}
                />
              ) : (
                <div key={item.id} className="py-3">
                  {renderScheduleEvent?.(item.event)}
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="py-10 text-center">
            <div className="text-sm font-semibold">{emptyTitle}</div>
            <p className="mt-2 text-pretty text-xs leading-5 text-[#6B7280]">
              {hasActiveFilters ? "Try changing your search or filters." : "Schedule a new item to see it here."}
            </p>
            {hasActiveFilters && (
              <Button onClick={clearFilters} className="mt-3 text-xs font-semibold text-[#FA8500]">
                Clear filters
              </Button>
            )}
          </div>
        )}
      </section>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Task row                                                                   */
/* -------------------------------------------------------------------------- */

function TaskRow({ task, updateTask, removeTask, selected, onSelect }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <TaskEditForm task={task} updateTask={updateTask} onClose={() => setEditing(false)} />;
  }

  const isDone = task.status === "DONE";

  return (
    <article className="flex min-w-0 flex-wrap items-start gap-3 py-4">
      {isActive(task) && (
        <input
          type="checkbox"
          aria-label={`Select task: ${task.title}`}
          checked={selected}
          onChange={(event) => onSelect(task.id, event.target.checked)}
          className="mt-2 h-4 w-4 shrink-0 accent-[#FA8500]"
        />
      )}

      <Button
        aria-label={isDone ? "Reopen item" : "Complete item"}
        onClick={() => void updateTask(task, { status: isDone ? "TODO" : "DONE" })}
        className="mt-1 text-[#FA8500]"
      >
        {isDone ? <Check size={18} /> : <Circle size={18} />}
      </Button>

      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium ${isDone ? "text-[#929c95] line-through" : ""}`}>
          {task.title}
        </div>
        {task.description && (
          <p className="mt-1 whitespace-pre-wrap text-pretty text-xs leading-5 text-[#6B7280]">
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
        aria-label="Schedule item status"
        value={task.status}
        onChange={(event) => void updateTask(task, { status: event.target.value })}
        className="rounded-lg border border-[#dfe6dd] bg-white px-2 py-1.5 text-xs"
      >
        <option value="TODO">To do</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="DONE">Completed</option>
      </select>

      <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${PRIORITY_STYLE[task.priority]}`}>
        {task.priority}
      </span>

      <select
        aria-label="Schedule item priority"
        value={task.priority}
        onChange={(event) => void updateTask(task, { priority: event.target.value })}
        className="rounded-lg border border-[#dfe6dd] bg-white px-2 py-1.5 text-xs"
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1">
        <Button
          htmlType="button"
          aria-label="Edit schedule item"
          title="Edit schedule item"
          onClick={() => setEditing(true)}
          className="rounded-lg p-1.5 text-[#64746a] hover:bg-[#f0f4ef]"
        >
          <Pencil size={15} />
        </Button>
        <Button
          htmlType="button"
          aria-label="Archive schedule item"
          onClick={() => void removeTask(task)}
          className="rounded-lg p-1.5 text-[#9b6a60] hover:bg-rose-50"
        >
          <Trash2 size={15} />
        </Button>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Edit form (mounted only while editing, so state always starts from `task`) */
/* -------------------------------------------------------------------------- */

function TaskEditForm({ task, updateTask, onClose }) {
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [dueAt, setDueAt] = useState(toLocalDateTimeInput(task.dueAt));

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
    if (ok) onClose();
  }

  const fieldClass = "mt-1.5 block w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm";

  return (
    <form onSubmit={saveChanges} className="space-y-3 border-b border-[#edf1ed] py-4">
      <Input
        aria-label="Schedule item title"
        required
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Schedule item title"
        className="w-full rounded-xl border border-[#dfe6dd] px-3 py-2.5 text-sm"
      />
      <Input.TextArea
        aria-label="Schedule item details"
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
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className={fieldClass}>
            {PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {capitalize(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-[#6B7280]">
          Due date and time
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          htmlType="submit"
          disabled={saving || !title.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Save size={14} /> {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button
          htmlType="button"
          disabled={saving}
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] px-3.5 py-2 text-xs font-medium"
        >
          <X size={14} /> Cancel
        </Button>
      </div>
    </form>
  );
}