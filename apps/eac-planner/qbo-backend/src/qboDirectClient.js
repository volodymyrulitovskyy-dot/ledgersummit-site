const DEFAULT_TENANT_ID = "24435fca-9720-417a-aeb0-ade802c698c2";
const DEFAULT_MINOR_VERSION = "65";
const DEFAULT_REFRESH_URL = "https://toolboxai-app.vercel.app/api/qbo/refresh";
const INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function qboEnvironment() {
  return String(process.env.QBO_ENV || "sandbox").toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

function qboApiBaseUrl() {
  return qboEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`${name} is not set.`);
    error.status = 500;
    throw error;
  }
  return value;
}

export function hasDirectQboConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasQboOauthConfig() {
  return Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET && process.env.QBO_REDIRECT_URI);
}

export function currentQboEnvironment() {
  return qboEnvironment();
}

export function currentTenantId() {
  return tenantId();
}

function supabaseHeaders() {
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json"
  };
}

function tenantId() {
  return process.env.TENANT_ID || DEFAULT_TENANT_ID;
}

async function patchConnection(realmId, values) {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const response = await fetch(
    `${supabaseUrl}/rest/v1/qbo_connections?tenant_id=eq.${tenantId()}&realm_id=eq.${encodeURIComponent(realmId)}`,
    {
      method: "PATCH",
      headers: {
        ...supabaseHeaders(),
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(values)
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Failed to update qbo_connections in Supabase.");
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return Array.isArray(payload) ? payload[0] || null : payload;
}

async function fetchActiveConnection() {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const query = new URLSearchParams({
    tenant_id: `eq.${tenantId()}`,
    status: "eq.active",
    select: "realm_id,company_name,access_token,refresh_token,token_expires_at,refresh_expires_at,connected_at,refreshed_at"
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/qbo_connections?${query.toString()}`, {
    headers: supabaseHeaders()
  });
  const payload = await response.json().catch(() => []);

  if (!response.ok) {
    const error = new Error("Failed to load qbo_connections from Supabase.");
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  const connection = Array.isArray(payload) ? payload[0] : null;
  if (!connection?.realm_id || !connection?.access_token) {
    const error = new Error("No active QuickBooks connection found for the configured tenant.");
    error.status = 404;
    throw error;
  }

  return connection;
}

export async function getActiveQboConnectionRecord() {
  return fetchActiveConnection();
}

async function refreshQboTokens() {
  if (hasQboOauthConfig()) {
    const connection = await fetchActiveConnection();
    const payload = await refreshQboTokensDirect(connection.refresh_token);
    const now = Date.now();
    await patchConnection(connection.realm_id, {
      access_token: payload.access_token || null,
      refresh_token: payload.refresh_token || connection.refresh_token || null,
      token_expires_at: payload.expires_in ? new Date(now + Number(payload.expires_in) * 1000).toISOString() : null,
      refresh_expires_at: payload.x_refresh_token_expires_in ? new Date(now + Number(payload.x_refresh_token_expires_in) * 1000).toISOString() : undefined,
      refreshed_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
      status: "active"
    });
    return payload;
  }

  const refreshUrl = process.env.QBO_REFRESH_URL || DEFAULT_REFRESH_URL;
  const headers = {
    "x-tenant-id": tenantId(),
    "content-type": "application/json"
  };

  // Vercel route is expected to accept POST; fall back to GET only if needed.
  let response = await fetch(refreshUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({})
  });

  if (response.status === 405) {
    response = await fetch(refreshUrl, {
      method: "GET",
      headers: {
        "x-tenant-id": tenantId()
      }
    });
  }

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const error = new Error("Failed to refresh QuickBooks tokens.");
    error.status = response.status;
    error.details = text;
    throw error;
  }

  return text;
}

export async function refreshQboTokensDirect(refreshToken) {
  if (!hasQboOauthConfig()) {
    const error = new Error("QBO OAuth client credentials are not configured.");
    error.status = 500;
    throw error;
  }
  if (!refreshToken) {
    const error = new Error("Refresh token is not available for the active QBO connection.");
    error.status = 400;
    throw error;
  }

  const clientId = requireEnv("QBO_CLIENT_ID");
  const clientSecret = requireEnv("QBO_CLIENT_SECRET");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const response = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error_description || payload?.error || "Failed to refresh QuickBooks tokens.");
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

function needsRefresh(connection) {
  if (!connection?.token_expires_at) return false;
  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  const now = Date.now();
  return expiresAt - now < 5 * 60 * 1000;
}

async function getConnection() {
  let connection = await fetchActiveConnection();
  if (needsRefresh(connection)) {
    await refreshQboTokens();
    connection = await fetchActiveConnection();
  }
  return connection;
}

async function qboRequest(path, searchParams = {}, init = {}, retry = true) {
  const connection = await getConnection();
  const query = new URLSearchParams({
    minorversion: DEFAULT_MINOR_VERSION,
    ...searchParams
  });

  const url = `${qboApiBaseUrl()}/v3/company/${connection.realm_id}/${path}?${query.toString()}`;
  const response = await fetch(url, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {})
    },
    body: init.body
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401 && retry) {
    await refreshQboTokens();
    return qboRequest(path, searchParams, init, false);
  }

  if (!response.ok) {
    const error = new Error(payload?.Fault?.Error?.[0]?.Detail || payload?.message || "QuickBooks request failed.");
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function qboQuery(query) {
  return qboRequest("query", {
    query
  });
}

function escapeQueryValue(value) {
  return String(value || "").replace(/'/g, "\\'");
}

export async function getCompanyInfo() {
  const connection = await getConnection();
  return qboRequest(`companyinfo/${connection.realm_id}`);
}

export async function getCompanyInfoWithToken(realmId, accessToken) {
  const response = await fetch(`${qboApiBaseUrl()}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=${DEFAULT_MINOR_VERSION}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.Fault?.Error?.[0]?.Detail || payload?.message || "QuickBooks request failed.");
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload;
}

export async function getProfitLoss(startDate, endDate, options = {}) {
  const searchParams = {
    start_date: startDate,
    end_date: endDate
  };

  if (options.summarizeColumnBy) searchParams.summarize_column_by = options.summarizeColumnBy;
  if (options.customerId) searchParams.customer = options.customerId;
  if (options.accountingMethod) searchParams.accounting_method = options.accountingMethod;

  return qboRequest("reports/ProfitAndLoss", {
    ...searchParams
  });
}

export async function getCashFlow(startDate, endDate) {
  return qboRequest("reports/StatementOfCashFlows", {
    start_date: startDate,
    end_date: endDate
  });
}

export async function getCustomers(maxResults = 100) {
  return qboQuery(`SELECT * FROM Customer MAXRESULTS ${maxResults}`);
}

export async function getEmployees(maxResults = 100) {
  return qboQuery(`SELECT * FROM Employee MAXRESULTS ${maxResults}`);
}

export async function getVendors(maxResults = 100) {
  return qboQuery(`SELECT * FROM Vendor MAXRESULTS ${maxResults}`);
}

export async function getItems(maxResults = 100) {
  return qboQuery(`SELECT * FROM Item MAXRESULTS ${maxResults}`);
}

export async function getAccounts(maxResults = 200, whereClause = "") {
  const where = whereClause ? ` WHERE ${whereClause}` : "";
  return qboQuery(`SELECT * FROM Account${where} MAXRESULTS ${maxResults}`);
}

export async function createPurchaseExpense(payload) {
  return qboRequest("purchase", {}, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function findExpenseAccountRefs() {
  const payload = await getAccounts(200);
  const accounts = payload?.QueryResponse?.Account || [];
  const expenseAccount = accounts.find((item) =>
    ["Expense", "Cost of Goods Sold"].includes(item.AccountType)
    && item.Active !== false
  );
  const paymentAccount = accounts.find((item) =>
    ["Bank", "Credit Card", "Other Current Asset"].includes(item.AccountType)
    && item.Active !== false
  );

  return {
    expenseAccountId: expenseAccount?.Id || null,
    expenseAccountName: expenseAccount?.Name || null,
    paymentAccountId: paymentAccount?.Id || null,
    paymentAccountName: paymentAccount?.Name || null
  };
}

export async function fetchCustomerById(customerId) {
  if (!customerId) return null;
  const payload = await qboQuery(`SELECT * FROM Customer WHERE Id = '${escapeQueryValue(customerId)}' MAXRESULTS 1`);
  const customers = payload?.QueryResponse?.Customer || [];
  return Array.isArray(customers) ? customers[0] || null : customers || null;
}
