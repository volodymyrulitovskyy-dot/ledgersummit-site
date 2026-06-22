(function () {
  'use strict';

  function normalizeParty(value, utils) {
    return utils.normalizeText(value)
      .replace(/\b(the|llc|inc|corp|company|co|ltd|limited|pllc|lp|llp)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function daysBetween(left, right) {
    if (!(left instanceof Date) || !(right instanceof Date)) {
      return 99;
    }
    return Math.abs(Math.round((left.getTime() - right.getTime()) / 86400000));
  }

  function sharedTokenCount(left, right) {
    const leftTokens = String(left || '').split(' ').filter(function (token) { return token.length > 2; });
    const rightText = String(right || '');
    if (!leftTokens.length || !rightText) {
      return 0;
    }
    return leftTokens.reduce(function (count, token) {
      return count + (rightText.indexOf(token) >= 0 ? 1 : 0);
    }, 0);
  }

  function formatMonth(key) {
    if (!key || key === 'unknown') {
      return 'Unknown period';
    }
    const parts = String(key).split('-');
    if (parts.length !== 2) {
      return key;
    }
    const year = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10) - 1;
    const date = new Date(year, month, 1);
    return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
  }

  function monthKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return 'unknown';
    }
    return String(date.getUTCFullYear()) + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
  }

  function alignSignedAmount(rawAmount, targetAmount) {
    if (rawAmount == null) {
      return 0;
    }
    const directGap = Math.abs(rawAmount - targetAmount);
    const flippedGap = Math.abs((-rawAmount) - targetAmount);
    return flippedGap < directGap ? -rawAmount : rawAmount;
  }

  function mapCounts(rows, keyBuilder) {
    const counts = new Map();
    rows.forEach(function (row) {
      const key = keyBuilder(row);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }

  function topLabels(counts, formatter, limit) {
    return Array.from(counts.entries())
      .filter(function (entry) { return entry[1] > 0 && entry[0]; })
      .sort(function (left, right) { return right[1] - left[1]; })
      .slice(0, limit || 3)
      .map(function (entry) { return formatter(entry[0], entry[1]); });
  }

  function confidenceLabel(score) {
    if (score >= 89) {
      return 'High';
    }
    if (score >= 76) {
      return 'Medium';
    }
    if (score >= 65) {
      return 'Low';
    }
    return 'None';
  }

  var BANK_STATEMENT_FIELDS = [
    { key: 'date', label: 'Statement date', help: 'Used for match windows and timing gaps.', kind: 'date' },
    { key: 'statementId', label: 'Statement reference', help: 'Useful for tracing unresolved bank items.', kind: 'id' },
    { key: 'description', label: 'Bank description', help: 'Used for matching merchant and memo text.', kind: 'memo' },
    { key: 'payee', label: 'Statement payee', help: 'Optional but useful for better confidence scoring.', kind: 'name' },
    { key: 'amount', label: 'Statement amount', help: 'Required for statement-to-books matching.', kind: 'amount' },
    { key: 'balance', label: 'Statement running balance', help: 'Optional context when reviewing gaps.', kind: 'balance' }
  ];

  var BANK_BOOK_FIELDS = [
    { key: 'date', label: 'Book date', help: 'Used for timing review against the statement.', kind: 'date' },
    { key: 'transactionId', label: 'Book transaction ID / No.', help: 'Useful for tracing cash-detail lines.', kind: 'id' },
    { key: 'type', label: 'Book type', help: 'Useful when manual or journal-style items appear.', kind: 'type' },
    { key: 'payee', label: 'Book payee / name', help: 'Used for confidence scoring and follow-up.', kind: 'name' },
    { key: 'memo', label: 'Book memo / description', help: 'Used for text matching and review context.', kind: 'memo' },
    { key: 'account', label: 'Cash account / offset account', help: 'Useful for unresolved book-side entries.', kind: 'accountName' },
    { key: 'amount', label: 'Book amount', help: 'Required for matching.', kind: 'amount' },
    { key: 'status', label: 'Status / cleared', help: 'Optional but useful in close review.', kind: 'status' }
  ];

  var BANK_STATEMENT_HINTS = {
    date: ['date', 'statementdate', 'postingdate', 'transactiondate'],
    statementId: ['reference', 'ref', 'id', 'fitid', 'bankid'],
    description: ['description', 'details', 'memo', 'bankmemo'],
    payee: ['payee', 'name', 'merchant'],
    amount: ['amount', 'signedamount', 'debitcredit', 'value'],
    balance: ['balance', 'runningbalance']
  };

  var BANK_BOOK_HINTS = {
    date: ['date', 'transactiondate', 'postingdate'],
    transactionId: ['transactionid', 'txnno', 'number', 'refno', 'num'],
    type: ['type', 'transactiontype', 'detailtype'],
    payee: ['payee', 'name', 'customer', 'vendor'],
    memo: ['memo', 'description', 'details'],
    account: ['account', 'category', 'accountname'],
    amount: ['amount', 'signedamount', 'value', 'netamount'],
    status: ['status', 'cleared', 'reconcile']
  };

  var BANK_STATEMENT_SAMPLE = [
    'Date,Reference,Description,Payee,Amount,Balance',
    '2026-03-01,ST-1001,ACH CREDIT ACME CLIENT,Acme Client,8500,62240',
    '2026-03-02,ST-1002,ACH DEBIT PAYROLL TAX IRS,IRS,-12640,49600',
    '2026-03-02,ST-1003,POS STAPLES 7782,Staples,-245.67,49354.33',
    '2026-03-03,ST-1004,DELTA AIR LINES,Delta,-1189.24,48165.09',
    '2026-03-03,ST-1005,DELTA AIR LINES,Delta,-1189.24,46975.85',
    '2026-03-05,ST-1006,ACH DEBIT RENT HQ,Metro Realty,-9100,37875.85',
    '2026-03-06,ST-1007,ACH DEBIT BETA AGENCY,Beta Agency,-25600,12275.85',
    '2026-03-08,ST-1008,SERVICE FEE,Big Bank,-35,12240.85'
  ].join('\n');

  var BANK_BOOK_SAMPLE = [
    'Transaction Date,Num,Type,Name,Memo,Account,Amount,Status',
    '2026-03-01,1001,Deposit,Acme Client,March retainer,Operating Cash,8500,Cleared',
    '2026-03-02,2001,Expense,IRS,Payroll tax payment,Operating Cash,-12640,Open',
    '2026-03-02,2002,Expense,Staples,Monthly supplies,Operating Cash,-245.67,Cleared',
    '2026-03-02,2003,Expense,Delta,Client travel,Operating Cash,-1189.24,Open',
    '2026-03-05,2004,Expense,Metro Realty,HQ office rent,Operating Cash,-9100,Open',
    '2026-03-06,2005,Expense,Beta Agency,March campaign,Operating Cash,-25600,Open',
    '2026-03-06,2006,Expense,Delta,Client travel,Operating Cash,-1189.24,Open',
    '2026-03-07,2007,Expense,Office Depot,Printer toner,Operating Cash,-219.31,Open'
  ].join('\n');

  function scoreCashCandidate(statementRow, bookRow) {
    if (Math.abs(statementRow.amount - bookRow.amount) > 0.01) {
      return -1;
    }
    var dayDiff = daysBetween(statementRow.date, bookRow.date);
    if (dayDiff > 7) {
      return -1;
    }
    var score = 58;
    if (dayDiff === 0) {
      score += 18;
    } else if (dayDiff <= 2) {
      score += 11;
    } else {
      score += 4;
    }
    score += Math.min(sharedTokenCount(statementRow.payeeNorm || statementRow.descriptionNorm, bookRow.payeeNorm + ' ' + bookRow.memoNorm) * 9, 18);
    score += Math.min(sharedTokenCount(statementRow.descriptionNorm, bookRow.payeeNorm + ' ' + bookRow.memoNorm + ' ' + bookRow.accountNorm) * 5, 15);
    if (bookRow.statusNorm.indexOf('cleared') >= 0) {
      score -= 6;
    }
    return score;
  }

  function mapStatementRow(row, mapping, utils) {
    var amount = utils.parseNumber(mapping.amount ? row[mapping.amount] : null);
    if (amount == null) {
      return null;
    }
    var date = mapping.date ? utils.parseDate(row[mapping.date]) : null;
    var description = mapping.description ? String(row[mapping.description] || '').trim() : '';
    var payee = mapping.payee ? String(row[mapping.payee] || '').trim() : '';
    return {
      rowNumber: row.__rowNumber,
      date: date,
      dateText: date ? utils.toIsoDate(date) : '',
      statementId: mapping.statementId ? String(row[mapping.statementId] || '').trim() : '',
      description: description,
      descriptionNorm: utils.normalizeText(description),
      payee: payee,
      payeeNorm: normalizeParty(payee, utils),
      amount: amount,
      balance: mapping.balance ? utils.parseNumber(row[mapping.balance]) : null
    };
  }

  function mapCashBookRow(row, mapping, utils) {
    var amount = utils.parseNumber(mapping.amount ? row[mapping.amount] : null);
    if (amount == null) {
      return null;
    }
    var date = mapping.date ? utils.parseDate(row[mapping.date]) : null;
    var payee = mapping.payee ? String(row[mapping.payee] || '').trim() : '';
    var memo = mapping.memo ? String(row[mapping.memo] || '').trim() : '';
    var account = mapping.account ? String(row[mapping.account] || '').trim() : '';
    var status = mapping.status ? String(row[mapping.status] || '').trim() : '';
    return {
      rowNumber: row.__rowNumber,
      date: date,
      dateText: date ? utils.toIsoDate(date) : '',
      transactionId: mapping.transactionId ? String(row[mapping.transactionId] || '').trim() : '',
      type: mapping.type ? String(row[mapping.type] || '').trim() : '',
      payee: payee,
      payeeNorm: normalizeParty(payee, utils),
      memo: memo,
      memoNorm: utils.normalizeText(memo),
      account: account,
      accountNorm: utils.normalizeText(account),
      amount: amount,
      status: status,
      statusNorm: utils.normalizeText(status)
    };
  }

  function analyzeBankReconciliation(datasets, utils) {
    var statementRows = datasets.statement;
    var bookRows = datasets.books;
    var usedBookRows = new Set();
    var statementDuplicates = mapCounts(statementRows, function (row) {
      return [row.dateText, row.payeeNorm, row.amount.toFixed(2)].join('|');
    });
    var bookDuplicates = mapCounts(bookRows, function (row) {
      return [row.dateText, row.payeeNorm, row.amount.toFixed(2)].join('|');
    });
    var merchantCounts = new Map();

    var matched = statementRows.map(function (statementRow) {
      merchantCounts.set(statementRow.payeeNorm || statementRow.descriptionNorm || '(blank)', (merchantCounts.get(statementRow.payeeNorm || statementRow.descriptionNorm || '(blank)') || 0) + 1);
      var best = null;
      var second = null;
      bookRows.forEach(function (bookRow) {
        var score = scoreCashCandidate(statementRow, bookRow);
        if (score < 0) {
          return;
        }
        var candidate = {
          statementRow: statementRow,
          bookRow: bookRow,
          score: score,
          dayDiff: daysBetween(statementRow.date, bookRow.date)
        };
        if (!best || candidate.score > best.score) {
          second = best;
          best = candidate;
        } else if (!second || candidate.score > second.score) {
          second = candidate;
        }
      });

      if (!best) {
        return {
          issueType: 'Statement-only item',
          statementDate: statementRow.dateText,
          statementRef: statementRow.statementId,
          statementText: statementRow.payee || statementRow.description,
          bookRef: '',
          bookText: '',
          amount: statementRow.amount,
          confidence: 'None',
          dayDiff: '',
          flags: [{ label: 'No likely book match', tone: 'warn' }].concat(
            (statementDuplicates.get([statementRow.dateText, statementRow.payeeNorm, statementRow.amount.toFixed(2)].join('|')) || 0) > 1 ? [{ label: 'Repeated statement pattern', tone: 'warn' }] : []
          )
        };
      }

      var confidence = confidenceLabel(best.score);
      var ambiguous = !!second && (best.score - second.score) <= 6;
      var duplicateBook = (bookDuplicates.get([best.bookRow.dateText, best.bookRow.payeeNorm, best.bookRow.amount.toFixed(2)].join('|')) || 0) > 1;
      if (confidence === 'High' && !ambiguous && !usedBookRows.has(best.bookRow.rowNumber)) {
        usedBookRows.add(best.bookRow.rowNumber);
      }
      var flags = [];
      if (confidence !== 'High') {
        flags.push({ label: confidence + ' confidence match', tone: 'warn' });
      } else {
        flags.push({ label: 'High-confidence match', tone: 'good' });
      }
      if (ambiguous) {
        flags.push({ label: 'Competing book candidates', tone: 'warn' });
      }
      if (best.dayDiff >= 3) {
        flags.push({ label: 'Timing gap of ' + best.dayDiff + ' days', tone: 'warn' });
      }
      if (duplicateBook) {
        flags.push({ label: 'Repeated book-side pattern', tone: 'warn' });
      }
      if ((statementDuplicates.get([statementRow.dateText, statementRow.payeeNorm, statementRow.amount.toFixed(2)].join('|')) || 0) > 1) {
        flags.push({ label: 'Repeated statement pattern', tone: 'warn' });
      }
      return {
        issueType: ambiguous || confidence !== 'High' ? 'Needs review' : 'Matched item',
        statementDate: statementRow.dateText,
        statementRef: statementRow.statementId,
        statementText: statementRow.payee || statementRow.description,
        bookRef: best.bookRow.transactionId,
        bookText: best.bookRow.payee || best.bookRow.memo || best.bookRow.account,
        amount: statementRow.amount,
        confidence: confidence,
        dayDiff: best.dayDiff,
        flags: flags
      };
    });

    var bookOnly = bookRows.filter(function (row) { return !usedBookRows.has(row.rowNumber); }).map(function (row) {
      var duplicateBook = (bookDuplicates.get([row.dateText, row.payeeNorm, row.amount.toFixed(2)].join('|')) || 0) > 1;
      return {
        issueType: 'Book-only entry',
        statementDate: '',
        statementRef: '',
        statementText: '',
        bookRef: row.transactionId,
        bookText: row.payee || row.memo || row.account,
        amount: row.amount,
        confidence: 'Book only',
        dayDiff: '',
        flags: [{ label: 'No statement line matched', tone: 'warn' }].concat(duplicateBook ? [{ label: 'Repeated book-side pattern', tone: 'warn' }] : [])
      };
    });

    var findingsRows = matched.filter(function (row) {
      return row.issueType !== 'Matched item';
    }).concat(bookOnly).sort(function (left, right) {
      var leftWarn = left.flags.filter(function (flag) { return flag.tone === 'warn'; }).length;
      var rightWarn = right.flags.filter(function (flag) { return flag.tone === 'warn'; }).length;
      return rightWarn - leftWarn || Math.abs(right.amount) - Math.abs(left.amount);
    });

    var unresolvedCount = matched.filter(function (row) { return row.issueType !== 'Matched item'; }).length;
    var highConfidence = matched.filter(function (row) { return row.issueType === 'Matched item'; }).length;
    var timingIssues = matched.filter(function (row) {
      return row.flags.some(function (flag) { return flag.label.indexOf('Timing gap') === 0; });
    }).length;
    var topMerchants = topLabels(merchantCounts, function (label, count) {
      return label + ' (' + count + ' statement lines)';
    });

    return {
      statusMessage: 'Bank reconciliation completed. Start with the statement-only, ambiguous, and book-only items first.',
      summary: [
        { label: 'Statement lines', value: utils.formatNumber(statementRows.length), detail: 'Rows loaded from the statement-side export.' },
        { label: 'High-confidence matches', value: utils.formatNumber(highConfidence), detail: 'Statement lines matched cleanly to book-side cash activity.' },
        { label: 'Statement items needing review', value: utils.formatNumber(unresolvedCount), detail: 'Statement rows with no clean match or with competing candidates.' },
        { label: 'Book-only entries', value: utils.formatNumber(bookOnly.length), detail: 'Book-side cash entries that did not line up to the statement.' }
      ],
      signalCards: [
        { label: 'Timing differences', value: utils.formatNumber(timingIssues), detail: 'Potential cut-off or deposit-in-transit style items.' },
        { label: 'Repeated patterns', value: utils.formatNumber(findingsRows.filter(function (row) { return row.flags.some(function (flag) { return flag.label.indexOf('Repeated') === 0; }); }).length), detail: 'Duplicate-looking statement or book patterns worth checking first.' },
        { label: 'Unresolved cash impact', value: utils.formatMoney(utils.sum(findingsRows.map(function (row) { return Math.abs(row.amount); }))), detail: 'Absolute dollar value sitting in the current review queue.' }
      ],
      insightCards: [
        { title: 'Where the queue concentrates', description: 'Recurring statement-side names creating the most review work right now.', items: topMerchants.length ? topMerchants : ['No concentration surfaced in the current statement sample.'] },
        { title: 'Competitor gap this page addresses', description: 'Close platforms emphasize workflow and certification. Operators still need a fast statement-to-books comparison layer they can use before a full close system gets involved.' },
        { title: 'What users usually need next', description: 'Teams typically resolve unmatched bank items, then book-only cash entries, then timing gaps that affect sign-off around period end.' }
      ],
      findingsColumns: [
        { key: 'issueType', label: 'Issue' },
        { key: 'statementDate', label: 'Statement date' },
        { key: 'statementRef', label: 'Statement ref' },
        { key: 'statementText', label: 'Statement text' },
        { key: 'bookRef', label: 'Book ref' },
        { key: 'amount', label: 'Amount', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.amount)); } },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      findingsRows: findingsRows,
      findingsEmpty: 'No high-priority reconciliation items were detected in the current comparison.',
      explorerColumns: [
        { key: 'issueType', label: 'Status' },
        { key: 'statementDate', label: 'Statement date' },
        { key: 'statementText', label: 'Statement text' },
        { key: 'bookText', label: 'Book text' },
        { key: 'confidence', label: 'Confidence' },
        { key: 'dayDiff', label: 'Days apart' },
        { key: 'amount', label: 'Amount', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.amount)); } },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      explorerRows: matched.concat(bookOnly),
      exportRows: findingsRows.map(function (row) {
        return {
          Issue: row.issueType,
          StatementDate: row.statementDate,
          StatementReference: row.statementRef,
          StatementText: row.statementText,
          BookReference: row.bookRef,
          BookText: row.bookText,
          Amount: row.amount,
          Confidence: row.confidence,
          DayGap: row.dayDiff,
          Flags: row.flags.map(function (flag) { return flag.label; }).join('; ')
        };
      }),
      exportFileName: 'bank-reconciliation-review-queue.csv'
    };
  }

  var CARD_STATEMENT_FIELDS = [
    { key: 'date', label: 'Card statement date', help: 'Used for matching and timing review.', kind: 'date' },
    { key: 'reference', label: 'Card reference', help: 'Useful when tracing unresolved card lines.', kind: 'id' },
    { key: 'merchant', label: 'Merchant', help: 'Required for merchant-level exception review.', kind: 'name' },
    { key: 'cardholder', label: 'Cardholder / employee', help: 'Useful when the statement identifies a spender.', kind: 'name' },
    { key: 'memo', label: 'Statement memo', help: 'Used for text-based matching against the books.', kind: 'memo' },
    { key: 'amount', label: 'Statement amount', help: 'Required for matching charges and credits.', kind: 'amount' }
  ];

  var CARD_BOOK_FIELDS = [
    { key: 'date', label: 'Book date', help: 'Used for timing review.', kind: 'date' },
    { key: 'transactionId', label: 'Book transaction ID / No.', help: 'Useful for follow-up in the books.', kind: 'id' },
    { key: 'employee', label: 'Employee / cardholder', help: 'Useful when a spend is routed through reimbursements or employee tagging.', kind: 'name' },
    { key: 'vendor', label: 'Vendor / payee', help: 'Required for merchant matching.', kind: 'name' },
    { key: 'memo', label: 'Memo / description', help: 'Used for card-review context.', kind: 'memo' },
    { key: 'account', label: 'Expense account', help: 'Useful for coding review.', kind: 'accountName' },
    { key: 'amount', label: 'Book amount', help: 'Required for statement matching.', kind: 'amount' },
    { key: 'status', label: 'Status', help: 'Optional but useful when card lines are already reviewed.', kind: 'status' }
  ];

  var CARD_STATEMENT_HINTS = {
    date: ['date', 'statementdate', 'postingdate'],
    reference: ['reference', 'id', 'authorization', 'ref'],
    merchant: ['merchant', 'vendor', 'payee', 'name'],
    cardholder: ['cardholder', 'employee', 'member', 'owner'],
    memo: ['memo', 'description', 'details'],
    amount: ['amount', 'signedamount', 'value']
  };

  var CARD_BOOK_HINTS = {
    date: ['date', 'transactiondate'],
    transactionId: ['transactionid', 'txnno', 'number', 'refno', 'num'],
    employee: ['employee', 'cardholder', 'owner', 'staff'],
    vendor: ['vendor', 'payee', 'merchant', 'name'],
    memo: ['memo', 'description', 'details'],
    account: ['account', 'category', 'accountname'],
    amount: ['amount', 'signedamount', 'value'],
    status: ['status', 'cleared', 'review']
  };

  var CARD_STATEMENT_SAMPLE = [
    'Date,Reference,Merchant,Cardholder,Memo,Amount',
    '2026-03-02,CC-1001,Staples,Jordan Lee,Office supplies,245.67',
    '2026-03-03,CC-1002,Delta Air Lines,Jordan Lee,Client travel,1189.24',
    '2026-03-03,CC-1003,Delta Air Lines,Jordan Lee,Client travel,1189.24',
    '2026-03-04,CC-1004,Adobe,Avery Chen,Creative Cloud seat,89.99',
    '2026-03-05,CC-1005,Local Cafe,Jordan Lee,Team lunch,120.45',
    '2026-03-06,CC-1006,Hotel Harbor,Avery Chen,Client visit hotel,622.10',
    '2026-03-08,CC-1007,Uber,Jordan Lee,Airport ride,68.30',
    '2026-03-09,CC-1008,Amazon,Jordan Lee,Office misc,312.55'
  ].join('\n');

  var CARD_BOOK_SAMPLE = [
    'Date,Num,Employee,Vendor,Memo,Account,Amount,Status',
    '2026-03-02,3101,Jordan Lee,Staples,Office supplies,Office Supplies,245.67,Open',
    '2026-03-03,3102,Jordan Lee,Delta Air Lines,Client travel,Travel Expense,1189.24,Open',
    '2026-03-04,3103,Avery Chen,Adobe,Creative Cloud seat,Software Subscriptions,89.99,Open',
    '2026-03-05,3104,Jordan Lee,Local Cafe,Team lunch,Meals and Entertainment,120.45,Open',
    '2026-03-06,3105,Avery Chen,Hotel Harbor,Client visit hotel,Travel Expense,622.10,Open',
    '2026-03-07,3106,Jordan Lee,Uber,Airport ride,Travel Expense,68.30,Open',
    '2026-03-09,3107,Jordan Lee,Amazon,,Office Supplies,312.55,Open',
    '2026-03-09,3108,Jordan Lee,Delta Air Lines,Client travel,Travel Expense,1189.24,Open'
  ].join('\n');

  function mapCardStatementRow(row, mapping, utils) {
    var amount = utils.parseNumber(mapping.amount ? row[mapping.amount] : null);
    if (amount == null) {
      return null;
    }
    var date = mapping.date ? utils.parseDate(row[mapping.date]) : null;
    var merchant = mapping.merchant ? String(row[mapping.merchant] || '').trim() : '';
    var cardholder = mapping.cardholder ? String(row[mapping.cardholder] || '').trim() : '';
    var memo = mapping.memo ? String(row[mapping.memo] || '').trim() : '';
    return {
      rowNumber: row.__rowNumber,
      date: date,
      dateText: date ? utils.toIsoDate(date) : '',
      reference: mapping.reference ? String(row[mapping.reference] || '').trim() : '',
      merchant: merchant,
      merchantNorm: normalizeParty(merchant, utils),
      cardholder: cardholder,
      cardholderNorm: normalizeParty(cardholder, utils),
      memo: memo,
      memoNorm: utils.normalizeText(memo),
      amount: Math.abs(amount)
    };
  }

  function mapCardBookRow(row, mapping, utils) {
    var amount = utils.parseNumber(mapping.amount ? row[mapping.amount] : null);
    if (amount == null) {
      return null;
    }
    var date = mapping.date ? utils.parseDate(row[mapping.date]) : null;
    var employee = mapping.employee ? String(row[mapping.employee] || '').trim() : '';
    var vendor = mapping.vendor ? String(row[mapping.vendor] || '').trim() : '';
    var memo = mapping.memo ? String(row[mapping.memo] || '').trim() : '';
    return {
      rowNumber: row.__rowNumber,
      date: date,
      dateText: date ? utils.toIsoDate(date) : '',
      transactionId: mapping.transactionId ? String(row[mapping.transactionId] || '').trim() : '',
      employee: employee,
      employeeNorm: normalizeParty(employee, utils),
      vendor: vendor,
      vendorNorm: normalizeParty(vendor, utils),
      memo: memo,
      memoNorm: utils.normalizeText(memo),
      account: mapping.account ? String(row[mapping.account] || '').trim() : '',
      amount: Math.abs(amount),
      status: mapping.status ? String(row[mapping.status] || '').trim() : ''
    };
  }

  function scoreCardCandidate(statementRow, bookRow) {
    if (Math.abs(statementRow.amount - bookRow.amount) > 0.01) {
      return -1;
    }
    var dayDiff = daysBetween(statementRow.date, bookRow.date);
    if (dayDiff > 10) {
      return -1;
    }
    var score = 60;
    if (dayDiff === 0) {
      score += 16;
    } else if (dayDiff <= 3) {
      score += 10;
    } else {
      score += 4;
    }
    score += Math.min(sharedTokenCount(statementRow.merchantNorm, bookRow.vendorNorm + ' ' + bookRow.memoNorm) * 10, 20);
    score += Math.min(sharedTokenCount(statementRow.cardholderNorm, bookRow.employeeNorm + ' ' + bookRow.memoNorm) * 7, 14);
    return score;
  }

  function analyzeCreditCardReconciliation(datasets, utils) {
    var statementRows = datasets.statement;
    var bookRows = datasets.books;
    var usedBookRows = new Set();
    var merchantCounts = new Map();
    var duplicateCharges = mapCounts(statementRows, function (row) {
      return [row.dateText, row.merchantNorm, row.amount.toFixed(2)].join('|');
    });

    var reviewed = statementRows.map(function (statementRow) {
      merchantCounts.set(statementRow.merchantNorm || '(blank)', (merchantCounts.get(statementRow.merchantNorm || '(blank)') || 0) + 1);
      var best = null;
      var second = null;
      bookRows.forEach(function (bookRow) {
        var score = scoreCardCandidate(statementRow, bookRow);
        if (score < 0) {
          return;
        }
        var candidate = {
          statementRow: statementRow,
          bookRow: bookRow,
          score: score,
          dayDiff: daysBetween(statementRow.date, bookRow.date)
        };
        if (!best || candidate.score > best.score) {
          second = best;
          best = candidate;
        } else if (!second || candidate.score > second.score) {
          second = candidate;
        }
      });
      var flags = [];
      if (!best) {
        flags.push({ label: 'No likely expense match', tone: 'warn' });
        if ((duplicateCharges.get([statementRow.dateText, statementRow.merchantNorm, statementRow.amount.toFixed(2)].join('|')) || 0) > 1) {
          flags.push({ label: 'Repeated statement charge', tone: 'warn' });
        }
        return {
          issueType: 'Statement-only charge',
          statementDate: statementRow.dateText,
          statementRef: statementRow.reference,
          merchant: statementRow.merchant,
          cardholder: statementRow.cardholder,
          bookRef: '',
          expenseAccount: '',
          amount: statementRow.amount,
          flags: flags
        };
      }
      var confidence = confidenceLabel(best.score);
      var ambiguous = !!second && (best.score - second.score) <= 6;
      if (confidence === 'High' && !ambiguous && !usedBookRows.has(best.bookRow.rowNumber)) {
        usedBookRows.add(best.bookRow.rowNumber);
      }
      if (confidence !== 'High') {
        flags.push({ label: confidence + ' confidence match', tone: 'warn' });
      } else {
        flags.push({ label: 'High-confidence match', tone: 'good' });
      }
      if (ambiguous) {
        flags.push({ label: 'Competing book candidates', tone: 'warn' });
      }
      if (best.dayDiff >= 4) {
        flags.push({ label: 'Timing gap of ' + best.dayDiff + ' days', tone: 'warn' });
      }
      if (!best.bookRow.memo) {
        flags.push({ label: 'Book memo missing', tone: 'warn' });
      }
      if (!best.bookRow.employee && statementRow.cardholder) {
        flags.push({ label: 'Cardholder not captured in books', tone: 'warn' });
      }
      if ((duplicateCharges.get([statementRow.dateText, statementRow.merchantNorm, statementRow.amount.toFixed(2)].join('|')) || 0) > 1) {
        flags.push({ label: 'Repeated statement charge', tone: 'warn' });
      }
      return {
        issueType: flags.some(function (flag) { return flag.tone === 'warn'; }) ? 'Needs review' : 'Matched charge',
        statementDate: statementRow.dateText,
        statementRef: statementRow.reference,
        merchant: statementRow.merchant,
        cardholder: statementRow.cardholder,
        bookRef: best.bookRow.transactionId,
        expenseAccount: best.bookRow.account,
        amount: statementRow.amount,
        flags: flags
      };
    });

    var bookOnly = bookRows.filter(function (row) { return !usedBookRows.has(row.rowNumber); }).map(function (row) {
      var flags = [{ label: 'Book-side expense with no statement match', tone: 'warn' }];
      if (!row.memo) {
        flags.push({ label: 'Book memo missing', tone: 'warn' });
      }
      return {
        issueType: 'Book-only expense',
        statementDate: '',
        statementRef: '',
        merchant: row.vendor,
        cardholder: row.employee,
        bookRef: row.transactionId,
        expenseAccount: row.account,
        amount: row.amount,
        flags: flags
      };
    });

    var findingsRows = reviewed.filter(function (row) { return row.issueType !== 'Matched charge'; }).concat(bookOnly).sort(function (left, right) {
      var leftWarn = left.flags.filter(function (flag) { return flag.tone === 'warn'; }).length;
      var rightWarn = right.flags.filter(function (flag) { return flag.tone === 'warn'; }).length;
      return rightWarn - leftWarn || Math.abs(right.amount) - Math.abs(left.amount);
    });

    return {
      statusMessage: 'Credit card reconciliation completed. Resolve statement-only, ambiguous, and book-only items first.',
      summary: [
        { label: 'Statement charges', value: utils.formatNumber(statementRows.length), detail: 'Rows reviewed from the card statement export.' },
        { label: 'Matched cleanly', value: utils.formatNumber(reviewed.filter(function (row) { return row.issueType === 'Matched charge'; }).length), detail: 'Statement charges that mapped cleanly to the books.' },
        { label: 'Charges needing review', value: utils.formatNumber(reviewed.filter(function (row) { return row.issueType !== 'Matched charge'; }).length), detail: 'Charges with no clean match or with review flags.' },
        { label: 'Book-only expenses', value: utils.formatNumber(bookOnly.length), detail: 'Book-side expenses not supported by the current statement file.' }
      ],
      signalCards: [
        { label: 'Repeated merchant patterns', value: utils.formatNumber(reviewed.filter(function (row) { return row.flags.some(function (flag) { return flag.label === 'Repeated statement charge'; }); }).length), detail: 'Useful for spotting duplicate card swipes or duplicated postings.' },
        { label: 'Missing book memos', value: utils.formatNumber(reviewed.filter(function (row) { return row.flags.some(function (flag) { return flag.label === 'Book memo missing'; }); }).length + bookOnly.filter(function (row) { return row.flags.some(function (flag) { return flag.label === 'Book memo missing'; }); }).length), detail: 'Weak documentation increases review time later in close or audit.' },
        { label: 'Statement spend in queue', value: utils.formatMoney(utils.sum(findingsRows.map(function (row) { return row.amount; }))), detail: 'Absolute spend still sitting in the current card-review queue.' }
      ],
      insightCards: [
        { title: 'Merchant concentration', description: 'The card merchants appearing most often in the current statement review.', items: topLabels(merchantCounts, function (label, count) { return label + ' (' + count + ' charges)'; }) },
        { title: 'Competitor gap this page addresses', description: 'Card platforms and ERP workflows handle routing, but controllers still end up reconciling statement charges to book-side expenses manually when timing, duplicates, or missing documentation show up.' },
        { title: 'What reviewers usually need next', description: 'Once unmatched or ambiguous charges are isolated, teams usually chase receipts, employee context, and the missing memo/account coding that keeps close review slow.' }
      ],
      findingsColumns: [
        { key: 'issueType', label: 'Issue' },
        { key: 'statementDate', label: 'Statement date' },
        { key: 'statementRef', label: 'Statement ref' },
        { key: 'merchant', label: 'Merchant' },
        { key: 'cardholder', label: 'Cardholder' },
        { key: 'expenseAccount', label: 'Expense account' },
        { key: 'amount', label: 'Amount', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.amount)); } },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      findingsRows: findingsRows,
      findingsEmpty: 'No major credit-card reconciliation issues were detected in the current comparison.',
      explorerColumns: [
        { key: 'issueType', label: 'Status' },
        { key: 'statementDate', label: 'Statement date' },
        { key: 'merchant', label: 'Merchant' },
        { key: 'cardholder', label: 'Cardholder' },
        { key: 'bookRef', label: 'Book ref' },
        { key: 'expenseAccount', label: 'Expense account' },
        { key: 'amount', label: 'Amount', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.amount)); } },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      explorerRows: reviewed.concat(bookOnly),
      exportRows: findingsRows.map(function (row) {
        return {
          Issue: row.issueType,
          StatementDate: row.statementDate,
          StatementReference: row.statementRef,
          Merchant: row.merchant,
          Cardholder: row.cardholder,
          BookReference: row.bookRef,
          ExpenseAccount: row.expenseAccount,
          Amount: row.amount,
          Flags: row.flags.map(function (flag) { return flag.label; }).join('; ')
        };
      }),
      exportFileName: 'credit-card-reconciliation-review.csv'
    };
  }

  var AP_AGING_FIELDS = [
    { key: 'vendor', label: 'Vendor', help: 'Required for vendor-level reconciliation.', kind: 'vendor' },
    { key: 'invoice', label: 'Invoice / reference', help: 'Useful for detailed follow-up.', kind: 'id' },
    { key: 'dueDate', label: 'Due date', help: 'Useful for stale-balance review.', kind: 'dueDate' },
    { key: 'current', label: 'Current bucket', help: 'Optional if your export already has a total balance.', kind: 'amount' },
    { key: 'days30', label: '1-30 days', help: 'Optional for aging context.', kind: 'amount' },
    { key: 'days60', label: '31-60 days', help: 'Optional for aging context.', kind: 'amount' },
    { key: 'days90', label: '61-90 days', help: 'Optional for aging context.', kind: 'amount' },
    { key: 'days90plus', label: '90+ days', help: 'Useful for stale AP review.', kind: 'amount' },
    { key: 'balance', label: 'Vendor balance', help: 'Optional if bucket totals are present.', kind: 'balance' }
  ];

  var AP_GL_FIELDS = [
    { key: 'vendor', label: 'Vendor / name', help: 'Required for matching vendor-level balances.', kind: 'vendor' },
    { key: 'account', label: 'GL account', help: 'Useful for tracing AP-side accounts.', kind: 'accountName' },
    { key: 'date', label: 'GL date', help: 'Useful when reconciling by period.', kind: 'date' },
    { key: 'reference', label: 'Document / reference', help: 'Useful for follow-up.', kind: 'id' },
    { key: 'balance', label: 'Signed GL balance / amount', help: 'Required for the vendor-level GL side.', kind: 'balance' }
  ];

  var AP_AGING_HINTS = {
    vendor: ['vendor', 'supplier', 'name'],
    invoice: ['invoice', 'reference', 'docno', 'number'],
    dueDate: ['duedate', 'due'],
    current: ['current'],
    days30: ['130', '1 30', '30'],
    days60: ['3160', '31 60', '60'],
    days90: ['6190', '61 90', '90'],
    days90plus: ['90plus', 'over90', '91'],
    balance: ['balance', 'openbalance', 'amountdue']
  };

  var AP_GL_HINTS = {
    vendor: ['vendor', 'name', 'supplier'],
    account: ['account', 'glaccount', 'accountname'],
    date: ['date', 'postingdate'],
    reference: ['reference', 'docno', 'number', 'transactionid'],
    balance: ['balance', 'amount', 'endingbalance', 'signedamount']
  };

  var AP_AGING_SAMPLE = [
    'Vendor,Invoice,Due Date,Current,1-30,31-60,61-90,90+,Balance',
    'Alpha Freight,AP-1001,2026-03-20,8500,0,0,0,0,8500',
    'Beta Agency,AP-1002,2026-03-15,0,25600,0,0,0,25600',
    'Metro Realty,AP-1003,2026-03-05,0,9100,0,0,0,9100',
    'Office Depot,AP-1004,2026-02-18,0,0,540,0,0,540',
    'Utilities Plus,AP-1005,2025-12-31,0,0,0,0,1940,1940'
  ].join('\n');

  var AP_GL_SAMPLE = [
    'Vendor,Account,Date,Reference,Balance',
    'Alpha Freight,Accounts Payable,2026-03-20,GL-1001,-8500',
    'Beta Agency,Accounts Payable,2026-03-15,GL-1002,-25500',
    'Metro Realty,Accounts Payable,2026-03-05,GL-1003,-9100',
    'Office Depot,Accounts Payable,2026-02-18,GL-1004,-540',
    'Utilities Plus,Accounts Payable,2025-12-31,GL-1005,-1940',
    'Travel Partner,Accounts Payable,2026-03-10,GL-1006,-1260'
  ].join('\n');

  function mapApAgingRow(row, mapping, utils) {
    var vendor = mapping.vendor ? String(row[mapping.vendor] || '').trim() : '';
    if (!vendor) {
      return null;
    }
    var current = mapping.current ? utils.parseNumber(row[mapping.current]) || 0 : 0;
    var days30 = mapping.days30 ? utils.parseNumber(row[mapping.days30]) || 0 : 0;
    var days60 = mapping.days60 ? utils.parseNumber(row[mapping.days60]) || 0 : 0;
    var days90 = mapping.days90 ? utils.parseNumber(row[mapping.days90]) || 0 : 0;
    var days90plus = mapping.days90plus ? utils.parseNumber(row[mapping.days90plus]) || 0 : 0;
    var balance = mapping.balance ? utils.parseNumber(row[mapping.balance]) : null;
    var totalBalance = balance != null ? balance : current + days30 + days60 + days90 + days90plus;
    return {
      rowNumber: row.__rowNumber,
      vendor: vendor,
      vendorNorm: normalizeParty(vendor, utils),
      invoice: mapping.invoice ? String(row[mapping.invoice] || '').trim() : '',
      dueDate: mapping.dueDate ? utils.parseDate(row[mapping.dueDate]) : null,
      current: current,
      days30: days30,
      days60: days60,
      days90: days90,
      days90plus: days90plus,
      balance: totalBalance
    };
  }

  function mapApGlRow(row, mapping, utils) {
    var vendor = mapping.vendor ? String(row[mapping.vendor] || '').trim() : '';
    var balance = utils.parseNumber(mapping.balance ? row[mapping.balance] : null);
    if (!vendor || balance == null) {
      return null;
    }
    return {
      rowNumber: row.__rowNumber,
      vendor: vendor,
      vendorNorm: normalizeParty(vendor, utils),
      account: mapping.account ? String(row[mapping.account] || '').trim() : '',
      date: mapping.date ? utils.parseDate(row[mapping.date]) : null,
      reference: mapping.reference ? String(row[mapping.reference] || '').trim() : '',
      rawBalance: balance
    };
  }

  function analyzeAccountsPayableReconciliation(datasets, utils) {
    var agingByVendor = new Map();
    datasets.aging.forEach(function (row) {
      if (!agingByVendor.has(row.vendorNorm)) {
        agingByVendor.set(row.vendorNorm, { vendor: row.vendor, balance: 0, over90: 0, invoices: 0 });
      }
      var bucket = agingByVendor.get(row.vendorNorm);
      bucket.balance += row.balance;
      bucket.over90 += row.days90plus;
      bucket.invoices += 1;
    });

    var glByVendor = new Map();
    datasets.gl.forEach(function (row) {
      if (!glByVendor.has(row.vendorNorm)) {
        glByVendor.set(row.vendorNorm, { vendor: row.vendor, balance: 0, accounts: new Set() });
      }
      var bucket = glByVendor.get(row.vendorNorm);
      bucket.balance += row.rawBalance;
      if (row.account) {
        bucket.accounts.add(row.account);
      }
    });

    var vendorKeys = new Set(Array.from(agingByVendor.keys()).concat(Array.from(glByVendor.keys())));
    var reviewed = Array.from(vendorKeys).map(function (key) {
      var aging = agingByVendor.get(key);
      var gl = glByVendor.get(key);
      var agingBalance = aging ? aging.balance : 0;
      var rawGlBalance = gl ? gl.balance : 0;
      var alignedGlBalance = alignSignedAmount(rawGlBalance, agingBalance);
      var difference = alignedGlBalance - agingBalance;
      var flags = [];
      if (!aging) {
        flags.push({ label: 'GL vendor missing from aging', tone: 'warn' });
      }
      if (!gl) {
        flags.push({ label: 'Aging vendor missing from GL', tone: 'warn' });
      }
      if (Math.abs(difference) > 1) {
        flags.push({ label: 'Vendor-level difference of ' + utils.formatMoney(Math.abs(difference)), tone: 'warn' });
      } else {
        flags.push({ label: 'Matched within tolerance', tone: 'good' });
      }
      if ((aging && aging.over90 > 0)) {
        flags.push({ label: '90+ AP balance present', tone: 'warn' });
      }
      if (agingBalance < 0 || alignedGlBalance < 0) {
        flags.push({ label: 'Debit-balance style vendor', tone: 'warn' });
      }
      return {
        vendor: aging ? aging.vendor : gl.vendor,
        agingBalance: agingBalance,
        glBalance: alignedGlBalance,
        difference: difference,
        over90: aging ? aging.over90 : 0,
        invoices: aging ? aging.invoices : 0,
        accounts: gl ? Array.from(gl.accounts).join(', ') : '',
        flags: flags
      };
    }).sort(function (left, right) {
      return Math.abs(right.difference) - Math.abs(left.difference) || right.over90 - left.over90;
    });

    var flagged = reviewed.filter(function (row) {
      return row.flags.some(function (flag) { return flag.tone === 'warn'; });
    });

    return {
      statusMessage: 'Accounts payable reconciliation completed. Start with missing vendors, material differences, and debit-balance vendors.',
      summary: [
        { label: 'Vendors reviewed', value: utils.formatNumber(reviewed.length), detail: 'Distinct vendor buckets across aging and GL inputs.' },
        { label: 'Aging total', value: utils.formatMoney(utils.sum(reviewed.map(function (row) { return row.agingBalance; }))), detail: 'Combined AP balance from the aging-side export.' },
        { label: 'GL total', value: utils.formatMoney(utils.sum(reviewed.map(function (row) { return row.glBalance; }))), detail: 'Vendor-level GL balance after sign alignment.' },
        { label: 'Vendors with issues', value: utils.formatNumber(flagged.length), detail: 'Vendor buckets with missing-side or difference signals.' }
      ],
      signalCards: [
        { label: 'Vendor gaps', value: utils.formatNumber(reviewed.filter(function (row) { return row.flags.some(function (flag) { return flag.label.indexOf('missing') >= 0; }); }).length), detail: 'Vendors present only on one side of the reconciliation.' },
        { label: '90+ balances', value: utils.formatMoney(utils.sum(reviewed.map(function (row) { return row.over90; }))), detail: 'Stale AP balances concentrated in the current file.' },
        { label: 'Net difference', value: utils.formatMoney(utils.sum(reviewed.map(function (row) { return row.difference; }))), detail: 'Vendor-level difference after sign alignment.' }
      ],
      insightCards: [
        { title: 'Competitor gap this page addresses', description: 'Reconciliation suites stress certification and close workflow. Users still need a fast vendor-level AP tie-out between aging and GL before they can explain what is actually broken.' },
        { title: 'What reviewers usually need next', description: 'Once vendor differences surface, teams usually trace unapplied credits, missing vendor names in the GL, and stale 90+ balances that make AP sign-off messy.' },
        { title: 'Where to start', description: 'Start with vendors missing from one side, then any large difference, then debit-balance vendors or stale balances.' }
      ],
      findingsColumns: [
        { key: 'vendor', label: 'Vendor' },
        { key: 'agingBalance', label: 'Aging', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.agingBalance)); } },
        { key: 'glBalance', label: 'GL', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.glBalance)); } },
        { key: 'difference', label: 'Difference', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.difference)); } },
        { key: 'over90', label: '90+', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.over90)); } },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      findingsRows: flagged,
      findingsEmpty: 'No major AP reconciliation issues were detected in the current files.',
      explorerColumns: [
        { key: 'vendor', label: 'Vendor' },
        { key: 'agingBalance', label: 'Aging', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.agingBalance)); } },
        { key: 'glBalance', label: 'GL', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.glBalance)); } },
        { key: 'difference', label: 'Difference', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.difference)); } },
        { key: 'accounts', label: 'GL accounts' },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      explorerRows: reviewed,
      exportRows: reviewed.map(function (row) {
        return {
          Vendor: row.vendor,
          AgingBalance: row.agingBalance,
          GLBalance: row.glBalance,
          Difference: row.difference,
          Over90: row.over90,
          InvoiceCount: row.invoices,
          GLAccounts: row.accounts,
          Flags: row.flags.map(function (flag) { return flag.label; }).join('; ')
        };
      }),
      exportFileName: 'accounts-payable-reconciliation.csv'
    };
  }

  var INTERCOMPANY_FIELDS = [
    { key: 'entity', label: 'Entity', help: 'Required for matching one side of the intercompany pair.', kind: 'name' },
    { key: 'counterparty', label: 'Counterparty entity', help: 'Required for the reciprocal side of the pair.', kind: 'name' },
    { key: 'account', label: 'Intercompany account', help: 'Useful when separate intercompany accounts exist.', kind: 'accountName' },
    { key: 'period', label: 'Period', help: 'Useful for period-level elimination review.', kind: 'date' },
    { key: 'currency', label: 'Currency', help: 'Optional but useful for mismatch context.', kind: 'type' },
    { key: 'amount', label: 'Signed balance', help: 'Required for pair matching.', kind: 'balance' }
  ];

  var INTERCOMPANY_HINTS = {
    entity: ['entity', 'company', 'subsidiary', 'legalentity'],
    counterparty: ['counterparty', 'partner', 'intercompanypartner', 'duefromto'],
    account: ['account', 'intercompanyaccount', 'glaccount'],
    period: ['period', 'date', 'monthend'],
    currency: ['currency', 'curr'],
    amount: ['amount', 'balance', 'endingbalance', 'signedamount']
  };

  var INTERCOMPANY_SAMPLE = [
    'Entity,Counterparty,Account,Period,Currency,Amount',
    'US HoldCo,UK Subsidiary,Intercompany AR,2026-02-29,USD,120000',
    'UK Subsidiary,US HoldCo,Intercompany AP,2026-02-29,USD,-118500',
    'US HoldCo,Germany GmbH,Intercompany AR,2026-02-29,EUR,64000',
    'Germany GmbH,US HoldCo,Intercompany AP,2026-02-29,EUR,-64000',
    'US HoldCo,Canada Ltd,Intercompany AR,2026-02-29,CAD,22000',
    'Canada Ltd,US HoldCo,Intercompany AP,2026-02-29,CAD,22000',
    'UK Subsidiary,France SAS,Intercompany AR,2026-02-29,EUR,18000'
  ].join('\n');

  function mapIntercompanyRow(row, mapping, utils) {
    var entity = mapping.entity ? String(row[mapping.entity] || '').trim() : '';
    var counterparty = mapping.counterparty ? String(row[mapping.counterparty] || '').trim() : '';
    var amount = utils.parseNumber(mapping.amount ? row[mapping.amount] : null);
    if (!entity || !counterparty || amount == null) {
      return null;
    }
    var period = mapping.period ? utils.parseDate(row[mapping.period]) : null;
    return {
      rowNumber: row.__rowNumber,
      entity: entity,
      entityNorm: normalizeParty(entity, utils),
      counterparty: counterparty,
      counterpartyNorm: normalizeParty(counterparty, utils),
      account: mapping.account ? String(row[mapping.account] || '').trim() : '',
      currency: mapping.currency ? String(row[mapping.currency] || '').trim() : '' || 'Unspecified',
      period: period,
      periodKey: period ? monthKey(period) : 'unknown',
      amount: amount
    };
  }

  function analyzeIntercompanyBalanceChecker(rows, utils) {
    var grouped = new Map();
    rows.forEach(function (row) {
      var pair = [row.entityNorm, row.counterpartyNorm].sort();
      var leftKey = pair[0];
      var rightKey = pair[1];
      var key = [leftKey, rightKey, row.account || 'All accounts', row.currency || 'Unspecified', row.periodKey].join('|');
      if (!grouped.has(key)) {
        grouped.set(key, {
          leftEntity: pair[0] === row.entityNorm ? row.entity : row.counterparty,
          rightEntity: pair[1] === row.entityNorm ? row.entity : row.counterparty,
          account: row.account || 'All accounts',
          currency: row.currency || 'Unspecified',
          periodKey: row.periodKey,
          leftAmount: 0,
          rightAmount: 0,
          rowCount: 0
        });
      }
      var bucket = grouped.get(key);
      bucket.rowCount += 1;
      if (row.entityNorm === leftKey) {
        bucket.leftEntity = row.entity;
        bucket.rightEntity = row.counterparty;
        bucket.leftAmount += row.amount;
      } else {
        bucket.leftEntity = row.counterparty;
        bucket.rightEntity = row.entity;
        bucket.rightAmount += row.amount;
      }
    });

    var reviewed = Array.from(grouped.values()).map(function (row) {
      var sameSign = row.leftAmount !== 0 && row.rightAmount !== 0 && (row.leftAmount > 0) === (row.rightAmount > 0);
      var oneSided = row.leftAmount === 0 || row.rightAmount === 0;
      var difference = sameSign ? (Math.abs(row.leftAmount) + Math.abs(row.rightAmount)) : (row.leftAmount + row.rightAmount);
      var flags = [];
      if (oneSided) {
        flags.push({ label: 'One-sided intercompany balance', tone: 'warn' });
      }
      if (sameSign) {
        flags.push({ label: 'Same-sign reciprocal balances', tone: 'warn' });
      }
      if (Math.abs(difference) > 1) {
        flags.push({ label: 'Difference of ' + utils.formatMoney(Math.abs(difference)), tone: 'warn' });
      } else if (!oneSided && !sameSign) {
        flags.push({ label: 'Reciprocal pair within tolerance', tone: 'good' });
      }
      return {
        entityPair: row.leftEntity + ' <> ' + row.rightEntity,
        account: row.account,
        currency: row.currency,
        period: formatMonth(row.periodKey),
        leftAmount: row.leftAmount,
        rightAmount: row.rightAmount,
        difference: difference,
        flags: flags
      };
    }).sort(function (left, right) {
      return Math.abs(right.difference) - Math.abs(left.difference);
    });

    var flagged = reviewed.filter(function (row) {
      return row.flags.some(function (flag) { return flag.tone === 'warn'; });
    });

    return {
      statusMessage: 'Intercompany balance review completed. Resolve one-sided pairs and material reciprocal differences first.',
      summary: [
        { label: 'Pairs reviewed', value: utils.formatNumber(reviewed.length), detail: 'Distinct entity-pair, account, currency, and period buckets.' },
        { label: 'Pairs with issues', value: utils.formatNumber(flagged.length), detail: 'Buckets with one-sided, same-sign, or out-of-tolerance balances.' },
        { label: 'One-sided pairs', value: utils.formatNumber(reviewed.filter(function (row) { return row.flags.some(function (flag) { return flag.label === 'One-sided intercompany balance'; }); }).length), detail: 'Pairs where one side is missing entirely.' },
        { label: 'Largest absolute gap', value: utils.formatMoney(flagged.length ? Math.max.apply(null, flagged.map(function (row) { return Math.abs(row.difference); })) : 0), detail: 'Largest elimination gap in the current file.' }
      ],
      signalCards: [
        { label: 'Same-sign pairs', value: utils.formatNumber(reviewed.filter(function (row) { return row.flags.some(function (flag) { return flag.label === 'Same-sign reciprocal balances'; }); }).length), detail: 'Pairs that look directionally wrong before elimination.' },
        { label: 'Absolute difference', value: utils.formatMoney(utils.sum(flagged.map(function (row) { return Math.abs(row.difference); }))), detail: 'Total unresolved intercompany mismatch currently visible.' },
        { label: 'Currencies in scope', value: utils.formatNumber(new Set(reviewed.map(function (row) { return row.currency; })).size), detail: 'Useful when mismatches cluster in one currency or one entity pair.' }
      ],
      insightCards: [
        { title: 'Competitor gap this page addresses', description: 'Enterprise consolidation tools focus on close orchestration. Operators still need a fast reciprocal-pair check that shows exactly which pairs and accounts are out of balance before elimination entries are built.' },
        { title: 'What reviewers usually need next', description: 'After the mismatched pairs surface, teams usually trace sign conventions, missing counterparties, and whether one side posted in the wrong period or currency.' },
        { title: 'Where to start', description: 'Start with one-sided pairs, then same-sign pairs, then the largest remaining reciprocal differences.' }
      ],
      findingsColumns: [
        { key: 'entityPair', label: 'Entity pair' },
        { key: 'account', label: 'Account' },
        { key: 'currency', label: 'Currency' },
        { key: 'period', label: 'Period' },
        { key: 'difference', label: 'Difference', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.difference)); } },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      findingsRows: flagged,
      findingsEmpty: 'No material intercompany mismatches were detected in the current file.',
      explorerColumns: [
        { key: 'entityPair', label: 'Entity pair' },
        { key: 'account', label: 'Account' },
        { key: 'currency', label: 'Currency' },
        { key: 'period', label: 'Period' },
        { key: 'leftAmount', label: 'Left side', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.leftAmount)); } },
        { key: 'rightAmount', label: 'Right side', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.rightAmount)); } },
        { key: 'difference', label: 'Difference', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.difference)); } },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      explorerRows: reviewed,
      exportRows: reviewed.map(function (row) {
        return {
          EntityPair: row.entityPair,
          Account: row.account,
          Currency: row.currency,
          Period: row.period,
          LeftAmount: row.leftAmount,
          RightAmount: row.rightAmount,
          Difference: row.difference,
          Flags: row.flags.map(function (flag) { return flag.label; }).join('; ')
        };
      }),
      exportFileName: 'intercompany-balance-review.csv'
    };
  }

  var TB_FIELDS = [
    { key: 'accountCode', label: 'Account code', help: 'Useful for crossfoot follow-up.', kind: 'code' },
    { key: 'accountName', label: 'Account name', help: 'Required for readable review output.', kind: 'accountName' },
    { key: 'accountType', label: 'Account type', help: 'Useful for sign expectation checks.', kind: 'type' },
    { key: 'debit', label: 'Debit', help: 'Optional if your file includes a signed ending balance.', kind: 'debit' },
    { key: 'credit', label: 'Credit', help: 'Optional if your file includes a signed ending balance.', kind: 'credit' },
    { key: 'endingBalance', label: 'Ending balance', help: 'Optional if debit and credit are present.', kind: 'balance' }
  ];

  var TB_HINTS = {
    accountCode: ['accountcode', 'acct', 'code', 'number'],
    accountName: ['accountname', 'name', 'description'],
    accountType: ['type', 'accounttype', 'class'],
    debit: ['debit', 'dr'],
    credit: ['credit', 'cr'],
    endingBalance: ['endingbalance', 'balance', 'netbalance']
  };

  var TB_SAMPLE = [
    'Account Code,Account Name,Account Type,Debit,Credit,Ending Balance',
    '1000,Cash,Asset,502400,0,502400',
    '1100,Accounts Receivable,Asset,184200,0,184200',
    '2000,Accounts Payable,Liability,0,131800,-131800',
    '3000,Retained Earnings,Equity,0,220000,-220000',
    '4000,Consulting Revenue,Revenue,0,684000,-684000',
    '5100,Travel Expense,Expense,12840,0,12840',
    '5200,Meals and Entertainment,Expense,1200,0,-1200',
    ',Suspense,Asset,450,450,0'
  ].join('\n');

  function mapTrialBalanceRow(row, mapping, utils) {
    var accountName = mapping.accountName ? String(row[mapping.accountName] || '').trim() : '';
    var debit = mapping.debit ? utils.parseNumber(row[mapping.debit]) || 0 : 0;
    var credit = mapping.credit ? utils.parseNumber(row[mapping.credit]) || 0 : 0;
    var endingBalance = mapping.endingBalance ? utils.parseNumber(row[mapping.endingBalance]) : null;
    if (!accountName && endingBalance == null && debit === 0 && credit === 0) {
      return null;
    }
    return {
      rowNumber: row.__rowNumber,
      accountCode: mapping.accountCode ? String(row[mapping.accountCode] || '').trim() : '',
      accountName: accountName,
      accountType: mapping.accountType ? String(row[mapping.accountType] || '').trim() : '',
      debit: debit,
      credit: credit,
      endingBalance: endingBalance,
      derivedBalance: endingBalance != null ? endingBalance : debit - credit
    };
  }

  function analyzeTrialBalanceCrossfoot(rows, utils) {
    var totalDebit = utils.sum(rows.map(function (row) { return row.debit; }));
    var totalCredit = utils.sum(rows.map(function (row) { return row.credit; }));
    var outOfBalance = totalDebit - totalCredit;
    var reviewed = rows.map(function (row) {
      var flags = [];
      var typeNorm = utils.normalizeText(row.accountType);
      if (!row.accountCode) {
        flags.push({ label: 'Missing account code', tone: 'warn' });
      }
      if (!row.accountName) {
        flags.push({ label: 'Missing account name', tone: 'warn' });
      }
      if (row.debit > 0 && row.credit > 0) {
        flags.push({ label: 'Both debit and credit populated', tone: 'warn' });
      }
      if (row.endingBalance != null && Math.abs((row.debit - row.credit) - row.endingBalance) > 1) {
        flags.push({ label: 'Ending balance does not crossfoot to debit and credit', tone: 'warn' });
      }
      if ((typeNorm.indexOf('asset') >= 0 || typeNorm.indexOf('expense') >= 0) && row.derivedBalance < 0) {
        flags.push({ label: 'Unexpected credit-style balance for asset or expense', tone: 'warn' });
      }
      if ((typeNorm.indexOf('liability') >= 0 || typeNorm.indexOf('equity') >= 0 || typeNorm.indexOf('revenue') >= 0) && row.derivedBalance > 0) {
        flags.push({ label: 'Unexpected debit-style balance for liability, equity, or revenue', tone: 'warn' });
      }
      if (!flags.length) {
        flags.push({ label: 'No row-level issue detected', tone: 'good' });
      }
      return {
        accountCode: row.accountCode,
        accountName: row.accountName,
        accountType: row.accountType,
        debit: row.debit,
        credit: row.credit,
        endingBalance: row.derivedBalance,
        flags: flags
      };
    }).sort(function (left, right) {
      var leftWarn = left.flags.filter(function (flag) { return flag.tone === 'warn'; }).length;
      var rightWarn = right.flags.filter(function (flag) { return flag.tone === 'warn'; }).length;
      return rightWarn - leftWarn || Math.abs(right.endingBalance) - Math.abs(left.endingBalance);
    });

    var flagged = reviewed.filter(function (row) {
      return row.flags.some(function (flag) { return flag.tone === 'warn'; });
    });

    return {
      statusMessage: 'Trial balance crossfoot completed. Resolve the overall out-of-balance condition first, then the flagged rows below.',
      summary: [
        { label: 'Accounts reviewed', value: utils.formatNumber(rows.length), detail: 'Mapped trial-balance rows processed in the browser.' },
        { label: 'Total debits', value: utils.formatMoney(totalDebit), detail: 'Sum of mapped debit column values.' },
        { label: 'Total credits', value: utils.formatMoney(totalCredit), detail: 'Sum of mapped credit column values.' },
        { label: 'Out-of-balance amount', value: utils.formatMoney(outOfBalance), detail: 'A non-zero amount means the current trial balance does not crossfoot.' }
      ],
      signalCards: [
        { label: 'Flagged rows', value: utils.formatNumber(flagged.length), detail: 'Rows with missing fields, crossfoot issues, or sign anomalies.' },
        { label: 'Rows with both sides populated', value: utils.formatNumber(reviewed.filter(function (row) { return row.flags.some(function (flag) { return flag.label === 'Both debit and credit populated'; }); }).length), detail: 'Useful for spotting broken exports or mapping issues.' },
        { label: 'Sign anomalies', value: utils.formatNumber(reviewed.filter(function (row) { return row.flags.some(function (flag) { return flag.label.indexOf('Unexpected') === 0; }); }).length), detail: 'Rows where the sign does not fit the mapped account type.' }
      ],
      insightCards: [
        { title: 'Competitor gap this page addresses', description: 'Most close products assume the trial balance is already clean. Users still need a fast browser check for crossfoot, sign, and row-level issues before that TB is trusted in review.' },
        { title: 'What reviewers usually need next', description: 'If the TB is out of balance, teams usually trace mapping mistakes first, then rows carrying both debit and credit, then any sign anomalies that imply account-classification issues.' },
        { title: 'What matters most', description: 'The total debit-credit tie-out matters first. Row-level flags matter next because they explain why the TB broke or why the mapped file looks suspicious.' }
      ],
      findingsColumns: [
        { key: 'accountCode', label: 'Account code' },
        { key: 'accountName', label: 'Account name' },
        { key: 'accountType', label: 'Type' },
        { key: 'endingBalance', label: 'Balance', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.endingBalance)); } },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      findingsRows: flagged,
      findingsEmpty: 'No row-level crossfoot issues were detected in the current trial balance.',
      explorerColumns: [
        { key: 'accountCode', label: 'Account code' },
        { key: 'accountName', label: 'Account name' },
        { key: 'accountType', label: 'Type' },
        { key: 'debit', label: 'Debit', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.debit)); } },
        { key: 'credit', label: 'Credit', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.credit)); } },
        { key: 'endingBalance', label: 'Balance', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.endingBalance)); } },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      explorerRows: reviewed,
      exportRows: reviewed.map(function (row) {
        return {
          AccountCode: row.accountCode,
          AccountName: row.accountName,
          AccountType: row.accountType,
          Debit: row.debit,
          Credit: row.credit,
          EndingBalance: row.endingBalance,
          Flags: row.flags.map(function (flag) { return flag.label; }).join('; ')
        };
      }),
      exportFileName: 'trial-balance-crossfoot-review.csv'
    };
  }

  var FLUX_FIELDS = [
    { key: 'accountCode', label: 'Account code', help: 'Useful for follow-up in the trial balance or ERP.', kind: 'code' },
    { key: 'accountName', label: 'Account name', help: 'Required for readable flux review.', kind: 'accountName' },
    { key: 'accountType', label: 'Account type', help: 'Useful for context and grouping.', kind: 'type' },
    { key: 'currentBalance', label: 'Current balance', help: 'Required for flux analysis.', kind: 'balance' },
    { key: 'priorBalance', label: 'Prior balance', help: 'Required for period-over-period comparison.', kind: 'balance' },
    { key: 'entity', label: 'Entity / department', help: 'Optional but useful for grouped review.', kind: 'name' }
  ];

  var FLUX_HINTS = {
    accountCode: ['accountcode', 'acct', 'code', 'number'],
    accountName: ['accountname', 'name', 'description'],
    accountType: ['type', 'accounttype', 'class'],
    currentBalance: ['current', 'currentbalance', 'endingbalance'],
    priorBalance: ['prior', 'previous', 'priorbalance', 'comparison'],
    entity: ['entity', 'department', 'location', 'segment']
  };

  var FLUX_SAMPLE = [
    'Account Code,Account Name,Account Type,Current Balance,Prior Balance,Entity',
    '1000,Cash,Asset,502400,468000,HQ',
    '1100,Accounts Receivable,Asset,184200,221500,HQ',
    '1200,Prepaids,Asset,12800,6200,HQ',
    '2000,Accounts Payable,Liability,-131800,-119400,HQ',
    '4000,Consulting Revenue,Revenue,-684000,-622000,HQ',
    '5100,Travel Expense,Expense,12840,3800,HQ',
    '5400,Professional Fees,Expense,41200,0,HQ',
    '5500,Temporary Labor,Expense,0,18400,HQ'
  ].join('\n');

  function mapFluxRow(row, mapping, utils) {
    var currentBalance = utils.parseNumber(mapping.currentBalance ? row[mapping.currentBalance] : null);
    var priorBalance = utils.parseNumber(mapping.priorBalance ? row[mapping.priorBalance] : null);
    if (currentBalance == null || priorBalance == null) {
      return null;
    }
    return {
      rowNumber: row.__rowNumber,
      accountCode: mapping.accountCode ? String(row[mapping.accountCode] || '').trim() : '',
      accountName: mapping.accountName ? String(row[mapping.accountName] || '').trim() : '',
      accountType: mapping.accountType ? String(row[mapping.accountType] || '').trim() : '',
      currentBalance: currentBalance,
      priorBalance: priorBalance,
      entity: mapping.entity ? String(row[mapping.entity] || '').trim() : '',
      change: currentBalance - priorBalance
    };
  }

  function analyzeAccountFlux(rows, utils) {
    var absoluteChanges = rows.map(function (row) { return Math.abs(row.change); });
    var medianChange = utils.median(absoluteChanges);
    var reviewed = rows.map(function (row) {
      var flags = [];
      var pctChange = row.priorBalance === 0 ? null : (row.change / Math.abs(row.priorBalance)) * 100;
      var signFlip = row.currentBalance !== 0 && row.priorBalance !== 0 && (row.currentBalance > 0) !== (row.priorBalance > 0);
      if (Math.abs(row.change) >= Math.max(medianChange * 2, 5000)) {
        flags.push({ label: 'Material dollar movement', tone: 'warn' });
      }
      if (pctChange != null && Math.abs(pctChange) >= 50 && Math.abs(row.change) >= 1000) {
        flags.push({ label: 'Large percent change', tone: 'warn' });
      }
      if (row.priorBalance === 0 && row.currentBalance !== 0) {
        flags.push({ label: 'New account balance', tone: 'warn' });
      }
      if (row.currentBalance === 0 && row.priorBalance !== 0) {
        flags.push({ label: 'Retired account balance', tone: 'warn' });
      }
      if (signFlip) {
        flags.push({ label: 'Sign flipped vs prior period', tone: 'warn' });
      }
      if (!flags.length) {
        flags.push({ label: 'Within normal range', tone: 'good' });
      }
      return {
        accountCode: row.accountCode,
        accountName: row.accountName,
        accountType: row.accountType,
        entity: row.entity,
        currentBalance: row.currentBalance,
        priorBalance: row.priorBalance,
        change: row.change,
        pctChange: pctChange,
        flags: flags
      };
    }).sort(function (left, right) {
      return Math.abs(right.change) - Math.abs(left.change);
    });

    var flagged = reviewed.filter(function (row) {
      return row.flags.some(function (flag) { return flag.tone === 'warn'; });
    });

    return {
      statusMessage: 'Account flux analysis completed. Start with the largest dollar changes, then new, retired, and sign-flip accounts.',
      summary: [
        { label: 'Accounts reviewed', value: utils.formatNumber(rows.length), detail: 'Mapped accounts compared across the two periods.' },
        { label: 'Net change', value: utils.formatMoney(utils.sum(rows.map(function (row) { return row.change; }))), detail: 'Overall movement across all mapped accounts.' },
        { label: 'Accounts with issues', value: utils.formatNumber(flagged.length), detail: 'Accounts with material movement, sign flips, or new / retired balances.' },
        { label: 'Median absolute change', value: utils.formatMoney(medianChange), detail: 'Useful as a baseline for what the file treats as normal movement.' }
      ],
      signalCards: [
        { label: 'New accounts', value: utils.formatNumber(reviewed.filter(function (row) { return row.flags.some(function (flag) { return flag.label === 'New account balance'; }); }).length), detail: 'Accounts with zero prior balance and non-zero current balance.' },
        { label: 'Retired accounts', value: utils.formatNumber(reviewed.filter(function (row) { return row.flags.some(function (flag) { return flag.label === 'Retired account balance'; }); }).length), detail: 'Accounts that went to zero this period.' },
        { label: 'Sign flips', value: utils.formatNumber(reviewed.filter(function (row) { return row.flags.some(function (flag) { return flag.label === 'Sign flipped vs prior period'; }); }).length), detail: 'Accounts where the sign changed period over period.' }
      ],
      insightCards: [
        { title: 'Largest movers', description: 'Accounts creating the biggest absolute movement in the current flux review.', items: reviewed.slice(0, 3).map(function (row) { return (row.accountName || row.accountCode || 'Unknown account') + ' (' + utils.formatMoney(row.change) + ')'; }) },
        { title: 'Competitor gap this page addresses', description: 'Close systems may visualize flux, but finance teams still need a quick way to rank material movement, new accounts, and sign flips directly from exported balances.' },
        { title: 'What reviewers usually need next', description: 'Once the large movements are ranked, teams usually ask whether the movement is timing, volume, reclass, or a new process issue that needs a narrative.' }
      ],
      findingsColumns: [
        { key: 'accountCode', label: 'Account code' },
        { key: 'accountName', label: 'Account name' },
        { key: 'change', label: 'Change', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.change)); } },
        { key: 'pctChange', label: '% change', render: function (row) { return row.pctChange == null ? 'n/a' : utils.escapeHtml(utils.formatPercent(row.pctChange)); } },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      findingsRows: flagged,
      findingsEmpty: 'No major flux issues were detected in the current period comparison.',
      explorerColumns: [
        { key: 'accountCode', label: 'Account code' },
        { key: 'accountName', label: 'Account name' },
        { key: 'accountType', label: 'Type' },
        { key: 'entity', label: 'Entity' },
        { key: 'currentBalance', label: 'Current', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.currentBalance)); } },
        { key: 'priorBalance', label: 'Prior', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.priorBalance)); } },
        { key: 'change', label: 'Change', render: function (row) { return utils.escapeHtml(utils.formatMoney(row.change)); } },
        { key: 'flags', label: 'Flags', render: function (row) { return utils.renderFlags(row.flags); } }
      ],
      explorerRows: reviewed,
      exportRows: reviewed.map(function (row) {
        return {
          AccountCode: row.accountCode,
          AccountName: row.accountName,
          AccountType: row.accountType,
          Entity: row.entity,
          CurrentBalance: row.currentBalance,
          PriorBalance: row.priorBalance,
          Change: row.change,
          PercentChange: row.pctChange == null ? '' : row.pctChange,
          Flags: row.flags.map(function (flag) { return flag.label; }).join('; ')
        };
      }),
      exportFileName: 'account-flux-analysis.csv'
    };
  }

  function bootDual(rootId, config) {
    if (!window.QBOCore || !document.getElementById(rootId)) {
      return;
    }
    window.QBOCore.createDualFileTool(config);
  }

  function bootSingle(rootId, config) {
    if (!window.QBOCore || !document.getElementById(rootId)) {
      return;
    }
    window.QBOCore.createSingleFileTool(config);
  }

  function init() {
    bootDual('bank-reconciliation-tool-app', {
      rootId: 'bank-reconciliation-tool-app',
      exportFileName: 'bank-reconciliation-review-queue.csv',
      datasets: [
        {
          key: 'statement',
          title: 'Statement export',
          introStatus: 'Load the bank statement export or try the sample file to start.',
          fieldDefinitions: BANK_STATEMENT_FIELDS,
          columnHints: BANK_STATEMENT_HINTS,
          sampleCsv: BANK_STATEMENT_SAMPLE,
          validateMapping: function (mapping) {
            return !mapping.date || !mapping.amount ? 'Map at least the statement date and amount columns.' : '';
          },
          mapRow: mapStatementRow
        },
        {
          key: 'books',
          title: 'Book cash export',
          introStatus: 'Load the book-side cash export or try the sample file to start.',
          fieldDefinitions: BANK_BOOK_FIELDS,
          columnHints: BANK_BOOK_HINTS,
          sampleCsv: BANK_BOOK_SAMPLE,
          validateMapping: function (mapping) {
            return !mapping.date || !mapping.amount ? 'Map at least the book date and amount columns.' : '';
          },
          mapRow: mapCashBookRow
        }
      ],
      analyze: analyzeBankReconciliation,
      results: {
        signalsTitle: 'Top reconciliation signals',
        signalsDescription: 'These are the statement and book issues driving the current bank recon queue.',
        insightsTitle: 'Bank recon insights',
        insightsDescription: 'Use these patterns to decide where statement-to-books cleanup starts.',
        findingsTitle: 'Priority reconciliation queue',
        findingsDescription: 'Start here when you need the highest-value unmatched or ambiguous items first.',
        explorerTitle: 'Detailed reconciliation explorer',
        explorerDescription: 'Search the reviewed statement and book-side rows directly in the browser.'
      }
    });

    bootDual('credit-card-reconciliation-tool-app', {
      rootId: 'credit-card-reconciliation-tool-app',
      exportFileName: 'credit-card-reconciliation-review.csv',
      datasets: [
        {
          key: 'statement',
          title: 'Card statement export',
          introStatus: 'Load the card statement export or try the sample file to start.',
          fieldDefinitions: CARD_STATEMENT_FIELDS,
          columnHints: CARD_STATEMENT_HINTS,
          sampleCsv: CARD_STATEMENT_SAMPLE,
          validateMapping: function (mapping) {
            return !mapping.date || !mapping.amount || !mapping.merchant ? 'Map the statement date, merchant, and amount columns.' : '';
          },
          mapRow: mapCardStatementRow
        },
        {
          key: 'books',
          title: 'Book-side expense export',
          introStatus: 'Load the book-side expense export or try the sample file to start.',
          fieldDefinitions: CARD_BOOK_FIELDS,
          columnHints: CARD_BOOK_HINTS,
          sampleCsv: CARD_BOOK_SAMPLE,
          validateMapping: function (mapping) {
            return !mapping.date || !mapping.amount || !mapping.vendor ? 'Map the book date, vendor, and amount columns.' : '';
          },
          mapRow: mapCardBookRow
        }
      ],
      analyze: analyzeCreditCardReconciliation,
      results: {
        signalsTitle: 'Top card-reconciliation signals',
        signalsDescription: 'These are the card charges and book-side expenses driving the current review queue.',
        insightsTitle: 'Card review insights',
        insightsDescription: 'Use these patterns to prioritize card cleanup before close or policy review.',
        findingsTitle: 'Priority card queue',
        findingsDescription: 'Highest-value card charges and book-side exceptions first.',
        explorerTitle: 'Detailed card explorer',
        explorerDescription: 'Search the reviewed statement charges and book-side expenses directly in the browser.'
      }
    });

    bootDual('accounts-payable-reconciliation-app', {
      rootId: 'accounts-payable-reconciliation-app',
      exportFileName: 'accounts-payable-reconciliation.csv',
      datasets: [
        {
          key: 'aging',
          title: 'AP aging export',
          introStatus: 'Load the AP aging export or try the sample file to start.',
          fieldDefinitions: AP_AGING_FIELDS,
          columnHints: AP_AGING_HINTS,
          sampleCsv: AP_AGING_SAMPLE,
          validateMapping: function (mapping) {
            return !mapping.vendor || (!mapping.balance && !mapping.current && !mapping.days30) ? 'Map the vendor column and either total balance or aging buckets.' : '';
          },
          mapRow: mapApAgingRow
        },
        {
          key: 'gl',
          title: 'GL AP export',
          introStatus: 'Load the GL AP export or try the sample file to start.',
          fieldDefinitions: AP_GL_FIELDS,
          columnHints: AP_GL_HINTS,
          sampleCsv: AP_GL_SAMPLE,
          validateMapping: function (mapping) {
            return !mapping.vendor || !mapping.balance ? 'Map the vendor and signed GL balance columns.' : '';
          },
          mapRow: mapApGlRow
        }
      ],
      analyze: analyzeAccountsPayableReconciliation,
      results: {
        signalsTitle: 'Top AP reconciliation signals',
        signalsDescription: 'These are the vendor-level gaps and differences driving the current AP recon queue.',
        insightsTitle: 'AP review insights',
        insightsDescription: 'Use these patterns to decide where AP tie-out work starts.',
        findingsTitle: 'Priority AP vendor queue',
        findingsDescription: 'Vendors with the biggest reconciliation risk appear first.',
        explorerTitle: 'Detailed AP explorer',
        explorerDescription: 'Search the reviewed vendor-level AP rows directly in the browser.'
      }
    });

    bootSingle('intercompany-balance-checker-app', {
      rootId: 'intercompany-balance-checker-app',
      introStatus: 'Load an intercompany balance export or try the sample file to start.',
      analyzeButtonLabel: 'Check balances',
      exportFileName: 'intercompany-balance-review.csv',
      sampleCsv: INTERCOMPANY_SAMPLE,
      fieldDefinitions: INTERCOMPANY_FIELDS,
      columnHints: INTERCOMPANY_HINTS,
      validateMapping: function (mapping) {
        return !mapping.entity || !mapping.counterparty || !mapping.amount ? 'Map the entity, counterparty, and signed balance columns.' : '';
      },
      mapRow: mapIntercompanyRow,
      analyze: analyzeIntercompanyBalanceChecker,
      results: {
        signalsTitle: 'Top intercompany signals',
        signalsDescription: 'These are the pair-level issues driving the current elimination queue.',
        insightsTitle: 'Intercompany insights',
        insightsDescription: 'Use these patterns to decide which pairs and balances need attention first.',
        findingsTitle: 'Priority pair queue',
        findingsDescription: 'The entity pairs with the largest elimination risk rise to the top.',
        explorerTitle: 'Detailed pair explorer',
        explorerDescription: 'Search the reviewed intercompany pair buckets directly in the browser.'
      }
    });

    bootSingle('trial-balance-crossfoot-checker-app', {
      rootId: 'trial-balance-crossfoot-checker-app',
      introStatus: 'Load a trial balance export or try the sample file to start.',
      analyzeButtonLabel: 'Check crossfoot',
      exportFileName: 'trial-balance-crossfoot-review.csv',
      sampleCsv: TB_SAMPLE,
      fieldDefinitions: TB_FIELDS,
      columnHints: TB_HINTS,
      validateMapping: function (mapping) {
        return !mapping.accountName || (!mapping.endingBalance && !mapping.debit && !mapping.credit) ? 'Map the account name and either debit/credit or ending balance columns.' : '';
      },
      mapRow: mapTrialBalanceRow,
      analyze: analyzeTrialBalanceCrossfoot,
      results: {
        signalsTitle: 'Top trial-balance signals',
        signalsDescription: 'These are the issues most likely to explain why the current TB does not crossfoot cleanly.',
        insightsTitle: 'Crossfoot insights',
        insightsDescription: 'Use these patterns to identify whether the problem is row-level, mapping-related, or classification-related.',
        findingsTitle: 'Priority TB issue queue',
        findingsDescription: 'The rows most likely to explain the TB problem appear first.',
        explorerTitle: 'Detailed TB explorer',
        explorerDescription: 'Search the reviewed trial-balance rows directly in the browser.'
      }
    });

    bootSingle('account-flux-analysis-tool-app', {
      rootId: 'account-flux-analysis-tool-app',
      introStatus: 'Load a current-versus-prior balance export or try the sample file to start.',
      analyzeButtonLabel: 'Run flux analysis',
      exportFileName: 'account-flux-analysis.csv',
      sampleCsv: FLUX_SAMPLE,
      fieldDefinitions: FLUX_FIELDS,
      columnHints: FLUX_HINTS,
      validateMapping: function (mapping) {
        return !mapping.accountName || !mapping.currentBalance || !mapping.priorBalance ? 'Map the account name, current balance, and prior balance columns.' : '';
      },
      mapRow: mapFluxRow,
      analyze: analyzeAccountFlux,
      results: {
        signalsTitle: 'Top flux signals',
        signalsDescription: 'These are the account movements creating the most review pressure right now.',
        insightsTitle: 'Flux review insights',
        insightsDescription: 'Use these patterns to explain where month-over-month changes are concentrated.',
        findingsTitle: 'Priority flux queue',
        findingsDescription: 'The accounts with the biggest or most unusual movement appear first.',
        explorerTitle: 'Detailed flux explorer',
        explorerDescription: 'Search the reviewed account movements directly in the browser.'
      }
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      analyzeBankReconciliation: analyzeBankReconciliation,
      analyzeCreditCardReconciliation: analyzeCreditCardReconciliation,
      analyzeAccountsPayableReconciliation: analyzeAccountsPayableReconciliation,
      analyzeIntercompanyBalanceChecker: analyzeIntercompanyBalanceChecker,
      analyzeTrialBalanceCrossfoot: analyzeTrialBalanceCrossfoot,
      analyzeAccountFlux: analyzeAccountFlux
    };
  }
}());
