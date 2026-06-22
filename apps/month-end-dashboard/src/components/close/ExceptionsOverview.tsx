"use client"

import { useMemo } from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, ChartTooltip, ChartLegend)

type Exception = {
  id: string
  severity?: string
  balance?: number | null
  account_name?: string | null
  rule?: { severity?: string | null } | null
}

type TbLine = {
  account_name?: string | null
  debit?: number | null
  credit?: number | null
}

const SEVERITY_COLORS: Record<string, string> = {
  none: 'rgba(134, 239, 172, 0.4)',      // Light green, very transparent
  low: 'rgba(254, 249, 195, 0.5)',       // Very pale yellow
  medium: 'rgba(253, 224, 71, 0.45)',    // Medium yellow
  high: 'rgba(250, 204, 21, 0.55)',      // Bright vivid yellow
  critical: 'rgba(239, 68, 68, 0.5)',    // Red, semi-transparent
}
const toOpaque = (color?: string) => (color ? color.replace(/0\.\d+/, '1') : '#cbd5e1')

const normalize = (name: string) => name.trim().toUpperCase().replace(/\s+/g, ' ')
const SEV_ORDER = ['none', 'low', 'medium', 'high', 'critical'] as const

function LegendList({ data }: { data: { name: string; sev: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-sm text-slate-700">
      {data.map((d) => (
        <div key={d.sev} className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: SEVERITY_COLORS[d.sev] || 'rgba(203,213,225,0.45)' }}
          />
          <span>{d.name}</span>
        </div>
      ))}
    </div>
  )
}

function useSeverityAgg(exceptions: Exception[], tbLines: TbLine[]) {
  const safeTb = Array.isArray(tbLines) ? tbLines : []
  const exceptionsByAccount = new Map<string, Exception[]>()
  for (const ex of exceptions) {
    const key = ex.account_name ? normalize(ex.account_name) : null
    if (!key) continue
    const list = exceptionsByAccount.get(key) || []
    list.push(ex)
    exceptionsByAccount.set(key, list)
  }

  // Aggregate by exception severity (counts/dollars based on exceptions)
  const excAgg: Record<string, { count: number; dollars: number; pos: number; neg: number }> = {}
  for (const ex of exceptions) {
    const sev = (ex.rule?.severity || ex.severity || 'none').toLowerCase()
    if (!excAgg[sev]) excAgg[sev] = { count: 0, dollars: 0, pos: 0, neg: 0 }
    excAgg[sev].count += 1
    const bal = Number(ex.balance ?? 0)
    const abs = Math.abs(bal)
    excAgg[sev].dollars += abs
    if (bal > 0) excAgg[sev].pos += bal
    if (bal < 0) excAgg[sev].neg += Math.abs(bal)
  }

  // Accounts with no exceptions (none slice)
  const accountsWithEx = new Set<string>()
  for (const key of exceptionsByAccount.keys()) accountsWithEx.add(key)
  let noneCount = 0
  let noneDollars = 0
  for (const line of safeTb) {
    const key = line.account_name ? normalize(line.account_name) : null
    const actSigned = (line.debit ?? 0) - (line.credit ?? 0)
    const abs = Math.abs(actSigned)
    if (!key || accountsWithEx.has(key)) continue
    noneCount += 1
    noneDollars += abs
  }

  const agg: Record<string, { count: number; dollars: number; pos: number; neg: number }> = {}
  for (const sev of SEV_ORDER) {
    const base = excAgg[sev] || { count: 0, dollars: 0, pos: 0, neg: 0 }
    agg[sev] = { ...base }
  }
  agg['none'].count += noneCount
  agg['none'].dollars += noneDollars

  return {
    agg,
    totalAccounts: safeTb.length,
    totalExceptions: exceptions.length,
  }
}

