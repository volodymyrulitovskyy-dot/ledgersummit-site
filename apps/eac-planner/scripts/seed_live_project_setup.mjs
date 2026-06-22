import fs from "node:fs";

const env = fs.readFileSync("/Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/qbo-backend/.env", "utf8");
const SUPABASE_URL = (env.match(/^SUPABASE_URL=(.*)$/m) || [])[1];
const SUPABASE_SERVICE_ROLE_KEY = (env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m) || [])[1];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env.");
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Accept: "application/json"
};

async function request(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }
  return payload;
}

const pmNames = [
  "Jamie Carter",
  "Olivia Chen",
  "Marcus Hill",
  "Sofia Alvarez",
  "Priya Singh",
  "Morgan Lee"
];

const financeLeadNames = [
  "Avery Collins",
  "Noah Bennett",
  "Sofia Ramirez",
  "Maya Patel",
  "Jordan Ellis",
  "Harper Nguyen"
];

const managingDirectorNames = [
  "Evelyn Brooks",
  "Daniel Foster",
  "Natalie Price",
  "Liam Walker"
];

const billerNames = [
  "Chloe Adams",
  "Mason Reed",
  "Grace Turner",
  "Caleb Ross"
];

const orgCodes = ["BU-DEFENSE", "BU-CIVIL", "BU-INFRA", "BU-TECH"];
const deptCodes = ["PMO", "DELIVERY", "OPS", "FINANCE"];
const requestedLimit = Number(process.argv[2] || 0);
const setupLimit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : Infinity;

function seededValue(values, index) {
  return values[index % values.length];
}

function startOfYear(dateText) {
  const year = String(dateText || new Date().toISOString().slice(0, 10)).slice(0, 4);
  return `${year}-01-01`;
}

function quarterStart(dateText) {
  const date = new Date(dateText || new Date().toISOString().slice(0, 10));
  const year = date.getFullYear();
  const month = date.getMonth();
  const quarterMonth = Math.floor(month / 3) * 3;
  return `${year}-${String(quarterMonth + 1).padStart(2, "0")}-01`;
}

function addMonths(dateText, monthsToAdd) {
  const date = new Date(dateText || new Date().toISOString().slice(0, 10));
  date.setMonth(date.getMonth() + monthsToAdd);
  return date.toISOString().slice(0, 10);
}

function baseContractValue(index, billingType) {
  const seed = [1500000, 1850000, 2250000, 1725000, 2100000][index % 5];
  if (String(billingType || "").toUpperCase() === "FP") return seed;
  return Math.round(seed * 1.08);
}

function fundedValue(contractValue, index) {
  const factor = [0.92, 0.88, 0.95, 0.9, 0.93][index % 5];
  return Math.round(contractValue * factor);
}

function modificationValue(index) {
  return [50000, 0, 75000, 25000, 0][index % 5];
}

function buildSetupRow(project, contract, index) {
  const projectManager = project.pm_name || seededValue(pmNames, index);
  const customerName = contract?.customer || project.title;
  const startDate = project.start_date || new Date().toISOString().slice(0, 10);
  const endDate = project.end_date || addMonths(startDate, 12);
  const projectType = project.billing_type || "TM";
  const businessUnitCode = seededValue(orgCodes, index);
  const projectFinanceLeadName = seededValue(financeLeadNames, index);
  const managingDirectorName = seededValue(managingDirectorNames, index);
  const billerName = seededValue(billerNames, index);

  return {
    tenant_id: project.tenant_id,
    project_id: project.id,
    contract_id: project.contract_id,
    setup_status: "Seeded",
    project_manager_name: projectManager,
    customer_name: customerName,
    organization_code: businessUnitCode,
    department_code: seededValue(deptCodes, index),
    reporting_currency: "USD",
    planning_start_period: quarterStart(startDate),
    planning_end_period: endDate,
    actuals_start_period: startOfYear(startDate),
    close_through_period: null,
    variance_threshold_amount: 10000,
    variance_threshold_percent: 0.05,
    notes: JSON.stringify({
      projectType,
      businessUnitCode,
      projectFinanceLeadName,
      managingDirectorName,
      billerName,
      seededBy: "seed_live_project_setup.mjs"
    })
  };
}

