import dotenv from "dotenv";
import express from "express";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { extractUsefulContent, sendQuickBooksRequest } from "./anthropicClient.js";
import {
  createPurchaseExpense,
  fetchCustomerById,
  findExpenseAccountRefs,
  getCashFlow,
  getCompanyInfo,
  getCompanyInfoWithToken,
  getActiveQboConnectionRecord,
  getCustomers,
  getEmployees,
  getItems,
  getProfitLoss,
  getVendors,
  currentQboEnvironment,
  hasDirectQboConfig,
  hasQboOauthConfig,
  refreshQboTokensDirect
} from "./qboDirectClient.js";
import { parseMonthlyProfitLossReport } from "./qboReportParsers.js";
import {
  bootstrapProjectsFromQboCustomers,
  getProjectFinanceModel,
  importMonthlyActuals,
  listActualImportBatches,
  listActualMonthly,
  listProjectQboMappings,
  getProjectSetupBundle,
  listEmployeePlanningProfiles,
  listEquipmentCatalog,
  listGovconProjects,
  listOdcCatalog,
  listRevenueMethods,
  saveQboConnection,
  saveProjectCommercialValues,
  saveProjectFinanceModel,
  saveProjectWorkflowNotes,
  seedProjectSetupBundle,
  transitionForecastVersion,
  updateProjectCloseControl,
  updateProjectBillingType
} from "./supabaseGovconClient.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3001);
const apiAuthToken = process.env.API_AUTH_TOKEN || "";
const oauthStateStore = new Map();
const signInLogPath = path.resolve(__dirname, "..", "data", "signin-events.json");

function requireOauthEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`${name} is not set.`);
    error.status = 500;
    throw error;
  }
  return value;
}

async function ensureSignInLogFile() {
  await fs.mkdir(path.dirname(signInLogPath), { recursive: true });
  try {
    await fs.access(signInLogPath);
  } catch {
    await fs.writeFile(signInLogPath, "[]\n", "utf8");
  }
}

async function readSignInEvents() {
  await ensureSignInLogFile();
  try {
    const raw = await fs.readFile(signInLogPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSignInEvents(events) {
  await ensureSignInLogFile();
  await fs.writeFile(signInLogPath, `${JSON.stringify(events, null, 2)}\n`, "utf8");
}

function ownerEmailConfigured() {
  return String(process.env.AUTH_OWNER_EMAIL || "").trim().toLowerCase();
}

function providerLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized === "google") return "google";
  if (normalized === "email") return "email";
  return normalized;
}

function cleanupOauthStates() {
  const now = Date.now();
  for (const [key, value] of oauthStateStore.entries()) {
    if (!value?.expiresAt || value.expiresAt <= now) oauthStateStore.delete(key);
  }
}

function buildQboAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: requireOauthEnv("QBO_CLIENT_ID"),
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: requireOauthEnv("QBO_REDIRECT_URI"),
    state
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

async function exchangeQboCode(code) {
  const clientId = requireOauthEnv("QBO_CLIENT_ID");
  const clientSecret = requireOauthEnv("QBO_CLIENT_SECRET");
  const redirectUri = requireOauthEnv("QBO_REDIRECT_URI");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    }).toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error_description || payload?.error || "Failed to exchange QuickBooks authorization code.");
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload;
}

