-- Create close_tasks table in med2 schema with workday support
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS med2.close_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES med2.orgs(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES med2.periods(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  owner_user_id uuid,
  owner_name text,
  
  -- Status and priority
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  
  -- Due date mechanism (either fixed or workday rule)
  due_type text NOT NULL DEFAULT 'fixed',  -- 'fixed' | 'workday'
  due_date date,                            -- used when due_type='fixed'
  due_workday_n int,                        -- used when due_type='workday' (e.g. 1..31)
  due_workday_anchor text,                  -- 'month_start' | 'month_end'
  due_offset_days int NOT NULL DEFAULT 0,   -- optional offset relative to anchor/workday (can be negative)
  computed_due_date date,                   -- stored computed date for fast filtering/sorting
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_close_tasks_org_period ON med2.close_tasks(org_id, period_id);
CREATE INDEX IF NOT EXISTS idx_close_tasks_period_status ON med2.close_tasks(period_id, status);
CREATE INDEX IF NOT EXISTS idx_close_tasks_owner ON med2.close_tasks(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_close_tasks_computed_due_date ON med2.close_tasks(computed_due_date);

-- Add check constraints
ALTER TABLE med2.close_tasks
  ADD CONSTRAINT check_status CHECK (status IN ('open', 'in_progress', 'blocked', 'done')),
  ADD CONSTRAINT check_priority CHECK (priority IN ('low', 'normal', 'high')),
  ADD CONSTRAINT check_due_type CHECK (due_type IN ('fixed', 'workday')),
  ADD CONSTRAINT check_due_workday_anchor CHECK (due_workday_anchor IS NULL OR due_workday_anchor IN ('month_start', 'month_end'));

-- Grant permissions
GRANT ALL ON med2.close_tasks TO anon, authenticated, service_role;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION med2.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_close_tasks_updated_at
  BEFORE UPDATE ON med2.close_tasks
  FOR EACH ROW
  EXECUTE FUNCTION med2.update_updated_at_column();
