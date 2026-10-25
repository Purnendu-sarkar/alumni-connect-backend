-- AlterTable
ALTER TABLE "University" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "University_isDemo_idx" ON "University"("isDemo");

-- CreateIndex
CREATE INDEX "User_isDemo_idx" ON "User"("isDemo");

-- CreateIndex
CREATE INDEX "User_universityId_isDemo_idx" ON "User"("universityId", "isDemo");
