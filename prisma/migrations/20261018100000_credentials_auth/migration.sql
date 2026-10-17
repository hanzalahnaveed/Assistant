-- Add credentials authentication without changing existing accounts or removing Google sign-in.
-- Nullable by design: existing Google-only users can continue using Google until they set a password.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
