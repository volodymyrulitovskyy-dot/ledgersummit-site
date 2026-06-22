(function () {
  'use strict';

  const FIELD_DEFINITIONS = [
    { key: 'date', label: 'Posting date', help: 'Recommended for weekend and timing checks.' },
    { key: 'journalId', label: 'Journal or batch ID', help: 'Used for journal balancing and grouping.' },
    { key: 'accountCode', label: 'Account code', help: 'Recommended if your export has numeric GL accounts.' },
    { key: 'accountName', label: 'Account name', help: 'Used when account descriptions are available.' },
    { key: 'description', label: 'Description or memo', help: 'Used for duplicate and generic memo checks.' },
    { key: 'amount', label: 'Signed amount', help: 'Use this if your export already has positive and negative values.' },
    { key: 'debit', label: 'Debit', help: 'Optional if signed amount is not available.' },
    { key: 'credit', label: 'Credit', help: 'Optional if signed amount is not available.' },
    { key: 'source', label: 'Source or module', help: 'Helps spot manual or spreadsheet-driven entries.' },
    { key: 'user', label: 'Prepared by / user', help: 'Helpful for reviewer follow-up.' },
    { key: 'entity', label: 'Entity / company / subsidiary', help: 'Optional but useful for grouped close reviews.' }
  ];

  const COLUMN_HINTS = {
    date: ['date', 'postingdate', 'postdate', 'transactiondate', 'journaldate', 'trxdate', 'entrydate'],
    journalId: ['journalid', 'journalentry', 'journal', 'je', 'batch', 'batchid', 'document', 'documentnumber', 'docno', 'entrynumber', 'referencenumber'],
    accountCode: ['account', 'accountnumber', 'accountcode', 'glaccount', 'glcode', 'naturalaccount', 'acct', 'accountno'],
    accountName: ['accountname', 'accountdescription', 'accounttitle', 'gldescription', 'glaccountname', 'acctname', 'accountfullname', 'fullname'],
    description: ['description', 'memo', 'linedescription', 'linecomment', 'comment', 'notes', 'details', 'transactiondescription', 'headerdescription', 'linememo'],
    amount: ['amount', 'signedamount', 'netamount', 'value', 'lineamount', 'transactionamount'],
    debit: ['debit', 'debits', 'dr'],
    credit: ['credit', 'credits', 'cr'],
    source: ['source', 'module', 'origin', 'sourcetype', 'entrysource', 'channel', 'transactiontype', 'type'],
    user: ['user', 'preparedby', 'createdby', 'owner', 'employee', 'enteredby'],
    entity: ['entity', 'company', 'subsidiary', 'businessunit', 'location', 'division']
  };

  const GENERIC_DESCRIPTIONS = new Set([
    'adjustment',
    'adj',
    'journal entry',
    'entry',
    'misc',
    'miscellaneous',
    'reclass',
    'reclass entry',
    'manual entry',
    'na',
    'n a',
    'n/a'
  ]);

  const FLAG_LABELS = {
    duplicate_line: 'Repeated transaction pattern',
    unusual_amount: 'High-value deviation from account norm',
    missing_description: 'Weak or generic memo',
    weekend_posting: 'Weekend or off-calendar posting',
    round_dollar: 'Large round-dollar risk signal',
    manual_source: 'Manual or spreadsheet source',
    unbalanced_journal: 'Batch does not net to zero',
    mixed_debit_credit: 'Debit and credit both populated'
  };

  const FLAG_WEIGHTS = {
    duplicate_line: 28,
    unusual_amount: 20,
    missing_description: 10,
    weekend_posting: 10,
    round_dollar: 10,
    manual_source: 8,
    unbalanced_journal: 24,
    mixed_debit_credit: 16
  };

  const SAMPLE_CSV = [
    'Posting Date,Journal ID,Account,Account Name,Description,Debit,Credit,Source,User,Entity',
    '2026-02-24,JE1001,6100,Marketing Expense,Digital campaign invoice,845.18,0,AP Import,mlee,US',
    '2026-02-24,JE1001,2000,Accounts Payable,Digital campaign invoice,0,845.18,AP Import,mlee,US',
    '2026-02-25,JE1002,6100,Marketing Expense,Conference booth,1295.42,0,AP Import,mlee,US',
    '2026-02-25,JE1002,2000,Accounts Payable,Conference booth,0,1295.42,AP Import,mlee,US',
    '2026-02-26,JE1003,6100,Marketing Expense,Partner webinar,620.00,0,Manual,jdoe,US',
    '2026-02-26,JE1003,2100,Accrued Expenses,Partner webinar,0,620.00,Manual,jdoe,US',
    '2026-02-27,JE1004,6100,Marketing Expense,LinkedIn spend true-up,705.90,0,Manual,jdoe,US',
    '2026-02-27,JE1004,2100,Accrued Expenses,LinkedIn spend true-up,0,705.90,Manual,jdoe,US',
    '2026-02-28,JE1005,6100,Marketing Expense,Q1 brand launch,100000,0,Excel Upload,asmith,US',
    '2026-02-28,JE1005,2100,Accrued Expenses,Q1 brand launch,0,100000,Excel Upload,asmith,US',
    '2026-02-28,JE1005,6100,Marketing Expense,Q1 brand launch,100000,0,Excel Upload,asmith,US',
    '2026-03-01,JE1006,6999,Misc Expense,Adjustment,10000,0,Manual,jdoe,US',
    '2026-03-01,JE1006,2100,Accrued Expenses,Adjustment,0,10000,Manual,jdoe,US',
    '2026-03-02,JE1007,1300,Inventory,Inventory true-up,9800,0,Manual,psingh,US',
    '2026-03-02,JE1007,5000,COGS,Inventory true-up,0,9700,Manual,psingh,US',
    '2026-03-03,JE1008,6200,Travel Expense,Hotel conference,248.33,0,AP Import,mlee,US',
    '2026-03-03,JE1008,2000,Accounts Payable,Hotel conference,0,248.33,AP Import,mlee,US',
    '2026-03-04,JE1009,6100,Marketing Expense,misc,5000,0,Manual,asmith,US',
    '2026-03-04,JE1009,2100,Accrued Expenses,misc,0,5000,Manual,asmith,US',
    '2026-03-05,JE1010,6100,Marketing Expense,Conference booth,1295.42,0,AP Import,mlee,US',
    '2026-03-05,JE1010,2000,Accounts Payable,Conference booth,0,1295.42,AP Import,mlee,US',
    '2026-03-08,JE1011,6100,Marketing Expense,Weekend agency accrual,12000,0,Manual,jdoe,US',
    '2026-03-08,JE1011,2100,Accrued Expenses,Weekend agency accrual,0,12000,Manual,jdoe,US'
  ].join('\n');

  const state = {
    parsed: null,
    normalized: [],
    analysis: null,
    mapping: {}
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slugifyHeader(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '');
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2
    }).format(value || 0);
  }

  function formatPercent(value) {
    return `${Math.round((value || 0) * 100)}%`;
  }

  function formatDateValue(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return 'No date';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }

  function parseNumber(value) {
    if (value == null) {
      return null;
    }

    const raw = String(value).trim();
    if (!raw) {
      return null;
    }

    const negative = /^\(.*\)$/.test(raw);
    const cleaned = raw
      .replace(/[,$\s]/g, '')
      .replace(/[()]/g, '')
      .replace(/[^0-9.\-]/g, '');

    if (!cleaned || cleaned === '-' || cleaned === '.') {
      return null;
    }

    const parsed = Number.parseFloat(cleaned);
    if (Number.isNaN(parsed)) {
      return null;
    }

    return negative ? -parsed : parsed;
  }

  function parseDate(value) {
    if (value == null) {
      return null;
    }

    const raw = String(value).trim();
    if (!raw) {
      return null;
    }

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return new Date(Number.parseInt(isoMatch[1], 10), Number.parseInt(isoMatch[2], 10) - 1, Number.parseInt(isoMatch[3], 10));
    }

    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) {
      return direct;
    }

    const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!match) {
      return null;
    }

    const month = Number.parseInt(match[1], 10);
    const day = Number.parseInt(match[2], 10);
    const year = Number.parseInt(match[3], 10) < 100 ? 2000 + Number.parseInt(match[3], 10) : Number.parseInt(match[3], 10);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function csvEscape(value) {
    const text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function median(values) {
    if (!values.length) {
      return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
  }

  function detectDelimiter(text) {
    const candidates = [',', '\t', ';', '|'];
    const lines = String(text || '')
      .split(/\r\n|\n|\r/)
      .filter((line) => line.trim())
      .slice(0, 8);

    const scored = candidates.map((delimiter) => {
      const counts = lines.map((line) => splitLine(line, delimiter).length);
      const average = counts.reduce((total, count) => total + count, 0) / Math.max(counts.length, 1);
      const consistent = counts.filter((count) => count === counts[0]).length;
      return { delimiter, score: average + consistent * 0.25 };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0] && scored[0].score > 1 ? scored[0].delimiter : ',';
  }

  function splitLine(line, delimiter) {
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    cells.push(current);
    return cells;
  }

  const HEADER_HINTS = ['date', 'transaction', 'journal', 'entry', 'batch', 'account', 'memo', 'description', 'name', 'amount', 'debit', 'credit', 'balance', 'type', 'source', 'entity', 'vendor', 'customer', 'class', 'department', 'location', 'status'];

  function getCellText(value) {
    return String(value == null ? '' : value).trim();
  }

  function looksLikeValueCell(value) {
    const text = getCellText(value);
    if (!text) {
      return false;
    }
    return /^[\d$(),.\-/]+$/.test(text)
      || /^\d{4}-\d{2}-\d{2}$/.test(text)
      || /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(text);
  }

  function scoreHeaderRow(cells) {
    const values = cells.map(getCellText).filter(Boolean);
    if (!values.length) {
      return Number.NEGATIVE_INFINITY;
    }

    let score = values.length * 12;
    score += (new Set(values.map((value) => value.toLowerCase())).size / values.length) * 18;

    values.forEach((value) => {
      const slug = slugifyHeader(value);
      const lower = value.toLowerCase();

      if (HEADER_HINTS.some((hint) => slug === hint || slug.includes(hint))) {
        score += 24;
      }
      if (/[a-z]/i.test(value)) {
        score += 6;
      }
      if (looksLikeValueCell(value)) {
        score -= 10;
      }
      if (/^total\b/.test(lower)) {
        score -= 18;
      }
      if (value.length > 36) {
        score -= 6;
      }
    });

    return score;
  }

  function detectHeaderRowIndex(rows) {
    const scanLimit = Math.min(rows.length, 12);
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < scanLimit; index += 1) {
      const score = scoreHeaderRow(rows[index]);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    return bestIndex;
  }

  function normalizeGroupedRows(headerCells, dataRows) {
    const firstHeader = getCellText(headerCells[0]);
    const maybeBlankFirstHeader = !firstHeader || /^column\s+1$/i.test(firstHeader);

    if (!maybeBlankFirstHeader || !dataRows.length) {
      return { headerCells, dataRows };
    }

    let markerCount = 0;
    let totalCount = 0;

    dataRows.slice(0, Math.min(dataRows.length, 200)).forEach((cells) => {
      const firstCell = getCellText(cells[0]);
      const nonEmptyRest = cells.slice(1).filter((value) => getCellText(value)).length;

      if (!firstCell) {
        return;
      }
      if (/^total\b/i.test(firstCell)) {
        totalCount += 1;
      } else if (nonEmptyRest === 0) {
        markerCount += 1;
      }
    });

    if (markerCount < 2 || totalCount < 1) {
      return { headerCells, dataRows };
    }

    const normalizedHeaderCells = headerCells.slice();
    normalizedHeaderCells[0] = 'Journal ID';

    const normalizedRows = [];
    let currentGroupId = '';

    dataRows.forEach((cells) => {
      const rowCells = cells.slice();
      rowCells.__rowNumber = cells.__rowNumber;
      const firstCell = getCellText(rowCells[0]);
      const nonEmptyRest = rowCells.slice(1).filter((value) => getCellText(value)).length;

      if (firstCell && /^total\b/i.test(firstCell)) {
        return;
      }
      if (firstCell && nonEmptyRest === 0) {
        currentGroupId = firstCell;
        return;
      }
      if (currentGroupId && !firstCell) {
        rowCells[0] = currentGroupId;
      }

      normalizedRows.push(rowCells);
    });

    return normalizedRows.length
      ? { headerCells: normalizedHeaderCells, dataRows: normalizedRows }
      : { headerCells, dataRows };
  }

  function parseDelimited(text, delimiter) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let current = '';
    let row = [];
    let inQuotes = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(current);
        current = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          index += 1;
        }
        row.push(current);
        current = '';
        if (row.some((cell) => String(cell).trim() !== '')) {
          row.__rowNumber = rows.length + 1;
          rows.push(row);
        }
        row = [];
      } else {
        current += char;
      }
    }

    if (current.length || row.length) {
      row.push(current);
      if (row.some((cell) => String(cell).trim() !== '')) {
        row.__rowNumber = rows.length + 1;
        rows.push(row);
      }
    }

    if (!rows.length) {
      throw new Error('No rows were found in the uploaded file.');
    }

    const headerRowIndex = detectHeaderRowIndex(rows);
    const prepared = normalizeGroupedRows(rows[headerRowIndex].slice(), rows.slice(headerRowIndex + 1));
    const headers = prepared.headerCells.map((header, index) => String(header || `Column ${index + 1}`).trim() || `Column ${index + 1}`);
    const objects = prepared.dataRows.map((cells, rowIndex) => {
      const entry = { __rowNumber: cells.__rowNumber || rowIndex + headerRowIndex + 2 };
      headers.forEach((header, columnIndex) => {
        entry[header] = cells[columnIndex] == null ? '' : String(cells[columnIndex]).trim();
      });
      return entry;
    });

    return { headers, rows: objects, delimiter };
  }

  function guessMapping(headers) {
    const normalized = headers.map((header) => ({ original: header, slug: slugifyHeader(header) }));
    const mapping = {};

    FIELD_DEFINITIONS.forEach((field) => {
      let best = '';
      let bestScore = 0;

      normalized.forEach((header) => {
        COLUMN_HINTS[field.key].forEach((hint) => {
          if (header.slug === hint && bestScore < 100) {
            best = header.original;
            bestScore = 100;
          } else if (header.slug.includes(hint) && bestScore < 60) {
            best = header.original;
            bestScore = 60;
          }
        });
      });

      mapping[field.key] = best;
    });

    return mapping;
  }

  function buildAccountLabel(accountCode, accountName) {
    if (accountCode && accountName) {
      return `${accountCode} - ${accountName}`;
    }
    return accountCode || accountName || 'Unmapped account';
  }

  function isMeaninglessDescription(text) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return true;
    }
    if (GENERIC_DESCRIPTIONS.has(normalized)) {
      return true;
    }
    return normalized.length < 5;
  }

  function parseMappingRows(parsed, mapping) {
    return parsed.rows
      .map((row) => {
        const debit = parseNumber(mapping.debit ? row[mapping.debit] : null);
        const credit = parseNumber(mapping.credit ? row[mapping.credit] : null);
        const amountValue = parseNumber(mapping.amount ? row[mapping.amount] : null);
        const amount = amountValue != null ? amountValue : (debit || 0) - (credit || 0);
        const accountCode = mapping.accountCode ? String(row[mapping.accountCode] || '').trim() : '';
        const accountName = mapping.accountName ? String(row[mapping.accountName] || '').trim() : '';
        const accountLabel = buildAccountLabel(accountCode, accountName);

        return {
          rowNumber: row.__rowNumber,
          raw: row,
          date: mapping.date ? parseDate(row[mapping.date]) : null,
          dateText: mapping.date ? String(row[mapping.date] || '').trim() : '',
          journalId: mapping.journalId ? String(row[mapping.journalId] || '').trim() : '',
          accountCode,
          accountName,
          accountLabel,
          description: mapping.description ? String(row[mapping.description] || '').trim() : '',
          amount,
          debit,
          credit,
          source: mapping.source ? String(row[mapping.source] || '').trim() : '',
          user: mapping.user ? String(row[mapping.user] || '').trim() : '',
          entity: mapping.entity ? String(row[mapping.entity] || '').trim() : ''
        };
      })
      .filter((row) => {
        const hasAccount = row.accountCode || row.accountName;
        const hasAmount = row.amount != null && !Number.isNaN(row.amount) && row.amount !== 0;
        const hasDebitCredit = row.debit != null || row.credit != null;
        return hasAccount || hasAmount || hasDebitCredit || row.description || row.journalId;
      });
  }

  function analyzeRows(rows) {
    const duplicateCounts = new Map();
    const accountBaselines = new Map();
    const accountStats = new Map();
    const journalStats = new Map();

    rows.forEach((row) => {
      const duplicateKey = [
        row.date ? row.date.toISOString().slice(0, 10) : row.dateText,
        normalizeText(row.accountLabel),
        row.amount.toFixed(2),
        normalizeText(row.description)
      ].join('|');
      duplicateCounts.set(duplicateKey, (duplicateCounts.get(duplicateKey) || 0) + 1);

      const accountKey = row.accountLabel || 'Unmapped account';
      if (!accountBaselines.has(accountKey)) {
        accountBaselines.set(accountKey, []);
      }
      if (Math.abs(row.amount) > 0) {
        accountBaselines.get(accountKey).push(Math.abs(row.amount));
      }

      if (!accountStats.has(accountKey)) {
        accountStats.set(accountKey, {
          account: accountKey,
          rows: 0,
          flagged: 0,
          totalAbs: 0,
          net: 0,
          unusual: 0,
          weekend: 0,
          manual: 0
        });
      }

      const accountRecord = accountStats.get(accountKey);
      accountRecord.rows += 1;
      accountRecord.totalAbs += Math.abs(row.amount);
      accountRecord.net += row.amount;

      if (row.journalId) {
        if (!journalStats.has(row.journalId)) {
          journalStats.set(row.journalId, {
            journalId: row.journalId,
            rows: [],
            net: 0,
            totalAbs: 0
          });
        }

        const journal = journalStats.get(row.journalId);
        journal.rows.push(row);
        journal.net += row.amount;
        journal.totalAbs += Math.abs(row.amount);
      }
    });

    const findings = rows.map((row) => {
      const accountKey = row.accountLabel || 'Unmapped account';
      const accountValues = accountBaselines.get(accountKey) || [];
      const baseline = median(accountValues);
      const duplicateKey = [
        row.date ? row.date.toISOString().slice(0, 10) : row.dateText,
        normalizeText(row.accountLabel),
        row.amount.toFixed(2),
        normalizeText(row.description)
      ].join('|');
      const journal = row.journalId ? journalStats.get(row.journalId) : null;
      const flags = [];

      if ((duplicateCounts.get(duplicateKey) || 0) > 1) {
        flags.push('duplicate_line');
      }

      if (baseline && accountValues.length >= 4 && Math.abs(row.amount) >= Math.max(baseline * 6, 5000)) {
        flags.push('unusual_amount');
      }

      if (isMeaninglessDescription(row.description)) {
        flags.push('missing_description');
      }

      if (row.date instanceof Date && (row.date.getDay() === 0 || row.date.getDay() === 6)) {
        flags.push('weekend_posting');
      }

      if (Math.abs(row.amount) >= 1000 && Math.abs(row.amount % 1000) < 0.0001) {
        flags.push('round_dollar');
      }

      if (/manual|excel|spreadsheet|upload/i.test(row.source)) {
        flags.push('manual_source');
      }

      if (journal && journal.rows.length > 1 && Math.abs(journal.net) > 0.01) {
        flags.push('unbalanced_journal');
      }

      if ((row.debit || 0) > 0 && (row.credit || 0) > 0) {
        flags.push('mixed_debit_credit');
      }

      const uniqueFlags = [...new Set(flags)];
      const riskScore = Math.min(100, uniqueFlags.reduce((total, flag) => total + (FLAG_WEIGHTS[flag] || 0), 0));

      const accountRecord = accountStats.get(accountKey);
      if (uniqueFlags.length) {
        accountRecord.flagged += 1;
      }
      if (uniqueFlags.includes('unusual_amount')) {
        accountRecord.unusual += 1;
      }
      if (uniqueFlags.includes('weekend_posting')) {
        accountRecord.weekend += 1;
      }
      if (uniqueFlags.includes('manual_source')) {
        accountRecord.manual += 1;
      }

      return {
        ...row,
        flags: uniqueFlags,
        riskScore,
        journalNet: journal ? journal.net : 0
      };
    });

    const flaggedRows = findings
      .filter((row) => row.flags.length)
      .sort((left, right) => right.riskScore - left.riskScore || Math.abs(right.amount) - Math.abs(left.amount));

    const flagCounts = flaggedRows.reduce((accumulator, row) => {
      row.flags.forEach((flag) => {
        accumulator[flag] = (accumulator[flag] || 0) + 1;
      });
      return accumulator;
    }, {});

    const hotspots = [...accountStats.values()]
      .sort((left, right) => {
        const leftScore = left.flagged * 10 + left.unusual * 8 + left.manual * 4 + left.weekend * 4 + left.totalAbs / 5000;
        const rightScore = right.flagged * 10 + right.unusual * 8 + right.manual * 4 + right.weekend * 4 + right.totalAbs / 5000;
        return rightScore - leftScore;
      })
      .slice(0, 8);

    const journalInsights = [...journalStats.values()]
      .filter((journal) => journal.rows.length > 1)
      .sort((left, right) => Math.abs(right.net) - Math.abs(left.net) || right.totalAbs - left.totalAbs)
      .slice(0, 6)
      .map((journal) => ({
        journalId: journal.journalId,
        net: journal.net,
        totalAbs: journal.totalAbs,
        rows: journal.rows.length
      }));

    const metrics = {
      rows: findings.length,
      flaggedRows: flaggedRows.length,
      accounts: accountStats.size,
      journals: journalStats.size,
      netBalance: findings.reduce((total, row) => total + row.amount, 0),
      totalAbsoluteValue: findings.reduce((total, row) => total + Math.abs(row.amount), 0)
    };

    return {
      rows: findings,
      flaggedRows,
      hotspots,
      journalInsights,
      flagCounts,
      metrics
    };
  }

  function createMappingMarkup(headers) {
    const options = ['<option value="">Not mapped</option>']
      .concat(headers.map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`))
      .join('');

    return FIELD_DEFINITIONS.map((field) => `
      <div class="hrtf-field">
        <label for="map-${field.key}">${escapeHtml(field.label)}</label>
        <select id="map-${field.key}" data-field="${field.key}">
          ${options}
        </select>
        <small>${escapeHtml(field.help)}</small>
      </div>
    `).join('');
  }

  function renderFlagSummary(flagCounts) {
    const total = Object.values(flagCounts).reduce((sum, count) => sum + count, 0);
    const topFlags = Object.entries(flagCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6);

    if (!topFlags.length) {
      return '<p class="hrtf-status muted">No risk signals were detected with the current mapping.</p>';
    }

    return topFlags.map(([flag, count]) => {
      const ratio = total ? (count / total) * 100 : 0;
      return `
        <div class="hrtf-flag-item">
          <strong>${escapeHtml(formatNumber(count))}</strong>
          <span>${escapeHtml(FLAG_LABELS[flag] || flag)}</span>
          <div class="hrtf-flag-bar"><span style="width:${Math.max(6, ratio)}%"></span></div>
        </div>
      `;
    }).join('');
  }

  function renderFindingsTable(flaggedRows) {
    if (!flaggedRows.length) {
      return '<p class="hrtf-status muted">No rows were flagged. Try remapping the file or review a different export.</p>';
    }

    return `
      <div class="hrtf-table-wrap">
        <table class="hrtf-table">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Date</th>
              <th>Journal</th>
              <th>Account</th>
              <th>Amount</th>
              <th>Why it surfaced</th>
            </tr>
          </thead>
          <tbody>
            ${flaggedRows.slice(0, 25).map((row) => `
              <tr>
                <td><span class="hrtf-score">${escapeHtml(String(row.riskScore))}</span></td>
                <td>${escapeHtml(formatDateValue(row.date || row.dateText))}</td>
                <td><strong>${escapeHtml(row.journalId || 'No journal ID')}</strong>${row.user ? `<span>${escapeHtml(row.user)}</span>` : ''}</td>
                <td><strong>${escapeHtml(row.accountLabel)}</strong>${row.description ? `<span>${escapeHtml(row.description)}</span>` : ''}</td>
                <td><strong>${escapeHtml(formatMoney(row.amount))}</strong>${row.entity ? `<span>${escapeHtml(row.entity)}</span>` : ''}</td>
                <td>
                  <div class="hrtf-flag-tags">
                    ${row.flags.map((flag) => `<span class="hrtf-flag-tag">${escapeHtml(FLAG_LABELS[flag] || flag)}</span>`).join('')}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderHotspots(hotspots) {
    if (!hotspots.length) {
      return '<p class="hrtf-status muted">Risk hot spots will appear here after the flagger processes enough account activity.</p>';
    }

    return hotspots.map((hotspot) => `
      <article class="hrtf-hotspot-card">
        <h4>${escapeHtml(hotspot.account)}</h4>
        <p>High-risk account based on flagged volume, large-value movement, and manual activity.</p>
        <div class="hrtf-hotspot-stats">
          <div class="hrtf-hotspot-stat">
            <strong>${escapeHtml(formatNumber(hotspot.flagged))}</strong>
            <span>flagged rows</span>
          </div>
          <div class="hrtf-hotspot-stat">
            <strong>${escapeHtml(formatMoney(hotspot.totalAbs))}</strong>
            <span>absolute movement</span>
          </div>
          <div class="hrtf-hotspot-stat">
            <strong>${escapeHtml(formatMoney(hotspot.net))}</strong>
            <span>net impact</span>
          </div>
        </div>
      </article>
    `).join('');
  }

  function renderJournalInsights(journalInsights) {
    if (!journalInsights.length) {
      return '<p class="hrtf-status muted">Map a journal or batch ID column to surface batch-level risk context.</p>';
    }

    return journalInsights.map((journal) => `
      <article class="hrtf-insight-card">
        <h4>${escapeHtml(journal.journalId)}</h4>
        <p>${escapeHtml(formatNumber(journal.rows))} rows &middot; ${escapeHtml(formatMoney(journal.totalAbs))} absolute value &middot; ${escapeHtml(formatMoney(journal.net))} net.</p>
      </article>
    `).join('');
  }

  function renderExplorer(rows, term) {
    const query = normalizeText(term);
    const filtered = rows.filter((row) => {
      if (!query) {
        return true;
      }

      return [
        row.journalId,
        row.accountLabel,
        row.description,
        row.user,
        row.entity,
        row.source
      ].some((value) => normalizeText(value).includes(query));
    }).slice(0, 50);

    if (!filtered.length) {
      return '<p class="hrtf-status muted">No rows matched that search.</p>';
    }

    return `
      <div class="hrtf-table-wrap">
        <table class="hrtf-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Journal</th>
              <th>Account</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((row) => `
              <tr>
                <td>${escapeHtml(formatDateValue(row.date || row.dateText))}</td>
                <td>${escapeHtml(row.journalId || 'No journal ID')}</td>
                <td><strong>${escapeHtml(row.accountLabel)}</strong></td>
                <td>${escapeHtml(row.description || 'No memo')}</td>
                <td>${escapeHtml(formatMoney(row.amount))}</td>
                <td>${row.flags.length ? `<div class="hrtf-flag-tags">${row.flags.map((flag) => `<span class="hrtf-flag-tag">${escapeHtml(FLAG_LABELS[flag] || flag)}</span>`).join('')}</div>` : '<span class="hrtf-status muted">Clear</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function updateSummaryCards(metrics) {
    const flaggedRatio = metrics.rows ? metrics.flaggedRows / metrics.rows : 0;
    document.querySelector('[data-metric="rows"]').innerHTML = `
      <strong>${escapeHtml(formatNumber(metrics.rows))}</strong>
      <span>transactions reviewed from the current export.</span>
      <div class="hrtf-meter"><span style="width:100%"></span></div>
    `;
    document.querySelector('[data-metric="flagged"]').innerHTML = `
      <strong>${escapeHtml(formatNumber(metrics.flaggedRows))}</strong>
      <span>transactions surfaced as high risk.</span>
      <div class="hrtf-meter"><span style="width:${Math.max(6, flaggedRatio * 100)}%"></span></div>
    `;
    document.querySelector('[data-metric="accounts"]').innerHTML = `
      <strong>${escapeHtml(formatNumber(metrics.accounts))}</strong>
      <span>accounts represented in the export.</span>
      <div class="hrtf-meter"><span style="width:${Math.min(100, metrics.accounts * 3)}%"></span></div>
    `;
    document.querySelector('[data-metric="net"]').innerHTML = `
      <strong>${escapeHtml(formatMoney(metrics.netBalance))}</strong>
      <span>net movement across loaded transactions.</span>
      <div class="hrtf-meter"><span style="width:${Math.min(100, metrics.totalAbsoluteValue ? Math.abs(metrics.netBalance) / metrics.totalAbsoluteValue * 100 : 0)}%"></span></div>
    `;
  }

  function setStatus(message, type) {
    const status = document.getElementById('hrtf-status');
    status.className = `hrtf-status${type ? ` ${type}` : ''}`;
    status.textContent = message;
  }

  function exportFlaggedRows() {
    if (!state.analysis || !state.parsed) {
      return;
    }

    const headers = [...state.parsed.headers, 'Risk Score', 'Flags'];
    const lines = [headers.map(csvEscape).join(',')];

    state.analysis.flaggedRows.forEach((row) => {
      const values = state.parsed.headers.map((header) => row.raw[header] || '');
      values.push(row.riskScore);
      values.push(row.flags.map((flag) => FLAG_LABELS[flag] || flag).join(' | '));
      lines.push(values.map(csvEscape).join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ledger-summit-high-risk-transactions.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function updateMappingInputs(mapping) {
    document.querySelectorAll('[data-field]').forEach((select) => {
      const field = select.getAttribute('data-field');
      select.value = mapping[field] || '';
    });
  }

  function readMappingFromInputs() {
    const mapping = {};
    document.querySelectorAll('[data-field]').forEach((select) => {
      const field = select.getAttribute('data-field');
      mapping[field] = select.value;
    });
    return mapping;
  }

  function validateMapping(mapping) {
    const hasAccount = Boolean(mapping.accountCode || mapping.accountName);
    const hasAmount = Boolean(mapping.amount || mapping.debit || mapping.credit);
    if (!hasAccount || !hasAmount) {
      throw new Error('Map at least one account field plus either a signed amount or debit and credit columns.');
    }
  }

  function handleParsedData(parsed, autoAnalyze) {
    state.parsed = parsed;
    state.mapping = guessMapping(parsed.headers);

    const mappingWrap = document.getElementById('hrtf-mapping-grid');
    mappingWrap.innerHTML = createMappingMarkup(parsed.headers);
    updateMappingInputs(state.mapping);

    document.getElementById('hrtf-setup-meta').innerHTML = `
      <span class="hrtf-meta-chip"><strong>${escapeHtml(formatNumber(parsed.rows.length))}</strong> rows loaded</span>
      <span class="hrtf-meta-chip"><strong>${escapeHtml(formatNumber(parsed.headers.length))}</strong> columns detected</span>
      <span class="hrtf-meta-chip"><strong>${escapeHtml(parsed.delimiter === '\t' ? 'Tab-delimited' : parsed.delimiter)}</strong> delimiter</span>
    `;

    setStatus(`Loaded ${parsed.rows.length} rows and ${parsed.headers.length} columns. Review the mapping and click Flag Risky Transactions.`, 'success');

    if (autoAnalyze) {
      runAnalysis();
    }
  }

  function runAnalysis() {
    try {
      const mapping = readMappingFromInputs();
      validateMapping(mapping);
      const normalized = parseMappingRows(state.parsed, mapping);
      if (!normalized.length) {
        throw new Error('The mapped file did not produce any analyzable rows. Check the column mapping and try again.');
      }

      const analysis = analyzeRows(normalized);
      state.mapping = mapping;
      state.normalized = normalized;
      state.analysis = analysis;

      updateSummaryCards(analysis.metrics);
      document.getElementById('hrtf-flag-grid').innerHTML = renderFlagSummary(analysis.flagCounts);
      document.getElementById('hrtf-findings-table').innerHTML = renderFindingsTable(analysis.flaggedRows);
      document.getElementById('hrtf-hotspot-grid').innerHTML = renderHotspots(analysis.hotspots);
      document.getElementById('hrtf-insight-grid').innerHTML = renderJournalInsights(analysis.journalInsights);
      document.getElementById('hrtf-explorer-table').innerHTML = renderExplorer(analysis.rows, '');
      document.getElementById('hrtf-search').value = '';
      document.getElementById('hrtf-results').hidden = false;
      document.getElementById('hrtf-empty').hidden = true;
      document.getElementById('hrtf-export').disabled = analysis.flaggedRows.length === 0;

      const flaggedRatio = analysis.metrics.rows ? analysis.metrics.flaggedRows / analysis.metrics.rows : 0;
      setStatus(`Risk review complete. ${analysis.metrics.flaggedRows} of ${analysis.metrics.rows} transactions were prioritized for review (${formatPercent(flaggedRatio)}).`, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function loadText(text, autoAnalyze) {
    try {
      const delimiter = detectDelimiter(text);
      const parsed = parseDelimited(text, delimiter);
      handleParsedData(parsed, autoAnalyze);
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function bindEvents() {
    const fileInput = document.getElementById('hrtf-file');
    const textarea = document.getElementById('hrtf-paste');
    const analyzeButton = document.getElementById('hrtf-analyze');
    const sampleButton = document.getElementById('hrtf-sample');
    const pasteButton = document.getElementById('hrtf-paste-button');
    const resetButton = document.getElementById('hrtf-reset');
    const exportButton = document.getElementById('hrtf-export');
    const searchInput = document.getElementById('hrtf-search');

    fileInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => loadText(reader.result, false);
      reader.onerror = () => setStatus('The selected file could not be read. Try exporting again as CSV.', 'error');
      reader.readAsText(file);
    });

    sampleButton.addEventListener('click', () => {
      textarea.value = SAMPLE_CSV;
      loadText(SAMPLE_CSV, true);
    });

    pasteButton.addEventListener('click', () => {
      if (!textarea.value.trim()) {
        setStatus('Paste CSV or tab-delimited data first, then click Use Pasted Data.', 'error');
        return;
      }
      loadText(textarea.value, false);
    });

    analyzeButton.addEventListener('click', () => {
      if (!state.parsed) {
        setStatus('Load a file or paste data before running the flagger.', 'error');
        return;
      }
      runAnalysis();
    });

    resetButton.addEventListener('click', () => {
      state.parsed = null;
      state.normalized = [];
      state.analysis = null;
      state.mapping = {};
      textarea.value = '';
      fileInput.value = '';
      document.getElementById('hrtf-mapping-grid').innerHTML = '';
      document.getElementById('hrtf-setup-meta').innerHTML = '';
      document.getElementById('hrtf-results').hidden = true;
      document.getElementById('hrtf-empty').hidden = false;
      document.getElementById('hrtf-export').disabled = true;
      document.getElementById('hrtf-search').value = '';
      setStatus('Tool reset. Load a new export or try the sample transactions.', 'muted');
    });

    exportButton.addEventListener('click', exportFlaggedRows);

    searchInput.addEventListener('input', () => {
      if (!state.analysis) {
        return;
      }
      document.getElementById('hrtf-explorer-table').innerHTML = renderExplorer(state.analysis.rows, searchInput.value);
    });
  }

  function init() {
    const root = document.getElementById('hrtf-app');
    if (!root) {
      return;
    }

    bindEvents();
    setStatus('Load a CSV export or try the sample transactions to start.', 'muted');
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parseDelimited,
      detectDelimiter,
      guessMapping,
      parseMappingRows,
      analyzeRows,
      SAMPLE_CSV
    };
  }
}());

