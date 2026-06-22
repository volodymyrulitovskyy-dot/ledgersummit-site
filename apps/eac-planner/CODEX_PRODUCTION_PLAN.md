# EAC Planner — Production Readiness Plan

## Purpose

This is the updated operating plan for taking the current `rebuild-eac` application from a working prototype-plus-backend into a production-ready project finance product.

This version replaces the earlier greenfield-style plan. The system is no longer just a static frontend concept. We now have:

- a working interactive frontend in [`/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/app.js`](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/app.js)
- a live QBO/Supabase backend in [`/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/qbo-backend/src/server.js`](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/qbo-backend/src/server.js)
- a functioning EAC engine in [`/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/eacEngine.js`](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/eacEngine.js)
- working tests for core finance logic in [`/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/tests/eacEngine.test.js`](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/tests/eacEngine.test.js) and [`/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/tests/calculations.test.js`](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/tests/calculations.test.js)
- Supabase schema and setup artifacts in [`/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/supabase`](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/supabase)

The goal now is not “start over correctly.” The goal is:

1. preserve the working product value already built  
2. move calculations and persistence into a governed backend model  
3. add real authentication, workflow, audit, and production controls  
4. harden the app into a secure, multi-user finance workflow

---

## 1. Current State

## 1.1 What exists today

### Frontend

- live single-page app with:
  - Overview
  - Plan
  - Financials
  - Admin
  - Resources
  - Budgeting
- live project setup display and editing
- project financial visuals and tables
- FP revenue-recognition presentation improvements
- Ask AI explainer layer

### Backend

- Express-based backend for:
  - QBO connect / callback / refresh
  - company info and reports
  - bootstrap endpoints
  - actuals import endpoints
  - finance persistence endpoints
  - sandbox helpers for QBO seeding
- direct QBO client with sandbox/production environment handling
- Supabase govcon persistence client

### Data layer

- active Supabase project already in use
- project setup schema additions
- monthly finance persistence tables
- QBO connection and mapping infrastructure
- live seeded project setup for selected projects

### Financial engine

- cost-to-cost EAC engine exists
- fixed-price revenue logic now distinguishes:
  - revenue ceiling at completion
  - cumulative revenue to date
  - current-period catch-up
  - unfunded backlog
- baseline snapshot support exists structurally

### Testing

- core unit tests exist for:
  - EAC engine
  - calculations
  - state normalization
  - QBO parser behavior

## 1.2 What is still incomplete

The current app is best described as:

- strong product prototype
- partial operational backend
- partial data persistence
- incomplete production control environment

The biggest remaining gaps are:

- no real end-user auth/session model
- no enforced role-based authorization
- no mandatory tenant isolation policy layer
- no formal review/approval workflow
- no durable audit trail for material finance changes
- frontend still owns too much calculation orchestration
- no backend-owned calculation service yet
- no CI/CD, monitoring, staging, or production release process
- no production-ready import jobs / reconciliation workflow

Working estimate:

- product/UX maturity: **65–75%**
- backend/data maturity: **50–60%**
- production-readiness maturity: **35–45%**

## 1.3 Current phase tracker

This is the practical progress view for the engine/UI-first path.

### Overall completion

- estimated completion against the current plan: **100%**

### Done

- finance/accounting model is now documented in a canonical spec
- FP revenue-recognition language is materially cleaner in the UI
- backend-owned project financial model route now exists
- backend response now includes:
  - summary
  - monthly rows
  - category summary
  - comparison summary
- Overview and Financials now consume backend-authoritative finance outputs when available
- finance save flow now re-fetches and reapplies backend truth after successful persistence
- baseline snapshot creation now immediately persists and refreshes from the backend model
- actuals/import-driven changes now refresh the authoritative backend finance model
- Plan, Admin, and Workflow now use backend finance outputs where applicable
- forecast version selection is more consistent across setup bundle and project state
- major EAC screens now use a shared backend-aware KPI adapter instead of mixed local headline logic
- backend monthly finance model now honors actuals-through/close behavior when determining locked periods
- backend finance model now explicitly resolves:
  - selected working forecast
  - prior approved forecast
  - baseline snapshot comparison basis
- major UI screens now display comparison basis using backend forecast-state semantics instead of local assumptions
- backend now supports explicit forecast version transitions through saved status updates
- finance saves now refresh live setup bundle data so persisted explanation records are visible in the UI
- Admin now displays saved revenue and variance explanations plus version transition actions
- Admin now allows manual editing of:
  - revenue explanation
  - variance explanation
  - workflow comment
  - close-through period
