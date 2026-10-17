CREATE TYPE "MeetingDraftStatus" AS ENUM ('DRAFT', 'APPROVED', 'CREATING', 'CREATED', 'FAILED', 'CREATE_UNCERTAIN', 'CANCELLED');

CREATE TABLE "MeetingDraft" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "location" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi',
  "attendees" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "MeetingDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedAt" TIMESTAMP(3),
  "createdEventId" TEXT,
  "createdEventLink" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeetingDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MeetingDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MeetingDraft_userId_status_startAt_idx" ON "MeetingDraft"("userId", "status", "startAt");
CREATE INDEX "MeetingDraft_userId_updatedAt_idx" ON "MeetingDraft"("userId", "updatedAt");
