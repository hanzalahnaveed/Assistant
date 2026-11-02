# Email agent classification

The inbound email worker supports two explicit classifier modes:

- **Dummy/offline** (`EMAIL_AGENT_CLASSIFIER_MODE=dummy`): deterministic local rules, no AI-provider request, no API key required. This is the default in `.env.example`.
- **Groq/live** (`EMAIL_AGENT_CLASSIFIER_MODE=groq`): uses the configured Groq-compatible chat-completions endpoint and requires `GROQ_API_KEY`.

When the mode is omitted, the worker uses Groq if `GROQ_API_KEY` is present; otherwise it uses the dummy classifier. An explicitly selected `groq` mode without a key fails with a configuration error instead of silently changing behavior. Unknown mode values also fail closed.

The dummy classifier produces a normalized intent (`MEETING_REQUEST`, `RESCHEDULE`, `DECLINE_INVITE`, `TASK_DELEGATION`, or `OTHER`) and a placeholder reply. It is intended for local development, CI, and safe fallback. Its output is always marked `DUMMY`; it cannot authorize automatic sending or create calendar events. Meeting times are suggestions only.

**All inbound replies remain drafts in every mode.** The manager must review/edit the draft, explicitly approve it, and separately choose Send. Meeting requests can show advisory calendar slots; creating an event requires a separate, explicit slot selection and confirmation, and the resulting reply still remains a draft.

Run the token-free unit tests with:

```sh
npm run test:email-agent-dummy
```

The full CI workflow also runs parsing, calendar-timezone, Prisma, build, and production end-to-end checks. Live Gmail/Calendar behavior still requires a configured Google OAuth connection and should be tested in a dedicated test account before production use.
