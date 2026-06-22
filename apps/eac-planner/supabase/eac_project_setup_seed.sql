-- Seed reference revenue methods and starter setup data
-- Run after eac_project_setup_schema.sql

insert into public.govcon_revenue_methods (
  code,
  name,
  category,
  description,
  calculation_summary,
  requires_fee_pct,
  requires_unit_price,
  requires_monthly_schedule,
  requires_percent_complete,
  requires_loe_hours,
  sort_order
)
values
  (
    'TM',
    'Time and Materials',
    'Cost Reimbursable',
    'Revenue is earned from billable labor plus billable non-labor under time-and-materials rules.',
    'Labor revenue = hours x billing rate. Non-labor revenue = allowable cost plus configured markup where applicable.',
    false,
    false,
    false,
    false,
    false,
    10
  ),
  (
    'FIXED_PRICE',
    'Fixed Price',
    'Fixed Amount',
    'Revenue is earned against a fixed contract value using a defined progress basis.',
    'Revenue = contract value x earned progress, capped by funded or contract ceiling when configured.',
    false,
    false,
    false,
    true,
    false,
    20
  ),
  (
    'CPFF',
    'Cost Plus Fixed Fee',
    'Cost Reimbursable',
    'Revenue is earned from allowable cost plus an earned fixed fee component.',
    'Revenue = allowable cost incurred + earned fee based on configured fee logic.',
    true,
    false,
    false,
    false,
    false,
    30
  ),
  (
    'FFP_LOE',
    'Firm Fixed Price LOE',
    'Fixed Amount',
    'Revenue is earned over the level-of-effort performance period or by labor progress against planned LOE.',
    'Revenue = monthly earned schedule or LOE progress x contract value allocation.',
    false,
    false,
    false,
    false,
    true,
    40
  ),
  (
    'UNITS_BASED',
    'Units Based',
    'Units',
    'Revenue is earned based on delivered units and contracted unit price.',
    'Revenue = earned units x unit price.',
    false,
    true,
    false,
    false,
    false,
    50
  ),
  (
    'FAMTD',
    'Fixed Amount MTD',
    'Fixed Amount',
    'Revenue is earned from a monthly fixed revenue schedule.',
    'Revenue = scheduled monthly amount, optionally overridden during close.',
    false,
    false,
    true,
    false,
    false,
    60
  ),
  (
    'MANUAL_OVERRIDE',
    'Manual Override',
    'Manual',
    'Revenue is entered directly by finance or project controls.',
    'Revenue = user-entered schedule or override amount.',
    false,
    false,
    true,
    false,
    false,
    70
  ),
  (
    'DO_NOT_COMPUTE',
    'Do Not Compute',
    'Control',
    'Automatic revenue is disabled for this project.',
    'No revenue is computed automatically.',
    false,
    false,
    false,
    false,
    false,
    80
  )
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  calculation_summary = excluded.calculation_summary,
  requires_fee_pct = excluded.requires_fee_pct,
  requires_unit_price = excluded.requires_unit_price,
  requires_monthly_schedule = excluded.requires_monthly_schedule,
  requires_percent_complete = excluded.requires_percent_complete,
  requires_loe_hours = excluded.requires_loe_hours,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Starter project setup rows for projects that do not yet have setup records.
insert into public.govcon_project_setup (
  tenant_id,
  project_id,
  contract_id,
  setup_status,
  project_manager_name,
  customer_name,
  planning_start_period,
  planning_end_period,
  variance_threshold_amount,
  variance_threshold_percent,
  notes
)
select
  p.tenant_id,
  p.id,
  p.contract_id,
  'Draft',
  p.pm_name,
  c.customer,
  p.start_date,
  p.end_date,
  10000,
  0.05,
  'Seeded automatically from existing govcon_projects.'
from public.govcon_projects p
left join public.govcon_contracts c
  on c.id = p.contract_id
where not exists (
  select 1
  from public.govcon_project_setup s
  where s.project_id = p.id
);