function oauthSuccessHtml(companyName, realmId) {
  const safeCompany = String(companyName || "Connected company").replace(/</g, "&lt;");
  const safeRealm = String(realmId || "").replace(/</g, "&lt;");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>QBO Connected</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; background: #f8fafc; color: #0f172a; padding: 32px; }
      .card { max-width: 560px; margin: 48px auto; background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 28px; box-shadow: 0 12px 40px rgba(15,23,42,0.08); }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0 0 12px; line-height: 1.5; }
      .meta { color: #475569; font-size: 14px; }
      button { margin-top: 12px; padding: 10px 14px; border-radius: 999px; border: 0; background: #0f172a; color: white; font-weight: 600; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>QuickBooks connected</h1>
      <p>${safeCompany} is now connected to this environment.</p>
      <p class="meta">Realm ID: ${safeRealm}</p>
      <p class="meta">You can close this window and return to the app.</p>
      <button onclick="window.close()">Close window</button>
    </div>
  </body>
</html>`;
}

function maskValue(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length <= 8) return `${text.slice(0, 2)}...${text.slice(-2)}`;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function explainQboOauthError(error, context = {}) {
  const detailCode =
    error?.details?.fault?.error?.[0]?.code
    || error?.details?.Fault?.Error?.[0]?.code
    || null;
  const detailMessage =
    error?.details?.fault?.error?.[0]?.message
    || error?.details?.Fault?.Error?.[0]?.Message
    || error?.message
    || "QuickBooks connection failed.";

  if (String(detailCode) === "3100" || /ApplicationAuthorizationFailed/i.test(String(detailMessage))) {
    return {
      title: "QuickBooks company not authorized for this app",
      summary: "OAuth login succeeded, but Intuit rejected API access for the selected company.",
      bullets: [
        "This usually means the selected company is not authorized for the current Intuit app.",
        "For a Development app, the company normally needs to be a sandbox company.",
        "If Intuit skips company selection, it may be auto-using the wrong company for the signed-in account."
      ],
      nextSteps: [
        "Sign out of Intuit and reconnect in a private/incognito window.",
        "Make sure you sign in with the sandbox owner account.",
        "Open the intended sandbox company first, then retry Connect QBO.",
        "If it still fails, verify the sandbox company actually belongs to this Intuit app/account."
      ]
    };
  }

  if (/OAuth state is missing or expired/i.test(String(error?.message || ""))) {
    return {
      title: "QuickBooks connect session expired",
      summary: "The OAuth state token expired before the callback completed.",
      bullets: [
        "This can happen if the login flow sat open too long or the browser retried an old callback URL."
      ],
      nextSteps: [
        "Start Connect QBO again from the app.",
        "Complete the login flow in one pass."
      ]
    };
  }

  if (/missing code or realmId/i.test(String(error?.message || ""))) {
    return {
      title: "QuickBooks callback is incomplete",
      summary: "Intuit redirected back without the fields needed to finish the connection.",
      bullets: [
        "The callback is missing an authorization code or company realm ID."
      ],
      nextSteps: [
        "Retry Connect QBO from the app.",
        "Confirm the redirect URI is exactly http://localhost:3001/qbo/callback in Intuit Developer."
      ]
    };
  }

  return {
    title: "QuickBooks connection failed",
    summary: "The callback reached the backend, but the connection could not be completed.",
    bullets: [String(detailMessage)],
    nextSteps: [
      "Retry Connect QBO.",
      "If this keeps happening, open /qbo/diagnostics and compare the active realm and token state."
    ]
  };
}

function oauthErrorHtml(error, context = {}) {
  const explanation = explainQboOauthError(error, context);
  const attemptedRealm = context.realmId ? escapeHtml(context.realmId) : "Unknown";
  const activeRealm = context.activeRealmId ? escapeHtml(context.activeRealmId) : "None";
  const activeCompany = context.activeCompanyName ? escapeHtml(context.activeCompanyName) : "None";
  const technical = escapeHtml(
    error?.details?.fault?.error?.[0]?.message
    || error?.details?.Fault?.Error?.[0]?.Message
    || error?.message
    || "Unknown error"
  );
  const technicalCode = escapeHtml(
    error?.details?.fault?.error?.[0]?.code
    || error?.details?.Fault?.Error?.[0]?.code
    || ""
  );

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>QBO Connection Error</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; background: #f8fafc; color: #0f172a; padding: 32px; }
      .card { max-width: 760px; margin: 32px auto; background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 28px; box-shadow: 0 12px 40px rgba(15,23,42,0.08); }
      h1 { margin: 0 0 8px; font-size: 24px; }
      h2 { margin: 18px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; }
      p { margin: 0 0 12px; line-height: 1.55; }
      ul { margin: 8px 0 0 18px; padding: 0; line-height: 1.55; }
      li { margin: 6px 0; }
      .meta { display: grid; grid-template-columns: 180px 1fr; gap: 8px 12px; font-size: 14px; margin-top: 12px; }
      .meta div:first-child { color: #64748b; }
      .note { margin-top: 16px; padding: 14px 16px; border-radius: 14px; background: #fff7ed; border: 1px solid #fed7aa; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
      button { margin-top: 16px; padding: 10px 14px; border-radius: 999px; border: 0; background: #0f172a; color: white; font-weight: 600; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(explanation.title)}</h1>
      <p>${escapeHtml(explanation.summary)}</p>

      <h2>Connection Context</h2>
      <div class="meta">
        <div>Attempted realm</div><div><code>${attemptedRealm}</code></div>
        <div>Active saved realm</div><div><code>${activeRealm}</code></div>
        <div>Active saved company</div><div>${activeCompany}</div>
        <div>Redirect URI</div><div><code>${escapeHtml(process.env.QBO_REDIRECT_URI || "")}</code></div>
      </div>

      <h2>Why this likely happened</h2>
      <ul>
        ${explanation.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>

      <h2>What to do next</h2>
      <ul>
        ${explanation.nextSteps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>

      <div class="note">
        <strong>Technical detail:</strong>
        <div><code>${technicalCode ? `${technicalCode} - ` : ""}${technical}</code></div>
      </div>

      <button onclick="window.close()">Close window</button>
    </div>
  </body>
</html>`;
}

async function handleQboCallback(req, res) {
  let activeConnection = null;
  try {
    activeConnection = await getActiveQboConnectionRecord();
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const context = {
    realmId: String(req.query.realmId || ""),
    activeRealmId: activeConnection?.realm_id || null,
    activeCompanyName: activeConnection?.company_name || null
  };

  try {
    if (!hasQboOauthConfig()) {
      const error = new Error("QBO client credentials are not configured.");
      error.status = 501;
      throw error;
    }

    cleanupOauthStates();

    if (req.query.error) {
      const error = new Error(String(req.query.error_description || req.query.error));
      error.status = 400;
      throw error;
    }

    const state = String(req.query.state || "");
    const entry = oauthStateStore.get(state);
    if (!entry) {
      const error = new Error("OAuth state is missing or expired. Start the QuickBooks connect flow again.");
      error.status = 400;
      throw error;
    }
    oauthStateStore.delete(state);

    const code = String(req.query.code || "");
    const realmId = String(req.query.realmId || "");
    if (!code || !realmId) {
      const error = new Error("QuickBooks callback is missing code or realmId.");
      error.status = 400;
      throw error;
    }

    const tokenPayload = await exchangeQboCode(code);
    const companyPayload = await getCompanyInfoWithToken(realmId, tokenPayload.access_token);
    const companyName = companyPayload?.CompanyInfo?.CompanyName
      || companyPayload?.CompanyInfo?.LegalName
      || companyPayload?.data?.CompanyInfo?.CompanyName
      || null;
    const now = Date.now();

    await saveQboConnection({
      realmId,
      companyName,
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token,
      tokenExpiresAt: tokenPayload.expires_in ? new Date(now + Number(tokenPayload.expires_in) * 1000).toISOString() : null,
      refreshExpiresAt: tokenPayload.x_refresh_token_expires_in ? new Date(now + Number(tokenPayload.x_refresh_token_expires_in) * 1000).toISOString() : null,
      connectedAt: new Date(now).toISOString(),
      refreshedAt: new Date(now).toISOString()
    });

    res.status(200).type("html").send(oauthSuccessHtml(companyName, realmId));
  } catch (error) {
    res.status(Number(error.status || 400)).type("html").send(oauthErrorHtml(error, context));
  }
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-api-key");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  if (
    req.path === "/qbo/connect"
    || req.path === "/qbo/callback"
    || req.path === "/api/qbo/callback"
    || req.path.startsWith("/auth/")
  ) {
    next();
    return;
  }

  if (!apiAuthToken) {
    next();
    return;
  }

  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const fallbackToken = req.headers["x-api-key"] || "";
  const providedToken = bearerToken || String(fallbackToken || "");

  if (providedToken !== apiAuthToken) {
    res.status(401).json({
      error: "Unauthorized",
      message: "A valid API token is required."
    });
    return;
  }

  next();
});

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function requireDateRange(req) {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    const error = new Error("startDate and endDate query params are required.");
    error.status = 400;
    throw error;
  }
  return { startDate, endDate };
}

