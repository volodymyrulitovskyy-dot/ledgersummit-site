(function () {
  'use strict';

  const LIABILITY_FIELD_DEFINITIONS = [
    { key: 'date', label: 'Liability date / period end', help: 'Used for period grouping and timing review.', kind: 'date' },
    { key: 'agency', label: 'Tax agency', help: 'Required for agency-level reconciliation.', kind: 'name' },
    { key: 'taxType', label: 'Tax type', help: 'Useful for payroll tax review context.', kind: 'type' },
    { key: 'liabilityAccount', label: 'Liability account', help: 'Helpful for GL-side follow-up.', kind: 'accountName' },
    { key: 'employeeTax', label: 'Employee tax', help: 'Optional if your report already includes a total due amount.', kind: 'amount' },
    { key: 'employerTax', label: 'Employer tax', help: 'Optional if your report already includes a total due amount.', kind: 'amount' },
    { key: 'amountDue', label: 'Total amount due', help: 'Required unless employee and employer taxes are both present.', kind: 'amount' }
  ];

  const PAYMENT_FIELD_DEFINITIONS = [
    { key: 'date', label: 'Payment date', help: 'Used for timing review against liability periods.', kind: 'date' },
    { key: 'payee', label: 'Payee / agency', help: 'Required for agency matching.', kind: 'name' },
    { key: 'reference', label: 'Reference / transaction ID', help: 'Useful for follow-up inside QBO.', kind: 'id' },
    { key: 'memo', label: 'Memo / description', help: 'Used for agency and tax-type matching.', kind: 'memo' },
    { key: 'account', label: 'Account / category', help: 'Helpful for tracing GL-side coding issues.', kind: 'accountName' },
    { key: 'amount', label: 'Payment amount', help: 'Required for payroll tax reconciliation.', kind: 'amount' }
  ];

  const LIABILITY_COLUMN_HINTS = {
    date: ['date', 'periodend', 'liabilitydate', 'duedate'],
    agency: ['agency', 'vendor', 'payee', 'taxagency'],
    taxType: ['taxtype', 'taxitem', 'item'],
    liabilityAccount: ['liabilityaccount', 'account', 'category'],
    employeeTax: ['employeetax', 'employee', 'withheld'],
    employerTax: ['employertax', 'employer', 'companytax'],
    amountDue: ['amountdue', 'totaldue', 'balance', 'liabilityamount']
  };

  const PAYMENT_COLUMN_HINTS = {
    date: ['date', 'paymentdate', 'transactiondate'],
    payee: ['payee', 'name', 'vendor', 'agency'],
    reference: ['reference', 'transactionid', 'txnno', 'num', 'number'],
    memo: ['memo', 'description', 'details', 'message'],
    account: ['account', 'category', 'accountname'],
    amount: ['amount', 'paymentamount', 'netamount', 'value']
  };

  const LIABILITY_SAMPLE_CSV = [
    'Date,Agency,Tax Type,Liability Account,Employee Tax,Employer Tax,Amount Due',
    '2026-02-29,IRS,Federal Withholding,Payroll Tax Payable,6200,6440,12640',
    '2026-02-29,New York DTF,State Withholding,Payroll Tax Payable,2280,1320,3600',
    '2026-02-29,ADP,SUI,Payroll Tax Payable,0,940,940',
    '2026-03-15,IRS,Federal Withholding,Payroll Tax Payable,6580,6715,13295',
    '2026-03-15,New York DTF,State Withholding,Payroll Tax Payable,2400,1405,3805'
  ].join('\n');

  const PAYMENT_SAMPLE_CSV = [
    'Date,Payee,Reference,Memo,Account,Amount',
    '2026-03-02,IRS,5001,Payroll tax ACH February,Checking,-12640',
    '2026-03-03,New York DTF,5002,February withholding,Checking,-3550',
    '2026-03-04,ADP,5003,SUI February,Checking,-940',
    '2026-03-17,IRS,5004,Payroll tax ACH March,Checking,-13295',
    '2026-03-18,New York DTF,5005,March withholding,Checking,-4005',
    '2026-03-20,IRS,5006,Penalty notice,Checking,-125'
  ].join('\n');

  function monthKey(date) {
    if (!(date instanceof Date)) {
      return 'unknown';
    }
    return String(date.getUTCFullYear()) + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
  }

  function daysBetween(left, right) {
    if (!(left instanceof Date) || !(right instanceof Date)) {
      return 99;
    }
    return Math.abs(Math.round((left.getTime() - right.getTime()) / 86400000));
  }

  function normalizeAgency(value, utils) {
    return utils.normalizeText(value).replace(/department|dept|taxation|finance/g, '').trim();
  }

  function mapLiabilityRow(row, mapping, utils) {
    const amountDue = mapping.amountDue ? utils.parseNumber(row[mapping.amountDue]) : null;
    const employeeTax = mapping.employeeTax ? utils.parseNumber(row[mapping.employeeTax]) || 0 : 0;
    const employerTax = mapping.employerTax ? utils.parseNumber(row[mapping.employerTax]) || 0 : 0;
    const totalDue = amountDue != null ? amountDue : employeeTax + employerTax;
    if (totalDue == null) {
      return null;
    }
    const date = mapping.date ? utils.parseDate(row[mapping.date]) : null;
    const agency = mapping.agency ? String(row[mapping.agency] || '').trim() : '';
    if (!agency) {
      return null;
    }
    return {
      rowNumber: row.__rowNumber,
      date,
      dateText: date ? utils.toIsoDate(date) : '',
      monthKey: monthKey(date),
      agency,
      agencyNorm: normalizeAgency(agency, utils),
      taxType: mapping.taxType ? String(row[mapping.taxType] || '').trim() : '',
      liabilityAccount: mapping.liabilityAccount ? String(row[mapping.liabilityAccount] || '').trim() : '',
      employeeTax,
      employerTax,
      amountDue: totalDue
    };
  }

  function mapPaymentRow(row, mapping, utils) {
    const amount = utils.parseNumber(mapping.amount ? row[mapping.amount] : null);
    if (amount == null) {
      return null;
    }
    const date = mapping.date ? utils.parseDate(row[mapping.date]) : null;
    const payee = mapping.payee ? String(row[mapping.payee] || '').trim() : '';
    const memo = mapping.memo ? String(row[mapping.memo] || '').trim() : '';
    return {
      rowNumber: row.__rowNumber,
      date,
      dateText: date ? utils.toIsoDate(date) : '',
      monthKey: monthKey(date),
      payee,
      payeeNorm: normalizeAgency(payee + ' ' + memo, utils),
      reference: mapping.reference ? String(row[mapping.reference] || '').trim() : '',
      memo,
      account: mapping.account ? String(row[mapping.account] || '').trim() : '',
      amount: Math.abs(amount)
    };
  }

  function aggregateLiabilities(rows) {
    const grouped = new Map();
    rows.forEach((row) => {
      const key = row.agencyNorm + '|' + row.monthKey;
      if (!grouped.has(key)) {
        grouped.set(key, { agency: row.agency, agencyNorm: row.agencyNorm, monthKey: row.monthKey, dueTotal: 0, employeeTax: 0, employerTax: 0, rows: [] });
      }
      const bucket = grouped.get(key);
      bucket.dueTotal += row.amountDue;
      bucket.employeeTax += row.employeeTax;
      bucket.employerTax += row.employerTax;
      bucket.rows.push(row);
    });
    return [...grouped.values()];
  }

  function aggregatePayments(rows) {
    const grouped = new Map();
    rows.forEach((row) => {
      let agencyNorm = row.payeeNorm;
      if (agencyNorm.indexOf('irs') >= 0) {
        agencyNorm = 'irs';
      } else if (agencyNorm.indexOf('new york') >= 0 || agencyNorm.indexOf('dtf') >= 0) {
        agencyNorm = 'new york';
      } else if (agencyNorm.indexOf('adp') >= 0) {
        agencyNorm = 'adp';
      }
      const key = agencyNorm + '|' + row.monthKey;
      if (!grouped.has(key)) {
        grouped.set(key, { agencyNorm, monthKey: row.monthKey, paidTotal: 0, rows: [] });
      }
      const bucket = grouped.get(key);
      bucket.paidTotal += row.amount;
      bucket.rows.push(row);
    });
    return [...grouped.values()];
  }

  function analyze(datasets, utils) {
    const liabilityGroups = aggregateLiabilities(datasets.liabilities);
    const paymentGroups = aggregatePayments(datasets.payments);
    const paymentIndex = new Map(paymentGroups.map((group) => [group.agencyNorm + '|' + group.monthKey, group]));
    const matchedPaymentKeys = new Set();

    const reconciled = liabilityGroups.map((group) => {
      const key = group.agencyNorm + '|' + group.monthKey;
      const payment = paymentIndex.get(key);
      if (payment) {
        matchedPaymentKeys.add(key);
      }
      const paidTotal = payment ? payment.paidTotal : 0;
      const difference = paidTotal - group.dueTotal;
      const latestLiabilityDate = group.rows.reduce((best, row) => (!best || row.date > best ? row.date : best), null);
      const latestPaymentDate = payment ? payment.rows.reduce((best, row) => (!best || row.date > best ? row.date : best), null) : null;
      const timingGap = latestPaymentDate && latestLiabilityDate ? daysBetween(latestPaymentDate, latestLiabilityDate) : null;
      const flags = [];
      if (!payment) {
        flags.push({ label: 'No payment matched to liability', tone: 'warn' });
      }
      if (Math.abs(difference) > 1) {
        flags.push({ label: (difference > 0 ? 'Overpaid' : 'Underpaid') + ' by ' + utils.formatMoney(Math.abs(difference)), tone: 'warn' });
      } else {
        flags.push({ label: 'Matched within tolerance', tone: 'good' });
      }
      if (timingGap != null && timingGap > 7) {
        flags.push({ label: 'Timing gap of ' + timingGap + ' days', tone: 'warn' });
      }
      return {
        agency: group.agency,
        monthKey: group.monthKey,
        dueTotal: group.dueTotal,
        paidTotal,
        difference,
        timingGap,
        liabilityAccount: group.rows[0].liabilityAccount,
        taxTypes: [...new Set(group.rows.map((row) => row.taxType).filter(Boolean))].join(', '),
        flags
      };
    }).sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference));

    const orphanPayments = paymentGroups.filter((group) => !matchedPaymentKeys.has(group.agencyNorm + '|' + group.monthKey)).map((group) => ({
      agency: group.rows[0].payee,
      monthKey: group.monthKey,
      dueTotal: 0,
      paidTotal: group.paidTotal,
      difference: group.paidTotal,
      timingGap: null,
      liabilityAccount: '',
      taxTypes: '',
      flags: [{ label: 'Payment without liability group', tone: 'warn' }]
    }));

    const unresolved = reconciled.filter((row) => row.flags.some((flag) => flag.tone === 'warn'));
    const totalDue = utils.sum(reconciled.map((row) => row.dueTotal));
    const totalPaid = utils.sum(reconciled.map((row) => row.paidTotal)) + utils.sum(orphanPayments.map((row) => row.paidTotal));
    const netDifference = totalPaid - totalDue;

    return {
      statusMessage: 'Payroll tax reconciliation completed. Review unpaid, underpaid, and orphan-payment items first.',
      summary: [
        { label: 'Agency periods reviewed', value: utils.formatNumber(reconciled.length), detail: 'Distinct agency and period combinations built from the liability report.' },
        { label: 'Liabilities due', value: utils.formatMoney(totalDue), detail: 'Total payroll tax liability in the current mapped periods.' },
        { label: 'Payments found', value: utils.formatMoney(totalPaid), detail: 'Total payroll-tax-style payments found in the comparison export.' },
        { label: 'Net difference', value: utils.formatMoney(netDifference), detail: 'Positive means payments exceed liabilities; negative means liabilities exceed payments.' }
      ],
      signalCards: [
        { label: 'Unresolved agency periods', value: utils.formatNumber(unresolved.length), detail: 'Liability periods with no payment, a variance, or a timing issue.' },
        { label: 'Orphan payments', value: utils.formatNumber(orphanPayments.length), detail: 'Payments that did not line up with any agency-period liability bucket.' },
        { label: 'Timing exceptions', value: utils.formatNumber(reconciled.filter((row) => row.timingGap != null && row.timingGap > 7).length), detail: 'Useful when payroll taxes were paid materially later than the liability period.' }
      ],
      insightCards: [
        { title: 'What this solves', description: 'QBO payroll and tax reports exist, but teams still end up reconciling tax liabilities versus payments in spreadsheets when they need agency-by-agency proof for close or compliance review.' },
        { title: 'Best use case', description: 'Compare a payroll tax liability export against bank or transaction exports to find underpayments, overpayments, or tax payments that were coded without a clear liability counterpart.' },
        { title: 'Highest-risk follow-up', description: 'Start with agencies showing no matched payment, then underpaid periods, then orphan payments that may represent penalties, miscodings, or timing mismatches.' }
      ],
      findingsColumns: [
        { key: 'agency', label: 'Agency' },
        { key: 'monthKey', label: 'Period' },
        { key: 'dueTotal', label: 'Liability', render: (row) => utils.escapeHtml(utils.formatMoney(row.dueTotal)) },
        { key: 'paidTotal', label: 'Payments', render: (row) => utils.escapeHtml(utils.formatMoney(row.paidTotal)) },
        { key: 'difference', label: 'Difference', render: (row) => utils.escapeHtml(utils.formatMoney(row.difference)) },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      findingsRows: unresolved.concat(orphanPayments),
      findingsEmpty: 'The current payroll tax liabilities and payments tie out within tolerance.',
      explorerColumns: [
        { key: 'agency', label: 'Agency' },
        { key: 'monthKey', label: 'Period' },
        { key: 'taxTypes', label: 'Tax type(s)' },
        { key: 'liabilityAccount', label: 'Liability account' },
        { key: 'dueTotal', label: 'Liability', render: (row) => utils.escapeHtml(utils.formatMoney(row.dueTotal)) },
        { key: 'paidTotal', label: 'Payments', render: (row) => utils.escapeHtml(utils.formatMoney(row.paidTotal)) },
        { key: 'difference', label: 'Difference', render: (row) => utils.escapeHtml(utils.formatMoney(row.difference)) },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      explorerRows: reconciled.concat(orphanPayments),
      exportRows: unresolved.concat(orphanPayments).map((row) => ({
        Agency: row.agency,
        Period: row.monthKey,
        Liability: row.dueTotal,
        Payments: row.paidTotal,
        Difference: row.difference,
        TaxTypes: row.taxTypes,
        LiabilityAccount: row.liabilityAccount,
        Flags: row.flags.map((flag) => flag.label).join('; ')
      })),
      exportFileName: 'qbo-payroll-tax-reconciliation.csv'
    };
  }

  function init() {
    if (!window.QBOCore) {
      return;
    }
    window.QBOCore.createDualFileTool({
      rootId: 'qbo-payroll-tax-reconciler-app',
      exportFileName: 'qbo-payroll-tax-reconciliation.csv',
      datasets: [
        {
          key: 'liabilities',
          title: 'Payroll tax liability export',
          introStatus: 'Load the QBO payroll tax liability or agency-detail export first.',
          sampleCsv: LIABILITY_SAMPLE_CSV,
          fieldDefinitions: LIABILITY_FIELD_DEFINITIONS,
          columnHints: LIABILITY_COLUMN_HINTS,
          validateMapping: function (mapping) {
            return !mapping.agency || (!mapping.amountDue && !mapping.employeeTax && !mapping.employerTax) ? 'Map the tax agency and either total due or employee/employer tax fields.' : '';
          },
          mapRow: mapLiabilityRow
        },
        {
          key: 'payments',
          title: 'Payment or bank export',
          introStatus: 'Load the payment-side export from QBO or the bank to compare against liabilities.',
          sampleCsv: PAYMENT_SAMPLE_CSV,
          fieldDefinitions: PAYMENT_FIELD_DEFINITIONS,
          columnHints: PAYMENT_COLUMN_HINTS,
          validateMapping: function (mapping) {
            return !mapping.payee || !mapping.amount ? 'Map the payment payee and amount columns before reconciling.' : '';
          },
          mapRow: mapPaymentRow
        }
      ],
      analyze: analyze,
      results: {
        signalsTitle: 'Top payroll tax issues',
        signalsDescription: 'These are the liability-versus-payment gaps most likely to block close or compliance review.',
        insightsTitle: 'Reconciliation insights',
        insightsDescription: 'Use these patterns to route payroll tax follow-up faster.',
        findingsTitle: 'Payroll tax exception queue',
        findingsDescription: 'Unpaid, underpaid, overpaid, and orphan-payment items rise to the top.',
        explorerTitle: 'Detailed payroll tax explorer',
        explorerDescription: 'Search the reconciled agency periods directly in the browser.'
      }
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      LIABILITY_FIELD_DEFINITIONS,
      PAYMENT_FIELD_DEFINITIONS,
      LIABILITY_COLUMN_HINTS,
      PAYMENT_COLUMN_HINTS,
      LIABILITY_SAMPLE_CSV,
      PAYMENT_SAMPLE_CSV,
      mapLiabilityRow,
      mapPaymentRow,
      analyze
    };
  }
}());
