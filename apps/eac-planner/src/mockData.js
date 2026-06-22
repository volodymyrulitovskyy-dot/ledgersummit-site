export const trendSeries = {
  labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  revenue: [1.12, 1.08, 1.19, 1.22, 1.35, 1.42, 1.51, 1.58, 1.63, 1.67, 1.72, 1.79],
  cost: [0.92, 0.96, 1.01, 1.08, 1.11, 1.18, 1.24, 1.29, 1.34, 1.39, 1.43, 1.47],
  profit: [0.20, 0.12, 0.18, 0.14, 0.24, 0.24, 0.27, 0.29, 0.29, 0.28, 0.29, 0.32]
};

export const costMix = {
  labels: ["Labor", "Subcontractors", "Equipment", "Materials", "ODC"],
  values: [6.2, 3.8, 1.6, 2.9, 1.1]
};

export const roadmap = [
  {
    phase: "Release 1",
    title: "Foundation and controls",
    summary: "Backend, auth, projects, WBS, versioning, permissions, and audit logging.",
    emphasis: "Core platform"
  },
  {
    phase: "Release 2",
    title: "Planning engine",
    summary: "Monthly planning by labor, subs, equipment, materials, ODC, plus baseline and working forecast.",
    emphasis: "Financial model"
  },
  {
    phase: "Release 3",
    title: "QuickBooks sync",
    summary: "Import jobs, mapping screens, reconciliation workflows, and actual-vs-forecast refresh.",
    emphasis: "Accounting integration"
  },
  {
    phase: "Release 4",
    title: "Resource and executive analytics",
    summary: "Resource loading, utilization, scenario comparisons, dashboards, and exception reporting.",
    emphasis: "Operational insight"
  }
];

export const health = {
  labels: ["Architecture", "Security", "Planning", "Integration", "Reporting", "Operability"],
  current: [25, 20, 35, 5, 30, 10],
  target: [90, 92, 88, 85, 86, 90]
};

export const modules = [
  {
    name: "Project Setup",
    ownership: "Projects, contracts, funding, billing method, WBS, cost codes, and governance metadata.",
    outcomes: "Consistent project structure and clean planning dimensions."
  },
  {
    name: "Plan Versions",
    ownership: "Budget, approved forecast, working forecast, scenarios, and freeze snapshots.",
    outcomes: "Auditability, approvals, and trustworthy EAC history."
  },
  {
    name: "Resource Planning",
    ownership: "Employees, roles, crews, calendars, assignments, rates, and utilization assumptions.",
    outcomes: "Time-phased staffing plans connected to financial forecasts."
  },
  {
    name: "Cost Planning",
    ownership: "Labor, subcontractors, equipment, materials, ODC, and cost drivers by month.",
    outcomes: "Transparent ETC and variance forecasting."
  },
  {
    name: "Actuals Ingestion",
    ownership: "QuickBooks connection, raw imports, mappings, sync jobs, and exception handling.",
    outcomes: "Reliable actuals refreshed on a schedule without double counting."
  },
  {
    name: "Reporting",
    ownership: "Dashboards, forecast variance, margin trend, burn, funding, and export views.",
    outcomes: "Fast decision-making for PMs, finance, and executives."
  }
];
