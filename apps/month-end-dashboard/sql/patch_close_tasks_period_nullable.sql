-- Make period_id nullable in close_tasks table
-- This allows tasks to be created without being tied to a specific period

ALTER TABLE med2.close_tasks 
ALTER COLUMN period_id DROP NOT NULL;
