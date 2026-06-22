import test from "node:test";
import assert from "node:assert/strict";

import {
  buildForecastState,
  buildCategorySummaryFromRows,
  buildComparisonSummary,
  buildMonthlyAuthoritativeRows,
  buildSummaryFromMonthly,
  normalizeSnapshot,
  resolveCommercialValues,
  resolveActualsThroughPeriod,
  selectBaselineSnapshot
} from "../src/supabaseGovconClient.js";

test("authoritative finance model derives FP summary fields from persisted monthly rows", () => {
  const bundle = {
    project: { funded: 1000 },
    contract: { ceiling: 1200, funded: 1000 },
    setup: { notes: JSON.stringify({ commercialModificationValue: 50 }) }
  };

  const commercial = resolveCommercialValues(bundle);
  const monthlyRows = buildMonthlyAuthoritativeRows([
    {
      project_period: "2026-01-01",
      month_index: 0,
      actual_cost: 200,
      forecast_cost: 200,
      current_period_cost: 200,
      cumulative_actual_cost: 200,
      cumulative_cost: 200,
      etc_cost: 800,
      eac_cost: 1000
    },
    {
      project_period: "2026-02-01",
      month_index: 1,
      actual_cost: 100,
      forecast_cost: 100,
      current_period_cost: 100,
      cumulative_actual_cost: 300,
      cumulative_cost: 300,
      etc_cost: 700,
      eac_cost: 1000
    }
  ], commercial);

  const summary = buildSummaryFromMonthly(monthlyRows, commercial, null);

  assert.equal(commercial.baseContractValue, 1200);
  assert.equal(commercial.baseFundedValue, 1000);
  assert.equal(commercial.modificationValue, 50);
  assert.equal(commercial.effectiveFundedValue, 1050);
  assert.equal(commercial.unfundedBacklog, 200);
  assert.equal(summary.actualsThroughPeriod, "2026-02");
  assert.equal(summary.actualCostToDate, 300);
  assert.equal(summary.etcCost, 700);
  assert.equal(summary.eacCost, 1000);
  assert.equal(Number(summary.percentCompleteThroughActuals.toFixed(2)), 0.30);
  assert.equal(summary.cumulativeRevenueToDate, 315);
  assert.equal(summary.currentPeriodCatchUpRevenue, 105);
  assert.equal(summary.remainingFundedRevenue, 735);
  assert.equal(summary.eacMargin, 50);
});

test("comparison summary uses baseline snapshot and category driver ranking", () => {
  const snapshots = [
    normalizeSnapshot({
      id: "snap-1",
      snapshot_label: "Baseline",
      is_baseline: true,
      summary: {
        eacCost: 900,
        cumulativeRevenueToDate: 350,
        margin: 150
      },
      category_summary: [
        { key: "labor", eac: 400 },
        { key: "materials", eac: 200 }
      ]
    })
  ];

  const baseline = selectBaselineSnapshot(snapshots);
  const categories = buildCategorySummaryFromRows([
    { category_key: "labor", actual_cost: 250, forecast_cost: 220 },
    { category_key: "labor", actual_cost: 0, forecast_cost: 230 },
    { category_key: "materials", actual_cost: 80, forecast_cost: 150 }
  ], snapshots);

  const comparison = buildComparisonSummary({
    eacCost: 930,
    cumulativeRevenueToDate: 300,
    eacMargin: 120
  }, baseline, categories);

  assert.equal(comparison.baselineSnapshotId, "snap-1");
  assert.equal(comparison.costVarianceVsBaseline, 30);
  assert.equal(comparison.revenueImpactVsBaseline, -50);
  assert.equal(comparison.marginVarianceVsBaseline, -30);
  assert.equal(comparison.topDrivers[0].categoryKey, "materials");
});

test("forecast state resolves selected, prior approved, and comparison basis semantics", () => {
  const baselineSnapshot = normalizeSnapshot({
    id: "snap-1",
    snapshot_label: "Baseline 2026",
    is_baseline: true,
    forecast_version_id: "v-working"
  });

  const state = buildForecastState({
    forecastVersions: [
      { id: "v-working", version_code: "FC-2026-04", version_name: "April Working", status: "Draft", actuals_through_period: "2026-03-01" },
      { id: "v-approved", version_code: "FC-2026-03", version_name: "March Approved", status: "Approved", actuals_through_period: "2026-02-01" }
    ]
  }, "v-working", baselineSnapshot);

  assert.equal(state.selectedVersion.id, "v-working");
  assert.equal(state.priorApprovedVersion.id, "v-approved");
  assert.equal(state.comparisonBasis.type, "baseline_snapshot");
  assert.equal(state.comparisonBasis.label, "Baseline 2026");
});

test("actuals-through period controls monthly lock status even when a closed month has zero actual cost", () => {
  const bundle = {
    setup: {
      close_through_period: "2026-02-01"
    },
    forecastVersions: []
  };

  const actualsThroughPeriod = resolveActualsThroughPeriod(bundle, null);
  const monthlyRows = buildMonthlyAuthoritativeRows([
    {
      project_period: "2026-01-01",
      month_index: 0,
      actual_cost: 150,
      forecast_cost: 0,
      current_period_cost: 150,
      cumulative_actual_cost: 150,
      cumulative_cost: 150,
      etc_cost: 450,
      eac_cost: 600
    },
    {
      project_period: "2026-02-01",
      month_index: 1,
      actual_cost: 0,
      forecast_cost: 0,
      current_period_cost: 0,
      cumulative_actual_cost: 150,
      cumulative_cost: 150,
      etc_cost: 450,
      eac_cost: 600
    },
    {
      project_period: "2026-03-01",
      month_index: 2,
      actual_cost: 0,
      forecast_cost: 200,
      current_period_cost: 200,
      cumulative_actual_cost: 150,
      cumulative_cost: 350,
      etc_cost: 250,
      eac_cost: 600
    }
  ], {
    effectiveFundedValue: 900,
    effectiveContractValue: 1000
  }, actualsThroughPeriod);

  assert.equal(actualsThroughPeriod, "2026-02");
  assert.equal(monthlyRows[0].lockStatus, "ACTUAL");
  assert.equal(monthlyRows[1].lockStatus, "ACTUAL");
  assert.equal(monthlyRows[2].lockStatus, "FORECAST");
  assert.equal(monthlyRows[1].currentPeriodCatchUpRevenue, 0);

  const summary = buildSummaryFromMonthly(monthlyRows, {
    effectiveFundedValue: 900,
    effectiveContractValue: 1000
  }, null, actualsThroughPeriod);

  assert.equal(summary.actualsThroughPeriod, "2026-02");
  assert.equal(summary.actualCostToDate, 150);
  assert.equal(summary.cumulativeRevenueToDate, 225);
});
