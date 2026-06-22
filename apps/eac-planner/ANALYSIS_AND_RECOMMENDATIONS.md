# EAC Planner — Review & Recommendations
*Reviewed: April 2026 — covers `src/eacEngine.js`, `src/calculations.js`, `src/app.js`, `src/state.js`, `qbo-backend/`, and all documentation*

---

## Executive Summary

The application is a well-structured, thoughtful prototype for government-contracting EAC and resource planning. The financial math is largely sound, the architecture documents show a clear long-term vision, and the refactoring work in recent passes (validation decoupling, `DEFAULT_PLANNING_YEAR` centralization, error boundaries) reflects mature engineering judgment.

The three most significant risks to address before production:

1. **`app.js` is a 3,000+ line monolith** — every new feature compounds maintenance cost and makes the planned React migration harder.
2. **The browser is still the authoritative calculation engine** — the `shouldPreferLocalFinance` dual-source logic is a brittle anti-pattern that will cause silent finance discrepancies.
3. **Critical EVM metrics are missing** — the engine lacks CPI, SPI, VAC, and TCPI, which are standard in government contracting and expected by program reviewers.

Everything below is prioritized: **Fix Now → Fix Next Sprint → Fix Later**.

---

## Part 1 — EAC Engine & Financial Logic

### 1.1 `validateProjectFinancialModel` is dead code ✋ Fix Now

**File:** `src/eacEngine.js`

`validateProjectFinancialModel` returns `{ errors, warnings }` but no caller consumes its return value. The aggregate validation — EAC ≥ actual cost, ETC ≥ 0, margin within bounds — is silently ignored at runtime.

**Recommendation:** Wire the validation result into `synchronizeProjectFinancialModel` and expose it on the returned object:

```js
export function synchronizeProjectFinancialModel(project, year) {
  const forecastByCategory = buildForecastByCategory(project, year);
  const projectMonthly = buildProjectMonthly(project, year);
  const validations = validateProjectFinancialModel(projectMonthly); // add this
  return {
    ...project,
    funding: fundingValue(project),
    forecastByCategory,
    projectMonthly,
    snapshots: Array.isArray(project.snapshots) ? project.snapshots : [],
    validations // expose it here
  };
}
```

Then in `buildKpis` in `calculations.js`, include `validations` in the returned object so the UI can surface errors and warnings in the KPI bar.

---

### 1.2 Missing standard EVM metrics ✋ Fix Now

**File:** `src/eacEngine.js`

The engine computes EAC, ETC, % complete, revenue, and margin — but is missing the three core Earned Value Management (EVM) performance indicators required on most government contracts:

| Metric | Formula | Why it matters |
|--------|---------|----------------|
| **CPI** (Cost Performance Index) | `BCWP / ACWP` = `Earned Value / Actual Cost` | Primary measure of cost efficiency; CPI < 1.0 is a red flag |
| **SPI** (Schedule Performance Index) | `BCWP / BCWS` = `Earned Value / Planned Value` | Measures schedule efficiency; required on EVMS-compliant contracts |
| **VAC** (Variance at Completion) | `BAC − EAC` | Funded value minus EAC — the projected over/under-run |
| **TCPI** (To Complete Performance Index) | `(BAC − EV) / ETC` | The cost efficiency needed to finish within the original budget |

The current `computePercentComplete` uses cost-to-cost (ACWP/EAC), which is correct for FFP/CPFF recognition, but the engine doesn't separately track **Planned Value (BCWS)** or **Earned Value (BCWP)** as distinct fields.

**Recommendation:** Add the following exports to `eacEngine.js`:

