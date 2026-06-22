## Phase 1 Status

Date: 2026-04-07

### What Was Implemented

Phase 1 focused on turning the monthly finance model into a backend-backed structure instead of leaving it only in browser state.

Implemented:

- Supabase schema additions in [eac_project_setup_schema.sql](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/supabase/eac_project_setup_schema.sql)
  - `govcon_forecast_by_category`
  - `govcon_project_monthly`
  - `govcon_project_snapshots`
- Backend finance persistence routes in [server.js](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/qbo-backend/src/server.js)
  - `GET /finance/projects/:projectId/model`
  - `POST /finance/projects/:projectId/model`
- Backend Supabase finance client methods in [supabaseGovconClient.js](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/qbo-backend/src/supabaseGovconClient.js)
  - `getProjectFinanceModel(...)`
  - `saveProjectFinanceModel(...)`
- Frontend finance load/save helpers in [qboClient.js](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/qboClient.js)
  - `fetchProjectFinanceModel(...)`
  - `saveProjectFinanceModel(...)`
- Frontend app wiring in [app.js](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/app.js)
  - loads persisted finance rows for the active project/year/version
  - applies persisted `projectMonthly`, `forecastByCategory`, and `snapshots` into runtime state
  - debounced finance persistence after planning changes
  - refreshes persisted finance when project or forecast version changes

### What This Means

The browser is no longer the only place where:

- monthly project financial facts
- forecast-by-category monthly rows
- snapshots / baselines

exist.

The engine still computes the model in the frontend, but the outputs are now persisted through the backend into Supabase for the active project/version/year.

### What Is Complete

- Persistent schema target for monthly finance facts
- Backend read/write contract for the finance model
- Frontend save/load path for persisted monthly finance data
- Existing EAC engine still remains the single calculation source

### What Is Partial

- Planning line edits still originate in browser state and then persist normalized finance outputs
- Persisted finance currently focuses on the active project/year/version, not full offline sync of every project at once
- Snapshot persistence is now supported, but formal close/approval workflow is still not implemented

### What Is Not Done

- Transaction/category-level actuals persistence into the monthly model by labor/subs/equipment/materials/ODC
- Backend-owned calculation service; the engine still runs in the frontend and persists outputs rather than calculating server-side
- Full forecast workflow:
  - draft
  - submitted
  - approved
  - locked
- Multi-user audit trail of who changed finance data and why

### Why I Chose This Scope

Phase 1 was intentionally kept narrow so we could establish a durable monthly finance backbone without destabilizing the UI.

The highest-value foundation pieces were:

1. monthly persistence
2. snapshot persistence
3. backend transport contract
4. preserving the current cost-to-cost engine as the single source of calculation logic

This gives us a real handoff point for the next phases without trying to rebuild workflow, reconciliation, and resource persistence all at once.

### Validation Performed

Syntax checks passed:

- [supabaseGovconClient.js](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/qbo-backend/src/supabaseGovconClient.js)
- [server.js](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/qbo-backend/src/server.js)
- [qboClient.js](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/qboClient.js)
- [app.js](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/src/app.js)

Tests passed:

- [eacEngine.test.js](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/tests/eacEngine.test.js)
- [calculations.test.js](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/tests/calculations.test.js)
- [state.test.js](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/tests/state.test.js)

### Required Next Step

Apply the updated SQL in:

- [eac_project_setup_schema.sql](/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/supabase/eac_project_setup_schema.sql)

Then restart the backend so the new finance persistence routes can write to the new tables successfully.
