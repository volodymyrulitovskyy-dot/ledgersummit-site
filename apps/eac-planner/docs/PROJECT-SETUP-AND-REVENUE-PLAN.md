# Project Setup And Revenue Plan

## Current state

The live Supabase database already contains:

- `qbo_connections`
- `govcon_projects`
- `govcon_contracts`
- `govcon_employees`
- `govcon_labor_distribution`
- `govcon_cost_pools`
- `govcon_cost_pool_accounts`
- `govcon_indirect_rates`
- `govcon_wbs`
- `revrec_contracts`
- `revrec_obligations`
- `revrec_schedules`

For the currently connected QBO tenant `24435fca-9720-417a-aeb0-ade802c698c2`, the live database currently has:

- a valid `qbo_connections` row
- no `govcon_projects`
- no `govcon_contracts`
- no `govcon_employees`

This means the integration foundation exists, but the project setup and EAC planning layer for the connected tenant does not exist yet.

## What QBO should provide

Use QBO as the source for:

- company connection and realm
- customers
- employee identity list when available in the connected organization
- vendors
- chart of accounts
- items and classes when used
- imported actual transactions
- project/customer references when available

Do not use QBO as the system of record for:

- project setup
- forecast versions
- revenue rules
- EAC logic
- variance explanations
- planning assumptions
- WBS and cost code governance

## What Supabase should own

Supabase should own:

- project setup workflow
- QBO-to-project mapping
- employee planning extension fields
- revenue formula selection and parameters
- revenue explanation text
- forecast versioning
- planning assumptions
- monthly planning lines
- actual import control and mapping
- variance explanation workflow

## Revenue methods to support now

Seed the following narrowed formula list for current project setup:

1. `TM`
Time and Materials. Revenue is driven by billable labor plus configured markups or billable non-labor rules.

2. `FIXED_PRICE`
Fixed Price. Revenue is driven by contract value and earned using a selected progress basis.

3. `CPFF`
Cost Plus Fixed Fee. Revenue is allowable cost plus earned fee.

4. `FFP_LOE`
Firm Fixed Price Level of Effort. Revenue is earned by monthly LOE schedule or labor progress against planned LOE.

5. `UNITS_BASED`
Revenue is earned from delivered units times unit price.

6. `FAMTD`
Fixed Amount Month To Date. Revenue is driven by a monthly schedule of fixed earned amounts.

7. `MANUAL_OVERRIDE`
Allows finance to specify a monthly revenue schedule directly.

8. `DO_NOT_COMPUTE`
No automatic revenue calculation. Used for hold, inactive, or externally managed projects.

## Project setup module

Create a dedicated Project Setup module with these sections:

### 1. General

- project code
- project title
- contract link
- customer
- project manager
- billing type
- start and end dates
- budget, funded, ceiling
- setup status

### 2. QBO Mapping

- realm id
- qbo customer ref
- qbo project ref if available
- account/class/item mapping summary
- sync status
- last actuals import

### 3. Revenue Rules

- revenue method
- fee percent
- markup percents
- unit price
- LOE hours
- progress basis
- schedule basis
- effective start and end dates
- plain-English explanation

### 4. Planning Structure

- WBS
- cost categories
- cost codes
- reporting hierarchy

### 5. Controls

- active forecast version
- close period
- variance explanation threshold
- review ownership

## New tables to add

Add the following tables:

- `govcon_project_setup`
- `govcon_project_qbo_mapping`
- `govcon_revenue_methods`
- `govcon_project_revenue_rules`
- `govcon_project_revenue_explanations`
- `govcon_project_revenue_schedules`
- `govcon_forecast_versions`
- `govcon_project_assumptions`
- `employee_planning_profiles`
- `govcon_actual_import_batches`
- `govcon_actual_import_lines`
- `govcon_actual_mapping_rules`
- `govcon_variance_explanations`

## Existing tables to reuse

- `govcon_projects`
- `govcon_contracts`
- `govcon_employees`
- `govcon_labor_distribution`
- `govcon_indirect_rates`
- `govcon_wbs`
- `qbo_connections`
- `revrec_contracts`
- `revrec_obligations`
- `revrec_schedules`

## Recommended rollout

### Phase 1

- seed revenue methods
- add project setup tables
- create QBO mapping rows
- create first project setup UI

### Phase 2

- add forecast versions
- add planning line tables
- add actual import control tables

### Phase 3

- add variance explanations
- add approvals and close workflow
- add reporting views and API endpoints

## Seeding approach

Start by seeding:

- reference revenue methods
- one default project setup row per new project
- one default revenue rule row per project
- one working forecast version per project

Then load:

- customer and project references from QBO
- project master, WBS, and assumptions from Supabase setup screens
