import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { getTrialBalanceReport } from '@/lib/qbo/reports'
import { qboFetchForOrg } from '@/lib/qbo/qboFetchForOrg'
import { bsPathForAccount } from '@/lib/reports/bsPathBuilder'

/**
 * GET /api/qbo/reports/balance-sheet-rollforward
 * 
 * Returns Balance Sheet with Start / Activity / End columns
 * 
 * Query params:
 * - orgId: Organization ID
 * - to: End date (YYYY-MM-DD) - defaults to period end
 * 
 * Returns:
 * - Start: BS as of priorMonthEnd
 * - Activity: End - Start (change during period)
 * - End: BS as of to
 */
export async function GET(request: NextRequest) {
  console.log("[BS API] HANDLER HIT", __filename);
  const startTime = Date.now()
  
  try {
    await ensureUserApi()

    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    console.log("[BS API] ENTER", { orgId, from, to, ts: new Date().toISOString() })

    if (!orgId || !from || !to) {
      console.log("[BS API] ERROR: Missing parameters", { orgId: !!orgId, from: !!from, to: !!to })
      return NextResponse.json(
        { error: 'Missing required query params: orgId, from, to', orgId, from, to },
        { status: 400 }
      )
    }

    console.log("[BS API] params", { orgId, from, to });

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      console.log("[BS API] ERROR: Invalid date format", { from, to })
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD for both from and to' },
        { status: 400 }
      )
    }

    // Verify org access
    console.log("[BS API] before ensureOrgAccessApi")
    await ensureOrgAccessApi(orgId)
    console.log("[BS API] after ensureOrgAccessApi")

    // Start is as-of FROM date (no 1-day shift)
    const startDate = from;   // Start is as-of FROM date
    const asOfStart = from;
    const asOfEnd = to;

    console.log("[BS API] dates", { from, to, startDate, asOfStart, asOfEnd })

    // Fetch two live QBO Trial Balance reports
    console.log("[BS API] fetching start TB", { startDate })
    const startTbData = await getTrialBalanceReport(orgId, startDate, startDate)
    console.log("[BS API] startTb has rows?", !!startTbData?.Rows?.Row);
    console.log("[BS API] fetching end TB", { to })
    const endTbData = await getTrialBalanceReport(orgId, to, to)
    console.log("[BS API] endTb has rows?", !!endTbData?.Rows?.Row);
    console.log("[BS API] TBs fetched", { hasStart: !!startTbData, hasEnd: !!endTbData })

    // Fetch QBO accounts list to get account type/subtype
    console.log("[BS API] fetching accounts list")
    const accountsData = await qboFetchForOrg(orgId, '/query', {
      query: 'SELECT Id, Name, AccountType, AccountSubType, FullyQualifiedName FROM Account MAXRESULTS 1000',
      minorversion: '65',
    })
    
    // Build account map: accountId -> { accountType, accountSubType, accountName }
    const accountMap = new Map<string, { accountType: string; accountSubType?: string; accountName: string }>()
    if (accountsData?.QueryResponse?.Account) {
      const accounts = Array.isArray(accountsData.QueryResponse.Account)
        ? accountsData.QueryResponse.Account
        : [accountsData.QueryResponse.Account]
      
      for (const acct of accounts) {
        const accountId = acct.Id
        if (accountId) {
          accountMap.set(accountId, {
            accountType: acct.AccountType || '',
            accountSubType: acct.AccountSubType,
            accountName: acct.Name || acct.FullyQualifiedName || '',
          })
        }
      }
    }
    console.log("[BS API] accounts map", { count: accountMap.size })

    const typeCounts = Array.from(accountMap.values()).reduce((acc: any, v: any) => {
      const t = String(v.accountType || "UNKNOWN");
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});
    console.log("[BS API] AccountType counts", typeCounts);

    const sampleByType = (type: string, n = 3) =>
      Array.from(accountMap.entries())
        .filter(([, v]) => String(v.accountType || "") === type)
        .slice(0, n)
        .map(([id, v]) => ({ id, type: v.accountType, sub: v.accountSubType, name: v.accountName }));

    for (const t of Object.keys(typeCounts)) {
      console.log(`[BS API] sample type=${t}`, sampleByType(t, 3));
    }

    const equityAccounts = Array.from(accountMap.entries())
      .filter(([, v]) => String(v.accountType) === "Equity")
      .map(([id, v]) => ({ id, name: v.accountName, sub: v.accountSubType }));

    console.log("[BS API] COA Equity accounts", equityAccounts);

    // Helper to parse QBO amount string
    const parseAmount = (str: string): number => {
      if (!str || str.trim() === '' || str === '—') return 0
      const cleaned = str.replace(/,/g, '').replace(/[()$]/g, '').trim()
      const isNegative = /^\(.*\)$/.test(str.trim())
      const num = Number(cleaned) || 0
      return isNegative ? -num : num
    }

    type TbRowBalance = { account_id: string; account_name: string; balance: number };

    function getColumnIndex(tbData: any, wanted: string[]): number | null {
      const cols = tbData?.Columns?.Column;
      const arr = Array.isArray(cols) ? cols : cols ? [cols] : [];
      const titles = arr.map((c: any) => String(c?.ColTitle ?? "").trim().toLowerCase());

      for (const w of wanted) {
        const idx = titles.findIndex((t: string) => t === w.toLowerCase());
        if (idx >= 0) return idx;
      }
      return null;
    }

    const parseTbRows = (tbData: any): Map<string, TbRowBalance> => {
      const balanceMap = new Map<string, TbRowBalance>();

      // Determine indices from QBO report headers (robust across layouts)
      const idxAccount = 0; // account name/id is virtually always the first column
      const idxDebit = getColumnIndex(tbData, ["debit"]);
      const idxCredit = getColumnIndex(tbData, ["credit"]);
      const idxBalance = getColumnIndex(tbData, ["balance"]);

      console.log("[BS API] TB column indexes", { idxDebit, idxCredit, idxBalance });

      const extractRows = (rows: any[]): void => {
        if (!Array.isArray(rows)) return;

        for (const row of rows) {
          const col = Array.isArray(row?.ColData) ? row.ColData : [];
          const accountId = col?.[idxAccount]?.id;
          const accountName = String(col?.[idxAccount]?.value ?? "").trim();

          if (accountId) {
            let bal = 0;

            // Prefer Balance column if it exists
            if (idxBalance != null && col?.[idxBalance]?.value != null && String(col[idxBalance].value).trim() !== "") {
              bal = parseAmount(String(col[idxBalance].value));
            } else {
              // Otherwise compute from debit/credit if available
              const debit =
                idxDebit != null && col?.[idxDebit]?.value != null ? parseAmount(String(col[idxDebit].value)) : 0;
              const credit =
                idxCredit != null && col?.[idxCredit]?.value != null ? parseAmount(String(col[idxCredit].value)) : 0;
              bal = debit - credit;
            }

            // Ensure finite number
            if (!Number.isFinite(bal)) bal = 0;

            balanceMap.set(accountId, {
              account_id: accountId,
              account_name: accountName || accountId,
              balance: bal,
            });
          }

          const nested = row?.Rows?.Row;
          if (nested) extractRows(Array.isArray(nested) ? nested : [nested]);
        }
      };

      const top = tbData?.Rows?.Row;
      if (top) extractRows(Array.isArray(top) ? top : [top]);

      return balanceMap;
    };

    console.log("[BS API] parsing TB rows")
    const startBalances = parseTbRows(startTbData)
    const endBalances = parseTbRows(endTbData)
    console.log("[BS API] TB rows parsed", {
      startCount: startBalances.size,
      endCount: endBalances.size,
    })

    // Build rows by iterating COA-driven BS accounts (not TB-driven)
    const bsAccountIds = Array.from(accountMap.entries())
      .filter(([, v]) => {
        const t = String(v.accountType || "").trim();
        return (
          t === "Bank" ||
          t === "Accounts Receivable" ||
          t === "Other Current Asset" ||
          t === "Fixed Asset" ||
          t === "Accounts Payable" ||
          t === "Credit Card" ||
          t === "Other Current Liability" ||
          t === "Long Term Liability" ||
          t === "Equity"
        );
      })
      .map(([id]) => id);

    console.log("[BS API] bsAccountIds (COA-driven)", { count: bsAccountIds.length });

    const bsRows: Array<{
      account_id: string
      account_name: string
      account_type: string
      account_subtype?: string
      Start: number
      Activity: number
      End: number
    }> = []

    let missingMeta = 0;
    let skippedNonBs = 0;
    let pushed = 0;

    for (const accountId of bsAccountIds.sort()) {
            const startData = startBalances.get(accountId)
            const endData = endBalances.get(accountId)
            const accountMeta = accountMap.get(accountId)

            if (!accountMeta) {
              missingMeta++;
              continue;
            }

            const accountType = accountMeta.accountType || ''
            const accountSubType = accountMeta.accountSubType
            const accountName = accountMeta.accountName || startData?.account_name || endData?.account_name || accountId

            // Map QBO AccountType to BS section using exact sets
            const rawType = String(accountMeta.accountType || "").trim();

            const BS_ASSET_TYPES = new Set([
              "Bank",
              "Accounts Receivable",
              "Other Current Asset",
              "Fixed Asset",
            ]);

            const BS_LIAB_TYPES = new Set([
              "Accounts Payable",
              "Credit Card",
              "Other Current Liability",
              "Long Term Liability",
            ]);

            const BS_EQUITY_TYPES = new Set([
              "Equity",
            ]);

            let baseType: "ASSET" | "LIABILITY" | "EQUITY" | "UNCLASSIFIED" = "UNCLASSIFIED";

            if (BS_ASSET_TYPES.has(rawType)) baseType = "ASSET";
            else if (BS_LIAB_TYPES.has(rawType)) baseType = "LIABILITY";
            else if (BS_EQUITY_TYPES.has(rawType)) baseType = "EQUITY";

            // Build rows ONLY for BS accounts (stop including UNCLASSIFIED in the BS API)
            if (baseType === "UNCLASSIFIED") {
              skippedNonBs++;
              continue;
            }

            // When a BS account is not present in TB, treat its balance as 0 (do NOT skip)
            let Start = Number(startData?.balance ?? 0);
            let End = Number(endData?.balance ?? 0);

            // Normalize to statement presentation: Assets positive; Liabilities positive; Equity positive.
            if (baseType === "LIABILITY" || baseType === "EQUITY") {
              Start = -Start;
              End = -End;
            }
            const Activity = End - Start;

            bsRows.push({
              account_id: accountId,
              account_name: accountName,
              account_type: baseType,
              account_subtype: accountSubType,
              Start,
              Activity,
              End,
            })
            pushed++;
          }

    // Define allAccountIds from COA (full list of account IDs from chart of accounts)
    const allAccountIds = Array.from(accountMap.keys());

    console.log("[BS API] drop stats", {
      allAccountIds: allAccountIds.length,
      bsAccountIds: bsAccountIds.length,
      missingMeta,
      skippedNonBs,
      pushed,
    });

    console.log("[BS API] bs rows built", {
      count: bsRows.length,
      typeCounts: bsRows.reduce((acc, r) => {
        const k = String(r.account_type);
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    });

      // Build Balance Sheet rows with GAAP paths (only ASSET/LIABILITY/EQUITY)
      console.log("[BS API] before build GAAP paths")
      const rows = bsRows.map((r) => {
        const accountMeta = accountMap.get(r.account_id)
        const path = bsPathForAccount({
          account_name: r.account_name,
          account_type: r.account_type,
          account_subtype: accountMeta?.accountSubType,
        });

        return {
          account_id: r.account_id,
          account_name: path,
          values: {
            Start: Number.isFinite(r.Start) ? r.Start : 0,
            Activity: Number.isFinite(r.Activity) ? r.Activity : 0,
            End: Number.isFinite(r.End) ? r.End : 0,
          },
        };
      })
      console.log("[BS API] after build GAAP paths", { rowsCount: rows.length })

      // Count rows by prefix (ASSETS/LIABILITIES/EQUITY/OTHER)
      const prefixCounts = rows.reduce((acc: any, r: any) => {
        const n = String(r?.account_name || "");
        const p =
          n.startsWith("ASSETS") ? "ASSETS" :
          n.startsWith("LIABILITIES") ? "LIABILITIES" :
          n.startsWith("EQUITY") ? "EQUITY" :
          "OTHER";
        acc[p] = (acc[p] || 0) + 1;
        return acc;
      }, {});

      console.log("[BS API] prefixCounts", prefixCounts);

      // also log a few sample rows
      console.log("[BS API] sample rows", rows.slice(0, 5));

      // Raw-sign control total check (Assets + Liabilities + Equity should be ~0)
      const sumEndByPrefix = (prefix: string) =>
        rows
          .filter(r => String(r.account_name || "").startsWith(prefix))
          .reduce((a, r) => a + Number(r?.values?.End ?? 0), 0);

      // Final BS balance check with diagnostic output
      const assets = rows.filter((r) => String(r.account_name || "").startsWith("ASSETS"));
      const liabs  = rows.filter((r) => String(r.account_name || "").startsWith("LIABILITIES"));
      const equity = rows.filter((r) => String(r.account_name || "").startsWith("EQUITY"));

      const sumEnd = (arr: any[]) => arr.reduce((a, r) => a + Number(r?.values?.End ?? 0), 0);

      const assetsEnd = sumEnd(assets);
      const liabEnd   = sumEnd(liabs);
      const eqEnd     = sumEnd(equity);

      const diff = assetsEnd - (liabEnd + eqEnd);

      // Helpful ranked lists (largest balances)
      const top = (arr: any[], n = 10) =>
        arr
          .map((r) => ({ name: r.account_name, end: Number(r?.values?.End ?? 0) }))
          .sort((a, b) => Math.abs(b.end) - Math.abs(a.end))
          .slice(0, n);

      console.log("[BS API] TOP ASSETS (End)", top(assets, 10));
      console.log("[BS API] TOP LIABILITIES (End)", top(liabs, 10));
      console.log("[BS API] TOP EQUITY (End)", top(equity, 10));

      // Also print the smallest/near-zero assets in case classification is wrong
      const tiny = assets
        .map((r) => ({ name: r.account_name, end: Number(r?.values?.End ?? 0) }))
        .sort((a, b) => Math.abs(a.end) - Math.abs(b.end))
        .slice(0, 10);
      console.log("[BS API] TINY ASSETS (End)", tiny);

      console.log("[BS API] totals", { assetsEnd, liabEnd, eqEnd, diff });

      // Temporary diagnostic: compute totals by section from same end numbers
      const assetsEndTotal = assetsEnd;
      const liabEndTotal = liabEnd;
      const equityEndTotal = eqEnd;
      const diagnosticDiff = assetsEndTotal - (liabEndTotal + equityEndTotal);
      console.log("[BS API] diagnostic totals", { assetsEndTotal, liabEndTotal, equityEndTotal, diagnosticDiff });

      // Equity reconciliation table: COA vs TB data
      const equityAccountsFromCOA = Array.from(accountMap.entries())
        .filter(([, v]) => String(v.accountType) === "Equity")
        .map(([id, v]) => ({ accountId: id, name: v.accountName, type: v.accountType, subType: v.accountSubType }));

      console.log("[BS API] Equity accounts in COA", { count: equityAccountsFromCOA.length, accounts: equityAccountsFromCOA });

      const equityReconciliation = equityAccountsFromCOA.map((coaAcct) => {
        const startData = startBalances.get(coaAcct.accountId);
        const endData = endBalances.get(coaAcct.accountId);
        const tbStart = Number(startData?.balance ?? 0);
        const tbEnd = Number(endData?.balance ?? 0);
        const tbActivity = tbEnd - tbStart;

        // Check if this account is in bsRows and what its classification is
        const bsRow = bsRows.find(r => r.account_id === coaAcct.accountId);
        const bsClass = bsRow ? bsRow.account_type : "NOT_IN_BS_ROWS";

        return {
          accountId: coaAcct.accountId,
          name: coaAcct.name,
          bsClass,
          tbStart,
          tbActivity,
          tbEnd,
          hasTbData: !!startData || !!endData,
        };
      });

      console.log("[BS API] Equity reconciliation table", equityReconciliation);

      const equityWithTbData = equityReconciliation.filter(r => r.hasTbData).length;
      console.log("[BS API] Equity accounts: COA count vs TB rows", {
        coaCount: equityAccountsFromCOA.length,
        tbRowsCount: equityWithTbData,
        missingTbData: equityAccountsFromCOA.length - equityWithTbData,
      });

      if (Math.abs(diff) > 0.01) {
        throw new Error(
          `BS NOT BALANCED: AssetsEnd=${assetsEnd.toFixed(2)} Liab+EqEnd=${(liabEnd + eqEnd).toFixed(2)} Diff=${diff.toFixed(2)}`
        );
      }

      // Strict "TB ties to BS" check (End date) using same exact sets and normalization
      const BS_ASSET_TYPES = new Set([
        "Bank",
        "Accounts Receivable",
        "Other Current Asset",
        "Fixed Asset",
      ]);

      const BS_LIAB_TYPES = new Set([
        "Accounts Payable",
        "Credit Card",
        "Other Current Liability",
        "Long Term Liability",
      ]);

      const BS_EQUITY_TYPES = new Set([
        "Equity",
      ]);

      let tbAssetsEnd = 0;
      let tbLiabEnd = 0;
      let tbEqEnd = 0;

      for (const [accountId, tbRow] of endBalances.entries()) {
        const meta = accountMap.get(accountId);
        if (!meta) continue;

        const t = String(meta.accountType || "").trim();

        let bal = Number(tbRow.balance ?? 0);

        if (BS_ASSET_TYPES.has(t)) {
          tbAssetsEnd += bal;
        } else if (BS_LIAB_TYPES.has(t)) {
          tbLiabEnd += (-bal); // normalize liabilities to positive
        } else if (BS_EQUITY_TYPES.has(t)) {
          tbEqEnd += (-bal);   // normalize equity to positive
        }
      }

      const tbDiff = tbAssetsEnd - (tbLiabEnd + tbEqEnd);

      console.log("[BS API] TB tie-out", { tbAssetsEnd, tbLiabEnd, tbEqEnd, tbDiff });

      if (Math.abs(tbDiff) > 0.01) {
        throw new Error(
          `TB NOT BALANCED (BS account types): Assets=${tbAssetsEnd.toFixed(2)} Liab+Eq=${(tbLiabEnd + tbEqEnd).toFixed(2)} Diff=${tbDiff.toFixed(2)}`
        );
      }

      // Tie-out: TB totals vs BS totals (End)
      const tieAssets = assetsEnd - tbAssetsEnd;
      const tieLiab = liabEnd - tbLiabEnd;
      const tieEq = eqEnd - tbEqEnd;

      if (Math.abs(tieAssets) > 0.01 || Math.abs(tieLiab) > 0.01 || Math.abs(tieEq) > 0.01) {
        throw new Error(
          `TB→BS TIE OUT FAILED: ` +
          `AssetsDiff=${tieAssets.toFixed(2)} ` +
          `LiabDiff=${tieLiab.toFixed(2)} ` +
          `EqDiff=${tieEq.toFixed(2)}`
        );
      }

    const elapsed = Date.now() - startTime
    console.log("[BS API] RETURN", { rows: rows.length, elapsedMs: elapsed })

    const columns = ['Start', 'Activity', 'End'];
    
    // Force rows to always be an array
    const result = {
      columns,
      asOfStart,
      asOfEnd,
      rows,
    };
    const safeRows = Array.isArray(result?.rows) ? result.rows : [];

    console.log("[BS] returning", {
      asOfStart: result?.asOfStart,
      asOfEnd: result?.asOfEnd,
      rowsLen: safeRows.length,
      keys: result ? Object.keys(result) : null
    });

    // Return clean SeriesResponse - always include rows
    return NextResponse.json({
      ok: true,
      columns: result?.columns ?? ['Start', 'Activity', 'End'],
      asOfStart: result?.asOfStart,
      asOfEnd: result?.asOfEnd,
      rowsCount: safeRows.length,
      rows: safeRows,
      debugTotals: {
        bs: { assetsEnd, liabEnd, eqEnd, diff: bsDiff },
        tb: { assetsEnd: tbAssetsEnd, liabEnd: tbLiabEnd, eqEnd: tbEqEnd, diff: tbBsDiff }
      }
    })
  } catch (err: any) {
    const elapsed = Date.now() - startTime
    console.error("[BS API] ERROR", {
      message: err.message,
      stack: err.stack,
      elapsedMs: elapsed,
    })
    
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(
      { error: err.message || "Failed to fetch balance sheet rollforward", message: err.message || String(err) },
      { status: 500 }
    )
  }
}

