-- CreateTable
CREATE TABLE "ProjectDrawing" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "drawingNo" INTEGER NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "sourceFile" TEXT,
    "sheetsJson" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDrawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingConnector" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "sheet" TEXT NOT NULL,
    "designator" TEXT NOT NULL,
    "bomPosition" TEXT,
    "purpose" TEXT,
    "housingPn" TEXT,
    "manufacturer" TEXT,
    "positions" TEXT,
    "contactPn" TEXT,
    "contactQty" TEXT,
    "status" TEXT,
    "note" TEXT,

    CONSTRAINT "DrawingConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingPin" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "sheet" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "housingPn" TEXT,
    "contactPn" TEXT,
    "pin" TEXT,
    "wire" TEXT,
    "color" TEXT,
    "crossSection" TEXT,
    "destination" TEXT,
    "doubleCrimp" BOOLEAN NOT NULL DEFAULT false,
    "crossSectionCheck" TEXT,
    "note" TEXT,

    CONSTRAINT "DrawingPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingNote" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "topic" TEXT,
    "text" TEXT NOT NULL,
    "recommendation" TEXT,

    CONSTRAINT "DrawingNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDrawing_drawingNo_key" ON "ProjectDrawing"("drawingNo");

-- CreateIndex
CREATE INDEX "ProjectDrawing_projectId_idx" ON "ProjectDrawing"("projectId");

-- CreateIndex
CREATE INDEX "DrawingConnector_drawingId_idx" ON "DrawingConnector"("drawingId");

-- CreateIndex
CREATE INDEX "DrawingPin_drawingId_idx" ON "DrawingPin"("drawingId");

-- CreateIndex
CREATE INDEX "DrawingNote_drawingId_idx" ON "DrawingNote"("drawingId");

-- AddForeignKey
ALTER TABLE "ProjectDrawing" ADD CONSTRAINT "ProjectDrawing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingConnector" ADD CONSTRAINT "DrawingConnector_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "ProjectDrawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingPin" ADD CONSTRAINT "DrawingPin_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "ProjectDrawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingNote" ADD CONSTRAINT "DrawingNote_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "ProjectDrawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
