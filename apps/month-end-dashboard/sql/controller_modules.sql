-- Reconciliation tracking table
CREATE TABLE IF NOT EXISTS med2.reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES med2.orgs(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  account_number TEXT,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed
  reconciled_by TEXT,
  reconciled_at TIMESTAMPTZ,
  file_url TEXT,
  notes TEXT,
  balance_per_books DECIMAL,
  balance_per_bank DECIMAL,
  variance DECIMAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliations_org_period ON med2.reconciliations(org_id, period_end);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON med2.reconciliations(status);
CREATE INDEX IF NOT EXISTS idx_reconciliations_account ON med2.reconciliations(account_name);

-- Reconciliation items (for tracking outstanding items)
CREATE TABLE IF NOT EXISTS med2.reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES med2.reconciliations(id) ON DELETE CASCADE,
  item_date DATE,
  description TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  item_type TEXT NOT NULL, -- book_only, bank_only, timing_difference
  status TEXT NOT NULL DEFAULT 'outstanding', -- outstanding, cleared, void
  cleared_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_items_reconciliation ON med2.reconciliation_items(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_status ON med2.reconciliation_items(status);

-- Journal entries tracking
CREATE TABLE IF NOT EXISTS med2.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES med2.orgs(id) ON DELETE CASCADE,
  entry_number TEXT,
  entry_date DATE NOT NULL,
  period_end DATE NOT NULL,
  description TEXT NOT NULL,
  total_debit DECIMAL NOT NULL DEFAULT 0,
  total_credit DECIMAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, pending_approval, approved, posted, rejected
  prepared_by TEXT,
  reviewed_by TEXT,
  approved_by TEXT,
  posted_at TIMESTAMPTZ,
  qbo_id TEXT, -- QuickBooks ID if posted
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_period ON med2.journal_entries(org_id, period_end);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON med2.journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON med2.journal_entries(entry_date);

-- Journal entry lines
CREATE TABLE IF NOT EXISTS med2.journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES med2.journal_entries(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT,
  description TEXT,
  debit DECIMAL,
  credit DECIMAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_je_lines_entry ON med2.journal_entry_lines(journal_entry_id);

-- Variance analysis snapshots
CREATE TABLE IF NOT EXISTS med2.variance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES med2.orgs(id) ON DELETE CASCADE,
  current_period_end DATE NOT NULL,
  prior_period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variance_snapshots_org ON med2.variance_snapshots(org_id);

-- Variance details
CREATE TABLE IF NOT EXISTS med2.variance_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES med2.variance_snapshots(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  account_number TEXT,
  current_balance DECIMAL NOT NULL,
  prior_balance DECIMAL NOT NULL,
  variance_amount DECIMAL NOT NULL,
  variance_percent DECIMAL,
  explanation TEXT,
  explained_by TEXT,
  explained_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variance_details_snapshot ON med2.variance_details(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_variance_details_account ON med2.variance_details(account_name);

COMMENT ON TABLE med2.reconciliations IS 'Track account reconciliation status and details';
COMMENT ON TABLE med2.reconciliation_items IS 'Outstanding reconciliation items';
COMMENT ON TABLE med2.journal_entries IS 'Manual journal entries with approval workflow';
COMMENT ON TABLE med2.journal_entry_lines IS 'Individual lines for journal entries';
COMMENT ON TABLE med2.variance_snapshots IS 'Period-over-period variance analysis snapshots';
COMMENT ON TABLE med2.variance_details IS 'Detailed variance by account';