function requireSandboxEnvironment() {
  if (currentQboEnvironment() !== "sandbox") {
    const error = new Error("Sandbox seeding is only allowed when QBO_ENV=sandbox.");
    error.status = 400;
    throw error;
  }
}

function monthDate(year, month, day = 15) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildSandboxExpensePayload({ customerId, vendorId, paymentAccountId, expenseAccountId, txnDate, docNumber, memo, amount }) {
  return {
    PaymentType: "Cash",
    AccountRef: {
      value: paymentAccountId
    },
    TxnDate: txnDate,
    PrivateNote: memo,
    DocNumber: docNumber,
    ...(vendorId ? { EntityRef: { type: "Vendor", value: vendorId } } : {}),
    Line: [
      {
        Amount: Number(amount),
        DetailType: "AccountBasedExpenseLineDetail",
        Description: memo,
        AccountBasedExpenseLineDetail: {
          AccountRef: {
            value: expenseAccountId
          },
          ...(customerId ? {
            CustomerRef: {
              value: customerId
            },
            BillableStatus: "NotBillable"
          } : {})
        }
      }
    ]
  };
}

function validateTransactions(body) {
  if (!Array.isArray(body)) {
    const error = new Error("Request body must be a JSON array of transactions.");
    error.status = 400;
    throw error;
  }

  body.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      const error = new Error(`Transaction at index ${index} must be an object.`);
      error.status = 400;
      throw error;
    }

    if (!item.description || typeof item.description !== "string") {
      const error = new Error(`Transaction at index ${index} is missing a valid description.`);
      error.status = 400;
      throw error;
    }

    if (typeof item.amount !== "number" || Number.isNaN(item.amount)) {
      const error = new Error(`Transaction at index ${index} is missing a valid numeric amount.`);
      error.status = 400;
      throw error;
    }

    if (!item.date || typeof item.date !== "string") {
      const error = new Error(`Transaction at index ${index} is missing a valid date.`);
      error.status = 400;
      throw error;
    }

    if (item.account_name != null && typeof item.account_name !== "string") {
      const error = new Error(`Transaction at index ${index} has an invalid account_name.`);
      error.status = 400;
      throw error;
    }
  });

  return body;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/auth/config", asyncHandler(async (_req, res) => {
  res.json({
    data: {
      enabled: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
      supabaseUrl: process.env.SUPABASE_URL || null,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
      ownerEmail: process.env.AUTH_OWNER_EMAIL || null,
      providers: {
        google: true,
        email: true
      }
    }
  });
}));

