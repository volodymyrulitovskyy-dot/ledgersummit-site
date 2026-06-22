-- Trial Balance snapshot and line items
-- Run this in Supabase SQL Editor

-- TB Snapshots: one per org + date range + source
CREATE TABLE IF NOT EXISTS med2.tb_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES med2.orgs(id) ON DELETE CASCADE,
  range_from_date date NOT NULL,
  range_to_date date NOT NULL,
  source text NOT NULL DEFAULT 'manual_csv', -- 'manual_csv', 'qbo', 'netsuite'
  imported_by_user_id uuid NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_org_range_source UNIQUE (org_id, range_from_date, range_to_date, source)
);

CREATE INDEX IF NOT EXISTS idx_tb_snapshots_org_range 
  ON med2.tb_snapshots(org_id, range_from_date, range_to_date);

CREATE INDEX IF NOT EXISTS idx_tb_snapshots_imported_at 
  ON med2.tb_snapshots(imported_at DESC);

-- TB Lines: individual account balances
CREATE TABLE IF NOT EXISTS med2.tb_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES med2.tb_snapshots(id) ON DELETE CASCADE,
  account_number text NULL,
  account_name text NOT NULL,
  account_type text NULL,
  debit numeric NULL,
  credit numeric NULL,
  balance numeric NOT NULL,
  currency text NULL,
  raw jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tb_lines_snapshot_id 
  ON med2.tb_lines(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_tb_lines_account_name 
  ON med2.tb_lines(account_name);

CREATE INDEX IF NOT EXISTS idx_tb_lines_balance 
  ON med2.tb_lines(balance);

