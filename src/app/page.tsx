"use client";

import { useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays,
  Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Command, FileText,
  Inbox, LayoutDashboard, ListTodo, MessageCircle, MoreHorizontal, Plus,
  Search, Send, Settings2, ShieldCheck, Sparkles, Users, Zap
} from "lucide-react";

type Task = { id: number; title: string; time: string; priority: "High" | "Medium" | "Low"; done: boolean };

const initialTasks: Task[] = [
  { id: 1, title: "Send revised proposal to Northstar", time: "Due 10:30 AM", priority: "High", done: false },
  { id: 2, title: "Review product launch brief", time: "Due 12:00 PM", priority: "High", done: false },
  { id: 3, title: "Share feedback with design team", time: "Due 2:30 PM", priority: "Medium", done: false },
  { id: 4, title: "Prepare notes for weekly sync", time: "Due 4:00 PM", priority: "Low", done: true }
];

const agenda = [
  { time: "09:30", period: "AM", title: "Team stand-up", detail: "Product team · 25 min", color: "#75a990" },
  { time: "11:00", period: "AM", title: "Northstar proposal review", detail: "You + 3 attendees · 45 min", color: "#e5b66c" },
  { time: "01:30", period: "PM", title: "Product roadmap", detail: "Planning · 1 hour", color: "#8c9bd0" },
  { time: "03:00", period: "PM", title: "Focus time", detail: "Protected time · 60 min", color: "#75a990" }
];

const messages = [
  { from: "assistant", text: "Good morning. I’ve prepared your day at a glance. You have 4 meetings, 3 priorities, and one email that may need your attention." },
  { from: "user", text: "What should I focus on first?" },
  { from: "assistant", text: "Start with the Northstar proposal. It’s due before your 11 AM review, and there’s an unanswered client question in your inbox. I can summarize the thread and draft a reply for you." }
];