```js
// Planned Value: % of plan elapsed × total budget
export function computePlannedValue(monthIndex, totalMonths, funding) {
  if (totalMonths <= 0) return 0;
  return (monthIndex / totalMonths) * number(funding);
}

// Cost Performance Index
export function computeCPI(earnedValue, actualCost) {
  const ac = number(actualCost);
  if (ac === 0) return null; // undefined before any actuals
  return number(earnedValue) / ac;
}

// Schedule Performance Index
export function computeSPI(earnedValue, plannedValue) {
  const pv = number(plannedValue);
  if (pv === 0) return null;
  return number(earnedValue) / pv;
}

// Variance at Completion
export function computeVAC(bac, eac) {
  return number(bac) - number(eac);
}

// To Complete Performance Index (vs. BAC)
export function computeTCPI(bac, earnedValue, etc) {
  const remaining = number(etc);
  if (remaining <= 0) return null;
  return (number(bac) - number(earnedValue)) / remaining;
}
```

Surface CPI and SPI prominently in the Overview KPI bar. A CPI < 0.9 should trigger a yellow warning chip; CPI < 0.8 should be red.

---

### 1.3 Period locking is approximated, not enforced ✋ Fix Now

**File:** `src/eacEngine.js` — `buildProjectMonthly`

The current logic treats a month as "actual" when `actualCost > 0`. This is an approximation. A period with `$0` actual cost (e.g., a month where no costs were incurred) is indistinguishable from a period with no actuals entered. This means:

- `actualsThroughIndex` can return the wrong period for projects with genuine zero-cost months
- The forecast-vs-actual blend in `buildProjectMonthly` will misclassify those months

**Recommendation:** Add an explicit `actualsThrough` field to the project model that records the last *closed* period as a string (e.g., `"2026-03"`). Use it as the authoritative lock boundary instead of the `actualCost > 0` heuristic:

```js
function actualsThroughIndex(projectMonthly, actualsThrough) {
  if (actualsThrough) {
    const idx = projectMonthly.findIndex(row => row.period === actualsThrough);
    return idx >= 0 ? idx : -1;
  }
  // fall back to cost-based heuristic only when no explicit period is set
  return projectMonthly.reduce(
    (latest, row, idx) => (number(row.actualCost) > 0 ? idx : latest), -1
  );
}
```

This also directly supports the Phase D actuals-close workflow described in `CODEX_PRODUCTION_PLAN.md`.

---

### 1.4 No Budget at Completion (BAC) tracked separately from EAC — Fix Next Sprint

**File:** `src/eacEngine.js` / data model

The engine uses `fundingValue(project)` as both the **revenue ceiling** and implicitly as the **BAC** (Budget at Completion). In proper EVM these are distinct:

- **BAC** = the original approved budget (time-phased baseline cost, not necessarily equal to contract value)
- **EAC** = re-estimate of total cost at completion
- **VAC** = BAC − EAC (the over/under-run vs. original budget)
- **Revenue ceiling** = the funded contract value (what the government has obligated)

On a CPFF contract, BAC ≈ funded value. On FFP, BAC = contract price. But they can diverge after modifications or when the government partially funds a task order.

**Recommendation:** Add `bac` as a first-class field alongside `effectiveFundedValue` in the project model. Populate it from the baseline snapshot's total planned cost on creation. Use it as the denominator in CPI/SPI/VAC calculations.

---

### 1.5 `lineMonthlyCost` silently falls back to `line.monthly` — Fix Next Sprint

**File:** `src/eacEngine.js`

```js
function lineMonthlyCost(line, category, year) {
  const months = Array.isArray(line?.yearly?.[year]) && line.yearly[year].length === 12
    ? line.yearly[year]
    : (line.monthly || []);
```

If a line has a `yearly` entry for year `2025` but not `2026`, and the caller asks for `2026`, it silently falls back to `line.monthly`. Depending on when `line.monthly` was last set, this can return stale prior-year data as the current forecast.

**Recommendation:** When `line.yearly[year]` is missing, return 12 zeros rather than `line.monthly`, and log a warning in development mode. `line.monthly` should be treated as a legacy/migration field, not a current fallback.

---

