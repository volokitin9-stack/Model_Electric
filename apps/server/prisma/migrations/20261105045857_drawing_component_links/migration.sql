-- AlterTable
ALTER TABLE "DrawingConnector" ADD COLUMN     "componentId" TEXT;

-- AlterTable
ALTER TABLE "DrawingPin" ADD COLUMN     "componentId" TEXT;

-- CreateIndex
CREATE INDEX "DrawingConnector_componentId_idx" ON "DrawingConnector"("componentId");

-- CreateIndex
CREATE INDEX "DrawingPin_componentId_idx" ON "DrawingPin"("componentId");

-- AddForeignKey
ALTER TABLE "DrawingConnector" ADD CONSTRAINT "DrawingConnector_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "ComponentCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingPin" ADD CONSTRAINT "DrawingPin_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "ComponentCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
