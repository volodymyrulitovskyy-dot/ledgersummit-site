(function () {
  'use strict';

  const FIELD_DEFINITIONS = [
    { key: 'date', label: 'Posting date', help: 'Used for period and weekend checks.' },
    { key: 'journalId', label: 'Journal or batch ID', help: 'Required for journal-level validation.' },
    { key: 'lineId', label: 'Line ID', help: 'Optional but useful when exporting exception detail.' },
    { key: 'accountCode', label: 'Account code', help: 'Recommended if your export has numeric GL accounts.' },
    { key: 'accountName', label: 'Account name', help: 'Useful for reviewer context.' },
    { key: 'description', label: 'Description or memo', help: 'Used for generic memo, duplicate, and accrual checks.' },
    { key: 'amount', label: 'Signed amount', help: 'Use this if your export already has positive and negative values.' },
    { key: 'debit', label: 'Debit', help: 'Optional if signed amount is not available.' },
    { key: 'credit', label: 'Credit', help: 'Optional if signed amount is not available.' },
    { key: 'source', label: 'Source or JE type', help: 'Helpful for identifying manual or spreadsheet entries.' },
    { key: 'preparer', label: 'Preparer', help: 'Used for reviewer routing and exception hot spots.' },
    { key: 'approver', label: 'Approver', help: 'Used for approval-control checks when available.' },
    { key: 'support', label: 'Support reference', help: 'Map a support ticket, document ID, or attachment reference if present.' },
    { key: 'reversalDate', label: 'Reversal date', help: 'Useful for accrual and top-side validation.' },
    { key: 'entity', label: 'Entity / company / subsidiary', help: 'Optional but useful for grouped close reviews.' }
  ];

  const COLUMN_HINTS = {
    date: ['date', 'postingdate', 'postingdt', 'postdate', 'postdt', 'transactiondate', 'journaldate', 'trxdate', 'entrydate'],
    journalId: ['journalid', 'journalentry', 'journal', 'jrnl', 'je', 'jeid', 'batch', 'batchid', 'batchnumber', 'document', 'documentnumber', 'docno', 'entrynumber', 'referencenumber'],
    lineId: ['lineid', 'lineno', 'linenumber', 'line', 'ln', 'journalline', 'rowid'],
    accountCode: ['account', 'accountnumber', 'accountcode', 'glaccount', 'glcode', 'naturalaccount', 'naturalacct', 'acct', 'acctno', 'accountno'],
    accountName: ['accountname', 'accountdescription', 'accountdesc', 'acctdesc', 'accounttitle', 'gldescription', 'glaccountname', 'acctname', 'accountfullname', 'fullname'],
    description: ['description', 'memo', 'memotext', 'linedescription', 'linecomment', 'comment', 'notes', 'details', 'transactiondescription', 'headerdescription', 'linememo'],
    amount: ['amount', 'signedamount', 'netamount', 'value', 'lineamount', 'transactionamount'],
    debit: ['debit', 'debits', 'debitamount', 'debitamt', 'dr', 'dramt'],
    credit: ['credit', 'credits', 'creditamount', 'creditamt', 'cr', 'cramt'],
    source: ['source', 'module', 'origin', 'sourcetype', 'entrysource', 'channel', 'transactiontype', 'type'],
    preparer: ['preparer', 'preparedby', 'createdby', 'owner', 'employee', 'enteredby', 'entered', 'user'],
    approver: ['approver', 'approvedby', 'reviewer', 'postedby', 'authorizedby'],
    support: ['support', 'supportref', 'supportingdoc', 'attachment', 'ticket', 'reference', 'ref', 'documentlink'],
    reversalDate: ['reversaldate', 'reversedate', 'autoreversaldate', 'autoreverseon', 'reverseon'],
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
    missing_journal_id: 'Missing journal ID',
    unbalanced_journal: 'Journal does not net to zero',
    missing_description: 'Missing or generic description',
    duplicate_line: 'Possible duplicate line',
    duplicate_journal_pattern: 'Possible duplicate journal pattern',
    weekend_posting: 'Weekend posting',
    future_dated: 'Future-dated journal',
    manual_source: 'Manual or spreadsheet source',
    large_round_dollar: 'Large round-dollar journal',
    mixed_debit_credit: 'Debit and credit both populated',
    missing_preparer: 'Missing preparer',
    missing_approver: 'Missing approver',
    missing_support: 'Missing support reference',
    reversal_missing: 'Accrual-like journal missing reversal date',
    single_line_journal: 'Single-line journal',
    one_sided_journal: 'Only debits or only credits present'
  };

  const FLAG_WEIGHTS = {
    missing_journal_id: 22,
    unbalanced_journal: 28,
    missing_description: 8,
    duplicate_line: 14,
    duplicate_journal_pattern: 20,
    weekend_posting: 8,
    future_dated: 10,
    manual_source: 8,
    large_round_dollar: 10,
    mixed_debit_credit: 14,
    missing_preparer: 8,
    missing_approver: 12,
    missing_support: 10,
    reversal_missing: 14,
    single_line_journal: 12,
    one_sided_journal: 18
  };

  const SAMPLE_CSV = [
    'Posting Date,Journal ID,Line ID,Account,Account Name,Description,Debit,Credit,Source,Preparer,Approver,Support Ref,Reversal Date,Entity',
    '2026-03-03,JE2001,1,6100,Marketing Expense,Agency invoice accrual,8450,0,Manual,mlee,controller1,TKT-112,2026-03-31,US',
    '2026-03-03,JE2001,2,2100,Accrued Expenses,Agency invoice accrual,0,8450,Manual,mlee,controller1,TKT-112,2026-03-31,US',
    '2026-03-04,JE2002,1,6999,Misc Expense,Adjustment,25000,0,Excel Upload,jdoe,,JE-SUPPORT-7,,US',
    '2026-03-04,JE2002,2,2100,Accrued Expenses,Adjustment,0,25000,Excel Upload,jdoe,,JE-SUPPORT-7,,US',
    '2026-03-04,JE2003,1,6999,Misc Expense,Adjustment,25000,0,Excel Upload,jdoe,,JE-SUPPORT-7,,US',
    '2026-03-04,JE2003,2,2100,Accrued Expenses,Adjustment,0,25000,Excel Upload,jdoe,,JE-SUPPORT-7,,US',
    '2026-03-05,JE2004,1,1300,Inventory,Inventory top-side true-up,18000,0,Manual,psingh,controller2,INV-44,,US',
    '2026-03-05,JE2004,2,5000,COGS,Inventory top-side true-up,0,17500,Manual,psingh,controller2,INV-44,,US',
    '2026-03-08,JE2005,1,6400,Travel Expense,misc,5000,0,Manual,asmith,,,,US',
    '2026-03-08,JE2005,2,2100,Accrued Expenses,misc,0,5000,Manual,asmith,,,,US',
    '2026-03-09,,1,6200,Contractor Expense,Consulting catch-up,12000,0,Spreadsheet Upload,,controller1,,2026-03-31,CA',
    '2026-03-09,,2,2100,Accrued Expenses,Consulting catch-up,0,12000,Spreadsheet Upload,,controller1,,2026-03-31,CA',
    '2026-03-10,JE2007,1,6100,Marketing Expense,Campaign clean-up,4000,1500,Manual,jdoe,controller1,TKT-991,,US',
    '2026-03-11,JE2008,1,6100,Marketing Expense,Quarter-end accrual,100000,0,Manual,asmith,controller1,TKT-220,,US',
    '2026-03-11,JE2008,2,2100,Accrued Expenses,Quarter-end accrual,0,100000,Manual,asmith,controller1,TKT-220,,US'
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

  function getColumnSamples(rows, header, limit) {
    return rows
      .map((row) => String(row[header] || '').trim())
      .filter(Boolean)
      .slice(0, limit || 24);
  }

  function buildColumnProfile(samples) {
    const values = samples.filter(Boolean);
    const total = values.length || 1;
    const numericValues = values
      .map((value) => parseNumber(value))
      .filter((value) => value != null && !Number.isNaN(value));
    const dateValues = values
      .map((value) => parseDate(value))
      .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));
    const normalizedValues = values.map((value) => normalizeText(value)).filter(Boolean);
    const uniqueRatio = values.length ? new Set(normalizedValues).size / values.length : 0;
    const averageLength = values.length ? values.reduce((totalLength, value) => totalLength + value.length, 0) / values.length : 0;
    const zeroRatio = numericValues.length ? numericValues.filter((value) => Math.abs(value) < 0.0001).length / numericValues.length : 0;
    const positiveRatio = numericValues.length ? numericValues.filter((value) => value > 0).length / numericValues.length : 0;
    const negativeRatio = numericValues.length ? numericValues.filter((value) => value < 0).length / numericValues.length : 0;
    const accountCodeRatio = values.filter((value) => /^\d{3,8}$/.test(String(value).trim()) || /^\d{2,4}[-.]\d{2,4}$/.test(String(value).trim())).length / total;
    const accountNameRatio = normalizedValues.filter((value) => /\b(expense|revenue|receivable|payable|cash|inventory|accrued|liability|equity|travel|marketing|cogs|tax|asset)\b/.test(value) || (/^[a-z ]+$/.test(value) && value.includes(' ') && value.length >= 6)).length / total;
    const descriptionRatio = normalizedValues.filter((value) => value.length >= 8 && (value.includes(' ') || /[a-z]{6,}/.test(value))).length / total;
    const sourceRatio = normalizedValues.filter((value) => /\b(manual|system|import|upload|excel|spreadsheet|module|ap|ar|payroll|allocation|recurring)\b/.test(value)).length / total;
    const supportRatio = normalizedValues.filter((value) => /\b(ticket|support|doc|document|attachment|ref|reference|case|request|invoice)\b/.test(value) || /^[a-z]{2,10}[-_/]?\d{2,}$/i.test(value)).length / total;
    const userRatio = values.filter((value) => /^[A-Za-z][A-Za-z0-9._-]{2,}$/.test(String(value).trim()) || /^[A-Za-z]+ [A-Za-z]+$/.test(String(value).trim()) || String(value).includes('@')).length / total;
    const entityRatio = values.filter((value) => /^[A-Z]{2,5}$/.test(String(value).trim()) || /^(us|ca|uk|eu|emea|apac|latam)$/i.test(String(value).trim())).length / total;
    const idRatio = values.filter((value) => /^[A-Za-z]{1,6}[-_]?\d{1,}$/i.test(String(value).trim()) || /^[A-Za-z0-9_-]{4,20}$/.test(String(value).trim())).length / total;
    const smallIntegerRatio = numericValues.length ? numericValues.filter((value) => Math.abs(value - Math.round(value)) < 0.0001 && value >= 0 && value <= 1000).length / numericValues.length : 0;

    return {
      count: values.length,
      numericRatio: numericValues.length / total,
      dateRatio: dateValues.length / total,
      zeroRatio,
      positiveRatio,
      negativeRatio,
      uniqueRatio,
      averageLength,
      accountCodeRatio,
      accountNameRatio,
      descriptionRatio,
      sourceRatio,
      supportRatio,
      userRatio,
      entityRatio,
      idRatio,
      smallIntegerRatio,
      repeatRatio: 1 - uniqueRatio
    };
  }

  function getHeaderHintScore(fieldKey, column) {
    let bestScore = 0;
    COLUMN_HINTS[fieldKey].forEach((hint) => {
      if (column.slug === hint) {
        bestScore = Math.max(bestScore, 120);
      } else if (column.slug.startsWith(hint) || column.slug.endsWith(hint)) {
        bestScore = Math.max(bestScore, 92);
      } else if (column.slug.includes(hint)) {
        bestScore = Math.max(bestScore, 76);
      } else if (column.text.includes(hint)) {
        bestScore = Math.max(bestScore, 62);
      }
    });
    return bestScore;
  }

  function scoreColumnForField(fieldKey, column) {
    const profile = column.profile;
    let score = getHeaderHintScore(fieldKey, column);

    switch (fieldKey) {
      case 'date':
        if (profile.dateRatio >= 0.7) {
          score += 55;
        } else if (profile.dateRatio >= 0.35) {
          score += 28;
        }
        if (column.text.includes('reversal') || column.text.includes('reverse')) {
          score -= 18;
        }
        break;
      case 'reversalDate':
        if (profile.dateRatio >= 0.4) {
          score += 34;
        }
        if (column.text.includes('reversal') || column.text.includes('reverse')) {
          score += 48;
        }
        break;
      case 'journalId':
        if (profile.idRatio >= 0.45) {
          score += 26;
        }
        if (profile.repeatRatio >= 0.25) {
          score += 18;
        }
        if (profile.averageLength >= 4 && profile.averageLength <= 18) {
          score += 6;
        }
        break;
      case 'lineId':
        if (profile.smallIntegerRatio >= 0.8) {
          score += 50;
        } else if (profile.smallIntegerRatio >= 0.5) {
          score += 28;
        }
        if (column.text.includes('journal') || column.text.includes('batch')) {
          score -= 16;
        }
        break;
      case 'accountCode':
        if (profile.accountCodeRatio >= 0.7) {
          score += 58;
        } else if (profile.accountCodeRatio >= 0.35) {
          score += 28;
        }
        if (profile.accountNameRatio >= 0.35) {
          score -= 20;
        }
        break;
      case 'accountName':
        if (profile.accountNameRatio >= 0.65) {
          score += 58;
        } else if (profile.accountNameRatio >= 0.35) {
          score += 30;
        }
        if (profile.accountCodeRatio >= 0.35) {
          score -= 24;
        }
        break;
      case 'description':
        if (profile.descriptionRatio >= 0.65) {
          score += 48;
        } else if (profile.descriptionRatio >= 0.35) {
          score += 22;
        }
        if (profile.averageLength >= 12) {
          score += 10;
        }
        break;
      case 'amount':
        if (profile.numericRatio >= 0.8) {
          if (profile.positiveRatio >= 0.1 && profile.negativeRatio >= 0.1) {
            score += 56;
          } else if (profile.zeroRatio <= 0.15) {
            score += 18;
          }
          if (profile.zeroRatio >= 0.45 && profile.negativeRatio === 0) {
            score -= 22;
          }
        }
        break;
      case 'debit':
        if (profile.numericRatio >= 0.8 && profile.negativeRatio === 0) {
          if (profile.zeroRatio >= 0.2 && profile.positiveRatio >= 0.1) {
            score += 42;
          } else {
            score += 14;
          }
        }
        if (column.text.includes('credit') || column.text === 'cr') {
          score -= 60;
        }
        break;
      case 'credit':
        if (profile.numericRatio >= 0.8 && profile.negativeRatio === 0) {
          if (profile.zeroRatio >= 0.2 && profile.positiveRatio >= 0.1) {
            score += 42;
          } else {
            score += 14;
          }
        }
        if (column.text.includes('debit') || column.text === 'dr') {
          score -= 60;
        }
        break;
      case 'source':
        if (profile.sourceRatio >= 0.4) {
          score += 46;
        } else if (profile.uniqueRatio <= 0.45 && profile.averageLength <= 18) {
          score += 12;
        }
        break;
      case 'preparer':
        if (profile.userRatio >= 0.45) {
          score += 34;
        }
        if (column.text.includes('approv') || column.text.includes('review')) {
          score -= 18;
        }
        break;
      case 'approver':
        if (profile.userRatio >= 0.4) {
          score += 28;
        }
        if (column.text.includes('approv') || column.text.includes('review') || column.text.includes('authoriz')) {
          score += 26;
        }
        if (column.text.includes('prepar') || column.text.includes('created')) {
          score -= 16;
        }
        break;
      case 'support':
        if (profile.supportRatio >= 0.35) {
          score += 48;
        }
        break;
      case 'entity':
        if (profile.entityRatio >= 0.45) {
          score += 42;
        } else if (profile.uniqueRatio <= 0.35 && profile.averageLength <= 8) {
          score += 12;
        }
        break;
      default:
        break;
    }

    return score;
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

  function guessMapping(headers, rows) {
    const columns = headers.map((header) => ({
      original: header,
      slug: slugifyHeader(header),
      text: normalizeText(header),
      profile: buildColumnProfile(getColumnSamples(rows || [], header))
    }));
    const mapping = {};
    const usedHeaders = new Set();
    const candidates = [];

    FIELD_DEFINITIONS.forEach((field) => {
      columns.forEach((column) => {
        const score = scoreColumnForField(field.key, column);
        if (score > 0) {
          candidates.push({
            field: field.key,
            header: column.original,
            score
          });
        }
      });
    });

    candidates
      .sort((left, right) => right.score - left.score || left.field.localeCompare(right.field))
      .forEach((candidate) => {
        if (candidate.score < 42) {
          return;
        }
        if (!mapping[candidate.field] && !usedHeaders.has(candidate.header)) {
          mapping[candidate.field] = candidate.header;
          usedHeaders.add(candidate.header);
        }
      });

    FIELD_DEFINITIONS.forEach((field) => {
      mapping[field.key] = mapping[field.key] || '';
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
    const today = new Date();
    const duplicateCounts = new Map();
    const journalStats = new Map();
    const preparerStats = new Map();

    rows.forEach((row) => {
      const duplicateKey = [
        row.date ? row.date.toISOString().slice(0, 10) : row.dateText,
        normalizeText(row.accountLabel),
        row.amount.toFixed(2),
        normalizeText(row.description),
        normalizeText(row.entity)
      ].join('|');
      duplicateCounts.set(duplicateKey, (duplicateCounts.get(duplicateKey) || 0) + 1);

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
      if (row.source) {
        journal.sources.add(row.source);
      }
      if (row.entity) {
        journal.entities.add(row.entity);
      }
    });

    const lineFindings = rows.map((row) => {
      const flags = [];
      const duplicateKey = [
        row.date ? row.date.toISOString().slice(0, 10) : row.dateText,
        normalizeText(row.accountLabel),
        row.amount.toFixed(2),
        normalizeText(row.description),
        normalizeText(row.entity)
      ].join('|');
      const normalizedDescription = normalizeText(row.description);

      if (!row.journalId) {
        flags.push('missing_journal_id');
      }
      if (isMeaninglessDescription(row.description)) {
        flags.push('missing_description');
      }
      if ((duplicateCounts.get(duplicateKey) || 0) > 1) {
        flags.push('duplicate_line');
      }
      if (row.date instanceof Date && (row.date.getDay() === 0 || row.date.getDay() === 6)) {
        flags.push('weekend_posting');
      }
      if (row.date instanceof Date && row.date.getTime() > today.getTime()) {
        flags.push('future_dated');
      }
      if (/manual|excel|spreadsheet|upload/i.test(row.source)) {
        flags.push('manual_source');
      }
      if (Math.abs(row.amount) >= 10000 && Math.abs(row.amount % 1000) < 0.0001) {
        flags.push('large_round_dollar');
      }
      if ((row.debit || 0) > 0 && (row.credit || 0) > 0) {
        flags.push('mixed_debit_credit');
      }
      if (!row.preparer) {
        flags.push('missing_preparer');
      }
      if (row.approver !== undefined && row.approver === '') {
        flags.push('missing_approver');
      }
      if (row.support !== undefined && row.support === '') {
        flags.push('missing_support');
      }
      if ((/accrual|true up|true-up|reclass|reserve|adjustment/.test(normalizedDescription) || Math.abs(row.amount) >= 10000) && !row.reversalDateText) {
        flags.push('reversal_missing');
      }

      const uniqueFlags = [...new Set(flags.filter((flag) => FLAG_WEIGHTS[flag]))];
      const riskScore = Math.min(100, uniqueFlags.reduce((total, flag) => total + (FLAG_WEIGHTS[flag] || 0), 0));

      return {
        ...row,
        flags: uniqueFlags,
        riskScore
      };
    });

    const journalSignatureCounts = new Map();
    [...journalStats.values()].forEach((journal) => {
      const signature = [
        journal.date ? journal.date.toISOString().slice(0, 10) : journal.dateText,
        (journal.totalAbs / 2).toFixed(2),
        normalizeText(journal.rows[0] ? journal.rows[0].description : ''),
        [...journal.entities].sort().join('|')
      ].join('|');
      journal.signature = signature;
      journalSignatureCounts.set(signature, (journalSignatureCounts.get(signature) || 0) + 1);
    });

    const journalExceptions = [...journalStats.values()].map((journal) => {
      const lineFlags = [...new Set(journal.rows.flatMap((row) => {
        const matching = lineFindings.find((item) => item.rowNumber === row.rowNumber);
        return matching ? matching.flags : [];
      }))];
      const journalFlags = [];

      if (!journal.journalId) {
        journalFlags.push('missing_journal_id');
      }
      if (Math.abs(journal.net) > 0.01) {
        journalFlags.push('unbalanced_journal');
      }
      if (journal.rows.length === 1) {
        journalFlags.push('single_line_journal');
      }
      if (journal.totalDebit === 0 || journal.totalCredit === 0) {
        journalFlags.push('one_sided_journal');
      }
      if ((journalSignatureCounts.get(journal.signature) || 0) > 1) {
        journalFlags.push('duplicate_journal_pattern');
      }

      const flags = [...new Set([...journalFlags, ...lineFlags].filter((flag) => FLAG_WEIGHTS[flag]))];
      const riskScore = Math.min(100, flags.reduce((total, flag) => total + (FLAG_WEIGHTS[flag] || 0), 0));
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
      if (flags.length) {
        preparerRecord.exceptionJournals += 1;
        preparerRecord.flags += flags.length;
      }

      return {
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
        flags,
        riskScore
      };
    }).sort((left, right) => right.riskScore - left.riskScore || right.totalAbs - left.totalAbs);

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
        title: 'Balanced journals',
        detail: `${journalExceptions.filter((journal) => Math.abs(journal.net) <= 0.01).length} of ${journalExceptions.length} journals net to zero.`,
        tone: 'good'
      },
      {
        title: 'Approval and support gaps',
        detail: `${(flagCounts.missing_approver || 0) + (flagCounts.missing_support || 0)} journals have missing approvals or support references.`,
        tone: 'warn'
      },
      {
        title: 'Manual top-side exposure',
        detail: `${(flagCounts.manual_source || 0) + (flagCounts.large_round_dollar || 0)} journals carry manual or large round-dollar signals.`,
        tone: 'warn'
      }
    ];

    const metrics = {
      journals: journalExceptions.length,
      exceptionJournals: journalExceptions.filter((journal) => journal.flags.length).length,
      flaggedRows: flaggedRows.length,
      balancedRate: journalExceptions.length ? journalExceptions.filter((journal) => Math.abs(journal.net) <= 0.01).length / journalExceptions.length : 0,
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
      <div class="jev-field">
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
      return '<p class="jev-status muted">No anomaly groups were detected with the current mapping.</p>';
    }

    return topFlags.map(([flag, count]) => {
      const ratio = total ? (count / total) * 100 : 0;
      return `
        <div class="jev-flag-item">
          <strong>${escapeHtml(formatNumber(count))}</strong>
          <span>${escapeHtml(FLAG_LABELS[flag] || flag)}</span>
          <div class="jev-flag-bar"><span style="width:${Math.max(6, ratio)}%"></span></div>
        </div>
      `;
    }).join('');
  }

  function renderFindingsTable(flaggedRows) {
    if (!flaggedRows.length) {
      return '<p class="jev-status muted">No journals were flagged. Try remapping the file or review a different export.</p>';
    }

    return `
      <div class="jev-table-wrap">
        <table class="jev-table">
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
                <td><span class="jev-score">${escapeHtml(String(row.riskScore))}</span></td>
                <td>${escapeHtml(formatDateValue(row.date || row.dateText))}</td>
                <td><strong>${escapeHtml(row.journalId || 'No journal ID')}</strong><span>${escapeHtml(formatNumber(row.lines))} lines &middot; ${escapeHtml(row.source)}</span></td>
                <td><strong>${escapeHtml(row.preparer)}</strong><span>${escapeHtml(row.approver)}${row.entity ? ` &middot; ${escapeHtml(row.entity)}` : ''}</span></td>
                <td><strong>${escapeHtml(formatMoney(row.totalAbs / 2))}</strong><span>${escapeHtml(formatMoney(row.net))} net</span></td>
                <td>
                  <div class="jev-flag-tags">
                    ${row.flags.map((flag) => `<span class="jev-flag-tag">${escapeHtml(FLAG_LABELS[flag] || flag)}</span>`).join('')}
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
      return '<p class="jev-status muted">Reviewer hot spots will appear here after the validator processes enough journal activity.</p>';
    }

    return hotspots.map((hotspot) => `
      <article class="jev-hotspot-card">
        <h4>${escapeHtml(hotspot.preparer)}</h4>
        <p>Use this to see where exception concentration is accumulating by preparer or source workflow.</p>
        <div class="jev-hotspot-stats">
          <div class="jev-hotspot-stat">
            <strong>${escapeHtml(formatNumber(hotspot.exceptionJournals))}</strong>
            <span>exception journals</span>
          </div>
          <div class="jev-hotspot-stat">
            <strong>${escapeHtml(formatMoney(hotspot.totalAbs))}</strong>
            <span>absolute movement</span>
          </div>
          <div class="jev-hotspot-stat">
            <strong>${escapeHtml(formatNumber(hotspot.flags))}</strong>
            <span>rule triggers</span>
          </div>
        </div>
      </article>
    `).join('');
  }

  function renderJournalInsights(journalInsights) {
    if (!journalInsights.length) {
      return '<p class="jev-status muted">Control insights will appear here after the validator reviews enough journals.</p>';
    }

    return journalInsights.map((journal) => `
      <article class="jev-insight-card">
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
      return '<p class="jev-status muted">No rows matched that search.</p>';
    }

    return `
      <div class="jev-table-wrap">
        <table class="jev-table">
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
                <td>${row.flags.length ? `<div class="jev-flag-tags">${row.flags.map((flag) => `<span class="jev-flag-tag">${escapeHtml(FLAG_LABELS[flag] || flag)}</span>`).join('')}</div>` : '<span class="jev-status muted">Clear</span>'}</td>
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
      <div class="jev-meter"><span style="width:100%"></span></div>
    `;
    document.querySelector('[data-metric="flagged"]').innerHTML = `
      <strong>${escapeHtml(formatNumber(metrics.exceptionJournals))}</strong>
      <span>journals failed at least one control check.</span>
      <div class="jev-meter"><span style="width:${Math.max(6, exceptionRatio * 100)}%"></span></div>
    `;
    document.querySelector('[data-metric="accounts"]').innerHTML = `
      <strong>${escapeHtml(formatNumber(metrics.flaggedRows))}</strong>
      <span>exception lines surfaced for follow-up.</span>
      <div class="jev-meter"><span style="width:${Math.min(100, metrics.flaggedRows * 3)}%"></span></div>
    `;
    document.querySelector('[data-metric="net"]').innerHTML = `
      <strong>${escapeHtml(formatPercent(metrics.balancedRate))}</strong>
      <span>of journals currently net to zero.</span>
      <div class="jev-meter"><span style="width:${Math.max(6, metrics.balancedRate * 100)}%"></span></div>
    `;
  }

  function setStatus(message, type) {
    const status = document.getElementById('jev-status');
    status.className = `jev-status${type ? ` ${type}` : ''}`;
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
    state.mapping = guessMapping(parsed.headers, parsed.rows);
    const autoMappedCount = Object.values(state.mapping).filter(Boolean).length;

    const mappingWrap = document.getElementById('jev-mapping-grid');
    mappingWrap.innerHTML = createMappingMarkup(parsed.headers);
    updateMappingInputs(state.mapping);

    document.getElementById('jev-setup-meta').innerHTML = `
      <span class="jev-meta-chip"><strong>${escapeHtml(formatNumber(parsed.rows.length))}</strong> rows loaded</span>
      <span class="jev-meta-chip"><strong>${escapeHtml(formatNumber(parsed.headers.length))}</strong> columns detected</span>
      <span class="jev-meta-chip"><strong>${escapeHtml(formatNumber(autoMappedCount))}</strong> fields auto-mapped</span>
      <span class="jev-meta-chip"><strong>${escapeHtml(parsed.delimiter === '\t' ? 'Tab-delimited' : parsed.delimiter)}</strong> delimiter</span>
    `;

    setStatus(`Loaded ${parsed.rows.length} rows and ${parsed.headers.length} columns. Smart mapping prefilled ${autoMappedCount} fields. Review the mapping and click Validate Journals.`, 'success');

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
      document.getElementById('jev-flag-grid').innerHTML = renderFlagSummary(analysis.flagCounts);
      document.getElementById('jev-findings-table').innerHTML = renderFindingsTable(analysis.exceptionJournals);
      document.getElementById('jev-hotspot-grid').innerHTML = renderHotspots(analysis.hotspots);
      document.getElementById('jev-insight-grid').innerHTML = renderJournalInsights(analysis.journalInsights);
      document.getElementById('jev-explorer-table').innerHTML = renderExplorer(analysis.rows, '');
      document.getElementById('jev-search').value = '';
      document.getElementById('jev-results').hidden = false;
      document.getElementById('jev-empty').hidden = true;
      document.getElementById('jev-export').disabled = analysis.flaggedRows.length === 0;

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
    const fileInput = document.getElementById('jev-file');
    const textarea = document.getElementById('jev-paste');
    const analyzeButton = document.getElementById('jev-analyze');
    const sampleButton = document.getElementById('jev-sample');
    const pasteButton = document.getElementById('jev-paste-button');
    const resetButton = document.getElementById('jev-reset');
    const exportButton = document.getElementById('jev-export');
    const searchInput = document.getElementById('jev-search');

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
      document.getElementById('jev-mapping-grid').innerHTML = '';
      document.getElementById('jev-setup-meta').innerHTML = '';
      document.getElementById('jev-results').hidden = true;
      document.getElementById('jev-empty').hidden = false;
      document.getElementById('jev-export').disabled = true;
      document.getElementById('jev-search').value = '';
      setStatus('Tool reset. Load a new export or try the sample journal export.', 'muted');
    });

    exportButton.addEventListener('click', exportFlaggedRows);

    searchInput.addEventListener('input', () => {
      if (!state.analysis) {
        return;
      }
      document.getElementById('jev-explorer-table').innerHTML = renderExplorer(state.analysis.rows, searchInput.value);
    });
  }

  function init() {
    const root = document.getElementById('jev-app');
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

