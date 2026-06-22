(function () {
  'use strict';

  const BANK_FIELD_DEFINITIONS = [
    { key: 'date', label: 'Bank date', help: 'Required for timing and match-window checks.', kind: 'date' },
    { key: 'bankId', label: 'Bank transaction ID', help: 'Useful for tracing unmatched feed lines.', kind: 'id' },
    { key: 'description', label: 'Description / bank memo', help: 'Used for text-based matching against book transactions.', kind: 'memo' },
    { key: 'payee', label: 'Bank payee', help: 'Optional but useful for stronger matching confidence.', kind: 'name' },
    { key: 'amount', label: 'Bank amount', help: 'Required for matching against QBO book transactions.', kind: 'amount' },
    { key: 'status', label: 'Bank status', help: 'Useful for identifying already-reviewed feed activity.', kind: 'status' }
  ];

  const BOOK_FIELD_DEFINITIONS = [
    { key: 'date', label: 'Book date', help: 'Required for timing comparisons against the bank feed.', kind: 'date' },
    { key: 'transactionId', label: 'QBO transaction ID / No.', help: 'Useful for follow-up in QuickBooks.', kind: 'id' },
    { key: 'type', label: 'Transaction type', help: 'Useful for explaining manual or journal-style book activity.', kind: 'type' },
    { key: 'payee', label: 'Book payee / name', help: 'Used for confidence scoring.', kind: 'name' },
    { key: 'memo', label: 'Memo / description', help: 'Used for text matching and duplicate review.', kind: 'memo' },
    { key: 'account', label: 'Account / category', help: 'Useful for review context on unmatched lines.', kind: 'accountName' },
    { key: 'amount', label: 'Book amount', help: 'Required for amount matching.', kind: 'amount' },
    { key: 'status', label: 'Book status', help: 'Optional but useful for review context.', kind: 'status' }
  ];

  const BANK_COLUMN_HINTS = {
    date: ['date', 'postingdate', 'transactiondate'],
    bankId: ['bankid', 'transactionid', 'fitid', 'reference', 'id'],
    description: ['description', 'memo', 'bankmemo', 'details'],
    payee: ['payee', 'name', 'merchant'],
    amount: ['amount', 'debitcredit', 'value', 'signedamount'],
    status: ['status', 'cleared', 'reviewstate']
  };

  const BOOK_COLUMN_HINTS = {
    date: ['date', 'transactiondate', 'postingdate'],
    transactionId: ['transactionid', 'txnno', 'num', 'number', 'refno'],
    type: ['type', 'transactiontype', 'detailtype'],
    payee: ['payee', 'name', 'customer', 'vendor'],
    memo: ['memo', 'description', 'details', 'message'],
    account: ['account', 'category', 'accountname'],
    amount: ['amount', 'netamount', 'signedamount', 'value'],
    status: ['status', 'matchstatus', 'reconcile', 'cleared']
  };

  const BANK_SAMPLE_CSV = [
    'Date,Bank ID,Description,Payee,Amount,Status',
    '2026-03-01,BK-1001,ACH CREDIT ACME CLIENT,Acme Client,8500,For review',
    '2026-03-02,BK-1002,ACH DEBIT PAYROLL TAX IRS,IRS,-12640,For review',
    '2026-03-02,BK-1003,DEBIT STAPLES 7782,Staples,-245.67,Reviewed',
    '2026-03-03,BK-1004,DEBIT DELTA AIR LINES,Delta,-1189.24,For review',
    '2026-03-03,BK-1005,DEBIT DELTA AIR LINES,Delta,-1189.24,For review',
    '2026-03-04,BK-1006,ACH DEBIT BETA AGENCY,Beta Agency,-25600,For review',
    '2026-03-05,BK-1007,ACH DEBIT RENT HQ,Metro Realty,-9100,For review',
    '2026-03-06,BK-1008,POS LOCAL CAFE,Local Cafe,-1200,For review'
  ].join('\n');

  const BOOK_SAMPLE_CSV = [
    'Transaction Date,Num,Type,Name,Memo,Account,Amount,Status',
    '2026-03-01,1003,Sales Receipt,Acme Client,March retainer,Consulting Revenue,8500,Matched',
    '2026-03-02,2001,Expense,IRS,Payroll tax payment,Payroll Tax Expense,-12640,Open',
    '2026-03-02,2002,Expense,Staples,Monthly supplies,Office Supplies,-245.67,Matched',
    '2026-03-02,2003,Expense,Delta,Client travel,Travel Expense,-1189.24,Open',
    '2026-03-04,2004,Expense,Beta Agency,March campaign,Consulting Expense,-25600,Open',
    '2026-03-05,2005,Expense,Metro Realty,HQ office rent,Rent Expense,-9100,Open',
    '2026-03-06,2006,Expense,Local Cafe,misc,Meals and Entertainment,-1200,Open',
    '2026-03-06,2007,Expense,Delta,Client travel,Travel Expense,-1189.24,Open'
  ].join('\n');

  function daysBetween(left, right) {
    if (!(left instanceof Date) || !(right instanceof Date)) {
      return 99;
    }
    return Math.abs(Math.round((left.getTime() - right.getTime()) / 86400000));
  }

  function sharedTokens(left, right) {
    const leftTokens = (left || '').split(' ').filter((token) => token.length > 2);
    if (!leftTokens.length || !right) {
      return 0;
    }
    let matches = 0;
    leftTokens.forEach((token) => {
      if (right.indexOf(token) >= 0) {
        matches += 1;
      }
    });
    return matches;
  }

  function scoreCandidate(bankRow, bookRow) {
    const amountDiff = Math.abs(bankRow.amount - bookRow.amount);
    if (amountDiff > 0.01) {
      return -1;
    }
    const dayDiff = daysBetween(bankRow.date, bookRow.date);
    if (dayDiff > 5) {
      return -1;
    }

    let score = 60;
    if (dayDiff === 0) {
      score += 18;
    } else if (dayDiff <= 2) {
      score += 10;
    } else {
      score += 4;
    }

    const payeeMatches = sharedTokens(bankRow.payeeNorm || bankRow.descriptionNorm, bookRow.payeeNorm + ' ' + bookRow.memoNorm);
    const memoMatches = sharedTokens(bankRow.descriptionNorm, bookRow.payeeNorm + ' ' + bookRow.memoNorm + ' ' + bookRow.accountNorm);
    score += Math.min(payeeMatches * 8, 16);
    score += Math.min(memoMatches * 5, 15);

    if (bookRow.statusNorm.indexOf('matched') >= 0) {
      score -= 12;
    }
    if (bankRow.statusNorm.indexOf('reviewed') >= 0) {
      score -= 8;
    }
    return score;
  }

  function getConfidence(score) {
    if (score >= 88) {
      return 'High';
    }
    if (score >= 74) {
      return 'Medium';
    }
    return 'Low';
  }

  function buildFlags(match) {
    const flags = [];
    if (!match.bookRow) {
      flags.push({ label: 'No likely book match', tone: 'warn' });
      if (match.bankRow.statusNorm.indexOf('reviewed') === -1) {
        flags.push({ label: 'Still in bank review queue' });
      }
      return flags;
    }
    if (match.confidence !== 'High') {
      flags.push({ label: match.confidence + ' confidence match', tone: 'warn' });
    } else {
      flags.push({ label: 'High-confidence match', tone: 'good' });
    }
    if (match.dayDiff >= 3) {
      flags.push({ label: 'Timing gap of ' + match.dayDiff + ' days', tone: 'warn' });
    }
    if (match.bookRow.statusNorm.indexOf('matched') >= 0) {
      flags.push({ label: 'Book row already marked matched', tone: 'warn' });
    }
    return flags;
  }

  function mapBankRow(row, mapping, utils) {
    const amount = utils.parseNumber(mapping.amount ? row[mapping.amount] : null);
    if (amount == null) {
      return null;
    }
    const date = mapping.date ? utils.parseDate(row[mapping.date]) : null;
    const description = mapping.description ? String(row[mapping.description] || '').trim() : '';
    const payee = mapping.payee ? String(row[mapping.payee] || '').trim() : '';
    const status = mapping.status ? String(row[mapping.status] || '').trim() : '';
    return {
      rowNumber: row.__rowNumber,
      date,
      dateText: date ? utils.toIsoDate(date) : '',
      bankId: mapping.bankId ? String(row[mapping.bankId] || '').trim() : '',
      description,
      descriptionNorm: utils.normalizeText(description),
      payee,
      payeeNorm: utils.normalizeText(payee),
      amount,
      status,
      statusNorm: utils.normalizeText(status)
    };
  }

  function mapBookRow(row, mapping, utils) {
    const amount = utils.parseNumber(mapping.amount ? row[mapping.amount] : null);
    if (amount == null) {
      return null;
    }
    const date = mapping.date ? utils.parseDate(row[mapping.date]) : null;
    const payee = mapping.payee ? String(row[mapping.payee] || '').trim() : '';
    const memo = mapping.memo ? String(row[mapping.memo] || '').trim() : '';
    const account = mapping.account ? String(row[mapping.account] || '').trim() : '';
    const status = mapping.status ? String(row[mapping.status] || '').trim() : '';
    return {
      rowNumber: row.__rowNumber,
      date,
      dateText: date ? utils.toIsoDate(date) : '',
      transactionId: mapping.transactionId ? String(row[mapping.transactionId] || '').trim() : '',
      type: mapping.type ? String(row[mapping.type] || '').trim() : '',
      payee,
      payeeNorm: utils.normalizeText(payee),
      memo,
      memoNorm: utils.normalizeText(memo),
      account,
      accountNorm: utils.normalizeText(account),
      amount,
      status,
      statusNorm: utils.normalizeText(status)
    };
  }

  function analyze(datasets, utils) {
    const bankRows = datasets.bankFeed;
    const bookRows = datasets.books;
    const usedBookRows = new Set();
    const bookDuplicateCounts = new Map();

    bookRows.forEach((row) => {
      const duplicateKey = [row.dateText, row.payeeNorm, row.memoNorm, row.amount.toFixed(2)].join('|');
      bookDuplicateCounts.set(duplicateKey, (bookDuplicateCounts.get(duplicateKey) || 0) + 1);
    });

    const matches = bankRows.map((bankRow) => {
      let best = null;
      let second = null;
      bookRows.forEach((bookRow) => {
        const score = scoreCandidate(bankRow, bookRow);
        if (score < 0) {
          return;
        }
        const candidate = { bankRow, bookRow, score, dayDiff: daysBetween(bankRow.date, bookRow.date) };
        if (!best || candidate.score > best.score) {
          second = best;
          best = candidate;
        } else if (!second || candidate.score > second.score) {
          second = candidate;
        }
      });

      if (!best) {
        return {
          bankRow,
          bookRow: null,
          score: 0,
          confidence: 'None',
          dayDiff: null,
          flags: buildFlags({ bankRow, bookRow: null })
        };
      }

      const confidence = getConfidence(best.score);
      const duplicateKey = [best.bookRow.dateText, best.bookRow.payeeNorm, best.bookRow.memoNorm, best.bookRow.amount.toFixed(2)].join('|');
      const conflict = usedBookRows.has(best.bookRow.rowNumber);
      if (!conflict && confidence === 'High') {
        usedBookRows.add(best.bookRow.rowNumber);
      }

      const match = {
        bankRow,
        bookRow: best.bookRow,
        score: best.score,
        confidence,
        dayDiff: best.dayDiff,
        flags: buildFlags({ bankRow, bookRow: best.bookRow, confidence, dayDiff: best.dayDiff })
      };

      if (second && best.score - second.score < 8) {
        match.flags.push({ label: 'Competing candidate exists', tone: 'warn' });
      }
      if (conflict) {
        match.flags.push({ label: 'Book row also matched elsewhere', tone: 'warn' });
      }
      if ((bookDuplicateCounts.get(duplicateKey) || 0) > 1) {
        match.flags.push({ label: 'Duplicate-style book pattern', tone: 'warn' });
      }
      match.reviewNeeded = !match.bookRow || confidence !== 'High' || match.flags.some((flag) => flag.tone === 'warn');
      return match;
    });

    const unmatchedBank = matches.filter((match) => !match.bookRow);
    const reviewNeeded = matches.filter((match) => match.reviewNeeded);
    const unmatchedBooks = bookRows.filter((row) => !usedBookRows.has(row.rowNumber)).map((row) => ({
      side: 'Book only',
      dateText: row.dateText,
      reference: row.transactionId,
      payee: row.payee,
      account: row.account,
      amount: row.amount,
      flags: [{ label: 'No bank match selected', tone: 'warn' }]
    }));
    const pendingAmount = utils.sum(unmatchedBank.map((match) => Math.abs(match.bankRow.amount)));

    return {
      statusMessage: 'Bank-feed matching completed. Start with unmatched feed lines and low-confidence suggestions.',
      summary: [
        { label: 'Bank lines reviewed', value: utils.formatNumber(bankRows.length), detail: 'Downloaded transactions loaded from the current bank feed export.' },
        { label: 'High-confidence matches', value: utils.formatNumber(matches.filter((match) => match.confidence === 'High').length), detail: 'Feed lines that have a likely book transaction match.' },
        { label: 'Manual review needed', value: utils.formatNumber(reviewNeeded.length), detail: 'Unmatched or ambiguous items that still need a reviewer.' },
        { label: 'Pending amount', value: utils.formatMoney(pendingAmount), detail: 'Absolute dollar value sitting in unmatched bank feed items.' }
      ],
      signalCards: [
        { label: 'Unmatched bank lines', value: utils.formatNumber(unmatchedBank.length), detail: 'Transactions with no likely book-side match in the current export.' },
        { label: 'Competing candidates', value: utils.formatNumber(matches.filter((match) => match.flags.some((flag) => flag.label === 'Competing candidate exists')).length), detail: 'Cases where more than one book row looks plausible.' },
        { label: 'Book-only rows', value: utils.formatNumber(unmatchedBooks.length), detail: 'Book transactions that were not selected against the current bank feed.' }
      ],
      insightCards: [
        { title: 'Why this tool matters', description: 'QBO bank feeds help with downloaded transactions, but teams still need a fast way to compare feed lines against book exports when matching gets messy or reviewers want a second pass.' },
        { title: 'Use the confidence score carefully', description: 'High confidence means the amount, date window, and text are aligned. Medium and low confidence should be reviewed before acceptance.' },
        { title: 'Common friction this removes', description: 'Duplicate travel charges, payroll tax withdrawals, vague merchant strings, and already-matched book rows often create avoidable bank-feed cleanup time.' }
      ],
      findingsColumns: [
        { key: 'bankDate', label: 'Bank date' },
        { key: 'bankReference', label: 'Bank ID' },
        { key: 'bankDescription', label: 'Bank description' },
        { key: 'suggestedBook', label: 'Suggested QBO transaction' },
        { key: 'confidence', label: 'Confidence' },
        { key: 'amount', label: 'Amount', render: (row) => utils.escapeHtml(utils.formatMoney(row.amount)) },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      findingsRows: reviewNeeded.map((match) => ({
        bankDate: match.bankRow.dateText,
        bankReference: match.bankRow.bankId,
        bankDescription: match.bankRow.description || match.bankRow.payee,
        suggestedBook: match.bookRow ? [match.bookRow.transactionId, match.bookRow.payee || match.bookRow.memo].filter(Boolean).join(' - ') : 'No suggestion',
        confidence: match.confidence,
        amount: match.bankRow.amount,
        flags: match.flags
      })),
      findingsEmpty: 'The current bank feed lines all have strong suggested matches.',
      explorerColumns: [
        { key: 'side', label: 'Side' },
        { key: 'dateText', label: 'Date' },
        { key: 'reference', label: 'Reference' },
        { key: 'payee', label: 'Payee / description' },
        { key: 'account', label: 'Account' },
        { key: 'amount', label: 'Amount', render: (row) => utils.escapeHtml(utils.formatMoney(row.amount)) },
        { key: 'flags', label: 'Flags', render: (row) => utils.renderFlags(row.flags) }
      ],
      explorerRows: matches.map((match) => ({
        side: 'Bank feed',
        dateText: match.bankRow.dateText,
        reference: match.bankRow.bankId,
        payee: match.bankRow.payee || match.bankRow.description,
        account: match.bookRow ? match.bookRow.account : '',
        amount: match.bankRow.amount,
        flags: match.flags
      })).concat(unmatchedBooks),
      exportRows: reviewNeeded.map((match) => ({
        BankDate: match.bankRow.dateText,
        BankID: match.bankRow.bankId,
        BankDescription: match.bankRow.description,
        BankPayee: match.bankRow.payee,
        BankAmount: match.bankRow.amount,
        SuggestedBookTransaction: match.bookRow ? match.bookRow.transactionId : '',
        SuggestedBookPayee: match.bookRow ? match.bookRow.payee : '',
        SuggestedBookAccount: match.bookRow ? match.bookRow.account : '',
        Confidence: match.confidence,
        Flags: match.flags.map((flag) => flag.label).join('; ')
      })),
      exportFileName: 'qbo-bank-feed-match-review.csv'
    };
  }

  function init() {
    if (!window.QBOCore) {
      return;
    }
    window.QBOCore.createDualFileTool({
      rootId: 'qbo-bank-feed-matcher-app',
      exportFileName: 'qbo-bank-feed-match-review.csv',
      datasets: [
        {
          key: 'bankFeed',
          title: 'Bank feed export',
          introStatus: 'Load the downloaded-transactions export from your bank feed or try the sample.',
          sampleCsv: BANK_SAMPLE_CSV,
          fieldDefinitions: BANK_FIELD_DEFINITIONS,
          columnHints: BANK_COLUMN_HINTS,
          validateMapping: function (mapping) {
            return !mapping.amount ? 'Map the bank amount column before matching.' : '';
          },
          mapRow: mapBankRow
        },
        {
          key: 'books',
          title: 'Book transactions export',
          introStatus: 'Load the QBO transaction export you want to match against the bank feed.',
          sampleCsv: BOOK_SAMPLE_CSV,
          fieldDefinitions: BOOK_FIELD_DEFINITIONS,
          columnHints: BOOK_COLUMN_HINTS,
          validateMapping: function (mapping) {
            return !mapping.amount ? 'Map the QBO book amount column before matching.' : '';
          },
          mapRow: mapBookRow
        }
      ],
      analyze: analyze,
      results: {
        signalsTitle: 'Top bank-feed issues',
        signalsDescription: 'These are the matching problems most likely to slow down review.',
        insightsTitle: 'Matching insights',
        insightsDescription: 'Use these patterns to clean up the bank feed faster.',
        findingsTitle: 'Bank-feed review queue',
        findingsDescription: 'Unmatched and ambiguous lines rise to the top first.',
        explorerTitle: 'Match explorer',
        explorerDescription: 'Search bank-feed and book-side rows together in the browser.'
      }
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      BANK_FIELD_DEFINITIONS,
      BOOK_FIELD_DEFINITIONS,
      BANK_COLUMN_HINTS,
      BOOK_COLUMN_HINTS,
      BANK_SAMPLE_CSV,
      BOOK_SAMPLE_CSV,
      mapBankRow,
      mapBookRow,
      analyze
    };
  }
}());
