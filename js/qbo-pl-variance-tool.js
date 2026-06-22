(function () {
  'use strict';

  const FIELD_DEFINITIONS = [
    { key: 'account', label: 'Account', help: 'Required for variance ranking and follow-up.', kind: 'accountName' },
    { key: 'category', label: 'Category / section', help: 'Useful for grouping revenue, COGS, opex, and other lines.', kind: 'type' },
    { key: 'currentAmount', label: 'Current period', help: 'Required for current-period analysis.', kind: 'amount' },
    { key: 'comparisonAmount', label: 'Prior period / comparison', help: 'Used for month-over-month or period-over-period variance.', kind: 'amount' },
    { key: 'budgetAmount', label: 'Budget / forecast', help: 'Optional but useful for plan-vs-actual review.', kind: 'amount' },
    { key: 'className', label: 'Class', help: 'Optional for QBO class-based P&L review.', kind: 'class' },
    { key: 'department', label: 'Department / location', help: 'Optional for management-report slices.', kind: 'department' }
  ];

  const COLUMN_HINTS = {
    account: ['account', 'name', 'rowname'],
    category: ['category', 'section', 'group', 'accounttype'],
    currentAmount: ['current', 'actual', 'thisperiod', 'month', 'amount'],
    comparisonAmount: ['prior', 'previous', 'comparison', 'lastperiod'],
    budgetAmount: ['budget', 'forecast', 'plan'],
    className: ['class', 'classname'],
    department: ['department', 'location']
  };

  const SAMPLE_CSV = [
    'Account,Category,Current Period,Prior Period,Budget,Class,Department',
    'Consulting Revenue,Revenue,145000,132000,140000,Advisory,US-East',
    'Project Revenue,Revenue,98000,104000,101000,Advisory,US-East',
    'Payroll Expense,Operating Expense,72000,69000,70000,Operations,HQ',
    'Contractor Expense,Operating Expense,38500,24000,28000,Operations,Remote',
    'Software Expense,Operating Expense,18100,17650,17500,Operations,HQ',
    'Travel Expense,Operating Expense,9600,3200,5000,Advisory,US-East',
    'Marketing Expense,Operating Expense,28500,18400,21000,Marketing,Remote',
    'Interest Income,Other Income,1200,0,0,Corporate,HQ',
    'Office Supplies,Operating Expense,2100,2150,1900,Operations,HQ',
    'Bad Debt Expense,Operating Expense,6400,1200,1500,Finance,HQ'
  ].join('\n');

  function mapRow(row, mapping, utils) {
    const account = mapping.account ? String(row[mapping.account] || '').trim() : '';
    const currentAmount = mapping.currentAmount ? utils.parseNumber(row[mapping.currentAmount]) : null;
    if (!account || currentAmount == null) {
      return null;
    }
    return {
      rowNumber: row.__rowNumber,
      account,
      accountNorm: utils.normalizeText(account),
      category: mapping.category ? String(row[mapping.category] || '').trim() : '',
      currentAmount,
      comparisonAmount: mapping.comparisonAmount ? utils.parseNumber(row[mapping.comparisonAmount]) : null,
      budgetAmount: mapping.budgetAmount ? utils.parseNumber(row[mapping.budgetAmount]) : null,
      className: mapping.className ? String(row[mapping.className] || '').trim() : '',
      department: mapping.department ? String(row[mapping.department] || '').trim() : ''
    };
  }

  function isRevenue(row, utils) {
    return /revenue|income|sales/.test(utils.normalizeText(row.category + ' ' + row.account));
  }

  function analyze(rows, utils) {
    const reviewed = rows.map((row) => {
      const priorVariance = row.comparisonAmount == null ? null : row.currentAmount - row.comparisonAmount;
      const priorVariancePct = row.comparisonAmount ? (priorVariance / Math.abs(row.comparisonAmount)) * 100 : null;
      const budgetVariance = row.budgetAmount == null ? null : row.currentAmount - row.budgetAmount;
      const budgetVariancePct = row.budgetAmount ? (budgetVariance / Math.abs(row.budgetAmount)) * 100 : null;
      const revenue = isRevenue(row, utils);
      const primaryVariance = budgetVariance != null ? budgetVariance : priorVariance;
      const primaryVariancePct = budgetVariancePct != null ? budgetVariancePct : priorVariancePct;
      const flags = [];
      if (primaryVariance != null && Math.abs(primaryVariance) >= 1000) {
        flags.push({ label: 'Large dollar variance' });
      }
      if (primaryVariancePct != null && Math.abs(primaryVariancePct) >= 10) {
        flags.push({ label: 'Double-digit variance', tone: 'warn' });
      }
      if ((row.comparisonAmount || 0) === 0 && row.currentAmount !== 0) {
        flags.push({ label: 'Zero-to-nonzero movement', tone: 'warn' });
      }
      if ((row.currentAmount || 0) === 0 && (row.comparisonAmount || 0) !== 0) {
        flags.push({ label: 'Nonzero-to-zero movement', tone: 'warn' });
      }
      if (budgetVariance != null && revenue && budgetVariance < 0) {
        flags.push({ label: 'Below budget revenue', tone: 'warn' });
      }
      if (budgetVariance != null && !revenue && budgetVariance > 0) {
        flags.push({ label: 'Expense above budget', tone: 'warn' });
      }
      return Object.assign({}, row, {
        priorVariance,
        priorVariancePct,
        budgetVariance,
        budgetVariancePct,
        primaryVariance,
        primaryVariancePct,
        flags,
        flagCount: flags.length
      });
    });

    const flagged = reviewed.filter((row) => row.flagCount > 0).sort((left, right) => Math.abs(right.primaryVariance || 0) - Math.abs(left.primaryVariance || 0));
    const currentTotal = utils.sum(reviewed.map((row) => row.currentAmount));
    const priorTotal = utils.sum(reviewed.map((row) => row.comparisonAmount || 0));
    const budgetTotal = utils.sum(reviewed.map((row) => row.budgetAmount || 0));
    const categorySummary = new Map();

    reviewed.forEach((row) => {
      const key = row.category || 'Unassigned';
      if (!categorySummary.has(key)) {
        categorySummary.set(key, { current: 0, prior: 0, budget: 0 });
      }
      const bucket = categorySummary.get(key);
      bucket.current += row.currentAmount;
      bucket.prior += row.comparisonAmount || 0;
      bucket.budget += row.budgetAmount || 0;
    });

    const topCategories = [...categorySummary.entries()]
      .map((entry) => ({ category: entry[0], variance: entry[1].current - (entry[1].budget || entry[1].prior) }))
      .sort((left, right) => Math.abs(right.variance) - Math.abs(left.variance))
      .slice(0, 3)
      .map((entry) => entry.category + ' (' + utils.formatMoney(entry.variance) + ')');

    return {
      statusMessage: 'P&L variance review completed. Start with the largest unfavorable QBO movements first.',
      summary: [
        { label: 'Accounts reviewed', value: utils.formatNumber(reviewed.length), detail: 'P&L rows processed in the browser.' },
        { label: 'Current total', value: utils.formatMoney(currentTotal), detail: 'Current-period total across the mapped rows.' },
        { label: 'Vs prior', value: utils.formatMoney(currentTotal - priorTotal), detail: 'Current-period movement versus the mapped comparison column.' },
        { label: 'Vs budget', value: utils.formatMoney(currentTotal - budgetTotal), detail: 'Current-period movement versus the mapped budget column.' }
      ],
      signalCards: [
        { label: 'Accounts over threshold', value: utils.formatNumber(flagged.length), detail: 'Rows with large dollar or percentage movement.' },
        { label: 'Zero-to-nonzero', value: utils.formatNumber(reviewed.filter((row) => row.flags.some((flag) => flag.label === 'Zero-to-nonzero movement')).length), detail: 'New activity with no prior-period base.' },
        { label: 'Budget misses', value: utils.formatNumber(reviewed.filter((row) => row.flags.some((flag) => /budget/.test(flag.label))).length), detail: 'Rows where current QBO actuals missed budget expectations.' }
      ],
      insightCards: [
        { title: 'Category drivers', description: 'Sections of the P&L driving the biggest aggregate movement.', items: topCategories.length ? topCategories : ['No category concentration detected.'] },
        { title: 'Why users need this', description: 'QBO P&L exports often force teams into manual spreadsheets just to rank variances. This page surfaces the biggest moves immediately in the browser.' },
        { title: 'Review order', description: 'Start with large unfavorable expense overruns and missing revenue, then confirm any zero-to-nonzero activity before sharing explanations with leadership.' }
      ],
      findingsColumns: [
        { key: 'account', label: 'Account' },
        { key: 'category', label: 'Category' },
        { key: 'currentAmount', label: 'Current', render: (row) => utils.escapeHtml(utils.formatMoney(row.currentAmount)) },
        { key: 'comparisonAmount', label: 'Prior', render: (row) => utils.escapeHtml(utils.formatMoney(row.comparisonAmount || 0)) },
        { key: 'budgetAmount', label: 'Budget', render: (row) => utils.escapeHtml(utils.formatMoney(row.budgetAmount || 0)) },
        { key: 'primaryVariance', label: 'Primary variance', render: (row) => utils.escapeHtml(utils.formatMoney(row.primaryVariance || 0)) },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      findingsRows: flagged,
      findingsEmpty: 'No material P&L variance signals were detected in the current file.',
      explorerColumns: [
        { key: 'account', label: 'Account' },
        { key: 'category', label: 'Category' },
        { key: 'className', label: 'Class' },
        { key: 'department', label: 'Department' },
        { key: 'currentAmount', label: 'Current', render: (row) => utils.escapeHtml(utils.formatMoney(row.currentAmount)) },
        { key: 'primaryVariancePct', label: 'Variance %', render: (row) => utils.escapeHtml(utils.formatPercent(row.primaryVariancePct || 0)) },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      explorerRows: reviewed,
      exportRows: flagged.map((row) => ({
        Account: row.account,
        Category: row.category,
        Class: row.className,
        Department: row.department,
        Current: row.currentAmount,
        Prior: row.comparisonAmount,
        Budget: row.budgetAmount,
        PrimaryVariance: row.primaryVariance,
        PrimaryVariancePct: row.primaryVariancePct,
        Flags: row.flags.map((flag) => flag.label).join('; ')
      })),
      exportFileName: 'qbo-pl-variance-priority-queue.csv'
    };
  }

  function init() {
    if (!window.QBOCore) { return; }
    window.QBOCore.createSingleFileTool({
      rootId: 'qbo-pl-variance-tool-app',
      introStatus: 'Load a QBO P&L export or try the sample file to start.',
      analyzeButtonLabel: 'Analyze variance',
      exportFileName: 'qbo-pl-variance-priority-queue.csv',
      sampleCsv: SAMPLE_CSV,
      fieldDefinitions: FIELD_DEFINITIONS,
      columnHints: COLUMN_HINTS,
      validateMapping: function (mapping) {
        return !mapping.account || !mapping.currentAmount || (!mapping.comparisonAmount && !mapping.budgetAmount)
          ? 'Map the account, current-period, and at least one comparison column before analyzing variance.'
          : '';
      },
      mapRow: mapRow,
      analyze: analyze,
      results: {
        signalsTitle: 'Top P&L variance issues',
        signalsDescription: 'These are the rows driving the largest movement versus plan or prior period.',
        insightsTitle: 'Variance insights',
        insightsDescription: 'Use these patterns to build management commentary faster.',
        findingsTitle: 'Priority variance queue',
        findingsDescription: 'Largest and most explainable QBO variances at the top.',
        explorerTitle: 'Detailed variance explorer',
        explorerDescription: 'Search all reviewed P&L rows directly in the browser.'
      }
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FIELD_DEFINITIONS, COLUMN_HINTS, SAMPLE_CSV, mapRow, analyze };
  }
}());