### 1.6 `allocateRevenueFromCostShare` doesn't handle multi-year projects — Fix Later

**File:** `src/eacEngine.js`

Revenue allocation across categories is done by cost share within a single `year`. On a multi-year project, allocating revenue by a single year's cost share can distort the category-level revenue picture if cost mix changes significantly between years.

**Recommendation:** When multi-year planning is introduced, the revenue allocation should be computed on the full-project EAC cost, not the single-year slice.

---

## Part 2 — UI Recommendations

### 2.1 `app.js` must be decomposed — Fix Now (begin the split)

`src/app.js` is ~3,000+ lines handling routing, rendering, state mutation, QBO orchestration, event binding, and seeding logic. The `CODEX_REVIEW_PROMPT.md` already identified this and proposed extracting the QBO orchestration layer. That extraction is the right first step.

**Recommended module split** (in dependency order, lower = fewer dependencies):

| New file | Owns | Depends on |
|----------|------|------------|
| `src/qboClient.js` | `fetchJson`, `resolveApiBases`, `loadQboData`, `loadSetupData`, QBO state | `state.js` only |
| `src/renderers/financials.js` | `renderFinancialsView`, `renderOverviewTab`, KPI display functions | `calculations.js`, `charts.js` |
| `src/renderers/plan.js` | `renderPlanView`, `renderPlanningDetail`, all category grid renderers | `calculations.js` |
| `src/renderers/resources.js` | `renderResourcesOverview`, `renderResourceHiringView`, `renderResourceAttritionView` | `calculations.js` |
| `src/renderers/admin.js` | `renderAdminView`, `renderWorkflowView`, setup screens | `qboClient.js`, `calculations.js` |
| `src/app.js` (residual) | `layout`, routing/nav, `updateState`, event delegation root | All above |

