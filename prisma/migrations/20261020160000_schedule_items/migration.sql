ALTER TABLE "Task" RENAME TO "ScheduleItem";
ALTER TYPE "TaskStatus" RENAME TO "ScheduleItemStatus";
ALTER TYPE "TaskPriority" RENAME TO "ScheduleItemPriority";

ALTER TABLE "ScheduleItem" RENAME CONSTRAINT "Task_pkey" TO "ScheduleItem_pkey";
ALTER TABLE "ScheduleItem" RENAME CONSTRAINT "Task_userId_fkey" TO "ScheduleItem_userId_fkey";
ALTER INDEX "Task_userId_status_dueAt_idx" RENAME TO "ScheduleItem_userId_status_dueAt_idx";
ALTER INDEX "Task_userId_createdAt_idx" RENAME TO "ScheduleItem_userId_createdAt_idx";
ALTER INDEX "Task_userId_source_sourceRef_key" RENAME TO "ScheduleItem_userId_source_sourceRef_key";

ALTER TABLE "ScheduleItem"
  ADD COLUMN "scheduledStartAt" TIMESTAMP(3),
  ADD COLUMN "scheduledEndAt" TIMESTAMP(3),
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "allDay" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "attendees" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "calendarEventId" TEXT,
  ADD COLUMN "calendarEventEtag" TEXT,
  ADD COLUMN "calendarEventLink" TEXT;

UPDATE "ScheduleItem"
SET "scheduledStartAt" = "dueAt"
WHERE "dueAt" IS NOT NULL;

CREATE UNIQUE INDEX "ScheduleItem_userId_calendarEventId_key"
  ON "ScheduleItem"("userId", "calendarEventId");
