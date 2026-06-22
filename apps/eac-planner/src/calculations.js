import {
  allocateRevenueFromCostShare,
  categorySummaryFromForecast,
  computeSnapshotVariance,
  computeMarginPercent,
  computeMarginPointChange,
  computeVariancePercent,
  getBaselineSnapshot,
  projectKpisFromMonthly,
  synchronizeProjectFinancialModel
} from "./eacEngine.js";
import { DEFAULT_PLANNING_YEAR } from "./seedData.js";

const CATEGORY_KEYS = ["labor", "subcontractors", "equipment", "materials", "odc"];
const CATEGORY_LABELS = {
  labor: "Labor",
  subcontractors: "Sub",
  equipment: "Equipment",
  materials: "Material",
  odc: "ODC"
};

function lineMonthsForYear(line, year = DEFAULT_PLANNING_YEAR) {
  const yearly = line?.yearly?.[year];
  if (Array.isArray(yearly) && yearly.length === 12) return yearly.map((value) => Number(value || 0));
  if (Array.isArray(line?.monthly) && line.monthly.length === 12) return line.monthly.map((value) => Number(value || 0));
  return Array(12).fill(0);
}

export function syncProjectFinancials(project, year = DEFAULT_PLANNING_YEAR) {
  return synchronizeProjectFinancialModel(project, year);
}

export function syncAllProjectsFinancials(state) {
  state.projects = (state.projects || []).map((project) => syncProjectFinancials(project, state.selectedYear));
  return state;
}

export function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

export function getPlanMonthlyTotals(project, category, year = DEFAULT_PLANNING_YEAR) {
  const normalized = syncProjectFinancials(project, year);
  return Array.from({ length: 12 }, (_, monthIndex) =>
    normalized.forecastByCategory
      .filter((row) => row.category === category && row.monthIndex === monthIndex)
      .reduce((total, row) => total + Number(row.forecastCost || 0), 0)
  );
}

export function getLineAnnualCost(line, category, year = DEFAULT_PLANNING_YEAR) {
  const months = lineMonthsForYear(line, year);
  if (category === "labor" || category === "equipment" || category === "materials") {
    return sum(months.map((value) => Number(value || 0) * Number(line.rate || 0)));
  }
  return sum(months);
}

export function getLineAnnualUnits(line, year = DEFAULT_PLANNING_YEAR) {
  return sum(lineMonthsForYear(line, year));
}

export function getLineRevenue(line, category, project, year = DEFAULT_PLANNING_YEAR) {
  const normalized = syncProjectFinancials(project, year);
  const lineCost = getLineAnnualCost(line, category, year);
  const totalEacCost = normalized.projectMonthly[normalized.projectMonthly.length - 1]?.eacCost || 0;
  return allocateRevenueFromCostShare(lineCost, totalEacCost, normalized.funding);
}

export function buildMonthlyMetrics(project, year = DEFAULT_PLANNING_YEAR) {
  const normalized = syncProjectFinancials(project, year);
  return normalized.projectMonthly.map((item) => ({
    monthIndex: item.monthIndex,
    period: item.period,
    actualCost: item.actualCost,
    forecastCost: item.forecastCost,
    etcCost: item.etcCost,
    cumulativeCost: item.cumulativeCost,
    percentComplete: item.percentComplete * 100,
    actualPercentComplete: Number(item.actualPercentComplete || 0) * 100,
    revenue: item.cumulativeRevenue,
    actualRevenueToDate: item.actualCumulativeRevenue,
    adjustment: item.revenueAdjustment,
    catchUpAdjustment: item.revenueCatchUpAdjustment,
    margin: item.cumulativeMargin,
    marginPct: item.marginPct,
    eacCost: item.eacCost,
    currentPeriodCost: item.currentPeriodCost,
    currentPeriodRevenue: item.currentPeriodRevenue,
    currentPeriodCatchUpRevenue: item.currentPeriodCatchUpRevenue,
    currentPeriodMargin: item.currentPeriodMargin,
    currentPeriodMarginPct: item.currentPeriodMarginPct,
    validations: item.validations
  }));
}

