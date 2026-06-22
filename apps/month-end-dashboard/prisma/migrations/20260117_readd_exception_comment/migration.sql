-- Add resolved fields to exceptions if not present
ALTER TABLE "med2"."exceptions"
ADD COLUMN IF NOT EXISTS "resolved_reason" TEXT,
ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ;

-- Add rule variance fields if not present
ALTER TABLE "med2"."rules"
ADD COLUMN IF NOT EXISTS "scope" TEXT DEFAULT 'ALL',
ADD COLUMN IF NOT EXISTS "variance_mode" TEXT DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS "variance_basis" TEXT,
ADD COLUMN IF NOT EXISTS "variance_threshold" DECIMAL;

-- Create exception_comments table if not exists
CREATE TABLE IF NOT EXISTS "med2"."exception_comments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "exception_id" UUID NOT NULL REFERENCES "med2"."exceptions"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL,
  "user_id" UUID,
  "user_email" TEXT,
  "text" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_exception_comments_exception_id" ON "med2"."exception_comments"("exception_id");
