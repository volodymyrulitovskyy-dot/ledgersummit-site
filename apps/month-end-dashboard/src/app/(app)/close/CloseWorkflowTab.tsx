"use client"

import { useMemo, useState, useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'

type Props = {
  orgName: string
  periodRange?: string
  snapshotSource?: string | null
  openExceptions: number
  totalExceptions: number
}

// Reduced from original widths by 35%
const NODE_W_LG = 156  // was 240
const NODE_W_MD = 143  // was 220

const nodeBaseStyle =
  'rounded-xl px-3 py-2 shadow-sm border border-white/50 backdrop-blur bg-white/70 text-slate-900 text-[11px]'

const statusChip = (text: string, tone: 'green' | 'amber' | 'red') => {
  const colors: Record<'green' | 'amber' | 'red', string> = {
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    red: 'bg-rose-100 text-rose-700 border-rose-200',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${colors[tone]}`}>
      {text}
    </span>
  )
}

// Explanation data for the inspector panel
const NODE_DETAILS: Record<string, { title: string; description: string; tips: string[] }> = {
  source: {
    title: 'Import Trial Balance',
    description:
      'The first step in the month-end close is importing your Trial Balance from QuickBooks Online or uploading a snapshot manually. This establishes the baseline account balances for the period.',
    tips: [
      'Connect your QBO account under Settings to enable automatic imports',
      'You can also upload a CSV snapshot if QBO is unavailable',
      'The TB is the foundation for all downstream checks and reconciliations',
    ],
  },
  rules: {
    title: 'Run Rules',
    description:
      'Automated rules scan your Trial Balance for variances, consistency issues, and policy violations. Rules include period-over-period variance checks, balance threshold alerts, and schedule tie-out validations.',
    tips: [
      'Configure rules on the Rules tab to match your organization\'s policies',
      'Rules run automatically after each TB import',
      'Critical exceptions will block close until resolved',
    ],
  },
  exceptions: {
    title: 'Review Exceptions',
    description:
      'Exceptions flagged by rules require human review. Each exception can be resolved, deferred to a future period, or waived with an explanation. Severity levels (low, medium, high, critical) help prioritize work.',
    tips: [
      'Start with critical and high-severity exceptions first',
      'Add comments to document your review and resolution',
      'Deferred exceptions carry forward to the next period automatically',
    ],
  },
  reconcile: {
    title: 'Reconcile & Schedules',
    description:
      'Create reconciliations to tie your GL balances to supporting evidence (bank statements, sub-ledgers, etc.). Schedules track prepaid amortization, fixed asset depreciation, and loan balances with automated roll-forward calculations.',
    tips: [
      'A reconciliation is "tied" when the variance to the TB is within ±0.01',
      'Prepaid schedules can auto-generate monthly amortization entries',
      'Use the roll-forward view for a clear Start → Activity → End breakdown',
    ],
  },
  checklist: {
    title: 'Review Checklist',
    description:
      'The close checklist ensures every required task is completed before signoff. Tasks include account reconciliations, adjusting entries, accruals, and management review. Each task tracks who completed it and when.',
    tips: [
      'Assign tasks to team members for accountability',
      'Overdue tasks are highlighted in red with a days-late counter',
      'All checklist items must be complete before the period can be closed',
    ],
  },
  'close-acct': {
    title: 'Close Accounting',
    description:
      'Close Accounting locks the period, preventing further changes. This step finalizes all journal entries, marks exceptions as resolved or deferred, and creates an audit trail. Once closed, the period becomes read-only.',
    tips: [
      'Ensure all open exceptions are resolved or waived before closing',
      'The close action generates a summary report for management review',
      'Closed periods can be reopened by admins if adjustments are needed',
    ],
  },
  signoff: {
    title: 'Signoff & Archive',
    description:
      'The final approval step where designated reviewers sign off on the close. Signoff confirms that all checks passed, reconciliations tie, and the financial statements are ready for reporting.',
    tips: [
      'Only users with reviewer or admin roles can sign off',
      'Signoff timestamp and user are recorded for audit compliance',
      'After signoff, the period package is archived and available for export',
    ],
  },
}

export function CloseWorkflowTab({
  orgName,
  periodRange,
  snapshotSource,
  openExceptions,
  totalExceptions,
}: Props) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode((prev) => (prev === node.id ? null : node.id))
  }, [])

  const nodes = useMemo<Node[]>(
    () => [
      {
        id: 'source',
        position: { x: 0, y: 0 },
        data: {
          label: (
            <div className={nodeBaseStyle}>
              <div className="text-[9px] uppercase text-slate-500">Step 1</div>
              <div className="text-xs font-semibold">Import Trial Balance</div>
              <div className="text-[10px] text-slate-600">
                {periodRange || 'Select a period'}
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                Source: {snapshotSource || 'Not loaded'}
              </div>
            </div>
          ),
        },
        style: { width: NODE_W_LG },
      },
      {
        id: 'rules',
        position: { x: 200, y: 0 },
        data: {
          label: (
            <div className={nodeBaseStyle}>
              <div className="text-[9px] uppercase text-slate-500">Step 2</div>
              <div className="text-xs font-semibold">Run Rules</div>
              <div className="text-[10px] text-slate-600">Variance & consistency checks</div>
            </div>
          ),
        },
        style: { width: NODE_W_MD },
      },
      {
        id: 'exceptions',
        position: { x: 385, y: 0 },
        data: {
          label: (
            <div className={nodeBaseStyle}>
              <div className="text-[9px] uppercase text-slate-500">Step 3</div>
              <div className="text-xs font-semibold">Review Exceptions</div>
              <div className="flex items-center gap-1 mt-1">
                {statusChip(`${openExceptions} open`, openExceptions > 0 ? 'amber' : 'green')}
                {statusChip(`${totalExceptions} total`, totalExceptions > 0 ? 'green' : 'amber')}
              </div>
            </div>
          ),
        },
        style: { width: NODE_W_LG },
      },
      {
        id: 'reconcile',
        position: { x: 0, y: 130 },
        data: {
          label: (
            <div className={nodeBaseStyle}>
              <div className="text-[9px] uppercase text-slate-500">Step 4</div>
              <div className="text-xs font-semibold">Reconcile & Schedules</div>
              <div className="text-[10px] text-slate-600">Tie-outs, roll-forwards</div>
            </div>
          ),
        },
        style: { width: NODE_W_LG },
      },
      {
        id: 'checklist',
        position: { x: 200, y: 130 },
        data: {
          label: (
            <div className={nodeBaseStyle}>
              <div className="text-[9px] uppercase text-slate-500">Step 5</div>
              <div className="text-xs font-semibold">Review Checklist</div>
              <div className="text-[10px] text-slate-600">Tasks & assignments</div>
            </div>
          ),
        },
        style: { width: NODE_W_MD },
      },
      {
        id: 'close-acct',
        position: { x: 385, y: 130 },
        data: {
          label: (
            <div className={nodeBaseStyle}>
              <div className="text-[9px] uppercase text-slate-500">Step 6</div>
              <div className="text-xs font-semibold">Close Accounting</div>
              <div className="text-[10px] text-slate-600">Lock period & finalize</div>
            </div>
          ),
        },
        style: { width: NODE_W_MD },
      },
      {
        id: 'signoff',
        position: { x: 200, y: 260 },
        data: {
          label: (
            <div className={nodeBaseStyle}>
              <div className="text-[9px] uppercase text-slate-500">Step 7</div>
              <div className="text-xs font-semibold">Signoff & Archive</div>
              <div className="text-[10px] text-slate-600">Approvals & audit trail</div>
            </div>
          ),
        },
        style: { width: NODE_W_MD },
      },
    ],
    [openExceptions, periodRange, snapshotSource, totalExceptions]
  )

  const edges = useMemo<Edge[]>(
    () => [
      { id: 'e1', source: 'source', target: 'rules', animated: true, label: 'run' },
      { id: 'e2', source: 'rules', target: 'exceptions', animated: true, label: 'flag' },
      { id: 'e3', source: 'exceptions', target: 'reconcile', animated: true, label: 'remediate' },
      { id: 'e4', source: 'reconcile', target: 'checklist', animated: true, label: 'verify' },
      { id: 'e5', source: 'checklist', target: 'close-acct', animated: true, label: 'complete' },
      { id: 'e6', source: 'close-acct', target: 'signoff', animated: true, label: 'approve' },
      { id: 'e7', source: 'exceptions', target: 'signoff', animated: true, style: { strokeDasharray: '5,5' }, label: 'defer' },
    ],
    []
  )

  const detail = selectedNode ? NODE_DETAILS[selectedNode] : null

  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/80 shadow-sm p-4">
      <div className="flex items-center justify-between px-2 pb-2">
        <div>
          <div className="text-xs uppercase text-slate-500">Workflow</div>
          <div className="text-lg font-semibold text-slate-900">Month-end for {orgName}</div>
          {periodRange ? (
            <div className="text-xs text-slate-600">Period: {periodRange}</div>
          ) : (
            <div className="text-xs text-amber-600">Select a period to align the flow.</div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-slate-900" /> In-progress
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Completed
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Flow diagram */}
        <div className={`${detail ? 'w-[60%]' : 'w-full'} h-[520px] rounded-2xl border border-slate-100 overflow-hidden bg-slate-50 transition-all duration-300`}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={onNodeClick}
            fitView
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              style: { stroke: '#334155', strokeWidth: 1.2 },
              markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#334155' },
            }}
          >
            <Background gap={16} color="rgba(148,163,184,0.35)" />
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {/* Inspector panel — shows on node click */}
        {detail && (
          <div className="w-[40%] h-[520px] rounded-2xl border border-slate-200 bg-white p-5 overflow-auto animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">{detail.title}</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close panel"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed mb-5">
              {detail.description}
            </p>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase text-slate-500">Tips & Best Practices</h4>
              <ul className="space-y-2">
                {detail.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="mt-0.5 h-4 w-4 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