app.post("/auth/signin-events", asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) {
    const error = new Error("email is required.");
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    email,
    name: String(req.body?.name || "").trim() || email,
    provider: providerLabel(req.body?.provider),
    eventType: String(req.body?.eventType || "sign_in").trim() || "sign_in",
    signedInAt: String(req.body?.signedInAt || now),
    createdAt: now
  };

  const existing = await readSignInEvents();
  existing.unshift(entry);
  await writeSignInEvents(existing.slice(0, 500));

  res.status(201).json({ data: entry });
}));

app.get("/auth/signin-events", asyncHandler(async (_req, res) => {
  const events = (await readSignInEvents())
    .slice()
    .sort((left, right) => new Date(right.createdAt || right.signedInAt || 0).getTime() - new Date(left.createdAt || left.signedInAt || 0).getTime());

  const seen = new Set();
  const users = [];
  events.forEach((item) => {
    const key = String(item.email || "").toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    users.push({
      email: item.email,
      name: item.name || item.email,
      provider: item.provider,
      lastSignedInAt: item.signedInAt || item.createdAt || null
    });
  });

  res.json({
    data: {
      ownerEmail: ownerEmailConfigured() || null,
      users,
      events: events.slice(0, 100)
    }
  });
}));

app.get("/qbo/diagnostics", asyncHandler(async (_req, res) => {
  let activeConnection = null;
  try {
    activeConnection = await getActiveQboConnectionRecord();
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  res.json({
    data: {
      oauthConfigured: hasQboOauthConfig(),
      directQboConfigured: hasDirectQboConfig(),
      qboEnvironment: currentQboEnvironment(),
      tenantId: process.env.TENANT_ID || "24435fca-9720-417a-aeb0-ade802c698c2",
      qboClientId: maskValue(process.env.QBO_CLIENT_ID),
      qboClientSecretPresent: Boolean(process.env.QBO_CLIENT_SECRET),
      redirectUri: process.env.QBO_REDIRECT_URI || null,
      activeConnection: activeConnection ? {
        realmId: activeConnection.realm_id || null,
        companyName: activeConnection.company_name || null,
        tokenExpiresAt: activeConnection.token_expires_at || null,
        refreshExpiresAt: activeConnection.refresh_expires_at || null,
        connectedAt: activeConnection.connected_at || null,
        refreshedAt: activeConnection.refreshed_at || null
      } : null
    }
  });
}));

app.get("/qbo/connect", asyncHandler(async (req, res) => {
  if (!hasQboOauthConfig()) {
    const error = new Error("QBO client credentials are not configured. Set QBO_CLIENT_ID, QBO_CLIENT_SECRET, and QBO_REDIRECT_URI.");
    error.status = 501;
    throw error;
  }

  cleanupOauthStates();
  const state = crypto.randomBytes(24).toString("hex");
  oauthStateStore.set(state, {
    createdAt: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000,
    returnTo: typeof req.query.returnTo === "string" ? req.query.returnTo : ""
  });

  res.redirect(buildQboAuthorizeUrl(state));
}));

app.get("/qbo/callback", asyncHandler(handleQboCallback));
app.get("/api/qbo/callback", asyncHandler(handleQboCallback));

app.post("/qbo/refresh", asyncHandler(async (_req, res) => {
  const connection = await getActiveQboConnectionRecord();
  const tokenPayload = await refreshQboTokensDirect(connection.refresh_token);
  const now = Date.now();

  await saveQboConnection({
    realmId: connection.realm_id,
    companyName: connection.company_name || null,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token || connection.refresh_token,
    tokenExpiresAt: tokenPayload.expires_in ? new Date(now + Number(tokenPayload.expires_in) * 1000).toISOString() : null,
    refreshExpiresAt: tokenPayload.x_refresh_token_expires_in ? new Date(now + Number(tokenPayload.x_refresh_token_expires_in) * 1000).toISOString() : null,
    connectedAt: connection.connected_at || new Date(now).toISOString(),
    refreshedAt: new Date(now).toISOString()
  });

  res.status(200).json({
    ok: true,
    realmId: connection.realm_id
  });
}));

app.get("/setup/projects", asyncHandler(async (_req, res) => {
  const projects = await listGovconProjects();
  res.json({
    data: projects
  });
}));

app.get("/setup/revenue-methods", asyncHandler(async (_req, res) => {
  const methods = await listRevenueMethods();
  res.json({
    data: methods
  });
}));

app.get("/setup/employee-profiles", asyncHandler(async (_req, res) => {
  const profiles = await listEmployeePlanningProfiles();
  res.json({
    data: profiles
  });
}));

app.get("/setup/catalogs/equipment", asyncHandler(async (_req, res) => {
  const rows = await listEquipmentCatalog();
  res.json({
    data: rows
  });
}));

app.get("/setup/catalogs/odc", asyncHandler(async (_req, res) => {
  const rows = await listOdcCatalog();
  res.json({
    data: rows
  });
}));

app.get("/setup/projects/:projectId", asyncHandler(async (req, res) => {
  const bundle = await getProjectSetupBundle(req.params.projectId);
  res.json({
    data: bundle
  });
}));

app.post("/setup/projects/:projectId/commercial", asyncHandler(async (req, res) => {
  const bundle = await saveProjectCommercialValues(req.params.projectId, {
    contractValue: req.body?.contractValue || 0,
    fundedValue: req.body?.fundedValue || 0,
    modificationValue: req.body?.modificationValue || 0
  });
  res.status(201).json({
    data: bundle
  });
}));

app.post("/setup/projects/:projectId/seed", asyncHandler(async (req, res) => {
  const bundle = await seedProjectSetupBundle(req.params.projectId, {
    billingType: req.body?.billingType || "FP",
    projectType: req.body?.projectType || req.body?.billingType || "FP",
    contractValue: req.body?.contractValue || 1750000,
    fundedValue: req.body?.fundedValue || 1500000,
    modificationValue: req.body?.modificationValue || 50000,
    projectManagerName: req.body?.projectManagerName || "Jamie Carter",
    organizationCode: req.body?.organizationCode || "BU-WILDLIFE",
    departmentCode: req.body?.departmentCode || "OPERATIONS",
    projectFinanceLeadName: req.body?.projectFinanceLeadName || "Avery Collins",
    managingDirectorName: req.body?.managingDirectorName || "Evelyn Brooks",
    billerName: req.body?.billerName || "Chloe Adams",
    planningStartPeriod: req.body?.planningStartPeriod || "2026-04-01",
    planningEndPeriod: req.body?.planningEndPeriod || "2027-04-13",
    actualsStartPeriod: req.body?.actualsStartPeriod || "2026-01-01",
    setupStatus: req.body?.setupStatus || "Seeded"
  });
  res.status(201).json({
    data: bundle
  });
}));

app.post("/setup/projects/:projectId/forecast-versions/:versionId/transition", asyncHandler(async (req, res) => {
  const bundle = await transitionForecastVersion(req.params.projectId, req.params.versionId, {
    status: req.body?.status || "Working",
    actorName: req.body?.actorName || "system",
    comment: req.body?.comment || ""
  });
  res.status(201).json({
    data: bundle
  });
}));

app.post("/setup/projects/:projectId/workflow-notes", asyncHandler(async (req, res) => {
  const bundle = await saveProjectWorkflowNotes(req.params.projectId, {
    revenueExplanation: req.body?.revenueExplanation || "",
    varianceExplanation: req.body?.varianceExplanation || "",
    workflowComment: req.body?.workflowComment || "",
    closeThroughPeriod: req.body?.closeThroughPeriod || null,
    actorName: req.body?.actorName || "system"
  });
  res.status(201).json({
    data: bundle
  });
}));

app.post("/setup/projects/:projectId/close-control", asyncHandler(async (req, res) => {
  const bundle = await updateProjectCloseControl(req.params.projectId, {
    closeThroughPeriod: req.body?.closeThroughPeriod || null,
    actorName: req.body?.actorName || "system",
    comment: req.body?.comment || "",
    action: req.body?.action || "set"
  });
  res.status(201).json({
    data: bundle
  });
}));

app.get("/finance/projects/:projectId/model", asyncHandler(async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const forecastVersionId = req.query.forecastVersionId ? String(req.query.forecastVersionId) : null;
  const data = await getProjectFinanceModel(req.params.projectId, { year, forecastVersionId });
  res.json({ data });
}));

