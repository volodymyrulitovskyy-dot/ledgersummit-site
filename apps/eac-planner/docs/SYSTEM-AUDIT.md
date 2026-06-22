# EAC Planner System Audit

## Current State Summary

The codebase is between prototype and scaffolded platform. The rebuilt app has a much better front-end structure, live QBO connectivity, and some Supabase-backed setup/bootstrap plumbing, but the core accounting engine is not implemented. The current financial logic is still mostly UI-driven and simplified: EAC is blended actuals-plus-plan, revenue is derived from fee/contract-type shortcuts rather than cost-to-cost percentage-of-completion, and there is no true monthly forecast, snapshot, or control model. The legacy app had deeper Supabase integration for plan tables and DB views, but even there the real accounting behavior lived in database views and RPCs rather than a clear centralized engine.

## System Maturity Table

| Area | Status | Evidence |
|---|---|---|
| EAC calculation engine | Partially implemented | Rebuilt app computes blended monthly cost/revenue in `src/calculations.js`. Legacy app calls `recompute_eac` and reads `vw_eac_monthly_pl_v5` in `js/tabs/pnl.js`. |
| Monthly data model | Partially implemented | Rebuilt app uses 12-month arrays in local state for labor/subs/equipment/materials/ODC in `src/seedData.js`. Legacy app stores monthly rows by `ym` in tables like `plan_labor` in `js/features/plan-labor.js`. |
| Revenue recognition logic | Not implemented | Rebuilt revenue uses `FIXED_PRICE => contractValue / 12` or `cost * (1 + feePct)` in `src/calculations.js`. No cost-to-cost `% complete`, no cumulative catch-up. |
| QBO integration | Partially implemented | Direct QBO backend is working in `qbo-backend/src/qboDirectClient.js` and exposed via `qbo-backend/src/server.js`. Company info, P&L, cash flow, customers, vendors, items, employees are reachable. |
| Forecasting engine | Structurally present (but not functional) | UI has planning tabs and forecast version selectors in `src/app.js`, but forecast behavior is still local-state editing, not a real engine. |
| Snapshot / baseline system | Structurally present (but not functional) | State includes prior forecast/budget values and setup bundle loads forecast versions, but no persistent snapshot compare engine in the rebuilt app. Legacy code hints at version context in `js/lib/projectContext.js`. |
| Full project P&L | Partially implemented | Rebuilt app renders overview and financial tables from local calculations in `src/app.js`. Legacy app had a stronger DB-backed P&L via `vw_eac_monthly_pl_v5` in `js/tabs/pnl.js`. |
| Resource management | Structurally present (but not functional) | Rebuilt Resources module has tabs, seeded employees, assignments, hiring, attrition, analytics, and editable forms in `src/app.js`, but it is still front-end state, not persisted planning logic. |
| Variance analysis | Partially implemented | Overview has variance displays, top drivers, and category variance tables in `src/app.js`. No true explanation workflow or audit-backed variance logic. |
| Workflow / controls | Not implemented | No period close, no forecast approval states, no audit trail, no controlled reopen/close cycle in rebuilt app. |
| Dashboard / Overview usability | Partially implemented | Rebuilt UI is much clearer and hierarchical, with Overview, Plan, Financials, Admin plus Resources and Budgeting modules in `src/app.js`. Still demo-like in behavior and not fully tied to accounting logic. |

## Gap Analysis

- Missing cost-to-cost revenue recognition engine
  - Current revenue logic is shortcut logic, not `% complete = actual cost / EAC cost`.
  - This matters because the accounting model requires cumulative catch-up on EAC change.
  - Risk: recognized revenue will be materially wrong on long-term contracts.

- Missing centralized accounting engine
  - Financial behavior is split between local JS calculations in the rebuilt app and old database views/RPCs in the legacy app.
  - This matters because EAC, revenue recognition, period revenue, and margin should be derived from one source of truth.
  - Risk: different screens can show different answers.

- Missing real monthly forecast fact model
  - The rebuilt app stores monthly arrays in browser state; legacy app used month rows, but only by category/table.
  - This matters because percent complete, current-period revenue, and variance all depend on month-granular persistence.
  - Risk: no reliable monthly rollforward, no durable planning data, no auditability.

- Missing snapshot/baseline mechanism
  - There is no production-grade snapshot table/system for budget, prior forecast, current forecast, approved forecast.
  - This matters because EAC reviews are fundamentally comparative.
  - Risk: no true variance-to-prior, no baseline traceability, no close discipline.

- Missing period close controls
  - No month close state, no actuals-through lock, no re-open workflow.
  - This matters because revenue recognition and forecast updates must respect closed periods.
  - Risk: users can implicitly change history and break accounting continuity.

- Missing actual revenue rollforward logic
  - Current app shows actuals and forecast, but does not calculate cumulative revenue recognized less prior recognized revenue.
  - This matters because current-period revenue should be derived from cumulative earned revenue.
  - Risk: period revenue and margin reporting will be inaccurate.

- Missing persisted forecasting engine
  - Planning tabs exist, but the rebuilt app edits local arrays rather than durable forecast records.
  - This matters because production EAC requires saved forecast versions by month and category.
  - Risk: prototype-only behavior, no multi-user consistency.

