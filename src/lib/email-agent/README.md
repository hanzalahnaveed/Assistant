# Email agent classification

The inbound email agent supports two classifier modes:

- **Live (default when `OPENAI_API_KEY` is set):** uses the configured OpenAI-compatible chat-completions endpoint.
- **Dummy/offline:** selected with `EMAIL_AGENT_CLASSIFIER_MODE=dummy`, or automatically when `OPENAI_API_KEY` is absent. This uses deterministic rules and makes no AI-provider network request.

The dummy classifier is intended for local development, CI, and safe fallback. It generates placeholder reply drafts and a normalized intent (`MEETING_REQUEST`, `RESCHEDULE`, `DECLINE_INVITE`, `TASK_DELEGATION`, or `OTHER`). It never sends mail or creates task action proposals. Meeting times are suggestions only; no calendar event is created.

Automatic replies are only eligible for live, non-sensitive `ROUTINE` messages with `OTHER` intent. Meeting, reschedule, decline, and task intents are held for review. Sensitive messages also require approval.

Run the token-free unit tests with:

```sh
npm run test:email-agent-dummy
```

The full CI workflow also runs parsing, calendar-timezone, Prisma, build, and production end-to-end checks. Live Gmail/Calendar behavior still requires a configured Google OAuth connection and should be tested in a dedicated test account before enabling automation.
