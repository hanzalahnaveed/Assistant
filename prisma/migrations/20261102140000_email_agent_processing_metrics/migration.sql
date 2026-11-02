ALTER TABLE "InboundEmail"
ADD COLUMN "lastProcessingStartedAt" TIMESTAMP(3),
ADD COLUMN "lastProcessingDurationMs" INTEGER;
