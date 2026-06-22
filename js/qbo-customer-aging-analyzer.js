(function () {
  'use strict';

  const FIELD_DEFINITIONS = [
    { key: 'customer', label: 'Customer', help: 'Required for concentration and collection-priority review.', kind: 'customer' },
    { key: 'invoice', label: 'Invoice / transaction ID', help: 'Useful for detailed follow-up.', kind: 'id' },
    { key: 'invoiceDate', label: 'Invoice date', help: 'Optional but useful for aging context.', kind: 'date' },
    { key: 'dueDate', label: 'Due date', help: 'Recommended for priority and stale-item review.', kind: 'dueDate' },
    { key: 'current', label: 'Current bucket', help: 'Optional if your aging export already includes a total balance.', kind: 'amount' },
    { key: 'days30', label: '1-30 days', help: 'Used for overdue bucket analysis.', kind: 'amount' },
    { key: 'days60', label: '31-60 days', help: 'Used for overdue bucket analysis.', kind: 'amount' },
    { key: 'days90', label: '61-90 days', help: 'Used for overdue bucket analysis.', kind: 'amount' },
    { key: 'days90plus', label: '90+ days', help: 'Used for high-risk aging analysis.', kind: 'amount' },
    { key: 'balance', label: 'Total balance', help: 'Optional if your aging report already includes a balance column.', kind: 'balance' },
    { key: 'terms', label: 'Terms', help: 'Useful for identifying missing credit terms.', kind: 'terms' }
  ];

  const COLUMN_HINTS = {
    customer: ['customer', 'name'],
    invoice: ['invoice', 'invno', 'transactionid', 'docno', 'number'],
    invoiceDate: ['invoicedate', 'date'],
    dueDate: ['duedate', 'due'],
    current: ['current'],
    days30: ['130', '1 30', '30'],
    days60: ['3160', '31 60', '60'],
    days90: ['6190', '61 90', '90'],
    days90plus: ['90plus', '90', 'over90', 'over 90', '91'],
    balance: ['balance', 'openbalance', 'amountdue'],
    terms: ['terms', 'paymentterms']
  };

  const SAMPLE_CSV = [
    'Customer,Invoice,Invoice Date,Due Date,Current,1-30,31-60,61-90,90+,Balance,Terms',
    'Acme Corp,INV-1001,2026-01-15,2026-02-14,0,0,12000,0,0,12000,Net 30',
    'Acme Corp,INV-1002,2026-02-20,2026-03-21,18500,0,0,0,0,18500,Net 30',
    'Bright Labs,INV-1003,2025-12-10,2026-01-09,0,0,0,9200,5400,14600,Net 30',
    'Northwind,INV-1004,2026-02-01,2026-03-02,4200,0,0,0,0,4200,',
    'Northwind,CM-1005,2026-02-18,2026-02-18,0,0,0,0,-900,-900,Due on receipt',
    'Summit Health,INV-1006,2025-11-15,2025-12-15,0,0,0,0,22800,22800,Net 30',
    'Studio 8,INV-1007,2026-03-01,2026-03-31,7600,0,0,0,0,7600,Net 30'
  ].join('\n');

  function mapRow(row, mapping, utils) {
    const customer = mapping.customer ? String(row[mapping.customer] || '').trim() : '';
    if (!customer) {
      return null;
    }
    const current = mapping.current ? utils.parseNumber(row[mapping.current]) || 0 : 0;
    const days30 = mapping.days30 ? utils.parseNumber(row[mapping.days30]) || 0 : 0;
    const days60 = mapping.days60 ? utils.parseNumber(row[mapping.days60]) || 0 : 0;
    const days90 = mapping.days90 ? utils.parseNumber(row[mapping.days90]) || 0 : 0;
    const days90plus = mapping.days90plus ? utils.parseNumber(row[mapping.days90plus]) || 0 : 0;
    const balance = mapping.balance ? utils.parseNumber(row[mapping.balance]) : null;
    const totalBalance = balance != null ? balance : current + days30 + days60 + days90 + days90plus;
    return {
      rowNumber: row.__rowNumber,
      customer,
      invoice: mapping.invoice ? String(row[mapping.invoice] || '').trim() : '',
      invoiceDate: mapping.invoiceDate ? utils.parseDate(row[mapping.invoiceDate]) : null,
      dueDate: mapping.dueDate ? utils.parseDate(row[mapping.dueDate]) : null,
      current,
      days30,
      days60,
      days90,
      days90plus,
      balance: totalBalance,
      overdue: days30 + days60 + days90 + days90plus,
      terms: mapping.terms ? String(row[mapping.terms] || '').trim() : ''
    };
  }

  function analyze(rows, utils) {
    const customerTotals = new Map();
    rows.forEach((row) => {
      if (!customerTotals.has(row.customer)) {
        customerTotals.set(row.customer, { balance: 0, overdue: 0, over90: 0, invoices: 0, missingTerms: 0 });
      }
      const bucket = customerTotals.get(row.customer);
      bucket.balance += row.balance;
      bucket.overdue += row.overdue;
      bucket.over90 += row.days90plus;
      bucket.invoices += 1;
      bucket.missingTerms += row.terms ? 0 : 1;
    });

    const customerRows = [...customerTotals.entries()].map((entry) => ({
      customer: entry[0],
      balance: entry[1].balance,
      overdue: entry[1].overdue,
      over90: entry[1].over90,
      invoices: entry[1].invoices,
      missingTerms: entry[1].missingTerms,
      flags: [
        entry[1].over90 > 0 ? { label: '90+ past due' } : null,
        entry[1].balance < 0 ? { label: 'Credit balance', tone: 'warn' } : null,
        entry[1].missingTerms > 0 ? { label: 'Missing terms', tone: 'warn' } : null,
        entry[1].overdue > 0 && entry[1].overdue / Math.max(entry[1].balance, 1) > 0.5 ? { label: 'Major overdue exposure', tone: 'warn' } : null
      ].filter(Boolean)
    })).sort((left, right) => right.overdue - left.overdue || right.balance - left.balance);

    const totalBalance = utils.sum(rows.map((row) => row.balance));
    const overdueBalance = utils.sum(rows.map((row) => row.overdue));
    const over90Balance = utils.sum(rows.map((row) => row.days90plus));
    const flaggedCustomers = customerRows.filter((row) => row.flags.length > 0);
    const topConcentration = customerRows.slice(0, 3).map((row) => row.customer + ' (' + utils.formatMoney(row.balance) + ')');

    return {
      statusMessage: 'Customer aging analysis completed. Start with the biggest overdue and 90+ exposures first.',
      summary: [
        { label: 'Customers reviewed', value: utils.formatNumber(customerRows.length), detail: 'Distinct customers found in the current aging export.' },
        { label: 'Total receivables', value: utils.formatMoney(totalBalance), detail: 'Combined open balance across the mapped aging rows.' },
        { label: 'Overdue balance', value: utils.formatMoney(overdueBalance), detail: 'Amount currently sitting outside the current bucket.' },
        { label: '90+ exposure', value: utils.formatMoney(over90Balance), detail: 'Highest-risk portion of the current aging file.' }
      ],
      signalCards: [
        { label: 'Customers with flags', value: utils.formatNumber(flaggedCustomers.length), detail: 'Customers with 90+, credit, or missing-terms issues.' },
        { label: 'Credit balances', value: utils.formatNumber(customerRows.filter((row) => row.balance < 0).length), detail: 'Useful for refund, application, or cleanup review.' },
        { label: 'Missing terms', value: utils.formatNumber(customerRows.filter((row) => row.missingTerms > 0).length), detail: 'Customers missing terms data in the current export.' }
      ],
      insightCards: [
        { title: 'Concentration risk', description: 'Customers with the biggest total balance in the current aging file.', items: topConcentration.length ? topConcentration : ['No major concentration detected.'] },
        { title: 'Why users need this', description: 'QBO aging reports are useful, but teams still end up in spreadsheets to rank overdue customers, isolate 90+ exposure, and spot credits or missing terms.' },
        { title: 'Collection order', description: 'Prioritize 90+ customers first, then large overdue balances, then credits or missing-terms accounts that may block a clean follow-up sequence.' }
      ],
      findingsColumns: [
        { key: 'customer', label: 'Customer' },
        { key: 'balance', label: 'Balance', render: (row) => utils.escapeHtml(utils.formatMoney(row.balance)) },
        { key: 'overdue', label: 'Overdue', render: (row) => utils.escapeHtml(utils.formatMoney(row.overdue)) },
        { key: 'over90', label: '90+', render: (row) => utils.escapeHtml(utils.formatMoney(row.over90)) },
        { key: 'invoices', label: 'Invoices' },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      findingsRows: flaggedCustomers,
      findingsEmpty: 'No major customer-aging issues were detected in the current export.',
      explorerColumns: [
        { key: 'customer', label: 'Customer' },
        { key: 'invoice', label: 'Invoice' },
        { key: 'balance', label: 'Balance', render: (row) => utils.escapeHtml(utils.formatMoney(row.balance)) },
        { key: 'overdue', label: 'Overdue', render: (row) => utils.escapeHtml(utils.formatMoney(row.overdue)) },
        { key: 'days90plus', label: '90+', render: (row) => utils.escapeHtml(utils.formatMoney(row.days90plus)) },
        { key: 'terms', label: 'Terms' }
      ],
      explorerRows: rows,
      exportRows: customerRows.map((row) => ({
        Customer: row.customer,
        Balance: row.balance,
        Overdue: row.overdue,
        Over90: row.over90,
        InvoiceCount: row.invoices,
        MissingTerms: row.missingTerms,
        Flags: row.flags.map((flag) => flag.label).join('; ')
      })),
      exportFileName: 'qbo-customer-aging-analysis.csv'
    };
  }

  function init() {
    if (!window.QBOCore) { return; }
    window.QBOCore.createSingleFileTool({
      rootId: 'qbo-customer-aging-analyzer-app',
      introStatus: 'Load a QBO aging export or try the sample file to start.',
      analyzeButtonLabel: 'Analyze aging',
      exportFileName: 'qbo-customer-aging-analysis.csv',
      sampleCsv: SAMPLE_CSV,
      fieldDefinitions: FIELD_DEFINITIONS,
      columnHints: COLUMN_HINTS,
      validateMapping: function (mapping) {
        return !mapping.customer || (!mapping.balance && !mapping.current && !mapping.days30) ? 'Map the customer and either total balance or aging bucket columns before analyzing.' : '';
      },
      mapRow: mapRow,
      analyze: analyze,
      results: {
        signalsTitle: 'Top aging issues',
        signalsDescription: 'These are the customers creating the most collection or cleanup pressure right now.',
        insightsTitle: 'Collection insights',
        insightsDescription: 'Use these patterns to prioritize QBO collection and cleanup work.',
        findingsTitle: 'Priority customer queue',
        findingsDescription: 'Start here when you need the highest-risk aging issues first.',
        explorerTitle: 'Detailed aging explorer',
        explorerDescription: 'Search the invoice-level aging rows directly in the browser.'
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
