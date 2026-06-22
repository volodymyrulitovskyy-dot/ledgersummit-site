import { computeMarginPercent } from "./calculations.js";

export function resolveApiBases() {
  const configured = globalThis.__QBO_API_BASE__;
  if (configured) return [configured];

  const hostname = globalThis.location?.hostname;
  const origin = globalThis.location?.origin;
  const protocol = globalThis.location?.protocol === "https:" ? "https:" : "http:";
  const candidates = [
    origin || null,
    hostname ? `${protocol}//${hostname}:3001` : null,
    "http://127.0.0.1:3001",
    "http://localhost:3001"
  ].filter(Boolean);

  return [...new Set(candidates)];
}

export async function fetchJson(path, init = {}, apiBases = resolveApiBases()) {
  let lastNetworkError;

  for (const base of apiBases) {
    const token = globalThis.__QBO_API_TOKEN__;
    const headers = {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(payload.message || `Request failed for ${base}${path}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }

      return payload;
    } catch (error) {
      if (typeof error?.status === "number") {
        if (error.status === 401) {
          throw new Error("Backend request was rejected with 401 Unauthorized. Check __QBO_API_TOKEN__ or API_AUTH_TOKEN.");
        }
        throw error;
      }

      lastNetworkError = error;
    }
  }

  throw lastNetworkError || new Error(`Unable to reach ${path}`);
}

export function selectedDateRange(selectedYear) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
  const currentDay = String(now.getDate()).padStart(2, "0");
  const endDate = selectedYear >= currentYear
    ? `${currentYear}-${currentMonth}-${currentDay}`
    : `${selectedYear}-12-31`;

  return {
    startDate: `${selectedYear}-01-01`,
    endDate
  };
}

function parseNumber(value) {
  const number = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : 0;
}

function flattenReportRows(rows = []) {
  return rows.flatMap((row) => [row, ...flattenReportRows(row?.Rows?.Row || [])]);
}

function summaryValue(row) {
  const columns = row?.Summary?.ColData || row?.ColData || [];
  for (let index = columns.length - 1; index >= 0; index -= 1) {
    const numeric = parseNumber(columns[index]?.value);
    if (numeric || String(columns[index]?.value || "").trim() === "0") {
      return numeric;
    }
  }
  return 0;
}

function rowByGroup(rows, group) {
  return flattenReportRows(rows).find((row) => row?.group === group);
}

function rowByLabel(rows, label) {
  return flattenReportRows(rows).find((row) => {
    const firstColumn = row?.Summary?.ColData?.[0]?.value || row?.ColData?.[0]?.value || "";
    return String(firstColumn).trim().toLowerCase() === label.trim().toLowerCase();
  });
}

export function extractCompanySummary(companyPayload) {
  const companyInfo = companyPayload?.data?.CompanyInfo || companyPayload?.CompanyInfo || {};
  const nameValues = companyInfo?.NameValue || [];
  const industryValue = nameValues.find((item) => item.Name === "IndustryType" || item.Name === "QBOIndustryType");

  return {
    companyName: companyInfo.CompanyName || companyInfo.LegalName || "Connected Company",
    industry: industryValue?.Value || companyInfo.IndustryType || "Unspecified"
  };
}

export function extractProfitLossSummary(reportPayload) {
  const report = reportPayload?.data || reportPayload || {};
  const rows = report?.Rows?.Row || [];
  const incomeRow = rowByGroup(rows, "Income");
  const expenseRow = rowByGroup(rows, "Expenses");
  const netIncomeRow = rowByGroup(rows, "NetIncome") || rowByLabel(rows, "Net Income");

  const revenue = summaryValue(incomeRow);
  const cost = Math.abs(summaryValue(expenseRow));
  const profit = summaryValue(netIncomeRow);

  return {
    revenue,
    cost,
    profit,
    margin: computeMarginPercent(revenue, cost)
  };
}

export function extractCashFlowSummary(reportPayload) {
  const report = reportPayload?.data || reportPayload || {};
  const rows = report?.Rows?.Row || [];
  const operatingRow = rowByGroup(rows, "OperatingActivities") || rowByLabel(rows, "Net cash provided by operating activities");
  const investingRow = rowByGroup(rows, "InvestingActivities") || rowByLabel(rows, "Net cash used in investing activities");
  const financingRow = rowByGroup(rows, "FinancingActivities") || rowByLabel(rows, "Net cash provided by financing activities");
  const endingCashRow = rowByLabel(rows, "Cash at end of period");

  return {
    operatingCashFlow: summaryValue(operatingRow),
    investingCashFlow: summaryValue(investingRow),
    financingCashFlow: summaryValue(financingRow),
    endingCash: summaryValue(endingCashRow)
  };
}

export function normalizeImportedMonthlyActuals(rows = [], monthLabels = []) {
  return (rows || []).map((row, index) => {
    if (row.period) {
      return {
        monthIndex: row.monthIndex ?? index,
        label: row.label || monthLabels[row.monthIndex ?? index],
        period: row.period,
        revenue: Number(row.revenue || 0),
        cost: Number(row.cost || 0),
        profit: Number(row.profit || 0)
      };
    }

    const periodText = String(row.actual_period || "");
    const period = periodText.slice(0, 7);
    const monthIndex = Math.max(Number(periodText.slice(5, 7) || index + 1) - 1, 0);
    return {
      monthIndex,
      label: monthLabels[monthIndex] ? `${monthLabels[monthIndex]} ${periodText.slice(0, 4)}` : period,
      period,
      revenue: Number(row.revenue_actual || 0),
      cost: Number(row.cost_actual || 0),
      profit: Number(row.profit_actual || 0)
    };
  });
}

export async function fetchProjectFinanceModel({ projectId, year, forecastVersionId = null }, apiBases = resolveApiBases()) {
  const params = new URLSearchParams();
  params.set("year", String(year));
  if (forecastVersionId) params.set("forecastVersionId", String(forecastVersionId));
  return fetchJson(`/finance/projects/${encodeURIComponent(projectId)}/model?${params.toString()}`, {}, apiBases);
}

export async function fetchProjectFinanceReport({ projectId, year, forecastVersionId = null }, apiBases = resolveApiBases()) {
  const params = new URLSearchParams();
  params.set("year", String(year));
  if (forecastVersionId) params.set("forecastVersionId", String(forecastVersionId));
  return fetchJson(`/finance/projects/${encodeURIComponent(projectId)}/report?${params.toString()}`, {}, apiBases);
}

export async function saveProjectFinanceModel(payload, apiBases = resolveApiBases()) {
  return fetchJson(`/finance/projects/${encodeURIComponent(payload.projectId)}/model`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, apiBases);
}

export function qboConnectUrl(apiBases = resolveApiBases()) {
  return `${apiBases[0]}/qbo/connect`;
}

export function openQboConnectWindow(apiBases = resolveApiBases()) {
  const url = qboConnectUrl(apiBases);
  const popup = globalThis.open(url, "qbo-connect", "popup=yes,width=760,height=820");
  if (!popup) {
    globalThis.location.href = url;
  }
}
