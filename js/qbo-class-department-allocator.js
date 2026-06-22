(function () {
  'use strict';

  const CURRENT_FIELD_DEFINITIONS = [
    { key: 'date', label: 'Transaction date', help: 'Useful for review context and export sequencing.', kind: 'date' },
    { key: 'transactionId', label: 'Transaction ID / No.', help: 'Useful for updating transactions back in QuickBooks.', kind: 'id' },
    { key: 'account', label: 'Account / category', help: 'Required for historical allocation rules.', kind: 'accountName' },
    { key: 'payee', label: 'Vendor / customer / payee', help: 'Useful for allocation pattern matching.', kind: 'name' },
    { key: 'memo', label: 'Memo / description', help: 'Used for text-based allocation rules.', kind: 'memo' },
    { key: 'amount', label: 'Amount', help: 'Used for review context and export output.', kind: 'amount' },
    { key: 'className', label: 'Class', help: 'Used to detect missing class assignments.', kind: 'class' },
    { key: 'department', label: 'Department / location', help: 'Used to detect missing location-style assignments.', kind: 'department' }
  ];

  const HISTORY_FIELD_DEFINITIONS = [
    { key: 'account', label: 'Historical account / category', help: 'Required for building reusable allocation patterns.', kind: 'accountName' },
    { key: 'payee', label: 'Historical vendor / customer / payee', help: 'Used for vendor-specific allocation rules.', kind: 'name' },
    { key: 'memo', label: 'Historical memo / description', help: 'Useful for recurring memo-based rules.', kind: 'memo' },
    { key: 'amount', label: 'Historical amount', help: 'Optional but useful for reviewer context.', kind: 'amount' },
    { key: 'className', label: 'Historical class', help: 'Required for learning class allocation patterns.', kind: 'class' },
    { key: 'department', label: 'Historical department / location', help: 'Required for learning department allocation patterns.', kind: 'department' }
  ];

  const CURRENT_COLUMN_HINTS = {
    date: ['date', 'transactiondate', 'postingdate'],
    transactionId: ['transactionid', 'txnno', 'num', 'number'],
    account: ['account', 'category', 'accountname'],
    payee: ['payee', 'name', 'vendor', 'customer'],
    memo: ['memo', 'description', 'details', 'message'],
    amount: ['amount', 'netamount', 'signedamount', 'value'],
    className: ['class', 'classname'],
    department: ['department', 'location', 'classlocation']
  };

  const HISTORY_COLUMN_HINTS = {
    account: ['account', 'category', 'accountname'],
    payee: ['payee', 'name', 'vendor', 'customer'],
    memo: ['memo', 'description', 'details', 'message'],
    amount: ['amount', 'netamount', 'signedamount', 'value'],
    className: ['class', 'classname'],
    department: ['department', 'location', 'classlocation']
  };

  const CURRENT_SAMPLE_CSV = [
    'Date,Num,Account,Name,Memo,Amount,Class,Location',
    '2026-03-01,3001,Advertising,Beta Agency,March paid social,12500,,',
    '2026-03-01,3002,Software & Apps,HubSpot,CRM license,2400,Sales,',
    '2026-03-02,3003,Travel Expense,Delta,Client travel,1189.24,,US-East',
    '2026-03-02,3004,Office Supplies,Staples,Monthly supplies,245.67,,',
    '2026-03-03,3005,Consulting Expense,Northwind,Implementation support,9200,,',
    '2026-03-03,3006,Rent Expense,Metro Realty,HQ office rent,9100,Operations,HQ'
  ].join('\n');

  const HISTORY_SAMPLE_CSV = [
    'Account,Name,Memo,Amount,Class,Location',
    'Advertising,Beta Agency,January paid social,11800,Marketing,Remote',
    'Advertising,Beta Agency,February paid social,12100,Marketing,Remote',
    'Software & Apps,HubSpot,CRM license,2400,Sales,Remote',
    'Travel Expense,Delta,Client travel,1022.18,Advisory,US-East',
    'Travel Expense,Delta,Client travel,1440.10,Advisory,US-East',
    'Office Supplies,Staples,Monthly supplies,233.90,Operations,HQ',
    'Consulting Expense,Northwind,Implementation support,9400,Delivery,US-East',
    'Consulting Expense,Northwind,Implementation support,9100,Delivery,US-East',
    'Rent Expense,Metro Realty,HQ office rent,9100,Operations,HQ'
  ].join('\n');

  function mapCurrentRow(row, mapping, utils) {
    const amount = utils.parseNumber(mapping.amount ? row[mapping.amount] : null);
    if (amount == null) {
      return null;
    }
    const date = mapping.date ? utils.parseDate(row[mapping.date]) : null;
    const account = mapping.account ? String(row[mapping.account] || '').trim() : '';
    if (!account) {
      return null;
    }
    const payee = mapping.payee ? String(row[mapping.payee] || '').trim() : '';
    const memo = mapping.memo ? String(row[mapping.memo] || '').trim() : '';
    return {
      rowNumber: row.__rowNumber,
      date,
      dateText: date ? utils.toIsoDate(date) : '',
      transactionId: mapping.transactionId ? String(row[mapping.transactionId] || '').trim() : '',
      account,
      accountNorm: utils.normalizeText(account),
      payee,
      payeeNorm: utils.normalizeText(payee),
      memo,
      memoNorm: utils.normalizeText(memo),
      amount,
      className: mapping.className ? String(row[mapping.className] || '').trim() : '',
      department: mapping.department ? String(row[mapping.department] || '').trim() : ''
    };
  }

  function mapHistoryRow(row, mapping, utils) {
    const account = mapping.account ? String(row[mapping.account] || '').trim() : '';
    if (!account) {
      return null;
    }
    const className = mapping.className ? String(row[mapping.className] || '').trim() : '';
    const department = mapping.department ? String(row[mapping.department] || '').trim() : '';
    if (!className && !department) {
      return null;
    }
    const payee = mapping.payee ? String(row[mapping.payee] || '').trim() : '';
    const memo = mapping.memo ? String(row[mapping.memo] || '').trim() : '';
    const amount = utils.parseNumber(mapping.amount ? row[mapping.amount] : null);
    return {
      rowNumber: row.__rowNumber,
      account,
      accountNorm: utils.normalizeText(account),
      payee,
      payeeNorm: utils.normalizeText(payee),
      memo,
      memoNorm: utils.normalizeText(memo),
      amount,
      className,
      department
    };
  }

  function registerRule(store, key, className, department) {
    if (!key) {
      return;
    }
    if (!store.has(key)) {
      store.set(key, { total: 0, combos: new Map() });
    }
    const bucket = store.get(key);
    bucket.total += 1;
    const comboKey = [className || '', department || ''].join('|');
    bucket.combos.set(comboKey, (bucket.combos.get(comboKey) || 0) + 1);
  }

  function pickBestCombo(bucket) {
    if (!bucket || !bucket.combos.size) {
      return null;
    }
    const ranked = [...bucket.combos.entries()].sort((left, right) => right[1] - left[1]);
    const best = ranked[0];
    const next = ranked[1];
    const confidence = best[1] / bucket.total;
    return {
      className: best[0].split('|')[0],
      department: best[0].split('|')[1],
      support: best[1],
      total: bucket.total,
      confidence,
      contested: !!next && next[1] === best[1]
    };
  }

  function getSuggestion(row, rules) {
    const candidates = [
      { key: row.accountNorm + '|' + row.payeeNorm, basis: 'Historical account + payee rule', weight: 4 },
      { key: row.accountNorm + '|' + row.memoNorm, basis: 'Historical account + memo rule', weight: 3 },
      { key: 'payee:' + row.payeeNorm, basis: 'Historical payee rule', weight: 2 },
      { key: 'account:' + row.accountNorm, basis: 'Historical account rule', weight: 1 }
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const best = pickBestCombo(rules.get(candidate.key));
      if (!best) {
        continue;
      }
      const confidenceScore = best.confidence + (candidate.weight * 0.08);
      const confidence = confidenceScore >= 0.95 ? 'High' : confidenceScore >= 0.78 ? 'Medium' : 'Low';
      return {
        className: row.className || best.className,
        department: row.department || best.department,
        basis: candidate.basis,
        support: best.support,
        total: best.total,
        confidence,
        contested: best.contested
      };
    }
    return null;
  }

  function analyze(datasets, utils) {
    const currentRows = datasets.current;
    const historyRows = datasets.history;
    const rules = new Map();

    historyRows.forEach((row) => {
      registerRule(rules, row.accountNorm + '|' + row.payeeNorm, row.className, row.department);
      registerRule(rules, row.accountNorm + '|' + row.memoNorm, row.className, row.department);
      registerRule(rules, 'payee:' + row.payeeNorm, row.className, row.department);
      registerRule(rules, 'account:' + row.accountNorm, row.className, row.department);
    });

    const reviewed = currentRows.map((row) => {
      const suggestion = (!row.className || !row.department) ? getSuggestion(row, rules) : null;
      const flags = [];
      if (!row.className) {
        flags.push({ label: 'Missing class', tone: 'warn' });
      }
      if (!row.department) {
        flags.push({ label: 'Missing department / location', tone: 'warn' });
      }
      if (suggestion) {
        flags.push({ label: suggestion.confidence + ' confidence suggestion', tone: suggestion.confidence === 'High' ? 'good' : 'warn' });
        if (suggestion.contested) {
          flags.push({ label: 'Historical rule split across combinations', tone: 'warn' });
        }
      } else if (flags.length) {
        flags.push({ label: 'No historical rule found', tone: 'warn' });
      }
      return Object.assign({}, row, {
        suggestion,
        flags,
        suggestionClass: suggestion ? suggestion.className : row.className,
        suggestionDepartment: suggestion ? suggestion.department : row.department
      });
    });

    const needsAllocation = reviewed.filter((row) => !row.className || !row.department);
    const suggested = needsAllocation.filter((row) => row.suggestion);
    const highConfidence = suggested.filter((row) => row.suggestion.confidence === 'High');
    const noRule = needsAllocation.filter((row) => !row.suggestion);

    const topRuleAccounts = [...new Set(suggested.map((row) => row.account))].slice(0, 3);

    return {
      statusMessage: 'Allocation analysis completed. Start with the high-confidence suggestions, then review the unresolved rows.',
      summary: [
        { label: 'Current rows reviewed', value: utils.formatNumber(reviewed.length), detail: 'Transactions loaded from the current QBO export.' },
        { label: 'Rows needing allocation', value: utils.formatNumber(needsAllocation.length), detail: 'Transactions missing class, department, or both.' },
        { label: 'Suggested allocations', value: utils.formatNumber(suggested.length), detail: 'Rows where historical behavior produced a proposed allocation.' },
        { label: 'High-confidence rows', value: utils.formatNumber(highConfidence.length), detail: 'Rows where the same class/location combination appears consistently in history.' }
      ],
      signalCards: [
        { label: 'Missing both fields', value: utils.formatNumber(reviewed.filter((row) => !row.className && !row.department).length), detail: 'Transactions missing both class and department/location.' },
        { label: 'Missing class only', value: utils.formatNumber(reviewed.filter((row) => !row.className && row.department).length), detail: 'Useful when class tracking is incomplete but location exists.' },
        { label: 'No-rule rows', value: utils.formatNumber(noRule.length), detail: 'Transactions that still need manual judgment because history was weak or absent.' }
      ],
      insightCards: [
        { title: 'What this solves', description: 'QBO class and location tracking exist, but cleanup still turns into spreadsheet work when current transactions are missing coding and reviewers need a defensible starting point.' },
        { title: 'How suggestions are generated', description: 'This tool looks for repeated historical combinations by account + payee first, then falls back to memo, payee, and account-only patterns.' },
        { title: 'Likely hot spots', description: 'The current export shows repeated allocation opportunities in these accounts.', items: topRuleAccounts.length ? topRuleAccounts : ['No strong concentration detected in the current sample.'] }
      ],
      findingsColumns: [
        { key: 'dateText', label: 'Date' },
        { key: 'transactionId', label: 'No.' },
        { key: 'account', label: 'Account' },
        { key: 'payee', label: 'Payee' },
        { key: 'currentCoding', label: 'Current coding' },
        { key: 'suggestedCoding', label: 'Suggested coding' },
        { key: 'confidence', label: 'Confidence' },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      findingsRows: needsAllocation.map((row) => ({
        dateText: row.dateText,
        transactionId: row.transactionId,
        account: row.account,
        payee: row.payee,
        currentCoding: [row.className || 'No class', row.department || 'No department'].join(' / '),
        suggestedCoding: row.suggestion ? [row.suggestionClass || 'No class', row.suggestionDepartment || 'No department'].join(' / ') : 'No suggestion',
        confidence: row.suggestion ? row.suggestion.confidence : 'None',
        flags: row.flags
      })),
      findingsEmpty: 'All current rows already contain class and department/location assignments.',
      explorerColumns: [
        { key: 'dateText', label: 'Date' },
        { key: 'transactionId', label: 'No.' },
        { key: 'account', label: 'Account' },
        { key: 'payee', label: 'Payee' },
        { key: 'amount', label: 'Amount', render: (row) => utils.escapeHtml(utils.formatMoney(row.amount)) },
        { key: 'className', label: 'Current class' },
        { key: 'department', label: 'Current department' },
        { key: 'suggestionBasis', label: 'Rule basis' },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      explorerRows: reviewed.map((row) => Object.assign({}, row, { suggestionBasis: row.suggestion ? row.suggestion.basis : '' })),
      exportRows: needsAllocation.map((row) => ({
        Date: row.dateText,
        TransactionID: row.transactionId,
        Account: row.account,
        Payee: row.payee,
        Memo: row.memo,
        Amount: row.amount,
        CurrentClass: row.className,
        CurrentDepartment: row.department,
        SuggestedClass: row.suggestionClass || '',
        SuggestedDepartment: row.suggestionDepartment || '',
        Confidence: row.suggestion ? row.suggestion.confidence : 'None',
        RuleBasis: row.suggestion ? row.suggestion.basis : '',
        Flags: row.flags.map((flag) => flag.label).join('; ')
      })),
      exportFileName: 'qbo-class-department-allocation.csv'
    };
  }

  function init() {
    if (!window.QBOCore) {
      return;
    }
    window.QBOCore.createDualFileTool({
      rootId: 'qbo-class-department-allocator-app',
      exportFileName: 'qbo-class-department-allocation.csv',
      datasets: [
        {
          key: 'current',
          title: 'Current transactions export',
          introStatus: 'Load the current QBO transactions that need class/location review.',
          sampleCsv: CURRENT_SAMPLE_CSV,
          fieldDefinitions: CURRENT_FIELD_DEFINITIONS,
          columnHints: CURRENT_COLUMN_HINTS,
          validateMapping: function (mapping) {
            return !mapping.account || !mapping.amount ? 'Map at least account/category and amount for the current export.' : '';
          },
          mapRow: mapCurrentRow
        },
        {
          key: 'history',
          title: 'Historical classified export',
          introStatus: 'Load a historical QBO export that already contains class/location coding.',
          sampleCsv: HISTORY_SAMPLE_CSV,
          fieldDefinitions: HISTORY_FIELD_DEFINITIONS,
          columnHints: HISTORY_COLUMN_HINTS,
          validateMapping: function (mapping) {
            return !mapping.account || (!mapping.className && !mapping.department) ? 'Map account and at least one historical class or department column.' : '';
          },
          mapRow: mapHistoryRow
        }
      ],
      analyze: analyze,
      results: {
        signalsTitle: 'Top allocation issues',
        signalsDescription: 'These are the missing-segment patterns creating the most reporting cleanup work.',
        insightsTitle: 'Allocation insights',
        insightsDescription: 'Use these patterns to decide where historical coding is trustworthy enough to reuse.',
        findingsTitle: 'Allocation suggestion queue',
        findingsDescription: 'Rows missing coding rise to the top with a suggested class/location combination when one exists.',
        explorerTitle: 'Detailed allocation explorer',
        explorerDescription: 'Search every current row and review the rule basis behind each suggestion.'
      }
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CURRENT_FIELD_DEFINITIONS,
      HISTORY_FIELD_DEFINITIONS,
      CURRENT_COLUMN_HINTS,
      HISTORY_COLUMN_HINTS,
      CURRENT_SAMPLE_CSV,
      HISTORY_SAMPLE_CSV,
      mapCurrentRow,
      mapHistoryRow,
      analyze
    };
  }
}());
