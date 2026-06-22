import { currentTenantId } from "./qboDirectClient.js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`${name} is not set.`);
    error.status = 500;
    throw error;
  }
  return value;
}

function supabaseUrl() {
  return requireEnv("SUPABASE_URL");
}

function supabaseHeaders() {
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
}

async function supabaseRequest(path, init = {}) {
  const response = await fetch(`${supabaseUrl()}${path}`, {
    ...init,
    headers: {
      ...supabaseHeaders(),
      ...(init.headers || {})
    }
  });
  const text = await response.text().catch(() => "");
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const error = new Error(payload?.message || payload?.hint || `Supabase request failed for ${path}`);
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function updateRows(path, values) {
  return supabaseRequest(path, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify(values)
  });
}

async function deleteRows(path) {
  return supabaseRequest(path, {
    method: "DELETE",
    headers: {
      Prefer: "return=representation"
    }
  });
}

export async function listGovconProjects() {
  const tenant = currentTenantId();
  return supabaseRequest(`/rest/v1/govcon_projects?tenant_id=eq.${tenant}&select=*&order=code.asc`);
}

export async function saveQboConnection(connection) {
  const tenant = currentTenantId();
  const nowIso = new Date().toISOString();
  const realmId = String(connection.realmId || "").trim();
  if (!realmId) {
    const error = new Error("realmId is required to save a QBO connection.");
    error.status = 400;
    throw error;
  }

  await updateRows(`/rest/v1/qbo_connections?tenant_id=eq.${tenant}&status=eq.active`, {
    status: "inactive",
    updated_at: nowIso
  }).catch((error) => {
    if (error.status !== 404) throw error;
  });

  const rows = await upsertRows("qbo_connections", [
    {
      tenant_id: tenant,
      realm_id: realmId,
      status: "active",
      company_name: connection.companyName || null,
      access_token: connection.accessToken || null,
      refresh_token: connection.refreshToken || null,
      token_expires_at: connection.tokenExpiresAt || null,
      refresh_expires_at: connection.refreshExpiresAt || null,
      connected_at: connection.connectedAt || nowIso,
      refreshed_at: connection.refreshedAt || nowIso,
      updated_at: nowIso
    }
  ], "tenant_id,realm_id");

  return rows[0] || null;
}

