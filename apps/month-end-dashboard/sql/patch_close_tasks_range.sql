-- Patch close_tasks table to support date range scoping
-- Run this in Supabase SQL Editor

-- Add date range columns
ALTER TABLE med2.close_tasks
  ADD COLUMN IF NOT EXISTS range_from_date date,
  ADD COLUMN IF NOT EXISTS range_to_date date;

-- Add index for date range queries
CREATE INDEX IF NOT EXISTS idx_close_tasks_org_range
  ON med2.close_tasks(org_id, range_from_date, range_to_date);

