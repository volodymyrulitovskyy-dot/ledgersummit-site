-- EAC and Resource Management
-- Project setup and revenue-control schema additions
-- Intended to extend the existing GovCon/QBO schema already present in Supabase.

create extension if not exists pgcrypto;

create table if not exists public.govcon_revenue_methods (
  code text primary key,
  name text not null,
  category text not null,
  description text not null,
  calculation_summary text not null,
  requires_fee_pct boolean not null default false,
  requires_unit_price boolean not null default false,
  requires_monthly_schedule boolean not null default false,
  requires_percent_complete boolean not null default false,
  requires_loe_hours boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.govcon_project_setup (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references public.govcon_projects(id) on delete cascade,
  contract_id uuid references public.govcon_contracts(id) on delete set null,
  setup_status text not null default 'Draft',
  project_manager_name text,
  customer_name text,
  organization_code text,
  department_code text,
  reporting_currency text not null default 'USD',
  planning_start_period date,
  planning_end_period date,
  actuals_start_period date,
  close_through_period date,
  variance_threshold_amount numeric(18,2) not null default 0,
  variance_threshold_percent numeric(9,4) not null default 0,
  active_forecast_version_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

create table if not exists public.govcon_project_qbo_mapping (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references public.govcon_projects(id) on delete cascade,
  qbo_connection_id uuid references public.qbo_connections(id) on delete set null,
  realm_id text not null,
  qbo_customer_id text,
  qbo_customer_name text,
  qbo_project_id text,
  qbo_project_name text,
  qbo_class_id text,
  qbo_class_name text,
  qbo_location_id text,
  qbo_location_name text,
  import_enabled boolean not null default true,
  last_sync_at timestamptz,
  sync_status text not null default 'Not Started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

create table if not exists public.govcon_project_revenue_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references public.govcon_projects(id) on delete cascade,
  revenue_method_code text not null references public.govcon_revenue_methods(code),
  rule_name text not null default 'Primary Revenue Rule',
  is_primary boolean not null default true,
  effective_start date not null,
  effective_end date,
  progress_basis text,
  fee_pct numeric(9,6),
  labor_markup_pct numeric(9,6),
  subcontract_markup_pct numeric(9,6),
  material_markup_pct numeric(9,6),
  equipment_markup_pct numeric(9,6),
  odc_markup_pct numeric(9,6),
  fixed_amount_monthly numeric(18,2),
  unit_of_measure text,
  unit_price numeric(18,4),
  loe_hours numeric(18,2),
  revenue_ceiling numeric(18,2),
  funded_ceiling numeric(18,2),
  percent_complete_source text,
  allow_manual_override boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.govcon_project_revenue_explanations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references public.govcon_projects(id) on delete cascade,
  revenue_rule_id uuid not null references public.govcon_project_revenue_rules(id) on delete cascade,
  explanation_title text not null default 'Revenue Logic',
  explanation_text text not null,
  assumption_notes text,
  prepared_by text,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.govcon_project_revenue_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references public.govcon_projects(id) on delete cascade,
  revenue_rule_id uuid not null references public.govcon_project_revenue_rules(id) on delete cascade,
  revenue_period date not null,
  scheduled_amount numeric(18,2) not null default 0,
  override_amount numeric(18,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (revenue_rule_id, revenue_period)
);

create table if not exists public.govcon_forecast_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references public.govcon_projects(id) on delete cascade,
  version_code text not null,
  version_name text not null,
  version_type text not null default 'Forecast',
  status text not null default 'Working',
  as_of_period date,
  actuals_through_period date,
  submitted_at timestamptz,
  approved_at timestamptz,
  locked_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, version_code)
);

create table if not exists public.govcon_project_assumptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references public.govcon_projects(id) on delete cascade,
  forecast_version_id uuid references public.govcon_forecast_versions(id) on delete set null,
  assumption_type text not null,
  assumption_title text not null,
  assumption_value text,
  impact_area text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_planning_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  source_system text not null default 'QBO',
  realm_id text,
  qbo_employee_id text not null,
  display_name text not null,
  given_name text,
  family_name text,
  active boolean not null default true,
  planning_labor_category text,
  planning_department text,
  planning_org_code text,
  employee_type text,
  default_cost_rate numeric(18,4),
  default_bill_rate numeric(18,4),
  capacity_hours_monthly numeric(18,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  equipment_code text not null,
  equipment_name text not null,
  default_unit text not null default 'ea',
  default_rate numeric(18,4),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.odc_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  odc_code text not null,
  odc_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.govcon_actual_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  source_system text not null default 'QBO',
  realm_id text,
  batch_status text not null default 'Queued',
  batch_started_at timestamptz,
  batch_completed_at timestamptz,
  row_count integer not null default 0,
  error_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.govcon_actual_import_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  import_batch_id uuid not null references public.govcon_actual_import_batches(id) on delete cascade,
  source_transaction_id text,
  source_document_no text,
  source_project_ref text,
  source_customer_ref text,
  source_account_ref text,
  source_class_ref text,
  source_item_ref text,
  transaction_date date,
  amount numeric(18,2) not null default 0,
  mapped_project_id uuid references public.govcon_projects(id) on delete set null,
  mapped_wbs_id uuid references public.govcon_wbs(id) on delete set null,
  mapped_cost_category text,
  mapped_employee_profile_id uuid references public.employee_planning_profiles(id) on delete set null,
  mapping_status text not null default 'Unmapped',
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.govcon_actual_monthly (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  source_batch_id uuid references public.govcon_actual_import_batches(id) on delete set null,
  source_system text not null default 'QBO',
  realm_id text,
  source_scope text not null default 'PORTFOLIO',
  project_id uuid references public.govcon_projects(id) on delete cascade,
  actual_period date not null,
  revenue_actual numeric(18,2) not null default 0,
  cost_actual numeric(18,2) not null default 0,
  profit_actual numeric(18,2) not null default 0,
  raw_payload jsonb,
  imported_at timestamptz not null default now()
);

create table if not exists public.govcon_actual_mapping_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  realm_id text not null,
  source_type text not null,
  source_value text not null,
  mapped_project_id uuid references public.govcon_projects(id) on delete cascade,
  mapped_wbs_id uuid references public.govcon_wbs(id) on delete set null,
  mapped_cost_category text,
  mapped_employee_profile_id uuid references public.employee_planning_profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.govcon_variance_explanations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references public.govcon_projects(id) on delete cascade,
  forecast_version_id uuid references public.govcon_forecast_versions(id) on delete set null,
  variance_period date,
  variance_scope text not null,
  variance_subject text not null,
  variance_amount numeric(18,2),
  variance_percent numeric(9,4),
  explanation_text text not null,
  owner_name text,
  status text not null default 'Draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.govcon_forecast_by_category (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references public.govcon_projects(id) on delete cascade,
  forecast_version_id uuid references public.govcon_forecast_versions(id) on delete set null,
  planning_year integer not null,
  forecast_period date not null,
  month_index integer not null,
  category_key text not null,
  actual_cost numeric(18,2) not null default 0,
  forecast_cost numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.govcon_project_monthly (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references public.govcon_projects(id) on delete cascade,
  forecast_version_id uuid references public.govcon_forecast_versions(id) on delete set null,
  planning_year integer not null,
  project_period date not null,
  month_index integer not null,
  funding numeric(18,2) not null default 0,
  actual_cost numeric(18,2) not null default 0,
  forecast_cost numeric(18,2) not null default 0,
  current_period_cost numeric(18,2) not null default 0,
  cumulative_actual_cost numeric(18,2) not null default 0,
  cumulative_cost numeric(18,2) not null default 0,
  etc_cost numeric(18,2) not null default 0,
  eac_cost numeric(18,2) not null default 0,
  percent_complete numeric(12,8) not null default 0,
  cumulative_revenue numeric(18,2) not null default 0,
  current_period_revenue numeric(18,2) not null default 0,
  current_period_margin numeric(18,2) not null default 0,
  current_period_margin_pct numeric(12,8) not null default 0,
  cumulative_margin numeric(18,2) not null default 0,
  margin numeric(18,2) not null default 0,
  margin_pct numeric(12,8) not null default 0,
  projected_total_cost numeric(18,2) not null default 0,
  validation_errors jsonb,
  validation_warnings jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.govcon_project_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references public.govcon_projects(id) on delete cascade,
  forecast_version_id uuid references public.govcon_forecast_versions(id) on delete set null,
  snapshot_label text not null,
  snapshot_year integer not null,
  is_baseline boolean not null default false,
  actuals_through_period date,
  summary jsonb not null,
  category_summary jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_govcon_project_setup_tenant_project
  on public.govcon_project_setup (tenant_id, project_id);

create index if not exists idx_govcon_project_qbo_mapping_tenant_project
  on public.govcon_project_qbo_mapping (tenant_id, project_id);

create unique index if not exists uq_govcon_project_qbo_mapping_source
  on public.govcon_project_qbo_mapping (
    tenant_id,
    realm_id,
    coalesce(qbo_project_id, ''),
    coalesce(qbo_customer_id, '')
  );

create index if not exists idx_govcon_project_revenue_rules_project
  on public.govcon_project_revenue_rules (tenant_id, project_id, effective_start);

create index if not exists idx_govcon_forecast_versions_project
  on public.govcon_forecast_versions (tenant_id, project_id, status);

create index if not exists idx_govcon_actual_import_lines_batch
  on public.govcon_actual_import_lines (tenant_id, import_batch_id, mapping_status);

create unique index if not exists uq_govcon_actual_monthly_scope
  on public.govcon_actual_monthly (
    tenant_id,
    coalesce(realm_id, ''),
    source_scope,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    actual_period
  );

create index if not exists idx_govcon_actual_monthly_period
  on public.govcon_actual_monthly (tenant_id, actual_period, source_scope);

create index if not exists idx_govcon_variance_explanations_project
  on public.govcon_variance_explanations (tenant_id, project_id, variance_period);

create unique index if not exists uq_govcon_forecast_by_category_period
  on public.govcon_forecast_by_category (
    tenant_id,
    project_id,
    coalesce(forecast_version_id, '00000000-0000-0000-0000-000000000000'::uuid),
    planning_year,
    forecast_period,
    category_key
  );

create unique index if not exists uq_govcon_project_monthly_period
  on public.govcon_project_monthly (
    tenant_id,
    project_id,
    coalesce(forecast_version_id, '00000000-0000-0000-0000-000000000000'::uuid),
    planning_year,
    project_period
  );

create index if not exists idx_govcon_project_monthly_project
  on public.govcon_project_monthly (tenant_id, project_id, planning_year);

create index if not exists idx_govcon_project_snapshots_project
  on public.govcon_project_snapshots (tenant_id, project_id, snapshot_year, created_at desc);

create unique index if not exists uq_employee_planning_profiles_qbo
  on public.employee_planning_profiles (tenant_id, coalesce(realm_id, ''), qbo_employee_id);

create unique index if not exists uq_equipment_catalog_code
  on public.equipment_catalog (tenant_id, equipment_code);

create unique index if not exists uq_odc_catalog_code
  on public.odc_catalog (tenant_id, odc_code);
