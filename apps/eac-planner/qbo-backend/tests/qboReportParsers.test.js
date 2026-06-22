import test from "node:test";
import assert from "node:assert/strict";

import { parseMonthlyProfitLossReport } from "../src/qboReportParsers.js";
import { createMonthlyProfitLossReportFixture } from "./fixtures/monthlyProfitLossReport.js";

test("parseMonthlyProfitLossReport extracts monthly revenue, cost, and profit rows", () => {
  const parsed = parseMonthlyProfitLossReport(createMonthlyProfitLossReportFixture());

  assert.equal(parsed.months.length, 3);
  assert.deepEqual(parsed.months[0], {
    monthIndex: 0,
    label: "Jan 2026",
    period: "2026-01",
    revenue: 1000,
    cost: 700,
    profit: 300
  });
  assert.deepEqual(parsed.totals, {
    revenue: 3300,
    cost: 2400,
    profit: 900
  });
});

test("parseMonthlyProfitLossReport ignores trailing Total columns in QBO monthly reports", () => {
  const fixture = createMonthlyProfitLossReportFixture();
  fixture.Columns.Column.push({ ColTitle: "Total", ColType: "Money" });

  fixture.Rows.Row[0].Summary.ColData.push({ value: "3300" });
  fixture.Rows.Row[1].Summary.ColData.push({ value: "-2400" });
  fixture.Rows.Row[2].Summary.ColData.push({ value: "900" });

  const parsed = parseMonthlyProfitLossReport(fixture);

  assert.equal(parsed.months.length, 3);
  assert.deepEqual(parsed.months.map((item) => item.period), ["2026-01", "2026-02", "2026-03"]);
});
