-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "article" TEXT,
    "responsible" TEXT,
    "overallStatus" TEXT NOT NULL DEFAULT 'active',
    "searchConnectors" TEXT NOT NULL DEFAULT 'not_started',
    "schemeDevelopment" TEXT NOT NULL DEFAULT 'not_started',
    "orderConnectors" TEXT NOT NULL DEFAULT 'not_started',
    "payment" TEXT NOT NULL DEFAULT 'not_started',
    "supplyConnectors" TEXT NOT NULL DEFAULT 'not_started',
    "orderTooling" TEXT NOT NULL DEFAULT 'not_started',
    "supplyTooling" TEXT NOT NULL DEFAULT 'not_started',
    "plannedDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChangeLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL DEFAULT 'Jarvis',
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeLogEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Project_overallStatus_idx" ON "Project"("overallStatus");

-- CreateIndex
CREATE INDEX "Project_plannedDate_idx" ON "Project"("plannedDate");

-- CreateIndex
CREATE INDEX "ChangeLogEntry_projectId_idx" ON "ChangeLogEntry"("projectId");

-- CreateIndex
CREATE INDEX "ChangeLogEntry_changedAt_idx" ON "ChangeLogEntry"("changedAt");