- workflow/close actions now persist visible transition history records
- backend now supports explicit close/reopen actions for actuals-through control
- transition history now carries clearer version/action context in the UI
- Financials, Overview, Workflow, and Admin presentation have been materially consolidated to reduce card sprawl
- Budgeting secondary views now surface more backend-authoritative finance context
- Admin workflow surface now summarizes active version, close state, and latest action more clearly
- workflow history now separates actor from comment so review activity is easier to audit
- guided setup now includes workflow/close control as an explicit step
- `actuals through` now prefers backend summary truth more consistently in the UI
- dedicated backend finance report endpoint now exists for export/report surfaces
- Financials now supports direct finance report export from backend-owned data

### In Progress

- none for the current engine/UI-first plan

### Next

- user review and acceptance of the completed engine/UI-first phase
- capture any refinement items as a new phase rather than leaving this one partially open

### Later

- formal actuals close workflow and locked-period behavior
- review and approval workflow with durable transition history
- auth, tenant safety, and operational hardening

---

## 2. Production Goal

Ship a secure, auditable, multi-user EAC application that supports:

- project setup
- planning by category
- actuals import
- cost-to-cost EAC
- FP revenue recognition with cumulative catch-up
- baseline and prior-forecast comparison
- documented variance explanation
- workflow review and approval
- controlled history and auditability

The product should be:

- credible for finance users
- explainable to reviewers and executives
- maintainable by engineering
- safe to operate with real project data

---

## 3. Production Principles

### 3.1 Preserve what works

Do not rebuild major working areas unless the current implementation blocks production readiness.

### 3.2 Move control downward

Over time, shift critical logic from:

- browser state

to:

- backend services
- persisted finance records
- audited workflow transitions

### 3.3 Treat tenant and access controls as mandatory

This is not optional hardening. Tenant safety and authorization are part of the core system.

### 3.4 Keep the financial story explainable

The app must help users answer:

- what changed
- why it changed
- what is funded
- what is recognized
- what remains
- what needs approval

### 3.5 No production finance feature without persistence and tests

Any material finance workflow must have:

- a stored record
- test coverage

Access control and operational hardening still matter, but they are intentionally not on the immediate critical path for the current build sequence.

---

## 4. Target Production Architecture

## 4.1 Near-term architecture decision

Do **not** force an immediate rewrite to Next.js/React just to satisfy architecture aesthetics.

Near-term production path:

- keep current frontend running
- harden current backend and Supabase model
- move critical workflows to backend-owned persistence and APIs
- finish the finance engine, actuals workflow, review workflow, and UI
- add auth, RLS, and operational hardening after the finance product core is stable

Later replatforming can still happen, but it should be a conscious product/engineering decision, not Phase 1 default work.

## 4.2 Backend boundary

The backend should become the owner of:

- finance model persistence
- import orchestration
- workflow transitions
- audit event creation
- AI prompt packaging for sensitive finance context
- eventually auth/session validation and role checks

## 4.3 Database boundary

Supabase/Postgres should remain the system of record for:

- project master data
- contract and funding values
- setup metadata
- forecast versions
- monthly finance facts
- imported actuals
- workflow history
- audit events

## 4.4 Browser boundary

The frontend should own:

- interaction and display
- local edit experience
- draft UX state

The frontend should not remain the long-term source of truth for:

- approval transitions
- material finance calculations
- audit history
- permissions once auth is introduced

---

## 5. Core Production Gaps To Close

## 5.1 Authentication and authorization

Must implement:

- real sign-in
- session management
- protected backend routes
- role-based access
- tenant-aware access control

Recommended:

- Supabase Auth if it fits current stack quickly
- row-level security policies enforced for all finance tables

For the current build sequence, this section is intentionally deferred until the finance engine, workflow model, and UI are stable enough to harden.

## 5.2 Finance model ownership

Must move toward backend-owned finance behavior for:

- monthly project model persistence
- baseline snapshot creation
- version transitions
- revenue recognition rollforward
- variance comparisons

The browser can still preview calculations, but persisted and approved numbers should come from backend-owned logic.

## 5.3 Workflow and approvals

Must implement:

- Draft
- In Review
- Returned
- Approved
- Locked

And actions:

- Save Draft
- Submit for Review
- Return
- Approve
- Reopen with permissions

## 5.4 Auditability

Must record who changed:

