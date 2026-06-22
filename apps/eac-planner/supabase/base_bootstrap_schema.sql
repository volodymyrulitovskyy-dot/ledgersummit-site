-- Base bootstrap schema for a blank Supabase project.
-- Run this first on a new project, then run eac_project_setup_schema.sql.

create extension if not exists pgcrypto;

create table if not exists public.qbo_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  realm_id text not null,
  status text not null default 'active',
  company_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.govcon_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  title text not null,
  customer text,
  type text not null default 'TM',
  status text not null default 'Open',
  condition text not null default 'Green',
  ceiling numeric(18,2) not null default 0,
  funded numeric(18,2) not null default 0,
  billed numeric(18,2) not null default 0,
  incurred numeric(18,2) not null default 0,
  award_date date,
  pop_start date,
  pop_end date,
  customer_org text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.govcon_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  title text not null,
  contract_id uuid references public.govcon_contracts(id) on delete set null,
  contract_code text,
  billing_type text not null default 'TM',
  status text not null default 'Open',
  condition text not null default 'Green',
  budget numeric(18,2) not null default 0,
  funded numeric(18,2) not null default 0,
  spent numeric(18,2) not null default 0,
  committed numeric(18,2) not null default 0,
  pm_name text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.govcon_wbs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid references public.govcon_projects(id) on delete cascade,
  wbs_code text not null,
  wbs_name text not null,
  parent_wbs_id uuid references public.govcon_wbs(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_qbo_connections_tenant_realm
  on public.qbo_connections (tenant_id, realm_id);

create index if not exists idx_qbo_connections_tenant_status
  on public.qbo_connections (tenant_id, status, connected_at desc);

create unique index if not exists uq_govcon_contracts_tenant_code
  on public.govcon_contracts (tenant_id, code);

create index if not exists idx_govcon_contracts_tenant_status
  on public.govcon_contracts (tenant_id, status, pop_start);

create unique index if not exists uq_govcon_projects_tenant_code
  on public.govcon_projects (tenant_id, code);

create index if not exists idx_govcon_projects_tenant_contract
  on public.govcon_projects (tenant_id, contract_id, status);

create unique index if not exists uq_govcon_wbs_project_code
  on public.govcon_wbs (tenant_id, project_id, wbs_code);

create index if not exists idx_govcon_wbs_project
  on public.govcon_wbs (tenant_id, project_id, active);
