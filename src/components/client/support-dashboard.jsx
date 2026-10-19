"use client";

import { useMemo, useState } from "react";
import {
  Activity, AlertCircle, ArrowDownLeft, ArrowUpRight, Bot, Check,
  ChevronDown, CircleHelp, Clock3, Inbox, LifeBuoy, MessageSquare,
  MoreHorizontal, Search, Send, Settings2, ShieldCheck, Sparkles,
  Tag, UserRound, Zap,
} from "lucide-react";

const seedTickets = [
  { id: "TKT-1048", customer: "Olivia Martin", initials: "OM", subject: "Order marked delivered but not received", channel: "Email", status: "pending_review", priority: "urgent", category: "Shipping", order: "#ORD-8214", time: "4 min ago", message: "Hi, my order says delivered but nothing arrived. Could you please help?", confidence: 94, draft: "Hi Olivia, I'm sorry your order hasn't arrived even though tracking shows it as delivered. We'll help investigate this right away. Could you confirm the delivery address and check whether a neighbor or building reception accepted it? We'll review the carrier details and follow up with the next steps." },
  { id: "TKT-1047", customer: "Noah Williams", initials: "NW", subject: "Request to exchange size", channel: "Web chat", status: "open", priority: "normal", category: "Returns", order: "#ORD-8201", time: "18 min ago", message: "The jacket I ordered is too small. Can I exchange it for a large?", confidence: 89, draft: "Hi Noah, thanks for reaching out! I can help you with an exchange. I'll first check the order details and the exchange eligibility for your item. If it qualifies, we'll share the steps to exchange it for a large." },
  { id: "TKT-1046", customer: "Ava Patel", initials: "AP", subject: "Question about refund timeline", channel: "Email", status: "in_progress", priority: "normal", category: "Refunds", order: "#ORD-8189", time: "42 min ago", message: "My return was delivered last week. When should I expect my refund?", confidence: 86, draft: "Hi Ava, thanks for checking in. Refund timing can depend on the return processing status and your payment provider. We'll verify that your return has been processed and confirm the expected timeline as soon as we have the latest status." },
  { id: "TKT-1045", customer: "Liam Chen", initials: "LC", subject: "Item arrived damaged", channel: "Web form", status: "escalated", priority: "high", category: "Damaged item", order: "#ORD-8172", time: "1 hr ago", message: "The ceramic mug arrived broken. I have photos if needed.", confidence: 91, draft: "Hi Liam, I'm sorry your mug arrived damaged. We can help with the next steps. Please share a photo of the item and packaging so our team can review the issue and confirm the appropriate replacement or refund options." },
];

const statusLabel = { open: "Open", in_progress: "In progress", pending_review: "Needs review", escalated: "Escalated", resolved: "Resolved" };