- funding / contract values
- planning lines or normalized finance outputs
- revenue rule setup
- snapshots and baselines
- workflow states
- adjustments and notes

## 5.5 Actuals ingestion and reconciliation

Must formalize:

- import batches
- row-level reconciliation state
- mapping exceptions
- publish/close behavior for actuals through a closed period

## 5.6 Operational hardening

Need:

- staging environment
- environment separation
- secrets management
- CI checks
- logging and monitoring
- documented deployment and rollback

For the current build sequence, this section is also intentionally deferred until the finance product core is stable.

---

## 6. Minimum Production Data Model

The production target should evolve the existing govcon-oriented model, not replace it blindly.

Minimum durable entities:

- `govcon_projects`
- `govcon_contracts`
- `govcon_project_setup`
- `govcon_project_qbo_mapping`
- `govcon_forecast_versions`
- `govcon_project_monthly`
- `govcon_forecast_by_category`
- `govcon_project_snapshots`
- `actual_import_batches`
- `actual_import_rows`
- `workflow_events`
- `audit_events`
- `adjustments`
- `notes`
- `comments`
- `users`
- `roles`
- `user_roles`

Important rule:

Do not create a second parallel finance model unless there is a migration plan and a clear cutover strategy.

---

## 7. Business Logic Requirements

## 7.1 EAC and FP revenue recognition

The production logic must support:

- `EAC Cost = Actual Cost To Date + ETC`
- `% Complete Through Actuals = Actual Cost To Date / EAC Cost`
- `Cumulative Revenue To Date = % Complete × Effective Funded Value`
- `Current Period Catch-Up = New cumulative revenue – Previously recognized cumulative revenue`
- `EAC Margin = Revenue Ceiling – EAC Cost`

The app must treat:

- `effective funded value` as the revenue-recognition ceiling
- `contract value minus funded value` as unfunded backlog

## 7.2 Versioning and baselines

Need clear distinction between:

- original budget
- working forecast
- approved forecast
- baseline snapshot
- prior approved comparison point

Approved versions must never be overwritten in place.

## 7.3 Actuals close logic

Need:

- actuals-through period
- lock on closed periods
- forecast editable only in open periods
- import/reopen controls

---

## 8. Production Screens

Production release should include at minimum:

### Projects

- searchable project list
- status and ownership
- setup completeness and workflow status

### Overview

- project summary
- commercial position
- plan and EAC trend
- action center

### Financials

- revenue recognition section
- forecast economics section
- variance explanation
- monthly project P&L
- category detail

### Plan

- category-based future forecast editing
- version context
- closed/open period clarity

### Admin

- project setup
- commercial values
- revenue rules
- QBO mapping and sync
- baseline/snapshot controls

### Workflow / Review

- compare current draft vs prior approved
- reviewer notes
- submit / approve / return actions

---

## 9. Delivery Plan To Production

## Phase A — Freeze the finance model

Goal:

- lock the accounting and forecasting model before building more workflow around it

Deliver:

- canonical definitions for:
  - contract value
  - funded value
  - modification value
  - effective contract value
  - effective funded value
  - actual cost to date
  - ETC
  - EAC cost
  - cumulative revenue to date
  - current-period catch-up
  - unfunded backlog
- supported contract types and revenue methods for the first production release
- clear baseline vs prior forecast vs current forecast definitions
- written calculation spec aligned with the existing engine

Exit criteria:

- no major finance label or formula is ambiguous
- Overview, Financials, Admin, and Plan are all speaking the same accounting language

## Phase B — Make the backend own the engine

Goal:

- make backend-computed finance outputs the official source of truth

Deliver:

- authoritative project financial model API
- backend-owned monthly rollforward outputs
- backend-owned summary KPIs
- backend-owned category summaries
- backend-owned revenue-recognition outputs for FP
- frontend updated to render backend-owned outputs as the official model

Exit criteria:

- official saved financial numbers are not browser-only constructs
- the frontend can preview edits, but persisted finance results come from backend-owned logic

## Phase C — Complete the persistence model

Goal:

- make the monthly finance and planning model durable and version-aware

Deliver:

- authoritative use of:
  - `govcon_project_monthly`
  - `govcon_forecast_by_category`
  - `govcon_project_snapshots`
  - `govcon_forecast_versions`
- durable baseline creation
- durable prior/current version comparison records
- adjustments and notes persistence tied to version/snapshot context
- audit events for material finance changes

Exit criteria:

- the monthly finance model survives refreshes, project switches, and review cycles
- versions and baselines are queryable and reproducible

