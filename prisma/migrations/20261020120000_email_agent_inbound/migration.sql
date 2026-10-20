ALTER TABLE "EmailDraft"
  ADD COLUMN "replyThreadId" TEXT,
  ADD COLUMN "replyMessageId" TEXT;

CREATE TABLE "InboundEmail" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gmailMessageId" TEXT NOT NULL,
  "gmailThreadId" TEXT NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "category" TEXT NOT NULL DEFAULT 'OTHER',
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  "summary" TEXT,
  "classification" JSONB NOT NULL DEFAULT '{}',
  "draftId" TEXT,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundEmail_userId_gmailMessageId_key"
  ON "InboundEmail"("userId", "gmailMessageId");
CREATE INDEX "InboundEmail_userId_status_receivedAt_idx"
  ON "InboundEmail"("userId", "status", "receivedAt");
CREATE INDEX "InboundEmail_userId_createdAt_idx"
  ON "InboundEmail"("userId", "createdAt");
ALTER TABLE "InboundEmail"
  ADD CONSTRAINT "InboundEmail_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
