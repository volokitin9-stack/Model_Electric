-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
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
    "plannedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ComponentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentCatalog" (
    "id" TEXT NOT NULL,
    "internalArticle" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'шт',
    "imagePath" TEXT,
    "description" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponentCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectComponent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'not_defined',
    "primaryOfferId" TEXT,
    "plannedPrice" DECIMAL(65,30),
    "plannedCurrency" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCrossReference" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "supplierArticle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierCrossReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPrice" (
    "id" TEXT NOT NULL,
    "crossReferenceId" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "minimumOrderQuantity" INTEGER,
    "availability" TEXT,
    "leadTimeDays" INTEGER,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceFileId" TEXT,

    CONSTRAINT "SupplierPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPriceHistory" (
    "id" TEXT NOT NULL,
    "crossReferenceId" TEXT NOT NULL,
    "oldPrice" DECIMAL(65,30),
    "newPrice" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceFileId" TEXT,

    CONSTRAINT "SupplierPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierImportProfile" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "profileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "sheetName" TEXT,
    "headerRow" INTEGER NOT NULL DEFAULT 1,
    "dataStartRow" INTEGER NOT NULL DEFAULT 2,
    "columnMapping" TEXT NOT NULL,
    "importOptions" TEXT,
    "localSourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierImportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierImportBatch" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "profileId" TEXT,
    "sourceFile" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsCreated" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsRejected" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reportJson" TEXT,

    CONSTRAINT "SupplierImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCompetitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productUrl" TEXT,
    "price" DECIMAL(65,30),
    "currency" TEXT,
    "comment" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectImage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierExportHistory" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "selectedProjectIds" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowsExported" INTEGER NOT NULL,
    "excludedRows" INTEGER NOT NULL,
    "exportStatus" TEXT NOT NULL,

    CONSTRAINT "SupplierExportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeLogEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL DEFAULT 'Jarvis',
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_overallStatus_idx" ON "Project"("overallStatus");

-- CreateIndex
CREATE INDEX "Project_plannedDate_idx" ON "Project"("plannedDate");

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
CREATE UNIQUE INDEX "SupplierCrossReference_supplierId_componentId_supplierArtic_key" ON "SupplierCrossReference"("supplierId", "componentId", "supplierArticle");

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

-- CreateIndex
CREATE INDEX "ChangeLogEntry_projectId_idx" ON "ChangeLogEntry"("projectId");

-- CreateIndex
CREATE INDEX "ChangeLogEntry_changedAt_idx" ON "ChangeLogEntry"("changedAt");

-- AddForeignKey
ALTER TABLE "ComponentCatalog" ADD CONSTRAINT "ComponentCatalog_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ComponentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComponent" ADD CONSTRAINT "ProjectComponent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComponent" ADD CONSTRAINT "ProjectComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "ComponentCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComponent" ADD CONSTRAINT "ProjectComponent_primaryOfferId_fkey" FOREIGN KEY ("primaryOfferId") REFERENCES "SupplierCrossReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCrossReference" ADD CONSTRAINT "SupplierCrossReference_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCrossReference" ADD CONSTRAINT "SupplierCrossReference_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "ComponentCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_crossReferenceId_fkey" FOREIGN KEY ("crossReferenceId") REFERENCES "SupplierCrossReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "SupplierImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPriceHistory" ADD CONSTRAINT "SupplierPriceHistory_crossReferenceId_fkey" FOREIGN KEY ("crossReferenceId") REFERENCES "SupplierCrossReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierImportProfile" ADD CONSTRAINT "SupplierImportProfile_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierImportBatch" ADD CONSTRAINT "SupplierImportBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierImportBatch" ADD CONSTRAINT "SupplierImportBatch_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "SupplierImportProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCompetitor" ADD CONSTRAINT "ProjectCompetitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectImage" ADD CONSTRAINT "ProjectImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierExportHistory" ADD CONSTRAINT "SupplierExportHistory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeLogEntry" ADD CONSTRAINT "ChangeLogEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
