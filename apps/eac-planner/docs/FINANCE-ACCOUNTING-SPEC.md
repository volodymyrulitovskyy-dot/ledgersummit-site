# Finance And Accounting Spec

## Purpose

This document is the canonical finance contract for the current production build of EAC Planner.

Its purpose is to make the backend, database, and UI use the same definitions for:

- commercial values
- actuals
- ETC
- EAC
- FP revenue recognition
- current-period catch-up
- baselines and version comparison

If a calculation, API, or UI label conflicts with this document, this document wins.

---

## 1. Scope For This Build

This spec covers the current finance core only.

In scope:

- project commercial values
- monthly actual cost and forecast cost
- EAC cost
- percent complete
- cumulative revenue to date
- current-period catch-up revenue
- EAC margin and margin %
- baseline / prior forecast / current forecast comparison
- closed-period vs open-period behavior

Out of scope for this document:

- authentication and access control
- infrastructure and deployment
- advanced earned value management metrics beyond the fields explicitly listed here
- portfolio optimization
- ERP write-back

---

## 2. Canonical Terms

## 2.1 Commercial values

### Base Contract Value

Definition:

- contractual value before planning modifications

System source:

- accounting-owned setup

Current mapping:

- `govcon_contracts.ceiling`

### Base Funded Value

Definition:

- funded amount before planning modifications

System source:

- accounting-owned setup

Current mapping:

- `govcon_projects.funded`
- mirrored in `govcon_contracts.funded` where appropriate

### Modification Value

Definition:

- planning-time commercial change that adjusts both contract value and funded value for the current forecast model

Purpose:

- model expected mods or in-process funding/ceiling changes without overwriting the accounting-owned base values

### Effective Contract Value

Formula:

- `effective_contract_value = base_contract_value + modification_value`

### Effective Funded Value

Formula:

- `effective_funded_value = base_funded_value + modification_value`

### Unfunded Backlog

Definition:

- commercial capacity above current funding

Formula:

- `unfunded_backlog = max(effective_contract_value - effective_funded_value, 0)`

Interpretation:

- unfunded backlog is not a negative forecast variance
- it is commercial value not yet funded for revenue-recognition purposes

---

## 3. Cost Terms

### Actual Cost To Date

Definition:

- cost posted/imported in closed or actualized periods up to the current actuals-through month

Rules:

- actual cost is historical
- actual cost in closed periods is not edited through planning

### ETC Cost

Definition:

- estimate to complete
- future remaining forecast cost only

Formula:

- `etc_cost = sum(open/future period forecast cost)`

Rules:

- ETC cannot be negative
- ETC excludes closed-period actuals

### EAC Cost

Definition:

- estimate at completion cost

Formula:

- `eac_cost = actual_cost_to_date + etc_cost`

Rules:

- EAC cost cannot be below actual cost to date

---

## 4. Percent Complete

### Percent Complete Through Actuals

Definition:

- financial progress measure for FP cost-to-cost revenue recognition

Formula:

- `% complete = actual_cost_to_date / eac_cost`

Rules:

- if `eac_cost <= 0`, percent complete is `0`
- percent complete must be bounded between `0` and `1`
- for headline FP financial reporting, use actual-cost-based percent complete, not end-of-horizon forecast completion

Important note:

- the UI may still show forecast rollforward through the end of the year
- but headline recognized-revenue metrics must use percent complete through actuals

---

## 5. Revenue Recognition

## 5.1 Revenue ceiling

### Fixed Price

Revenue-recognition ceiling:

- `effective_funded_value`

Fallback:

- only if funded value is unavailable, use contract-value fallback according to explicit business rule

Default current rule:

- use effective funded value first
- only fall back to effective contract value when funded value is not configured

### Time and Materials / Other Methods

This document is primarily the FP production contract.

TM, CPFF, and other methods may use different revenue mechanics, but they must still be expressed in monthly persisted facts and must not overload FP fields with different meanings.

## 5.2 Cumulative Revenue To Date

Definition:

- total revenue earned through the current actuals-through period

Formula for FP cost-to-cost:

- `cumulative_revenue_to_date = percent_complete_through_actuals × effective_funded_value`

## 5.3 Current-Period Catch-Up Revenue

Definition:

- revenue adjustment recognized in the current accounting period after recalculating cumulative revenue to date

Formula:

- `current_period_catch_up = new_cumulative_revenue_to_date - prior_cumulative_revenue_to_date`

