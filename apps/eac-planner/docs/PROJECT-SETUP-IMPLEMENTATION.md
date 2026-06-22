# Project Setup Implementation

## Migration order

Run in this order:

1. `eac_project_setup_schema.sql`
Creates the new project setup, revenue, forecast, import, and variance tables.

2. `eac_project_setup_seed.sql`
Seeds the revenue method reference list and starter defaults for existing GovCon projects.

3. Backfill tenant project master data
For the connected QBO tenant `24435fca-9720-417a-aeb0-ade802c698c2`, create the first `govcon_contracts` and `govcon_projects` rows before expecting setup UI to work.

4. Create QBO mapping rows
Populate `govcon_project_qbo_mapping` after the first projects are created or imported.

5. Create initial forecast versions
The seed script handles this for existing projects. Future projects should create a default working version at project creation time.

## Recommended rollout steps

### Step 1. Apply schema

Apply:

- [eac_project_setup_schema.sql](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/supabase/eac_project_setup_schema.sql)

Expected outcome:

- reference revenue method table exists
- project setup and revenue rule tables exist
- no existing GovCon tables are replaced

### Step 2. Apply seed data

Apply:

- [eac_project_setup_seed.sql](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/supabase/eac_project_setup_seed.sql)

Expected outcome:

- revenue method reference rows are loaded
- existing GovCon projects get starter setup rows
- existing GovCon projects get starter revenue rules and forecast versions

### Step 3. Backfill connected QBO tenant

Because the connected tenant currently has QBO but no GovCon project records, do this next:

- create starter contracts for the tenant
- create starter projects for the tenant
- sync QBO employees into `employee_planning_profiles` if employee records exist in the connected organization

### Step 4. Build Project Setup UI

The first UI slice should focus only on:

- General
- QBO Mapping
- Revenue Rules
- Controls

Do not build planning or variance tabs into Project Setup yet.

## First Project Setup screen

Use one module with four sections.

### 1. General

Primary table:

- `govcon_projects`

Supporting table:

- `govcon_project_setup`

Fields:

- project code
  - `govcon_projects.code`
- project title
  - `govcon_projects.title`
- billing type
  - `govcon_projects.billing_type`
- project manager
  - `govcon_projects.pm_name`
- start date
  - `govcon_projects.start_date`
- end date
  - `govcon_projects.end_date`
- budget
  - `govcon_projects.budget`
- funded
  - `govcon_projects.funded`
- spent
  - `govcon_projects.spent`
- committed
  - `govcon_projects.committed`
- setup status
  - `govcon_project_setup.setup_status`
- planning start period
  - `govcon_project_setup.planning_start_period`
- planning end period
  - `govcon_project_setup.planning_end_period`
- actuals start period
  - `govcon_project_setup.actuals_start_period`
- close through period
  - `govcon_project_setup.close_through_period`
- notes
  - `govcon_project_setup.notes`

### 2. QBO Mapping

Primary table:

- `govcon_project_qbo_mapping`

Reference table:

- `qbo_connections`

Fields:

- qbo company name
  - join through `qbo_connections.company_name`
- realm id
  - `govcon_project_qbo_mapping.realm_id`
- qbo customer id
  - `govcon_project_qbo_mapping.qbo_customer_id`
- qbo customer name
  - `govcon_project_qbo_mapping.qbo_customer_name`
- qbo project id
  - `govcon_project_qbo_mapping.qbo_project_id`
- qbo project name
  - `govcon_project_qbo_mapping.qbo_project_name`
- qbo class id / name
  - `govcon_project_qbo_mapping.qbo_class_id`
  - `govcon_project_qbo_mapping.qbo_class_name`
- qbo location id / name
  - `govcon_project_qbo_mapping.qbo_location_id`
  - `govcon_project_qbo_mapping.qbo_location_name`
- import enabled
  - `govcon_project_qbo_mapping.import_enabled`
- sync status
  - `govcon_project_qbo_mapping.sync_status`
- last sync
  - `govcon_project_qbo_mapping.last_sync_at`

### 3. Revenue Rules

