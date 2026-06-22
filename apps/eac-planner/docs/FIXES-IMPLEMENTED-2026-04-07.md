# Fixes Implemented — 2026-04-07

## Scope

This pass focused on high-value stability and architecture fixes that improve the current prototype without attempting a large structural rewrite.

The goal was to address the most actionable issues from the review prompt while preserving the current cost-to-cost EAC engine direction and keeping the app testable.

## What Was Done

### 1. Replaced fragile `arguments[2]` usage in the financial engine

File:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/eacEngine.js`

Change:
- `lineMonthlyCost` now accepts `year` as an explicit named parameter instead of reading it from `arguments[2]`.

Why:
- This was brittle and hard to maintain.
- Explicit parameters are safer for refactoring and easier to understand.

### 2. Removed validation throws from the render path

File:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/eacEngine.js`

Change:
- `validateProjectFinancialModel()` no longer throws.
- `buildProjectMonthly()` no longer throws on validation errors.
- Validation still returns structured `errors` and `warnings` data.

Why:
- Engine functions are invoked during rendering.
- Throwing inside the render path can blank the UI and make the app unrecoverable.
- This keeps the validation layer useful without making the UI brittle.

### 3. Fixed state normalization fallback for live or migrated projects

File:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/state.js`

Supporting file:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/seedData.js`

Change:
- Added `createEmptyProjectState(projectId)` in `seedData.js`
- `loadState()` now uses that factory instead of `fresh.projects[index] || fresh.projects[0]`

Why:
- Index-based fallback can apply the wrong seed project shape to unrelated stored projects.
- A fresh empty project shape is safer for migrated, live, or bootstrapped projects.

### 4. Centralized the planning year default

Files:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/seedData.js`
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/state.js`
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/calculations.js`
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/app.js`

Change:
- Added `DEFAULT_PLANNING_YEAR`
- Replaced several hardcoded `2026` defaults in state/calculation paths

Why:
- Multi-year planning is already present in the UI.
- Hardcoded year defaults create hidden behavior and are difficult to audit later.

### 5. Made project mapping more testable and less coupled to global UI state

File:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/app.js`

Change:
- `mapGovconProjectToAppProject(project, existingProject, bundle)` now accepts `bundle` explicitly
- Call sites now pass the setup bundle where available

Why:
- The mapper previously depended on `setupState.bundle` through closure reads.
- Passing the bundle explicitly makes the function more deterministic and easier to test.

### 6. Reduced direct hidden mutation in seeded resource setup

File:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/app.js`

Change:
- `ensureSeededResourceModel(targetState = state)` now accepts a state object explicitly
- Main call sites now pass `state`

Why:
- This does not fully eliminate mutation, but it makes the function operate on an explicit target instead of silently assuming the module-global state.
- It is a safer intermediate step before broader decomposition.

### 7. Added a top-level UI recovery path

File:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/app.js`

Change:
- Wrapped `renderApp()` in `try/catch`
- Added a visible fallback panel with:
  - error message
  - `Reset To Defaults` button

Why:
- The app previously risked a blank screen if rendering failed.
- This improves recoverability during development and for prototype use.

### 8. Added optional API auth to the QBO backend

File:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/qbo-backend/src/server.js`

Change:
- Added optional token-based auth middleware using `API_AUTH_TOKEN`
- Accepts either:
  - `Authorization: Bearer <token>`
  - `x-api-key: <token>`
- If `API_AUTH_TOKEN` is not configured, behavior remains unchanged for local development

Why:
- The backend previously allowed unauthenticated access to financial endpoints.
- This provides a small but meaningful control without breaking local workflow.

## What Was Not Done

### 1. Full app decomposition

Not done:
- Splitting `app.js` into renderers, handlers, router, and integration modules

Why not:
- This is a larger architectural change with high merge risk.
- It should be done deliberately, not mixed into a stabilization pass.

### 2. Full React migration

Not done:
- No framework migration was attempted

Why not:
- The current pass focused on correctness and stability in the existing prototype.

### 3. Full state immutability refactor

Not done:
- The app still contains direct object mutation patterns in several places

Why not:
- A full mutation cleanup would require broader restructuring of `app.js`
- The targeted changes here improve clarity without destabilizing the prototype

### 4. Front-end token injection for backend auth

Not done:
- The front end does not yet automatically send an auth token to the backend

Why not:
- The backend auth is optional and only activates when `API_AUTH_TOKEN` is configured
- This avoids breaking the current local environment
- If auth is enabled in practice, the front end should be updated to send a configured token

### 5. Additional missing tests from the review prompt

Partially not done:
- No new tests were added for:
  - `state.js` migration behavior
  - `calculations.js` adapter layer
  - backend route smoke tests

Why not:
- This pass prioritized runtime safety and code fixes first
- These tests are still recommended next

## Validation Performed

Commands run:

```bash
node --check /Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/seedData.js
node --check /Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/state.js
node --check /Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/eacEngine.js
node --check /Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/calculations.js
node --check /Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/app.js
node --check /Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/qbo-backend/src/server.js
node --test /Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/tests/eacEngine.test.js /Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/tests/reconciliation.test.js
```

Result:
- syntax checks passed
- tests passed: 15 / 15

## Recommended Next Steps

1. Add tests for `state.js` migration and `calculations.js`
2. Add front-end support for sending backend auth tokens when enabled
3. Split `app.js` into smaller modules before further feature growth
4. Move seeded resource and planning setup logic into dedicated bootstrap/services modules
5. Review the remaining hardcoded year and date assumptions in the UI layer

---

## Additional Pass Completed Later On 2026-04-07

### 9. Added front-end auth token support for backend requests

Files:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/index.html`
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/qboClient.js`

Change:
- Added support for `globalThis.__QBO_API_TOKEN__`
- `fetchJson` now sends `Authorization: Bearer <token>` when configured

Why:
- The backend already supported optional token auth
- Without front-end support, enabling backend auth would break all browser requests

### 10. Improved backend request error handling

File:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/qboClient.js`

Change:
- `fetchJson` now distinguishes:
  - network failures
  - HTTP failures
  - 401 auth failures
- 4xx/5xx responses are no longer retried across every candidate base URL

Why:
- The previous retry loop masked the real cause of failures, especially auth errors

### 11. Removed the hardcoded actuals-through fallback date

File:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/app.js`

Change:
- Replaced the `"2026-03"` fallback with `"—"`

Why:
- A hardcoded date implies false accounting certainty when no actual period is loaded

### 12. Began extracting QBO orchestration out of `app.js`

Files:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/qboClient.js`
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/app.js`

Change:
- Extracted:
  - `resolveApiBases`
  - `fetchJson`
  - `selectedDateRange`
  - report summary parsing
  - imported monthly actual normalization

Why:
- This is the first concrete split from the `app.js` monolith
- It creates a cleaner seam for further extraction of QBO/setup orchestration

### 13. Added missing regression tests for state migration and calculation adapters

Files:
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/tests/state.test.js`
- `/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/tests/calculations.test.js`

Coverage added:
- `loadState` fallback behavior
- legacy tab/module migration
- reset-state sanity
- `getPlanMonthlyTotals`
- `buildMonthlyMetrics`
- `buildKpis`
- `buildReconciliationRows`

Validation result after this pass:
- tests passed: 23 / 23

### What Was Still Not Done In This Later Pass

- QBO backend route smoke tests
- Full removal of direct state mutation in async app paths
- Full extraction of `loadQboData` and `loadSetupData` from `app.js`

Why:
- These are still worthwhile, but they are larger changes and were deferred to keep this pass focused and low-risk
