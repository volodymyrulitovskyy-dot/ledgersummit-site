const CATEGORY_KEYS = ["labor", "subcontractors", "equipment", "materials", "odc"];

function number(value) {
  return Number(value || 0);
}

function sum(values) {
  return values.reduce((total, value) => total + number(value), 0);
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function lineMonthlyCost(line, category, year) {
  const months = Array.isArray(line?.yearly?.[year]) && line.yearly[year].length === 12
    ? line.yearly[year]
    : (line.monthly || []);
  if (category === "labor" || category === "equipment" || category === "materials") {
    return months.map((value) => number(value) * number(line.rate));
  }
  return months.map((value) => number(value));
}

function periodLabel(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function fundingValue(project) {
  return number(
    project.effectiveFundedValue
    || project.funding
    || project.fundedValue
    || project.effectiveContractValue
    || project.contractValue
    || project.sourceContractValue
  );
}

function actualsThroughIndex(projectMonthly) {
  const lastActualIndex = projectMonthly.reduce(
    (latestIndex, row, index) => (number(row.actualCost) > 0 ? index : latestIndex),
    -1
  );
  return lastActualIndex >= 0 ? lastActualIndex : 0;
}

function snapshotSummaryFromMonthly(projectMonthly, funding) {
  const snapshotRow = projectMonthly[actualsThroughIndex(projectMonthly)] || projectMonthly[projectMonthly.length - 1];
  const eacCost = number(snapshotRow?.eacCost);
  const percentComplete = number(snapshotRow?.actualPercentComplete ?? snapshotRow?.percentComplete);
  const cumulativeRevenueToDate = number(snapshotRow?.actualCumulativeRevenue ?? snapshotRow?.cumulativeRevenue);
  const currentPeriodRevenue = number(snapshotRow?.currentPeriodCatchUpRevenue ?? snapshotRow?.currentPeriodRevenue);
  const margin = computeMargin(funding, eacCost);

  return {
    actualsThroughPeriod: snapshotRow?.period || null,
    eacCost,
    percentComplete,
    cumulativeRevenueToDate,
    currentPeriodRevenue,
    revenueEac: number(funding),
    margin,
    marginPct: computeMarginPercent(funding, eacCost)
  };
}

export function computeEACCost(actualCostToDate, remainingForecastCost) {
  return number(actualCostToDate) + Math.max(0, number(remainingForecastCost));
}

export function computeETC(remainingForecastCost) {
  return Math.max(0, number(remainingForecastCost));
}

export function computePercentComplete(actualCostToDate, eacCost) {
  const cost = number(actualCostToDate);
  const eac = number(eacCost);
  if (eac <= 0) return 0;
  return Math.max(0, Math.min(1, cost / eac));
}

export function computeRevenueToDate(percentComplete, funding) {
  return number(percentComplete) * number(funding);
}

export function computeCurrentPeriodRevenue(cumulativeRevenue, previouslyRecognizedRevenue) {
  return number(cumulativeRevenue) - number(previouslyRecognizedRevenue);
}

export function computeMargin(funding, eacCost) {
  return number(funding) - number(eacCost);
}

export function computeMarginPercent(revenue, cost) {
  const rev = number(revenue);
  const expense = number(cost);
  if (rev <= 0) return expense > 0 ? -100 : 0;
  return clamp(((rev - expense) / rev) * 100, -100, 100);
}

export function validateFinancialRow({
  label = "Financial row",
  actualCost = 0,
  etcCost = 0,
  eacCost = 0,
  revenue = 0,
  cost = 0,
  marginPct = 0
}) {
  const errors = [];
  const warnings = [];

  if (number(eacCost) + 0.0001 < number(actualCost)) {
    errors.push(`${label}: EAC cannot be lower than actual cost.`);
  }

  if (number(etcCost) < 0) {
    errors.push(`${label}: ETC cannot be negative.`);
  }

  if (number(marginPct) > 100 || number(marginPct) < -100) {
    warnings.push(`${label}: Margin % is outside the valid -100% to 100% range.`);
  }

  if (number(revenue) < number(cost) && number(marginPct) > 0) {
    errors.push(`${label}: Margin % cannot be positive when revenue is below cost.`);
  }

  return { errors, warnings };
}

export function validateProjectFinancialModel(projectMonthly) {
  const issues = { errors: [], warnings: [] };

  (projectMonthly || []).forEach((row) => {
    const rowIssues = validateFinancialRow({
      label: row.period,
      actualCost: row.cumulativeActualCost ?? row.actualCost,
      etcCost: row.etcCost,
      eacCost: row.eacCost,
      revenue: row.currentPeriodRevenue,
      cost: row.currentPeriodCost,
      marginPct: row.currentPeriodMarginPct
    });

    issues.errors.push(...rowIssues.errors);
    issues.warnings.push(...rowIssues.warnings);
  });

  return issues;
}

export function computeVariancePercent(current, baseline) {
  const base = number(baseline);
  if (base === 0) return 0;
  return ((number(current) - base) / base) * 100;
}

export function computeMarginPointChange(currentMarginPct, baselineMarginPct) {
  return number(currentMarginPct) - number(baselineMarginPct);
}

export function buildForecastByCategory(project, year) {
  const existingActuals = project.actuals || {};
  const rows = [];

  CATEGORY_KEYS.forEach((category) => {
    const lines = project.planning?.[category] || [];
    const forecastMonthly = Array.from({ length: 12 }, (_, monthIndex) =>
      lines.reduce((total, line) => total + number(lineMonthlyCost(line, category, year)[monthIndex]), 0)
    );

    forecastMonthly.forEach((forecastCost, monthIndex) => {
      rows.push({
        period: periodLabel(year, monthIndex),
        monthIndex,
        category,
        forecastCost,
        actualCost: number(existingActuals[category]?.[monthIndex])
      });
    });
  });

  return rows;
}

export function buildProjectMonthly(project, year) {
  const funding = fundingValue(project);
  const forecastByCategory = buildForecastByCategory(project, year);
  const totalActualCostOverride = project.actuals?.totalCost || [];

  const monthlyCategoryMap = Array.from({ length: 12 }, (_, monthIndex) =>
    forecastByCategory.filter((row) => row.monthIndex === monthIndex)
  );

  const totalProjectedCost = sum(
    monthlyCategoryMap.flatMap((rows) => rows.map((row) => row.actualCost > 0 ? row.actualCost : row.forecastCost))
  );

  let cumulativeCost = 0;
  let cumulativeActualCost = 0;
  let previousRevenue = 0;
  let previousActualRevenue = 0;

  return monthlyCategoryMap.map((rows, monthIndex) => {
    const categoryActualCost = sum(rows.map((row) => row.actualCost));
    const actualCost = number(totalActualCostOverride[monthIndex]) || categoryActualCost;
    const forecastCost = sum(rows.map((row) => row.forecastCost));
    const currentPeriodCost = actualCost > 0 ? actualCost : forecastCost;
    cumulativeCost += currentPeriodCost;
    cumulativeActualCost += actualCost;

    const futureRows = monthlyCategoryMap.slice(monthIndex + 1).flatMap((items) => items);
    const remainingForecastCost = computeETC(sum(futureRows.map((row) => row.forecastCost)));
    const eacCost = computeEACCost(cumulativeCost, remainingForecastCost);
    const percentComplete = computePercentComplete(cumulativeCost, eacCost);
    const actualPercentComplete = computePercentComplete(cumulativeActualCost, eacCost);
    const cumulativeRevenue = computeRevenueToDate(percentComplete, funding);
    const actualCumulativeRevenue = computeRevenueToDate(actualPercentComplete, funding);
    const currentPeriodRevenue = computeCurrentPeriodRevenue(cumulativeRevenue, previousRevenue);
    previousRevenue = cumulativeRevenue;
    const currentPeriodCatchUpRevenue = actualCost > 0
      ? computeCurrentPeriodRevenue(actualCumulativeRevenue, previousActualRevenue)
      : 0;
    if (actualCost > 0) previousActualRevenue = actualCumulativeRevenue;
    const cumulativeMargin = cumulativeRevenue - cumulativeCost;
    const currentPeriodMargin = currentPeriodRevenue - currentPeriodCost;
    const currentPeriodMarginPct = computeMarginPercent(currentPeriodRevenue, currentPeriodCost);
    const totalMarginPct = computeMarginPercent(funding, eacCost);

    const validation = validateFinancialRow({
      label: periodLabel(year, monthIndex),
      actualCost: cumulativeActualCost,
      etcCost: remainingForecastCost,
      eacCost,
      revenue: currentPeriodRevenue,
      cost: currentPeriodCost,
      marginPct: currentPeriodMarginPct
    });

    return {
      period: periodLabel(year, monthIndex),
      monthIndex,
      funding,
      actualCost,
      forecastCost,
      costProgress: currentPeriodCost,
      cumulativeActualCost,
      cumulativeCost,
      remainingForecastCost,
      etcCost: remainingForecastCost,
      eacCost,
      percentComplete,
      actualPercentComplete,
      cumulativeRevenue,
      actualCumulativeRevenue,
      currentPeriodRevenue,
      currentPeriodCatchUpRevenue,
      revenueAdjustment: currentPeriodRevenue,
      revenueCatchUpAdjustment: currentPeriodCatchUpRevenue,
      currentPeriodCost,
      currentPeriodMargin,
      currentPeriodMarginPct,
      cumulativeMargin,
      margin: computeMargin(funding, eacCost),
      marginPct: totalMarginPct,
      validations: validation,
      projectedTotalCost: totalProjectedCost
    };
  });
}

export function synchronizeProjectFinancialModel(project, year) {
  const forecastByCategory = buildForecastByCategory(project, year);
  const projectMonthly = buildProjectMonthly(project, year);
  return {
    ...project,
    funding: fundingValue(project),
    forecastByCategory,
    projectMonthly,
    snapshots: Array.isArray(project.snapshots) ? project.snapshots : []
  };
}

export function getBaselineSnapshot(project) {
  const snapshots = Array.isArray(project?.snapshots) ? project.snapshots : [];
  if (!snapshots.length) return null;

  if (project?.baselineSnapshotId) {
    const matching = snapshots.find((snapshot) => snapshot.id === project.baselineSnapshotId);
    if (matching) return matching;
  }

  return snapshots.find((snapshot) => snapshot.isBaseline) || snapshots[snapshots.length - 1] || null;
}

export function createProjectSnapshot(project, year, options = {}) {
  const normalized = synchronizeProjectFinancialModel(project, year);
  const funding = number(normalized.funding);
  const now = options.createdAt || new Date().toISOString();
  const summary = snapshotSummaryFromMonthly(normalized.projectMonthly, funding);
  const categories = categorySummaryFromForecast(normalized, year);
  const snapshotId = options.id || `snap-${Date.now()}`;
  const setAsBaseline = options.setAsBaseline !== false;
  const nextSnapshot = {
    id: snapshotId,
    label: options.label || `Snapshot ${summary.actualsThroughPeriod || year}`,
    createdAt: now,
    year,
    versionId: options.versionId || null,
    isBaseline: setAsBaseline,
    actualsThroughPeriod: summary.actualsThroughPeriod,
    summary,
    categories
  };

  const priorSnapshots = (normalized.snapshots || []).map((snapshot) =>
    setAsBaseline ? { ...snapshot, isBaseline: false } : snapshot
  );

  return {
    ...normalized,
    baselineSnapshotId: setAsBaseline ? snapshotId : normalized.baselineSnapshotId,
    snapshots: [...priorSnapshots, nextSnapshot]
  };
}

export function computeSnapshotVariance(project, year) {
  const normalized = synchronizeProjectFinancialModel(project, year);
  const baseline = getBaselineSnapshot(normalized);
  if (!baseline) return null;

  const current = snapshotSummaryFromMonthly(normalized.projectMonthly, normalized.funding);

  return {
    baseline,
    current,
    costVariance: current.eacCost - number(baseline.summary?.eacCost),
    marginVariance: current.margin - number(baseline.summary?.margin),
    marginPointChange: current.marginPct - number(baseline.summary?.marginPct),
    revenueImpact: current.cumulativeRevenueToDate - number(baseline.summary?.cumulativeRevenueToDate)
  };
}

export function allocateRevenueFromCostShare(costAmount, totalEacCost, funding) {
  const total = number(totalEacCost);
  if (total <= 0) return 0;
  return (number(costAmount) / total) * number(funding);
}

export function projectKpisFromMonthly(projectMonthly, funding) {
  const revenue = sum(projectMonthly.map((item) => item.currentPeriodRevenue));
  const cost = sum(projectMonthly.map((item) => item.costProgress));
  const actualCost = sum(projectMonthly.map((item) => item.actualCost));
  const actualsIndex = actualsThroughIndex(projectMonthly);
  const actualRevenueToDate = sum(projectMonthly.slice(0, actualsIndex + 1).map((item) => item.currentPeriodCatchUpRevenue ?? item.currentPeriodRevenue));
  const eacCost = number(projectMonthly[projectMonthly.length - 1]?.eacCost);
  const etcCost = computeETC(projectMonthly[actualsIndex]?.remainingForecastCost ?? (eacCost - actualCost));
  const margin = computeMargin(funding, eacCost);
  const marginPct = computeMarginPercent(funding, eacCost);
  const actualsThroughRow = projectMonthly[actualsIndex] || projectMonthly[projectMonthly.length - 1] || {};

  return {
    funding: number(funding),
    revenue,
    cost,
    eacCost,
    etcCost,
    margin,
    marginPct,
    percentComplete: number((actualsThroughRow.actualPercentComplete ?? actualsThroughRow.percentComplete ?? 0)) * 100,
    actualCost,
    actualRevenueToDate,
    actualMargin: actualRevenueToDate - actualCost,
    actualMarginPct: computeMarginPercent(actualRevenueToDate, actualCost),
    forecastToGo: etcCost,
    etcRevenue: Math.max(0, number(funding) - actualRevenueToDate),
    currentPeriodRevenue: number((actualsThroughRow.currentPeriodCatchUpRevenue ?? actualsThroughRow.currentPeriodRevenue ?? 0)),
    validations: validateProjectFinancialModel(projectMonthly)
  };
}

export function categorySummaryFromForecast(project, year) {
  const normalized = synchronizeProjectFinancialModel(project, year);
  const actualsByCategory = {};
  const eacByCategory = {};
  const etcByCategory = {};

  CATEGORY_KEYS.forEach((category) => {
    const rows = normalized.forecastByCategory.filter((row) => row.category === category);
    actualsByCategory[category] = sum(rows.map((row) => row.actualCost));
    eacByCategory[category] = sum(rows.map((row) => row.actualCost > 0 ? row.actualCost : row.forecastCost));
    etcByCategory[category] = eacByCategory[category] - actualsByCategory[category];
  });

  return CATEGORY_KEYS.map((category) => ({
    key: category,
    actuals: actualsByCategory[category],
    eac: eacByCategory[category],
    etc: etcByCategory[category]
  }));
}
