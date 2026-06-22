# EAC Planner Target Architecture

## Objective

Build a production-ready application for:

- estimate at completion calculations
- project financial planning
- resource planning and utilization
- QuickBooks actuals ingestion
- actual vs forecast reporting
- auditability and approvals

## Target stack

Recommended stack:

- Frontend: React with Tailwind CSS and Chart.js
- Backend: Node.js service layer with typed APIs
- Database: PostgreSQL with migrations and reporting views
- Auth: role-based access with project and organization scopes
- Jobs: scheduled workers for QuickBooks sync, rollups, and notifications
- Hosting: managed web and API deployment with separate environments

## System layers

### 1. Presentation layer

Owns:

- dashboards
- project setup screens
- planning grids
- resource views
- actuals reconciliation screens
- reports and exports

Rules:

- no direct database access from browser
- all writes go through backend APIs
- all calculations shown to users come from backend-owned services

### 2. API and domain services

Owns:

- project lifecycle
- plan versioning
- planning rules
- EAC calculation engine
- scenario cloning
- approval workflow
- reporting APIs
- QuickBooks sync orchestration

Suggested domains:

- `projects`
- `planning`
- `resources`
- `actuals`
- `financials`
- `reporting`
- `integration`

### 3. Data layer

Primary entities:

- organizations
- users
- roles
- projects
- contracts
- project_wbs
- cost_codes
- plan_versions
- plan_calendar_months
- labor_plan_lines
- sub_plan_lines
- equipment_plan_lines
- material_plan_lines
- odc_plan_lines
- employees
- labor_roles
- vendors
- equipment_catalog
- material_catalog
- actual_import_batches
- actual_import_rows
- actual_monthly_facts
- mapping_rules
- audit_events

### 4. Integration layer

QuickBooks integration should support:

- scheduled pulls
- raw source retention
- idempotent imports
- mapping from accounting dimensions to project dimensions
- reconciliation status
- exception queue for unmapped or conflicting records

## Core product behavior

### Versioning

Each project should support:

- baseline budget
- approved forecast
- working forecast
- scenario copies
- frozen monthly snapshots

Users should never edit historical approved versions in place.

### Actuals and forecast blending

The reporting model should:

- mark closed actual periods
- lock actuals from planning edits
- keep future forecast editable
- expose actual, forecast, and blended EAC values separately

### EAC calculations

Backend should compute:

- ETC
- EAC cost
- EAC revenue
- gross profit
- margin percent
- variance to budget
- variance to prior forecast
- burn rate and staffing demand

## Security and controls

Required controls:

- server-side authorization
- audit trail for all material changes
- approval states and sign-off
- environment-based secrets management
- no public exposure of service credentials

## Operational readiness

Required before production:

- migration workflow
- automated tests for domain calculations
- API contract tests
- error monitoring
- job monitoring
- import retry and replay support
- backup and restore plan
