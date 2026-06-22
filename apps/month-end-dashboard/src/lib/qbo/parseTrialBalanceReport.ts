/**
 * Robust-ish QBO Trial Balance parser
 * Handles nested Sections and treats rows with ColData[0].id as account rows.
 * Computes period activity as debit/credit from QBO TB columns (ending-based view).
 */

type ParsedTbRow = {
  accountId: string
  accountName: string
  debit: number
  credit: number
  ending_tb: number
}

const toNumber = (v: any) => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  return isFinite(n) ? n : 0
}

function collectTbAccountRows(nodes: any[]): any[] {
  const out: any[] = []
  const stack = Array.isArray(nodes) ? [...nodes] : []
  while (stack.length) {
    const n = stack.shift()
    const cd = n?.ColData
    const hasAcctId = typeof cd?.[0]?.id === 'string' && cd[0].id.length > 0
    if (Array.isArray(cd) && cd.length >= 3 && hasAcctId) out.push(n)
    const kids = n?.Rows?.Row
    if (Array.isArray(kids) && kids.length) stack.push(...kids)
  }
  return out
}

function findColumnIndexes(columns: any[]) {
  const debitIdx =
    columns.findIndex((c: any) => String(c?.ColTitle || '').toLowerCase().includes('debit')) || 1
  const creditIdx =
    columns.findIndex((c: any) => String(c?.ColTitle || '').toLowerCase().includes('credit')) || 2
  return {
    debitIdx: debitIdx < 0 ? 1 : debitIdx,
    creditIdx: creditIdx < 0 ? 2 : creditIdx,
  }
}

export function parseTrialBalanceReport(report: any) {
  const rows = report?.Rows?.Row || []
  const columns = report?.Columns?.Column || []
  const { debitIdx, creditIdx } = findColumnIndexes(columns)

  const tbRows = collectTbAccountRows(rows)
  const parsed: ParsedTbRow[] = tbRows.map((r: any) => {
    const cd = r?.ColData || []
    const accountId = cd?.[0]?.id ?? ''
    const accountName = String(cd?.[0]?.value ?? '').trim()
    const debit = toNumber(cd?.[debitIdx]?.value ?? cd?.[debitIdx]?.amount ?? '')
    const credit = toNumber(cd?.[creditIdx]?.value ?? cd?.[creditIdx]?.amount ?? '')
    const ending_tb = debit - credit
    return {
      accountId,
      accountName,
      debit,
      credit,
      ending_tb,
    }
  })

  // Totals diagnostic
  const sumDeb = parsed.reduce((s, r) => s + r.debit, 0)
  const sumCred = parsed.reduce((s, r) => s + r.credit, 0)
  console.log('[TB][PARSE_TOTALS]', {
    rows: parsed.length,
    debits: Math.round(sumDeb * 100) / 100,
    credits: Math.round(sumCred * 100) / 100,
    diff: Math.round((sumDeb - sumCred) * 100) / 100,
  })

  return {
    rows: parsed,
    meta: {
      columns: columns.map((c: any) => ({
        title: c?.ColTitle ?? '',
        type: c?.ColType ?? '',
      })),
    },
  }
}
