import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProjectMonthly,
  computeETC,
  computeSnapshotVariance,
  computeCurrentPeriodRevenue,
  computeEACCost,
  computeMargin,
  computeMarginPercent,
  computePercentComplete,
  computeRevenueToDate,
  createProjectSnapshot,
  getBaselineSnapshot,
  projectKpisFromMonthly,
  synchronizeProjectFinancialModel,
  validateFinancialRow
} from "../src/eacEngine.js";
import { createMockProject12Month } from "./fixtures/mockProject12Month.js";

test("core EAC math functions follow cost-to-cost formulas", () => {
  const eacCost = computeEACCost(300, 900);
  const etcCost = computeETC(900);
  const percentComplete = computePercentComplete(300, eacCost);
  const cumulativeRevenue = computeRevenueToDate(percentComplete, 1200);
  const currentPeriodRevenue = computeCurrentPeriodRevenue(cumulativeRevenue, 200);
  const margin = computeMargin(1200, eacCost);
  const marginPct = computeMarginPercent(1200, eacCost);

  assert.equal(eacCost, 1200);
  assert.equal(etcCost, 900);
  assert.equal(percentComplete, 0.25);
  assert.equal(cumulativeRevenue, 300);
  assert.equal(currentPeriodRevenue, 100);
  assert.equal(margin, 0);
  assert.equal(marginPct, 0);
});

test("12-month rollforward derives cumulative revenue from cost progress", () => {
  const project = createMockProject12Month();
  const monthly = buildProjectMonthly(project, 2026);
  const march = monthly[2];

  assert.equal(monthly.length, 12);
  assert.equal(march.actualCost, 100);
  assert.equal(march.forecastCost, 100);
  assert.equal(march.cumulativeCost, 300);
  assert.equal(march.eacCost, 1200);
  assert.equal(Number(march.percentComplete.toFixed(4)), 0.25);
  assert.equal(march.cumulativeRevenue, 300);
  assert.equal(march.currentPeriodRevenue, 100);
  assert.equal(march.revenueAdjustment, 100);
  assert.equal(march.cumulativeMargin, 0);
});

test("changing forecast updates EAC and cumulative catch-up revenue", () => {
  const project = createMockProject12Month();
  project.planning.labor[0].monthly = [100, 100, 100, 200, 200, 200, 200, 200, 200, 200, 200, 200];

  const monthly = buildProjectMonthly(project, 2026);
  const march = monthly[2];

  assert.equal(march.eacCost, 2100);
  assert.equal(Number(march.percentComplete.toFixed(4)), Number((300 / 2100).toFixed(4)));
  assert.equal(Number(march.cumulativeRevenue.toFixed(2)), 171.43);
  assert.equal(Number(march.currentPeriodRevenue.toFixed(2)), 57.14);
  assert.equal(Number(march.cumulativeMargin.toFixed(2)), -128.57);
});

test("changing actual cost updates percent complete and current period revenue", () => {
  const project = createMockProject12Month();
  project.actuals.labor[1] = 150;

  const monthly = buildProjectMonthly(project, 2026);
  const february = monthly[1];

  assert.equal(february.cumulativeCost, 250);
  assert.equal(february.eacCost, 1250);
  assert.equal(Number(february.percentComplete.toFixed(4)), 0.2);
  assert.equal(february.cumulativeRevenue, 240);
  assert.equal(february.currentPeriodRevenue, 140);
  assert.equal(february.cumulativeMargin, -10);
});

