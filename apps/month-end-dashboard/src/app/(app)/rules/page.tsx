import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { getActiveOrgId } from '@/lib/active'
import { prisma } from '@/lib/db/prisma'
import { RulesAdmin } from '../close/RulesAdmin'
import { requireScreen } from '@/lib/auth/guard'
import Link from 'next/link'
import { PROJECT_RULE_TEMPLATES, RULE_TEMPLATES } from '../close/rules/templates'
import type { RuleTemplate } from '../close/rules/templates'

const DEFAULT_GL_TEMPLATE_KEYS = ['schedule_variance', 'mom_pct_10', 'mom_abs_1000', 'zero_balance'] as const
const DEFAULT_PROJECT_TEMPLATE_KEYS = ['mom_pct_revenue', 'gp_negative', 'cogs_greater_than_revenue', 'concentration'] as const

function pickTemplates(domain: 'GL' | 'PROJECT_PNL') {
  const templates = domain === 'PROJECT_PNL' ? PROJECT_RULE_TEMPLATES : RULE_TEMPLATES
  const preferredKeys = domain === 'PROJECT_PNL' ? DEFAULT_PROJECT_TEMPLATE_KEYS : DEFAULT_GL_TEMPLATE_KEYS
  return preferredKeys
    .map((key) => templates.find((template) => template.key === key))
    .filter((template): template is RuleTemplate => !!template)
}

async function seedDefaultRules(orgId: string, domain: 'GL' | 'PROJECT_PNL') {
  const templates = pickTemplates(domain)
  if (!templates.length) return

  await prisma.rule.createMany({
    data: templates.map((template) => ({
      org_id: orgId,
      name: template.name,
      description: template.description,
      enabled: true,
      rule_type: template.rule_type ?? 'threshold',
      target: template.target ?? (domain === 'PROJECT_PNL' ? 'project_pnl' : 'tb_account'),
      scope: template.scope,
      account_match: template.account_match ?? null,
      threshold_abs: template.threshold_abs ?? null,
      threshold_pos: template.threshold_pos ?? null,
      threshold_neg: template.threshold_neg ?? null,
      severity: template.severity,
      variance_mode: template.variance_mode ?? 'NONE',
      variance_basis: template.variance_mode && template.variance_mode !== 'NONE'
        ? template.variance_basis ?? 'PRIOR_MONTH'
        : null,
      variance_threshold: template.variance_mode && template.variance_mode !== 'NONE'
        ? template.variance_threshold ?? null
        : null,
      domain,
      metric: template.metric ?? null,
    })),
  })
}

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireScreen('rules')
  const orgId = await getActiveOrgId()
  if (!orgId) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-4">
          <h1 className="text-2xl font-semibold text-slate-900">Rules</h1>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            No active org selected.
          </div>
        </div>
      </div>
    )
  }

  const params = await searchParams
  const tab = params.tab === 'project' ? 'project' : 'gl'
  const domain = tab === 'project' ? 'PROJECT_PNL' : 'GL'

  await ensureOrgAccess(orgId)

  const initialRulesRaw = await prisma.rule.findMany({
    where: { org_id: orgId },
    orderBy: [{ created_at: 'desc' }],
    include: {
      _count: { select: { exceptions: true } },
    },
  })

  const hasRulesForDomain = initialRulesRaw.some((rule) => (rule.domain || 'GL') === domain)
  let seededDefaults = false

  if (!hasRulesForDomain) {
    await seedDefaultRules(orgId, domain)
    seededDefaults = true
  }

  const rulesRaw = seededDefaults
    ? await prisma.rule.findMany({
      where: { org_id: orgId },
      orderBy: [{ created_at: 'desc' }],
      include: {
        _count: { select: { exceptions: true } },
      },
    })
    : initialRulesRaw

  const num = (v: unknown) => {
    if (v == null) return null
    if (typeof v === 'number') return v
    if (typeof v === 'string') return Number(v)
    if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof v.toNumber === 'function') {
      return v.toNumber()
    }
    return Number(v)
  }

  const rules = rulesRaw
    .filter((r) => (r.domain || 'GL') === domain)
    .map((r) => ({
      ...r,
      domain: r.domain || 'GL',
      threshold_abs: num(r.threshold_abs),
      threshold_pos: num(r.threshold_pos),
      threshold_neg: num(r.threshold_neg),
      variance_threshold: num(r.variance_threshold),
    }))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Rules</h1>
            <p className="text-sm text-slate-600">Manage thresholds, MoM variance rules, and owners.</p>
          </div>
        </div>

        {seededDefaults ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            No {tab === 'project' ? 'project' : 'GL'} rules were found for this organization, so a starter set was added automatically.
          </div>
        ) : null}

        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <Link
              href="/rules?tab=gl"
              className={`
                whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium
                ${tab === 'gl'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}
              `}
            >
              GL Rules
            </Link>
            <Link
              href="/rules?tab=project"
              className={`
                whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium
                ${tab === 'project'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}
              `}
            >
              Project Rules
            </Link>
          </nav>
        </div>

        <RulesAdmin
          key={domain} // Force re-mount when switching domains
          orgId={orgId}
          snapshotId={null}
          rules={rules}
          domain={domain}
          templates={domain === 'PROJECT_PNL' ? PROJECT_RULE_TEMPLATES : RULE_TEMPLATES}
        />
      </div>
    </div>
  )
}
