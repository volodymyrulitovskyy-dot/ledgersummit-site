-- Balance Sheet snapshots (separate from Trial Balance)
-- Run this in Supabase SQL Editor

CREATE SCHEMA IF NOT EXISTS med2;

-- Balance Sheet snapshots
CREATE TABLE IF NOT EXISTS med2.bs_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES med2.orgs(id) ON DELETE CASCADE,
  as_of_date date NOT NULL,
  source text NOT NULL DEFAULT 'qbo', -- 'qbo', 'manual'
  pulled_at timestamptz NOT NULL DEFAULT now(),
  pulled_by_user_id uuid,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, as_of_date, source)
);

-- Balance Sheet lines
CREATE TABLE IF NOT EXISTS med2.bs_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES med2.bs_snapshots(id) ON DELETE CASCADE,
  section text NOT NULL, -- 'ASSET', 'LIABILITY', 'EQUITY'
  account_name text NOT NULL,
  amount numeric NOT NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bs_snapshots_org_date 
  ON med2.bs_snapshots(org_id, as_of_date);

CREATE INDEX IF NOT EXISTS idx_bs_snapshots_org_source 
  ON med2.bs_snapshots(org_id, source);

CREATE INDEX IF NOT EXISTS idx_bs_lines_snapshot 
  ON med2.bs_lines(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_bs_lines_section 
  ON med2.bs_lines(section);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION med2.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bs_snapshots_updated_at ON med2.bs_snapshots;
CREATE TRIGGER update_bs_snapshots_updated_at
  BEFORE UPDATE ON med2.bs_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION med2.update_updated_at_column();