export default function Home() {
  const [tasks, setTasks] = useState(initialTasks);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState(messages);
  const [activeNav, setActiveNav] = useState("Overview");
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [notice, setNotice] = useState("");

  function addTask() {
    const title = newTask.trim();
    if (!title) return;
    setTasks(current => [...current, { id: Date.now(), title, time: "Added just now", priority: "Medium", done: false }]);
    setNewTask("");
    setShowTaskInput(false);
    setNotice("Task added to your list.");
  }

  function sendMessage() {
    const text = chatInput.trim();
    if (!text) return;
    setChatMessages(current => [...current, { from: "user", text }, { from: "assistant", text: "I’m ready to help with that. Connect your Google Workspace and configure an AI provider to enable live inbox, calendar, and action workflows. This preview does not send messages or access your accounts." }]);
    setChatInput("");
  }

  const completed = tasks.filter(task => task.done).length;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-[238px] shrink-0 flex-col border-r border-[#e7ebe7] bg-white px-4 py-6 lg:flex">
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#176b52] text-white"><Sparkles size={21} /></div>
          <div><div className="text-[16px] font-semibold tracking-tight">assistant<span className="text-[#176b52]">.</span></div><div className="mt-0.5 text-[11px] text-[#76817c]">YOUR EXECUTIVE COPILOT</div></div>
        </div>
        <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-[#9aa39e]">Workspace</div>
        <nav className="space-y-1">
          {[["Overview", LayoutDashboard], ["Inbox", Inbox], ["Calendar", CalendarDays], ["My tasks", ListTodo], ["Assistant chat", MessageCircle]].map(([label, Icon]) => {
            const name = label as string;
            const Glyph = Icon as typeof LayoutDashboard;
            return <button key={name} onClick={() => { setActiveNav(name); if (name === "Assistant chat") document.getElementById("assistant-chat")?.scrollIntoView({ behavior: "smooth" }); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition ${activeNav === name ? "bg-[#e7f3ed] font-semibold text-[#176b52]" : "text-[#69736e] hover:bg-[#f6f8f5]"}`}><Glyph size={17} strokeWidth={1.8} />{name}{name === "Inbox" && <span className="ml-auto rounded-md bg-[#f2e8d5] px-1.5 py-0.5 text-[10px] font-semibold text-[#8c682e]">3</span>}</button>;
          })}
        </nav>
        <div className="mb-2 mt-9 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-[#9aa39e]">Manage</div>
        <nav className="space-y-1">
          <button onClick={() => { window.location.assign("/integrations"); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-[#69736e] hover:bg-[#f6f8f5]"><Zap size={17} />Integrations<span className="ml-auto h-2 w-2 rounded-full bg-[#d9a34f]" /></button>
          <button onClick={() => setNotice("Settings will include your autonomy rules and approval preferences.")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-[#69736e] hover:bg-[#f6f8f5]"><Settings2 size={17} />Settings</button>
        </nav>
        <div className="mt-auto rounded-2xl border border-[#e7ebe7] bg-[#fafbf9] p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold"><ShieldCheck size={16} className="text-[#176b52]" />Your data, your rules</div>
          <p className="text-[11px] leading-5 text-[#76817c]">Actions will follow your permissions. Sensitive changes require your approval.</p>
        </div>
        <button className="mt-4 flex items-center gap-3 rounded-xl p-2 text-left hover:bg-[#f6f8f5]"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dce8df] text-xs font-semibold text-[#24543f]">HN</div><div className="min-w-0 flex-1"><div className="text-[12px] font-semibold">Your workspace</div><div className="text-[11px] text-[#76817c]">Personal account</div></div><ChevronDown size={15} className="text-[#76817c]" /></button>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-[#e7ebe7] bg-white/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-2 text-[12px] text-[#76817c]"><span>Workspace</span><span>/</span><span className="font-semibold text-[#18211f]">{activeNav}</span></div>
          <div className="flex items-center gap-3"><button aria-label="Search" onClick={() => setNotice("Search will be available across your connected work.")} className="rounded-lg p-2 text-[#76817c] hover:bg-[#f4f6f3]"><Search size={17} /></button><button aria-label="Notifications" onClick={() => setNotice("You're all caught up in this preview.")} className="relative rounded-lg p-2 text-[#76817c] hover:bg-[#f4f6f3]"><Bell size={17} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#d9a34f]" /></button><div className="hidden h-7 w-px bg-[#e7ebe7] sm:block" /><div className="hidden text-right sm:block"><div className="text-[12px] font-semibold">Friday, October 17</div><div className="text-[11px] text-[#76817c]">A clearer day starts here</div></div></div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-[#176b52]"><span className="h-1.5 w-1.5 rounded-full bg-[#176b52]" />YOUR DAILY BRIEFING</div><h1 className="text-[27px] font-semibold tracking-[-.04em] sm:text-[32px]">Good morning. Let’s make it count.</h1><p className="mt-2 text-[13px] text-[#76817c]">Here’s what matters today. We’ve got you.</p></div>
            <button onClick={() => setNotice("Briefing refresh will use live calendar and inbox data once connected.")} className="flex items-center gap-2 rounded-xl border border-[#e0e6df] bg-white px-3.5 py-2.5 text-[12px] font-semibold shadow-sm hover:bg-[#fafbf9]"><Sparkles size={15} className="text-[#176b52]" /> Refresh briefing</button>
          </div>

          {notice && <div role="status" className="mb-5 flex items-center justify-between rounded-xl border border-[#d8e9dd] bg-[#eef7f0] px-4 py-3 text-[12px] text-[#24543f]">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss" className="ml-3"><span aria-hidden="true">×</span></button></div>}

          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Priority emails" value="3" detail="1 needs your attention" icon={<Inbox size={17} />} trend="Needs review" />
            <Metric label="Meetings today" value="4" detail="Next one in 45 minutes" icon={<CalendarDays size={17} />} trend="Your calendar" />
            <Metric label="Tasks completed" value={`${completed}/${tasks.length}`} detail="Keep your momentum going" icon={<CheckCheck size={17} />} trend="Your progress" />
            <Metric label="Focus time" value="2h 30m" detail="Protected on your calendar" icon={<Clock3 size={17} />} trend="Deep work" />
          </section>

          <section className="mb-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.85fr)]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-[#e7ebe7] bg-white p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between"><div><div className="flex items-center gap-2 text-[14px] font-semibold"><Sparkles size={17} className="text-[#176b52]" />Your priorities</div><p className="mt-1 text-[12px] text-[#76817c]">A short list, so you can focus on what moves things forward.</p></div><button onClick={() => setShowTaskInput(v => !v)} aria-label="Add task" className="rounded-lg border border-[#e7ebe7] p-2 hover:bg-[#f6f8f5]"><Plus size={16} /></button></div>
                {showTaskInput && <form className="mb-4 flex gap-2" onSubmit={e => { e.preventDefault(); addTask(); }}><input value={newTask} onChange={e => setNewTask(e.target.value)} autoFocus placeholder="What needs to get done?" className="min-w-0 flex-1 rounded-xl border border-[#dce3dc] px-3 py-2 text-[12px] outline-none focus:border-[#176b52]" /><button className="rounded-xl bg-[#176b52] px-3 py-2 text-[12px] font-semibold text-white">Add</button></form>}
                <div className="space-y-1">{tasks.map(task => <div key={task.id} className="group flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-[#fafbf9]"><button aria-label={task.done ? "Mark incomplete" : "Mark complete"} onClick={() => setTasks(current => current.map(item => item.id === task.id ? { ...item, done: !item.done } : item))} className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-md border ${task.done ? "border-[#176b52] bg-[#176b52] text-white" : "border-[#cbd4cc] hover:border-[#176b52]"}`}>{task.done && <Check size={13} />}</button><div className="min-w-0 flex-1"><div className={`truncate text-[12px] font-medium ${task.done ? "text-[#9aa39e] line-through" : "text-[#303a35]"}`}>{task.title}</div><div className="mt-1 text-[10px] text-[#89938d]">{task.time}</div></div><span className={`rounded-md px-2 py-1 text-[10px] font-medium ${task.priority === "High" ? "bg-[#f9e9e5] text-[#a55340]" : task.priority === "Medium" ? "bg-[#f7f0df] text-[#96733c]" : "bg-[#eef1ee] text-[#77827b]"}`}>{task.priority}</span><button aria-label="Task options" onClick={() => setNotice("Task options and due-date editing are coming next.")} className="text-[#a3aca6] opacity-0 transition group-hover:opacity-100"><MoreHorizontal size={17} /></button></div>)}</div>
                <button onClick={() => setActiveNav("My tasks")} className="mt-3 flex items-center gap-2 px-2 text-[11px] font-semibold text-[#176b52] hover:gap-3">View all tasks <ArrowRight size={13} /></button>
              </div>

              <div className="rounded-2xl border border-[#e7ebe7] bg-white p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between"><div><div className="flex items-center gap-2 text-[14px] font-semibold"><Inbox size={17} className="text-[#176b52]" />Inbox worth your attention</div><p className="mt-1 text-[12px] text-[#76817c]">A few things to review before they become urgent.</p></div><button onClick={() => setActiveNav("Inbox")} className="text-[11px] font-semibold text-[#176b52]">Open inbox <ArrowRight size={13} className="ml-1 inline" /></button></div>
                <div className="divide-y divide-[#edf0ec]">
                  <MailItem initials="NS" sender="Nora Smith · Northstar" subject="Re: Q4 partnership proposal" summary="One question about delivery milestones is still unanswered." time="18m ago" priority="Needs reply" />
                  <MailItem initials="MK" sender="Marcus Kim · Product" subject="Launch plan — final feedback" summary="The team is waiting on your approval of two launch items." time="42m ago" priority="Action needed" />
                  <MailItem initials="AC" sender="Ava Chen · Operations" subject="Weekly team updates" summary="Three updates are ready for a quick review." time="1h ago" priority="For review" />
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-[#e7ebe7] bg-white p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between"><div><div className="flex items-center gap-2 text-[14px] font-semibold"><CalendarDays size={17} className="text-[#176b52]" />Today’s schedule</div><p className="mt-1 text-[12px] text-[#76817c]">A plan for your time, at a glance.</p></div><button aria-label="Calendar options" onClick={() => setNotice("Calendar connection will be added in the Google Workspace milestone.")} className="rounded-lg p-1.5 text-[#8b958f] hover:bg-[#f6f8f5]"><MoreHorizontal size={18} /></button></div>
                <div className="space-y-0">{agenda.map((item, index) => <div key={item.title} className="flex gap-3"><div className="w-[48px] pt-1 text-right"><div className="text-[11px] font-semibold">{item.time}</div><div className="text-[9px] text-[#98a19b]">{item.period}</div></div><div className="relative flex w-3 justify-center"><span className="absolute top-2 h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{index !== agenda.length - 1 && <span className="absolute top-5 h-[calc(100%-8px)] w-px bg-[#e8ece7]" />}</div><div className="mb-3 min-w-0 flex-1 rounded-xl bg-[#fafbf9] px-3 py-3"><div className="truncate text-[12px] font-semibold">{item.title}</div><div className="mt-1 text-[10px] text-[#87918b]">{item.detail}</div></div></div>)}</div>
                <button onClick={() => setActiveNav("Calendar")} className="mt-2 flex items-center gap-2 px-1 text-[11px] font-semibold text-[#176b52]">Open calendar <ArrowRight size={13} /></button>
              </div>

              <div id="assistant-chat" className="overflow-hidden rounded-2xl border border-[#dfe8df] bg-white">
                <div className="flex items-center justify-between border-b border-[#edf0ec] bg-[#fbfcfa] px-5 py-4"><div className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#176b52] text-white"><Sparkles size={16} /></div><div><div className="text-[13px] font-semibold">Your assistant</div><div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#76817c]"><span className="h-1.5 w-1.5 rounded-full bg-[#d9a34f]" />Preview mode</div></div></div><button aria-label="Chat help" onClick={() => setNotice("Chat responses are currently preview-only; live AI wiring comes next.")} className="text-[#929c95]"><CircleHelp size={16} /></button></div>
                <div className="space-y-4 p-4 sm:p-5">{chatMessages.map((message, index) => <div key={index} className={`flex gap-2.5 ${message.from === "user" ? "flex-row-reverse" : ""}`}>{message.from === "assistant" && <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e7f3ed] text-[#176b52]"><Sparkles size={14} /></div>}<div className={`max-w-[88%] rounded-2xl px-3.5 py-3 text-[11px] leading-[1.7] ${message.from === "user" ? "bg-[#176b52] text-white" : "bg-[#f5f7f3] text-[#47534c]"}`}>{message.text}</div></div>)}</div>
                <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="m-3 flex items-center gap-2 rounded-xl border border-[#e3e8e1] bg-white p-1.5 pl-3 focus-within:border-[#a4c8b0]"><input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask your assistant anything..." className="min-w-0 flex-1 bg-transparent py-2 text-[11px] outline-none placeholder:text-[#a1aaa4]" /><button aria-label="Send message" type="submit" disabled={!chatInput.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#176b52] text-white transition hover:bg-[#10543f] disabled:cursor-not-allowed disabled:opacity-40"><Send size={14} /></button></form>
                <div className="px-5 pb-4 text-center text-[9px] text-[#9ba49d]">Preview only · No email or calendar actions are executed</div>
              </div>
            </div>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e7ebe7] py-5 text-[10px] text-[#929c95]"><div className="flex items-center gap-2"><Activity size={13} />Your workday, thoughtfully organized.</div><div className="flex items-center gap-3"><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#d9a34f]" />Integrations not connected</span><span>·</span><span>Privacy-first by design</span></div></footer>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value, detail, icon, trend }: { label: string; value: string; detail: string; icon: React.ReactNode; trend: string }) {
  return <div className="rounded-2xl border border-[#e7ebe7] bg-white p-4.5"><div className="mb-4 flex items-center justify-between"><span className="text-[11px] font-medium text-[#76817c]">{label}</span><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f3f6f1] text-[#537661]">{icon}</span></div><div className="text-[27px] font-semibold tracking-[-.05em]">{value}</div><div className="mt-1 text-[10px] text-[#89938d]">{detail}</div><div className="mt-4 flex items-center gap-1.5 border-t border-[#edf0ec] pt-3 text-[10px] text-[#7c8880]"><span className="text-[#176b52]"><ArrowUpRight size={12} /></span>{trend}</div></div>;
}

function MailItem({ initials, sender, subject, summary, time, priority }: { initials: string; sender: string; subject: string; summary: string; time: string; priority: string }) {
  return <button onClick={() => {}} className="flex w-full gap-3 py-4 text-left transition hover:bg-[#fafbf9]"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef2ed] text-[10px] font-semibold text-[#597061]">{initials}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-1"><span className="truncate text-[11px] font-semibold">{sender}</span><span className="text-[9px] text-[#9aa39e]">{time}</span></div><div className="mt-1 truncate text-[11px] font-medium text-[#48544c]">{subject}</div><p className="mt-1 line-clamp-2 text-[10px] leading-[1.6] text-[#8a948d]">{summary}</p><span className="mt-2 inline-block rounded-md bg-[#f7f0df] px-2 py-1 text-[9px] font-medium text-[#96733c]">{priority}</span></div></button>;
}