export function buildKpis(project, year = DEFAULT_PLANNING_YEAR) {
  const normalized = syncProjectFinancials(project, year);
  const kpis = projectKpisFromMonthly(normalized.projectMonthly, normalized.funding);

  return {
    revenue: kpis.funding,
    cost: kpis.eacCost,
    profit: kpis.margin,
    margin: kpis.marginPct,
    actualCost: kpis.actualCost,
    actualRevenueToDate: kpis.actualRevenueToDate,
    actualMargin: kpis.actualMargin,
    actualMarginPct: kpis.actualMarginPct,
    forecastToGo: kpis.forecastToGo,
    etcRevenue: kpis.etcRevenue,
    percentComplete: kpis.percentComplete,
    currentPeriodRevenue: kpis.currentPeriodRevenue,
    currentPeriodCatchUpRevenue: kpis.currentPeriodRevenue,
    funding: kpis.funding,
    validations: kpis.validations
  };
}

export function resourceSummary(project) {
  const rows = project.planning?.labor || [];
  const byRole = {};

  rows.forEach((line) => {
    const annualHours = getLineAnnualUnits(line);
    const annualCost = getLineAnnualCost(line, "labor");
    const key = line.laborCategoryName || line.role || "Unassigned";
    if (!byRole[key]) {
      byRole[key] = {
        role: key,
        hours: 0,
        cost: 0,
        people: 0,
        organizations: new Set()
      };
    }
    byRole[key].hours += annualHours;
    byRole[key].cost += annualCost;
    byRole[key].people += 1;
    if (line.organizationName) byRole[key].organizations.add(line.organizationName);
  });

  const employees = rows.map((line) => {
    const annualHours = getLineAnnualUnits(line);
    const utilization = annualHours / 1920 * 100;
    return {
      employee: line.employeeName || line.employee || "Unnamed",
      role: line.laborCategoryName || line.role || "Unassigned",
      rate: Number(line.rate || 0),
      annualHours,
      annualCost: getLineAnnualCost(line, "labor"),
      utilization
    };
  });

  return {
    byRole: Object.values(byRole).map((item) => ({
      ...item,
      utilization: item.people ? item.hours / (item.people * 1920) * 100 : 0,
      organizationCount: item.organizations.size
    })),
    employees
  };
}

export function buildCategorySummary(project, year = DEFAULT_PLANNING_YEAR) {
  const normalized = syncProjectFinancials(project, year);
  const raw = categorySummaryFromForecast(project, year);
  const baselineSnapshot = getBaselineSnapshot(normalized);
  const baselineCategories = new Map((baselineSnapshot?.categories || []).map((item) => [item.key, Number(item.eac || 0)]));
  const priorCost = Number(baselineSnapshot?.summary?.eacCost || project.priorForecast?.costEac || 0) / CATEGORY_KEYS.length;
  const planByCategory = new Map(
    CATEGORY_KEYS.map((category) => [
      category,
      getPlanMonthlyTotals(project, category, year).reduce((sum, value) => sum + Number(value || 0), 0)
    ])
  );

  return raw.map((item) => ({
    ...item,
    label: CATEGORY_LABELS[item.key] || item.key,
    budget: planByCategory.get(item.key) || 0,
    prior: baselineCategories.get(item.key) ?? priorCost,
    varianceToBudget: item.eac - (planByCategory.get(item.key) || 0),
    varianceToPrior: item.eac - (baselineCategories.get(item.key) ?? priorCost),
    funding: normalized.funding
  }));
}

export function quickbooksHealth(project) {
  const mappings = project.quickbooksMappings || [];
  const mapped = mappings.filter((item) => item.status === "Mapped").length;
  const review = mappings.filter((item) => item.status !== "Mapped").length;
  return {
    mapped,
    review,
    status: project.syncStatus
  };
}

