-- Rules and Exceptions for Trial Balance validation
-- Run this in Supabase SQL Editor

-- Rules: validation rules that define what constitutes an exception
CREATE TABLE IF NOT EXISTS med2.rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES med2.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NULL,
  enabled boolean NOT NULL DEFAULT true,
  rule_type text NOT NULL,              -- 'threshold'
  target text NOT NULL DEFAULT 'tb_account', -- 'tb_account'
  account_match text NULL,              -- substring/regex-ish: use ILIKE contains
  threshold_abs numeric NULL,           -- flag if |balance| > X
  threshold_pos numeric NULL,           -- flag if balance > X
  threshold_neg numeric NULL,           -- flag if balance < -X
  severity text NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  owner_name text NULL,
  owner_user_id uuid NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rules_org_id 
  ON med2.rules(org_id);

CREATE INDEX IF NOT EXISTS idx_rules_enabled 
  ON med2.rules(enabled) WHERE enabled = true;

-- Exceptions: violations found when rules are evaluated against TB
CREATE TABLE IF NOT EXISTS med2.exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES med2.orgs(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES med2.tb_snapshots(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES med2.rules(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',  -- 'open', 'awaiting_explanation', 'resolved', 'dismissed'
  severity text NOT NULL,               -- copied from rule at creation
  title text NOT NULL,
  details text NULL,
  account_name text NULL,
  account_number text NULL,
  balance numeric NULL,
  owner_name text NULL,
  owner_user_id uuid NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exceptions_org_snapshot 
  ON med2.exceptions(org_id, snapshot_id);

CREATE INDEX IF NOT EXISTS idx_exceptions_snapshot_status 
  ON med2.exceptions(snapshot_id, status);

CREATE INDEX IF NOT EXISTS idx_exceptions_severity 
  ON med2.exceptions(severity);

CREATE INDEX IF NOT EXISTS idx_exceptions_rule_id 
  ON med2.exceptions(rule_id);

