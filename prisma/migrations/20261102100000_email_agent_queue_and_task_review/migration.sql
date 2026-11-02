ALTER TABLE "InboundEmail"
  ADD COLUMN "processingAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "InboundEmail_userId_status_nextAttemptAt_createdAt_idx"
  ON "InboundEmail"("userId", "status", "nextAttemptAt", "createdAt");

CREATE TABLE "EmailAgentState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gmailPageToken" TEXT,
  "scanEnabledAt" TIMESTAMP(3),
  "pagesScanned" INTEGER NOT NULL DEFAULT 0,
  "lastScanPageAt" TIMESTAMP(3),
  "lastWorkerRunAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailAgentState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailAgentState_userId_key"
  ON "EmailAgentState"("userId");
CREATE INDEX "EmailAgentState_lastWorkerRunAt_idx"
  ON "EmailAgentState"("lastWorkerRunAt");

ALTER TABLE "EmailAgentState"
  ADD CONSTRAINT "EmailAgentState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
