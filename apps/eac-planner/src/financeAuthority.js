import {
  buildCategorySummary,
  buildKpis,
  computeMarginPercent
} from "./calculations.js";

export function shouldPreferLocalFinance({
  project,
  backendSummary = null,
  fallback = {},
  financeState = {},
  currentFinanceKey = () => "",
  selectedProjectId = null
} = {}) {
  if (!project?.id) return false;
  if (financeState.savingKey === currentFinanceKey(project.id)) return true;
  if (project.id !== selectedProjectId || !backendSummary) return false;

  const localEacCost = Number(
    fallback?.eacCost
    || project.projectMonthly?.[project.projectMonthly.length - 1]?.eacCost
    || 0
  );
  const backendEacCost = Number(backendSummary.eacCost || 0);
  const localRevenue = Number(
    fallback?.eacRevenue
    || project.effectiveFundedValue
    || project.funding
    || project.effectiveContractValue
    || project.contractValue
    || 0
  );
  const backendRevenue = Number(
    backendSummary.effectiveFundedValue
    || backendSummary.effectiveContractValue
    || 0
  );

  return Math.abs(localEacCost - backendEacCost) > 0.5
    || Math.abs(localRevenue - backendRevenue) > 0.5;
}

export function mergeAuthoritativeCategorySummary(
  project,
  backendRows = [],
  {
    financeState = {},
    currentFinanceKey = () => "",
    selectedProjectId = null,
    labelForCategoryKey = (key) => key
  } = {}
) {
  const fallback = buildCategorySummary(project);
  const backendSummary = project?.backendFinanceModel?.summary || null;
  if (!backendRows.length || shouldPreferLocalFinance({
    project,
    backendSummary,
    fallback: {
      eacCost: fallback.reduce((sum, item) => sum + Number(item.eac || 0), 0),
      eacRevenue: Number(project?.effectiveFundedValue || project?.funding || project?.effectiveContractValue || project?.contractValue || 0)
    },
    financeState,
    currentFinanceKey,
    selectedProjectId
  })) {
    return fallback;
  }

  const fallbackByKey = new Map(fallback.map((item) => [item.key, item]));
  return backendRows.map((item) => {
    const baseline = fallbackByKey.get(item.key) || {};
    const prior = Number(baseline.prior || 0);
    const budget = Number(baseline.budget || 0);
    const eac = Number(item.eac || 0);
    return {
      ...baseline,
      key: item.key,
      label: labelForCategoryKey(item.key),
      actuals: Number(item.actuals || 0),
      etc: Number(item.etc || 0),
      eac,
      budget,
      prior,
      varianceToBudget: eac - budget,
      varianceToPrior: eac - prior,
      funding: Number(project.effectiveFundedValue || project.fundedValue || project.contractValue || 0)
    };
  });
}

export function mergeAuthoritativeFinancials(
  project,
  context,
  rawFinancials,
  {
    financeState = {},
    currentFinanceKey = () => "",
    selectedProjectId = null
  } = {}
) {
  const backendFinance = project.backendFinanceModel || context.backendFinance || {};
  const summary = backendFinance.summary || null;
  const comparison = backendFinance.comparisonSummary || null;
  if (!summary || shouldPreferLocalFinance({
    project,
    backendSummary: summary,
    fallback: rawFinancials,
    financeState,
    currentFinanceKey,
    selectedProjectId
  })) {
    return rawFinancials;
  }

  const effectiveComparison = comparison?.comparisonBasisType === "none" && context.baselineSnapshot
    ? null
    : comparison;

  return {
    ...rawFinancials,
    eacRevenue: Number(summary.effectiveFundedValue || summary.effectiveContractValue || rawFinancials.eacRevenue || 0),
    eacCost: Number(summary.eacCost || rawFinancials.eacCost || 0),
    eacMargin: Number(summary.eacMargin || rawFinancials.eacMargin || 0),
    etcCost: Number(summary.etcCost || rawFinancials.etcCost || 0),
    actualRevenueToDate: Number(summary.cumulativeRevenueToDate || rawFinancials.actualRevenueToDate || 0),
    actualMarginToDate: Number(summary.cumulativeRevenueToDate || 0) - Number(summary.actualCostToDate || 0),
    actualMarginPct: computeMarginPercent(
      Number(summary.cumulativeRevenueToDate || rawFinancials.actualRevenueToDate || 0),
      Number(summary.actualCostToDate || 0)
    ),
    percentComplete: Number(summary.percentCompleteThroughActuals || 0) * 100,
    currentPeriodRevenue: Number(summary.currentPeriodCatchUpRevenue || rawFinancials.currentPeriodRevenue || 0),
    costVariance: Number(effectiveComparison?.costVarianceVsBaseline ?? rawFinancials.costVariance ?? 0),
    revenueImpact: Number(effectiveComparison?.revenueImpactVsBaseline ?? rawFinancials.revenueImpact ?? 0),
    marginVariance: Number(effectiveComparison?.marginVarianceVsBaseline ?? rawFinancials.marginVariance ?? 0),
    baselineSnapshotLabel: effectiveComparison?.baselineLabel || rawFinancials.baselineSnapshotLabel || null,
    hasBaselineSnapshot: Boolean(summary.baselineSnapshotId || rawFinancials.hasBaselineSnapshot),
    comparisonBasisType: effectiveComparison?.comparisonBasisType || rawFinancials.comparisonBasisType || "none",
    comparisonBasisLabel: effectiveComparison?.comparisonBasisLabel || rawFinancials.comparisonBasisLabel || null
  };
}

