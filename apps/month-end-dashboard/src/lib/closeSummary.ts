export type CloseSeverity = 'critical' | 'medium' | 'low'

export type CloseSnapshot = {
  periodStart: string | null
  periodEnd: string | null
  totalAccounts: number
  exceptionsTotal: number
  openCount: number
  closedCount: number
  exceptionsBySeverity: { critical: number; medium: number; low: number }
  dollarTotalActivity: number
  dollarExceptionActivity: number
  topExceptions: Array<{ account: string; rule: string; amount: number; severity: CloseSeverity }>
  topRules: Array<{ rule: string; count: number; severity: CloseSeverity }>
}

type SummaryResult = {
  text: string
  reasons: string[]
  highlights: { label: string; value: string }[]
}

const fmtNumber = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
const fmtCurrency = (n: number) =>
  (n || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function limitChars(text: string, max = 420) {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}

export function buildCloseSummary(snapshot: CloseSnapshot): SummaryResult {
  const reasons: string[] = []
  const highlights: { label: string; value: string }[] = []

  const {
    periodStart,
    periodEnd,
    totalAccounts,
    exceptionsTotal,
    openCount,
    closedCount,
    exceptionsBySeverity,
    dollarTotalActivity,
    dollarExceptionActivity,
    topExceptions,
    topRules,
  } = snapshot

  highlights.push({ label: 'Open', value: fmtNumber(openCount) })
  highlights.push({ label: 'Closed', value: fmtNumber(closedCount) })
  highlights.push({ label: 'Impact', value: fmtCurrency(Math.abs(dollarExceptionActivity)) })

  const totalActivitySafe = dollarTotalActivity || 0
  const activityShare =
    totalActivitySafe > 0 ? Math.min(1, Math.abs(dollarExceptionActivity) / totalActivitySafe) : 0

  const datePhrase =
    periodStart && periodEnd ? `for ${periodStart} → ${periodEnd}` : 'for this period'

  const sentence1Parts: string[] = []
  sentence1Parts.push(`${fmtNumber(closedCount)} closed, ${fmtNumber(openCount)} open`)
  if (exceptionsTotal > 0) sentence1Parts.push(`${fmtNumber(exceptionsTotal)} total`)
  const impactPart =
    totalActivitySafe > 0
      ? `${fmtCurrency(Math.abs(dollarExceptionActivity))} of ${fmtCurrency(totalActivitySafe)} activity (${Math.round(activityShare * 100)}%)`
      : fmtCurrency(Math.abs(dollarExceptionActivity))
  sentence1Parts.push(`exception impact ${impactPart}`)
  const sentence1 = `Close summary ${datePhrase}: ${sentence1Parts.join('; ')}.`

  reasons.push(`Open vs closed: ${openCount} / ${closedCount}`)
  reasons.push(`Exception impact share: ${Math.round(activityShare * 100)}%`)

  const drivers: string[] = []
  const sortedTopEx = [...topExceptions].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 2)
  for (const ex of sortedTopEx) {
    drivers.push(`${ex.account} (${ex.rule}) ${fmtCurrency(Math.abs(ex.amount))}`)
  }
  if (drivers.length) reasons.push(`Top exceptions: ${drivers.join(', ')}`)

  if (topRules.length && topRules[0].count >= 10) {
    drivers.push(`Rule "${topRules[0].rule}" flagged ${fmtNumber(topRules[0].count)}`)
    reasons.push(`Rule driver: ${topRules[0].rule} x${fmtNumber(topRules[0].count)}`)
  }

  const sentence2 = drivers.length ? `Key drivers: ${drivers.join('; ')}.` : ''

  let sentence3 = ''
  if (exceptionsBySeverity.critical > 0) {
    sentence3 = 'Action: prioritize critical items first, then assign remaining by owner.'
    reasons.push(`Critical exceptions: ${exceptionsBySeverity.critical}`)
  } else if (openCount > 0) {
    sentence3 = 'Action: assign remaining exceptions to owners and require notes on status change.'
    reasons.push(`Open exceptions: ${openCount}`)
  }

  const sentences = [sentence1, sentence2, sentence3].filter(Boolean)
  let text = sentences.join(' ')

  if (text.length > 420 && sentence3) {
    text = [sentence1, sentence2].filter(Boolean).join(' ')
  }
  if (text.length > 420) {
    text = limitChars(text, 420)
  }

  return { text, reasons, highlights }
}