test("imported total actual cost overrides category actual arrays in the monthly model", () => {
  const project = createMockProject12Month();
  project.actuals.totalCost = [120, 130, 140, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  const monthly = buildProjectMonthly(project, 2026);
  const march = monthly[2];

  assert.equal(march.actualCost, 140);
  assert.equal(march.cumulativeCost, 390);
  assert.equal(march.eacCost, 1290);
  assert.equal(Number(march.cumulativeRevenue.toFixed(2)), Number(((390 / 1290) * 1200).toFixed(2)));
});

test("monthly rollforward keeps revenue cumulative and adjustment as period delta", () => {
  const project = createMockProject12Month();
  const monthly = buildProjectMonthly(project, 2026);
  const april = monthly[3];

  assert.equal(april.actualCost, 0);
  assert.equal(april.forecastCost, 100);
  assert.equal(april.cumulativeCost, 400);
  assert.equal(april.cumulativeRevenue, 400);
  assert.equal(april.revenueAdjustment, 100);
  assert.equal(april.cumulativeMargin, 0);
});

test("snapshot and KPI percent complete stay anchored to actuals-through instead of the final forecast month", () => {
  const project = createMockProject12Month();
  const monthly = buildProjectMonthly(project, 2026);
  const kpis = projectKpisFromMonthly(monthly, 1200);

  assert.equal(monthly[2].actualPercentComplete, 0.25);
  assert.equal(monthly[11].percentComplete, 1);
  assert.equal(monthly[11].actualPercentComplete, 0.25);
  assert.equal(kpis.percentComplete, 25);
  assert.equal(kpis.actualRevenueToDate, 300);
  assert.equal(kpis.currentPeriodRevenue, 100);
});

test("negative FP catch-up appears in the current actual month when EAC increases", () => {
  const project = createMockProject12Month();
  project.actuals.labor = [250, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  project.planning.labor[0].monthly = [100, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75, 75];

  const baselineMonthly = buildProjectMonthly(project, 2026);
  assert.equal(Number(baselineMonthly[0].actualCumulativeRevenue.toFixed(2)), 279.07);
  assert.equal(Number(baselineMonthly[0].currentPeriodCatchUpRevenue.toFixed(2)), 279.07);

  project.planning.labor[0].monthly = [100, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150];

  const updatedMonthly = buildProjectMonthly(project, 2026);
  assert.equal(updatedMonthly[0].eacCost, 1900);
  assert.equal(Number(updatedMonthly[0].actualPercentComplete.toFixed(4)), Number((250 / 1900).toFixed(4)));
  assert.equal(Number(updatedMonthly[0].actualCumulativeRevenue.toFixed(2)), 157.89);
  assert.equal(Number(updatedMonthly[0].currentPeriodCatchUpRevenue.toFixed(2)), 157.89);
  assert.ok(updatedMonthly[0].currentPeriodCatchUpRevenue < baselineMonthly[0].currentPeriodCatchUpRevenue);
});

test("updating forecast and actual cost changes rollforward adjustment and margin", () => {
  const project = createMockProject12Month();
  const baselineMarch = buildProjectMonthly(project, 2026)[2];

  project.planning.labor[0].monthly[3] = 220;
  project.actuals.labor[2] = 130;

  const updatedMarch = buildProjectMonthly(project, 2026)[2];

  assert.notEqual(Number(updatedMarch.revenueAdjustment.toFixed(2)), Number(baselineMarch.revenueAdjustment.toFixed(2)));
  assert.ok(updatedMarch.cumulativeMargin < baselineMarch.cumulativeMargin);
  assert.ok(updatedMarch.eacCost > baselineMarch.eacCost);
});

test("synchronizeProjectFinancialModel persists normalized structures", () => {
  const project = synchronizeProjectFinancialModel(createMockProject12Month(), 2026);

  assert.ok(Array.isArray(project.forecastByCategory));
  assert.ok(Array.isArray(project.projectMonthly));
  assert.ok(Array.isArray(project.snapshots));
  assert.equal(project.projectMonthly.length, 12);
  assert.equal(project.forecastByCategory.filter((row) => row.category === "labor").length, 12);
});

test("validation catches impossible financial combinations", () => {
  const issues = validateFinancialRow({
    label: "Test Month",
    actualCost: 500,
    etcCost: -10,
    eacCost: 490,
    revenue: 100,
    cost: 200,
    marginPct: 25
  });

  assert.equal(issues.errors.length, 3);
  assert.match(issues.errors[0], /EAC cannot be lower than actual/i);
  assert.match(issues.errors[1], /ETC cannot be negative/i);
  assert.match(issues.errors[2], /cannot be positive when revenue is below cost/i);
});

test("margin percent is bounded to a valid range", () => {
  assert.equal(computeMarginPercent(100, 0), 100);
  assert.equal(computeMarginPercent(0, 50), -100);
  assert.equal(computeMarginPercent(100, 250), -100);
});

test("createProjectSnapshot stores an immutable baseline summary", () => {
  const project = createProjectSnapshot(createMockProject12Month(), 2026, {
    id: "snap-1",
    label: "Baseline FC-03+09",
    createdAt: "2026-04-04T10:00:00.000Z",
    setAsBaseline: true
  });

  const baseline = getBaselineSnapshot(project);

  assert.equal(project.snapshots.length, 1);
  assert.equal(project.baselineSnapshotId, "snap-1");
  assert.equal(baseline.label, "Baseline FC-03+09");
  assert.equal(baseline.actualsThroughPeriod, "2026-03");
  assert.equal(baseline.summary.eacCost, 1200);
  assert.equal(baseline.summary.cumulativeRevenueToDate, 300);
  assert.equal(baseline.summary.margin, 0);
});

test("snapshot variance compares current forecast against the baseline snapshot", () => {
  let project = createProjectSnapshot(createMockProject12Month(), 2026, {
    id: "snap-1",
    label: "Baseline FC-03+09",
    createdAt: "2026-04-04T10:00:00.000Z",
    setAsBaseline: true
  });

  project.planning.labor[0].monthly = [100, 100, 100, 200, 200, 200, 200, 200, 200, 200, 200, 200];

  const variance = computeSnapshotVariance(project, 2026);

  assert.equal(variance.baseline.id, "snap-1");
  assert.equal(variance.current.actualsThroughPeriod, "2026-03");
  assert.equal(variance.costVariance, 900);
  assert.equal(Number(variance.marginVariance.toFixed(2)), -900);
  assert.equal(Number(variance.revenueImpact.toFixed(2)), -128.57);
});

test("only one baseline snapshot is active after replacing the baseline", () => {
  let project = createProjectSnapshot(createMockProject12Month(), 2026, {
    id: "snap-1",
    label: "Baseline 1",
    createdAt: "2026-04-04T10:00:00.000Z",
    setAsBaseline: true
  });

  project.planning.labor[0].monthly[3] = 150;
  project = createProjectSnapshot(project, 2026, {
    id: "snap-2",
    label: "Baseline 2",
    createdAt: "2026-05-04T10:00:00.000Z",
    setAsBaseline: true
  });

  const baselineSnapshots = project.snapshots.filter((snapshot) => snapshot.isBaseline);

  assert.equal(project.snapshots.length, 2);
  assert.equal(baselineSnapshots.length, 1);
  assert.equal(baselineSnapshots[0].id, "snap-2");
  assert.equal(getBaselineSnapshot(project).id, "snap-2");
});
