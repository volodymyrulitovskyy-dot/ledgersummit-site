-- Optional extension fields for richer project setup ownership metadata.
-- Run after base_bootstrap_schema.sql and eac_project_setup_schema.sql.

alter table if exists public.govcon_project_setup
  add column if not exists project_type text,
  add column if not exists business_unit_code text,
  add column if not exists project_finance_lead_name text,
  add column if not exists managing_director_name text,
  add column if not exists biller_name text;