Primary table:

- `govcon_project_revenue_rules`

Supporting tables:

- `govcon_revenue_methods`
- `govcon_project_revenue_explanations`
- `govcon_project_revenue_schedules`

Fields:

- revenue method
  - `govcon_project_revenue_rules.revenue_method_code`
- rule name
  - `govcon_project_revenue_rules.rule_name`
- effective start
  - `govcon_project_revenue_rules.effective_start`
- effective end
  - `govcon_project_revenue_rules.effective_end`
- fee %
  - `govcon_project_revenue_rules.fee_pct`
- labor markup %
  - `govcon_project_revenue_rules.labor_markup_pct`
- subcontract markup %
  - `govcon_project_revenue_rules.subcontract_markup_pct`
- material markup %
  - `govcon_project_revenue_rules.material_markup_pct`
- equipment markup %
  - `govcon_project_revenue_rules.equipment_markup_pct`
- odc markup %
  - `govcon_project_revenue_rules.odc_markup_pct`
- fixed monthly amount
  - `govcon_project_revenue_rules.fixed_amount_monthly`
- unit of measure
  - `govcon_project_revenue_rules.unit_of_measure`
- unit price
  - `govcon_project_revenue_rules.unit_price`
- loe hours
  - `govcon_project_revenue_rules.loe_hours`
- revenue ceiling
  - `govcon_project_revenue_rules.revenue_ceiling`
- funded ceiling
  - `govcon_project_revenue_rules.funded_ceiling`
- percent complete source
  - `govcon_project_revenue_rules.percent_complete_source`
- allow manual override
  - `govcon_project_revenue_rules.allow_manual_override`
- explanation text
  - `govcon_project_revenue_explanations.explanation_text`
- assumption notes
  - `govcon_project_revenue_explanations.assumption_notes`

### 4. Controls

Primary tables:

- `govcon_project_setup`
- `govcon_forecast_versions`

Fields:

- active forecast version
  - `govcon_project_setup.active_forecast_version_id`
- variance threshold amount
  - `govcon_project_setup.variance_threshold_amount`
- variance threshold percent
  - `govcon_project_setup.variance_threshold_percent`
- available forecast versions grid
  - `govcon_forecast_versions`

## UI behavior

### Load order

When a project is selected:

1. load `govcon_projects`
2. load `govcon_project_setup`
3. load `govcon_project_qbo_mapping`
4. load active `govcon_project_revenue_rules`
5. load `govcon_project_revenue_explanations`
6. load `govcon_forecast_versions`

### Save order

On save:

1. save `govcon_projects`
2. save `govcon_project_setup`
3. save `govcon_project_qbo_mapping`
4. save `govcon_project_revenue_rules`
5. save `govcon_project_revenue_explanations`

### Validation rules

Required before project setup can be marked complete:

- project code
- project title
- billing type
- planning start and end period
- one revenue rule
- one revenue explanation
- one forecast version

Required before actual imports can be enabled:

- qbo mapping row exists
- import enabled = true
- qbo customer or project reference populated

## API shape recommendation

Add backend endpoints like:

- `GET /api/projects/:id/setup`
- `PUT /api/projects/:id/setup/general`
- `PUT /api/projects/:id/setup/qbo-mapping`
- `PUT /api/projects/:id/setup/revenue-rule`
- `PUT /api/projects/:id/setup/revenue-explanation`
- `GET /api/projects/:id/forecast-versions`
- `POST /api/projects/:id/forecast-versions`

## Initial build scope

Build only this first:

1. project selector using `govcon_projects`
2. setup page with General and Revenue Rules
3. QBO Mapping read-only panel
4. forecast version list
5. save/update flows

Leave for next phase:

- planning line entry
- actual import reconciliation
- variance explanation authoring
- approval workflow

## Employee source model

Use:

- QBO as the source for employee identity rows
- `employee_planning_profiles` as the Supabase extension table for planning-only employee fields

Extension fields should include:

- planning labor category
- planning department
- planning org code
- default cost rate
- default bill rate
- capacity hours monthly
- notes
