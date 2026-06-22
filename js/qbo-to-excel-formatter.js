(function () {
  'use strict';

  const FIELD_DEFINITIONS = [
    { key: 'date', label: 'Date', help: 'Optional but useful for Excel-ready normalization.', kind: 'date' },
    { key: 'transactionId', label: 'Transaction ID / No.', help: 'Helpful for preserving traceability in the cleaned export.', kind: 'id' },
    { key: 'type', label: 'Type', help: 'Useful for sorting and pivoting in Excel.', kind: 'type' },
    { key: 'name', label: 'Name / payee / customer', help: 'Optional but useful for cleanup and filtering.', kind: 'name' },
    { key: 'account', label: 'Account / category', help: 'Recommended for a clean Excel review file.', kind: 'accountName' },
    { key: 'memo', label: 'Memo / description', help: 'Useful for follow-up and sorting in Excel.', kind: 'memo' },
    { key: 'amount', label: 'Signed amount', help: 'Use this if your QBO export already has one amount column.', kind: 'amount' },
    { key: 'debit', label: 'Debit', help: 'Optional if your export separates debits and credits.', kind: 'debit' },
    { key: 'credit', label: 'Credit', help: 'Optional if your export separates debits and credits.', kind: 'credit' },
    { key: 'className', label: 'Class', help: 'Optional for management-report slices in Excel.', kind: 'class' },
    { key: 'department', label: 'Department / location', help: 'Optional for location-based pivots.', kind: 'department' },
    { key: 'status', label: 'Status', help: 'Optional but useful when filtering unreconciled rows.', kind: 'status' }
  ];

  const COLUMN_HINTS = {
    date: ['date', 'transactiondate', 'trxdate'],
    transactionId: ['number', 'num', 'transactionid', 'refno', 'docno'],
    type: ['type', 'transactiontype'],
    name: ['name', 'payee', 'customer', 'vendor'],
    account: ['account', 'category'],
    memo: ['memo', 'description', 'details'],
    amount: ['amount', 'signedamount', 'value'],
    debit: ['debit', 'dr'],
    credit: ['credit', 'cr'],
    className: ['class', 'classname'],
    department: ['department', 'location'],
    status: ['status', 'cleared']
  };

  const SAMPLE_CSV = [
    'Transaction Date,Num,Type,Name,Account,Memo,Amount,Class,Location,Status',
    '3/1/2026,1001,Expense,Staples,Office Supplies, Monthly supplies ,$245.67,Operations,HQ,Cleared',
    '3/2/2026,1002,Expense,,Ask My Accountant,Needs review,"$389.55",,HQ,Open',
    '3/3/2026,1003,Journal Entry,,Marketing Expense,Top-side cleanup,"(5,000.00)",,HQ,Open',
    '3/3/2026,1004,Sales Receipt,Acme Corp,Consulting Revenue,March retainers,8500,Advisory,US-East,Cleared',
    ',,,,,,,,',
    'Total,,,,,,,,,'
  ].join('\n');

  function mapRow(row, mapping, utils) {
    const debit = mapping.debit ? utils.parseNumber(row[mapping.debit]) : null;
    const credit = mapping.credit ? utils.parseNumber(row[mapping.credit]) : null;
    const signedAmount = mapping.amount ? utils.parseNumber(row[mapping.amount]) : null;
    const amount = signedAmount != null ? signedAmount : ((debit || 0) - (credit || 0));
    const account = mapping.account ? String(row[mapping.account] || '').trim() : '';
    const name = mapping.name ? String(row[mapping.name] || '').trim() : '';
    const memo = mapping.memo ? String(row[mapping.memo] || '').trim() : '';
    const type = mapping.type ? String(row[mapping.type] || '').trim() : '';
    const status = mapping.status ? String(row[mapping.status] || '').trim() : '';
    const date = mapping.date ? utils.parseDate(row[mapping.date]) : null;
    const meaningful = account || name || memo || type || (amount != null && amount !== 0) || date;
    if (!meaningful) {
      return null;
    }
    return {
      rowNumber: row.__rowNumber,
      date,
      dateText: date ? utils.toIsoDate(date) : '',
      transactionId: mapping.transactionId ? String(row[mapping.transactionId] || '').trim() : '',
      type,
      name,
      account,
      memo,
      amount,
      debit: debit != null ? debit : (amount > 0 ? amount : 0),
      credit: credit != null ? credit : (amount < 0 ? Math.abs(amount) : 0),
      className: mapping.className ? String(row[mapping.className] || '').trim() : '',
      department: mapping.department ? String(row[mapping.department] || '').trim() : '',
      status,
      needsReview: !date || !account || (!signedAmount && debit == null && credit == null),
      weakMemo: !utils.normalizeText(memo) || utils.normalizeText(memo).length < 5
    };
  }

  function analyze(rows, utils) {
    const standardizedDates = rows.filter((row) => row.dateText).length;
    const missingAccounts = rows.filter((row) => !row.account).length;
    const weakMemos = rows.filter((row) => row.weakMemo).length;
    const needsReview = rows.filter((row) => row.needsReview);
    const cleanedRows = rows.map((row) => ({
      Date: row.dateText,
      Number: row.transactionId,
      Type: row.type,
      Name: row.name,
      Account: row.account,
      Memo: row.memo,
      Amount: row.amount,
      Debit: row.debit,
      Credit: row.credit,
      Class: row.className,
      Department: row.department,
      Status: row.status
    }));

    return {
      statusMessage: 'Excel formatting completed. Export the cleaned file or review the rows that still need manual attention.',
      summary: [
        { label: 'Rows formatted', value: utils.formatNumber(cleanedRows.length), detail: 'Non-empty QBO rows kept in the standardized output.' },
        { label: 'Dates standardized', value: utils.formatNumber(standardizedDates), detail: 'Rows converted to Excel-friendly ISO date format.' },
        { label: 'Rows needing review', value: utils.formatNumber(needsReview.length), detail: 'Rows still missing a key field after automatic normalization.' },
        { label: 'Weak memos', value: utils.formatNumber(weakMemos), detail: 'Rows that may still need better descriptions before handoff.' }
      ],
      signalCards: [
        { label: 'Missing account', value: utils.formatNumber(missingAccounts), detail: 'Rows without a mapped category or account name.' },
        { label: 'Weak memo rows', value: utils.formatNumber(weakMemos), detail: 'Useful if the export is going to audit, close review, or client follow-up.' },
        { label: 'Debit / credit output', value: utils.formatNumber(cleanedRows.filter((row) => row.Debit || row.Credit).length), detail: 'Rows normalized into Excel-friendly numeric columns.' }
      ],
      insightCards: [
        { title: 'What this solves', description: 'QBO exports often need trimming, date normalization, and amount cleanup before anyone can pivot or review them properly in Excel.' },
        { title: 'Recommended next step', description: 'Download the formatted CSV, open it in Excel, and use the standardized columns for pivot tables, review queues, or workpapers.' },
        { title: 'Still manual', description: 'Rows missing dates, accounts, or meaningful memos still need human cleanup before handoff.' }
      ],
      findingsColumns: [
        { key: 'dateText', label: 'Date' },
        { key: 'transactionId', label: 'No.' },
        { key: 'type', label: 'Type' },
        { key: 'account', label: 'Account' },
        { key: 'memo', label: 'Memo' },
        { key: 'amount', label: 'Amount', render: (row) => utils.escapeHtml(utils.formatMoney(row.amount || 0)) },
        { key: 'needsReview', label: 'Flags', render: (row) => utils.renderFlags([
          !row.date ? { label: 'Missing date', tone: 'warn' } : null,
          !row.account ? { label: 'Missing account', tone: 'warn' } : null,
          row.weakMemo ? { label: 'Weak memo', tone: 'warn' } : null
        ].filter(Boolean)) }
      ],
      findingsRows: needsReview,
      findingsEmpty: 'All formatted rows include the key fields needed for a clean Excel handoff.',
      explorerColumns: [
        { key: 'dateText', label: 'Date' },
        { key: 'transactionId', label: 'No.' },
        { key: 'type', label: 'Type' },
        { key: 'name', label: 'Name' },
        { key: 'account', label: 'Account' },
        { key: 'amount', label: 'Amount', render: (row) => utils.escapeHtml(utils.formatMoney(row.amount || 0)) }
      ],
      explorerRows: rows,
      exportRows: cleanedRows,
      exportFileName: 'qbo-to-excel-formatted.csv'
    };
  }

  function init() {
    if (!window.QBOCore) { return; }
    window.QBOCore.createSingleFileTool({
      rootId: 'qbo-to-excel-formatter-app',
      introStatus: 'Load a QBO export or try the sample file to create an Excel-ready version.',
      analyzeButtonLabel: 'Format export',
      exportFileName: 'qbo-to-excel-formatted.csv',
      sampleCsv: SAMPLE_CSV,
      fieldDefinitions: FIELD_DEFINITIONS,
      columnHints: COLUMN_HINTS,
      validateMapping: function (mapping) {
        return !mapping.amount && !(mapping.debit && mapping.credit) ? 'Map either a signed amount column or both debit and credit before formatting.' : '';
      },
      mapRow: mapRow,
      analyze: analyze,
      results: {
        signalsTitle: 'Formatting outcomes',
        signalsDescription: 'These are the cleanup results that matter before exporting to Excel.',
        insightsTitle: 'Formatting insights',
        insightsDescription: 'Use these cues to decide whether the cleaned file is ready for pivots or needs a quick review pass.',
        findingsTitle: 'Rows still needing review',
        findingsDescription: 'Cleaned rows missing a key field or description appear here.',
        explorerTitle: 'Formatted preview',
        explorerDescription: 'Search the cleaned rows before exporting the standardized file.'
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
