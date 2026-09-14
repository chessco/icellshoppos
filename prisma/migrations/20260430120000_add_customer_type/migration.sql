-- Add customer classification to support retail vs wholesale reporting and filtering.
DO $$
BEGIN
  CREATE TYPE "CustomerType" AS ENUM ('retail', 'wholesale');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Customer"
ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'retail';
