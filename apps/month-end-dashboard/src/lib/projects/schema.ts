import { prisma } from '@/lib/db/prisma'

let ensured = false

export async function ensureProjectSchema() {
  if (ensured) return

  await prisma.$executeRawUnsafe(`
    ALTER TABLE med2.rules
      ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'GL',
      ADD COLUMN IF NOT EXISTS metric text NULL;
  `)

  await prisma.$executeRawUnsafe(`
    ALTER TABLE med2.exceptions
      ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'GL',
      ADD COLUMN IF NOT EXISTS entity_key text NULL,
      ADD COLUMN IF NOT EXISTS entity_name text NULL,
      ADD COLUMN IF NOT EXISTS metric text NULL,
      ADD COLUMN IF NOT EXISTS value_signed numeric NULL,
      ADD COLUMN IF NOT EXISTS value_abs numeric NULL,
      ADD COLUMN IF NOT EXISTS baseline_value numeric NULL,
      ADD COLUMN IF NOT EXISTS delta_abs numeric NULL,
      ADD COLUMN IF NOT EXISTS delta_pct numeric NULL,
      ADD COLUMN IF NOT EXISTS risk_score numeric NULL;
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_rules_domain ON med2.rules(domain);
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_exceptions_domain ON med2.exceptions(domain);
  `)

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_exceptions_project_key
    ON med2.exceptions(snapshot_id, rule_id, domain, entity_key, metric)
    WHERE domain = 'PROJECT_PNL';
  `)

  await prisma.$executeRawUnsafe(`
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
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_project_pnl_lines_org_snapshot
      ON med2.project_pnl_snapshot_lines(org_id, snapshot_id);
  `)

  await prisma.$executeRawUnsafe(`
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
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS med2.project_pnl_snapshot_debug (
      snapshot_id uuid PRIMARY KEY,
      org_id uuid NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      summarize_column_by text NOT NULL DEFAULT 'Customers',
      cols_raw int NOT NULL DEFAULT 0,
      cols_customers int NOT NULL DEFAULT 0,
      has_income boolean NOT NULL DEFAULT false,
      has_cogs boolean NOT NULL DEFAULT false,
      columns_filtered jsonb NOT NULL DEFAULT '[]'::jsonb,
      top_customers_by_revenue jsonb NOT NULL DEFAULT '[]'::jsonb,
      totals jsonb NOT NULL DEFAULT '{}'::jsonb,
      raw_preview text NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)

  await prisma.$executeRawUnsafe(`
    ALTER TABLE med2.project_pnl_snapshot_debug
      ALTER COLUMN columns_filtered TYPE jsonb USING to_jsonb(columns_filtered);
  `)

  ensured = true
}