app.get("/finance/projects/:projectId/report", asyncHandler(async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const forecastVersionId = req.query.forecastVersionId ? String(req.query.forecastVersionId) : null;
  const data = await getProjectFinanceModel(req.params.projectId, { year, forecastVersionId });
  const bundle = data.bundle || await getProjectSetupBundle(req.params.projectId);
  const activeVersion = (bundle.forecastVersions || []).find((item) => String(item.id) === String(forecastVersionId || ""))
    || (bundle.forecastVersions || [])[0]
    || null;
  const lockedMonths = (data.monthlyRows || []).filter((item) => item.lockStatus === "ACTUAL").length;
  const openMonths = Math.max((data.monthlyRows || []).length - lockedMonths, 0);
  res.json({
    data: {
      generatedAt: new Date().toISOString(),
      projectId: req.params.projectId,
      year,
      forecastVersionId,
      project: bundle.project || null,
      contract: bundle.contract || null,
      setup: bundle.setup || null,
      activeVersion,
      revenueExplanation: bundle.revenueExplanation || null,
      varianceExplanation: bundle.varianceExplanation || null,
      workflowHistory: bundle.workflowHistory || [],
      summary: data.summary,
      comparisonSummary: data.comparisonSummary,
      forecastState: data.forecastState,
      categorySummary: data.categorySummary,
      monthlyRows: data.monthlyRows,
      reportSections: {
        comparisonBasis: data.forecastState?.comparisonBasis || null,
        closeThroughPeriod: bundle.setup?.close_through_period || null,
        actualsThroughPeriod: data.summary?.actualsThroughPeriod || null,
        activeVersionCode: activeVersion?.version_code || null,
        activeVersionStatus: activeVersion?.status || null,
        lockedMonths,
        openMonths
      }
    }
  });
}));

