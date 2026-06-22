-- Project P&L domain extensions for rules/exceptions workflow

ALTER TABLE IF EXISTS med2.rules
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'GL',
  ADD COLUMN IF NOT EXISTS metric text NULL;

ALTER TABLE IF EXISTS med2.exceptions
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'GL',
  ADD COLUMN IF NOT EXISTS entity_key text NULL,
  ADD COLUMN IF NOT EXISTS entity_name text NULL,
  ADD COLUMN IF NOT EXISTS metric text NULL,
  ADD COLUMN IF NOT EXISTS value_signed numeric NULL,
  ADD COLUMN IF NOT EXISTS value_abs numeric NULL,
  ADD COLUMN IF NOT EXISTS baseline_value numeric NULL,
  ADD COLUMN IF NOT EXISTS delta_abs numeric NULL,
  ADD COLUMN IF NOT EXISTS delta_pct numeric NULL;

CREATE INDEX IF NOT EXISTS idx_rules_domain ON med2.rules(domain);
CREATE INDEX IF NOT EXISTS idx_exceptions_domain ON med2.exceptions(domain);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exceptions_project_key
  ON med2.exceptions(snapshot_id, rule_id, domain, entity_key, metric)
  WHERE domain = 'PROJECT_PNL';

CREATE TABLE IF NOT EXISTS med2.project_pnl_snapshot_lines (
  snapshot_id uuid NOT NULL,
  org_id uuid NOT NULL,
  customer_key text NOT NULL,
  customer_name text NOT NULL,
  is_not_specified boolean NOT NULL DEFAULT false,
  revenue_signed numeric NOT NULL DEFAULT 0,
  revenue_abs numeric NOT NULL DEFAULT 0,
  cogs_signed numeric NOT NULL DEFAULT 0,
  cogs_abs numeric NOT NULL DEFAULT 0,
  gross_profit_signed numeric NOT NULL DEFAULT 0,
  gross_profit_abs numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_id, customer_key)
);

CREATE INDEX IF NOT EXISTS idx_project_pnl_lines_org_snapshot
  ON med2.project_pnl_snapshot_lines(org_id, snapshot_id);

CREATE TABLE IF NOT EXISTS med2.project_pnl_snapshot_totals (
  snapshot_id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  total_revenue_signed numeric NOT NULL DEFAULT 0,
  total_revenue_abs numeric NOT NULL DEFAULT 0,
  total_cogs_signed numeric NOT NULL DEFAULT 0,
  total_cogs_abs numeric NOT NULL DEFAULT 0,
  total_gross_profit_signed numeric NOT NULL DEFAULT 0,
  total_gross_profit_abs numeric NOT NULL DEFAULT 0,
  not_specified_revenue_signed numeric NOT NULL DEFAULT 0,
  not_specified_revenue_abs numeric NOT NULL DEFAULT 0,
  not_specified_cogs_signed numeric NOT NULL DEFAULT 0,
  not_specified_cogs_abs numeric NOT NULL DEFAULT 0,
  not_specified_gross_profit_signed numeric NOT NULL DEFAULT 0,
  not_specified_gross_profit_abs numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

