function number(value) {
  const numeric = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function flattenRows(rows = []) {
  return rows.flatMap((row) => [
    row,
    ...flattenRows(row?.Rows?.Row || [])
  ]);
}

function rowByGroup(rows, group) {
  return flattenRows(rows).find((row) => row?.group === group);
}

function rowByLabel(rows, label) {
  return flattenRows(rows).find((row) => {
    const firstColumn = row?.Summary?.ColData?.[0]?.value || row?.ColData?.[0]?.value || "";
    return String(firstColumn).trim().toLowerCase() === String(label).trim().toLowerCase();
  });
}

function columnTitle(column, fallbackIndex) {
  return (
    column?.ColTitle ||
    column?.MetaData?.Name ||
    column?.metaData?.Name ||
    column?.Name ||
    `Column ${fallbackIndex + 1}`
  );
}

function isMonthColumnLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return false;
  if (/^total$/i.test(raw)) return false;
  if (/^[A-Za-z]{3}\s+\d{4}$/.test(raw)) return true;
  if (/^\d{4}-\d{2}/.test(raw)) return true;
  return false;
}

function summaryValues(row, count) {
  const columns = row?.Summary?.ColData || row?.ColData || [];
  return Array.from({ length: count }, (_, index) => number(columns[index + 1]?.value));
}

function periodFromLabel(label, fallbackIndex) {
  const raw = String(label || "").trim();
  const monthYearMatch = raw.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (monthYearMatch) {
    const monthMap = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12"
    };
    return `${monthYearMatch[2]}-${monthMap[monthYearMatch[1].toLowerCase()] || String(fallbackIndex + 1).padStart(2, "0")}`;
  }

  const isoMonthMatch = raw.match(/^(\d{4})-(\d{2})/);
  if (isoMonthMatch) return `${isoMonthMatch[1]}-${isoMonthMatch[2]}`;

  return `period-${String(fallbackIndex + 1).padStart(2, "0")}`;
}

export function parseMonthlyProfitLossReport(reportPayload) {
  const report = reportPayload?.data || reportPayload || {};
  const rows = report?.Rows?.Row || [];
  const columns = report?.Columns?.Column || [];
  const monthColumns = columns
    .slice(1)
    .map((column, rawIndex) => ({
      column,
      label: columnTitle(column, rawIndex),
      rawIndex
    }))
    .filter((item) => isMonthColumnLabel(item.label));
  const incomeRow = rowByGroup(rows, "Income");
  const expenseRow = rowByGroup(rows, "Expenses");
  const netIncomeRow = rowByGroup(rows, "NetIncome") || rowByLabel(rows, "Net Income");

  const incomeSummary = summaryValues(incomeRow, columns.length - 1);
  const expenseSummary = summaryValues(expenseRow, columns.length - 1).map((value) => Math.abs(value));
  const profitSummary = summaryValues(netIncomeRow, columns.length - 1);

  const months = monthColumns.map(({ label, rawIndex }, index) => {
    return {
      monthIndex: index,
      label,
      period: periodFromLabel(label, index),
      revenue: incomeSummary[rawIndex] || 0,
      cost: expenseSummary[rawIndex] || 0,
      profit: profitSummary[rawIndex] || ((incomeSummary[rawIndex] || 0) - (expenseSummary[rawIndex] || 0))
    };
  });

  return {
    months,
    totals: {
      revenue: months.reduce((sum, item) => sum + item.revenue, 0),
      cost: months.reduce((sum, item) => sum + item.cost, 0),
      profit: months.reduce((sum, item) => sum + item.profit, 0)
    }
  };
}