app.post("/finance/projects/:projectId/model", asyncHandler(async (req, res) => {
  const year = Number(req.body?.year || req.query.year || new Date().getFullYear());
  const payload = await saveProjectFinanceModel(req.params.projectId, {
    year,
    forecastVersionId: req.body?.forecastVersionId || null,
    funding: req.body?.funding || 0,
    projectMonthly: req.body?.projectMonthly || [],
    forecastByCategory: req.body?.forecastByCategory || [],
    snapshots: req.body?.snapshots || []
  });
  res.status(201).json({ data: payload });
}));

app.get("/setup/bootstrap/customers", asyncHandler(async (_req, res) => {
  if (!hasDirectQboConfig()) {
    const error = new Error("Direct QBO configuration is required for bootstrap customers.");
    error.status = 501;
    throw error;
  }

  const payload = await getCustomers(100);
  const customers = payload?.QueryResponse?.Customer || [];

  res.json({
    data: customers.map((customer) => ({
      id: customer.Id,
      displayName: customer.DisplayName,
      companyName: customer.CompanyName || customer.DisplayName,
      fullyQualifiedName: customer.FullyQualifiedName,
      active: customer.Active,
      currency: customer.CurrencyRef?.name || "USD"
    }))
  });
}));

app.post("/setup/bootstrap/projects", asyncHandler(async (_req, res) => {
  if (!hasDirectQboConfig()) {
    const error = new Error("Direct QBO configuration is required for project bootstrap.");
    error.status = 501;
    throw error;
  }

  const payload = await getCustomers(100);
  const customers = (payload?.QueryResponse?.Customer || []).map((customer) => ({
    id: customer.Id,
    displayName: customer.DisplayName,
    companyName: customer.CompanyName || customer.DisplayName,
    active: customer.Active !== false
  }));

  const results = await bootstrapProjectsFromQboCustomers(customers);
  res.status(201).json({
    data: results
  });
}));

app.get("/setup/bootstrap/employees", asyncHandler(async (_req, res) => {
  if (!hasDirectQboConfig()) {
    const error = new Error("Direct QBO configuration is required for bootstrap employees.");
    error.status = 501;
    throw error;
  }

  const payload = await getEmployees(100);
  const employees = payload?.QueryResponse?.Employee || [];

  res.json({
    data: employees.map((employee) => ({
      id: employee.Id,
      displayName: employee.DisplayName || [employee.GivenName, employee.FamilyName].filter(Boolean).join(" "),
      givenName: employee.GivenName || "",
      familyName: employee.FamilyName || "",
      active: employee.Active !== false,
      primaryPhone: employee.PrimaryPhone?.FreeFormNumber || "",
      primaryEmail: employee.PrimaryEmailAddr?.Address || ""
    }))
  });
}));

app.get("/setup/bootstrap/vendors", asyncHandler(async (_req, res) => {
  if (!hasDirectQboConfig()) {
    const error = new Error("Direct QBO configuration is required for bootstrap vendors.");
    error.status = 501;
    throw error;
  }

  const payload = await getVendors(100);
  const vendors = payload?.QueryResponse?.Vendor || [];

  res.json({
    data: vendors.map((vendor) => ({
      id: vendor.Id,
      displayName: vendor.DisplayName || vendor.CompanyName,
      companyName: vendor.CompanyName || vendor.DisplayName,
      active: vendor.Active !== false
    }))
  });
}));

app.get("/setup/bootstrap/items", asyncHandler(async (_req, res) => {
  if (!hasDirectQboConfig()) {
    const error = new Error("Direct QBO configuration is required for bootstrap items.");
    error.status = 501;
    throw error;
  }

  const payload = await getItems(100);
  const items = payload?.QueryResponse?.Item || [];

  res.json({
    data: items.map((item) => ({
      id: item.Id,
      name: item.Name,
      sku: item.Sku || "",
      description: item.Description || item.Name,
      type: item.Type || "",
      unitPrice: Number(item.UnitPrice || 0),
      purchaseCost: Number(item.PurchaseCost || 0),
      active: item.Active !== false
    }))
  });
}));

