import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKpis,
  buildMonthlyMetrics,
  buildReconciliationRows,
  getPlanMonthlyTotals
} from "../src/calculations.js";
import { createMockProject12Month } from "./fixtures/mockProject12Month.js";

test("getPlanMonthlyTotals returns monthly forecast totals by category", () => {
  const project = createMockProject12Month();

  const totals = getPlanMonthlyTotals(project, "labor", 2026);

  assert.equal(totals.length, 12);
  assert.equal(totals[0], 100);
  assert.equal(totals[11], 100);
});

test("buildMonthlyMetrics exposes period and current-period fields consistently", () => {
  const project = createMockProject12Month();

  const metrics = buildMonthlyMetrics(project, 2026);

  assert.equal(metrics[2].period, "2026-03");
  assert.equal(metrics[2].revenue, 300);
  assert.equal(metrics[2].adjustment, 100);
  assert.equal(metrics[2].currentPeriodRevenue, 100);
  assert.equal(metrics[2].currentPeriodCost, 100);
});

test("buildKpis returns EAC, ETC, and YTD actual metrics on the correct basis", () => {
  const project = createMockProject12Month();

  const kpis = buildKpis(project, 2026);

  assert.equal(kpis.funding, 1200);
  assert.equal(kpis.cost, 1200);
  assert.equal(kpis.forecastToGo, 900);
  assert.equal(kpis.actualCost, 300);
  assert.equal(kpis.actualRevenueToDate, 300);
  assert.equal(kpis.actualMargin, 0);
  assert.equal(kpis.currentPeriodRevenue, 100);
  assert.equal(kpis.percentComplete, 25);
});

test("buildReconciliationRows aggregates monthly differences correctly", () => {
  const project = createMockProject12Month();
  const qboMonthlyActuals = [
    { period: "2026-01", revenue: 100, cost: 90 },
    { period: "2026-02", revenue: 110, cost: 100 },
    { period: "2026-03", revenue: 90, cost: 110 }
  ];

  const reconciliation = buildReconciliationRows([project], qboMonthlyActuals, 2026);

  assert.equal(reconciliation.rows[0].revenueDifference, 0);
  assert.equal(reconciliation.rows[0].costDifference, 10);
  assert.equal(reconciliation.rows[1].revenueDifference, -10);
  assert.equal(reconciliation.rows[2].costDifference, -10);
});
