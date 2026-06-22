import { loadState, saveState, resetState } from "./state.js";
import { createEmptyProjectState, DEFAULT_PLANNING_YEAR } from "./seedData.js";
import {
  buildMonthlyMetrics,
  buildKpis,
  buildReconciliationRows,
  resourceSummary,
  quickbooksHealth,
  formatCurrency,
  formatCompactCurrency,
  getPlanMonthlyTotals,
  getLineAnnualCost,
  getLineAnnualUnits,
  getLineRevenue,
  buildCategorySummary,
  computeMarginPercent,
  computeMarginPointChange,
  computeVariancePercent,
  financialComparisonMetrics,
  syncProjectFinancials,
  syncAllProjectsFinancials
} from "./calculations.js";
import { createProjectSnapshot } from "./eacEngine.js";
import { buildTrendChart, buildCostMixChart } from "./charts.js";
import {
  initializeAuth,
  onAuthStateChange,
  signInWithEmail,
  signInWithGoogle,
  signOutAuth
} from "./authClient.js";
import {
  applyPersistedFinanceModel as applyPersistedFinanceModelToState,
  buildDisplayKpis as buildAuthoritativeDisplayKpis,
  mergeAuthoritativeCategorySummary as mergeAuthoritativeCategorySummaryRows,
  mergeAuthoritativeFinancials as mergeAuthoritativeFinancialRows,
  serializeCurrentProjectFinance as serializeProjectFinancePayload
} from "./financeAuthority.js";
import { ensureAmyOriginalBudgetBaselineSeed } from "./baselineSnapshots.js";
import {
  extractCashFlowSummary,
  extractCompanySummary,
  extractProfitLossSummary,
  fetchProjectFinanceModel,
  fetchProjectFinanceReport,
  fetchJson,
  normalizeImportedMonthlyActuals,
  openQboConnectWindow,
  resolveApiBases,
  saveProjectFinanceModel as saveProjectFinanceModelRequest,
  selectedDateRange
} from "./qboClient.js";
import {
  buildBudgetingModel,
  INDIRECT_EXPENSE_CATEGORIES,
  PIPELINE_STAGE_OPTIONS,
  REVENUE_ADJUSTMENT_CATEGORIES
} from "./budgetingEngine.js";

let state = loadState();
let trendChart;
let cumulativeTrendChart;
let costMixChart;
let budgetPnLChart;
let budgetRevenueCompositionChart;
let budgetSalesTrendChart;
const QBO_API_BASES = resolveApiBases();
let qboState = {
  status: "idle",
  company: null,
  profitLoss: null,
  monthlyActuals: null,
  importBatches: [],
  cashFlow: null,
  summaries: null,
  reconciliation: null,
  error: null,
  year: null,
  companyPeriodLabel: null
};
let setupState = {
  status: "idle",
  error: null,
  projects: [],
  selectedProjectId: null,
  bundle: null,
  revenueMethods: [],
  bootstrapCustomers: [],
  bootstrapEmployees: [],
  bootstrapVendors: [],
  bootstrapItems: [],
  employeeProfiles: [],
  equipmentCatalog: [],
  odcCatalog: []
};
let financeState = {
  status: "idle",
  error: null,
  loadedKey: null,
  savingKey: null,
  saveTimer: null
};
let authState = {
  status: "idle",
  config: null,
  user: null,
  error: null,
  info: "",
  signInEvents: [],
  subscriptionCleanup: null
};

const NAV_ITEMS = [
  ["overview", "Overview"],
  ["workflow", "Workflow"],
  ["plan", "Plan"],
  ["financials", "Financials"],
  ["admin", "Admin"]
];
const MODULE_ITEMS = [
  ["resources", "Resources"],
  ["eac", "EAC"],
  ["budgeting", "Budgeting"]
];
const MODULE_TABS = {
  resources: [
    ["overview", "Overview"],
    ["employees", "Employees"],
    ["assignments", "Assignments"],
    ["hiring", "Hiring"],
    ["attrition", "Attrition"],
    ["analytics", "Analytics"],
    ["admin", "Admin"]
  ],
  eac: NAV_ITEMS,
  budgeting: [
    ["overview", "Summary"],
    ["rollup", "Projects"],
    ["revenueSources", "Sales"],
    ["scenarios", "Expenses"],
    ["admin", "Admin"]
  ]
};

const PLAN_SUBTABS = [
  ["summary", "Summary"],
  ["labor", "Labor"],
  ["subcontractors", "Subs"],
  ["equipment", "Equipment"],
  ["materials", "Materials"],
  ["odc", "ODC"]
];

const CATEGORY_CONFIG = {
  labor: {
    label: "Labor Planning",
    addLabel: "Add Employee",
    unitLabel: "Hours",
    stickyColumnClass: "labor-sticky",
    columns: [
      ["employee", "Employee"],
      ["role", "Labor Category"],
      ["rate", "Rate/Hr"]
    ]
  },
  subcontractors: {
    label: "Subcontractor Planning",
    addLabel: "Add Sub Line",
    unitLabel: "Cost",
    stickyColumnClass: "sub-sticky",
    columns: [
      ["vendor", "Vendor"],
      ["item", "Line Item"]
    ]
  },
  equipment: {
    label: "Equipment Planning",
    addLabel: "Add Equipment Line",
    unitLabel: "Units",
    stickyColumnClass: "equipment-sticky",
    columns: [
      ["item", "Equipment"],
      ["unit", "Unit"],
      ["rate", "Rate"]
    ]
  },
  materials: {
    label: "Material Planning",
    addLabel: "Add Material Line",
    unitLabel: "Units",
    stickyColumnClass: "material-sticky",
    columns: [
      ["item", "Material"],
      ["unit", "Unit"],
      ["rate", "Unit Cost"]
    ]
  },
  odc: {
    label: "ODC Planning",
    addLabel: "Add ODC Line",
    unitLabel: "Cost",
    stickyColumnClass: "odc-sticky",
    columns: [
      ["item", "ODC Item"]
    ]
  }
};

function mapBillingTypeToContractType(billingType) {
  const value = String(billingType || "").toUpperCase();
  if (value === "CPFF" || value === "COST_PLUS") return "COST_PLUS";
  if (value === "FFP" || value === "FP" || value === "FIXED_PRICE" || value === "FFP_LOE") return "FIXED_PRICE";
  return "TIME_AND_MATERIALS";
}

function normalizeForecastVersions(projectId, rows = []) {
  return (rows || []).map((item) => ({
    id: item.id,
    projectId,
    code: item.version_code || item.code || "Working",
    name: item.version_name || item.name || item.version_code || item.code || "Working Forecast",
    status: item.status || "Draft",
    actualsThrough: item.actuals_through_period || item.actualsThrough || ""
  }));
}

function labelForCategoryKey(key) {
  const map = {
    labor: "Labor",
    subcontractors: "Sub",
    equipment: "Equipment",
    materials: "Material",
    odc: "ODC"
  };
  return map[key] || key || "—";
}

function mergeAuthoritativeCategorySummary(project, backendRows = []) {
  return mergeAuthoritativeCategorySummaryRows(project, backendRows, {
    financeState,
    currentFinanceKey,
    selectedProjectId: state.selectedProjectId,
    labelForCategoryKey
  });
}

function mergeAuthoritativeFinancials(project, context, rawFinancials) {
  return mergeAuthoritativeFinancialRows(project, context, rawFinancials, {
    financeState,
    currentFinanceKey,
    selectedProjectId: state.selectedProjectId
  });
}

function buildDisplayKpis(project, context = currentProjectContext()) {
  return buildAuthoritativeDisplayKpis(project, context, {
    financeState,
    currentFinanceKey,
    selectedProjectId: state.selectedProjectId
  });
}

function resolvedComparisonBasis(context = currentProjectContext()) {
  const explicitBasis = context.forecastState?.comparisonBasis || context.backendFinance?.comparisonSummary || {};
  if (explicitBasis.type && explicitBasis.type !== "none") return explicitBasis;
  if (context.baselineSnapshot) {
    return {
      type: "baseline_snapshot",
      label: context.baselineSnapshot.label || "Baseline reference",
      snapshotId: context.baselineSnapshot.id || null
    };
  }
  return explicitBasis;
}

function comparisonBasisLabel(context = currentProjectContext(), fallback = "No baseline or prior approved reference") {
  const basis = resolvedComparisonBasis(context);
  if (basis.type === "baseline_snapshot" && basis.label) {
    return `Baseline ${basis.label}`;
  }
  if (basis.type === "prior_approved_forecast" && basis.label) {
    return `Prior approved ${basis.label}`;
  }
  return fallback;
}

function comparisonBasisLabelForProject(project, fallback = "No baseline or prior approved reference") {
  const backendFinance = project?.backendFinanceModel || null;
  const backendBasis = backendFinance?.comparisonSummary;
  if (backendBasis?.comparisonBasisType === "baseline_snapshot" && backendBasis?.comparisonBasisLabel) {
    return `Baseline ${backendBasis.comparisonBasisLabel}`;
  }
  if (backendBasis?.comparisonBasisType === "prior_approved_forecast" && backendBasis?.comparisonBasisLabel) {
    return `Prior approved ${backendBasis.comparisonBasisLabel}`;
  }
  const localBaseline = (project?.snapshots || []).find((item) => item?.isBaseline);
  if (localBaseline?.label) {
    return `Baseline ${localBaseline.label}`;
  }
  return fallback;
}

function parseWorkflowHistoryNote(value) {
  const text = String(value || "").trim();
  if (!text) return { actor: "—", comment: "—" };
  const separatorIndex = text.indexOf(": ");
  if (separatorIndex <= 0) {
    return { actor: text, comment: "—" };
  }
  return {
    actor: text.slice(0, separatorIndex),
    comment: text.slice(separatorIndex + 2) || "—"
  };
}

function parseWorkflowTransitionValue(value) {
  const text = String(value || "").trim();
  if (!text) {
    return {
      before: "—",
      after: "—",
      changed: false
    };
  }
  const [before, after] = text.split("->").map((item) => String(item || "").trim());
  if (before && after) {
    return {
      before,
      after,
      changed: before !== after
    };
  }
  return {
    before: "—",
    after: text,
    changed: false
  };
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildFinanceReportPack(reportData = {}) {
  const summary = reportData.summary || {};
  const comparison = reportData.comparisonSummary || {};
  const reportSections = reportData.reportSections || {};
  const topDrivers = (comparison.topDrivers || []).map((item) => ({
    rank: item.rank,
    category: labelForCategoryKey(item.categoryKey) || item.categoryKey || "Unknown",
    variance: item.varianceToPriorForecast ?? 0,
    eac: item.eac ?? 0
  }));

  return {
    reportMeta: {
      generatedAt: reportData.generatedAt || new Date().toISOString(),
      projectId: reportData.projectId || null,
      projectName: reportData.project?.title || reportData.project?.name || null,
      projectCode: reportData.project?.project_code || reportData.project?.code || null,
      year: reportData.year || state.selectedYear,
      versionCode: reportSections.activeVersionCode || reportData.activeVersion?.version_code || null,
      versionStatus: reportSections.activeVersionStatus || reportData.activeVersion?.status || null
    },
    reviewSummary: {
      comparisonBasis: reportSections.comparisonBasis?.label || "No baseline or prior approved reference",
      actualsThroughPeriod: reportSections.actualsThroughPeriod || null,
      closeThroughPeriod: reportSections.closeThroughPeriod || null,
      lockedMonths: reportSections.lockedMonths ?? 0,
      openMonths: reportSections.openMonths ?? 0
    },
    commercialPosition: {
      effectiveFundedValue: summary.effectiveFundedValue ?? 0,
      effectiveContractValue: summary.effectiveContractValue ?? 0,
      unfundedBacklog: summary.unfundedBacklog ?? 0,
      baseFundedValue: summary.baseFundedValue ?? 0,
      baseContractValue: summary.baseContractValue ?? 0,
      modificationValue: summary.modificationValue ?? 0
    },
    forecastEconomics: {
      actualCostToDate: summary.actualCostToDate ?? 0,
      etcCost: summary.etcCost ?? 0,
      eacCost: summary.eacCost ?? 0,
      cumulativeRevenueToDate: summary.cumulativeRevenueToDate ?? 0,
      currentPeriodCatchUpRevenue: summary.currentPeriodCatchUpRevenue ?? 0,
      eacMargin: summary.eacMargin ?? 0,
      marginPct: summary.marginPct ?? 0
    },
    varianceSummary: {
      costVarianceVsBaseline: comparison.costVarianceVsBaseline ?? 0,
      revenueImpactVsBaseline: comparison.revenueImpactVsBaseline ?? 0,
      marginVarianceVsBaseline: comparison.marginVarianceVsBaseline ?? 0,
      topDrivers
    },
    explanations: {
      revenue: reportData.revenueExplanation?.explanation_text || "",
      variance: reportData.varianceExplanation?.explanation_text || ""
    },
    workflowHistory: reportData.workflowHistory || [],
    categorySummary: reportData.categorySummary || [],
    monthlyRows: reportData.monthlyRows || []
  };
}

function isFixedPriceContract(project) {
  const contractType = String(project?.contractType || "").toUpperCase();
  const billingType = String(project?.billing_type || "").toUpperCase();
  return contractType === "FIXED_PRICE"
    || billingType === "FP"
    || billingType === "FFP"
    || billingType === "FIXED_PRICE"
    || billingType === "FFP_LOE";
}

function mapGovconProjectToAppProject(project, existingProject, bundle = null) {
  const base = existingProject || createEmptyProjectState(project.id);
  const setupNotes = parseSetupNotes(bundle?.setup?.notes);
  const commercial = resolveCommercialTerms({
    liveProject: project,
    contract: bundle?.contract || {},
    notes: setupNotes,
    project: base
  });
  return {
    ...base,
    id: project.id,
    name: project.title || project.code || base.name,
    client: bundle?.contract?.customer || base.client,
    manager: project.pm_name || base.manager,
    contractType: mapBillingTypeToContractType(project.billing_type),
    contractValue: commercial.effectiveContractValue,
    fundedValue: commercial.effectiveFundedValue,
    sourceContractValue: commercial.sourceContractValue,
    sourceFundedValue: commercial.sourceFundedValue,
    commercialModificationValue: commercial.modificationValue,
    effectiveContractValue: commercial.effectiveContractValue,
    effectiveFundedValue: commercial.effectiveFundedValue,
    funding: commercial.effectiveFundedValue || commercial.effectiveContractValue,
    startDate: project.start_date || base.startDate,
    endDate: project.end_date || base.endDate,
    version: base.version,
    lastSyncAt: bundle?.qboMapping?.last_sync_at || base.lastSyncAt,
    syncStatus: bundle?.qboMapping?.sync_status || base.syncStatus,
    forecastVersions: bundle?.forecastVersions
      ? normalizeForecastVersions(project.id, bundle.forecastVersions)
      : (base.forecastVersions || []),
    budget: {
      ...base.budget,
      cost: Number(project.budget || base.budget?.cost || 0),
      revenue: Number(commercial.effectiveContractValue || base.budget?.revenue || 0)
    }
  };
}

function projectOptions() {
  const rows = setupState.projects.length
    ? setupState.projects.map((item) => ({ id: item.id, name: item.title || item.code || "Untitled Project" }))
    : state.projects.map((item) => ({ id: item.id, name: item.name }));

  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function getProject() {
  return state.projects.find((project) => project.id === state.selectedProjectId) || state.projects[0];
}

function parseSetupNotes(notes) {
  if (!notes) return {};
  if (typeof notes === "object") return notes;
  try {
    return JSON.parse(notes);
  } catch {
    return {};
  }
}

function resolveCommercialTerms({ liveProject = {}, contract = {}, notes = {}, project = {} } = {}) {
  const modificationValue = Number(notes.commercialModificationValue ?? project.commercialModificationValue ?? 0);
  const sourceContractValue = Number(contract.ceiling ?? project.sourceContractValue ?? project.contractValue ?? 0);
  const sourceFundedValue = Number(liveProject.funded ?? contract.funded ?? project.sourceFundedValue ?? project.fundedValue ?? project.funding ?? 0);
  const effectiveContractValue = Math.max(0, sourceContractValue + modificationValue);
  const effectiveFundedValue = Math.max(0, sourceFundedValue + modificationValue);

  return {
    sourceContractValue,
    sourceFundedValue,
    modificationValue,
    effectiveContractValue,
    effectiveFundedValue
  };
}

function formatOverviewDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatDateRange(start, end) {
  if (!start && !end) return "—";
  return `${formatOverviewDate(start)} to ${formatOverviewDate(end)}`;
}

function getForecastVersions(projectId = state.selectedProjectId) {
  if (setupState.projects.length) {
    const liveVersions = setupState.selectedProjectId === projectId ? (setupState.bundle?.forecastVersions || []) : [];
    if (liveVersions.length) {
      return normalizeForecastVersions(projectId, liveVersions);
    }
  }
  const project = state.projects.find((item) => item.id === projectId);
  if (project?.forecastVersions?.length) {
    return project.forecastVersions;
  }
  return (state.masterData?.forecastVersions || []).filter((item) => item.projectId === projectId);
}

function getCurrentForecastVersion(projectId = state.selectedProjectId) {
  return getForecastVersions(projectId).find((item) => item.id === state.selectedForecastVersionId)
    || getForecastVersions(projectId)[0];
}

function currentSetupBundle() {
  return setupState.bundle?.data || setupState.bundle || {};
}

function currentProjectContext() {
  const project = getProject() || createEmptyProjectState("proj-fallback");
  const backendFinance = project.backendFinanceModel || null;
  const forecastState = backendFinance?.forecastState || null;
  const version = forecastState?.selectedVersion || getCurrentForecastVersion(project.id) || { id: "", code: "Working", name: "Working Forecast", status: "Draft", actualsThrough: "" };
  const bundle = currentSetupBundle();
  const liveProject = bundle.project || {};
  const setup = bundle.setup || {};
  const contract = bundle.contract || {};
  const mapping = bundle.qboMapping || {};
  const notes = parseSetupNotes(setup.notes);
  const commercial = resolveCommercialTerms({
    liveProject,
    contract,
    notes,
    project
  });
  const baselineSnapshot = (project.snapshots || []).find((item) => item.id === project.baselineSnapshotId)
    || (project.snapshots || []).find((item) => item.isBaseline)
    || null;
  const setupChecks = [
    commercial.effectiveFundedValue > 0,
    commercial.effectiveContractValue > 0,
    Boolean(setup.setup_status && setup.setup_status !== "Not seeded"),
    Boolean(mapping.qbo_customer_id || mapping.qbo_project_id),
    Boolean(version?.id),
    Boolean(baselineSnapshot)
  ];
  const readiness = Math.round((setupChecks.filter(Boolean).length / setupChecks.length) * 100);

  return {
    project,
    backendFinance,
    forecastState,
    version,
    bundle,
    liveProject,
    setup,
    contract,
    mapping,
    notes,
    baselineSnapshot,
    fundedValue: commercial.effectiveFundedValue,
    contractValue: commercial.effectiveContractValue,
    sourceFundedValue: commercial.sourceFundedValue,
    sourceContractValue: commercial.sourceContractValue,
    modificationValue: commercial.modificationValue,
    effectiveFundedValue: commercial.effectiveFundedValue,
    effectiveContractValue: commercial.effectiveContractValue,
    readiness,
    actualsThrough: backendFinance?.summary?.actualsThroughPeriod || version?.actualsThrough || "—"
  };
}

function authConfigured() {
  return Boolean(authState.config?.enabled && authState.config?.supabaseUrl && authState.config?.supabaseAnonKey);
}

function signedInUser() {
  return authState.user || null;
}

function signedInUserEmail() {
  return String(signedInUser()?.email || "").trim().toLowerCase();
}

function signedInUserName() {
  const user = signedInUser();
  if (!user) return "Guest";
  return user.name || user.email || "Signed-in user";
}

function signedInProviderLabel() {
  const provider = String(signedInUser()?.provider || "").toLowerCase();
  if (!provider) return "signed in";
  if (provider === "google") return "Google";
  if (provider === "email") return "Email";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function authOwnerEmail() {
  return String(authState.config?.ownerEmail || "").trim().toLowerCase();
}

function isOwnerSignedIn() {
  return Boolean(signedInUserEmail() && authOwnerEmail() && signedInUserEmail() === authOwnerEmail());
}

function sessionLogKey(session) {
  const accessToken = String(session?.access_token || "");
  if (!accessToken) return "";
  return `auth-log:${accessToken.slice(-16)}`;
}

async function fetchSignInEvents() {
  if (!isOwnerSignedIn()) {
    authState = {
      ...authState,
      signInEvents: []
    };
    return;
  }

  try {
    const result = await fetchJson("/auth/signin-events", {}, QBO_API_BASES);
    authState = {
      ...authState,
      signInEvents: result?.data?.events || []
    };
    renderApp();
  } catch (error) {
    authState = {
      ...authState,
      error: error.message || "Sign-in activity could not be loaded."
    };
    renderApp();
  }
}

async function logCurrentSignIn(session, event = "SIGNED_IN") {
  const user = session?.user || null;
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return;
  const key = sessionLogKey(session);
  if (!key) return;
  if (globalThis.sessionStorage?.getItem(key)) return;

  const provider = user?.app_metadata?.provider || user?.identities?.[0]?.provider || "email";
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || email;
  try {
    await fetchJson("/auth/signin-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        name,
        provider,
        eventType: event,
        signedInAt: new Date().toISOString()
      })
    }, QBO_API_BASES);
    globalThis.sessionStorage?.setItem(key, "1");
  } catch (error) {
    authState = {
      ...authState,
      error: error.message || "Sign-in activity could not be saved."
    };
  }
}

async function handleAuthSessionChange({ event, session, user }) {
  authState = {
    ...authState,
    user: user || null,
    error: null,
    info: user
      ? ""
      : authConfigured()
        ? "You are signed out."
        : authState.info
  };

  if (session && user && event !== "SIGNED_OUT") {
    await logCurrentSignIn(session, event);
    if (String(event || "").toUpperCase() === "SIGNED_IN") {
      authState = {
        ...authState,
        info: `Signed in as ${user.email || user.name || "user"}.`
      };
    }
  }

  if (isOwnerSignedIn()) {
    await fetchSignInEvents();
  } else {
    authState = {
      ...authState,
      signInEvents: []
    };
  }

  renderApp();
}

async function initializeAuthUi(force = false) {
  if (authState.status === "loading") return;
  if (authState.status === "ready" && !force) return;

  try {
    authState = {
      ...authState,
      status: "loading",
      error: null
    };
    const bootstrap = await initializeAuth(QBO_API_BASES);
    if (!authState.subscriptionCleanup && bootstrap.client) {
      authState.subscriptionCleanup = onAuthStateChange((payload) => {
        void handleAuthSessionChange(payload);
      });
    }
    authState = {
      ...authState,
      status: "ready",
      config: bootstrap.config || null,
      user: bootstrap.user || null,
      info: bootstrap.config?.enabled
        ? ""
        : "Authentication is not configured yet. Add SUPABASE_ANON_KEY and AUTH_OWNER_EMAIL in the backend env to enable sign-in."
    };
    await handleAuthSessionChange({
      event: "INITIAL_SESSION",
      session: bootstrap.session,
      user: bootstrap.user
    });
  } catch (error) {
    authState = {
      ...authState,
      status: "error",
      error: error.message || "Authentication could not be initialized."
    };
    renderApp();
  }
}

function askAiSuggestions(context = currentProjectContext()) {
  return [
    "Why is revenue zero?",
    "Why did EAC move?",
    "Which category is driving variance?",
    "What setup is missing?"
  ];
}

function explainWithAssistant(question, context = currentProjectContext()) {
  const prompt = String(question || "").trim().toLowerCase();
  if (!prompt) {
    return "Ask about revenue, EAC movement, variance drivers, setup gaps, or what to do next and I’ll summarize the current project in plain English.";
  }

  const project = context.project;
  const financials = mergeAuthoritativeFinancials(project, context, financialComparisonMetrics(project, state.selectedYear));
  const categorySummary = mergeAuthoritativeCategorySummary(project, context.backendFinance?.categorySummary || []);
  const reviewSignals = project.reviewSignals || {};
  const biggestVariance = [...categorySummary].sort((a, b) => Math.abs(b.varianceToPrior) - Math.abs(a.varianceToPrior))[0];
  const missingItems = [];
  if (context.fundedValue <= 0) missingItems.push("funded value");
  if (context.contractValue <= 0) missingItems.push("contract value");
  if (!context.mapping?.qbo_customer_id && !context.mapping?.qbo_project_id) missingItems.push("QBO mapping");
  if (!context.baselineSnapshot) missingItems.push("baseline snapshot");

  if (prompt.includes("revenue") && (prompt.includes("zero") || prompt.includes("why"))) {
    if (context.fundedValue <= 0 && context.contractValue <= 0) {
      return `Revenue is zero because the project has no effective funded value or contract value yet. The engine is cost-to-cost, so it needs a commercial ceiling before it can recognize revenue. Set Contract Value, Funded Value, or Modification Value in Admin > Live Project Setup.`;
    }
    return `Revenue is being derived from cost progress against the effective funded value. The project currently has effective funded value of ${formatCompactCurrency(context.fundedValue)} and effective contract value of ${formatCompactCurrency(context.contractValue)}.`;
  }

  if ((prompt.includes("eac") && prompt.includes("move")) || prompt.includes("why did eac")) {
    if (!biggestVariance) {
      return "EAC movement is not material right now. There is no single category showing a strong variance signal versus the prior plan.";
    }
    return `EAC is moving mostly because of ${biggestVariance.label}. Its variance versus prior is ${formatCompactCurrency(biggestVariance.varianceToPrior)}. Current cost variance versus baseline is ${formatCompactCurrency(financials.costVariance)} and margin variance is ${formatCompactCurrency(financials.marginVariance)}.`;
  }

  if (prompt.includes("category") || prompt.includes("variance") || prompt.includes("driver")) {
    if (!biggestVariance) {
      return "There is no dominant variance driver right now.";
    }
    return `${biggestVariance.label} is the strongest variance driver. Current EAC for that category is ${formatCompactCurrency(biggestVariance.eac)} against plan of ${formatCompactCurrency(biggestVariance.budget)}.`;
  }

  if (prompt.includes("missing") || prompt.includes("setup")) {
    if (!missingItems.length) {
      return "Core setup looks complete enough to run the current prototype. The next strongest control step would be creating or refreshing the baseline snapshot.";
    }
    return `The main setup gaps are: ${missingItems.join(", ")}. Those are the biggest blockers to getting cleaner revenue recognition and review workflows.`;
  }

  if (prompt.includes("next") || prompt.includes("what should")) {
    if (context.fundedValue <= 0 && context.contractValue <= 0) {
      return "The next best step is to set the commercial values so revenue can calculate: contract value, funded value, and any modification value. After that, review the Financials page and create a baseline snapshot.";
    }
    if (!context.baselineSnapshot) {
      return "The next best step is to create a baseline snapshot so you can compare current forecast movement against a fixed reference point.";
    }
    return "The next best step is to review Financials for variance drivers and then use Plan to adjust the categories that are moving EAC.";
  }

  return `Current project status: effective funded value ${formatCompactCurrency(context.fundedValue)}, effective contract value ${formatCompactCurrency(context.contractValue)}, setup readiness ${context.readiness}%, and forecast status ${context.version?.status || "Working"}. The biggest variance driver is ${biggestVariance?.label || "not material right now"}.`;
}

function employeeOptions() {
  const seededEmployees = state.masterData?.employees || [];
  const qboEmployees = setupState.bootstrapEmployees.map((item) => ({
      id: item.id,
      name: item.displayName,
      organizationId: "",
      departmentId: "",
      laborCategoryId: "",
      rate: 0
    }));
  const merged = [...seededEmployees];
  qboEmployees.forEach((employee) => {
    if (!merged.some((item) => item.id === employee.id)) merged.push(employee);
  });
  return merged;
}

function vendorOptions() {
  if (setupState.bootstrapVendors.length) return setupState.bootstrapVendors;
  const project = getProject();
  return (project?.planning?.subcontractors || [])
    .map((line, index) => ({ id: `seed-vendor-${index}`, displayName: line.vendor || "Unassigned Vendor" }))
    .filter((item, index, list) => item.displayName && list.findIndex((other) => other.displayName === item.displayName) === index);
}

function materialOptions() {
  if (setupState.bootstrapItems.length) return setupState.bootstrapItems;
  const project = getProject();
  return (project?.planning?.materials || [])
    .map((line, index) => ({ id: `seed-material-${index}`, name: line.item || "Unassigned Material", unitPrice: Number(line.rate || 0) }))
    .filter((item, index, list) => item.name && list.findIndex((other) => other.name === item.name) === index);
}

function equipmentOptions() {
  if (setupState.equipmentCatalog.length) return setupState.equipmentCatalog;
  const project = getProject();
  return (project?.planning?.equipment || [])
    .map((line, index) => ({ id: `seed-eq-${index}`, equipment_name: line.item || "Unassigned Equipment", default_unit: line.unit || "ea", default_rate: Number(line.rate || 0) }))
    .filter((item, index, list) => item.equipment_name && list.findIndex((other) => other.equipment_name === item.equipment_name) === index);
}

function odcOptions() {
  if (setupState.odcCatalog.length) return setupState.odcCatalog;
  const project = getProject();
  return (project?.planning?.odc || [])
    .map((line, index) => ({ id: `seed-odc-${index}`, odc_name: line.item || "Unassigned ODC" }))
    .filter((item, index, list) => item.odc_name && list.findIndex((other) => other.odc_name === item.odc_name) === index);
}

function employeeById(employeeId) {
  return employeeOptions().find((item) => item.id === employeeId);
}

function laborCategoryById(id) {
  return (state.masterData?.laborCategories || []).find((item) => item.id === id);
}

function organizationById(id) {
  return (state.masterData?.organizations || []).find((item) => item.id === id);
}

function departmentById(id) {
  return (state.masterData?.departments || []).find((item) => item.id === id);
}

function hydrateLaborLine(line) {
  const employee = employeeById(line.employeeId) || {};
  const laborCategory = laborCategoryById(line.laborCategoryId) || {};
  const organization = organizationById(line.organizationId || employee.organizationId) || {};
  const department = departmentById(line.departmentId || employee.departmentId) || {};

  return {
    ...line,
    employeeName: employee.name || "Unassigned",
    laborCategoryName: laborCategory.name || "Unassigned",
    organizationName: organization.name || "Unassigned",
    departmentName: department.name || "Unassigned"
  };
}

function updateState(mutator) {
  mutator(state);
  syncAllProjectsFinancials(state);
  saveState(state);
  scheduleFinancePersistence();
  renderApp();
}

function currentFinanceKey(projectId = state.selectedProjectId, year = state.selectedYear, forecastVersionId = state.selectedForecastVersionId) {
  return [projectId || "", year || "", forecastVersionId || "default"].join(":");
}

function serializeCurrentProjectFinance(project = getProject()) {
  return serializeProjectFinancePayload(project, {
    selectedYear: state.selectedYear,
    selectedForecastVersionId: state.selectedForecastVersionId
  });
}

function applyPersistedFinanceModel(projectId, financeBundle) {
  return applyPersistedFinanceModelToState(state, projectId, financeBundle, state.selectedYear);
}

async function loadProjectFinanceData(projectId = state.selectedProjectId, force = false) {
  if (!projectId) return;
  const key = currentFinanceKey(projectId);
  if (!force && financeState.loadedKey === key) return;

  try {
    financeState = {
      ...financeState,
      status: "loading",
      error: null
    };
    const result = await fetchProjectFinanceModel({
      projectId,
      year: state.selectedYear,
      forecastVersionId: state.selectedForecastVersionId || null
    }, QBO_API_BASES);
    const applied = applyPersistedFinanceModel(projectId, result?.data || {});
    if (applied) {
      saveState(state);
    }
    financeState = {
      ...financeState,
      status: "ready",
      loadedKey: key,
      error: null
    };
    renderApp();
  } catch (error) {
    financeState = {
      ...financeState,
      status: "error",
      error: error.message || "Finance model could not be loaded."
    };
  }
}

async function refreshAuthoritativeProjectFinance(projectId = state.selectedProjectId) {
  if (!projectId) return false;
  return refreshAuthoritativeProjectFinances([projectId]);
}

async function refreshAuthoritativeProjectFinances(projectIds = [], options = {}) {
  const ids = [...new Set((projectIds || []).filter(Boolean))];
  if (!ids.length) return false;

  let appliedAny = false;
  let selectedError = null;

  for (const projectId of ids) {
    try {
      const result = await fetchProjectFinanceModel({
        projectId,
        year: state.selectedYear,
        forecastVersionId: projectId === state.selectedProjectId
          ? (state.selectedForecastVersionId || null)
          : null
      }, QBO_API_BASES);

      appliedAny = applyPersistedFinanceModel(projectId, result?.data || {}) || appliedAny;
    } catch (error) {
      if (projectId === state.selectedProjectId && !selectedError) {
        selectedError = error;
      }
    }
  }

  if (appliedAny) {
    saveState(state);
  }

  if (options.render) {
    renderApp();
  }

  if (selectedError) {
    throw selectedError;
  }

  return appliedAny;
}

async function refreshSetupBundle(projectId = setupState.selectedProjectId) {
  if (!projectId) return null;
  const bundleResult = await fetchJson(`/setup/projects/${encodeURIComponent(projectId)}`);
  const bundle = bundleResult?.data || null;
  setupState = {
    ...setupState,
    bundle,
    selectedProjectId: projectId,
    status: "ready",
    error: null
  };

  const projectIndex = state.projects.findIndex((item) => item.id === projectId);
  if (projectIndex >= 0 && bundle?.project) {
    state.projects[projectIndex] = mapGovconProjectToAppProject(
      bundle.project,
      state.projects[projectIndex],
      bundle
    );
    saveState(state);
  }

  return bundle;
}

async function persistProjectFinanceNow(projectId = state.selectedProjectId) {
  const payload = serializeCurrentProjectFinance(
    (state.projects || []).find((item) => item.id === projectId)
  );
  if (!payload?.projectId) return;

  try {
    financeState = {
      ...financeState,
      savingKey: currentFinanceKey(projectId),
      error: null
    };
    await saveProjectFinanceModelRequest(payload, QBO_API_BASES);
    await refreshAuthoritativeProjectFinance(projectId);
    if (projectId === setupState.selectedProjectId) {
      await refreshSetupBundle(projectId);
    }
    financeState = {
      ...financeState,
      status: "ready",
      loadedKey: currentFinanceKey(projectId),
      savingKey: null,
      error: null
    };
    renderApp();
  } catch (error) {
    financeState = {
      ...financeState,
      status: "error",
      savingKey: null,
      error: error.message || "Finance model could not be saved."
    };
    renderApp();
  }
}

async function transitionForecastVersionFromAdmin(projectId, versionId, status) {
  if (!projectId || !versionId || !status) return;

  try {
    setupState = {
      ...setupState,
      status: "loading",
      error: null
    };
    renderApp();

    const workflowComment = document.querySelector("#projectWorkflowNotesForm textarea[name='workflowComment']")?.value || "";
    const result = await fetchJson(`/setup/projects/${encodeURIComponent(projectId)}/forecast-versions/${encodeURIComponent(versionId)}/transition`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status,
        actorName: "local-ui",
        comment: workflowComment
      })
    });

    setupState = {
      ...setupState,
      status: "ready",
      error: null,
      selectedProjectId: projectId,
      bundle: result?.data || null
    };

    const projectIndex = state.projects.findIndex((item) => item.id === projectId);
    if (projectIndex >= 0 && setupState.bundle?.project) {
      state.projects[projectIndex] = mapGovconProjectToAppProject(
        setupState.bundle.project,
        state.projects[projectIndex],
        setupState.bundle
      );
      saveState(state);
    }

    await loadProjectFinanceData(projectId, true);
    renderApp();
  } catch (error) {
    setupState = {
      ...setupState,
      status: "error",
      error: error.message || "Forecast version transition failed."
    };
    renderApp();
  }
}

async function updateCloseControlFromAdmin(projectId, action = "set") {
  if (!projectId) return;

  try {
    setupState = {
      ...setupState,
      status: "loading",
      error: null
    };
    renderApp();

    const notesForm = document.getElementById("projectWorkflowNotesForm");
    const workflowComment = notesForm?.querySelector("textarea[name='workflowComment']")?.value || "";
    const closeThroughPeriod = notesForm?.querySelector("input[name='closeThroughPeriod']")?.value || null;
    const result = await fetchJson(`/setup/projects/${encodeURIComponent(projectId)}/close-control`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        closeThroughPeriod: action === "reopen" ? null : closeThroughPeriod,
        actorName: "local-ui",
        comment: workflowComment
      })
    });

    setupState = {
      ...setupState,
      status: "ready",
      error: null,
      selectedProjectId: projectId,
      bundle: result?.data || null
    };

    const projectIndex = state.projects.findIndex((item) => item.id === projectId);
    if (projectIndex >= 0 && setupState.bundle?.project) {
      state.projects[projectIndex] = mapGovconProjectToAppProject(
        setupState.bundle.project,
        state.projects[projectIndex],
        setupState.bundle
      );
      saveState(state);
    }

    await loadProjectFinanceData(projectId, true);
    renderApp();
  } catch (error) {
    setupState = {
      ...setupState,
      status: "error",
      error: error.message || "Close control update failed."
    };
    renderApp();
  }
}

async function saveWorkflowNotesFromForm(form) {
  const projectId = form?.projectId?.value || setupState.selectedProjectId;
  if (!projectId) return;

  try {
    setupState = {
      ...setupState,
      status: "loading",
      error: null
    };
    renderApp();

    const result = await fetchJson(`/setup/projects/${encodeURIComponent(projectId)}/workflow-notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        revenueExplanation: form.revenueExplanation?.value || "",
        varianceExplanation: form.varianceExplanation?.value || "",
        workflowComment: form.workflowComment?.value || "",
        closeThroughPeriod: form.closeThroughPeriod?.value || null,
        actorName: "local-ui"
      })
    });

    setupState = {
      ...setupState,
      status: "ready",
      error: null,
      selectedProjectId: projectId,
      bundle: result?.data || null
    };

    const projectIndex = state.projects.findIndex((item) => item.id === projectId);
    if (projectIndex >= 0 && setupState.bundle?.project) {
      state.projects[projectIndex] = mapGovconProjectToAppProject(
        setupState.bundle.project,
        state.projects[projectIndex],
        setupState.bundle
      );
      saveState(state);
    }

    await loadProjectFinanceData(projectId, true);
    renderApp();
  } catch (error) {
    setupState = {
      ...setupState,
      status: "error",
      error: error.message || "Workflow notes could not be saved."
    };
    renderApp();
  }
}

async function exportProjectFinanceReport(projectId = state.selectedProjectId) {
  if (!projectId) return;
  const context = currentProjectContext();
  try {
    const result = await fetchProjectFinanceReport({
      projectId,
      year: state.selectedYear,
      forecastVersionId: context.version?.id || null
    }, QBO_API_BASES);
    const projectName = (context.project?.name || "project").replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").toLowerCase();
    downloadJsonFile(
      `${projectName || "project"}-finance-report-${state.selectedYear}.json`,
      buildFinanceReportPack(result?.data || result)
    );
  } catch (error) {
    financeState = {
      ...financeState,
      status: "error",
      error: error.message || "Finance report export failed."
    };
    renderApp();
  }
}

function scheduleFinancePersistence(projectId = state.selectedProjectId) {
  if (financeState.saveTimer) {
    clearTimeout(financeState.saveTimer);
  }
  financeState.saveTimer = setTimeout(() => {
    financeState.saveTimer = null;
    void persistProjectFinanceNow(projectId);
  }, 500);
}

function flushFinancePersistence(projectId = state.selectedProjectId) {
  if (financeState.saveTimer) {
    clearTimeout(financeState.saveTimer);
    financeState.saveTimer = null;
  }
  void persistProjectFinanceNow(projectId);
}

function getModuleTabs() {
  return MODULE_TABS[state.ui.activeModule] || NAV_ITEMS;
}

function ensureSeededResourceModel(targetState = state) {
  const projects = targetState.projects || [];
  if (!projects.length) return;

  const seededLaborCategories = [
    { id: "lc-pm", name: "Project Manager" },
    { id: "lc-pc", name: "Project Controls Analyst" },
    { id: "lc-scheduler", name: "Scheduler" },
    { id: "lc-controls-eng", name: "Controls Engineer" },
    { id: "lc-field-eng", name: "Field Engineer" },
    { id: "lc-tech", name: "Field Technician" },
    { id: "lc-procurement", name: "Procurement Specialist" },
    { id: "lc-cost", name: "Cost Analyst" }
  ];

  const existingDepartments = new Map((targetState.masterData?.departments || []).map((item) => [item.id, item]));
  [
    { id: "dept-scheduling", organizationId: "org-central", name: "Scheduling" },
    { id: "dept-procurement", organizationId: "org-east", name: "Procurement" }
  ].forEach((item) => existingDepartments.set(item.id, item));

  targetState.masterData.laborCategories = seededLaborCategories;
  targetState.masterData.departments = [...existingDepartments.values()];

  const employeeCount = projects.length === 1 ? 8 : projects.length * 3;
  const employeeBlueprints = [
    ["Avery Collins", "org-east", "dept-pm", "lc-pm", 152],
    ["Noah Bennett", "org-central", "dept-controls", "lc-pc", 128],
    ["Sofia Ramirez", "org-central", "dept-scheduling", "lc-scheduler", 122],
    ["Liam Carter", "org-east", "dept-eng", "lc-controls-eng", 134],
    ["Maya Patel", "org-east", "dept-eng", "lc-controls-eng", 132],
    ["Ethan Brooks", "org-east", "dept-field", "lc-field-eng", 116],
    ["Chloe Nguyen", "org-east", "dept-field", "lc-tech", 92],
    ["Lucas Foster", "org-east", "dept-procurement", "lc-procurement", 108],
    ["Isla Morgan", "org-central", "dept-controls", "lc-cost", 126],
    ["Benjamin Reed", "org-east", "dept-eng", "lc-controls-eng", 130],
    ["Grace Kim", "org-east", "dept-pm", "lc-pm", 148],
    ["Nathan Scott", "org-east", "dept-field", "lc-tech", 94],
    ["Zoe Turner", "org-central", "dept-scheduling", "lc-scheduler", 120],
    ["Julian Price", "org-central", "dept-controls", "lc-pc", 124],
    ["Ella Hughes", "org-east", "dept-procurement", "lc-procurement", 110],
    ["Ryan Cooper", "org-east", "dept-eng", "lc-field-eng", 114]
  ];

  const employees = Array.from({ length: employeeCount }, (_, index) => {
    const [name, organizationId, departmentId, laborCategoryId, rate] = employeeBlueprints[index % employeeBlueprints.length];
    return {
      id: `seed-emp-${index + 1}`,
      name,
      organizationId,
      departmentId,
      laborCategoryId,
      rate
    };
  });

  targetState.masterData.employees = employees;
  targetState.resourceManagement = targetState.resourceManagement || {
    plannedHires: [],
    plannedExits: [],
    openPositions: []
  };

  if (!targetState.resourceManagement.plannedHires.length) {
    targetState.resourceManagement.plannedHires = [
      {
        id: "hire-1",
        name: "Open Controls Engineer",
        laborCategoryId: "lc-controls-eng",
        organizationId: "org-east",
        departmentId: "dept-eng",
        startDate: `${targetState.selectedYear}-04-01`,
        monthlyCost: 22600,
        status: "Approved",
        targetProjectId: projects[0]?.id || null
      },
      {
        id: "hire-2",
        name: "Scheduler II",
        laborCategoryId: "lc-scheduler",
        organizationId: "org-central",
        departmentId: "dept-scheduling",
        startDate: `${targetState.selectedYear}-06-01`,
        monthlyCost: 19800,
        status: "Recruiting",
        targetProjectId: projects[1]?.id || projects[0]?.id || null
      },
      {
        id: "hire-3",
        name: "Field Technician Backfill",
        laborCategoryId: "lc-tech",
        organizationId: "org-east",
        departmentId: "dept-field",
        startDate: `${targetState.selectedYear}-08-01`,
        monthlyCost: 14800,
        status: "Planned",
        targetProjectId: projects[0]?.id || null
      }
    ];
  }

  if (!targetState.resourceManagement.plannedExits.length) {
    targetState.resourceManagement.plannedExits = [
      {
        id: "exit-1",
        employeeId: employees[6]?.id || employees[0]?.id,
        month: 7,
        endDate: `${targetState.selectedYear}-07-31`,
        type: "Attrition",
        backfill: true,
        status: "Planned"
      },
      {
        id: "exit-2",
        employeeId: employees[1]?.id || employees[0]?.id,
        month: 10,
        endDate: `${targetState.selectedYear}-10-31`,
        type: "Transfer",
        backfill: false,
        status: "Forecast"
      }
    ];
  }

  if (!targetState.resourceManagement.openPositions.length) {
    targetState.resourceManagement.openPositions = [
      {
        id: "req-1",
        laborCategoryId: "lc-controls-eng",
        organizationId: "org-east",
        departmentId: "dept-eng",
        openMonth: 4,
        status: "Open",
        targetProjectId: projects[0]?.id || null
      },
      {
        id: "req-2",
        laborCategoryId: "lc-cost",
        organizationId: "org-central",
        departmentId: "dept-controls",
        openMonth: 9,
        status: "Pending Approval",
        targetProjectId: null
      }
    ];
  }

  const roleTemplates = [
    { laborCategoryId: "lc-pm", monthlyHours: 54 },
    { laborCategoryId: "lc-pc", monthlyHours: 58 },
    { laborCategoryId: "lc-scheduler", monthlyHours: 52 },
    { laborCategoryId: "lc-controls-eng", monthlyHours: 74 },
    { laborCategoryId: "lc-field-eng", monthlyHours: 68 },
    { laborCategoryId: "lc-tech", monthlyHours: 72 }
  ];

  const assignmentsPerProject = 6;
  const projectStaffing = projects.map((project, projectIndex) => ({
    project,
    projectIndex,
    employees: Array.from({ length: assignmentsPerProject }, (_, offset) => {
      const employeeIndex = (projectIndex * 3 + offset) % employees.length;
      return employees[employeeIndex];
    })
  }));
  const employeeProjectCount = new Map();

  projectStaffing.forEach(({ employees: projectEmployees }) => {
    projectEmployees.forEach((employee) => {
      employeeProjectCount.set(employee.id, (employeeProjectCount.get(employee.id) || 0) + 1);
    });
  });

  projectStaffing.forEach(({ project, projectIndex, employees: projectEmployees }) => {
    project.planning = project.planning || {
      labor: [],
      subcontractors: [],
      equipment: [],
      materials: [],
      odc: []
    };

    project.planning.labor = projectEmployees.map((employee, assignmentIndex) => {
      const template = roleTemplates[assignmentIndex % roleTemplates.length];
      const department = departmentById(employee.departmentId) || { name: "Department" };
      const organization = organizationById(employee.organizationId) || { name: "Organization" };
      const category = seededLaborCategories.find((item) => item.id === template.laborCategoryId)
        || seededLaborCategories.find((item) => item.id === employee.laborCategoryId)
        || seededLaborCategories[0];
      const projectCount = employeeProjectCount.get(employee.id) || 1;
      const baseHours = Math.round(template.monthlyHours / projectCount) + (projectIndex % 2) * 2 + (assignmentIndex % 3);
      return {
        id: `${project.id}-labor-${assignmentIndex + 1}`,
        employeeId: employee.id,
        laborCategoryId: employee.laborCategoryId || category.id,
        organizationId: organization.id || employee.organizationId,
        departmentId: department.id || employee.departmentId,
        rate: employee.rate,
        monthly: Array.from({ length: 12 }, (_, monthIndex) => {
          const seasonalShift = monthIndex % 4 === 0 ? -4 : monthIndex % 4 === 2 ? 4 : 0;
          return Math.max(28, Math.round(baseHours + seasonalShift));
        })
      };
    });
  });
}

function ensureBudgetingState(targetState = state) {
  targetState.budgeting = targetState.budgeting || {
    adjustments: [],
    opportunities: [],
    whitespace: []
  };
  targetState.budgeting.adjustments = Array.isArray(targetState.budgeting.adjustments) ? targetState.budgeting.adjustments : [];
  targetState.budgeting.opportunities = Array.isArray(targetState.budgeting.opportunities) ? targetState.budgeting.opportunities : [];
  targetState.budgeting.whitespace = Array.isArray(targetState.budgeting.whitespace) ? targetState.budgeting.whitespace : [];

  if (!targetState.budgeting.adjustments.length) {
    targetState.budgeting.adjustments = [
      {
        id: "adj-indirect-gna",
        type: "indirect",
        category: "G&A",
        description: "Corporate admin support",
        projectId: "",
        startPeriod: `${targetState.selectedYear}-01`,
        endPeriod: `${targetState.selectedYear}-12`,
        spreadMethod: "even",
        amount: 42000,
        direction: 1
      },
      {
        id: "adj-indirect-software",
        type: "indirect",
        category: "Software",
        description: "Planning and PM software",
        projectId: "",
        startPeriod: `${targetState.selectedYear}-01`,
        endPeriod: `${targetState.selectedYear}-12`,
        spreadMethod: "even",
        amount: 12000,
        direction: 1
      },
      {
        id: "adj-revenue-mod",
        type: "revenue",
        category: "Contract Mod",
        description: "Expected funded scope increase",
        projectId: targetState.projects?.[0]?.id || "",
        startPeriod: `${targetState.selectedYear}-07`,
        endPeriod: `${targetState.selectedYear}-07`,
        spreadMethod: "single",
        amount: 185000,
        direction: 1
      }
    ];
  }

  const generatedRevenueSources = buildSeededBudgetRevenueSources(targetState);
  const manualOpportunities = (targetState.budgeting.opportunities || []).filter((item) => !String(item.id || "").startsWith("seed-pipeline-"));
  const manualWhitespace = (targetState.budgeting.whitespace || []).filter((item) => !String(item.id || "").startsWith("seed-whitespace-"));

  targetState.budgeting.opportunities = [
    ...generatedRevenueSources.opportunities,
    ...manualOpportunities
  ];
  targetState.budgeting.whitespace = [
    ...generatedRevenueSources.whitespace,
    ...manualWhitespace
  ];
}

function buildSeededBudgetRevenueSources(targetState = state) {
  const year = Number(targetState.selectedYear || state.selectedYear);
  const projects = (targetState.projects || []).slice().sort((left, right) =>
    String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" })
  );
  const projectTemplates = projects.length ? projects : [{ id: "", name: "Strategic Growth", client: "Priority Accounts" }];
  const owners = ["Priya Singh", "Jamie Carter", "Marcus Hill", "Olivia Chen", "Daniel Brooks", "Elena Vasquez"];
  const pipelineStages = ["Identification", "Qualification", "Pursuit", "Proposal", "Best Case", "Commit"];
  const monthNames = targetState.meta?.months || state.meta?.months || ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pipelineNameSuffixes = ["Expansion", "Phase II", "Service Modernization", "Controls Refresh", "Energy Retrofit", "Lifecycle Upgrade"];
  const whitespaceNameSuffixes = ["Go-Get Program", "Whitespace Capture", "Strategic Pursuit", "Account Expansion", "Growth Push"];
  const targetTotalRevenueByMonth = [
    30.8, 31.1, 31.4, 31.8, 32.2, 32.6, 33.0, 33.3, 33.7, 34.1, 34.5, 34.8
  ].map((value) => value * 1_000_000);
  const pipelineCountsByMonth = [1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1];
  const whitespaceCountsByMonth = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2];

  const securedRevenueByMonth = Array.from({ length: 12 }, (_, monthIndex) =>
    (targetState.projects || []).reduce((total, project) => {
      const monthly = buildMonthlyMetrics(project, year);
      return total + Number(monthly?.[monthIndex]?.currentPeriodRevenue || 0);
    }, 0)
  );

  const manualRevenueByMonth = Array.from({ length: 12 }, (_, monthIndex) => {
    const manualItems = [
      ...((targetState.budgeting?.opportunities || []).filter((item) => !String(item.id || "").startsWith("seed-pipeline-"))),
      ...((targetState.budgeting?.whitespace || []).filter((item) => !String(item.id || "").startsWith("seed-whitespace-")))
    ];
    return manualItems.reduce((total, item) => {
      const probability = Math.max(0, Math.min(Number(item.probability || 0), 100)) / 100;
      const { year: startYear, month: startMonth } = parsePeriodValue(item.startPeriod, year, monthIndex + 1);
      const { year: endYear, month: endMonth } = parsePeriodValue(item.endPeriod || item.startPeriod, startYear, startMonth);
      const totalMonths = Math.max(((endYear - startYear) * 12) + (endMonth - startMonth) + 1, 1);
      const itemMonthYear = year;
      const itemMonth = monthIndex + 1;
      const isActive = (itemMonthYear > startYear || (itemMonthYear === startYear && itemMonth >= startMonth))
        && (itemMonthYear < endYear || (itemMonthYear === endYear && itemMonth <= endMonth));
      if (!isActive) return total;
      return total + ((Number(item.value || 0) * probability) / totalMonths);
    }, 0);
  });

  const opportunities = [];
  const whitespace = [];
  let pipelineIndex = 0;
  let whitespaceIndex = 0;

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const totalGap = Math.max(
      targetTotalRevenueByMonth[monthIndex] - securedRevenueByMonth[monthIndex] - manualRevenueByMonth[monthIndex],
      0
    );
    const pipelineCount = pipelineCountsByMonth[monthIndex];
    const whitespaceCount = whitespaceCountsByMonth[monthIndex];
    const totalCount = pipelineCount + whitespaceCount;
    if (!totalCount || totalGap <= 0) continue;

    const whitespaceShare = whitespaceCount ? Math.min(0.28 + (monthIndex >= 8 ? 0.04 : 0), 0.36) : 0;
    const pipelineWeightedTarget = totalGap * (1 - whitespaceShare);
    const whitespaceWeightedTarget = totalGap * whitespaceShare;
    const monthNumber = monthIndex + 1;

    for (let itemIndex = 0; itemIndex < pipelineCount; itemIndex += 1) {
      const project = projectTemplates[pipelineIndex % projectTemplates.length];
      const client = project.client || `${project.name} Client`;
      const probability = Math.min(52 + ((pipelineIndex + monthIndex) % 5) * 6, 82);
      const weightedRevenue = pipelineWeightedTarget * (pipelineCount === 1 ? 1 : (itemIndex === pipelineCount - 1 ? 0.48 : 0.52));
      const value = Math.round(weightedRevenue / (probability / 100));
      const stage = pipelineStages[(pipelineIndex + monthIndex) % pipelineStages.length];
      const marginRate = 19 + ((pipelineIndex + monthIndex) % 6);
      const owner = owners[pipelineIndex % owners.length];
      const suffix = pipelineNameSuffixes[pipelineIndex % pipelineNameSuffixes.length];
      opportunities.push({
        id: `seed-pipeline-${pipelineIndex + 1}`,
        sourceType: "pipeline",
        name: `${project.name} ${suffix} ${monthNames[monthIndex]} ${String(year).slice(2)}`,
        client,
        projectId: itemIndex % 2 === 0 ? project.id : "",
        owner,
        stage,
        probability,
        value,
        startPeriod: formatPeriodValue(year, monthNumber),
        endPeriod: formatPeriodValue(year, monthNumber),
        marginRate,
        note: `${stage} capture sized to keep the monthly forecast in the target revenue band for ${monthNames[monthIndex]} ${year}.`
      });
      pipelineIndex += 1;
    }

    for (let itemIndex = 0; itemIndex < whitespaceCount; itemIndex += 1) {
      const project = projectTemplates[whitespaceIndex % projectTemplates.length];
      const client = project.client || `${project.name} Client`;
      const probability = 22 + ((whitespaceIndex + monthIndex) % 4) * 4;
      const weightedRevenue = whitespaceWeightedTarget * (whitespaceCount === 1 ? 1 : (itemIndex === whitespaceCount - 1 ? 0.46 : 0.54));
      const value = Math.round(weightedRevenue / (probability / 100));
      const marginRate = 16 + ((whitespaceIndex + monthIndex) % 5);
      const owner = owners[(whitespaceIndex + 2) % owners.length];
      const suffix = whitespaceNameSuffixes[whitespaceIndex % whitespaceNameSuffixes.length];
      whitespace.push({
        id: `seed-whitespace-${whitespaceIndex + 1}`,
        sourceType: "whitespace",
        name: `${project.name} ${suffix} ${monthNames[monthIndex]} ${String(year).slice(2)}`,
        client,
        projectId: "",
        owner,
        stage: "White Space",
        probability,
        value,
        startPeriod: formatPeriodValue(year, monthNumber),
        endPeriod: formatPeriodValue(year, monthNumber),
        marginRate,
        note: `Strategic go-get revenue used to close the remaining coverage gap for ${monthNames[monthIndex]} ${year}.`
      });
      whitespaceIndex += 1;
    }
  }

  return { opportunities, whitespace };
}

function seedYearlyLine(monthsCurrentYear, monthsNextYear = null) {
  const nextYear = state.selectedYear + 1;
  return {
    [state.selectedYear]: monthsCurrentYear,
    ...(monthsNextYear ? { [nextYear]: monthsNextYear } : {})
  };
}

function ensureSeededPlanningLines() {
  const projects = state.projects || [];
  projects.forEach((project, projectIndex) => {
    project.planning = project.planning || {
      labor: [],
      subcontractors: [],
      equipment: [],
      materials: [],
      odc: []
    };

    if (!(project.planning.subcontractors || []).length) {
      project.planning.subcontractors = [
        {
          id: `${project.id}-sub-seed-1`,
          vendor: "Apex Field Services",
          item: "Installation support",
          monthly: [18000, 22000, 24000, 26000, 24000, 22000, 0, 0, 0, 0, 0, 0],
          yearly: seedYearlyLine(
            [18000, 22000, 24000, 26000, 24000, 22000, 0, 0, 0, 0, 0, 0],
            [15000, 18000, 18000, 12000, 0, 0, 0, 0, 0, 0, 0, 0]
          )
        },
        {
          id: `${project.id}-sub-seed-2`,
          vendor: "Precision Startup Group",
          item: "Commissioning assistance",
          monthly: [0, 0, 12000, 16000, 18000, 18000, 16000, 12000, 0, 0, 0, 0],
          yearly: seedYearlyLine(
            [0, 0, 12000, 16000, 18000, 18000, 16000, 12000, 0, 0, 0, 0],
            [8000, 10000, 12000, 10000, 0, 0, 0, 0, 0, 0, 0, 0]
          )
        }
      ];
    }

    if (!(project.planning.equipment || []).length) {
      project.planning.equipment = [
        {
          id: `${project.id}-eq-seed-1`,
          item: "Lift Rental",
          unit: "day",
          rate: 420,
          monthly: [10, 12, 12, 14, 14, 12, 10, 8, 0, 0, 0, 0],
          yearly: seedYearlyLine(
            [10, 12, 12, 14, 14, 12, 10, 8, 0, 0, 0, 0],
            [6, 8, 8, 6, 0, 0, 0, 0, 0, 0, 0, 0]
          )
        },
        {
          id: `${project.id}-eq-seed-2`,
          item: "Test Trailer",
          unit: "week",
          rate: 1850,
          monthly: [1, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0, 0],
          yearly: seedYearlyLine(
            [1, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0, 0],
            [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]
          )
        }
      ];
    }

    if (!(project.planning.materials || []).length) {
      project.planning.materials = [
        {
          id: `${project.id}-mat-seed-1`,
          item: "Panels",
          unit: "ea",
          rate: 14500,
          monthly: [1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0],
          yearly: seedYearlyLine(
            [1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0],
            [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
          )
        },
        {
          id: `${project.id}-mat-seed-2`,
          item: "Cable and tray",
          unit: "lot",
          rate: 18000,
          monthly: [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
          yearly: seedYearlyLine(
            [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
            [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
          )
        }
      ];
    }

    if (!(project.planning.odc || []).length) {
      project.planning.odc = [
        {
          id: `${project.id}-odc-seed-1`,
          item: "Travel and lodging",
          monthly: [6000, 6500, 7000, 7000, 6500, 6000, 4000, 0, 0, 0, 0, 0],
          yearly: seedYearlyLine(
            [6000, 6500, 7000, 7000, 6500, 6000, 4000, 0, 0, 0, 0, 0],
            [3500, 3500, 3000, 2500, 0, 0, 0, 0, 0, 0, 0, 0]
          )
        },
        {
          id: `${project.id}-odc-seed-2`,
          item: "Permits and fees",
          monthly: [2500, 2500, 3000, 3000, 2500, 2500, 0, 0, 0, 0, 0, 0],
          yearly: seedYearlyLine(
            [2500, 2500, 3000, 3000, 2500, 2500, 0, 0, 0, 0, 0, 0],
            [2000, 2000, 1500, 1500, 0, 0, 0, 0, 0, 0, 0, 0]
          )
        }
      ];
    }

    project.planning.labor = (project.planning.labor || []).map((line) => ({
      ...line,
      yearly: line.yearly || seedYearlyLine(line.monthly || Array(12).fill(0), Array(12).fill(0))
    }));
  });
}

function layout() {
  const { project, version: currentVersion } = currentProjectContext();

  return `
    <div class="sticky top-0 z-50 bg-ink shadow-md">
      <div class="mx-auto flex max-w-7xl items-center h-11 px-4 sm:px-6 lg:px-8">

        <!-- Module switcher -->
        <div class="flex items-center gap-1 pr-4 border-r border-white/10 shrink-0">
          <span class="hidden text-[9px] font-bold tracking-[0.22em] uppercase text-white/30 mr-2 lg:block">EAC</span>
          ${MODULE_ITEMS.map(([module, label]) => moduleButton(module, label)).join("")}
        </div>

        <!-- Project + version context -->
        <div class="flex flex-1 items-center gap-2 px-3 min-w-0 overflow-hidden">
          <select id="projectSelect" class="header-select shrink-0 max-w-[200px]" title="Active project">
            ${projectOptions().map((item) => `<option value="${item.id}" ${item.id === state.selectedProjectId ? "selected" : ""}>${item.name}</option>`).join("")}
          </select>
          <span class="text-white/20 text-xs shrink-0">›</span>
          <select id="forecastVersionSelect" class="header-select shrink-0 max-w-[170px]" title="Forecast version">
            ${getForecastVersions(project.id).map((version) => `<option value="${version.id}" ${version.id === currentVersion?.id ? "selected" : ""}>${version.code} · ${version.name}</option>`).join("")}
          </select>
          <span class="hidden lg:inline text-white/15 text-xs shrink-0 px-1">|</span>
          <span class="hidden lg:inline text-[11px] text-white/35 shrink-0 whitespace-nowrap truncate">Actuals ${currentVersion?.actualsThrough || "—"}</span>
        </div>

        <!-- Year selector -->
        <div class="shrink-0 flex items-center pl-3 border-l border-white/10">
          <select id="yearSelect" class="header-select" title="Planning year">
            <option value="${DEFAULT_PLANNING_YEAR}" ${state.selectedYear === DEFAULT_PLANNING_YEAR ? "selected" : ""}>${DEFAULT_PLANNING_YEAR}</option>
          </select>
        </div>

        <div class="shrink-0 flex items-center gap-2 pl-3 ml-3 border-l border-white/10">
          ${renderAuthHeaderControls()}
        </div>
      </div>

      <!-- Tab bar -->
      <div class="border-t border-white/8 bg-white">
        <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav class="flex items-center gap-0 -mb-px">
            ${getModuleTabs().map(([tab, label]) => navButton(tab, label)).join("")}
          </nav>
        </div>
      </div>

    </div>

    <div class="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <main class="space-y-5">
        ${renderActiveTab()}
      </main>
    </div>

    ${renderAskAiUi()}
    ${renderAuthUi()}
  `;
}

function renderAuthHeaderControls() {
  const user = signedInUser();
  if (!user) {
    return `
      <button id="authOpenBtn" class="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
        Sign In
      </button>
    `;
  }

  return `
    <button id="authOpenBtn" class="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
      ${signedInUserName()} · ${signedInProviderLabel()}
    </button>
  `;
}

function navButton(tab, label) {
  const active = state.ui.activeTab === tab;
  return `
    <button data-tab="${tab}" class="nav-trigger border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
      active
        ? "border-sea text-ink"
        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
    }">
      ${label}
    </button>
  `;
}

function moduleButton(module, label) {
  const active = state.ui.activeModule === module;
  return `
    <button data-module="${module}" class="module-trigger rounded px-2.5 py-1 text-xs font-semibold transition ${
      active ? "bg-white/18 text-white" : "text-white/55 hover:text-white hover:bg-white/10"
    }">
      ${label}
    </button>
  `;
}

function renderActiveTab() {
  switch (state.ui.activeModule) {
    case "resources":
      return renderResourcesModule();
    case "budgeting":
      return renderBudgetingModule();
    case "eac":
    default:
      return renderEacModule();
  }
}

function renderEacModule() {
  switch (state.ui.activeTab) {
    case "workflow":
      return renderWorkflowView();
    case "plan":
      return renderPlanView();
    case "financials":
      return renderFinancialsView();
    case "admin":
      return renderAdminView();
    case "overview":
    default:
      return renderOverviewTab();
  }
}

function renderWorkflowView() {
  const project = getProject();
  const context = currentProjectContext();
  const backendSummary = context.backendFinance?.summary || {};
  const financials = mergeAuthoritativeFinancials(
    project,
    context,
    financialComparisonMetrics(project, state.selectedYear)
  );
  const currentVersion = getCurrentForecastVersion(project.id);
  const actualsThrough = backendSummary.actualsThroughPeriod || currentVersion?.actualsThrough || "—";
  const comparisonReferenceLabel = comparisonBasisLabel(context);
  const comparisonBasis = resolvedComparisonBasis(context);

  const workflowPhases = [
    {
      title: "Set Up Project",
      body: "Confirm project shell, ownership, billing type, commercial values, QBO mapping, and planning window."
    },
    {
      title: "Build Forecast",
      body: "Enter or update labor, subcontractor, equipment, material, and ODC plans to establish the latest ETC."
    },
    {
      title: "Import Actuals",
      body: "Refresh QBO data and load actual costs. Closed months become actual-driven while future periods stay forecast-driven."
    },
    {
      title: "Compute EAC",
      body: "The backend calculates EAC cost, percent complete through actuals, cumulative revenue, catch-up revenue, and margin."
    },
    {
      title: "Review Variance",
      body: "Finance reviews comparison basis, key drivers, explanations, and whether commercial values or ETC need revision."
    },
    {
      title: "Baseline or Approve",
      body: "Create a new baseline snapshot or move the current forecast through submit, approve, and lock states."
    }
  ];

  const keyRules = [
    "ETC is future remaining work only and must never be negative.",
    "EAC Cost = Actual Cost to Date + ETC.",
    "% Complete = Cost to Date / EAC Cost.",
    "Cumulative Revenue = % Complete × Funding.",
    "Current Period Revenue = Current Cumulative Revenue - Prior Cumulative Revenue.",
    "Margin = Revenue - Cost, and Margin % = Margin / Revenue."
  ];

  return `
    <section class="space-y-6">
      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Workflow</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">How the application works</h2>
            <p class="mt-2 max-w-4xl text-sm text-slate-600">This view shows the high-level flow from setup and planning through actuals import, EAC calculation, revenue recognition, and forecast review.</p>
          </div>
          <div class="grid gap-2 text-right text-sm text-slate-600">
            <span><strong class="text-ink">Project:</strong> ${project.name}</span>
            <span><strong class="text-ink">Version:</strong> ${currentVersion?.code || project.version}</span>
            <span><strong class="text-ink">Actuals Through:</strong> ${actualsThrough}</span>
          </div>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          ${summaryTile("Revenue to Date", formatCompactCurrency(financials.actualRevenueToDate))}
          ${summaryTile("EAC Cost", formatCompactCurrency(financials.eacCost))}
          ${summaryTile("Current Catch-Up", formatCompactCurrency(financials.currentPeriodRevenue), financials.currentPeriodRevenue < 0)}
          ${summaryTile("Version Status", context.forecastState?.selectedVersion?.status || currentVersion?.status || "Working")}
        </div>
        <div class="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-sm text-slate-700">
          Current comparison basis: <strong class="text-ink">${comparisonReferenceLabel}</strong>.
          ${context.forecastState?.priorApprovedVersion ? `Prior approved version: <strong class="text-ink">${context.forecastState.priorApprovedVersion.code}</strong>.` : "No prior approved version has been saved yet."}
        </div>
      </section>

      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Workflow</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Operational flow</h2>
        <div class="mt-4 grid gap-3 xl:grid-cols-6">
          ${workflowPhases.map((step, index) => `
            <div class="relative rounded-[1.1rem] border border-slate-200 bg-stone-50 p-4">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-sea">${index + 1}</div>
                <p class="text-sm font-semibold text-ink">${step.title}</p>
              </div>
              <p class="mt-3 text-sm leading-6 text-slate-600">${step.body}</p>
              ${index < workflowPhases.length - 1 ? `<div class="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400"><span class="h-px flex-1 bg-slate-200"></span>Next</div>` : `<div class="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700"><span class="h-px flex-1 bg-emerald-200"></span>Ready</div>`}
            </div>
          `).join("")}
        </div>
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
          <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Workflow</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Calculation chain</h2>
          <p class="mt-2 text-sm text-slate-600">This is the financial logic underneath the workflow steps above.</p>
          <div class="mt-4 rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
            <div class="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              <span class="rounded-full bg-white px-3 py-2">Actual Cost</span>
              <span class="text-slate-400">+</span>
              <span class="rounded-full bg-white px-3 py-2">ETC</span>
              <span class="text-slate-400">=</span>
              <span class="rounded-full bg-sea/10 px-3 py-2 text-sea">EAC Cost</span>
              <span class="text-slate-400">→</span>
              <span class="rounded-full bg-white px-3 py-2">% Complete</span>
              <span class="text-slate-400">→</span>
              <span class="rounded-full bg-white px-3 py-2">Cumulative Revenue</span>
              <span class="text-slate-400">→</span>
              <span class="rounded-full bg-white px-3 py-2">Current Period Revenue</span>
              <span class="text-slate-400">→</span>
              <span class="rounded-full bg-ember/10 px-3 py-2 text-ember">Margin</span>
            </div>
          </div>
          <div class="mt-4 space-y-2">
            ${keyRules.map((rule) => `<div class="rounded-xl bg-white px-3 py-2 text-sm text-slate-700">${rule}</div>`).join("")}
          </div>
        </div>

        <div class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
          <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Modules</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">What each module owns</h2>
          <div class="mt-4 space-y-3">
            <div class="rounded-[1rem] border border-slate-200 bg-stone-50 p-4">
              <p class="text-sm font-semibold text-ink">Resources</p>
              <p class="mt-2 text-sm text-slate-600">Employees, assignments, hiring, attrition, capacity, and utilization. This module manages workforce supply and planned deployment.</p>
            </div>
            <div class="rounded-[1rem] border border-slate-200 bg-stone-50 p-4">
              <p class="text-sm font-semibold text-ink">EAC</p>
              <p class="mt-2 text-sm text-slate-600">Project forecast planning, monthly actuals, EAC calculations, revenue recognition, financial review, and baseline snapshots.</p>
            </div>
            <div class="rounded-[1rem] border border-slate-200 bg-stone-50 p-4">
              <p class="text-sm font-semibold text-ink">Budgeting</p>
              <p class="mt-2 text-sm text-slate-600">Future consolidated planning across projects, direct margin rollups, indirects, adjustments, and what-if scenario analysis.</p>
            </div>
          </div>
        </div>
      </section>
    </section>
  `;
}

function renderResourcesModule() {
  switch (state.ui.activeTab) {
    case "employees":
      return renderResourceEmployeesView();
    case "assignments":
      return renderResourceAssignmentsView();
    case "hiring":
      return renderResourceHiringView();
    case "attrition":
      return renderResourceAttritionView();
    case "analytics":
      return renderResourceAnalyticsView();
    case "admin":
      return renderAdminView();
    case "overview":
    default:
      return renderResourcesOverview();
  }
}

function renderBudgetingModule() {
  switch (state.ui.activeTab) {
    case "rollup":
      return renderBudgetRollupView();
    case "revenueSources":
      return renderBudgetRevenueSourcesView();
    case "scenarios":
      return renderBudgetScenariosView();
    case "admin":
      return renderAdminView();
    case "overview":
    default:
      return renderBudgetOverview();
  }
}

function renderOverviewTab() {
  const context = currentProjectContext();
  const project = context.project;
  const kpis = buildDisplayKpis(project, context);
  const version = context.version;
  const categorySummary = mergeAuthoritativeCategorySummary(project, context.backendFinance?.categorySummary || []);
  const reviewSignals = project.reviewSignals || {};
  const financials = mergeAuthoritativeFinancials(project, context, financialComparisonMetrics(project, state.selectedYear));
  const largestDriver = [...categorySummary].sort((a, b) => Math.abs(b.varianceToPrior) - Math.abs(a.varianceToPrior))[0];
  const varianceItems = [...categorySummary].sort((a, b) => Math.abs(b.varianceToPrior) - Math.abs(a.varianceToPrior)).slice(0, 5);

  const hydratedLabor = (project.planning?.labor || []).map(hydrateLaborLine);
  const resource = resourceSummary({
    ...project,
    planning: { ...project.planning, labor: hydratedLabor }
  });
  const overallocated = resource.employees.filter((item) => item.utilization > 100).length;

  const liveActuals = qboState.summaries;
  const {
    bundle,
    liveProject,
    setup,
    contract,
    notes: setupNotes,
    fundedValue,
    contractValue,
    sourceFundedValue,
    sourceContractValue,
    modificationValue
  } = context;
  const projectType = setupNotes.projectType || liveProject.billing_type || project.contractType || "—";
  const businessUnit = setupNotes.businessUnitCode || setup.organization_code || "—";
  const projectManager = liveProject.pm_name || setup.project_manager_name || project.manager || "—";
  const financeLead = setupNotes.projectFinanceLeadName || "—";
  const managingDirector = setupNotes.managingDirectorName || "—";
  const biller = setupNotes.billerName || "—";
  const customerName = setup.customer_name || bundle.qboMapping?.qbo_customer_name || project.client || "—";
  const actionItems = [
    fundedValue <= 0 ? { label: "Set Funding", tab: "admin", tone: "warn" } : null,
    !context.baselineSnapshot ? { label: "Create Baseline", tab: "admin", tone: "default" } : null,
    (reviewSignals.missingActualMappings || 0) > 0 ? { label: "Resolve QBO Mapping", tab: "admin", tone: "warn" } : null,
    Math.abs(financials.costVariance || 0) > 100000 ? { label: "Review Variance", tab: "financials", tone: "warn" } : null
  ].filter(Boolean);
  const statusNotes = [];
  if (!context.baselineSnapshot) statusNotes.push("baseline snapshot");
  if ((reviewSignals.missingActualMappings || 0) > 0) statusNotes.push("QBO mappings");
  if (overallocated > 0) statusNotes.push("resource allocation");
  if (fundedValue <= 0) statusNotes.push("funding");
  const comparisonReferenceLabel = comparisonBasisLabel(context);
  const comparisonBasis = resolvedComparisonBasis(context);

  const statusSummary = statusNotes.length
    ? `Project setup is mostly complete. Missing or pending item${statusNotes.length > 1 ? "s" : ""}: ${statusNotes.join(", ")}.`
    : `Project setup and forecast controls are in good standing. Current comparison basis: ${comparisonReferenceLabel}.`;

  const changeSummary = comparisonBasis.type === "none"
    ? "No baseline or prior approved forecast is available yet, so movement is not being compared to a saved reference point."
    : Math.abs(financials.costVariance || 0) < 1
      && Math.abs(financials.revenueImpact || 0) < 1
      && Math.abs(financials.marginVariance || 0) < 1
      ? `No meaningful movement is showing against ${comparisonReferenceLabel.toLowerCase()}.`
      : `${largestDriver?.label || "Forecast"} is the largest movement driver versus ${comparisonReferenceLabel.toLowerCase()}. Cost variance ${formatCompactCurrency(financials.costVariance)}, revenue impact ${formatCompactCurrency(financials.revenueImpact)}, margin variance ${formatCompactCurrency(financials.marginVariance)}.`;
  const baselineSnapshot = context.baselineSnapshot;
  const baselineCategoryMap = new Map((baselineSnapshot?.categories || []).map((item) => [item.key, Number(item.eac || 0)]));
  const comparisonColumnLabel = baselineSnapshot ? "Baseline" : "Reference";
  const categoryPlanRows = categorySummary.map((row) => ({
    ...row,
    plan: baselineCategoryMap.get(row.key) ?? row.budget,
    variance: row.eac - (baselineCategoryMap.get(row.key) ?? row.budget)
  }));
  const planCostTotal = categoryPlanRows.reduce((sum, row) => sum + Number(row.plan || 0), 0);
  const eacCostTotal = categoryPlanRows.reduce((sum, row) => sum + Number(row.eac || 0), 0);
  const planRevenueTotal = Number(baselineSnapshot?.summary?.revenueEac || financials.budgetRevenue || context.fundedValue || context.contractValue || 0);
  const eacRevenueTotal = Number(financials.eacRevenue || 0);
  const planProfitTotal = planRevenueTotal - planCostTotal;
  const eacProfitTotal = eacRevenueTotal - eacCostTotal;
  const planProfitPct = Number(baselineSnapshot?.summary?.marginPct ?? computeMarginPercent(planRevenueTotal, planCostTotal));
  const eacProfitPct = computeMarginPercent(eacRevenueTotal, eacCostTotal);
  const combinedFinancialRows = [
    {
      label: "Revenue",
      plan: planRevenueTotal,
      eac: eacRevenueTotal,
      variance: eacRevenueTotal - planRevenueTotal,
      percent: false
    },
    ...categoryPlanRows.map((row) => ({
      label: row.label,
      plan: Number(row.plan || 0),
      eac: Number(row.eac || 0),
      variance: Number(row.variance || 0),
      percent: false
    })),
    {
      label: "Total Cost",
      plan: planCostTotal,
      eac: eacCostTotal,
      variance: eacCostTotal - planCostTotal,
      percent: false,
      emphasis: true
    },
    {
      label: "Profit $",
      plan: planProfitTotal,
      eac: eacProfitTotal,
      variance: eacProfitTotal - planProfitTotal,
      percent: false,
      emphasis: true
    },
    {
      label: "Profit %",
      plan: planProfitPct,
      eac: eacProfitPct,
      variance: eacProfitPct - planProfitPct,
      percent: true,
      emphasis: true
    }
  ];

  return `
    <section class="space-y-6">
      <div class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Overview</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Baseline and EAC trend</h2>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">${version?.code || project.version}</span>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Baseline margin % ${planProfitPct.toFixed(1)}%</span>
            <span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">EAC margin % ${eacProfitPct.toFixed(1)}%</span>
          </div>
        </div>
        <div class="mt-4 h-80"><canvas id="trendChart"></canvas></div>
      </div>

      <div class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Overview</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Cumulative baseline and EAC trend</h2>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-slate-700">Actuals shaded</span>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Baseline margin % ${planProfitPct.toFixed(1)}%</span>
            <span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">EAC margin % ${eacProfitPct.toFixed(1)}%</span>
          </div>
        </div>
        <div class="mt-4 h-80"><canvas id="cumulativeTrendChart"></canvas></div>
      </div>

      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Project Setup</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Ownership, commercial terms, and current status</h2>
            <p class="mt-2 text-sm text-slate-600">This combines the setup and contract story into one operating view so the project can be scanned without hopping between small cards.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            ${actionItems.length ? actionItems.map((item) => `
              <button data-tab="${item.tab}" class="nav-trigger rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                item.tone === "warn"
                  ? "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }">
                ${item.label}
              </button>
            `).join("") : `<span class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">No immediate actions</span>`}
          </div>
        </div>
        <div class="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div class="rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Ownership and setup</p>
            <div class="mt-3 grid gap-2 md:grid-cols-2">
              ${dashboardStatLight("Client", customerName)}
              ${dashboardStatLight("Project type", projectType)}
              ${dashboardStatLight("Business unit", businessUnit)}
              ${dashboardStatLight("Department", setup.department_code || "—")}
              ${dashboardStatLight("Project manager", projectManager)}
              ${dashboardStatLight("Finance lead", financeLead)}
              ${dashboardStatLight("Managing director", managingDirector)}
              ${dashboardStatLight("Biller", biller)}
            </div>
          </div>

          <div class="rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Commercial terms</p>
            <div class="mt-3 grid gap-2 md:grid-cols-2">
              ${dashboardStatLight("Base funded value", sourceFundedValue > 0 ? formatCompactCurrency(sourceFundedValue) : "Not set")}
              ${dashboardStatLight("Base contract value", sourceContractValue > 0 ? formatCompactCurrency(sourceContractValue) : "Not set")}
              ${dashboardStatLight("Modification value", modificationValue ? formatCompactCurrency(modificationValue) : formatCompactCurrency(0))}
              ${dashboardStatLight("Effective funded value", fundedValue > 0 ? formatCompactCurrency(fundedValue) : "Not set")}
              ${dashboardStatLight("Effective contract value", contractValue > 0 ? formatCompactCurrency(contractValue) : "Not set")}
              ${dashboardStatLight("Period of performance", formatDateRange(contract.pop_start || liveProject.start_date, contract.pop_end || liveProject.end_date))}
              ${dashboardStatLight("Planning window", formatDateRange(setup.planning_start_period, setup.planning_end_period))}
              ${dashboardStatLight("Actuals start", formatOverviewDate(setup.actuals_start_period))}
              ${dashboardStatLight("Setup status", setup.setup_status || "Not seeded")}
            </div>
          </div>
        </div>
        <div class="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div class="rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4 text-sm leading-6 text-slate-700">
            <p class="text-sm font-semibold text-ink">What needs attention</p>
            <p class="mt-3">${statusSummary}</p>
          </div>
          <div class="rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
            <p class="text-sm font-semibold text-ink">What changed</p>
            <p class="mt-3 text-sm leading-6 text-slate-700">${changeSummary}</p>
          </div>
        </div>
      </section>

    <section class="grid gap-6 xl:grid-cols-[1fr_1fr] items-stretch">
      <section class="h-full rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Financial Summary</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Revenue, cost, and profit bridge</h2>
          </div>
        </div>
        <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Metric</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">${comparisonColumnLabel}</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">EAC</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Variance</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${combinedFinancialRows.map((row) => `
                <tr class="${row.emphasis ? "bg-stone-50" : ""}">
                  <td class="px-3 py-2 font-semibold text-ink">${row.label}</td>
                  <td class="px-3 py-2 text-right">${row.percent ? `${row.plan.toFixed(1)}%` : formatCompactCurrency(row.plan)}</td>
                  <td class="px-3 py-2 text-right font-semibold text-slate-700">${row.percent ? `${row.eac.toFixed(1)}%` : formatCompactCurrency(row.eac)}</td>
                  <td class="px-3 py-2 text-right ${row.percent ? (row.variance < 0 ? "text-rose-700" : "text-emerald-700") : (row.label === "Revenue" || row.label === "Profit $" ? (row.variance < 0 ? "text-rose-700" : "text-emerald-700") : (row.variance > 0 ? "text-rose-700" : "text-emerald-700"))}">
                    ${row.percent ? formatMarginVariance(row.variance) : formatVarianceCell(row.variance, percentChange(row.eac, row.plan))}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
      <section class="h-full rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Category Comparison</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">${comparisonColumnLabel} and EAC by category</h2>
        <div class="mt-4 h-72"><canvas id="costMixChart"></canvas></div>
      </section>
    </section>
  `;
}

function renderPlanView() {
  const current = state.ui.planSubtab || "summary";
  const context = currentProjectContext();
  const currentVersion = context.version || getCurrentForecastVersion();
  const isSavingPlan = financeState.savingKey === currentFinanceKey();
  const canSubmitPlan = Boolean(currentVersion?.id) && currentVersion?.status !== "Locked";
  const submitLabel = currentVersion?.status === "In Review" ? "Resubmit Plan" : "Submit Plan";
  return `
    <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Plan</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Planning workspace</h2>
          <p class="mt-2 text-sm text-slate-600">Edit the working plan, save it explicitly, and submit the current version for review when it is ready.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-slate-700">Version ${currentVersion?.code || "Working"} · ${currentVersion?.status || "Draft"}</span>
          <button id="savePlanBtn" class="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 ${isSavingPlan ? "opacity-60" : ""}" ${isSavingPlan ? "disabled" : ""}>
            ${isSavingPlan ? "Saving..." : "Save Plan"}
          </button>
          <button id="submitPlanBtn" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slateblue ${(!canSubmitPlan || isSavingPlan) ? "opacity-60" : ""}" ${(!canSubmitPlan || isSavingPlan) ? "disabled" : ""}>
            ${submitLabel}
          </button>
          ${PLAN_SUBTABS.map(([key, label]) => `
            <button data-plan-subtab="${key}" class="plan-subtab rounded-full px-3 py-1.5 text-sm font-semibold transition ${current === key ? "bg-ink text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}">
              ${label}
            </button>
          `).join("")}
        </div>
      </div>
      <div class="mt-5">
        ${current === "summary" ? renderPlanSummary() : renderPlanningDetail(current)}
      </div>
    </section>
  `;
}

async function savePlanFromWorkspace(projectId = state.selectedProjectId) {
  if (!projectId) return;
  await persistProjectFinanceNow(projectId);
}

async function submitPlanFromWorkspace(projectId = state.selectedProjectId) {
  if (!projectId) return;
  const version = getCurrentForecastVersion(projectId);
  if (!version?.id || version.status === "Locked") return;
  await persistProjectFinanceNow(projectId);
  await transitionForecastVersionFromAdmin(projectId, version.id, "In Review");
}

function buildResourceEmployeeRows() {
  const employees = employeeOptions();
  const projectAssignments = state.projects.flatMap((project) =>
    (project.planning?.labor || []).map((line) => ({
      projectId: project.id,
      projectName: project.name,
      ...hydrateLaborLine(line)
    }))
  );

  return employees.map((employee) => {
    const employeeAssignments = projectAssignments.filter((item) => item.employeeId === employee.id);
    const organization = organizationById(employee.organizationId) || { name: "Unassigned" };
    const department = departmentById(employee.departmentId) || { name: "Unassigned" };
    const laborCategory = laborCategoryById(employee.laborCategoryId) || { name: "Unassigned" };
    const assignedHours = employeeAssignments.reduce((sum, item) => sum + getLineAnnualUnits(item), 0);
    const utilization = assignedHours / 1920 * 100;

    return {
      ...employee,
      organizationName: organization.name,
      departmentName: department.name,
      laborCategoryName: laborCategory.name,
      assignments: employeeAssignments,
      projectCount: new Set(employeeAssignments.map((item) => item.projectId)).size,
      assignedHours,
      utilization
    };
  });
}

function getResourceEditor() {
  return state.ui.resourceEditor || { kind: null, mode: "create", entityId: null };
}

function resourceAssignmentRows() {
  return state.projects.flatMap((project) =>
    (project.planning?.labor || []).map((line) => ({
      projectId: project.id,
      projectName: project.name,
      ...hydrateLaborLine(line)
    }))
  );
}

function resourcePanelHeader(title, description, buttonLabel, kind) {
  return `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-ink">${title}</h2>
        <p class="mt-0.5 text-sm text-slate-500">${description}</p>
      </div>
      <button class="resource-editor-trigger shrink-0 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-slateblue" data-editor-kind="${kind}" data-editor-mode="create" data-editor-source="resources">
        ${buttonLabel}
      </button>
    </div>
  `;
}

function planningYears() {
  return [state.selectedYear, state.selectedYear + 1];
}

function lineMonthsForYear(line, year) {
  const yearly = line?.yearly?.[year];
  if (Array.isArray(yearly) && yearly.length === 12) return yearly.map((value) => Number(value || 0));
  if (Array.isArray(line?.monthly) && line.monthly.length === 12 && year === state.selectedYear) {
    return line.monthly.map((value) => Number(value || 0));
  }
  if (Array.isArray(line?.monthly) && line.monthly.length === 12 && !line?.yearly) {
    return line.monthly.map((value) => Number(value || 0));
  }
  return Array(12).fill(0);
}

function ensureLineYear(line, year) {
  line.yearly = line.yearly || {};
  if (!Array.isArray(line.yearly[year]) || line.yearly[year].length !== 12) {
    line.yearly[year] = year === state.selectedYear && Array.isArray(line.monthly) && line.monthly.length === 12
      ? [...line.monthly]
      : Array(12).fill(0);
  }
  return line.yearly[year];
}

function planningYearRangeOptions() {
  const current = state.selectedYear;
  return Array.from({ length: 7 }, (_, index) => current - 1 + index);
}

function planningDisplayModel() {
  const startYear = Number(state.ui.planHorizonStartYear || state.selectedYear);
  const endYear = Math.max(startYear, Number(state.ui.planHorizonEndYear || startYear));
  const visibleYears = [];

  for (let year = startYear; year <= endYear && visibleYears.length < 2; year += 1) {
    visibleYears.push(year);
  }

  return {
    startYear,
    endYear,
    priorYear: startYear - 1,
    visibleYears,
    outYearsStart: (visibleYears[visibleYears.length - 1] || startYear) + 1
  };
}

function planningColumnClass(category, field, columnIndex) {
  if (columnIndex === 0) return `${category}-col-1`;
  if (columnIndex === 1) return `${category}-col-2`;
  if (columnIndex === 2) return `${category}-col-3`;
  if (field === "rate") return "planning-rate-col";
  if (field === "unit") return "planning-unit-col";
  return "";
}

function lineUnitsAcrossYears(line, startYear, endYear) {
  let total = 0;
  for (let year = startYear; year <= endYear; year += 1) {
    total += lineMonthsForYear(line, year).reduce((sum, value) => sum + Number(value || 0), 0);
  }
  return total;
}

function lineCostAcrossYears(line, category, startYear, endYear) {
  let total = 0;
  for (let year = startYear; year <= endYear; year += 1) {
    total += getLineAnnualCost(line, category, year);
  }
  return total;
}

function formatPeriodValue(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parsePeriodValue(value, fallbackYear = state.selectedYear, fallbackMonth = 1) {
  const raw = String(value || "");
  const [yearText, monthText] = raw.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return {
    year: Number.isFinite(year) ? year : fallbackYear,
    month: Number.isFinite(month) ? month : fallbackMonth
  };
}

function dateValueFromPeriod(value, fallbackDay = 1) {
  const { year, month } = parsePeriodValue(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(fallbackDay).padStart(2, "0")}`;
}

function resolveActualsThroughPlanningPeriod(project = getProject()) {
  const context = currentProjectContext();
  const value = context.backendFinance?.summary?.actualsThroughPeriod || context.version?.actualsThrough || "";
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function isPlanningPeriodLocked(year, month, actualsThroughPeriod = resolveActualsThroughPlanningPeriod()) {
  if (!actualsThroughPeriod) return false;
  return formatPeriodValue(year, month) <= actualsThroughPeriod;
}

function buildOpenEndedMonthlyPlan(startDate, targetYear, monthlyUnits = 160) {
  const parsed = new Date(startDate || `${targetYear}-01-01`);
  const startYear = Number.isFinite(parsed.getTime()) ? parsed.getFullYear() : targetYear;
  const startMonth = Number.isFinite(parsed.getTime()) ? parsed.getMonth() + 1 : 1;
  if (targetYear < startYear) return Array(12).fill(0);
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return targetYear > startYear || month >= startMonth ? monthlyUnits : 0;
  });
}

function actualsThroughMonthIndex(actualsThroughPeriod, year = state.selectedYear) {
  if (!actualsThroughPeriod) return -1;
  const { year: periodYear, month } = parsePeriodValue(actualsThroughPeriod, year, 1);
  if (periodYear < year) return 11;
  if (periodYear > year) return -1;
  return Math.max(Math.min(month - 1, 11), -1);
}

function monthNumberFromDate(value, fallbackMonth = 1) {
  const date = new Date(value);
  const month = Number.isFinite(date.getTime()) ? date.getMonth() + 1 : fallbackMonth;
  return month;
}

function formatShortDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function periodOptionList(selectedValue) {
  return planningYears().flatMap((year) =>
    state.meta.months.map((label, index) => {
      const value = formatPeriodValue(year, index + 1);
      return `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${label} ${year}</option>`;
    })
  ).join("");
}

function periodLabel(value) {
  const { year, month } = parsePeriodValue(value);
  return `${state.meta.months[month - 1] || "Jan"} ${year}`;
}

function renderAssignmentEditor() {
  const editor = getResourceEditor();
  if (editor.kind !== "assignment") return "";
  const assignment = editor.mode === "edit"
    ? resourceAssignmentRows().find((item) => item.id === editor.entityId)
    : null;
  const selectedEmployee = assignment ? employeeById(assignment.employeeId) : employeeOptions()[0];
  const nonZeroMonths = assignment?.monthly?.map((value, index) => ({ value, index })).filter((item) => Number(item.value || 0) > 0) || [];
  const startDate = assignment?.startDate || dateValueFromPeriod(assignment?.startPeriod || formatPeriodValue(state.selectedYear, nonZeroMonths[0]?.index + 1 || 1), 1);
  const endDate = assignment?.endDate || dateValueFromPeriod(assignment?.endPeriod || formatPeriodValue(state.selectedYear, nonZeroMonths[nonZeroMonths.length - 1]?.index + 1 || 12), 28);
  const weeklyHours = assignment?.weeklyHours || Math.round((nonZeroMonths[0]?.value || 173) / 4.33);

  return `
    <form id="resourceAssignmentForm" class="mt-4 rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-lg font-semibold text-ink">${editor.mode === "edit" ? "Reassign employee" : "Assign employee"}</h3>
        <button type="button" class="resource-editor-cancel text-sm font-semibold text-slate-500">Close</button>
      </div>
      <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label class="space-y-1">
          <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Employee</span>
          <select name="employeeId" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            ${employeeOptions().map((employee) => `<option value="${employee.id}" ${employee.id === selectedEmployee?.id ? "selected" : ""}>${employee.name}</option>`).join("")}
          </select>
        </label>
        <label class="space-y-1">
          <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Project</span>
          <select name="projectId" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            ${state.projects.map((project) => `<option value="${project.id}" ${project.id === (assignment?.projectId || state.selectedProjectId) ? "selected" : ""}>${project.name}</option>`).join("")}
          </select>
        </label>
        <label class="space-y-1">
          <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Labor Category</span>
          <select name="laborCategoryId" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            ${(state.masterData.laborCategories || []).map((item) => `<option value="${item.id}" ${item.id === (assignment?.laborCategoryId || selectedEmployee?.laborCategoryId) ? "selected" : ""}>${item.name}</option>`).join("")}
          </select>
        </label>
        <label class="space-y-1">
          <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Weekly Hours</span>
          <input name="weeklyHours" type="number" value="${weeklyHours}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        </label>
        <label class="space-y-1">
          <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Start Date</span>
          <input name="startDate" type="date" value="${startDate}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        </label>
        <label class="space-y-1">
          <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">End Date</span>
          <input name="endDate" type="date" value="${endDate}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        </label>
        <label class="space-y-1">
          <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Rate</span>
          <input name="rate" type="number" value="${assignment?.rate || selectedEmployee?.rate || 0}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        </label>
      </div>
      <input type="hidden" name="entityId" value="${assignment?.id || ""}">
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="resource-editor-cancel rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
        <button type="submit" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">${editor.mode === "edit" ? "Save Reassignment" : "Save Assignment"}</button>
      </div>
    </form>
  `;
}

function renderHiringEditor() {
  const editor = getResourceEditor();
  if (editor.kind !== "hire") return "";
  const isPlanLaborSource = editor.source === "plan-labor";
  const hire = editor.mode === "edit"
    ? (state.resourceManagement?.plannedHires || []).find((item) => item.id === editor.entityId)
    : null;
  const selectedTargetProjectId = hire?.targetProjectId || editor.targetProjectId || state.selectedProjectId || "";
  const selectedTargetProject = state.projects.find((project) => project.id === selectedTargetProjectId) || null;
  const startDate = hire?.startDate || dateValueFromPeriod(hire?.startPeriod || formatPeriodValue(state.selectedYear, 1), 1);
  return `
    <form id="resourceHiringForm" class="mt-4 rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-ink">${editor.mode === "edit" ? "Edit hire plan" : "Add hire plan"}</h3>
          ${isPlanLaborSource ? `<p class="mt-1 text-sm text-slate-500">This planned hire will be added directly to the Labor tab for the selected project.</p>` : ""}
        </div>
        <button type="button" class="resource-editor-cancel text-sm font-semibold text-slate-500">Close</button>
      </div>
      <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Employee Name Or Description</span><input name="name" type="text" value="${hire?.name || ""}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Future scheduler, project engineer, field tech" required></label>
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Labor Category</span><select name="laborCategoryId" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">${(state.masterData.laborCategories || []).map((item) => `<option value="${item.id}" ${item.id === hire?.laborCategoryId ? "selected" : ""}>${item.name}</option>`).join("")}</select></label>
        ${isPlanLaborSource
          ? `
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Project</span><input type="text" value="${selectedTargetProject?.name || "Selected project"}" class="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700" readonly></label>
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Project ID</span><input type="text" value="${selectedTargetProjectId || "—"}" class="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700" readonly></label>
        <input type="hidden" name="targetProjectId" value="${selectedTargetProjectId}">
          `
          : `
        <label class="space-y-1 md:col-span-2"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Assign To Project</span><select name="targetProjectId" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Shared capacity</option>${state.projects.map((project) => `<option value="${project.id}" ${project.id === selectedTargetProjectId ? "selected" : ""}>${project.name} · ${project.id}</option>`).join("")}</select></label>
          `}
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Start Date</span><input name="startDate" type="date" value="${startDate}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"></label>
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Monthly Cost</span><input name="monthlyCost" type="number" value="${hire?.monthlyCost || 0}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"></label>
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Status</span><select name="status" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">${["Planned", "Approved", "Recruiting", "Offer"].map((value) => `<option value="${value}" ${value === (hire?.status || "Planned") ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      </div>
      <input type="hidden" name="entityId" value="${hire?.id || ""}">
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="resource-editor-cancel rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
        <button type="submit" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">${editor.mode === "edit" ? "Save Hire" : "Add Hire"}</button>
      </div>
    </form>
  `;
}

function renderAttritionEditor() {
  const editor = getResourceEditor();
  if (editor.kind !== "attrition") return "";
  const exit = editor.mode === "edit"
    ? (state.resourceManagement?.plannedExits || []).find((item) => item.id === editor.entityId)
    : null;
  const endDate = exit?.endDate || dateValueFromPeriod(exit?.period || formatPeriodValue(state.selectedYear, exit?.month || 1), 28);
  return `
    <form id="resourceAttritionForm" class="mt-4 rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-lg font-semibold text-ink">${editor.mode === "edit" ? "Edit attrition plan" : "Plan attrition"}</h3>
        <button type="button" class="resource-editor-cancel text-sm font-semibold text-slate-500">Close</button>
      </div>
      <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Employee</span><select name="employeeId" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">${employeeOptions().map((employee) => `<option value="${employee.id}" ${employee.id === exit?.employeeId ? "selected" : ""}>${employee.name}</option>`).join("")}</select></label>
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">End Date</span><input name="endDate" type="date" value="${endDate}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"></label>
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Type</span><select name="type" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">${["Attrition", "Termination", "Transfer", "Retirement"].map((value) => `<option value="${value}" ${value === (exit?.type || "Attrition") ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Backfill</span><select name="backfill" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="true" ${exit?.backfill ? "selected" : ""}>Yes</option><option value="false" ${exit && !exit.backfill ? "selected" : ""}>No</option></select></label>
        <label class="space-y-1"><span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Status</span><select name="status" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">${["Forecast", "Planned", "Approved"].map((value) => `<option value="${value}" ${value === (exit?.status || "Forecast") ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      </div>
      <input type="hidden" name="entityId" value="${exit?.id || ""}">
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="resource-editor-cancel rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
        <button type="submit" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">${editor.mode === "edit" ? "Save Attrition" : "Add Attrition"}</button>
      </div>
    </form>
  `;
}

function buildResourceCategorySummary() {
  const employees = buildResourceEmployeeRows();
  const byCategory = new Map();

  employees.forEach((employee) => {
    const key = employee.laborCategoryId || "unassigned";
    if (!byCategory.has(key)) {
      byCategory.set(key, {
        laborCategoryName: employee.laborCategoryName,
        headcount: 0,
        projectIds: new Set(),
        assignedHours: 0
      });
    }
    const row = byCategory.get(key);
    row.headcount += 1;
    row.assignedHours += employee.assignedHours;
    employee.assignments.forEach((assignment) => row.projectIds.add(assignment.projectId));
  });

  return [...byCategory.values()].map((item) => ({
    laborCategoryName: item.laborCategoryName,
    headcount: item.headcount,
    projectCount: item.projectIds.size,
    utilization: item.headcount ? item.assignedHours / (item.headcount * 1920) * 100 : 0
  }));
}

function buildResourceMonthlySummary() {
  const employees = buildResourceEmployeeRows();
  const hires = state.resourceManagement?.plannedHires || [];
  const exits = state.resourceManagement?.plannedExits || [];
  const totalAssignedByMonth = Array.from({ length: 12 }, (_, monthIndex) =>
    state.projects.reduce((sum, project) => {
      const laborCostHours = (project.planning?.labor || []).reduce((lineSum, line) => lineSum + Number(line.monthly?.[monthIndex] || 0), 0);
      return sum + laborCostHours;
    }, 0)
  );

  let rollingHeadcount = employees.length;
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const monthNumber = monthIndex + 1;
    const monthHires = hires.filter((item) => monthNumberFromDate(item.startDate, item.startMonth || 1) === monthNumber).length;
    const monthExits = exits.filter((item) => monthNumberFromDate(item.endDate, item.month || 1) === monthNumber).length;
    const startingHeadcount = rollingHeadcount;
    const endingHeadcount = startingHeadcount + monthHires - monthExits;
    const availableHours = endingHeadcount * 160;
    const assignedHours = totalAssignedByMonth[monthIndex];
    const utilization = availableHours ? (assignedHours / availableHours) * 100 : 0;
    rollingHeadcount = endingHeadcount;

    return {
      monthIndex,
      startingHeadcount,
      hires: monthHires,
      exits: monthExits,
      endingHeadcount,
      assignedHours,
      availableHours,
      utilization
    };
  });
}

function budgetingAdjustments() {
  return state.budgeting?.adjustments || [];
}

function budgetAdjustmentDraft() {
  return state.ui?.budgetAdjustmentDraft || {
    type: "indirect",
    category: INDIRECT_EXPENSE_CATEGORIES[0],
    description: "",
    projectId: "",
    startPeriod: `${state.selectedYear}-01`,
    endPeriod: `${state.selectedYear}-12`,
    spreadMethod: "single",
    amount: "",
    direction: "1"
  };
}

function budgetRevenueSourceDraft() {
  return state.ui?.budgetRevenueSourceDraft || {
    sourceType: "pipeline",
    id: "",
    name: "",
    client: "",
    projectId: "",
    owner: "",
    stage: PIPELINE_STAGE_OPTIONS[0],
    probability: "50",
    value: "",
    startPeriod: `${state.selectedYear}-07`,
    endPeriod: `${state.selectedYear}-12`,
    marginRate: "20",
    note: ""
  };
}

function budgetDisplayScale() {
  const value = String(state.ui?.budgetDisplayScale || "dollars").toLowerCase();
  return ["dollars", "thousands", "millions"].includes(value) ? value : "dollars";
}

function budgetDisplayUnitLabel(scale = budgetDisplayScale()) {
  if (scale === "thousands") return "$000";
  if (scale === "millions") return "$M";
  return "$";
}

function budgetChartScaleSettings() {
  const settings = state.ui?.budgetChartScale || {};
  return {
    revenueMin: Number.isFinite(Number(settings.revenueMin)) ? Number(settings.revenueMin) : null,
    revenueMax: Number.isFinite(Number(settings.revenueMax)) ? Number(settings.revenueMax) : null,
    incomeMin: Number.isFinite(Number(settings.incomeMin)) ? Number(settings.incomeMin) : null,
    incomeMax: Number.isFinite(Number(settings.incomeMax)) ? Number(settings.incomeMax) : null
  };
}

function budgetChartSuggestedScale(context = buildBudgetingContext()) {
  const revenueValues = context.monthlyDrivers?.totalRevenue?.map((value) => Number(value || 0)) || [];
  const incomeValues = context.monthlyDrivers?.operatingIncome?.map((value) => Number(value || 0)) || [];
  const roundDown = (value, step) => Math.floor(value / step) * step;
  const roundUp = (value, step) => Math.ceil(value / step) * step;
  const revenueStep = 1_000_000;
  const incomeStep = 500_000;
  const revenueMinRaw = revenueValues.length ? Math.min(...revenueValues) : 0;
  const revenueMaxRaw = revenueValues.length ? Math.max(...revenueValues) : 0;
  const incomeMinRaw = incomeValues.length ? Math.min(...incomeValues) : 0;
  const incomeMaxRaw = incomeValues.length ? Math.max(...incomeValues) : 0;
  return {
    revenueMin: roundDown(Math.max(revenueMinRaw - (revenueStep * 1.5), 0), revenueStep),
    revenueMax: roundUp(revenueMaxRaw + (revenueStep * 1.5), revenueStep),
    incomeMin: roundDown(incomeMinRaw - incomeStep, incomeStep),
    incomeMax: roundUp(incomeMaxRaw + incomeStep, incomeStep)
  };
}

function formatBudgetChartControlValue(value) {
  return Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : "";
}

function formatBudgetPAndLValue(value, { type = "currency", scale = budgetDisplayScale() } = {}) {
  if (type === "percent") return `${Number(value || 0).toFixed(1)}%`;

  const numeric = Number(value || 0);
  const divisors = {
    dollars: 1,
    thousands: 1000,
    millions: 1000000
  };
  const divisor = divisors[scale] || 1;
  const scaled = numeric / divisor;
  const absoluteScaled = Math.abs(scaled);
  const digits = scale === "dollars" ? 0 : absoluteScaled >= 100 ? 0 : 1;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(scaled);
}

function comparePeriodValues(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  return a.localeCompare(b);
}

function resolveBudgetingClosedThroughPeriod() {
  const periods = state.projects
    .map((project) => {
      const summaryPeriod = project.backendFinanceModel?.summary?.actualsThroughPeriod || "";
      const versionPeriod = getCurrentForecastVersion(project.id)?.actualsThrough || "";
      return /^\d{4}-\d{2}$/.test(summaryPeriod) ? summaryPeriod : (/^\d{4}-\d{2}$/.test(versionPeriod) ? versionPeriod : null);
    })
    .filter(Boolean);

  if (!periods.length) return null;
  return periods.sort(comparePeriodValues).at(-1) || null;
}

function buildBudgetingContext() {
  ensureBudgetingState(state);
  const employeeRows = buildResourceEmployeeRows();
  const resourceMonthly = buildResourceMonthlySummary();
  const closedThroughPeriod = resolveBudgetingClosedThroughPeriod();
  const model = buildBudgetingModel({
    projects: state.projects,
    year: state.selectedYear,
    adjustments: budgetingAdjustments(),
    opportunities: state.budgeting?.opportunities || [],
    whitespace: state.budgeting?.whitespace || [],
    resourceMonthly,
    employeeRows
  });

  return {
    employeeRows,
    resourceMonthly,
    adjustments: budgetingAdjustments(),
    closedThroughPeriod,
    closedThroughIndex: actualsThroughMonthIndex(closedThroughPeriod, state.selectedYear),
    ...model
  };
}

function budgetAdjustmentCategoryOptions(type, selectedValue = "") {
  const values = type === "revenue" ? REVENUE_ADJUSTMENT_CATEGORIES : INDIRECT_EXPENSE_CATEGORIES;
  return values.map((value) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${value}</option>`).join("");
}

function budgetAdjustmentTypePill(type) {
  return type === "revenue"
    ? '<span class="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">Revenue</span>'
    : '<span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Indirect</span>';
}

function budgetRevenueSourceTypePill(type) {
  return type === "whitespace"
    ? '<span class="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">White Space</span>'
    : '<span class="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">Pipeline</span>';
}

function isEditableBudgetRow(row) {
  return row?.key === "revenueAdjustments" || String(row?.key || "").startsWith("indirect-");
}

function budgetEditDraftForCell(row, monthIndex) {
  if (!isEditableBudgetRow(row)) return null;
  const period = formatPeriodValue(state.selectedYear, monthIndex + 1);
  if (row.key === "revenueAdjustments") {
    return {
      type: "revenue",
      category: REVENUE_ADJUSTMENT_CATEGORIES[0],
      description: `Revenue adjustment for ${state.meta.months[monthIndex]} ${state.selectedYear}`,
      projectId: "",
      startPeriod: period,
      endPeriod: period,
      spreadMethod: "single",
      amount: "",
      direction: "1"
    };
  }
  return {
    type: "indirect",
    category: row.label.replace("Indirect - ", ""),
    description: `${row.label} adjustment for ${state.meta.months[monthIndex]} ${state.selectedYear}`,
    projectId: "",
    startPeriod: period,
    endPeriod: period,
    spreadMethod: "single",
    amount: "",
    direction: "1"
  };
}

function renderResourcesOverview() {
  const employees = buildResourceEmployeeRows();
  const monthly = buildResourceMonthlySummary();
  const headcountStart = monthly[0]?.startingHeadcount || employees.length;
  const headcountEnd = monthly[monthly.length - 1]?.endingHeadcount || employees.length;
  const staffed = employees.length;
  const plannedHours = employees.reduce((sum, item) => sum + item.assignedHours, 0);
  const overallocated = employees.filter((item) => item.utilization > 100).length;
  const avgUtilization = staffed ? employees.reduce((sum, item) => sum + item.utilization, 0) / staffed : 0;
  const plannedHires = state.resourceManagement?.plannedHires || [];
  const plannedExits = state.resourceManagement?.plannedExits || [];

  return `
    <section class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Resources</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Workforce health</h2>
        <div class="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          ${summaryTile("Starting HC", String(headcountStart))}
          ${summaryTile("Ending HC", String(headcountEnd))}
          ${summaryTile("Planned Hires", String(plannedHires.length))}
          ${summaryTile("Planned Exits", String(plannedExits.length), plannedExits.length > plannedHires.length)}
          ${summaryTile("Planned Hours", plannedHours.toLocaleString("en-US"))}
          ${summaryTile("Avg Utilization", `${avgUtilization.toFixed(1)}%`, avgUtilization > 95)}
        </div>
        <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Month</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Starting HC</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Hires</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Exits</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Ending HC</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Utilization</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${monthly.map((item) => `
                <tr>
                  <td class="px-3 py-2 font-semibold text-ink">${state.meta.months[item.monthIndex]}</td>
                  <td class="px-3 py-2 text-right">${item.startingHeadcount}</td>
                  <td class="px-3 py-2 text-right">${item.hires}</td>
                  <td class="px-3 py-2 text-right">${item.exits}</td>
                  <td class="px-3 py-2 text-right">${item.endingHeadcount}</td>
                  <td class="px-3 py-2 text-right ${item.utilization > 100 ? "text-rose-700" : "text-slate-700"}">${item.utilization.toFixed(1)}%</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Resources</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Planning signals</h2>
        <div class="mt-4 space-y-2">
          ${dashboardStatLight("Active employees", String(staffed))}
          ${dashboardStatLight("Employees on 2 projects", String(employees.filter((item) => item.projectCount === 2).length))}
          ${dashboardStatLight("Overallocated employees", String(overallocated))}
          ${dashboardStatLight("Open requisitions", String((state.resourceManagement?.openPositions || []).length))}
          ${dashboardStatLight("QBO employee identities", String(setupState.bootstrapEmployees.length))}
          ${dashboardStatLight("Employee planning extensions", String(setupState.employeeProfiles.length))}
        </div>
      </section>
    </section>
  `;
}

function renderResourceEmployeesView() {
  const employees = buildResourceEmployeeRows();
  return `
    <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
      <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Resources</p>
      <h2 class="mt-1 text-2xl font-semibold tracking-tight">Employee roster</h2>
      <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
        <table class="compact-table min-w-full text-sm">
          <thead class="bg-stone-50 text-slate-500">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Employee</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Labor Category</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Org / Dept</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Projects</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Assigned Hours</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Utilization</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            ${employees.map((item) => `
              <tr>
                <td class="px-3 py-2 font-semibold text-ink">${item.name}</td>
                <td class="px-3 py-2">${item.laborCategoryName}</td>
                <td class="px-3 py-2">${item.organizationName} / ${item.departmentName}</td>
                <td class="px-3 py-2 text-right">${item.projectCount}</td>
                <td class="px-3 py-2 text-right">${Math.round(item.assignedHours).toLocaleString("en-US")}</td>
                <td class="px-3 py-2 text-right ${item.utilization > 100 ? "text-rose-700" : "text-slate-700"}">${item.utilization.toFixed(1)}%</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderResourceAssignmentsView() {
  const assignmentRows = resourceAssignmentRows();
  return `
    <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
      ${resourcePanelHeader("Employee assignments", "Assign or reassign employees across the current project portfolio.", "Assign Employee", "assignment")}
      ${renderAssignmentEditor()}
      <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
        <table class="compact-table min-w-full text-sm">
          <thead class="bg-stone-50 text-slate-500">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Project</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Employee</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Labor Category</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Start Date</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">End Date</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Annual Hours</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Annual Cost</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            ${assignmentRows.length ? assignmentRows.map((line) => `
              <tr>
                <td class="px-3 py-2 font-semibold text-ink">${line.projectName}</td>
                <td class="px-3 py-2 font-semibold text-ink">${line.employeeName}</td>
                <td class="px-3 py-2">${line.laborCategoryName}</td>
                <td class="px-3 py-2 whitespace-nowrap">${formatShortDate(line.startDate || dateValueFromPeriod(line.startPeriod, 1))}</td>
                <td class="px-3 py-2 whitespace-nowrap">${formatShortDate(line.endDate || dateValueFromPeriod(line.endPeriod, 28))}</td>
                <td class="px-3 py-2 text-right">${getLineAnnualUnits(line).toLocaleString("en-US")}</td>
                <td class="px-3 py-2 text-right">${formatCurrency(getLineAnnualCost(line, "labor"))}</td>
                <td class="px-3 py-2 text-right">
                  <button class="resource-editor-trigger text-sm font-semibold text-sea hover:underline" data-editor-kind="assignment" data-editor-mode="edit" data-entity-id="${line.id}">
                    Edit
                  </button>
                </td>
              </tr>
            `).join("") : `<tr><td colspan="8" class="px-3 py-3 text-sm text-slate-500">No employee assignments are available yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderResourceHiringView() {
  const hires = state.resourceManagement?.plannedHires || [];
  return `
    <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
      ${resourcePanelHeader("Hiring plan", "Track planned hires, start timing, and project demand.", "Add Hire", "hire")}
      ${renderHiringEditor()}
      <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
        <table class="compact-table min-w-full text-sm">
          <thead class="bg-stone-50 text-slate-500">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Position</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Labor Category</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Start Date</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Target Project</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Monthly Cost</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Status</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            ${hires.map((item) => `
              <tr>
                <td class="px-3 py-2 font-semibold text-ink">${item.name}</td>
                <td class="px-3 py-2">${laborCategoryById(item.laborCategoryId)?.name || item.laborCategoryId}</td>
                <td class="px-3 py-2 whitespace-nowrap">${formatShortDate(item.startDate || dateValueFromPeriod(item.startPeriod, 1))}</td>
                <td class="px-3 py-2">${state.projects.find((project) => project.id === item.targetProjectId)?.name || "Shared capacity"}</td>
                <td class="px-3 py-2 text-right">${formatCurrency(item.monthlyCost)}</td>
                <td class="px-3 py-2">${item.status}</td>
                <td class="px-3 py-2 text-right">
                  <button class="resource-editor-trigger text-sm font-semibold text-sea hover:underline" data-editor-kind="hire" data-editor-mode="edit" data-entity-id="${item.id}">
                    Edit
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderResourceAttritionView() {
  const exits = state.resourceManagement?.plannedExits || [];
  return `
    <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
      ${resourcePanelHeader("Attrition and terminations", "Plan exits, backfills, and workforce movement.", "Plan Attrition", "attrition")}
      ${renderAttritionEditor()}
      <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
        <table class="compact-table min-w-full text-sm">
          <thead class="bg-stone-50 text-slate-500">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Employee</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">End Date</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Type</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Backfill</th>
              <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Status</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            ${exits.map((item) => `
              <tr>
                <td class="px-3 py-2 font-semibold text-ink">${employeeById(item.employeeId)?.name || item.employeeId}</td>
                <td class="px-3 py-2 whitespace-nowrap">${formatShortDate(item.endDate || dateValueFromPeriod(item.period, 28))}</td>
                <td class="px-3 py-2">${item.type}</td>
                <td class="px-3 py-2">${item.backfill ? "Yes" : "No"}</td>
                <td class="px-3 py-2">${item.status}</td>
                <td class="px-3 py-2 text-right">
                  <button class="resource-editor-trigger text-sm font-semibold text-sea hover:underline" data-editor-kind="attrition" data-editor-mode="edit" data-entity-id="${item.id}">
                    Edit
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderResourceAnalyticsView() {
  const monthly = buildResourceMonthlySummary();
  const byCategory = buildResourceCategorySummary();
  return `
    <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
      <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Resources</p>
      <h2 class="mt-1 text-2xl font-semibold tracking-tight">Headcount and utilization analytics</h2>
      <div class="mt-4 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div class="overflow-x-auto rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Month</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">HC</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Assigned Hours</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Available Hours</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Utilization</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${monthly.map((item) => `
                <tr>
                  <td class="px-3 py-2 font-semibold text-ink">${state.meta.months[item.monthIndex]}</td>
                  <td class="px-3 py-2 text-right">${item.endingHeadcount}</td>
                  <td class="px-3 py-2 text-right">${Math.round(item.assignedHours).toLocaleString("en-US")}</td>
                  <td class="px-3 py-2 text-right">${Math.round(item.availableHours).toLocaleString("en-US")}</td>
                  <td class="px-3 py-2 text-right ${item.utilization > 100 ? "text-rose-700" : "text-slate-700"}">${item.utilization.toFixed(1)}%</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="overflow-x-auto rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Labor Category</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Headcount</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Projects</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Utilization</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${byCategory.map((item) => `
                <tr>
                  <td class="px-3 py-2 font-semibold text-ink">${item.laborCategoryName}</td>
                  <td class="px-3 py-2 text-right">${item.headcount}</td>
                  <td class="px-3 py-2 text-right">${item.projectCount}</td>
                  <td class="px-3 py-2 text-right ${item.utilization > 100 ? "text-rose-700" : "text-slate-700"}">${item.utilization.toFixed(1)}%</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function renderBudgetOverview() {
  const context = buildBudgetingContext();
  const projectsWithFinance = state.projects.filter((project) => project.backendFinanceModel).length;
  const displayScale = budgetDisplayScale();
  const unitLabel = budgetDisplayUnitLabel(displayScale);
  const chartScale = budgetChartScaleSettings();
  const suggestedChartScale = budgetChartSuggestedScale(context);
  const effectiveChartScale = {
    revenueMin: chartScale.revenueMin ?? suggestedChartScale.revenueMin,
    revenueMax: chartScale.revenueMax ?? suggestedChartScale.revenueMax,
    incomeMin: chartScale.incomeMin ?? suggestedChartScale.incomeMin,
    incomeMax: chartScale.incomeMax ?? suggestedChartScale.incomeMax
  };
  const weightedGrowthRevenue = Number(context.totals.pipelineWeightedRevenue || 0) + Number(context.totals.whiteSpaceWeightedRevenue || 0);
  const securedCoveragePct = context.totals.revenue > 0 ? (Number(context.totals.securedRevenue || 0) / Number(context.totals.revenue || 1)) * 100 : 0;
  const weightedCoveragePct = context.totals.revenue > 0 ? (weightedGrowthRevenue / Number(context.totals.revenue || 1)) * 100 : 0;

  return `
    <section class="space-y-6">
      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Consolidated P&amp;L</h2>
            <p class="mt-2 max-w-3xl text-sm text-slate-600">This portfolio view rolls all projects into a standard operating P&amp;L, then adds revenue adjustments, unutilized labor overhead, and indirect expenses.</p>
          </div>
          <label class="flex min-w-[13rem] flex-col gap-1 text-sm font-medium text-slate-700">
            <span>Display units</span>
            <select id="budgetDisplayScaleSelect" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
              <option value="dollars" ${displayScale === "dollars" ? "selected" : ""}>Whole dollars ($)</option>
              <option value="thousands" ${displayScale === "thousands" ? "selected" : ""}>Thousands ($000)</option>
              <option value="millions" ${displayScale === "millions" ? "selected" : ""}>Millions ($M)</option>
            </select>
          </label>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-4">
          ${summaryTile("Total Revenue", formatBudgetPAndLValue(context.totals.revenue, { scale: displayScale }))}
          ${summaryTile("Secured Revenue", formatBudgetPAndLValue(context.totals.securedRevenue, { scale: displayScale }))}
          ${summaryTile("Weighted Growth Revenue", formatBudgetPAndLValue(weightedGrowthRevenue, { scale: displayScale }))}
          ${summaryTile("Operating Margin %", `${context.totals.operatingMarginPct.toFixed(1)}%`)}
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-4">
          <div class="rounded-[1rem] border border-slate-200 bg-stone-50 px-4 py-3 text-sm text-slate-700">
            <span class="font-semibold text-ink">Pipeline weighted:</span> ${formatBudgetPAndLValue(context.totals.pipelineWeightedRevenue, { scale: displayScale })}
          </div>
          <div class="rounded-[1rem] border border-slate-200 bg-stone-50 px-4 py-3 text-sm text-slate-700">
            <span class="font-semibold text-ink">White space weighted:</span> ${formatBudgetPAndLValue(context.totals.whiteSpaceWeightedRevenue, { scale: displayScale })}
          </div>
          <div class="rounded-[1rem] border border-slate-200 bg-stone-50 px-4 py-3 text-sm text-slate-700">
            <span class="font-semibold text-ink">Revenue adjustments:</span> ${formatBudgetPAndLValue(context.totals.revenueAdjustments, { scale: displayScale })}
          </div>
          <div class="rounded-[1rem] border border-slate-200 bg-stone-50 px-4 py-3 text-sm text-slate-700">
            <span class="font-semibold text-ink">Projects on backend finance:</span> ${projectsWithFinance} of ${state.projects.length}
          </div>
        </div>
        <div class="mt-3 rounded-[1rem] border border-slate-200 bg-stone-50 px-4 py-3 text-sm text-slate-700">
          <span class="font-semibold text-ink">Closed through:</span> ${context.closedThroughPeriod ? periodLabel(context.closedThroughPeriod) : "No closed periods"}
          ${context.closedThroughPeriod ? ` · Closed months are shaded in gray. Click future revenue-adjustment or indirect-expense cells to jump into the adjustment form. Values are shown in ${unitLabel}.` : ""}
        </div>
        <div class="mt-5 overflow-x-auto rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="sticky left-0 z-20 w-[24rem] min-w-[24rem] border-r border-slate-200 bg-stone-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em] whitespace-nowrap">Line Item (${unitLabel})</th>
                ${state.meta.months.map((label, monthIndex) => `<th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em] whitespace-nowrap ${monthIndex <= context.closedThroughIndex ? "bg-slate-100 text-slate-600" : ""}">${label} ${state.selectedYear}</th>`).join("")}
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${context.pAndLRows.map((row) => `
                <tr class="${row.emphasis ? "bg-stone-50/80" : ""}">
                  <td class="sticky left-0 z-10 w-[24rem] min-w-[24rem] border-r border-slate-200 px-3 py-2 whitespace-nowrap ${row.emphasis ? "bg-stone-50/80 font-semibold text-ink" : "bg-white text-slate-700"}">${row.label}</td>
                  ${row.values.map((value, monthIndex) => {
                    const cellValue = formatBudgetPAndLValue(value, { type: row.type, scale: displayScale });
                    const isClosed = monthIndex <= context.closedThroughIndex;
                    const editable = !isClosed && isEditableBudgetRow(row);
                    return `
                    <td class="px-3 py-2 text-right whitespace-nowrap ${row.emphasis ? "font-semibold text-ink" : "text-slate-700"} ${isClosed ? "bg-slate-100/90" : ""}">
                      ${editable ? `
                        <button
                          type="button"
                          class="budget-edit-cell rounded-md px-1.5 py-0.5 font-semibold text-sea underline-offset-2 hover:underline"
                          data-budget-row="${row.key}"
                          data-budget-month-index="${monthIndex}"
                        >${cellValue}</button>
                      ` : cellValue}
                    </td>
                  `;
                  }).join("")}
                  <td class="px-3 py-2 text-right whitespace-nowrap ${row.emphasis ? "font-semibold text-ink" : "text-slate-700"}">
                    ${formatBudgetPAndLValue(row.total, { type: row.type, scale: displayScale })}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
          <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Revenue composition</h2>
          <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
            <table class="compact-table min-w-full text-sm">
              <thead class="bg-stone-50 text-slate-500">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Source</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Count</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Unweighted Revenue</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Weighted Revenue</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Assumed Cost</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Weighted Margin</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${context.sourceComposition.map((row) => `
                  <tr>
                    <td class="px-3 py-2 font-semibold text-ink">${row.label}</td>
                    <td class="px-3 py-2 text-right">${row.count}</td>
                    <td class="px-3 py-2 text-right">${formatBudgetPAndLValue(row.unweightedRevenue, { scale: displayScale })}</td>
                    <td class="px-3 py-2 text-right">${formatBudgetPAndLValue(row.weightedRevenue, { scale: displayScale })}</td>
                    <td class="px-3 py-2 text-right">${formatBudgetPAndLValue(row.weightedCost, { scale: displayScale })}</td>
                    <td class="px-3 py-2 text-right">${formatBudgetPAndLValue(row.weightedMargin, { scale: displayScale })}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>

        <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
          <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Coverage and risk</h2>
          <div class="mt-4 space-y-2">
            ${dashboardStatLight("Secured coverage", `${securedCoveragePct.toFixed(1)}% of total revenue`)}
            ${dashboardStatLight("Weighted growth coverage", `${weightedCoveragePct.toFixed(1)}% of total revenue`)}
            ${dashboardStatLight("Months below floor", String(context.riskSummary.monthsBelowFloor))}
            ${dashboardStatLight("Months above ceiling", String(context.riskSummary.monthsAboveCeiling))}
            ${dashboardStatLight("At-risk revenue", formatBudgetPAndLValue(context.riskSummary.annualAtRiskRevenue, { scale: displayScale }))}
            ${dashboardStatLight("Low-confidence revenue", formatBudgetPAndLValue(context.riskSummary.lowConfidenceRevenue, { scale: displayScale }))}
          </div>
        </section>
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
          <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting Review</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">What changed</h2>
          <div class="mt-4 grid gap-3 md:grid-cols-2">
            ${dashboardStatLight("Management revenue lift", formatBudgetPAndLValue(context.managementSummary.revenueLift, { scale: displayScale }))}
            ${dashboardStatLight("Management reductions", formatBudgetPAndLValue(context.managementSummary.revenueReduction, { scale: displayScale }))}
            ${dashboardStatLight("Indirect expense adds", formatBudgetPAndLValue(context.managementSummary.indirectExpenseTotal, { scale: displayScale }))}
            ${dashboardStatLight("Average direct labor rate", formatBudgetPAndLValue(context.averageDirectLaborRate, { scale: displayScale }))}            
          </div>
          <div class="mt-4 rounded-[1rem] border border-slate-200 bg-stone-50 px-4 py-3 text-sm text-slate-700">
            <p class="font-semibold text-ink">Controller summary</p>
            <p class="mt-1">
              Secured backlog covers ${securedCoveragePct.toFixed(1)}% of the company forecast. Weighted pipeline and white space contribute ${weightedCoveragePct.toFixed(1)}%,
              while management adjustments add ${formatBudgetPAndLValue(context.managementSummary.revenueLift - context.managementSummary.revenueReduction, { scale: displayScale })} of net revenue movement.
              The current plan carries ${formatBudgetPAndLValue(context.riskSummary.annualAtRiskRevenue, { scale: displayScale })} of at-risk growth revenue.
            </p>
          </div>
        </section>

        <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
          <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting Review</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Management adjustments</h2>
          <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
            <table class="compact-table min-w-full text-sm">
              <thead class="bg-stone-50 text-slate-500">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Measure</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Value</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                <tr><td class="px-3 py-2 font-semibold text-ink">Revenue adjustment entries</td><td class="px-3 py-2 text-right">${context.managementSummary.revenueAdjustmentCount}</td></tr>
                <tr><td class="px-3 py-2 font-semibold text-ink">Indirect expense entries</td><td class="px-3 py-2 text-right">${context.managementSummary.indirectExpenseCount}</td></tr>
                <tr><td class="px-3 py-2 font-semibold text-ink">Revenue lift</td><td class="px-3 py-2 text-right">${formatBudgetPAndLValue(context.managementSummary.revenueLift, { scale: displayScale })}</td></tr>
                <tr><td class="px-3 py-2 font-semibold text-ink">Revenue reduction</td><td class="px-3 py-2 text-right">${formatBudgetPAndLValue(context.managementSummary.revenueReduction, { scale: displayScale })}</td></tr>
                <tr><td class="px-3 py-2 font-semibold text-ink">Indirect expense total</td><td class="px-3 py-2 text-right">${formatBudgetPAndLValue(context.managementSummary.indirectExpenseTotal, { scale: displayScale })}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Quarterly revenue bridge</h2>
        <div class="mt-4 grid gap-3 md:grid-cols-4">
          ${context.quarters.labels.map((label, index) => {
            const revenue = Number(context.quarters.totalRevenue[index] || 0);
            const targetFloor = 90_000_000;
            const targetCeiling = 105_000_000;
            const status = revenue < targetFloor ? "Below band" : revenue > targetCeiling ? "Above band" : "In band";
            return dashboardStatLight(
              `${label} revenue`,
              `${formatBudgetPAndLValue(revenue, { scale: displayScale })} · ${status}`
            );
          }).join("")}
        </div>
        <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Line Item</th>
                ${context.quarters.labels.map((label) => `<th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">${label}</th>`).join("")}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${[
                ["Secured Revenue", context.quarters.securedRevenue],
                ["Revenue Adjustments", context.quarters.revenueAdjustments],
                ["Pipeline Revenue (Weighted)", context.quarters.pipelineRevenueWeighted],
                ["White Space Revenue (Weighted)", context.quarters.whiteSpaceRevenueWeighted],
                ["Total Revenue", context.quarters.totalRevenue],
                ["Total Direct Cost", context.quarters.totalDirectCost],
                ["Total Overhead", context.quarters.totalOverhead],
                ["Operating Income", context.quarters.operatingIncome]
              ].map(([label, values]) => `
                <tr>
                  <td class="px-3 py-2 font-semibold text-ink">${label}</td>
                  ${values.map((value) => `<td class="px-3 py-2 text-right">${formatBudgetPAndLValue(value, { scale: displayScale })}</td>`).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting Review</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Monthly revenue coverage</h2>
        <p class="mt-2 text-sm text-slate-600">This view shows how secured backlog, weighted growth, and management adjustments build the monthly forecast. At-risk revenue is the portion of weighted growth tied to low-confidence opportunities.</p>
        <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Month</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Secured</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Weighted Growth</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Adjustments</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Total Revenue</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Pipeline At-Risk</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">White Space At-Risk</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">At-Risk Revenue</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${context.monthlyCoverage.map((row) => {
                const weightedGrowth = Number(row.pipelineRevenueWeighted || 0) + Number(row.whiteSpaceRevenueWeighted || 0);
                return `
                  <tr>
                    <td class="px-3 py-2 font-semibold text-ink">${state.meta.months[row.monthIndex]}</td>
                    <td class="px-3 py-2 text-right">${formatBudgetPAndLValue(row.securedRevenue, { scale: displayScale })}</td>
                    <td class="px-3 py-2 text-right">${formatBudgetPAndLValue(weightedGrowth, { scale: displayScale })}</td>
                    <td class="px-3 py-2 text-right">${formatBudgetPAndLValue(row.revenueAdjustments, { scale: displayScale })}</td>
                    <td class="px-3 py-2 text-right font-semibold text-ink">${formatBudgetPAndLValue(row.totalRevenue, { scale: displayScale })}</td>
                    <td class="px-3 py-2 text-right">${formatBudgetPAndLValue(row.pipelineAtRiskRevenue, { scale: displayScale })}</td>
                    <td class="px-3 py-2 text-right">${formatBudgetPAndLValue(row.whiteSpaceAtRiskRevenue, { scale: displayScale })}</td>
                    <td class="px-3 py-2 text-right font-semibold text-amber-700">${formatBudgetPAndLValue(row.atRiskRevenue, { scale: displayScale })}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Revenue and profit trend</h2>
            <p class="mt-2 text-sm text-slate-600">Revenue is shown as a monthly line and operating income is shown as monthly bars, each with its own scale so both patterns stay readable.</p>
          </div>
          <div class="text-sm text-slate-600">
            <span class="font-semibold text-ink">Chart scale:</span> Full dollars
          </div>
        </div>
        <form id="budgetChartScaleForm" class="mt-4 grid gap-3 rounded-[1rem] border border-slate-200 bg-stone-50 p-4 md:grid-cols-4">
          <label class="space-y-1 text-sm font-medium text-slate-700">
            <span>Revenue axis min</span>
            <input name="revenueMin" type="number" step="100000" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value="${formatBudgetChartControlValue(effectiveChartScale.revenueMin)}" placeholder="Auto" />
          </label>
          <label class="space-y-1 text-sm font-medium text-slate-700">
            <span>Revenue axis max</span>
            <input name="revenueMax" type="number" step="100000" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value="${formatBudgetChartControlValue(effectiveChartScale.revenueMax)}" placeholder="Auto" />
          </label>
          <label class="space-y-1 text-sm font-medium text-slate-700">
            <span>Income axis min</span>
            <input name="incomeMin" type="number" step="100000" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value="${formatBudgetChartControlValue(effectiveChartScale.incomeMin)}" placeholder="Auto" />
          </label>
          <label class="space-y-1 text-sm font-medium text-slate-700">
            <span>Income axis max</span>
            <input name="incomeMax" type="number" step="100000" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value="${formatBudgetChartControlValue(effectiveChartScale.incomeMax)}" placeholder="Auto" />
          </label>
          <div class="md:col-span-4 flex flex-wrap items-center justify-end gap-3">
            <button type="button" id="budgetChartScaleResetBtn" class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Reset to Auto</button>
            <button type="submit" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Apply Chart Scale</button>
          </div>
        </form>
        <div class="mt-5 h-80">
          <canvas id="budgetPnLChart"></canvas>
        </div>
      </section>

      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Revenue composition by month</h2>
            <p class="mt-2 text-sm text-slate-600">This chart breaks total revenue into secured backlog, weighted pipeline, and weighted white space so we can see how much of each month is supported by contracted work versus future growth.</p>
          </div>
        </div>
        <div class="mt-5 h-80">
          <canvas id="budgetRevenueCompositionChart"></canvas>
        </div>
      </section>

      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Sales by month</h2>
            <p class="mt-2 text-sm text-slate-600">This chart shows unweighted sales volume by month for pipeline and white space, separate from weighted forecast revenue.</p>
          </div>
        </div>
        <div class="mt-5 h-80">
          <canvas id="budgetSalesTrendChart"></canvas>
        </div>
      </section>
    </section>
  `;
}

function renderBudgetRollupView() {
  const context = buildBudgetingContext();
  const clientGroups = new Map();
  context.projectContributions.forEach((project) => {
    const sourceProject = state.projects.find((item) => item.id === project.projectId);
    const clientName = sourceProject?.client || "Unassigned Client";
    if (!clientGroups.has(clientName)) {
      clientGroups.set(clientName, {
        clientName,
        projects: [],
        totals: {
          revenue: 0,
          directCost: 0,
          grossMargin: 0
        }
      });
    }
    const group = clientGroups.get(clientName);
    group.projects.push(project);
    group.totals.revenue += Number(project.totals.revenue || 0);
    group.totals.directCost += Number(project.totals.directCost || 0);
    group.totals.grossMargin += Number(project.totals.grossMargin || 0);
  });
  const groupedClients = [...clientGroups.values()].sort((left, right) =>
    left.clientName.localeCompare(right.clientName, undefined, { sensitivity: "base" })
  );
  return `
    <section class="space-y-6">
      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Projects by client</h2>
        <div class="mt-4 space-y-5">
          ${groupedClients.map((group) => `
            <section class="rounded-[1.25rem] border border-slate-200 bg-stone-50/70 p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-lg font-semibold text-ink">${group.clientName}</p>
                  <p class="text-sm text-slate-500">${group.projects.length} project${group.projects.length === 1 ? "" : "s"}</p>
                </div>
                <div class="grid gap-2 sm:grid-cols-3">
                  ${dashboardStatLight("Revenue", formatCompactCurrency(group.totals.revenue))}
                  ${dashboardStatLight("Direct Cost", formatCompactCurrency(group.totals.directCost))}
                  ${dashboardStatLight("Gross Margin", formatCompactCurrency(group.totals.grossMargin))}
                </div>
              </div>
              <div class="mt-4 overflow-x-auto rounded-[1rem] border border-slate-200 bg-white">
                <table class="compact-table min-w-full text-sm">
                  <thead class="bg-stone-50 text-slate-500">
                    <tr>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Project</th>
                      <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Revenue</th>
                      <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Direct Cost</th>
                      <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Gross Margin</th>
                      <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Margin %</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 bg-white">
                    ${group.projects.map((project) => `
                      <tr>
                        <td class="px-3 py-2 font-semibold text-ink">${project.projectName}</td>
                        <td class="px-3 py-2 text-right">${formatCompactCurrency(project.totals.revenue)}</td>
                        <td class="px-3 py-2 text-right">${formatCompactCurrency(project.totals.directCost)}</td>
                        <td class="px-3 py-2 text-right">${formatCompactCurrency(project.totals.grossMargin)}</td>
                        <td class="px-3 py-2 text-right">${project.totals.marginPct.toFixed(1)}%</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            </section>
          `).join("")}
        </div>
      </section>
    </section>
  `;
}

function renderBudgetRevenueSourcesView() {
  const revenueSourceDraft = budgetRevenueSourceDraft();
  const revenueSourceRows = [
    ...(state.budgeting?.opportunities || []).map((item) => ({ ...item, sourceType: "pipeline" })),
    ...(state.budgeting?.whitespace || []).map((item) => ({ ...item, sourceType: "whitespace" }))
  ].sort((left, right) => comparePeriodValues(left.startPeriod, right.startPeriod));
  return `
    <section class="space-y-6">
      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Sales planning</h2>
        <p class="mt-2 text-sm text-slate-600">Capture future revenue sources with probability, timing, and assumed margin so they flow into weighted revenue and cost forecasts.</p>
        <form id="budgetRevenueSourceForm" class="mt-4 space-y-4">
          <input type="hidden" name="id" value="${revenueSourceDraft.id || ""}" />
          <div class="grid gap-4 md:grid-cols-2">
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Source Type</span>
              <select name="sourceType" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="pipeline" ${revenueSourceDraft.sourceType === "pipeline" ? "selected" : ""}>Pipeline Opportunity</option>
                <option value="whitespace" ${revenueSourceDraft.sourceType === "whitespace" ? "selected" : ""}>White Space / Go Get</option>
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Owner</span>
              <input name="owner" type="text" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Capture owner" value="${revenueSourceDraft.owner || ""}" />
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
              <span>Name</span>
              <input name="name" type="text" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Opportunity or growth target name" value="${revenueSourceDraft.name || ""}" required />
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Client / Market</span>
              <input name="client" type="text" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Client, market, or account" value="${revenueSourceDraft.client || ""}" />
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Assign To Project</span>
              <select name="projectId" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="" ${!revenueSourceDraft.projectId ? "selected" : ""}>Unassigned / Growth Pool</option>
                ${state.projects.map((project) => `<option value="${project.id}" ${project.id === revenueSourceDraft.projectId ? "selected" : ""}>${project.name}</option>`).join("")}
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Stage</span>
              <select name="stage" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                ${PIPELINE_STAGE_OPTIONS.map((stage) => `<option value="${stage}" ${stage === revenueSourceDraft.stage ? "selected" : ""}>${stage}</option>`).join("")}
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Probability %</span>
              <input name="probability" type="number" min="0" max="100" step="1" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value="${revenueSourceDraft.probability || ""}" required />
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Total Revenue</span>
              <input name="value" type="number" min="0" step="0.01" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value="${revenueSourceDraft.value || ""}" required />
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Assumed Margin %</span>
              <input name="marginRate" type="number" min="0" max="100" step="0.1" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value="${revenueSourceDraft.marginRate || ""}" required />
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Start Period</span>
              <select name="startPeriod" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                ${periodOptionList(revenueSourceDraft.startPeriod || `${state.selectedYear}-07`)}
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>End Period</span>
              <select name="endPeriod" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                ${periodOptionList(revenueSourceDraft.endPeriod || `${state.selectedYear}-12`)}
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
              <span>Rationale</span>
              <textarea name="note" rows="3" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Why this revenue source is credible, risky, or strategic">${revenueSourceDraft.note || ""}</textarea>
            </label>
          </div>
          <div class="flex items-center justify-end gap-3">
            ${revenueSourceDraft.id ? '<button type="button" id="budgetRevenueSourceCancelBtn" class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel Edit</button>' : ""}
            <button type="submit" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">${revenueSourceDraft.id ? "Save Revenue Source" : "Add Revenue Source"}</button>
          </div>
        </form>
      </section>

      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Revenue source ledger</h2>
        <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Type</th>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Name</th>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Stage / Owner</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Probability</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Weighted Revenue</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${revenueSourceRows.length ? revenueSourceRows.map((entry) => {
                const weightedRevenue = Number(entry.value || 0) * (Number(entry.probability || 0) / 100);
                return `
                  <tr>
                    <td class="px-3 py-2">${budgetRevenueSourceTypePill(entry.sourceType)}</td>
                    <td class="px-3 py-2">
                      <div class="font-semibold text-ink">${entry.name}</div>
                      <div class="text-xs text-slate-500">${entry.client || entry.note || "No rationale provided"}</div>
                    </td>
                    <td class="px-3 py-2 text-slate-700">${entry.stage || "—"}<div class="text-xs text-slate-500">${entry.owner || "No owner"}</div></td>
                    <td class="px-3 py-2 text-right">${Number(entry.probability || 0).toFixed(0)}%</td>
                    <td class="px-3 py-2 text-right">${formatCurrency(weightedRevenue)}</td>
                    <td class="px-3 py-2 text-right">
                      <button class="budget-revenue-source-edit text-sm font-semibold text-sea hover:underline" data-source-type="${entry.sourceType}" data-source-id="${entry.id}">Edit</button>
                      <button class="budget-revenue-source-delete ml-3 text-sm font-semibold text-slate-500 hover:text-rose-700 hover:underline" data-source-type="${entry.sourceType}" data-source-id="${entry.id}">Remove</button>
                    </td>
                  </tr>
                `;
              }).join("") : `<tr><td colspan="6" class="px-3 py-3 text-sm text-slate-500">No pipeline or white-space entries yet. Add one to begin shaping the growth forecast.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function renderBudgetScenariosView() {
  const context = buildBudgetingContext();
  const draft = budgetAdjustmentDraft();
  return `
    <section class="space-y-6">
      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Expenses</h2>
        <p class="mt-2 text-sm text-slate-600">Use this form to add indirect expenses or adjust planned revenue without editing the underlying project plans.</p>
        <form id="budgetAdjustmentForm" class="mt-4 space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Type</span>
              <select name="type" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="indirect" ${draft.type === "indirect" ? "selected" : ""}>Indirect Expense</option>
                <option value="revenue" ${draft.type === "revenue" ? "selected" : ""}>Revenue Adjustment</option>
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Category</span>
              <select name="category" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                ${budgetAdjustmentCategoryOptions(draft.type, draft.category)}
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
              <span>Description</span>
              <input name="description" type="text" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Describe the adjustment" value="${draft.description || ""}" required />
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Project</span>
              <select name="projectId" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="" ${!draft.projectId ? "selected" : ""}>Portfolio / Corporate</option>
                ${state.projects.map((project) => `<option value="${project.id}" ${project.id === draft.projectId ? "selected" : ""}>${project.name}</option>`).join("")}
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Impact</span>
              <select name="direction" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                ${draft.type === "revenue"
                  ? `
                    <option value="1" ${String(draft.direction) === "1" ? "selected" : ""}>Add / Increase</option>
                    <option value="-1" ${String(draft.direction) === "-1" ? "selected" : ""}>Subtract / Reduce</option>
                  `
                  : `<option value="1" selected>Add Expense</option>`}
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Amount</span>
              <input name="amount" type="number" min="0" step="0.01" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="0.00" value="${draft.amount || ""}" required />
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Spread</span>
              <select name="spreadMethod" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="single" ${draft.spreadMethod === "single" ? "selected" : ""}>Single Period</option>
                <option value="even" ${draft.spreadMethod === "even" ? "selected" : ""}>Even Spread</option>
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>Start Period</span>
              <select name="startPeriod" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                ${periodOptionList(draft.startPeriod || `${state.selectedYear}-01`)}
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-slate-700">
              <span>End Period</span>
              <select name="endPeriod" class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                ${periodOptionList(draft.endPeriod || `${state.selectedYear}-12`)}
              </select>
            </label>
          </div>
          <div class="flex justify-end">
            <button type="submit" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Add Adjustment</button>
          </div>
        </form>
      </section>

      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Budgeting</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Expense ledger</h2>
        <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Type</th>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Category</th>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Description</th>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Period</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Amount</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${context.adjustments.length ? context.adjustments.map((entry) => `
                <tr>
                  <td class="px-3 py-2">${budgetAdjustmentTypePill(entry.type)}</td>
                  <td class="px-3 py-2 text-slate-700">${entry.category}</td>
                  <td class="px-3 py-2">
                    <div class="font-semibold text-ink">${entry.description}</div>
                    <div class="text-xs text-slate-500">${entry.projectId ? (state.projects.find((project) => project.id === entry.projectId)?.name || "Project") : "Portfolio / Corporate"}</div>
                  </td>
                  <td class="px-3 py-2 text-slate-700">${entry.startPeriod}${entry.endPeriod && entry.endPeriod !== entry.startPeriod ? ` to ${entry.endPeriod}` : ""}</td>
                  <td class="px-3 py-2 text-right ${entry.direction < 0 ? "text-rose-700" : "text-slate-700"}">${entry.direction < 0 ? "-" : "+"}${formatCompactCurrency(entry.amount).replace(/^-/, "")}</td>
                  <td class="px-3 py-2 text-right">
                    <button class="budget-adjustment-delete text-sm font-semibold text-sea hover:underline" data-adjustment-id="${entry.id}">Remove</button>
                  </td>
                </tr>
              `).join("") : `<tr><td colspan="6" class="px-3 py-3 text-sm text-slate-500">No adjustments yet. Add an indirect expense or revenue change to see it roll into the P&amp;L.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function renderPlanSummary() {
  const project = getProject();
  const context = currentProjectContext();
  const backendSummary = context.backendFinance?.summary || {};
  const categorySummary = mergeAuthoritativeCategorySummary(project, context.backendFinance?.categorySummary || []);
  const totals = {
    plan: categorySummary.reduce((sum, row) => sum + Number(row.budget || sumPlanCost(row.key) || 0), 0),
    eac: Number(backendSummary.eacCost || categorySummary.reduce((sum, row) => sum + row.eac, 0)),
    variance: categorySummary.reduce((sum, row) => sum + row.varianceToBudget, 0)
  };
  const warnings = [
    totals.variance > 0 ? `Total cost is ${formatCompactCurrency(totals.variance)} over plan.` : null,
    categorySummary.find((row) => Math.abs(row.varianceToBudget) > 100000)
      ? `${categorySummary.find((row) => Math.abs(row.varianceToBudget) > 100000).label} has a material variance.`
      : null,
    (project.reviewSignals?.missingActualMappings || 0) > 0 ? `${project.reviewSignals.missingActualMappings} actual mapping item(s) still need review.` : null
  ].filter(Boolean);
  return `
    <div class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div class="space-y-4">
        <div class="grid gap-3 md:grid-cols-3">
          ${summaryTile("Planned Cost", formatCompactCurrency(totals.plan))}
          ${summaryTile("EAC Cost", formatCompactCurrency(totals.eac))}
          ${summaryTile("Variance", formatCompactCurrency(totals.variance), totals.variance > 0)}
        </div>
        <div class="overflow-x-auto rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Category</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Lines</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Planned Cost</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">EAC</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Variance</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${categorySummary.map((row) => `
                <tr>
                  <td class="px-3 py-2">
                    <button class="plan-driver-link font-semibold text-ink underline-offset-2 hover:underline" data-plan-tab="${row.key}">
                      ${row.label}
                    </button>
                  </td>
                  <td class="px-3 py-2 text-right">${project.planning?.[row.key]?.length || 0}</td>
                  <td class="px-3 py-2 text-right">${formatCompactCurrency(Number(row.budget || sumPlanCost(row.key) || 0))}</td>
                  <td class="px-3 py-2 text-right">${formatCompactCurrency(row.eac)}</td>
                  <td class="px-3 py-2 text-right ${row.varianceToBudget > 0 ? "text-rose-700" : "text-emerald-700"}">${formatVarianceCell(row.varianceToBudget, percentChange(row.eac, row.budget))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
        <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Validation Cues</p>
        <h3 class="mt-2 text-lg font-semibold text-ink">Before drilling into detail</h3>
        <div class="mt-4 space-y-2">
          ${warnings.length ? warnings.map((warning) => `
            <div class="rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
              ${warning}
            </div>
          `).join("") : `<div class="rounded-xl bg-white px-3 py-2 text-sm text-slate-700">No major plan validation issues detected in the prototype data.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderPlanningDetail(category) {
  const project = getProject();
  const actualsThroughPeriod = resolveActualsThroughPlanningPeriod(project);
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.labor;
  const lines = project.planning?.[category] || [];
  const horizon = planningDisplayModel();
  const stickyHeaders = config.columns.length >= 2;
  const availableEmployees = category === "labor" ? employeeOptions().length : 0;
  const editor = getResourceEditor();

  return `
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-xl font-semibold tracking-tight text-ink">${config.label}</h3>
          <p class="mt-1 text-sm text-slate-600">${category === "labor" ? `${availableEmployees} employees are currently available for labor planning.${actualsThroughPeriod ? ` Actual periods through ${periodLabel(actualsThroughPeriod)} are locked and shown in gray.` : ""}` : `Use compact line items and keep adding rows as needed.${actualsThroughPeriod ? ` Actual periods through ${periodLabel(actualsThroughPeriod)} are locked and shown in gray.` : ""}`}</p>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <label class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">From</span>
            <select id="planHorizonStartYear" class="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm">
              ${planningYearRangeOptions().map((year) => `<option value="${year}" ${year === horizon.startYear ? "selected" : ""}>${year}</option>`).join("")}
            </select>
          </label>
          <label class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">To</span>
            <select id="planHorizonEndYear" class="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm">
              ${planningYearRangeOptions().map((year) => `<option value="${year}" ${year === horizon.endYear ? "selected" : ""}>${year}</option>`).join("")}
            </select>
          </label>
          <button class="add-line-btn rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slateblue" data-category="${category}">
            ${config.addLabel}
          </button>
        </div>
      </div>
      ${category === "labor" && editor.kind === "hire" ? renderHiringEditor() : ""}
      <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
        <table class="compact-table min-w-full text-sm">
          <thead class="bg-stone-50 text-slate-500">
            <tr>
              ${config.columns.map(([, label], index) => {
                const [field] = config.columns[index];
                const stickyClass = stickyHeaders
                  ? index === 0
                    ? `sticky-col sticky-col-1 sticky-z-header ${config.stickyColumnClass || ""}-1`
                    : index === 1
                      ? `sticky-col sticky-col-2 sticky-z-header ${config.stickyColumnClass || ""}-2`
                      : ""
                  : "";
                return `<th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em] ${stickyClass} ${planningColumnClass(category, field, index)}">${label}</th>`;
              }).join("")}
              <th class="px-2 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">PY</th>
              ${horizon.visibleYears.map((year) => state.meta.months.map((month) => `<th class="px-2 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">${month} ${String(year).slice(2)}</th>`).join("")).join("")}
              <th class="px-2 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Out Years</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">${config.unitLabel}</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Cost</th>
              <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Revenue</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            ${lines.map((line, lineIndex) => planningLineRow(project, category, line, lineIndex, horizon, actualsThroughPeriod)).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function planningLineRow(project, category, line, lineIndex, horizon, actualsThroughPeriod = null) {
  const config = CATEGORY_CONFIG[category];
  const hydrated = category === "labor" ? hydrateLaborLine(line) : line;
  const pyUnits = lineMonthsForYear(line, horizon.priorYear).reduce((sum, value) => sum + value, 0);
  const outYearsUnits = horizon.endYear > horizon.outYearsStart - 1
    ? Array.from({ length: Math.max(horizon.endYear - horizon.outYearsStart + 1, 0) }, (_, index) => horizon.outYearsStart + index)
      .reduce((sum, year) => sum + lineMonthsForYear(line, year).reduce((yearSum, value) => yearSum + value, 0), 0)
    : 0;
  const totalUnits = lineUnitsAcrossYears(line, horizon.startYear, horizon.endYear);
  const totalCost = lineCostAcrossYears(line, category, horizon.startYear, horizon.endYear);
  const currentYearCost = lineCostAcrossYears(line, category, state.selectedYear, state.selectedYear);
  const currentYearRevenue = getLineRevenue(line, category, project, state.selectedYear);
  const revenueFactor = currentYearCost > 0 ? currentYearRevenue / currentYearCost : 0;
  const totalRevenue = totalCost * revenueFactor;
  return `
    <tr>
      ${config.columns.map(([field], columnIndex) => renderLineCell(category, lineIndex, field, hydrated, config, columnIndex)).join("")}
      <td class="px-1 py-[0.04rem] text-right text-sm text-slate-600">${pyUnits.toLocaleString("en-US")}</td>
      ${horizon.visibleYears.map((year) => lineMonthsForYear(line, year).map((value, monthIndex) => {
        const locked = isPlanningPeriodLocked(year, monthIndex + 1, actualsThroughPeriod);
        return `
        <td class="px-1.5 py-1.5 ${locked ? "bg-slate-100/90" : ""}">
          <input
            type="number"
            value="${value}"
            class="monthly-input compact-input w-20 rounded-md border px-2 py-[0.1rem] text-right text-sm ${locked ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : "border-slate-200 bg-white"}"
            data-category="${category}"
            data-line-index="${lineIndex}"
            data-year="${year}"
            data-month-index="${monthIndex}"
            ${locked ? 'disabled title="Actual period is locked"' : ""}
          >
        </td>
      `;
      }).join("")).join("")}
      <td class="px-1 py-[0.04rem] text-right text-sm text-slate-600">${outYearsUnits.toLocaleString("en-US")}</td>
      <td class="px-3 py-[0.04rem] text-right text-sm font-medium text-slate-600">${totalUnits.toLocaleString("en-US")}</td>
      <td class="px-3 py-[0.04rem] text-right text-sm font-semibold text-slate-700">${formatCurrency(totalCost)}</td>
      <td class="px-3 py-[0.04rem] text-right text-sm font-semibold text-slate-700">${formatCurrency(totalRevenue)}</td>
    </tr>
  `;
}

function renderLineCell(category, lineIndex, field, line, config, columnIndex = -1) {
  const stickyClass = config?.columns?.length >= 2
    ? columnIndex === 0
      ? `sticky-col sticky-col-1 sticky-z-cell ${config.stickyColumnClass || ""}-1`
      : columnIndex === 1
        ? `sticky-col sticky-col-2 sticky-z-cell ${config.stickyColumnClass || ""}-2`
        : ""
    : "";
  const widthClass = planningColumnClass(category, field, columnIndex);

  if (category !== "labor") {
    if (category === "subcontractors" && field === "vendor") {
      const vendors = vendorOptions();
      return `
        <td class="px-2 py-1.5 ${stickyClass} ${widthClass}">
          <select
            class="line-input compact-input w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            data-category="${category}"
            data-line-index="${lineIndex}"
            data-field="${field}"
          >
            ${vendors.length
              ? vendors.map((vendor) => `<option value="${vendor.displayName}" ${vendor.displayName === line[field] ? "selected" : ""}>${vendor.displayName}</option>`).join("")
              : `<option value="${line[field] ?? ""}">${line[field] || "No live vendors available"}</option>`}
          </select>
        </td>
      `;
    }

    if (category === "equipment" && field === "item") {
      const equipment = equipmentOptions();
      return `
        <td class="px-2 py-1.5 ${stickyClass} ${widthClass}">
          <select
            class="line-input compact-input w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            data-category="${category}"
            data-line-index="${lineIndex}"
            data-field="${field}"
          >
            ${equipment.length
              ? equipment.map((item) => `<option value="${item.equipment_name}" ${item.equipment_name === line[field] ? "selected" : ""}>${item.equipment_name}</option>`).join("")
              : `<option value="${line[field] ?? ""}">${line[field] || "No equipment catalog available"}</option>`}
          </select>
        </td>
      `;
    }

    if (category === "materials" && field === "item") {
      const materials = materialOptions();
      return `
        <td class="px-2 py-1.5 ${stickyClass} ${widthClass}">
          <select
            class="line-input compact-input w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            data-category="${category}"
            data-line-index="${lineIndex}"
            data-field="${field}"
          >
            ${materials.length
              ? materials.map((item) => `<option value="${item.name}" ${item.name === line[field] ? "selected" : ""}>${item.name}</option>`).join("")
              : `<option value="${line[field] ?? ""}">${line[field] || "No material items available"}</option>`}
          </select>
        </td>
      `;
    }

    if (category === "odc" && field === "item") {
      const odcItems = odcOptions();
      return `
        <td class="px-2 py-1.5 ${stickyClass} ${widthClass}">
          <select
            class="line-input compact-input w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            data-category="${category}"
            data-line-index="${lineIndex}"
            data-field="${field}"
          >
            ${odcItems.length
              ? odcItems.map((item) => `<option value="${item.odc_name}" ${item.odc_name === line[field] ? "selected" : ""}>${item.odc_name}</option>`).join("")
              : `<option value="${line[field] ?? ""}">${line[field] || "No ODC catalog available"}</option>`}
          </select>
        </td>
      `;
    }

    const type = field === "rate" ? "number" : "text";
    return `
      <td class="px-2 py-1.5 ${stickyClass} ${widthClass}">
        <input
          type="${type}"
          value="${line[field] ?? ""}"
          class="line-input compact-input w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          data-category="${category}"
          data-line-index="${lineIndex}"
          data-field="${field}"
        >
      </td>
    `;
  }

  if (field === "employee") {
    return `
      <td class="px-2 py-1 sticky-col sticky-col-1 sticky-z-cell labor-name-cell ${widthClass}">
        <select class="line-input compact-input labor-employee-select w-full rounded-md border border-slate-200 px-2 py-1 text-sm" data-category="${category}" data-line-index="${lineIndex}" data-field="employeeId">
          ${employeeOptions().length
            ? employeeOptions().map((employee) => `<option value="${employee.id}" ${employee.id === line.employeeId ? "selected" : ""}>${employee.name}</option>`).join("")
            : `<option value="${line.employeeId || ""}">No live employees available</option>`}
        </select>
      </td>
    `;
  }

  if (field === "role") {
    return `
      <td class="px-2 py-1 sticky-col sticky-col-2 sticky-z-cell labor-role-cell ${widthClass}">
        <select class="line-input compact-input labor-role-select w-full rounded-md border border-slate-200 px-2 py-1 text-sm" data-category="${category}" data-line-index="${lineIndex}" data-field="laborCategoryId">
          ${(state.masterData.laborCategories || []).map((item) => `<option value="${item.id}" ${item.id === line.laborCategoryId ? "selected" : ""}>${item.name}</option>`).join("")}
        </select>
      </td>
    `;
  }

  return `
    <td class="px-2 py-1.5 ${stickyClass} ${widthClass}">
      <input
        type="number"
        value="${line[field] ?? ""}"
        class="line-input compact-input w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        data-category="${category}"
        data-line-index="${lineIndex}"
        data-field="${field}"
      >
    </td>
  `;
}

function renderFinancialsView() {
  const project = getProject();
  const context = currentProjectContext();
  const backendSummary = context.backendFinance?.summary || {};
  const fixedPriceProject = isFixedPriceContract(project);
  const monthly = buildMonthlyMetrics(project);
  const categorySummary = mergeAuthoritativeCategorySummary(project, context.backendFinance?.categorySummary || []);
  const largestCategory = [...categorySummary].sort((a, b) => b.eac - a.eac)[0];
  const kpis = buildDisplayKpis(project, context);
  const financials = mergeAuthoritativeFinancials(project, context, financialComparisonMetrics(project, state.selectedYear));
  const benchmarkMargin = Number(project.benchmarks?.marginPct || 0);
  const effectiveFundedValue = Number(context.fundedValue || 0);
  const effectiveContractValue = Number(context.contractValue || 0);
  const sourceFundedValue = Number(context.sourceFundedValue || 0);
  const sourceContractValue = Number(context.sourceContractValue || 0);
  const modificationValue = Number(context.modificationValue || 0);
  const unfundedCapacity = Math.max(effectiveContractValue - effectiveFundedValue, 0);
  const revenueBasisLabel = effectiveFundedValue > 0 ? "Funded value" : effectiveContractValue > 0 ? "Contract value fallback" : "Not configured";
  const financialCommercialMode = getCardMode("financialCommercial");
  const financialForecastMode = getCardMode("financialForecast");
  let modelWarnings = [
    ...(financials.validations?.errors || []),
    ...(financials.validations?.warnings || [])
  ];
  if (Number(project.fundedValue || project.contractValue || project.funding || 0) <= 0) {
    modelWarnings.unshift("Project funding is not configured. Revenue recognition will remain zero until funded value or contract value is set.");
  }
  const actualRevenue = financials.actualRevenueToDate;
  const actualCost = kpis.actualCost;
  const actualMargin = financials.actualMarginToDate;
  const actualMarginPct = financials.actualMarginPct;
  const actualPeriodLabel = qboState.companyPeriodLabel || `${state.selectedYear} YTD`;
  const baselineRevenueToDate = Number(context.baselineSnapshot?.summary?.cumulativeRevenueToDate || 0);
  const baselineEacCost = Number(context.baselineSnapshot?.summary?.eacCost || financials.budgetCost || 0);
  const baselineRevenueCeiling = Number(context.baselineSnapshot?.summary?.revenueEac || financials.budgetRevenue || 0);
  const baselineMarginValue = Number(context.baselineSnapshot?.summary?.margin ?? (baselineRevenueCeiling - baselineEacCost));
  const baselineMarginPercent = Number(context.baselineSnapshot?.summary?.marginPct ?? financials.budgetMargin ?? computeMarginPercent(baselineRevenueCeiling, baselineEacCost));
  const baselineLargestCategory = [...(context.baselineSnapshot?.categories || [])]
    .sort((a, b) => Number(b.eac || 0) - Number(a.eac || 0))[0] || null;
  const forecastEconomicsExplanation = buildForecastEconomicsExplanation({
    fixedPriceProject,
    actualCost,
    etcCost: financials.etcCost,
    eacCost: kpis.cost,
    percentComplete: financials.percentComplete,
    eacMargin: financials.eacMargin,
    marginPct: kpis.margin,
    largestCategory
  });
  const forecastEconomicsExplainOpen = Boolean(state.ui?.financialForecastExplainOpen);
  const recognizedBeforeCurrentPeriod = Math.max(actualRevenue - financials.currentPeriodRevenue, 0);
  const remainingFundedRevenue = Math.max(effectiveFundedValue - actualRevenue, 0);
  const revenueRollforwardNarrative = fixedPriceProject
    ? `${formatCompactCurrency(recognizedBeforeCurrentPeriod)} was recognized before the current period. ${formatCompactCurrency(financials.currentPeriodRevenue)} is the current catch-up, leaving ${formatCompactCurrency(remainingFundedRevenue)} of funded revenue still to recognize.`
    : `${formatCompactCurrency(actualRevenue)} is recognized to date against the current revenue basis, with ${formatCompactCurrency(financials.currentPeriodRevenue)} in the current period.`;
  const varianceDrivers = [...categorySummary]
    .map((item) => ({
      ...item,
      movement: Number(item.varianceToPrior || item.varianceToBudget || 0)
    }))
    .sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement))
    .slice(0, 3);
  const biggestDriver = varianceDrivers[0] || null;
  const comparisonReferenceLabel = comparisonBasisLabel(context);
  const comparisonBasis = resolvedComparisonBasis(context);
  const actualsThroughPeriod = backendSummary.actualsThroughPeriod || context.version?.actualsThrough || null;
  const actualsThroughIdx = actualsThroughMonthIndex(actualsThroughPeriod, state.selectedYear);
  const changeDriverText = !context.baselineSnapshot
    && comparisonBasis.type === "none"
    ? "No baseline snapshot or prior approved forecast exists yet, so movement is being shown without a saved comparison point."
    : !biggestDriver || Math.abs(biggestDriver.movement) < 1
      ? `No material movement is showing against ${comparisonReferenceLabel.toLowerCase()}.`
      : `${biggestDriver.label} is the primary driver of movement at ${formatCompactCurrency(biggestDriver.movement)} versus ${comparisonReferenceLabel.toLowerCase()}.`;
  const movementSourceText = Math.abs(financials.costVariance || 0) < 1
    && Math.abs(financials.revenueImpact || 0) < 1
    && Math.abs(financials.marginVariance || 0) < 1
    ? "Costs, revenue, and margin are broadly holding steady."
    : `Cost moved ${formatCompactCurrency(financials.costVariance)}, revenue moved ${formatCompactCurrency(financials.revenueImpact)}, and margin moved ${formatCompactCurrency(financials.marginVariance)}.`;
  const monthlyCategoryRows = [
    ["labor", "Labor"],
    ["subcontractors", "Sub"],
    ["equipment", "Equipment"],
    ["materials", "Material"],
    ["odc", "ODC"]
  ].map(([category, label]) => {
    const planned = getPlanMonthlyTotals(project, category, state.selectedYear);
    const values = Array.from({ length: 12 }, (_, monthIndex) => {
      const actual = Number(project.actuals?.[category]?.[monthIndex] || 0);
      return actual > 0 ? actual : Number(planned[monthIndex] || 0);
    });
    return { label, values };
  });

  const monthlyRevenue = monthly.map((item) => Number(item.adjustment || 0));
  const monthlyTotalCost = Array.from({ length: 12 }, (_, monthIndex) =>
    monthlyCategoryRows.reduce((sum, row) => sum + Number(row.values[monthIndex] || 0), 0)
  );
  const monthlyMargin = monthlyRevenue.map((value, monthIndex) => value - monthlyTotalCost[monthIndex]);
  const monthlyMarginPct = monthlyMargin.map((value, monthIndex) => {
    const revenue = Number(monthlyRevenue[monthIndex] || 0);
    if (revenue <= 0) return 0;
    return computeMarginPercent(revenue, monthlyTotalCost[monthIndex]);
  });
  modelWarnings = [
    ...modelWarnings,
    ...monthly.flatMap((item) => item.validations?.warnings || [])
  ];
  const monthlyActualsThrough = monthly.reduce((latestIndex, item, index) =>
    Number(item.actualCost || 0) > 0 ? index : latestIndex, -1
  );
  const actualsThroughLabel = backendSummary.actualsThroughPeriod
    || (monthlyActualsThrough >= 0
      ? `${state.meta.months[monthlyActualsThrough]} ${state.selectedYear}`
      : "No imported actuals");

  const pnlRows = [
    {
      label: "Revenue",
      values: monthlyRevenue.map((value) => formatCurrency(value))
    },
    ...monthlyCategoryRows.map((row) => ({
      label: row.label,
      values: row.values.map((value) => formatCurrency(value))
    })),
    {
      label: "Total Cost",
      values: monthlyTotalCost.map((value) => formatCurrency(value))
    },
    {
      label: "Margin",
      values: monthlyMargin.map((value) => formatCurrency(value)),
      tone: monthlyMargin.map((value) => value < 0)
    },
    {
      label: "Margin %",
      values: monthlyMarginPct.map((value) => `${value.toFixed(1)}%`),
      tone: monthlyMarginPct.map((value) => value < 0)
    }
  ];
  return `
    <section class="space-y-6">
      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Financials</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Revenue recognition and forecast economics</h2>
            <p class="mt-2 text-sm text-slate-600">This tab now separates commercial position, revenue recognition through actuals, and forecast cost and margin so the FP story is easier to review.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button id="exportFinanceReportBtn" class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export Finance Report</button>
            <span class="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-slate-700">${actualPeriodLabel}</span>
          </div>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          ${summaryTile("Actuals Through", actualsThroughLabel)}
          ${summaryTile("Revenue Basis", revenueBasisLabel, revenueBasisLabel === "Not configured")}
          ${summaryTile("Effective Funded Value", effectiveFundedValue > 0 ? formatCompactCurrency(effectiveFundedValue) : "Not set", effectiveFundedValue <= 0)}
          ${summaryTile("Comparison Basis", comparisonReferenceLabel, comparisonBasis.type === "none")}
        </div>
        ${modelWarnings.length ? `
          <div class="mt-4 rounded-[1rem] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold uppercase tracking-[0.14em] text-amber-800">Model Warnings</p>
                <p class="mt-1 text-amber-900">The engine detected values that need review before relying on this forecast.</p>
              </div>
              <span class="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-900">${modelWarnings.length}</span>
            </div>
            <div class="mt-3 space-y-1.5">
              ${modelWarnings.slice(0, 6).map((warning) => `<p>${warning}</p>`).join("")}
            </div>
          </div>
        ` : ""}
        <div class="mt-4 min-w-0 rounded-[1.25rem] border border-slate-200 bg-white p-4">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Financials</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Monthly project P&amp;L</h2>
            <p class="mt-2 text-sm text-slate-600">${fixedPriceProject ? `Revenue is shown as current-period catch-up on a ${revenueBasisLabel.toLowerCase()} basis. Costs blend actuals for closed months with forecast for future months.` : `Revenue is current-period recognized revenue on a ${revenueBasisLabel.toLowerCase()} basis. Costs blend actuals for closed months with forecast for future months.`}${actualsThroughPeriod ? ` Closed periods through ${periodLabel(actualsThroughPeriod)} are shaded in gray.` : ""}</p>
          </div>
          <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
            <table class="compact-table min-w-full text-sm">
              <thead class="bg-stone-50 text-slate-500">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Line Item</th>
                  ${monthly.map((item) => `<th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em] whitespace-nowrap ${item.monthIndex <= actualsThroughIdx ? "bg-slate-100 text-slate-600" : ""}">${state.meta.months[item.monthIndex]} ${state.selectedYear}</th>`).join("")}
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${pnlRows.map((row) => `
                  <tr>
                    <td class="px-3 py-2 font-semibold text-ink whitespace-nowrap">${row.label}</td>
                    ${row.values.map((value, index) => `
                      <td class="px-3 py-2 text-right whitespace-nowrap ${index <= actualsThroughIdx ? "bg-slate-100/90" : ""} ${(row.tone?.[index]) ? "text-rose-700" : ""} ${index <= actualsThroughIdx ? "text-slate-700" : ""}">${value}</td>
                    `).join("")}
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
        <div class="mt-4 space-y-6">
          <div class="min-w-0 rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Revenue Recognition</p>
                <h3 class="mt-2 text-lg font-semibold text-ink">Funded ceiling, revenue to date, and remaining funded revenue</h3>
              </div>
              ${cardModeToggle("financialCommercial")}
            </div>
            ${financialCommercialMode === "visual" ? `
              <div class="mt-4 min-w-0 rounded-[1rem] border border-slate-200 bg-white p-4">
                ${renderProgressTrack({
                  title: "Funded Revenue Rollforward",
                  totalLabel: "Effective funded value",
                  totalValue: effectiveFundedValue,
                  segments: [
                    {
                      label: "Recognized before current period",
                      value: recognizedBeforeCurrentPeriod,
                      displayValue: formatCompactCurrency(recognizedBeforeCurrentPeriod),
                      stroke: "rgb(96 165 250 / 0.62)"
                    },
                    {
                      label: fixedPriceProject ? "Current-period catch-up" : "Current-period revenue",
                      value: Math.max(financials.currentPeriodRevenue, 0),
                      displayValue: formatCompactCurrency(financials.currentPeriodRevenue),
                      stroke: "rgb(250 204 21 / 0.62)"
                    },
                    {
                      label: "Remaining funded revenue",
                      value: remainingFundedRevenue,
                      displayValue: formatCompactCurrency(remainingFundedRevenue),
                      stroke: "rgb(74 222 128 / 0.55)"
                    }
                  ],
                  summaryText: revenueRollforwardNarrative
                })}
                <div class="mt-4 grid gap-3 md:grid-cols-4">
                  ${summaryTile("Base contract", sourceContractValue > 0 ? formatCompactCurrency(sourceContractValue) : "Not set")}
                  ${summaryTile("Base funded", sourceFundedValue > 0 ? formatCompactCurrency(sourceFundedValue) : "Not set")}
                  ${summaryTile("Modification", formatCompactCurrency(modificationValue))}
                  ${summaryTile("Unfunded backlog", formatCompactCurrency(unfundedCapacity), unfundedCapacity > 0)}
                </div>
              </div>
            ` : `
                <div class="mt-4 overflow-x-auto rounded-[1rem] border border-slate-200">
                  <table class="compact-table min-w-full text-sm">
                  <thead class="bg-stone-50 text-slate-500">
                    <tr>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Revenue Recognition</th>
                      <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Amount</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 bg-white">
                    <tr><td class="px-3 py-2 font-semibold text-ink">Base contract value</td><td class="px-3 py-2 text-right">${sourceContractValue > 0 ? formatCurrency(sourceContractValue) : "Not set"}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">Base funded value</td><td class="px-3 py-2 text-right">${sourceFundedValue > 0 ? formatCurrency(sourceFundedValue) : "Not set"}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">Modification value</td><td class="px-3 py-2 text-right">${formatCurrency(modificationValue)}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">Effective funded value</td><td class="px-3 py-2 text-right font-semibold text-slate-700">${effectiveFundedValue > 0 ? formatCurrency(effectiveFundedValue) : "Not set"}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">Cumulative revenue to date</td><td class="px-3 py-2 text-right font-semibold text-slate-700">${formatCurrency(actualRevenue)}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">${fixedPriceProject ? "Current-period catch-up revenue" : "Current-period revenue"}</td><td class="px-3 py-2 text-right font-semibold text-slate-700">${formatCurrency(financials.currentPeriodRevenue)}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">Remaining funded revenue</td><td class="px-3 py-2 text-right">${formatCurrency(remainingFundedRevenue)}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">Unfunded backlog</td><td class="px-3 py-2 text-right">${formatCurrency(unfundedCapacity)}</td></tr>
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <div class="min-w-0 rounded-[1.25rem] border border-slate-200 bg-white p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Forecast Economics</p>
                <h3 class="mt-2 text-lg font-semibold text-ink">Actual cost, ETC, EAC margin, and cost drivers</h3>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  id="financialForecastExplainBtn"
                  class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ${forecastEconomicsExplainOpen ? "Close" : "Explain"}
                </button>
                ${cardModeToggle("financialForecast")}
              </div>
            </div>
            ${financialForecastMode === "visual" ? `
              <div class="mt-4 min-w-0 rounded-[1rem] border border-slate-200 bg-stone-50 p-4">
                ${renderProgressTrack({
                  title: "Cost Rollforward",
                  totalLabel: "EAC Cost",
                  totalValue: kpis.cost,
                  segments: [
                    {
                      label: "Actual cost to date",
                      value: actualCost,
                      displayValue: formatCompactCurrency(actualCost),
                      stroke: "rgb(96 165 250 / 0.68)"
                    },
                    {
                      label: "ETC",
                      value: financials.etcCost,
                      displayValue: formatCompactCurrency(financials.etcCost),
                      stroke: "rgb(74 222 128 / 0.55)"
                    }
                  ],
                  summaryText: `${formatCompactCurrency(actualCost)} actual cost to date plus ${formatCompactCurrency(financials.etcCost)} ETC results in ${formatCompactCurrency(kpis.cost)} EAC cost.`
                })}
                <div class="mt-4 grid gap-3 md:grid-cols-4">
                  ${summaryTile(fixedPriceProject ? "Percent Complete Through Actuals" : "Percent Complete", `${financials.percentComplete.toFixed(1)}%`)}
                  ${summaryTile("EAC Margin", formatCompactCurrency(financials.eacMargin), financials.eacMargin < 0)}
                  ${summaryTile("Margin %", `${kpis.margin.toFixed(1)}%`, kpis.margin < 0)}
                  ${summaryTile("Largest Cost Driver", largestCategory?.label || "None")}
                </div>
                <div class="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-slate-600">
                  ${largestCategory ? `${largestCategory.label} is the largest cost driver at ${formatCompactCurrency(largestCategory.eac)}.` : "No dominant cost driver is showing yet."}
                </div>
                ${forecastEconomicsExplainOpen ? `
                  <div class="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-700">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Explain Forecast Economics</p>
                        <p class="mt-2">${forecastEconomicsExplanation[0]}</p>
                        <p class="mt-3">${forecastEconomicsExplanation[1]}</p>
                      </div>
                      <button
                        type="button"
                        id="financialForecastExplainCloseBtn"
                        class="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ` : ""}
              </div>
            ` : `
              <div class="mt-4 overflow-x-auto rounded-[1rem] border border-slate-200">
                <table class="compact-table min-w-full text-sm">
                  <thead class="bg-stone-50 text-slate-500">
                    <tr>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Forecast Economics</th>
                      <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Baseline</th>
                      <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Current</th>
                      <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Notes</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 bg-white">
                    <tr>
                      <td class="px-3 py-2 font-semibold text-ink">Actual cost to date</td>
                      <td class="px-3 py-2 text-right">${context.baselineSnapshot ? formatCurrency(0) : "—"}</td>
                      <td class="px-3 py-2 text-right font-semibold text-slate-700">${formatCurrency(actualCost)}</td>
                      <td class="px-3 py-2 text-right">Closed periods only</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2 font-semibold text-ink">ETC cost</td>
                      <td class="px-3 py-2 text-right">${formatCurrency(context.baselineSnapshot ? baselineEacCost : Math.max(financials.budgetCost - actualCost, 0))}</td>
                      <td class="px-3 py-2 text-right font-semibold text-slate-700">${formatCurrency(financials.etcCost)}</td>
                      <td class="px-3 py-2 text-right">Remaining forecast work</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2 font-semibold text-ink">EAC cost</td>
                      <td class="px-3 py-2 text-right">${formatCurrency(context.baselineSnapshot ? baselineEacCost : financials.budgetCost)}</td>
                      <td class="px-3 py-2 text-right font-semibold text-slate-700">${formatCurrency(kpis.cost)}</td>
                      <td class="px-3 py-2 text-right">Actuals + ETC</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2 font-semibold text-ink">EAC margin</td>
                      <td class="px-3 py-2 text-right">${formatCurrency(context.baselineSnapshot ? baselineMarginValue : (financials.budgetRevenue - financials.budgetCost))}</td>
                      <td class="px-3 py-2 text-right font-semibold text-slate-700">${formatCurrency(financials.eacMargin)}</td>
                      <td class="px-3 py-2 text-right">Revenue ceiling less EAC cost</td>
                    </tr>
                    <tr class="bg-stone-50">
                      <td class="px-3 py-2 font-semibold text-ink">Margin %</td>
                      <td class="px-3 py-2 text-right">${(context.baselineSnapshot ? baselineMarginPercent : financials.budgetMargin).toFixed(1)}%</td>
                      <td class="px-3 py-2 text-right font-semibold text-slate-700">${kpis.margin.toFixed(1)}%</td>
                      <td class="px-3 py-2 text-right">On revenue basis</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2 font-semibold text-ink">Largest cost driver</td>
                      <td class="px-3 py-2 text-right">${context.baselineSnapshot ? (labelForCategoryKey(baselineLargestCategory?.key) || "—") : "—"}</td>
                      <td class="px-3 py-2 text-right font-semibold text-slate-700">${largestCategory?.label || "None"}</td>
                      <td class="px-3 py-2 text-right">${largestCategory ? formatCurrency(largestCategory.eac) : "—"}${context.baselineSnapshot && baselineLargestCategory ? ` · Baseline ${formatCurrency(Number(baselineLargestCategory.eac || 0))}` : ""}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <div class="min-w-0 rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">What Changed</p>
              <h3 class="mt-2 text-lg font-semibold text-ink">Plain-English variance explanation</h3>
              <div class="mt-4 grid gap-3 md:grid-cols-3">
                ${summaryTile("Cost variance", formatCompactCurrency(financials.costVariance), financials.costVariance > 0)}
                ${summaryTile("Revenue impact", formatCompactCurrency(financials.revenueImpact), financials.revenueImpact < 0)}
                ${summaryTile("Margin variance", formatCompactCurrency(financials.marginVariance), financials.marginVariance < 0)}
              </div>
              <div class="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <div class="min-w-0 rounded-[1rem] border border-slate-200 bg-white p-4">
                  <p class="text-sm font-semibold text-ink">Controller Summary</p>
                  <p class="mt-3 text-sm leading-6 text-slate-700">${changeDriverText}</p>
                  <p class="mt-3 text-sm leading-6 text-slate-700">${movementSourceText}</p>
                </div>
                <div class="min-w-0 rounded-[1rem] border border-slate-200 bg-white p-4">
                  <p class="text-sm font-semibold text-ink">Top Drivers</p>
                  <div class="mt-3 space-y-2">
                    ${varianceDrivers.length ? varianceDrivers.map((item, index) => `
                      <div class="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2 text-sm">
                        <div><span class="font-semibold text-ink">${index + 1}. ${item.label}</span></div>
                        <div class="${item.movement > 0 ? "text-rose-700" : "text-emerald-700"} font-semibold">${formatCompactCurrency(item.movement)}</div>
                      </div>
                    `).join("") : `<div class="rounded-xl bg-stone-50 px-3 py-2 text-sm text-slate-600">No material drivers are showing yet.</div>`}
                  </div>
                </div>
              </div>
          </div>

          <div class="min-w-0 rounded-[1.25rem] border border-slate-200 bg-white p-4">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Category Performance</p>
            <h3 class="mt-2 text-lg font-semibold text-ink">Actuals, ETC, EAC, and baseline reference by category</h3>
            <div class="mt-4 overflow-x-auto rounded-[1rem] border border-slate-200">
              <table class="compact-table min-w-full text-sm">
                <thead class="bg-stone-50 text-slate-500">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Category</th>
                    <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Actuals</th>
                    <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">ETC</th>
                    <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">EAC</th>
                    <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">${context.baselineSnapshot ? "Baseline" : "Reference"}</th>
                    <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Variance</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  ${categorySummary.map((row) => `
                    <tr>
                      <td class="px-3 py-2 font-semibold text-ink">${row.label}</td>
                      <td class="px-3 py-2 text-right">${formatCompactCurrency(row.actuals)}</td>
                      <td class="px-3 py-2 text-right">${formatCompactCurrency(row.etc)}</td>
                      <td class="px-3 py-2 text-right">${formatCompactCurrency(row.eac)}</td>
                      <td class="px-3 py-2 text-right">${formatCompactCurrency(row.prior || row.budget)}</td>
                      <td class="px-3 py-2 text-right ${Number(row.varianceToPrior ?? row.varianceToBudget ?? 0) > 0 ? "text-rose-700" : Number(row.varianceToPrior ?? row.varianceToBudget ?? 0) < 0 ? "text-emerald-700" : "text-slate-600"}">${formatCompactCurrency(Number(row.varianceToPrior ?? row.varianceToBudget ?? 0))}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </section>

      <section class="hidden rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
          <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Financials</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Monthly rollforward</h2>
          <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
            <table class="compact-table min-w-full text-sm">
              <thead class="bg-stone-50 text-slate-500">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Month</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Actual Cost</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Forecast Cost</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Cum Cost</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">% Complete</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Revenue</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Adjustment</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Margin</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${monthly.map((item) => `
                  <tr class="${item.monthIndex <= actualsThroughIdx ? "bg-slate-100/90" : ""}">
                    <td class="px-3 py-2 font-semibold text-ink">${state.meta.months[item.monthIndex]}</td>
                    <td class="px-3 py-2 text-right">${formatCurrency(item.actualCost)}</td>
                    <td class="px-3 py-2 text-right">${formatCurrency(item.forecastCost)}</td>
                    <td class="px-3 py-2 text-right">${formatCurrency(item.cumulativeCost)}</td>
                    <td class="px-3 py-2 text-right">${item.percentComplete.toFixed(1)}%</td>
                    <td class="px-3 py-2 text-right">${formatCurrency(item.revenue)}</td>
                    <td class="px-3 py-2 text-right ${item.adjustment >= 0 ? "text-slate-700" : "text-rose-700"}">${formatCurrency(item.adjustment)}</td>
                    <td class="px-3 py-2 text-right ${item.margin >= 0 ? "text-emerald-700" : "text-rose-700"}">${formatCurrency(item.margin)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
      </section>
    </section>
  `;
}

function renderAdminView() {
  const context = currentProjectContext();
  const project = context.project;
  const liveActuals = qboState.summaries;
  const backendSummary = context.backendFinance?.summary || {};
  const financials = mergeAuthoritativeFinancials(project, context, financialComparisonMetrics(project, state.selectedYear));
  const kpis = buildDisplayKpis(project, context);
  const reconciliation = qboState.reconciliation;
  const importBatches = qboState.importBatches?.length ? qboState.importBatches : state.importBatches;
  const baselineSnapshot = context.baselineSnapshot;
  const latestActualRevenueToDate = (project.projectMonthly || []).reduce(
    (latest, row) => (Number(row.actualCost || 0) > 0 ? Number(row.cumulativeRevenue || 0) : latest),
    0
  );
  const currentRevenueToDate = Number(backendSummary.cumulativeRevenueToDate || latestActualRevenueToDate || 0);
  const currentEacCost = Number(backendSummary.eacCost || kpis.cost || 0);
  const currentMargin = Number(backendSummary.eacMargin || kpis.profit || 0);
  const syncState = context.mapping?.sync_status || project.syncStatus || "Not mapped";
  const comparisonReferenceLabel = comparisonBasisLabel(context);
  const authEvents = authState.signInEvents || [];
  return `
    <section class="space-y-6">
      <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Admin</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Controls and operations</h2>
            <p class="mt-2 text-sm text-slate-600">Use this page to manage snapshots, sync actuals, review reconciliation, and inspect live project setup.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <a href="#admin-controls" class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Forecast Controls</a>
            <a href="#admin-sync" class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">QBO Sync</a>
            <a href="#admin-setup" class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Project Setup</a>
            <a href="#admin-master" class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Master Data</a>
          </div>
        </div>
        <div class="mt-4 grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
          <div class="rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Forecast status</p>
            <div class="mt-3 grid gap-2 md:grid-cols-2">
              ${dashboardStatLight("Setup readiness", `${context.readiness}%`)}
              ${dashboardStatLight("Version", context.version?.code || "Working")}
              ${dashboardStatLight("Actuals through", context.actualsThrough || "—")}
              ${dashboardStatLight("Baseline", baselineSnapshot?.label || "Missing")}
              ${dashboardStatLight("Comparison basis", comparisonReferenceLabel)}
              ${dashboardStatLight("Setup status", context.setup?.setup_status || "Not seeded")}
            </div>
          </div>
          <div class="rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Commercial and sync</p>
            <div class="mt-3 grid gap-2 md:grid-cols-2">
              ${dashboardStatLight("Funding", context.fundedValue > 0 ? formatCompactCurrency(context.fundedValue) : "Not set")}
              ${dashboardStatLight("Contract", context.contractValue > 0 ? formatCompactCurrency(context.contractValue) : "Not set")}
              ${dashboardStatLight("QBO status", qboConnectionStatusLabel())}
              ${dashboardStatLight("Sync", syncState)}
              ${dashboardStatLight("Current EAC", formatCompactCurrency(currentEacCost))}
              ${dashboardStatLight("Revenue to date", formatCompactCurrency(currentRevenueToDate))}
            </div>
          </div>
        </div>
      </section>

      ${isOwnerSignedIn() ? `
        <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Owner Only</p>
              <h2 class="mt-1 text-2xl font-semibold tracking-tight">Signed-in users</h2>
              <p class="mt-2 text-sm text-slate-600">This panel is visible only to the configured owner account and shows recent prototype sign-in activity.</p>
            </div>
            <button id="refreshSignInEventsBtn" class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>
          </div>
          <div class="mt-4 overflow-x-auto rounded-[1rem] border border-slate-200">
            <table class="compact-table min-w-full text-sm">
              <thead class="bg-stone-50 text-slate-500">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">When</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Name</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Email</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Provider</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Event</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${authEvents.length ? authEvents.map((item) => `
                  <tr>
                    <td class="px-3 py-2 font-semibold text-ink">${formatSync(item.createdAt || item.signedInAt)}</td>
                    <td class="px-3 py-2">${item.name || "—"}</td>
                    <td class="px-3 py-2">${item.email || "—"}</td>
                    <td class="px-3 py-2">${item.provider || "—"}</td>
                    <td class="px-3 py-2">${item.eventType || "sign_in"}</td>
                  </tr>
                `).join("") : `<tr><td colspan="5" class="px-3 py-3 text-sm text-slate-500">No sign-in activity has been recorded yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      ` : ""}

      ${renderAdminSetupGuide(context, currentSetupBundle().revenueRule || null, baselineSnapshot)}

      <section id="admin-controls" class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Forecast Controls</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">Baseline and forecast controls</h2>
            <p class="mt-2 text-sm text-slate-600">Capture an immutable baseline reference for EAC cost, revenue-to-date, and margin comparison.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button id="syncNowBtn" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slateblue">Refresh QBO Data</button>
            <button id="resetDemoBtn" class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Reset Demo</button>
            <button id="createSnapshotBtn" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slateblue">Create Baseline Snapshot</button>
          </div>
        </div>
        <div class="mt-4 grid gap-2 md:grid-cols-4">
          ${summaryTile("Baseline Reference", baselineSnapshot?.label || "None")}
          ${summaryTile("Actuals Through", baselineSnapshot?.actualsThroughPeriod || "—")}
          ${summaryTile("Cost Variance", formatCompactCurrency(financials.costVariance), financials.costVariance > 0)}
          ${summaryTile("Revenue Impact", formatCompactCurrency(financials.revenueImpact), financials.revenueImpact < 0)}
        </div>
        <div class="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-sm text-slate-700">
          Current working version: <strong class="text-ink">${context.forecastState?.selectedVersion?.code || context.version?.code || "Working"}</strong>.
          Comparison basis: <strong class="text-ink">${comparisonReferenceLabel}</strong>.
          ${context.forecastState?.priorApprovedVersion ? `Prior approved version: <strong class="text-ink">${context.forecastState.priorApprovedVersion.code}</strong>.` : "No prior approved forecast is available yet."}
        </div>
        ${baselineSnapshot ? `
          <div class="mt-4 overflow-hidden rounded-[1.25rem] border border-slate-200">
            <table class="compact-table min-w-full text-sm">
              <thead class="bg-stone-50 text-slate-500">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Metric</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Baseline</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Current</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Variance</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                <tr>
                  <td class="px-3 py-2 font-semibold text-ink">EAC Cost</td>
                  <td class="px-3 py-2 text-right">${formatCurrency(baselineSnapshot.summary?.eacCost || 0)}</td>
                  <td class="px-3 py-2 text-right">${formatCurrency(currentEacCost)}</td>
                  <td class="px-3 py-2 text-right ${financials.costVariance > 0 ? "text-rose-700" : "text-emerald-700"}">${formatCompactCurrency(financials.costVariance)}</td>
                </tr>
                <tr>
                  <td class="px-3 py-2 font-semibold text-ink">Revenue To Date</td>
                  <td class="px-3 py-2 text-right">${formatCurrency(baselineSnapshot.summary?.cumulativeRevenueToDate || 0)}</td>
                  <td class="px-3 py-2 text-right">${formatCurrency(currentRevenueToDate)}</td>
                  <td class="px-3 py-2 text-right ${financials.revenueImpact < 0 ? "text-rose-700" : "text-emerald-700"}">${formatCompactCurrency(financials.revenueImpact)}</td>
                </tr>
                <tr>
                  <td class="px-3 py-2 font-semibold text-ink">Margin</td>
                  <td class="px-3 py-2 text-right">${formatCurrency(baselineSnapshot.summary?.margin || 0)}</td>
                  <td class="px-3 py-2 text-right">${formatCurrency(currentMargin)}</td>
                  <td class="px-3 py-2 text-right ${financials.marginVariance < 0 ? "text-rose-700" : "text-emerald-700"}">${formatCompactCurrency(financials.marginVariance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ` : ""}
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section id="admin-sync" class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">QBO Sync</p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">QuickBooks sync and reconciliation</h2>
          </div>
          <button id="connectQboBtn" class="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            ${qboState.status === "error" ? "Reconnect QBO" : "Connect QBO"}
          </button>
        </div>
        <div class="mt-4 grid gap-2 md:grid-cols-3">
          ${summaryTile("QBO Status", qboConnectionStatusLabel(), qboState.status === "error")}
          ${summaryTile("Company", liveActuals?.companyName || "Waiting for live data")}
          ${summaryTile("Industry", liveActuals?.industry || "—")}
        </div>
        <div class="mt-4 rounded-xl bg-stone-50 px-3 py-2 text-sm text-slate-600">
          Reconciliation compares portfolio system actuals against the imported QBO company P&amp;L for the selected period.
        </div>
        <div class="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-4">
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">QuickBooks Actuals</p>
          <div class="mt-3 space-y-2">
            ${renderQboOverviewPanel(project.reviewSignals || {}, resourceSummary({
              ...project,
              planning: { ...project.planning, labor: (project.planning?.labor || []).map(hydrateLaborLine) }
            }).employees.filter((item) => item.utilization > 100).length, liveActuals)}
          </div>
        </div>
        <div class="mt-4 overflow-hidden rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Live Feed</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Value</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr><td class="px-3 py-2 font-semibold text-ink">Last Refresh</td><td class="px-3 py-2 text-right">${qboState.status === "ready" ? "Loaded in browser" : formatSync(project.lastSyncAt)}</td></tr>
              <tr><td class="px-3 py-2 font-semibold text-ink">Selected Period</td><td class="px-3 py-2 text-right">${qboState.companyPeriodLabel || `${state.selectedYear} YTD`}</td></tr>
              <tr><td class="px-3 py-2 font-semibold text-ink">Revenue Actuals</td><td class="px-3 py-2 text-right">${formatCurrency(liveActuals?.revenue || 0)}</td></tr>
              <tr><td class="px-3 py-2 font-semibold text-ink">Cost Actuals</td><td class="px-3 py-2 text-right">${formatCurrency(liveActuals?.cost || 0)}</td></tr>
              <tr><td class="px-3 py-2 font-semibold text-ink">Net Income</td><td class="px-3 py-2 text-right">${formatCurrency(liveActuals?.profit || 0)}</td></tr>
              <tr><td class="px-3 py-2 font-semibold text-ink">Operating Cash Flow</td><td class="px-3 py-2 text-right">${liveActuals?.operatingCashFlow ? formatCurrency(liveActuals.operatingCashFlow) : "Unavailable"}</td></tr>
              <tr><td class="px-3 py-2 font-semibold text-ink">Review Items</td><td class="px-3 py-2 text-right">${quickbooksHealth(project).review}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="mt-4 overflow-hidden rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Reconciliation</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">System</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">QBO</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Difference</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr>
                <td class="px-3 py-2 font-semibold text-ink">Revenue YTD</td>
                <td class="px-3 py-2 text-right">${formatCurrency(reconciliation?.totals.systemRevenue || 0)}</td>
                <td class="px-3 py-2 text-right">${formatCurrency(reconciliation?.totals.qboRevenue || 0)}</td>
                <td class="px-3 py-2 text-right ${(reconciliation?.totals.revenueDifference || 0) < 0 ? "text-rose-700" : "text-emerald-700"}">${formatCurrency(reconciliation?.totals.revenueDifference || 0)}</td>
              </tr>
              <tr>
                <td class="px-3 py-2 font-semibold text-ink">Cost YTD</td>
                <td class="px-3 py-2 text-right">${formatCurrency(reconciliation?.totals.systemCost || 0)}</td>
                <td class="px-3 py-2 text-right">${formatCurrency(reconciliation?.totals.qboCost || 0)}</td>
                <td class="px-3 py-2 text-right ${(reconciliation?.totals.costDifference || 0) > 0 ? "text-rose-700" : "text-emerald-700"}">${formatCurrency(reconciliation?.totals.costDifference || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        ${reconciliation?.rows?.length ? `
          <div class="mt-4 overflow-hidden rounded-[1.25rem] border border-slate-200">
            <table class="compact-table min-w-full text-sm">
              <thead class="bg-stone-50 text-slate-500">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Month</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">System Revenue</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">QBO Revenue</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Revenue Diff</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">System Cost</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">QBO Cost</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Cost Diff</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${reconciliation.rows.map((row) => `
                  <tr>
                    <td class="px-3 py-2 font-semibold text-ink">${state.meta.months[row.monthIndex]}</td>
                    <td class="px-3 py-2 text-right">${formatCurrency(row.systemRevenue)}</td>
                    <td class="px-3 py-2 text-right">${formatCurrency(row.qboRevenue)}</td>
                    <td class="px-3 py-2 text-right ${row.revenueDifference < 0 ? "text-rose-700" : "text-emerald-700"}">${formatCurrency(row.revenueDifference)}</td>
                    <td class="px-3 py-2 text-right">${formatCurrency(row.systemCost)}</td>
                    <td class="px-3 py-2 text-right">${formatCurrency(row.qboCost)}</td>
                    <td class="px-3 py-2 text-right ${row.costDifference > 0 ? "text-rose-700" : "text-emerald-700"}">${formatCurrency(row.costDifference)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : ""}
        <div class="mt-4 overflow-hidden rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Import Batch</th>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Ran At</th>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Rows</th>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${importBatches.map((batch) => `
                <tr>
                  <td class="px-3 py-2 font-semibold text-ink">${batch.id}</td>
                  <td class="px-3 py-2">${batch.ranAt || formatSync(batch.batch_completed_at || batch.created_at)}</td>
                  <td class="px-3 py-2">${batch.rows ?? batch.row_count ?? 0}</td>
                  <td class="px-3 py-2">${batch.status || batch.batch_status || "Unknown"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        </section>

        <section id="admin-master" class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Master Data</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Master data</h2>
        <div class="mt-4 overflow-x-auto rounded-[1.25rem] border border-slate-200">
          <table class="compact-table min-w-full text-sm">
            <thead class="bg-stone-50 text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Type</th>
                <th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em]">Count</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr><td class="px-3 py-2 font-semibold text-ink">Organizations</td><td class="px-3 py-2 text-right">${state.masterData.organizations.length}</td></tr>
              <tr><td class="px-3 py-2 font-semibold text-ink">Departments</td><td class="px-3 py-2 text-right">${state.masterData.departments.length}</td></tr>
              <tr><td class="px-3 py-2 font-semibold text-ink">Employees</td><td class="px-3 py-2 text-right">${state.masterData.employees.length}</td></tr>
              <tr><td class="px-3 py-2 font-semibold text-ink">Labor Categories</td><td class="px-3 py-2 text-right">${state.masterData.laborCategories.length}</td></tr>
              <tr><td class="px-3 py-2 font-semibold text-ink">Forecast Versions</td><td class="px-3 py-2 text-right">${getForecastVersions(project.id).length}</td></tr>
            </tbody>
          </table>
        </div>
        </section>
      </section>
      ${renderLiveProjectSetupPanel()}
    </section>
  `;
}

function renderLiveProjectSetupPanel() {
  const bundle = setupState.bundle?.data || setupState.bundle;
  const context = currentProjectContext();
  const project = bundle?.project;
  const setup = bundle?.setup;
  const rule = bundle?.revenueRule;
  const explanation = bundle?.revenueExplanation;
  const varianceExplanation = bundle?.varianceExplanation;
  const workflowHistory = bundle?.workflowHistory || [];
  const latestWorkflowComment = workflowHistory.find((item) => item?.assumption_title === "Workflow Comment")?.notes
    || workflowHistory.find((item) => item?.notes)?.notes
    || "";
  const mapping = bundle?.qboMapping;
  const versions = bundle?.forecastVersions || [];
  const versionCodeById = Object.fromEntries(versions.map((item) => [item.id, item.version_code || item.version_name || item.id]));
  const activeVersion = versions[0] || null;
  const latestHistory = workflowHistory[0] || null;
  const latestHistoryNote = parseWorkflowHistoryNote(latestHistory?.notes);
  const setupNotes = parseSetupNotes(setup?.notes);
  const lockRows = context.backendFinance?.monthlyRows || [];
  const lockedMonthCount = lockRows.filter((item) => item.lockStatus === "ACTUAL").length;
  const openMonthCount = lockRows.filter((item) => item.lockStatus !== "ACTUAL").length;
  const closeControlSummary = setup?.close_through_period
    ? `Actuals are closed through ${setup.close_through_period}. ${lockedMonthCount} month${lockedMonthCount === 1 ? "" : "s"} are locked and ${openMonthCount} remain open for forecast updates.`
    : `No close-through period is set yet. All ${openMonthCount || lockRows.length || 0} visible month${(openMonthCount || lockRows.length || 0) === 1 ? "" : "s"} remain open for forecast updates.`;
  const commercial = resolveCommercialTerms({
    liveProject: project || {},
    contract: bundle?.contract || {},
    notes: setupNotes,
    project: getProject() || {}
  });

  return `
    <section id="admin-setup" class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Admin</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Live Project Setup</h2>
          <p class="mt-2 text-sm text-slate-600">Reads directly from GovCon and QBO setup tables through the backend.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button id="bootstrapProjectsBtn" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slateblue">Bootstrap Projects From QBO</button>
        </div>
      </div>

      <div class="mt-4 space-y-4">
        <div class="rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
          <div class="grid gap-3 xl:grid-cols-[minmax(18rem,28rem)_1fr] xl:items-center">
            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">GovCon Project</span>
              <select id="setupProjectSelect" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-ink">
                <option value="">${setupState.projects.length ? "Select a live project" : "No live GovCon projects yet"}</option>
                ${setupState.projects.map((item) => `<option value="${item.id}" ${item.id === setupState.selectedProjectId ? "selected" : ""}>${item.code} · ${item.title}</option>`).join("")}
              </select>
            </label>
            <div class="min-w-0 rounded-[1rem] border border-slate-200 bg-white px-4 py-3">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Revenue Methods Seeded</span>
                ${setupState.revenueMethods.length
                  ? setupState.revenueMethods.map((item) => `<span class="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-slate-700">${item.code}</span>`).join("")
                  : `<span class="text-slate-500">No live method rows yet.</span>`}
              </div>
            </div>
          </div>
          <div class="mt-3 space-y-2">
            ${setupState.status === "loading" ? `<div class="rounded-xl bg-white px-3 py-2 text-sm text-slate-600">Loading live project setup...</div>` : ""}
            ${setupState.error ? `<div class="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">${setupState.error}</div>` : ""}
            ${!setupState.projects.length ? `<div class="rounded-xl bg-white px-3 py-2 text-sm text-slate-600">No GovCon projects exist yet for the connected tenant. Use the bootstrap customer list below to seed the first project records.</div>` : ""}
          </div>
        </div>

        <div class="space-y-4">
          <div class="rounded-[1.25rem] border border-slate-200 bg-white p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Project Setup</p>
                <h3 class="mt-1 text-lg font-semibold tracking-tight text-ink">Ownership, commercial values, and live mapping</h3>
                <p class="mt-2 text-sm text-slate-600">This combines the project shell, commercial terms, and QBO linkage into one setup surface so the page feels more like an operating record than a stack of cards.</p>
              </div>
            </div>
            <div class="mt-4 grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
              <div class="rounded-[1rem] border border-slate-200 bg-stone-50 p-4">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Ownership and current setup</p>
                <div class="mt-3 grid gap-2 md:grid-cols-2">
                  ${dashboardStatLight("Project", project ? `${project.code} · ${project.title}` : "Not loaded")}
                  ${dashboardStatLight("Billing Type", project?.billing_type || "—")}
                  ${dashboardStatLight("Project Manager", project?.pm_name || setup?.project_manager_name || "—")}
                  ${dashboardStatLight("Setup Status", setup?.setup_status || "Not seeded")}
                  ${dashboardStatLight("Planning Window", setup?.planning_start_period && setup?.planning_end_period ? `${setup.planning_start_period} to ${setup.planning_end_period}` : "Not set")}
                  ${dashboardStatLight("Realm", mapping?.realm_id || "Connected realm not mapped")}
                  ${dashboardStatLight("Customer", mapping?.qbo_customer_name || mapping?.qbo_customer_id || "Not mapped")}
                  ${dashboardStatLight("Project Ref", mapping?.qbo_project_name || mapping?.qbo_project_id || "Not mapped")}
                  ${dashboardStatLight("Sync Status", mapping?.sync_status || "Not mapped")}
                  ${dashboardStatLight("Import Enabled", mapping ? String(mapping.import_enabled) : "false")}
                </div>
              </div>
              <form id="projectCommercialForm" class="rounded-[1rem] border border-slate-200 bg-stone-50 p-4">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Commercial terms</p>
                <div class="mt-3 grid gap-3 md:grid-cols-3">
                <label class="space-y-1">
                  <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Contract Value</span>
                  <input name="contractValue" type="number" min="0" step="0.01" value="${commercial.sourceContractValue}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                </label>
                <label class="space-y-1">
                  <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Funded Value</span>
                  <input name="fundedValue" type="number" min="0" step="0.01" value="${commercial.sourceFundedValue}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                </label>
                <label class="space-y-1">
                  <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Modification Value</span>
                  <input name="modificationValue" type="number" step="0.01" value="${commercial.modificationValue}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                </label>
                </div>
                <div class="mt-4 grid gap-2 md:grid-cols-2">
                  ${dashboardStatLight("Effective Contract Value", formatCompactCurrency(commercial.effectiveContractValue))}
                  ${dashboardStatLight("Effective Funded Value", formatCompactCurrency(commercial.effectiveFundedValue))}
                  ${dashboardStatLight("Funding Gap", formatCompactCurrency(Math.max(commercial.effectiveContractValue - commercial.effectiveFundedValue, 0)))}
                  ${dashboardStatLight("Revenue Ceiling", formatCompactCurrency(commercial.effectiveFundedValue))}
                </div>
                <input type="hidden" name="projectId" value="${project?.id || setupState.selectedProjectId || ""}">
                <div class="mt-4 flex justify-end">
                  <button type="submit" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slateblue">Save Commercial Values</button>
                </div>
              </form>
            </div>
          </div>

          <div class="rounded-[1.25rem] border border-slate-200 bg-white p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Workflow and Review</p>
                <h3 class="mt-1 text-lg font-semibold tracking-tight text-ink">Revenue rule, version transitions, notes, and history</h3>
                <p class="mt-2 text-sm text-slate-600">This section keeps the review workflow together so finance can move from rule context to status transitions, close control, and audit history without jumping around the page.</p>
              </div>
            </div>
            <div class="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div class="rounded-[1rem] border border-slate-200 bg-white p-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Revenue Rule</p>
              <div class="mt-3 overflow-x-auto rounded-[1rem] border border-slate-200">
                <table class="compact-table min-w-full text-sm">
                  <tbody class="divide-y divide-slate-100 bg-white">
                    <tr><td class="px-3 py-2 font-semibold text-ink">Method</td><td class="px-3 py-2 text-right">${rule?.revenue_method_code || "Not seeded"}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">Effective Start</td><td class="px-3 py-2 text-right">${rule?.effective_start || "—"}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">Fee %</td><td class="px-3 py-2 text-right">${rule?.fee_pct == null ? "—" : `${(Number(rule.fee_pct) * 100).toFixed(2)}%`}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">Unit Price</td><td class="px-3 py-2 text-right">${rule?.unit_price == null ? "—" : formatCurrency(rule.unit_price)}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">LOE Hours</td><td class="px-3 py-2 text-right">${rule?.loe_hours == null ? "—" : Number(rule.loe_hours).toLocaleString("en-US")}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">Percent Complete Source</td><td class="px-3 py-2 text-right">${rule?.percent_complete_source || "—"}</td></tr>
                    <tr><td class="px-3 py-2 font-semibold text-ink">Revenue Ceiling</td><td class="px-3 py-2 text-right">${rule?.revenue_ceiling == null ? "—" : formatCurrency(rule.revenue_ceiling)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div class="mt-3 rounded-xl bg-stone-50 px-3 py-3 text-sm text-slate-700">
                ${explanation?.explanation_text || "No revenue explanation row yet."}
              </div>
              <div class="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Saved Variance Explanation</p>
                <p class="mt-2">${varianceExplanation?.explanation_text || "No saved variance explanation row yet."}</p>
              </div>
              </div>

              <div class="rounded-[1rem] border border-slate-200 bg-white p-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Forecast Versions</p>
              <div class="mt-3 overflow-x-auto rounded-[1rem] border border-slate-200">
                <table class="compact-table min-w-full text-sm">
                  <thead class="bg-stone-50 text-slate-500">
                    <tr>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Code</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Status</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">As Of</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 bg-white">
                    ${versions.length ? versions.map((item) => `
                      <tr>
                        <td class="px-3 py-2 font-semibold text-ink">${item.version_code}</td>
                        <td class="px-3 py-2">${item.status}</td>
                        <td class="px-3 py-2">${item.as_of_period || "—"}</td>
                        <td class="px-3 py-2">
                          ${item.status === "Working" || item.status === "Draft"
                            ? `<button class="version-transition-btn rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50" data-project-id="${project?.id || ""}" data-version-id="${item.id}" data-next-status="In Review">Submit</button>`
                            : item.status === "In Review"
                              ? `<button class="version-transition-btn rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50" data-project-id="${project?.id || ""}" data-version-id="${item.id}" data-next-status="Approved">Approve</button>`
                              : item.status === "Approved"
                                ? `<button class="version-transition-btn rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50" data-project-id="${project?.id || ""}" data-version-id="${item.id}" data-next-status="Locked">Lock</button>`
                                : `<span class="text-xs text-slate-500">—</span>`}
                        </td>
                      </tr>
                    `).join("") : `<tr><td colspan="4" class="px-3 py-3 text-sm text-slate-500">No forecast versions loaded.</td></tr>`}
                  </tbody>
                </table>
              </div>
              </div>
            </div>

            <div class="mt-4 rounded-[1rem] border border-slate-200 bg-stone-50 p-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Review Notes And Close Control</p>
                  <h3 class="mt-1 text-lg font-semibold tracking-tight text-ink">Manual explanations, comments, and actuals-through control</h3>
                  <p class="mt-2 text-sm text-slate-600">Use this section to override autogenerated explanation text, leave reviewer comments, and set the close-through period that defines locked actual months.</p>
                </div>
              </div>
              <div class="mt-4 grid gap-3 md:grid-cols-3">
                ${dashboardStatLight("Active version", activeVersion?.version_code || "None")}
                ${dashboardStatLight("Current close-through", setup?.close_through_period || "Not set")}
                ${dashboardStatLight("Latest action", latestHistory?.assumption_title || "None")}
                ${dashboardStatLight("Latest actor", latestHistoryNote.actor)}
                ${dashboardStatLight("Latest workflow comment", latestWorkflowComment || "None")}
                ${dashboardStatLight("Latest change", latestHistory?.assumption_value || "—")}
                ${dashboardStatLight("Locked months", String(lockedMonthCount))}
                ${dashboardStatLight("Open months", String(openMonthCount))}
                ${dashboardStatLight("History entries", String(workflowHistory.length))}
              </div>
              <div class="mt-4 rounded-[1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <p class="font-semibold text-ink">Close control summary</p>
                <p class="mt-1">${closeControlSummary}</p>
              </div>
              <form id="projectWorkflowNotesForm" class="mt-4 grid gap-4">
                <div class="grid gap-4 xl:grid-cols-2">
                  <label class="space-y-1">
                    <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Revenue Explanation</span>
                    <textarea name="revenueExplanation" rows="5" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-ink">${explanation?.explanation_text || ""}</textarea>
                  </label>
                  <label class="space-y-1">
                    <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Variance Explanation</span>
                    <textarea name="varianceExplanation" rows="5" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-ink">${varianceExplanation?.explanation_text || ""}</textarea>
                  </label>
                </div>
                <div class="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                  <label class="space-y-1">
                    <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Close Through Period</span>
                    <input name="closeThroughPeriod" type="date" value="${setup?.close_through_period || ""}" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  </label>
                  <label class="space-y-1">
                    <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Workflow Comment</span>
                    <textarea name="workflowComment" rows="3" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-ink" placeholder="Add a submit, approval, lock, or close comment here.">${latestWorkflowComment}</textarea>
                  </label>
                </div>
                <input type="hidden" name="projectId" value="${project?.id || setupState.selectedProjectId || ""}">
                <div class="flex flex-wrap justify-end gap-2">
                  <button type="button" data-close-action="reopen" data-project-id="${project?.id || setupState.selectedProjectId || ""}" class="close-control-btn rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Reopen Periods</button>
                  <button type="button" data-close-action="set" data-project-id="${project?.id || setupState.selectedProjectId || ""}" class="close-control-btn rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Close Through Period</button>
                  <button type="submit" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slateblue">Save Notes And Close Settings</button>
                </div>
              </form>
            </div>

            <div class="mt-4 rounded-[1rem] border border-slate-200 bg-white p-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Transition History</p>
              <div class="mt-3 overflow-x-auto rounded-[1rem] border border-slate-200">
                <table class="compact-table min-w-full text-sm">
                  <thead class="bg-stone-50 text-slate-500">
                    <tr>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">When</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Version</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Action</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Before</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">After</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Actor</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Comment</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 bg-white">
                    ${workflowHistory.length ? workflowHistory.map((item) => {
                      const historyNote = parseWorkflowHistoryNote(item.notes);
                      const transition = parseWorkflowTransitionValue(item.assumption_value);
                      return `
                      <tr>
                        <td class="px-3 py-2 font-semibold text-ink">${formatSync(item.created_at)}</td>
                        <td class="px-3 py-2">${item.forecast_version_id ? (versionCodeById[item.forecast_version_id] || item.forecast_version_id) : "—"}</td>
                        <td class="px-3 py-2">${item.assumption_title || item.assumption_type || "—"}</td>
                        <td class="px-3 py-2">${transition.before}</td>
                        <td class="px-3 py-2 font-medium ${transition.changed ? "text-ink" : "text-slate-600"}">${transition.after}</td>
                        <td class="px-3 py-2">${historyNote.actor}</td>
                        <td class="px-3 py-2">${historyNote.comment}</td>
                      </tr>
                    `;
                    }).join("") : `<tr><td colspan="7" class="px-3 py-3 text-sm text-slate-500">No transition history saved yet.</td></tr>`}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <details class="rounded-[1.25rem] border border-slate-200 bg-white p-4">
            <summary class="flex cursor-pointer list-none items-start justify-between gap-3">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Reference Data Details</p>
                <h3 class="mt-1 text-lg font-semibold tracking-tight text-ink">QBO source rows and planning extensions</h3>
                <p class="mt-2 text-sm text-slate-600">These tables are useful for setup troubleshooting, but they stay collapsed so the main Admin surface stays focused on project setup, close control, and review history.</p>
              </div>
              <span class="rounded-full border border-slate-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-slate-600">Show details</span>
            </summary>
            <div class="mt-4 space-y-4">
              <div class="rounded-[1.25rem] border border-slate-200 bg-white p-4">
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">QBO Bootstrap Customers</p>
                <p class="mt-2 text-sm text-slate-600">These are the connected QBO customers we can use to seed the first GovCon project and mapping records.</p>
                <div class="mt-3 overflow-x-auto rounded-[1rem] border border-slate-200">
                  <table class="compact-table min-w-full text-sm">
                    <thead class="bg-stone-50 text-slate-500">
                      <tr>
                        <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Customer</th>
                        <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">QBO ID</th>
                        <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Active</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                      ${setupState.bootstrapCustomers.length ? setupState.bootstrapCustomers.slice(0, 12).map((item) => `
                        <tr>
                          <td class="px-3 py-2 font-semibold text-ink">${item.displayName}</td>
                          <td class="px-3 py-2">${item.id}</td>
                          <td class="px-3 py-2">${String(item.active)}</td>
                        </tr>
                      `).join("") : `<tr><td colspan="3" class="px-3 py-3 text-sm text-slate-500">No QBO bootstrap customers loaded.</td></tr>`}
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="grid gap-4 xl:grid-cols-2">
                <div class="rounded-[1.25rem] border border-slate-200 bg-white p-4">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">QBO Employees</p>
                  <p class="mt-2 text-sm text-slate-600">Employee identity rows from the connected QBO organization.</p>
                  <div class="mt-3 overflow-x-auto rounded-[1rem] border border-slate-200">
                    <table class="compact-table min-w-full text-sm">
                      <thead class="bg-stone-50 text-slate-500">
                        <tr>
                          <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Employee</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">QBO ID</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Active</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 bg-white">
                        ${setupState.bootstrapEmployees.length ? setupState.bootstrapEmployees.slice(0, 12).map((item) => `
                          <tr>
                            <td class="px-3 py-2 font-semibold text-ink">${item.displayName}</td>
                            <td class="px-3 py-2">${item.id}</td>
                            <td class="px-3 py-2">${String(item.active)}</td>
                          </tr>
                        `).join("") : `<tr><td colspan="3" class="px-3 py-3 text-sm text-slate-500">No employee rows currently exist in the connected QBO organization.</td></tr>`}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div class="rounded-[1.25rem] border border-slate-200 bg-white p-4">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Employee Planning Extensions</p>
                  <p class="mt-2 text-sm text-slate-600">Supabase planning-only fields layered on top of QBO employee identities.</p>
                  <div class="mt-3 overflow-x-auto rounded-[1rem] border border-slate-200">
                    <table class="compact-table min-w-full text-sm">
                      <thead class="bg-stone-50 text-slate-500">
                        <tr>
                          <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Employee</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Labor Category</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em]">Cost Rate</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 bg-white">
                        ${setupState.employeeProfiles.length ? setupState.employeeProfiles.slice(0, 12).map((item) => `
                          <tr>
                            <td class="px-3 py-2 font-semibold text-ink">${item.display_name}</td>
                            <td class="px-3 py-2">${item.planning_labor_category || "—"}</td>
                            <td class="px-3 py-2">${item.default_cost_rate == null ? "—" : formatCurrency(item.default_cost_rate)}</td>
                          </tr>
                        `).join("") : `<tr><td colspan="3" class="px-3 py-3 text-sm text-slate-500">No employee extension rows yet. These will appear after we sync QBO employees and add planning fields in Supabase.</td></tr>`}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </section>
  `;
}

function renderProjectStatusStrip() {
  const context = currentProjectContext();
  const { project, version, setup, mapping, fundedValue, contractValue, readiness, baselineSnapshot, actualsThrough } = context;
  const qboStatus = qboConnectionStatusLabel();
  const syncState = mapping?.sync_status || project.syncStatus || "Not mapped";
  return `
    <div class="border-t border-slate-200 bg-stone-50/95">
      <div class="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          ${statusPill("Setup", `${readiness}%`, readiness < 70)}
          ${statusPill("Version", version?.code || "Working", false)}
          ${statusPill("Actuals Through", actualsThrough, false)}
          ${statusPill("Funding", fundedValue > 0 ? formatCompactCurrency(fundedValue) : "Not set", fundedValue <= 0)}
          ${statusPill("Contract", contractValue > 0 ? formatCompactCurrency(contractValue) : "Not set", contractValue <= 0)}
          ${statusPill("Baseline Ref", baselineSnapshot?.label || "Missing", !baselineSnapshot)}
          ${statusPill("QBO", qboStatus, qboState.status === "error")}
          ${statusPill("Sync", syncState, String(syncState).toLowerCase() !== "healthy")}
          ${setup?.setup_status ? statusPill("Setup Status", setup.setup_status, false) : ""}
        </div>
      </div>
    </div>
  `;
}

function statusPill(label, value, attention = false) {
  return `
    <span class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold ${
      attention
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-white text-slate-700"
    }">
      <span class="uppercase tracking-[0.12em] text-[10px] text-slate-400">${label}</span>
      <span>${value}</span>
    </span>
  `;
}

function adminGuideSteps() {
  return [
    ["project", "Project"],
    ["commercial", "Commercial"],
    ["revenue", "Revenue"],
    ["mapping", "QBO Mapping"],
    ["workflow", "Workflow"],
    ["baseline", "Baseline"]
  ];
}

function renderAdminSetupGuide(context, rule, baselineSnapshot) {
  const bundle = currentSetupBundle();
  const currentStep = state.ui.adminSetupStep || "project";
  const steps = adminGuideSteps();
  const currentIndex = Math.max(steps.findIndex(([key]) => key === currentStep), 0);
  const stepKey = steps[currentIndex][0];
  const setup = context.setup || {};
  const mapping = context.mapping || {};
  const workflowHistory = bundle.workflowHistory || [];
  const latestWorkflow = workflowHistory[0] || null;
  const latestWorkflowNote = parseWorkflowHistoryNote(latestWorkflow?.notes);
  const missingProjectFields = [
    !setup.customer_name ? "client" : null,
    !setup.project_manager_name && !context.liveProject?.pm_name ? "project manager" : null,
    !setup.organization_code ? "organization/business unit" : null,
    !setup.planning_start_period || !setup.planning_end_period ? "planning window" : null
  ].filter(Boolean);
  const stepContent = {
    project: {
      title: "Confirm project setup",
      body: missingProjectFields.length
        ? `Complete the core project profile before forecasting: ${missingProjectFields.join(", ")}.`
        : "Project profile looks populated enough to support forecasting and review.",
      cta: "Project setup fields are shown in the Live Project Setup section below."
    },
    commercial: {
      title: "Set commercial values",
      body: (context.fundedValue <= 0 && context.contractValue <= 0)
        ? "Revenue will stay zero until you set contract value, funded value, or a modification value."
        : `Commercial values are active. Effective funded value is ${formatCompactCurrency(context.fundedValue)} and effective contract value is ${formatCompactCurrency(context.contractValue)}.`,
      cta: "Use the Commercial Values form below to update the accounting values and planning modification."
    },
    revenue: {
      title: "Review revenue method",
      body: rule?.revenue_method_code
        ? `Primary revenue method is ${rule.revenue_method_code}. Confirm it matches the contract and percent-complete basis.`
        : "No primary revenue rule is seeded yet. Revenue logic should be confirmed before relying on outputs.",
      cta: "Check the Revenue Rule panel below."
    },
    mapping: {
      title: "Verify QBO mapping",
      body: mapping?.qbo_customer_id || mapping?.qbo_project_id
        ? `QBO mapping exists and current sync status is ${mapping.sync_status || "unknown"}.`
        : "No QBO customer or project mapping is present yet, so imported actuals may not align to this project.",
      cta: "Review the QBO Mapping panel below and then refresh QBO data."
    },
    workflow: {
      title: "Set review and close controls",
      body: setup.close_through_period
        ? `Actuals are currently closed through ${setup.close_through_period}. Latest workflow action is ${latestWorkflow?.assumption_title || "not yet saved"}.`
        : "No close-through period is set yet. Workflow notes, status transitions, and close control should be reviewed before locking a version.",
      cta: latestWorkflow
        ? `Latest actor: ${latestWorkflowNote.actor}. Use Review Notes And Close Control below to update the workflow state.`
        : "Use Review Notes And Close Control below to save notes, close periods, or reopen forecast months."
    },
    baseline: {
      title: "Create the baseline reference",
      body: baselineSnapshot
        ? `Baseline ${baselineSnapshot.label} already exists. Refresh it when you are ready to lock a new review reference point.`
        : "Create a baseline reference once setup, commercial values, and mapping are in place.",
      cta: "Use Create Baseline Snapshot in Baseline and forecast controls."
    }
  }[stepKey];

  return `
    <section class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Guided Setup</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Walk through the setup once</h2>
          <p class="mt-2 text-sm text-slate-600">This keeps configuration-heavy work linear and easier to review.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          ${steps.map(([key, label], index) => `
            <button data-admin-step="${key}" class="rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              currentStep === key
                ? "bg-ink text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }">
              ${index + 1}. ${label}
            </button>
          `).join("")}
        </div>
      </div>
      <div class="mt-4 rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
        <p class="text-sm font-semibold text-ink">${stepContent.title}</p>
        <p class="mt-2 text-sm text-slate-700">${stepContent.body}</p>
        <p class="mt-2 text-sm text-slate-600">${stepContent.cta}</p>
        <div class="mt-4 flex justify-between">
          <button data-admin-step-nav="prev" class="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-white" ${currentIndex === 0 ? "disabled" : ""}>
            Back
          </button>
          <button data-admin-step-nav="next" class="rounded-full bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-slateblue" ${currentIndex === steps.length - 1 ? "disabled" : ""}>
            Next
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderAskAiUi() {
  const isOpen = Boolean(state.ui.askAiOpen);
  const context = currentProjectContext();
  const suggestions = askAiSuggestions(context);

  return `
    <button id="askAiToggleBtn" class="fixed bottom-5 right-5 z-[70] rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slateblue">
      Ask AI
    </button>

    ${isOpen ? `
      <div id="askAiBackdrop" class="fixed inset-0 z-[75] bg-slate-900/25 backdrop-blur-[1px]"></div>
      <aside class="fixed right-0 top-0 z-[80] flex h-full w-full max-w-[28rem] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Ask AI</p>
            <h2 class="mt-1 text-xl font-semibold tracking-tight text-ink">Explain this project in plain English</h2>
            <p class="mt-2 text-sm text-slate-600">Ask about revenue, EAC movement, setup gaps, or variance drivers.</p>
          </div>
          <button id="askAiCloseBtn" class="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close</button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <div class="grid gap-2">
            ${suggestions.map((item) => `
              <button data-ask-ai-suggestion="${item}" class="rounded-xl border border-slate-200 bg-stone-50 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-stone-100">
                ${item}
              </button>
            `).join("")}
          </div>

          <form id="askAiForm" class="mt-4 space-y-3">
            <textarea id="askAiInput" rows="4" class="w-full rounded-[1rem] border border-slate-200 bg-white px-3 py-3 text-sm text-ink" placeholder="Why is EAC over on this project?">${state.ui.askAiDraft || ""}</textarea>
            <div class="flex justify-end">
              <button type="submit" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slateblue">Explain</button>
            </div>
          </form>

          <div class="mt-5 rounded-[1rem] border border-slate-200 bg-stone-50 p-4">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Current Answer</p>
            <div class="mt-2 text-sm leading-6 text-slate-700">${state.ui.askAiResponse || "No answer yet. Try one of the suggested questions above."}</div>
          </div>
        </div>
      </aside>
    ` : ""}
  `;
}

function renderAuthUi() {
  const isOpen = Boolean(state.ui?.authOpen);
  const user = signedInUser();
  const ownerEmail = authOwnerEmail();

  return `
    ${isOpen ? `
      <div id="authBackdrop" class="fixed inset-0 z-[85] bg-slate-900/25 backdrop-blur-[1px]"></div>
      <aside class="fixed right-0 top-0 z-[90] flex h-full w-full max-w-[30rem] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Sign In</p>
            <h2 class="mt-1 text-xl font-semibold tracking-tight text-ink">Google or email access</h2>
            <p class="mt-2 text-sm text-slate-600">Use Google OAuth or a magic-link email sign-in for prototype access.</p>
          </div>
          <button id="authCloseBtn" class="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close</button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <section class="rounded-[1.25rem] border border-slate-200 bg-stone-50 p-4">
            <p class="text-sm font-semibold text-ink">${user ? `Signed in as ${signedInUserName()}` : "Choose a sign-in method"}</p>
            <p class="mt-2 text-sm text-slate-600">
              ${authConfigured()
                ? (user
                  ? `${signedInUser()?.email || "No email"} is active with ${signedInProviderLabel()}.`
                  : "Google opens the OAuth flow. Email sends a magic link back to this app.")
                : "Authentication is not fully configured yet. Add SUPABASE_ANON_KEY and AUTH_OWNER_EMAIL to the backend env, then restart the backend."}
            </p>
            ${authState.info ? `<p class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">${authState.info}</p>` : ""}
            ${authState.error ? `<p class="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">${authState.error}</p>` : ""}
          </section>

          <section class="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-4">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Methods</p>
            <div class="mt-3 grid gap-3">
              <button id="authGoogleBtn" class="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" ${authConfigured() ? "" : "disabled"}>
                Continue with Google
              </button>
              <form id="authEmailForm" class="space-y-3">
                <label class="block text-sm font-medium text-slate-700" for="authEmailInput">Email</label>
                <input id="authEmailInput" name="email" type="email" class="w-full rounded-[1rem] border border-slate-200 bg-white px-3 py-3 text-sm text-ink" placeholder="name@company.com" value="${signedInUser()?.email || ""}" ${authConfigured() ? "" : "disabled"}>
                <button type="submit" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slateblue disabled:cursor-not-allowed disabled:opacity-50" ${authConfigured() ? "" : "disabled"}>
                  Send Magic Link
                </button>
              </form>
            </div>
          </section>

          <section class="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-4">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Owner visibility</p>
            <p class="mt-2 text-sm text-slate-600">
              ${ownerEmail
                ? `The owner-only sign-in activity section is visible only when ${ownerEmail} is signed in.`
                : "Set AUTH_OWNER_EMAIL in the backend env to turn on the owner-only sign-in activity section."}
            </p>
            ${user ? `
              <div class="mt-4 flex gap-2">
                <button id="authSignOutBtn" class="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Sign Out</button>
              </div>
            ` : ""}
          </section>
        </div>
      </aside>
    ` : ""}
  `;
}

function renderLandingIllustration(kind = "forecast") {
  if (kind === "budget") {
    return `
      <svg viewBox="0 0 320 180" class="h-28 w-full" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="10" y="16" width="300" height="148" rx="22" fill="#F8FAFC" stroke="#CBD5E1"/>
        <rect x="30" y="34" width="88" height="14" rx="7" fill="#0F172A" opacity="0.08"/>
        <rect x="30" y="62" width="110" height="10" rx="5" fill="#14B8A6" opacity="0.35"/>
        <rect x="30" y="82" width="160" height="10" rx="5" fill="#2563EB" opacity="0.3"/>
        <rect x="30" y="102" width="130" height="10" rx="5" fill="#22C55E" opacity="0.28"/>
        <rect x="210" y="58" width="22" height="66" rx="8" fill="#0EA5E9" opacity="0.85"/>
        <rect x="240" y="46" width="22" height="78" rx="8" fill="#14B8A6" opacity="0.75"/>
        <rect x="270" y="34" width="22" height="90" rx="8" fill="#1D4ED8" opacity="0.75"/>
        <path d="M36 136C72 114 96 120 130 96C154 79 175 83 198 72C230 57 255 69 288 46" stroke="#0F172A" stroke-width="4" stroke-linecap="round"/>
      </svg>
    `;
  }

  if (kind === "workflow") {
    return `
      <svg viewBox="0 0 320 180" class="h-28 w-full" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="12" y="20" width="82" height="48" rx="16" fill="#DBEAFE"/>
        <rect x="118" y="20" width="82" height="48" rx="16" fill="#CCFBF1"/>
        <rect x="224" y="20" width="82" height="48" rx="16" fill="#DCFCE7"/>
        <rect x="65" y="104" width="82" height="48" rx="16" fill="#E2E8F0"/>
        <rect x="171" y="104" width="82" height="48" rx="16" fill="#F1F5F9"/>
        <path d="M94 44H118" stroke="#0F172A" stroke-width="4" stroke-linecap="round"/>
        <path d="M200 44H224" stroke="#0F172A" stroke-width="4" stroke-linecap="round"/>
        <path d="M159 68V92" stroke="#0F172A" stroke-width="4" stroke-linecap="round"/>
        <path d="M112 128H171" stroke="#0F172A" stroke-width="4" stroke-linecap="round"/>
        <circle cx="53" cy="44" r="10" fill="#1D4ED8"/>
        <circle cx="159" cy="44" r="10" fill="#0D9488"/>
        <circle cx="265" cy="44" r="10" fill="#16A34A"/>
        <circle cx="106" cy="128" r="10" fill="#475569"/>
        <circle cx="212" cy="128" r="10" fill="#0F172A"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 320 180" class="h-28 w-full" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="10" y="14" width="300" height="152" rx="24" fill="#F8FAFC" stroke="#CBD5E1"/>
      <rect x="28" y="34" width="124" height="112" rx="18" fill="#FFFFFF" stroke="#E2E8F0"/>
      <rect x="168" y="34" width="124" height="52" rx="18" fill="#E0F2FE"/>
      <rect x="168" y="94" width="124" height="52" rx="18" fill="#ECFDF5"/>
      <path d="M48 118C72 96 88 102 106 82C122 64 132 69 140 58" stroke="#1D4ED8" stroke-width="4" stroke-linecap="round"/>
      <circle cx="48" cy="118" r="6" fill="#1D4ED8"/>
      <circle cx="106" cy="82" r="6" fill="#1D4ED8"/>
      <circle cx="140" cy="58" r="6" fill="#1D4ED8"/>
      <rect x="182" y="48" width="48" height="10" rx="5" fill="#0EA5E9" opacity="0.45"/>
      <rect x="182" y="64" width="78" height="10" rx="5" fill="#0EA5E9" opacity="0.25"/>
      <rect x="182" y="108" width="64" height="10" rx="5" fill="#10B981" opacity="0.35"/>
      <rect x="182" y="124" width="92" height="10" rx="5" fill="#10B981" opacity="0.18"/>
    </svg>
  `;
}

function renderLandingPage() {
  const configured = authConfigured();
  const loading = authState.status === "loading" || authState.status === "idle";
  const authReady = configured && !loading;
  const heroDescription = `Connect project forecasts to the company budget.
A connected planning workspace for project-based businesses.
Build project EACs, roll them into a consolidated forecast, layer in pipeline and white space, and review the impact on revenue, cost, and margin in one system instead of across disconnected spreadsheets.

This prototype shows how project planning, budgeting, sales assumptions, actuals, and review workflow work together in a single operating surface for finance and delivery teams.`;
  const landingMillions = (value) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return "—";
    return `$${(numeric / 1000000).toFixed(1)}M`;
  };

  return `
    <section class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.12),_transparent_32%),radial-gradient(circle_at_85%_16%,_rgba(20,184,166,0.14),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_42%,_#ffffff_100%)]">
      <div class="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-8">
        <header class="flex items-center justify-between">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">EAC Planner</p>
            <h1 class="mt-2 max-w-5xl text-3xl font-semibold tracking-tight text-ink lg:text-[2.75rem]">Ditch spreadsheet chaos. Connect project EACs to your company forecast in one workspace.</h1>
          </div>
          <div class="flex items-center gap-3">
            <button id="landingHeaderSignInBtn" class="rounded-full border border-slate-300 bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
              Sign in
            </button>
            <button id="landingHeaderSignUpBtn" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slateblue">
              Sign up
            </button>
          </div>
        </header>

        <main class="mt-10 space-y-10">
          <section class="grid items-center gap-8 lg:grid-cols-[0.92fr_1.08fr]">
            <div class="landing-reveal opacity-0 translate-y-4 transition duration-700 ease-out">
              <div class="max-w-2xl">
                <p class="text-sm font-semibold text-sea">Connected planning for project-based businesses</p>
                <p class="mt-5 whitespace-pre-line text-base leading-8 text-slate-600">${heroDescription}</p>
                <div class="mt-8 flex flex-wrap gap-3">
                  <button id="landingPrimaryCta" class="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slateblue">
                    Explore the planning model
                  </button>
                </div>
                <div class="mt-8 grid gap-3 sm:grid-cols-3">
                  <div class="rounded-[1.25rem] border border-slate-200 bg-white/85 px-4 py-4 shadow-sm">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Plan by project</p>
                    <p class="mt-2 text-sm leading-6 text-slate-700">Labor, subs, equipment, materials, ODC, funded value, and margin.</p>
                  </div>
                  <div class="rounded-[1.25rem] border border-slate-200 bg-white/85 px-4 py-4 shadow-sm">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Roll up to company</p>
                    <p class="mt-2 text-sm leading-6 text-slate-700">Summary, client-grouped projects, expenses, sales, and revenue composition.</p>
                  </div>
                  <div class="rounded-[1.25rem] border border-slate-200 bg-white/85 px-4 py-4 shadow-sm">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Review with control</p>
                    <p class="mt-2 text-sm leading-6 text-slate-700">Baseline, actuals through, close control, explanations, and workflow history.</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="landing-reveal opacity-0 translate-y-4 transition duration-700 ease-out [transition-delay:120ms] lg:pt-10">
              <div class="relative rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-[0_28px_90px_rgba(15,23,42,0.12)] backdrop-blur">
                <div class="absolute inset-x-10 top-0 h-24 rounded-full bg-sky-200/30 blur-3xl"></div>
                <div class="relative overflow-hidden rounded-[1.6rem] border border-slate-200 bg-slate-50">
                  <div class="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                    <div class="flex items-center gap-2">
                      <span class="h-2.5 w-2.5 rounded-full bg-slate-300"></span>
                      <span class="h-2.5 w-2.5 rounded-full bg-slate-300"></span>
                      <span class="h-2.5 w-2.5 rounded-full bg-slate-300"></span>
                    </div>
                    <div class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Live planning model</div>
                  </div>
                  <div class="grid gap-4 p-4 lg:grid-cols-[0.96fr_1.04fr]">
                    <div class="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
                      <div class="flex items-center justify-between">
                        <div>
                          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Project EAC</p>
                          <h2 class="mt-1 text-lg font-semibold text-ink">Amy's Bird Sanctuary</h2>
                        </div>
                        <span class="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">FP</span>
                      </div>
                        <div class="mt-4 grid gap-3 sm:grid-cols-2">
                          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Effective funded value</p>
                            <p class="mt-1 text-lg font-semibold text-ink xl:text-xl">${landingMillions(2100000)}</p>
                          </div>
                          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">EAC margin</p>
                            <p class="mt-1 text-lg font-semibold text-ink xl:text-xl">${landingMillions(1256096)}</p>
                          </div>
                        </div>
                      <div class="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-3">
                        <div class="flex items-end justify-between">
                          <div>
                            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Revenue and cost trend</p>
                            <p class="mt-1 text-sm text-slate-600">Project changes update company views.</p>
                          </div>
                          <div class="text-right">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Margin %</p>
                            <p class="mt-1 text-sm font-semibold text-ink">58.8%</p>
                          </div>
                        </div>
                        <svg viewBox="0 0 360 180" class="mt-4 h-36 w-full" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M30 124C60 118 76 106 102 100C124 95 142 96 166 88C192 79 210 73 236 69C262 65 286 54 330 46" stroke="#2563EB" stroke-width="4" stroke-linecap="round"/>
                          <path d="M30 142C60 138 80 129 110 122C134 116 152 114 176 108C200 102 223 97 248 92C274 87 300 81 330 76" stroke="#14B8A6" stroke-width="4" stroke-linecap="round"/>
                          <rect x="30" y="104" width="18" height="46" rx="7" fill="#0F172A" opacity="0.08"/>
                          <rect x="72" y="98" width="18" height="52" rx="7" fill="#0F172A" opacity="0.08"/>
                          <rect x="114" y="90" width="18" height="60" rx="7" fill="#0F172A" opacity="0.08"/>
                          <rect x="156" y="82" width="18" height="68" rx="7" fill="#0F172A" opacity="0.08"/>
                          <rect x="198" y="74" width="18" height="76" rx="7" fill="#0F172A" opacity="0.08"/>
                          <rect x="240" y="66" width="18" height="84" rx="7" fill="#0F172A" opacity="0.08"/>
                          <rect x="282" y="56" width="18" height="94" rx="7" fill="#0F172A" opacity="0.08"/>
                        </svg>
                      </div>
                    </div>

                    <div class="space-y-4">
                      <div class="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
                        <div class="flex items-start justify-between gap-3">
                          <div>
                            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Company Summary</p>
                            <h2 class="mt-1 text-lg font-semibold text-ink">Consolidated forecast</h2>
                          </div>
                          <span class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">Monthly + Quarterly</span>
                        </div>
                        <div class="mt-4 grid gap-3 sm:grid-cols-2">
                          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Secured revenue</p>
                            <p class="mt-1 text-lg font-semibold text-ink xl:text-xl">${landingMillions(24007229)}</p>
                          </div>
                          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Weighted growth</p>
                            <p class="mt-1 text-lg font-semibold text-ink xl:text-xl">${landingMillions(6792771)}</p>
                          </div>
                        </div>
                        <div class="mt-4 overflow-hidden rounded-[1.25rem] border border-slate-200">
                          <table class="min-w-full text-sm">
                            <thead class="bg-slate-50 text-slate-500">
                              <tr>
                                <th class="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.16em]">Line item</th>
                                <th class="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.16em]">Current month</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 bg-white">
                              <tr><td class="px-3 py-2 font-medium text-ink">Revenue</td><td class="px-3 py-2 text-right">$30,800,000</td></tr>
                              <tr><td class="px-3 py-2 font-medium text-ink">Direct cost</td><td class="px-3 py-2 text-right">$12,942,500</td></tr>
                              <tr><td class="px-3 py-2 font-medium text-ink">Gross margin</td><td class="px-3 py-2 text-right">$17,857,500</td></tr>
                              <tr><td class="px-3 py-2 font-medium text-ink">Operating income</td><td class="px-3 py-2 text-right">$14,928,000</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div class="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Workflow visibility</p>
                        <div class="mt-3 grid gap-2 sm:grid-cols-3">
                          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Baseline</p>
                            <p class="mt-1 text-[13px] font-semibold leading-5 text-ink">Original budget</p>
                          </div>
                          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Actuals through</p>
                            <p class="mt-1 text-[13px] font-semibold leading-5 text-ink">2026-03</p>
                          </div>
                          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Status</p>
                            <p class="mt-1 text-[13px] font-semibold leading-5 text-ink">In Review</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="landing-capabilities" class="landing-reveal rounded-[2rem] border border-slate-200 bg-white/92 p-7 shadow-panel opacity-0 translate-y-4 transition duration-700 ease-out [transition-delay:90ms]">
            <div class="max-w-3xl">
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">How it works</p>
              <h2 class="mt-2 text-2xl font-semibold tracking-tight text-ink">Planning, budgeting, and review in one connected surface</h2>
              <p class="mt-3 text-sm leading-7 text-slate-600">The workflow is designed so project-level changes flow naturally into company-level reporting without losing the why behind the movement.</p>
            </div>
            <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              ${[
                ["Plan by project", "Labor, subs, equipment, materials, ODC, funded value, and margin."],
                ["Roll up to company", "Summary, client-grouped projects, expenses, sales, and revenue composition."],
                ["Review with control", "Baseline, actuals through, close control, explanations, and workflow history."],
                ["Forecast delivery", "Connect cost, revenue, actuals, and EAC so project-level changes instantly update company views."],
                ["Build the company outlook", "Roll project plans into a company-wide forecast with expenses, pipeline, and white-space demand."],
                ["Explain movement fast", "Review baseline vs. current forecast, isolate drivers, and keep workflow visible."]
              ].map(([title, body], index) => `
                <article class="group rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 transition duration-300 hover:-translate-y-1 hover:border-sky-200 hover:bg-white hover:shadow-lg">
                  <div class="flex items-center justify-between">
                    <span class="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 shadow-sm">0${index + 1}</span>
                    <span class="h-9 w-9 rounded-2xl bg-gradient-to-br from-sky-50 to-teal-50"></span>
                  </div>
                  <h3 class="mt-4 text-lg font-semibold text-ink">${title}</h3>
                  <p class="mt-2 text-sm leading-6 text-slate-600">${body}</p>
                </article>
              `).join("")}
            </div>
          </section>

          <section id="landing-workflow" class="landing-reveal grid gap-6 lg:grid-cols-[0.9fr_1.1fr] opacity-0 translate-y-4 transition duration-700 ease-out [transition-delay:150ms]">
            <div class="rounded-[2rem] border border-slate-200 bg-white/92 p-7 shadow-panel">
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Workflow</p>
              <h2 class="mt-2 text-2xl font-semibold tracking-tight text-ink">How the workflow comes together</h2>
              <ul class="mt-5 space-y-4 text-sm leading-7 text-slate-600">
                <li class="flex gap-3"><span class="mt-1 h-2.5 w-2.5 rounded-full bg-sky-500"></span><span>Start in project planning and financial review.</span></li>
                <li class="flex gap-3"><span class="mt-1 h-2.5 w-2.5 rounded-full bg-teal-500"></span><span>Roll everything into Summary, Projects, Sales, and Expenses.</span></li>
                <li class="flex gap-3"><span class="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500"></span><span>Review variance, forecast movement, and sign-in activity with visible controls.</span></li>
              </ul>
            </div>
            <div class="rounded-[2rem] border border-slate-200 bg-white/92 p-7 shadow-panel">
              <div class="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
                <div class="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-center">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">1</p>
                  <h3 class="mt-2 text-base font-semibold text-ink">Project Planning</h3>
                  <p class="mt-2 text-sm text-slate-600">Build EAC, actuals, and margin by project.</p>
                </div>
                <div class="hidden text-center text-xl font-semibold text-slate-300 md:block">→</div>
                <div class="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-center">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">2</p>
                  <h3 class="mt-2 text-base font-semibold text-ink">Company Summary</h3>
                  <p class="mt-2 text-sm text-slate-600">Roll projects, sales, and expenses into one forecast.</p>
                </div>
                <div class="hidden text-center text-xl font-semibold text-slate-300 md:block">→</div>
                <div class="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-center">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">3</p>
                  <h3 class="mt-2 text-base font-semibold text-ink">Review & Control</h3>
                  <p class="mt-2 text-sm text-slate-600">Compare baseline, explain movement, and keep workflow visible.</p>
                </div>
              </div>
            </div>
          </section>

          <section id="landing-get-started" class="landing-reveal grid gap-6 lg:grid-cols-[1.02fr_0.98fr] opacity-0 translate-y-4 transition duration-700 ease-out [transition-delay:210ms]">
            <div class="rounded-[2rem] border border-slate-200 bg-white/92 p-7 shadow-panel">
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Get Started</p>
              <h2 class="mt-2 text-2xl font-semibold tracking-tight text-ink">Sign in or create access</h2>
              <p class="mt-3 text-sm leading-7 text-slate-600">Use Google for the fastest path, or email yourself a magic link.</p>
              <div class="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                <p class="text-sm font-semibold text-ink">You are signed out.</p>
                <p class="mt-1 text-sm text-slate-600">
                  ${loading
                    ? "Checking authentication settings for this environment."
                    : configured
                      ? "Both Google and email sign-in are ready for prototype access."
                      : "Authentication is wired into the prototype, but the environment still needs its public Supabase auth settings to be finished."}
                </p>
              </div>
              ${authState.info ? `<p class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">${authState.info}</p>` : ""}
              ${authState.error ? `<p class="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">${authState.error}</p>` : ""}
            </div>

            <div class="rounded-[2rem] border border-slate-200 bg-white/92 p-7 shadow-panel">
              <div class="space-y-4">
                <button id="landingGoogleBtn" class="flex w-full items-center justify-center gap-3 rounded-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" ${authReady ? "" : "disabled"}>
                  <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.27-2.09 3.57-5.18 3.57-8.64Z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.14-4.07 1.14-3.12 0-5.77-2.1-6.72-4.93H1.28v3.09A11.99 11.99 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.28 14.3A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.58.37-2.3V6.61H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.09Z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.35.6 4.6 1.78l3.45-3.45C17.95 1.1 15.24 0 12 0 7.31 0 3.28 2.69 1.28 6.61l4 3.09C6.23 6.87 8.88 4.77 12 4.77Z"/></svg>
                  Sign in or sign up with Google
                </button>

                <form id="landingEmailForm" class="space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <label class="block text-sm font-medium text-slate-700" for="landingEmailInput">Email</label>
                  <input id="landingEmailInput" name="email" type="email" class="w-full rounded-[1rem] border border-slate-200 bg-white px-3 py-3 text-sm text-ink" placeholder="name@company.com" ${authReady ? "" : "disabled"}>
                  <button type="submit" class="w-full rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slateblue disabled:cursor-not-allowed disabled:opacity-50" ${authReady ? "" : "disabled"}>
                    Email Sign in or sign up with email
                  </button>
                </form>
              </div>
            </div>
          </section>
        </main>

      </div>
    </section>
  `;
}

function summaryTile(label, value, attention = false) {
  return `
    <div class="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">${label}</div>
      <div class="mt-1 text-sm font-semibold ${attention ? "text-rose-700" : "text-ink"}">${value}</div>
    </div>
  `;
}

function getCardMode(key) {
  const mode = state.ui?.cardModes?.[key];
  return mode === "data" ? "data" : "visual";
}

function cardModeToggle(key) {
  const current = getCardMode(key);
  return `
    <div class="inline-flex rounded-full border border-slate-200 bg-white p-1">
      ${["visual", "data"].map((mode) => `
        <button
          type="button"
          data-card-mode-key="${key}"
          data-card-mode="${mode}"
          class="rounded-full px-3 py-1 text-xs font-semibold transition ${current === mode ? "bg-ink text-white" : "text-slate-600 hover:bg-stone-50"}"
        >
          ${mode === "visual" ? "Visual" : "Data"}
        </button>
      `).join("")}
    </div>
  `;
}

function buildForecastEconomicsExplanation({
  fixedPriceProject,
  actualCost,
  etcCost,
  eacCost,
  percentComplete,
  eacMargin,
  marginPct,
  largestCategory
}) {
  const completionLabel = fixedPriceProject ? "percent complete through actuals" : "percent complete";
  const firstParagraph = `${formatCompactCurrency(actualCost)} of cost has been incurred so far, while ${formatCompactCurrency(etcCost)} remains forecast to finish the work. Together those produce an EAC cost of ${formatCompactCurrency(eacCost)}, so the current ${completionLabel} is ${percentComplete.toFixed(1)}%.`;
  const secondParagraph = `${formatCompactCurrency(eacMargin)} of projected margin remains at completion, which equates to ${marginPct.toFixed(1)}% on revenue. ${largestCategory ? `${largestCategory.label} is currently the largest cost driver at ${formatCompactCurrency(largestCategory.eac)}.` : "No single cost category is dominating the forecast right now."}`;
  return [firstParagraph, secondParagraph];
}

function widthPct(value, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function renderProgressTrack({ title, totalLabel, totalValue, segments, summaryText = "" }) {
  const safeTotal = Math.max(0, Number(totalValue || 0));
  return `
    <div class="rounded-[1rem] border border-slate-200 bg-white p-4">
      <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">${title}</div>
      <div class="mt-3 flex items-center justify-between gap-3">
        <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">${totalLabel}</div>
        <div class="text-lg font-semibold text-ink">${safeTotal > 0 ? formatCompactCurrency(safeTotal) : "Not set"}</div>
      </div>
      <div class="mt-4 h-5 overflow-hidden rounded-full bg-slate-200/70">
        <div class="flex h-full w-full">
          ${segments.map((segment) => `
            <div
              class="flex h-full items-center justify-center overflow-hidden text-[10px] font-semibold text-slate-700"
              style="width:${safeTotal > 0 ? widthPct(segment.value, safeTotal) : 0}%; background:${segment.stroke}; opacity:${segment.strokeOpacity ?? 0.65}"
            >
              ${safeTotal > 0 && widthPct(segment.value, safeTotal) >= 16 ? `${widthPct(segment.value, safeTotal).toFixed(0)}%` : ""}
            </div>
          `).join("")}
        </div>
      </div>
      <div class="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-sm text-slate-600">${summaryText || segments.map((segment) => `${segment.label} ${segment.displayValue} (${safeTotal > 0 ? widthPct(segment.value, safeTotal).toFixed(1) : "0.0"}%)`).join(" · ")}</div>
    </div>
  `;
}

function renderForecastDonutPanels({
  revenue,
  cost,
  margin,
  actualCost,
  etcCost,
  currentPeriodRevenue,
  marginPct,
  largestDriverLabel,
  largestDriverValue,
  revenueBasisLabel
}) {
  const safeRevenue = Math.max(0, Number(revenue || 0));
  const safeCost = Math.max(0, Number(cost || 0));
  const safeMargin = Math.max(0, Number(margin || 0));
  const safeActualCost = Math.max(0, Number(actualCost || 0));
  const safeEtcCost = Math.max(0, Number(etcCost || 0));
  const remainingRevenueCapacity = Math.max(safeRevenue - safeCost - safeMargin, 0);
  return `
    <div class="grid gap-4">
      ${renderProgressTrack({
        title: "Revenue Structure",
        totalLabel: "Revenue Recognized",
        totalValue: safeRevenue,
        segments: [
          {
            label: "Cost covered by revenue",
            value: safeCost,
            displayValue: formatCompactCurrency(safeCost),
            stroke: "rgb(96 165 250 / 0.68)"
          },
          {
            label: "EAC margin",
            value: safeMargin,
            displayValue: formatCompactCurrency(margin),
            stroke: "rgb(250 204 21 / 0.62)"
          },
          {
            label: "Remaining revenue capacity",
            value: remainingRevenueCapacity,
            displayValue: formatCompactCurrency(remainingRevenueCapacity),
            stroke: "rgb(74 222 128 / 0.55)"
          }
        ],
        summaryText: `${formatCompactCurrency(safeCost)} cost (${safeRevenue > 0 ? widthPct(safeCost, safeRevenue).toFixed(1) : "0.0"}%) + ${formatCompactCurrency(margin)} margin (${safeRevenue > 0 ? widthPct(safeMargin, safeRevenue).toFixed(1) : "0.0"}%) + ${formatCompactCurrency(remainingRevenueCapacity)} remaining (${safeRevenue > 0 ? widthPct(remainingRevenueCapacity, safeRevenue).toFixed(1) : "0.0"}%)`
      })}
      ${renderProgressTrack({
        title: "Cost Flow",
        totalLabel: "EAC Cost",
        totalValue: safeCost,
        segments: [
          {
            label: "Actual cost",
            value: safeActualCost,
            displayValue: formatCompactCurrency(actualCost),
            stroke: "rgb(96 165 250 / 0.72)"
          },
          {
            label: "ETC",
            value: safeEtcCost,
            displayValue: formatCompactCurrency(etcCost),
            stroke: "rgb(74 222 128 / 0.55)"
          }
        ],
        summaryText: `${formatCompactCurrency(actualCost)} actual (${safeCost > 0 ? widthPct(safeActualCost, safeCost).toFixed(1) : "0.0"}%) + ${formatCompactCurrency(etcCost)} ETC (${safeCost > 0 ? widthPct(safeEtcCost, safeCost).toFixed(1) : "0.0"}%)`
      })}
      <div class="rounded-[1rem] border border-slate-200 bg-white p-4">
        <div class="grid gap-3 md:grid-cols-2">
          ${summaryTile("Revenue basis", revenueBasisLabel)}
          ${summaryTile("Current period revenue", formatCompactCurrency(currentPeriodRevenue))}
          ${summaryTile("Margin %", `${marginPct.toFixed(1)}%`, marginPct < 0)}
          ${summaryTile("Largest cost driver", largestDriverLabel || "None")}
        </div>
      </div>
      <div class="rounded-[1rem] border border-slate-200 bg-white p-4">
        <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Driver Context</div>
        <div class="mt-2 text-lg font-semibold text-ink">${largestDriverLabel || "No dominant driver"}</div>
        <div class="mt-1 text-sm text-slate-500">${largestDriverLabel ? `${formatCompactCurrency(largestDriverValue)} is currently the largest category in the EAC mix.` : "No driver available."}</div>
        <div class="mt-4 rounded-xl bg-stone-50 px-3 py-2 text-sm text-slate-600">
          The visual view emphasizes revenue, cost, and margin structure. Detailed percentages and baseline math remain available in Data mode.
        </div>
      </div>
    </div>
  `;
}

function financialMetricRow(label, plan, prior, eac, benchmark, inverse = false, percentOnly = false) {
  const variance = eac - plan;
  const varianceClass = inverse ? (variance > 0 ? "text-rose-700" : "text-emerald-700") : (variance < 0 ? "text-rose-700" : "text-emerald-700");
  const planText = percentOnly ? `${plan.toFixed(1)}%` : formatCurrency(plan);
  const priorText = percentOnly ? `${prior.toFixed(1)}%` : formatCurrency(prior);
  const eacText = percentOnly ? `${eac.toFixed(1)}%` : formatCurrency(eac);
  const benchmarkText = percentOnly ? `${benchmark.toFixed(1)}%` : formatCurrency(benchmark);
  const varianceText = percentOnly ? formatMarginVariance(variance) : formatVarianceCell(variance, percentChange(eac, plan));

  return `
    <tr>
      <td class="px-3 py-2 font-semibold text-ink">${label}</td>
      <td class="px-3 py-2 text-right">${planText}</td>
      <td class="px-3 py-2 text-right">${priorText}</td>
      <td class="px-3 py-2 text-right font-semibold text-slate-700">${eacText}</td>
      <td class="px-3 py-2 text-right ${varianceClass}">${varianceText}</td>
      <td class="px-3 py-2 text-right">${benchmarkText}</td>
    </tr>
  `;
}

function dashboardStatLight(label, value) {
  return `
    <div class="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
      <span class="text-slate-600">${label}</span>
      <strong class="text-ink">${value}</strong>
    </div>
  `;
}

function heroMetricBlock(label, plan, eac, mode = "currency", inverse = false) {
  const delta = eac - plan;
  const pct = plan ? (delta / plan) * 100 : 0;
  const bad = inverse ? delta > 0 : delta < 0;
  const varianceClass = bad ? "text-rose-700" : "text-emerald-700";
  const planText = mode === "margin" ? `${plan.toFixed(1)}%` : formatCurrency(plan);
  const eacText = mode === "margin" ? `${eac.toFixed(1)}%` : formatCurrency(eac);
  const varianceText = mode === "margin" ? formatMarginVariance(delta) : formatVarianceCell(delta, pct);

  return `
    <div class="rounded-xl border border-slate-200 bg-stone-50 px-4 py-3">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">${label}</p>
      <div class="mt-2 flex items-center justify-between gap-2">
        <div>
          <div class="text-[10px] uppercase tracking-wide text-slate-400">Plan</div>
          <div class="text-sm font-semibold text-ink">${planText}</div>
        </div>
        <div class="text-right">
          <div class="text-[10px] uppercase tracking-wide text-slate-400">EAC</div>
          <div class="text-sm font-semibold text-ink">${eacText}</div>
        </div>
      </div>
      <div class="mt-1.5 text-xs font-semibold ${varianceClass}">${varianceText}</div>
    </div>
  `;
}

function sumPlanCost(category) {
  return getPlanMonthlyTotals(getProject(), category).reduce((a, b) => a + b, 0);
}

function percentChange(current, baseline) {
  if (!baseline) return 0;
  return ((current - baseline) / baseline) * 100;
}

function formatVarianceCell(amount, percent) {
  return `${formatCompactCurrency(amount)} (${percent.toFixed(1)}%)`;
}

function formatMarginVariance(points) {
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)} pts`;
}

function healthTone(kpis, signals) {
  if (kpis.margin < 5) {
    return { label: "Red", badgeClass: "bg-rose-50 text-rose-700" };
  }
  if ((signals.missingActualMappings || 0) > 0 || kpis.margin < 8) {
    return { label: "Yellow", badgeClass: "bg-amber-50 text-amber-700" };
  }
  return { label: "Green", badgeClass: "bg-emerald-50 text-emerald-700" };
}

function hasLiveQboConnection() {
  return qboState.status === "ready" || qboState.status === "loading";
}

function qboConnectionStatusLabel() {
  if (qboState.status === "loading") return "Loading";
  if (qboState.status === "ready") return "Connected";
  if (qboState.status === "error") return "Connection Error";
  return "Waiting";
}

function renderQboOverviewPanel(reviewSignals, overallocated, liveActuals) {
  if (qboState.status === "loading") {
    return `
      <div class="rounded-xl bg-stone-50 px-3 py-2 text-sm text-slate-600">
        Loading live QuickBooks data for ${state.selectedYear}...
      </div>
    `;
  }

  if (qboState.status === "error") {
    return `
      <div class="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
        ${qboState.error || "QuickBooks data could not be loaded."}
      </div>
      ${dashboardStatLight("Open risk exposure", formatCompactCurrency(reviewSignals.openRisks || 0))}
      ${dashboardStatLight("Pending changes", formatCompactCurrency(reviewSignals.pendingChanges || 0))}
      ${dashboardStatLight("Missing actual mappings", String(reviewSignals.missingActualMappings || 0))}
      ${dashboardStatLight("Overallocated resources", String(overallocated))}
    `;
  }

  if (liveActuals) {
    return `
      ${dashboardStatLight("Company", liveActuals.companyName)}
      ${dashboardStatLight("Revenue actuals", formatCompactCurrency(liveActuals.revenue))}
      ${dashboardStatLight("Cost actuals", formatCompactCurrency(liveActuals.cost))}
      ${dashboardStatLight("Net income", formatCompactCurrency(liveActuals.profit))}
      ${dashboardStatLight("Operating cash flow", liveActuals.operatingCashFlow ? formatCompactCurrency(liveActuals.operatingCashFlow) : "Unavailable")}
    `;
  }

  return `
    <div class="rounded-xl bg-stone-50 px-3 py-2 text-sm text-slate-600">
      Live QuickBooks data has not loaded yet.
    </div>
  `;
}

function applyImportedProjectActuals(projectRows = []) {
  const grouped = new Map();

  (projectRows || []).forEach((row) => {
    if (!row.project_id || !row.actual_period) return;
    const monthIndex = Math.max(Number(String(row.actual_period).slice(5, 7)) - 1, 0);
    if (!grouped.has(row.project_id)) {
      grouped.set(row.project_id, {
        totalCost: Array(12).fill(0),
        revenue: Array(12).fill(0)
      });
    }
    const target = grouped.get(row.project_id);
    target.totalCost[monthIndex] = Number(row.cost_actual || 0);
    target.revenue[monthIndex] = Number(row.revenue_actual || 0);
  });

  state.projects = (state.projects || []).map((project) => {
    const imported = grouped.get(project.id);
    if (!imported) return project;
    return {
      ...project,
      actuals: {
        ...(project.actuals || {}),
        totalCost: imported.totalCost,
        revenue: imported.revenue
      }
    };
  });
}

function formatSync(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderCharts() {
  const project = getProject();
  if (!project?.planning || !project?.actuals) {
    trendChart?.destroy();
    trendChart = null;
    cumulativeTrendChart?.destroy();
    cumulativeTrendChart = null;
    costMixChart?.destroy();
    costMixChart = null;
    budgetPnLChart?.destroy();
    budgetPnLChart = null;
    budgetRevenueCompositionChart?.destroy();
    budgetRevenueCompositionChart = null;
    budgetSalesTrendChart?.destroy();
    budgetSalesTrendChart = null;
    return;
  }
  const context = currentProjectContext();
  const monthly = buildMonthlyMetrics(project);
  const baselineSnapshot = context.baselineSnapshot;
  const baselineMonthly = baselineSnapshot?.monthlyRows || [];
  const baselineCostScaleMonthly = baselineMonthly.length
    ? baselineMonthly
    : monthly.map((item) => ({
      monthIndex: item.monthIndex,
      currentPeriodRevenue: Number(item.currentPeriodRevenue || 0),
      currentPeriodCost: Number(item.currentPeriodCost || 0),
      cumulativeRevenue: Number(item.revenue || 0),
      cumulativeCost: Number(item.cumulativeCost || 0)
    }));
  const trendCanvas = document.getElementById("trendChart");
  const cumulativeTrendCanvas = document.getElementById("cumulativeTrendChart");
  const costMixCanvas = document.getElementById("costMixChart");
  const budgetPnLCanvas = document.getElementById("budgetPnLChart");
  const budgetRevenueCompositionCanvas = document.getElementById("budgetRevenueCompositionChart");
  const budgetSalesTrendCanvas = document.getElementById("budgetSalesTrendChart");
  const actualsThroughIndex = monthly.reduce(
    (latest, item, index) => (Number(item.actualCost || 0) > 0 ? index : latest),
    -1
  );
  const baselineMarginPct = Number(baselineSnapshot?.summary?.marginPct || computeMarginPercent(
    baselineSnapshot?.summary?.revenueEac || 0,
    baselineSnapshot?.summary?.eacCost || 0
  ));
  const eacMarginPct = computeMarginPercent(
    Number(context.backendFinance?.summary?.revenueEac || context.fundedValue || context.contractValue || 0),
    Number(context.backendFinance?.summary?.eacCost || monthly[monthly.length - 1]?.eacCost || 0)
  );

  if (trendCanvas) {
    trendChart?.destroy();
    trendChart = buildTrendChart(trendCanvas, {
      labels: state.meta.months,
      actualsThroughIndex,
      xAxisTitle: "Month",
      yAxisTitle: "Monthly Revenue and Cost ($)",
      datasets: [
        {
          label: "Baseline Revenue",
          data: baselineCostScaleMonthly.map((item) => Number(item.currentPeriodRevenue || 0)),
          borderColor: "rgba(37, 99, 235, 0.95)",
          backgroundColor: "rgba(59, 130, 246, 0.08)",
          borderWidth: 3,
          tension: 0.28,
          fill: false,
          pointRadius: 0
        },
        {
          label: "EAC Revenue",
          data: monthly.map((item) => Number(item.currentPeriodRevenue || 0)),
          borderColor: "rgba(3, 105, 161, 0.95)",
          backgroundColor: "rgba(56, 189, 248, 0.08)",
          borderWidth: 3,
          tension: 0.28,
          fill: false,
          pointRadius: 0
        },
        {
          type: "bar",
          label: "Baseline Cost",
          data: baselineCostScaleMonthly.map((item) => Number(item.currentPeriodCost || 0)),
          backgroundColor: "rgba(45, 212, 191, 0.24)",
          borderColor: "rgba(13, 148, 136, 0.95)",
          borderWidth: 1.2,
          barPercentage: 0.82,
          categoryPercentage: 0.72
        },
        {
          type: "bar",
          label: "EAC Cost",
          data: monthly.map((item) => Number(item.currentPeriodCost || 0)),
          backgroundColor: "rgba(16, 185, 129, 0.2)",
          borderColor: "rgba(5, 150, 105, 0.95)",
          borderWidth: 1.2,
          barPercentage: 0.82,
          categoryPercentage: 0.72
        }
      ]
    });
  }

  if (cumulativeTrendCanvas) {
    cumulativeTrendChart?.destroy();
    cumulativeTrendChart = buildTrendChart(cumulativeTrendCanvas, {
      labels: state.meta.months,
      actualsThroughIndex,
      xAxisTitle: "Month",
      yAxisTitle: "Cumulative Revenue and Cost ($)",
      datasets: [
        {
          label: "Baseline Revenue",
          data: baselineCostScaleMonthly.map((item) => Number(item.cumulativeRevenue || 0)),
          borderColor: "rgba(37, 99, 235, 0.95)",
          backgroundColor: "rgba(59, 130, 246, 0.08)",
          borderWidth: 3,
          tension: 0.28,
          fill: false,
          pointRadius: 0
        },
        {
          label: "EAC Revenue",
          data: monthly.map((item) => Number(item.revenue || 0)),
          borderColor: "rgba(3, 105, 161, 0.95)",
          backgroundColor: "rgba(56, 189, 248, 0.08)",
          borderWidth: 3,
          tension: 0.28,
          fill: false,
          pointRadius: 0
        },
        {
          type: "bar",
          label: "Baseline Cost",
          data: baselineCostScaleMonthly.map((item) => Number(item.cumulativeCost || 0)),
          backgroundColor: "rgba(45, 212, 191, 0.24)",
          borderColor: "rgba(13, 148, 136, 0.95)",
          borderWidth: 1.2,
          barPercentage: 0.82,
          categoryPercentage: 0.72
        },
        {
          type: "bar",
          label: "EAC Cost",
          data: monthly.map((item) => Number(item.cumulativeCost || 0)),
          backgroundColor: "rgba(16, 185, 129, 0.2)",
          borderColor: "rgba(5, 150, 105, 0.95)",
          borderWidth: 1.2,
          barPercentage: 0.82,
          categoryPercentage: 0.72
        }
      ]
    });
  }

  if (costMixCanvas) {
    costMixChart?.destroy();
    const categoryRows = buildCategorySummary(project);
    const baselineCategoryMap = new Map((baselineSnapshot?.categories || []).map((row) => [row.key, Number(row.eac || 0)]));
    costMixChart = buildCostMixChart(costMixCanvas, {
      labels: categoryRows.map((row) => row.label),
      xAxisTitle: "Cost ($)",
      yAxisTitle: "Cost Category",
      datasets: [
        {
          label: baselineSnapshot ? "Baseline" : "Plan",
          data: categoryRows.map((row) => Number((baselineCategoryMap.get(row.key) ?? row.budget) || 0)),
          backgroundColor: "rgba(59, 130, 246, 0.28)",
          borderColor: "rgba(37, 99, 235, 0.9)",
          borderWidth: 1.5,
          borderRadius: 6
        },
        {
          label: "EAC",
          data: categoryRows.map((row) => Number(row.eac || 0)),
          backgroundColor: "rgba(16, 185, 129, 0.24)",
          borderColor: "rgba(5, 150, 105, 0.92)",
          borderWidth: 1.5,
          borderRadius: 6
        }
      ]
    });
  }

  if (budgetPnLCanvas) {
    const budgetingContext = buildBudgetingContext();
    const chartScale = budgetChartScaleSettings();
    const suggestedChartScale = budgetChartSuggestedScale(budgetingContext);
    const effectiveChartScale = {
      revenueMin: chartScale.revenueMin ?? suggestedChartScale.revenueMin,
      revenueMax: chartScale.revenueMax ?? suggestedChartScale.revenueMax,
      incomeMin: chartScale.incomeMin ?? suggestedChartScale.incomeMin,
      incomeMax: chartScale.incomeMax ?? suggestedChartScale.incomeMax
    };

    budgetPnLChart?.destroy();
    budgetPnLChart = buildTrendChart(budgetPnLCanvas, {
      labels: state.meta.months,
      actualsThroughIndex: budgetingContext.closedThroughIndex,
      xAxisTitle: "Month",
      yAxisTitle: "Revenue ($)",
      secondaryYAxisTitle: "Operating Income ($)",
      yMin: effectiveChartScale.revenueMin,
      yMax: effectiveChartScale.revenueMax,
      secondaryYMin: effectiveChartScale.incomeMin,
      secondaryYMax: effectiveChartScale.incomeMax,
      datasets: [
        {
          label: "Revenue",
          data: budgetingContext.monthlyDrivers.totalRevenue.map((value) => Number(value || 0)),
          borderColor: "rgba(29, 78, 216, 0.95)",
          backgroundColor: "rgba(59, 130, 246, 0.08)",
          borderWidth: 3,
          tension: 0.28,
          fill: false,
          pointRadius: 0
        },
        {
          type: "bar",
          label: "Operating Income",
          yAxisID: "ySecondary",
          data: budgetingContext.monthlyDrivers.operatingIncome.map((value) => Number(value || 0)),
          backgroundColor: "rgba(15, 118, 110, 0.28)",
          borderColor: "rgba(13, 148, 136, 0.95)",
          borderWidth: 1.2,
          barPercentage: 0.72,
          categoryPercentage: 0.72
        }
      ]
    });
  } else {
    budgetPnLChart?.destroy();
    budgetPnLChart = null;
  }

  if (budgetRevenueCompositionCanvas) {
    const budgetingContext = buildBudgetingContext();
    budgetRevenueCompositionChart?.destroy();
    budgetRevenueCompositionChart = buildTrendChart(budgetRevenueCompositionCanvas, {
      labels: state.meta.months,
      actualsThroughIndex: budgetingContext.closedThroughIndex,
      stacked: true,
      xAxisTitle: "Month",
      yAxisTitle: "Revenue Composition ($)",
      datasets: [
        {
          type: "bar",
          label: "Secured Backlog",
          data: budgetingContext.monthlyDrivers.projectRevenue.map((value) => Number(value || 0)),
          backgroundColor: "rgba(37, 99, 235, 0.72)",
          borderColor: "rgba(29, 78, 216, 0.96)",
          borderWidth: 1.1,
          barPercentage: 0.78,
          categoryPercentage: 0.74
        },
        {
          type: "bar",
          label: "Pipeline",
          data: budgetingContext.monthlyDrivers.pipelineRevenueWeighted.map((value) => Number(value || 0)),
          backgroundColor: "rgba(14, 165, 233, 0.72)",
          borderColor: "rgba(2, 132, 199, 0.96)",
          borderWidth: 1.1,
          barPercentage: 0.78,
          categoryPercentage: 0.74
        },
        {
          type: "bar",
          label: "White Space",
          data: budgetingContext.monthlyDrivers.whiteSpaceRevenueWeighted.map((value) => Number(value || 0)),
          backgroundColor: "rgba(16, 185, 129, 0.72)",
          borderColor: "rgba(5, 150, 105, 0.96)",
          borderWidth: 1.1,
          barPercentage: 0.78,
          categoryPercentage: 0.74
        }
      ]
    });
  } else {
    budgetRevenueCompositionChart?.destroy();
    budgetRevenueCompositionChart = null;
  }

  if (budgetSalesTrendCanvas) {
    const budgetingContext = buildBudgetingContext();
    budgetSalesTrendChart?.destroy();
    budgetSalesTrendChart = buildTrendChart(budgetSalesTrendCanvas, {
      labels: state.meta.months,
      actualsThroughIndex: budgetingContext.closedThroughIndex,
      xAxisTitle: "Month",
      yAxisTitle: "Sales ($)",
      datasets: [
        {
          label: "Pipeline Sales",
          data: budgetingContext.pipeline.summary.unweightedRevenue.map((value) => Number(value || 0)),
          borderColor: "rgba(2, 132, 199, 0.96)",
          backgroundColor: "rgba(14, 165, 233, 0.08)",
          borderWidth: 3,
          tension: 0.28,
          fill: false,
          pointRadius: 0
        },
        {
          label: "White Space Sales",
          data: budgetingContext.whiteSpace.summary.unweightedRevenue.map((value) => Number(value || 0)),
          borderColor: "rgba(5, 150, 105, 0.96)",
          backgroundColor: "rgba(16, 185, 129, 0.08)",
          borderWidth: 3,
          tension: 0.28,
          fill: false,
          pointRadius: 0
        }
      ]
    });
  } else {
    budgetSalesTrendChart?.destroy();
    budgetSalesTrendChart = null;
  }
}

async function loadQboData(force = false) {
  const { startDate, endDate } = selectedDateRange(state.selectedYear);
  if (!force && (qboState.status === "loading" || (qboState.status === "ready" && qboState.year === state.selectedYear))) {
    return;
  }

  qboState = {
    ...qboState,
    status: "loading",
    error: null,
    year: state.selectedYear,
    companyPeriodLabel: `${startDate} to ${endDate}`
  };
  renderApp();

  try {
    const actualsPath = force
      ? `/actuals/import-monthly?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      : `/actuals/imported-monthly?year=${encodeURIComponent(state.selectedYear)}`;
    const projectActualsPath = force
      ? `/actuals/import-project-monthly?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      : `/actuals/imported-project-monthly?year=${encodeURIComponent(state.selectedYear)}`;

    const [companyResult, profitLossResult, monthlyActualsResult, projectMonthlyActualsResult, cashFlowResult] = await Promise.allSettled([
      fetchJson("/company-info", {}, QBO_API_BASES),
      fetchJson(`/profit-loss?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, {}, QBO_API_BASES),
      fetchJson(actualsPath, { method: force ? "POST" : "GET" }, QBO_API_BASES),
      fetchJson(projectActualsPath, { method: force ? "POST" : "GET" }, QBO_API_BASES),
      fetchJson(`/cash-flow?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, {}, QBO_API_BASES)
    ]);

    const company = companyResult.status === "fulfilled" ? companyResult.value : null;
    const profitLoss = profitLossResult.status === "fulfilled" ? profitLossResult.value : null;
    let monthlyActualsPayload = monthlyActualsResult.status === "fulfilled" ? monthlyActualsResult.value : null;
    const projectMonthlyActualsPayload = projectMonthlyActualsResult.status === "fulfilled" ? projectMonthlyActualsResult.value : null;
    const cashFlow = cashFlowResult.status === "fulfilled" ? cashFlowResult.value : null;

    if (!monthlyActualsPayload && !force) {
      try {
        monthlyActualsPayload = await fetchJson(`/actuals/monthly-summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, {}, QBO_API_BASES);
      } catch {
        monthlyActualsPayload = null;
      }
    }

    if (!company || !profitLoss || !monthlyActualsPayload) {
      throw new Error(
        companyResult.status === "rejected"
          ? companyResult.reason?.message || "Company info failed."
          : profitLossResult.status === "rejected"
            ? profitLossResult.reason?.message || "Profit and loss failed."
            : monthlyActualsResult.reason?.message || "Monthly actuals failed."
      );
    }

    const monthlyActuals = normalizeImportedMonthlyActuals(monthlyActualsPayload?.data?.months || [], state.meta.months);
    const importBatches = monthlyActualsPayload?.data?.batches || (monthlyActualsPayload?.data?.batch ? [monthlyActualsPayload.data.batch] : []);
    const projectMonthlyActuals = force
      ? (projectMonthlyActualsPayload?.data || []).flatMap((item) => (item.months || []).map((row) => ({
        project_id: item.projectId,
        actual_period: `${row.period}-01`,
        revenue_actual: row.revenue,
        cost_actual: row.cost
      })))
      : (projectMonthlyActualsPayload?.data?.months || []);
    applyImportedProjectActuals(projectMonthlyActuals);
    syncAllProjectsFinancials(state);
    const importedProjectIds = [...new Set((projectMonthlyActuals || []).map((item) => item.project_id).filter(Boolean))];
    if (importedProjectIds.length) {
      await refreshAuthoritativeProjectFinances(importedProjectIds);
    } else if (force && state.selectedProjectId) {
      await refreshAuthoritativeProjectFinance(state.selectedProjectId);
    }
    saveState(state);
    const reconciliation = buildReconciliationRows(state.projects, monthlyActuals, state.selectedYear);
    const summary = extractProfitLossSummary(profitLoss);

    qboState = {
      status: "ready",
      company,
      profitLoss,
      monthlyActuals,
      importBatches,
      cashFlow,
      reconciliation,
      error: null,
      year: state.selectedYear,
      companyPeriodLabel: `${startDate} to ${endDate}`,
      summaries: {
        ...extractCompanySummary(company),
        ...summary,
        ...(cashFlow ? extractCashFlowSummary(cashFlow) : {
          operatingCashFlow: 0,
          investingCashFlow: 0,
          financingCashFlow: 0,
          endingCash: 0
        })
      }
    };
  } catch (error) {
    qboState = {
      ...qboState,
      status: "error",
      error: error.message || "QuickBooks connection failed.",
      company: null,
      profitLoss: null,
      monthlyActuals: null,
      importBatches: [],
      cashFlow: null,
      summaries: null,
      reconciliation: null,
      year: state.selectedYear
    };
  }

  renderApp();
}

async function loadSetupData(force = false) {
  if (!force && (setupState.status === "loading" || setupState.status === "ready")) {
    return;
  }

  setupState = {
    ...setupState,
    status: "loading",
    error: null
  };
  renderApp();

  try {
    const [projectsResult, revenueMethodsResult, customersResult, employeesResult, profilesResult, vendorsResult, itemsResult, equipmentResult, odcResult] = await Promise.allSettled([
      fetchJson("/setup/projects"),
      fetchJson("/setup/revenue-methods"),
      fetchJson("/setup/bootstrap/customers"),
      fetchJson("/setup/bootstrap/employees"),
      fetchJson("/setup/employee-profiles"),
      fetchJson("/setup/bootstrap/vendors"),
      fetchJson("/setup/bootstrap/items"),
      fetchJson("/setup/catalogs/equipment"),
      fetchJson("/setup/catalogs/odc")
    ]);

    const projects = projectsResult.status === "fulfilled" ? (projectsResult.value?.data || []) : [];
    const revenueMethods = revenueMethodsResult.status === "fulfilled" ? (revenueMethodsResult.value?.data || []) : [];
    const bootstrapCustomers = customersResult.status === "fulfilled" ? (customersResult.value?.data || []) : [];
    const bootstrapEmployees = employeesResult.status === "fulfilled" ? (employeesResult.value?.data || []) : [];
    const employeeProfiles = profilesResult.status === "fulfilled" ? (profilesResult.value?.data || []) : [];
    const bootstrapVendors = vendorsResult.status === "fulfilled" ? (vendorsResult.value?.data || []) : [];
    const bootstrapItems = itemsResult.status === "fulfilled" ? (itemsResult.value?.data || []) : [];
    const equipmentCatalog = equipmentResult.status === "fulfilled" ? (equipmentResult.value?.data || []) : [];
    const odcCatalog = odcResult.status === "fulfilled" ? (odcResult.value?.data || []) : [];
    const selectedProjectId = setupState.selectedProjectId || projects[0]?.id || null;

    let bundle = null;
    if (selectedProjectId) {
      try {
        const bundleResult = await fetchJson(`/setup/projects/${encodeURIComponent(selectedProjectId)}`);
        bundle = bundleResult?.data || null;
      } catch (error) {
        bundle = null;
      }
    }

    if (projects.length) {
      const existingById = new Map((state.projects || []).map((item) => [item.id, item]));
      state.projects = projects.map((item) =>
        mapGovconProjectToAppProject(
          item,
          existingById.get(item.id),
          item.id === selectedProjectId ? bundle : null
        )
      );
      ensureSeededResourceModel(state);
      ensureBudgetingState(state);
      ensureSeededPlanningLines();
      ensureSeededActualsThroughMarch();
      state.selectedProjectId = selectedProjectId || state.projects[0]?.id || state.selectedProjectId;
      const availableVersions = getForecastVersions(state.selectedProjectId);
      const selectedVersionStillExists = availableVersions.some((item) => item.id === state.selectedForecastVersionId);
      state.selectedForecastVersionId = availableVersions.length
        ? (selectedVersionStillExists ? state.selectedForecastVersionId : availableVersions[0]?.id || null)
        : null;
      syncAllProjectsFinancials(state);
      saveState(state);
    }

    setupState = {
      status: "ready",
      error: null,
      projects,
      selectedProjectId,
      bundle,
      revenueMethods,
      bootstrapCustomers,
      bootstrapEmployees,
      bootstrapVendors,
      bootstrapItems,
      employeeProfiles,
      equipmentCatalog,
      odcCatalog
    };

    if (state.selectedProjectId) {
      await loadProjectFinanceData(state.selectedProjectId, force);
    }
  } catch (error) {
    setupState = {
      ...setupState,
      status: "error",
      error: error.message || "Project setup data could not be loaded."
    };
  }

  renderApp();
}

async function saveCommercialValuesFromForm(form) {
  const projectId = form?.projectId?.value || setupState.selectedProjectId;
  if (!projectId) return;

  const payload = {
    contractValue: Number(form.contractValue?.value || 0),
    fundedValue: Number(form.fundedValue?.value || 0),
    modificationValue: Number(form.modificationValue?.value || 0)
  };

  try {
    setupState = {
      ...setupState,
      status: "loading",
      error: null
    };
    renderApp();

    const result = await fetchJson(`/setup/projects/${encodeURIComponent(projectId)}/commercial`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const bundle = result?.data || null;
    setupState = {
      ...setupState,
      status: "ready",
      error: null,
      selectedProjectId: projectId,
      bundle
    };

    const projectIndex = (state.projects || []).findIndex((item) => item.id === projectId);
    if (projectIndex >= 0 && bundle?.project) {
      state.projects[projectIndex] = mapGovconProjectToAppProject(
        bundle.project,
        state.projects[projectIndex],
        bundle
      );
      syncAllProjectsFinancials(state);
      saveState(state);
    }

    await loadProjectFinanceData(projectId, true);

    renderApp();
  } catch (error) {
    setupState = {
      ...setupState,
      status: "error",
      error: error.message || "Commercial values could not be saved."
    };
    renderApp();
  }
}

function syncLaborLineMasterData(line) {
  const employee = employeeById(line.employeeId);
  if (employee) {
    line.organizationId = employee.organizationId;
    line.departmentId = employee.departmentId;
    if (!line.rate || line.rate === 0) line.rate = employee.rate;
    if (!line.laborCategoryId) line.laborCategoryId = employee.laborCategoryId;
  }
}

function addPlanningLine(category) {
  if (category === "labor") {
    updateState((draft) => {
      draft.ui.resourceEditor = {
        kind: "hire",
        mode: "create",
        entityId: null,
        source: "plan-labor",
        targetProjectId: draft.selectedProjectId
      };
    });
    return;
  }

  updateState((draft) => {
    const project = draft.projects.find((item) => item.id === draft.selectedProjectId);
    const nextId = `${category}-${Date.now()}`;
    const base = {
      id: nextId,
      monthly: Array(12).fill(0),
      yearly: {
        [draft.selectedYear]: Array(12).fill(0),
        [draft.selectedYear + 1]: Array(12).fill(0)
      }
    };

    if (category === "subcontractors") {
      const vendor = vendorOptions()[0];
      project.planning[category].push({ ...base, vendor: vendor?.displayName || "New Vendor", item: "New Line Item" });
    } else if (category === "equipment" || category === "materials") {
      if (category === "equipment") {
        const equipment = equipmentOptions()[0];
        project.planning[category].push({
          ...base,
          item: equipment?.equipment_name || "New Line Item",
          unit: equipment?.default_unit || "ea",
          rate: Number(equipment?.default_rate || 0)
        });
      } else {
        const material = materialOptions()[0];
        project.planning[category].push({
          ...base,
          item: material?.name || "New Line Item",
          unit: "ea",
          rate: Number(material?.unitPrice || 0)
        });
      }
    } else {
      const odc = odcOptions()[0];
      project.planning[category].push({ ...base, item: odc?.odc_name || "New ODC Item" });
    }
  });
}

function ensureSeededActualsThroughMarch() {
  (state.projects || []).forEach((project) => {
    project.actuals = project.actuals || {
      labor: Array(12).fill(0),
      subcontractors: Array(12).fill(0),
      equipment: Array(12).fill(0),
      materials: Array(12).fill(0),
      odc: Array(12).fill(0),
      totalCost: Array(12).fill(0),
      revenue: Array(12).fill(0)
    };

    ["labor", "subcontractors", "equipment", "materials", "odc", "totalCost", "revenue"].forEach((key) => {
      if (!Array.isArray(project.actuals[key]) || project.actuals[key].length !== 12) {
        project.actuals[key] = Array(12).fill(0);
      }
    });

    const hasActuals = ["labor", "subcontractors", "equipment", "materials", "odc", "totalCost"]
      .some((key) => project.actuals[key].some((value) => Number(value || 0) > 0));
    if (hasActuals) return;

    const categoryFactors = {
      labor: 0.985,
      subcontractors: 0.99,
      equipment: 1.01,
      materials: 0.995,
      odc: 1.02
    };

    [0, 1, 2].forEach((monthIndex) => {
      ["labor", "subcontractors", "equipment", "materials", "odc"].forEach((category) => {
        const monthlyPlan = getPlanMonthlyTotals(project, category, state.selectedYear);
        project.actuals[category][monthIndex] = Math.round(
          Number(monthlyPlan[monthIndex] || 0) * categoryFactors[category]
        );
      });

      project.actuals.totalCost[monthIndex] =
        Number(project.actuals.labor[monthIndex] || 0) +
        Number(project.actuals.subcontractors[monthIndex] || 0) +
        Number(project.actuals.equipment[monthIndex] || 0) +
        Number(project.actuals.materials[monthIndex] || 0) +
        Number(project.actuals.odc[monthIndex] || 0);
    });

    let normalized = syncProjectFinancials(project, state.selectedYear);
    project.forecastByCategory = normalized.forecastByCategory;
    project.projectMonthly = normalized.projectMonthly;
    project.snapshots = normalized.snapshots;
    project.funding = normalized.funding;

    [0, 1, 2].forEach((monthIndex) => {
      project.actuals.revenue[monthIndex] = Math.round(
        normalized.projectMonthly[monthIndex]?.currentPeriodCatchUpRevenue
        || normalized.projectMonthly[monthIndex]?.currentPeriodRevenue
        || 0
      );
    });

    normalized = syncProjectFinancials(project, state.selectedYear);
    project.forecastByCategory = normalized.forecastByCategory;
    project.projectMonthly = normalized.projectMonthly;
    project.snapshots = normalized.snapshots;
    project.funding = normalized.funding;
  });
}

function closeResourceEditor() {
  updateState((draft) => {
    draft.ui.resourceEditor = {
      kind: null,
      mode: "create",
      entityId: null
    };
  });
}

function saveAssignmentFromForm(form) {
  const data = new FormData(form);
  const employeeId = String(data.get("employeeId") || "");
  const projectId = String(data.get("projectId") || "");
  const laborCategoryId = String(data.get("laborCategoryId") || "");
  const weeklyHours = Number(data.get("weeklyHours") || 0);
  const startDate = String(data.get("startDate") || `${state.selectedYear}-01-01`);
  const endDate = String(data.get("endDate") || `${state.selectedYear}-12-31`);
  const rate = Number(data.get("rate") || 0);
  const entityId = String(data.get("entityId") || "");

  updateState((draft) => {
    const employee = (draft.masterData.employees || []).find((item) => item.id === employeeId) || {};
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const start = {
      year: Number.isFinite(startDateObj.getTime()) ? startDateObj.getFullYear() : draft.selectedYear,
      month: Number.isFinite(startDateObj.getTime()) ? startDateObj.getMonth() + 1 : 1
    };
    const end = {
      year: Number.isFinite(endDateObj.getTime()) ? endDateObj.getFullYear() : draft.selectedYear,
      month: Number.isFinite(endDateObj.getTime()) ? endDateObj.getMonth() + 1 : 12
    };
    const monthlyHours = Math.round(weeklyHours * 4.33);
    const monthly = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const inCurrentYear = start.year <= draft.selectedYear && end.year >= draft.selectedYear;
      if (!inCurrentYear) return 0;
      const afterStart = start.year < draft.selectedYear || month >= start.month;
      const beforeEnd = end.year > draft.selectedYear || month <= end.month;
      return afterStart && beforeEnd ? monthlyHours : 0;
    });
    const nextLine = {
      id: entityId || `assign-${Date.now()}`,
      employeeId,
      laborCategoryId,
      organizationId: employee.organizationId || "",
      departmentId: employee.departmentId || "",
      rate,
      weeklyHours,
      startDate,
      endDate,
      startPeriod: formatPeriodValue(start.year, start.month),
      endPeriod: formatPeriodValue(end.year, end.month),
      monthly
    };

    draft.projects.forEach((project) => {
      project.planning.labor = (project.planning.labor || []).filter((line) => line.id !== entityId);
    });

    const targetProject = draft.projects.find((project) => project.id === projectId);
    if (targetProject) {
      targetProject.planning.labor = targetProject.planning.labor || [];
      targetProject.planning.labor.push(nextLine);
    }

    draft.ui.resourceEditor = {
      kind: null,
      mode: "create",
      entityId: null
    };
  });
}

function saveHireFromForm(form) {
  const data = new FormData(form);
  const entityId = String(data.get("entityId") || "");
  const existingHire = (state.resourceManagement?.plannedHires || []).find((item) => item.id === entityId) || null;
  const editor = getResourceEditor();
  const startDate = String(data.get("startDate") || `${state.selectedYear}-01-01`);
  const targetProjectId = String(data.get("targetProjectId") || "") || null;
  const monthlyCost = Number(data.get("monthlyCost") || 0);
  const defaultMonthlyHours = 160;
  const derivedRate = monthlyCost > 0 ? Math.round((monthlyCost / defaultMonthlyHours) * 100) / 100 : 0;
  const plannedEmployeeId = existingHire?.generatedEmployeeId || `planned-employee-${Date.now()}`;
  const plannedLineId = existingHire?.generatedPlanningLineId || `planned-labor-${Date.now()}`;
  const nextHire = {
    id: entityId || `hire-${Date.now()}`,
    name: String(data.get("name") || ""),
    laborCategoryId: String(data.get("laborCategoryId") || ""),
    targetProjectId,
    startDate,
    monthlyCost,
    status: String(data.get("status") || "Planned"),
    generatedEmployeeId: plannedEmployeeId,
    generatedPlanningLineId: plannedLineId
  };

  updateState((draft) => {
    draft.resourceManagement.plannedHires = (draft.resourceManagement.plannedHires || []).filter((item) => item.id !== entityId);
    draft.resourceManagement.plannedHires.push(nextHire);

    draft.masterData.employees = draft.masterData.employees || [];
    draft.masterData.employees = draft.masterData.employees.filter((item) => item.id !== plannedEmployeeId);
    draft.masterData.employees.push({
      id: plannedEmployeeId,
      name: nextHire.name || "Planned Hire",
      organizationId: "",
      departmentId: "",
      laborCategoryId: nextHire.laborCategoryId,
      rate: derivedRate,
      plannedHire: true,
      targetProjectId: nextHire.targetProjectId
    });

    draft.projects.forEach((project) => {
      project.planning.labor = (project.planning?.labor || []).filter((line) => line.id !== plannedLineId);
    });

    if (nextHire.targetProjectId) {
      const targetProject = draft.projects.find((project) => project.id === nextHire.targetProjectId);
      if (targetProject) {
        const currentYearMonthly = buildOpenEndedMonthlyPlan(nextHire.startDate, draft.selectedYear, defaultMonthlyHours);
        const nextYearMonthly = buildOpenEndedMonthlyPlan(nextHire.startDate, draft.selectedYear + 1, defaultMonthlyHours);
        targetProject.planning.labor = targetProject.planning.labor || [];
        targetProject.planning.labor.push({
          id: plannedLineId,
          employeeId: plannedEmployeeId,
          laborCategoryId: nextHire.laborCategoryId,
          organizationId: "",
          departmentId: "",
          rate: derivedRate,
          monthly: currentYearMonthly,
          yearly: {
            [draft.selectedYear]: currentYearMonthly,
            [draft.selectedYear + 1]: nextYearMonthly
          },
          startDate: nextHire.startDate,
          startPeriod: formatPeriodValue(
            new Date(nextHire.startDate).getFullYear() || draft.selectedYear,
            (new Date(nextHire.startDate).getMonth() + 1) || 1
          ),
          plannedHireId: nextHire.id
        });
      }
    }

    draft.ui.resourceEditor = {
      kind: null,
      mode: "create",
      entityId: null
    };
  });
}

function saveAttritionFromForm(form) {
  const data = new FormData(form);
  const entityId = String(data.get("entityId") || "");
  const endDate = String(data.get("endDate") || `${state.selectedYear}-01-31`);
  const parsedDate = new Date(endDate);
  const nextExit = {
    id: entityId || `exit-${Date.now()}`,
    employeeId: String(data.get("employeeId") || ""),
    month: Number.isFinite(parsedDate.getTime()) ? parsedDate.getMonth() + 1 : 1,
    period: Number.isFinite(parsedDate.getTime()) ? formatPeriodValue(parsedDate.getFullYear(), parsedDate.getMonth() + 1) : formatPeriodValue(state.selectedYear, 1),
    endDate,
    type: String(data.get("type") || "Attrition"),
    backfill: String(data.get("backfill")) === "true",
    status: String(data.get("status") || "Forecast")
  };

  updateState((draft) => {
    draft.resourceManagement.plannedExits = (draft.resourceManagement.plannedExits || []).filter((item) => item.id !== entityId);
    draft.resourceManagement.plannedExits.push(nextExit);
    draft.ui.resourceEditor = {
      kind: null,
      mode: "create",
      entityId: null
    };
  });
}

function saveBudgetAdjustmentFromForm(form) {
  const data = new FormData(form);
  const type = String(data.get("type") || "indirect");
  const nextAdjustment = {
    id: `budget-adjustment-${Date.now()}`,
    type,
    category: String(data.get("category") || (type === "revenue" ? REVENUE_ADJUSTMENT_CATEGORIES[0] : INDIRECT_EXPENSE_CATEGORIES[0])),
    description: String(data.get("description") || "").trim(),
    projectId: String(data.get("projectId") || ""),
    startPeriod: String(data.get("startPeriod") || `${state.selectedYear}-01`),
    endPeriod: String(data.get("endPeriod") || String(data.get("startPeriod") || `${state.selectedYear}-01`)),
    spreadMethod: String(data.get("spreadMethod") || "single"),
    amount: Number(data.get("amount") || 0),
    direction: Number(data.get("direction") || 1)
  };

  if (!nextAdjustment.description || nextAdjustment.amount <= 0) return;

  updateState((draft) => {
    ensureBudgetingState(draft);
    draft.budgeting.adjustments = draft.budgeting.adjustments || [];
    draft.budgeting.adjustments.push(nextAdjustment);
    draft.ui.budgetAdjustmentDraft = {
      type,
      category: type === "revenue" ? REVENUE_ADJUSTMENT_CATEGORIES[0] : INDIRECT_EXPENSE_CATEGORIES[0],
      description: "",
      projectId: "",
      startPeriod: `${draft.selectedYear}-01`,
      endPeriod: `${draft.selectedYear}-12`,
      spreadMethod: "single",
      amount: "",
      direction: "1"
    };
  });
}

function saveBudgetRevenueSourceFromForm(form) {
  const data = new FormData(form);
  const sourceType = String(data.get("sourceType") || "pipeline");
  const id = String(data.get("id") || "");
  const nextSource = {
    id: id || `budget-source-${Date.now()}`,
    sourceType,
    name: String(data.get("name") || "").trim(),
    client: String(data.get("client") || "").trim(),
    projectId: String(data.get("projectId") || ""),
    owner: String(data.get("owner") || "").trim(),
    stage: String(data.get("stage") || PIPELINE_STAGE_OPTIONS[0]),
    probability: Number(data.get("probability") || 0),
    value: Number(data.get("value") || 0),
    startPeriod: String(data.get("startPeriod") || `${state.selectedYear}-07`),
    endPeriod: String(data.get("endPeriod") || String(data.get("startPeriod") || `${state.selectedYear}-07`)),
    marginRate: Number(data.get("marginRate") || 0),
    note: String(data.get("note") || "").trim()
  };

  if (!nextSource.name || nextSource.value <= 0) return;

  updateState((draft) => {
    ensureBudgetingState(draft);
    draft.budgeting.opportunities = (draft.budgeting.opportunities || []).filter((item) => item.id !== nextSource.id);
    draft.budgeting.whitespace = (draft.budgeting.whitespace || []).filter((item) => item.id !== nextSource.id);
    const key = sourceType === "whitespace" ? "whitespace" : "opportunities";
    draft.budgeting[key] = draft.budgeting[key] || [];
    draft.budgeting[key].push(nextSource);
    draft.ui.budgetRevenueSourceDraft = {
      sourceType: "pipeline",
      id: "",
      name: "",
      client: "",
      projectId: "",
      owner: "",
      stage: PIPELINE_STAGE_OPTIONS[0],
      probability: "50",
      value: "",
      startPeriod: `${draft.selectedYear}-07`,
      endPeriod: `${draft.selectedYear}-12`,
      marginRate: "20",
      note: ""
    };
  });
}

function removeBudgetAdjustment(adjustmentId) {
  if (!adjustmentId) return;
  updateState((draft) => {
    ensureBudgetingState(draft);
    draft.budgeting.adjustments = (draft.budgeting.adjustments || []).filter((item) => item.id !== adjustmentId);
  });
}

function removeBudgetRevenueSource(sourceType, sourceId) {
  if (!sourceId) return;
  updateState((draft) => {
    ensureBudgetingState(draft);
    const key = sourceType === "whitespace" ? "whitespace" : "opportunities";
    draft.budgeting[key] = (draft.budgeting[key] || []).filter((item) => item.id !== sourceId);
  });
}

function openBudgetAdjustmentDraft(draftValues = {}) {
  updateState((draft) => {
    draft.ui.activeModule = "budgeting";
    draft.ui.activeTab = "scenarios";
    draft.ui.budgetAdjustmentDraft = {
      ...budgetAdjustmentDraft(),
      ...draftValues
    };
  });
}

function openBudgetRevenueSourceDraft(draftValues = {}) {
  updateState((draft) => {
    draft.ui.activeModule = "budgeting";
    draft.ui.activeTab = "scenarios";
    draft.ui.budgetRevenueSourceDraft = {
      ...budgetRevenueSourceDraft(),
      ...draftValues
    };
  });
}

function runMockSync() {
  updateState((draft) => {
    const project = draft.projects.find((item) => item.id === draft.selectedProjectId);
    const nextIndex = project.actuals.labor.findIndex((value) => Number(value || 0) === 0);
    if (nextIndex === -1) return;

    const plannedLabor = getPlanMonthlyTotals(project, "labor")[nextIndex];
    const plannedSub = getPlanMonthlyTotals(project, "subcontractors")[nextIndex];
    const plannedEquipment = getPlanMonthlyTotals(project, "equipment")[nextIndex];
    const plannedMaterials = getPlanMonthlyTotals(project, "materials")[nextIndex];
    const plannedOdc = getPlanMonthlyTotals(project, "odc")[nextIndex];

    project.actuals.labor[nextIndex] = Math.round(plannedLabor * 0.985);
    project.actuals.subcontractors[nextIndex] = Math.round(plannedSub * 0.99);
    project.actuals.equipment[nextIndex] = Math.round(plannedEquipment * 1.01);
    project.actuals.materials[nextIndex] = Math.round(plannedMaterials * 0.995);
    project.actuals.odc[nextIndex] = Math.round(plannedOdc * 1.02);

    const totalCost =
      project.actuals.labor[nextIndex] +
      project.actuals.subcontractors[nextIndex] +
      project.actuals.equipment[nextIndex] +
      project.actuals.materials[nextIndex] +
      project.actuals.odc[nextIndex];

    const normalized = syncProjectFinancials(project, draft.selectedYear);
    project.forecastByCategory = normalized.forecastByCategory;
    project.projectMonthly = normalized.projectMonthly;
    project.snapshots = normalized.snapshots;
    project.funding = normalized.funding;
    project.actuals.revenue[nextIndex] = Math.round(
      project.projectMonthly[nextIndex]?.currentPeriodCatchUpRevenue
      || project.projectMonthly[nextIndex]?.currentPeriodRevenue
      || 0
    );

    const now = new Date();
    project.lastSyncAt = now.toISOString();
    project.syncStatus = project.quickbooksMappings.some((item) => item.status !== "Mapped") ? "Attention" : "Healthy";

    draft.importBatches.unshift({
      id: `imp-${String(draft.importBatches.length + 1).padStart(3, "0")}`,
      ranAt: now.toLocaleString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }),
      source: "QuickBooks",
      status: "Success",
      rows: 1400 + nextIndex * 12
    });
  });
}

function focusElementAt(elements, index) {
  const target = elements[index];
  if (!target) return;
  target.focus();
  if (typeof target.select === "function" && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
    target.select();
  }
}

function wireSequentialFormNavigation(formSelector) {
  const form = document.querySelector(formSelector);
  if (!form) return;

  const controls = Array.from(
    form.querySelectorAll('input:not([type="hidden"]), select, textarea')
  ).filter((element) => !element.disabled);

  controls.forEach((control, index) => {
    control.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (control.tagName === "TEXTAREA" && !event.shiftKey) return;
      event.preventDefault();
      const nextIndex = Math.min(
        Math.max(index + (event.shiftKey ? -1 : 1), 0),
        controls.length - 1
      );
      focusElementAt(controls, nextIndex);
    });
  });
}

function wirePlanningNavigation() {
  const lineInputs = Array.from(document.querySelectorAll(".line-input"));
  const monthlyInputs = Array.from(document.querySelectorAll(".monthly-input"));

  lineInputs.forEach((input) => {
    input.addEventListener("keydown", (event) => {
      const { category, lineIndex } = input.dataset;
      const rowInputs = lineInputs.filter((element) =>
        element.dataset.category === category && element.dataset.lineIndex === lineIndex
      );
      const allCategoryInputs = lineInputs.filter((element) => element.dataset.category === category);
      const rowWidth = rowInputs.length || 1;
      const rowIndex = rowInputs.indexOf(input);
      const categoryIndex = allCategoryInputs.indexOf(input);

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        focusElementAt(
          allCategoryInputs,
          Math.min(
            Math.max(categoryIndex + (event.shiftKey ? -1 : 1), 0),
            allCategoryInputs.length - 1
          )
        );
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        focusElementAt(
          rowInputs,
          Math.min(
            Math.max(rowIndex + (event.key === "ArrowRight" ? 1 : -1), 0),
            rowInputs.length - 1
          )
        );
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        focusElementAt(
          allCategoryInputs,
          Math.min(
            Math.max(categoryIndex + (event.key === "ArrowDown" ? rowWidth : -rowWidth), 0),
            allCategoryInputs.length - 1
          )
        );
      }
    });
  });

  monthlyInputs.forEach((input) => {
    input.addEventListener("keydown", (event) => {
      const { category, lineIndex } = input.dataset;
      const rowInputs = monthlyInputs.filter((element) =>
        element.dataset.category === category && element.dataset.lineIndex === lineIndex
      );
      const allCategoryInputs = monthlyInputs.filter((element) => element.dataset.category === category);
      const rowWidth = rowInputs.length || 1;
      const rowIndex = rowInputs.indexOf(input);
      const categoryIndex = allCategoryInputs.indexOf(input);

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        focusElementAt(
          allCategoryInputs,
          Math.min(
            Math.max(categoryIndex + (event.shiftKey ? -1 : 1), 0),
            allCategoryInputs.length - 1
          )
        );
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        focusElementAt(
          rowInputs,
          Math.min(
            Math.max(rowIndex + (event.key === "ArrowRight" ? 1 : -1), 0),
            rowInputs.length - 1
          )
        );
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        focusElementAt(
          allCategoryInputs,
          Math.min(
            Math.max(categoryIndex + (event.key === "ArrowDown" ? rowWidth : -rowWidth), 0),
            allCategoryInputs.length - 1
          )
        );
      }
    });
  });
}

function wireEvents() {
  document.getElementById("budgetDisplayScaleSelect")?.addEventListener("change", (event) => {
    updateState((draft) => {
      draft.ui.budgetDisplayScale = event.target.value || "dollars";
    });
  });

  document.getElementById("budgetChartScaleForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const normalize = (value) => {
      const text = String(value || "").trim();
      if (!text) return null;
      const numeric = Number(text);
      return Number.isFinite(numeric) ? numeric : null;
    };
    updateState((draft) => {
      draft.ui.budgetChartScale = {
        revenueMin: normalize(formData.get("revenueMin")),
        revenueMax: normalize(formData.get("revenueMax")),
        incomeMin: normalize(formData.get("incomeMin")),
        incomeMax: normalize(formData.get("incomeMax"))
      };
    });
  });

  document.getElementById("budgetChartScaleResetBtn")?.addEventListener("click", () => {
    updateState((draft) => {
      draft.ui.budgetChartScale = {
        revenueMin: null,
        revenueMax: null,
        incomeMin: null,
        incomeMax: null
      };
    });
  });

  document.getElementById("askAiToggleBtn")?.addEventListener("click", () => {
    updateState((draft) => {
      draft.ui.askAiOpen = true;
    });
  });

  document.getElementById("askAiCloseBtn")?.addEventListener("click", () => {
    updateState((draft) => {
      draft.ui.askAiOpen = false;
    });
  });

  document.getElementById("askAiBackdrop")?.addEventListener("click", () => {
    updateState((draft) => {
      draft.ui.askAiOpen = false;
    });
  });

  document.querySelectorAll("[data-ask-ai-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = button.dataset.askAiSuggestion || "";
      updateState((draft) => {
        draft.ui.askAiOpen = true;
        draft.ui.askAiDraft = question;
        draft.ui.askAiResponse = explainWithAssistant(question);
      });
    });
  });

  document.getElementById("askAiForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("askAiInput");
    const question = String(input?.value || "").trim();
    updateState((draft) => {
      draft.ui.askAiOpen = true;
      draft.ui.askAiDraft = question;
      draft.ui.askAiResponse = explainWithAssistant(question);
    });
  });

  document.getElementById("authOpenBtn")?.addEventListener("click", () => {
    updateState((draft) => {
      draft.ui.authOpen = true;
    });
  });

  document.getElementById("authCloseBtn")?.addEventListener("click", () => {
    updateState((draft) => {
      draft.ui.authOpen = false;
    });
  });

  document.getElementById("authBackdrop")?.addEventListener("click", () => {
    updateState((draft) => {
      draft.ui.authOpen = false;
    });
  });

  document.getElementById("authGoogleBtn")?.addEventListener("click", async () => {
    authState = {
      ...authState,
      error: null,
      info: ""
    };
    renderApp();
    try {
      await signInWithGoogle();
    } catch (error) {
      authState = {
        ...authState,
        error: error.message || "Google sign-in could not be started."
      };
      renderApp();
    }
  });

  document.getElementById("authEmailForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") || document.getElementById("authEmailInput")?.value || "").trim();
    if (!email) {
      authState = {
        ...authState,
        error: "Enter an email address first."
      };
      renderApp();
      return;
    }
    authState = {
      ...authState,
      error: null,
      info: ""
    };
    renderApp();
    try {
      await signInWithEmail(email);
      authState = {
        ...authState,
        info: `Magic link sent to ${email}. Open the email and come back to this same app.`
      };
      renderApp();
    } catch (error) {
      authState = {
        ...authState,
        error: error.message || "Magic link could not be sent."
      };
      renderApp();
    }
  });

  document.getElementById("authSignOutBtn")?.addEventListener("click", async () => {
    try {
      await signOutAuth();
      authState = {
        ...authState,
        info: "Signed out successfully.",
        error: null,
        signInEvents: []
      };
      renderApp();
    } catch (error) {
      authState = {
        ...authState,
        error: error.message || "Sign-out failed."
      };
      renderApp();
    }
  });

  document.getElementById("refreshSignInEventsBtn")?.addEventListener("click", () => {
    void fetchSignInEvents();
  });

  document.getElementById("landingGoogleBtn")?.addEventListener("click", async () => {
    authState = {
      ...authState,
      error: null,
      info: ""
    };
    renderApp();
    try {
      await signInWithGoogle();
    } catch (error) {
      authState = {
        ...authState,
        error: error.message || "Google sign-in could not be started."
      };
      renderApp();
    }
  });

  document.getElementById("landingEmailForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    if (!email) {
      authState = {
        ...authState,
        error: "Enter an email address first."
      };
      renderApp();
      return;
    }
    authState = {
      ...authState,
      error: null,
      info: ""
    };
    renderApp();
    try {
      await signInWithEmail(email);
      authState = {
        ...authState,
        info: `Magic link sent to ${email}. Open the email and return to this page.`
      };
      renderApp();
    } catch (error) {
      authState = {
        ...authState,
        error: error.message || "Magic link could not be sent."
      };
      renderApp();
    }
  });

  document.getElementById("landingPrimaryCta")?.addEventListener("click", () => {
    document.getElementById("landing-get-started")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("landingHeaderSignInBtn")?.addEventListener("click", () => {
    document.getElementById("landing-get-started")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("landingHeaderSignUpBtn")?.addEventListener("click", () => {
    document.getElementById("landing-get-started")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelectorAll("[data-admin-step]").forEach((button) => {
    button.addEventListener("click", () => {
      updateState((draft) => {
        draft.ui.adminSetupStep = button.dataset.adminStep || "project";
      });
    });
  });

  document.querySelectorAll("[data-admin-step-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const steps = adminGuideSteps().map(([key]) => key);
      const currentIndex = Math.max(steps.indexOf(state.ui.adminSetupStep || "project"), 0);
      const nextIndex = button.dataset.adminStepNav === "next"
        ? Math.min(currentIndex + 1, steps.length - 1)
        : Math.max(currentIndex - 1, 0);
      updateState((draft) => {
        draft.ui.adminSetupStep = steps[nextIndex];
      });
    });
  });

  document.querySelectorAll("[data-card-mode-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.cardModeKey;
      const mode = button.dataset.cardMode;
      if (!key || !mode) return;
      updateState((draft) => {
        draft.ui.cardModes = draft.ui.cardModes || {};
        draft.ui.cardModes[key] = mode;
      });
    });
  });

  document.querySelectorAll(".module-trigger").forEach((button) => {
    button.addEventListener("click", () => {
      updateState((draft) => {
        draft.ui.activeModule = button.dataset.module;
        draft.ui.activeTab = "overview";
        if (draft.ui.activeModule === "eac") {
          draft.ui.planSubtab = draft.ui.planSubtab || "summary";
        }
      });
    });
  });

  document.querySelectorAll(".nav-trigger").forEach((button) => {
    button.addEventListener("click", () => {
      updateState((draft) => {
        draft.ui.activeTab = button.dataset.tab;
      });
    });
  });

  document.querySelectorAll(".plan-subtab").forEach((button) => {
    button.addEventListener("click", () => {
      updateState((draft) => {
        draft.ui.planSubtab = button.dataset.planSubtab;
      });
    });
  });

  document.querySelectorAll(".plan-driver-link").forEach((button) => {
    button.addEventListener("click", () => {
      updateState((draft) => {
        draft.ui.activeTab = "plan";
        draft.ui.planSubtab = button.dataset.planTab;
      });
    });
  });

  document.querySelectorAll(".resource-editor-trigger").forEach((button) => {
    button.addEventListener("click", () => {
      updateState((draft) => {
        draft.ui.resourceEditor = {
          kind: button.dataset.editorKind,
          mode: button.dataset.editorMode || "create",
          entityId: button.dataset.entityId || null,
          source: button.dataset.editorSource || null,
          targetProjectId: button.dataset.targetProjectId || null
        };
      });
    });
  });

  document.querySelectorAll(".resource-editor-cancel").forEach((button) => {
    button.addEventListener("click", () => {
      closeResourceEditor();
    });
  });

  document.getElementById("budgetAdjustmentForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveBudgetAdjustmentFromForm(event.currentTarget);
  });

  document.getElementById("budgetAdjustmentForm")?.querySelector('select[name="type"]')?.addEventListener("change", (event) => {
    const form = event.currentTarget.form;
    const categorySelect = form?.querySelector('select[name="category"]');
    const directionSelect = form?.querySelector('select[name="direction"]');
    if (!categorySelect || !directionSelect) return;
    const nextType = event.currentTarget.value === "revenue" ? "revenue" : "indirect";
    categorySelect.innerHTML = budgetAdjustmentCategoryOptions(nextType);
    directionSelect.innerHTML = nextType === "revenue"
      ? '<option value="1">Add / Increase</option><option value="-1">Subtract / Reduce</option>'
      : '<option value="1">Add Expense</option>';
  });

  document.querySelectorAll(".budget-adjustment-delete").forEach((button) => {
    button.addEventListener("click", () => {
      removeBudgetAdjustment(button.dataset.adjustmentId);
    });
  });

  document.getElementById("budgetRevenueSourceForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveBudgetRevenueSourceFromForm(event.currentTarget);
  });

  document.getElementById("budgetRevenueSourceCancelBtn")?.addEventListener("click", () => {
    updateState((draft) => {
      draft.ui.budgetRevenueSourceDraft = {
        sourceType: "pipeline",
        id: "",
        name: "",
        client: "",
        projectId: "",
        owner: "",
        stage: PIPELINE_STAGE_OPTIONS[0],
        probability: "50",
        value: "",
        startPeriod: `${draft.selectedYear}-07`,
        endPeriod: `${draft.selectedYear}-12`,
        marginRate: "20",
        note: ""
      };
    });
  });

  document.querySelectorAll(".budget-revenue-source-edit").forEach((button) => {
    button.addEventListener("click", () => {
      ensureBudgetingState(state);
      const sourceType = button.dataset.sourceType === "whitespace" ? "whitespace" : "pipeline";
      const sourceId = String(button.dataset.sourceId || "");
      const collection = sourceType === "whitespace"
        ? (state.budgeting?.whitespace || [])
        : (state.budgeting?.opportunities || []);
      const entry = collection.find((item) => item.id === sourceId);
      if (!entry) return;
      openBudgetRevenueSourceDraft(entry);
    });
  });

  document.querySelectorAll(".budget-revenue-source-delete").forEach((button) => {
    button.addEventListener("click", () => {
      removeBudgetRevenueSource(button.dataset.sourceType, button.dataset.sourceId);
    });
  });

  document.querySelectorAll(".budget-edit-cell").forEach((button) => {
    button.addEventListener("click", () => {
      const monthIndex = Number(button.dataset.budgetMonthIndex || 0);
      const rowKey = String(button.dataset.budgetRow || "");
      const context = buildBudgetingContext();
      const row = context.pAndLRows.find((item) => item.key === rowKey);
      if (!row) return;
      const draftValues = budgetEditDraftForCell(row, monthIndex);
      if (!draftValues) return;
      openBudgetAdjustmentDraft(draftValues);
    });
  });

  document.getElementById("projectSelect")?.addEventListener("change", (event) => {
    const nextProjectId = event.target.value;
    updateState((draft) => {
      draft.selectedProjectId = nextProjectId;
      draft.selectedForecastVersionId = getForecastVersions(nextProjectId)[0]?.id || draft.selectedForecastVersionId;
    });
    if (setupState.projects.length) {
      setupState = {
        ...setupState,
        selectedProjectId: nextProjectId || null,
        bundle: null
      };
      if (setupState.selectedProjectId) {
        void (async () => {
          try {
            const bundleResult = await fetchJson(`/setup/projects/${encodeURIComponent(setupState.selectedProjectId)}`);
            setupState = {
              ...setupState,
              bundle: bundleResult?.data || null
            };
            const projectIndex = state.projects.findIndex((item) => item.id === setupState.selectedProjectId);
            if (projectIndex >= 0 && setupState.bundle?.project) {
              state.projects[projectIndex] = mapGovconProjectToAppProject(
                setupState.bundle.project,
                state.projects[projectIndex],
                setupState.bundle
              );
              const projectVersions = getForecastVersions(setupState.selectedProjectId);
              if (!projectVersions.some((item) => item.id === state.selectedForecastVersionId)) {
                state.selectedForecastVersionId = projectVersions[0]?.id || null;
              }
              saveState(state);
            }
            renderApp();
          } catch {
            renderApp();
          }
        })();
      }
    }
    void loadProjectFinanceData(nextProjectId, true);
  });

  document.getElementById("forecastVersionSelect")?.addEventListener("change", (event) => {
    const nextVersionId = event.target.value;
    updateState((draft) => {
      draft.selectedForecastVersionId = nextVersionId;
    });
    void loadProjectFinanceData(state.selectedProjectId, true);
  });

  document.getElementById("resetDemoBtn")?.addEventListener("click", () => {
    state = resetState();
    ensureSeededResourceModel(state);
    ensureBudgetingState(state);
    ensureSeededPlanningLines();
    ensureSeededActualsThroughMarch();
    syncAllProjectsFinancials(state);
    saveState(state);
    qboState = {
      ...qboState,
      status: "idle",
      error: null,
      year: null
    };
    financeState = {
      ...financeState,
      status: "idle",
      error: null,
      loadedKey: null,
      savingKey: null
    };
    renderApp();
  });

  document.getElementById("connectQboBtn")?.addEventListener("click", () => {
    openQboConnectWindow(QBO_API_BASES);
  });

  document.getElementById("syncNowBtn")?.addEventListener("click", () => {
    void Promise.all([
      loadQboData(true),
      loadSetupData(true)
    ]);
  });

  document.getElementById("createSnapshotBtn")?.addEventListener("click", () => {
    const projectId = state.selectedProjectId;
    updateState((draft) => {
      const projectIndex = draft.projects.findIndex((item) => item.id === draft.selectedProjectId);
      if (projectIndex < 0) return;
      const project = draft.projects[projectIndex];
      draft.projects[projectIndex] = createProjectSnapshot(project, draft.selectedYear, {
        label: `Baseline ${getCurrentForecastVersion(project.id)?.code || project.version || draft.selectedYear}`,
        createdAt: new Date().toISOString(),
        setAsBaseline: true,
        versionId: null
      });
    });
    flushFinancePersistence(projectId);
  });

  document.getElementById("savePlanBtn")?.addEventListener("click", () => {
    void savePlanFromWorkspace();
  });

  document.getElementById("submitPlanBtn")?.addEventListener("click", () => {
    void submitPlanFromWorkspace();
  });

  document.querySelectorAll(".add-line-btn").forEach((button) => {
    button.addEventListener("click", () => addPlanningLine(button.dataset.category));
  });

  document.querySelectorAll(".line-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const { category, lineIndex, field } = event.target.dataset;
      const value = event.target.type === "number" ? Number(event.target.value || 0) : event.target.value;
      updateState((draft) => {
        const project = draft.projects.find((item) => item.id === draft.selectedProjectId);
        const line = project.planning[category][Number(lineIndex)];
        line[field] = value;
        if (category === "labor") syncLaborLineMasterData(line);
      });
    });
  });

  document.querySelectorAll(".monthly-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const { category, lineIndex, monthIndex, year } = event.target.dataset;
      const value = Number(event.target.value || 0);
      updateState((draft) => {
        const project = draft.projects.find((item) => item.id === draft.selectedProjectId);
        const line = project.planning[category][Number(lineIndex)];
        line.yearly = line.yearly || {};
        if (!Array.isArray(line.yearly[year]) || line.yearly[year].length !== 12) {
          line.yearly[year] = Array(12).fill(0);
        }
        line.yearly[year][Number(monthIndex)] = value;
        if (Number(year) === draft.selectedYear) {
          line.monthly = [...line.yearly[year]];
        }
      });
    });
  });

  wirePlanningNavigation();
  wireSequentialFormNavigation("#projectCommercialForm");
  wireSequentialFormNavigation("#resourceAssignmentForm");
  wireSequentialFormNavigation("#resourceHiringForm");
  wireSequentialFormNavigation("#resourceAttritionForm");

  document.getElementById("planHorizonStartYear")?.addEventListener("change", (event) => {
    updateState((draft) => {
      const nextStart = Number(event.target.value || draft.selectedYear);
      draft.ui.planHorizonStartYear = nextStart;
      draft.ui.planHorizonEndYear = Math.max(nextStart, Number(draft.ui.planHorizonEndYear || nextStart));
    });
  });

  document.getElementById("planHorizonEndYear")?.addEventListener("change", (event) => {
    updateState((draft) => {
      const nextEnd = Number(event.target.value || draft.selectedYear);
      draft.ui.planHorizonEndYear = Math.max(nextEnd, Number(draft.ui.planHorizonStartYear || draft.selectedYear));
    });
  });

  document.getElementById("setupProjectSelect")?.addEventListener("change", async (event) => {
    setupState = {
      ...setupState,
      selectedProjectId: event.target.value || null,
      bundle: null
    };
    renderApp();
    if (setupState.selectedProjectId) {
      try {
        const bundleResult = await fetchJson(`/setup/projects/${encodeURIComponent(setupState.selectedProjectId)}`);
        setupState = {
          ...setupState,
          bundle: bundleResult?.data || null,
          status: "ready",
          error: null
        };
      } catch (error) {
        setupState = {
          ...setupState,
          error: error.message || "Project setup bundle failed to load."
        };
      }
      renderApp();
    }
  });

  document.getElementById("bootstrapProjectsBtn")?.addEventListener("click", async () => {
    setupState = {
      ...setupState,
      status: "loading",
      error: null
    };
    renderApp();

    try {
      await fetchJson("/setup/bootstrap/projects", {
        method: "POST"
      });
      await loadSetupData(true);
    } catch (error) {
      setupState = {
        ...setupState,
        status: "error",
        error: error.message || "Project bootstrap failed."
      };
      renderApp();
    }
  });

  document.getElementById("projectCommercialForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveCommercialValuesFromForm(event.currentTarget);
  });

  document.getElementById("projectWorkflowNotesForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveWorkflowNotesFromForm(event.currentTarget);
  });

  document.getElementById("exportFinanceReportBtn")?.addEventListener("click", () => {
    void exportProjectFinanceReport();
  });

  document.getElementById("financialForecastExplainBtn")?.addEventListener("click", () => {
    updateState((draft) => {
      draft.ui.financialForecastExplainOpen = !draft.ui.financialForecastExplainOpen;
    });
  });

  document.getElementById("financialForecastExplainCloseBtn")?.addEventListener("click", () => {
    updateState((draft) => {
      draft.ui.financialForecastExplainOpen = false;
    });
  });

  document.querySelectorAll(".close-control-btn").forEach((button) => {
    button.addEventListener("click", () => {
      void updateCloseControlFromAdmin(
        button.dataset.projectId,
        button.dataset.closeAction
      );
    });
  });

  document.querySelectorAll(".version-transition-btn").forEach((button) => {
    button.addEventListener("click", () => {
      void transitionForecastVersionFromAdmin(
        button.dataset.projectId,
        button.dataset.versionId,
        button.dataset.nextStatus
      );
    });
  });

  document.getElementById("resourceAssignmentForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveAssignmentFromForm(event.currentTarget);
  });

  document.getElementById("resourceHiringForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveHireFromForm(event.currentTarget);
  });

  document.getElementById("resourceAttritionForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveAttritionFromForm(event.currentTarget);
  });
}

function setupLandingReveal() {
  if (signedInUser()) return;
  const nodes = Array.from(document.querySelectorAll(".landing-reveal"));
  if (!nodes.length) return;

  const applyVisible = (element) => {
    element.classList.remove("opacity-0", "translate-y-4");
    element.classList.add("opacity-100", "translate-y-0");
  };

  if (!("IntersectionObserver" in globalThis)) {
    nodes.forEach(applyVisible);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        applyVisible(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  nodes.forEach((node) => observer.observe(node));
}

function renderApp() {
  const root = document.getElementById("app");
  try {
    if (authState.status === "idle") {
      void initializeAuthUi();
    }

    const seededBaselineChanged = ensureAmyOriginalBudgetBaselineSeed(state, state.selectedYear);
    if (seededBaselineChanged) {
      saveState(state);
      if (state.selectedProjectId) {
        scheduleFinancePersistence(state.selectedProjectId);
      }
    }

    if (!signedInUser()) {
      root.innerHTML = renderLandingPage();
      wireEvents();
      setupLandingReveal();
      return;
    }

    root.innerHTML = layout();
    wireEvents();
    renderCharts();
    if (qboState.status === "idle" || qboState.year !== state.selectedYear) {
      void loadQboData();
    }
    if (setupState.status === "idle") {
      void loadSetupData();
    }
    if (state.selectedProjectId && financeState.loadedKey !== currentFinanceKey()) {
      void loadProjectFinanceData(state.selectedProjectId);
    }
  } catch (error) {
    console.error("renderApp failed", error);
    root.innerHTML = `
      <section class="mx-auto mt-10 max-w-3xl rounded-[1.5rem] border border-rose-200 bg-white p-6 shadow-panel">
        <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-500">Application Error</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-ink">The planner hit an error and could not render.</h1>
        <p class="mt-3 text-sm text-slate-600">${String(error?.message || "Unknown render error.")}</p>
        <div class="mt-5 flex gap-3">
          <button id="renderRecoveryResetBtn" class="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Reset To Defaults</button>
        </div>
      </section>
    `;
    document.getElementById("renderRecoveryResetBtn")?.addEventListener("click", () => {
      state = resetState();
      ensureSeededResourceModel(state);
      ensureBudgetingState(state);
      ensureSeededPlanningLines();
      ensureSeededActualsThroughMarch();
      syncAllProjectsFinancials(state);
      ensureAmyOriginalBudgetBaselineSeed(state, state.selectedYear);
      saveState(state);
      renderApp();
    });
  }
}

ensureSeededResourceModel(state);
ensureBudgetingState(state);
ensureSeededPlanningLines();
ensureSeededActualsThroughMarch();
syncAllProjectsFinancials(state);
const initializedBaselineChanged = ensureAmyOriginalBudgetBaselineSeed(state, state.selectedYear);
saveState(state);
if (initializedBaselineChanged && state.selectedProjectId) {
  scheduleFinancePersistence(state.selectedProjectId);
}
renderApp();
