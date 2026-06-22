type Props = {
  summary: {
    text: string
    reasons: string[]
  }
}

export function CloseSummaryCard({ summary }: Props) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div className="flex items-start gap-3 w-full">
        <div className="w-full">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            Close Summary
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-slate-500"
              role="img"
              aria-label="Why this summary?"
              title={(summary.reasons || []).join('\n') || 'Why this summary?'}
            >
              <path
                fill="currentColor"
                d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm1.5 12.25h-3v-1.5h1.25V11H10v-1.5h2.5a.75.75 0 0 1 .75.75v5.25H13.5z"
              />
            </svg>
          </div>
          <p className="mt-3 text-[1.1rem] text-slate-800 leading-relaxed w-full">
            {summary.text}
          </p>
        </div>
      </div>
    </div>
  )
}