export default function SupportDashboard() {
  const [tickets, setTickets] = useState(seedTickets);
  const [selectedId, setSelectedId] = useState("TKT-1048");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = tickets.find((ticket) => ticket.id === selectedId) || tickets[0];
  const visible = useMemo(() => tickets.filter((ticket) => (filter === "all" || ticket.status === filter) && (ticket.subject + ticket.customer + ticket.id).toLowerCase().includes(search.toLowerCase())), [tickets, filter, search]);
  const currentDraft = drafts[selected.id] ?? selected.draft;
  const updateTicket = (id, patch) => setTickets((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));

  async function generateDraft() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch((process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000") + "/api/v1/agent/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: selected.id, tone: "professional" }),
      });
      if (!response.ok) throw new Error("Agent API is not available");
      const result = await response.json();
      setDrafts((items) => ({ ...items, [selected.id]: result.draft }));
      setNotice(result.provider === "demo_fallback" ? "Demo draft loaded. Connect an AI provider for live generation." : "Draft generated.");
    } catch {
      setNotice("Showing the sample draft. Start the Python API to enable workflow actions.");
    } finally { setBusy(false); }
  }

  async function approveDraft() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch((process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000") + "/api/v1/agent/approve-reply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: selected.id, message: currentDraft, approved_by: "dashboard-user" }),
      });
      if (!response.ok) throw new Error("Agent API is not available");
      const result = await response.json();
      updateTicket(selected.id, { status: "in_progress" });
      setNotice(result.sent ? "Reply sent." : "Approval recorded in demo mode — no message was sent.");
    } catch { setNotice("Could not record approval. Start the Python API and try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="support-shell">
      <aside className="support-sidebar">
        <a href="/support" className="support-brand"><span className="support-brand-mark"><LifeBuoy size={21}/></span><span>helpwise<span className="support-brand-sub">AI SUPPORT DESK</span></span></a>
        <div className="support-workspace"><span className="workspace-avatar">S</span><span><strong>Store workspace</strong><small>E-commerce team</small></span><ChevronDown size={15}/></div>
        <div className="support-nav-label">WORKSPACE</div>
        <a className="support-nav-item active" href="/support"><Inbox size={17}/> Inbox <span className="nav-count">12</span></a>
        <a className="support-nav-item" href="/actions"><Check size={17}/> Approvals</a>
        <a className="support-nav-item" href="/briefing"><Activity size={17}/> Activity</a>
        <a className="support-nav-item" href="/integrations"><Settings2 size={17}/> Integrations</a>
        <div className="support-sidebar-bottom"><div className="support-online"><span/> Agent system <strong>Demo</strong></div><div className="support-user"><span className="workspace-avatar">JD</span><span><strong>Jordan Davis</strong><small>Support manager</small></span><MoreHorizontal size={18}/></div></div>
      </aside>
      <main className="support-main">
        <header className="support-topbar"><div><div className="support-breadcrumb">Workspace <span>/</span> <strong>Inbox</strong></div><h1>Customer support</h1><p>Review conversations, let AI handle the routine, and keep every customer cared for.</p></div><div className="support-top-actions"><span className="support-date"><span/> All systems demo</span><button className="support-icon-button" aria-label="Notifications"><CircleHelp size={18}/></button><button className="support-primary" onClick={() => setNotice("Connect a ticket source in Integrations to import live conversations.")}><Zap size={16}/> Connect inbox</button></div></header>
        <section className="support-metrics">
          <article className="support-metric"><div className="metric-top"><span>Open conversations</span><span className="metric-icon blue"><MessageSquare size={17}/></span></div><div className="metric-value">128 <span className="metric-change"><ArrowUpRight size={14}/> 12%</span></div><small>vs. last 7 days</small></article>
          <article className="support-metric"><div className="metric-top"><span>Needs your review</span><span className="metric-icon amber"><ShieldCheck size={17}/></span></div><div className="metric-value">{tickets.filter(t => t.status === "pending_review").length + 7}<span className="metric-note"> drafts</span></div><small>AI replies waiting for approval</small></article>
          <article className="support-metric"><div className="metric-top"><span>Resolved today</span><span className="metric-icon green"><Check size={17}/></span></div><div className="metric-value">86 <span className="metric-change"><ArrowUpRight size={14}/> 8.4%</span></div><small>Across all channels</small></article>
          <article className="support-metric"><div className="metric-top"><span>AI resolution rate</span><span className="metric-icon purple"><Sparkles size={17}/></span></div><div className="metric-value">72<span className="metric-percent">%</span></div><small>Resolved without escalation</small></article>
        </section>
        <section className="support-work-area">
          <div className="support-ticket-panel">
            <div className="support-panel-heading"><div><h2>Conversations <span className="support-pill">{visible.length}</span></h2><p>Your team’s latest customer messages</p></div><button className="support-icon-button" aria-label="Filter settings"><Settings2 size={17}/></button></div>
            <label className="support-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations..."/></label>
            <div className="support-filters">{[["all","All"],["open","Open"],["pending_review","Review"],["escalated","Escalated"]].map(([key,label]) => <button key={key} onClick={() => setFilter(key)} className={filter === key ? "selected" : ""}>{label}</button>)}</div>
            <div className="support-ticket-list">{visible.map((ticket) => <button key={ticket.id} className={"support-ticket-row " + (selectedId === ticket.id ? "chosen" : "")} onClick={() => { setSelectedId(ticket.id); setNotice(""); }}>
              <span className={"ticket-avatar " + ticket.initials.toLowerCase()}>{ticket.initials}</span><span className="ticket-row-copy"><span className="ticket-row-top"><strong>{ticket.customer}</strong><time>{ticket.time}</time></span><span className="ticket-subject">{ticket.subject}</span><span className="ticket-row-bottom"><span className={"status-dot " + ticket.status}/>{statusLabel[ticket.status]}<span className="ticket-channel">{ticket.channel}</span>{ticket.priority === "urgent" && <span className="ticket-urgent">Urgent</span>}</span></span>
            </button>)}
            {visible.length === 0 && <div className="support-empty">No conversations match this filter.</div>}</div>
            <div className="support-list-footer">Showing {visible.length} sample conversations <ArrowDownLeft size={14}/></div>
          </div>
          <div className="support-detail-panel">
            <div className="support-detail-header"><div><div className="support-detail-id">{selected.id} <span className={"priority-tag " + selected.priority}>{selected.priority} priority</span></div><h2>{selected.subject}</h2></div><button className="support-icon-button" aria-label="More ticket actions"><MoreHorizontal size={19}/></button></div>
            <div className="support-customer-strip"><span className={"ticket-avatar " + selected.initials.toLowerCase()}>{selected.initials}</span><div><strong>{selected.customer}</strong><span>{selected.email || "customer@example.com"}</span></div><button className="support-outline-button" onClick={() => setNotice("Customer profile details will be available after CRM integration.")}><UserRound size={15}/> Profile</button></div>
            <div className="support-order-strip"><span><Tag size={15}/> Order <strong>{selected.order}</strong></span><span><Clock3 size={15}/> Updated {selected.time}</span><span className="category-tag">{selected.category}</span></div>
            <div className="support-conversation"><div className="conversation-day">TODAY · EMAIL CONVERSATION</div><div className="message-bubble"><div className="message-author"><span className={"ticket-avatar small " + selected.initials.toLowerCase()}>{selected.initials}</span><strong>{selected.customer}</strong><time>{selected.time}</time></div><p>{selected.message}</p></div><div className="ai-context-note"><Sparkles size={15}/><span><strong>AI insight</strong> · {selected.priority === "urgent" ? "Delivery issue detected. Verify carrier details before promising a resolution." : selected.category === "Returns" ? "Exchange request detected. Verify item eligibility before confirming the exchange." : "Acknowledge the concern and verify order details before committing to a timeline."}</span></div></div>
            <div className="support-reply-area"><div className="reply-heading"><span><Bot size={17}/> AI reply draft</span><span className="confidence-tag"><span/> {selected.confidence}% confidence</span></div><textarea aria-label="AI reply draft" value={currentDraft} onChange={(event) => setDrafts((items) => ({ ...items, [selected.id]: event.target.value }))}/><div className="reply-toolbar"><button className="support-outline-button" onClick={generateDraft} disabled={busy}><Sparkles size={15}/>{busy ? "Working..." : "Regenerate draft"}</button><span>Editable · Not sent</span></div><div className="reply-disclaimer"><ShieldCheck size={15}/> Review the response before approval. This demo does not send customer messages.</div><div className="reply-actions"><button className="support-outline-button" onClick={() => { updateTicket(selected.id, { status: "escalated" }); setNotice("Ticket marked for human follow-up."); }}><AlertCircle size={16}/> Escalate</button><button className="support-primary" disabled={busy} onClick={approveDraft}><Check size={16}/> Approve reply <Send size={14}/></button></div>{notice && <div className="support-notice" role="status">{notice}</div>}</div>
          </div>
        </section>
        <footer className="support-footer"><span><span className="support-footer-dot"/> Workflow preview · Sample data</span><span>Customer messages require review until integrations are configured.</span></footer>
      </main>
    </div>
  );
}