export async function updateActiveQboConnectionTokens(realmId, values) {
  const tenant = currentTenantId();
  const nowIso = new Date().toISOString();
  const rows = await updateRows(
    `/rest/v1/qbo_connections?tenant_id=eq.${tenant}&realm_id=eq.${encodeURIComponent(realmId)}`,
    {
      access_token: values.accessToken || null,
      refresh_token: values.refreshToken || null,
      token_expires_at: values.tokenExpiresAt || null,
      refresh_expires_at: values.refreshExpiresAt || null,
      refreshed_at: values.refreshedAt || nowIso,
      updated_at: nowIso,
      status: values.status || "active",
      company_name: values.companyName || undefined
    }
  );
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function listProjectQboMappings(realmId = null) {
  try {
    const tenant = currentTenantId();
    const realmFilter = realmId ? `&realm_id=eq.${encodeURIComponent(realmId)}` : "";
    return await supabaseRequest(`/rest/v1/govcon_project_qbo_mapping?tenant_id=eq.${tenant}&import_enabled=eq.true${realmFilter}&select=*&order=created_at.asc`);
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

export async function listRevenueMethods() {
  try {
    return await supabaseRequest("/rest/v1/govcon_revenue_methods?select=*&active=eq.true&order=sort_order.asc");
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

export async function listEmployeePlanningProfiles() {
  try {
    const tenant = currentTenantId();
    return await supabaseRequest(`/rest/v1/employee_planning_profiles?tenant_id=eq.${tenant}&select=*&order=display_name.asc`);
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

export async function listEquipmentCatalog() {
  try {
    const tenant = currentTenantId();
    return await supabaseRequest(`/rest/v1/equipment_catalog?tenant_id=eq.${tenant}&active=eq.true&select=*&order=equipment_name.asc`);
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

export async function listOdcCatalog() {
  try {
    const tenant = currentTenantId();
    return await supabaseRequest(`/rest/v1/odc_catalog?tenant_id=eq.${tenant}&active=eq.true&select=*&order=odc_name.asc`);
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

async function getActiveQboConnection() {
  const tenant = currentTenantId();
  const payload = await supabaseRequest(`/rest/v1/qbo_connections?tenant_id=eq.${tenant}&status=eq.active&select=*&limit=1`);
  return Array.isArray(payload) ? payload[0] || null : null;
}

function isoDateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function oneYearOut(date = new Date()) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + 1);
  return next;
}

async function insertRow(table, row) {
  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify(row)
  });
  return Array.isArray(payload) ? payload[0] || null : payload;
}

async function insertRows(table, rows) {
  const payload = await supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify(rows)
  });
  return Array.isArray(payload) ? payload : [];
}

export async function updateProjectBillingType(projectId, billingType) {
  const tenant = currentTenantId();
  const payload = await updateRows(
    `/rest/v1/govcon_projects?tenant_id=eq.${tenant}&id=eq.${encodeURIComponent(projectId)}`,
    {
      billing_type: billingType,
      updated_at: new Date().toISOString()
    }
  );
  return Array.isArray(payload) ? payload[0] || null : payload;
}

async function upsertRows(table, rows, onConflict) {
  const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  const payload = await supabaseRequest(`/rest/v1/${table}${query}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(rows)
  });
  return Array.isArray(payload) ? payload : [];
}

export async function bootstrapProjectsFromQboCustomers(customers) {
  const tenant = currentTenantId();
  const connection = await getActiveQboConnection();
  if (!connection?.realm_id) {
    const error = new Error("No active QBO connection found for bootstrap.");
    error.status = 404;
    throw error;
  }

  const existingProjects = await listGovconProjects().catch((error) => {
    if (error.status === 404) return [];
    throw error;
  });

  const existingMappings = await supabaseRequest(
    `/rest/v1/govcon_project_qbo_mapping?tenant_id=eq.${tenant}&realm_id=eq.${connection.realm_id}&select=*`
  ).catch((error) => {
    if (error.status === 404) return [];
    throw error;
  });

  const existingByCustomerId = new Set(
    (existingMappings || [])
      .map((item) => item.qbo_customer_id)
      .filter(Boolean)
  );
  const existingProjectCodes = new Set((existingProjects || []).map((item) => item.code));
  const today = new Date();
  const todayString = isoDateOnly(today);
  const endString = isoDateOnly(oneYearOut(today));
  const results = {
    created: [],
    skipped: []
  };

  for (const customer of customers) {
    if (!customer?.id || !customer?.displayName) continue;
    if (customer.active === false) {
      results.skipped.push({ customerId: customer.id, reason: "inactive_customer" });
      continue;
    }
    if (existingByCustomerId.has(customer.id)) {
      results.skipped.push({ customerId: customer.id, reason: "already_mapped" });
      continue;
    }

    const baseCode = `QBO-${customer.id}`;
    let contractCode = baseCode;
    let projectCode = `${baseCode}-PRJ`;
    let suffix = 1;
    while (existingProjectCodes.has(projectCode)) {
      suffix += 1;
      contractCode = `${baseCode}-${suffix}`;
      projectCode = `${contractCode}-PRJ`;
    }

    const contract = await insertRow("govcon_contracts", {
      tenant_id: tenant,
      code: contractCode,
      title: `${customer.displayName} Contract`,
      customer: customer.companyName || customer.displayName,
      type: "TM",
      status: "Open",
      ceiling: 0,
      funded: 0,
      billed: 0,
      incurred: 0,
      award_date: todayString,
      pop_start: todayString,
      pop_end: endString,
      condition: "Green",
      customer_org: customer.companyName || customer.displayName
    });

    const project = await insertRow("govcon_projects", {
      tenant_id: tenant,
      code: projectCode,
      title: customer.displayName,
      contract_id: contract.id,
      contract_code: contract.code,
      billing_type: "TM",
      status: "Open",
      condition: "Green",
      budget: 0,
      funded: 0,
      spent: 0,
      committed: 0,
      pm_name: "",
      start_date: todayString,
      end_date: endString
    });

    try {
      await insertRow("govcon_project_qbo_mapping", {
        tenant_id: tenant,
        project_id: project.id,
        qbo_connection_id: connection.id,
        realm_id: connection.realm_id,
        qbo_customer_id: customer.id,
        qbo_customer_name: customer.displayName,
        import_enabled: true,
        sync_status: "Bootstrapped"
      });
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    existingByCustomerId.add(customer.id);
    existingProjectCodes.add(projectCode);
    results.created.push({
      customerId: customer.id,
      customerName: customer.displayName,
      contractId: contract.id,
      contractCode: contract.code,
      projectId: project.id,
      projectCode: project.code
    });
  }

  return results;
}

async function maybeSingle(path) {
  try {
    const payload = await supabaseRequest(path);
    return Array.isArray(payload) ? payload[0] || null : payload;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

function parseNotesText(notes) {
  if (!notes) return {};
  if (typeof notes === "object") return notes;
  try {
    return JSON.parse(notes);
  } catch {
    return {};
  }
}

function numberValue(value) {
  return Number(value || 0);
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(numberValue(value));
}

function compactPeriod(value) {
  const text = String(value || "");
  return text ? text.slice(0, 7) : null;
}

function sumValues(values = []) {
  return values.reduce((total, value) => total + numberValue(value), 0);
}

function computeMarginPercent(revenue, cost) {
  const rev = numberValue(revenue);
  const expense = numberValue(cost);
  if (rev <= 0) return expense > 0 ? -100 : 0;
  const pct = ((rev - expense) / rev) * 100;
  return Math.max(-100, Math.min(100, pct));
}

export function resolveCommercialValues(bundle = {}) {
  const notes = parseNotesText(bundle?.setup?.notes);
  const baseContractValue = numberValue(bundle?.contract?.ceiling);
  const baseFundedValue = numberValue(bundle?.project?.funded ?? bundle?.contract?.funded);
  const modificationValue = numberValue(
    notes.commercialModificationValue
    || notes.modificationValue
    || 0
  );
  const effectiveContractValue = baseContractValue + modificationValue;
  const effectiveFundedValue = baseFundedValue + modificationValue;
  const unfundedBacklog = Math.max(effectiveContractValue - effectiveFundedValue, 0);

  return {
    notes,
    baseContractValue,
    baseFundedValue,
    modificationValue,
    effectiveContractValue,
    effectiveFundedValue,
    unfundedBacklog
  };
}

export function normalizeSnapshot(snapshot) {
  return {
    id: snapshot.id,
    label: snapshot.snapshot_label || snapshot.label || "Snapshot",
    isBaseline: Boolean(snapshot.is_baseline || snapshot.isBaseline),
    actualsThroughPeriod: compactPeriod(snapshot.actuals_through_period || snapshot.actualsThroughPeriod),
    summary: typeof snapshot.summary === "object" ? snapshot.summary : (snapshot.summary || {}),
    categories: Array.isArray(snapshot.category_summary) ? snapshot.category_summary : (snapshot.categories || []),
    createdAt: snapshot.created_at || snapshot.createdAt || null,
    versionId: snapshot.forecast_version_id || snapshot.versionId || null
  };
}

export function selectBaselineSnapshot(snapshots = []) {
  return snapshots.find((snapshot) => snapshot.isBaseline) || snapshots[snapshots.length - 1] || null;
}

export function normalizeForecastVersion(version) {
  return {
    id: version.id,
    code: version.version_code || version.code || "Working",
    name: version.version_name || version.name || version.version_code || version.code || "Working Forecast",
    status: version.status || "Draft",
    actualsThroughPeriod: compactPeriod(version.actuals_through_period || version.actualsThroughPeriod),
    createdAt: version.created_at || version.createdAt || null
  };
}

export function buildForecastState(bundle = {}, forecastVersionId = null, baselineSnapshot = null) {
  const versions = (bundle?.forecastVersions || []).map(normalizeForecastVersion);
  const selectedVersion = versions.find((item) => item.id === forecastVersionId) || versions[0] || null;
  const approvedVersions = versions.filter((item) => {
    const status = String(item.status || "").toLowerCase();
    return status === "approved" || status === "locked";
  });
  const workingVersion = selectedVersion || versions.find((item) => String(item.status || "").toLowerCase() !== "approved") || versions[0] || null;
  const priorApprovedVersion = approvedVersions.find((item) => item.id !== selectedVersion?.id) || null;
  const comparisonBasis = baselineSnapshot
    ? {
        type: "baseline_snapshot",
        label: baselineSnapshot.label,
        snapshotId: baselineSnapshot.id,
        versionId: baselineSnapshot.versionId || null
      }
    : priorApprovedVersion
      ? {
          type: "prior_approved_forecast",
          label: priorApprovedVersion.code || priorApprovedVersion.name,
          snapshotId: null,
          versionId: priorApprovedVersion.id
        }
      : {
          type: "none",
          label: null,
          snapshotId: null,
          versionId: null
        };

  return {
    selectedVersion,
    workingVersion,
    priorApprovedVersion,
    baselineSnapshotId: baselineSnapshot?.id || null,
    comparisonBasis
  };
}

function createRevenueExplanationText(model = {}) {
  const summary = model.summary || {};
  const comparison = model.comparisonSummary || {};
  const forecastState = model.forecastState || {};
  const basisLabel = forecastState?.comparisonBasis?.label || "no saved comparison basis";
  const basisType = forecastState?.comparisonBasis?.type || "none";

  return [
    `Revenue is recognized on a funded-value cost-to-cost basis using an effective funded value of ${currency(summary.effectiveFundedValue)} and EAC cost of ${currency(summary.eacCost)}.`,
    `Cumulative revenue to date is ${currency(summary.cumulativeRevenueToDate)} with current-period catch-up revenue of ${currency(summary.currentPeriodCatchUpRevenue)}.`,
    basisType === "none"
      ? "No baseline snapshot or prior approved forecast is available yet for saved comparison."
      : `Current saved comparison basis is ${basisLabel}, with cost variance ${currency(comparison.costVarianceVsBaseline)} and revenue impact ${currency(comparison.revenueImpactVsBaseline)}.`
  ].join(" ");
}

function createVarianceExplanationText(model = {}) {
  const comparison = model.comparisonSummary || {};
  const topDrivers = comparison.topDrivers || [];
  const firstDriver = topDrivers[0];
  const basisLabel = comparison.comparisonBasisLabel || "the current saved reference";

  if (!firstDriver) {
    return `No material variance driver is currently saved against ${basisLabel}.`;
  }

  return `${firstDriver.categoryKey} is the primary saved variance driver against ${basisLabel} at ${currency(firstDriver.varianceToPriorForecast)}. Total cost variance is ${currency(comparison.costVarianceVsBaseline)}, revenue impact is ${currency(comparison.revenueImpactVsBaseline)}, and margin variance is ${currency(comparison.marginVarianceVsBaseline)}.`;
}

async function listWorkflowHistory(projectId) {
  return supabaseRequest(`/rest/v1/govcon_project_assumptions?project_id=eq.${projectId}&assumption_type=in.(workflow_transition,actuals_close_control)&select=*&order=created_at.desc`)
    .catch((error) => {
      if (error.status === 404) return [];
      throw error;
    });
}

async function getLatestAssumption(projectId, assumptionType) {
  return maybeSingle(`/rest/v1/govcon_project_assumptions?project_id=eq.${projectId}&assumption_type=eq.${encodeURIComponent(assumptionType)}&select=*&order=created_at.desc&limit=1`);
}

async function insertWorkflowHistory(projectId, forecastVersionId, {
  assumptionType,
  title,
  value = "",
  impactArea = "",
  notes = ""
} = {}) {
  const tenant = currentTenantId();
  return insertRow("govcon_project_assumptions", {
    tenant_id: tenant,
    project_id: projectId,
    forecast_version_id: forecastVersionId || null,
    assumption_type: assumptionType,
    assumption_title: title,
    assumption_value: value,
    impact_area: impactArea,
    notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}

function formatHistoryNotes(actorName = "system", comment = "") {
  const actor = String(actorName || "system").trim();
  const detail = String(comment || "").trim();
  return detail ? `${actor}: ${detail}` : actor;
}

function periodOnOrBefore(period, boundary) {
  if (!period || !boundary) return false;
  return String(period) <= String(boundary);
}

export function resolveActualsThroughPeriod(bundle = {}, forecastVersionId = null) {
  const matchingVersion = (bundle?.forecastVersions || []).find((item) => item.id === forecastVersionId) || null;
  return compactPeriod(
    matchingVersion?.actuals_through_period
    || bundle?.setup?.close_through_period
    || bundle?.setup?.actuals_start_period
    || null
  );
}

export function buildMonthlyAuthoritativeRows(projectMonthly = [], commercial = {}, actualsThroughPeriod = null) {
  const ordered = [...(projectMonthly || [])].sort((a, b) =>
    String(a.project_period || "").localeCompare(String(b.project_period || ""))
  );

  let previousActualCumulativeRevenue = 0;

  return ordered.map((row) => {
    const period = compactPeriod(row.project_period);
    const isClosedThroughActuals = actualsThroughPeriod
      ? periodOnOrBefore(period, actualsThroughPeriod)
      : numberValue(row.actual_cost) > 0;
    const actualCostToDate = numberValue(row.cumulative_actual_cost);
    const eacCost = numberValue(row.eac_cost);
    const actualPercentComplete = eacCost > 0 ? Math.max(0, Math.min(1, actualCostToDate / eacCost)) : 0;
    const cumulativeRevenueToDate = actualPercentComplete * numberValue(commercial.effectiveFundedValue || commercial.effectiveContractValue);
    const currentPeriodCatchUpRevenue = isClosedThroughActuals
      ? cumulativeRevenueToDate - previousActualCumulativeRevenue
      : 0;
    if (isClosedThroughActuals) previousActualCumulativeRevenue = cumulativeRevenueToDate;
    const currentPeriodCost = numberValue(row.current_period_cost);
    const currentPeriodMargin = currentPeriodCatchUpRevenue - currentPeriodCost;

    return {
      period,
      monthIndex: numberValue(row.month_index),
      actualCost: numberValue(row.actual_cost),
      forecastCost: numberValue(row.forecast_cost),
      currentPeriodCost,
      cumulativeActualCost: actualCostToDate,
      cumulativeCost: numberValue(row.cumulative_cost),
      etcCost: numberValue(row.etc_cost),
      eacCost,
      percentCompleteThroughActuals: actualPercentComplete,
      cumulativeRevenueToDate,
      currentPeriodCatchUpRevenue,
      currentPeriodMargin,
      currentPeriodMarginPct: computeMarginPercent(currentPeriodCatchUpRevenue, currentPeriodCost),
      lockStatus: isClosedThroughActuals ? "ACTUAL" : "FORECAST",
      validationErrors: row.validation_errors || [],
      validationWarnings: row.validation_warnings || []
    };
  });
}

export function buildSummaryFromMonthly(monthlyRows = [], commercial = {}, baselineSnapshot = null, actualsThroughPeriod = null) {
  const actualsThroughRow = actualsThroughPeriod
    ? [...monthlyRows].reverse().find((row) => row.lockStatus === "ACTUAL" && row.period && periodOnOrBefore(row.period, actualsThroughPeriod))
    : null;
  const resolvedActualsThroughRow = actualsThroughRow
    || [...monthlyRows].reverse().find((row) => row.actualCost > 0)
    || monthlyRows[0]
    || null;
  const actualCostToDate = numberValue(resolvedActualsThroughRow?.cumulativeActualCost);
  const etcCost = numberValue(resolvedActualsThroughRow?.etcCost ?? monthlyRows[monthlyRows.length - 1]?.etcCost);
  const eacCost = numberValue(monthlyRows[monthlyRows.length - 1]?.eacCost ?? resolvedActualsThroughRow?.eacCost);
  const cumulativeRevenueToDate = numberValue(resolvedActualsThroughRow?.cumulativeRevenueToDate);
  const currentPeriodCatchUpRevenue = numberValue(resolvedActualsThroughRow?.currentPeriodCatchUpRevenue);
  const remainingFundedRevenue = Math.max(numberValue(commercial.effectiveFundedValue) - cumulativeRevenueToDate, 0);
  const eacMargin = numberValue(commercial.effectiveFundedValue || commercial.effectiveContractValue) - eacCost;

  return {
    actualsThroughPeriod: resolvedActualsThroughRow?.period || null,
    baseContractValue: numberValue(commercial.baseContractValue),
    baseFundedValue: numberValue(commercial.baseFundedValue),
    modificationValue: numberValue(commercial.modificationValue),
    effectiveContractValue: numberValue(commercial.effectiveContractValue),
    effectiveFundedValue: numberValue(commercial.effectiveFundedValue),
    unfundedBacklog: numberValue(commercial.unfundedBacklog),
    actualCostToDate,
    etcCost,
    eacCost,
    percentCompleteThroughActuals: numberValue(resolvedActualsThroughRow?.percentCompleteThroughActuals),
    cumulativeRevenueToDate,
    currentPeriodCatchUpRevenue,
    remainingFundedRevenue,
    eacMargin,
    marginPct: computeMarginPercent(numberValue(commercial.effectiveFundedValue || commercial.effectiveContractValue), eacCost),
    baselineSnapshotId: baselineSnapshot?.id || null
  };
}

export function buildCategorySummaryFromRows(forecastByCategory = [], snapshots = []) {
  const baselineSnapshot = selectBaselineSnapshot(snapshots);
  const baselineCategories = new Map(
    (baselineSnapshot?.categories || []).map((item) => [item.key, numberValue(item.eac)])
  );
  const categories = new Map();

  for (const row of forecastByCategory || []) {
    const key = row.category_key;
    if (!categories.has(key)) {
      categories.set(key, {
        key,
        actuals: 0,
        forecast: 0,
        eac: 0
      });
    }
    const current = categories.get(key);
    current.actuals += numberValue(row.actual_cost);
    current.forecast += numberValue(row.forecast_cost);
    current.eac += numberValue(row.actual_cost) > 0 ? numberValue(row.actual_cost) : numberValue(row.forecast_cost);
  }

  return [...categories.values()]
    .map((item) => ({
      key: item.key,
      actuals: item.actuals,
      etc: Math.max(item.eac - item.actuals, 0),
      eac: item.eac,
      varianceToPriorForecast: item.eac - numberValue(baselineCategories.get(item.key)),
      driverRankValue: Math.abs(item.eac - numberValue(baselineCategories.get(item.key)))
    }))
    .sort((a, b) => b.driverRankValue - a.driverRankValue);
}

export function buildComparisonSummary(summary, baselineSnapshot = null, categorySummary = []) {
  const baseline = baselineSnapshot?.summary || {};
  const topDrivers = categorySummary.slice(0, 3).map((item, index) => ({
    rank: index + 1,
    categoryKey: item.key,
    varianceToPriorForecast: item.varianceToPriorForecast,
    eac: item.eac
  }));

  return {
    baselineSnapshotId: baselineSnapshot?.id || null,
    baselineLabel: baselineSnapshot?.label || null,
    comparisonBasisType: baselineSnapshot ? "baseline_snapshot" : "none",
    comparisonBasisLabel: baselineSnapshot?.label || null,
    costVarianceVsBaseline: numberValue(summary.eacCost) - numberValue(baseline.eacCost),
    revenueImpactVsBaseline: numberValue(summary.cumulativeRevenueToDate) - numberValue(baseline.cumulativeRevenueToDate),
    marginVarianceVsBaseline: numberValue(summary.eacMargin) - numberValue(baseline.margin),
    topDrivers
  };
}

async function upsertProjectSetup(project, contract, tenant, values) {
  const payload = {
    tenant_id: tenant,
    project_id: project.id,
    contract_id: project.contract_id || null,
    setup_status: values.setup_status || "Seeded",
    project_manager_name: values.project_manager_name || project.pm_name || "",
    customer_name: values.customer_name || contract?.customer || project.title,
    organization_code: values.organization_code || "",
    department_code: values.department_code || "",
    reporting_currency: values.reporting_currency || "USD",
    planning_start_period: values.planning_start_period || null,
    planning_end_period: values.planning_end_period || null,
    actuals_start_period: values.actuals_start_period || null,
    close_through_period: values.close_through_period || null,
    variance_threshold_amount: values.variance_threshold_amount ?? 10000,
    variance_threshold_percent: values.variance_threshold_percent ?? 0.05,
    notes: JSON.stringify(values.notes || {}),
    updated_at: new Date().toISOString()
  };

  const existing = await maybeSingle(`/rest/v1/govcon_project_setup?project_id=eq.${project.id}&select=*`);
  if (existing?.id) {
    await updateRows(`/rest/v1/govcon_project_setup?id=eq.${existing.id}&tenant_id=eq.${tenant}`, payload);
    return maybeSingle(`/rest/v1/govcon_project_setup?id=eq.${existing.id}&select=*`);
  }

  return insertRow("govcon_project_setup", payload);
}

export async function getProjectSetupBundle(projectId) {
  const project = await maybeSingle(`/rest/v1/govcon_projects?id=eq.${projectId}&select=*`);
  if (!project) {
    const error = new Error("GovCon project not found.");
    error.status = 404;
    throw error;
  }

  const [
    contract,
    setup,
    qboMapping,
    revenueRules,
    revenueExplanations,
    manualRevenueExplanation,
    varianceExplanations,
    forecastVersions,
    workflowHistory
  ] = await Promise.all([
    project.contract_id
      ? maybeSingle(`/rest/v1/govcon_contracts?id=eq.${project.contract_id}&select=*`)
      : Promise.resolve(null),
    maybeSingle(`/rest/v1/govcon_project_setup?project_id=eq.${projectId}&select=*`),
    maybeSingle(`/rest/v1/govcon_project_qbo_mapping?project_id=eq.${projectId}&select=*`),
    maybeSingle(`/rest/v1/govcon_project_revenue_rules?project_id=eq.${projectId}&is_primary=eq.true&select=*`),
    maybeSingle(`/rest/v1/govcon_project_revenue_explanations?project_id=eq.${projectId}&select=*&order=created_at.desc&limit=1`),
    getLatestAssumption(projectId, "manual_revenue_explanation").catch((error) => {
      if (error.status === 404) return null;
      throw error;
    }),
    maybeSingle(`/rest/v1/govcon_variance_explanations?project_id=eq.${projectId}&select=*&order=created_at.desc&limit=1`),
    supabaseRequest(`/rest/v1/govcon_forecast_versions?project_id=eq.${projectId}&select=*&order=created_at.desc`)
      .catch((error) => {
        if (error.status === 404) return [];
        throw error;
      }),
    listWorkflowHistory(projectId)
  ]);

  return {
    tenantId: currentTenantId(),
    project,
    contract,
    setup,
    qboMapping,
    revenueRule: revenueRules,
    revenueExplanation: revenueExplanations || (manualRevenueExplanation ? {
      id: manualRevenueExplanation.id,
      explanation_title: manualRevenueExplanation.assumption_title || "Manual Revenue Explanation",
      explanation_text: manualRevenueExplanation.notes || manualRevenueExplanation.assumption_value || "",
      prepared_by: "local-ui",
      created_at: manualRevenueExplanation.created_at,
      updated_at: manualRevenueExplanation.updated_at
    } : null),
    varianceExplanation: varianceExplanations,
    forecastVersions,
    workflowHistory
  };
}

export async function saveProjectCommercialValues(projectId, {
  contractValue = 0,
  fundedValue = 0,
  modificationValue = 0
} = {}) {
  const tenant = currentTenantId();
  const bundle = await getProjectSetupBundle(projectId);
  const project = bundle.project;
  if (!project) {
    const error = new Error("GovCon project not found.");
    error.status = 404;
    throw error;
  }

  const nextContractValue = Number(contractValue || 0);
  const nextFundedValue = Number(fundedValue || 0);
  const nextModificationValue = Number(modificationValue || 0);

  const updateTimestamp = new Date().toISOString();

  if (bundle.contract?.id) {
    await updateRows(`/rest/v1/govcon_contracts?id=eq.${bundle.contract.id}&tenant_id=eq.${tenant}`, {
      ceiling: nextContractValue,
      funded: nextFundedValue,
      updated_at: updateTimestamp
    });
  }

  await updateRows(`/rest/v1/govcon_projects?id=eq.${projectId}&tenant_id=eq.${tenant}`, {
    funded: nextFundedValue,
    updated_at: updateTimestamp
  });

  const currentNotes = parseNotesText(bundle.setup?.notes);
  const nextNotes = {
    ...currentNotes,
    commercialModificationValue: nextModificationValue
  };

  if (bundle.setup?.id) {
    await updateRows(`/rest/v1/govcon_project_setup?id=eq.${bundle.setup.id}&tenant_id=eq.${tenant}`, {
      notes: JSON.stringify(nextNotes),
      updated_at: updateTimestamp
    });
  } else {
    await insertRow("govcon_project_setup", {
      tenant_id: tenant,
      project_id: projectId,
      contract_id: project.contract_id || null,
      setup_status: "Seeded",
      project_manager_name: project.pm_name || "",
      customer_name: bundle.contract?.customer || project.title,
      organization_code: "",
      department_code: "",
      reporting_currency: "USD",
      notes: JSON.stringify(nextNotes),
      created_at: updateTimestamp,
      updated_at: updateTimestamp
    });
  }

  return getProjectSetupBundle(projectId);
}

export async function seedProjectSetupBundle(projectId, values = {}) {
  const tenant = currentTenantId();
  const bundle = await getProjectSetupBundle(projectId);
  const project = bundle.project;
  if (!project) {
    const error = new Error("GovCon project not found.");
    error.status = 404;
    throw error;
  }

  const contractValue = Number(values.contractValue || bundle.contract?.ceiling || 0);
  const fundedValue = Number(values.fundedValue || project.funded || 0);
  const modificationValue = Number(values.modificationValue || 0);
  const updateTimestamp = new Date().toISOString();

  if (bundle.contract?.id) {
    await updateRows(`/rest/v1/govcon_contracts?id=eq.${bundle.contract.id}&tenant_id=eq.${tenant}`, {
      ceiling: contractValue,
      funded: fundedValue,
      updated_at: updateTimestamp
    });
  }

  await updateRows(`/rest/v1/govcon_projects?id=eq.${projectId}&tenant_id=eq.${tenant}`, {
    billing_type: values.billingType || project.billing_type || "FP",
    funded: fundedValue,
    pm_name: values.projectManagerName || project.pm_name || "",
    updated_at: updateTimestamp
  });

  const currentNotes = parseNotesText(bundle.setup?.notes);
  const nextNotes = {
    ...currentNotes,
    projectType: values.projectType || values.billingType || project.billing_type || "FP",
    businessUnitCode: values.organizationCode || "BU-WILDLIFE",
    projectFinanceLeadName: values.projectFinanceLeadName || "Avery Collins",
    managingDirectorName: values.managingDirectorName || "Evelyn Brooks",
    billerName: values.billerName || "Chloe Adams",
    commercialModificationValue: modificationValue,
    seededBy: "seedProjectSetupBundle"
  };

  await upsertProjectSetup(project, bundle.contract, tenant, {
    setup_status: values.setupStatus || "Seeded",
    project_manager_name: values.projectManagerName || project.pm_name || "Jamie Carter",
    customer_name: values.customerName || bundle.contract?.customer || project.title,
    organization_code: values.organizationCode || "BU-WILDLIFE",
    department_code: values.departmentCode || "OPERATIONS",
    reporting_currency: "USD",
    planning_start_period: values.planningStartPeriod || project.start_date || null,
    planning_end_period: values.planningEndPeriod || project.end_date || null,
    actuals_start_period: values.actualsStartPeriod || "2026-01-01",
    notes: nextNotes
  });

  return getProjectSetupBundle(projectId);
}

export async function listActualImportBatches(limit = 20) {
  try {
    const tenant = currentTenantId();
    return await supabaseRequest(`/rest/v1/govcon_actual_import_batches?tenant_id=eq.${tenant}&select=*&order=created_at.desc&limit=${limit}`);
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

export async function listActualMonthly(year, sourceScope = "PORTFOLIO") {
  try {
    const tenant = currentTenantId();
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return await supabaseRequest(`/rest/v1/govcon_actual_monthly?tenant_id=eq.${tenant}&source_scope=eq.${sourceScope}&actual_period=gte.${start}&actual_period=lte.${end}&select=*&order=actual_period.asc`);
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

export async function importMonthlyActuals({ startDate, endDate, realmId, months, sourcePayload, sourceScope = "PORTFOLIO", projectId = null, notes }) {
  const tenant = currentTenantId();

  const batch = await insertRow("govcon_actual_import_batches", {
    tenant_id: tenant,
    source_system: "QBO",
    realm_id: realmId || null,
    batch_status: "Processing",
    batch_started_at: new Date().toISOString(),
    row_count: Array.isArray(months) ? months.length : 0,
    error_count: 0,
    notes: notes || `Monthly actuals import for ${startDate} through ${endDate}`
  });

  try {
    const lineRows = (months || []).flatMap((month) => ([
      {
        tenant_id: tenant,
        import_batch_id: batch.id,
        source_transaction_id: `monthly-revenue-${month.period}`,
        source_document_no: month.label || month.period,
        source_customer_ref: sourceScope,
        transaction_date: `${month.period}-01`,
        amount: Number(month.revenue || 0),
        mapped_cost_category: "REVENUE",
        mapping_status: "Imported",
        mapped_project_id: projectId,
        raw_payload: month
      },
      {
        tenant_id: tenant,
        import_batch_id: batch.id,
        source_transaction_id: `monthly-cost-${month.period}`,
        source_document_no: month.label || month.period,
        source_customer_ref: sourceScope,
        transaction_date: `${month.period}-01`,
        amount: Number(month.cost || 0),
        mapped_cost_category: "COST",
        mapping_status: "Imported",
        mapped_project_id: projectId,
        raw_payload: month
      }
    ]));

    if (lineRows.length) {
      await insertRows("govcon_actual_import_lines", lineRows);
    }

    const monthlyRows = (months || []).map((month) => ({
      tenant_id: tenant,
      source_batch_id: batch.id,
      source_system: "QBO",
      realm_id: realmId || null,
      source_scope: sourceScope,
      project_id: projectId,
      actual_period: `${month.period}-01`,
      revenue_actual: Number(month.revenue || 0),
      cost_actual: Number(month.cost || 0),
      profit_actual: Number(month.profit || 0),
      raw_payload: month,
      imported_at: new Date().toISOString()
    }));

    if (monthlyRows.length) {
      const projectFilter = projectId ? `&project_id=eq.${projectId}` : `&project_id=is.null`;
      await deleteRows(`/rest/v1/govcon_actual_monthly?tenant_id=eq.${tenant}&source_scope=eq.${sourceScope}&actual_period=gte.${startDate}&actual_period=lte.${endDate}${projectFilter}${realmId ? `&realm_id=eq.${encodeURIComponent(realmId)}` : ""}`);
      await insertRows("govcon_actual_monthly", monthlyRows);
    }

    const completed = await updateRows(`/rest/v1/govcon_actual_import_batches?id=eq.${batch.id}`, {
      batch_status: "Success",
      batch_completed_at: new Date().toISOString(),
      row_count: months.length,
      error_count: 0,
      notes: notes || `Imported ${months.length} monthly actual periods from QBO`
    });

    return {
      batch: Array.isArray(completed) ? completed[0] || batch : batch,
      months: monthlyRows
    };
  } catch (error) {
    await updateRows(`/rest/v1/govcon_actual_import_batches?id=eq.${batch.id}`, {
      batch_status: "Failed",
      batch_completed_at: new Date().toISOString(),
      error_count: 1,
      notes: error.message || "Monthly actual import failed."
    }).catch(() => {});
    throw error;
  }
}

export async function getProjectFinanceModel(projectId, { year, forecastVersionId = null } = {}) {
  const tenant = currentTenantId();
  const versionFilter = forecastVersionId
    ? `forecast_version_id=eq.${forecastVersionId}`
    : "forecast_version_id=is.null";
  const snapshotVersionFilter = forecastVersionId
    ? `or=(forecast_version_id.eq.${forecastVersionId},forecast_version_id.is.null)`
    : "forecast_version_id=is.null";
  const yearValue = Number(year || new Date().getFullYear());

  const [projectMonthly, forecastByCategory, snapshots, bundle] = await Promise.all([
    supabaseRequest(`/rest/v1/govcon_project_monthly?tenant_id=eq.${tenant}&project_id=eq.${projectId}&planning_year=eq.${yearValue}&${versionFilter}&select=*&order=project_period.asc`).catch((error) => {
      if (error.status === 404) return [];
      throw error;
    }),
    supabaseRequest(`/rest/v1/govcon_forecast_by_category?tenant_id=eq.${tenant}&project_id=eq.${projectId}&planning_year=eq.${yearValue}&${versionFilter}&select=*&order=forecast_period.asc,category_key.asc`).catch((error) => {
      if (error.status === 404) return [];
      throw error;
    }),
    supabaseRequest(`/rest/v1/govcon_project_snapshots?tenant_id=eq.${tenant}&project_id=eq.${projectId}&snapshot_year=eq.${yearValue}&${snapshotVersionFilter}&select=*&order=created_at.asc`).catch((error) => {
      if (error.status === 404) return [];
      throw error;
    }),
    getProjectSetupBundle(projectId)
  ]);

  const normalizedSnapshots = (snapshots || []).map(normalizeSnapshot);
  const baselineSnapshot = selectBaselineSnapshot(normalizedSnapshots);
  const forecastState = buildForecastState(bundle, forecastVersionId, baselineSnapshot);
  const commercial = resolveCommercialValues(bundle);
  const actualsThroughPeriod = resolveActualsThroughPeriod(bundle, forecastVersionId);
  const monthlyRows = buildMonthlyAuthoritativeRows(projectMonthly, commercial, actualsThroughPeriod);
  const summary = buildSummaryFromMonthly(monthlyRows, commercial, baselineSnapshot, actualsThroughPeriod);
  const categorySummary = buildCategorySummaryFromRows(forecastByCategory, normalizedSnapshots);
  const comparisonSummary = buildComparisonSummary(summary, baselineSnapshot, categorySummary);
  comparisonSummary.comparisonBasisType = forecastState.comparisonBasis.type;
  comparisonSummary.comparisonBasisLabel = forecastState.comparisonBasis.label;
  comparisonSummary.comparisonBasisVersionId = forecastState.comparisonBasis.versionId;
  comparisonSummary.comparisonBasisSnapshotId = forecastState.comparisonBasis.snapshotId;

  return {
    tenantId: tenant,
    projectId,
    year: yearValue,
    forecastVersionId: forecastVersionId || null,
    bundle,
    summary,
    forecastState,
    monthlyRows,
    categorySummary,
    comparisonSummary,
    projectMonthly,
    forecastByCategory,
    snapshots: normalizedSnapshots
  };
}

function serializeProjectMonthlyRows({ tenant, projectId, year, forecastVersionId, funding, projectMonthly }) {
  return (projectMonthly || []).map((row) => ({
    tenant_id: tenant,
    project_id: projectId,
    forecast_version_id: forecastVersionId || null,
    planning_year: year,
    project_period: `${row.period}-01`,
    month_index: Number(row.monthIndex || 0),
    funding: Number(funding || 0),
    actual_cost: Number(row.actualCost || 0),
    forecast_cost: Number(row.forecastCost || 0),
    current_period_cost: Number(row.currentPeriodCost || 0),
    cumulative_actual_cost: Number(row.cumulativeActualCost || 0),
    cumulative_cost: Number(row.cumulativeCost || 0),
    etc_cost: Number(row.etcCost || 0),
    eac_cost: Number(row.eacCost || 0),
    percent_complete: Number(row.percentComplete || 0),
    cumulative_revenue: Number(row.cumulativeRevenue || 0),
    current_period_revenue: Number(row.currentPeriodRevenue || 0),
    current_period_margin: Number(row.currentPeriodMargin || 0),
    current_period_margin_pct: Number(row.currentPeriodMarginPct || 0),
    cumulative_margin: Number(row.cumulativeMargin || 0),
    margin: Number(row.margin || 0),
    margin_pct: Number(row.marginPct || 0),
    projected_total_cost: Number(row.projectedTotalCost || 0),
    validation_errors: row.validations?.errors || [],
    validation_warnings: row.validations?.warnings || [],
    updated_at: new Date().toISOString()
  }));
}

function serializeForecastByCategoryRows({ tenant, projectId, year, forecastVersionId, forecastByCategory }) {
  return (forecastByCategory || []).map((row) => ({
    tenant_id: tenant,
    project_id: projectId,
    forecast_version_id: forecastVersionId || null,
    planning_year: year,
    forecast_period: `${row.period}-01`,
    month_index: Number(row.monthIndex || 0),
    category_key: row.category,
    actual_cost: Number(row.actualCost || 0),
    forecast_cost: Number(row.forecastCost || 0),
    updated_at: new Date().toISOString()
  }));
}

function serializeSnapshotRows({ tenant, projectId, year, forecastVersionId, snapshots }) {
  return (snapshots || []).map((snapshot) => ({
    id: snapshot.id,
    tenant_id: tenant,
    project_id: projectId,
    forecast_version_id: snapshot.isBaseline
      ? (snapshot.versionId || null)
      : (forecastVersionId || snapshot.versionId || null),
    snapshot_label: snapshot.label,
    snapshot_year: year,
    is_baseline: Boolean(snapshot.isBaseline),
    actuals_through_period: snapshot.actualsThroughPeriod ? `${snapshot.actualsThroughPeriod}-01` : null,
    summary: snapshot.summary || {},
    category_summary: snapshot.categories || [],
    created_by: snapshot.createdBy || null,
    created_at: snapshot.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));
}

async function upsertRevenueExplanation(projectId, model) {
  const tenant = currentTenantId();
  const rule = model?.bundle?.revenueRule;
  if (!rule?.id) return null;

  const payload = {
    tenant_id: tenant,
    project_id: projectId,
    revenue_rule_id: rule.id,
    explanation_title: "Saved Revenue Logic",
    explanation_text: createRevenueExplanationText(model),
    assumption_notes: `Saved against ${model?.forecastState?.selectedVersion?.code || "working forecast"} on ${new Date().toISOString().slice(0, 10)}.`,
    prepared_by: "system",
    updated_at: new Date().toISOString()
  };

  const existing = await maybeSingle(`/rest/v1/govcon_project_revenue_explanations?project_id=eq.${projectId}&revenue_rule_id=eq.${rule.id}&select=*`);
  if (existing?.prepared_by && existing.prepared_by !== "system") {
    return existing;
  }
  if (existing?.id) {
    await updateRows(`/rest/v1/govcon_project_revenue_explanations?id=eq.${existing.id}&tenant_id=eq.${tenant}`, payload);
    return maybeSingle(`/rest/v1/govcon_project_revenue_explanations?id=eq.${existing.id}&select=*`);
  }

  return insertRow("govcon_project_revenue_explanations", {
    ...payload,
    created_at: payload.updated_at
  });
}

async function upsertVarianceExplanation(projectId, forecastVersionId, model) {
  const tenant = currentTenantId();
  const comparison = model?.comparisonSummary || {};
  const summary = model?.summary || {};
  const latestPeriod = summary.actualsThroughPeriod ? `${summary.actualsThroughPeriod}-01` : null;
  const topDriver = comparison.topDrivers?.[0] || null;
  const payload = {
    tenant_id: tenant,
    project_id: projectId,
    forecast_version_id: forecastVersionId || null,
    variance_period: latestPeriod,
    variance_scope: comparison.comparisonBasisType || "none",
    variance_subject: topDriver?.categoryKey || "overall_forecast",
    variance_amount: numberValue(comparison.costVarianceVsBaseline),
    variance_percent: null,
    explanation_text: createVarianceExplanationText(model),
    owner_name: "system",
    status: "Saved",
    updated_at: new Date().toISOString()
  };

  const versionFilter = forecastVersionId
    ? `forecast_version_id=eq.${forecastVersionId}`
    : "forecast_version_id=is.null";
  const existing = await maybeSingle(`/rest/v1/govcon_variance_explanations?project_id=eq.${projectId}&${versionFilter}&select=*&order=created_at.desc&limit=1`);
  if (existing?.owner_name && existing.owner_name !== "system") {
    return existing;
  }
  if (existing?.id) {
    await updateRows(`/rest/v1/govcon_variance_explanations?id=eq.${existing.id}&tenant_id=eq.${tenant}`, payload);
    return maybeSingle(`/rest/v1/govcon_variance_explanations?id=eq.${existing.id}&select=*`);
  }

  return insertRow("govcon_variance_explanations", {
    ...payload,
    created_at: payload.updated_at
  });
}

export async function transitionForecastVersion(projectId, versionId, { status, actorName = "system", comment = "" } = {}) {
  const tenant = currentTenantId();
  const nextStatus = String(status || "").trim();
  if (!nextStatus) {
    const error = new Error("A target forecast version status is required.");
    error.status = 400;
    throw error;
  }

  const bundle = await getProjectSetupBundle(projectId);
  const version = (bundle.forecastVersions || []).find((item) => item.id === versionId);
  if (!version) {
    const error = new Error("Forecast version not found.");
    error.status = 404;
    throw error;
  }

  const nowIso = new Date().toISOString();
  const payload = {
    status: nextStatus,
    updated_at: nowIso
  };

  if (nextStatus === "In Review") payload.submitted_at = nowIso;
  if (nextStatus === "Approved") payload.approved_at = nowIso;
  if (nextStatus === "Locked") payload.locked_at = nowIso;
  if (version.created_by == null && actorName) payload.created_by = actorName;

  await updateRows(`/rest/v1/govcon_forecast_versions?id=eq.${versionId}&tenant_id=eq.${tenant}`, payload);
  await insertWorkflowHistory(projectId, versionId, {
    assumptionType: "workflow_transition",
    title: "Forecast Version Transition",
    value: `${version.version_code || version.version_name || version.id}: ${version.status || "Unknown"} -> ${nextStatus}`,
    impactArea: "forecast_workflow",
    notes: formatHistoryNotes(actorName, comment)
  });
  return getProjectSetupBundle(projectId);
}

export async function updateProjectCloseControl(projectId, {
  closeThroughPeriod = null,
  actorName = "system",
  comment = "",
  action = "set"
} = {}) {
  const tenant = currentTenantId();
  const bundle = await getProjectSetupBundle(projectId);
  const project = bundle.project;
  if (!project) {
    const error = new Error("GovCon project not found.");
    error.status = 404;
    throw error;
  }
  if (!bundle.setup?.id) {
    const error = new Error("Project setup row is missing.");
    error.status = 400;
    throw error;
  }

  const nextAction = String(action || "set").trim().toLowerCase();
  const closePeriod = closeThroughPeriod ? String(closeThroughPeriod).slice(0, 10) : null;
  if (nextAction === "set" && !closePeriod) {
    const error = new Error("A close-through period is required to close actuals.");
    error.status = 400;
    throw error;
  }

  const updateTimestamp = new Date().toISOString();
  const priorClosePeriod = bundle.setup?.close_through_period ? compactPeriod(bundle.setup.close_through_period) : null;
  await updateRows(`/rest/v1/govcon_project_setup?id=eq.${bundle.setup.id}&tenant_id=eq.${tenant}`, {
    close_through_period: nextAction === "reopen" ? null : closePeriod,
    updated_at: updateTimestamp
  });

  await insertWorkflowHistory(projectId, bundle.forecastVersions?.[0]?.id || null, {
    assumptionType: "actuals_close_control",
    title: nextAction === "reopen" ? "Actuals Reopened" : "Actuals Closed Through",
    value: nextAction === "reopen"
      ? `${priorClosePeriod || "Open"} -> Open`
      : `${priorClosePeriod || "Open"} -> ${compactPeriod(closePeriod)}`,
    impactArea: "actuals_close",
    notes: formatHistoryNotes(actorName, comment)
  });

  return getProjectSetupBundle(projectId);
}

export async function saveProjectWorkflowNotes(projectId, {
  revenueExplanation = "",
  varianceExplanation = "",
  workflowComment = "",
  closeThroughPeriod = null,
  actorName = "local-ui"
} = {}) {
  const tenant = currentTenantId();
  const bundle = await getProjectSetupBundle(projectId);
  const project = bundle.project;
  if (!project) {
    const error = new Error("GovCon project not found.");
    error.status = 404;
    throw error;
  }

  const updateTimestamp = new Date().toISOString();
  const trimmedRevenue = String(revenueExplanation || "").trim();
  const trimmedVariance = String(varianceExplanation || "").trim();
  const trimmedComment = String(workflowComment || "").trim();
  const closePeriod = closeThroughPeriod ? String(closeThroughPeriod).slice(0, 10) : null;

  if (bundle.revenueRule?.id && trimmedRevenue) {
    const existing = await maybeSingle(`/rest/v1/govcon_project_revenue_explanations?project_id=eq.${projectId}&revenue_rule_id=eq.${bundle.revenueRule.id}&select=*`);
    const payload = {
      tenant_id: tenant,
      project_id: projectId,
      revenue_rule_id: bundle.revenueRule.id,
      explanation_title: "Manual Revenue Logic",
      explanation_text: trimmedRevenue,
      assumption_notes: trimmedComment || existing?.assumption_notes || null,
      prepared_by: actorName,
      updated_at: updateTimestamp
    };
    if (existing?.id) {
      await updateRows(`/rest/v1/govcon_project_revenue_explanations?id=eq.${existing.id}&tenant_id=eq.${tenant}`, payload);
    } else {
      await insertRow("govcon_project_revenue_explanations", {
        ...payload,
        created_at: updateTimestamp
      });
    }
  } else if (trimmedRevenue) {
    const existingManualRevenue = await getLatestAssumption(projectId, "manual_revenue_explanation").catch(() => null);
    const assumptionPayload = {
      tenant_id: tenant,
      project_id: projectId,
      forecast_version_id: bundle.forecastVersions?.[0]?.id || null,
      assumption_type: "manual_revenue_explanation",
      assumption_title: "Manual Revenue Explanation",
      assumption_value: trimmedRevenue,
      impact_area: "revenue_logic",
      notes: trimmedRevenue,
      updated_at: updateTimestamp
    };
    if (existingManualRevenue?.id) {
      await updateRows(`/rest/v1/govcon_project_assumptions?id=eq.${existingManualRevenue.id}&tenant_id=eq.${tenant}`, assumptionPayload);
    } else {
      await insertRow("govcon_project_assumptions", {
        ...assumptionPayload,
        created_at: updateTimestamp
      });
    }
  }

  if (trimmedVariance) {
    const versionId = bundle.forecastVersions?.[0]?.id || null;
    const versionFilter = versionId ? `forecast_version_id=eq.${versionId}` : "forecast_version_id=is.null";
    const existing = await maybeSingle(`/rest/v1/govcon_variance_explanations?project_id=eq.${projectId}&${versionFilter}&select=*&order=created_at.desc&limit=1`);
    const payload = {
      tenant_id: tenant,
      project_id: projectId,
      forecast_version_id: versionId,
      variance_period: closePeriod || (bundle.setup?.close_through_period || null),
      variance_scope: "manual_review",
      variance_subject: "overall_forecast",
      variance_amount: existing?.variance_amount ?? 0,
      variance_percent: existing?.variance_percent ?? null,
      explanation_text: trimmedVariance,
      owner_name: actorName,
      status: "Saved",
      updated_at: updateTimestamp
    };
    if (existing?.id) {
      await updateRows(`/rest/v1/govcon_variance_explanations?id=eq.${existing.id}&tenant_id=eq.${tenant}`, payload);
    } else {
      await insertRow("govcon_variance_explanations", {
        ...payload,
        created_at: updateTimestamp
      });
    }
  }

  if (closePeriod && bundle.setup?.id) {
    const priorClosePeriod = bundle.setup?.close_through_period ? compactPeriod(bundle.setup.close_through_period) : null;
    await updateRows(`/rest/v1/govcon_project_setup?id=eq.${bundle.setup.id}&tenant_id=eq.${tenant}`, {
      close_through_period: closePeriod,
      updated_at: updateTimestamp
    });
    await insertWorkflowHistory(projectId, bundle.forecastVersions?.[0]?.id || null, {
      assumptionType: "actuals_close_control",
      title: "Close Through Period Updated",
      value: `${priorClosePeriod || "Open"} -> ${compactPeriod(closePeriod)}`,
      impactArea: "actuals_close",
      notes: formatHistoryNotes(actorName, trimmedComment)
    });
  }

  if (trimmedComment) {
    await insertWorkflowHistory(projectId, bundle.forecastVersions?.[0]?.id || null, {
      assumptionType: "workflow_transition",
      title: "Workflow Comment",
      value: bundle.forecastVersions?.[0]?.status || "Working",
      impactArea: "workflow_comment",
      notes: formatHistoryNotes(actorName, trimmedComment)
    });
  }

  return getProjectSetupBundle(projectId);
}

export async function saveProjectFinanceModel(projectId, {
  year,
  forecastVersionId = null,
  funding = 0,
  projectMonthly = [],
  forecastByCategory = [],
  snapshots = []
} = {}) {
  const tenant = currentTenantId();
  const yearValue = Number(year || new Date().getFullYear());
  const versionFilter = forecastVersionId
    ? `forecast_version_id=eq.${forecastVersionId}`
    : "forecast_version_id=is.null";

  await deleteRows(`/rest/v1/govcon_project_monthly?tenant_id=eq.${tenant}&project_id=eq.${projectId}&planning_year=eq.${yearValue}&${versionFilter}`);
  await deleteRows(`/rest/v1/govcon_forecast_by_category?tenant_id=eq.${tenant}&project_id=eq.${projectId}&planning_year=eq.${yearValue}&${versionFilter}`);

  const monthlyRows = serializeProjectMonthlyRows({
    tenant,
    projectId,
    year: yearValue,
    forecastVersionId,
    funding,
    projectMonthly
  });
  const categoryRows = serializeForecastByCategoryRows({
    tenant,
    projectId,
    year: yearValue,
    forecastVersionId,
    forecastByCategory
  });
  const snapshotRows = serializeSnapshotRows({
    tenant,
    projectId,
    year: yearValue,
    forecastVersionId,
    snapshots
  });

  if (monthlyRows.length) {
    await insertRows("govcon_project_monthly", monthlyRows);
  }
  if (categoryRows.length) {
    await insertRows("govcon_forecast_by_category", categoryRows);
  }
  if (snapshotRows.length) {
    await upsertRows(
      "govcon_project_snapshots",
      snapshotRows,
      "id"
    );
  }

  const model = await getProjectFinanceModel(projectId, {
    year: yearValue,
    forecastVersionId
  });
  await upsertRevenueExplanation(projectId, model);
  await upsertVarianceExplanation(projectId, forecastVersionId, model);

  return {
    projectId,
    year: yearValue,
    forecastVersionId: forecastVersionId || null,
    monthlyCount: monthlyRows.length,
    categoryCount: categoryRows.length,
    snapshotCount: snapshotRows.length
  };
}
