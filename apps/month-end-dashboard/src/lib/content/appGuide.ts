export const authValueProps = [
  {
    title: 'What this app does',
    description:
      'It gives finance teams one place to run the month-end close, monitor exceptions, and keep supporting work tied to each reporting period.',
  },
  {
    title: 'How it works',
    description:
      'Import a trial balance, run automated checks, resolve flagged issues, complete reconciliations and schedules, then move the period to review and signoff.',
  },
  {
    title: 'What you get',
    description:
      'A cleaner close workflow with clearer ownership, faster issue triage, and a repeatable audit trail for every monthly cycle.',
  },
] as const

export const guideSteps = [
  {
    step: '01',
    title: 'Select the period and load accounting data',
    detail:
      'Start by choosing the active organization and period. The app uses that context to pull or upload the trial balance that all downstream checks rely on.',
  },
  {
    step: '02',
    title: 'Run automated close checks',
    detail:
      'Rules compare balances, variance patterns, and expected schedule behavior so unusual movements are surfaced early instead of at final review.',
  },
  {
    step: '03',
    title: 'Triage exceptions and document decisions',
    detail:
      'Each exception can be assigned, commented on, resolved, or deferred. That keeps review work visible and creates a record of why a balance was accepted.',
  },
  {
    step: '04',
    title: 'Tie out schedules and reconciliations',
    detail:
      'Teams confirm supporting schedules, reconcile accounts, and verify that roll-forwards and detailed activity agree to the trial balance.',
  },
  {
    step: '05',
    title: 'Complete the checklist and move to signoff',
    detail:
      'Operational close tasks are tracked alongside accounting review so nothing is missed before the period is finalized and archived.',
  },
] as const

export const guidePrinciples = [
  'Use one period-specific workspace instead of separate spreadsheets, checklists, and email threads.',
  'Review high-risk exceptions first so controllers focus attention where a missed issue would matter most.',
  'Document outcomes as work happens to reduce rework during management review and audit support.',
] as const
