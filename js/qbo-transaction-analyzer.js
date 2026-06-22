(function () {
  'use strict';

  const FIELD_DEFINITIONS = [
    { key: 'date', label: 'Transaction date', help: 'Used for timing, duplicate, and weekend checks.', kind: 'date' },
    { key: 'transactionId', label: 'Transaction ID / No.', help: 'Helpful for review follow-up and exported queues.', kind: 'id' },
    { key: 'type', label: 'Transaction type', help: 'Useful for spotting manual journals and odd entry types.', kind: 'type' },
    { key: 'account', label: 'Account / category', help: 'Required for uncategorized and account hot-spot checks.', kind: 'accountName' },
    { key: 'payee', label: 'Payee / customer / vendor', help: 'Used for duplicate and concentration review.', kind: 'name' },
    { key: 'memo', label: 'Memo / description', help: 'Used for duplicate and weak-description checks.', kind: 'memo' },
    { key: 'amount', label: 'Signed amount', help: 'Required for outlier and duplicate checks.', kind: 'amount' },
    { key: 'className', label: 'Class', help: 'Optional but useful for QBO class-tracking review.', kind: 'class' },
    { key: 'department', label: 'Department / location', help: 'Helpful for management-report completeness.', kind: 'department' },
    { key: 'status', label: 'Status / cleared', help: 'Used for open or uncleared transaction review.', kind: 'status' }
  ];

  const COLUMN_HINTS = {
    date: ['date', 'transactiondate', 'trxdate', 'postingdate'],
    transactionId: ['transactionid', 'txnno', 'docno', 'number', 'refno', 'reference', 'num'],
    type: ['type', 'transactiontype', 'txntype', 'detailtype'],
    account: ['account', 'category', 'accountname', 'expenseaccount', 'incomeaccount'],
    payee: ['payee', 'name', 'customer', 'vendor', 'employee'],
    memo: ['memo', 'description', 'details', 'note', 'message'],
    amount: ['amount', 'netamount', 'signedamount', 'value'],
    className: ['class', 'classname'],
    department: ['department', 'location', 'classlocation'],
    status: ['status', 'cleared', 'reconcile', 'state']
  };

  const SAMPLE_CSV = [
    'Transaction Date,Num,Type,Account,Name,Memo,Amount,Class,Location,Status',
    '2026-03-01,1001,Expense,Office Supplies,Staples,Monthly supplies,245.67,Operations,HQ,Cleared',
    '2026-03-01,1002,Expense,Ask My Accountant,Unknown charge,Needs review,389.55,,HQ,Open',
    '2026-03-02,1003,Sales Receipt,Consulting Revenue,Acme Corp,March retainers,8500,Advisory,US-East,Cleared',
    '2026-03-02,1004,Journal Entry,Travel Expense,,Top-side cleanup,5000,,HQ,Open',
    '2026-03-02,1005,Expense,Travel Expense,Delta,Client travel,1189.24,Advisory,US-East,Cleared',
    '2026-03-03,1006,Expense,Travel Expense,Delta,Client travel,1189.24,Advisory,US-East,Cleared',
    '2026-03-03,1007,Expense,Meals and Entertainment,Local Cafe,misc,1200,,HQ,Open',
    '2026-03-07,1008,Journal Entry,Marketing Expense,,Weekend accrual,10000,,HQ,Open',
    '2026-03-07,1009,Journal Entry,Marketing Expense,,Weekend accrual,10000,,HQ,Open',
    '2026-03-08,1010,Expense,Office Supplies,Staples,Monthly supplies,245.67,Operations,HQ,Cleared',
    '2026-03-09,1011,Expense,Consulting Expense,Beta Agency,March campaign,25600,Marketing,Remote,Cleared',
    '2026-03-10,1012,Expense,Consulting Expense,Beta Agency,March campaign,25600,Marketing,Remote,Cleared',
    '2026-03-10,1013,Expense,Uncategorized Expense,,No memo,780,,HQ,Open'
  ].join('\n');

  function createFlags(row, duplicateCounts, accountMedians) {
    const flags = [];
    const duplicateKey = [row.dateText, row.payeeNorm, row.memoNorm, row.amount.toFixed(2)].join('|');
    if ((duplicateCounts.get(duplicateKey) || 0) > 1) {
      flags.push({ label: 'Repeated transaction pattern' });
    }
    if (row.isUncategorized) {
      flags.push({ label: 'Uncategorized / suspense account', tone: 'warn' });
    }
    if (!row.className && !row.department) {
      flags.push({ label: 'Missing class and department', tone: 'warn' });
    }
    if (row.isWeekend) {
      flags.push({ label: 'Weekend posting', tone: 'warn' });
    }
    if (row.isRoundDollar) {
      flags.push({ label: 'Large round-dollar amount', tone: 'warn' });
    }
    if (row.isManualType) {
      flags.push({ label: 'Manual / journal-type entry', tone: 'warn' });
    }
    if (row.isOpenStatus) {
      flags.push({ label: 'Open or uncleared status', tone: 'warn' });
    }
    const medianAbs = accountMedians.get(row.accountNorm) || 0;
    if (medianAbs > 0 && Math.abs(row.amount) >= Math.max(medianAbs * 3, 1000)) {
      flags.push({ label: 'Amount deviates from account norm' });
    }
    if (!row.memo || row.memoNorm.length < 5 || row.memoNorm === 'misc' || row.memoNorm === 'needs review' || row.memoNorm === 'no memo') {
      flags.push({ label: 'Weak memo or description', tone: 'warn' });
    }
    return flags;
  }

  function mapRow(row, mapping, utils) {
    const amount = utils.parseNumber(mapping.amount ? row[mapping.amount] : null);
    if (amount == null) {
      return null;
    }
    const date = mapping.date ? utils.parseDate(row[mapping.date]) : null;
    const account = mapping.account ? String(row[mapping.account] || '').trim() : '';
    const payee = mapping.payee ? String(row[mapping.payee] || '').trim() : '';
    const memo = mapping.memo ? String(row[mapping.memo] || '').trim() : '';
    const type = mapping.type ? String(row[mapping.type] || '').trim() : '';
    const status = mapping.status ? String(row[mapping.status] || '').trim() : '';
    return {
      rowNumber: row.__rowNumber,
      date,
      dateText: date ? utils.toIsoDate(date) : '',
      transactionId: mapping.transactionId ? String(row[mapping.transactionId] || '').trim() : '',
      type,
      typeNorm: utils.normalizeText(type),
      account,
      accountNorm: utils.normalizeText(account),
      payee,
      payeeNorm: utils.normalizeText(payee),
      memo,
      memoNorm: utils.normalizeText(memo),
      amount,
      className: mapping.className ? String(row[mapping.className] || '').trim() : '',
      department: mapping.department ? String(row[mapping.department] || '').trim() : '',
      status,
      statusNorm: utils.normalizeText(status),
      isWeekend: date instanceof Date && [0, 6].includes(date.getDay()),
      isUncategorized: /ask my accountant|uncategorized|suspense|other expense|other income/.test(utils.normalizeText(account)),
      isRoundDollar: Math.abs(amount) >= 1000 && Math.abs(amount % 100) < 0.0001,
      isManualType: /journal|manual|adjustment/.test(utils.normalizeText(type)),
      isOpenStatus: /open|uncleared|unreconciled|not cleared/.test(utils.normalizeText(status))
    };
  }

  function analyze(rows, utils) {
    const duplicateCounts = new Map();
    const accountAmounts = new Map();
    const accountFlags = new Map();
    const payeeFlags = new Map();

    rows.forEach((row) => {
      const duplicateKey = [row.dateText, row.payeeNorm, row.memoNorm, row.amount.toFixed(2)].join('|');
      duplicateCounts.set(duplicateKey, (duplicateCounts.get(duplicateKey) || 0) + 1);
      if (!accountAmounts.has(row.accountNorm)) {
        accountAmounts.set(row.accountNorm, []);
      }
      accountAmounts.get(row.accountNorm).push(Math.abs(row.amount));
    });

    const accountMedians = new Map();
    accountAmounts.forEach((values, key) => {
      accountMedians.set(key, utils.median(values));
    });

    const reviewed = rows.map((row) => {
      const flags = createFlags(row, duplicateCounts, accountMedians);
      accountFlags.set(row.accountNorm, (accountFlags.get(row.accountNorm) || 0) + flags.length);
      payeeFlags.set(row.payeeNorm || '(blank)', (payeeFlags.get(row.payeeNorm || '(blank)') || 0) + flags.length);
      return Object.assign({}, row, { flags, flagCount: flags.length });
    });

    const flagged = reviewed.filter((row) => row.flagCount > 0).sort((left, right) => right.flagCount - left.flagCount || Math.abs(right.amount) - Math.abs(left.amount));
    const uncategorized = reviewed.filter((row) => row.isUncategorized).length;
    const missingSegments = reviewed.filter((row) => !row.className && !row.department).length;
    const duplicateCount = reviewed.filter((row) => row.flags.some((flag) => flag.label === 'Repeated transaction pattern')).length;

    const topAccounts = [...accountFlags.entries()].filter((entry) => entry[0]).sort((left, right) => right[1] - left[1]).slice(0, 3).map((entry) => entry[0] + ' (' + entry[1] + ' flags)');
    const topPayees = [...payeeFlags.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3).map((entry) => entry[0] + ' (' + entry[1] + ' flags)');

    return {
      statusMessage: 'Transaction analysis completed. Review the highest-risk QBO transactions first.',
      summary: [
        { label: 'Transactions reviewed', value: utils.formatNumber(reviewed.length), detail: 'Mapped QBO lines processed in the browser.' },
        { label: 'Flagged transactions', value: utils.formatNumber(flagged.length), detail: 'Transactions with at least one review signal.' },
        { label: 'Uncategorized lines', value: utils.formatNumber(uncategorized), detail: 'Ask My Accountant, uncategorized, or suspense-style activity.' },
        { label: 'Missing class / dept', value: utils.formatNumber(missingSegments), detail: 'Transactions missing both management-reporting dimensions.' }
      ],
      signalCards: [
        { label: 'Repeated patterns', value: utils.formatNumber(duplicateCount), detail: 'Possible reposts, duplicates, or recurring charges worth confirming.' },
        { label: 'Weekend / manual', value: utils.formatNumber(reviewed.filter((row) => row.isWeekend || row.isManualType).length), detail: 'Transactions that deserve extra close-period context.' },
        { label: 'Open / uncleared', value: utils.formatNumber(reviewed.filter((row) => row.isOpenStatus).length), detail: 'Useful for recon and cleanup before month-end sign-off.' }
      ],
      insightCards: [
        { title: 'Account hot spots', description: 'The categories attracting the most review flags in this export.', items: topAccounts.length ? topAccounts : ['No major account concentration detected.'] },
        { title: 'Payee concentration', description: 'Who appears most often in the current flagged set.', items: topPayees.length ? topPayees : ['No payee concentration detected.'] },
        { title: 'What this solves', description: 'QBO users often need a fast way to isolate uncategorized, duplicated, or segment-incomplete transactions before cleanup or close review.' }
      ],
      findingsColumns: [
        { key: 'dateText', label: 'Date' },
        { key: 'transactionId', label: 'No.' },
        { key: 'type', label: 'Type' },
        { key: 'payee', label: 'Payee' },
        { key: 'account', label: 'Account' },
        { key: 'amount', label: 'Amount', render: (row) => utils.escapeHtml(utils.formatMoney(row.amount)) },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      findingsRows: flagged,
      findingsEmpty: 'No high-risk transaction patterns were detected in the current file.',
      explorerColumns: [
        { key: 'dateText', label: 'Date' },
        { key: 'transactionId', label: 'No.' },
        { key: 'payee', label: 'Payee' },
        { key: 'account', label: 'Account' },
        { key: 'className', label: 'Class' },
        { key: 'department', label: 'Department' },
        { key: 'status', label: 'Status' },
        { key: 'amount', label: 'Amount', render: (row) => utils.escapeHtml(utils.formatMoney(row.amount)) },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      explorerRows: reviewed,
      exportRows: flagged.map((row) => ({
        Date: row.dateText,
        Number: row.transactionId,
        Type: row.type,
        Payee: row.payee,
        Account: row.account,
        Amount: row.amount,
        Class: row.className,
        Department: row.department,
        Status: row.status,
        Flags: row.flags.map((flag) => flag.label).join('; ')
      })),
      exportFileName: 'qbo-transaction-analyzer-flags.csv'
    };
  }

  function init() {
    if (!window.QBOCore) {
      return;
    }
    window.QBOCore.createSingleFileTool({
      rootId: 'qbo-transaction-analyzer-app',
      introStatus: 'Load a QBO transaction export or try the sample file to start.',
      analyzeButtonLabel: 'Analyze transactions',
      exportFileName: 'qbo-transaction-analyzer-flags.csv',
      sampleCsv: SAMPLE_CSV,
      fieldDefinitions: FIELD_DEFINITIONS,
      columnHints: COLUMN_HINTS,
      validateMapping: function (mapping) {
        return !mapping.amount || !mapping.account ? 'Map at least the account/category and signed amount columns before analyzing.' : '';
      },
      mapRow: mapRow,
      analyze: analyze,
      results: {
        signalsTitle: 'Top QBO transaction issues',
        signalsDescription: 'These are the problems affecting the largest share of the current export.',
        insightsTitle: 'Review insights',
        insightsDescription: 'Context that helps you decide where to clean up QBO first.',
        findingsTitle: 'Priority transaction queue',
        findingsDescription: 'Highest-value cleanup or review items at the top.',
        explorerTitle: 'Detailed transaction explorer',
        explorerDescription: 'Search all reviewed QBO transactions in the browser.'
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
