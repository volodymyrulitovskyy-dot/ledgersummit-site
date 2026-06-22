# Codex Review Prompt — EAC Planner Rebuild (Pass 2)

You are an expert software engineer continuing work on a JavaScript prototype for a production-grade **Estimate at Completion (EAC) and Resource Management** application used in government contracting and project financial planning.

## What this application does

- Tracks project financials across multiple cost categories: Labor, Subcontractors, Equipment, Materials, and ODC (Other Direct Costs)
- Computes EAC (Estimate at Completion), ETC (Estimate to Complete), percent complete, revenue recognition, and margin using cost-to-cost (Earned Value) methods
- Ingests actuals from QuickBooks Online via a Node.js/Express backend
- Supports multiple projects, plan versions (Working Forecast, Approved Forecast, Baseline), and monthly snapshots
- Manages resource planning by employee, labor category, and organization

## Repository structure

```
rebuild-eac/
├── index.html                  # App shell — loads Tailwind (CDN), Chart.js (CDN), and src/app.js
├── css/styles.css
├── src/
│   ├── app.js                  # Main application: routing, rendering, state mutations, event handling (very large)
│   ├── state.js                # localStorage load/save/reset with migration logic
│   ├── calculations.js         # Adapter layer over eacEngine — builds KPIs, monthly metrics, resource summaries
│   ├── eacEngine.js            # Core financial engine: pure functions for EAC math, forecast rollup, validation
│   ├── charts.js               # Chart.js wrappers for trend and cost mix charts
│   ├── seedData.js             # Demo project data — exports DEFAULT_PLANNING_YEAR and createEmptyProjectState
│   └── mockData.js             # Additional mock data helpers
├── tests/
│   ├── eacEngine.test.js       # Unit tests using Node's built-in test runner (15 passing)
│   ├── reconciliation.test.js
│   └── fixtures/
├── qbo-backend/                # Separate Node.js/Express service for QuickBooks integration
│   └── src/
│       ├── server.js           # Express routes — optional auth via API_AUTH_TOKEN env var
│       ├── anthropicClient.js
│       ├── qboDirectClient.js
│       ├── qboReportParsers.js
│       └── supabaseGovconClient.js
├── docs/
│   ├── ARCHITECTURE.md         # Target production architecture (React, Node, PostgreSQL, RBAC)
│   └── ROADMAP.md              # 4-phase delivery plan
└── package.json                # No build tool; uses `python3 -m http.server 4173` for serving
```

## What was fixed in Pass 1

The following issues from the previous review were addressed and have been verified in the code. Do not re-implement these.

- **`lineMonthlyCost` parameter fix** — `year` is now an explicit named parameter in `eacEngine.js`. ✅
- **Throws removed from render path** — `buildProjectMonthly` and `validateProjectFinancialModel` no longer throw. ✅
- **`normalizeProject` fallback** — `loadState()` now uses `createEmptyProjectState()` from `seedData.js` instead of an index-based project fallback. ✅
- **`ensureSeededResourceModel` decoupled from global** — now accepts `targetState` as an explicit parameter. ✅
- **`mapGovconProjectToAppProject` decoupled from closure** — now accepts `bundle` as an explicit parameter; call sites pass it correctly. ✅
- **`DEFAULT_PLANNING_YEAR` centralized** — exported from `seedData.js`, used across `calculations.js`, `eacEngine.js`, and `state.js`. ✅
- **Optional backend auth** — `server.js` checks `API_AUTH_TOKEN` env var; accepts `Authorization: Bearer <token>` and `x-api-key`. ✅
- **Error boundary in UI** — `renderApp()` is wrapped in `try/catch` with a visible fallback panel and Reset button. ✅

---

## Current issues to fix in this pass

### 1. `validateProjectFinancialModel` is now effectively dead code

**File:** `src/eacEngine.js`

After the Pass 1 fix, `validateProjectFinancialModel` no longer throws and instead returns `{ errors, warnings }`. However, there are no callers in the codebase that consume its return value. The aggregate validation it performs — checking that EAC never falls below actual cost, ETC is non-negative, and margin is within bounds — is now silently ignored.

The function should either be called from a meaningful place in the calculation chain with its result surfaced to the UI, or it should be explicitly documented as a utility for callers to opt into. Currently it provides no runtime protection.

Fix: identify where the aggregate validation result should be consumed (likely in `synchronizeProjectFinancialModel` or the `buildKpis` path in `calculations.js`) and wire it in so errors and warnings are returned alongside the financial model.

---

### 2. Front end does not send auth token to the backend

**File:** `src/app.js` — `fetchJson` function (~line 3103)

The backend now supports `API_AUTH_TOKEN`-based auth, but `fetchJson` does not include any `Authorization` header in its requests. If `API_AUTH_TOKEN` is configured on the server, every frontend call will receive a 401 — and the retry loop will silently cycle through all `QBO_API_BASES` candidates before throwing a generic error with no indication that auth is the cause.

Two changes are needed:

First, add a mechanism for the frontend to send the token. The cleanest approach for a prototype is a `globalThis.__QBO_API_TOKEN__` variable that can be set alongside `__QBO_API_BASE__`, injected via a `<script>` block in `index.html` or a config file.