-- Starter revenue rules for projects that do not yet have one.
insert into public.govcon_project_revenue_rules (
  tenant_id,
  project_id,
  revenue_method_code,
  rule_name,
  is_primary,
  effective_start,
  fee_pct,
  revenue_ceiling,
  funded_ceiling,
  percent_complete_source,
  allow_manual_override
)
select
  p.tenant_id,
  p.id,
  case
    when upper(coalesce(p.billing_type, '')) in ('TM', 'T&M') then 'TM'
    when upper(coalesce(p.billing_type, '')) = 'CPFF' then 'CPFF'
    when upper(coalesce(p.billing_type, '')) in ('FFP LOE', 'FFP_LOE') then 'FFP_LOE'
    when upper(coalesce(p.billing_type, '')) in ('UNITS', 'UNITS_BASED') then 'UNITS_BASED'
    when upper(coalesce(p.billing_type, '')) in ('FAMTD') then 'FAMTD'
    else 'FIXED_PRICE'
  end,
  'Primary Revenue Rule',
  true,
  coalesce(p.start_date, current_date),
  null,
  c.ceiling,
  p.funded,
  case
    when upper(coalesce(p.billing_type, '')) in ('FFP', 'FP', 'FIXED_PRICE') then 'COST_PERCENT_COMPLETE'
    else null
  end,
  true
from public.govcon_projects p
left join public.govcon_contracts c
  on c.id = p.contract_id
where not exists (
  select 1
  from public.govcon_project_revenue_rules r
  where r.project_id = p.id
    and r.is_primary = true
);

-- Starter explanations for seeded primary rules.
insert into public.govcon_project_revenue_explanations (
  tenant_id,
  project_id,
  revenue_rule_id,
  explanation_title,
  explanation_text,
  assumption_notes
)
select
  r.tenant_id,
  r.project_id,
  r.id,
  'Seeded Revenue Logic',
  m.calculation_summary,
  'Seeded from billing type. Review and update in Project Setup before production use.'
from public.govcon_project_revenue_rules r
join public.govcon_revenue_methods m
  on m.code = r.revenue_method_code
where not exists (
  select 1
  from public.govcon_project_revenue_explanations e
  where e.revenue_rule_id = r.id
);

-- Starter working forecast versions.
insert into public.govcon_forecast_versions (
  tenant_id,
  project_id,
  version_code,
  version_name,
  version_type,
  status,
  as_of_period,
  actuals_through_period,
  created_by
)
select
  p.tenant_id,
  p.id,
  'FC-INITIAL',
  'Initial Working Forecast',
  'Forecast',
  'Working',
  date_trunc('month', current_date)::date,
  null,
  'seed'
from public.govcon_projects p
where not exists (
  select 1
  from public.govcon_forecast_versions v
  where v.project_id = p.id
);

-- Starter equipment catalog rows for any tenant that already has GovCon projects.
insert into public.equipment_catalog (
  tenant_id,
  equipment_code,
  equipment_name,
  default_unit,
  default_rate
)
select distinct
  p.tenant_id,
  seed.equipment_code,
  seed.equipment_name,
  seed.default_unit,
  seed.default_rate
from public.govcon_projects p
cross join (
  values
    ('EQ-LIFT', 'Lift Rental', 'day', 420),
    ('EQ-TRAILER', 'Testing Trailer', 'week', 1850),
    ('EQ-LAPTOP', 'Field Laptop Kit', 'month', 210),
    ('EQ-TRUCK', 'Service Truck', 'day', 165)
) as seed(equipment_code, equipment_name, default_unit, default_rate)
where not exists (
  select 1
  from public.equipment_catalog ec
  where ec.tenant_id = p.tenant_id
    and ec.equipment_code = seed.equipment_code
);

-- Starter ODC catalog rows for any tenant that already has GovCon projects.
insert into public.odc_catalog (
  tenant_id,
  odc_code,
  odc_name
)
select distinct
  p.tenant_id,
  seed.odc_code,
  seed.odc_name
from public.govcon_projects p
cross join (
  values
    ('ODC-TRAVEL', 'Travel'),
    ('ODC-PERMIT', 'Permits and Fees'),
    ('ODC-TRAIN', 'Training'),
    ('ODC-SHIP', 'Shipping and Freight')
) as seed(odc_code, odc_name)
where not exists (
  select 1
  from public.odc_catalog oc
  where oc.tenant_id = p.tenant_id
    and oc.odc_code = seed.odc_code
);
