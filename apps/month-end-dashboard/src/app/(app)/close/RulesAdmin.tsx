'use client'

import { useMemo, useState } from 'react'
import { RULE_TEMPLATES, RuleTemplate } from './rules/templates'
import {
  createRuleAction,
  toggleRuleAction,
  deleteRuleAction,
  updateRuleAction,
} from './rules/actions'
import { Modal } from '@/components/close/Modal'
import { SeverityBadge } from '@/components/close/Badges'

type Scope = 'ALL' | 'ACCOUNT_MATCH' | 'ACCOUNT_ID'
type VarianceMode = 'NONE' | 'ABS_DELTA' | 'PCT_DELTA'
type VarianceBasis = 'PRIOR_MONTH' | 'PRIOR_QUARTER' | 'PRIOR_YEAR_SAME_MONTH'

type Rule = {
  id: string
  name: string
  description: string | null
  enabled: boolean
  severity: 'low' | 'medium' | 'high' | 'critical'
  account_match: string | null
  account_id?: string | null
  threshold_abs: number | null
  threshold_pos: number | null
  threshold_neg: number | null
  owner_name: string | null
  scope?: Scope | null
  variance_mode?: VarianceMode | null
  variance_basis?: VarianceBasis | null
  variance_threshold?: number | null
  domain?: 'GL' | 'PROJECT_PNL' | null
  metric?: 'revenue' | 'cogs' | 'gross_profit' | null
  target?: string | null
  _count?: { exceptions?: number }
}

type FormState = {
  name: string
  description: string
  severity: Rule['severity']
  scope: Scope
  accountMatch: string
  thresholdAbs: string
  thresholdPos: string
  thresholdNeg: string
  varianceMode: VarianceMode
  varianceBasis: VarianceBasis
  varianceThreshold: string
  ownerName: string
  metric: 'revenue' | 'cogs' | 'gross_profit'
}

function makeDefaults(from?: Partial<FormState>): FormState {
  return {
    name: from?.name ?? '',
    description: from?.description ?? '',
    severity: (from?.severity as FormState['severity']) ?? 'medium',
    scope: (from?.scope as Scope) ?? 'ALL',
    accountMatch: from?.accountMatch ?? '',
    thresholdAbs: from?.thresholdAbs ?? '',
    thresholdPos: from?.thresholdPos ?? '',
    thresholdNeg: from?.thresholdNeg ?? '',
    varianceMode: (from?.varianceMode as VarianceMode) ?? 'NONE',
    varianceBasis: (from?.varianceBasis as VarianceBasis) ?? 'PRIOR_MONTH',
    varianceThreshold: from?.varianceThreshold ?? '',
    ownerName: from?.ownerName ?? '',
    metric: from?.metric ?? 'revenue',
  }
}

interface RulesAdminProps {
  orgId: string
  snapshotId?: string | null
  rules: Rule[]
  domain?: 'GL' | 'PROJECT_PNL'
  templates?: RuleTemplate[]
}