export function buildDisplayKpis(
  project,
  context,
  {
    financeState = {},
    currentFinanceKey = () => "",
    selectedProjectId = null
  } = {}
) {
  const backendSummary = context.backendFinance?.summary || null;
  const fallback = buildKpis(project);
  if (!backendSummary || shouldPreferLocalFinance({
    project,
    backendSummary,
    fallback: {
      eacCost: fallback.cost,
      eacRevenue: fallback.revenue
    },
    financeState,
    currentFinanceKey,
    selectedProjectId
  })) {
    return fallback;
  }

  const revenue = Number(backendSummary.effectiveFundedValue || backendSummary.effectiveContractValue || fallback.revenue || 0);
  const cost = Number(backendSummary.eacCost || fallback.cost || 0);
  const actualRevenueToDate = Number(backendSummary.cumulativeRevenueToDate || fallback.actualRevenueToDate || 0);
  const actualCost = Number(backendSummary.actualCostToDate || fallback.actualCost || 0);
  const marginPct = Number.isFinite(Number(backendSummary.marginPct))
    ? Number(backendSummary.marginPct)
    : computeMarginPercent(revenue, cost);

  return {
    ...fallback,
    revenue,
    cost,
    profit: Number(backendSummary.eacMargin || fallback.profit || 0),
    margin: marginPct,
    actualCost,
    actualRevenueToDate,
    actualMargin: actualRevenueToDate - actualCost,
    actualMarginPct: computeMarginPercent(actualRevenueToDate, actualCost),
    forecastToGo: Number(backendSummary.etcCost || fallback.forecastToGo || 0),
    percentComplete: Number(backendSummary.percentCompleteThroughActuals || 0) * 100,
    currentPeriodRevenue: Number(backendSummary.currentPeriodCatchUpRevenue || fallback.currentPeriodRevenue || 0),
    currentPeriodCatchUpRevenue: Number(backendSummary.currentPeriodCatchUpRevenue || fallback.currentPeriodCatchUpRevenue || 0),
    funding: revenue
  };
}

export function serializeCurrentProjectFinance(
  project,
  {
    selectedYear,
    selectedForecastVersionId
  }
) {
  if (!project?.id) return null;
  const normalizedSnapshots = (project.snapshots || []).map((snapshot) => ({
    ...snapshot,
    versionId: snapshot?.isBaseline ? null : (snapshot?.versionId || null)
  }));

  return {
    projectId: project.id,
    year: selectedYear,
    forecastVersionId: selectedForecastVersionId || null,
    funding: Number(
      project.effectiveFundedValue
      || project.funding
      || project.fundedValue
      || project.effectiveContractValue
      || project.contractValue
      || 0
    ),
    projectMonthly: project.projectMonthly || [],
    forecastByCategory: project.forecastByCategory || [],
    snapshots: normalizedSnapshots
  };
}