function forecastRows(project) {
  const startDate = project.start_date || new Date().toISOString().slice(0, 10);
  const year = Number(String(startDate).slice(0, 4)) || 2026;
  return [
    {
      tenant_id: project.tenant_id,
      project_id: project.id,
      version_code: `BUD-${year}`,
      version_name: `Approved Budget ${year}`,
      version_type: "Budget",
      status: "Approved",
      as_of_period: `${year}-01-01`,
      actuals_through_period: `${year - 1}-12-01`,
      created_by: "seed_live_project_setup"
    },
    {
      tenant_id: project.tenant_id,
      project_id: project.id,
      version_code: `WF-${year}`,
      version_name: `Working Forecast ${year}`,
      version_type: "Forecast",
      status: "Working",
      as_of_period: `${year}-01-01`,
      actuals_through_period: null,
      created_by: "seed_live_project_setup"
    }
  ];
}

async function upsertSetupRow(row) {
  return request(`/rest/v1/govcon_project_setup?project_id=eq.${row.project_id}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      contract_id: row.contract_id,
      setup_status: row.setup_status,
      project_manager_name: row.project_manager_name,
      customer_name: row.customer_name,
      organization_code: row.organization_code,
      department_code: row.department_code,
      reporting_currency: row.reporting_currency,
      planning_start_period: row.planning_start_period,
      planning_end_period: row.planning_end_period,
      actuals_start_period: row.actuals_start_period,
      close_through_period: row.close_through_period,
      variance_threshold_amount: row.variance_threshold_amount,
      variance_threshold_percent: row.variance_threshold_percent,
      notes: row.notes,
      updated_at: new Date().toISOString()
    })
  }).catch(async (error) => {
    if (!String(error.message || "").startsWith("404")) throw error;
    return request("/rest/v1/govcon_project_setup", {
      method: "POST",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify(row)
    });
  });
}

async function updateCommercials(project, contract, index) {
  const contractValue = baseContractValue(index, project.billing_type);
  const funded = fundedValue(contractValue, index);
  const modification = modificationValue(index);

  await request(`/rest/v1/govcon_contracts?id=eq.${project.contract_id}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      ceiling: contractValue,
      funded,
      updated_at: new Date().toISOString()
    })
  });

  await request(`/rest/v1/govcon_projects?id=eq.${project.id}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      funded,
      pm_name: project.pm_name || seededValue(pmNames, index),
      updated_at: new Date().toISOString()
    })
  });

  return {
    contractValue,
    funded,
    modification
  };
}

const [projects, contracts, existingVersions] = await Promise.all([
  request("/rest/v1/govcon_projects?select=*&order=title.asc"),
  request("/rest/v1/govcon_contracts?select=*"),
  request("/rest/v1/govcon_forecast_versions?select=*").catch(() => [])
]);

const contractsById = new Map((contracts || []).map((item) => [item.id, item]));
const existingVersionKey = new Set((existingVersions || []).map((item) => `${item.project_id}:${item.version_code}`));

const seededProjects = [];
const versionRows = [];

(projects || []).slice(0, setupLimit).forEach((project, index) => {
  forecastRows(project).forEach((row) => {
    const key = `${row.project_id}:${row.version_code}`;
    if (!existingVersionKey.has(key)) {
      versionRows.push(row);
      existingVersionKey.add(key);
    }
  });
});

for (const [index, project] of (projects || []).slice(0, setupLimit).entries()) {
  const contract = contractsById.get(project.contract_id);
  const commercials = await updateCommercials(project, contract, index);
  const setupRow = buildSetupRow({
    ...project,
    pm_name: project.pm_name || seededValue(pmNames, index)
  }, contract, index);
  const notes = JSON.parse(setupRow.notes);
  setupRow.notes = JSON.stringify({
    ...notes,
    commercialModificationValue: commercials.modification
  });
  await upsertSetupRow(setupRow);
  seededProjects.push({
    projectId: project.id,
    title: project.title,
    billingType: project.billing_type,
    funded: commercials.funded,
    contractValue: commercials.contractValue,
    modificationValue: commercials.modification
  });
}

if (versionRows.length) {
  await request("/rest/v1/govcon_forecast_versions", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(versionRows)
  });
}

console.log(JSON.stringify({
  setupSeeded: seededProjects.length,
  versionsSeeded: versionRows.length,
  projects: seededProjects
}, null, 2));
