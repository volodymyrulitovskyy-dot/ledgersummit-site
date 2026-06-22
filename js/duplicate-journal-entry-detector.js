(function () {
  'use strict';

  const FIELD_DEFINITIONS = [
    { key: 'date', label: 'Posting date', help: 'Used for same-day repost and near-duplicate timing checks.' },
    { key: 'journalId', label: 'Journal or batch ID', help: 'Recommended so suspect duplicate clusters can be reviewed quickly.' },
    { key: 'externalId', label: 'External / import ID', help: 'Useful for catching repeated uploads or duplicated integration keys.' },
    { key: 'lineId', label: 'Line ID', help: 'Optional but useful when exporting suspect rows.' },
    { key: 'accountCode', label: 'Account code', help: 'Recommended if your export has numeric GL accounts.' },
    { key: 'accountName', label: 'Account name', help: 'Useful for reviewer context.' },
    { key: 'description', label: 'Description or memo', help: 'Used for exact-match and near-match duplicate clustering.' },
    { key: 'amount', label: 'Signed amount', help: 'Use this if your export already has positive and negative values.' },
    { key: 'debit', label: 'Debit', help: 'Optional if signed amount is not available.' },
    { key: 'credit', label: 'Credit', help: 'Optional if signed amount is not available.' },
    { key: 'source', label: 'Source or JE type', help: 'Useful for manual upload and spreadsheet repost detection.' },
    { key: 'preparer', label: 'Preparer', help: 'Used for reviewer routing and duplicate hot spots.' },
    { key: 'support', label: 'Support / ticket / attachment ref', help: 'Map a support ticket, document ID, or attachment reference if present.' },
    { key: 'reversalDate', label: 'Reversal date', help: 'Optional context for distinguishing reposts from valid accrual reversals.' },
    { key: 'entity', label: 'Entity / company / subsidiary', help: 'Recommended for multi-entity duplicate review.' }
  ];

  const COLUMN_HINTS = {
    date: ['date', 'postingdate', 'postdate', 'transactiondate', 'journaldate', 'trxdate', 'entrydate'],
    journalId: ['journalid', 'journalentry', 'journal', 'je', 'batch', 'batchid', 'document', 'documentnumber', 'docno', 'entrynumber', 'referencenumber'],
    externalId: ['externalid', 'externalref', 'externalreference', 'importid', 'integrationid', 'sourceid', 'uniqueid', 'requestid'],
    lineId: ['lineid', 'lineno', 'linenumber', 'line', 'journalline', 'rowid'],
    accountCode: ['account', 'accountnumber', 'accountcode', 'glaccount', 'glcode', 'naturalaccount', 'acct', 'accountno'],
    accountName: ['accountname', 'accountdescription', 'accounttitle', 'gldescription', 'glaccountname', 'acctname', 'accountfullname', 'fullname'],
    description: ['description', 'memo', 'linedescription', 'linecomment', 'comment', 'notes', 'details', 'transactiondescription', 'headerdescription', 'linememo'],
    amount: ['amount', 'signedamount', 'netamount', 'value', 'lineamount', 'transactionamount'],
    debit: ['debit', 'debits', 'dr'],
    credit: ['credit', 'credits', 'cr'],
    source: ['source', 'module', 'origin', 'sourcetype', 'entrysource', 'channel', 'transactiontype', 'type'],
    preparer: ['preparer', 'preparedby', 'createdby', 'owner', 'employee', 'enteredby', 'user'],
    support: ['support', 'supportref', 'supportingdoc', 'attachment', 'ticket', 'reference', 'ref', 'documentlink'],
    reversalDate: ['reversaldate', 'reversedate', 'autoreversaldate', 'reverseon'],
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
    exact_duplicate: 'Exact duplicate journals',
    same_day_repost: 'Same-day repost pattern',
    near_duplicate: 'Near-duplicate journal pattern',
    repeated_external_id: 'Repeated external or import ID',
    repeated_support_ref: 'Repeated support reference',
    copied_manual_pattern: 'Manual or spreadsheet copy pattern'
  };

  const FLAG_WEIGHTS = {
    exact_duplicate: 34,
    same_day_repost: 24,
    near_duplicate: 18,
    repeated_external_id: 20,
    repeated_support_ref: 16,
    copied_manual_pattern: 10
  };

  const SAMPLE_CSV = [
    'Posting Date,Journal ID,External ID,Line ID,Account,Account Name,Description,Debit,Credit,Source,Preparer,Support Ref,Reversal Date,Entity',
    '2026-03-03,JE3101,EXT-9001,1,6100,Marketing Expense,Q1 agency accrual,8450,0,Manual,mlee,TKT-112,2026-03-31,US',
    '2026-03-03,JE3101,EXT-9001,2,2100,Accrued Expenses,Q1 agency accrual,0,8450,Manual,mlee,TKT-112,2026-03-31,US',
    '2026-03-03,JE3102,EXT-9002,1,6100,Marketing Expense,Q1 agency accrual,8450,0,Manual,mlee,TKT-112-DUP,2026-03-31,US',
    '2026-03-03,JE3102,EXT-9002,2,2100,Accrued Expenses,Q1 agency accrual,0,8450,Manual,mlee,TKT-112-DUP,2026-03-31,US',
    '2026-03-05,JE3103,EXT-9010,1,6999,Misc Expense,Payroll reclass north,25000,0,Spreadsheet Upload,jdoe,JE-SUPPORT-7,,US',
    '2026-03-05,JE3103,EXT-9010,2,2100,Accrued Expenses,Payroll reclass north,0,25000,Spreadsheet Upload,jdoe,JE-SUPPORT-7,,US',
    '2026-03-07,JE3104,EXT-9011,1,6999,Misc Expense,Payroll reclass north region,25000,0,Spreadsheet Upload,jdoe,JE-SUPPORT-7,,US',
    '2026-03-07,JE3104,EXT-9011,2,2100,Accrued Expenses,Payroll reclass north region,0,25000,Spreadsheet Upload,jdoe,JE-SUPPORT-7,,US',
    '2026-03-08,JE3105,CSV-777,1,6400,Travel Expense,Travel accrual Feb close,5000,0,CSV Import,asmith,TKT-220,,CA',
    '2026-03-08,JE3105,CSV-777,2,2100,Accrued Expenses,Travel accrual Feb close,0,5000,CSV Import,asmith,TKT-220,,CA',
    '2026-03-08,JE3106,CSV-777,1,6400,Travel Expense,Travel accrual Feb close,5000,0,CSV Import,asmith,TKT-220,,CA',
    '2026-03-08,JE3106,CSV-777,2,2100,Accrued Expenses,Travel accrual Feb close,0,5000,CSV Import,asmith,TKT-220,,CA',
    '2026-03-10,JE3107,,1,1300,Inventory,Inventory top-side true-up,18000,0,Manual,psingh,INV-44,,US',
    '2026-03-10,JE3107,,2,5000,COGS,Inventory top-side true-up,0,18000,Manual,psingh,INV-44,,US',
    '2026-03-10,JE3108,,1,1300,Inventory,Inventory top-side true up,18000,0,Manual,psingh,INV-44,,US',
    '2026-03-10,JE3108,,2,5000,COGS,Inventory top-side true up,0,18000,Manual,psingh,INV-44,,US',
    '2026-03-31,JE3109,REV-9001,1,6100,Marketing Expense,Q1 agency accrual reversal,0,8450,System,mlee,TKT-112,,US',
    '2026-03-31,JE3109,REV-9001,2,2100,Accrued Expenses,Q1 agency accrual reversal,8450,0,System,mlee,TKT-112,,US'
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
          lineId: mapping.lineId ? String(row[mapping.lineId] || '').trim() : '',
          accountCode,
          accountName,
          accountLabel,
          description: mapping.description ? String(row[mapping.description] || '').trim() : '',
          amount,
          debit,
          credit,
          source: mapping.source ? String(row[mapping.source] || '').trim() : '',
          preparer: mapping.preparer ? String(row[mapping.preparer] || '').trim() : '',
          approver: mapping.approver ? String(row[mapping.approver] || '').trim() : '',
          support: mapping.support ? String(row[mapping.support] || '').trim() : '',
          reversalDateText: mapping.reversalDate ? String(row[mapping.reversalDate] || '').trim() : '',
          reversalDate: mapping.reversalDate ? parseDate(row[mapping.reversalDate]) : null,
          entity: mapping.entity ? String(row[mapping.entity] || '').trim() : ''
        };
      })
      .filter((row) => {
        const hasAccount = row.accountCode || row.accountName;
        const hasAmount = row.amount != null && !Number.isNaN(row.amount) && row.amount !== 0;
        const hasDebitCredit = row.debit != null || row.credit != null;
        return hasAccount || hasAmount || hasDebitCredit || row.description || row.journalId || row.lineId;
      });
  }

  function analyzeRows(rows) {
    const journalStats = new Map();
    const preparerStats = new Map();

    rows.forEach((row) => {
      const journalKey = row.journalId || `MISSING-JE-${row.rowNumber}`;
      if (!journalStats.has(journalKey)) {
        journalStats.set(journalKey, {
          journalId: row.journalId || '',
          journalKey,
          date: row.date,
          dateText: row.dateText,
          rows: [],
          net: 0,
          totalAbs: 0,
          totalDebit: 0,
          totalCredit: 0,
          preparers: new Set(),
          approvers: new Set(),
          supports: new Set(),
          externalIds: new Set(),
          sources: new Set(),
          entities: new Set()
        });
      }

      const journal = journalStats.get(journalKey);
      journal.rows.push(row);
      journal.net += row.amount;
      journal.totalAbs += Math.abs(row.amount);
      journal.totalDebit += row.debit || 0;
      journal.totalCredit += row.credit || 0;
      if (row.preparer) {
        journal.preparers.add(row.preparer);
      }
      if (row.approver) {
        journal.approvers.add(row.approver);
      }
      if (row.support) {
        journal.supports.add(row.support);
      }
      if (row.externalId) {
        journal.externalIds.add(row.externalId);
      }
      if (row.source) {
        journal.sources.add(row.source);
      }
      if (row.entity) {
        journal.entities.add(row.entity);
      }
    });

    const exactCounts = new Map();
    const sameDayCounts = new Map();
    const nearCounts = new Map();
    const externalIdCounts = new Map();
    const supportCounts = new Map();

    [...journalStats.values()].forEach((journal) => {
      const entityKey = [...journal.entities].sort().join('|');
      const primaryDescription = normalizeText(journal.rows[0] ? journal.rows[0].description : '');
      const lineSignature = journal.rows
        .map((row) => [
          normalizeText(row.accountLabel),
          row.amount.toFixed(2),
          normalizeText(row.description),
          normalizeText(row.entity)
        ].join('|'))
        .sort()
        .join('~');

      journal.exactKey = [lineSignature, entityKey].join('|');
      journal.sameDayKey = [
        journal.date ? journal.date.toISOString().slice(0, 10) : journal.dateText,
        (journal.totalAbs / 2).toFixed(2),
        primaryDescription,
        entityKey
      ].join('|');
      journal.nearKey = [
        (journal.totalAbs / 2).toFixed(2),
        primaryDescription.replace(/\breversal\b|\breverse\b/g, '').trim(),
        entityKey
      ].join('|');

      exactCounts.set(journal.exactKey, (exactCounts.get(journal.exactKey) || 0) + 1);
      sameDayCounts.set(journal.sameDayKey, (sameDayCounts.get(journal.sameDayKey) || 0) + 1);
      nearCounts.set(journal.nearKey, (nearCounts.get(journal.nearKey) || 0) + 1);

      journal.externalIds.forEach((externalId) => {
        externalIdCounts.set(externalId, (externalIdCounts.get(externalId) || 0) + 1);
      });
      journal.supports.forEach((supportRef) => {
        supportCounts.set(supportRef, (supportCounts.get(supportRef) || 0) + 1);
      });
    });

    const journalExceptions = [...journalStats.values()].map((journal) => {
      const flags = [];
      const repeatedExternalId = [...journal.externalIds].some((externalId) => externalId && (externalIdCounts.get(externalId) || 0) > 1);
      const repeatedSupportRef = [...journal.supports].some((supportRef) => supportRef && (supportCounts.get(supportRef) || 0) > 1);
      const manualLike = [...journal.sources].some((source) => /manual|excel|spreadsheet|csv|upload/i.test(source));

      if ((exactCounts.get(journal.exactKey) || 0) > 1) {
        flags.push('exact_duplicate');
      }
      if ((sameDayCounts.get(journal.sameDayKey) || 0) > 1) {
        flags.push('same_day_repost');
      }
      if ((nearCounts.get(journal.nearKey) || 0) > 1 && (exactCounts.get(journal.exactKey) || 0) <= 1) {
        flags.push('near_duplicate');
      }
      if (repeatedExternalId) {
        flags.push('repeated_external_id');
      }
      if (repeatedSupportRef) {
        flags.push('repeated_support_ref');
      }
      if (manualLike && ((nearCounts.get(journal.nearKey) || 0) > 1 || repeatedExternalId || repeatedSupportRef)) {
        flags.push('copied_manual_pattern');
      }

      const uniqueFlags = [...new Set(flags.filter((flag) => FLAG_WEIGHTS[flag]))];
      const riskScore = Math.min(100, uniqueFlags.reduce((total, flag) => total + (FLAG_WEIGHTS[flag] || 0), 0));
      const preparer = [...journal.preparers][0] || 'Unassigned';

      if (!preparerStats.has(preparer)) {
        preparerStats.set(preparer, {
          preparer,
          journals: 0,
          exceptionJournals: 0,
          totalAbs: 0,
          flags: 0
        });
      }
      const preparerRecord = preparerStats.get(preparer);
      preparerRecord.journals += 1;
      preparerRecord.totalAbs += journal.totalAbs;
      if (uniqueFlags.length) {
        preparerRecord.exceptionJournals += 1;
        preparerRecord.flags += uniqueFlags.length;
      }

      return {
        journalKey: journal.journalKey,
        journalId: journal.journalId || 'Missing journal ID',
        date: journal.date,
        dateText: journal.dateText,
        lines: journal.rows.length,
        totalAbs: journal.totalAbs,
        net: journal.net,
        preparer,
        approver: [...journal.approvers][0] || 'Missing approver',
        source: [...journal.sources][0] || 'No source',
        entity: [...journal.entities][0] || '',
        flags: uniqueFlags,
        riskScore
      };
    }).sort((left, right) => right.riskScore - left.riskScore || right.totalAbs - left.totalAbs);

    const journalFlagsByKey = new Map(journalExceptions.map((journal) => [journal.journalKey, journal]));
    const lineFindings = rows.map((row) => {
      const journalKey = row.journalId || `MISSING-JE-${row.rowNumber}`;
      const journal = journalFlagsByKey.get(journalKey);
      const flags = journal ? journal.flags : [];
      const riskScore = Math.min(100, flags.reduce((total, flag) => total + (FLAG_WEIGHTS[flag] || 0), 0));

      return {
        ...row,
        flags,
        riskScore
      };
    });

    const flaggedRows = lineFindings
      .filter((row) => row.flags.length)
      .sort((left, right) => right.riskScore - left.riskScore || Math.abs(right.amount) - Math.abs(left.amount));

    const flagCounts = journalExceptions.reduce((accumulator, journal) => {
      journal.flags.forEach((flag) => {
        accumulator[flag] = (accumulator[flag] || 0) + 1;
      });
      return accumulator;
    }, {});

    const hotspots = [...preparerStats.values()]
      .sort((left, right) => right.exceptionJournals * 10 + right.flags - (left.exceptionJournals * 10 + left.flags))
      .slice(0, 6);

    const journalInsights = [
      {
        title: 'Exact duplicate clusters',
        detail: `${flagCounts.exact_duplicate || 0} journals are part of an exact duplicate cluster.`,
        tone: (flagCounts.exact_duplicate || 0) ? 'warn' : 'good'
      },
      {
        title: 'Repeated import keys',
        detail: `${(flagCounts.repeated_external_id || 0) + (flagCounts.repeated_support_ref || 0)} journals reuse external IDs or support references.`,
        tone: ((flagCounts.repeated_external_id || 0) + (flagCounts.repeated_support_ref || 0)) ? 'warn' : 'good'
      },
      {
        title: 'Manual copy patterns',
        detail: `${flagCounts.copied_manual_pattern || 0} journals show manual or spreadsheet repost signals.`,
        tone: (flagCounts.copied_manual_pattern || 0) ? 'warn' : 'good'
      }
    ];

    const metrics = {
      journals: journalExceptions.length,
      exceptionJournals: journalExceptions.filter((journal) => journal.flags.length).length,
      flaggedRows: flaggedRows.length,
      balancedRate: journalExceptions.length ? journalExceptions.filter((journal) => !journal.flags.length).length / journalExceptions.length : 0,
      totalAbsoluteValue: journalExceptions.reduce((total, journal) => total + journal.totalAbs, 0)
    };

    return {
      rows: lineFindings,
      flaggedRows,
      exceptionJournals: journalExceptions.filter((journal) => journal.flags.length),
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
      <div class="djed-field">
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
      return '<p class="djed-status muted">No anomaly groups were detected with the current mapping.</p>';
    }

    return topFlags.map(([flag, count]) => {
      const ratio = total ? (count / total) * 100 : 0;
      return `
        <div class="djed-flag-item">
          <strong>${escapeHtml(formatNumber(count))}</strong>
          <span>${escapeHtml(FLAG_LABELS[flag] || flag)}</span>
          <div class="djed-flag-bar"><span style="width:${Math.max(6, ratio)}%"></span></div>
        </div>
      `;
    }).join('');
  }

  function renderFindingsTable(flaggedRows) {
    if (!flaggedRows.length) {
      return '<p class="djed-status muted">No journals were flagged. Try remapping the file or review a different export.</p>';
    }

    return `
      <div class="djed-table-wrap">
        <table class="djed-table">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Date</th>
              <th>Journal</th>
              <th>Owner</th>
              <th>Value</th>
              <th>Why it failed validation</th>
            </tr>
          </thead>
          <tbody>
            ${flaggedRows.slice(0, 25).map((row) => `
              <tr>
                <td><span class="djed-score">${escapeHtml(String(row.riskScore))}</span></td>
                <td>${escapeHtml(formatDateValue(row.date || row.dateText))}</td>
                <td><strong>${escapeHtml(row.journalId || 'No journal ID')}</strong><span>${escapeHtml(formatNumber(row.lines))} lines &middot; ${escapeHtml(row.source)}</span></td>
                <td><strong>${escapeHtml(row.preparer)}</strong><span>${escapeHtml(row.approver)}${row.entity ? ` &middot; ${escapeHtml(row.entity)}` : ''}</span></td>
                <td><strong>${escapeHtml(formatMoney(row.totalAbs / 2))}</strong><span>${escapeHtml(formatMoney(row.net))} net</span></td>
                <td>
                  <div class="djed-flag-tags">
                    ${row.flags.map((flag) => `<span class="djed-flag-tag">${escapeHtml(FLAG_LABELS[flag] || flag)}</span>`).join('')}
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
      return '<p class="djed-status muted">Reviewer hot spots will appear here after the validator processes enough journal activity.</p>';
    }

    return hotspots.map((hotspot) => `
      <article class="djed-hotspot-card">
        <h4>${escapeHtml(hotspot.preparer)}</h4>
        <p>Use this to see where exception concentration is accumulating by preparer or source workflow.</p>
        <div class="djed-hotspot-stats">
          <div class="djed-hotspot-stat">
            <strong>${escapeHtml(formatNumber(hotspot.exceptionJournals))}</strong>
            <span>exception journals</span>
          </div>
          <div class="djed-hotspot-stat">
            <strong>${escapeHtml(formatMoney(hotspot.totalAbs))}</strong>
            <span>absolute movement</span>
          </div>
          <div class="djed-hotspot-stat">
            <strong>${escapeHtml(formatNumber(hotspot.flags))}</strong>
            <span>rule triggers</span>
          </div>
        </div>
      </article>
    `).join('');
  }

  function renderJournalInsights(journalInsights) {
    if (!journalInsights.length) {
      return '<p class="djed-status muted">Control insights will appear here after the validator reviews enough journals.</p>';
    }

    return journalInsights.map((journal) => `
      <article class="djed-insight-card">
        <h4>${escapeHtml(journal.title)}</h4>
        <p>${escapeHtml(journal.detail)}</p>
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
        row.preparer,
        row.approver,
        row.entity,
        row.source
      ].some((value) => normalizeText(value).includes(query));
    }).slice(0, 50);

    if (!filtered.length) {
      return '<p class="djed-status muted">No rows matched that search.</p>';
    }

    return `
      <div class="djed-table-wrap">
        <table class="djed-table">
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
                <td>${row.flags.length ? `<div class="djed-flag-tags">${row.flags.map((flag) => `<span class="djed-flag-tag">${escapeHtml(FLAG_LABELS[flag] || flag)}</span>`).join('')}</div>` : '<span class="djed-status muted">Clear</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function updateSummaryCards(metrics) {
    const exceptionRatio = metrics.journals ? metrics.exceptionJournals / metrics.journals : 0;
    document.querySelector('[data-metric="rows"]').innerHTML = `
      <strong>${escapeHtml(formatNumber(metrics.journals))}</strong>
      <span>journals validated from the current export.</span>
      <div class="djed-meter"><span style="width:100%"></span></div>
    `;
    document.querySelector('[data-metric="flagged"]').innerHTML = `
      <strong>${escapeHtml(formatNumber(metrics.exceptionJournals))}</strong>
      <span>journals failed at least one control check.</span>
      <div class="djed-meter"><span style="width:${Math.max(6, exceptionRatio * 100)}%"></span></div>
    `;
    document.querySelector('[data-metric="accounts"]').innerHTML = `
      <strong>${escapeHtml(formatNumber(metrics.flaggedRows))}</strong>
      <span>exception lines surfaced for follow-up.</span>
      <div class="djed-meter"><span style="width:${Math.min(100, metrics.flaggedRows * 3)}%"></span></div>
    `;
    document.querySelector('[data-metric="net"]').innerHTML = `
      <strong>${escapeHtml(formatPercent(metrics.balancedRate))}</strong>
      <span>of journals currently net to zero.</span>
      <div class="djed-meter"><span style="width:${Math.max(6, metrics.balancedRate * 100)}%"></span></div>
    `;
  }

  function setStatus(message, type) {
    const status = document.getElementById('djed-status');
    status.className = `djed-status${type ? ` ${type}` : ''}`;
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
    link.download = 'ledger-summit-flagged-gl-rows.csv';
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

    const mappingWrap = document.getElementById('djed-mapping-grid');
    mappingWrap.innerHTML = createMappingMarkup(parsed.headers);
    updateMappingInputs(state.mapping);

    document.getElementById('djed-setup-meta').innerHTML = `
      <span class="djed-meta-chip"><strong>${escapeHtml(formatNumber(parsed.rows.length))}</strong> rows loaded</span>
      <span class="djed-meta-chip"><strong>${escapeHtml(formatNumber(parsed.headers.length))}</strong> columns detected</span>
      <span class="djed-meta-chip"><strong>${escapeHtml(parsed.delimiter === '\t' ? 'Tab-delimited' : parsed.delimiter)}</strong> delimiter</span>
    `;

    setStatus(`Loaded ${parsed.rows.length} rows and ${parsed.headers.length} columns. Review the mapping and click Analyze.`, 'success');

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
      document.getElementById('djed-flag-grid').innerHTML = renderFlagSummary(analysis.flagCounts);
      document.getElementById('djed-findings-table').innerHTML = renderFindingsTable(analysis.exceptionJournals);
      document.getElementById('djed-hotspot-grid').innerHTML = renderHotspots(analysis.hotspots);
      document.getElementById('djed-insight-grid').innerHTML = renderJournalInsights(analysis.journalInsights);
      document.getElementById('djed-explorer-table').innerHTML = renderExplorer(analysis.rows, '');
      document.getElementById('djed-search').value = '';
      document.getElementById('djed-results').hidden = false;
      document.getElementById('djed-empty').hidden = true;
      document.getElementById('djed-export').disabled = analysis.flaggedRows.length === 0;

      const flaggedRatio = analysis.metrics.journals ? analysis.metrics.exceptionJournals / analysis.metrics.journals : 0;
      setStatus(`Validation complete. ${analysis.metrics.exceptionJournals} of ${analysis.metrics.journals} journals failed at least one control check (${formatPercent(flaggedRatio)}).`, 'success');
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
    const fileInput = document.getElementById('djed-file');
    const textarea = document.getElementById('djed-paste');
    const analyzeButton = document.getElementById('djed-analyze');
    const sampleButton = document.getElementById('djed-sample');
    const pasteButton = document.getElementById('djed-paste-button');
    const resetButton = document.getElementById('djed-reset');
    const exportButton = document.getElementById('djed-export');
    const searchInput = document.getElementById('djed-search');

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
        setStatus('Load a file or paste data before running the validator.', 'error');
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
      document.getElementById('djed-mapping-grid').innerHTML = '';
      document.getElementById('djed-setup-meta').innerHTML = '';
      document.getElementById('djed-results').hidden = true;
      document.getElementById('djed-empty').hidden = false;
      document.getElementById('djed-export').disabled = true;
      document.getElementById('djed-search').value = '';
      setStatus('Tool reset. Load a new export or try the sample journal export.', 'muted');
    });

    exportButton.addEventListener('click', exportFlaggedRows);

    searchInput.addEventListener('input', () => {
      if (!state.analysis) {
        return;
      }
      document.getElementById('djed-explorer-table').innerHTML = renderExplorer(state.analysis.rows, searchInput.value);
    });
  }

  function init() {
    const root = document.getElementById('djed-app');
    if (!root) {
      return;
    }

    bindEvents();
    setStatus('Load a CSV export or try the sample journal export to start.', 'muted');
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


