-- Idempotent baseline for repositories that previously relied on schema push.
-- Existing tables are preserved; a fresh database gets the current application schema.
DO $$ BEGIN CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "IntegrationProvider" AS ENUM ('GOOGLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'APPROVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ApprovalMode" AS ENUM ('AUTO', 'CONFIRM', 'BLOCK'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT, "name" TEXT, "imageUrl" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

CREATE TABLE IF NOT EXISTS "UserPreference" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "dailyBriefingEnabled" BOOLEAN NOT NULL DEFAULT true,
  "briefingHour" INTEGER NOT NULL DEFAULT 8, "defaultApprovalMode" "ApprovalMode" NOT NULL DEFAULT 'CONFIRM',
  "preferencesJson" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Integration" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "provider" "IntegrationProvider" NOT NULL, "providerAccountId" TEXT,
  "email" TEXT, "accessTokenEnc" TEXT, "refreshTokenEnc" TEXT, "tokenExpiresAt" TIMESTAMP(3), "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lastSyncedAt" TIMESTAMP(3), "syncCursor" TEXT, "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Integration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Integration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Task" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'TODO', "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "dueAt" TIMESTAMP(3), "source" TEXT NOT NULL DEFAULT 'USER', "sourceRef" TEXT, "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "title" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "AutomationRule" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "actionType" TEXT NOT NULL,
  "mode" "ApprovalMode" NOT NULL DEFAULT 'CONFIRM', "enabled" BOOLEAN NOT NULL DEFAULT true,
  "conditions" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "ActionRecord" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "actionType" TEXT NOT NULL,
  "status" "ActionStatus" NOT NULL DEFAULT 'PENDING', "idempotencyKey" TEXT NOT NULL,
  "input" JSONB NOT NULL DEFAULT '{}', "result" JSONB NOT NULL DEFAULT '{}',
  "requiresApproval" BOOLEAN NOT NULL DEFAULT true, "approvedAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "errorCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ActionRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "eventType" TEXT NOT NULL, "actor" TEXT NOT NULL DEFAULT 'SYSTEM',
  "resourceId" TEXT, "metadata" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "DailyBriefing" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "localDate" TEXT NOT NULL, "timezone" TEXT NOT NULL,
  "summary" TEXT NOT NULL, "content" JSONB NOT NULL DEFAULT '{}', "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3), CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "type" TEXT NOT NULL,
  "title" TEXT NOT NULL, "body" TEXT NOT NULL, "payload" JSONB NOT NULL DEFAULT '{}', "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "UserPreference_userId_key" ON "UserPreference"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Integration_userId_provider_providerAccountId_key" ON "Integration"("userId", "provider", "providerAccountId");
CREATE INDEX IF NOT EXISTS "Integration_userId_provider_idx" ON "Integration"("userId", "provider");
CREATE INDEX IF NOT EXISTS "Task_userId_status_dueAt_idx" ON "Task"("userId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "Task_userId_createdAt_idx" ON "Task"("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Task_userId_source_sourceRef_key" ON "Task"("userId", "source", "sourceRef");
CREATE INDEX IF NOT EXISTS "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationRule_userId_enabled_idx" ON "AutomationRule"("userId", "enabled");
CREATE UNIQUE INDEX IF NOT EXISTS "ActionRecord_userId_idempotencyKey_key" ON "ActionRecord"("userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "ActionRecord_userId_status_createdAt_idx" ON "ActionRecord"("userId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_eventType_createdAt_idx" ON "AuditEvent"("eventType", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "DailyBriefing_userId_localDate_key" ON "DailyBriefing"("userId", "localDate");
CREATE INDEX IF NOT EXISTS "DailyBriefing_userId_generatedAt_idx" ON "DailyBriefing"("userId", "generatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_idempotencyKey_key" ON "Notification"("userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
