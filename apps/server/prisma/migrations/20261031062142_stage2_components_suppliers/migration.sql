-- CreateTable
CREATE TABLE "ComponentCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ComponentCatalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "internalArticle" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'шт',
    "imagePath" TEXT,
    "description" TEXT,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComponentCatalog_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ComponentCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'not_defined',
    "primaryOfferId" TEXT,
    "plannedPrice" DECIMAL,
    "plannedCurrency" TEXT,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectComponent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "ComponentCatalog" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectComponent_primaryOfferId_fkey" FOREIGN KEY ("primaryOfferId") REFERENCES "SupplierCrossReference" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "messenger" TEXT,
    "website" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'RUB',
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupplierCrossReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "supplierArticle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierCrossReference_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierCrossReference_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "ComponentCatalog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "crossReferenceId" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "minimumOrderQuantity" INTEGER,
    "availability" TEXT,
    "leadTimeDays" INTEGER,
    "effectiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceFileId" TEXT,
    CONSTRAINT "SupplierPrice_crossReferenceId_fkey" FOREIGN KEY ("crossReferenceId") REFERENCES "SupplierCrossReference" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierPrice_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "SupplierImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierPriceHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "crossReferenceId" TEXT NOT NULL,
    "oldPrice" DECIMAL,
    "newPrice" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceFileId" TEXT,
    CONSTRAINT "SupplierPriceHistory_crossReferenceId_fkey" FOREIGN KEY ("crossReferenceId") REFERENCES "SupplierCrossReference" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierImportProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "profileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "sheetName" TEXT,
    "headerRow" INTEGER NOT NULL DEFAULT 1,
    "dataStartRow" INTEGER NOT NULL DEFAULT 2,
    "columnMapping" TEXT NOT NULL,
    "importOptions" TEXT,
    "localSourceKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierImportProfile_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "profileId" TEXT,
    "sourceFile" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsCreated" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsRejected" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reportJson" TEXT,
    CONSTRAINT "SupplierImportBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierImportBatch_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "SupplierImportProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectCompetitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productUrl" TEXT,
    "price" DECIMAL,
    "currency" TEXT,
    "comment" TEXT,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectCompetitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierExportHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "selectedProjectIds" TEXT NOT NULL,
    "exportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowsExported" INTEGER NOT NULL,
    "excludedRows" INTEGER NOT NULL,
    "exportStatus" TEXT NOT NULL,
    CONSTRAINT "SupplierExportHistory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ComponentCategory_name_key" ON "ComponentCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentCatalog_internalArticle_key" ON "ComponentCatalog"("internalArticle");

-- CreateIndex
CREATE INDEX "ComponentCatalog_categoryId_idx" ON "ComponentCatalog"("categoryId");

-- CreateIndex
CREATE INDEX "ProjectComponent_componentId_idx" ON "ProjectComponent"("componentId");

-- CreateIndex
CREATE INDEX "ProjectComponent_primaryOfferId_idx" ON "ProjectComponent"("primaryOfferId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectComponent_projectId_componentId_key" ON "ProjectComponent"("projectId", "componentId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE INDEX "SupplierCrossReference_componentId_idx" ON "SupplierCrossReference"("componentId");

-- CreateIndex
CREATE INDEX "SupplierCrossReference_supplierId_idx" ON "SupplierCrossReference"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCrossReference_supplierId_componentId_supplierArticle_key" ON "SupplierCrossReference"("supplierId", "componentId", "supplierArticle");

-- CreateIndex
CREATE INDEX "SupplierPrice_crossReferenceId_effectiveAt_idx" ON "SupplierPrice"("crossReferenceId", "effectiveAt");

-- CreateIndex
CREATE INDEX "SupplierPriceHistory_crossReferenceId_changedAt_idx" ON "SupplierPriceHistory"("crossReferenceId", "changedAt");

-- CreateIndex
CREATE INDEX "SupplierImportProfile_supplierId_idx" ON "SupplierImportProfile"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierImportBatch_supplierId_sourceHash_idx" ON "SupplierImportBatch"("supplierId", "sourceHash");

-- CreateIndex
CREATE INDEX "ProjectCompetitor_projectId_idx" ON "ProjectCompetitor"("projectId");

-- CreateIndex
CREATE INDEX "ProjectImage_projectId_idx" ON "ProjectImage"("projectId");

-- CreateIndex
CREATE INDEX "SupplierExportHistory_supplierId_idx" ON "SupplierExportHistory"("supplierId");
