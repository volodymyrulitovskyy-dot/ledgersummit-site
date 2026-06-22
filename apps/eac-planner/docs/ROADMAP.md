# EAC Planner Delivery Roadmap

## Release 1: Platform foundation

Deliver:

- application shell
- authentication and roles
- project setup
- WBS and cost code model
- plan version model
- audit logging
- backend API foundation

Exit criteria:

- users can create projects and plan versions safely
- all writes are backend mediated
- permissions are enforced

## Release 2: Planning workflows

Deliver:

- labor planning
- subcontractor planning
- equipment planning
- material planning
- ODC planning
- revenue policy configuration
- EAC rollup engine

Exit criteria:

- planners can create a full monthly forecast
- working forecast and approved forecast are distinguishable
- EAC reporting is generated from backend services

## Release 3: QuickBooks integration

Deliver:

- connection setup
- import scheduler
- raw import persistence
- mapping tables
- reconciliation queue
- actual refresh pipeline

Exit criteria:

- actuals load on schedule
- reruns are safe
- unmapped data is visible and actionable

## Release 4: Resource management and analytics

Deliver:

- employee assignments
- utilization planning
- staffing demand charts
- executive dashboard
- variance analytics
- export workflows

Exit criteria:

- resource plans align with financial plans
- stakeholders can compare baseline, actuals, and forecast in one place