export function ExceptionsCountCard({
  exceptions,
  tbLines,
}: {
  exceptions: Exception[]
  tbLines: TbLine[]
}) {
  const { agg, totalAccounts, totalExceptions } = useSeverityAgg(exceptions, tbLines)

  const severityData = useMemo(
    () =>
      Object.entries(agg).map(([sev, v]) => ({
        name: sev.charAt(0).toUpperCase() + sev.slice(1),
        sev,
        value: v.count,
        dollars: v.dollars,
        pos: v.pos,
        neg: v.neg,
      })),
    [agg]
  )

  if (!tbLines.length) {
    return (
      <div className="group relative rounded-3xl border border-white/40 bg-gradient-to-br from-white/70 via-emerald-50/40 to-teal-50/40 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] backdrop-blur-md h-[520px] flex items-center justify-center text-slate-500">
        No TB loaded yet.
      </div>
    )
  }

  const SeverityTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const p = payload[0]?.payload
    if (!p) return null
    return (
      <div className="rounded-md bg-white px-3 py-2 text-sm shadow">
        <div className="font-semibold text-slate-900">{p.name}</div>
        <div className="text-slate-700">Count: {p.value}</div>
      </div>
    )
  }

  return (
    <div className="group relative rounded-3xl border border-white/40 bg-gradient-to-br from-white/70 via-emerald-50/40 to-teal-50/40 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] backdrop-blur-md h-[520px] flex flex-col">
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-500/0 to-teal-500/0 group-hover:from-emerald-500/10 group-hover:to-teal-500/10 transition-all duration-300 pointer-events-none" />
      <div className="shrink-0 relative z-10">
        <div className="text-base font-bold text-slate-900">Exceptions by Severity</div>
        <div className="text-xs text-slate-500">Total Accounts: {totalAccounts}</div>
      </div>
      <div className="flex-1 flex items-center justify-center relative z-10">
        <div className="w-full h-[360px] relative">
          <Doughnut
            data={{
              labels: severityData.map((d) => d.name),
              datasets: [
                {
                  label: 'Accounts',
                  data: severityData.map((d) => d.value),
                  backgroundColor: severityData.map(
                    (d) => SEVERITY_COLORS[d.sev] || 'rgba(203,213,225,0.45)'
                  ),
                  borderColor: severityData.map((d) => toOpaque(SEVERITY_COLORS[d.sev])),
                  borderWidth: 1.5,
                  cutout: '55%',
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  titleColor: '#0f172a',
                  bodyColor: '#1e293b',
                  borderColor: '#e2e8f0',
                  borderWidth: 1,
                  cornerRadius: 8,
                  padding: 10,
                  yAlign: 'top' as const,
                  titleFont: { weight: 'bold' as const },
                  callbacks: {
                    label: (ctx) => {
                      const val = Number(ctx.raw || 0)
                      const total = (ctx.dataset.data as number[]).reduce((a, b) => a + Number(b), 0)
                      const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0'
                      return `${ctx.label}: ${val} accounts (${pct}%)`
                    },
                  },
                },
              },
            }}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-lg font-semibold text-slate-900">
              Accounts: {totalAccounts}
            </div>
            <div className="text-xs text-slate-600">Exceptions: {totalExceptions}</div>
          </div>
        </div>
      </div>
      <div className="shrink-0 pt-4 relative z-10">
        <LegendList data={severityData} />
      </div>
    </div>
  )
}

export function ExceptionsDollarCard({
  exceptions,
  tbLines,
}: {
  exceptions: Exception[]
  tbLines: TbLine[]
}) {
  const { agg } = useSeverityAgg(exceptions, tbLines)

  const dollarData = useMemo(
    () =>
      Object.entries(agg).map(([sev, v]) => ({
        name: sev.charAt(0).toUpperCase() + sev.slice(1),
        sev,
        value: v.dollars,
        pos: v.pos,
        neg: v.neg,
        net: v.pos - v.neg,
      })),
    [agg]
  )

  const totalActivity = dollarData.reduce((s, d) => s + (d.value || 0), 0)
  const exceptionActivity = dollarData
    .filter((d) => d.sev !== 'none')
    .reduce((s, d) => s + (d.value || 0), 0)

  if (!tbLines.length) {
    return (
      <div className="group relative rounded-3xl border border-white/40 bg-gradient-to-br from-white/70 via-amber-50/40 to-orange-50/40 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] backdrop-blur-md h-[520px] flex items-center justify-center text-slate-500">
        No TB loaded yet.
      </div>
    )
  }

  const DollarTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const p = payload[0]?.payload
    if (!p) return null
    return (
      <div className="rounded-md bg-white px-3 py-2 text-sm shadow">
        <div className="font-semibold text-slate-900">{p.name}</div>
        <div className="text-slate-700">
          Total: ${p.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
        <div className="text-green-600">
          +${p.pos.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
        <div className="text-red-600">
          -${p.neg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
        <div className="text-slate-600">
          Net: ${p.net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
    )
  }

  return (
    <div className="group relative rounded-3xl border border-white/40 bg-gradient-to-br from-white/70 via-amber-50/40 to-orange-50/40 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] backdrop-blur-md h-[520px] flex flex-col">
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-amber-500/0 to-orange-500/0 group-hover:from-amber-500/10 group-hover:to-orange-500/10 transition-all duration-300 pointer-events-none" />
      <div className="shrink-0 relative z-10">
        <div className="text-base font-bold text-slate-900">Dollar Impact by Severity</div>
        <div className="text-xs text-slate-500">
          Total Activity: ${totalActivity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center relative z-10">
        <div className="w-full h-[360px] relative">
          <Doughnut
            data={{
              labels: dollarData.map((d) => d.name),
              datasets: [
                {
                  label: 'Dollars',
                  data: dollarData.map((d) => d.value),
                  backgroundColor: dollarData.map(
                    (d) => SEVERITY_COLORS[d.sev] || 'rgba(203,213,225,0.45)'
                  ),
                  borderColor: dollarData.map((d) => toOpaque(SEVERITY_COLORS[d.sev])),
                  borderWidth: 1.5,
                  cutout: '55%',
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  titleColor: '#0f172a',
                  bodyColor: '#1e293b',
                  borderColor: '#e2e8f0',
                  borderWidth: 1,
                  cornerRadius: 8,
                  padding: 10,
                  yAlign: 'top' as const,
                  titleFont: { weight: 'bold' as const },
                  callbacks: {
                    label: (ctx) => {
                      const val = Number(ctx.raw || 0)
                      const total = (ctx.dataset.data as number[]).reduce((a, b) => a + Number(b), 0)
                      const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0'
                      return `${ctx.label}: $${val.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${pct}%)`
                    },
                  },
                },
              },
            }}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {totalActivity === 0 ? (
              <div className="text-xs text-slate-500">No activity in period</div>
            ) : (
              <>
                <div className="text-lg font-semibold text-slate-900">
                  Total: ${totalActivity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-slate-500">
                  Exceptions: ${exceptionActivity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0 pt-4 relative z-10">
        <LegendList data={dollarData} />
      </div>
    </div>
  )
}
