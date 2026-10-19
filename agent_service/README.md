# E-commerce Support Agent API

Python API foundation for the support workspace. This is a workflow scaffold, not a production-connected autonomous agent yet.

## Run locally

Requires Python 3.10+.

```bash
cd agent_service
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
# .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

- Health: http://localhost:8000/health
- Interactive API docs: http://localhost:8000/docs
- Ticket list: http://localhost:8000/api/v1/tickets
- Overview metrics: http://localhost:8000/api/v1/overview

The frontend at /support calls this API on http://localhost:8000 by default. Set NEXT_PUBLIC_AGENT_API_URL to change the API origin.

## Current workflow

1. Browse and filter example tickets.
2. Select a ticket and review its customer message.
3. Request a draft and edit it in the workspace.
4. Approve a draft or escalate the ticket.

## Safety and current limitations

- Ticket records are in-memory demo fixtures; restarting the API resets changes.
- The draft endpoint returns a fixture-backed fallback, not an LLM-generated response.
- Approval records a demo action only; it does not send a customer message.
- No ticketing system, Slack, store API, database, authentication, or live model is connected yet.
- Configure CORS, authentication, persistent storage, and provider-specific policies before deployment.
- Customer-impacting actions must remain review-gated until the integrations and audit trail are tested.
