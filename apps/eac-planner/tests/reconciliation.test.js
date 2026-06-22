import test from "node:test";
import assert from "node:assert/strict";

import { buildPortfolioMonthlyActuals, buildReconciliationRows } from "../src/calculations.js";
import { createMockProject12Month } from "./fixtures/mockProject12Month.js";

test("buildPortfolioMonthlyActuals uses only actual months from the system rollforward", () => {
  const rows = buildPortfolioMonthlyActuals([createMockProject12Month()], 2026);

  assert.equal(rows[0].systemCost, 100);
  assert.equal(rows[0].systemRevenue, 100);
  assert.equal(rows[2].systemCost, 100);
  assert.equal(rows[2].systemRevenue, 100);
  assert.equal(rows[3].systemCost, 0);
  assert.equal(rows[3].systemRevenue, 0);
});

test("buildReconciliationRows compares system monthly actuals against imported QBO monthly actuals", () => {
  const qboMonthlyActuals = [
    { period: "2026-01", revenue: 95, cost: 105 },
    { period: "2026-02", revenue: 100, cost: 100 },
    { period: "2026-03", revenue: 105, cost: 110 }
  ];

  const reconciliation = buildReconciliationRows([createMockProject12Month()], qboMonthlyActuals, 2026);

  assert.equal(reconciliation.rows[0].revenueDifference, 5);
  assert.equal(reconciliation.rows[0].costDifference, -5);
  assert.equal(reconciliation.rows[2].revenueDifference, -5);
  assert.equal(reconciliation.rows[2].costDifference, -10);
  assert.equal(reconciliation.totals.systemRevenue, 300);
  assert.equal(reconciliation.totals.qboRevenue, 300);
  assert.equal(reconciliation.totals.revenueDifference, 0);
});
