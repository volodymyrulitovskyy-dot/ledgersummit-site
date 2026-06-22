"use client"

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, ChartTooltip, ChartLegend)

type Props = {
  exceptions: { severity?: string | null; status?: string | null; resolved_at?: string | Date | null }[]
  tbLines?: { id?: string }[] | null
}

const STATUS_COLORS: Record<string, string> = {
  open: 'rgba(250, 204, 21, 0.55)',      // Bright yellow, semi-transparent
  closed: 'rgba(74, 222, 128, 0.5)',     // Green, semi-transparent
}

export function CloseProgressCard({ exceptions, tbLines }: Props) {
  const totalAccounts = Array.isArray(tbLines) ? tbLines.length : 0
  let openIssues = 0
  let closedIssues = 0
  for (const ex of exceptions ?? []) {
    const status = (ex.status || '').toLowerCase()
    const isClosed = status === 'resolved' || status === 'complete' || !!ex.resolved_at
    if (isClosed) closedIssues += 1
    else openIssues += 1
  }
  const data = [
    { name: 'Open', sev: 'open', value: openIssues },
    { name: 'Closed', sev: 'closed', value: closedIssues },
  ].filter((d) => d.value > 0)
  const totalIssues = openIssues + closedIssues

  return (
    <div className="group relative rounded-3xl border border-white/40 bg-gradient-to-br from-white/70 via-blue-50/50 to-purple-50/50 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] backdrop-blur-md h-[520px] flex flex-col">
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/10 group-hover:to-purple-500/10 transition-all duration-300 pointer-events-none" />
      <div className="shrink-0 relative z-10">
        <div className="text-base font-bold text-slate-900">Close Issues</div>
        <div className="text-xs text-slate-500">open vs closed</div>
      </div>
      <div className="flex-1 flex items-center justify-center relative z-10">
        <div className="w-full h-[360px] relative">
          <Doughnut
            data={{
              labels: data.map((d) => d.name),
              datasets: [
                {
                  label: 'Issues',
                  data: data.map((d) => d.value),
                  backgroundColor: data.map((d) => STATUS_COLORS[d.sev] || 'rgba(148,163,184,0.5)'),
                  borderColor: data.map((d) =>
                    (STATUS_COLORS[d.sev] || 'rgba(148,163,184,0.5)').replace(/0\.\d+/, '1')
                  ),
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
                      return `${ctx.label}: ${val} (${pct}%)`
                    },
                  },
                },
              },
            }}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-lg font-semibold text-slate-900">Total issues: {totalIssues}</div>
            <div className="text-xs text-slate-500">
              Accounts: {totalAccounts} · Open: {openIssues} · Closed: {closedIssues}
            </div>
          </div>
        </div>
      </div>
      <div className="shrink-0 pt-4 relative z-10">
        <div className="flex flex-wrap gap-3 text-sm text-slate-700">
          {data.map((d) => (
            <div key={d.sev} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[d.sev] || 'rgba(203,213,225,0.45)' }}
              />
              <span>{d.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
