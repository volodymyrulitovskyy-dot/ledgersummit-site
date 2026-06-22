import {
  buildMonthlyMetrics,
  computeMarginPercent
} from "./calculations.js";

export const REVENUE_ADJUSTMENT_CATEGORIES = [
  "Revenue Increase",
  "Revenue Reduction",
  "Pricing Update",
  "Contract Mod",
  "Management Override"
];

export const INDIRECT_EXPENSE_CATEGORIES = [
  "G&A",
  "Rent",
  "Software",
  "Insurance",
  "Recruiting",
  "Training",
  "Travel",
  "Other"
];

export const PIPELINE_STAGE_OPTIONS = [
  "Identification",
  "Qualification",
  "Pursuit",
  "Proposal",
  "Best Case",
  "Commit"
];

function number(value) {
  return Number(value || 0);
}

function sum(values = []) {
  return values.reduce((total, value) => total + number(value), 0);
}

function emptyMonths() {
  return Array(12).fill(0);
}

function addSeries(target, values = []) {
  values.forEach((value, index) => {
    target[index] = number(target[index]) + number(value);
  });
  return target;
}

function monthlyCategoryCosts(project, categoryKey) {
  return Array.from({ length: 12 }, (_, monthIndex) =>
    (project.forecastByCategory || [])
      .filter((row) => row.category === categoryKey && Number(row.monthIndex) === monthIndex)
      .reduce((total, row) => total + number(row.actualCost) + number(row.forecastCost), 0)
  );
}

function normalizePeriodValue(period) {
  return /^\d{4}-\d{2}$/.test(String(period || "")) ? String(period) : null;
}

function parsePeriodValue(period) {
  const normalized = normalizePeriodValue(period);
  if (!normalized) return null;
  return {
    year: Number(normalized.slice(0, 4)),
    month: Number(normalized.slice(5, 7))
  };
}

