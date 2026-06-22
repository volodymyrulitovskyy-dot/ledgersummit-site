import {
  buildCategorySummary,
  buildMonthlyMetrics,
  computeMarginPercent,
  syncProjectFinancials
} from "./calculations.js";

export const AMY_BASELINE_SNAPSHOT_ID = "baseline-amy-original-budget-fixed-v1";
export const AMY_LEGACY_BASELINE_IDS = ["baseline-amy-original-budget"];
const BASELINE_REVENUE_MONTH_FACTORS = [1.14, 0.89, 1.07, 0.93, 1.12, 0.9, 1.05, 0.95, 1.08, 0.88, 1.1, 0.94];
const BASELINE_COST_MONTH_FACTORS = [0.91, 1.13, 0.9, 1.09, 0.92, 1.11, 0.95, 1.06, 0.89, 1.14, 0.93, 1.07];

export function isAmyBirdSanctuaryProject(project) {
  const text = `${project?.name || ""} ${project?.client || ""}`.toLowerCase();
  return text.includes("amy") && text.includes("bird");
}

export function cloneSnapshotTemplate(snapshot) {
  if (!snapshot) return null;
  return JSON.parse(JSON.stringify(snapshot));
}

function buildSeededOriginalBudgetBaseline(project, year) {
  const normalized = syncProjectFinancials(project, year);
  const monthly = buildMonthlyMetrics(project, year);
  const totalRevenue = Number(normalized.funding || monthly.reduce((sum, item) => sum + Number(item.currentPeriodRevenue || 0), 0));
  const currentEacCost = Number(normalized.projectMonthly?.[normalized.projectMonthly.length - 1]?.eacCost || monthly.reduce((sum, item) => sum + Number(item.currentPeriodCost || 0), 0));
  const currentMarginPct = computeMarginPercent(totalRevenue, currentEacCost);
  const baselineMarginPct = currentMarginPct + 5;
  const baselineCostTotal = totalRevenue > 0 ? totalRevenue * (1 - (baselineMarginPct / 100)) : currentEacCost;
  const currentCostTotal = monthly.reduce((sum, item) => sum + Number(item.currentPeriodCost || 0), 0) || currentEacCost || 1;
  const currentRevenueTotal = monthly.reduce((sum, item) => sum + Number(item.currentPeriodRevenue || 0), 0) || totalRevenue || 1;
  const costScale = baselineCostTotal / currentCostTotal;
  const weightedRevenueTotal = monthly.reduce((sum, item, index) => (
    sum + (Number(item.currentPeriodRevenue || 0) * BASELINE_REVENUE_MONTH_FACTORS[index])
  ), 0) || currentRevenueTotal;
  const weightedCostTotal = monthly.reduce((sum, item, index) => (
    sum + (Number(item.currentPeriodCost || 0) * BASELINE_COST_MONTH_FACTORS[index])
  ), 0) || currentCostTotal;
  const redistributedRevenueScale = totalRevenue / weightedRevenueTotal;
  const redistributedCostScale = baselineCostTotal / weightedCostTotal;
  const actualIndex = monthly.reduce((latest, item, index) => (Number(item.actualCost || 0) > 0 ? index : latest), -1);
  const actualsThroughPeriod = monthly[actualIndex]?.period || normalized.projectMonthly?.[actualIndex]?.period || null;
  const baselineCategories = buildCategorySummary(project, year).map((row) => ({
    key: row.key,
    actuals: 0,
    etc: Number(row.eac || 0) * costScale,
    eac: Number(row.eac || 0) * costScale
  }));

  let cumulativeRevenue = 0;
  let cumulativeCost = 0;
  const monthlyRows = monthly.map((item) => {
    const revenueMonthFactor = BASELINE_REVENUE_MONTH_FACTORS[item.monthIndex] || 1;
    const costMonthFactor = BASELINE_COST_MONTH_FACTORS[item.monthIndex] || 1;
    const currentPeriodRevenue = Number(item.currentPeriodRevenue || 0) * revenueMonthFactor * redistributedRevenueScale;
    const currentPeriodCost = Number(item.currentPeriodCost || 0) * costMonthFactor * redistributedCostScale;
    cumulativeRevenue += currentPeriodRevenue;
    cumulativeCost += currentPeriodCost;
    return {
      period: item.period,
      monthIndex: item.monthIndex,
      actualCost: 0,
      forecastCost: currentPeriodCost,
      currentPeriodCost,
      cumulativeCost,
      eacCost: baselineCostTotal,
      etcCost: Math.max(baselineCostTotal - cumulativeCost, 0),
      percentComplete: baselineCostTotal > 0 ? cumulativeCost / baselineCostTotal : 0,
      actualPercentComplete: baselineCostTotal > 0 ? cumulativeCost / baselineCostTotal : 0,
      cumulativeRevenue,
      actualCumulativeRevenue: cumulativeRevenue,
      currentPeriodRevenue,
      currentPeriodCatchUpRevenue: currentPeriodRevenue,
      revenueAdjustment: currentPeriodRevenue,
      revenueCatchUpAdjustment: currentPeriodRevenue,
      currentPeriodMargin: currentPeriodRevenue - currentPeriodCost,
      currentPeriodMarginPct: computeMarginPercent(currentPeriodRevenue, currentPeriodCost),
      cumulativeMargin: cumulativeRevenue - cumulativeCost,
      margin: totalRevenue - baselineCostTotal,
      marginPct: baselineMarginPct
    };
  });

  const summaryIndex = actualIndex >= 0 ? actualIndex : monthlyRows.length - 1;
  const summaryRow = monthlyRows[summaryIndex] || monthlyRows[monthlyRows.length - 1] || {};

  return {
    id: AMY_BASELINE_SNAPSHOT_ID,
    label: "Original Budget Baseline",
    createdAt: project.startDate || new Date().toISOString(),
    year,
    versionId: null,
    isBaseline: true,
    actualsThroughPeriod,
    summary: {
      actualsThroughPeriod,
      eacCost: baselineCostTotal,
      percentComplete: Number(summaryRow.actualPercentComplete || summaryRow.percentComplete || 0),
      cumulativeRevenueToDate: Number(summaryRow.actualCumulativeRevenue || summaryRow.cumulativeRevenue || 0),
      currentPeriodRevenue: Number(summaryRow.currentPeriodCatchUpRevenue || summaryRow.currentPeriodRevenue || 0),
      revenueEac: totalRevenue,
      margin: totalRevenue - baselineCostTotal,
      marginPct: baselineMarginPct
    },
    categories: baselineCategories,
    monthlyRows
  };
}