export function RulesAdmin({ orgId, snapshotId, rules, domain = 'GL', templates }: RulesAdminProps) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [template, setTemplate] = useState<RuleTemplate | null>(null)
  const [form, setForm] = useState<FormState>(() => makeDefaults())
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [preview, setPreview] = useState<{ count: number; sampleAccounts: Array<{ account_name?: string; account_number?: string; value?: string | number }> } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const cards = useMemo(() => rules, [rules])
  const activeTemplates = templates ?? RULE_TEMPLATES
  const isProjectDomain = domain === 'PROJECT_PNL'

  function openCreate() {
    setEditing(null)
    setTemplate(null)
    setForm(makeDefaults())
    setPreview(null)
    setError(null)
    setOpen(true)
  }

  function openEdit(rule: Rule) {
    setEditing(rule)
    setTemplate(null)
    setForm(
      makeDefaults({
        name: rule.name,
        description: rule.description ?? '',
        severity: rule.severity,
        scope: (rule.scope as Scope) ?? 'ALL',
        accountMatch: rule.account_match ?? '',
        thresholdAbs: rule.threshold_abs != null ? String(rule.threshold_abs) : '',
        thresholdPos: rule.threshold_pos != null ? String(rule.threshold_pos) : '',
        thresholdNeg: rule.threshold_neg != null ? String(rule.threshold_neg) : '',
        varianceMode: (rule.variance_mode as VarianceMode) ?? 'NONE',
        varianceBasis: (rule.variance_basis as VarianceBasis) ?? 'PRIOR_MONTH',
        varianceThreshold:
          rule.variance_threshold != null ? String(rule.variance_threshold) : '',
        ownerName: rule.owner_name ?? '',
        metric: (rule.metric as FormState['metric']) ?? 'revenue',
      })
    )
    setPreview(null)
    setError(null)
    setOpen(true)
  }

  function applyTemplate(t: RuleTemplate) {
    setTemplate(t)
    setForm(
      makeDefaults({
        name: t.name,
        description: t.description,
        severity: t.severity,
        scope: t.scope,
        accountMatch: t.account_match ?? '',
        thresholdAbs: t.threshold_abs != null ? String(t.threshold_abs) : '',
        varianceMode: (t.variance_mode as VarianceMode) ?? 'NONE',
        varianceBasis: (t.variance_basis as VarianceBasis) ?? 'PRIOR_MONTH',
        varianceThreshold:
          t.variance_threshold != null ? String(t.variance_threshold) : '',
        metric: (t.metric as FormState['metric']) ?? 'revenue',
      })
    )
  }

  function handleChange<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const isVarianceRule = form.varianceMode !== 'NONE'
      const payload = {
        orgId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        accountMatch: form.scope === 'ACCOUNT_MATCH' ? form.accountMatch.trim() || undefined : undefined,
        // Only send absolute thresholds for non-variance rules; clear them for variance rules
        thresholdAbs: isVarianceRule ? undefined : (form.thresholdAbs ? Number(form.thresholdAbs) : undefined),
        thresholdPos: isVarianceRule ? undefined : (form.thresholdPos ? Number(form.thresholdPos) : undefined),
        thresholdNeg: isVarianceRule ? undefined : (form.thresholdNeg ? Number(form.thresholdNeg) : undefined),
        severity: form.severity,
        ownerName: form.ownerName.trim() || undefined,
        scope: form.scope,
        varianceMode: form.varianceMode,
        varianceBasis: isVarianceRule ? form.varianceBasis : undefined,
        // Only send variance threshold for variance rules; clear for absolute rules
        varianceThreshold: isVarianceRule && form.varianceThreshold
          ? Number(form.varianceThreshold)
          : undefined,
        domain,
        metric: isProjectDomain ? form.metric : undefined,
        target: template?.target ?? (isProjectDomain ? 'project_pnl' : 'tb_account'),
        ruleType: template?.rule_type,
      }
      if (editing) {
        await updateRuleAction({ ruleId: editing.id, ...payload })
      } else {
        await createRuleAction(payload)
      }
      setOpen(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save rule')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePreview() {
    if (!snapshotId) {
      setError('No snapshot available for preview')
      return
    }
    setPreview(null)
    setPreviewLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/close/rules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          snapshotId,
          rule: {
            name: form.name,
            severity: form.severity,
            scope: form.scope,
            account_match: form.accountMatch || null,
            threshold_abs: form.thresholdAbs ? Number(form.thresholdAbs) : null,
            threshold_pos: form.thresholdPos ? Number(form.thresholdPos) : null,
            threshold_neg: form.thresholdNeg ? Number(form.thresholdNeg) : null,
            variance_mode: form.varianceMode,
            variance_basis:
              form.varianceMode === 'NONE' ? null : form.varianceBasis,
            variance_threshold:
              form.varianceMode === 'NONE' || !form.varianceThreshold
                ? null
                : Number(form.varianceThreshold),
          },
        }),
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || 'Preview failed')
      }
      const json = await resp.json()
      setPreview(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleToggleEnabled(rule: Rule) {
    await toggleRuleAction(rule.id, orgId, !rule.enabled)
  }

  async function handleInlineUpdate(rule: Rule, patch: Partial<Rule>) {
    await updateRuleAction({
      ruleId: rule.id,
      orgId,
      name: patch.name ?? rule.name,
      description: patch.description ?? rule.description ?? undefined,
      accountMatch:
        patch.scope === 'ACCOUNT_MATCH'
          ? patch.account_match ?? rule.account_match ?? undefined
          : patch.account_match ?? rule.account_match ?? undefined,
      thresholdAbs:
        patch.threshold_abs !== undefined
          ? patch.threshold_abs ?? undefined
          : rule.threshold_abs ?? undefined,
      thresholdPos:
        patch.threshold_pos !== undefined
          ? patch.threshold_pos ?? undefined
          : rule.threshold_pos ?? undefined,
      thresholdNeg:
        patch.threshold_neg !== undefined
          ? patch.threshold_neg ?? undefined
          : rule.threshold_neg ?? undefined,
      severity: (patch.severity as Rule['severity']) ?? rule.severity,
      ownerName:
        patch.owner_name !== undefined
          ? patch.owner_name ?? undefined
          : rule.owner_name ?? undefined,
      scope: (patch.scope as Scope) ?? (rule.scope as Scope),
      varianceMode:
        (patch.variance_mode as VarianceMode) ??
        ((rule.variance_mode as VarianceMode) ?? 'NONE'),
      varianceBasis:
        (patch.variance_basis as VarianceBasis) ??
        ((rule.variance_basis as VarianceBasis) ?? 'PRIOR_MONTH'),
      varianceThreshold:
        patch.variance_threshold !== undefined
          ? patch.variance_threshold ?? undefined
          : rule.variance_threshold ?? undefined,
      domain: (patch.domain as Rule['domain']) ?? (rule.domain as Rule['domain']) ?? domain,
      metric: (patch.metric as Rule['metric']) ?? (rule.metric as Rule['metric']) ?? (isProjectDomain ? 'revenue' : null),
      target: patch.target ?? rule.target ?? (isProjectDomain ? 'project_pnl' : 'tb_account'),
    })
  }

  async function handleDelete(ruleId: string) {
    if (!confirm('Delete this rule?')) return
    await deleteRuleAction(ruleId, orgId)
  }

  const severityOptions: Rule['severity'][] = ['low', 'medium', 'high', 'critical']

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{isProjectDomain ? 'Project Rules' : 'Rules'}</h2>
          <p className="text-sm text-slate-500">
            Start from a template and edit thresholds inline.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCreate}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Add Rule
          </button>
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Templates
          </button>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-slate-500">
          No rules yet. Click “Add Rule” to start or pick a template.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((rule) => (
            <div
              key={rule.id}
              className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{rule.name}</h3>
                    <SeverityBadge severity={rule.severity} />
                  </div>
                  {rule.description && (
                    <p className="mt-1 text-sm text-slate-600">{rule.description}</p>
                  )}
                  <div className="mt-1 text-xs text-slate-500">
                    Scope: {rule.scope ?? 'ALL'} · Match: {rule.account_match || '—'}
                  </div>
                  {isProjectDomain && (
                    <div className="mt-1 text-xs text-slate-500">Metric: {rule.metric || 'revenue'}</div>
                  )}
                  <div className="mt-1 text-xs text-slate-500">
                    Currently flags:{' '}
                    {rule._count?.exceptions != null ? rule._count.exceptions : '—'}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <span>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={rule.enabled}
                    onChange={() => handleToggleEnabled(rule)}
                  />
                </label>
              </div>

              <div className="mt-3 space-y-2 text-sm">
                {(rule.variance_mode === 'ABS_DELTA' || rule.variance_mode === 'PCT_DELTA') ? (
                  <div>
                    <div className="text-xs text-slate-500">
                      MoM threshold {rule.variance_mode === 'PCT_DELTA' ? '(decimal, e.g. 0.1 = 10%)' : '($)'}
                    </div>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                      defaultValue={rule.variance_threshold ?? ''}
                      onBlur={async (e) =>
                        handleInlineUpdate(rule, {
                          variance_threshold: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    />
                  </div>
                ) : (
                  <div>
                    <div className="text-xs text-slate-500">Abs threshold ($)</div>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                      defaultValue={rule.threshold_abs ?? ''}
                      onBlur={async (e) =>
                        handleInlineUpdate(rule, {
                          threshold_abs: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="text-xs text-slate-500">Severity</div>
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    defaultValue={rule.severity}
                    onChange={(e) =>
                      handleInlineUpdate(rule, {
                        severity: e.target.value as Rule['severity'],
                      })
                    }
                  >
                    {severityOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  onClick={() => openEdit(rule)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Rule' : 'Add Rule'}>
        <form onSubmit={handleSave} className="space-y-3">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {activeTemplates.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => applyTemplate(t)}
                className={`rounded-lg border px-3 py-2 text-sm ${template?.key === t.key
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Name</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Description</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Scope</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.scope}
                onChange={(e) => handleChange('scope', e.target.value as Scope)}
              >
                <option value="ALL">All accounts</option>
                <option value="ACCOUNT_MATCH">Account name contains</option>
                <option value="ACCOUNT_ID">Specific account (coming soon)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Severity</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.severity}
                onChange={(e) => handleChange('severity', e.target.value as Rule['severity'])}
              >
                {severityOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isProjectDomain && (
            <div>
              <label className="text-xs font-medium text-slate-600">Metric</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.metric}
                onChange={(e) => handleChange('metric', e.target.value as FormState['metric'])}
              >
                <option value="revenue">Revenue</option>
                <option value="cogs">COGS</option>
                <option value="gross_profit">Gross Profit</option>
              </select>
            </div>
          )}

          {form.scope === 'ACCOUNT_MATCH' && (
            <div>
              <label className="text-xs font-medium text-slate-600">Account name contains</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.accountMatch}
                onChange={(e) => handleChange('accountMatch', e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600">Rule type</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.varianceMode}
              onChange={(e) => handleChange('varianceMode', e.target.value as VarianceMode)}
            >
              <option value="NONE">Absolute threshold</option>
              <option value="ABS_DELTA">MoM $ change</option>
              <option value="PCT_DELTA">MoM % change</option>
            </select>
          </div>

          {form.varianceMode === 'NONE' ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div className="text-xs font-medium text-slate-600">
                Flag when the current period value exceeds these thresholds
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Abs threshold</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    type="number"
                    value={form.thresholdAbs}
                    onChange={(e) => handleChange('thresholdAbs', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Positive threshold</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    type="number"
                    value={form.thresholdPos}
                    onChange={(e) => handleChange('thresholdPos', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Negative threshold</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    type="number"
                    value={form.thresholdNeg}
                    onChange={(e) => handleChange('thresholdNeg', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div className="text-xs font-medium text-slate-600">
                Flag when the month-over-month {form.varianceMode === 'PCT_DELTA' ? 'percentage' : 'dollar'} change exceeds this threshold
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Basis</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.varianceBasis}
                    onChange={(e) =>
                      handleChange('varianceBasis', e.target.value as VarianceBasis)
                    }
                  >
                    <option value="PRIOR_MONTH">Prior month</option>
                    <option value="PRIOR_QUARTER">Prior quarter</option>
                    <option value="PRIOR_YEAR_SAME_MONTH">Prior year (same month)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Threshold {form.varianceMode === 'PCT_DELTA' ? '(decimal, e.g. 0.1 = 10%)' : '($)'}
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    type="number"
                    value={form.varianceThreshold}
                    onChange={(e) => handleChange('varianceThreshold', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600">Owner</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.ownerName}
              onChange={(e) => handleChange('ownerName', e.target.value)}
              placeholder="Optional owner name"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isSubmitting ? 'Saving...' : editing ? 'Save changes' : 'Create rule'}
            </button>
            <button
              type="button"
              onClick={handlePreview}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {previewLoading ? 'Previewing…' : 'Preview impact'}
            </button>
          </div>

          {preview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-900">Preview</div>
              <div className="text-slate-700">Currently flags: {preview.count} accounts</div>
              {preview.sampleAccounts?.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-slate-700">
                  {preview.sampleAccounts.slice(0, 5).map((a, idx: number) => (
                    <li key={idx}>
                      {a.account_name || a.account_number || 'Account'} – {a.value}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      </Modal>
    </div>
  )
}