Second, update `fetchJson` to include the token in the `Authorization` header when present:

```js
async function fetchJson(path, init = {}) {
  const token = globalThis.__QBO_API_TOKEN__;
  const headers = {
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  // ... rest of function
}
```

Third, update `fetchJson` to distinguish a 401 response from a network failure, so the error message tells the developer why the call failed rather than just "unable to reach /endpoint".

---

### 3. Direct state mutations outside `updateState` in `app.js`

**File:** `src/app.js`

Several places mutate `state.*` directly outside of `updateState()`, bypassing the save-and-render cycle:

- ~line 3046: `state.projects = state.projects.map(...)`
- ~line 3282: `state.projects = projects.map(...)` inside `loadSetupData`
- ~line 3292: `state.selectedProjectId = ...`
- ~line 3294: `state.selectedForecastVersionId = null`
- ~line 3838: `state.projects[projectIndex] = mapGovconProjectToAppProject(...)`

These are especially risky in async contexts (the QBO load paths) where a mutation can occur mid-render. Each of these should either be wrapped in `updateState()` or, where they are part of a larger async batch, gathered into a single `updateState` call at the end of the batch.

---

### 4. `fetchJson` retry loop masks auth and validation errors

**File:** `src/app.js` — `fetchJson` (~line 3103)

The retry loop attempts each base URL and catches all errors uniformly, then re-throws `lastError`. This means a 401 (wrong token), a 400 (bad request), and a connection refused error all produce the same behavior: silent retries across all bases, then a throw. A 401 or 400 should not be retried — they are definitive responses that retrying won't fix.

Fix: after receiving a response, check the status before deciding whether to retry. Only retry on network-level failures (no response at all). Return or throw immediately on 4xx/5xx responses.

---

### 5. CORS is still open to `*` even with auth enabled

**File:** `qbo-backend/src/server.js`

The CORS middleware sets `Access-Control-Allow-Origin: *` before the auth middleware runs. This means:

- Unauthenticated 401 responses still include permissive CORS headers
- Any browser on any origin can attempt (and fail) auth, which is unnecessary information leakage

For the prototype, this is tolerable. But as the next step, the CORS origin should be restricted to the known frontend origin (e.g., `http://localhost:4173` for local dev) rather than `*`. This should be configurable via an env var like `ALLOWED_ORIGIN`.

---

### 6. Hardcoded fallback date string in the UI

**File:** `src/app.js` (~line 701)

The actuals-through label renders as:

```js
currentVersion?.actualsThrough || "2026-03"
```

`"2026-03"` is the only remaining hardcoded date in the codebase after Pass 1. This fallback should either come from `state.selectedYear` and a configured actuals-through month in state, or be replaced with a neutral fallback like `"—"` that doesn't imply a specific period.

---

### 7. Test coverage — three specific gaps still unaddressed

No new tests were added in Pass 1. The following are the highest-value additions:

**a) `state.js` — migration and normalization logic**

The `loadState` function now uses `createEmptyProjectState` as the fallback, but there is no test confirming this. A regression here would silently corrupt project data for any user with saved state. Write tests that:
- Load state with fewer stored projects than the seed expects
- Load state with legacy tab names (e.g., `"dashboard"`, `"reports"`, `"actuals"`) and confirm they map to the correct current tab
- Load state with an invalid `activeModule` and confirm it falls back to `"eac"`

**b) `calculations.js` — adapter layer**

`buildKpis`, `buildMonthlyMetrics`, and `buildReconciliationRows` add logic on top of `eacEngine.js` but have no tests. A bug here would produce wrong KPIs in the UI without any test catching it.

**c) QBO backend — route smoke tests**

`server.js` has no tests at all. Add at minimum:
- A test that a missing `startDate`/`endDate` on `/profit-loss` returns 400
- A test that a request with a wrong token when `API_AUTH_TOKEN` is set returns 401
- A test that a request with no token when `API_AUTH_TOKEN` is not set returns 200 (auth is disabled in dev mode)

---

### 8. `app.js` decomposition — propose and begin the split

**File:** `src/app.js`

This file is still a monolith handling routing, rendering, event binding, state mutation, QBO orchestration, and seeding logic. This is the largest unresolved structural risk. Every new feature added here compounds the maintenance cost and makes the planned React migration harder.

In this pass, do not attempt to refactor `app.js` entirely, but do the following:

1. Propose a concrete module split: identify the 4–6 logical units that should become separate files, with a description of what each owns and what the dependency order is.
2. Extract at least one of those units as a working example — the best candidate is the QBO orchestration layer (`loadQboData`, `loadSetupData`, `fetchJson`, `resolveApiBases`), which has no rendering dependencies and can be moved to `src/qboClient.js` cleanly.

---

## Your tasks

1. **Fix each issue above** with working code. Reference exact file names, function names, and line numbers where possible.

2. **Identify any additional issues** not listed above — bugs, anti-patterns, security gaps, or performance problems — and describe them with the same specificity.

3. **Run all existing tests** after your changes and confirm they still pass: `node --test tests/eacEngine.test.js tests/reconciliation.test.js`

4. **Prioritize your additional findings** into: fix now, fix next sprint, fix later.

Please be specific. Provide code snippets for all recommended changes.
