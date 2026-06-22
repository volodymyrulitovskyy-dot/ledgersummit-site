# Dashboard Specification

## Purpose

The dashboard should support an EAC review meeting, not just provide a visual summary.

The core question it must answer is:

"What is the current at-completion position, what changed since the last review, and where do we need to act?"

## Primary audiences

- Project manager
- Project controls lead
- Finance reviewer
- Operations leader
- Executive sponsor

## Dashboard structure

### 1. Top KPI row

Required cards:

- Contract value
- Funded value
- Revenue EAC
- Cost EAC
- Profit EAC
- Margin percent
- ETC
- VAC
- Last actuals month
- Forecast version under review

### 2. Forecast movement row

This section should explain EAC movement.

Required cards:

- Change in cost EAC vs prior forecast
- Change in revenue EAC vs prior forecast
- Change in profit vs prior forecast
- Change in cost EAC vs budget
- Unapproved change order exposure
- Open risk exposure

### 3. Time-phased chart

Required series:

- Actual cost
- Forecast cost
- Actual revenue
- Forecast revenue
- Budget curve
- Funded curve

Optional overlays:

- Commitments
- Risk-adjusted forecast
- Prior forecast

### 4. Category summary

Required rows:

- Labor
- Subcontractors
- Equipment
- Materials
- ODC

Required columns:

- Budget
- Actuals
- ETC
- EAC
- Variance to budget
- Variance to prior forecast
- Change this month

### 5. Exception panel

The dashboard should call attention to issues before users drill into detail.

Required exceptions:

- Categories over threshold variance
- WBS or cost codes with large forecast movement
- Missing or unmapped actuals
- Overallocated resources
- Forecast lines with missing owners
- Funding shortfall

### 6. Resource summary

Required tiles:

- Planned labor hours
- Available capacity
- Utilization percent
- Overallocated employees
- Unassigned role demand

Required drilldowns:

- By labor category
- By employee
- By organization
- By department

### 7. Review action panel

Required actions:

- Refresh actuals
- Open reconciliation queue
- Open forecast review workspace
- Submit forecast
- Approve forecast

## Drilldown behavior

Users should be able to click from dashboard directly into:

- Labor planning
- Sub planning
- Equipment planning
- Material planning
- ODC planning
- Resource management
- Actuals reconciliation
- WBS or cost-code detail

## Visual guidance

- Favor dense, legible information over oversized cards
- Use conditional color only for state and variance, not as decoration
- Keep the first screen review-oriented
- Reserve large charts for information that actually changes decisions
