(function () {
  'use strict';

  const FIELD_DEFINITIONS = [
    { key: 'accountNumber', label: 'Account number', help: 'Used for numbering consistency and duplicate-number checks.', kind: 'code' },
    { key: 'accountName', label: 'Account name', help: 'Required for duplicate-name and naming-cleanup review.', kind: 'accountName' },
    { key: 'type', label: 'Account type', help: 'Helpful for grouping cleanup priorities.', kind: 'type' },
    { key: 'detailType', label: 'Detail type', help: 'Useful for spotting missing or weak type assignments.', kind: 'type' },
    { key: 'parent', label: 'Parent account', help: 'Used for subaccount structure checks.', kind: 'name' },
    { key: 'subaccount', label: 'Subaccount flag', help: 'Optional but helpful for hierarchy validation.', kind: 'boolean' },
    { key: 'active', label: 'Active / inactive', help: 'Used for inactive duplicate checks.', kind: 'status' },
    { key: 'description', label: 'Description', help: 'Optional context for cleanup recommendations.', kind: 'memo' },
    { key: 'balance', label: 'Balance', help: 'Useful for prioritizing cleanup on still-used accounts.', kind: 'balance' }
  ];

  const COLUMN_HINTS = {
    accountNumber: ['accountnumber', 'number', 'acctno', 'accountno'],
    accountName: ['accountname', 'name', 'account'],
    type: ['type', 'accounttype'],
    detailType: ['detailtype', 'detail'],
    parent: ['parent', 'parentaccount'],
    subaccount: ['subaccount', 'issubaccount'],
    active: ['active', 'status', 'inactive'],
    description: ['description', 'desc', 'notes'],
    balance: ['balance', 'currentbalance']
  };

  const SAMPLE_CSV = [
    'Number,Name,Type,Detail Type,Parent Account,Subaccount,Active,Description,Balance',
    '1000,Checking,Bank,Cash on hand,,,Active,Primary operating account,154322.11',
    '1200,Accounts Receivable,Accounts Receivable,Accounts Receivable,,,Active,,48221.00',
    '5000,Travel Expense,Expense,Travel,,,Active,,12845.22',
    '5001,travel expense,Expense,Travel,,,Inactive,Old duplicate,0',
    ',Misc Expense,Expense,,,No,Active,Legacy catch-all,455.00',
    '6999,Ask My Accountant,Expense,Other Miscellaneous Expense,,,Active,,910.00',
    '7000,Office Supplies,Expense,Office General Administrative Expenses,,,Active,,2311.33',
    '7000,Office Supplies Duplicate,Expense,Office General Administrative Expenses,,,Inactive,Duplicate number,0',
    '8000,Marketing:Digital,Expense,Advertising/Promotional,Marketing,Yes,Active,,8112.00',
    '8001,Marketing Digital,Expense,Advertising/Promotional,,,Active,Split naming style,6330.00',
    '9000,Old Temp Account,Expense,,,No,Inactive,Test account,0',
    '9100,Payroll Liabilities,Other Current Liability,Payroll Tax Payable,,,Active,,18890.10'
  ].join('\n');

  function parseBoolean(value, utils) {
    const text = utils.normalizeText(value);
    return /yes|true|active|1|y/.test(text);
  }

  function suggestAction(row, duplicateNames, duplicateNumbers, numberingCoverage) {
    if (duplicateNumbers.has(row.accountNumber) && row.accountNumber) {
      return 'Resolve duplicate account number and keep only one active version.';
    }
    if (duplicateNames.has(row.nameNorm)) {
      return 'Merge or rename duplicate account names to one reporting standard.';
    }
    if (row.isMessyName) {
      return 'Rename with a cleaner, business-meaningful account name.';
    }
    if (row.missingNumber && numberingCoverage >= 0.5) {
      return 'Assign an account number or decide that this chart will stay unnumbered.';
    }
    if (row.parentMismatch) {
      return 'Fix the parent/subaccount structure so hierarchy is explicit.';
    }
    if (row.missingDetailType) {
      return 'Fill in the detail type to improve reporting consistency.';
    }
    return 'Review naming and usage before the next reporting cycle.';
  }

  function mapRow(row, mapping, utils) {
    const accountName = mapping.accountName ? String(row[mapping.accountName] || '').trim() : '';
    if (!accountName) {
      return null;
    }
    const accountNumber = mapping.accountNumber ? String(row[mapping.accountNumber] || '').trim() : '';
    const type = mapping.type ? String(row[mapping.type] || '').trim() : '';
    const detailType = mapping.detailType ? String(row[mapping.detailType] || '').trim() : '';
    const parent = mapping.parent ? String(row[mapping.parent] || '').trim() : '';
    const active = mapping.active ? String(row[mapping.active] || '').trim() : '';
    return {
      rowNumber: row.__rowNumber,
      accountNumber,
      accountName,
      nameNorm: utils.normalizeText(accountName),
      type,
      detailType,
      parent,
      isSubaccount: mapping.subaccount ? parseBoolean(row[mapping.subaccount], utils) : Boolean(parent),
      isActive: mapping.active ? parseBoolean(active, utils) : true,
      activeText: active || 'Active',
      description: mapping.description ? String(row[mapping.description] || '').trim() : '',
      balance: mapping.balance ? utils.parseNumber(row[mapping.balance]) || 0 : 0,
      isMessyName: /ask my accountant|misc|temp|test|other|old/.test(utils.normalizeText(accountName)),
      missingDetailType: !detailType,
      parentMismatch: (mapping.subaccount ? parseBoolean(row[mapping.subaccount], utils) : false) && !parent,
      missingNumber: !accountNumber
    };
  }

  function analyze(rows, utils) {
    const duplicateNames = new Map();
    const duplicateNumbers = new Map();
    let numberedAccounts = 0;

    rows.forEach((row) => {
      duplicateNames.set(row.nameNorm, (duplicateNames.get(row.nameNorm) || 0) + 1);
      if (row.accountNumber) {
        numberedAccounts += 1;
        duplicateNumbers.set(row.accountNumber, (duplicateNumbers.get(row.accountNumber) || 0) + 1);
      }
    });

    const numberingCoverage = rows.length ? numberedAccounts / rows.length : 0;
    const reviewed = rows.map((row) => {
      const flags = [];
      if ((duplicateNames.get(row.nameNorm) || 0) > 1) {
        flags.push({ label: 'Duplicate account name' });
      }
      if (row.accountNumber && (duplicateNumbers.get(row.accountNumber) || 0) > 1) {
        flags.push({ label: 'Duplicate account number' });
      }
      if (row.isMessyName) {
        flags.push({ label: 'Messy or catch-all account name', tone: 'warn' });
      }
      if (row.missingNumber && numberingCoverage >= 0.5) {
        flags.push({ label: 'Missing number in numbered chart', tone: 'warn' });
      }
      if (row.missingDetailType) {
        flags.push({ label: 'Missing detail type', tone: 'warn' });
      }
      if (row.parentMismatch) {
        flags.push({ label: 'Parent/subaccount mismatch', tone: 'warn' });
      }
      if (!row.isActive && (duplicateNames.get(row.nameNorm) || 0) > 1) {
        flags.push({ label: 'Inactive duplicate still in chart', tone: 'warn' });
      }
      return Object.assign({}, row, {
        flags,
        flagCount: flags.length,
        recommendedAction: suggestAction(row, duplicateNames, duplicateNumbers, numberingCoverage)
      });
    });

    const flagged = reviewed.filter((row) => row.flagCount > 0).sort((left, right) => right.flagCount - left.flagCount || Math.abs(right.balance) - Math.abs(left.balance));
    const duplicateNameCount = reviewed.filter((row) => row.flags.some((flag) => flag.label === 'Duplicate account name')).length;
    const duplicateNumberCount = reviewed.filter((row) => row.flags.some((flag) => flag.label === 'Duplicate account number')).length;
    const inactiveDuplicates = reviewed.filter((row) => !row.isActive && row.flags.some((flag) => flag.label === 'Inactive duplicate still in chart')).length;

    const typeHotspots = new Map();
    flagged.forEach((row) => {
      typeHotspots.set(row.type || 'Unassigned', (typeHotspots.get(row.type || 'Unassigned') || 0) + 1);
    });
    const hotspotList = [...typeHotspots.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3).map((entry) => entry[0] + ' (' + entry[1] + ' accounts)');

    return {
      statusMessage: 'Chart-of-accounts cleanup review completed. Focus on duplicate, messy, and structurally weak accounts first.',
      summary: [
        { label: 'Accounts reviewed', value: utils.formatNumber(reviewed.length), detail: 'Rows processed from the current QBO chart export.' },
        { label: 'Cleanup priorities', value: utils.formatNumber(flagged.length), detail: 'Accounts with at least one cleanup signal.' },
        { label: 'Duplicate groups', value: utils.formatNumber(duplicateNameCount + duplicateNumberCount), detail: 'Name or number collisions that can distort reporting.' },
        { label: 'Numbering coverage', value: utils.formatPercent(numberingCoverage * 100), detail: 'How much of the chart currently uses account numbers.' }
      ],
      signalCards: [
        { label: 'Duplicate names', value: utils.formatNumber(duplicateNameCount), detail: 'Same or nearly same account names that should be merged or renamed.' },
        { label: 'Duplicate numbers', value: utils.formatNumber(duplicateNumberCount), detail: 'Account number collisions that need a single standard owner.' },
        { label: 'Inactive duplicates', value: utils.formatNumber(inactiveDuplicates), detail: 'Inactive leftovers that still mirror an active account.' }
      ],
      insightCards: [
        { title: 'Type hotspots', description: 'Account types with the most cleanup flags in this export.', items: hotspotList.length ? hotspotList : ['No major type concentration detected.'] },
        { title: 'Why users need this', description: 'QBO charts often grow through quick fixes, duplicate imports, and advisor handoffs. This tool surfaces the naming, numbering, and hierarchy gaps that make reporting harder.' },
        { title: 'Best next step', description: 'Resolve duplicate names and numbers first, then clean catch-all accounts and missing detail types before adding new accounts.' }
      ],
      findingsColumns: [
        { key: 'accountNumber', label: 'No.' },
        { key: 'accountName', label: 'Account name' },
        { key: 'type', label: 'Type' },
        { key: 'detailType', label: 'Detail type' },
        { key: 'balance', label: 'Balance', render: (row) => utils.escapeHtml(utils.formatMoney(row.balance)) },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) },
        { key: 'recommendedAction', label: 'Recommended action' }
      ],
      findingsRows: flagged,
      findingsEmpty: 'No major chart-cleanup issues were detected in the current export.',
      explorerColumns: [
        { key: 'accountNumber', label: 'No.' },
        { key: 'accountName', label: 'Account name' },
        { key: 'type', label: 'Type' },
        { key: 'activeText', label: 'Status' },
        { key: 'parent', label: 'Parent' },
        { key: 'balance', label: 'Balance', render: (row) => utils.escapeHtml(utils.formatMoney(row.balance)) },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      explorerRows: reviewed,
      exportRows: flagged.map((row) => ({
        AccountNumber: row.accountNumber,
        AccountName: row.accountName,
        Type: row.type,
        DetailType: row.detailType,
        Parent: row.parent,
        Active: row.activeText,
        Balance: row.balance,
        Flags: row.flags.map((flag) => flag.label).join('; '),
        RecommendedAction: row.recommendedAction
      })),
      exportFileName: 'qbo-chart-of-accounts-cleanup.csv'
    };
  }

  function init() {
    if (!window.QBOCore) { return; }
    window.QBOCore.createSingleFileTool({
      rootId: 'qbo-chart-of-accounts-cleaner-app',
      introStatus: 'Load a QBO chart of accounts export or try the sample file to start.',
      analyzeButtonLabel: 'Review chart',
      exportFileName: 'qbo-chart-of-accounts-cleanup.csv',
      sampleCsv: SAMPLE_CSV,
      fieldDefinitions: FIELD_DEFINITIONS,
      columnHints: COLUMN_HINTS,
      validateMapping: function (mapping) {
        return !mapping.accountName ? 'Map at least the account name column before reviewing the chart.' : '';
      },
      mapRow: mapRow,
      analyze: analyze,
      results: {
        signalsTitle: 'Top chart cleanup issues',
        signalsDescription: 'These are the naming, numbering, and hierarchy problems surfacing most often.',
        insightsTitle: 'Cleanup insights',
        insightsDescription: 'Use these patterns to decide which chart fixes belong in the next cleanup pass.',
        findingsTitle: 'Priority cleanup queue',
        findingsDescription: 'Accounts to rename, merge, renumber, or restructure first.',
        explorerTitle: 'Detailed chart explorer',
        explorerDescription: 'Search all reviewed QBO accounts in the browser.'
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
