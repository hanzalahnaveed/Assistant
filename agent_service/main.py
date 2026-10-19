"""FastAPI foundation for the e-commerce customer support agent.

This first milestone exposes a stable workflow API with safe demo data.
Ticket-provider, Slack, and LLM integrations are intentionally adapter-ready
and are not represented as connected until configured.
"""
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="E-commerce Support Agent API",
    version="0.1.0",
    description="Workflow API for triaging support tickets and reviewing AI reply drafts.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

TicketStatus = Literal["open", "in_progress", "pending_review", "resolved", "escalated"]
Priority = Literal["low", "normal", "high", "urgent"]

TICKETS: list[dict] = [
    {
        "id": "TKT-1048",
        "customer": "Olivia Martin",
        "email": "olivia@example.com",
        "subject": "Order marked delivered but not received",
        "channel": "Email",
        "status": "pending_review",
        "priority": "urgent",
        "category": "Shipping",
        "order_id": "#ORD-8214",
        "updated_at": "4 min ago",
        "message": "Hi, my order says delivered but nothing arrived. Could you please help?",
        "draft": "Hi Olivia, I'm sorry your order hasn't arrived even though tracking shows it as delivered. We'll help investigate this right away. Could you confirm the delivery address and check whether a neighbor or building reception accepted it? We'll review the carrier details and follow up with the next steps.",
        "confidence": 0.94,
        "needs_human": True,
    },
    {
        "id": "TKT-1047",
        "customer": "Noah Williams",
        "email": "noah@example.com",
        "subject": "Request to exchange size",
        "channel": "Web chat",
        "status": "open",
        "priority": "normal",
        "category": "Returns",
        "order_id": "#ORD-8201",
        "updated_at": "18 min ago",
        "message": "The jacket I ordered is too small. Can I exchange it for a large?",
        "draft": "Hi Noah, thanks for reaching out! I can help you with an exchange. I'll first check the order details and the exchange eligibility for your item. If it qualifies, we'll share the steps to exchange it for a large.",
        "confidence": 0.89,
        "needs_human": False,
    },
    {
        "id": "TKT-1046",
        "customer": "Ava Patel",
        "email": "ava@example.com",
        "subject": "Question about refund timeline",
        "channel": "Email",
        "status": "in_progress",
        "priority": "normal",
        "category": "Refunds",
        "order_id": "#ORD-8189",
        "updated_at": "42 min ago",
        "message": "My return was delivered last week. When should I expect my refund?",
        "draft": "Hi Ava, thanks for checking in. Refund timing can depend on the return processing status and your payment provider. We'll verify that your return has been processed and confirm the expected timeline as soon as we have the latest status.",
        "confidence": 0.86,
        "needs_human": False,
    },
    {
        "id": "TKT-1045",
        "customer": "Liam Chen",
        "email": "liam@example.com",
        "subject": "Item arrived damaged",
        "channel": "Web form",
        "status": "escalated",
        "priority": "high",
        "category": "Damaged item",
        "order_id": "#ORD-8172",
        "updated_at": "1 hr ago",
        "message": "The ceramic mug arrived broken. I have photos if needed.",
        "draft": "Hi Liam, I'm sorry your mug arrived damaged. We can help with the next steps. Please share a photo of the item and packaging so our team can review the issue and confirm the appropriate replacement or refund options.",
        "confidence": 0.91,
        "needs_human": True,
    },
]


class DraftRequest(BaseModel):
    ticket_id: str
    tone: Literal["professional", "warm", "concise"] = "professional"
    extra_context: str = Field(default="", max_length=2000)


class ReplyRequest(BaseModel):
    ticket_id: str
    message: str = Field(min_length=1, max_length=10000)
    approved_by: str = Field(default="dashboard-user", max_length=200)


class TicketUpdate(BaseModel):
    status: TicketStatus | None = None
    priority: Priority | None = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "ecommerce-support-agent", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/v1/overview")
def overview():
    return {
        "total": len(TICKETS),
        "open": sum(t["status"] == "open" for t in TICKETS),
        "pending_review": sum(t["status"] == "pending_review" for t in TICKETS),
        "urgent": sum(t["priority"] == "urgent" for t in TICKETS),
        "resolved_today": 18,
        "automation_rate": 72,
    }


@app.get("/api/v1/tickets")
def list_tickets(status: str | None = None, q: str | None = None):
    tickets = TICKETS
    if status and status != "all":
        tickets = [t for t in tickets if t["status"] == status]
    if q:
        needle = q.casefold()
        tickets = [
            t for t in tickets
            if needle in " ".join([t["id"], t["customer"], t["subject"], t["category"]]).casefold()
        ]
    return {"items": tickets, "count": len(tickets)}


@app.get("/api/v1/tickets/{ticket_id}")
def get_ticket(ticket_id: str):
    ticket = next((t for t in TICKETS if t["id"] == ticket_id), None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@app.post("/api/v1/agent/draft")
def draft_reply(request: DraftRequest):
    ticket = next((t for t in TICKETS if t["id"] == request.ticket_id), None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    # Workflow scaffold: use a safe existing draft until an LLM provider is configured.
    # Never claim this deterministic fallback is a live model-generated response.
    return {
        "id": str(uuid4()),
        "ticket_id": ticket["id"],
        "draft": ticket["draft"],
        "tone": request.tone,
        "confidence": ticket["confidence"],
        "provider": "demo_fallback",
        "requires_review": True,
        "note": "Demo draft returned. Configure an AI provider before production use.",
    }


@app.patch("/api/v1/tickets/{ticket_id}")
def update_ticket(ticket_id: str, request: TicketUpdate):
    ticket = next((t for t in TICKETS if t["id"] == ticket_id), None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if request.status is not None:
        ticket["status"] = request.status
    if request.priority is not None:
        ticket["priority"] = request.priority
    return ticket


@app.post("/api/v1/agent/approve-reply")
def approve_reply(request: ReplyRequest):
    ticket = next((t for t in TICKETS if t["id"] == request.ticket_id), None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    # Approval is recorded in this demo service only. No customer message is sent.
    ticket["status"] = "in_progress"
    return {
        "action_id": str(uuid4()),
        "ticket_id": ticket["id"],
        "status": "approved_for_send",
        "sent": False,
        "approved_by": request.approved_by,
        "message": "Reply approved in demo mode. Connect a ticket provider to send it.",
    }
