import { qboFetchForOrg } from './qboFetchForOrg'

export type ProbeResult = {
  ok: boolean
  error?: string
  sample?: unknown[]
}

export type DiscoveryResponse = {
  probes: {
    customers: ProbeResult
    pnlByCustomers: ProbeResult
    pnlByClasses: ProbeResult
    pnlByLocations: ProbeResult
    invoices: ProbeResult
    bills: ProbeResult
  }
}

type QboRef = { value?: string | null }
type QboCustomer = {
  FullyQualifiedName?: string
  ParentRef?: QboRef
}
type QboInvoice = { Id?: string }
type QboBill = { Id?: string }
type QboColumn = { ColTitle?: string }

function normalizeEntities<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Probe failed'
}

async function runProbe(fn: () => Promise<unknown>): Promise<ProbeResult> {
  try {
    const data = await fn()
    return { ok: true, sample: [data] }
  } catch (err: unknown) {
    return { ok: false, error: getErrorMessage(err) }
  }
}

export async function discoverProjectData(
  orgId: string,
  fromDate: string,
  toDate: string
): Promise<DiscoveryResponse> {
  const customers = await runProbe(async () => {
    const data = await qboFetchForOrg(orgId, '/query', {
      query:
        'SELECT Id, DisplayName, FullyQualifiedName, Active, ParentRef FROM Customer MAXRESULTS 1000',
      minorversion: '65',
    }, { suppressErrorLog: true })
    const rows = normalizeEntities<QboCustomer>(
      (data as { QueryResponse?: { Customer?: QboCustomer[] | QboCustomer } })?.QueryResponse
        ?.Customer
    )
    const projectLike = rows.filter((c) => {
      const fqn = String(c?.FullyQualifiedName || '').toLowerCase()
      return !!c?.ParentRef?.value || fqn.includes(':')
    })
    return {
      count: rows.length,
      projectLikeCount: projectLike.length,
    }
  })

  const probePnlBy = async (columnBy: 'Customers' | 'Classes' | 'Locations') =>
    runProbe(async () => {
      const data = await qboFetchForOrg(orgId, '/reports/ProfitAndLoss', {
        start_date: fromDate,
        end_date: toDate,
        summarize_column_by: columnBy,
        minorversion: '65',
      }, { suppressErrorLog: true })
      const cols = normalizeEntities<QboColumn>(
        (data as { Columns?: { Column?: QboColumn[] | QboColumn } })?.Columns?.Column
      )
        .map((c) => String(c?.ColTitle || '').trim())
        .filter(Boolean)
      return { columns: cols }
    })

  const [pnlByCustomers, pnlByClasses, pnlByLocations] = await Promise.all([
    probePnlBy('Customers'),
    probePnlBy('Classes'),
    probePnlBy('Locations'),
  ])

  const invoices = await runProbe(async () => {
    const data = await qboFetchForOrg(orgId, '/query', {
      query: 'SELECT Id, TxnDate, DocNumber, CustomerRef, TotalAmt, Balance FROM Invoice MAXRESULTS 100',
      minorversion: '65',
    }, { suppressErrorLog: true })
    const rows = normalizeEntities<QboInvoice>(
      (data as { QueryResponse?: { Invoice?: QboInvoice[] | QboInvoice } })?.QueryResponse?.Invoice
    )
    return { count: rows.length }
  })

  const bills = await runProbe(async () => {
    const data = await qboFetchForOrg(orgId, '/query', {
      query: 'SELECT Id, TxnDate, DocNumber, VendorRef, TotalAmt, Balance FROM Bill MAXRESULTS 100',
      minorversion: '65',
    }, { suppressErrorLog: true })
    const rows = normalizeEntities<QboBill>(
      (data as { QueryResponse?: { Bill?: QboBill[] | QboBill } })?.QueryResponse?.Bill
    )
    return { count: rows.length }
  })

  return {
    probes: {
      customers,
      pnlByCustomers,
      pnlByClasses,
      pnlByLocations,
      invoices,
      bills,
    },
  }
}