app.post("/sandbox/seed-project-actuals", asyncHandler(async (req, res) => {
  requireSandboxEnvironment();

  if (!hasDirectQboConfig()) {
    const error = new Error("Sandbox seeding requires direct QBO configuration.");
    error.status = 501;
    throw error;
  }

  const targetProjectIds = Array.isArray(req.body?.projectIds)
    ? req.body.projectIds.map((value) => String(value)).filter(Boolean)
    : [];

  const connection = await getActiveQboConnectionRecord();
  const [mappings, vendorsPayload, accountRefs] = await Promise.all([
    listProjectQboMappings(connection.realm_id),
    getVendors(20),
    findExpenseAccountRefs()
  ]);

  if (!accountRefs.expenseAccountId || !accountRefs.paymentAccountId) {
    const error = new Error("Could not find sandbox QBO accounts needed for expense seeding.");
    error.status = 400;
    throw error;
  }

  const vendor = (vendorsPayload?.QueryResponse?.Vendor || []).find((item) => item.Active !== false) || null;
  const selectedMappings = (mappings || [])
    .filter((item) => item?.project_id && item?.qbo_customer_id)
    .filter((item) => !targetProjectIds.length || targetProjectIds.includes(String(item.project_id)))
    .slice(0, targetProjectIds.length ? targetProjectIds.length : 2);

  if (!selectedMappings.length) {
    const error = new Error("No mapped projects were found for sandbox seeding.");
    error.status = 404;
    throw error;
  }

  const monthSeeds = [
    { month: 1, amount: 18250 },
    { month: 2, amount: 21400 },
    { month: 3, amount: 23650 }
  ];

  const results = [];

  for (const [mappingIndex, mapping] of selectedMappings.entries()) {
    const customer = await fetchCustomerById(mapping.qbo_customer_id);
    if (!customer?.Id) {
      const error = new Error(`Mapped QBO customer ${mapping.qbo_customer_id} was not found in active realm ${connection.realm_id}. Refresh project mappings for this sandbox company first.`);
      error.status = 400;
      throw error;
    }
    const seeded = [];

    for (const [monthIndex, monthSeed] of monthSeeds.entries()) {
      const amount = monthSeed.amount + mappingIndex * 3250 + monthIndex * 950;
      const txnDate = monthDate(2026, monthSeed.month, 15);
      const memo = `Sandbox seeded project actual ${txnDate}`;
      const docNumber = `EAC-${String(mappingIndex + 1).padStart(2, "0")}-${String(monthSeed.month).padStart(2, "0")}`;

      const payload = buildSandboxExpensePayload({
        customerId: mapping.qbo_customer_id,
        vendorId: null,
        paymentAccountId: accountRefs.paymentAccountId,
        expenseAccountId: accountRefs.expenseAccountId,
        txnDate,
        docNumber,
        memo,
        amount
      });

      const created = await createPurchaseExpense(payload);
      seeded.push({
        txnDate,
        amount,
        docNumber,
        purchaseId: created?.Purchase?.Id || created?.Id || null
      });
    }

    results.push({
      projectId: mapping.project_id,
      qboCustomerId: mapping.qbo_customer_id,
      customerName: customer?.DisplayName || customer?.FullyQualifiedName || customer?.CompanyName || null,
      seeded
    });
  }

  res.status(201).json({
    data: {
      environment: currentQboEnvironment(),
      expenseAccountId: accountRefs.expenseAccountId,
      paymentAccountId: accountRefs.paymentAccountId,
      vendorId: vendor?.Id || null,
      projects: results
    }
  });
}));

app.post("/sandbox/set-seeded-projects-fp", asyncHandler(async (_req, res) => {
  requireSandboxEnvironment();

  if (!hasDirectQboConfig()) {
    const error = new Error("Sandbox project updates require direct configuration.");
    error.status = 501;
    throw error;
  }

  const connection = await getActiveQboConnectionRecord();
  const mappings = await listProjectQboMappings(connection.realm_id);
  const targets = (mappings || [])
    .filter((item) => item?.project_id)
    .slice(0, 5);

  if (!targets.length) {
    const error = new Error("No mapped sandbox projects were found to update.");
    error.status = 404;
    throw error;
  }

  const updated = [];
  for (const mapping of targets) {
    const row = await updateProjectBillingType(mapping.project_id, "FP");
    updated.push({
      projectId: mapping.project_id,
      qboCustomerId: mapping.qbo_customer_id,
      billingType: row?.billing_type || "FP"
    });
  }

  res.status(200).json({
    data: {
      environment: currentQboEnvironment(),
      updated
    }
  });
}));

app.get("/company-info", asyncHandler(async (_req, res) => {
  if (hasDirectQboConfig()) {
    const payload = await getCompanyInfo();
    res.json({
      mode: "direct-qbo",
      data: payload
    });
    return;
  }

  const prompt = [
    "Use the quickbooks-mcp server to fetch the connected QuickBooks Online company information.",
    "Return the company name and industry.",
    "If available, include legal name and country as supporting context."
  ].join(" ");

  const payload = await sendQuickBooksRequest(prompt);
  res.json(extractUsefulContent(payload));
}));

app.get("/profit-loss", asyncHandler(async (req, res) => {
  const { startDate, endDate } = requireDateRange(req);

  if (hasDirectQboConfig()) {
    const payload = await getProfitLoss(startDate, endDate);
    res.json({
      mode: "direct-qbo",
      data: payload
    });
    return;
  }

  const prompt = [
    "Use the quickbooks-mcp server to generate a Profit and Loss report.",
    `Date range: ${startDate} through ${endDate}.`,
    "Return a concise summary and the key totals."
  ].join(" ");

  const payload = await sendQuickBooksRequest(prompt);
  res.json(extractUsefulContent(payload));
}));

app.get("/actuals/monthly-summary", asyncHandler(async (req, res) => {
  const { startDate, endDate } = requireDateRange(req);

  if (!hasDirectQboConfig()) {
    const error = new Error("Monthly actuals summary requires direct QBO configuration.");
    error.status = 501;
    throw error;
  }

  const payload = await getProfitLoss(startDate, endDate, {
    summarizeColumnBy: "Month"
  });

  res.json({
    mode: "direct-qbo",
    data: parseMonthlyProfitLossReport(payload)
  });
}));