Interpretation:

- this can be positive or negative
- if EAC increases materially, the catch-up may be negative
- the catch-up belongs in the current period
- closed prior periods are not rewritten one by one

## 5.4 Remaining Funded Revenue

Formula:

- `remaining_funded_revenue = max(effective_funded_value - cumulative_revenue_to_date, 0)`

---

## 6. Margin Terms

### EAC Margin $

Formula:

- `eac_margin = revenue_ceiling - eac_cost`

For FP:

- `eac_margin = effective_funded_value - eac_cost`

### Margin %

Default presentation basis:

- margin on revenue

Formula:

- `margin_pct = (revenue_ceiling - eac_cost) / revenue_ceiling`

Rules:

- if revenue ceiling is `0` and cost exists, margin % should display as `-100%`
- do not mix margin-on-revenue and margin-on-cost under the same label

---

## 7. Versioning And Comparison Terms

## 7.1 Original Budget

Definition:

- original approved budget reference point

Purpose:

- budget comparison

## 7.2 Working Forecast

Definition:

- currently editable forecast model

Purpose:

- planning and update workspace

## 7.3 Approved Forecast

Definition:

- formally approved forecast version for the current cycle

Purpose:

- official comparison and reporting reference

## 7.4 Baseline Snapshot

Definition:

- immutable saved reference used for comparison

Purpose:

- compare current state to a known prior point

Rules:

- approved history must not be overwritten
- if a new review cycle starts, create a new version/snapshot instead of mutating an approved one

---

## 8. Closed-Period Behavior

## 8.1 Actuals Through

Definition:

- last accounting period published as actual

This value controls:

- which periods count as actual cost to date
- where revenue-to-date is recognized through
- which periods are locked from planning edits

## 8.2 Closed periods

Rules:

- closed periods use actuals
- closed periods are not editable in planning
- revenue for FP is recognized through the actuals-through period only

## 8.3 Open periods

Rules:

- open periods remain forecast / ETC space
- users can edit future forecast cost in open periods

---

## 9. Canonical Backend Outputs

The backend-owned project financial model should return at minimum:

### Summary

- project id
- version id
- baseline snapshot id if present
- actuals-through period
- base contract value
- base funded value
- modification value
- effective contract value
- effective funded value
- unfunded backlog
- actual cost to date
- ETC cost
- EAC cost
- percent complete through actuals
- cumulative revenue to date
- current-period catch-up revenue
- remaining funded revenue
- EAC margin
- margin %

### Monthly rows

Per month:

- period
- actual cost
- forecast cost
- ETC at that point
- EAC cost at that point
- percent complete through actuals at that point
- cumulative revenue to date at that point
- current-period catch-up revenue
- current-period cost
- current-period margin
- current-period margin %
- lock status / actual-vs-forecast status

### Category summary

Per category:

- actuals
- ETC
- EAC
- variance to budget
- variance to prior forecast / baseline
- driver rank / contribution if available

### Comparison summary

- cost variance vs baseline
- revenue impact vs baseline
- margin variance vs baseline
- top movement drivers

---

## 10. UI Label Contract

Use these labels consistently:

- `Base Contract Value`
- `Base Funded Value`
- `Modification Value`
- `Effective Contract Value`
- `Effective Funded Value`
- `Unfunded Backlog`
- `Actual Cost To Date`
- `ETC Cost`
- `EAC Cost`
- `Percent Complete Through Actuals`
- `Cumulative Revenue To Date`
- `Current-Period Catch-Up Revenue`
- `Remaining Funded Revenue`
- `EAC Margin`
- `Margin %`

Do not use:

- `underperformance` to describe unfunded backlog
- `100% complete` for a project just because the forecast horizon is fully filled
- one generic `Revenue` label for both ceiling-at-completion and revenue-to-date

---

## 11. Non-Negotiable Rules

1. Closed periods are history, not editable forecast space.
2. FP recognized revenue is based on cost-to-cost progress through actuals.
3. Contract above funding is backlog, not variance.
4. Current-period revenue for FP is a cumulative catch-up delta.
5. Approved versions must not be overwritten in place.
6. Material finance outputs must be persisted and reproducible.

---

## 12. Immediate Backend Use

This document should drive the next backend work:

1. create authoritative project financial model API outputs
2. align persisted monthly fact tables to these definitions
3. align baseline/version compare logic to these definitions
4. align Financials and Overview UI labels to these definitions