function comparePeriods(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function monthCountBetween(startPeriod, endPeriod) {
  const start = parsePeriodValue(startPeriod);
  const end = parsePeriodValue(endPeriod);
  if (!start || !end) return 0;
  return Math.max(((end.year - start.year) * 12) + (end.month - start.month) + 1, 0);
}

function spreadAmountAcrossPeriods(totalAmount, startPeriod, endPeriod, year) {
  const months = emptyMonths();
  const start = parsePeriodValue(startPeriod);
  const end = parsePeriodValue(endPeriod) || start;
  if (!start || !end) return months;
  const totalMonths = monthCountBetween(startPeriod, endPeriod || startPeriod);
  if (!totalMonths) return months;

  const amountPerMonth = number(totalAmount) / totalMonths;
  for (let currentYear = start.year, currentMonth = start.month; currentYear < end.year || (currentYear === end.year && currentMonth <= end.month); ) {
    if (currentYear === year && currentMonth >= 1 && currentMonth <= 12) {
      months[currentMonth - 1] += amountPerMonth;
    }
    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
  }

  return months;
}

function quarterlyRollup(values = []) {
  return [0, 1, 2, 3].map((quarterIndex) =>
    values.slice(quarterIndex * 3, quarterIndex * 3 + 3).reduce((total, value) => total + number(value), 0)
  );
}

function normalizeProbability(probability) {
  return Math.max(0, Math.min(number(probability), 100)) / 100;
}

function normalizeCostRate(item) {
  if (item?.costRate != null && item.costRate !== "") {
    return Math.max(0, Math.min(number(item.costRate), 100)) / 100;
  }
  if (item?.marginRate != null && item.marginRate !== "") {
    return Math.max(0, Math.min(100 - number(item.marginRate), 100)) / 100;
  }
  return 0.7;
}

function buildOpportunitySeries(items = [], year, sourceType) {
  const activeItems = (items || []).filter((item) => String(item?.sourceType || sourceType) === sourceType);
  const summary = {
    count: activeItems.length,
    unweightedRevenue: emptyMonths(),
    weightedRevenue: emptyMonths(),
    weightedCost: emptyMonths(),
    weightedMargin: emptyMonths(),
    weightedGrossMarginPct: emptyMonths()
  };

  const rows = activeItems.map((item) => {
    const totalValue = number(item.value);
    const probability = normalizeProbability(item.probability);
    const costRate = normalizeCostRate(item);
    const unweightedRevenue = spreadAmountAcrossPeriods(totalValue, item.startPeriod, item.endPeriod || item.startPeriod, year);
    const weightedRevenue = unweightedRevenue.map((value) => value * probability);
    const weightedCost = weightedRevenue.map((value) => value * costRate);
    const weightedMargin = weightedRevenue.map((value, index) => value - weightedCost[index]);

    addSeries(summary.unweightedRevenue, unweightedRevenue);
    addSeries(summary.weightedRevenue, weightedRevenue);
    addSeries(summary.weightedCost, weightedCost);
    addSeries(summary.weightedMargin, weightedMargin);

    return {
      ...item,
      probabilityPct: probability * 100,
      costRatePct: costRate * 100,
      marginRatePct: 100 - (costRate * 100),
      unweightedRevenue,
      weightedRevenue,
      weightedCost,
      weightedMargin,
      totals: {
        unweightedRevenue: sum(unweightedRevenue),
        weightedRevenue: sum(weightedRevenue),
        weightedCost: sum(weightedCost),
        weightedMargin: sum(weightedMargin),
        weightedMarginPct: computeMarginPercent(sum(weightedRevenue), sum(weightedCost))
      }
    };
  }).sort((left, right) => comparePeriods(left.startPeriod, right.startPeriod));

  summary.totals = {
    unweightedRevenue: sum(summary.unweightedRevenue),
    weightedRevenue: sum(summary.weightedRevenue),
    weightedCost: sum(summary.weightedCost),
    weightedMargin: sum(summary.weightedMargin),
    weightedMarginPct: computeMarginPercent(sum(summary.weightedRevenue), sum(summary.weightedCost))
  };
  summary.quarters = {
    unweightedRevenue: quarterlyRollup(summary.unweightedRevenue),
    weightedRevenue: quarterlyRollup(summary.weightedRevenue),
    weightedCost: quarterlyRollup(summary.weightedCost),
    weightedMargin: quarterlyRollup(summary.weightedMargin)
  };

  return {
    rows,
    summary
  };
}

function allocateAdjustment(entry, year) {
  const months = emptyMonths();
  const start = normalizePeriodValue(entry.startPeriod);
  const end = normalizePeriodValue(entry.endPeriod) || start;
  if (!start) return months;
  const startYear = Number(start.slice(0, 4));
  const endYear = Number((end || start).slice(0, 4));
  if (year < startYear || year > endYear) return months;

  const startMonth = startYear === year ? Number(start.slice(5, 7)) : 1;
  const endMonth = endYear === year ? Number((end || start).slice(5, 7)) : 12;
  const validStart = Math.max(1, Math.min(startMonth, 12));
  const validEnd = Math.max(validStart, Math.min(endMonth, 12));
  const span = entry.spreadMethod === "even" ? (validEnd - validStart + 1) : 1;
  const signedAmount = number(entry.amount) * number(entry.direction || 1);

  if (entry.spreadMethod === "even") {
    const perMonth = signedAmount / span;
    for (let month = validStart; month <= validEnd; month += 1) {
      months[month - 1] = perMonth;
    }
    return months;
  }

  months[validStart - 1] = signedAmount;
  return months;
}

export function buildBudgetingModel({
  projects = [],
  year,
  adjustments = [],
  opportunities = [],
  whitespace = [],
  resourceMonthly = [],
  employeeRows = []
} = {}) {
  const averageDirectLaborRate = employeeRows.length
    ? employeeRows.reduce((total, row) => total + number(row.rate), 0) / employeeRows.length
    : 0;

  const projectContributions = projects.map((project) => {
    const monthly = buildMonthlyMetrics(project, year);
    const revenue = monthly.map((row) => number(row.currentPeriodRevenue));
    const directLabor = monthlyCategoryCosts(project, "labor");
    const subcontractors = monthlyCategoryCosts(project, "subcontractors");
    const equipment = monthlyCategoryCosts(project, "equipment");
    const materials = monthlyCategoryCosts(project, "materials");
    const odc = monthlyCategoryCosts(project, "odc");
    const directCost = revenue.map((_, index) =>
      directLabor[index] + subcontractors[index] + equipment[index] + materials[index] + odc[index]
    );
    const grossMargin = revenue.map((value, index) => value - directCost[index]);

    return {
      projectId: project.id,
      projectName: project.name,
      revenue,
      directLabor,
      subcontractors,
      equipment,
      materials,
      odc,
      directCost,
      grossMargin,
      totals: {
        revenue: sum(revenue),
        directCost: sum(directCost),
        grossMargin: sum(grossMargin),
        marginPct: computeMarginPercent(sum(revenue), sum(directCost))
      }
    };
  });

  const projectRevenue = emptyMonths();
  const directLabor = emptyMonths();
  const subcontractors = emptyMonths();
  const equipment = emptyMonths();
  const materials = emptyMonths();
  const odc = emptyMonths();

  projectContributions.forEach((project) => {
    addSeries(projectRevenue, project.revenue);
    addSeries(directLabor, project.directLabor);
    addSeries(subcontractors, project.subcontractors);
    addSeries(equipment, project.equipment);
    addSeries(materials, project.materials);
    addSeries(odc, project.odc);
  });

  const revenueAdjustments = emptyMonths();
  const indirectByCategory = new Map(INDIRECT_EXPENSE_CATEGORIES.map((category) => [category, emptyMonths()]));
  adjustments.forEach((entry) => {
    const allocation = allocateAdjustment(entry, year);
    if (entry.type === "revenue") {
      addSeries(revenueAdjustments, allocation);
      return;
    }
    const category = indirectByCategory.get(entry.category) || emptyMonths();
    addSeries(category, allocation.map((value) => Math.abs(value)));
    indirectByCategory.set(entry.category, category);
  });

  const pipeline = buildOpportunitySeries(opportunities, year, "pipeline");
  const whiteSpace = buildOpportunitySeries(whitespace, year, "whitespace");

  const totalRevenue = projectRevenue.map((value, index) =>
    value +
    revenueAdjustments[index] +
    pipeline.summary.weightedRevenue[index] +
    whiteSpace.summary.weightedRevenue[index]
  );
  const totalDirectCost = projectRevenue.map((_, index) =>
    directLabor[index] +
    subcontractors[index] +
    equipment[index] +
    materials[index] +
    odc[index] +
    pipeline.summary.weightedCost[index] +
    whiteSpace.summary.weightedCost[index]
  );
  const grossMargin = totalRevenue.map((value, index) => value - totalDirectCost[index]);
  const unutilizedLaborOverhead = resourceMonthly.length
    ? resourceMonthly.map((row) => Math.max(number(row.availableHours) - number(row.assignedHours), 0) * averageDirectLaborRate)
    : emptyMonths();
  const totalIndirectExpense = [...indirectByCategory.values()].reduce((acc, series) => addSeries(acc, series), emptyMonths());
  const totalOverhead = totalIndirectExpense.map((value, index) => value + unutilizedLaborOverhead[index]);
  const operatingIncome = grossMargin.map((value, index) => value - totalOverhead[index]);
  const targetRevenueFloor = Array(12).fill(30_000_000);
  const targetRevenueCeiling = Array(12).fill(35_000_000);
  const gapToFloor = totalRevenue.map((value, index) => Math.max(targetRevenueFloor[index] - value, 0));
  const excessAboveCeiling = totalRevenue.map((value, index) => Math.max(value - targetRevenueCeiling[index], 0));
  const pipelineAtRiskRevenue = emptyMonths();
  pipeline.rows.forEach((row) => {
    const isAtRisk = number(row.probabilityPct) < 60 || ["Identification", "Qualification", "Pursuit"].includes(String(row.stage || ""));
    if (!isAtRisk) return;
    addSeries(pipelineAtRiskRevenue, row.weightedRevenue);
  });
  const whiteSpaceAtRiskRevenue = emptyMonths();
  whiteSpace.rows.forEach((row) => {
    const isAtRisk = number(row.probabilityPct) < 35;
    if (!isAtRisk) return;
    addSeries(whiteSpaceAtRiskRevenue, row.weightedRevenue);
  });
  const totalAtRiskRevenue = pipelineAtRiskRevenue.map((value, index) => value + whiteSpaceAtRiskRevenue[index]);
  const managementRevenueLift = revenueAdjustments.map((value) => Math.max(value, 0));
  const managementRevenueReduction = revenueAdjustments.map((value) => Math.abs(Math.min(value, 0)));

  const pAndLRows = [
    { key: "projectRevenue", label: "Secured Project Revenue", type: "currency", values: projectRevenue },
    { key: "revenueAdjustments", label: "Revenue Adjustments", type: "currency", values: revenueAdjustments },
    { key: "pipelineRevenueWeighted", label: "Pipeline Revenue (Weighted)", type: "currency", values: pipeline.summary.weightedRevenue },
    { key: "whiteSpaceRevenueWeighted", label: "White Space Revenue (Weighted)", type: "currency", values: whiteSpace.summary.weightedRevenue },
    { key: "totalRevenue", label: "Total Revenue", type: "currency", values: totalRevenue, emphasis: true },
    { key: "directLabor", label: "Direct Labor", type: "currency", values: directLabor },
    { key: "subcontractors", label: "Subcontractors", type: "currency", values: subcontractors },
    { key: "equipment", label: "Equipment", type: "currency", values: equipment },
    { key: "materials", label: "Materials", type: "currency", values: materials },
    { key: "odc", label: "ODC", type: "currency", values: odc },
    { key: "pipelineCostWeighted", label: "Pipeline Cost (Assumed)", type: "currency", values: pipeline.summary.weightedCost },
    { key: "whiteSpaceCostWeighted", label: "White Space Cost (Assumed)", type: "currency", values: whiteSpace.summary.weightedCost },
    { key: "totalDirectCost", label: "Total Direct Cost", type: "currency", values: totalDirectCost, emphasis: true },
    { key: "grossMargin", label: "Gross Margin", type: "currency", values: grossMargin, emphasis: true },
    {
      key: "grossMarginPct",
      label: "Gross Margin %",
      type: "percent",
      values: totalRevenue.map((value, index) => computeMarginPercent(value, totalDirectCost[index])),
      emphasis: true
    },
    { key: "unutilizedLaborOverhead", label: "Overhead - Unutilized Labor", type: "currency", values: unutilizedLaborOverhead },
    ...[...indirectByCategory.entries()].map(([category, values]) => ({
      key: `indirect-${category}`,
      label: `Indirect - ${category}`,
      type: "currency",
      values
    })),
    { key: "totalOverhead", label: "Total Overhead", type: "currency", values: totalOverhead, emphasis: true },
    { key: "operatingIncome", label: "Operating Income", type: "currency", values: operatingIncome, emphasis: true },
    {
      key: "operatingMarginPct",
      label: "Operating Margin %",
      type: "percent",
      values: totalRevenue.map((value, index) => computeMarginPercent(value, totalRevenue[index] - operatingIncome[index])),
      emphasis: true
    }
  ].map((row) => ({
    ...row,
    total: row.type === "percent"
      ? computeMarginPercent(sum(totalRevenue), row.key === "grossMarginPct" ? sum(totalDirectCost) : (sum(totalRevenue) - sum(operatingIncome)))
      : sum(row.values)
  }));

  return {
    projectContributions,
    averageDirectLaborRate,
    pipeline,
    whiteSpace,
    monthlyDrivers: {
      projectRevenue,
      revenueAdjustments,
      pipelineRevenueWeighted: pipeline.summary.weightedRevenue,
      whiteSpaceRevenueWeighted: whiteSpace.summary.weightedRevenue,
      totalRevenue,
      directLabor,
      subcontractors,
      equipment,
      materials,
      odc,
      pipelineCostWeighted: pipeline.summary.weightedCost,
      whiteSpaceCostWeighted: whiteSpace.summary.weightedCost,
      totalDirectCost,
      grossMargin,
      unutilizedLaborOverhead,
      totalIndirectExpense,
      totalOverhead,
      operatingIncome
    },
    pAndLRows,
    quarters: {
      labels: ["Q1", "Q2", "Q3", "Q4"],
      securedRevenue: quarterlyRollup(projectRevenue),
      revenueAdjustments: quarterlyRollup(revenueAdjustments),
      pipelineRevenueWeighted: pipeline.summary.quarters.weightedRevenue,
      whiteSpaceRevenueWeighted: whiteSpace.summary.quarters.weightedRevenue,
      totalRevenue: quarterlyRollup(totalRevenue),
      totalDirectCost: quarterlyRollup(totalDirectCost),
      totalOverhead: quarterlyRollup(totalOverhead),
      operatingIncome: quarterlyRollup(operatingIncome),
      gapToFloor: quarterlyRollup(gapToFloor),
      excessAboveCeiling: quarterlyRollup(excessAboveCeiling),
      atRiskRevenue: quarterlyRollup(totalAtRiskRevenue)
    },
    monthlyCoverage: Array.from({ length: 12 }, (_, monthIndex) => ({
      monthIndex,
      securedRevenue: projectRevenue[monthIndex],
      pipelineRevenueWeighted: pipeline.summary.weightedRevenue[monthIndex],
      whiteSpaceRevenueWeighted: whiteSpace.summary.weightedRevenue[monthIndex],
      revenueAdjustments: revenueAdjustments[monthIndex],
      totalRevenue: totalRevenue[monthIndex],
      pipelineAtRiskRevenue: pipelineAtRiskRevenue[monthIndex],
      whiteSpaceAtRiskRevenue: whiteSpaceAtRiskRevenue[monthIndex],
      atRiskRevenue: totalAtRiskRevenue[monthIndex]
    })),
    managementSummary: {
      revenueAdjustmentCount: adjustments.filter((entry) => entry.type === "revenue").length,
      indirectExpenseCount: adjustments.filter((entry) => entry.type !== "revenue").length,
      revenueLift: sum(managementRevenueLift),
      revenueReduction: sum(managementRevenueReduction),
      indirectExpenseTotal: sum(totalIndirectExpense)
    },
    riskSummary: {
      monthsBelowFloor: gapToFloor.filter((value) => value > 0).length,
      monthsAboveCeiling: excessAboveCeiling.filter((value) => value > 0).length,
      annualAtRiskRevenue: sum(totalAtRiskRevenue),
      pipelineAtRiskRevenue: sum(pipelineAtRiskRevenue),
      whiteSpaceAtRiskRevenue: sum(whiteSpaceAtRiskRevenue),
      lowConfidenceRevenue: sum([
        ...pipeline.rows.filter((row) => number(row.probabilityPct) < 50).map((row) => row.totals.weightedRevenue),
        ...whiteSpace.rows.filter((row) => number(row.probabilityPct) < 35).map((row) => row.totals.weightedRevenue)
      ])
    },
    sourceComposition: [
      {
        key: "secured",
        label: "Secured backlog",
        count: projects.length,
        unweightedRevenue: sum(projectRevenue),
        weightedRevenue: sum(projectRevenue),
        weightedCost: sum(directLabor) + sum(subcontractors) + sum(equipment) + sum(materials) + sum(odc),
        weightedMargin: sum(projectRevenue) - (sum(directLabor) + sum(subcontractors) + sum(equipment) + sum(materials) + sum(odc))
      },
      {
        key: "pipeline",
        label: "Pipeline opportunities",
        count: pipeline.summary.count,
        unweightedRevenue: pipeline.summary.totals.unweightedRevenue,
        weightedRevenue: pipeline.summary.totals.weightedRevenue,
        weightedCost: pipeline.summary.totals.weightedCost,
        weightedMargin: pipeline.summary.totals.weightedMargin
      },
      {
        key: "whitespace",
        label: "White space / go get",
        count: whiteSpace.summary.count,
        unweightedRevenue: whiteSpace.summary.totals.unweightedRevenue,
        weightedRevenue: whiteSpace.summary.totals.weightedRevenue,
        weightedCost: whiteSpace.summary.totals.weightedCost,
        weightedMargin: whiteSpace.summary.totals.weightedMargin
      },
      {
        key: "management",
        label: "Management adjustments",
        count: adjustments.length,
        unweightedRevenue: sum(revenueAdjustments),
        weightedRevenue: sum(revenueAdjustments),
        weightedCost: 0,
        weightedMargin: sum(revenueAdjustments)
      }
    ].map((row) => ({
      ...row,
      weightedMarginPct: computeMarginPercent(row.weightedRevenue, row.weightedCost)
    })),
    totals: {
      securedRevenue: sum(projectRevenue),
      pipelineWeightedRevenue: pipeline.summary.totals.weightedRevenue,
      whiteSpaceWeightedRevenue: whiteSpace.summary.totals.weightedRevenue,
      revenue: sum(totalRevenue),
      directCost: sum(totalDirectCost),
      grossMargin: sum(grossMargin),
      grossMarginPct: computeMarginPercent(sum(totalRevenue), sum(totalDirectCost)),
      overhead: sum(totalOverhead),
      operatingIncome: sum(operatingIncome),
      operatingMarginPct: computeMarginPercent(sum(totalRevenue), sum(totalRevenue) - sum(operatingIncome)),
      unutilizedLaborOverhead: sum(unutilizedLaborOverhead),
      revenueAdjustments: sum(revenueAdjustments)
    }
  };
}