## Phase D — Formalize actuals workflow

Goal:

- make actuals import, publish, and close reliable enough for real forecasting use

Deliver:

- import batches
- reconciliation status
- mapping exception handling
- actuals-through close control
- publish actuals into project monthly facts
- lock actual periods from planning edits
- keep future periods open for ETC changes

Exit criteria:

- actuals import is repeatable and explainable
- closed periods behave like history, not editable forecast space

## Phase E — Build review and approval workflow

Goal:

- make the finance cycle governable before hardening auth and ops

Deliver:

- draft / in review / returned / approved / locked states
- submit / return / approve / reopen transitions
- compare current vs prior approved
- reviewer notes
- activity history

Exit criteria:

- a full forecast cycle can run without overwriting approved history
- reviewers can see what changed and why before approving

## Phase F — Finish the production-grade UI

Goal:

- make the product core clear, fast, and decision-useful once the backend truth exists

Deliver:

- Overview tied to authoritative financial outputs
- Financials tied to authoritative revenue recognition and EAC outputs
- Plan tied to open-period editing and version context
- Admin tied to durable setup, mappings, rules, versions, and controls
- Workflow/review screen tied to compare and approval actions

Exit criteria:

- the UI is no longer just persuasive; it is operating against durable finance truth

## Phase G — Add auth and operational hardening

Goal:

- secure and support the completed finance product core

Deliver:

- auth
- role and tenant controls
- CI
- staging
- monitoring
- deployment and rollback docs

Exit criteria:

- the system is both financially credible and operationally safe

---

## 10. Definition of Production Ready

The app is production ready when all of the following are true.

### Functional

- projects, setup, and finance records are persisted
- actuals import and reconciliation are operational
- financial review is driven by persisted data
- baseline/version workflow exists
- approval states are visible and enforced
- audit trail exists for material changes
- users can authenticate
- users can access only allowed projects/actions

### Technical

- environment configuration is secure
- tests run in CI
- staging exists
- monitoring exists
- release/rollback process is documented

### Operational

- seed/demo path exists for non-production environments
- key assumptions are documented
- known limitations are documented
- ownership for support and maintenance is clear

---

## 11. One-Page Production Summary

To get this app production ready, we do **not** need to start over. We need to finish the finance product core first, then harden access and operations after that core is stable.

### What is already built

- working frontend experience
- live backend
- Supabase-backed setup and finance persistence foundation
- QBO integration foundation
- tested EAC engine
- improving FP revenue-recognition presentation

### What we still need

1. **A frozen finance/accounting model**
- lock definitions for funded value, contract value, modifications, actuals, ETC, EAC, catch-up revenue, backlog, and baselines

2. **A backend-owned engine**
- authoritative monthly financial model API
- backend-owned revenue recognition and EAC outputs
- frontend rendering backend truth instead of owning the official math

3. **Durable persistence**
- authoritative monthly facts
- durable versions and baselines
- adjustments and notes tied to review context
- audit events for material finance changes

4. **Actuals close and reconciliation workflow**
- import batches
- reconciliation state
- mapping exceptions
- actuals-through close control
- publish actuals safely into monthly facts

5. **Review and approval workflow**
- draft / in review / returned / approved / locked
- compare current vs prior approved
- reviewer notes and actions

6. **Production-grade UI on top of the engine**
- Overview, Financials, Plan, Admin, and Workflow all driven by durable backend truth

7. **Then auth and operational hardening**
- auth
- tenant controls
- CI
- staging
- monitoring
- deployment docs

### Best sequence

1. freeze the finance model  
2. move engine ownership to the backend  
3. complete the persistence model  
4. formalize actuals import and close  
5. add review/approval workflow  
6. finish the UI against backend truth  
7. then harden auth and operations

### Key production rule

No material finance workflow should exist without:

- persistence
- auditability
- tests

Permissions and operational controls still matter, but they are being intentionally sequenced after the finance core is complete.

---

## 12. Immediate Next Actions

Do these next, in order:

1. write and lock the finance/accounting spec for the current production scope
2. move the EAC and FP revenue-recognition outputs into a backend-owned project financial model API
3. formalize authoritative use of monthly finance, version, and snapshot tables
4. add adjustments, notes, workflow events, and audit events tied to version/snapshot context
5. implement actuals import batch/reconciliation model and closed-period controls
6. add workflow UI for submit/review/approve/return and compare-to-prior
7. finish the UI against authoritative backend outputs
8. after that, add auth, tenant controls, and operational hardening
