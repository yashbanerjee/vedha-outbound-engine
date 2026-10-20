-- CreateIndex
CREATE INDEX "EmailMessage_createdAt_idx" ON "EmailMessage"("createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_direction_status_createdAt_idx" ON "EmailMessage"("direction", "status", "createdAt");
