import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCloseSummary, CloseSnapshot } from './closeSummary'

const baseSnapshot: CloseSnapshot = {
  periodStart: '2025-01-01',
  periodEnd: '2025-01-31',
  totalAccounts: 20,
  exceptionsTotal: 10,
  openCount: 8,
  closedCount: 2,
  exceptionsBySeverity: { critical: 0, medium: 5, low: 5 },
  dollarTotalActivity: 100000,
  dollarExceptionActivity: 20000,
  topExceptions: [],
  topRules: [],
}

test('Case A: critical exists + 0 closed => mentions critical and prioritize', () => {
  const snap: CloseSnapshot = {
    ...baseSnapshot,
    closedCount: 0,
    openCount: 5,
    exceptionsBySeverity: { critical: 2, medium: 2, low: 1 },
    topExceptions: [
      { account: 'Cash', rule: 'Variance', amount: 5000, severity: 'critical' },
    ],
  }
  const result = buildCloseSummary(snap)
  assert.match(result.text.toLowerCase(), /critical/)
  assert.match(result.text.toLowerCase(), /prioritize/)
})

test('Case B: no critical but many MoM flags => mentions rule driver', () => {
  const snap: CloseSnapshot = {
    ...baseSnapshot,
    exceptionsBySeverity: { critical: 0, medium: 6, low: 4 },
    topRules: [{ rule: 'MoM Threshold', count: 12, severity: 'medium' }],
  }
  const result = buildCloseSummary(snap)
  assert.match(result.text, /MoM Threshold/)
  assert(result.reasons.some((r) => r.includes('MoM Threshold')))
})

test('Case C: closedCount > 0 => mentions progress', () => {
  const snap: CloseSnapshot = {
    ...baseSnapshot,
    closedCount: 3,
    openCount: 7,
  }
  const result = buildCloseSummary(snap)
  assert.match(result.text, /3 closed/i)
})
