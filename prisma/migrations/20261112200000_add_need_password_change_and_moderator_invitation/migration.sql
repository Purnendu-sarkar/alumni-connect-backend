-- AlterEnum
BEGIN;
CREATE TYPE "RoleName_new" AS ENUM ('STUDENT', 'ALUMNI', 'MODERATOR', 'SUPER_ADMIN');
ALTER TABLE "Role" ALTER COLUMN "name" TYPE "RoleName_new" USING ("name"::text::"RoleName_new");
ALTER TYPE "RoleName" RENAME TO "RoleName_old";
ALTER TYPE "RoleName_new" RENAME TO "RoleName";
DROP TYPE "public"."RoleName_old";
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "needPasswordChange" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ModeratorInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeratorInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModeratorInvitation_email_key" ON "ModeratorInvitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ModeratorInvitation_tokenHash_key" ON "ModeratorInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "ModeratorInvitation_email_idx" ON "ModeratorInvitation"("email");

-- CreateIndex
CREATE INDEX "ModeratorInvitation_tokenHash_idx" ON "ModeratorInvitation"("tokenHash");

-- AddForeignKey
ALTER TABLE "ModeratorInvitation" ADD CONSTRAINT "ModeratorInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