export function financialComparisonMetrics(project, year = DEFAULT_PLANNING_YEAR) {
  const kpis = buildKpis(project, year);
  const normalized = syncProjectFinancials(project, year);
  const baselineSnapshot = getBaselineSnapshot(normalized);
  const snapshotVariance = computeSnapshotVariance(project, year);
  const budgetRevenue = Number(project.budget?.revenue || 0);
  const budgetCost = Number(project.budget?.cost || 0);
  const priorRevenue = Number(baselineSnapshot?.summary?.revenueEac || project.priorForecast?.revenueEac || 0);
  const priorCost = Number(baselineSnapshot?.summary?.eacCost || project.priorForecast?.costEac || 0);

  return {
    budgetRevenue,
    budgetCost,
    budgetMargin: computeMarginPercent(budgetRevenue, budgetCost),
    priorRevenue,
    priorCost,
    priorMargin: Number(baselineSnapshot?.summary?.marginPct ?? computeMarginPercent(priorRevenue, priorCost)),
    eacRevenue: kpis.funding,
    eacCost: kpis.cost,
    eacMargin: kpis.profit,
    etcRevenue: kpis.etcRevenue,
    etcCost: kpis.forecastToGo,
    actualRevenueToDate: kpis.actualRevenueToDate,
    actualMarginToDate: kpis.actualMargin,
    actualMarginPct: kpis.actualMarginPct,
    percentComplete: kpis.percentComplete,
    currentPeriodRevenue: kpis.currentPeriodRevenue,
    baselineSnapshotLabel: baselineSnapshot?.label || null,
    baselineActualsThrough: baselineSnapshot?.actualsThroughPeriod || null,
    revenueImpact: snapshotVariance?.revenueImpact ?? 0,
    costVariance: snapshotVariance?.costVariance ?? 0,
    marginVariance: snapshotVariance?.marginVariance ?? 0,
    marginPointChange: snapshotVariance?.marginPointChange ?? 0,
    hasBaselineSnapshot: Boolean(baselineSnapshot),
    validations: kpis.validations
  };
}

export function buildPortfolioMonthlyActuals(projects = [], year = DEFAULT_PLANNING_YEAR) {
  const monthly = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    period: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    systemRevenue: 0,
    systemCost: 0
  }));

  (projects || []).forEach((project) => {
    const normalized = syncProjectFinancials(project, year);
    (normalized.projectMonthly || []).forEach((row, index) => {
      if (Number(row.actualCost || 0) <= 0) return;
      monthly[index].systemCost += Number(row.actualCost || 0);
      monthly[index].systemRevenue += Number(row.currentPeriodRevenue || 0);
    });
  });

  return monthly;
}

export function buildReconciliationRows(projects = [], qboMonthlyActuals = [], year = DEFAULT_PLANNING_YEAR) {
  const systemMonthly = buildPortfolioMonthlyActuals(projects, year);
  const qboByPeriod = new Map((qboMonthlyActuals || []).map((row) => [row.period, row]));

  const rows = systemMonthly.map((systemRow) => {
    const qboRow = qboByPeriod.get(systemRow.period) || {};
    return {
      period: systemRow.period,
      monthIndex: systemRow.monthIndex,
      systemRevenue: systemRow.systemRevenue,
      qboRevenue: Number(qboRow.revenue || 0),
      revenueDifference: systemRow.systemRevenue - Number(qboRow.revenue || 0),
      systemCost: systemRow.systemCost,
      qboCost: Number(qboRow.cost || 0),
      costDifference: systemRow.systemCost - Number(qboRow.cost || 0)
    };
  });

  return {
    rows,
    totals: rows.reduce((acc, row) => {
      acc.systemRevenue += row.systemRevenue;
      acc.qboRevenue += row.qboRevenue;
      acc.revenueDifference += row.revenueDifference;
      acc.systemCost += row.systemCost;
      acc.qboCost += row.qboCost;
      acc.costDifference += row.costDifference;
      return acc;
    }, {
      systemRevenue: 0,
      qboRevenue: 0,
      revenueDifference: 0,
      systemCost: 0,
      qboCost: 0,
      costDifference: 0
    })
  };
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export function formatCompactCurrency(value) {
  return formatCurrency(value);
}

export {
  computeMarginPercent,
  computeMarginPointChange,
  computeVariancePercent
};