export function ensureAmyOriginalBudgetBaselineSeed(targetState, selectedYear) {
  let changed = false;
  targetState.projects = (targetState.projects || []).map((project) => {
    if (!isAmyBirdSanctuaryProject(project)) return project;
    const snapshots = Array.isArray(project.snapshots) ? [...project.snapshots] : [];
    const frozenTemplate = cloneSnapshotTemplate(project.frozenBaselineTemplate);
    const activeBaseline = snapshots.find((snapshot) => snapshot.id === project.baselineSnapshotId)
      || snapshots.find((snapshot) => snapshot.isBaseline)
      || null;

    if (activeBaseline) {
      if (project.baselineSnapshotId === activeBaseline.id) {
        if (project.frozenBaselineTemplate) return project;
        changed = true;
        return {
          ...project,
          frozenBaselineTemplate: cloneSnapshotTemplate(activeBaseline)
        };
      }
      changed = true;
      return {
        ...project,
        baselineSnapshotId: activeBaseline.id,
        snapshots: snapshots.map((snapshot) => ({
          ...snapshot,
          isBaseline: snapshot.id === activeBaseline.id
        })),
        frozenBaselineTemplate: cloneSnapshotTemplate(activeBaseline)
      };
    }

    const existingSeed = snapshots.find((snapshot) => snapshot.id === AMY_BASELINE_SNAPSHOT_ID);
    if (existingSeed) {
      changed = true;
      return {
        ...project,
        baselineSnapshotId: existingSeed.id,
        snapshots: snapshots.map((snapshot) => ({
          ...snapshot,
          isBaseline: snapshot.id === existingSeed.id
        })),
        frozenBaselineTemplate: cloneSnapshotTemplate(existingSeed)
      };
    }

    const seededSnapshot = frozenTemplate
      ? { ...cloneSnapshotTemplate(frozenTemplate), versionId: null, isBaseline: true }
      : buildSeededOriginalBudgetBaseline(project, selectedYear);
    const nextSnapshots = snapshots
      .filter((snapshot) => snapshot.id !== AMY_BASELINE_SNAPSHOT_ID && !AMY_LEGACY_BASELINE_IDS.includes(snapshot.id))
      .map((snapshot) => ({ ...snapshot, isBaseline: false }));
    nextSnapshots.push({ ...seededSnapshot, versionId: null, isBaseline: true });
    changed = true;
    return {
      ...project,
      baselineSnapshotId: AMY_BASELINE_SNAPSHOT_ID,
      snapshots: nextSnapshots,
      frozenBaselineTemplate: cloneSnapshotTemplate({ ...seededSnapshot, versionId: null, isBaseline: true })
    };
  });
  return changed;
}
