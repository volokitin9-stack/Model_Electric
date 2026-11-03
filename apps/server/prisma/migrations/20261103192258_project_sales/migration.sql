-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "salesAvgPriceRub" DECIMAL(65,30),
ADD COLUMN     "salesQty28d" INTEGER,
ADD COLUMN     "salesSumRub" DECIMAL(65,30),
ADD COLUMN     "salesUpdatedAt" TIMESTAMP(3);
