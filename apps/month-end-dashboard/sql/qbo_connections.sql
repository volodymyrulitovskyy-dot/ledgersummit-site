-- QuickBooks Online connection tokens per organization
-- Run this in Supabase SQL Editor

CREATE SCHEMA IF NOT EXISTS med2;

CREATE TABLE IF NOT EXISTS med2.qbo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES med2.orgs(id) ON DELETE CASCADE,
  realm_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint on org_id (one connection per org)
CREATE UNIQUE INDEX IF NOT EXISTS qbo_connections_org_id_uq
  ON med2.qbo_connections(org_id);

CREATE INDEX IF NOT EXISTS idx_qbo_connections_org_id 
  ON med2.qbo_connections(org_id);

CREATE INDEX IF NOT EXISTS idx_qbo_connections_expires_at 
  ON med2.qbo_connections(expires_at);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION med2.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS update_qbo_connections_updated_at ON med2.qbo_connections;

CREATE TRIGGER update_qbo_connections_updated_at
BEFORE UPDATE ON med2.qbo_connections
FOR EACH ROW
EXECUTE FUNCTION med2.update_updated_at_column();

