-- CreateEnum
CREATE TYPE "setting_scope" AS ENUM ('GLOBAL', 'SCHOOL', 'COURSE', 'UNIT', 'ASSESSMENT');

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL,
    "scope" "setting_scope" NOT NULL,
    "scope_id" UUID,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settings_key_idx" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "settings_scope_scope_id_key_key" ON "settings"("scope", "scope_id", "key");
