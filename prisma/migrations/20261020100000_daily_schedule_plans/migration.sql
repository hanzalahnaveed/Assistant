CREATE TYPE "SchedulePlanStatus" AS ENUM ('DRAFT', 'APPROVED');

CREATE TABLE "DailySchedulePlan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "localDate" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi',
  "status" "SchedulePlanStatus" NOT NULL DEFAULT 'DRAFT',
  "blocks" JSONB NOT NULL DEFAULT '[]',
  "unscheduled" JSONB NOT NULL DEFAULT '[]',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailySchedulePlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailySchedulePlan_userId_localDate_key" ON "DailySchedulePlan"("userId", "localDate");
CREATE INDEX "DailySchedulePlan_userId_updatedAt_idx" ON "DailySchedulePlan"("userId", "updatedAt");
ALTER TABLE "DailySchedulePlan" ADD CONSTRAINT "DailySchedulePlan_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