export function applyPersistedFinanceModel(state, projectId, financeBundle, selectedYear) {
  const projectIndex = (state.projects || []).findIndex((item) => item.id === projectId);
  if (projectIndex < 0) return false;
  const project = state.projects[projectIndex];
  const authoritativeMonthly = financeBundle?.monthlyRows || [];
  const persistedMonthly = financeBundle?.projectMonthly || [];
  const persistedCategories = financeBundle?.forecastByCategory || [];
  const persistedSnapshots = financeBundle?.snapshots || [];
  if (
    !authoritativeMonthly.length
    && !persistedMonthly.length
    && !persistedCategories.length
    && !persistedSnapshots.length
    && !financeBundle?.summary
  ) return false;

  project.backendFinanceModel = {
    summary: financeBundle?.summary || null,
    forecastState: financeBundle?.forecastState || null,
    categorySummary: financeBundle?.categorySummary || [],
    comparisonSummary: financeBundle?.comparisonSummary || null,
    raw: financeBundle || null
  };

  project.projectMonthly = (authoritativeMonthly.length ? authoritativeMonthly : persistedMonthly).map((row) => ({
    period: String(row.period || row.project_period || "").slice(0, 7),
    monthIndex: Number((row.monthIndex ?? row.month_index ?? 0)),
    funding: Number(row.funding || financeBundle?.summary?.effectiveFundedValue || 0),
    actualCost: Number((row.actualCost ?? row.actual_cost ?? 0)),
    forecastCost: Number((row.forecastCost ?? row.forecast_cost ?? 0)),
    currentPeriodCost: Number((row.currentPeriodCost ?? row.current_period_cost ?? 0)),
    cumulativeActualCost: Number((row.cumulativeActualCost ?? row.cumulative_actual_cost ?? 0)),
    cumulativeCost: Number((row.cumulativeCost ?? row.cumulative_cost ?? 0)),
    etcCost: Number((row.etcCost ?? row.etc_cost ?? 0)),
    eacCost: Number((row.eacCost ?? row.eac_cost ?? 0)),
    percentComplete: Number((row.percentCompleteThroughActuals ?? row.percent_complete ?? row.percentComplete ?? 0)),
    actualPercentComplete: Number((row.percentCompleteThroughActuals ?? row.actualPercentComplete ?? 0)),
    cumulativeRevenue: Number((row.cumulativeRevenueToDate ?? row.cumulative_revenue ?? row.cumulativeRevenue ?? 0)),
    actualCumulativeRevenue: Number((row.cumulativeRevenueToDate ?? row.actualCumulativeRevenue ?? row.cumulative_revenue ?? 0)),
    currentPeriodRevenue: Number((row.currentPeriodCatchUpRevenue ?? row.current_period_revenue ?? row.currentPeriodRevenue ?? 0)),
    currentPeriodCatchUpRevenue: Number((row.currentPeriodCatchUpRevenue ?? row.currentPeriodRevenue ?? row.current_period_revenue ?? 0)),
    revenueAdjustment: Number((row.currentPeriodCatchUpRevenue ?? row.current_period_revenue ?? row.currentPeriodRevenue ?? 0)),
    revenueCatchUpAdjustment: Number((row.currentPeriodCatchUpRevenue ?? row.currentPeriodRevenue ?? row.current_period_revenue ?? 0)),
    currentPeriodMargin: Number((row.currentPeriodMargin ?? row.current_period_margin ?? 0)),
    currentPeriodMarginPct: Number((row.currentPeriodMarginPct ?? row.current_period_margin_pct ?? 0)),
    cumulativeMargin: Number((row.cumulativeMargin ?? row.cumulative_margin ?? 0)),
    margin: Number((row.margin ?? financeBundle?.summary?.eacMargin ?? 0)),
    marginPct: Number((row.marginPct ?? row.margin_pct ?? financeBundle?.summary?.marginPct ?? 0)),
    projectedTotalCost: Number((row.projectedTotalCost ?? row.projected_total_cost ?? 0)),
    lockStatus: row.lockStatus || (Number((row.actualCost ?? row.actual_cost ?? 0)) > 0 ? "ACTUAL" : "FORECAST"),
    validations: {
      errors: Array.isArray(row.validationErrors) ? row.validationErrors : (Array.isArray(row.validation_errors) ? row.validation_errors : []),
      warnings: Array.isArray(row.validationWarnings) ? row.validationWarnings : (Array.isArray(row.validation_warnings) ? row.validation_warnings : [])
    }
  }));

  project.forecastByCategory = persistedCategories.map((row) => ({
    period: String(row.forecast_period || "").slice(0, 7),
    monthIndex: Number(row.month_index || 0),
    category: row.category_key,
    actualCost: Number(row.actual_cost || 0),
    forecastCost: Number(row.forecast_cost || 0)
  }));

  const nextSnapshots = persistedSnapshots.length
    ? persistedSnapshots.map((row) => ({
      id: row.id,
      label: row.snapshot_label || row.label,
      year: Number(row.snapshot_year || row.year || selectedYear),
      versionId: row.is_baseline || row.isBaseline ? null : (row.forecast_version_id || row.versionId || null),
      isBaseline: Boolean(row.is_baseline ?? row.isBaseline),
      actualsThroughPeriod: (row.actuals_through_period || row.actualsThroughPeriod) ? String(row.actuals_through_period || row.actualsThroughPeriod).slice(0, 7) : null,
      summary: row.summary || {},
      categories: Array.isArray(row.category_summary) ? row.category_summary : (Array.isArray(row.categories) ? row.categories : []),
      createdAt: row.created_at || row.createdAt,
      createdBy: row.created_by || null
    }))
    : (Array.isArray(project.snapshots) ? project.snapshots : []);
  project.snapshots = nextSnapshots;

  const baselineSnapshot = nextSnapshots.find((item) => item.isBaseline) || null;
  if (baselineSnapshot) {
    project.baselineSnapshotId = baselineSnapshot.id;
  }

  return true;
}