- Missing true project financial planning model
  - No durable `project_monthly`, `forecast_by_category`, `snapshot`, or comparable normalized structures in the rebuilt app.
  - This matters because planning must support ETC, EAC, revenue, cost, and margin across time.
  - Risk: cannot scale from UI prototype to audited system.

- QBO integration is operational but shallow
  - QBO actuals connectivity exists, but the app mainly uses company, P&L, cash flow, and bootstrap entity lists.
  - This matters because production use needs actual transaction reconciliation, project/customer mapping, and controlled import batches.
  - Risk: a “connected” system without trustworthy actuals ingestion into planning.

- Resource management is UI-rich but model-light
  - The new Resources module supports forms and seeded scenarios, but it is still browser-state based.
  - This matters because assignments, hires, attrition, and utilization need persistence and history.
  - Risk: no operational workforce planning integrity.

- Missing workflow and audit trail
  - No approval states, no comments/explanations log, no change history.
  - This matters because EAC changes affect revenue and margin.
  - Risk: no control environment, no defensible finance process.

## Target Architecture

### Data Model

- `projects`
  - master project record, contract/funding metadata, status
- `project_monthly`
  - one row per project per month, storing actual cost, forecast cost, EAC cost, percent complete, cumulative revenue, current-period revenue
- `forecast_by_category`
  - monthly forecast detail by category: labor, subs, equipment, materials, ODC
- `forecast_versions`
  - budget, prior forecast, working forecast, approved forecast, scenario
- `snapshots`
  - immutable saved versions of forecast state at review/close points
- `actual_import_batches`
  - QBO import control and reconciliation header
- `actual_import_lines`
  - transaction-level imported actuals
- `project_qbo_mapping`
  - project/customer/class/item mapping between QBO and planning model
- `employees`
  - QBO employee identities
- `employee_planning_profiles`
  - labor category, org, department, rates, capacity assumptions
- `project_resource_assignments`
  - employee-to-project staffing assignments with effective periods
- `planned_hires`
  - workforce additions with start period and cost
- `planned_attrition`
  - exits/terminations/transfers with effective period and backfill flags

### Core Engine

- Central EAC module
  - `EAC Cost = Actual Cost to Date + Remaining Forecast Cost`
  - `% Complete = Actual Cost / EAC Cost`
  - `Revenue Recognized (cumulative) = % Complete × Funding`
  - `Current Period Revenue = cumulative recognized revenue – prior cumulative recognized revenue`
- This should be the single source for:
  - project monthly P&L
  - overview KPIs
  - variance tables
  - forecast comparisons

### UI Structure

- `Overview`
  - project financial health, plan vs prior vs EAC, key drivers
- `Plan`
  - sub-tabs: Summary, Labor, Subs, Equipment, Materials, ODC
- `Financials`
  - monthly P&L grid, earned revenue rollforward, variance detail
- `Admin`
  - setup, mappings, imports, revenue rules, versions

Separate modules:

- `Resources`
  - employees, assignments, hiring, attrition, analytics
- `Budgeting`
  - consolidated rollups, indirects, add-backs, scenarios

### Key Views

- Overview dashboard
  - revenue, cost, margin plan vs prior vs EAC
  - largest variance drivers
- Monthly P&L grid
  - actual, ETC, EAC, cumulative revenue, current-period revenue
- Forecast planning screens
  - category planning by month with version context
- Variance explanation
  - line/category/project-level reasons for forecast movement
- Resource workforce views
  - headcount, utilization, assignments, hires, exits
- Reconciliation workspace
  - QBO actuals import and mapping exceptions

## Prioritized Build Plan

### Phase 1: Foundation

- Implement normalized monthly data model:
  - `project_monthly`
  - `forecast_by_category`
  - `forecast_versions`
  - `snapshots`
- Build centralized EAC/revenue engine using cost-to-cost POC
- Replace front-end shortcut revenue math in `src/calculations.js`
- Build basic project monthly P&L output from the engine

### Phase 2: Usability

- Wire Overview and Financials to the centralized engine
- Add snapshot/baseline compare
- Add variance explanation capture
- Add period close and actuals-through lock
- Make Plan screens persist forecast data instead of local arrays

### Phase 3: Integration

- Extend QBO integration from connectivity to controlled actuals ingestion
- Add import batches, reconciliation, and mapping exception handling
- Map QBO actuals into `project_monthly`
- Tie QBO project/customer dimensions to project records in Supabase

### Phase 4: Advanced

- Persist Resources module:
  - assignments
  - hires
  - attrition
  - employee planning profiles
- Add workflow and controls:
  - working vs approved forecast
  - close/reopen
  - audit trail
- Build Budgeting module on top of project-level financial plans:
  - consolidated revenue
  - direct cost
  - direct margin
  - indirects, add-backs, scenarios

## Bottom Line

The app already has enough UI structure and integration scaffolding to be a strong base, but the production-critical accounting core is still missing. The next build work should start with the monthly model and centralized EAC/revenue engine, not more UI.
