/**
 * QBO Report fetching functions
 * Ported from old app — now with server-side caching
 */

import { qboFetchForOrg } from './qboFetchForOrg'
import { withCache, cacheKey, QBO_RAW_TTL } from './qboCache'

export async function getProfitAndLossReport(orgId: string, from: string, to: string) {
  const key = cacheKey('pnl', orgId, from, to)
  const { data, cached, latencyMs } = await withCache(
    key,
    () => qboFetchForOrg(orgId, '/reports/ProfitAndLoss', {
      start_date: from,
      end_date: to,
      minorversion: '65',
    }),
    QBO_RAW_TTL
  )
  console.log(`[QBO:PERF] P&L cache=${cached ? 'HIT' : 'MISS'} latency=${latencyMs}ms`)
  return data
}

export async function getTrialBalanceReport(orgId: string, from: string, to: string) {
  const key = cacheKey('tb', orgId, from, to)
  const { data, cached, latencyMs } = await withCache(
    key,
    () => qboFetchForOrg(orgId, '/reports/TrialBalance', {
      start_date: from,
      end_date: to,
      minorversion: '65',
    }),
    QBO_RAW_TTL
  )
  console.log(`[QBO:PERF] TB cache=${cached ? 'HIT' : 'MISS'} latency=${latencyMs}ms`)
  return data
}

export async function getBalanceSheetReport(orgId: string, asOfDate: string) {
  const key = cacheKey('bs', orgId, asOfDate)
  const { data, cached, latencyMs } = await withCache(
    key,
    () => qboFetchForOrg(orgId, '/reports/BalanceSheet', {
      as_of_date: asOfDate,
      minorversion: '65',
    }),
    QBO_RAW_TTL
  )
  console.log(`[QBO:PERF] BS cache=${cached ? 'HIT' : 'MISS'} latency=${latencyMs}ms`)
  return data
}

export async function getCashFlowReport(orgId: string, from: string, to: string) {
  const key = cacheKey('cf', orgId, from, to)
  const { data, cached, latencyMs } = await withCache(
    key,
    () => qboFetchForOrg(orgId, '/reports/CashFlow', {
      start_date: from,
      end_date: to,
      minorversion: '65',
    }),
    QBO_RAW_TTL
  )
  console.log(`[QBO:PERF] CF cache=${cached ? 'HIT' : 'MISS'} latency=${latencyMs}ms`)
  return data
}