Start with `qboClient.js` — it has no rendering dependencies and the `fetchJson` retry loop (with the auth gap from `CODEX_REVIEW_PROMPT.md` issue #2) is self-contained.

---

### 2.2 Direct state mutations outside `updateState` — Fix Now

**File:** `src/app.js`

Multiple async paths mutate `state.*` directly, bypassing the save-and-render cycle. The riskiest are in the QBO load paths where a mutation can occur mid-render. Specific locations identified in `CODEX_REVIEW_PROMPT.md` (issue #3):

- ~line 3046: `state.projects = state.projects.map(...)`
- ~line 3282: `state.projects = projects.map(...)` inside `loadSetupData`
- ~line 3292: `state.selectedProjectId = ...`
- ~line 3838: `state.projects[projectIndex] = mapGovconProjectToAppProject(...)`

All async batch operations should gather mutations and call a single `updateState(patch)` at the end of the batch.

---

### 2.3 Add a `cardHeader()` helper — Fix Now

The `<p class="text-[11px] font-semibold uppercase tracking-[0.24em]..."> + <h2 class="mt-1 text-2xl...">` pattern is repeated ~25 times. `CODEX_UI_IMPROVEMENTS.md` has the exact implementation. This is a straightforward find-and-replace that will also make the plan-subtab restructure (issue 2.4 below) easier.

---

### 2.4 Plan sub-tabs live inside a card — Fix Now

`renderPlanView()` nests sub-tab navigation (Summary, Labor, Subs, Equipment, Materials, ODC) inside the card header, making them look like card actions rather than navigation. The fix in `CODEX_UI_IMPROVEMENTS.md` is correct — emit sub-tabs as a standalone row above the card.

---

### 2.5 Remove Workflow tab from primary nav — Fix Now

The Workflow tab contains static onboarding content that is useful once and never needed in a daily review session. Move it behind a `?` help button as described in `CODEX_UI_IMPROVEMENTS.md` issue #4. The tab slot should either be freed up or used for something decision-relevant (e.g., a "Review" tab for the approval workflow once Phase E is built).

---

### 2.6 Overview tab has duplicate financial data — Fix Now

`renderOverviewTab()` shows Revenue, Cost, and Margin % twice — once as `heroMetricBlock` tiles, and again in the "Core Financial Table" below. The table is more complete. Remove the hero tile row and move the Key Driver block as described in `CODEX_UI_IMPROVEMENTS.md` issue #2.

---

### 2.7 Add semantic `statusChip()` helper — Fix Now

Status values (`Working`, `Approved`, `Baselined`, `Recruiting`, etc.) are displayed as plain text in several tables. They are impossible to scan at a glance. The `statusChip(label)` implementation in `CODEX_UI_IMPROVEMENTS.md` issue #6 is correct and should be applied to the forecast version header, hiring view, attrition view, and resources overview.

---

### 2.8 Variance sign convention is ambiguous — Fix Now

`formatVarianceCell` doesn't prefix positive variances with `+`, forcing users to rely on color alone to determine direction. The fix is in `CODEX_UI_IMPROVEMENTS.md` issue #8. One additional note: clearly document in the UI (tooltip or column header) whether a positive cost variance is favorable or unfavorable — government contractors use different conventions (some follow EVMS where positive = over budget, others invert this).

---

### 2.9 Hardcoded fallback date `"2026-03"` — Fix Now

**File:** `src/app.js` (~line 701)

Replace `currentVersion?.actualsThrough || "2026-03"` with `currentVersion?.actualsThrough || state.ui?.actualsThrough || "—"`. Never hardcode a specific period — it becomes confusing noise in the header once time passes it.

---

### 2.10 No accessibility baseline — Fix Next Sprint

The planning grids are dense HTML tables with no `scope` attributes on `<th>` elements, no ARIA labels on icon buttons, and no keyboard navigation for row add/delete. For a finance workflow tool used by program managers, this is an accessibility gap that should be addressed before production.

Minimum fixes:
- `<th scope="col">` on all column headers
- `aria-label` on icon-only buttons (delete row, copy row)
- `role="status"` on loading/sync status banners
- Focus management after row add/delete operations

---

### 2.11 No empty-state handling for zero-data projects — Fix Next Sprint

When a project has no planning lines (new project after setup), several tabs render empty tables with no guidance. Add contextual empty states: "No labor lines yet — add an employee to start planning" with a direct CTA button to the appropriate sub-tab.

---

### 2.12 `dashboardStatLight` layout is low-contrast — Fix Now

The `rounded-xl bg-stone-50` wrapper creates visual noise around simple label/value pairs. Replace with a border-bottom divider pattern as specified in `CODEX_UI_IMPROVEMENTS.md` issue #5.

---

## Part 3 — Workflow & Architecture Recommendations

### 3.1 `shouldPreferLocalFinance` dual-source pattern is an anti-pattern — Fix Next Sprint

**File:** `src/app.js`

The `shouldPreferLocalFinance` function picks between browser-calculated and backend-calculated financials based on a numeric comparison. This creates a silent dual-source-of-truth: a user might see different numbers after saving vs. before, with no indication why.

This is the most architecturally important issue to resolve. Per `CODEX_PRODUCTION_PLAN.md` Phase B, the backend should become the single authoritative source for persisted financial outputs. The transition path:

1. Mark all browser-calculated KPIs as "preview" (visually distinguish unsaved edits from saved truth)
2. On save, always fetch and render the backend response — never blend
3. Remove `shouldPreferLocalFinance` once the backend is always available for the active project

---

### 3.2 `fetchJson` retry loop masks auth and validation errors — Fix Now

**File:** `src/app.js` — `fetchJson`

As documented in `CODEX_REVIEW_PROMPT.md` issue #4: the retry loop catches all errors uniformly. A 401 (bad token) should not be retried — it should immediately surface a clear auth error. A 400 (bad request) likewise should not retry. Only network-level failures (no response) should trigger a retry across `QBO_API_BASES` candidates.

Add status-based early exit:

```js
async function fetchJson(path, init = {}) {
  const token = globalThis.__QBO_API_TOKEN__;
  const headers = {
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  let lastError;
  for (const base of QBO_API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, { ...init, headers });
      if (res.status === 401) throw new Error("Authentication failed — check API token");
      if (res.status === 400) throw new Error(`Bad request to ${path}`);
      if (!res.ok) throw new Error(`Server error ${res.status} from ${path}`);
      return await res.json();
    } catch (err) {
      // Only retry on network errors, not HTTP errors
      if (err.message.startsWith("Authentication") || err.message.startsWith("Bad request")) throw err;
      lastError = err;
    }
  }
  throw lastError;
}
```

---

### 3.3 CORS is open to `*` with auth enabled — Fix Next Sprint

**File:** `qbo-backend/src/server.js`

CORS is set to `*` before auth middleware runs. This leaks 401 responses to any origin. For local dev, restrict to `http://localhost:4173` via an `ALLOWED_ORIGIN` env var. For production, this must be the exact deployed frontend origin.

---

### 3.4 Approval workflow states need a canonical state machine — Fix Next Sprint

The `CODEX_PRODUCTION_PLAN.md` (Phase E) defines five workflow states: Draft → In Review → Returned → Approved → Locked, with four transition actions. These should be modeled as an explicit state machine (even a simple JS object) rather than ad-hoc string comparisons scattered across the UI.

Define it once:

```js
const WORKFLOW_TRANSITIONS = {
  Draft:      ["Submit for Review"],
  "In Review": ["Approve", "Return"],
  Returned:   ["Resubmit"],
  Approved:   ["Reopen"],  // with permission check
  Locked:     []
};
```

Then derive allowed actions from current state rather than having the logic embedded in individual render functions.

---

### 3.5 No optimistic locking or conflict detection — Fix Later

When two users (or two browser tabs) have the same project open, the last save wins silently. Before adding real multi-user auth, add a `updatedAt` timestamp to the finance model and reject saves where the backend `updatedAt` is newer than the frontend's last-fetched value.

---

### 3.6 No WBS / CLIN structure — Fix Later

Government contracts typically track costs to a Work Breakdown Structure (WBS) and/or Contract Line Item Numbers (CLINs). The current model tracks by cost category (Labor, Subs, Equipment, Materials, ODC) which is useful for internal planning but doesn't map to how DCAA auditors or Contracting Officers review costs.

**Recommendation for Phase C/D:** Add an optional WBS / CLIN dimension to each planning line. This allows the category-level EAC to roll up to contract-reportable dimensions, which is required for EVMS compliance on contracts > $20M.

---

## Part 4 — Testing Gaps

### 4.1 `state.js` migration logic has no tests — Fix Now

`loadState()` contains legacy tab name migration logic (`"dashboard"` → `"overview"`, `"reports"` → `"financials"`, etc.) that has no test coverage. A regression here silently corrupts navigation state for any user with saved state from a prior app version.

Write tests for:
- Load with fewer stored projects than the seed expects
- Load with legacy tab names
- Load with an invalid `activeModule`
- Load with a `planHorizonStartYear` that is `NaN`

### 4.2 `calculations.js` adapter layer has no tests — Fix Now

`buildKpis`, `buildMonthlyMetrics`, and `buildCategorySummary` add logic on top of `eacEngine.js` but have no test coverage. A bug here produces wrong dashboard numbers silently.

### 4.3 QBO backend has no route tests — Fix Now

`server.js` has no tests. Minimum required:
- Missing `startDate`/`endDate` on `/profit-loss` → 400
- Wrong token when `API_AUTH_TOKEN` is set → 401
- No token when `API_AUTH_TOKEN` is not set → 200 (dev mode)

---

## Part 5 — EAC Best Practices Checklist

This table maps each standard government-contracting EAC practice to the current implementation status.

| Practice | Status | Notes |
|----------|--------|-------|
| Cost-to-cost % complete | ✅ Implemented | `computePercentComplete` in `eacEngine.js` |
| EAC = ACWP + ETC | ✅ Implemented | `computeEACCost` |
| ETC = remaining forecast | ✅ Implemented | `computeETC` |
| Revenue recognition (FP catch-up) | ✅ Implemented | Cumulative catch-up logic in `buildProjectMonthly` |
| Funded value vs. contract value distinction | ✅ Implemented | `effectiveFundedValue` vs `contractValue` |
| Baseline snapshot creation | ✅ Implemented | `createProjectSnapshot` |
| Variance to baseline | ✅ Implemented | `computeSnapshotVariance` |
| Variance explanation fields | ✅ Partial | Exists in backend, not prominently surfaced in UI |
| CPI (Cost Performance Index) | ❌ Missing | Add to `eacEngine.js` — see section 1.2 |
| SPI (Schedule Performance Index) | ❌ Missing | Requires Planned Value (BCWS) tracking |
| VAC (Variance at Completion) | ❌ Missing | BAC field not tracked separately |
| TCPI (To Complete Performance Index) | ❌ Missing | Key metric for forecasting rigor |
| Actuals period locking | ⚠️ Approximate | Uses `actualCost > 0` heuristic — see section 1.3 |
| WBS / CLIN structure | ❌ Missing | Categories only — see section 3.6 |
| Unfunded backlog tracking | ⚠️ Partial | Computed but not prominently surfaced |
| Multi-year planning | ⚠️ Partial | `yearly[year]` structure exists but fallback is fragile |
| Approval workflow | ⚠️ Partial | States defined but not enforced as a state machine |
| Audit trail | ❌ Missing | Workflow history exists but is not durable |
| EVMS compliance indicators | ❌ Missing | No formal EVMS compliance reporting |

---

## Prioritized Action List

### Fix Now (current sprint)

1. Wire `validateProjectFinancialModel` result into `synchronizeProjectFinancialModel` and surface in UI
2. Add explicit `+` sign to `formatVarianceCell` and `formatMarginVariance`
3. Fix `fetchJson` to distinguish 401/400 from network errors; add `Authorization` header support
4. Replace hardcoded `"2026-03"` fallback with `"—"` or a state-derived value
5. Wrap all direct `state.*` mutations in async paths with `updateState()`
6. Implement `cardHeader()` helper and apply across render functions
7. Remove Workflow from primary nav; put behind `?` help button
8. Remove duplicate hero metric tiles from Overview
9. Restructure Plan sub-tabs above the card
10. Add `statusChip()` helper and apply to forecast version, hiring, attrition views
11. Replace `dashboardStatLight` background with border-bottom divider
12. Add tests for `state.js` migration, `calculations.js` adapter, and QBO backend routes

### Fix Next Sprint

13. Add CPI, SPI, VAC, TCPI to `eacEngine.js` and surface in Overview KPI bar
14. Add explicit `actualsThrough` field to replace the `actualCost > 0` heuristic
15. Model the approval workflow as a canonical state machine
16. Restrict CORS to known frontend origin via `ALLOWED_ORIGIN` env var
17. Begin `app.js` decomposition — extract QBO orchestration to `src/qboClient.js`
18. Add `shouldPreferLocalFinance` deprecation path — mark browser calc as "preview"
19. Add empty-state handling for zero-data projects
20. Add minimum accessibility baseline (th scope, aria-labels, focus management)

### Fix Later

21. Add BAC as a first-class field separate from funded value
22. Add WBS / CLIN dimension to planning lines
23. Add optimistic locking (`updatedAt` conflict detection)
24. Address multi-year `lineMonthlyCost` fallback behavior
25. Implement formal EVMS compliance reporting for contracts > $20M
26. Full accessibility audit and remediation
27. Print/PDF-friendly financial report view
