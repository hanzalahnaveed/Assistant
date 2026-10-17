DO $$ BEGIN
  CREATE TYPE "EmailDraftStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENDING', 'SENT', 'FAILED', 'SEND_UNCERTAIN', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE "EmailDraft" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "ccEmail" TEXT,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "goal" TEXT,
  "status" "EmailDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EmailDraft_userId_status_updatedAt_idx" ON "EmailDraft"("userId", "status", "updatedAt");
