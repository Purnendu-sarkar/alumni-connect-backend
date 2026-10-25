-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "academicId" TEXT,
ADD COLUMN     "admissionYear" TEXT,
ADD COLUMN     "currentSemester" TEXT,
ADD COLUMN     "employmentStatus" TEXT,
ADD COLUMN     "expectedGraduationYear" TEXT,
ADD COLUMN     "githubUrl" TEXT,
ADD COLUMN     "graduationYear" TEXT,
ADD COLUMN     "headline" TEXT,
ADD COLUMN     "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phonePublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "studentId" TEXT,
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "websiteUrl" TEXT;

-- Backfill existing verified users
UPDATE "User" SET "verificationStatus" = 'APPROVED', "verifiedAt" = CURRENT_TIMESTAMP WHERE "verified" = true;
UPDATE "User" SET "onboardingCompleted" = true WHERE "department" IS NOT NULL AND "batch" IS NOT NULL;

-- CreateIndex
CREATE INDEX "User_universityId_verificationStatus_idx" ON "User"("universityId", "verificationStatus");

-- CreateIndex
CREATE INDEX "User_universityId_roleId_verificationStatus_idx" ON "User"("universityId", "roleId", "verificationStatus");
