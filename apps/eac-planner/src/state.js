import { defaultState, createEmptyProjectState, DEFAULT_PLANNING_YEAR } from "./seedData.js";

const STORAGE_KEY = "eac-rebuild-state-v1";
const VALID_MODULES = new Set([
  "resources",
  "eac",
  "budgeting"
]);
const VALID_TABS = new Set([
  "overview",
  "workflow",
  "plan",
  "financials",
  "admin",
  "employees",
  "assignments",
  "hiring",
  "attrition",
  "analytics",
  "rollup",
  "revenueSources",
  "scenarios"
]);
const VALID_PLAN_SUBTABS = new Set([
  "summary",
  "labor",
  "subcontractors",
  "equipment",
  "materials",
  "odc"
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeProject(project, fallbackProject) {
  return {
    ...clone(fallbackProject),
    ...project,
    planning: {
      ...clone(fallbackProject).planning,
      ...(project.planning || {})
    },
    actuals: {
      ...clone(fallbackProject).actuals,
      ...(project.actuals || {})
    },
    quickbooksMappings: project.quickbooksMappings || clone(fallbackProject).quickbooksMappings
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(defaultState);
    const parsed = JSON.parse(raw);
    const fresh = clone(defaultState);
    const projects = (parsed.projects || fresh.projects).map((project, index) =>
      normalizeProject(project, createEmptyProjectState(project?.id || `proj-${index + 1}`))
    );
    const activeModule = VALID_MODULES.has(parsed.ui?.activeModule) ? parsed.ui.activeModule : (fresh.ui.activeModule || "eac");
    const legacyTab = parsed.ui?.activeTab;
    let activeTab = "overview";
    let planSubtab = "summary";

    if (VALID_TABS.has(legacyTab)) {
      activeTab = legacyTab;
    } else if (legacyTab === "dashboard") {
      activeTab = "overview";
    } else if (legacyTab === "reports") {
      activeTab = "financials";
    } else if (legacyTab === "actuals") {
      activeTab = "admin";
    } else if (legacyTab === "resources") {
      activeTab = "admin";
    } else if (VALID_PLAN_SUBTABS.has(legacyTab)) {
      activeTab = "plan";
      planSubtab = legacyTab;
    }

    if (VALID_PLAN_SUBTABS.has(parsed.ui?.planSubtab)) {
      planSubtab = parsed.ui.planSubtab;
    }

    return {
      ...fresh,
      ...parsed,
      masterData: {
        ...fresh.masterData,
        ...(parsed.masterData || {})
      },
      selectedForecastVersionId: parsed.selectedForecastVersionId || fresh.selectedForecastVersionId,
      projects,
      ui: {
        ...fresh.ui,
        ...(parsed.ui || {}),
        activeModule,
        activeTab,
        planSubtab,
        adminSetupStep: parsed.ui?.adminSetupStep || fresh.ui.adminSetupStep || "project",
        askAiOpen: Boolean(parsed.ui?.askAiOpen),
        askAiDraft: parsed.ui?.askAiDraft || "",
        askAiResponse: parsed.ui?.askAiResponse || "",
        cardModes: {
          ...(fresh.ui.cardModes || {}),
          ...(parsed.ui?.cardModes || {})
        },
        planHorizonStartYear: Number(parsed.ui?.planHorizonStartYear || fresh.ui.planHorizonStartYear || fresh.selectedYear || DEFAULT_PLANNING_YEAR),
        planHorizonEndYear: Number(parsed.ui?.planHorizonEndYear || parsed.ui?.planHorizonStartYear || fresh.ui.planHorizonEndYear || fresh.selectedYear || DEFAULT_PLANNING_YEAR)
      },
      meta: fresh.meta
    };
  } catch {
    return clone(defaultState);
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  const fresh = clone(defaultState);
  saveState(fresh);
  return fresh;
}
