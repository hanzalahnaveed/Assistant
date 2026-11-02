# Milestone 11 — Secure account deletion

## Objective

Complete the account lifecycle with a user-initiated deletion flow that removes the account and all tenant-owned application records.

## Delivered

- Added a signed-in account deletion endpoint requiring the exact account email and confirmation phrase.
- Password-based accounts must provide the current password, checked with the existing scrypt verifier.
- Passwordless Google accounts use a fresh Google OAuth identity check. The verified Google email must match the Assistant account email.
- Google token revocation is attempted before local deletion but does not block deletion if Google is unavailable.
- Deleting the User relies on Prisma cascade relations to remove preferences, integrations, schedule items, conversations/messages, actions, audit history, drafts, inbound queue rows, follow-ups, briefings, and notifications.
- Clears the current session after successful deletion.
- Adds a destructive account control in the integrations/account settings area.

## Safety

- Requires a valid session, same-origin request, exact account email, and exact confirmation phrase.
- Requires current password or a fresh verified Google identity.
- Google-only accounts are not deleted until the OAuth callback verifies the matching email.
- The operation is irreversible. Export important data first.