app.post("/actuals/import-monthly", asyncHandler(async (req, res) => {
  const { startDate, endDate } = requireDateRange(req);

  if (!hasDirectQboConfig()) {
    const error = new Error("Monthly actuals import requires direct QBO configuration.");
    error.status = 501;
    throw error;
  }

  const [connection, payload] = await Promise.all([
    getActiveQboConnectionRecord(),
    getProfitLoss(startDate, endDate, { summarizeColumnBy: "Month" })
  ]);

  const parsed = parseMonthlyProfitLossReport(payload);
  const persisted = await importMonthlyActuals({
    startDate,
    endDate,
    realmId: connection.realm_id,
    months: parsed.months,
    sourcePayload: payload
  });

  res.status(201).json({
    mode: "direct-qbo",
    data: {
      batch: persisted.batch,
      months: parsed.months
    }
  });
}));

app.post("/actuals/import-project-monthly", asyncHandler(async (req, res) => {
  const { startDate, endDate } = requireDateRange(req);

  if (!hasDirectQboConfig()) {
    const error = new Error("Project monthly actuals import requires direct QBO configuration.");
    error.status = 501;
    throw error;
  }

  const connection = await getActiveQboConnectionRecord();
  const mappings = await listProjectQboMappings(connection.realm_id);

  const results = [];

  for (const mapping of mappings) {
    if (!mapping?.project_id || !mapping?.qbo_customer_id) continue;

    const payload = await getProfitLoss(startDate, endDate, {
      summarizeColumnBy: "Month",
      customerId: mapping.qbo_customer_id
    });
    const parsed = parseMonthlyProfitLossReport(payload);
    const persisted = await importMonthlyActuals({
      startDate,
      endDate,
      realmId: connection.realm_id,
      months: parsed.months,
      sourcePayload: payload,
      sourceScope: "PROJECT",
      projectId: mapping.project_id,
      notes: `Project monthly actuals import for project ${mapping.project_id}`
    });

    results.push({
      projectId: mapping.project_id,
      qboCustomerId: mapping.qbo_customer_id,
      batch: persisted.batch,
      months: parsed.months
    });
  }

  res.status(201).json({
    mode: "direct-qbo",
    data: results
  });
}));

app.get("/actuals/imported-monthly", asyncHandler(async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const [batches, months] = await Promise.all([
    listActualImportBatches(),
    listActualMonthly(year)
  ]);

  res.json({
    data: {
      batches,
      months
    }
  });
}));

app.get("/actuals/imported-project-monthly", asyncHandler(async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const months = await listActualMonthly(year, "PROJECT");

  res.json({
    data: {
      months
    }
  });
}));

app.get("/cash-flow", asyncHandler(async (req, res) => {
  const { startDate, endDate } = requireDateRange(req);

  if (hasDirectQboConfig()) {
    const payload = await getCashFlow(startDate, endDate);
    res.json({
      mode: "direct-qbo",
      data: payload
    });
    return;
  }

  const prompt = [
    "Use the quickbooks-mcp server to generate a cash flow statement.",
    `Date range: ${startDate} through ${endDate}.`,
    "Return a concise summary and the important inflow and outflow totals."
  ].join(" ");

  const payload = await sendQuickBooksRequest(prompt);
  res.json(extractUsefulContent(payload));
}));

app.post("/import-transactions", asyncHandler(async (req, res) => {
  const transactions = validateTransactions(req.body);
  const prompt = [
    "Use the quickbooks-mcp server to import the following transactions into QuickBooks Online.",
    "If account_name is present, use it when creating or classifying the transaction.",
    "Transactions JSON:",
    JSON.stringify(transactions, null, 2)
  ].join("\n");

  const payload = await sendQuickBooksRequest(prompt);
  res.status(201).json(extractUsefulContent(payload));
}));

app.get("/benchmark", asyncHandler(async (req, res) => {
  if (hasDirectQboConfig() && !process.env.ANTHROPIC_API_KEY) {
    const error = new Error("Benchmark requires Anthropic MCP mode or a separate benchmark data source.");
    error.status = 501;
    throw error;
  }

  const { startDate, endDate } = requireDateRange(req);
  const region = req.query.region || "the company's region";
  const prompt = [
    "Use the quickbooks-mcp server to compare the company's profit against regional industry peers.",
    `Use the period ${startDate} through ${endDate}.`,
    `Compare against peers in ${region}.`,
    "Return the company's profit, the peer benchmark, and a concise interpretation."
  ].join(" ");

  const payload = await sendQuickBooksRequest(prompt);
  res.json(extractUsefulContent(payload));
}));

app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    message: `No route exists for ${req.method} ${req.originalUrl}`
  });
});

app.use((error, _req, res, _next) => {
  const status = Number(error.status || 500);
  res.status(status).json({
    error: status >= 500 ? "Server error" : "Request error",
    message: error.message || "Unexpected error",
    details: error.details || undefined
  });
});

app.listen(port, () => {
  console.log(`QBO MCP backend listening on http://localhost:${port}`);
});
