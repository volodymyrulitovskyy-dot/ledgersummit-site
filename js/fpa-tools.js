(function () {
  'use strict';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function slugifyHeader(value) {
    return normalizeText(value).replace(/\s+/g, '');
  }

  function parseNumber(value) {
    if (value == null || value === '') {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const raw = String(value).trim();
    if (!raw) {
      return null;
    }
    const negative = /^\(.*\)$/.test(raw);
    const cleaned = raw.replace(/[,$\s]/g, '').replace(/[()]/g, '').replace(/[^0-9.\-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') {
      return null;
    }
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
  }

  function firstText() {
    for (var index = 0; index < arguments.length; index += 1) {
      var value = arguments[index];
      if (value == null) {
        continue;
      }
      var text = String(value).trim();
      if (text) {
        return text;
      }
    }
    return '';
  }

  function firstNumber() {
    for (var index = 0; index < arguments.length; index += 1) {
      var parsed = parseNumber(arguments[index]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  function sum(values) {
    return values.reduce(function (total, value) {
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  function average(values) {
    const filtered = values.filter(function (value) { return Number.isFinite(value); });
    return filtered.length ? sum(filtered) / filtered.length : 0;
  }

  function stdev(values) {
    const filtered = values.filter(function (value) { return Number.isFinite(value); });
    if (filtered.length < 2) {
      return 0;
    }
    const mean = average(filtered);
    return Math.sqrt(average(filtered.map(function (value) { return Math.pow(value - mean, 2); })));
  }

  function toRatio(percentValue) {
    return Number.isFinite(percentValue) ? percentValue / 100 : 0;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: Math.abs(value || 0) >= 1000 ? 0 : 2,
      maximumFractionDigits: Math.abs(value || 0) >= 1000 ? 0 : 2
    }).format(Number.isFinite(value) ? value : 0);
  }

  function formatPercent(value, digits) {
    const precision = Number.isInteger(digits) ? digits : (Math.abs(value || 0) >= 10 ? 0 : 1);
    return Number.isFinite(value) ? value.toFixed(precision) + '%' : '0%';
  }

  function formatPercentFromRatio(value, digits) {
    return formatPercent(Number.isFinite(value) ? value * 100 : 0, digits);
  }

  function formatRatio(value) {
    return Number.isFinite(value) ? value.toFixed(value >= 10 ? 1 : 2) + 'x' : '0x';
  }

  function formatDays(value) {
    return Number.isFinite(value) ? value.toFixed(1) + ' days' : '0 days';
  }

  function formatMonths(value) {
    if (!Number.isFinite(value)) {
      return 'Break-even';
    }
    return value.toFixed(value >= 24 ? 0 : 1) + ' months';
  }

  function parseDate(value) {
    if (!value) {
      return null;
    }
    const source = value instanceof Date ? value : new Date(String(value) + 'T00:00:00');
    return Number.isFinite(source.getTime()) ? source : null;
  }

  function formatDate(value) {
    const date = parseDate(value);
    if (!date) {
      return 'Not provided';
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }

  function daysBetween(start, end) {
    const from = parseDate(start);
    const to = parseDate(end);
    if (!from || !to) {
      return 0;
    }
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  function addDays(dateValue, days) {
    const base = parseDate(dateValue);
    if (!base) {
      return null;
    }
    const result = new Date(base.getTime());
    result.setDate(result.getDate() + days);
    return result;
  }

  function addMonths(dateValue, months) {
    const base = parseDate(dateValue);
    if (!base) {
      return null;
    }
    const result = new Date(base.getTime());
    result.setMonth(result.getMonth() + months);
    return result;
  }

  function labelizeTermPreset(value) {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function csvEscape(value) {
    const text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function detectDelimiter(text) {
    const candidates = [',', '\t', ';', '|'];
    const lines = String(text || '').split(/\r\n|\n|\r/).filter(function (line) { return line.trim(); }).slice(0, 8);
    if (!lines.length) {
      return ',';
    }
    const scored = candidates.map(function (delimiter) {
      const counts = lines.map(function (line) { return splitLine(line, delimiter).length; });
      const averageCount = counts.reduce(function (total, count) { return total + count; }, 0) / Math.max(counts.length, 1);
      const consistent = counts.filter(function (count) { return count === counts[0]; }).length;
      return { delimiter: delimiter, score: averageCount + consistent * 0.25 };
    });
    scored.sort(function (left, right) { return right.score - left.score; });
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

  function parseDelimitedRows(text, delimiter) {
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
        if (row.some(function (cell) { return String(cell).trim() !== ''; })) {
          rows.push(row);
        }
        row = [];
      } else {
        current += char;
      }
    }

    if (current.length || row.length) {
      row.push(current);
      if (row.some(function (cell) { return String(cell).trim() !== ''; })) {
        rows.push(row);
      }
    }

    return rows;
  }

  function headerMapFor(columns, headerCells) {
    const map = {};
    const normalizedHeaders = headerCells.map(function (cell) { return normalizeText(cell); });
    columns.forEach(function (column, index) {
      const aliases = (column.aliases || []).concat([column.label, column.key]).map(normalizeText).filter(Boolean);
      let matchIndex = -1;
      normalizedHeaders.forEach(function (cell, headerIndex) {
        if (matchIndex >= 0) {
          return;
        }
        if (aliases.some(function (alias) { return cell === alias || cell.indexOf(alias) >= 0 || slugifyHeader(cell) === slugifyHeader(alias); })) {
          matchIndex = headerIndex;
        }
      });
      map[column.key] = matchIndex >= 0 ? matchIndex : index;
    });
    return map;
  }

  function likelyHeaderRow(cells, tableDef) {
    const matches = tableDef.columns.filter(function (column) {
      const aliases = (column.aliases || []).concat([column.label, column.key]).map(normalizeText);
      return cells.some(function (cell) {
        const normalizedCell = normalizeText(cell);
        return aliases.some(function (alias) { return normalizedCell === alias || normalizedCell.indexOf(alias) >= 0; });
      });
    }).length;
    return matches >= Math.min(2, tableDef.columns.length);
  }

  function cleanRowObject(row, tableDef) {
    const cleaned = {};
    tableDef.columns.forEach(function (column) {
      const raw = row[column.key] == null ? '' : row[column.key];
      cleaned[column.key] = (column.type === 'text' || column.type === 'select') ? String(raw).trim() : parseNumber(raw);
    });
    return cleaned;
  }

  function parseImportedRows(text, tableDef) {
    const rows = parseDelimitedRows(text, detectDelimiter(text));
    if (!rows.length) {
      return [];
    }
    const useHeader = likelyHeaderRow(rows[0], tableDef);
    const headerMap = useHeader ? headerMapFor(tableDef.columns, rows[0]) : null;
    return (useHeader ? rows.slice(1) : rows).map(function (cells) {
      const row = {};
      tableDef.columns.forEach(function (column, index) {
        const sourceIndex = headerMap ? headerMap[column.key] : index;
        row[column.key] = cells[sourceIndex] == null ? '' : String(cells[sourceIndex]).trim();
      });
      return cleanRowObject(row, tableDef);
    }).filter(function (row) {
      return tableDef.columns.some(function (column) {
        const value = row[column.key];
        return (column.type === 'text' || column.type === 'select') ? Boolean(String(value || '').trim()) : Number.isFinite(value);
      });
    });
  }

  function createEmptyRow(tableDef) {
    const row = {};
    tableDef.columns.forEach(function (column) {
      row[column.key] = (column.type === 'text' || column.type === 'select') ? '' : null;
    });
    return row;
  }

  function inferVarianceType(label) {
    return /revenue|sales|income|arr|mrr|bookings/.test(normalizeText(label)) ? 'revenue' : 'expense';
  }

  function buildResult(summary, signals, insights, details, table, exportRows, statusText) {
    return {
      summary: summary || [],
      signals: signals || [],
      insights: insights || [],
      details: details || [],
      table: table || null,
      exportRows: exportRows || [],
      statusText: statusText || 'Analysis complete.'
    };
  }

  const CALCULATORS = {
    'break-even-analysis-calculator': function (values) {
      const price = values.unitPrice;
      const variableCost = values.variableCost;
      const fixedCosts = values.fixedCosts;
      const targetProfit = values.targetProfit || 0;
      const expectedUnits = values.expectedUnits || 0;
      if (!(price > 0) || !(fixedCosts >= 0)) {
        throw new Error('Enter a positive selling price and a fixed-cost amount.');
      }
      if (!(variableCost >= 0) || variableCost >= price) {
        throw new Error('Variable cost must be below the selling price for break-even analysis to work.');
      }
      const contribution = price - variableCost;
      const ratio = contribution / price;
      const breakEvenUnits = fixedCosts / contribution;
      const breakEvenRevenue = fixedCosts / ratio;
      const targetUnits = (fixedCosts + targetProfit) / contribution;
      const expectedProfit = expectedUnits > 0 ? expectedUnits * contribution - fixedCosts : null;
      const marginOfSafetyUnits = expectedUnits > 0 ? expectedUnits - breakEvenUnits : null;
      const marginOfSafetyPct = expectedUnits > 0 ? marginOfSafetyUnits / expectedUnits * 100 : null;
      return buildResult(
        [
          { label: 'Break-even units', value: formatNumber(Math.ceil(breakEvenUnits)), tone: 'neutral', help: 'Minimum units required to cover fixed and variable cost.' },
          { label: 'Break-even revenue', value: formatMoney(breakEvenRevenue), tone: 'neutral', help: 'Revenue needed to cover the current cost structure.' },
          { label: 'Target-profit units', value: formatNumber(Math.ceil(targetUnits)), tone: targetProfit > 0 ? 'warning' : 'neutral', help: 'Units required to reach the target operating profit.' },
          { label: 'Margin of safety', value: marginOfSafetyPct == null ? 'Not provided' : formatPercent(marginOfSafetyPct), tone: marginOfSafetyPct != null && marginOfSafetyPct < 10 ? 'critical' : marginOfSafetyPct != null && marginOfSafetyPct < 20 ? 'warning' : 'positive', help: 'Buffer between expected units and break-even volume.' }
        ],
        [
          { title: 'Contribution margin per unit', value: formatMoney(contribution), tone: contribution / price < 0.3 ? 'warning' : 'positive', text: 'Each unit contributes this much toward fixed cost and profit after variable cost.' },
          { title: 'Contribution margin ratio', value: formatPercent(ratio * 100, 1), tone: ratio < 25 ? 'warning' : 'positive', text: 'A thin contribution margin pushes the break-even point up quickly.' },
          { title: 'Expected operating profit', value: expectedProfit == null ? 'Not provided' : formatMoney(expectedProfit), tone: expectedProfit != null && expectedProfit < 0 ? 'critical' : 'positive', text: 'If you supplied expected units, this is the operating result at that volume.' },
          { title: 'Volume headroom', value: marginOfSafetyUnits == null ? 'Not provided' : formatNumber(Math.round(marginOfSafetyUnits)), tone: marginOfSafetyUnits != null && marginOfSafetyUnits < 0 ? 'critical' : 'neutral', text: 'Positive headroom means expected demand clears break-even.' }
        ],
        [
          { title: 'Pricing sensitivity matters', text: 'A small move in price changes both contribution margin and the required break-even volume.' },
          { title: 'Fixed-cost burden is visible now', text: 'If the break-even point feels high, the conversation should move to fixed-cost structure as much as revenue ambition.' },
          { title: 'Target profit changes the plan', text: 'Teams rarely plan to earn zero profit, so target-profit units are often more decision-useful than break-even units alone.' },
          { title: 'Use margin of safety explicitly', text: 'If expected units barely clear break-even, the plan has less resilience than it may appear.' }
        ],
        [
          { label: 'Selling price', value: formatMoney(price) },
          { label: 'Variable cost per unit', value: formatMoney(variableCost) },
          { label: 'Fixed costs', value: formatMoney(fixedCosts) },
          { label: 'Contribution margin per unit', value: formatMoney(contribution) },
          { label: 'Contribution margin ratio', value: formatPercent(ratio * 100, 1) },
          { label: 'Break-even units', value: formatNumber(Math.ceil(breakEvenUnits)) },
          { label: 'Break-even revenue', value: formatMoney(breakEvenRevenue) },
          { label: 'Target-profit units', value: formatNumber(Math.ceil(targetUnits)) }
        ],
        null,
        [
          { metric: 'Break-even units', value: Math.ceil(breakEvenUnits) },
          { metric: 'Break-even revenue', value: breakEvenRevenue },
          { metric: 'Target-profit units', value: Math.ceil(targetUnits) },
          { metric: 'Contribution margin per unit', value: contribution },
          { metric: 'Contribution margin ratio percent', value: ratio * 100 },
          { metric: 'Expected operating profit', value: expectedProfit == null ? '' : expectedProfit },
          { metric: 'Margin of safety percent', value: marginOfSafetyPct == null ? '' : marginOfSafetyPct }
        ],
        'Break-even analysis complete.'
      );
    },
    'gross-margin-analyzer': function (values) {
      const revenue = values.revenue;
      const cogs = values.cogs;
      const priorRevenue = values.priorRevenue || 0;
      const priorCogs = values.priorCogs || 0;
      const targetMarginPct = values.targetMarginPct || 0;
      if (!(revenue > 0) || !(cogs >= 0)) {
        throw new Error('Enter revenue and cost of goods sold to analyze gross margin.');
      }
      const grossProfit = revenue - cogs;
      const grossMargin = grossProfit / revenue;
      const priorMargin = priorRevenue > 0 ? (priorRevenue - priorCogs) / priorRevenue : null;
      const marginDeltaPts = priorMargin == null ? null : (grossMargin - priorMargin) * 100;
      const targetRatio = targetMarginPct > 0 ? targetMarginPct / 100 : null;
      const targetGap = targetRatio == null ? null : targetRatio - grossMargin;
      const targetGapDollars = targetGap != null && targetGap > 0 ? revenue * targetGap : 0;
      const onePointValue = revenue * 0.01;
      return buildResult(
        [
          { label: 'Gross profit', value: formatMoney(grossProfit), tone: grossProfit < 0 ? 'critical' : 'positive', help: 'Revenue less cost of goods sold.' },
          { label: 'Gross margin', value: formatPercent(grossMargin * 100, 1), tone: grossMargin < 30 ? 'warning' : 'positive', help: 'Gross profit divided by revenue.' },
          { label: 'Margin change', value: marginDeltaPts == null ? 'Not provided' : formatPercent(marginDeltaPts, 1), tone: marginDeltaPts != null && marginDeltaPts < 0 ? 'critical' : 'positive', help: 'Point movement versus the prior period.' },
          { label: 'Target gap', value: targetGap == null ? 'Not provided' : (targetGap > 0 ? formatMoney(targetGapDollars) : 'Target met'), tone: targetGap != null && targetGap > 0 ? 'warning' : 'positive', help: 'Dollar improvement required to hit the target margin.' }
        ],
        [
          { title: 'Gross profit per revenue dollar', value: formatPercent(grossMargin * 100, 1), tone: grossMargin < 25 ? 'warning' : 'positive', text: 'This is the amount of each revenue dollar left after direct cost.' },
          { title: 'Value of one margin point', value: formatMoney(onePointValue), tone: 'neutral', text: 'At the current revenue base, every point of gross margin is worth this much.' },
          { title: 'Prior-period comparison', value: priorMargin == null ? 'Not provided' : formatPercent(priorMargin * 100, 1), tone: marginDeltaPts != null && marginDeltaPts < 0 ? 'warning' : 'positive', text: 'Compare current margin against the prior-period baseline if you supplied it.' },
          { title: 'Target-margin implication', value: targetGap == null ? 'Not provided' : targetGap <= 0 ? 'Target reached' : formatPercent(targetGap * 100, 1), tone: targetGap != null && targetGap > 0 ? 'warning' : 'positive', text: 'Shows the remaining gap to the desired target.' }
        ],
        [
          { title: 'Margins should be discussed in both percent and dollars', text: 'A small point shift can still be material when the revenue base is large.' },
          { title: 'Target gaps deserve explicit math', text: 'If the target requires a large improvement, the operating plan likely needs more than minor tweaks.' },
          { title: 'Prior-period movement matters', text: 'Trend direction often changes the urgency more than the current-period margin alone.' },
          { title: 'Use the value of each margin point', text: 'It helps finance teams translate operational improvement ideas into dollar impact quickly.' }
        ],
        [
          { label: 'Revenue', value: formatMoney(revenue) },
          { label: 'COGS', value: formatMoney(cogs) },
          { label: 'Gross profit', value: formatMoney(grossProfit) },
          { label: 'Gross margin', value: formatPercent(grossMargin * 100, 1) },
          { label: 'Prior-period margin', value: priorMargin == null ? 'Not provided' : formatPercent(priorMargin * 100, 1) },
          { label: 'Margin-point change', value: marginDeltaPts == null ? 'Not provided' : formatPercent(marginDeltaPts, 1) },
          { label: 'Value of one margin point', value: formatMoney(onePointValue) },
          { label: 'Target gap dollars', value: targetGap == null ? 'Not provided' : formatMoney(targetGapDollars) }
        ],
        null,
        [
          { metric: 'Gross profit', value: grossProfit },
          { metric: 'Gross margin percent', value: grossMargin * 100 },
          { metric: 'Prior-period gross margin percent', value: priorMargin == null ? '' : priorMargin * 100 },
          { metric: 'Margin-point change', value: marginDeltaPts == null ? '' : marginDeltaPts },
          { metric: 'Target gap dollars', value: targetGap == null ? '' : targetGapDollars }
        ],
        'Gross-margin analysis complete.'
      );
    },
    'ebitda-calculator': function (values) {
      const ebitda = (values.netIncome || 0) + (values.interest || 0) + (values.taxes || 0) + (values.depreciation || 0) + (values.amortization || 0);
      const adjustedEbitda = ebitda + (values.adjustments || 0);
      const margin = values.revenue > 0 ? ebitda / values.revenue : null;
      const adjustedMargin = values.revenue > 0 ? adjustedEbitda / values.revenue : null;
      return buildResult(
        [
          { label: 'EBITDA', value: formatMoney(ebitda), tone: ebitda < 0 ? 'critical' : 'positive', help: 'Net income plus interest, taxes, depreciation, and amortization.' },
          { label: 'Adjusted EBITDA', value: formatMoney(adjustedEbitda), tone: adjustedEbitda < 0 ? 'critical' : 'positive', help: 'EBITDA after the supplied non-recurring adjustments.' },
          { label: 'EBITDA margin', value: margin == null ? 'Not provided' : formatPercent(margin * 100, 1), tone: margin != null && margin < 10 ? 'warning' : 'positive', help: 'EBITDA divided by revenue.' },
          { label: 'Adjusted margin', value: adjustedMargin == null ? 'Not provided' : formatPercent(adjustedMargin * 100, 1), tone: adjustedMargin != null && adjustedMargin < 10 ? 'warning' : 'positive', help: 'Adjusted EBITDA divided by revenue.' }
        ],
        [
          { title: 'Core add-backs', value: formatMoney((values.interest || 0) + (values.taxes || 0) + (values.depreciation || 0) + (values.amortization || 0)), tone: 'neutral', text: 'These convert net income into EBITDA.' },
          { title: 'Non-recurring adjustments', value: formatMoney(values.adjustments || 0), tone: Math.abs(values.adjustments || 0) > Math.abs(ebitda) * 0.25 ? 'warning' : 'neutral', text: 'Large adjustments deserve extra scrutiny because they can change the story materially.' },
          { title: 'Revenue context', value: values.revenue > 0 ? formatMoney(values.revenue) : 'Not provided', tone: 'neutral', text: 'Revenue is optional for the core calculation, but useful for interpreting margin.' },
          { title: 'Net income starting point', value: formatMoney(values.netIncome || 0), tone: (values.netIncome || 0) < 0 ? 'warning' : 'neutral', text: 'The bridge starts at the reported net-income line for the period.' }
        ],
        [
          { title: 'Bridge clarity matters', text: 'Stakeholders often care less about the acronym and more about whether the bridge is transparent and defensible.' },
          { title: 'Adjusted EBITDA should stay separate', text: 'Keeping adjustments distinct from core EBITDA makes review and challenge much easier.' },
          { title: 'Margin adds context', text: 'If revenue is available, margin usually tells a more usable performance story than EBITDA dollars alone.' },
          { title: 'Large adjustments deserve explanation', text: 'If add-backs are meaningful relative to EBITDA, they will likely attract questions in review.' }
        ],
        [
          { label: 'Net income', value: formatMoney(values.netIncome || 0) },
          { label: 'Interest expense', value: formatMoney(values.interest || 0) },
          { label: 'Income taxes', value: formatMoney(values.taxes || 0) },
          { label: 'Depreciation', value: formatMoney(values.depreciation || 0) },
          { label: 'Amortization', value: formatMoney(values.amortization || 0) },
          { label: 'EBITDA', value: formatMoney(ebitda) },
          { label: 'Non-recurring adjustments', value: formatMoney(values.adjustments || 0) },
          { label: 'Adjusted EBITDA', value: formatMoney(adjustedEbitda) }
        ],
        null,
        [
          { metric: 'EBITDA', value: ebitda },
          { metric: 'Adjusted EBITDA', value: adjustedEbitda },
          { metric: 'EBITDA margin percent', value: margin == null ? '' : margin * 100 },
          { metric: 'Adjusted EBITDA margin percent', value: adjustedMargin == null ? '' : adjustedMargin * 100 }
        ],
        'EBITDA calculation complete.'
      );
    },
    'working-capital-ratio-calculator': function (values) {
      const currentAssets = sum([values.cash, values.accountsReceivable, values.inventory, values.otherCurrentAssets]);
      const currentLiabilities = sum([values.accountsPayable, values.accruedLiabilities, values.shortTermDebt, values.otherCurrentLiabilities]);
      if (!(currentLiabilities > 0)) {
        throw new Error('Enter current liabilities to calculate working-capital ratios.');
      }
      const quickAssets = sum([values.cash, values.accountsReceivable, values.otherCurrentAssets]);
      const currentRatio = currentAssets / currentLiabilities;
      const quickRatio = quickAssets / currentLiabilities;
      const netWorkingCapital = currentAssets - currentLiabilities;
      const inventoryMix = currentAssets > 0 ? values.inventory / currentAssets * 100 : 0;
      return buildResult(
        [
          { label: 'Current ratio', value: formatRatio(currentRatio), tone: currentRatio < 1 ? 'critical' : currentRatio < 1.3 ? 'warning' : 'positive', help: 'Current assets divided by current liabilities.' },
          { label: 'Quick ratio', value: formatRatio(quickRatio), tone: quickRatio < 1 ? 'warning' : 'positive', help: 'Current assets excluding inventory divided by current liabilities.' },
          { label: 'Net working capital', value: formatMoney(netWorkingCapital), tone: netWorkingCapital < 0 ? 'critical' : 'positive', help: 'Current assets minus current liabilities.' },
          { label: 'Inventory in current assets', value: formatPercent(inventoryMix, 1), tone: inventoryMix > 35 ? 'warning' : 'neutral', help: 'Share of current assets tied up in inventory.' }
        ],
        [
          { title: 'Current-asset coverage', value: formatRatio(currentRatio), tone: currentRatio < 1 ? 'critical' : 'positive', text: 'A ratio below 1.0 means short-term obligations exceed current assets.' },
          { title: 'Quick-liquidity view', value: formatRatio(quickRatio), tone: quickRatio < 0.8 ? 'warning' : 'positive', text: 'This tighter view strips inventory out of the liquidity picture.' },
          { title: 'Dollar surplus or deficit', value: formatMoney(netWorkingCapital), tone: netWorkingCapital < 0 ? 'critical' : 'neutral', text: 'This grounds the ratio answer in actual dollars.' },
          { title: 'Inventory concentration', value: formatPercent(inventoryMix, 1), tone: inventoryMix > 40 ? 'warning' : 'neutral', text: 'A heavy inventory mix can make the current ratio look stronger than immediate liquidity really is.' }
        ],
        [
          { title: 'Compare current and quick ratios together', text: 'The gap between them reveals how much the liquidity story depends on inventory.' },
          { title: 'Net working capital remains the real dollars view', text: 'Ratios are useful, but the actual surplus or deficit usually drives the operational conversation.' },
          { title: 'Short-term debt can change the picture fast', text: 'Even healthy receivables and cash can be offset by debt due within the period.' },
          { title: 'Trend still matters', text: 'A single balance-sheet date is useful, but recurring monitoring is better if liquidity swings during the year.' }
        ],
        [
          { label: 'Current assets', value: formatMoney(currentAssets) },
          { label: 'Quick assets', value: formatMoney(quickAssets) },
          { label: 'Current liabilities', value: formatMoney(currentLiabilities) },
          { label: 'Current ratio', value: formatRatio(currentRatio) },
          { label: 'Quick ratio', value: formatRatio(quickRatio) },
          { label: 'Net working capital', value: formatMoney(netWorkingCapital) }
        ],
        null,
        [
          { metric: 'Current assets', value: currentAssets },
          { metric: 'Quick assets', value: quickAssets },
          { metric: 'Current liabilities', value: currentLiabilities },
          { metric: 'Current ratio', value: currentRatio },
          { metric: 'Quick ratio', value: quickRatio },
          { metric: 'Net working capital', value: netWorkingCapital }
        ],
        'Working-capital analysis complete.'
      );
    },
    'cash-conversion-cycle-calculator': function (values) {
      const ar = values.accountsReceivable;
      const inventory = values.inventory;
      const ap = values.accountsPayable;
      const revenue = values.annualRevenue;
      const cogs = values.annualCogs;
      if (!(revenue > 0) || !(cogs > 0)) {
        throw new Error('Enter annual revenue and annual COGS to calculate the cash conversion cycle.');
      }
      const dso = ar / revenue * 365;
      const dio = inventory / cogs * 365;
      const dpo = ap / cogs * 365;
      const ccc = dso + dio - dpo;
      const cashTiedUp = ccc * (cogs / 365);
      return buildResult(
        [
          { label: 'Cash conversion cycle', value: formatDays(ccc), tone: ccc > 75 ? 'warning' : ccc < 0 ? 'positive' : 'neutral', help: 'DSO plus DIO minus DPO.' },
          { label: 'DSO', value: formatDays(dso), tone: dso > 60 ? 'warning' : 'neutral', help: 'Days sales outstanding.' },
          { label: 'DIO', value: formatDays(dio), tone: dio > 75 ? 'warning' : 'neutral', help: 'Days inventory outstanding.' },
          { label: 'DPO', value: formatDays(dpo), tone: dpo > 45 ? 'positive' : 'neutral', help: 'Days payable outstanding.' }
        ],
        [
          { title: 'Receivables drag', value: formatDays(dso), tone: dso > 60 ? 'warning' : 'neutral', text: 'High DSO means cash is waiting in receivables longer.' },
          { title: 'Inventory drag', value: formatDays(dio), tone: dio > 75 ? 'warning' : 'neutral', text: 'High DIO means inventory is sitting before converting into cost of sales.' },
          { title: 'Payables offset', value: formatDays(dpo), tone: dpo > 45 ? 'positive' : 'neutral', text: 'Higher DPO offsets some working-capital pressure by delaying cash outflow.' },
          { title: 'Estimated cash tied up', value: formatMoney(cashTiedUp), tone: cashTiedUp > revenue * 0.1 ? 'warning' : 'neutral', text: 'Approximate cash burden implied by the current cycle.' }
        ],
        [
          { title: 'Fix the biggest component first', text: 'The cycle is most useful when it directs attention to the operating area creating the most drag.' },
          { title: 'Negative CCC can be a strength', text: 'A low or negative cycle means the business is collecting cash before it needs to fund the full operating loop.' },
          { title: 'Translate days into dollars', text: 'Cycle days matter more when linked to how much cash is actually tied up.' },
          { title: 'Use the cycle as a baseline', text: 'Collections, inventory, and vendor-term initiatives are easier to prioritize once the current CCC is visible.' }
        ],
        [
          { label: 'DSO', value: formatDays(dso) },
          { label: 'DIO', value: formatDays(dio) },
          { label: 'DPO', value: formatDays(dpo) },
          { label: 'Cash conversion cycle', value: formatDays(ccc) },
          { label: 'Estimated cash tied up', value: formatMoney(cashTiedUp) }
        ],
        null,
        [
          { metric: 'DSO days', value: dso },
          { metric: 'DIO days', value: dio },
          { metric: 'DPO days', value: dpo },
          { metric: 'Cash conversion cycle days', value: ccc },
          { metric: 'Estimated cash tied up', value: cashTiedUp }
        ],
        'Cash-conversion-cycle analysis complete.'
      );
    },
    'revenue-run-rate-calculator': function (values, rows) {
      const filtered = rows.filter(function (row) { return row.period && Number.isFinite(row.revenue); });
      if (filtered.length < 2) {
        throw new Error('Add at least two monthly revenue rows to calculate a run rate.');
      }
      const periods = filtered.map(function (row) { return { label: String(row.period), revenue: row.revenue }; });
      const windowSize = Math.max(1, Math.min(filtered.length, Math.round(values.monthsToAverage || 3)));
      const latest = periods[periods.length - 1];
      const previous = periods.length > 1 ? periods[periods.length - 2] : null;
      const recentWindow = periods.slice(-windowSize);
      const recentAverage = average(recentWindow.map(function (row) { return row.revenue; }));
      const recentVolatility = recentAverage ? stdev(recentWindow.map(function (row) { return row.revenue; })) / recentAverage * 100 : 0;
      const latestRunRate = latest.revenue * 12;
      const trailingRunRate = recentAverage * 12;
      const monthOverMonth = previous && previous.revenue ? (latest.revenue / previous.revenue - 1) * 100 : null;
      const priorWindow = periods.length >= windowSize * 2 ? periods.slice(-(windowSize * 2), -windowSize) : null;
      const priorAverage = priorWindow ? average(priorWindow.map(function (row) { return row.revenue; })) : null;
      const momentum = priorAverage ? (recentAverage / priorAverage - 1) * 100 : null;
      const tableRows = periods.map(function (row) {
        return {
          period: row.label,
          revenue: row.revenue,
          runRate: row.revenue * 12,
          shareOfRecentAverage: recentAverage ? row.revenue / recentAverage * 100 : 0
        };
      });
      return buildResult(
        [
          { label: 'Latest-month run rate', value: formatMoney(latestRunRate), tone: 'neutral', help: 'Latest month multiplied by twelve.' },
          { label: 'Trailing run rate', value: formatMoney(trailingRunRate), tone: 'positive', help: 'Trailing-average monthly revenue multiplied by twelve.' },
          { label: 'Recent monthly average', value: formatMoney(recentAverage), tone: 'neutral', help: 'Average of the selected recent months.' },
          { label: 'Recent volatility', value: formatPercent(recentVolatility, 1), tone: recentVolatility > 15 ? 'warning' : 'positive', help: 'Standard-deviation-based view of recent monthly volatility.' }
        ],
        [
          { title: 'Latest-month annualization', value: formatMoney(latestRunRate), tone: 'neutral', text: 'Useful for a quick headline, but easy to overstate if the month is not representative.' },
          { title: 'Smoothed annualization', value: formatMoney(trailingRunRate), tone: 'positive', text: 'A trailing average often produces a more stable benchmark than the latest month alone.' },
          { title: 'Month-over-month movement', value: monthOverMonth == null ? 'Not enough data' : formatPercent(monthOverMonth, 1), tone: monthOverMonth != null && monthOverMonth < 0 ? 'warning' : 'positive', text: 'Recent movement helps explain whether the latest month is accelerating or softening.' },
          { title: 'Window momentum', value: momentum == null ? 'Not enough data' : formatPercent(momentum, 1), tone: momentum != null && momentum < 0 ? 'warning' : 'positive', text: 'Compares the recent averaging window with the prior window if enough months are available.' }
        ],
        [
          { title: 'Use more than the latest month', text: 'A strong or weak single month can distort the headline if it is annualized without context.' },
          { title: 'Volatility changes the confidence level', text: 'Higher recent volatility means the run rate should be communicated with more caution.' },
          { title: 'Momentum matters', text: 'If the business is accelerating or decelerating, the trailing average and latest month may tell different but useful stories.' },
          { title: 'Run rate is still not a forecast', text: 'A true forecast should still reflect pipeline, churn, seasonality, and execution risk.' }
        ],
        [
          { label: 'Latest month', value: latest.label },
          { label: 'Latest month revenue', value: formatMoney(latest.revenue) },
          { label: 'Trailing window', value: formatNumber(windowSize) + ' months' },
          { label: 'Trailing average monthly revenue', value: formatMoney(recentAverage) },
          { label: 'Latest-month run rate', value: formatMoney(latestRunRate) },
          { label: 'Trailing-average run rate', value: formatMoney(trailingRunRate) }
        ],
        {
          columns: [
            { key: 'period', label: 'Month', type: 'text' },
            { key: 'revenue', label: 'Revenue', type: 'money', align: 'right' },
            { key: 'runRate', label: 'Annualized run rate', type: 'money', align: 'right' },
            { key: 'shareOfRecentAverage', label: 'Percent of recent average', type: 'percent', align: 'right' }
          ],
          rows: tableRows
        },
        tableRows,
        'Revenue run-rate analysis complete.'
      );
    },
    'burn-rate-runway-calculator': function (values) {
      const cashBalance = values.cashBalance;
      const monthlyInflows = values.monthlyInflows || 0;
      const monthlyOutflows = values.monthlyOutflows || 0;
      const oneTimeOutflows = values.oneTimeOutflows || 0;
      const bufferMonths = values.bufferMonths || 0;
      if (!(cashBalance > 0) || !(monthlyOutflows >= 0)) {
        throw new Error('Enter current cash and monthly cash outflows to calculate runway.');
      }
      const grossBurn = monthlyOutflows;
      const netBurn = monthlyOutflows - monthlyInflows;
      const availableCash = cashBalance - oneTimeOutflows;
      const runwayMonths = netBurn > 0 ? availableCash / netBurn : Number.POSITIVE_INFINITY;
      const bufferCashTarget = netBurn > 0 ? netBurn * bufferMonths : 0;
      const bufferGap = netBurn > 0 ? Math.max(bufferCashTarget - availableCash, 0) : 0;
      const breakEvenGap = Math.max(monthlyOutflows - monthlyInflows, 0);
      return buildResult(
        [
          { label: 'Gross burn', value: formatMoney(grossBurn), tone: 'neutral', help: 'Recurring monthly cash outflows before inflows.' },
          { label: 'Net burn', value: netBurn <= 0 ? 'Break-even or better' : formatMoney(netBurn), tone: netBurn > 0 ? 'warning' : 'positive', help: 'Recurring monthly cash outflows net of recurring inflows.' },
          { label: 'Runway', value: formatMonths(runwayMonths), tone: runwayMonths < 6 ? 'critical' : runwayMonths < 12 ? 'warning' : 'positive', help: 'Available cash divided by net burn after one-time cash uses.' },
          { label: 'Buffer cash gap', value: bufferGap > 0 ? formatMoney(bufferGap) : 'Covered', tone: bufferGap > 0 ? 'warning' : 'positive', help: 'Additional cash required to maintain the chosen safety buffer.' }
        ],
        [
          { title: 'Available cash after one-time uses', value: formatMoney(availableCash), tone: availableCash < cashBalance ? 'warning' : 'neutral', text: 'One-time cash demands reduce the runway immediately.' },
          { title: 'Break-even gap', value: breakEvenGap > 0 ? formatMoney(breakEvenGap) : 'At break-even', tone: breakEvenGap > 0 ? 'warning' : 'positive', text: 'Monthly improvement needed to reach cash break-even.' },
          { title: 'Runway quality', value: formatMonths(runwayMonths), tone: runwayMonths < 6 ? 'critical' : runwayMonths < 12 ? 'warning' : 'positive', text: 'Short runway usually compresses strategic options and fundraising flexibility.' },
          { title: 'Safety buffer target', value: bufferMonths > 0 ? formatNumber(bufferMonths) + ' months' : 'Not provided', tone: 'neutral', text: 'This is the runway cushion the calculator is testing against.' }
        ],
        [
          { title: 'Separate gross and net burn', text: 'Gross burn explains the operating cost base, while net burn explains how quickly cash is actually disappearing.' },
          { title: 'Subtract one-time cash uses early', text: 'Runway is overstated if known near-term cash demands are ignored.' },
          { title: 'Use a buffer, not just a zero line', text: 'A runway answer is more practical when paired with a minimum safety threshold.' },
          { title: 'Break-even is a monthly gap question', text: 'The break-even gap shows how much recurring improvement is needed to stop burning cash.' }
        ],
        [
          { label: 'Current cash balance', value: formatMoney(cashBalance) },
          { label: 'Available cash after one-time uses', value: formatMoney(availableCash) },
          { label: 'Gross burn', value: formatMoney(grossBurn) },
          { label: 'Net burn', value: netBurn <= 0 ? 'Break-even or better' : formatMoney(netBurn) },
          { label: 'Runway', value: formatMonths(runwayMonths) },
          { label: 'Buffer cash gap', value: bufferGap > 0 ? formatMoney(bufferGap) : 'Covered' }
        ],
        null,
        [
          { metric: 'Gross burn', value: grossBurn },
          { metric: 'Net burn', value: netBurn },
          { metric: 'Runway months', value: Number.isFinite(runwayMonths) ? runwayMonths : '' },
          { metric: 'Buffer cash gap', value: bufferGap },
          { metric: 'Break-even monthly improvement needed', value: breakEvenGap }
        ],
        'Burn-rate and runway analysis complete.'
      );
    },
    'budget-vs-actual-variance-analyzer': function (values, rows) {
      const materialityThreshold = values.materialityThresholdPct || 0;
      const analyzed = rows.filter(function (row) {
        return row.lineItem && Number.isFinite(row.budget) && Number.isFinite(row.actual);
      }).map(function (row) {
        const lineType = inferVarianceType(row.lineItem);
        const variance = row.actual - row.budget;
        const variancePct = row.budget ? variance / Math.abs(row.budget) * 100 : null;
        const adverseVariance = lineType === 'revenue' ? row.budget - row.actual : row.actual - row.budget;
        return {
          lineItem: row.lineItem,
          lineType: lineType,
          budget: row.budget,
          actual: row.actual,
          variance: variance,
          variancePct: variancePct,
          adverseVariance: adverseVariance,
          status: adverseVariance > 0 ? 'Adverse' : 'Favorable or on plan'
        };
      }).sort(function (left, right) {
        return Math.abs(right.adverseVariance) - Math.abs(left.adverseVariance);
      });
      if (!analyzed.length) {
        throw new Error('Add at least one budget and actual row to analyze variance.');
      }
      const totalBudget = sum(analyzed.map(function (row) { return row.budget; }));
      const totalActual = sum(analyzed.map(function (row) { return row.actual; }));
      const totalVariance = totalActual - totalBudget;
      const adverseLines = analyzed.filter(function (row) {
        return row.adverseVariance > 0 && (row.variancePct == null || Math.abs(row.variancePct) >= materialityThreshold);
      });
      const topThreeShare = adverseLines.length ? sum(adverseLines.slice(0, 3).map(function (row) { return row.adverseVariance; })) / Math.max(sum(adverseLines.map(function (row) { return row.adverseVariance; })), 1) * 100 : 0;
      return buildResult(
        [
          { label: 'Total budget', value: formatMoney(totalBudget), tone: 'neutral', help: 'Budget total across all rows.' },
          { label: 'Total actual', value: formatMoney(totalActual), tone: 'neutral', help: 'Actual total across all rows.' },
          { label: 'Net variance', value: formatMoney(totalVariance), tone: totalVariance > 0 ? 'warning' : 'positive', help: 'Actual minus budget at the total level.' },
          { label: 'Material adverse lines', value: formatNumber(adverseLines.length), tone: adverseLines.length > 0 ? 'warning' : 'positive', help: 'Adverse lines at or above the materiality threshold.' }
        ],
        [
          { title: 'Most adverse line', value: analyzed[0].lineItem, tone: analyzed[0].adverseVariance > 0 ? 'critical' : 'positive', text: analyzed[0].status + ' variance: ' + formatMoney(analyzed[0].adverseVariance) },
          { title: 'Adverse concentration', value: formatPercent(topThreeShare, 1), tone: topThreeShare > 60 ? 'warning' : 'neutral', text: 'Share of total adverse variance explained by the top three adverse lines.' },
          { title: 'Materiality threshold', value: formatPercent(materialityThreshold, 0), tone: 'neutral', text: 'Used to filter which lines are highlighted as material.' },
          { title: 'Lines requiring commentary', value: formatNumber(adverseLines.length), tone: adverseLines.length > 0 ? 'warning' : 'positive', text: 'Use this as a first-pass count of lines likely needing explanation.' }
        ],
        [
          { title: 'Start with the adverse ranking', text: 'A management review usually moves faster when the largest misses are already isolated.' },
          { title: 'Direction differs by line type', text: 'Revenue and expense lines do not behave the same way, so the analyzer uses simple heuristics to interpret them.' },
          { title: 'Use dollars and percentages together', text: 'Percentage swings can look dramatic on small lines, so the total-dollar view still matters.' },
          { title: 'Concentration changes the follow-up path', text: 'If a few lines explain most of the miss, the next review conversation is usually easier to structure.' }
        ],
        [
          { label: 'Materiality threshold', value: formatPercent(materialityThreshold, 0) },
          { label: 'Total budget', value: formatMoney(totalBudget) },
          { label: 'Total actual', value: formatMoney(totalActual) },
          { label: 'Net variance', value: formatMoney(totalVariance) },
          { label: 'Material adverse lines', value: formatNumber(adverseLines.length) }
        ],
        {
          columns: [
            { key: 'lineItem', label: 'Line item', type: 'text' },
            { key: 'lineType', label: 'Type', type: 'text' },
            { key: 'budget', label: 'Budget', type: 'money', align: 'right' },
            { key: 'actual', label: 'Actual', type: 'money', align: 'right' },
            { key: 'variance', label: 'Variance', type: 'money', align: 'right' },
            { key: 'variancePct', label: 'Variance %', type: 'percent', align: 'right' },
            { key: 'status', label: 'Priority', type: 'text' }
          ],
          rows: analyzed
        },
        analyzed,
        'Budget-versus-actual variance analysis complete.'
      );
    },
    'saas-metrics-calculator': function (values) {
      const beginningMrr = values.beginningMrr || 0;
      const newMrr = values.newMrr || 0;
      const expansionMrr = values.expansionMrr || 0;
      const contractionMrr = values.contractionMrr || 0;
      const churnedMrr = values.churnedMrr || 0;
      const endingMrr = beginningMrr + newMrr + expansionMrr - contractionMrr - churnedMrr;
      const arr = endingMrr * 12;
      const nrr = beginningMrr > 0 ? (beginningMrr + expansionMrr - contractionMrr - churnedMrr) / beginningMrr : null;
      const grr = beginningMrr > 0 ? (beginningMrr - contractionMrr - churnedMrr) / beginningMrr : null;
      const arpa = values.endingCustomers > 0 ? endingMrr / values.endingCustomers : null;
      const cac = values.newCustomers > 0 ? values.salesMarketingSpend / values.newCustomers : null;
      const logoChurn = values.beginningCustomers > 0 ? values.churnedCustomers / values.beginningCustomers : null;
      const ltv = arpa != null && logoChurn && logoChurn > 0 ? arpa * toRatio(values.grossMarginPct || 0) / logoChurn : null;
      const ltvToCac = ltv != null && cac ? ltv / cac : null;
      return buildResult(
        [
          { label: 'Ending ARR', value: formatMoney(arr), tone: endingMrr > beginningMrr ? 'positive' : 'warning', help: 'Ending MRR multiplied by twelve.' },
          { label: 'NRR', value: nrr == null ? 'Not provided' : formatPercent(nrr * 100, 1), tone: nrr != null && nrr < 1 ? 'warning' : 'positive', help: 'Net revenue retention.' },
          { label: 'GRR', value: grr == null ? 'Not provided' : formatPercent(grr * 100, 1), tone: grr != null && grr < 0.9 ? 'warning' : 'positive', help: 'Gross revenue retention.' },
          { label: 'CAC', value: cac == null ? 'Not provided' : formatMoney(cac), tone: cac != null && ltvToCac != null && ltvToCac < 3 ? 'warning' : 'neutral', help: 'Sales and marketing spend divided by new customers.' }
        ],
        [
          { title: 'Ending MRR', value: formatMoney(endingMrr), tone: endingMrr >= beginningMrr ? 'positive' : 'warning', text: 'Recurring revenue after movement during the period.' },
          { title: 'ARPA', value: arpa == null ? 'Not provided' : formatMoney(arpa), tone: 'neutral', text: 'Average recurring revenue per account using ending customers.' },
          { title: 'Logo churn', value: logoChurn == null ? 'Not provided' : formatPercent(logoChurn * 100, 1), tone: logoChurn != null && logoChurn > 0.03 ? 'warning' : 'positive', text: 'Customer-count churn for the period.' },
          { title: 'LTV to CAC', value: ltvToCac == null ? 'Not provided' : formatRatio(ltvToCac), tone: ltvToCac != null && ltvToCac < 3 ? 'warning' : 'positive', text: 'Estimated lifetime value divided by customer acquisition cost.' }
        ],
        [
          { title: 'Retention and growth should be read together', text: 'A strong ARR story is more durable when NRR and GRR are healthy, not just new-logo growth.' },
          { title: 'CAC without retention is incomplete', text: 'Efficiency looks different when churn is high or expansion is weak.' },
          { title: 'ARPA adds customer context', text: 'Recurring revenue movement is easier to interpret when paired with customer count and ARPA.' },
          { title: 'Use KPI consistency as a check', text: 'If the metrics tell conflicting stories, the underlying assumptions or period definitions may need review.' }
        ],
        [
          { label: 'Beginning MRR', value: formatMoney(beginningMrr) },
          { label: 'Ending MRR', value: formatMoney(endingMrr) },
          { label: 'Ending ARR', value: formatMoney(arr) },
          { label: 'NRR', value: nrr == null ? 'Not provided' : formatPercent(nrr * 100, 1) },
          { label: 'GRR', value: grr == null ? 'Not provided' : formatPercent(grr * 100, 1) },
          { label: 'ARPA', value: arpa == null ? 'Not provided' : formatMoney(arpa) },
          { label: 'CAC', value: cac == null ? 'Not provided' : formatMoney(cac) },
          { label: 'LTV to CAC', value: ltvToCac == null ? 'Not provided' : formatRatio(ltvToCac) }
        ],
        null,
        [
          { metric: 'Ending MRR', value: endingMrr },
          { metric: 'Ending ARR', value: arr },
          { metric: 'NRR percent', value: nrr == null ? '' : nrr * 100 },
          { metric: 'GRR percent', value: grr == null ? '' : grr * 100 },
          { metric: 'ARPA', value: arpa == null ? '' : arpa },
          { metric: 'CAC', value: cac == null ? '' : cac },
          { metric: 'Logo churn percent', value: logoChurn == null ? '' : logoChurn * 100 },
          { metric: 'LTV to CAC', value: ltvToCac == null ? '' : ltvToCac }
        ],
        'SaaS metrics calculation complete.'
      );
    },
    'unit-economics-calculator': function (values) {
      const arpa = values.arpaMonthly;
      const grossMargin = toRatio(values.grossMarginPct || 0);
      const supportCost = values.monthlySupportCost || 0;
      const acquisitionCost = (values.cac || 0) + (values.onboardingCost || 0);
      const churn = toRatio(values.monthlyChurnPct || 0);
      if (!(arpa > 0) || !(grossMargin > 0)) {
        throw new Error('Enter average monthly revenue and gross margin to calculate unit economics.');
      }
      const grossProfitPerCustomer = arpa * grossMargin;
      const contribution = grossProfitPerCustomer - supportCost;
      const paybackMonths = contribution > 0 ? acquisitionCost / contribution : null;
      const ltv = churn > 0 && contribution > 0 ? contribution / churn : null;
      const ltvToCac = ltv != null && acquisitionCost > 0 ? ltv / acquisitionCost : null;
      const firstYearContribution = contribution * 12 - acquisitionCost;
      return buildResult(
        [
          { label: 'Monthly contribution', value: formatMoney(contribution), tone: contribution > 0 ? 'positive' : 'critical', help: 'Gross profit per customer less monthly support cost.' },
          { label: 'Payback period', value: paybackMonths == null ? 'Not achievable' : formatMonths(paybackMonths), tone: paybackMonths != null && paybackMonths > 12 ? 'warning' : 'positive', help: 'Months needed to recover acquisition and onboarding cost.' },
          { label: 'LTV', value: ltv == null ? 'Not provided' : formatMoney(ltv), tone: ltv != null && ltv > acquisitionCost ? 'positive' : 'warning', help: 'Estimated lifetime value from monthly contribution and churn.' },
          { label: 'LTV to CAC', value: ltvToCac == null ? 'Not provided' : formatRatio(ltvToCac), tone: ltvToCac != null && ltvToCac < 3 ? 'warning' : 'positive', help: 'Estimated lifetime value divided by acquisition plus onboarding cost.' }
        ],
        [
          { title: 'Gross profit per customer', value: formatMoney(grossProfitPerCustomer), tone: 'neutral', text: 'Monthly revenue times gross margin before support cost.' },
          { title: 'Customer acquisition cost stack', value: formatMoney(acquisitionCost), tone: 'neutral', text: 'CAC plus onboarding cost is the full investment to recover.' },
          { title: 'First-year contribution', value: formatMoney(firstYearContribution), tone: firstYearContribution < 0 ? 'warning' : 'positive', text: 'Contribution generated in the first year after acquisition cost.' },
          { title: 'Monthly churn', value: formatPercent(churn * 100, 1), tone: churn > 0.03 ? 'warning' : 'positive', text: 'Churn shortens the value life of each customer and pulls down LTV.' }
        ],
        [
          { title: 'Contribution comes before payback', text: 'If monthly contribution is weak or negative, CAC recovery becomes unrealistic very quickly.' },
          { title: 'Churn quietly changes LTV', text: 'Small changes in churn can materially change lifetime value and LTV to CAC.' },
          { title: 'Payback is often the gating metric', text: 'Even strong LTV can be hard to finance if payback is too slow.' },
          { title: 'Use support cost honestly', text: 'Ignoring direct support cost can make unit economics look better than they really are.' }
        ],
        [
          { label: 'Average monthly revenue per customer', value: formatMoney(arpa) },
          { label: 'Gross profit per customer', value: formatMoney(grossProfitPerCustomer) },
          { label: 'Monthly contribution', value: formatMoney(contribution) },
          { label: 'Acquisition plus onboarding cost', value: formatMoney(acquisitionCost) },
          { label: 'Payback period', value: paybackMonths == null ? 'Not achievable' : formatMonths(paybackMonths) },
          { label: 'LTV', value: ltv == null ? 'Not provided' : formatMoney(ltv) },
          { label: 'LTV to CAC', value: ltvToCac == null ? 'Not provided' : formatRatio(ltvToCac) },
          { label: 'First-year contribution', value: formatMoney(firstYearContribution) }
        ],
        null,
        [
          { metric: 'Monthly contribution', value: contribution },
          { metric: 'Payback months', value: paybackMonths == null ? '' : paybackMonths },
          { metric: 'Estimated LTV', value: ltv == null ? '' : ltv },
          { metric: 'LTV to CAC', value: ltvToCac == null ? '' : ltvToCac },
          { metric: 'First-year contribution', value: firstYearContribution }
        ],
        'Unit-economics calculation complete.'
      );
    },
    'operating-leverage-calculator': function (values) {
      const priorRevenue = values.priorRevenue;
      const currentRevenue = values.currentRevenue;
      const priorOperatingIncome = values.priorOperatingIncome;
      const currentOperatingIncome = values.currentOperatingIncome;
      if (!(priorRevenue > 0) || !(currentRevenue > 0)) {
        throw new Error('Enter comparable prior and current revenue to calculate operating leverage.');
      }
      const revenueChange = (currentRevenue - priorRevenue) / priorRevenue;
      if (Math.abs(revenueChange) < 0.00001) {
        throw new Error('Revenue must change between the two periods to calculate operating leverage.');
      }
      const operatingIncomeChange = priorOperatingIncome !== 0 ? (currentOperatingIncome - priorOperatingIncome) / Math.abs(priorOperatingIncome) : null;
      const degreeOfOperatingLeverage = operatingIncomeChange == null ? null : operatingIncomeChange / revenueChange;
      const deltaRevenue = currentRevenue - priorRevenue;
      const deltaOperatingIncome = currentOperatingIncome - priorOperatingIncome;
      const incrementalMargin = deltaRevenue !== 0 ? deltaOperatingIncome / deltaRevenue : null;
      const fivePercentScenario = degreeOfOperatingLeverage != null ? currentOperatingIncome * degreeOfOperatingLeverage * 0.05 : null;
      return buildResult(
        [
          { label: 'Revenue change', value: formatPercent(revenueChange * 100, 1), tone: revenueChange >= 0 ? 'positive' : 'warning', help: 'Percentage change in revenue between the two periods.' },
          { label: 'Operating-income change', value: operatingIncomeChange == null ? 'Not stable' : formatPercent(operatingIncomeChange * 100, 1), tone: operatingIncomeChange != null && operatingIncomeChange < 0 ? 'warning' : 'positive', help: 'Percentage change in operating income between the two periods.' },
          { label: 'Degree of operating leverage', value: degreeOfOperatingLeverage == null ? 'Unstable' : formatRatio(degreeOfOperatingLeverage), tone: degreeOfOperatingLeverage != null && degreeOfOperatingLeverage > 3 ? 'warning' : 'positive', help: 'Operating-income change divided by revenue change.' },
          { label: 'Incremental margin', value: incrementalMargin == null ? 'Not provided' : formatPercent(incrementalMargin * 100, 1), tone: incrementalMargin != null && incrementalMargin < 0 ? 'critical' : 'positive', help: 'Operating income captured on the change in revenue.' }
        ],
        [
          { title: 'Profit sensitivity', value: degreeOfOperatingLeverage == null ? 'Unstable' : formatRatio(degreeOfOperatingLeverage), tone: degreeOfOperatingLeverage != null && degreeOfOperatingLeverage > 3 ? 'warning' : 'positive', text: 'Higher operating leverage means profit moves more sharply than revenue.' },
          { title: 'Incremental operating income', value: formatMoney(deltaOperatingIncome), tone: deltaOperatingIncome < 0 ? 'warning' : 'positive', text: 'Absolute change in operating income between the two periods.' },
          { title: 'Incremental margin', value: incrementalMargin == null ? 'Not provided' : formatPercent(incrementalMargin * 100, 1), tone: incrementalMargin != null && incrementalMargin < 0 ? 'critical' : 'positive', text: 'Shows how much of the revenue change converted into operating income.' },
          { title: '5% revenue sensitivity', value: fivePercentScenario == null ? 'Unstable' : formatMoney(fivePercentScenario), tone: 'neutral', text: 'Approximate operating-income effect of a 5% revenue move using the current DOL.' }
        ],
        [
          { title: 'DOL is a signal, not a promise', text: 'Historical operating leverage helps frame sensitivity but does not guarantee future behavior.' },
          { title: 'Near-zero prior profit creates noise', text: 'If prior operating income is very small or negative, the DOL result becomes unstable and should be treated carefully.' },
          { title: 'Incremental margin often clarifies the story', text: 'It shows how much profit the business actually captured from the revenue move.' },
          { title: 'Use comparable periods', text: 'The output becomes less useful if the periods are distorted by one-time events or structural changes.' }
        ],
        [
          { label: 'Prior revenue', value: formatMoney(priorRevenue) },
          { label: 'Current revenue', value: formatMoney(currentRevenue) },
          { label: 'Prior operating income', value: formatMoney(priorOperatingIncome) },
          { label: 'Current operating income', value: formatMoney(currentOperatingIncome) },
          { label: 'Revenue change', value: formatPercent(revenueChange * 100, 1) },
          { label: 'Operating-income change', value: operatingIncomeChange == null ? 'Unstable' : formatPercent(operatingIncomeChange * 100, 1) },
          { label: 'Degree of operating leverage', value: degreeOfOperatingLeverage == null ? 'Unstable' : formatRatio(degreeOfOperatingLeverage) },
          { label: 'Incremental margin', value: incrementalMargin == null ? 'Not provided' : formatPercent(incrementalMargin * 100, 1) }
        ],
        null,
        [
          { metric: 'Revenue change percent', value: revenueChange * 100 },
          { metric: 'Operating-income change percent', value: operatingIncomeChange == null ? '' : operatingIncomeChange * 100 },
          { metric: 'Degree of operating leverage', value: degreeOfOperatingLeverage == null ? '' : degreeOfOperatingLeverage },
          { metric: 'Incremental margin percent', value: incrementalMargin == null ? '' : incrementalMargin * 100 },
          { metric: '5 percent revenue sensitivity impact', value: fivePercentScenario == null ? '' : fivePercentScenario }
        ],
        'Operating-leverage analysis complete.'
      );
    },
    'overhead-allocation-calculator': function (values, rows) {
      const totalOverhead = values.totalOverhead;
      const basisName = values.basisName || 'Allocation basis';
      const allocations = rows.filter(function (row) {
        return row.costCenter && Number.isFinite(row.basisUnits);
      });
      if (!(totalOverhead > 0) || !allocations.length) {
        throw new Error('Enter total overhead and at least one cost center with basis units.');
      }
      const totalUnits = sum(allocations.map(function (row) { return row.basisUnits; }));
      if (!(totalUnits > 0)) {
        throw new Error('Basis units must total more than zero to allocate overhead.');
      }
      const ratePerUnit = totalOverhead / totalUnits;
      const rowsOut = allocations.map(function (row) {
        return {
          costCenter: row.costCenter,
          basisUnits: row.basisUnits,
          sharePct: row.basisUnits / totalUnits * 100,
          allocatedOverhead: row.basisUnits * ratePerUnit
        };
      }).sort(function (left, right) {
        return right.allocatedOverhead - left.allocatedOverhead;
      });
      const topShare = rowsOut.length ? rowsOut[0].sharePct : 0;
      return buildResult(
        [
          { label: 'Total overhead', value: formatMoney(totalOverhead), tone: 'neutral', help: 'Shared cost pool being allocated.' },
          { label: 'Total basis units', value: formatNumber(totalUnits), tone: 'neutral', help: 'Sum of the allocation driver units across all rows.' },
          { label: 'Rate per unit', value: formatMoney(ratePerUnit), tone: 'positive', help: 'Overhead allocated per unit of the chosen driver.' },
          { label: 'Largest allocation share', value: formatPercent(topShare, 1), tone: topShare > 50 ? 'warning' : 'neutral', help: 'Share of the driver base held by the largest row.' }
        ],
        [
          { title: 'Allocation basis', value: basisName, tone: 'neutral', text: 'The selected driver label used to explain the spread of overhead.' },
          { title: 'Rate per unit', value: formatMoney(ratePerUnit), tone: 'positive', text: 'Multiply each unit of the driver by this rate to reach the allocated overhead.' },
          { title: 'Largest allocated row', value: rowsOut[0].costCenter, tone: rowsOut[0].sharePct > 50 ? 'warning' : 'neutral', text: formatMoney(rowsOut[0].allocatedOverhead) + ' allocated.' },
          { title: 'Concentration', value: formatPercent(topShare, 1), tone: topShare > 50 ? 'warning' : 'neutral', text: 'If one row absorbs most of the pool, reviewers may challenge the basis choice.' }
        ],
        [
          { title: 'The driver choice matters as much as the math', text: 'A precise allocation is still unhelpful if the chosen basis does not reflect cost consumption.' },
          { title: 'Rate per unit should be explainable', text: 'Reviewers usually want to know the implied cost per headcount, hour, or square foot.' },
          { title: 'Concentration changes the conversation', text: 'If most of the allocation lands in one area, the basis and the pool both deserve a second look.' },
          { title: 'This is a first-pass allocation layer', text: 'Use the browser tool for quick shared-cost spreads before deciding whether the process needs deeper automation.' }
        ],
        [
          { label: 'Allocation basis', value: basisName },
          { label: 'Total overhead', value: formatMoney(totalOverhead) },
          { label: 'Total basis units', value: formatNumber(totalUnits) },
          { label: 'Rate per unit', value: formatMoney(ratePerUnit) },
          { label: 'Largest allocation share', value: formatPercent(topShare, 1) }
        ],
        {
          columns: [
            { key: 'costCenter', label: 'Cost center', type: 'text' },
            { key: 'basisUnits', label: basisName + ' units', type: 'number', align: 'right' },
            { key: 'sharePct', label: 'Share of units', type: 'percent', align: 'right' },
            { key: 'allocatedOverhead', label: 'Allocated overhead', type: 'money', align: 'right' }
          ],
          rows: rowsOut
        },
        rowsOut,
        'Overhead allocation complete.'
      );
    },
    'wacc-calculator': function (values) {
      var equityPct = values.equityWeightPct;
      var debtPct = values.debtWeightPct;
      var riskFreeRate = toRatio(values.riskFreeRatePct || 0);
      var beta = values.beta || 1;
      var marketPremium = toRatio(values.marketPremiumPct || 0);
      var costOfDebt = toRatio(values.costOfDebtPct || 0);
      var taxRate = toRatio(values.taxRatePct || 0);
      if (!(equityPct >= 0) || !(debtPct >= 0) || (equityPct + debtPct) <= 0) {
        throw new Error('Enter equity and debt weights that sum to a positive number.');
      }
      var totalWeight = equityPct + debtPct;
      var eWeight = equityPct / totalWeight;
      var dWeight = debtPct / totalWeight;
      var costOfEquity = riskFreeRate + beta * marketPremium;
      var afterTaxDebt = costOfDebt * (1 - taxRate);
      var wacc = eWeight * costOfEquity + dWeight * afterTaxDebt;
      var taxShield = dWeight * costOfDebt * taxRate;
      var unleveredCost = eWeight * costOfEquity + dWeight * costOfDebt;
      return buildResult(
        [
          { label: 'WACC', value: formatPercent(wacc * 100, 2), tone: 'positive', help: 'Weighted average cost of capital.' },
          { label: 'Cost of equity', value: formatPercent(costOfEquity * 100, 2), tone: 'neutral', help: 'CAPM: risk-free rate plus beta times equity risk premium.' },
          { label: 'After-tax cost of debt', value: formatPercent(afterTaxDebt * 100, 2), tone: 'neutral', help: 'Pre-tax cost of debt reduced by the tax shield.' },
          { label: 'Tax shield benefit', value: formatPercent(taxShield * 100, 2), tone: taxShield > 0 ? 'positive' : 'neutral', help: 'WACC reduction from the interest tax deduction.' }
        ],
        [
          { title: 'Equity weight', value: formatPercent(eWeight * 100, 1), tone: 'neutral', text: 'Share of total capital from equity financing.' },
          { title: 'Debt weight', value: formatPercent(dWeight * 100, 1), tone: dWeight > 0.6 ? 'warning' : 'neutral', text: 'Share of total capital from debt financing.' },
          { title: 'Unlevered cost of capital', value: formatPercent(unleveredCost * 100, 2), tone: 'neutral', text: 'What the cost would be without the debt tax shield.' },
          { title: 'Beta sensitivity', value: formatRatio(beta), tone: beta > 1.5 ? 'warning' : 'neutral', text: 'Higher beta increases cost of equity and therefore WACC.' }
        ],
        [
          { title: 'WACC drives valuation denominators', text: 'A small WACC change materially moves DCF output because it compounds across every projection year.' },
          { title: 'Debt looks cheap until it does not', text: 'After-tax debt cost is typically lower than equity cost, but heavy leverage increases financial risk.' },
          { title: 'Beta should reflect the business', text: 'Use a peer-set or industry beta rather than a single comparable when possible.' },
          { title: 'Use WACC as a DCF input', text: 'Feed this result into the DCF Valuation Calculator to see enterprise and equity value.' }
        ],
        [
          { label: 'Equity weight', value: formatPercent(eWeight * 100, 1) },
          { label: 'Debt weight', value: formatPercent(dWeight * 100, 1) },
          { label: 'Risk-free rate', value: formatPercent(values.riskFreeRatePct || 0, 2) },
          { label: 'Equity beta', value: formatRatio(beta) },
          { label: 'Market risk premium', value: formatPercent(values.marketPremiumPct || 0, 2) },
          { label: 'Cost of equity (CAPM)', value: formatPercent(costOfEquity * 100, 2) },
          { label: 'Pre-tax cost of debt', value: formatPercent(values.costOfDebtPct || 0, 2) },
          { label: 'Tax rate', value: formatPercent(values.taxRatePct || 0, 1) },
          { label: 'After-tax cost of debt', value: formatPercent(afterTaxDebt * 100, 2) },
          { label: 'WACC', value: formatPercent(wacc * 100, 2) }
        ],
        null,
        [
          { metric: 'WACC percent', value: wacc * 100 },
          { metric: 'Cost of equity percent', value: costOfEquity * 100 },
          { metric: 'After-tax cost of debt percent', value: afterTaxDebt * 100 },
          { metric: 'Tax shield percent', value: taxShield * 100 },
          { metric: 'Equity weight percent', value: eWeight * 100 },
          { metric: 'Debt weight percent', value: dWeight * 100 }
        ],
        'WACC calculation complete.'
      );
    },
    'dcf-valuation-calculator': function (values) {
      var currentRevenue = values.currentRevenue;
      var growthRate = toRatio(values.revenueGrowthPct || 0);
      var ebitdaMargin = toRatio(values.ebitdaMarginPct || 0);
      var waccRate = toRatio(values.waccPct || 0);
      var terminalGrowth = toRatio(values.terminalGrowthPct || 0);
      var years = Math.max(1, Math.min(values.projectionYears || 5, 20));
      var netDebt = values.netDebt || 0;
      var shares = values.sharesOutstanding || 1;
      if (!(currentRevenue > 0)) throw new Error('Enter current revenue to project cash flows.');
      if (!(waccRate > 0)) throw new Error('WACC must be positive for DCF analysis.');
      if (terminalGrowth >= waccRate) throw new Error('Terminal growth must be below WACC for terminal value to converge.');
      var projections = [];
      var pvSum = 0;
      for (var i = 1; i <= years; i++) {
        var rev = currentRevenue * Math.pow(1 + growthRate, i);
        var ebitda = rev * ebitdaMargin;
        var fcf = ebitda * 0.7;
        var discountFactor = Math.pow(1 + waccRate, i);
        var pvFcf = fcf / discountFactor;
        pvSum += pvFcf;
        projections.push({ year: i, revenue: rev, ebitda: ebitda, fcf: fcf, pvFcf: pvFcf });
      }
      var lastFcf = projections[projections.length - 1].fcf;
      var terminalValue = lastFcf * (1 + terminalGrowth) / (waccRate - terminalGrowth);
      var pvTerminal = terminalValue / Math.pow(1 + waccRate, years);
      var enterpriseValue = pvSum + pvTerminal;
      var equityValue = enterpriseValue - netDebt;
      var valuePerShare = equityValue / shares;
      var terminalShare = enterpriseValue > 0 ? pvTerminal / enterpriseValue * 100 : 0;
      return buildResult(
        [
          { label: 'Enterprise value', value: formatMoney(enterpriseValue), tone: 'positive', help: 'Present value of projected free cash flows plus terminal value.' },
          { label: 'Equity value', value: formatMoney(equityValue), tone: equityValue > 0 ? 'positive' : 'critical', help: 'Enterprise value minus net debt.' },
          { label: 'Value per share', value: formatMoney(valuePerShare), tone: 'positive', help: 'Equity value divided by shares outstanding.' },
          { label: 'Terminal value share', value: formatPercent(terminalShare, 1), tone: terminalShare > 75 ? 'warning' : 'neutral', help: 'Portion of total enterprise value from the terminal value.' }
        ],
        [
          { title: 'PV of projected FCFs', value: formatMoney(pvSum), tone: 'neutral', text: 'Cumulative present value of free cash flows during the explicit projection period.' },
          { title: 'PV of terminal value', value: formatMoney(pvTerminal), tone: terminalShare > 80 ? 'warning' : 'neutral', text: 'Terminal value typically drives 60-80% of total value in a DCF.' },
          { title: 'Implied exit multiple', value: formatRatio(terminalValue / (projections[projections.length - 1].ebitda || 1)), tone: 'neutral', text: 'Implied EV/EBITDA multiple at the end of the projection period.' },
          { title: 'Year-' + years + ' revenue', value: formatMoney(projections[projections.length - 1].revenue), tone: 'neutral', text: 'Projected revenue in the final year of the explicit forecast.' }
        ],
        [
          { title: 'WACC is the most sensitive input', text: 'A 1% WACC change can move enterprise value 15-25% in a standard DCF. Use the WACC Calculator for rigor.' },
          { title: 'Terminal growth should stay conservative', text: 'Terminal growth rates above long-run GDP growth are hard to justify.' },
          { title: 'High terminal share is normal but risky', text: 'If terminal value exceeds 80% of enterprise value, small assumption changes dominate the answer.' },
          { title: 'Cross-check with multiples', text: 'Compare the implied EV/EBITDA or EV/Revenue multiple against market comparables.' }
        ],
        [
          { label: 'Current revenue', value: formatMoney(currentRevenue) },
          { label: 'Revenue growth rate', value: formatPercent(values.revenueGrowthPct || 0, 1) },
          { label: 'EBITDA margin', value: formatPercent(values.ebitdaMarginPct || 0, 1) },
          { label: 'WACC', value: formatPercent(values.waccPct || 0, 2) },
          { label: 'Terminal growth', value: formatPercent(values.terminalGrowthPct || 0, 2) },
          { label: 'Projection years', value: formatNumber(years) },
          { label: 'Net debt', value: formatMoney(netDebt) },
          { label: 'Shares outstanding', value: formatNumber(shares) },
          { label: 'Enterprise value', value: formatMoney(enterpriseValue) },
          { label: 'Equity value', value: formatMoney(equityValue) },
          { label: 'Value per share', value: formatMoney(valuePerShare) }
        ],
        {
          columns: [
            { key: 'year', label: 'Year', type: 'number', align: 'right' },
            { key: 'revenue', label: 'Revenue', type: 'money', align: 'right' },
            { key: 'ebitda', label: 'EBITDA', type: 'money', align: 'right' },
            { key: 'fcf', label: 'FCF', type: 'money', align: 'right' },
            { key: 'pvFcf', label: 'PV of FCF', type: 'money', align: 'right' }
          ],
          rows: projections
        },
        [
          { metric: 'Enterprise value', value: enterpriseValue },
          { metric: 'Equity value', value: equityValue },
          { metric: 'Value per share', value: valuePerShare },
          { metric: 'PV of projected FCFs', value: pvSum },
          { metric: 'PV of terminal value', value: pvTerminal },
          { metric: 'Terminal value share percent', value: terminalShare }
        ],
        'DCF valuation complete.'
      );
    },
    'ev-ebitda-multiple-calculator': function (values) {
      var sharePrice = values.sharePrice;
      var sharesOut = values.sharesOutstanding;
      var totalDebt = values.totalDebt || 0;
      var cashEquiv = values.cashEquivalents || 0;
      var ebitda = values.ebitda;
      var industryMultiple = values.industryMultiple || 0;
      if (!(sharePrice > 0) || !(sharesOut > 0)) throw new Error('Enter share price and shares outstanding.');
      if (!(ebitda > 0)) throw new Error('Enter a positive EBITDA to calculate the multiple.');
      var marketCap = sharePrice * sharesOut;
      var ev = marketCap + totalDebt - cashEquiv;
      var evEbitda = ev / ebitda;
      var premium = industryMultiple > 0 ? (evEbitda / industryMultiple - 1) * 100 : null;
      var impliedValue = industryMultiple > 0 ? (industryMultiple * ebitda - totalDebt + cashEquiv) / sharesOut : null;
      return buildResult(
        [
          { label: 'EV/EBITDA', value: formatRatio(evEbitda), tone: 'positive', help: 'Enterprise value divided by EBITDA.' },
          { label: 'Enterprise value', value: formatMoney(ev), tone: 'neutral', help: 'Market cap plus debt minus cash.' },
          { label: 'Market cap', value: formatMoney(marketCap), tone: 'neutral', help: 'Share price times shares outstanding.' },
          { label: 'Premium to industry', value: premium == null ? 'No benchmark' : formatPercent(premium, 1), tone: premium != null && premium > 30 ? 'warning' : premium != null && premium < -20 ? 'positive' : 'neutral', help: 'How the current multiple compares to the industry benchmark.' }
        ],
        [
          { title: 'Net debt impact', value: formatMoney(totalDebt - cashEquiv), tone: totalDebt - cashEquiv > marketCap * 0.5 ? 'warning' : 'neutral', text: 'Net debt is added to market cap to reach enterprise value.' },
          { title: 'Current share price', value: formatMoney(sharePrice), tone: 'neutral', text: 'Market price used to derive market capitalization.' },
          { title: 'Industry-implied share price', value: impliedValue == null ? 'No benchmark' : formatMoney(impliedValue), tone: 'neutral', text: 'What the share price would be if the company traded at the industry multiple.' },
          { title: 'EBITDA quality matters', value: formatMoney(ebitda), tone: 'neutral', text: 'Adjusted or normalized EBITDA produces a more useful multiple.' }
        ],
        [
          { title: 'EV/EBITDA removes capital-structure bias', text: 'Unlike P/E, this multiple lets you compare companies regardless of leverage or tax position.' },
          { title: 'Industry context is essential', text: 'A 12x multiple is expensive in some industries and cheap in others.' },
          { title: 'Connect to DCF', text: 'Use the implied valuation from multiples as a cross-check against a DCF model.' },
          { title: 'Watch for adjusted EBITDA games', text: 'Non-recurring add-backs can artificially lower the multiple.' }
        ],
        [
          { label: 'Share price', value: formatMoney(sharePrice) },
          { label: 'Shares outstanding', value: formatNumber(sharesOut) },
          { label: 'Market cap', value: formatMoney(marketCap) },
          { label: 'Total debt', value: formatMoney(totalDebt) },
          { label: 'Cash and equivalents', value: formatMoney(cashEquiv) },
          { label: 'Enterprise value', value: formatMoney(ev) },
          { label: 'EBITDA', value: formatMoney(ebitda) },
          { label: 'EV/EBITDA', value: formatRatio(evEbitda) }
        ],
        null,
        [
          { metric: 'Enterprise value', value: ev },
          { metric: 'Market cap', value: marketCap },
          { metric: 'EV/EBITDA multiple', value: evEbitda },
          { metric: 'Premium to industry percent', value: premium == null ? '' : premium },
          { metric: 'Industry-implied share price', value: impliedValue == null ? '' : impliedValue }
        ],
        'EV/EBITDA analysis complete.'
      );
    },
    'npv-calculator': function (values, rows) {
      var discountRate = toRatio(values.discountRatePct || 0);
      var initialInvestment = values.initialInvestment || 0;
      if (!(discountRate > 0)) throw new Error('Enter a positive discount rate.');
      var cashFlows = rows.filter(function (row) { return Number.isFinite(row.cashFlow); });
      if (!cashFlows.length) throw new Error('Add at least one cash flow period.');
      var pvTotal = 0;
      var pvRows = cashFlows.map(function (row, index) {
        var period = index + 1;
        var pv = row.cashFlow / Math.pow(1 + discountRate, period);
        pvTotal += pv;
        return { period: period, cashFlow: row.cashFlow, discountFactor: 1 / Math.pow(1 + discountRate, period), presentValue: pv };
      });
      var npv = -initialInvestment + pvTotal;
      var profitabilityIndex = initialInvestment > 0 ? pvTotal / initialInvestment : null;
      var totalCashFlows = sum(cashFlows.map(function (row) { return row.cashFlow; }));
      var simplePayback = null;
      var cumulative = -initialInvestment;
      for (var i = 0; i < cashFlows.length; i++) {
        cumulative += cashFlows[i].cashFlow;
        if (cumulative >= 0) { simplePayback = i + 1; break; }
      }
      return buildResult(
        [
          { label: 'NPV', value: formatMoney(npv), tone: npv >= 0 ? 'positive' : 'critical', help: 'Net present value: PV of cash flows minus initial investment.' },
          { label: 'PV of cash flows', value: formatMoney(pvTotal), tone: 'neutral', help: 'Sum of all discounted future cash flows.' },
          { label: 'Profitability index', value: profitabilityIndex == null ? 'No investment' : formatRatio(profitabilityIndex), tone: profitabilityIndex != null && profitabilityIndex >= 1 ? 'positive' : 'warning', help: 'PV of cash flows divided by initial investment.' },
          { label: 'Simple payback', value: simplePayback == null ? 'Not reached' : simplePayback + (simplePayback === 1 ? ' period' : ' periods'), tone: simplePayback != null && simplePayback <= 3 ? 'positive' : 'warning', help: 'Periods until undiscounted cash flows recover the investment.' }
        ],
        [
          { title: 'Initial investment', value: formatMoney(initialInvestment), tone: 'neutral', text: 'The upfront cost subtracted from the PV of future cash flows.' },
          { title: 'Total undiscounted cash flows', value: formatMoney(totalCashFlows), tone: totalCashFlows > initialInvestment ? 'positive' : 'warning', text: 'Sum of all future cash flows before discounting.' },
          { title: 'Discount rate', value: formatPercent(values.discountRatePct || 0, 2), tone: 'neutral', text: 'The rate used to discount future cash flows to present value.' },
          { title: 'Value created', value: npv >= 0 ? formatMoney(npv) : 'Negative NPV', tone: npv >= 0 ? 'positive' : 'critical', text: 'A positive NPV means the project creates value above the required return.' }
        ],
        [
          { title: 'Positive NPV means accept', text: 'A positive NPV signals the project earns more than the discount rate requires.' },
          { title: 'Compare with IRR', text: 'Use the IRR Calculator to find the rate at which NPV equals zero for a complementary view.' },
          { title: 'Discount rate reflects risk', text: 'Use WACC for firm-level projects or a risk-adjusted rate for standalone investments.' },
          { title: 'Profitability index helps rank projects', text: 'When capital is limited, PI shows which project creates the most value per dollar invested.' }
        ],
        [
          { label: 'Initial investment', value: formatMoney(initialInvestment) },
          { label: 'Discount rate', value: formatPercent(values.discountRatePct || 0, 2) },
          { label: 'Number of periods', value: formatNumber(cashFlows.length) },
          { label: 'PV of cash flows', value: formatMoney(pvTotal) },
          { label: 'NPV', value: formatMoney(npv) },
          { label: 'Profitability index', value: profitabilityIndex == null ? 'N/A' : formatRatio(profitabilityIndex) }
        ],
        {
          columns: [
            { key: 'period', label: 'Period', type: 'number', align: 'right' },
            { key: 'cashFlow', label: 'Cash flow', type: 'money', align: 'right' },
            { key: 'discountFactor', label: 'Discount factor', type: 'percent', align: 'right' },
            { key: 'presentValue', label: 'Present value', type: 'money', align: 'right' }
          ],
          rows: pvRows
        },
        pvRows.concat([{ period: 'NPV', cashFlow: '', discountFactor: '', presentValue: npv }]),
        'NPV calculation complete.'
      );
    },
    'irr-calculator': function (values, rows) {
      var cashFlows = rows.filter(function (row) { return Number.isFinite(row.cashFlow); }).map(function (row) { return row.cashFlow; });
      if (cashFlows.length < 2) throw new Error('Add at least two cash flow periods (including the initial investment as a negative value).');
      var hasNegative = cashFlows.some(function (cf) { return cf < 0; });
      var hasPositive = cashFlows.some(function (cf) { return cf > 0; });
      if (!hasNegative || !hasPositive) throw new Error('Cash flows must include both negative and positive values for IRR to exist.');
      function npvAtRate(rate) {
        return cashFlows.reduce(function (pv, cf, t) { return pv + cf / Math.pow(1 + rate, t); }, 0);
      }
      function npvDerivative(rate) {
        return cashFlows.reduce(function (d, cf, t) { return t === 0 ? d : d - t * cf / Math.pow(1 + rate, t + 1); }, 0);
      }
      var guess = 0.1;
      var irr = guess;
      for (var iter = 0; iter < 200; iter++) {
        var f = npvAtRate(irr);
        var fp = npvDerivative(irr);
        if (Math.abs(fp) < 1e-14) break;
        var next = irr - f / fp;
        if (Math.abs(next - irr) < 1e-10) { irr = next; break; }
        irr = next;
      }
      if (!Number.isFinite(irr) || irr < -1 || irr > 10) throw new Error('IRR could not converge. Check that cash flows have a sign change.');
      var totalInvested = Math.abs(sum(cashFlows.filter(function (cf) { return cf < 0; })));
      var totalReturn = sum(cashFlows.filter(function (cf) { return cf > 0; }));
      var multipleOnInvested = totalInvested > 0 ? totalReturn / totalInvested : null;
      var npvAt10 = npvAtRate(0.10);
      var cfRows = cashFlows.map(function (cf, t) {
        return { period: t, cashFlow: cf, cumulativeCf: sum(cashFlows.slice(0, t + 1)) };
      });
      return buildResult(
        [
          { label: 'IRR', value: formatPercent(irr * 100, 2), tone: irr > 0.15 ? 'positive' : irr > 0 ? 'neutral' : 'critical', help: 'Internal rate of return: the discount rate that makes NPV equal zero.' },
          { label: 'Total invested', value: formatMoney(totalInvested), tone: 'neutral', help: 'Sum of all negative cash flows.' },
          { label: 'Total returned', value: formatMoney(totalReturn), tone: totalReturn > totalInvested ? 'positive' : 'warning', help: 'Sum of all positive cash flows.' },
          { label: 'Multiple on invested', value: multipleOnInvested == null ? 'No investment' : formatRatio(multipleOnInvested), tone: multipleOnInvested != null && multipleOnInvested > 2 ? 'positive' : 'neutral', help: 'Total positive cash flows divided by total invested.' }
        ],
        [
          { title: 'NPV at 10% discount', value: formatMoney(npvAt10), tone: npvAt10 >= 0 ? 'positive' : 'warning', text: 'Cross-check: NPV using a 10% discount rate.' },
          { title: 'Number of periods', value: formatNumber(cashFlows.length), tone: 'neutral', text: 'Total periods including the initial investment.' },
          { title: 'Payback timing', value: cfRows.some(function (r) { return r.cumulativeCf >= 0; }) ? 'Reached' : 'Not reached', tone: cfRows.some(function (r) { return r.cumulativeCf >= 0; }) ? 'positive' : 'warning', text: 'Whether cumulative cash flows turn positive during the projection.' },
          { title: 'IRR quality', value: irr > 0.20 ? 'Strong' : irr > 0.10 ? 'Acceptable' : irr > 0 ? 'Marginal' : 'Negative', tone: irr > 0.15 ? 'positive' : irr > 0 ? 'neutral' : 'critical', text: 'IRR above the hurdle rate suggests the project creates value.' }
        ],
        [
          { title: 'Compare IRR against your hurdle rate', text: 'If IRR exceeds the required return, the project is worth further evaluation.' },
          { title: 'IRR assumes reinvestment at the same rate', text: 'This is the classic IRR limitation. Consider MIRR for a more realistic reinvestment assumption.' },
          { title: 'Use NPV as the primary decision tool', text: 'IRR is useful for comparison, but NPV shows actual value creation in dollars.' },
          { title: 'Multiple sign changes can produce multiple IRRs', text: 'If cash flows alternate positive and negative more than once, IRR may not be unique.' }
        ],
        [
          { label: 'IRR', value: formatPercent(irr * 100, 2) },
          { label: 'Number of periods', value: formatNumber(cashFlows.length) },
          { label: 'Total invested', value: formatMoney(totalInvested) },
          { label: 'Total returned', value: formatMoney(totalReturn) },
          { label: 'Multiple on invested', value: multipleOnInvested == null ? 'N/A' : formatRatio(multipleOnInvested) },
          { label: 'NPV at 10%', value: formatMoney(npvAt10) }
        ],
        {
          columns: [
            { key: 'period', label: 'Period', type: 'number', align: 'right' },
            { key: 'cashFlow', label: 'Cash flow', type: 'money', align: 'right' },
            { key: 'cumulativeCf', label: 'Cumulative', type: 'money', align: 'right' }
          ],
          rows: cfRows
        },
        cfRows,
        'IRR calculation complete.'
      );
    },
    'cap-rate-calculator': function (values) {
      var noi = values.netOperatingIncome;
      var propertyValue = values.propertyValue;
      var purchasePrice = values.purchasePrice || 0;
      var annualDebtService = values.annualDebtService || 0;
      if (!(noi >= 0)) throw new Error('Enter net operating income.');
      if (!(propertyValue > 0) && !(purchasePrice > 0)) throw new Error('Enter property value or purchase price.');
      var baseValue = propertyValue > 0 ? propertyValue : purchasePrice;
      var capRate = noi / baseValue;
      var impliedValueAt5 = noi / 0.05;
      var impliedValueAt8 = noi / 0.08;
      var impliedValueAt10 = noi / 0.10;
      var cashOnCash = purchasePrice > 0 && annualDebtService >= 0 ? (noi - annualDebtService) / purchasePrice : null;
      var dscr = annualDebtService > 0 ? noi / annualDebtService : null;
      var grossRentMultiplier = values.grossRent > 0 ? baseValue / values.grossRent : null;
      return buildResult(
        [
          { label: 'Cap rate', value: formatPercent(capRate * 100, 2), tone: capRate > 0.08 ? 'positive' : capRate > 0.05 ? 'neutral' : 'warning', help: 'Net operating income divided by property value.' },
          { label: 'Property value', value: formatMoney(baseValue), tone: 'neutral', help: 'Current market value or purchase price.' },
          { label: 'NOI', value: formatMoney(noi), tone: noi > 0 ? 'positive' : 'warning', help: 'Annual net operating income.' },
          { label: 'Cash-on-cash return', value: cashOnCash == null ? 'Not provided' : formatPercent(cashOnCash * 100, 2), tone: cashOnCash != null && cashOnCash > 0.08 ? 'positive' : 'neutral', help: 'Pre-tax cash flow divided by purchase price.' }
        ],
        [
          { title: 'Implied value at 5% cap', value: formatMoney(impliedValueAt5), tone: 'neutral', text: 'What the property would be worth at a 5% cap rate.' },
          { title: 'Implied value at 8% cap', value: formatMoney(impliedValueAt8), tone: 'neutral', text: 'What the property would be worth at an 8% cap rate.' },
          { title: 'Implied value at 10% cap', value: formatMoney(impliedValueAt10), tone: 'neutral', text: 'What the property would be worth at a 10% cap rate.' },
          { title: 'DSCR', value: dscr == null ? 'No debt service' : formatRatio(dscr), tone: dscr != null && dscr < 1.25 ? 'warning' : 'positive', text: 'NOI divided by annual debt service. Lenders typically want 1.25x or more.' }
        ],
        [
          { title: 'Cap rate is a snapshot, not a forecast', text: 'It reflects current NOI against current value without projecting future income growth or capital needs.' },
          { title: 'Lower cap rates signal lower risk or higher prices', text: 'Prime locations typically trade at lower cap rates because income is more stable.' },
          { title: 'Compare across property types carefully', text: 'Multifamily, office, retail, and industrial properties have different normal cap rate ranges.' },
          { title: 'DSCR protects downside', text: 'Even a strong cap rate matters less if the property cannot cover its debt service.' }
        ],
        [
          { label: 'Net operating income', value: formatMoney(noi) },
          { label: 'Property value', value: formatMoney(baseValue) },
          { label: 'Cap rate', value: formatPercent(capRate * 100, 2) },
          { label: 'Implied value at 5% cap', value: formatMoney(impliedValueAt5) },
          { label: 'Implied value at 8% cap', value: formatMoney(impliedValueAt8) },
          { label: 'Implied value at 10% cap', value: formatMoney(impliedValueAt10) }
        ],
        null,
        [
          { metric: 'Cap rate percent', value: capRate * 100 },
          { metric: 'NOI', value: noi },
          { metric: 'Property value', value: baseValue },
          { metric: 'Cash-on-cash return percent', value: cashOnCash == null ? '' : cashOnCash * 100 },
          { metric: 'DSCR', value: dscr == null ? '' : dscr }
        ],
        'Cap rate analysis complete.'
      );
    },
    'dividend-yield-calculator': function (values) {
      var annualDividend = values.annualDividendPerShare;
      var sharePrice = values.sharePrice;
      var eps = values.earningsPerShare || 0;
      var priorDividend = values.priorDividend || 0;
      if (!(annualDividend >= 0)) throw new Error('Enter the annual dividend per share.');
      if (!(sharePrice > 0)) throw new Error('Enter the current share price.');
      var dividendYield = annualDividend / sharePrice;
      var payoutRatio = eps > 0 ? annualDividend / eps : null;
      var retentionRatio = payoutRatio != null ? 1 - payoutRatio : null;
      var dividendGrowth = priorDividend > 0 ? (annualDividend / priorDividend - 1) : null;
      var yieldOnCost = priorDividend > 0 && values.costBasis > 0 ? annualDividend / values.costBasis : null;
      var annualIncome = annualDividend * (values.sharesOwned || 0);
      return buildResult(
        [
          { label: 'Dividend yield', value: formatPercent(dividendYield * 100, 2), tone: dividendYield > 0.04 ? 'positive' : dividendYield > 0.02 ? 'neutral' : 'warning', help: 'Annual dividend divided by current share price.' },
          { label: 'Payout ratio', value: payoutRatio == null ? 'No EPS' : formatPercent(payoutRatio * 100, 1), tone: payoutRatio != null && payoutRatio > 0.8 ? 'warning' : 'neutral', help: 'Percentage of earnings paid out as dividends.' },
          { label: 'Dividend growth', value: dividendGrowth == null ? 'Not provided' : formatPercent(dividendGrowth * 100, 1), tone: dividendGrowth != null && dividendGrowth > 0 ? 'positive' : 'neutral', help: 'Year-over-year change in the dividend per share.' },
          { label: 'Annual income', value: annualIncome > 0 ? formatMoney(annualIncome) : 'Enter shares owned', tone: annualIncome > 0 ? 'positive' : 'neutral', help: 'Total annual dividend income based on shares owned.' }
        ],
        [
          { title: 'Current yield context', value: formatPercent(dividendYield * 100, 2), tone: dividendYield > 0.05 ? 'positive' : 'neutral', text: 'Compare against the S&P 500 average yield (~1.3%) and 10-year Treasury yield.' },
          { title: 'Retention ratio', value: retentionRatio == null ? 'No EPS' : formatPercent(retentionRatio * 100, 1), tone: 'neutral', text: 'Earnings kept for reinvestment. Lower retention means less growth reinvestment.' },
          { title: 'Yield on cost', value: yieldOnCost == null ? 'Not provided' : formatPercent(yieldOnCost * 100, 2), tone: 'neutral', text: 'Dividend yield based on your original cost basis rather than current price.' },
          { title: 'Quarterly dividend', value: formatMoney(annualDividend / 4), tone: 'neutral', text: 'Estimated quarterly dividend per share assuming even distribution.' }
        ],
        [
          { title: 'High yield can signal risk', text: 'An unusually high yield may reflect a falling share price rather than generous dividends.' },
          { title: 'Payout ratio sustainability', text: 'Payout ratios above 80-90% leave little room for growth or dividend increases.' },
          { title: 'Dividend growth matters for total return', text: 'A growing dividend often signals management confidence in future earnings.' },
          { title: 'Compare yield against alternatives', text: 'Risk-free Treasury yields, bond yields, and peer dividend yields all provide useful context.' }
        ],
        [
          { label: 'Annual dividend per share', value: formatMoney(annualDividend) },
          { label: 'Share price', value: formatMoney(sharePrice) },
          { label: 'Dividend yield', value: formatPercent(dividendYield * 100, 2) },
          { label: 'EPS', value: eps > 0 ? formatMoney(eps) : 'Not provided' },
          { label: 'Payout ratio', value: payoutRatio == null ? 'Not provided' : formatPercent(payoutRatio * 100, 1) },
          { label: 'Retention ratio', value: retentionRatio == null ? 'Not provided' : formatPercent(retentionRatio * 100, 1) }
        ],
        null,
        [
          { metric: 'Dividend yield percent', value: dividendYield * 100 },
          { metric: 'Payout ratio percent', value: payoutRatio == null ? '' : payoutRatio * 100 },
          { metric: 'Dividend growth percent', value: dividendGrowth == null ? '' : dividendGrowth * 100 },
          { metric: 'Annual income', value: annualIncome || '' }
        ],
        'Dividend yield analysis complete.'
      );
    },
    'pe-ratio-analyzer': function (values) {
      var sharePrice = values.sharePrice;
      var eps = values.earningsPerShare;
      var growthRate = values.earningsGrowthPct || 0;
      var industryPE = values.industryPE || 0;
      var forwardEps = values.forwardEps || 0;
      if (!(sharePrice > 0)) throw new Error('Enter the current share price.');
      if (!eps || eps <= 0) throw new Error('Enter a positive earnings per share for P/E analysis.');
      var peRatio = sharePrice / eps;
      var peg = growthRate > 0 ? peRatio / growthRate : null;
      var forwardPE = forwardEps > 0 ? sharePrice / forwardEps : null;
      var earningsYield = 1 / peRatio;
      var premiumToIndustry = industryPE > 0 ? (peRatio / industryPE - 1) * 100 : null;
      var impliedPrice = industryPE > 0 ? industryPE * eps : null;
      var impliedGrowth = peRatio > 0 ? peRatio - (industryPE > 0 ? industryPE : 15) : null;
      return buildResult(
        [
          { label: 'P/E ratio', value: formatRatio(peRatio), tone: peRatio > 30 ? 'warning' : peRatio < 10 ? 'positive' : 'neutral', help: 'Share price divided by earnings per share.' },
          { label: 'PEG ratio', value: peg == null ? 'No growth rate' : formatRatio(peg), tone: peg != null && peg > 2 ? 'warning' : peg != null && peg < 1 ? 'positive' : 'neutral', help: 'P/E divided by earnings growth rate. Below 1 suggests undervaluation relative to growth.' },
          { label: 'Earnings yield', value: formatPercent(earningsYield * 100, 2), tone: earningsYield > 0.06 ? 'positive' : 'neutral', help: 'Inverse of P/E. Comparable to a bond yield.' },
          { label: 'Forward P/E', value: forwardPE == null ? 'No forward EPS' : formatRatio(forwardPE), tone: forwardPE != null && forwardPE < peRatio ? 'positive' : 'neutral', help: 'Current price divided by next year estimated EPS.' }
        ],
        [
          { title: 'Premium to industry', value: premiumToIndustry == null ? 'No benchmark' : formatPercent(premiumToIndustry, 1), tone: premiumToIndustry != null && premiumToIndustry > 30 ? 'warning' : 'neutral', text: 'How the current P/E compares to the industry benchmark.' },
          { title: 'Industry-implied price', value: impliedPrice == null ? 'No benchmark' : formatMoney(impliedPrice), tone: 'neutral', text: 'What the share would cost at the industry P/E multiple.' },
          { title: 'Growth expectation', value: formatPercent(growthRate, 1), tone: growthRate > 15 ? 'positive' : 'neutral', text: 'The earnings growth rate that justifies the current P/E.' },
          { title: 'Trailing EPS', value: formatMoney(eps), tone: 'neutral', text: 'The trailing twelve-month earnings per share used in the calculation.' }
        ],
        [
          { title: 'P/E is a shorthand, not a verdict', text: 'A high P/E can mean overvaluation or strong growth expectations. Context matters.' },
          { title: 'PEG adjusts for growth', text: 'PEG below 1 suggests the stock may be undervalued relative to its growth rate.' },
          { title: 'Compare trailing and forward P/E', text: 'If forward P/E is significantly lower, the market expects earnings improvement.' },
          { title: 'Earnings yield vs. bond yields', text: 'When earnings yield exceeds the risk-free rate by a wide margin, equities may be relatively attractive.' }
        ],
        [
          { label: 'Share price', value: formatMoney(sharePrice) },
          { label: 'EPS (trailing)', value: formatMoney(eps) },
          { label: 'P/E ratio', value: formatRatio(peRatio) },
          { label: 'PEG ratio', value: peg == null ? 'N/A' : formatRatio(peg) },
          { label: 'Earnings yield', value: formatPercent(earningsYield * 100, 2) },
          { label: 'Forward EPS', value: forwardEps > 0 ? formatMoney(forwardEps) : 'Not provided' },
          { label: 'Forward P/E', value: forwardPE == null ? 'N/A' : formatRatio(forwardPE) },
          { label: 'Industry P/E', value: industryPE > 0 ? formatRatio(industryPE) : 'Not provided' }
        ],
        null,
        [
          { metric: 'P/E ratio', value: peRatio },
          { metric: 'PEG ratio', value: peg == null ? '' : peg },
          { metric: 'Earnings yield percent', value: earningsYield * 100 },
          { metric: 'Forward P/E', value: forwardPE == null ? '' : forwardPE },
          { metric: 'Premium to industry percent', value: premiumToIndustry == null ? '' : premiumToIndustry }
        ],
        'P/E ratio analysis complete.'
      );
    },
    'fixed-asset-roll-forward': function (values, rows) {
      var periodLabel = values.periodLabel || 'Current period';
      var assets = rows.filter(function (row) {
        return row.assetName && (Number.isFinite(row.beginningBalance) || Number.isFinite(row.additions) || Number.isFinite(row.disposals) || Number.isFinite(row.depreciation));
      });
      if (!assets.length) throw new Error('Add at least one asset row with a name and beginning balance.');
      var rollRows = assets.map(function (row) {
        var beginning = row.beginningBalance || 0;
        var additions = row.additions || 0;
        var disposals = row.disposals || 0;
        var depreciation = row.depreciation || 0;
        var ending = beginning + additions - disposals - depreciation;
        return {
          assetName: row.assetName,
          beginningBalance: beginning,
          additions: additions,
          disposals: disposals,
          depreciation: depreciation,
          endingBalance: ending
        };
      });
      var totals = {
        beginning: sum(rollRows.map(function (r) { return r.beginningBalance; })),
        additions: sum(rollRows.map(function (r) { return r.additions; })),
        disposals: sum(rollRows.map(function (r) { return r.disposals; })),
        depreciation: sum(rollRows.map(function (r) { return r.depreciation; })),
        ending: sum(rollRows.map(function (r) { return r.endingBalance; }))
      };
      var depreciationRate = totals.beginning > 0 ? totals.depreciation / totals.beginning * 100 : 0;
      var capexIntensity = totals.beginning > 0 ? totals.additions / totals.beginning * 100 : 0;
      var netMovement = totals.additions - totals.disposals - totals.depreciation;
      return buildResult(
        [
          { label: 'Ending balance', value: formatMoney(totals.ending), tone: 'positive', help: 'Total net book value after all activity.' },
          { label: 'Total depreciation', value: formatMoney(totals.depreciation), tone: 'neutral', help: 'Total depreciation expense for the period.' },
          { label: 'Net movement', value: formatMoney(netMovement), tone: netMovement >= 0 ? 'positive' : 'warning', help: 'Additions minus disposals minus depreciation.' },
          { label: 'Depreciation rate', value: formatPercent(depreciationRate, 1), tone: depreciationRate > 20 ? 'warning' : 'neutral', help: 'Total depreciation as a percent of beginning balance.' }
        ],
        [
          { title: 'Beginning balance', value: formatMoney(totals.beginning), tone: 'neutral', text: 'Total net book value at the start of the period.' },
          { title: 'Total additions', value: formatMoney(totals.additions), tone: totals.additions > 0 ? 'positive' : 'neutral', text: 'Capital expenditures and asset purchases during the period.' },
          { title: 'Total disposals', value: formatMoney(totals.disposals), tone: totals.disposals > totals.additions ? 'warning' : 'neutral', text: 'Net book value of assets disposed or retired.' },
          { title: 'CapEx intensity', value: formatPercent(capexIntensity, 1), tone: 'neutral', text: 'Additions as a percentage of beginning fixed asset balance.' }
        ],
        [
          { title: 'Roll-forward is the audit trail', text: 'The schedule connects beginning balance to ending balance through each movement category.' },
          { title: 'Depreciation should be reconcilable', text: 'Total depreciation here should tie to the depreciation expense on the income statement.' },
          { title: 'Disposal gains and losses are separate', text: 'This schedule tracks net book value removed. Gain or loss on disposal is an income statement item.' },
          { title: 'Use for both GAAP and tax schedules', text: 'Maintain separate roll-forwards if book and tax depreciation methods differ.' }
        ],
        [
          { label: 'Period', value: periodLabel },
          { label: 'Asset rows', value: formatNumber(rollRows.length) },
          { label: 'Beginning balance', value: formatMoney(totals.beginning) },
          { label: 'Additions', value: formatMoney(totals.additions) },
          { label: 'Disposals', value: formatMoney(totals.disposals) },
          { label: 'Depreciation', value: formatMoney(totals.depreciation) },
          { label: 'Ending balance', value: formatMoney(totals.ending) }
        ],
        {
          columns: [
            { key: 'assetName', label: 'Asset', type: 'text' },
            { key: 'beginningBalance', label: 'Beginning', type: 'money', align: 'right' },
            { key: 'additions', label: 'Additions', type: 'money', align: 'right' },
            { key: 'disposals', label: 'Disposals', type: 'money', align: 'right' },
            { key: 'depreciation', label: 'Depreciation', type: 'money', align: 'right' },
            { key: 'endingBalance', label: 'Ending', type: 'money', align: 'right' }
          ],
          rows: rollRows
        },
        rollRows,
        'Fixed asset roll-forward complete.'
      );
    },

    'accounts-receivable-roll-forward': function (values, rows) {
      var periodLabel = values.periodLabel || 'Current period';
      var items = rows.filter(function (r) { return r.customerOrCategory && (Number.isFinite(r.beginningBalance) || Number.isFinite(r.salesRevenue) || Number.isFinite(r.collections)); });
      if (!items.length) throw new Error('Add at least one customer or category row.');
      var rollRows = items.map(function (r) {
        var beg = r.beginningBalance || 0, sales = r.salesRevenue || 0, coll = r.collections || 0, wo = r.writeOffs || 0, adj = r.adjustments || 0;
        return { customerOrCategory: r.customerOrCategory, beginningBalance: beg, salesRevenue: sales, collections: coll, writeOffs: wo, adjustments: adj, endingBalance: beg + sales - coll - wo + adj };
      });
      var t = { beg: sum(rollRows.map(function (r) { return r.beginningBalance; })), sales: sum(rollRows.map(function (r) { return r.salesRevenue; })), coll: sum(rollRows.map(function (r) { return r.collections; })), wo: sum(rollRows.map(function (r) { return r.writeOffs; })), adj: sum(rollRows.map(function (r) { return r.adjustments; })), end: sum(rollRows.map(function (r) { return r.endingBalance; })) };
      var dso = t.sales > 0 ? t.end / (t.sales / 365) : 0;
      var collRate = t.sales > 0 ? t.coll / t.sales * 100 : 0;
      return buildResult(
        [{ label: 'Ending AR balance', value: formatMoney(t.end), tone: 'positive', help: 'Total accounts receivable after all activity.' }, { label: 'Total collections', value: formatMoney(t.coll), tone: 'neutral', help: 'Cash collected during the period.' }, { label: 'Estimated DSO', value: formatDays(dso), tone: dso > 45 ? 'warning' : 'positive', help: 'Days sales outstanding based on period sales.' }, { label: 'Collection rate', value: formatPercent(collRate, 1), tone: collRate > 80 ? 'positive' : 'warning', help: 'Collections as a percentage of sales.' }],
        [{ title: 'Beginning AR', value: formatMoney(t.beg), tone: 'neutral', text: 'Outstanding receivables at the start of the period.' }, { title: 'Net sales added', value: formatMoney(t.sales), tone: 'positive', text: 'Revenue that created new receivables during the period.' }, { title: 'Write-offs', value: formatMoney(t.wo), tone: t.wo > t.sales * 0.05 ? 'warning' : 'neutral', text: 'Uncollectible amounts removed from the receivable balance.' }, { title: 'Adjustments', value: formatMoney(t.adj), tone: 'neutral', text: 'Credit memos, returns, or other adjustments to AR.' }],
        [{ title: 'Tie to the general ledger', text: 'Ending AR should match the GL balance for accounts receivable at period end.' }, { title: 'Watch collection trends', text: 'Rising DSO or falling collection rates may signal credit risk or operational delays.' }, { title: 'Write-offs need documentation', text: 'Each write-off should have supporting evidence of collection effort and management approval.' }],
        [{ label: 'Period', value: periodLabel }, { label: 'Customer rows', value: formatNumber(rollRows.length) }, { label: 'Beginning AR', value: formatMoney(t.beg) }, { label: 'Sales', value: formatMoney(t.sales) }, { label: 'Collections', value: formatMoney(t.coll) }, { label: 'Write-offs', value: formatMoney(t.wo) }, { label: 'Ending AR', value: formatMoney(t.end) }],
        { columns: [{ key: 'customerOrCategory', label: 'Customer' }, { key: 'beginningBalance', label: 'Beginning', align: 'right' }, { key: 'salesRevenue', label: 'Sales', align: 'right' }, { key: 'collections', label: 'Collections', align: 'right' }, { key: 'writeOffs', label: 'Write-offs', align: 'right' }, { key: 'adjustments', label: 'Adjustments', align: 'right' }, { key: 'endingBalance', label: 'Ending', align: 'right' }], rows: rollRows.map(function (r) { return { customerOrCategory: r.customerOrCategory, beginningBalance: formatMoney(r.beginningBalance), salesRevenue: formatMoney(r.salesRevenue), collections: formatMoney(r.collections), writeOffs: formatMoney(r.writeOffs), adjustments: formatMoney(r.adjustments), endingBalance: formatMoney(r.endingBalance) }; }) },
        rollRows, 'Accounts receivable roll-forward complete.'
      );
    },

    'debt-roll-forward-schedule': function (values, rows) {
      var periodLabel = values.periodLabel || 'Current period';
      var items = rows.filter(function (r) { return r.debtInstrument && (Number.isFinite(r.beginningBalance) || Number.isFinite(r.newBorrowings) || Number.isFinite(r.principalPayments)); });
      if (!items.length) throw new Error('Add at least one debt instrument row.');
      var rollRows = items.map(function (r) {
        var beg = r.beginningBalance || 0, nb = r.newBorrowings || 0, pp = r.principalPayments || 0, conv = r.conversions || 0, adj = r.adjustments || 0;
        return { debtInstrument: r.debtInstrument, beginningBalance: beg, newBorrowings: nb, principalPayments: pp, conversions: conv, adjustments: adj, endingBalance: beg + nb - pp - conv + adj };
      });
      var t = { beg: sum(rollRows.map(function (r) { return r.beginningBalance; })), nb: sum(rollRows.map(function (r) { return r.newBorrowings; })), pp: sum(rollRows.map(function (r) { return r.principalPayments; })), conv: sum(rollRows.map(function (r) { return r.conversions; })), adj: sum(rollRows.map(function (r) { return r.adjustments; })), end: sum(rollRows.map(function (r) { return r.endingBalance; })) };
      var netChange = t.nb - t.pp - t.conv + t.adj;
      return buildResult(
        [{ label: 'Ending debt balance', value: formatMoney(t.end), tone: 'neutral', help: 'Total outstanding debt after all activity.' }, { label: 'Net change in debt', value: formatMoney(netChange), tone: netChange > 0 ? 'warning' : 'positive', help: 'New borrowings minus payments and conversions.' }, { label: 'Principal payments', value: formatMoney(t.pp), tone: 'positive', help: 'Total principal repaid during the period.' }, { label: 'New borrowings', value: formatMoney(t.nb), tone: t.nb > 0 ? 'warning' : 'neutral', help: 'New debt issued during the period.' }],
        [{ title: 'Beginning debt', value: formatMoney(t.beg), tone: 'neutral', text: 'Total debt outstanding at the start of the period.' }, { title: 'Debt repayment rate', value: formatPercent(t.beg > 0 ? t.pp / t.beg * 100 : 0, 1), tone: 'neutral', text: 'Principal payments as a percentage of beginning debt.' }, { title: 'Conversions', value: formatMoney(t.conv), tone: 'neutral', text: 'Debt converted to equity or reclassified during the period.' }, { title: 'Leverage direction', value: netChange >= 0 ? 'Increasing' : 'Decreasing', tone: netChange >= 0 ? 'warning' : 'positive', text: 'Whether the total debt position grew or shrank.' }],
        [{ title: 'Reconcile to the balance sheet', text: 'Ending debt should tie to total short-term and long-term debt on the balance sheet.' }, { title: 'Track covenant compliance', text: 'Use the roll-forward to monitor debt-to-equity, interest coverage, and other covenant ratios.' }, { title: 'Separate current vs long-term', text: 'Identify the portion of ending debt due within 12 months for proper balance sheet classification.' }],
        [{ label: 'Period', value: periodLabel }, { label: 'Instruments', value: formatNumber(rollRows.length) }, { label: 'Beginning debt', value: formatMoney(t.beg) }, { label: 'New borrowings', value: formatMoney(t.nb) }, { label: 'Principal payments', value: formatMoney(t.pp) }, { label: 'Conversions', value: formatMoney(t.conv) }, { label: 'Ending debt', value: formatMoney(t.end) }],
        { columns: [{ key: 'debtInstrument', label: 'Instrument' }, { key: 'beginningBalance', label: 'Beginning', align: 'right' }, { key: 'newBorrowings', label: 'Borrowings', align: 'right' }, { key: 'principalPayments', label: 'Payments', align: 'right' }, { key: 'conversions', label: 'Conversions', align: 'right' }, { key: 'adjustments', label: 'Adjustments', align: 'right' }, { key: 'endingBalance', label: 'Ending', align: 'right' }], rows: rollRows.map(function (r) { return { debtInstrument: r.debtInstrument, beginningBalance: formatMoney(r.beginningBalance), newBorrowings: formatMoney(r.newBorrowings), principalPayments: formatMoney(r.principalPayments), conversions: formatMoney(r.conversions), adjustments: formatMoney(r.adjustments), endingBalance: formatMoney(r.endingBalance) }; }) },
        rollRows, 'Debt roll-forward complete.'
      );
    },

    'equity-roll-forward': function (values, rows) {
      var periodLabel = values.periodLabel || 'Current period';
      var items = rows.filter(function (r) { return r.equityComponent && (Number.isFinite(r.beginningBalance) || Number.isFinite(r.netIncome) || Number.isFinite(r.issuances)); });
      if (!items.length) throw new Error('Add at least one equity component row.');
      var rollRows = items.map(function (r) {
        var beg = r.beginningBalance || 0, ni = r.netIncome || 0, iss = r.issuances || 0, buy = r.buybacks || 0, div = r.dividends || 0, oci = r.oci || 0;
        return { equityComponent: r.equityComponent, beginningBalance: beg, netIncome: ni, issuances: iss, buybacks: buy, dividends: div, oci: oci, endingBalance: beg + ni + iss - buy - div + oci };
      });
      var t = { beg: sum(rollRows.map(function (r) { return r.beginningBalance; })), ni: sum(rollRows.map(function (r) { return r.netIncome; })), iss: sum(rollRows.map(function (r) { return r.issuances; })), buy: sum(rollRows.map(function (r) { return r.buybacks; })), div: sum(rollRows.map(function (r) { return r.dividends; })), oci: sum(rollRows.map(function (r) { return r.oci; })), end: sum(rollRows.map(function (r) { return r.endingBalance; })) };
      return buildResult(
        [{ label: 'Ending equity', value: formatMoney(t.end), tone: 'positive', help: 'Total stockholders equity after all activity.' }, { label: 'Net income', value: formatMoney(t.ni), tone: t.ni >= 0 ? 'positive' : 'warning', help: 'Net income flowing to retained earnings.' }, { label: 'Shareholder returns', value: formatMoney(t.buy + t.div), tone: 'neutral', help: 'Total buybacks plus dividends returned to shareholders.' }, { label: 'Net equity change', value: formatMoney(t.end - t.beg), tone: t.end >= t.beg ? 'positive' : 'warning', help: 'Period-over-period change in total equity.' }],
        [{ title: 'Beginning equity', value: formatMoney(t.beg), tone: 'neutral', text: 'Total stockholders equity at the start of the period.' }, { title: 'Stock issuances', value: formatMoney(t.iss), tone: 'neutral', text: 'New shares issued including stock compensation.' }, { title: 'Other comprehensive income', value: formatMoney(t.oci), tone: 'neutral', text: 'Unrealized gains and losses, foreign currency, and pension adjustments.' }, { title: 'Payout ratio', value: formatPercent(t.ni > 0 ? t.div / t.ni * 100 : 0, 1), tone: 'neutral', text: 'Dividends as a percentage of net income.' }],
        [{ title: 'Ties to the statement of equity', text: 'This roll-forward should reconcile to the statement of stockholders equity in the financial statements.' }, { title: 'Treasury stock reduces equity', text: 'Share buybacks reduce total equity and are tracked as a contra-equity balance.' }, { title: 'OCI bypasses the income statement', text: 'Other comprehensive income items affect equity without flowing through net income.' }],
        [{ label: 'Period', value: periodLabel }, { label: 'Components', value: formatNumber(rollRows.length) }, { label: 'Beginning equity', value: formatMoney(t.beg) }, { label: 'Net income', value: formatMoney(t.ni) }, { label: 'Issuances', value: formatMoney(t.iss) }, { label: 'Buybacks', value: formatMoney(t.buy) }, { label: 'Dividends', value: formatMoney(t.div) }, { label: 'Ending equity', value: formatMoney(t.end) }],
        { columns: [{ key: 'equityComponent', label: 'Component' }, { key: 'beginningBalance', label: 'Beginning', align: 'right' }, { key: 'netIncome', label: 'Net income', align: 'right' }, { key: 'issuances', label: 'Issuances', align: 'right' }, { key: 'buybacks', label: 'Buybacks', align: 'right' }, { key: 'dividends', label: 'Dividends', align: 'right' }, { key: 'oci', label: 'OCI', align: 'right' }, { key: 'endingBalance', label: 'Ending', align: 'right' }], rows: rollRows.map(function (r) { return { equityComponent: r.equityComponent, beginningBalance: formatMoney(r.beginningBalance), netIncome: formatMoney(r.netIncome), issuances: formatMoney(r.issuances), buybacks: formatMoney(r.buybacks), dividends: formatMoney(r.dividends), oci: formatMoney(r.oci), endingBalance: formatMoney(r.endingBalance) }; }) },
        rollRows, 'Equity roll-forward complete.'
      );
    },

    'goodwill-intangibles-roll-forward': function (values, rows) {
      var periodLabel = values.periodLabel || 'Current period';
      var items = rows.filter(function (r) { return r.intangibleAsset && (Number.isFinite(r.beginningBalance) || Number.isFinite(r.acquisitions) || Number.isFinite(r.amortization)); });
      if (!items.length) throw new Error('Add at least one intangible asset row.');
      var rollRows = items.map(function (r) {
        var beg = r.beginningBalance || 0, acq = r.acquisitions || 0, amort = r.amortization || 0, imp = r.impairments || 0, adj = r.adjustments || 0;
        return { intangibleAsset: r.intangibleAsset, beginningBalance: beg, acquisitions: acq, amortization: amort, impairments: imp, adjustments: adj, endingBalance: beg + acq - amort - imp + adj };
      });
      var t = { beg: sum(rollRows.map(function (r) { return r.beginningBalance; })), acq: sum(rollRows.map(function (r) { return r.acquisitions; })), amort: sum(rollRows.map(function (r) { return r.amortization; })), imp: sum(rollRows.map(function (r) { return r.impairments; })), adj: sum(rollRows.map(function (r) { return r.adjustments; })), end: sum(rollRows.map(function (r) { return r.endingBalance; })) };
      var goodwillRows = rollRows.filter(function (r) { return /goodwill/i.test(r.intangibleAsset); });
      var goodwillEnd = sum(goodwillRows.map(function (r) { return r.endingBalance; }));
      return buildResult(
        [{ label: 'Ending balance', value: formatMoney(t.end), tone: 'positive', help: 'Total goodwill and intangibles after all activity.' }, { label: 'Total amortization', value: formatMoney(t.amort), tone: 'neutral', help: 'Amortization expense for definite-lived intangibles.' }, { label: 'Impairments', value: formatMoney(t.imp), tone: t.imp > 0 ? 'warning' : 'neutral', help: 'Impairment charges recognized during the period.' }, { label: 'Goodwill balance', value: formatMoney(goodwillEnd), tone: 'neutral', help: 'Ending goodwill balance, if identified separately.' }],
        [{ title: 'Beginning balance', value: formatMoney(t.beg), tone: 'neutral', text: 'Total intangible assets at the start of the period.' }, { title: 'Acquisitions', value: formatMoney(t.acq), tone: t.acq > 0 ? 'positive' : 'neutral', text: 'New intangibles acquired through business combinations or purchases.' }, { title: 'Amortization rate', value: formatPercent(t.beg > 0 ? t.amort / t.beg * 100 : 0, 1), tone: 'neutral', text: 'Amortization as a percentage of beginning balance.' }, { title: 'Impairment indicator', value: t.imp > 0 ? 'Impairment recognized' : 'No impairment', tone: t.imp > 0 ? 'warning' : 'positive', text: 'Whether any impairment charges were recorded in the period.' }],
        [{ title: 'Goodwill is not amortized under US GAAP', text: 'Goodwill is tested for impairment annually or when triggering events occur per ASC 350.' }, { title: 'Separate definite and indefinite lives', text: 'Definite-lived intangibles are amortized over their useful life. Indefinite-lived intangibles are tested for impairment.' }, { title: 'Purchase price allocation drives the schedule', text: 'Acquisition-date fair values from the PPA determine the starting balances and amortization periods.' }],
        [{ label: 'Period', value: periodLabel }, { label: 'Asset rows', value: formatNumber(rollRows.length) }, { label: 'Beginning balance', value: formatMoney(t.beg) }, { label: 'Acquisitions', value: formatMoney(t.acq) }, { label: 'Amortization', value: formatMoney(t.amort) }, { label: 'Impairments', value: formatMoney(t.imp) }, { label: 'Ending balance', value: formatMoney(t.end) }],
        { columns: [{ key: 'intangibleAsset', label: 'Asset' }, { key: 'beginningBalance', label: 'Beginning', align: 'right' }, { key: 'acquisitions', label: 'Acquisitions', align: 'right' }, { key: 'amortization', label: 'Amortization', align: 'right' }, { key: 'impairments', label: 'Impairments', align: 'right' }, { key: 'adjustments', label: 'Adjustments', align: 'right' }, { key: 'endingBalance', label: 'Ending', align: 'right' }], rows: rollRows.map(function (r) { return { intangibleAsset: r.intangibleAsset, beginningBalance: formatMoney(r.beginningBalance), acquisitions: formatMoney(r.acquisitions), amortization: formatMoney(r.amortization), impairments: formatMoney(r.impairments), adjustments: formatMoney(r.adjustments), endingBalance: formatMoney(r.endingBalance) }; }) },
        rollRows, 'Goodwill and intangibles roll-forward complete.'
      );
    },

    'inventory-roll-forward': function (values, rows) {
      var periodLabel = values.periodLabel || 'Current period';
      var items = rows.filter(function (r) { return r.inventoryCategory && (Number.isFinite(r.beginningBalance) || Number.isFinite(r.purchases) || Number.isFinite(r.cogs)); });
      if (!items.length) throw new Error('Add at least one inventory category row.');
      var rollRows = items.map(function (r) {
        var beg = r.beginningBalance || 0, purch = r.purchases || 0, prod = r.production || 0, cogs = r.cogs || 0, wd = r.writeDowns || 0, adj = r.adjustments || 0;
        return { inventoryCategory: r.inventoryCategory, beginningBalance: beg, purchases: purch, production: prod, cogs: cogs, writeDowns: wd, adjustments: adj, endingBalance: beg + purch + prod - cogs - wd + adj };
      });
      var t = { beg: sum(rollRows.map(function (r) { return r.beginningBalance; })), purch: sum(rollRows.map(function (r) { return r.purchases; })), prod: sum(rollRows.map(function (r) { return r.production; })), cogs: sum(rollRows.map(function (r) { return r.cogs; })), wd: sum(rollRows.map(function (r) { return r.writeDowns; })), adj: sum(rollRows.map(function (r) { return r.adjustments; })), end: sum(rollRows.map(function (r) { return r.endingBalance; })) };
      var turnover = t.end > 0 ? t.cogs / ((t.beg + t.end) / 2) : 0;
      var daysOnHand = turnover > 0 ? 365 / turnover : 0;
      return buildResult(
        [{ label: 'Ending inventory', value: formatMoney(t.end), tone: 'positive', help: 'Total inventory after all movements.' }, { label: 'Cost of goods sold', value: formatMoney(t.cogs), tone: 'neutral', help: 'Inventory consumed or sold during the period.' }, { label: 'Inventory turnover', value: formatRatio(turnover), tone: turnover > 4 ? 'positive' : 'warning', help: 'COGS divided by average inventory.' }, { label: 'Days inventory on hand', value: formatDays(daysOnHand), tone: daysOnHand < 90 ? 'positive' : 'warning', help: 'Average days to sell or consume inventory.' }],
        [{ title: 'Beginning inventory', value: formatMoney(t.beg), tone: 'neutral', text: 'Inventory on hand at the start of the period.' }, { title: 'Purchases and production', value: formatMoney(t.purch + t.prod), tone: 'neutral', text: 'Goods purchased or produced during the period.' }, { title: 'Write-downs', value: formatMoney(t.wd), tone: t.wd > 0 ? 'warning' : 'neutral', text: 'Inventory reduced to net realizable value or written off for obsolescence.' }, { title: 'Shrinkage indicator', value: formatPercent(t.beg > 0 ? t.wd / t.beg * 100 : 0, 1), tone: 'neutral', text: 'Write-downs as a percentage of beginning inventory.' }],
        [{ title: 'Ending inventory ties to the balance sheet', text: 'The roll-forward total should match the inventory line on the balance sheet.' }, { title: 'COGS ties to the income statement', text: 'Total cost of goods sold from the roll-forward should reconcile to the income statement.' }, { title: 'Reserve adequacy review', text: 'Evaluate whether write-downs and obsolescence reserves are sufficient given slow-moving or aging stock.' }],
        [{ label: 'Period', value: periodLabel }, { label: 'Categories', value: formatNumber(rollRows.length) }, { label: 'Beginning inventory', value: formatMoney(t.beg) }, { label: 'Purchases', value: formatMoney(t.purch) }, { label: 'Production', value: formatMoney(t.prod) }, { label: 'COGS', value: formatMoney(t.cogs) }, { label: 'Ending inventory', value: formatMoney(t.end) }],
        { columns: [{ key: 'inventoryCategory', label: 'Category' }, { key: 'beginningBalance', label: 'Beginning', align: 'right' }, { key: 'purchases', label: 'Purchases', align: 'right' }, { key: 'production', label: 'Production', align: 'right' }, { key: 'cogs', label: 'COGS', align: 'right' }, { key: 'writeDowns', label: 'Write-downs', align: 'right' }, { key: 'endingBalance', label: 'Ending', align: 'right' }], rows: rollRows.map(function (r) { return { inventoryCategory: r.inventoryCategory, beginningBalance: formatMoney(r.beginningBalance), purchases: formatMoney(r.purchases), production: formatMoney(r.production), cogs: formatMoney(r.cogs), writeDowns: formatMoney(r.writeDowns), endingBalance: formatMoney(r.endingBalance) }; }) },
        rollRows, 'Inventory roll-forward complete.'
      );
    },

    'tax-provision-roll-forward': function (values, rows) {
      var periodLabel = values.periodLabel || 'Current period';
      var items = rows.filter(function (r) { return r.taxComponent && (Number.isFinite(r.beginningBalance) || Number.isFinite(r.currentExpense) || Number.isFinite(r.taxPayments)); });
      if (!items.length) throw new Error('Add at least one tax component row.');
      var rollRows = items.map(function (r) {
        var beg = r.beginningBalance || 0, exp = r.currentExpense || 0, pay = r.taxPayments || 0, def = r.deferredChanges || 0, adj = r.adjustments || 0;
        return { taxComponent: r.taxComponent, beginningBalance: beg, currentExpense: exp, taxPayments: pay, deferredChanges: def, adjustments: adj, endingBalance: beg + exp - pay + def + adj };
      });
      var t = { beg: sum(rollRows.map(function (r) { return r.beginningBalance; })), exp: sum(rollRows.map(function (r) { return r.currentExpense; })), pay: sum(rollRows.map(function (r) { return r.taxPayments; })), def: sum(rollRows.map(function (r) { return r.deferredChanges; })), adj: sum(rollRows.map(function (r) { return r.adjustments; })), end: sum(rollRows.map(function (r) { return r.endingBalance; })) };
      var netExpense = t.exp + t.def;
      return buildResult(
        [{ label: 'Ending tax balance', value: formatMoney(t.end), tone: 'neutral', help: 'Net tax payable or receivable after all activity.' }, { label: 'Total tax expense', value: formatMoney(netExpense), tone: 'neutral', help: 'Current expense plus deferred tax changes.' }, { label: 'Tax payments', value: formatMoney(t.pay), tone: 'positive', help: 'Cash taxes paid during the period.' }, { label: 'Deferred changes', value: formatMoney(t.def), tone: 'neutral', help: 'Net change in deferred tax assets and liabilities.' }],
        [{ title: 'Beginning balance', value: formatMoney(t.beg), tone: 'neutral', text: 'Tax payable or receivable at the start of the period.' }, { title: 'Current tax expense', value: formatMoney(t.exp), tone: 'neutral', text: 'Income tax expense on current period taxable income.' }, { title: 'Cash tax rate', value: formatPercent(netExpense > 0 ? t.pay / netExpense * 100 : 0, 1), tone: 'neutral', text: 'Cash taxes paid relative to total tax expense.' }, { title: 'Net underpayment', value: formatMoney(Math.max(0, t.end)), tone: t.end > 0 ? 'warning' : 'neutral', text: 'Remaining tax liability suggests an underpayment or timing difference.' }],
        [{ title: 'Reconcile to the ASC 740 provision', text: 'This schedule supports the tax provision by connecting opening and closing tax balances.' }, { title: 'Deferred items need a rate reconciliation', text: 'Changes in deferred taxes should tie to the effective tax rate reconciliation.' }, { title: 'Uncertain tax positions', text: 'Consider whether any adjustments relate to FIN 48 uncertain tax positions requiring disclosure.' }],
        [{ label: 'Period', value: periodLabel }, { label: 'Components', value: formatNumber(rollRows.length) }, { label: 'Beginning balance', value: formatMoney(t.beg) }, { label: 'Current expense', value: formatMoney(t.exp) }, { label: 'Tax payments', value: formatMoney(t.pay) }, { label: 'Deferred changes', value: formatMoney(t.def) }, { label: 'Ending balance', value: formatMoney(t.end) }],
        { columns: [{ key: 'taxComponent', label: 'Component' }, { key: 'beginningBalance', label: 'Beginning', align: 'right' }, { key: 'currentExpense', label: 'Expense', align: 'right' }, { key: 'taxPayments', label: 'Payments', align: 'right' }, { key: 'deferredChanges', label: 'Deferred', align: 'right' }, { key: 'adjustments', label: 'Adjustments', align: 'right' }, { key: 'endingBalance', label: 'Ending', align: 'right' }], rows: rollRows.map(function (r) { return { taxComponent: r.taxComponent, beginningBalance: formatMoney(r.beginningBalance), currentExpense: formatMoney(r.currentExpense), taxPayments: formatMoney(r.taxPayments), deferredChanges: formatMoney(r.deferredChanges), adjustments: formatMoney(r.adjustments), endingBalance: formatMoney(r.endingBalance) }; }) },
        rollRows, 'Tax provision roll-forward complete.'
      );
    },

    'allowance-doubtful-accounts-roll-forward': function (values, rows) {
      var periodLabel = values.periodLabel || 'Current period';
      var items = rows.filter(function (r) { return r.agingBucket && (Number.isFinite(r.beginningBalance) || Number.isFinite(r.badDebtExpense) || Number.isFinite(r.writeOffs)); });
      if (!items.length) throw new Error('Add at least one aging bucket row.');
      var rollRows = items.map(function (r) {
        var beg = r.beginningBalance || 0, bde = r.badDebtExpense || 0, wo = r.writeOffs || 0, rec = r.recoveries || 0, adj = r.adjustments || 0;
        return { agingBucket: r.agingBucket, beginningBalance: beg, badDebtExpense: bde, writeOffs: wo, recoveries: rec, adjustments: adj, endingBalance: beg + bde - wo + rec + adj };
      });
      var t = { beg: sum(rollRows.map(function (r) { return r.beginningBalance; })), bde: sum(rollRows.map(function (r) { return r.badDebtExpense; })), wo: sum(rollRows.map(function (r) { return r.writeOffs; })), rec: sum(rollRows.map(function (r) { return r.recoveries; })), adj: sum(rollRows.map(function (r) { return r.adjustments; })), end: sum(rollRows.map(function (r) { return r.endingBalance; })) };
      var coverageChange = t.end - t.beg;
      return buildResult(
        [{ label: 'Ending allowance', value: formatMoney(t.end), tone: 'positive', help: 'Total allowance for doubtful accounts after all activity.' }, { label: 'Bad debt expense', value: formatMoney(t.bde), tone: 'neutral', help: 'Provision charged to expense during the period.' }, { label: 'Net write-offs', value: formatMoney(t.wo - t.rec), tone: t.wo > t.bde ? 'warning' : 'neutral', help: 'Write-offs less recoveries during the period.' }, { label: 'Coverage change', value: formatMoney(coverageChange), tone: coverageChange >= 0 ? 'positive' : 'warning', help: 'Change in allowance balance from beginning to end.' }],
        [{ title: 'Beginning allowance', value: formatMoney(t.beg), tone: 'neutral', text: 'Allowance balance at the start of the period.' }, { title: 'Write-offs processed', value: formatMoney(t.wo), tone: t.wo > 0 ? 'warning' : 'neutral', text: 'Specific receivables written off against the allowance.' }, { title: 'Recoveries', value: formatMoney(t.rec), tone: t.rec > 0 ? 'positive' : 'neutral', text: 'Previously written-off amounts recovered during the period.' }, { title: 'Expense adequacy', value: t.bde >= t.wo ? 'Adequate' : 'Under-provided', tone: t.bde >= t.wo ? 'positive' : 'warning', text: 'Whether bad debt expense covers write-off activity.' }],
        [{ title: 'CECL requires expected credit losses', text: 'Under ASC 326, the allowance reflects expected lifetime losses, not just incurred losses.' }, { title: 'Aging percentages drive the estimate', text: 'Historical loss rates applied to aging buckets form the basis of most allowance calculations.' }, { title: 'Write-offs need proper authorization', text: 'Each write-off should follow a documented approval process before reducing the allowance.' }],
        [{ label: 'Period', value: periodLabel }, { label: 'Buckets', value: formatNumber(rollRows.length) }, { label: 'Beginning allowance', value: formatMoney(t.beg) }, { label: 'Bad debt expense', value: formatMoney(t.bde) }, { label: 'Write-offs', value: formatMoney(t.wo) }, { label: 'Recoveries', value: formatMoney(t.rec) }, { label: 'Ending allowance', value: formatMoney(t.end) }],
        { columns: [{ key: 'agingBucket', label: 'Bucket' }, { key: 'beginningBalance', label: 'Beginning', align: 'right' }, { key: 'badDebtExpense', label: 'Expense', align: 'right' }, { key: 'writeOffs', label: 'Write-offs', align: 'right' }, { key: 'recoveries', label: 'Recoveries', align: 'right' }, { key: 'adjustments', label: 'Adjustments', align: 'right' }, { key: 'endingBalance', label: 'Ending', align: 'right' }], rows: rollRows.map(function (r) { return { agingBucket: r.agingBucket, beginningBalance: formatMoney(r.beginningBalance), badDebtExpense: formatMoney(r.badDebtExpense), writeOffs: formatMoney(r.writeOffs), recoveries: formatMoney(r.recoveries), adjustments: formatMoney(r.adjustments), endingBalance: formatMoney(r.endingBalance) }; }) },
        rollRows, 'Allowance for doubtful accounts roll-forward complete.'
      );
    },

    'paycheck-tax-estimator': function (values) {
      var salary = values.annualSalary; if (!(salary > 0)) throw new Error('Enter an annual salary.');
      var status = values.filingStatus || 'single', freq = values.payFrequency || 'biweekly', preTax = values.preTaxDeductions || 0, addlWith = values.additionalWithholding || 0;
      var periods = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }; var pp = periods[freq] || 26;
      var taxable = Math.max(0, salary - preTax);
      var stdDed = { single: 15700, married_joint: 31400, married_separate: 15700, head_of_household: 23600 }; var sd = stdDed[status] || 15700;
      var fedTaxable = Math.max(0, taxable - sd);
      var brackets = status === 'married_joint' ? [[23200, 0.10], [71000, 0.12], [100000, 0.22], [190000, 0.24], [243700, 0.32], [365600, 0.35], [Infinity, 0.37]] : status === 'head_of_household' ? [[16550, 0.10], [47500, 0.12], [60000, 0.22], [95000, 0.24], [121900, 0.32], [182800, 0.35], [Infinity, 0.37]] : [[11600, 0.10], [47150, 0.12], [100525, 0.22], [191950, 0.24], [243725, 0.32], [609350, 0.35], [Infinity, 0.37]];
      var fedTax = 0, prev = 0; brackets.forEach(function (b) { var top = Math.min(fedTaxable, b[0]); if (top > prev) { fedTax += (top - prev) * b[1]; prev = top; } });
      var ssWage = Math.min(taxable, 168600), ssTax = ssWage * 0.062, mediTax = taxable * 0.0145, addlMedi = Math.max(0, taxable - 200000) * 0.009;
      var fica = ssTax + mediTax + addlMedi; var totalFed = fedTax + fica;
      var estStateTax = taxable * 0.05; var totalTax = totalFed + estStateTax + addlWith * pp;
      var netAnnual = salary - totalTax - preTax, netPer = netAnnual / pp;
      var etr = salary > 0 ? totalTax / salary * 100 : 0;
      return buildResult(
        [{ label: 'Estimated net pay per period', value: formatMoney(netPer), tone: 'positive', help: 'Take-home pay after all estimated taxes and deductions.' }, { label: 'Federal income tax', value: formatMoney(fedTax), tone: 'neutral', help: 'Estimated annual federal income tax.' }, { label: 'Total FICA', value: formatMoney(fica), tone: 'neutral', help: 'Social Security plus Medicare taxes.' }, { label: 'Effective tax rate', value: formatPercent(etr, 1), tone: 'neutral', help: 'Total estimated taxes as a percentage of gross salary.' }],
        [{ title: 'Pay periods per year', value: formatNumber(pp), tone: 'neutral', text: 'Number of paychecks based on selected frequency.' }, { title: 'Standard deduction', value: formatMoney(sd), tone: 'neutral', text: 'Estimated standard deduction for the selected filing status.' }, { title: 'Federal taxable income', value: formatMoney(fedTaxable), tone: 'neutral', text: 'Income subject to federal income tax after standard deduction.' }, { title: 'State tax estimate', value: formatMoney(estStateTax), tone: 'warning', text: 'Rough 5% state tax estimate. Actual rates vary by state.' }],
        [{ title: 'This is an estimate only', text: 'Actual taxes depend on your complete tax situation including itemized deductions, credits, and state-specific rules.' }, { title: 'Pre-tax deductions reduce taxable income', text: 'Contributions to 401k, HSA, and other pre-tax benefits lower your federal and state taxable income.' }, { title: 'Review your actual W-2', text: 'Compare this estimate to your W-2 at year end to see if withholding adjustments are needed.' }],
        [{ label: 'Annual salary', value: formatMoney(salary) }, { label: 'Filing status', value: status.replace(/_/g, ' ') }, { label: 'Pay frequency', value: freq }, { label: 'Pre-tax deductions', value: formatMoney(preTax) }, { label: 'Federal income tax', value: formatMoney(fedTax) }, { label: 'FICA', value: formatMoney(fica) }, { label: 'Net annual pay', value: formatMoney(netAnnual) }, { label: 'Net per period', value: formatMoney(netPer) }],
        { columns: [{ key: 'item', label: 'Item' }, { key: 'annual', label: 'Annual', align: 'right' }, { key: 'perPeriod', label: 'Per period', align: 'right' }], rows: [{ item: 'Gross salary', annual: formatMoney(salary), perPeriod: formatMoney(salary / pp) }, { item: 'Pre-tax deductions', annual: formatMoney(preTax), perPeriod: formatMoney(preTax / pp) }, { item: 'Federal income tax', annual: formatMoney(fedTax), perPeriod: formatMoney(fedTax / pp) }, { item: 'Social Security', annual: formatMoney(ssTax), perPeriod: formatMoney(ssTax / pp) }, { item: 'Medicare', annual: formatMoney(mediTax + addlMedi), perPeriod: formatMoney((mediTax + addlMedi) / pp) }, { item: 'State tax estimate', annual: formatMoney(estStateTax), perPeriod: formatMoney(estStateTax / pp) }, { item: 'Additional withholding', annual: formatMoney(addlWith * pp), perPeriod: formatMoney(addlWith) }, { item: 'Net take-home pay', annual: formatMoney(netAnnual), perPeriod: formatMoney(netPer) }] },
        [{ Item: 'Gross salary', Annual: Math.round(salary), 'Per period': Math.round(salary / pp) }, { Item: 'Federal tax', Annual: Math.round(fedTax), 'Per period': Math.round(fedTax / pp) }, { Item: 'FICA', Annual: Math.round(fica), 'Per period': Math.round(fica / pp) }, { Item: 'Net pay', Annual: Math.round(netAnnual), 'Per period': Math.round(netPer) }],
        'Paycheck tax estimate complete.'
      );
    },

    'w4-allowance-calculator': function (values) {
      var status = values.filingStatus || 'single', income = values.annualIncome || 0, spouse = values.spouseIncome || 0, deps = values.dependents || 0, other = values.otherIncome || 0, deductions = values.deductions || 0, addl = values.additionalWithholding || 0;
      if (!(income > 0)) throw new Error('Enter your annual income.');
      var stdDed = { single: 15700, married_joint: 31400, married_separate: 15700, head_of_household: 23600 }; var sd = stdDed[status] || 15700;
      var totalIncome = income + spouse + other; var adjDeductions = Math.max(0, deductions - sd);
      var depCredit = deps * 2000; var step3 = depCredit;
      var step4a = other; var step4b = adjDeductions > 0 ? adjDeductions : 0; var step4c = addl;
      return buildResult(
        [{ label: 'Step 3: Dependents credit', value: formatMoney(step3), tone: step3 > 0 ? 'positive' : 'neutral', help: 'Total dependent tax credits to claim on your W-4.' }, { label: 'Step 4a: Other income', value: formatMoney(step4a), tone: 'neutral', help: 'Other income to include for withholding accuracy.' }, { label: 'Step 4b: Deductions', value: formatMoney(step4b), tone: step4b > 0 ? 'positive' : 'neutral', help: 'Excess deductions above the standard deduction.' }, { label: 'Step 4c: Extra withholding', value: formatMoney(step4c), tone: 'neutral', help: 'Additional per-period withholding amount.' }],
        [{ title: 'Filing status', value: status.replace(/_/g, ' '), tone: 'neutral', text: 'Determines your standard deduction and tax bracket thresholds.' }, { title: 'Standard deduction', value: formatMoney(sd), tone: 'neutral', text: 'Standard deduction for your filing status.' }, { title: 'Combined household income', value: formatMoney(totalIncome), tone: 'neutral', text: 'Your income plus spouse income plus other income.' }, { title: 'Number of dependents', value: formatNumber(deps), tone: 'neutral', text: 'Each qualifying dependent reduces withholding by approximately $2,000 per year.' }],
        [{ title: 'Review after major life changes', text: 'Marriage, divorce, a new child, or a job change all affect your W-4.' }, { title: 'Two earners should use the IRS worksheet', text: 'If you and your spouse both work, the multiple-jobs worksheet prevents under-withholding.' }, { title: 'Check your refund or balance due', text: 'If you got a large refund or owed a lot, adjust your W-4 for more accurate withholding.' }],
        [{ label: 'Filing status', value: status.replace(/_/g, ' ') }, { label: 'Annual income', value: formatMoney(income) }, { label: 'Spouse income', value: formatMoney(spouse) }, { label: 'Number of dependents', value: formatNumber(deps) }, { label: 'Dependent credit', value: formatMoney(step3) }, { label: 'Other income', value: formatMoney(step4a) }, { label: 'Extra deductions', value: formatMoney(step4b) }, { label: 'Additional withholding', value: formatMoney(step4c) }],
        { columns: [{ key: 'step', label: 'W-4 Step' }, { key: 'value', label: 'Amount', align: 'right' }, { key: 'note', label: 'What to enter' }], rows: [{ step: 'Step 1: Filing status', value: status.replace(/_/g, ' '), note: 'Check the box matching your filing status.' }, { step: 'Step 3: Dependents', value: formatMoney(step3), note: 'Multiply qualifying dependents by $2,000 and enter total.' }, { step: 'Step 4a: Other income', value: formatMoney(step4a), note: 'Income from other sources not subject to withholding.' }, { step: 'Step 4b: Deductions', value: formatMoney(step4b), note: 'Enter only the amount that exceeds the standard deduction.' }, { step: 'Step 4c: Extra withholding', value: formatMoney(step4c), note: 'Additional per-paycheck withholding.' }] },
        [{ Step: '3 Dependents', Amount: Math.round(step3) }, { Step: '4a Other income', Amount: Math.round(step4a) }, { Step: '4b Deductions', Amount: Math.round(step4b) }, { Step: '4c Extra', Amount: Math.round(step4c) }],
        'W-4 allowance estimate complete.'
      );
    },

    'roth-vs-traditional-ira-calculator': function (values) {
      var contrib = values.annualContribution; if (!(contrib > 0)) throw new Error('Enter an annual contribution amount.');
      var curAge = values.currentAge || 30, retAge = values.retirementAge || 65, curRate = values.currentTaxRate || 24, retRate = values.retirementTaxRate || 22, ret = values.expectedReturn || 7;
      var curTrad = values.currentTraditionalBalance || 0, curRoth = values.currentRothBalance || 0;
      var years = Math.max(1, retAge - curAge); var r = ret / 100;
      var fv = function (pv, annual, rate, n) { var total = pv; for (var i = 0; i < n; i++) { total = total * (1 + rate) + annual; } return total; };
      var tradFV = fv(curTrad, contrib, r, years); var tradAfterTax = tradFV * (1 - retRate / 100);
      var rothContrib = contrib * (1 - curRate / 100); var rothFV = fv(curRoth, rothContrib, r, years);
      var taxSaved = contrib * years * curRate / 100; var taxPaidRoth = (contrib - rothContrib) * years;
      var better = tradAfterTax > rothFV ? 'Traditional IRA' : 'Roth IRA'; var gap = Math.abs(tradAfterTax - rothFV);
      return buildResult(
        [{ label: 'Better option', value: better, tone: 'positive', help: 'Which account provides more after-tax retirement wealth.' }, { label: 'Traditional after-tax value', value: formatMoney(tradAfterTax), tone: better === 'Traditional IRA' ? 'positive' : 'neutral', help: 'Traditional IRA balance after taxes on withdrawal.' }, { label: 'Roth retirement value', value: formatMoney(rothFV), tone: better === 'Roth IRA' ? 'positive' : 'neutral', help: 'Roth IRA balance at retirement, all tax-free.' }, { label: 'Advantage gap', value: formatMoney(gap), tone: 'neutral', help: 'Dollar difference between the two strategies.' }],
        [{ title: 'Years to retirement', value: formatNumber(years), tone: 'neutral', text: 'Investment horizon from current age to retirement age.' }, { title: 'Traditional pre-tax FV', value: formatMoney(tradFV), tone: 'neutral', text: 'Future value before retirement withdrawals are taxed.' }, { title: 'Tax savings from Traditional', value: formatMoney(taxSaved), tone: 'positive', text: 'Total upfront tax deductions from Traditional IRA contributions.' }, { title: 'Tax rate differential', value: (curRate - retRate) + ' pts', tone: curRate > retRate ? 'positive' : curRate < retRate ? 'warning' : 'neutral', text: 'If your rate drops in retirement, Traditional tends to win.' }],
        [{ title: 'Tax rates drive the decision', text: 'If you expect a lower tax rate in retirement, Traditional usually wins. If higher, Roth wins.' }, { title: 'Roth has no RMDs', text: 'Roth IRAs have no required minimum distributions, providing more flexibility in retirement.' }, { title: 'Consider doing both', text: 'Many advisors recommend having both Traditional and Roth accounts for tax diversification in retirement.' }],
        [{ label: 'Annual contribution', value: formatMoney(contrib) }, { label: 'Current tax rate', value: formatPercent(curRate, 0) }, { label: 'Retirement tax rate', value: formatPercent(retRate, 0) }, { label: 'Expected return', value: formatPercent(ret, 1) }, { label: 'Years to retirement', value: formatNumber(years) }, { label: 'Traditional FV', value: formatMoney(tradFV) }, { label: 'Roth FV', value: formatMoney(rothFV) }, { label: 'Advantage', value: better + ' by ' + formatMoney(gap) }],
        null, [{ Strategy: 'Traditional', 'Before-tax FV': Math.round(tradFV), 'After-tax value': Math.round(tradAfterTax) }, { Strategy: 'Roth', 'Before-tax FV': Math.round(rothFV), 'After-tax value': Math.round(rothFV) }],
        'Roth vs Traditional comparison complete.'
      );
    },

    'emergency-fund-calculator': function (values) {
      var expenses = values.monthlyExpenses; if (!(expenses > 0)) throw new Error('Enter your monthly expenses.');
      var income = values.monthlyIncome || 0, savings = values.currentSavings || 0, target = values.targetMonths || 6, rate = values.savingsRate || 0, deps = values.dependents || 0, stability = values.jobStability || 'moderate';
      var recommended = stability === 'unstable' ? Math.max(target, 9) : stability === 'stable' ? Math.max(target, 3) : Math.max(target, 6);
      recommended = recommended + Math.min(deps, 4);
      var goalAmount = expenses * recommended; var gap = Math.max(0, goalAmount - savings); var covered = expenses > 0 ? savings / expenses : 0;
      var monthlySaving = income > 0 && rate > 0 ? income * rate / 100 : 0; var monthsToGoal = monthlySaving > 0 ? Math.ceil(gap / monthlySaving) : 0;
      return buildResult(
        [{ label: 'Recommended fund size', value: formatMoney(goalAmount), tone: 'positive', help: recommended + ' months of expenses based on your situation.' }, { label: 'Current coverage', value: formatMonths(covered), tone: covered >= recommended ? 'positive' : 'warning', help: 'How many months your current savings would cover.' }, { label: 'Gap to fill', value: formatMoney(gap), tone: gap > 0 ? 'warning' : 'positive', help: 'Amount still needed to reach the recommended target.' }, { label: 'Months to reach goal', value: monthsToGoal > 0 ? formatNumber(monthsToGoal) + ' months' : 'Set a savings rate', tone: monthsToGoal > 0 && monthsToGoal <= 24 ? 'positive' : 'warning', help: 'Estimated time to fill the gap at your current savings rate.' }],
        [{ title: 'Monthly expenses', value: formatMoney(expenses), tone: 'neutral', text: 'Your baseline monthly spending that the fund needs to cover.' }, { title: 'Recommended months', value: formatNumber(recommended), tone: 'neutral', text: 'Adjusted for job stability, dependents, and target preference.' }, { title: 'Job stability factor', value: stability, tone: stability === 'unstable' ? 'warning' : 'neutral', text: 'Less stable employment warrants a larger emergency fund.' }, { title: 'Dependents adjustment', value: '+' + formatNumber(Math.min(deps, 4)) + ' months', tone: 'neutral', text: 'Additional months recommended per dependent.' }],
        [{ title: 'Keep it liquid and accessible', text: 'Emergency funds should be in high-yield savings or money market accounts, not invested in volatile assets.' }, { title: 'Automate your savings', text: 'Set up automatic transfers to build the fund consistently without relying on willpower.' }, { title: 'Reassess annually', text: 'Review your emergency fund target when expenses, income, or life circumstances change.' }],
        [{ label: 'Monthly expenses', value: formatMoney(expenses) }, { label: 'Current savings', value: formatMoney(savings) }, { label: 'Target months', value: formatNumber(recommended) }, { label: 'Goal amount', value: formatMoney(goalAmount) }, { label: 'Gap', value: formatMoney(gap) }, { label: 'Monthly savings', value: formatMoney(monthlySaving) }, { label: 'Months to goal', value: monthsToGoal > 0 ? formatNumber(monthsToGoal) : 'N/A' }],
        null, [{ Metric: 'Goal amount', Value: Math.round(goalAmount) }, { Metric: 'Current savings', Value: Math.round(savings) }, { Metric: 'Gap', Value: Math.round(gap) }, { Metric: 'Months to goal', Value: monthsToGoal }],
        'Emergency fund calculation complete.'
      );
    },

    'debt-avalanche-vs-snowball': function (values, rows) {
      var debts = rows.filter(function (r) { return r.debtName && Number.isFinite(r.balance) && r.balance > 0; });
      if (!debts.length) throw new Error('Add at least one debt with a name and balance.');
      var extra = values.extraMonthlyPayment || 0;
      function simulate(sorted) {
        var list = sorted.map(function (d) { return { name: d.debtName, bal: d.balance, rate: (d.interestRate || 0) / 100 / 12, min: d.minimumPayment || 0 }; });
        var totalInterest = 0, months = 0, maxMonths = 600;
        while (list.some(function (d) { return d.bal > 0.01; }) && months < maxMonths) {
          months++; var extraLeft = extra;
          list.forEach(function (d) { if (d.bal <= 0) return; var interest = d.bal * d.rate; totalInterest += interest; d.bal += interest; var pay = Math.min(d.bal, d.min); d.bal -= pay; });
          for (var i = 0; i < list.length; i++) { if (list[i].bal <= 0 || extraLeft <= 0) continue; var ep = Math.min(list[i].bal, extraLeft); list[i].bal -= ep; extraLeft -= ep; if (list[i].bal <= 0.01) list[i].bal = 0; }
        }
        return { months: months, interest: totalInterest };
      }
      var avalanche = debts.slice().sort(function (a, b) { return (b.interestRate || 0) - (a.interestRate || 0); });
      var snowball = debts.slice().sort(function (a, b) { return (a.balance || 0) - (b.balance || 0); });
      var avRes = simulate(avalanche), sbRes = simulate(snowball);
      var totalDebt = sum(debts.map(function (d) { return d.balance; }));
      var totalMin = sum(debts.map(function (d) { return d.minimumPayment || 0; }));
      var saved = sbRes.interest - avRes.interest; var fasterBy = sbRes.months - avRes.months;
      return buildResult(
        [{ label: 'Avalanche total interest', value: formatMoney(avRes.interest), tone: 'positive', help: 'Total interest paid using the highest-rate-first strategy.' }, { label: 'Snowball total interest', value: formatMoney(sbRes.interest), tone: 'neutral', help: 'Total interest paid using the smallest-balance-first strategy.' }, { label: 'Interest savings (avalanche)', value: formatMoney(saved), tone: saved > 0 ? 'positive' : 'neutral', help: 'How much less interest you pay with avalanche vs snowball.' }, { label: 'Avalanche payoff time', value: formatNumber(avRes.months) + ' months', tone: 'neutral', help: 'Total months to become debt-free using avalanche.' }],
        [{ title: 'Total debt', value: formatMoney(totalDebt), tone: 'neutral', text: 'Combined balance across all debts.' }, { title: 'Monthly minimum', value: formatMoney(totalMin), tone: 'neutral', text: 'Sum of all minimum payments.' }, { title: 'Extra payment', value: formatMoney(extra), tone: extra > 0 ? 'positive' : 'warning', text: 'Additional monthly amount applied to the target debt.' }, { title: 'Faster payoff', value: fasterBy > 0 ? fasterBy + ' months faster (avalanche)' : fasterBy < 0 ? Math.abs(fasterBy) + ' months faster (snowball)' : 'Same timeline', tone: 'neutral', text: 'Time difference between the two strategies.' }],
        [{ title: 'Avalanche saves more money', text: 'Paying highest interest first minimizes total interest cost but may take longer to eliminate the first debt.' }, { title: 'Snowball builds momentum', text: 'Paying smallest balance first gives quicker wins which helps maintain motivation.' }, { title: 'Both beat minimums only', text: 'Either strategy with extra payments is dramatically better than paying only minimums.' }],
        [{ label: 'Total debt', value: formatMoney(totalDebt) }, { label: 'Number of debts', value: formatNumber(debts.length) }, { label: 'Extra monthly payment', value: formatMoney(extra) }, { label: 'Avalanche months', value: formatNumber(avRes.months) }, { label: 'Snowball months', value: formatNumber(sbRes.months) }, { label: 'Avalanche interest', value: formatMoney(avRes.interest) }, { label: 'Snowball interest', value: formatMoney(sbRes.interest) }],
        { columns: [{ key: 'metric', label: 'Comparison' }, { key: 'avalanche', label: 'Avalanche', align: 'right' }, { key: 'snowball', label: 'Snowball', align: 'right' }], rows: [{ metric: 'Payoff time', avalanche: avRes.months + ' months', snowball: sbRes.months + ' months' }, { metric: 'Total interest paid', avalanche: formatMoney(avRes.interest), snowball: formatMoney(sbRes.interest) }, { metric: 'Strategy', avalanche: 'Highest rate first', snowball: 'Smallest balance first' }] },
        [{ Strategy: 'Avalanche', Months: avRes.months, 'Total interest': Math.round(avRes.interest) }, { Strategy: 'Snowball', Months: sbRes.months, 'Total interest': Math.round(sbRes.interest) }],
        'Debt comparison complete.'
      );
    },

    'net-worth-tracker': function (values, rows) {
      var items = rows.filter(function (r) { return r.itemName && Number.isFinite(r.value); });
      if (!items.length) throw new Error('Add at least one asset or liability row.');
      var assets = items.filter(function (r) { return r.category === 'asset'; });
      var liabilities = items.filter(function (r) { return r.category === 'liability'; });
      var totalAssets = sum(assets.map(function (r) { return r.value; }));
      var totalLiabilities = sum(liabilities.map(function (r) { return r.value; }));
      var netWorth = totalAssets - totalLiabilities;
      var debtToAsset = totalAssets > 0 ? totalLiabilities / totalAssets * 100 : 0;
      var rollRows = items.map(function (r) { return { itemName: r.itemName, category: r.category, value: r.value, impact: r.category === 'asset' ? r.value : -r.value }; });
      return buildResult(
        [{ label: 'Net worth', value: formatMoney(netWorth), tone: netWorth >= 0 ? 'positive' : 'warning', help: 'Total assets minus total liabilities.' }, { label: 'Total assets', value: formatMoney(totalAssets), tone: 'positive', help: 'Sum of all asset values.' }, { label: 'Total liabilities', value: formatMoney(totalLiabilities), tone: 'neutral', help: 'Sum of all liability balances.' }, { label: 'Debt-to-asset ratio', value: formatPercent(debtToAsset, 1), tone: debtToAsset > 50 ? 'warning' : 'positive', help: 'Total liabilities divided by total assets.' }],
        [{ title: 'Asset count', value: formatNumber(assets.length), tone: 'neutral', text: 'Number of asset items entered.' }, { title: 'Liability count', value: formatNumber(liabilities.length), tone: 'neutral', text: 'Number of liability items entered.' }, { title: 'Largest asset', value: assets.length ? assets.sort(function (a, b) { return b.value - a.value; })[0].itemName : 'None', tone: 'neutral', text: 'Your single largest asset by value.' }, { title: 'Largest liability', value: liabilities.length ? liabilities.sort(function (a, b) { return b.value - a.value; })[0].itemName : 'None', tone: 'neutral', text: 'Your single largest liability by value.' }],
        [{ title: 'Track net worth over time', text: 'Calculating net worth monthly or quarterly shows whether you are building wealth or taking on more debt.' }, { title: 'Use market values', text: 'Enter current market values for assets like real estate and investments, not original purchase prices.' }, { title: 'Include all debts', text: 'Do not forget credit cards, student loans, personal loans, and any other outstanding obligations.' }],
        [{ label: 'Total assets', value: formatMoney(totalAssets) }, { label: 'Total liabilities', value: formatMoney(totalLiabilities) }, { label: 'Net worth', value: formatMoney(netWorth) }, { label: 'Asset items', value: formatNumber(assets.length) }, { label: 'Liability items', value: formatNumber(liabilities.length) }, { label: 'Debt-to-asset ratio', value: formatPercent(debtToAsset, 1) }],
        { columns: [{ key: 'itemName', label: 'Item' }, { key: 'category', label: 'Type' }, { key: 'value', label: 'Value', align: 'right' }, { key: 'impact', label: 'Net worth impact', align: 'right' }], rows: rollRows.map(function (r) { return { itemName: r.itemName, category: r.category === 'asset' ? 'Asset' : 'Liability', value: formatMoney(r.value), impact: formatMoney(r.impact) }; }) },
        rollRows, 'Net worth calculation complete.'
      );
    },

    'fire-number-calculator': function (values) {
      var expenses = values.annualExpenses; if (!(expenses > 0)) throw new Error('Enter your annual expenses.');
      var swr = values.safeWithdrawalRate || 4, savings = values.currentSavings || 0, annual = values.annualSavings || 0, ret = values.expectedReturn || 7, curAge = values.currentAge || 30, targetAge = values.targetRetirementAge || 0;
      var fireNumber = expenses / (swr / 100); var gap = Math.max(0, fireNumber - savings);
      var r = ret / 100; var yearsToFire = 0;
      if (annual > 0 && r > 0) { var bal = savings; while (bal < fireNumber && yearsToFire < 100) { bal = bal * (1 + r) + annual; yearsToFire++; } }
      else if (annual > 0) { yearsToFire = Math.ceil(gap / annual); }
      var fireAge = curAge + yearsToFire;
      var leanFire = expenses * 0.6 / (swr / 100); var fatFire = expenses * 1.5 / (swr / 100);
      var progress = fireNumber > 0 ? savings / fireNumber * 100 : 0;
      return buildResult(
        [{ label: 'FIRE number', value: formatMoney(fireNumber), tone: 'positive', help: 'Portfolio needed to cover expenses at ' + formatPercent(swr, 1) + ' withdrawal rate.' }, { label: 'Years to FIRE', value: yearsToFire > 0 ? formatNumber(yearsToFire) + ' years' : 'N/A', tone: yearsToFire > 0 && yearsToFire <= 20 ? 'positive' : 'warning', help: 'Estimated years to reach your FIRE number.' }, { label: 'FIRE age', value: yearsToFire > 0 ? formatNumber(fireAge) : 'N/A', tone: 'neutral', help: 'Age when you could reach financial independence.' }, { label: 'Progress', value: formatPercent(progress, 1), tone: progress > 50 ? 'positive' : 'neutral', help: 'Current savings as a percentage of your FIRE number.' }],
        [{ title: 'Current savings', value: formatMoney(savings), tone: 'neutral', text: 'Your current invested portfolio balance.' }, { title: 'Annual savings', value: formatMoney(annual), tone: annual > 0 ? 'positive' : 'warning', text: 'Amount you save and invest each year.' }, { title: 'Lean FIRE target', value: formatMoney(leanFire), tone: 'neutral', text: 'FIRE number based on 60% of current expenses.' }, { title: 'Fat FIRE target', value: formatMoney(fatFire), tone: 'neutral', text: 'FIRE number based on 150% of current expenses.' }],
        [{ title: 'The 4% rule is a guideline', text: 'The Trinity Study suggests 4% withdrawal rate for a 30-year retirement. Adjust for longer horizons.' }, { title: 'Sequence of returns risk', text: 'Poor market returns in early retirement can deplete a portfolio faster than average returns suggest.' }, { title: 'Healthcare is a major factor', text: 'Before Medicare eligibility at 65, health insurance is a significant expense for early retirees.' }],
        [{ label: 'Annual expenses', value: formatMoney(expenses) }, { label: 'Safe withdrawal rate', value: formatPercent(swr, 1) }, { label: 'FIRE number', value: formatMoney(fireNumber) }, { label: 'Current savings', value: formatMoney(savings) }, { label: 'Annual savings', value: formatMoney(annual) }, { label: 'Expected return', value: formatPercent(ret, 1) }, { label: 'Years to FIRE', value: yearsToFire > 0 ? formatNumber(yearsToFire) : 'N/A' }, { label: 'FIRE age', value: yearsToFire > 0 ? formatNumber(fireAge) : 'N/A' }],
        null, [{ Metric: 'FIRE number', Value: Math.round(fireNumber) }, { Metric: 'Years to FIRE', Value: yearsToFire }, { Metric: 'Progress percent', Value: Math.round(progress) }],
        'FIRE calculation complete.'
      );
    },

    'social-security-benefit-estimator': function (values) {
      var earnings = values.averageAnnualEarnings; if (!(earnings > 0)) throw new Error('Enter your average annual earnings.');
      var curAge = values.currentAge || 45, birthYear = values.birthYear || 1981, yearsWorked = values.yearsWorked || 20, claimAge = values.earlyClaimAge || 67, cola = values.expectedCOLA || 2.5;
      var fra = birthYear <= 1954 ? 66 : birthYear >= 1960 ? 67 : 66 + (birthYear - 1954) / 6;
      var aime = Math.min(earnings, 168600) / 12;
      var pia = 0; if (aime <= 1174) { pia = aime * 0.9; } else if (aime <= 7078) { pia = 1174 * 0.9 + (aime - 1174) * 0.32; } else { pia = 1174 * 0.9 + (7078 - 1174) * 0.32 + (aime - 7078) * 0.15; }
      var coverageYears = Math.min(yearsWorked, 35); var adjFactor = coverageYears / 35;
      pia = pia * adjFactor;
      var monthlyBenefit = pia; if (claimAge < fra) { var earlyMonths = (fra - claimAge) * 12; var reduction = Math.min(earlyMonths, 36) * 5 / 900 + Math.max(0, earlyMonths - 36) * 5 / 1200; monthlyBenefit = pia * (1 - reduction); } else if (claimAge > fra) { var delayMonths = Math.min((claimAge - fra) * 12, 36); monthlyBenefit = pia * (1 + delayMonths * 8 / 1200); }
      var annualBenefit = monthlyBenefit * 12;
      var colaYears = Math.max(0, claimAge - curAge);
      var colaAdj = Math.pow(1 + cola / 100, colaYears);
      var adjMonthly = monthlyBenefit * colaAdj;
      return buildResult(
        [{ label: 'Estimated monthly benefit', value: formatMoney(adjMonthly), tone: 'positive', help: 'Estimated monthly benefit at claim age with COLA adjustment.' }, { label: 'Primary insurance amount', value: formatMoney(pia), tone: 'neutral', help: 'PIA based on your earnings history at full retirement age.' }, { label: 'Full retirement age', value: fra.toFixed(1) + ' years', tone: 'neutral', help: 'Your FRA based on birth year.' }, { label: 'Annual benefit', value: formatMoney(adjMonthly * 12), tone: 'neutral', help: 'Estimated annual benefit at the selected claim age.' }],
        [{ title: 'Claim age', value: formatNumber(claimAge), tone: claimAge < fra ? 'warning' : 'positive', text: claimAge < fra ? 'Claiming before FRA permanently reduces your benefit.' : 'Claiming at or after FRA provides full or enhanced benefits.' }, { title: 'COLA adjustment', value: formatPercent(cola, 1) + '/year', tone: 'neutral', text: 'Assumed annual cost-of-living increase until claim age.' }, { title: 'Coverage years', value: formatNumber(coverageYears) + ' of 35', tone: coverageYears >= 35 ? 'positive' : 'warning', text: 'Social Security uses your highest 35 years of earnings.' }, { title: 'AIME', value: formatMoney(aime), tone: 'neutral', text: 'Average indexed monthly earnings used in the PIA formula.' }],
        [{ title: 'This is an estimate only', text: 'Actual benefits depend on your complete earnings record. Check ssa.gov for an official estimate.' }, { title: 'Delayed claiming increases benefits', text: 'Each year you delay past FRA adds 8% to your benefit, up to age 70.' }, { title: 'Spousal and survivor benefits', text: 'Married individuals may qualify for spousal benefits up to 50% of the higher earner PIA.' }],
        [{ label: 'Average earnings', value: formatMoney(earnings) }, { label: 'Birth year', value: formatNumber(birthYear) }, { label: 'Full retirement age', value: fra.toFixed(1) }, { label: 'Claim age', value: formatNumber(claimAge) }, { label: 'PIA', value: formatMoney(pia) }, { label: 'Monthly benefit (today)', value: formatMoney(monthlyBenefit) }, { label: 'Monthly benefit (COLA adjusted)', value: formatMoney(adjMonthly) }, { label: 'Annual benefit', value: formatMoney(adjMonthly * 12) }],
        null, [{ Metric: 'PIA', Value: Math.round(pia) }, { Metric: 'Monthly benefit', Value: Math.round(adjMonthly) }, { Metric: 'Annual benefit', Value: Math.round(adjMonthly * 12) }],
        'Social Security estimate complete.'
      );
    },

    'student-loan-payoff-planner': function (values) {
      var balance = values.totalBalance; if (!(balance > 0)) throw new Error('Enter your total loan balance.');
      var rate = values.interestRate || 5.5, minPay = values.minimumPayment || 0, extra = values.extraPayment || 0;
      if (!(minPay > 0)) { minPay = balance * 0.01 + balance * rate / 100 / 12; }
      var totalPay = minPay + extra; var monthlyRate = rate / 100 / 12;
      function amortize(bal, pay, mr) { var total = 0, interest = 0, months = 0; while (bal > 0.01 && months < 600) { months++; var mi = bal * mr; interest += mi; bal += mi; var p = Math.min(bal, pay); bal -= p; total += p; } return { months: months, interest: interest, total: total }; }
      var minOnly = amortize(balance, minPay, monthlyRate);
      var withExtra = amortize(balance, totalPay, monthlyRate);
      var savedInterest = minOnly.interest - withExtra.interest; var savedMonths = minOnly.months - withExtra.months;
      return buildResult(
        [{ label: 'Payoff time with extra', value: formatNumber(withExtra.months) + ' months', tone: 'positive', help: 'Time to pay off with minimum plus extra payments.' }, { label: 'Interest saved', value: formatMoney(savedInterest), tone: savedInterest > 0 ? 'positive' : 'neutral', help: 'Interest savings from making extra payments.' }, { label: 'Months saved', value: formatNumber(savedMonths), tone: savedMonths > 0 ? 'positive' : 'neutral', help: 'How many months earlier you become debt-free.' }, { label: 'Total cost with extra', value: formatMoney(withExtra.total), tone: 'neutral', help: 'Total amount paid including interest.' }],
        [{ title: 'Minimum-only payoff', value: formatNumber(minOnly.months) + ' months', tone: 'warning', text: 'Time to pay off making only minimum payments.' }, { title: 'Minimum-only interest', value: formatMoney(minOnly.interest), tone: 'warning', text: 'Total interest paid at minimum payments.' }, { title: 'Monthly payment', value: formatMoney(totalPay), tone: 'neutral', text: 'Total monthly payment including extra.' }, { title: 'Effective payoff rate', value: formatPercent(balance > 0 ? (totalPay - balance * monthlyRate) / balance * 100 : 0, 2), tone: 'neutral', text: 'Monthly principal reduction as a percentage of balance.' }],
        [{ title: 'Even small extra payments help', text: 'An extra $50 to $100 per month can save thousands in interest and years of payments.' }, { title: 'Consider refinancing', text: 'If your credit has improved, refinancing at a lower rate can reduce both interest cost and payoff time.' }, { title: 'Check for employer repayment programs', text: 'Some employers offer student loan repayment assistance as a benefit.' }],
        [{ label: 'Total balance', value: formatMoney(balance) }, { label: 'Interest rate', value: formatPercent(rate, 2) }, { label: 'Minimum payment', value: formatMoney(minPay) }, { label: 'Extra payment', value: formatMoney(extra) }, { label: 'Payoff months (min only)', value: formatNumber(minOnly.months) }, { label: 'Payoff months (with extra)', value: formatNumber(withExtra.months) }, { label: 'Interest saved', value: formatMoney(savedInterest) }],
        null, [{ Scenario: 'Minimum only', Months: minOnly.months, 'Total interest': Math.round(minOnly.interest), 'Total paid': Math.round(minOnly.total) }, { Scenario: 'With extra', Months: withExtra.months, 'Total interest': Math.round(withExtra.interest), 'Total paid': Math.round(withExtra.total) }],
        'Student loan payoff plan complete.'
      );
    },

    'home-affordability-calculator': function (values) {
      var income = values.annualIncome; if (!(income > 0)) throw new Error('Enter your annual income.');
      var monthlyDebts = values.monthlyDebts || 0, down = values.downPayment || 0, rate = values.interestRate || 6.75, term = values.loanTerm || 30, taxRate = values.propertyTaxRate || 1.25, insurance = values.homeInsurance || 1500, hoa = values.hoaFees || 0, dtiLimit = values.dtiLimit || 36;
      var monthlyIncome = income / 12; var maxTotalHousing = monthlyIncome * dtiLimit / 100 - monthlyDebts;
      var monthlyRate = rate / 100 / 12; var payments = term * 12;
      var pf = monthlyRate > 0 ? (Math.pow(1 + monthlyRate, payments) - 1) / (monthlyRate * Math.pow(1 + monthlyRate, payments)) : payments;
      var estTaxInsPerMonth = function (price) { return price * taxRate / 100 / 12 + insurance / 12 + hoa; };
      var maxPrice = 100000; for (var i = 0; i < 50; i++) { var piPayment = (maxPrice - down) / pf; var ti = estTaxInsPerMonth(maxPrice); if (piPayment + ti < maxTotalHousing) maxPrice *= 1.1; else maxPrice *= 0.95; }
      maxPrice = Math.round(maxPrice / 1000) * 1000;
      var loanAmount = maxPrice - down; var monthlyPI = loanAmount / pf; var monthlyTI = estTaxInsPerMonth(maxPrice); var totalMonthly = monthlyPI + monthlyTI;
      var frontDTI = totalMonthly / monthlyIncome * 100; var backDTI = (totalMonthly + monthlyDebts) / monthlyIncome * 100;
      var totalInterest = monthlyPI * payments - loanAmount;
      return buildResult(
        [{ label: 'Maximum home price', value: formatMoney(maxPrice), tone: 'positive', help: 'Estimated maximum price based on your income and DTI limit.' }, { label: 'Monthly payment', value: formatMoney(totalMonthly), tone: 'neutral', help: 'Principal, interest, taxes, insurance, and HOA.' }, { label: 'Front-end DTI', value: formatPercent(frontDTI, 1), tone: frontDTI <= 28 ? 'positive' : 'warning', help: 'Housing payment as a percentage of gross monthly income.' }, { label: 'Back-end DTI', value: formatPercent(backDTI, 1), tone: backDTI <= dtiLimit ? 'positive' : 'warning', help: 'Total debt payments as a percentage of gross monthly income.' }],
        [{ title: 'Loan amount', value: formatMoney(loanAmount), tone: 'neutral', text: 'Home price minus your down payment.' }, { title: 'Down payment', value: formatMoney(down) + ' (' + formatPercent(maxPrice > 0 ? down / maxPrice * 100 : 0, 1) + ')', tone: down / maxPrice >= 0.2 ? 'positive' : 'warning', text: 'Less than 20% down typically requires PMI.' }, { title: 'Monthly P&I', value: formatMoney(monthlyPI), tone: 'neutral', text: 'Principal and interest portion of the payment.' }, { title: 'Total interest over life', value: formatMoney(totalInterest), tone: 'neutral', text: 'Total interest paid over the full loan term.' }],
        [{ title: 'The 28/36 rule is a guideline', text: 'Lenders typically want housing costs under 28% and total debt under 36% of gross income.' }, { title: 'Pre-approval is not a spending target', text: 'Being approved for a certain amount does not mean you should spend that much.' }, { title: 'Budget for maintenance', text: 'Plan for 1% to 2% of the home value annually in maintenance and repair costs.' }],
        [{ label: 'Annual income', value: formatMoney(income) }, { label: 'Down payment', value: formatMoney(down) }, { label: 'Interest rate', value: formatPercent(rate, 2) }, { label: 'Loan term', value: formatNumber(term) + ' years' }, { label: 'Max home price', value: formatMoney(maxPrice) }, { label: 'Loan amount', value: formatMoney(loanAmount) }, { label: 'Monthly payment', value: formatMoney(totalMonthly) }, { label: 'Back-end DTI', value: formatPercent(backDTI, 1) }],
        { columns: [{ key: 'item', label: 'Payment component' }, { key: 'monthly', label: 'Monthly', align: 'right' }, { key: 'annual', label: 'Annual', align: 'right' }], rows: [{ item: 'Principal & interest', monthly: formatMoney(monthlyPI), annual: formatMoney(monthlyPI * 12) }, { item: 'Property tax', monthly: formatMoney(maxPrice * taxRate / 100 / 12), annual: formatMoney(maxPrice * taxRate / 100) }, { item: 'Home insurance', monthly: formatMoney(insurance / 12), annual: formatMoney(insurance) }, { item: 'HOA fees', monthly: formatMoney(hoa), annual: formatMoney(hoa * 12) }, { item: 'Total housing cost', monthly: formatMoney(totalMonthly), annual: formatMoney(totalMonthly * 12) }] },
        [{ Component: 'P&I', Monthly: Math.round(monthlyPI), Annual: Math.round(monthlyPI * 12) }, { Component: 'Total', Monthly: Math.round(totalMonthly), Annual: Math.round(totalMonthly * 12) }],
        'Home affordability calculation complete.'
      );
    },

    'prepaid-expense-amortization': function (values) {
      var total = values.prepaidAmount;
      var term = Math.round(values.termMonths);
      var startRaw = String(values.startMonth || '').trim();
      if (!(total > 0)) { throw new Error('Enter a prepaid amount greater than zero.'); }
      if (!(term > 0 && term <= 120)) { throw new Error('Enter a term between 1 and 120 months.'); }
      if (!/^\d{4}-\d{2}$/.test(startRaw)) { throw new Error('Enter a start month in YYYY-MM format.'); }
      var monthly = values.monthlyOverride > 0 ? values.monthlyOverride : total / term;
      var rows = [];
      var exportRows = [];
      var balance = total;
      var startYear = parseInt(startRaw.slice(0, 4), 10);
      var startMonth = parseInt(startRaw.slice(5, 7), 10) - 1;
      for (var i = 0; i < term; i++) {
        var d = new Date(startYear, startMonth + i, 1);
        var label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        var expense = Math.min(monthly, balance);
        var opening = balance;
        balance = Math.max(0, balance - expense);
        rows.push({ month: label, opening: formatMoney(opening), expense: formatMoney(expense), closing: formatMoney(balance) });
        exportRows.push({ Month: label, Opening: Math.round(opening * 100) / 100, Expense: Math.round(expense * 100) / 100, Closing: Math.round(balance * 100) / 100 });
      }
      return buildResult(
        [{ label: 'Total prepaid', value: formatMoney(total) }, { label: 'Monthly expense', value: formatMoney(monthly) }, { label: 'Term', value: formatNumber(term) + ' months' }, { label: 'End balance', value: formatMoney(balance) }],
        [{ title: 'Monthly amortization', value: formatMoney(monthly), tone: 'positive', text: 'Straight-line monthly expense recognition.' }, { title: 'Remaining at end', value: formatMoney(balance), tone: balance > 0.01 ? 'warning' : 'positive', text: 'Any remainder after the schedule.' }, { title: 'Total recognized', value: formatMoney(total - balance), tone: 'positive', text: 'Total expense recognized over the schedule.' }],
        [{ title: 'Amortization method', value: 'Straight-line', tone: 'neutral', text: 'Equal monthly expense recognition over the prepaid term.' }, { title: 'Coverage ratio', value: formatPercent((total - balance) / total * 100, 1), tone: 'positive', text: 'Percentage of prepaid recognized over the schedule.' }],
        [{ title: 'Review timing', text: 'Verify the amortization start date aligns with the service or coverage period, not the payment date.' }, { title: 'Partial-month handling', text: 'If coverage starts mid-month, consider prorating the first and last month.' }],
        { columns: [{ key: 'month', label: 'Month' }, { key: 'opening', label: 'Opening', align: 'right' }, { key: 'expense', label: 'Expense', align: 'right' }, { key: 'closing', label: 'Closing', align: 'right' }], rows: rows },
        exportRows,
        'Prepaid amortization schedule generated for ' + term + ' months.'
      );
    },

    'deferred-revenue-waterfall': function (values) {
      var contract = values.contractValue;
      var term = Math.round(values.termMonths);
      var startRaw = String(values.startMonth || '').trim();
      if (!(contract > 0)) { throw new Error('Enter a contract value greater than zero.'); }
      if (!(term > 0 && term <= 120)) { throw new Error('Enter a term between 1 and 120 months.'); }
      if (!/^\d{4}-\d{2}$/.test(startRaw)) { throw new Error('Enter a start month in YYYY-MM format.'); }
      var monthly = contract / term;
      var rows = [];
      var exportRows = [];
      var deferred = contract;
      var startYear = parseInt(startRaw.slice(0, 4), 10);
      var startMonth = parseInt(startRaw.slice(5, 7), 10) - 1;
      for (var i = 0; i < term; i++) {
        var d = new Date(startYear, startMonth + i, 1);
        var label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        var recognized = Math.min(monthly, deferred);
        var opening = deferred;
        deferred = Math.max(0, deferred - recognized);
        rows.push({ month: label, opening: formatMoney(opening), recognized: formatMoney(recognized), closing: formatMoney(deferred) });
        exportRows.push({ Month: label, 'Opening Deferred': Math.round(opening * 100) / 100, 'Recognized Revenue': Math.round(recognized * 100) / 100, 'Closing Deferred': Math.round(deferred * 100) / 100 });
      }
      return buildResult(
        [{ label: 'Contract value', value: formatMoney(contract) }, { label: 'Monthly recognition', value: formatMoney(monthly) }, { label: 'Term', value: formatNumber(term) + ' months' }, { label: 'Deferred remaining', value: formatMoney(deferred) }],
        [{ title: 'Monthly revenue', value: formatMoney(monthly), tone: 'positive', text: 'Straight-line monthly revenue recognition.' }, { title: 'Total recognized', value: formatMoney(contract - deferred), tone: 'positive', text: 'Cumulative revenue recognized.' }, { title: 'Remaining deferred', value: formatMoney(deferred), tone: deferred > 0.01 ? 'warning' : 'positive', text: 'Deferred revenue remaining on the balance sheet.' }],
        [{ title: 'Recognition method', value: 'Straight-line', tone: 'neutral', text: 'Equal monthly revenue recognition over the contract term.' }, { title: 'Completion', value: formatPercent((contract - deferred) / contract * 100, 1), tone: 'positive', text: 'Percentage of contract revenue recognized.' }],
        [{ title: 'ASC 606 alignment', text: 'Verify that performance obligations support straight-line recognition. Usage-based or milestone contracts may need different patterns.' }, { title: 'Multi-element contracts', text: 'If the contract includes distinct deliverables, each element may need its own waterfall schedule.' }],
        { columns: [{ key: 'month', label: 'Month' }, { key: 'opening', label: 'Opening Deferred', align: 'right' }, { key: 'recognized', label: 'Recognized', align: 'right' }, { key: 'closing', label: 'Closing Deferred', align: 'right' }], rows: rows },
        exportRows,
        'Deferred revenue waterfall generated for ' + term + ' months.'
      );
    },

    'month-end-close-checklist': function (values) {
      var entities = Math.max(1, Math.round(values.entityCount));
      var target = Math.max(1, Math.round(values.closeDayTarget));
      var hasPayroll = values.hasPayroll >= 1;
      var hasIC = values.hasIntercompany >= 1;
      var hasFA = values.hasFixedAssets >= 1;
      var tasks = [];
      var day = 1;
      tasks.push({ day: day, task: 'Import and reconcile bank feeds', owner: 'Staff Accountant', area: 'Cash' });
      tasks.push({ day: day, task: 'Record cash receipts and disbursements', owner: 'Staff Accountant', area: 'Cash' });
      tasks.push({ day: day, task: 'Preliminary bank reconciliation', owner: 'Staff Accountant', area: 'Cash' });
      if (hasPayroll) { tasks.push({ day: day, task: 'Post payroll journal entries', owner: 'Payroll Lead', area: 'Payroll' }); }
      day = 2;
      tasks.push({ day: day, task: 'Post revenue accruals', owner: 'Revenue Accountant', area: 'Revenue' });
      tasks.push({ day: day, task: 'Post expense accruals', owner: 'Staff Accountant', area: 'Expenses' });
      tasks.push({ day: day, task: 'Review prepaid amortization entries', owner: 'Staff Accountant', area: 'Prepaids' });
      if (hasFA) { tasks.push({ day: day, task: 'Record depreciation and amortization', owner: 'Fixed Asset Lead', area: 'Fixed Assets' }); }
      day = 3;
      if (hasIC) { tasks.push({ day: day, task: 'Post intercompany eliminations (' + entities + ' entities)', owner: 'Senior Accountant', area: 'Intercompany' }); }
      tasks.push({ day: day, task: 'Reconcile accounts receivable subledger', owner: 'AR Specialist', area: 'Receivables' });
      tasks.push({ day: day, task: 'Reconcile accounts payable subledger', owner: 'AP Specialist', area: 'Payables' });
      tasks.push({ day: day, task: 'Review inventory valuation', owner: 'Cost Accountant', area: 'Inventory' });
      day = Math.min(4, target);
      tasks.push({ day: day, task: 'Run preliminary trial balance', owner: 'Senior Accountant', area: 'Close' });
      tasks.push({ day: day, task: 'Flux analysis vs prior month and budget', owner: 'FP&A Analyst', area: 'Analysis' });
      tasks.push({ day: day, task: 'Investigate and clear suspense items', owner: 'Senior Accountant', area: 'Close' });
      day = Math.min(5, target);
      tasks.push({ day: day, task: 'Final adjusting journal entries', owner: 'Controller', area: 'Close' });
      tasks.push({ day: day, task: 'Management review and sign-off', owner: 'Controller', area: 'Close' });
      tasks.push({ day: day, task: 'Close the period in the ERP', owner: 'Controller', area: 'Close' });
      if (entities > 1) { tasks.push({ day: day, task: 'Consolidation and elimination review', owner: 'Controller', area: 'Consolidation' }); }
      var totalTasks = tasks.length;
      var areas = {};
      tasks.forEach(function (t) { areas[t.area] = (areas[t.area] || 0) + 1; });
      var rows = tasks.map(function (t) { return { day: 'Day ' + t.day, task: t.task, owner: t.owner, area: t.area }; });
      var exportRows = tasks.map(function (t) { return { Day: t.day, Task: t.task, Owner: t.owner, Area: t.area, Status: 'Open' }; });
      return buildResult(
        [{ label: 'Total tasks', value: formatNumber(totalTasks) }, { label: 'Close target', value: 'Day ' + target }, { label: 'Entities', value: formatNumber(entities) }, { label: 'Task areas', value: formatNumber(Object.keys(areas).length) }],
        [{ title: 'Estimated task days', value: formatNumber(Math.min(5, target)), tone: target <= 5 ? 'positive' : 'warning', text: 'Number of working days with assigned tasks.' }, { title: 'Daily task load', value: formatNumber(Math.round(totalTasks / Math.min(5, target))), tone: totalTasks / Math.min(5, target) > 5 ? 'warning' : 'positive', text: 'Average tasks per close day.' }],
        [{ title: 'Close complexity', value: entities > 2 ? 'High' : entities > 1 ? 'Medium' : 'Standard', tone: entities > 2 ? 'warning' : 'positive', text: 'Multi-entity environments increase intercompany and consolidation workload.' }],
        [{ title: 'Parallel tasks reduce bottlenecks', text: 'Assign cash, payroll, and subledger tasks to run simultaneously in the first two days.' }, { title: 'Flux analysis catches material issues early', text: 'Running variance analysis before final close prevents last-day surprises.' }],
        { columns: [{ key: 'day', label: 'Day' }, { key: 'task', label: 'Task' }, { key: 'owner', label: 'Owner' }, { key: 'area', label: 'Area' }], rows: rows },
        exportRows,
        'Close checklist generated: ' + totalTasks + ' tasks across ' + Math.min(5, target) + ' days.'
      );
    },

    'accrual-reversal-scheduler': function (values) {
      var amount = values.accrualAmount;
      var accrualRaw = String(values.accrualDate || '').trim();
      var reversalRaw = String(values.reversalDate || '').trim();
      var expAcct = String(values.expenseAccount || '').trim() || 'Expense';
      var liabAcct = String(values.liabilityAccount || '').trim() || 'Accrued Liability';
      var desc = String(values.description || '').trim() || 'Accrual entry';
      if (!(amount > 0)) { throw new Error('Enter an accrual amount greater than zero.'); }
      if (!/^\d{4}-\d{2}$/.test(accrualRaw)) { throw new Error('Enter an accrual date in YYYY-MM format.'); }
      if (!/^\d{4}-\d{2}$/.test(reversalRaw)) { throw new Error('Enter a reversal date in YYYY-MM format.'); }
      var accrualDate = new Date(parseInt(accrualRaw.slice(0, 4), 10), parseInt(accrualRaw.slice(5, 7), 10) - 1, 1);
      var reversalDate = new Date(parseInt(reversalRaw.slice(0, 4), 10), parseInt(reversalRaw.slice(5, 7), 10) - 1, 1);
      var accrualLabel = accrualDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      var reversalLabel = reversalDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      var monthsBetween = (reversalDate.getFullYear() - accrualDate.getFullYear()) * 12 + reversalDate.getMonth() - accrualDate.getMonth();
      var sameMonth = monthsBetween === 0;
      var nextMonth = monthsBetween === 1;
      var rows = [
        { period: accrualLabel, entry: 'Accrual', account: expAcct, debit: formatMoney(amount), credit: '' },
        { period: accrualLabel, entry: 'Accrual', account: liabAcct, debit: '', credit: formatMoney(amount) },
        { period: reversalLabel, entry: 'Reversal', account: liabAcct, debit: formatMoney(amount), credit: '' },
        { period: reversalLabel, entry: 'Reversal', account: expAcct, debit: '', credit: formatMoney(amount) }
      ];
      var exportRows = [
        { Period: accrualLabel, Entry: 'Accrual', Account: expAcct, Debit: amount, Credit: 0, Description: desc },
        { Period: accrualLabel, Entry: 'Accrual', Account: liabAcct, Debit: 0, Credit: amount, Description: desc },
        { Period: reversalLabel, Entry: 'Reversal', Account: liabAcct, Debit: amount, Credit: 0, Description: desc + ' - reversal' },
        { Period: reversalLabel, Entry: 'Reversal', Account: expAcct, Debit: 0, Credit: amount, Description: desc + ' - reversal' }
      ];
      return buildResult(
        [{ label: 'Accrual amount', value: formatMoney(amount) }, { label: 'Accrual period', value: accrualLabel }, { label: 'Reversal period', value: reversalLabel }, { label: 'Net P&L impact', value: formatMoney(0) }],
        [{ title: 'Months to reversal', value: formatNumber(monthsBetween), tone: sameMonth ? 'critical' : nextMonth ? 'positive' : 'warning', text: sameMonth ? 'Accrual and reversal are in the same period.' : nextMonth ? 'Standard next-period reversal.' : 'Reversal is ' + monthsBetween + ' months after accrual.' }, { title: 'Timing', value: nextMonth ? 'Standard' : sameMonth ? 'Same period' : 'Delayed', tone: nextMonth ? 'positive' : 'warning', text: 'Most accruals reverse in the immediately following period.' }],
        [{ title: 'Balance sheet impact', value: formatMoney(amount), tone: 'neutral', text: 'Liability balance carried between accrual and reversal periods.' }],
        [{ title: 'Review reversal timing', text: 'Ensure the reversal period aligns with when the actual invoice or payment is expected.' }, { title: 'Track open accruals', text: 'Missed reversals create overstated liabilities and double-counted expenses once the real invoice posts.' }],
        { columns: [{ key: 'period', label: 'Period' }, { key: 'entry', label: 'Entry' }, { key: 'account', label: 'Account' }, { key: 'debit', label: 'Debit', align: 'right' }, { key: 'credit', label: 'Credit', align: 'right' }], rows: rows },
        exportRows,
        'Accrual and reversal entries generated for ' + desc + '.'
      );
    },

    'quarterly-estimated-tax-calculator': function (values) {
      var annualIncome = values.annualIncome; if (!(annualIncome > 0)) throw new Error('Enter your annual income.');
      var status = values.taxFilingStatus || 'single', seIncome = values.selfEmploymentIncome || 0, deductions = values.deductions || 0, stateRate = values.stateRate || 0, priorYearTax = values.priorYearTax || 0, withheldToDate = values.withheldToDate || 0;
      var taxableIncome = Math.max(0, annualIncome - deductions);
      var seTax = seIncome > 0 ? seIncome * 0.9235 * 0.153 : 0;
      var seDeduction = seTax / 2;
      var adjTaxable = Math.max(0, taxableIncome - seDeduction);
      var brackets;
      if (status === 'married-joint') { brackets = [[23200, 0.10], [94300, 0.12], [201050, 0.22], [383900, 0.24], [487450, 0.32], [1218700, 0.35], [Infinity, 0.37]]; }
      else if (status === 'head-of-household') { brackets = [[16550, 0.10], [63100, 0.12], [100500, 0.22], [191950, 0.24], [243725, 0.32], [609350, 0.35], [Infinity, 0.37]]; }
      else { brackets = [[11600, 0.10], [47150, 0.12], [100525, 0.22], [191950, 0.24], [243725, 0.32], [609350, 0.35], [Infinity, 0.37]]; }
      var fedTax = 0, prev = 0; brackets.forEach(function (b) { var top = Math.min(adjTaxable, b[0]); if (top > prev) { fedTax += (top - prev) * b[1]; prev = top; } });
      var stateTax = adjTaxable * stateRate / 100;
      var totalEstTax = fedTax + seTax + stateTax;
      var quarterlyPayment = Math.max(0, (totalEstTax - withheldToDate) / 4);
      var safeHarbor = Math.max(priorYearTax, totalEstTax * 0.9);
      var safeHarborQ = safeHarbor / 4;
      var effectiveRate = annualIncome > 0 ? totalEstTax / annualIncome * 100 : 0;
      var remainingDue = Math.max(0, totalEstTax - withheldToDate);
      var penaltyRisk = quarterlyPayment > safeHarborQ ? 'Low' : remainingDue > 1000 ? 'Moderate' : 'Low';
      return buildResult(
        [{ label: 'Total estimated tax', value: formatMoney(totalEstTax), tone: 'neutral', help: 'Federal income tax plus SE tax plus state tax.' }, { label: 'Quarterly payment', value: formatMoney(quarterlyPayment), tone: 'positive', help: 'Amount to pay each quarter after subtracting withholding.' }, { label: 'Safe harbor quarterly', value: formatMoney(safeHarborQ), tone: 'neutral', help: 'Pay at least this each quarter to avoid underpayment penalties.' }, { label: 'Effective tax rate', value: formatPercent(effectiveRate, 1), tone: 'neutral', help: 'Total estimated taxes as a percentage of annual income.' }],
        [{ title: 'SE tax portion', value: formatMoney(seTax), tone: seTax > 0 ? 'warning' : 'neutral', text: 'Self-employment tax on Schedule SE income.' }, { title: 'Remaining due', value: formatMoney(remainingDue), tone: remainingDue > 0 ? 'warning' : 'positive', text: 'Total estimated tax minus amounts already withheld.' }, { title: 'Penalty risk', value: penaltyRisk, tone: penaltyRisk === 'Low' ? 'positive' : 'warning', text: 'Underpayment penalty risk based on safe harbor comparison.' }, { title: 'Federal tax', value: formatMoney(fedTax), tone: 'neutral', text: 'Estimated federal income tax from progressive brackets.' }],
        [{ title: 'Underpayment warning', text: remainingDue > 1000 ? 'You may owe an underpayment penalty if quarterly payments are not made on time.' : 'Your withholding appears sufficient to avoid underpayment penalties.' }, { title: 'Safe harbor advice', text: 'Pay at least 90% of current year tax or 100% of prior year tax (110% if AGI exceeds $150k) to avoid penalties.' }, { title: 'Adjust withholding if needed', text: 'If quarterly payments are burdensome, consider increasing W-4 withholding at your employer.' }],
        [{ label: 'Annual income', value: formatMoney(annualIncome) }, { label: 'Filing status', value: status }, { label: 'SE income', value: formatMoney(seIncome) }, { label: 'Deductions', value: formatMoney(deductions) }, { label: 'Federal tax', value: formatMoney(fedTax) }, { label: 'SE tax', value: formatMoney(seTax) }, { label: 'State tax', value: formatMoney(stateTax) }, { label: 'Total estimated tax', value: formatMoney(totalEstTax) }, { label: 'Quarterly payment', value: formatMoney(quarterlyPayment) }],
        { columns: [{ key: 'quarter', label: 'Quarter' }, { key: 'dueDate', label: 'Due Date' }, { key: 'payment', label: 'Payment', align: 'right' }, { key: 'safeHarbor', label: 'Safe Harbor', align: 'right' }], rows: [{ quarter: 'Q1', dueDate: 'April 15', payment: formatMoney(quarterlyPayment), safeHarbor: formatMoney(safeHarborQ) }, { quarter: 'Q2', dueDate: 'June 15', payment: formatMoney(quarterlyPayment), safeHarbor: formatMoney(safeHarborQ) }, { quarter: 'Q3', dueDate: 'September 15', payment: formatMoney(quarterlyPayment), safeHarbor: formatMoney(safeHarborQ) }, { quarter: 'Q4', dueDate: 'January 15', payment: formatMoney(quarterlyPayment), safeHarbor: formatMoney(safeHarborQ) }] },
        [{ Quarter: 'Q1', 'Due Date': 'April 15', Payment: Math.round(quarterlyPayment), 'Safe Harbor': Math.round(safeHarborQ) }, { Quarter: 'Q2', 'Due Date': 'June 15', Payment: Math.round(quarterlyPayment), 'Safe Harbor': Math.round(safeHarborQ) }, { Quarter: 'Q3', 'Due Date': 'September 15', Payment: Math.round(quarterlyPayment), 'Safe Harbor': Math.round(safeHarborQ) }, { Quarter: 'Q4', 'Due Date': 'January 15', Payment: Math.round(quarterlyPayment), 'Safe Harbor': Math.round(safeHarborQ) }],
        'Quarterly estimated tax calculation complete.'
      );
    },

    'self-employment-tax-calculator': function (values) {
      var netSEIncome = values.netSelfEmploymentIncome; if (!(netSEIncome > 0)) throw new Error('Enter your net self-employment income.');
      var status = values.filingStatus || 'single', otherW2 = values.otherW2Income || 0, qbiRate = values.qualifiedBusinessIncomeDeduction || 0;
      var seTaxable = netSEIncome * 0.9235;
      var ssWageBase = 184500;
      var combinedWages = otherW2 + seTaxable;
      var ssTaxableLimit = Math.max(0, ssWageBase - otherW2);
      var ssTaxable = Math.min(seTaxable, ssTaxableLimit);
      var ssPortion = ssTaxable * 0.124;
      var medicarePortion = seTaxable * 0.029;
      var addlMedicareThreshold = (status === 'married-joint') ? 250000 : 200000;
      var addlMedicare = Math.max(0, combinedWages - addlMedicareThreshold) * 0.009;
      var totalSETax = ssPortion + medicarePortion + addlMedicare;
      var seDeduction = totalSETax / 2;
      var qbiDeduction = netSEIncome * qbiRate / 100;
      var effectiveRate = netSEIncome > 0 ? totalSETax / netSEIncome * 100 : 0;
      var ssCapReached = combinedWages >= ssWageBase;
      return buildResult(
        [{ label: 'Total SE tax', value: formatMoney(totalSETax), tone: 'neutral', help: 'Combined Social Security and Medicare self-employment taxes.' }, { label: 'SE tax deduction', value: formatMoney(seDeduction), tone: 'positive', help: 'Deductible half of SE tax on Form 1040.' }, { label: 'QBI deduction', value: formatMoney(qbiDeduction), tone: qbiDeduction > 0 ? 'positive' : 'neutral', help: 'Qualified Business Income deduction (Section 199A).' }, { label: 'Effective SE rate', value: formatPercent(effectiveRate, 1), tone: 'neutral', help: 'Total SE tax as a percentage of net SE income.' }],
        [{ title: 'Social Security portion', value: formatMoney(ssPortion), tone: 'neutral', text: '12.4% on SE income up to the wage base limit.' }, { title: 'Medicare portion', value: formatMoney(medicarePortion), tone: 'neutral', text: '2.9% on all SE taxable income.' }, { title: 'Additional Medicare', value: formatMoney(addlMedicare), tone: addlMedicare > 0 ? 'warning' : 'neutral', text: '0.9% surcharge on combined wages above the threshold.' }, { title: 'SS wage base status', value: ssCapReached ? 'Cap reached' : formatMoney(ssWageBase - combinedWages) + ' remaining', tone: ssCapReached ? 'positive' : 'neutral', text: 'Social Security wage base for 2026 is ' + formatMoney(ssWageBase) + '.' }],
        [{ title: 'Deduct half of SE tax', text: 'The employer-equivalent portion of SE tax is deductible on your 1040, reducing adjusted gross income.' }, { title: 'Consider S-Corp election', text: 'If SE tax is substantial, an S-Corp election may reduce self-employment taxes by splitting income into salary and distributions.' }, { title: 'Track all business expenses', text: 'Reducing net SE income directly reduces SE tax. Keep detailed records of all business deductions.' }],
        [{ label: 'Net SE income', value: formatMoney(netSEIncome) }, { label: 'SE taxable (92.35%)', value: formatMoney(seTaxable) }, { label: 'Other W-2 income', value: formatMoney(otherW2) }, { label: 'SS portion', value: formatMoney(ssPortion) }, { label: 'Medicare portion', value: formatMoney(medicarePortion) }, { label: 'Additional Medicare', value: formatMoney(addlMedicare) }, { label: 'Total SE tax', value: formatMoney(totalSETax) }, { label: 'SE deduction', value: formatMoney(seDeduction) }, { label: 'QBI deduction', value: formatMoney(qbiDeduction) }],
        { columns: [{ key: 'component', label: 'Component' }, { key: 'base', label: 'Taxable Base', align: 'right' }, { key: 'rate', label: 'Rate' }, { key: 'tax', label: 'Tax', align: 'right' }], rows: [{ component: 'Social Security', base: formatMoney(ssTaxable), rate: '12.4%', tax: formatMoney(ssPortion) }, { component: 'Medicare', base: formatMoney(seTaxable), rate: '2.9%', tax: formatMoney(medicarePortion) }, { component: 'Additional Medicare', base: formatMoney(Math.max(0, combinedWages - addlMedicareThreshold)), rate: '0.9%', tax: formatMoney(addlMedicare) }, { component: 'Total SE tax', base: '', rate: '', tax: formatMoney(totalSETax) }] },
        [{ Component: 'Social Security', Tax: Math.round(ssPortion) }, { Component: 'Medicare', Tax: Math.round(medicarePortion) }, { Component: 'Additional Medicare', Tax: Math.round(addlMedicare) }, { Component: 'Total', Tax: Math.round(totalSETax) }],
        'Self-employment tax calculation complete.'
      );
    },

    'mileage-deduction-calculator': function (values) {
      var businessMiles = values.businessMiles; if (!(businessMiles > 0)) throw new Error('Enter your business miles driven.');
      var totalMiles = values.totalMiles || businessMiles, irsRate = values.irsStandardRate || 0.70, vehicleCost = values.vehicleCost || 0, gasAndOil = values.gasAndOil || 0, insurance = values.insurance || 0, repairs = values.repairs || 0, depreciation = values.depreciation || 0, parking = values.parking || 0, tolls = values.tolls || 0;
      var standardDeduction = businessMiles * irsRate + parking + tolls;
      var businessUsePercent = totalMiles > 0 ? businessMiles / totalMiles : 1;
      var actualVehicleExpenses = gasAndOil + insurance + repairs + depreciation;
      var actualDeduction = actualVehicleExpenses * businessUsePercent + parking + tolls;
      var recommended = standardDeduction >= actualDeduction ? 'Standard Mileage' : 'Actual Expenses';
      var savings = Math.abs(standardDeduction - actualDeduction);
      var perMileCostActual = businessMiles > 0 ? actualDeduction / businessMiles : 0;
      return buildResult(
        [{ label: 'Standard mileage deduction', value: formatMoney(standardDeduction), tone: recommended === 'Standard Mileage' ? 'positive' : 'neutral', help: 'IRS standard rate times business miles plus parking and tolls.' }, { label: 'Actual expense deduction', value: formatMoney(actualDeduction), tone: recommended === 'Actual Expenses' ? 'positive' : 'neutral', help: 'Actual vehicle expenses prorated by business use plus parking and tolls.' }, { label: 'Recommended method', value: recommended, tone: 'positive', help: 'The method that provides the larger deduction.' }, { label: 'Difference', value: formatMoney(savings), tone: 'neutral', help: 'Dollar difference between the two methods.' }],
        [{ title: 'Business use', value: formatPercent(businessUsePercent * 100, 1), tone: 'neutral', text: 'Business miles as a percentage of total miles driven.' }, { title: 'IRS standard rate', value: '$' + irsRate.toFixed(2) + '/mile', tone: 'neutral', text: 'Current IRS standard mileage rate.' }, { title: 'Per-mile cost (actual)', value: '$' + perMileCostActual.toFixed(2), tone: 'neutral', text: 'Your actual cost per business mile driven.' }, { title: 'Parking & tolls', value: formatMoney(parking + tolls), tone: 'neutral', text: 'Added to both methods as direct business expenses.' }],
        [{ title: 'Keep a mileage log', text: 'The IRS requires contemporaneous records of business miles. Use an app or logbook to track every trip.' }, { title: 'Standard method is simpler', text: 'The standard mileage rate requires less record-keeping but you must use it from the first year you use the car for business.' }, { title: 'Actual method may be better for expensive vehicles', text: 'If your vehicle has high costs for fuel, insurance, and depreciation, the actual expense method may yield a larger deduction.' }],
        [{ label: 'Business miles', value: formatNumber(businessMiles) }, { label: 'Total miles', value: formatNumber(totalMiles) }, { label: 'Business use %', value: formatPercent(businessUsePercent * 100, 1) }, { label: 'Standard deduction', value: formatMoney(standardDeduction) }, { label: 'Actual deduction', value: formatMoney(actualDeduction) }, { label: 'Recommended', value: recommended }, { label: 'Savings', value: formatMoney(savings) }],
        { columns: [{ key: 'method', label: 'Method' }, { key: 'deduction', label: 'Deduction', align: 'right' }, { key: 'notes', label: 'Notes' }], rows: [{ method: 'Standard Mileage', deduction: formatMoney(standardDeduction), notes: formatNumber(businessMiles) + ' miles x $' + irsRate.toFixed(2) + ' + parking/tolls' }, { method: 'Actual Expenses', deduction: formatMoney(actualDeduction), notes: formatMoney(actualVehicleExpenses) + ' x ' + formatPercent(businessUsePercent * 100, 1) + ' + parking/tolls' }] },
        [{ Method: 'Standard Mileage', Deduction: Math.round(standardDeduction) }, { Method: 'Actual Expenses', Deduction: Math.round(actualDeduction) }],
        'Mileage deduction comparison complete.'
      );
    },

    'home-office-deduction-calculator': function (values) {
      var officeSqFt = values.officeSquareFootage; if (!(officeSqFt > 0)) throw new Error('Enter your office square footage.');
      var homeSqFt = values.homeSquareFootage; if (!(homeSqFt > 0)) throw new Error('Enter your total home square footage.');
      var rent = values.rent || 0, mortgage = values.mortgage || 0, utilities = values.utilities || 0, insurance = values.insurance || 0, repairs = values.repairs || 0, depreciation = values.depreciation || 0, overridePercent = values.businessUsePercent || 0;
      var businessUsePercent = overridePercent > 0 ? overridePercent : (officeSqFt / homeSqFt * 100);
      var simplifiedSqFt = Math.min(officeSqFt, 300);
      var simplifiedDeduction = simplifiedSqFt * 5;
      var totalExpenses = rent + mortgage + utilities + insurance + repairs + depreciation;
      var regularDeduction = totalExpenses * businessUsePercent / 100;
      var recommended = regularDeduction >= simplifiedDeduction ? 'Regular Method' : 'Simplified Method';
      var savings = Math.abs(regularDeduction - simplifiedDeduction);
      var perSqFtCost = homeSqFt > 0 ? totalExpenses / homeSqFt : 0;
      return buildResult(
        [{ label: 'Simplified method deduction', value: formatMoney(simplifiedDeduction), tone: recommended === 'Simplified Method' ? 'positive' : 'neutral', help: 'Up to 300 sq ft at $5 per sq ft, max $1,500.' }, { label: 'Regular method deduction', value: formatMoney(regularDeduction), tone: recommended === 'Regular Method' ? 'positive' : 'neutral', help: 'Actual home expenses prorated by business use percentage.' }, { label: 'Recommended method', value: recommended, tone: 'positive', help: 'The method providing the larger deduction.' }, { label: 'Difference', value: formatMoney(savings), tone: 'neutral', help: 'Dollar difference between the two methods.' }],
        [{ title: 'Business use %', value: formatPercent(businessUsePercent, 1), tone: 'neutral', text: 'Office area as a percentage of total home area.' }, { title: 'Office area', value: formatNumber(officeSqFt) + ' sq ft', tone: 'neutral', text: 'Dedicated office space used regularly and exclusively for business.' }, { title: 'Per sq ft cost', value: '$' + perSqFtCost.toFixed(2), tone: 'neutral', text: 'Total home expenses divided by total square footage.' }, { title: 'Total home expenses', value: formatMoney(totalExpenses), tone: 'neutral', text: 'Sum of rent, mortgage interest, utilities, insurance, repairs, and depreciation.' }],
        [{ title: 'Exclusive and regular use required', text: 'The space must be used regularly and exclusively for business. A guest bedroom that doubles as an office may not qualify.' }, { title: 'Simplified method caps at $1,500', text: 'The simplified method is easier but limited to 300 sq ft at $5 per square foot.' }, { title: 'Regular method allows depreciation', text: 'If you own your home, the regular method lets you deduct a portion of depreciation, which can be significant.' }],
        [{ label: 'Office sq ft', value: formatNumber(officeSqFt) }, { label: 'Home sq ft', value: formatNumber(homeSqFt) }, { label: 'Business use %', value: formatPercent(businessUsePercent, 1) }, { label: 'Total home expenses', value: formatMoney(totalExpenses) }, { label: 'Simplified deduction', value: formatMoney(simplifiedDeduction) }, { label: 'Regular deduction', value: formatMoney(regularDeduction) }, { label: 'Recommended', value: recommended }],
        { columns: [{ key: 'method', label: 'Method' }, { key: 'deduction', label: 'Deduction', align: 'right' }, { key: 'notes', label: 'Notes' }], rows: [{ method: 'Simplified', deduction: formatMoney(simplifiedDeduction), notes: formatNumber(simplifiedSqFt) + ' sq ft x $5' }, { method: 'Regular', deduction: formatMoney(regularDeduction), notes: formatMoney(totalExpenses) + ' x ' + formatPercent(businessUsePercent, 1) }] },
        [{ Method: 'Simplified', Deduction: Math.round(simplifiedDeduction) }, { Method: 'Regular', Deduction: Math.round(regularDeduction) }],
        'Home office deduction comparison complete.'
      );
    },

    '1099-vs-w2-comparison-tool': function (values) {
      var annualPay = values.annualPay; if (!(annualPay > 0)) throw new Error('Enter the annual pay amount.');
      var status = values.filingStatus || 'single', benefitsValue = values.employerBenefitsValue || 0, bizExpenses = values.businessExpenses || 0, retContrib = values.retirementContribution || 0, healthIns = values.healthInsuranceCost || 0, seDeductions = values.selfEmploymentDeductions || 0, stateRate = values.stateRate || 0;
      /* W-2 scenario */
      var w2FICA = annualPay * 0.0765;
      var w2StdDed = (status === 'married-joint') ? 31400 : 15700;
      var w2FedTaxable = Math.max(0, annualPay - w2StdDed);
      var w2Brackets = (status === 'married-joint') ? [[23200, 0.10], [94300, 0.12], [201050, 0.22], [383900, 0.24]] : [[11600, 0.10], [47150, 0.12], [100525, 0.22], [191950, 0.24]];
      var w2FedTax = 0, w2Prev = 0; w2Brackets.forEach(function (b) { var top = Math.min(w2FedTaxable, b[0]); if (top > w2Prev) { w2FedTax += (top - w2Prev) * b[1]; w2Prev = top; } });
      var w2StateTax = annualPay * stateRate / 100;
      var w2TotalTax = w2FedTax + w2FICA + w2StateTax;
      var w2TakeHome = annualPay - w2TotalTax;
      var w2TotalComp = annualPay + benefitsValue + annualPay * 0.0765;
      /* 1099 scenario */
      var seTax = annualPay * 0.9235 * 0.153;
      var seDeductionHalf = seTax / 2;
      var taxable1099 = Math.max(0, annualPay - bizExpenses - retContrib - healthIns - seDeductions - seDeductionHalf);
      var stdDed1099 = (status === 'married-joint') ? 31400 : 15700;
      var fedTaxable1099 = Math.max(0, taxable1099 - stdDed1099);
      var fed1099 = 0, prev1099 = 0; w2Brackets.forEach(function (b) { var top = Math.min(fedTaxable1099, b[0]); if (top > prev1099) { fed1099 += (top - prev1099) * b[1]; prev1099 = top; } });
      var state1099 = taxable1099 * stateRate / 100;
      var total1099Tax = fed1099 + state1099 + seTax;
      var takeHome1099 = annualPay - total1099Tax - bizExpenses - healthIns;
      var breakEvenRate = annualPay + benefitsValue + annualPay * 0.0765;
      var taxDifference = total1099Tax - w2TotalTax;
      return buildResult(
        [{ label: 'W-2 take-home', value: formatMoney(w2TakeHome), tone: 'neutral', help: 'Net pay after taxes as a W-2 employee.' }, { label: '1099 take-home', value: formatMoney(takeHome1099), tone: 'neutral', help: 'Net pay after taxes and expenses as a 1099 contractor.' }, { label: 'Break-even 1099 rate', value: formatMoney(breakEvenRate), tone: 'positive', help: 'What you would need to earn as a 1099 to match W-2 total compensation.' }, { label: 'Tax difference', value: formatMoney(taxDifference), tone: taxDifference > 0 ? 'warning' : 'positive', help: 'How much more (or less) you pay in taxes as 1099 vs W-2.' }],
        [{ title: 'W-2 total compensation', value: formatMoney(w2TotalComp), tone: 'neutral', text: 'Salary plus employer benefits and employer FICA share.' }, { title: 'SE tax (1099)', value: formatMoney(seTax), tone: 'warning', text: 'Self-employment tax covering both employer and employee FICA shares.' }, { title: 'W-2 FICA (employee)', value: formatMoney(w2FICA), tone: 'neutral', text: 'Employee share of Social Security and Medicare as W-2.' }, { title: '1099 deductions', value: formatMoney(bizExpenses + retContrib + healthIns + seDeductions), tone: 'positive', text: 'Total business deductions reducing 1099 taxable income.' }],
        [{ title: 'Factor in the full picture', text: 'W-2 employees get employer-paid benefits, FICA match, unemployment insurance, and job protections that 1099 workers do not.' }, { title: '1099 offers deduction flexibility', text: 'Contractors can deduct business expenses, home office, retirement contributions, and health insurance premiums.' }, { title: 'Use the break-even rate in negotiations', text: 'When switching from W-2 to 1099, charge at least the break-even rate to maintain equivalent total compensation.' }],
        [{ label: 'Annual pay', value: formatMoney(annualPay) }, { label: 'Filing status', value: status }, { label: 'W-2 federal tax', value: formatMoney(w2FedTax) }, { label: 'W-2 FICA', value: formatMoney(w2FICA) }, { label: 'W-2 take-home', value: formatMoney(w2TakeHome) }, { label: '1099 SE tax', value: formatMoney(seTax) }, { label: '1099 federal tax', value: formatMoney(fed1099) }, { label: '1099 take-home', value: formatMoney(takeHome1099) }, { label: 'Break-even rate', value: formatMoney(breakEvenRate) }],
        { columns: [{ key: 'item', label: 'Comparison' }, { key: 'w2', label: 'W-2', align: 'right' }, { key: 'contractor', label: '1099', align: 'right' }], rows: [{ item: 'Gross pay', w2: formatMoney(annualPay), contractor: formatMoney(annualPay) }, { item: 'Federal income tax', w2: formatMoney(w2FedTax), contractor: formatMoney(fed1099) }, { item: 'FICA / SE tax', w2: formatMoney(w2FICA), contractor: formatMoney(seTax) }, { item: 'State tax', w2: formatMoney(w2StateTax), contractor: formatMoney(state1099) }, { item: 'Total tax', w2: formatMoney(w2TotalTax), contractor: formatMoney(total1099Tax) }, { item: 'Take-home pay', w2: formatMoney(w2TakeHome), contractor: formatMoney(takeHome1099) }] },
        [{ Scenario: 'W-2', 'Total Tax': Math.round(w2TotalTax), 'Take-home': Math.round(w2TakeHome) }, { Scenario: '1099', 'Total Tax': Math.round(total1099Tax), 'Take-home': Math.round(takeHome1099) }, { Scenario: 'Break-even 1099 rate', 'Total Tax': '', 'Take-home': Math.round(breakEvenRate) }],
        '1099 vs W-2 comparison complete.'
      );
    },

    'payroll-tax-deposit-calculator': function (values) {
      var fedWith = values.federalWithholding || 0, empSS = values.employeeSocialSecurity || 0, empMed = values.employeeMedicare || 0, erSS = values.employerSocialSecurity || 0, erMed = values.employerMedicare || 0;
      var totalPayroll = values.totalPayrollPerPeriod || 0, freq = values.payFrequency || 'biweekly', priorYearLiability = values.priorYearTaxLiability || 0;
      var totalTaxPerPeriod = fedWith + empSS + empMed + erSS + erMed;
      if (!(totalTaxPerPeriod > 0)) throw new Error('Enter at least one payroll tax component.');
      var schedule = priorYearLiability <= 50000 ? 'Monthly' : 'Semi-Weekly';
      var nextDayRule = totalTaxPerPeriod >= 100000;
      if (nextDayRule) schedule = 'Next Business Day';
      var periods = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
      var pp = periods[freq] || 26;
      var annualLiability = totalTaxPerPeriod * pp;
      var penaltyTiers = [{ days: '1-5 days late', rate: 2 }, { days: '6-15 days late', rate: 5 }, { days: '16+ days late', rate: 10 }, { days: '10 days after first notice', rate: 15 }];
      return buildResult(
        [{ label: 'Deposit schedule', value: schedule, tone: schedule === 'Monthly' ? 'positive' : 'warning', help: 'Based on prior year liability and current period accumulation.' }, { label: 'Tax per period', value: formatMoney(totalTaxPerPeriod), tone: 'neutral', help: 'Total payroll tax liability per pay period.' }, { label: 'Annual liability estimate', value: formatMoney(annualLiability), tone: 'neutral', help: 'Projected annual payroll tax liability.' }, { label: 'Next-day deposit rule', value: nextDayRule ? 'Applies' : 'Does not apply', tone: nextDayRule ? 'critical' : 'positive', help: 'Triggered when accumulated taxes reach $100,000 or more in a deposit period.' }],
        [{ title: 'Federal withholding', value: formatMoney(fedWith), tone: 'neutral', text: 'Employee federal income tax withheld.' }, { title: 'Employee SS + Medicare', value: formatMoney(empSS + empMed), tone: 'neutral', text: 'Employee share of FICA taxes.' }, { title: 'Employer SS + Medicare', value: formatMoney(erSS + erMed), tone: 'neutral', text: 'Employer matching FICA taxes.' }, { title: 'Prior year liability', value: formatMoney(priorYearLiability), tone: 'neutral', text: 'Determines your base deposit schedule for the current year.' }],
        [{ title: 'Deposit on time to avoid penalties', text: 'Penalty rates increase the longer a deposit is late, from 2% to 15% of the unpaid amount.' }, { title: 'Use EFTPS for deposits', text: 'The Electronic Federal Tax Payment System is the required method for depositing federal payroll taxes.' }, { title: 'Monitor the $100,000 threshold', text: 'If you accumulate $100,000 or more in taxes on any day during a deposit period, you must deposit by the next business day.' }],
        [{ label: 'Pay frequency', value: freq }, { label: 'Federal withholding', value: formatMoney(fedWith) }, { label: 'Employee SS', value: formatMoney(empSS) }, { label: 'Employee Medicare', value: formatMoney(empMed) }, { label: 'Employer SS', value: formatMoney(erSS) }, { label: 'Employer Medicare', value: formatMoney(erMed) }, { label: 'Total per period', value: formatMoney(totalTaxPerPeriod) }, { label: 'Deposit schedule', value: schedule }, { label: 'Annual estimate', value: formatMoney(annualLiability) }],
        { columns: [{ key: 'penalty', label: 'Penalty Tier' }, { key: 'rate', label: 'Rate' }, { key: 'amount', label: 'Penalty on One Period', align: 'right' }], rows: penaltyTiers.map(function (t) { return { penalty: t.days, rate: t.rate + '%', amount: formatMoney(totalTaxPerPeriod * t.rate / 100) }; }) },
        [{ 'Penalty Tier': '1-5 days', Rate: '2%', Amount: Math.round(totalTaxPerPeriod * 0.02) }, { 'Penalty Tier': '6-15 days', Rate: '5%', Amount: Math.round(totalTaxPerPeriod * 0.05) }, { 'Penalty Tier': '16+ days', Rate: '10%', Amount: Math.round(totalTaxPerPeriod * 0.10) }, { 'Penalty Tier': '10 days after notice', Rate: '15%', Amount: Math.round(totalTaxPerPeriod * 0.15) }],
        'Payroll tax deposit calculation complete.'
      );
    },

    'fica-tax-calculator': function (values) {
      var grossWages = values.grossWages; if (!(grossWages > 0)) throw new Error('Enter gross wages for the period.');
      var ytdWages = values.ytdWages || 0, status = values.filingStatus || 'single', addlMedThreshold = values.additionalMedicareTaxThreshold || (status === 'married-joint' ? 250000 : 200000);
      var ssWageBase = 184500;
      var remainingSS = Math.max(0, ssWageBase - ytdWages);
      var ssTaxableWages = Math.min(grossWages, remainingSS);
      var employeeSS = ssTaxableWages * 0.062;
      var employerSS = ssTaxableWages * 0.062;
      var employeeMedicare = grossWages * 0.0145;
      var employerMedicare = grossWages * 0.0145;
      var ytdPlusCurrent = ytdWages + grossWages;
      var addlMedicare = Math.max(0, Math.max(0, ytdPlusCurrent - addlMedThreshold) * 0.009 - Math.max(0, ytdWages - addlMedThreshold) * 0.009);
      var totalEmployee = employeeSS + employeeMedicare + addlMedicare;
      var totalEmployer = employerSS + employerMedicare;
      var totalFICA = totalEmployee + totalEmployer;
      var ssCapHit = ytdPlusCurrent >= ssWageBase;
      var ssCapStatus = ssCapHit ? 'Reached' : formatMoney(ssWageBase - ytdPlusCurrent) + ' remaining';
      return buildResult(
        [{ label: 'Total FICA this period', value: formatMoney(totalFICA), tone: 'neutral', help: 'Combined employee and employer FICA taxes for this pay period.' }, { label: 'Employee share', value: formatMoney(totalEmployee), tone: 'neutral', help: 'Employee portion of Social Security, Medicare, and additional Medicare.' }, { label: 'Employer share', value: formatMoney(totalEmployer), tone: 'neutral', help: 'Employer matching Social Security and Medicare.' }, { label: 'SS wage base status', value: ssCapStatus, tone: ssCapHit ? 'positive' : 'neutral', help: 'Whether the Social Security wage base of ' + formatMoney(ssWageBase) + ' has been reached.' }],
        [{ title: 'Employee Social Security', value: formatMoney(employeeSS), tone: 'neutral', text: '6.2% on wages up to the SS wage base.' }, { title: 'Employer Social Security', value: formatMoney(employerSS), tone: 'neutral', text: '6.2% employer match on the same wages.' }, { title: 'Employee Medicare', value: formatMoney(employeeMedicare), tone: 'neutral', text: '1.45% on all wages with no cap.' }, { title: 'Additional Medicare', value: formatMoney(addlMedicare), tone: addlMedicare > 0 ? 'warning' : 'neutral', text: '0.9% surcharge on wages above ' + formatMoney(addlMedThreshold) + ' (employee only).' }],
        [{ title: 'Social Security has a wage cap', text: 'Once YTD wages reach the wage base (' + formatMoney(ssWageBase) + ' for 2026), no more Social Security tax is withheld for the remainder of the year.' }, { title: 'Additional Medicare is employee-only', text: 'The 0.9% Additional Medicare Tax is paid by the employee only. Employers do not match it.' }, { title: 'Multiple employers do not coordinate', text: 'If an employee works multiple jobs, each employer withholds SS tax independently. Excess may be recovered on the tax return.' }],
        [{ label: 'Gross wages', value: formatMoney(grossWages) }, { label: 'YTD wages', value: formatMoney(ytdWages) }, { label: 'SS taxable wages', value: formatMoney(ssTaxableWages) }, { label: 'Employee SS', value: formatMoney(employeeSS) }, { label: 'Employer SS', value: formatMoney(employerSS) }, { label: 'Employee Medicare', value: formatMoney(employeeMedicare) }, { label: 'Employer Medicare', value: formatMoney(employerMedicare) }, { label: 'Additional Medicare', value: formatMoney(addlMedicare) }, { label: 'Total FICA', value: formatMoney(totalFICA) }],
        { columns: [{ key: 'component', label: 'Component' }, { key: 'employee', label: 'Employee', align: 'right' }, { key: 'employer', label: 'Employer', align: 'right' }, { key: 'total', label: 'Total', align: 'right' }], rows: [{ component: 'Social Security', employee: formatMoney(employeeSS), employer: formatMoney(employerSS), total: formatMoney(employeeSS + employerSS) }, { component: 'Medicare', employee: formatMoney(employeeMedicare), employer: formatMoney(employerMedicare), total: formatMoney(employeeMedicare + employerMedicare) }, { component: 'Additional Medicare', employee: formatMoney(addlMedicare), employer: formatMoney(0), total: formatMoney(addlMedicare) }, { component: 'Total', employee: formatMoney(totalEmployee), employer: formatMoney(totalEmployer), total: formatMoney(totalFICA) }] },
        [{ Component: 'Social Security', Employee: Math.round(employeeSS), Employer: Math.round(employerSS) }, { Component: 'Medicare', Employee: Math.round(employeeMedicare), Employer: Math.round(employerMedicare) }, { Component: 'Additional Medicare', Employee: Math.round(addlMedicare), Employer: 0 }, { Component: 'Total', Employee: Math.round(totalEmployee), Employer: Math.round(totalEmployer) }],
        'FICA tax calculation complete.'
      );
    },

    's-corp-reasonable-salary-calculator': function (values) {
      var totalBizIncome = values.totalBusinessIncome; if (!(totalBizIncome > 0)) throw new Error('Enter your total business income.');
      var industryMedian = values.industryMedianSalary || 0, yearsExp = values.yearsExperience || 0, hoursPerWeek = values.hoursPerWeek || 40, geoArea = values.geographicArea || 'medium', compSalary = values.comparableSalary || 0, retContrib = values.retirementContribution || 0;
      var baseSalary = (industryMedian > 0 && compSalary > 0) ? (industryMedian + compSalary) / 2 : (industryMedian || compSalary || totalBizIncome * 0.5);
      if (yearsExp > 20) baseSalary *= 1.20;
      else if (yearsExp > 10) baseSalary *= 1.10;
      if (hoursPerWeek > 40) baseSalary *= hoursPerWeek / 40;
      if (geoArea === 'high') baseSalary *= 1.15;
      else if (geoArea === 'low') baseSalary *= 0.90;
      var reasonableSalary = Math.min(Math.round(baseSalary / 100) * 100, totalBizIncome);
      var distribution = Math.max(0, totalBizIncome - reasonableSalary - retContrib);
      var salaryFICA = reasonableSalary * 0.153;
      var seTaxNoSCorp = totalBizIncome * 0.9235 * 0.153;
      var taxSavings = Math.max(0, seTaxNoSCorp - salaryFICA);
      var effectiveSalaryPercent = totalBizIncome > 0 ? reasonableSalary / totalBizIncome * 100 : 0;
      return buildResult(
        [{ label: 'Recommended salary', value: formatMoney(reasonableSalary), tone: 'positive', help: 'Estimated reasonable compensation based on industry, experience, and geography.' }, { label: 'Distribution amount', value: formatMoney(distribution), tone: 'positive', help: 'Remaining income taken as S-Corp distribution, not subject to FICA.' }, { label: 'Annual FICA savings', value: formatMoney(taxSavings), tone: taxSavings > 0 ? 'positive' : 'neutral', help: 'FICA taxes saved by using S-Corp structure vs sole proprietor.' }, { label: 'FICA on salary', value: formatMoney(salaryFICA), tone: 'neutral', help: 'Combined employer and employee FICA taxes on the reasonable salary.' }],
        [{ title: 'SE tax without S-Corp', value: formatMoney(seTaxNoSCorp), tone: 'warning', text: 'Self-employment tax if all income were subject to SE tax.' }, { title: 'Salary as % of income', value: formatPercent(effectiveSalaryPercent, 1), tone: effectiveSalaryPercent >= 30 && effectiveSalaryPercent <= 70 ? 'positive' : 'warning', text: 'IRS expects reasonable compensation relative to business income.' }, { title: 'Geographic adjustment', value: geoArea === 'high' ? '+15%' : geoArea === 'low' ? '-10%' : 'None', tone: 'neutral', text: 'Cost-of-living adjustment applied to salary estimate.' }, { title: 'Retirement contribution', value: formatMoney(retContrib), tone: retContrib > 0 ? 'positive' : 'neutral', text: 'Reduces distribution amount and provides tax-deferred savings.' }],
        [{ title: 'Reasonable salary is required', text: 'The IRS requires S-Corp shareholder-employees to pay themselves a reasonable salary before taking distributions.' }, { title: 'Document your methodology', text: 'Keep records of comparable salary data, industry benchmarks, and factors used to determine your salary.' }, { title: 'Too-low salary invites audits', text: 'Setting salary artificially low to avoid FICA is a well-known audit trigger. Keep salary at defensible levels.' }],
        [{ label: 'Total business income', value: formatMoney(totalBizIncome) }, { label: 'Industry median', value: formatMoney(industryMedian) }, { label: 'Comparable salary', value: formatMoney(compSalary) }, { label: 'Years experience', value: formatNumber(yearsExp) }, { label: 'Hours per week', value: formatNumber(hoursPerWeek) }, { label: 'Geographic area', value: geoArea }, { label: 'Reasonable salary', value: formatMoney(reasonableSalary) }, { label: 'Distribution', value: formatMoney(distribution) }, { label: 'FICA savings', value: formatMoney(taxSavings) }],
        { columns: [{ key: 'item', label: 'Item' }, { key: 'amount', label: 'Amount', align: 'right' }, { key: 'notes', label: 'Notes' }], rows: [{ item: 'Total business income', amount: formatMoney(totalBizIncome), notes: 'Net income before officer compensation' }, { item: 'Reasonable salary', amount: formatMoney(reasonableSalary), notes: 'Subject to FICA taxes' }, { item: 'Retirement contribution', amount: formatMoney(retContrib), notes: 'Tax-deferred savings' }, { item: 'S-Corp distribution', amount: formatMoney(distribution), notes: 'Not subject to FICA' }, { item: 'FICA on salary', amount: formatMoney(salaryFICA), notes: 'Employer + employee shares' }, { item: 'SE tax if sole proprietor', amount: formatMoney(seTaxNoSCorp), notes: 'On full business income' }, { item: 'Annual FICA savings', amount: formatMoney(taxSavings), notes: 'Benefit of S-Corp structure' }] },
        [{ Item: 'Reasonable salary', Amount: Math.round(reasonableSalary) }, { Item: 'Distribution', Amount: Math.round(distribution) }, { Item: 'FICA on salary', Amount: Math.round(salaryFICA) }, { Item: 'SE tax without S-Corp', Amount: Math.round(seTaxNoSCorp) }, { Item: 'FICA savings', Amount: Math.round(taxSavings) }],
        'S-Corp reasonable salary calculation complete.'
      );
    },

    'sales-tax-calculator-by-state': function (values) {
      var purchaseAmount = values.purchaseAmount; if (!(purchaseAmount > 0)) throw new Error('Enter a purchase amount.');
      var state = values.state || 'texas', localRate = values.localRate || 0, exemptAmount = values.exemptAmount || 0, isBusiness = values.isBusinessPurchase || false;
      var stateRates = { 'alabama': 4, 'alaska': 0, 'arizona': 5.6, 'arkansas': 6.5, 'california': 7.25, 'colorado': 2.9, 'connecticut': 6.35, 'delaware': 0, 'florida': 6, 'georgia': 4, 'hawaii': 4, 'idaho': 6, 'illinois': 6.25, 'indiana': 7, 'iowa': 6, 'kansas': 6.5, 'kentucky': 6, 'louisiana': 4.45, 'maine': 5.5, 'maryland': 6, 'massachusetts': 6.25, 'michigan': 6, 'minnesota': 6.875, 'mississippi': 7, 'missouri': 4.225, 'montana': 0, 'nebraska': 5.5, 'nevada': 6.85, 'new-hampshire': 0, 'new-jersey': 6.625, 'new-mexico': 4.875, 'new-york': 4, 'north-carolina': 4.75, 'north-dakota': 5, 'ohio': 5.75, 'oklahoma': 4.5, 'oregon': 0, 'pennsylvania': 6, 'rhode-island': 7, 'south-carolina': 6, 'south-dakota': 4.2, 'tennessee': 7, 'texas': 6.25, 'utah': 6.1, 'vermont': 6, 'virginia': 5.3, 'washington': 6.5, 'west-virginia': 6, 'wisconsin': 5, 'wyoming': 4, 'dc': 6 };
      var sr = stateRates[state] != null ? stateRates[state] : 0;
      var taxableAmount = Math.max(0, purchaseAmount - exemptAmount);
      var stateTax = taxableAmount * sr / 100;
      var localTax = taxableAmount * localRate / 100;
      var totalTax = stateTax + localTax;
      var totalWithTax = purchaseAmount + totalTax;
      var combinedRate = sr + localRate;
      var noTaxStates = ['alaska', 'delaware', 'montana', 'new-hampshire', 'oregon'];
      var noTaxSavings = totalTax;
      var stateDisplay = state.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      return buildResult(
        [{ label: 'Total tax', value: formatMoney(totalTax), tone: 'neutral', help: 'Combined state and local sales tax on the taxable amount.' }, { label: 'Total with tax', value: formatMoney(totalWithTax), tone: 'neutral', help: 'Purchase amount plus all applicable sales taxes.' }, { label: 'Effective combined rate', value: formatPercent(combinedRate, 3), tone: 'neutral', help: 'State rate plus local rate.' }, { label: 'State rate', value: formatPercent(sr, 3), tone: sr === 0 ? 'positive' : 'neutral', help: 'Base state sales tax rate for ' + stateDisplay + '.' }],
        [{ title: 'State tax', value: formatMoney(stateTax), tone: 'neutral', text: 'State portion of sales tax at ' + formatPercent(sr, 3) + '.' }, { title: 'Local tax', value: formatMoney(localTax), tone: 'neutral', text: 'Local portion at ' + formatPercent(localRate, 3) + '.' }, { title: 'Taxable amount', value: formatMoney(taxableAmount), tone: 'neutral', text: 'Purchase amount minus any exempt amount.' }, { title: 'No-tax state savings', value: formatMoney(noTaxSavings), tone: noTaxSavings > 0 ? 'positive' : 'neutral', text: 'Tax you would save purchasing in a state with no sales tax.' }],
        [{ title: 'Local rates vary widely', text: 'Local sales tax rates can add 1% to 5% on top of the state rate. Always check the combined rate for the specific jurisdiction.' }, { title: 'Business purchases may be exempt', text: isBusiness ? 'This is flagged as a business purchase. Check if your state offers resale exemptions or use tax credits.' : 'If purchasing for resale or business use, you may qualify for sales tax exemptions.' }, { title: 'Five states have no sales tax', text: 'Alaska, Delaware, Montana, New Hampshire, and Oregon have no statewide sales tax, though some localities in Alaska do levy sales tax.' }],
        [{ label: 'Purchase amount', value: formatMoney(purchaseAmount) }, { label: 'State', value: stateDisplay }, { label: 'State rate', value: formatPercent(sr, 3) }, { label: 'Local rate', value: formatPercent(localRate, 3) }, { label: 'Exempt amount', value: formatMoney(exemptAmount) }, { label: 'State tax', value: formatMoney(stateTax) }, { label: 'Local tax', value: formatMoney(localTax) }, { label: 'Total tax', value: formatMoney(totalTax) }, { label: 'Total with tax', value: formatMoney(totalWithTax) }],
        { columns: [{ key: 'component', label: 'Tax Component' }, { key: 'rate', label: 'Rate' }, { key: 'amount', label: 'Amount', align: 'right' }], rows: [{ component: 'State tax (' + stateDisplay + ')', rate: formatPercent(sr, 3), amount: formatMoney(stateTax) }, { component: 'Local tax', rate: formatPercent(localRate, 3), amount: formatMoney(localTax) }, { component: 'Total sales tax', rate: formatPercent(combinedRate, 3), amount: formatMoney(totalTax) }, { component: 'Purchase total', rate: '', amount: formatMoney(totalWithTax) }] },
        [{ Component: 'State tax', Rate: sr + '%', Amount: Math.round(stateTax) }, { Component: 'Local tax', Rate: localRate + '%', Amount: Math.round(localTax) }, { Component: 'Total tax', Rate: combinedRate + '%', Amount: Math.round(totalTax) }, { Component: 'Total with tax', Rate: '', Amount: Math.round(totalWithTax) }],
        'Sales tax calculation complete.'
      );
    },

    'bonus-tax-calculator': function (values) {
      var bonusAmount = values.bonusAmount; if (!(bonusAmount > 0)) throw new Error('Enter a bonus amount.');
      var method = values.withholdingMethod || 'flat', annualSalary = values.annualSalary || 0, freq = values.payFrequency || 'biweekly', status = values.filingStatus || 'single', stateRate = values.stateRate || 0, priorBonuses = values.priorBonusesYTD || 0;
      var ssWageBase = 184500;
      /* Flat rate method */
      var flatFederal = bonusAmount <= 1000000 ? bonusAmount * 0.22 : 1000000 * 0.22 + (bonusAmount - 1000000) * 0.37;
      var flatSS = Math.min(bonusAmount, Math.max(0, ssWageBase - annualSalary - priorBonuses)) * 0.062;
      var flatMedicare = bonusAmount * 0.0145;
      var flatState = bonusAmount * stateRate / 100;
      var flatTotal = flatFederal + flatSS + flatMedicare + flatState;
      var flatNet = bonusAmount - flatTotal;
      /* Aggregate method */
      var periods = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
      var pp = periods[freq] || 26;
      var regularPerPeriod = annualSalary / pp;
      var stdDed = (status === 'married-joint') ? 31400 : 15700;
      var brackets = (status === 'married-joint') ? [[23200, 0.10], [94300, 0.12], [201050, 0.22], [383900, 0.24], [487450, 0.32], [1218700, 0.35], [Infinity, 0.37]] : [[11600, 0.10], [47150, 0.12], [100525, 0.22], [191950, 0.24], [243725, 0.32], [609350, 0.35], [Infinity, 0.37]];
      function calcFedTax(annualizedIncome) { var taxable = Math.max(0, annualizedIncome - stdDed); var tax = 0, prev = 0; brackets.forEach(function (b) { var top = Math.min(taxable, b[0]); if (top > prev) { tax += (top - prev) * b[1]; prev = top; } }); return tax; }
      var annualizedRegular = regularPerPeriod * pp;
      var annualizedWithBonus = (regularPerPeriod + bonusAmount) * pp;
      var taxOnRegular = calcFedTax(annualizedRegular);
      var taxOnCombined = calcFedTax(annualizedWithBonus);
      var aggFederal = (taxOnCombined - taxOnRegular) / pp;
      var aggSS = flatSS;
      var aggMedicare = flatMedicare;
      var aggState = flatState;
      var aggTotal = aggFederal + aggSS + aggMedicare + aggState;
      var aggNet = bonusAmount - aggTotal;
      var betterMethod = flatNet >= aggNet ? 'Flat Rate' : 'Aggregate';
      var difference = Math.abs(flatNet - aggNet);
      var flatEffRate = bonusAmount > 0 ? flatTotal / bonusAmount * 100 : 0;
      var aggEffRate = bonusAmount > 0 ? aggTotal / bonusAmount * 100 : 0;
      return buildResult(
        [{ label: 'Better method', value: betterMethod, tone: 'positive', help: 'The withholding method resulting in higher net bonus.' }, { label: 'Flat rate net bonus', value: formatMoney(flatNet), tone: betterMethod === 'Flat Rate' ? 'positive' : 'neutral', help: 'Take-home bonus using the flat 22% federal withholding method.' }, { label: 'Aggregate net bonus', value: formatMoney(aggNet), tone: betterMethod === 'Aggregate' ? 'positive' : 'neutral', help: 'Take-home bonus using the aggregate annualized withholding method.' }, { label: 'Difference', value: formatMoney(difference), tone: 'neutral', help: 'Dollar difference in take-home pay between the two methods.' }],
        [{ title: 'Flat rate withholding', value: formatPercent(flatEffRate, 1), tone: 'neutral', text: 'Effective total withholding rate using the flat method.' }, { title: 'Aggregate withholding', value: formatPercent(aggEffRate, 1), tone: 'neutral', text: 'Effective total withholding rate using the aggregate method.' }, { title: 'Federal (flat)', value: formatMoney(flatFederal), tone: 'neutral', text: '22% flat rate (37% over $1M).' }, { title: 'Federal (aggregate)', value: formatMoney(aggFederal), tone: 'neutral', text: 'Based on annualized income with and without bonus.' }],
        [{ title: 'Withholding is not your final tax', text: 'Both methods are withholding estimates. Your actual tax liability is determined when you file your return.' }, { title: 'Flat rate is more common', text: 'Most employers use the 22% flat rate method for bonus withholding because it is simpler to administer.' }, { title: 'Request a specific method if possible', text: 'Some employers allow you to choose between flat and aggregate withholding. Ask your payroll department.' }],
        [{ label: 'Bonus amount', value: formatMoney(bonusAmount) }, { label: 'Withholding method', value: method }, { label: 'Annual salary', value: formatMoney(annualSalary) }, { label: 'Filing status', value: status }, { label: 'State rate', value: formatPercent(stateRate, 1) }, { label: 'Flat net bonus', value: formatMoney(flatNet) }, { label: 'Aggregate net bonus', value: formatMoney(aggNet) }, { label: 'Better method', value: betterMethod }],
        { columns: [{ key: 'component', label: 'Component' }, { key: 'flat', label: 'Flat Rate', align: 'right' }, { key: 'aggregate', label: 'Aggregate', align: 'right' }], rows: [{ component: 'Gross bonus', flat: formatMoney(bonusAmount), aggregate: formatMoney(bonusAmount) }, { component: 'Federal withholding', flat: formatMoney(flatFederal), aggregate: formatMoney(aggFederal) }, { component: 'Social Security', flat: formatMoney(flatSS), aggregate: formatMoney(aggSS) }, { component: 'Medicare', flat: formatMoney(flatMedicare), aggregate: formatMoney(aggMedicare) }, { component: 'State tax', flat: formatMoney(flatState), aggregate: formatMoney(aggState) }, { component: 'Total withholding', flat: formatMoney(flatTotal), aggregate: formatMoney(aggTotal) }, { component: 'Net bonus', flat: formatMoney(flatNet), aggregate: formatMoney(aggNet) }] },
        [{ Method: 'Flat Rate', 'Federal': Math.round(flatFederal), 'SS': Math.round(flatSS), 'Medicare': Math.round(flatMedicare), 'State': Math.round(flatState), 'Net Bonus': Math.round(flatNet) }, { Method: 'Aggregate', 'Federal': Math.round(aggFederal), 'SS': Math.round(aggSS), 'Medicare': Math.round(aggMedicare), 'State': Math.round(aggState), 'Net Bonus': Math.round(aggNet) }],
        'Bonus tax calculation complete.'
      );
    },

    'accounting-date-period-converter': function (values) {
      var anchorDate = parseDate(values.anchorDate); if (!anchorDate) throw new Error('Choose the accounting date you want to convert.');
      var fiscalStartMonth = Math.max(1, Math.min(12, Math.round(values.fiscalStartMonth || 1)));
      var closeWindowDays = Math.max(0, Math.round(values.closeWindowDays || 0));
      var calendarMonth = anchorDate.getMonth() + 1;
      var calendarYear = anchorDate.getFullYear();
      var calendarQuarter = Math.floor((calendarMonth - 1) / 3) + 1;
      var monthEnd = new Date(calendarYear, calendarMonth, 0);
      var quarterEnd = new Date(calendarYear, calendarQuarter * 3, 0);
      var fiscalMonth = ((calendarMonth - fiscalStartMonth + 12) % 12) + 1;
      var fiscalQuarter = Math.floor((fiscalMonth - 1) / 3) + 1;
      var fiscalYearEnd = calendarMonth >= fiscalStartMonth ? calendarYear + 1 : calendarYear;
      var daysToMonthEnd = daysBetween(anchorDate, monthEnd);
      var daysToQuarterEnd = daysBetween(anchorDate, quarterEnd);
      var closeSignal = closeWindowDays > 0 && daysToMonthEnd <= closeWindowDays;
      var periodRows = [
        { Metric: 'Input date', Value: formatDate(anchorDate), Note: 'Source date supplied to the converter' },
        { Metric: 'Calendar month', Value: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(anchorDate), Note: 'Calendar reporting month' },
        { Metric: 'Calendar quarter', Value: 'Q' + calendarQuarter + ' ' + calendarYear, Note: 'Calendar quarter label' },
        { Metric: 'Fiscal period', Value: 'P' + String(fiscalMonth).padStart(2, '0') + ' FY' + fiscalYearEnd, Note: 'Fiscal month sequence based on the configured year start' },
        { Metric: 'Fiscal quarter', Value: 'Q' + fiscalQuarter + ' FY' + fiscalYearEnd, Note: 'Fiscal quarter based on the configured year start' },
        { Metric: 'Month-end date', Value: formatDate(monthEnd), Note: 'Month close date' },
        { Metric: 'Quarter-end date', Value: formatDate(quarterEnd), Note: 'Quarter close date' }
      ];
      return buildResult(
        [{ label: 'Calendar quarter', value: 'Q' + calendarQuarter + ' ' + calendarYear, tone: 'neutral', help: 'Calendar quarter for the selected date.' }, { label: 'Fiscal period', value: 'P' + String(fiscalMonth).padStart(2, '0') + ' FY' + fiscalYearEnd, tone: 'positive', help: 'Fiscal month label based on your year start.' }, { label: 'Month-end date', value: formatDate(monthEnd), tone: daysToMonthEnd <= 3 ? 'warning' : 'neutral', help: 'Calendar month-end tied to the date.' }, { label: 'Days to month-end', value: formatNumber(daysToMonthEnd), tone: closeSignal ? 'warning' : 'positive', help: 'Useful when you need to spot cutoff pressure.' }],
        [{ title: 'Close-window signal', value: closeSignal ? 'Inside window' : 'Outside window', tone: closeSignal ? 'warning' : 'positive', text: 'Flag dates close to the end of the month before cutoff review starts.' }, { title: 'Quarter-end distance', value: formatDays(daysToQuarterEnd), tone: daysToQuarterEnd <= 10 ? 'warning' : 'neutral', text: 'Quarter-end dates typically drive extra support and reviewer scrutiny.' }, { title: 'Fiscal year label', value: 'FY' + fiscalYearEnd, tone: 'neutral', text: 'Shown using the common end-year convention.' }],
        [{ title: 'Use both calendar and fiscal labels', text: 'When the fiscal year does not start in January, controllers often need both labels visible in support schedules.' }, { title: 'Export the tie-out memo', text: 'The exported rows give you a clean month, quarter, and fiscal-period reference for close notes and cutoff support.' }],
        [{ label: 'Calendar month', value: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(anchorDate) }, { label: 'Fiscal quarter', value: 'Q' + fiscalQuarter + ' FY' + fiscalYearEnd }, { label: 'Close-window days', value: formatNumber(closeWindowDays) }, { label: 'Quarter-end date', value: formatDate(quarterEnd) }],
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }, { key: 'Note', label: 'Note' }], rows: periodRows },
        periodRows,
        'Date conversion complete.'
      );
    },

    'currency-converter-accounting': function (values) {
      var amount = values.amount; if (amount == null) throw new Error('Enter the source amount.');
      var exchangeRate = values.exchangeRate; if (!(exchangeRate > 0)) throw new Error('Enter a positive exchange rate.');
      var sourceCurrency = String(values.sourceCurrency || 'EUR').toUpperCase();
      var targetCurrency = String(values.targetCurrency || 'USD').toUpperCase();
      var comparisonRate = values.comparisonRate;
      var convertedAmount = amount * exchangeRate;
      var inverseRate = 1 / exchangeRate;
      var comparisonAmount = comparisonRate > 0 ? amount * comparisonRate : null;
      var comparisonDelta = comparisonAmount == null ? null : convertedAmount - comparisonAmount;
      var rateType = values.rateType || 'spot';
      var rateDate = values.rateDate || '';
      var supportMemo = 'Translate ' + formatMoney(amount) + ' ' + sourceCurrency + ' into ' + targetCurrency + ' at ' + exchangeRate.toFixed(6) + ' using the ' + rateType + ' rate dated ' + formatDate(rateDate) + '.';
      var exportRows = [
        { Line: 'Source amount', Value: amount, Note: sourceCurrency },
        { Line: 'Exchange rate', Value: exchangeRate.toFixed(6), Note: targetCurrency + ' per ' + sourceCurrency },
        { Line: 'Converted amount', Value: Math.round(convertedAmount * 100) / 100, Note: targetCurrency },
        { Line: 'Inverse rate', Value: inverseRate.toFixed(6), Note: sourceCurrency + ' per ' + targetCurrency },
        { Line: 'Rate date', Value: rateDate || 'Not provided', Note: rateType }
      ];
      if (comparisonDelta != null) exportRows.push({ Line: 'Difference vs comparison rate', Value: Math.round(comparisonDelta * 100) / 100, Note: comparisonRate.toFixed(6) + ' comparison rate' });
      return buildResult(
        [{ label: 'Converted amount', value: formatMoney(convertedAmount), tone: 'positive', help: 'Translated value using the approved rate you entered.' }, { label: 'Exchange rate', value: exchangeRate.toFixed(6), tone: 'neutral', help: targetCurrency + ' per one ' + sourceCurrency + '.' }, { label: 'Inverse rate', value: inverseRate.toFixed(6), tone: 'neutral', help: sourceCurrency + ' per one ' + targetCurrency + '.' }, { label: 'Comparison delta', value: comparisonDelta == null ? 'Not used' : formatMoney(comparisonDelta), tone: comparisonDelta == null ? 'neutral' : (Math.abs(comparisonDelta) > 0 ? 'warning' : 'positive'), help: 'Difference versus the optional comparison rate.' }],
        [{ title: 'Support memo', value: rateType, tone: rateDate ? 'positive' : 'warning', text: supportMemo }, { title: 'Rate-date completeness', value: rateDate ? formatDate(rateDate) : 'Missing', tone: rateDate ? 'positive' : 'critical', text: 'Reviewers usually want the rate date and rate type preserved with the support.' }, { title: 'Translation sensitivity', value: comparisonDelta == null ? 'No comparison' : formatMoney(Math.abs(comparisonDelta)), tone: comparisonDelta == null ? 'neutral' : 'warning', text: 'Use the optional comparison rate to see how much the translation changes.' }],
        [{ title: 'Manual rates fit accounting policy better', text: 'This page is built around approved rates from your policy or source system, not live internet rates that can confuse accounting support.' }, { title: 'Keep the export with the journal support', text: 'The result table is designed to travel with the workpaper or reviewer note.' }],
        [{ label: 'Source currency', value: sourceCurrency }, { label: 'Target currency', value: targetCurrency }, { label: 'Rate type', value: rateType }, { label: 'Rate date', value: formatDate(rateDate) }],
        { columns: [{ key: 'Line', label: 'Line' }, { key: 'Value', label: 'Value' }, { key: 'Note', label: 'Note' }], rows: exportRows },
        exportRows,
        'Currency conversion complete.'
      );
    },

    'thousands-millions-converter': function (values) {
      var amount = values.amount; if (amount == null) throw new Error('Enter the value you want to scale.');
      var sourceUnit = values.sourceUnit || 'ones';
      var preferredScale = values.preferredScale || 'millions';
      var decimals = Math.max(0, Math.min(4, Math.round(values.decimals || 1)));
      var scales = { ones: 1, thousands: 1000, millions: 1000000, billions: 1000000000 };
      var labels = { ones: 'Exact units', thousands: 'Thousands', millions: 'Millions', billions: 'Billions' };
      var exactValue = amount * scales[sourceUnit];
      var scaledValue = exactValue / scales[preferredScale];
      var roundedDisplay = Number(scaledValue.toFixed(decimals));
      var reconstructedExact = roundedDisplay * scales[preferredScale];
      var roundingGap = reconstructedExact - exactValue;
      var rows = [
        { Scale: 'Exact units', Value: exactValue, Note: 'Value in full units' },
        { Scale: 'Thousands', Value: exactValue / 1000, Note: 'Value divided by 1,000' },
        { Scale: 'Millions', Value: exactValue / 1000000, Note: 'Value divided by 1,000,000' },
        { Scale: 'Billions', Value: exactValue / 1000000000, Note: 'Value divided by 1,000,000,000' }
      ];
      return buildResult(
        [{ label: 'Preferred display', value: roundedDisplay.toFixed(decimals) + ' ' + labels[preferredScale], tone: 'positive', help: 'Rounded to the scale you selected for presentation.' }, { label: 'Exact amount', value: formatNumber(exactValue), tone: 'neutral', help: 'Value converted back into exact units.' }, { label: 'Thousands', value: (exactValue / 1000).toFixed(2), tone: 'neutral', help: 'Useful for reporting packs and commentary decks.' }, { label: 'Millions', value: (exactValue / 1000000).toFixed(3), tone: 'neutral', help: 'Useful for board, lender, and investor materials.' }],
        [{ title: 'Rounding gap', value: formatNumber(roundingGap), tone: Math.abs(roundingGap) > 1000 ? 'warning' : 'positive', text: 'Shows the difference created when you round the presentation figure.' }, { title: 'Source scale', value: labels[sourceUnit], tone: 'neutral', text: 'The input can already be in thousands, millions, or billions.' }, { title: 'Reconstructed exact value', value: formatNumber(reconstructedExact), tone: 'neutral', text: 'Helpful when you need to explain why a rounded deck number does not tie exactly to the source schedule.' }],
        [{ title: 'Move between workpaper and deck views', text: 'Finance teams constantly shift between exact-unit schedules and scaled management-reporting numbers.' }, { title: 'Keep the rounding difference visible', text: 'A visible rounding gap avoids late-stage review questions about why a scaled figure no longer ties.' }],
        [{ label: 'Source scale', value: labels[sourceUnit] }, { label: 'Preferred scale', value: labels[preferredScale] }, { label: 'Display decimals', value: formatNumber(decimals) }, { label: 'Rounded display', value: roundedDisplay.toFixed(decimals) }],
        { columns: [{ key: 'Scale', label: 'Scale' }, { key: 'Value', label: 'Value' }, { key: 'Note', label: 'Note' }], rows: rows },
        rows,
        'Number scaling complete.'
      );
    },

    'dso-calculator': function (values) {
      var endingAr = values.endingAr; if (!(endingAr >= 0)) throw new Error('Enter ending accounts receivable.');
      var creditSales = values.creditSales; if (!(creditSales > 0)) throw new Error('Enter net credit sales.');
      var beginningAr = values.beginningAr;
      var method = values.balanceMethod || 'average';
      var periodDays = values.periodDays > 0 ? values.periodDays : 90;
      var creditTermsDays = values.creditTermsDays > 0 ? values.creditTermsDays : 30;
      var receivableBase = method === 'average' && beginningAr != null ? (beginningAr + endingAr) / 2 : endingAr;
      var dailyCreditSales = creditSales / periodDays;
      var dso = receivableBase / dailyCreditSales;
      var turnover = creditSales / receivableBase;
      var cashDrag = Math.max(0, dso - creditTermsDays) * dailyCreditSales;
      var exportRows = [
        { Metric: 'Receivable balance used', Value: Math.round(receivableBase * 100) / 100, Note: method === 'average' && beginningAr != null ? 'Average AR' : 'Ending AR' },
        { Metric: 'Daily credit sales', Value: Math.round(dailyCreditSales * 100) / 100, Note: 'Credit sales divided by period days' },
        { Metric: 'DSO', Value: Math.round(dso * 100) / 100, Note: 'Average days to collect receivables' },
        { Metric: 'AR turnover', Value: Math.round(turnover * 100) / 100, Note: 'Credit sales divided by receivable balance used' }
      ];
      return buildResult(
        [{ label: 'DSO', value: formatDays(dso), tone: dso <= creditTermsDays ? 'positive' : 'warning', help: 'Average number of days it takes to collect receivables.' }, { label: 'AR turnover', value: formatRatio(turnover), tone: 'neutral', help: 'How many times receivables turn during the period.' }, { label: 'Daily credit sales', value: formatMoney(dailyCreditSales), tone: 'neutral', help: 'Useful for estimating the cash impact of slower collections.' }, { label: 'Gap vs terms', value: formatDays(dso - creditTermsDays), tone: dso <= creditTermsDays ? 'positive' : 'critical', help: 'Difference between actual collection speed and nominal terms.' }],
        [{ title: 'Working-capital drag', value: formatMoney(cashDrag), tone: cashDrag > 0 ? 'warning' : 'positive', text: 'Each excess day of DSO ties up roughly one day of credit sales in cash.' }, { title: 'Balance basis', value: method === 'average' && beginningAr != null ? 'Average AR' : 'Ending AR', tone: 'neutral', text: 'Average AR is often the better trend view when timing swings are material.' }, { title: 'Terms benchmark', value: formatNumber(creditTermsDays) + ' days', tone: dso <= creditTermsDays ? 'positive' : 'warning', text: 'Use the benchmark to frame the collections conversation.' }],
        [{ title: 'Translate DSO into cash', text: 'The daily-credit-sales card turns an abstract ratio into a working-capital conversation management can act on.' }, { title: 'Stay consistent with the balance basis', text: 'Switching between ending AR and average AR can change the trend story even when collections behavior is stable.' }],
        [{ label: 'Beginning AR', value: beginningAr == null ? 'Not used' : formatMoney(beginningAr) }, { label: 'Ending AR', value: formatMoney(endingAr) }, { label: 'Credit sales', value: formatMoney(creditSales) }, { label: 'Period days', value: formatNumber(periodDays) }],
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }, { key: 'Note', label: 'Note' }], rows: exportRows },
        exportRows,
        'DSO calculation complete.'
      );
    },

    'dpo-calculator': function (values) {
      var endingAp = values.endingAp; if (!(endingAp >= 0)) throw new Error('Enter ending accounts payable.');
      var spendBase = values.spendBase; if (!(spendBase > 0)) throw new Error('Enter purchases or COGS for the period.');
      var beginningAp = values.beginningAp;
      var method = values.balanceMethod || 'average';
      var periodDays = values.periodDays > 0 ? values.periodDays : 90;
      var paymentTermsDays = values.paymentTermsDays > 0 ? values.paymentTermsDays : 45;
      var payableBase = method === 'average' && beginningAp != null ? (beginningAp + endingAp) / 2 : endingAp;
      var dailySpend = spendBase / periodDays;
      var dpo = payableBase / dailySpend;
      var turnover = spendBase / payableBase;
      var floatValue = Math.max(0, dpo - paymentTermsDays) * dailySpend;
      var exportRows = [
        { Metric: 'Payable balance used', Value: Math.round(payableBase * 100) / 100, Note: method === 'average' && beginningAp != null ? 'Average AP' : 'Ending AP' },
        { Metric: 'Daily spend', Value: Math.round(dailySpend * 100) / 100, Note: 'Spend denominator divided by period days' },
        { Metric: 'DPO', Value: Math.round(dpo * 100) / 100, Note: 'Average days to pay suppliers' },
        { Metric: 'AP turnover', Value: Math.round(turnover * 100) / 100, Note: 'Spend denominator divided by payable balance used' }
      ];
      return buildResult(
        [{ label: 'DPO', value: formatDays(dpo), tone: dpo >= paymentTermsDays ? 'positive' : 'warning', help: 'Average number of days the company takes to pay suppliers.' }, { label: 'AP turnover', value: formatRatio(turnover), tone: 'neutral', help: 'How many times payables turn during the period.' }, { label: 'Daily spend', value: formatMoney(dailySpend), tone: 'neutral', help: 'Useful for estimating the cash effect of payment timing.' }, { label: 'Gap vs terms', value: formatDays(dpo - paymentTermsDays), tone: dpo >= paymentTermsDays ? 'positive' : 'critical', help: 'Difference between actual pay timing and supplier terms.' }],
        [{ title: 'Supplier-float value', value: formatMoney(floatValue), tone: floatValue > 0 ? 'positive' : 'warning', text: 'Each extra day of DPO preserves about one day of supplier spend in cash.' }, { title: 'Balance basis', value: method === 'average' && beginningAp != null ? 'Average AP' : 'Ending AP', tone: 'neutral', text: 'Average AP is often a cleaner trend view than a single ending snapshot.' }, { title: 'Terms benchmark', value: formatNumber(paymentTermsDays) + ' days', tone: dpo >= paymentTermsDays ? 'positive' : 'warning', text: 'Use the benchmark to separate healthy working-capital management from late-payment risk.' }],
        [{ title: 'Keep the denominator consistent', text: 'If you switch between purchases and COGS from month to month, the DPO trend becomes misleading.' }, { title: 'Pair DPO with DSO and inventory days', text: 'DPO is most useful when viewed as part of the full cash-conversion cycle.' }],
        [{ label: 'Beginning AP', value: beginningAp == null ? 'Not used' : formatMoney(beginningAp) }, { label: 'Ending AP', value: formatMoney(endingAp) }, { label: 'Spend denominator', value: formatMoney(spendBase) }, { label: 'Period days', value: formatNumber(periodDays) }],
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }, { key: 'Note', label: 'Note' }], rows: exportRows },
        exportRows,
        'DPO calculation complete.'
      );
    },

    'annualized-return-calculator': function (values) {
      var beginningValue = values.beginningValue; if (!(beginningValue > 0)) throw new Error('Enter a positive starting value.');
      var endingValue = values.endingValue; if (!(endingValue > 0)) throw new Error('Enter a positive ending value.');
      var periodLength = values.periodLength; if (!(periodLength > 0)) throw new Error('Enter a positive holding period.');
      var periodUnit = values.periodUnit || 'years';
      var years = periodUnit === 'days' ? periodLength / 365 : (periodUnit === 'months' ? periodLength / 12 : periodLength);
      if (!(years > 0)) throw new Error('Holding period must convert into a positive number of years.');
      var cumulativeReturn = (endingValue / beginningValue - 1) * 100;
      var annualizedReturn = (Math.pow(endingValue / beginningValue, 1 / years) - 1) * 100;
      var benchmarkRate = values.benchmarkRate;
      var benchmarkSpread = benchmarkRate > 0 || benchmarkRate < 0 ? annualizedReturn - benchmarkRate : null;
      var exportRows = [
        { Metric: 'Starting value', Value: Math.round(beginningValue * 100) / 100, Note: 'Initial amount' },
        { Metric: 'Ending value', Value: Math.round(endingValue * 100) / 100, Note: 'Ending amount' },
        { Metric: 'Holding period', Value: periodLength, Note: periodUnit },
        { Metric: 'Cumulative return %', Value: Math.round(cumulativeReturn * 1000) / 1000, Note: 'Total return over the holding period' },
        { Metric: 'Annualized return %', Value: Math.round(annualizedReturn * 1000) / 1000, Note: 'Equivalent yearly return' }
      ];
      if (benchmarkSpread != null) exportRows.push({ Metric: 'Benchmark spread %', Value: Math.round(benchmarkSpread * 1000) / 1000, Note: 'Annualized return minus benchmark rate' });
      return buildResult(
        [{ label: 'Annualized return', value: formatPercent(annualizedReturn, 2), tone: annualizedReturn >= 0 ? 'positive' : 'critical', help: 'Equivalent yearly rate of return over the holding period.' }, { label: 'Cumulative return', value: formatPercent(cumulativeReturn, 2), tone: cumulativeReturn >= 0 ? 'positive' : 'critical', help: 'Total return from start to finish.' }, { label: 'Ending multiple', value: formatRatio(endingValue / beginningValue), tone: 'neutral', help: 'Ending value divided by starting value.' }, { label: 'Benchmark spread', value: benchmarkSpread == null ? 'Not used' : formatPercent(benchmarkSpread, 2), tone: benchmarkSpread == null ? 'neutral' : (benchmarkSpread >= 0 ? 'positive' : 'warning'), help: 'Difference versus the optional benchmark rate.' }],
        [{ title: 'Holding-period sensitivity', value: periodUnit === 'days' ? formatNumber(periodLength) + ' days' : (periodUnit === 'months' ? formatNumber(periodLength) + ' months' : formatNumber(periodLength) + ' years'), tone: years < 1 ? 'warning' : 'neutral', text: 'Annualized returns can look extreme when the holding period is short.' }, { title: 'Absolute value change', value: formatMoney(endingValue - beginningValue), tone: endingValue >= beginningValue ? 'positive' : 'critical', text: 'Always compare the percentage with the actual dollar gain or loss.' }, { title: 'Benchmark context', value: benchmarkRate == null ? 'No benchmark' : formatPercent(benchmarkRate, 2), tone: benchmarkRate == null ? 'neutral' : (benchmarkSpread >= 0 ? 'positive' : 'warning'), text: 'Benchmark context helps avoid overstating an isolated result.' }],
        [{ title: 'Use annualization for comparability', text: 'Annualized return is useful when you need to compare outcomes across different time horizons.' }, { title: 'Do not ignore interim cash flows', text: 'If there are additional contributions or withdrawals, use IRR or XIRR instead of a simple annualized-return formula.' }],
        [{ label: 'Starting value', value: formatMoney(beginningValue) }, { label: 'Ending value', value: formatMoney(endingValue) }, { label: 'Holding period', value: formatNumber(periodLength) + ' ' + periodUnit }, { label: 'Benchmark rate', value: benchmarkRate == null ? 'Not used' : formatPercent(benchmarkRate, 2) }],
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }, { key: 'Note', label: 'Note' }], rows: exportRows },
        exportRows,
        'Annualized return calculation complete.'
      );
    },

    'compound-interest-calculator': function (values) {
      var principal = values.principal; if (!(principal >= 0)) throw new Error('Enter a starting principal.');
      var annualRate = values.annualRate; if (!(annualRate >= 0)) throw new Error('Enter a valid annual rate.');
      var years = values.years; if (!(years > 0)) throw new Error('Enter a term longer than zero.');
      var frequency = values.frequency || 'monthly';
      var periodicContribution = values.periodicContribution || 0;
      var periodsPerYear = { annually: 1, semiannually: 2, quarterly: 4, monthly: 12, daily: 365 }[frequency] || 12;
      var periodicRate = (annualRate / 100) / periodsPerYear;
      var totalPeriods = Math.round(years * periodsPerYear);
      var balance = principal;
      var totalContributions = principal;
      var rows = [];
      for (var period = 1; period <= totalPeriods; period += 1) {
        balance = balance * (1 + periodicRate) + periodicContribution;
        totalContributions += periodicContribution;
        if (period % periodsPerYear === 0 || period === totalPeriods) {
          rows.push({ Year: period / periodsPerYear, Balance: balance, Contributions: totalContributions, Interest: balance - totalContributions });
        }
      }
      var interestEarned = balance - totalContributions;
      var effectiveAnnualRate = (Math.pow(1 + periodicRate, periodsPerYear) - 1) * 100;
      return buildResult(
        [{ label: 'Future value', value: formatMoney(balance), tone: 'positive', help: 'Ending balance after compounding and recurring contributions.' }, { label: 'Interest earned', value: formatMoney(interestEarned), tone: interestEarned >= 0 ? 'positive' : 'neutral', help: 'Growth produced by compounding, net of contributions.' }, { label: 'Total contributions', value: formatMoney(totalContributions), tone: 'neutral', help: 'Starting principal plus every recurring contribution.' }, { label: 'Effective annual rate', value: formatPercent(effectiveAnnualRate, 2), tone: 'neutral', help: 'Actual yearly rate once compounding frequency is considered.' }],
        [{ title: 'Compounding frequency', value: frequency, tone: periodsPerYear >= 12 ? 'positive' : 'neutral', text: 'More frequent compounding increases the effective annual rate.' }, { title: 'Contribution cadence', value: periodicContribution > 0 ? formatMoney(periodicContribution) + ' each period' : 'None', tone: periodicContribution > 0 ? 'positive' : 'neutral', text: 'Regular contributions often matter more than small rate changes.' }, { title: 'Growth mix', value: totalContributions > 0 ? formatPercent((interestEarned / totalContributions) * 100, 1) : '0%', tone: interestEarned > 0 ? 'positive' : 'neutral', text: 'Shows how much growth came from compounding versus contributed cash.' }],
        [{ title: 'Use the yearly schedule in planning', text: 'The exported year-by-year schedule is useful in reserve planning, retirement conversations, and finance reviews.' }, { title: 'Compare rate and savings discipline together', text: 'A slightly lower rate with stronger recurring contributions can outperform a higher rate with weak savings habits.' }],
        [{ label: 'Starting principal', value: formatMoney(principal) }, { label: 'Nominal annual rate', value: formatPercent(annualRate, 2) }, { label: 'Compounding periods per year', value: formatNumber(periodsPerYear) }, { label: 'Recurring contribution', value: periodicContribution > 0 ? formatMoney(periodicContribution) : 'None' }],
        { columns: [{ key: 'Year', label: 'Year', type: 'number' }, { key: 'Balance', label: 'Ending Balance', type: 'money', align: 'right' }, { key: 'Contributions', label: 'Total Contributions', type: 'money', align: 'right' }, { key: 'Interest', label: 'Interest Earned', type: 'money', align: 'right' }], rows: rows },
        rows.map(function (row) { return { Year: row.Year, Balance: Math.round(row.Balance), Contributions: Math.round(row.Contributions), Interest: Math.round(row.Interest) }; }),
        'Compound interest projection complete.'
      );
    },

    'financial-ratio-quick-reference': function (values) {
      var family = values.family || 'all';
      var search = normalizeText(values.search || '');
      var library = [
        { family: 'Liquidity', Ratio: 'Current Ratio', Formula: 'Current Assets / Current Liabilities', Use: 'Measures short-term liquidity coverage.', Watchout: 'A strong ratio can still hide weak inventory quality.' },
        { family: 'Liquidity', Ratio: 'Quick Ratio', Formula: '(Cash + Securities + Receivables) / Current Liabilities', Use: 'Focuses on near-cash liquidity.', Watchout: 'Receivables quality still matters.' },
        { family: 'Profitability', Ratio: 'Gross Margin', Formula: '(Revenue - COGS) / Revenue', Use: 'Shows how much revenue remains after direct costs.', Watchout: 'Mix shifts can move margin without price changes.' },
        { family: 'Profitability', Ratio: 'EBITDA Margin', Formula: 'EBITDA / Revenue', Use: 'Measures operating earnings before non-cash and financing items.', Watchout: 'It can overstate cash-generation quality.' },
        { family: 'Efficiency', Ratio: 'DSO', Formula: 'Accounts Receivable / Credit Sales x Days', Use: 'Tracks collection speed.', Watchout: 'Keep the day count and sales basis consistent.' },
        { family: 'Efficiency', Ratio: 'DPO', Formula: 'Accounts Payable / Purchases or COGS x Days', Use: 'Tracks payment timing.', Watchout: 'A higher DPO can signal late-payment risk.' },
        { family: 'Efficiency', Ratio: 'Asset Turnover', Formula: 'Revenue / Average Total Assets', Use: 'Measures how efficiently assets generate sales.', Watchout: 'Capital-intensive sectors naturally run lower turnover.' },
        { family: 'Leverage', Ratio: 'Debt to Equity', Formula: 'Total Debt / Total Equity', Use: 'Shows how much financing comes from debt.', Watchout: 'A thin equity base can make the ratio spike quickly.' },
        { family: 'Leverage', Ratio: 'Interest Coverage', Formula: 'EBIT / Interest Expense', Use: 'Measures the ability to service interest cost.', Watchout: 'Use the same earnings definition every period.' },
        { family: 'Cash Flow', Ratio: 'Operating Cash Flow Ratio', Formula: 'Operating Cash Flow / Current Liabilities', Use: 'Compares operating cash generation with short-term obligations.', Watchout: 'Working-capital timing can distort the picture.' },
        { family: 'Cash Flow', Ratio: 'Free Cash Flow Margin', Formula: 'Free Cash Flow / Revenue', Use: 'Shows how much revenue turns into discretionary cash.', Watchout: 'Heavy growth capex can compress the metric by design.' }
      ];
      var filtered = library.filter(function (item) {
        var familyMatch = family === 'all' || normalizeText(item.family) === normalizeText(family);
        var searchMatch = !search || normalizeText(item.Ratio + ' ' + item.Formula + ' ' + item.Use + ' ' + item.Watchout).indexOf(search) !== -1;
        return familyMatch && searchMatch;
      });
      return buildResult(
        [{ label: 'Ratios shown', value: formatNumber(filtered.length), tone: filtered.length ? 'positive' : 'warning', help: 'Current result count after search and family filtering.' }, { label: 'Families represented', value: formatNumber(new Set(filtered.map(function (item) { return item.family; })).size), tone: 'neutral', help: 'Distinct ratio families in the current filtered set.' }, { label: 'Search term', value: search || 'None', tone: 'neutral', help: 'Live filter applied to the ratio library.' }, { label: 'Selected family', value: family === 'all' ? 'All' : family, tone: 'neutral', help: 'Family filter currently selected.' }],
        [{ title: 'Reference mode', value: filtered.length ? 'Active' : 'No matches', tone: filtered.length ? 'positive' : 'warning', text: 'This page is designed to answer the formula question quickly without forcing a long article-first workflow.' }, { title: 'Top result', value: filtered.length ? filtered[0].Ratio : 'None', tone: 'neutral', text: filtered.length ? filtered[0].Use : 'Broaden the search or switch families.' }, { title: 'Export status', value: filtered.length ? 'Ready' : 'None', tone: filtered.length ? 'positive' : 'neutral', text: 'Export the filtered list to keep definitions consistent across the team.' }],
        [{ title: 'Keep formulas and interpretation together', text: 'A ratio formula without its caution note often creates more confusion than clarity.' }, { title: 'Use one internal definition set', text: 'A shared reference list reduces numerator and denominator drift across decks, models, and review packs.' }],
        [{ label: 'Current family filter', value: family === 'all' ? 'All families' : family }, { label: 'Search text', value: search || 'None' }, { label: 'Exportable rows', value: formatNumber(filtered.length) }, { label: 'Primary use', value: filtered.length ? filtered[0].Use : 'No current match' }],
        { columns: [{ key: 'family', label: 'Family' }, { key: 'Ratio', label: 'Ratio' }, { key: 'Formula', label: 'Formula' }, { key: 'Use', label: 'Use' }, { key: 'Watchout', label: 'Watchout' }], rows: filtered.map(function (item) { return { family: item.family, Ratio: item.Ratio, Formula: item.Formula, Use: item.Use, Watchout: item.Watchout }; }) },
        filtered.map(function (item) { return { Family: item.family, Ratio: item.Ratio, Formula: item.Formula, Use: item.Use, Watchout: item.Watchout }; }),
        'Financial ratio reference updated.'
      );
    },

    'accounting-equation-checker': function (values) {
      var assets = values.assets; if (!(assets >= 0)) throw new Error('Enter total assets.');
      var liabilities = values.liabilities; if (!(liabilities >= 0)) throw new Error('Enter total liabilities.');
      var baseEquity = values.baseEquity; if (!(baseEquity >= 0)) throw new Error('Enter base equity.');
      var netIncome = values.netIncome || 0;
      var distributions = values.distributions || 0;
      var adjustedEquity = baseEquity + netIncome - distributions;
      var requiredEquity = assets - liabilities;
      var gap = adjustedEquity - requiredEquity;
      var balanced = Math.abs(gap) < 0.01;
      var exportRows = [
        { Line: 'Assets', Value: assets, Note: 'Total asset balance' },
        { Line: 'Liabilities', Value: liabilities, Note: 'Total liability balance' },
        { Line: 'Base equity', Value: baseEquity, Note: 'Equity before current-period adjustments' },
        { Line: 'Current-period net income', Value: netIncome, Note: 'Optional current-period earnings' },
        { Line: 'Distributions', Value: distributions, Note: 'Optional equity reduction' },
        { Line: 'Adjusted equity', Value: adjustedEquity, Note: 'Base equity plus income less distributions' },
        { Line: 'Required equity', Value: requiredEquity, Note: 'Assets minus liabilities' },
        { Line: 'Equation gap', Value: gap, Note: 'Difference still requiring explanation' }
      ];
      return buildResult(
        [{ label: 'Equation status', value: balanced ? 'Balanced' : 'Out of balance', tone: balanced ? 'positive' : 'critical', help: 'Whether adjusted equity equals assets minus liabilities.' }, { label: 'Required equity', value: formatMoney(requiredEquity), tone: 'neutral', help: 'Assets less liabilities.' }, { label: 'Adjusted equity', value: formatMoney(adjustedEquity), tone: balanced ? 'positive' : 'warning', help: 'Base equity after current-period adjustments.' }, { label: 'Gap', value: formatMoney(gap), tone: balanced ? 'positive' : 'critical', help: 'Amount still unexplained.' }],
        [{ title: 'Current-period activity', value: netIncome !== 0 ? formatMoney(netIncome) : 'None entered', tone: netIncome !== 0 ? 'neutral' : 'warning', text: 'If the equation is off, current-period income is one of the first places to check.' }, { title: 'Distribution visibility', value: distributions !== 0 ? formatMoney(distributions) : 'None entered', tone: distributions !== 0 ? 'neutral' : 'positive', text: 'Keeping distributions explicit usually makes equity bridges easier to explain.' }, { title: 'Gap signal', value: balanced ? 'No remaining gap' : formatMoney(gap), tone: balanced ? 'positive' : 'critical', text: 'A persistent gap usually points to misclassification, sign error, or incomplete equity activity.' }],
        [{ title: 'Use it before deeper tie-outs', text: 'A fast accounting-equation check can catch obvious balance-sheet logic issues before reconciliations begin.' }, { title: 'Make equity movements explicit', text: 'Separate base equity, current income, and distributions instead of hiding them in one line.' }],
        [{ label: 'Assets', value: formatMoney(assets) }, { label: 'Liabilities', value: formatMoney(liabilities) }, { label: 'Base equity', value: formatMoney(baseEquity) }, { label: 'Adjusted equity', value: formatMoney(adjustedEquity) }],
        { columns: [{ key: 'Line', label: 'Line' }, { key: 'Value', label: 'Value', type: 'money', align: 'right' }, { key: 'Note', label: 'Note' }], rows: exportRows },
        exportRows.map(function (row) { return { Line: row.Line, Value: Math.round(row.Value), Note: row.Note }; }),
        balanced ? 'The accounting equation balances.' : 'The accounting equation does not balance with the current inputs.'
      );
    },

    'invoice-payment-terms-calculator': function (values) {
      var invoiceAmount = values.invoiceAmount; if (!(invoiceAmount >= 0)) throw new Error('Enter the invoice amount.');
      var invoiceDate = parseDate(values.invoiceDate); if (!invoiceDate) throw new Error('Choose the invoice date.');
      var preset = values.termsPreset || 'net30';
      var presetMap = { due_on_receipt: { netDays: 0, discountDays: 0, discountPercent: 0 }, net15: { netDays: 15, discountDays: 0, discountPercent: 0 }, net30: { netDays: 30, discountDays: 0, discountPercent: 0 }, net45: { netDays: 45, discountDays: 0, discountPercent: 0 }, net60: { netDays: 60, discountDays: 0, discountPercent: 0 }, '2_10_net30': { netDays: 30, discountDays: 10, discountPercent: 2 }, '1_10_net30': { netDays: 30, discountDays: 10, discountPercent: 1 }, '2_15_net45': { netDays: 45, discountDays: 15, discountPercent: 2 } };
      var rule = preset === 'custom' ? { netDays: Math.max(0, Math.round(values.netDays || 0)), discountDays: Math.max(0, Math.round(values.discountDays || 0)), discountPercent: Math.max(0, values.discountPercent || 0) } : presetMap[preset];
      var dueDate = addDays(invoiceDate, rule.netDays);
      var discountDate = rule.discountDays > 0 ? addDays(invoiceDate, rule.discountDays) : null;
      var discountAmount = invoiceAmount * (rule.discountPercent / 100);
      var discountedPayment = invoiceAmount - discountAmount;
      var skipDiscountCost = (rule.discountPercent > 0 && rule.netDays > rule.discountDays) ? (((rule.discountPercent / 100) / (1 - (rule.discountPercent / 100))) * (360 / (rule.netDays - rule.discountDays))) * 100 : null;
      var exportRows = [
        { Metric: 'Invoice date', Value: formatDate(invoiceDate), Note: 'Base date for payment terms' },
        { Metric: 'Due date', Value: formatDate(dueDate), Note: 'Date the invoice is due in full' },
        { Metric: 'Invoice amount', Value: invoiceAmount, Note: 'Gross amount before discount' },
        { Metric: 'Discount deadline', Value: discountDate ? formatDate(discountDate) : 'No discount', Note: 'Early-payment deadline' },
        { Metric: 'Discount amount', Value: discountAmount, Note: 'Dollar value of early payment discount' }
      ];
      return buildResult(
        [{ label: 'Due date', value: formatDate(dueDate), tone: 'positive', help: 'Date the full amount is due.' }, { label: 'Early-pay deadline', value: discountDate ? formatDate(discountDate) : 'No discount', tone: discountDate ? 'warning' : 'neutral', help: 'Date by which payment must be made to capture the discount.' }, { label: 'Discounted payment', value: discountDate ? formatMoney(discountedPayment) : 'No discount', tone: discountDate ? 'positive' : 'neutral', help: 'Amount due if the discount is taken.' }, { label: 'Discount value', value: discountDate ? formatMoney(discountAmount) : 'No discount', tone: discountDate ? 'positive' : 'neutral', help: 'Dollar value of paying early.' }],
        [{ title: 'Terms preset', value: labelizeTermPreset(preset), tone: 'neutral', text: 'Use a common preset or switch to custom terms.' }, { title: 'Cost of skipping discount', value: skipDiscountCost == null ? 'N/A' : formatPercent(skipDiscountCost, 1), tone: skipDiscountCost && skipDiscountCost > 10 ? 'warning' : 'neutral', text: 'For discount terms, this approximates the annualized cost of paying late instead of taking the discount.' }, { title: 'Calendar clarity', value: formatNumber(rule.netDays) + ' days', tone: 'positive', text: 'The calculator translates invoice language into actual dates AP and AR teams can use.' }],
        [{ title: 'Use presets before editing manually', text: 'Preset terms reduce avoidable due-date errors when teams work quickly through batches of invoices.' }, { title: 'Make discount economics visible', text: 'The annualized discount-cost signal helps frame whether early payment is financially attractive.' }],
        [{ label: 'Invoice amount', value: formatMoney(invoiceAmount) }, { label: 'Net days', value: formatNumber(rule.netDays) }, { label: 'Discount days', value: formatNumber(rule.discountDays) }, { label: 'Discount percent', value: formatPercent(rule.discountPercent, 2) }],
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }, { key: 'Note', label: 'Note' }], rows: exportRows },
        exportRows.map(function (row) { return { Metric: row.Metric, Value: row.Value, Note: row.Note }; }),
        'Invoice payment terms calculation complete.'
      );
    },

    'tax-bracket-visualizer': function (values) {
      var income = values.grossIncome; if (!(income > 0)) throw new Error('Enter your gross income.');
      var status = values.filingStatus || 'single';
      var deductionType = values.deductionType || 'standard';
      var itemizedAmount = values.itemizedDeductions || 0;
      var retirement = values.retirementContributions || 0;
      var stdDed = { single: 15700, married_joint: 31400, married_separate: 15700, head_of_household: 23600 };
      var sd = stdDed[status] || 15700;
      var deduction = deductionType === 'itemized' ? Math.max(itemizedAmount, sd) : sd;
      var agi = Math.max(0, income - retirement);
      var taxable = Math.max(0, agi - deduction);
      var brackets = status === 'married_joint' ? [[0, 23200, 0.10], [23200, 94200, 0.12], [94200, 201050, 0.22], [201050, 383900, 0.24], [383900, 487450, 0.32], [487450, 731200, 0.35], [731200, Infinity, 0.37]] : status === 'head_of_household' ? [[0, 16550, 0.10], [16550, 63100, 0.12], [63100, 100500, 0.22], [100500, 191950, 0.24], [191950, 243700, 0.32], [243700, 609350, 0.35], [609350, Infinity, 0.37]] : [[0, 11600, 0.10], [11600, 47150, 0.12], [47150, 100525, 0.22], [100525, 191950, 0.24], [191950, 243725, 0.32], [243725, 609350, 0.35], [609350, Infinity, 0.37]];
      var totalTax = 0, rows = [], exportRows = [], marginalRate = 0;
      brackets.forEach(function (b) { var lo = b[0], hi = b[1], rate = b[2]; var bracketIncome = Math.max(0, Math.min(taxable, hi) - lo); var bracketTax = bracketIncome * rate; if (bracketIncome > 0) marginalRate = rate * 100; totalTax += bracketTax; rows.push({ bracket: formatPercent(rate * 100, 0), range: formatMoney(lo) + ' – ' + (hi === Infinity ? '∞' : formatMoney(hi)), income: formatMoney(bracketIncome), tax: formatMoney(bracketTax) }); exportRows.push({ Rate: (rate * 100).toFixed(0) + '%', 'Income in bracket': Math.round(bracketIncome), Tax: Math.round(bracketTax) }); });
      var effectiveRate = income > 0 ? totalTax / income * 100 : 0;
      var effectiveOnTaxable = taxable > 0 ? totalTax / taxable * 100 : 0;
      var topBracketStart = brackets.filter(function (b) { return b[2] * 100 === marginalRate; })[0];
      return buildResult(
        [{ label: 'Total federal income tax', value: formatMoney(totalTax), tone: 'neutral', help: 'Sum of tax from all brackets on your taxable income.' }, { label: 'Effective tax rate (on gross)', value: formatPercent(effectiveRate, 1), tone: 'positive', help: 'Total tax as a percentage of gross income — what you actually pay.' }, { label: 'Marginal tax rate', value: formatPercent(marginalRate, 0), tone: 'neutral', help: 'Rate on your last dollar of income. NOT what you pay on all income.' }, { label: 'Taxable income', value: formatMoney(taxable), tone: 'neutral', help: 'Income after deductions — the amount subject to federal tax brackets.' }],
        [{ title: 'Deduction used', value: formatMoney(deduction), tone: 'neutral', text: deductionType === 'itemized' ? 'Itemized deductions applied.' : 'Standard deduction for ' + status.replace(/_/g, ' ') + '.' }, { title: 'Tax-sheltered income', value: formatMoney(retirement), tone: retirement > 0 ? 'positive' : 'neutral', text: 'Pre-tax retirement contributions reduce AGI before brackets apply.' }, { title: 'Effective rate on taxable', value: formatPercent(effectiveOnTaxable, 1), tone: 'neutral', text: 'Tax as a percentage of taxable income only.' }, { title: 'Key insight', value: 'Brackets are marginal', tone: 'positive', text: 'You pay ' + formatPercent(marginalRate, 0) + ' only on income above ' + formatMoney(topBracketStart ? topBracketStart[0] : 0) + ', not on all income.' }],
        [{ title: 'You do NOT pay ' + formatPercent(marginalRate, 0) + ' on all your income', text: 'Tax brackets are marginal: each rate applies only to income within that range. Your effective rate (' + formatPercent(effectiveRate, 1) + ') is what you actually pay.' }, { title: 'Deductions shift income down through brackets', text: 'Every dollar of deduction removes income from your top bracket first, saving you ' + formatPercent(marginalRate, 0) + ' per dollar.' }, { title: 'Pre-tax retirement contributions double-save', text: 'Contributing to a 401(k) or Traditional IRA reduces AGI now and defers tax until retirement when you may be in a lower bracket.' }],
        [{ label: 'Gross income', value: formatMoney(income) }, { label: 'Filing status', value: status.replace(/_/g, ' ') }, { label: 'Deduction', value: formatMoney(deduction) + ' (' + deductionType + ')' }, { label: 'Retirement contributions', value: formatMoney(retirement) }, { label: 'AGI', value: formatMoney(agi) }, { label: 'Taxable income', value: formatMoney(taxable) }, { label: 'Federal tax', value: formatMoney(totalTax) }, { label: 'Effective rate', value: formatPercent(effectiveRate, 1) }, { label: 'Marginal rate', value: formatPercent(marginalRate, 0) }],
        { columns: [{ key: 'bracket', label: 'Bracket' }, { key: 'range', label: 'Income range' }, { key: 'income', label: 'Your income in bracket', align: 'right' }, { key: 'tax', label: 'Tax', align: 'right' }], rows: rows },
        exportRows, 'Tax bracket breakdown complete.'
      );
    },

    'side-hustle-tax-calculator': function (values) {
      var sideIncome = values.sideHustleIncome; if (!(sideIncome > 0)) throw new Error('Enter your side hustle gross income.');
      var expenses = values.businessExpenses || 0, w2Income = values.w2Income || 0, status = values.filingStatus || 'single', stateRate = values.stateTaxRate || 5;
      var netProfit = Math.max(0, sideIncome - expenses);
      var seBase = netProfit * 0.9235, ssWageBase = 184500;
      var remainingSS = Math.max(0, ssWageBase - Math.min(w2Income, ssWageBase));
      var ssTax = Math.min(seBase, remainingSS) * 0.124, mediTax = seBase * 0.029;
      var addlMedi = Math.max(0, w2Income + netProfit - (status === 'married_joint' ? 250000 : 200000)) * 0.009;
      var totalSE = ssTax + mediTax + addlMedi, halfSE = totalSE * 0.5;
      var sd = { single: 15700, married_joint: 31400, married_separate: 15700, head_of_household: 23600 }[status] || 15700;
      var bk = status === 'married_joint' ? [[23200, 0.10], [94200, 0.12], [201050, 0.22], [383900, 0.24], [487450, 0.32], [731200, 0.35], [Infinity, 0.37]] : [[11600, 0.10], [47150, 0.12], [100525, 0.22], [191950, 0.24], [243725, 0.32], [609350, 0.35], [Infinity, 0.37]];
      var calcTax = function (ti) { var tax = 0, p = 0; bk.forEach(function (b) { var top = Math.min(ti, b[0]); if (top > p) { tax += (top - p) * b[1]; p = top; } }); return tax; };
      var totalFed = calcTax(Math.max(0, w2Income + netProfit - halfSE - sd));
      var w2Only = calcTax(Math.max(0, w2Income - sd));
      var incrTax = totalFed - w2Only, stateTax = netProfit * stateRate / 100;
      var totalTaxOnSide = totalSE + incrTax + stateTax;
      var keepRate = sideIncome > 0 ? (sideIncome - totalTaxOnSide - expenses) / sideIncome * 100 : 0;
      var quarterly = Math.max(0, totalTaxOnSide / 4);
      return buildResult(
        [{ label: 'Total tax on side hustle', value: formatMoney(totalTaxOnSide), tone: 'warning', help: 'Combined self-employment tax, incremental income tax, and state tax on your side income.' }, { label: 'Self-employment tax', value: formatMoney(totalSE), tone: 'neutral', help: 'Social Security (12.4%) + Medicare (2.9%) on 92.35% of net profit.' }, { label: 'You keep per dollar', value: formatPercent(keepRate, 1), tone: keepRate >= 60 ? 'positive' : 'warning', help: 'After expenses and all taxes, what you keep from each gross dollar.' }, { label: 'Quarterly estimated payment', value: formatMoney(quarterly), tone: 'neutral', help: 'Divide annual side hustle tax by 4. Due Apr 15, Jun 15, Sep 15, Jan 15.' }],
        [{ title: 'Net profit', value: formatMoney(netProfit), tone: 'positive', text: 'Gross income minus business expenses.' }, { title: 'SE tax base', value: formatMoney(seBase), tone: 'neutral', text: '92.35% of net profit — the IRS adjusts the base before applying SE rates.' }, { title: 'Incremental income tax', value: formatMoney(incrTax), tone: 'neutral', text: 'Additional federal income tax caused by adding side income to your W-2 income.' }, { title: 'Half-SE deduction', value: formatMoney(halfSE), tone: 'positive', text: 'You deduct half of SE tax from AGI, reducing your income tax.' }],
        [{ title: 'Side income is taxed on top of W-2 income', text: 'Your side hustle profit stacks on top of your W-2 salary, potentially pushing you into a higher bracket.' }, { title: 'Make quarterly estimated payments', text: 'If you owe more than $1,000 at filing, the IRS may charge an underpayment penalty. Pay quarterly to stay safe.' }, { title: 'Track every deductible expense', text: 'Business expenses reduce both income tax and self-employment tax. Mileage, home office, supplies, and software add up fast.' }],
        [{ label: 'Side hustle gross', value: formatMoney(sideIncome) }, { label: 'Expenses', value: formatMoney(expenses) }, { label: 'Net profit', value: formatMoney(netProfit) }, { label: 'W-2 income', value: formatMoney(w2Income) }, { label: 'SE tax', value: formatMoney(totalSE) }, { label: 'Incremental income tax', value: formatMoney(incrTax) }, { label: 'State tax', value: formatMoney(stateTax) }, { label: 'Total side hustle tax', value: formatMoney(totalTaxOnSide) }, { label: 'Quarterly payment', value: formatMoney(quarterly) }],
        { columns: [{ key: 'item', label: 'Tax component' }, { key: 'amount', label: 'Amount', align: 'right' }, { key: 'note', label: 'Note' }], rows: [{ item: 'Net profit', amount: formatMoney(netProfit), note: 'Gross minus expenses' }, { item: 'Social Security', amount: formatMoney(ssTax), note: '12.4% on SE base up to wage limit' }, { item: 'Medicare', amount: formatMoney(mediTax + addlMedi), note: '2.9% + 0.9% additional if applicable' }, { item: 'Federal income tax', amount: formatMoney(incrTax), note: 'Incremental from higher bracket' }, { item: 'State tax', amount: formatMoney(stateTax), note: stateRate + '% on net profit' }, { item: 'Total', amount: formatMoney(totalTaxOnSide), note: 'SE + income + state' }, { item: 'Net kept', amount: formatMoney(sideIncome - expenses - totalTaxOnSide), note: 'What you actually keep' }] },
        [{ Component: 'SE tax', Amount: Math.round(totalSE) }, { Component: 'Income tax', Amount: Math.round(incrTax) }, { Component: 'State', Amount: Math.round(stateTax) }, { Component: 'Total', Amount: Math.round(totalTaxOnSide) }],
        'Side hustle tax estimate complete.'
      );
    },

    'savings-rate-calculator': function (values) {
      var grossIncome = values.grossIncome; if (!(grossIncome > 0)) throw new Error('Enter your gross annual income.');
      var taxes = values.annualTaxes || 0, retirement = values.retirementContributions || 0, employerMatch = values.employerMatch || 0;
      var hsaIra = values.hsaIraContributions || 0, taxableSavings = values.taxableInvestments || 0, otherSavings = values.otherSavings || 0;
      var totalSavings = retirement + employerMatch + hsaIra + taxableSavings + otherSavings;
      var netIncome = grossIncome - taxes;
      var grossRate = grossIncome > 0 ? totalSavings / grossIncome * 100 : 0;
      var netRate = netIncome > 0 ? totalSavings / netIncome * 100 : 0;
      var fiRate = (grossIncome + employerMatch) > 0 ? totalSavings / (grossIncome + employerMatch) * 100 : 0;
      var spending = Math.max(0, netIncome - (retirement + hsaIra + taxableSavings + otherSavings));
      var yearsToFI = function (sr) { if (sr <= 0) return 99; if (sr >= 100) return 0; var s = sr / 100; return Math.log(1 + (1 - s) / s * (0.05 / 0.04)) / Math.log(1.05); };
      var yfi = yearsToFI(netRate);
      var bench = netRate < 10 ? 'Below the 20% target.' : netRate < 20 ? 'Approaching the 20% target.' : netRate < 50 ? 'Strong — on track for FI.' : 'Exceptional — early FI within reach.';
      return buildResult(
        [{ label: 'Gross savings rate', value: formatPercent(grossRate, 1), tone: grossRate >= 20 ? 'positive' : 'warning', help: 'Total savings / gross income.' }, { label: 'Net savings rate', value: formatPercent(netRate, 1), tone: netRate >= 20 ? 'positive' : 'warning', help: 'Total savings / after-tax income.' }, { label: 'Years to financial independence', value: yfi < 99 ? formatNumber(Math.round(yfi)) + ' years' : 'N/A', tone: yfi <= 15 ? 'positive' : yfi <= 30 ? 'neutral' : 'warning', help: '5% real returns, 4% withdrawal rate.' }, { label: 'Annual spending', value: formatMoney(spending), tone: 'neutral', help: 'Net income minus savings contributions.' }],
        [{ title: 'Total annual savings', value: formatMoney(totalSavings), tone: 'positive', text: 'All savings and investment contributions.' }, { title: 'Employer match', value: formatMoney(employerMatch), tone: employerMatch > 0 ? 'positive' : 'neutral', text: 'Free money — always maximize the match.' }, { title: 'FI rate (with match)', value: formatPercent(fiRate, 1), tone: 'neutral', text: 'Counts employer match as both income and savings.' }, { title: 'Benchmark', value: bench, tone: netRate >= 20 ? 'positive' : 'warning', text: 'US average savings rate is about 4-5%.' }],
        [{ title: 'Two methods, both useful', text: 'Gross rate is simpler. Net rate is more accurate since you cannot save money already paid in taxes.' }, { title: 'Include employer match honestly', text: 'Add match to both numerator and denominator for the most accurate FI savings rate.' }, { title: 'Small increases compound dramatically', text: 'Going from 10% to 20% savings rate can cut working years by nearly a decade.' }],
        [{ label: 'Gross income', value: formatMoney(grossIncome) }, { label: 'Taxes', value: formatMoney(taxes) }, { label: 'Net income', value: formatMoney(netIncome) }, { label: 'Retirement', value: formatMoney(retirement) }, { label: 'Employer match', value: formatMoney(employerMatch) }, { label: 'HSA/IRA', value: formatMoney(hsaIra) }, { label: 'Taxable investing', value: formatMoney(taxableSavings) }, { label: 'Other savings', value: formatMoney(otherSavings) }, { label: 'Total savings', value: formatMoney(totalSavings) }],
        { columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', align: 'right' }, { key: 'note', label: 'Context' }], rows: [{ metric: 'Gross savings rate', value: formatPercent(grossRate, 1), note: 'Savings / gross income' }, { metric: 'Net savings rate', value: formatPercent(netRate, 1), note: 'Savings / net income' }, { metric: 'FI rate', value: formatPercent(fiRate, 1), note: 'With employer match' }, { metric: 'Years to FI', value: yfi < 99 ? Math.round(yfi) + '' : 'N/A', note: '5% real, 4% SWR' }, { metric: 'Spending', value: formatMoney(spending), note: 'Net minus savings' }] },
        [{ Method: 'Gross', Rate: grossRate.toFixed(1) + '%' }, { Method: 'Net', Rate: netRate.toFixed(1) + '%' }, { Method: 'FI', Rate: fiRate.toFixed(1) + '%' }],
        'Savings rate calculation complete.'
      );
    },

    'inflation-impact-calculator': function (values) {
      var amount = values.currentAmount; if (!(amount > 0)) throw new Error('Enter a current dollar amount.');
      var inflationRate = values.inflationRate || 3, years = values.years || 10, annualRaise = values.annualRaise || 0, savingsRate = values.savingsInterestRate || 0;
      var r = inflationRate / 100;
      var futureNeeded = amount * Math.pow(1 + r, years);
      var purchasingPower = amount / Math.pow(1 + r, years);
      var erosionPct = amount > 0 ? (amount - purchasingPower) / amount * 100 : 0;
      var realReturn = savingsRate - inflationRate;
      var salaryReal = annualRaise > 0 ? amount * Math.pow(1 + annualRaise / 100, years) / Math.pow(1 + r, years) : 0;
      var salaryGap = annualRaise > 0 ? salaryReal - amount : 0;
      var rows = [], exportRows = [];
      for (var y = 1; y <= Math.min(years, 30); y++) {
        var needed = amount * Math.pow(1 + r, y), pp = amount / Math.pow(1 + r, y);
        rows.push({ year: 'Year ' + y, needed: formatMoney(needed), power: formatMoney(pp), salary: annualRaise > 0 ? formatMoney(amount * Math.pow(1 + annualRaise / 100, y)) : '—', savings: savingsRate > 0 ? formatMoney(amount * Math.pow(1 + savingsRate / 100, y)) : '—' });
        exportRows.push({ Year: y, 'Cost of goods': Math.round(needed), 'Purchasing power': Math.round(pp) });
      }
      var cols = [{ key: 'year', label: 'Year' }, { key: 'needed', label: 'Cost of same goods', align: 'right' }, { key: 'power', label: 'Value of ' + formatMoney(amount), align: 'right' }];
      if (annualRaise > 0) cols.push({ key: 'salary', label: 'Salary trajectory', align: 'right' });
      if (savingsRate > 0) cols.push({ key: 'savings', label: 'Savings balance', align: 'right' });
      return buildResult(
        [{ label: 'Future cost of same goods', value: formatMoney(futureNeeded), tone: 'warning', help: formatMoney(amount) + ' of goods today costs this in ' + years + ' years.' }, { label: 'Purchasing power loss', value: formatPercent(erosionPct, 1), tone: 'warning', help: formatMoney(amount) + ' loses ' + formatPercent(erosionPct, 1) + ' of buying power.' }, { label: 'Real return on savings', value: formatPercent(realReturn, 1), tone: realReturn > 0 ? 'positive' : 'warning', help: 'Savings rate minus inflation. Negative = losing real wealth.' }, { label: annualRaise > 0 ? 'Salary real gain/loss' : 'Value in ' + years + ' years', value: annualRaise > 0 ? formatMoney(salaryGap) : formatMoney(purchasingPower), tone: annualRaise > 0 ? (salaryGap >= 0 ? 'positive' : 'warning') : 'neutral', help: annualRaise > 0 ? 'Whether raises outpace inflation.' : 'Real purchasing power after inflation.' }],
        [{ title: 'Inflation rate', value: formatPercent(inflationRate, 1), tone: 'neutral', text: 'US historical average is about 3.2%.' }, { title: 'Time horizon', value: years + ' years', tone: 'neutral', text: 'Longer = more compounding erosion.' }, { title: 'First-year erosion', value: formatMoney(amount * r), tone: 'warning', text: 'Purchasing power lost in year one alone.' }, { title: annualRaise > 0 ? 'Raise gap' : 'Compounding', value: annualRaise > 0 ? formatPercent(annualRaise - inflationRate, 1) + '/yr' : formatPercent(erosionPct, 1) + ' total', tone: annualRaise > inflationRate ? 'positive' : 'warning', text: annualRaise > 0 ? 'Raise minus inflation per year.' : 'Total erosion compounds over time.' }],
        [{ title: 'Inflation is a hidden tax on cash', text: 'Money earning 0% loses about 3% of purchasing power per year. Over 10 years, nearly a third of its value.' }, { title: 'Raises must beat inflation', text: annualRaise > inflationRate ? 'Your raise outpaces inflation — real income is growing.' : 'If your raise is below inflation, your lifestyle declines even as salary rises.' }, { title: 'Invest to preserve wealth', text: 'Diversified portfolios historically earn 7-10% nominal, outpacing inflation significantly.' }],
        [{ label: 'Current amount', value: formatMoney(amount) }, { label: 'Inflation rate', value: formatPercent(inflationRate, 1) }, { label: 'Years', value: formatNumber(years) }, { label: 'Future cost', value: formatMoney(futureNeeded) }, { label: 'Purchasing power', value: formatMoney(purchasingPower) }, { label: 'Erosion', value: formatPercent(erosionPct, 1) }, { label: 'Real return', value: formatPercent(realReturn, 1) }],
        { columns: cols, rows: rows }, exportRows, 'Inflation impact projection complete.'
      );
    },

    'qbo-vendor-spend-analyzer': function (values) {
      var totalSpend = values.totalAPSpend; if (!(totalSpend > 0)) throw new Error('Enter your total AP spend.');
      var vendorCount = Math.max(1, Math.round(values.numberOfVendors || 10));
      var vendors = [{ name: values.topVendor1Name || 'Vendor 1', amount: values.topVendor1Amount || 0 }, { name: values.topVendor2Name || 'Vendor 2', amount: values.topVendor2Amount || 0 }, { name: values.topVendor3Name || 'Vendor 3', amount: values.topVendor3Amount || 0 }, { name: values.topVendor4Name || 'Vendor 4', amount: values.topVendor4Amount || 0 }, { name: values.topVendor5Name || 'Vendor 5', amount: values.topVendor5Amount || 0 }].filter(function (v) { return v.amount > 0; }).sort(function (a, b) { return b.amount - a.amount; });
      var topTotal = sum(vendors.map(function (v) { return v.amount; }));
      var topPct = totalSpend > 0 ? topTotal / totalSpend * 100 : 0;
      var remaining = totalSpend - topTotal;
      var risk = vendors.length > 0 && vendors[0].amount / totalSpend > 0.25 ? 'High' : topPct > 60 ? 'Moderate' : 'Low';
      var rows = [], exportRows = [], running = 0;
      vendors.forEach(function (v, i) { running += v.amount; var pct = v.amount / totalSpend * 100; rows.push({ rank: '#' + (i + 1), vendor: v.name, amount: formatMoney(v.amount), pct: formatPercent(pct, 1), cumulative: formatPercent(running / totalSpend * 100, 1) }); exportRows.push({ Rank: i + 1, Vendor: v.name, Amount: Math.round(v.amount), Pct: pct.toFixed(1) + '%' }); });
      if (remaining > 0) rows.push({ rank: '—', vendor: 'All others', amount: formatMoney(remaining), pct: formatPercent(100 - topPct, 1), cumulative: '100%' });
      return buildResult(
        [{ label: 'Top vendor concentration', value: formatPercent(topPct, 1), tone: topPct > 60 ? 'warning' : 'positive', help: 'Spend going to top ' + vendors.length + ' vendors.' }, { label: 'Concentration risk', value: risk, tone: risk === 'High' ? 'critical' : risk === 'Moderate' ? 'warning' : 'positive', help: 'High if any vendor exceeds 25%.' }, { label: 'Avg spend per vendor', value: formatMoney(totalSpend / vendorCount), tone: 'neutral', help: 'Total AP / vendor count.' }, { label: 'Total AP spend', value: formatMoney(totalSpend), tone: 'neutral', help: 'Total AP for the period.' }],
        [{ title: 'Active vendors', value: formatNumber(vendorCount), tone: 'neutral', text: 'Vendors with payments.' }, { title: 'Top vendor share', value: vendors.length > 0 ? formatPercent(vendors[0].amount / totalSpend * 100, 1) : '0%', tone: vendors.length > 0 && vendors[0].amount / totalSpend > 0.25 ? 'warning' : 'positive', text: 'Largest single vendor.' }, { title: 'Remaining', value: formatMoney(remaining), tone: 'neutral', text: 'Spend outside top vendors.' }, { title: 'Pareto', value: topPct >= 80 ? '80/20 applies' : 'Distributed', tone: topPct >= 80 ? 'warning' : 'positive', text: 'Few vendors driving most spend?' }],
        [{ title: 'High concentration = supply chain risk', text: 'If your top vendor fails, operations are heavily impacted. Identify backup vendors.' }, { title: 'Negotiate with top vendors', text: 'Volume gives leverage. Review contracts annually.' }, { title: 'Consolidate tail spend', text: 'Many small vendors often mean duplicates. Consolidating reduces overhead.' }],
        [{ label: 'Total AP', value: formatMoney(totalSpend) }, { label: 'Vendors', value: formatNumber(vendorCount) }, { label: 'Top concentration', value: formatPercent(topPct, 1) }, { label: 'Risk', value: risk }],
        { columns: [{ key: 'rank', label: 'Rank' }, { key: 'vendor', label: 'Vendor' }, { key: 'amount', label: 'Amount', align: 'right' }, { key: 'pct', label: '% Total', align: 'right' }, { key: 'cumulative', label: 'Cumul.', align: 'right' }], rows: rows },
        exportRows, 'Vendor spend analysis complete.'
      );
    },

    'in-kind-contribution-valuation': function (values, rows) {
      var threshold = values.appraisalThreshold || 5000;
      var items = rows.filter(function (r) { return r.description && Number.isFinite(r.fairMarketValue); });
      if (!items.length) throw new Error('Add at least one in-kind contribution with a description and fair market value.');
      var totalFMV = sum(items.map(function (r) { return r.fairMarketValue; }));
      var totalBasis = sum(items.map(function (r) { return r.donorCostBasis || 0; }));
      var rowsOut = items.map(function (r) {
        var fmv = r.fairMarketValue;
        var basis = r.donorCostBasis || 0;
        var cat = r.category || 'Goods';
        var needsAppraisal = fmv >= threshold;
        var deductible = cat === 'Securities' ? fmv : Math.min(fmv, basis > 0 ? basis : fmv);
        return { description: r.description, category: cat, fairMarketValue: fmv, donorCostBasis: basis, deductibleValue: deductible, appraisalRequired: needsAppraisal ? 'Yes' : 'No' };
      }).sort(function (a, b) { return b.fairMarketValue - a.fairMarketValue; });
      var needAppraisal = rowsOut.filter(function (r) { return r.appraisalRequired === 'Yes'; }).length;
      var totalDeductible = sum(rowsOut.map(function (r) { return r.deductibleValue; }));
      return buildResult(
        [
          { label: 'Total FMV', value: formatMoney(totalFMV), tone: 'neutral', help: 'Total fair market value of all in-kind contributions.' },
          { label: 'Total deductible value', value: formatMoney(totalDeductible), tone: 'positive', help: 'Estimated deductible value based on category and cost basis.' },
          { label: 'Items requiring appraisal', value: formatNumber(needAppraisal), tone: needAppraisal > 0 ? 'warning' : 'positive', help: 'Contributions at or above the appraisal threshold.' },
          { label: 'Total contributions', value: formatNumber(rowsOut.length), tone: 'neutral', help: 'Number of in-kind items recorded.' }
        ],
        [
          { title: 'Largest contribution', value: rowsOut[0].description, tone: 'neutral', text: formatMoney(rowsOut[0].fairMarketValue) + ' FMV (' + rowsOut[0].category + ').' },
          { title: 'Appraisal threshold', value: formatMoney(threshold), tone: 'neutral', text: 'Donations at or above this amount require a qualified appraisal.' },
          { title: 'FMV vs cost basis gap', value: formatMoney(totalFMV - totalBasis), tone: totalFMV - totalBasis > 0 ? 'warning' : 'neutral', text: 'Large gaps may trigger IRS scrutiny on valuation methods.' },
          { title: 'Appraisal count', value: formatNumber(needAppraisal), tone: needAppraisal > 0 ? 'warning' : 'positive', text: needAppraisal > 0 ? 'Ensure Form 8283 Section B is completed for these items.' : 'No appraisals required at this threshold.' }
        ],
        [
          { title: 'Document the valuation method for every item', text: 'IRS requires substantiation of FMV using comparable sales, replacement cost, or qualified appraisal.' },
          { title: 'Appraisals must be independent', text: 'For items over the threshold, the appraiser cannot be the donor, donee, or a party to the transaction.' },
          { title: 'Securities use FMV, not cost basis', text: 'Publicly traded securities donated and held over a year use the mean of high and low on the date of gift.' },
          { title: 'Acknowledge every contribution', text: 'Written acknowledgment is required for any single contribution valued at $250 or more.' }
        ],
        [
          { label: 'Total FMV', value: formatMoney(totalFMV) },
          { label: 'Total cost basis', value: formatMoney(totalBasis) },
          { label: 'Total deductible', value: formatMoney(totalDeductible) },
          { label: 'Appraisal threshold', value: formatMoney(threshold) },
          { label: 'Items needing appraisal', value: formatNumber(needAppraisal) }
        ],
        { columns: [{ key: 'description', label: 'Description', type: 'text' }, { key: 'category', label: 'Category', type: 'text' }, { key: 'fairMarketValue', label: 'FMV', type: 'money', align: 'right' }, { key: 'donorCostBasis', label: 'Cost basis', type: 'money', align: 'right' }, { key: 'deductibleValue', label: 'Deductible', type: 'money', align: 'right' }, { key: 'appraisalRequired', label: 'Appraisal req.', type: 'text' }], rows: rowsOut },
        rowsOut, 'In-kind contribution valuation complete.'
      );
    },
    'net-asset-classification-checker': function (values, rows) {
      var items = rows.filter(function (r) { return r.accountName && Number.isFinite(r.balance); });
      if (!items.length) throw new Error('Add at least one account with a name, balance, and classification.');
      var classifications = { 'Without donor restrictions': 0, 'With donor restrictions': 0 };
      var rowsOut = items.map(function (r) {
        var cls = r.classification || 'Without donor restrictions';
        if (!classifications.hasOwnProperty(cls)) cls = 'Without donor restrictions';
        classifications[cls] += r.balance;
        var flag = '';
        if (cls === 'With donor restrictions' && r.balance < 0) flag = 'Negative restricted balance';
        else if (cls === 'Without donor restrictions' && r.balance < 0) flag = 'Negative unrestricted — review';
        return { accountName: r.accountName, balance: r.balance, classification: cls, flag: flag || 'OK' };
      });
      var totalAssets = sum(rowsOut.map(function (r) { return r.balance; }));
      var withoutDR = classifications['Without donor restrictions'];
      var withDR = classifications['With donor restrictions'];
      var flagged = rowsOut.filter(function (r) { return r.flag !== 'OK'; }).length;
      return buildResult(
        [
          { label: 'Total net assets', value: formatMoney(totalAssets), tone: 'neutral', help: 'Sum of all net asset accounts.' },
          { label: 'Without donor restrictions', value: formatMoney(withoutDR), tone: withoutDR < 0 ? 'critical' : 'positive', help: 'Unrestricted net assets available for general use.' },
          { label: 'With donor restrictions', value: formatMoney(withDR), tone: 'neutral', help: 'Net assets restricted by donor-imposed conditions.' },
          { label: 'Flagged accounts', value: formatNumber(flagged), tone: flagged > 0 ? 'warning' : 'positive', help: 'Accounts with classification or balance concerns.' }
        ],
        [
          { title: 'Unrestricted share', value: formatPercent(totalAssets ? withoutDR / totalAssets * 100 : 0, 1), tone: withoutDR < 0 ? 'critical' : 'neutral', text: 'Percentage of total net assets classified as without donor restrictions.' },
          { title: 'Restricted share', value: formatPercent(totalAssets ? withDR / totalAssets * 100 : 0, 1), tone: 'neutral', text: 'Percentage of total net assets classified as with donor restrictions.' },
          { title: 'Classification issues', value: formatNumber(flagged), tone: flagged > 0 ? 'warning' : 'positive', text: flagged > 0 ? 'Review flagged accounts for proper classification under ASC 958.' : 'No classification issues detected.' },
          { title: 'Total accounts', value: formatNumber(rowsOut.length), tone: 'neutral', text: 'Number of net asset accounts analyzed.' }
        ],
        [
          { title: 'ASC 958 requires two classes', text: 'Net assets must be classified as with or without donor restrictions — the old three-class model is no longer GAAP.' },
          { title: 'Negative restricted balances need investigation', text: 'A negative balance in restricted net assets may indicate overspending against a restricted grant.' },
          { title: 'Board-designated funds are unrestricted', text: 'Board designations are internal and do not create donor restrictions under ASC 958.' },
          { title: 'Review release of restrictions', text: 'Ensure time and purpose restrictions are released when conditions are met and reclassified properly.' }
        ],
        [
          { label: 'Total net assets', value: formatMoney(totalAssets) },
          { label: 'Without restrictions', value: formatMoney(withoutDR) },
          { label: 'With restrictions', value: formatMoney(withDR) },
          { label: 'Flagged', value: formatNumber(flagged) }
        ],
        { columns: [{ key: 'accountName', label: 'Account', type: 'text' }, { key: 'balance', label: 'Balance', type: 'money', align: 'right' }, { key: 'classification', label: 'Classification', type: 'text' }, { key: 'flag', label: 'Status', type: 'text' }], rows: rowsOut },
        rowsOut, 'Net asset classification review complete.'
      );
    },
    'job-cost-budget-vs-actual': function (values, rows) {
      var jobName = values.jobName || 'Unnamed job';
      var items = rows.filter(function (r) { return r.costCode && Number.isFinite(r.budget); });
      if (!items.length) throw new Error('Add at least one cost code with budget and actual amounts.');
      var rowsOut = items.map(function (r) {
        var budget = r.budget;
        var actual = r.actual || 0;
        var variance = budget - actual;
        var variancePct = budget ? variance / Math.abs(budget) * 100 : 0;
        var committed = r.committed || 0;
        var projectedCost = actual + committed;
        var projectedVariance = budget - projectedCost;
        return { costCode: r.costCode, budget: budget, actual: actual, committed: committed, projectedCost: projectedCost, variance: variance, variancePct: variancePct, projectedVariance: projectedVariance, status: projectedVariance < 0 ? 'Over budget' : 'On track' };
      }).sort(function (a, b) { return a.projectedVariance - b.projectedVariance; });
      var totalBudget = sum(rowsOut.map(function (r) { return r.budget; }));
      var totalActual = sum(rowsOut.map(function (r) { return r.actual; }));
      var totalCommitted = sum(rowsOut.map(function (r) { return r.committed; }));
      var totalProjected = totalActual + totalCommitted;
      var totalVariance = totalBudget - totalActual;
      var totalProjectedVar = totalBudget - totalProjected;
      var overBudgetCount = rowsOut.filter(function (r) { return r.projectedVariance < 0; }).length;
      return buildResult(
        [
          { label: 'Total budget', value: formatMoney(totalBudget), tone: 'neutral', help: 'Sum of all cost code budgets.' },
          { label: 'Actual to date', value: formatMoney(totalActual), tone: 'neutral', help: 'Costs incurred to date.' },
          { label: 'Projected total cost', value: formatMoney(totalProjected), tone: totalProjectedVar < 0 ? 'critical' : 'positive', help: 'Actual plus committed costs.' },
          { label: 'Projected variance', value: formatMoney(totalProjectedVar), tone: totalProjectedVar < 0 ? 'critical' : 'positive', help: 'Budget minus projected total cost. Negative means over budget.' }
        ],
        [
          { title: 'Job', value: jobName, tone: 'neutral', text: 'Job cost tracking for ' + jobName + '.' },
          { title: 'Budget consumed', value: formatPercent(totalBudget ? totalActual / totalBudget * 100 : 0, 1), tone: totalActual / totalBudget > 0.9 ? 'warning' : 'neutral', text: 'Percentage of total budget spent to date.' },
          { title: 'Cost codes over budget', value: formatNumber(overBudgetCount), tone: overBudgetCount > 0 ? 'critical' : 'positive', text: 'Cost codes where projected cost exceeds budget.' },
          { title: 'Committed not yet spent', value: formatMoney(totalCommitted), tone: 'neutral', text: 'Purchase orders and subcontracts committed but not yet billed.' }
        ],
        [
          { title: 'Watch committed costs closely', text: 'Committed costs (POs, subcontracts) will become actual costs — include them in projections.' },
          { title: 'Investigate negative variances early', text: 'Cost code overruns caught early can often be offset by change orders or scope adjustments.' },
          { title: 'Track change orders separately', text: 'Approved change orders should increase the budget, not hide overruns in the original scope.' },
          { title: 'Use projected variance for decisions', text: 'Actual variance looks backward — projected variance is the forward-looking number that drives action.' }
        ],
        [
          { label: 'Job', value: jobName },
          { label: 'Total budget', value: formatMoney(totalBudget) },
          { label: 'Actual to date', value: formatMoney(totalActual) },
          { label: 'Committed', value: formatMoney(totalCommitted) },
          { label: 'Projected cost', value: formatMoney(totalProjected) },
          { label: 'Projected variance', value: formatMoney(totalProjectedVar) }
        ],
        { columns: [{ key: 'costCode', label: 'Cost code', type: 'text' }, { key: 'budget', label: 'Budget', type: 'money', align: 'right' }, { key: 'actual', label: 'Actual', type: 'money', align: 'right' }, { key: 'committed', label: 'Committed', type: 'money', align: 'right' }, { key: 'projectedCost', label: 'Projected', type: 'money', align: 'right' }, { key: 'projectedVariance', label: 'Proj. variance', type: 'money', align: 'right' }, { key: 'status', label: 'Status', type: 'text' }], rows: rowsOut },
        rowsOut, 'Job cost budget vs actual analysis complete for ' + jobName + '.'
      );
    },
    'percentage-of-completion-calculator': function (values) {
      var contractValue = values.contractValue;
      var totalEstCost = values.totalEstimatedCost;
      var costsIncurred = values.costsIncurred;
      var billingsToDate = values.billingsToDate || 0;
      if (!(contractValue > 0) || !(totalEstCost > 0)) throw new Error('Enter a positive contract value and total estimated cost.');
      if (costsIncurred < 0) throw new Error('Costs incurred cannot be negative.');
      var pctComplete = Math.min(costsIncurred / totalEstCost * 100, 100);
      var earnedRevenue = contractValue * pctComplete / 100;
      var estimatedGrossProfit = contractValue - totalEstCost;
      var earnedProfit = estimatedGrossProfit * pctComplete / 100;
      var costsToComplete = Math.max(totalEstCost - costsIncurred, 0);
      var overUnderBilling = earnedRevenue - billingsToDate;
      var profitMarginPct = contractValue ? estimatedGrossProfit / contractValue * 100 : 0;
      return buildResult(
        [
          { label: 'Percent complete', value: formatPercent(pctComplete, 1), tone: pctComplete > 90 ? 'positive' : 'neutral', help: 'Costs incurred divided by total estimated cost.' },
          { label: 'Earned revenue', value: formatMoney(earnedRevenue), tone: 'neutral', help: 'Contract value multiplied by percent complete.' },
          { label: 'Earned profit', value: formatMoney(earnedProfit), tone: earnedProfit < 0 ? 'critical' : 'positive', help: 'Estimated gross profit multiplied by percent complete.' },
          { label: 'Over/(under) billing', value: formatMoney(overUnderBilling), tone: overUnderBilling < 0 ? 'warning' : 'neutral', help: 'Earned revenue minus billings to date. Negative means underbilled.' }
        ],
        [
          { title: 'Contract value', value: formatMoney(contractValue), tone: 'neutral', text: 'Total contract price.' },
          { title: 'Estimated gross margin', value: formatPercent(profitMarginPct, 1), tone: profitMarginPct < 0 ? 'critical' : (profitMarginPct < 10 ? 'warning' : 'positive'), text: 'Estimated profit as a percentage of contract value.' },
          { title: 'Cost to complete', value: formatMoney(costsToComplete), tone: 'neutral', text: 'Remaining estimated cost from this point to completion.' },
          { title: 'Billing position', value: overUnderBilling >= 0 ? 'Overbilled' : 'Underbilled', tone: overUnderBilling < 0 ? 'warning' : 'neutral', text: formatMoney(Math.abs(overUnderBilling)) + ' ' + (overUnderBilling >= 0 ? 'overbilled (liability)' : 'underbilled (asset)') + '.' }
        ],
        [
          { title: 'POC requires reliable cost estimates', text: 'The method depends on the total estimated cost being reasonably accurate — update it as scope changes.' },
          { title: 'Overbillings create a liability', text: 'When billings exceed earned revenue, the difference is reported as a current liability on the balance sheet.' },
          { title: 'Underbillings are an asset with risk', text: 'Underbillings represent earned but unbilled revenue — ensure collection is probable before recognizing.' },
          { title: 'ASC 606 may apply', text: 'Under ASC 606 (Topic 606), percentage of completion is recognized as an over-time method when criteria are met.' }
        ],
        [
          { label: 'Contract value', value: formatMoney(contractValue) },
          { label: 'Total estimated cost', value: formatMoney(totalEstCost) },
          { label: 'Costs incurred', value: formatMoney(costsIncurred) },
          { label: 'Percent complete', value: formatPercent(pctComplete, 1) },
          { label: 'Earned revenue', value: formatMoney(earnedRevenue) },
          { label: 'Billings to date', value: formatMoney(billingsToDate) },
          { label: 'Over/(under) billing', value: formatMoney(overUnderBilling) }
        ],
        null,
        [{ 'Contract value': contractValue, 'Total est. cost': totalEstCost, 'Costs incurred': costsIncurred, '% Complete': pctComplete.toFixed(1) + '%', 'Earned revenue': earnedRevenue, 'Earned profit': earnedProfit, 'Billings': billingsToDate, 'Over/(under)': overUnderBilling }],
        'Percentage of completion calculation complete.'
      );
    },
    'completed-contract-method-analyzer': function (values) {
      var contractValue = values.contractValue;
      var totalEstCost = values.totalEstimatedCost;
      var costsIncurred = values.costsIncurred;
      var billingsToDate = values.billingsToDate || 0;
      var isComplete = values.isComplete === 'yes';
      if (!(contractValue > 0) || !(totalEstCost > 0)) throw new Error('Enter a positive contract value and total estimated cost.');
      var pctCostIncurred = totalEstCost ? costsIncurred / totalEstCost * 100 : 0;
      var estimatedProfit = contractValue - totalEstCost;
      var profitMarginPct = contractValue ? estimatedProfit / contractValue * 100 : 0;
      var revenueRecognized = isComplete ? contractValue : 0;
      var expenseRecognized = isComplete ? costsIncurred : 0;
      var profitRecognized = isComplete ? contractValue - costsIncurred : 0;
      var deferredRevenue = billingsToDate - revenueRecognized;
      var wipAsset = costsIncurred - expenseRecognized;
      var estimatedLoss = estimatedProfit < 0 ? Math.abs(estimatedProfit) : 0;
      return buildResult(
        [
          { label: 'Contract status', value: isComplete ? 'Complete' : 'In progress', tone: isComplete ? 'positive' : 'neutral', help: 'Whether the contract is substantially complete.' },
          { label: 'Revenue recognized', value: formatMoney(revenueRecognized), tone: 'neutral', help: 'Revenue recognized under completed contract method.' },
          { label: 'Profit recognized', value: formatMoney(profitRecognized), tone: profitRecognized < 0 ? 'critical' : 'positive', help: 'Profit recognized upon contract completion.' },
          { label: 'Estimated loss', value: formatMoney(estimatedLoss), tone: estimatedLoss > 0 ? 'critical' : 'positive', help: 'If total estimated cost exceeds contract value, the full loss must be recognized immediately.' }
        ],
        [
          { title: 'Cost progress', value: formatPercent(pctCostIncurred, 1), tone: pctCostIncurred > 90 && !isComplete ? 'warning' : 'neutral', text: 'Costs incurred as a percentage of total estimated cost.' },
          { title: 'Estimated margin', value: formatPercent(profitMarginPct, 1), tone: profitMarginPct < 0 ? 'critical' : (profitMarginPct < 10 ? 'warning' : 'positive'), text: 'Estimated profit margin at contract completion.' },
          { title: 'WIP asset', value: formatMoney(wipAsset), tone: 'neutral', text: isComplete ? 'No WIP remaining — costs recognized as expense.' : 'Costs incurred carried on the balance sheet until completion.' },
          { title: 'Deferred revenue', value: formatMoney(deferredRevenue > 0 ? deferredRevenue : 0), tone: 'neutral', text: 'Billings collected but not yet recognized as revenue.' }
        ],
        [
          { title: 'Losses must be recognized immediately', text: 'Under both GAAP and tax rules, if a contract is expected to result in a loss, the entire estimated loss must be accrued in the current period.' },
          { title: 'Completed contract defers revenue and expense', text: 'No revenue or expense is recognized until the contract is substantially complete, but costs and billings accumulate on the balance sheet.' },
          { title: 'Tax rules limit this method', text: 'The completed contract method is generally only available for tax purposes on contracts expected to be completed within two years or for small contractors.' },
          { title: 'Compare to percentage of completion', text: 'POC recognizes revenue over time and provides smoother earnings — consider which method better reflects economic reality.' }
        ],
        [
          { label: 'Contract value', value: formatMoney(contractValue) },
          { label: 'Total estimated cost', value: formatMoney(totalEstCost) },
          { label: 'Costs incurred', value: formatMoney(costsIncurred) },
          { label: 'Billings to date', value: formatMoney(billingsToDate) },
          { label: 'Status', value: isComplete ? 'Complete' : 'In progress' },
          { label: 'Revenue recognized', value: formatMoney(revenueRecognized) },
          { label: 'Profit recognized', value: formatMoney(profitRecognized) }
        ],
        null,
        [{ 'Contract': contractValue, 'Est. cost': totalEstCost, 'Incurred': costsIncurred, 'Billings': billingsToDate, 'Complete': isComplete ? 'Yes' : 'No', 'Revenue': revenueRecognized, 'Profit': profitRecognized, 'Est. loss': estimatedLoss }],
        'Completed contract method analysis complete.'
      );
    },
    'construction-overhead-allocation': function (values, rows) {
      var totalOverhead = values.totalOverhead;
      var basisName = values.allocationBasis || 'Labor hours';
      var jobs = rows.filter(function (r) { return r.jobName && Number.isFinite(r.basisUnits); });
      if (!(totalOverhead > 0) || !jobs.length) throw new Error('Enter total overhead and at least one job with basis units.');
      var totalUnits = sum(jobs.map(function (r) { return r.basisUnits; }));
      if (!(totalUnits > 0)) throw new Error('Basis units must total more than zero.');
      var rate = totalOverhead / totalUnits;
      var rowsOut = jobs.map(function (r) {
        var directCost = r.directCost || 0;
        var allocated = r.basisUnits * rate;
        return { jobName: r.jobName, directCost: directCost, basisUnits: r.basisUnits, sharePct: r.basisUnits / totalUnits * 100, allocatedOverhead: allocated, totalJobCost: directCost + allocated };
      }).sort(function (a, b) { return b.allocatedOverhead - a.allocatedOverhead; });
      var topShare = rowsOut[0].sharePct;
      var totalDirect = sum(rowsOut.map(function (r) { return r.directCost; }));
      var overheadRate = totalDirect > 0 ? totalOverhead / totalDirect * 100 : 0;
      return buildResult(
        [
          { label: 'Total overhead', value: formatMoney(totalOverhead), tone: 'neutral', help: 'Shared construction overhead to allocate.' },
          { label: 'Rate per unit', value: formatMoney(rate), tone: 'positive', help: 'Overhead per unit of ' + basisName + '.' },
          { label: 'Overhead as % of direct', value: formatPercent(overheadRate, 1), tone: overheadRate > 25 ? 'warning' : 'neutral', help: 'Total overhead divided by total direct costs.' },
          { label: 'Jobs allocated', value: formatNumber(rowsOut.length), tone: 'neutral', help: 'Number of jobs receiving overhead.' }
        ],
        [
          { title: 'Allocation basis', value: basisName, tone: 'neutral', text: 'Driver used to spread overhead across jobs.' },
          { title: 'Top job share', value: rowsOut[0].jobName, tone: topShare > 50 ? 'warning' : 'neutral', text: formatPercent(topShare, 1) + ' of total overhead allocated to this job.' },
          { title: 'Rate per unit', value: formatMoney(rate), tone: 'positive', text: 'Each unit of ' + basisName + ' absorbs this much overhead.' },
          { title: 'Concentration risk', value: topShare > 50 ? 'High' : 'Normal', tone: topShare > 50 ? 'warning' : 'positive', text: topShare > 50 ? 'One job absorbs more than half the overhead pool.' : 'Overhead is spread reasonably across jobs.' }
        ],
        [
          { title: 'Match the basis to cost behavior', text: 'If overhead is driven by labor, use labor hours or labor cost — not revenue or square footage.' },
          { title: 'Update allocations as jobs progress', text: 'Basis units change as jobs ramp up or wind down — rerun the allocation monthly.' },
          { title: 'Separate fixed and variable overhead', text: 'Fixed overhead (insurance, rent) behaves differently from variable overhead (fuel, supplies).' },
          { title: 'Document the method for auditors', text: 'Construction auditors and sureties expect a defensible, consistent overhead allocation method.' }
        ],
        [
          { label: 'Basis', value: basisName },
          { label: 'Total overhead', value: formatMoney(totalOverhead) },
          { label: 'Total units', value: formatNumber(totalUnits) },
          { label: 'Rate per unit', value: formatMoney(rate) },
          { label: 'Total direct cost', value: formatMoney(totalDirect) }
        ],
        { columns: [{ key: 'jobName', label: 'Job', type: 'text' }, { key: 'directCost', label: 'Direct cost', type: 'money', align: 'right' }, { key: 'basisUnits', label: basisName, type: 'number', align: 'right' }, { key: 'sharePct', label: 'Share', type: 'percent', align: 'right' }, { key: 'allocatedOverhead', label: 'Allocated OH', type: 'money', align: 'right' }, { key: 'totalJobCost', label: 'Total job cost', type: 'money', align: 'right' }], rows: rowsOut },
        rowsOut, 'Construction overhead allocation complete.'
      );
    },
    'aia-billing-schedule-of-values': function (values, rows) {
      var projectName = values.projectName || 'Unnamed project';
      var appNumber = values.applicationNumber || 1;
      var retainagePct = values.retainagePct || 10;
      var items = rows.filter(function (r) { return r.description && Number.isFinite(r.scheduledValue); });
      if (!items.length) throw new Error('Add at least one line item with a description and scheduled value.');
      var retainageRate = retainagePct / 100;
      var rowsOut = items.map(function (r) {
        var scheduled = r.scheduledValue;
        var prevWork = r.previousWork || 0;
        var currentWork = r.currentWork || 0;
        var storedMaterials = r.storedMaterials || 0;
        var totalCompleted = prevWork + currentWork + storedMaterials;
        var pctComplete = scheduled ? totalCompleted / scheduled * 100 : 0;
        var retainage = totalCompleted * retainageRate;
        var netPayable = totalCompleted - retainage;
        var balanceToFinish = scheduled - totalCompleted;
        return { description: r.description, scheduledValue: scheduled, previousWork: prevWork, currentWork: currentWork, storedMaterials: storedMaterials, totalCompleted: totalCompleted, pctComplete: Math.min(pctComplete, 100), retainage: retainage, balanceToFinish: Math.max(balanceToFinish, 0) };
      });
      var totalScheduled = sum(rowsOut.map(function (r) { return r.scheduledValue; }));
      var totalPrevWork = sum(rowsOut.map(function (r) { return r.previousWork; }));
      var totalCurrentWork = sum(rowsOut.map(function (r) { return r.currentWork; }));
      var totalStored = sum(rowsOut.map(function (r) { return r.storedMaterials; }));
      var totalCompleted = sum(rowsOut.map(function (r) { return r.totalCompleted; }));
      var totalRetainage = totalCompleted * retainageRate;
      var totalBalance = totalScheduled - totalCompleted;
      var overallPct = totalScheduled ? totalCompleted / totalScheduled * 100 : 0;
      var currentAppAmount = totalCurrentWork + totalStored;
      var currentNetPayable = currentAppAmount - (currentAppAmount * retainageRate);
      return buildResult(
        [
          { label: 'Total contract', value: formatMoney(totalScheduled), tone: 'neutral', help: 'Sum of all scheduled values.' },
          { label: 'Total completed', value: formatMoney(totalCompleted), tone: 'neutral', help: 'Work completed plus stored materials to date.' },
          { label: 'This application', value: formatMoney(currentAppAmount), tone: 'positive', help: 'Current period work plus materials stored this period.' },
          { label: 'Overall % complete', value: formatPercent(overallPct, 1), tone: 'neutral', help: 'Total completed and stored as percent of contract.' }
        ],
        [
          { title: 'Project', value: projectName, tone: 'neutral', text: 'Application #' + appNumber + '.' },
          { title: 'Retainage rate', value: formatPercent(retainagePct, 0), tone: 'neutral', text: formatMoney(totalRetainage) + ' total retainage held.' },
          { title: 'Current payment due', value: formatMoney(currentNetPayable), tone: 'positive', text: 'Current application amount less retainage.' },
          { title: 'Balance to finish', value: formatMoney(totalBalance), tone: 'neutral', text: 'Remaining work on the contract.' }
        ],
        [
          { title: 'Schedule of values must match the contract', text: 'The total scheduled value should equal the original contract plus approved change orders.' },
          { title: 'Retainage protects the owner', text: 'Retainage is held until substantial completion — track it separately for cash flow planning.' },
          { title: 'Stored materials need documentation', text: 'Materials stored on or off site require proof of delivery and insurance before billing.' },
          { title: 'Each application builds on the previous', text: 'Previous work completed should carry forward exactly from the prior application.' }
        ],
        [
          { label: 'Project', value: projectName },
          { label: 'Application #', value: String(appNumber) },
          { label: 'Total contract', value: formatMoney(totalScheduled) },
          { label: 'Previous work', value: formatMoney(totalPrevWork) },
          { label: 'Current work', value: formatMoney(totalCurrentWork) },
          { label: 'Stored materials', value: formatMoney(totalStored) },
          { label: 'Total retainage', value: formatMoney(totalRetainage) }
        ],
        { columns: [{ key: 'description', label: 'Description', type: 'text' }, { key: 'scheduledValue', label: 'Scheduled', type: 'money', align: 'right' }, { key: 'previousWork', label: 'Prev. work', type: 'money', align: 'right' }, { key: 'currentWork', label: 'Current', type: 'money', align: 'right' }, { key: 'storedMaterials', label: 'Stored', type: 'money', align: 'right' }, { key: 'totalCompleted', label: 'Total', type: 'money', align: 'right' }, { key: 'pctComplete', label: '% Complete', type: 'percent', align: 'right' }, { key: 'balanceToFinish', label: 'Balance', type: 'money', align: 'right' }], rows: rowsOut },
        rowsOut, 'AIA billing application #' + appNumber + ' complete for ' + projectName + '.'
      );
    },
    'subcontractor-cost-tracker': function (values, rows) {
      var projectName = values.projectName || 'Unnamed project';
      var subs = rows.filter(function (r) { return r.subcontractor && Number.isFinite(r.contractAmount); });
      if (!subs.length) throw new Error('Add at least one subcontractor with a contract amount.');
      var rowsOut = subs.map(function (r) {
        var contract = r.contractAmount;
        var billed = r.billedToDate || 0;
        var paid = r.paidToDate || 0;
        var retainageHeld = r.retainageHeld || 0;
        var changeOrders = r.changeOrders || 0;
        var revisedContract = contract + changeOrders;
        var remainingCommitment = revisedContract - billed;
        var outstandingPayable = billed - paid;
        var pctBilled = revisedContract ? billed / revisedContract * 100 : 0;
        return { subcontractor: r.subcontractor, originalContract: contract, changeOrders: changeOrders, revisedContract: revisedContract, billedToDate: billed, paidToDate: paid, retainageHeld: retainageHeld, outstandingPayable: outstandingPayable, remainingCommitment: Math.max(remainingCommitment, 0), pctBilled: Math.min(pctBilled, 100) };
      }).sort(function (a, b) { return b.revisedContract - a.revisedContract; });
      var totalOriginal = sum(rowsOut.map(function (r) { return r.originalContract; }));
      var totalCOs = sum(rowsOut.map(function (r) { return r.changeOrders; }));
      var totalRevised = sum(rowsOut.map(function (r) { return r.revisedContract; }));
      var totalBilled = sum(rowsOut.map(function (r) { return r.billedToDate; }));
      var totalPaid = sum(rowsOut.map(function (r) { return r.paidToDate; }));
      var totalRetainage = sum(rowsOut.map(function (r) { return r.retainageHeld; }));
      var totalOutstanding = totalBilled - totalPaid;
      var totalRemaining = totalRevised - totalBilled;
      return buildResult(
        [
          { label: 'Total commitments', value: formatMoney(totalRevised), tone: 'neutral', help: 'Original contracts plus change orders.' },
          { label: 'Billed to date', value: formatMoney(totalBilled), tone: 'neutral', help: 'Total billed by all subcontractors.' },
          { label: 'Outstanding payable', value: formatMoney(totalOutstanding), tone: totalOutstanding > 0 ? 'warning' : 'positive', help: 'Billed minus paid — amounts owed to subs.' },
          { label: 'Remaining commitment', value: formatMoney(totalRemaining), tone: 'neutral', help: 'Contract value not yet billed.' }
        ],
        [
          { title: 'Project', value: projectName, tone: 'neutral', text: formatNumber(rowsOut.length) + ' subcontractors tracked.' },
          { title: 'Change order impact', value: formatMoney(totalCOs), tone: totalCOs > 0 ? 'warning' : 'neutral', text: totalCOs > 0 ? formatPercent(totalOriginal ? totalCOs / totalOriginal * 100 : 0, 1) + ' increase from change orders.' : 'No change orders.' },
          { title: 'Retainage held', value: formatMoney(totalRetainage), tone: 'neutral', text: 'Total retainage held across all subcontractors.' },
          { title: 'Largest sub', value: rowsOut[0].subcontractor, tone: 'neutral', text: formatMoney(rowsOut[0].revisedContract) + ' revised contract.' }
        ],
        [
          { title: 'Track change orders against original scope', text: 'Change orders should be approved and documented before work begins to avoid disputes.' },
          { title: 'Match retainage to contract terms', text: 'Verify retainage rates match subcontract terms and comply with state prompt-pay laws.' },
          { title: 'Aging of sub payables matters', text: 'Late payments to subs can trigger mechanics lien rights and damage contractor relationships.' },
          { title: 'Remaining commitment drives cash flow', text: 'The unbilled contract balance is a forward-looking obligation for project cash flow planning.' }
        ],
        [
          { label: 'Project', value: projectName },
          { label: 'Total original', value: formatMoney(totalOriginal) },
          { label: 'Change orders', value: formatMoney(totalCOs) },
          { label: 'Revised total', value: formatMoney(totalRevised) },
          { label: 'Total billed', value: formatMoney(totalBilled) },
          { label: 'Total paid', value: formatMoney(totalPaid) },
          { label: 'Retainage held', value: formatMoney(totalRetainage) }
        ],
        { columns: [{ key: 'subcontractor', label: 'Subcontractor', type: 'text' }, { key: 'revisedContract', label: 'Contract', type: 'money', align: 'right' }, { key: 'changeOrders', label: 'COs', type: 'money', align: 'right' }, { key: 'billedToDate', label: 'Billed', type: 'money', align: 'right' }, { key: 'paidToDate', label: 'Paid', type: 'money', align: 'right' }, { key: 'retainageHeld', label: 'Retainage', type: 'money', align: 'right' }, { key: 'outstandingPayable', label: 'Payable', type: 'money', align: 'right' }, { key: 'pctBilled', label: '% Billed', type: 'percent', align: 'right' }], rows: rowsOut },
        rowsOut, 'Subcontractor cost tracking complete for ' + projectName + '.'
      );
    },
    'construction-bid-margin-calculator': function (values) {
      var directCost = values.estimatedDirectCost;
      var overheadPct = values.overheadMarkupPct || 0;
      var profitPct = values.profitMarginPct || 0;
      var bondPct = values.bondCostPct || 0;
      var contingencyPct = values.contingencyPct || 0;
      if (!(directCost > 0)) throw new Error('Enter a positive estimated direct cost.');
      var overhead = directCost * overheadPct / 100;
      var subtotalBeforeProfit = directCost + overhead;
      var contingency = subtotalBeforeProfit * contingencyPct / 100;
      var costPlusContingency = subtotalBeforeProfit + contingency;
      var profit = costPlusContingency * profitPct / 100;
      var subtotalBeforeBond = costPlusContingency + profit;
      var bondCost = subtotalBeforeBond * bondPct / 100;
      var totalBidPrice = subtotalBeforeBond + bondCost;
      var grossMargin = totalBidPrice - directCost;
      var grossMarginPct = totalBidPrice ? grossMargin / totalBidPrice * 100 : 0;
      var netMarginPct = totalBidPrice ? profit / totalBidPrice * 100 : 0;
      var markup = directCost ? (totalBidPrice - directCost) / directCost * 100 : 0;
      return buildResult(
        [
          { label: 'Total bid price', value: formatMoney(totalBidPrice), tone: 'positive', help: 'Final bid price including all markups.' },
          { label: 'Gross margin', value: formatPercent(grossMarginPct, 1), tone: grossMarginPct < 15 ? 'warning' : 'positive', help: 'Total bid minus direct cost as a percentage of bid.' },
          { label: 'Net profit', value: formatMoney(profit), tone: profit <= 0 ? 'critical' : 'positive', help: 'Profit component of the bid.' },
          { label: 'Total markup', value: formatPercent(markup, 1), tone: 'neutral', help: 'Total bid price divided by direct cost minus one.' }
        ],
        [
          { title: 'Direct cost', value: formatMoney(directCost), tone: 'neutral', text: 'Base estimated cost before markups.' },
          { title: 'Overhead', value: formatMoney(overhead), tone: 'neutral', text: formatPercent(overheadPct, 1) + ' of direct cost.' },
          { title: 'Contingency', value: formatMoney(contingency), tone: contingencyPct > 0 ? 'neutral' : 'warning', text: contingencyPct > 0 ? formatPercent(contingencyPct, 1) + ' contingency buffer.' : 'No contingency included — consider adding one.' },
          { title: 'Bond cost', value: formatMoney(bondCost), tone: 'neutral', text: bondPct > 0 ? formatPercent(bondPct, 1) + ' bond premium.' : 'No bond cost included.' }
        ],
        [
          { title: 'Bid margin is not profit margin', text: 'The bid margin includes overhead recovery — net profit is only the profit markup component.' },
          { title: 'Contingency protects the margin', text: 'Without contingency, any cost overrun comes directly out of profit.' },
          { title: 'Bond costs are passed through', text: 'Performance and payment bonds are typically added on top and passed to the owner in the bid.' },
          { title: 'Competitive pressure vs. sustainability', text: 'Winning at thin margins is worse than losing the bid — track actual margins against bid margins on completed jobs.' }
        ],
        [
          { label: 'Direct cost', value: formatMoney(directCost) },
          { label: 'Overhead', value: formatMoney(overhead) },
          { label: 'Contingency', value: formatMoney(contingency) },
          { label: 'Profit', value: formatMoney(profit) },
          { label: 'Bond cost', value: formatMoney(bondCost) },
          { label: 'Total bid', value: formatMoney(totalBidPrice) },
          { label: 'Net margin', value: formatPercent(netMarginPct, 1) }
        ],
        null,
        [{ 'Direct cost': directCost, Overhead: overhead, Contingency: contingency, Profit: profit, Bond: bondCost, 'Bid price': totalBidPrice, 'Gross margin %': grossMarginPct.toFixed(1) + '%', 'Net margin %': netMarginPct.toFixed(1) + '%' }],
        'Construction bid margin calculation complete.'
      );
    },
    'retainage-receivable-payable-tracker': function (values, rows) {
      var items = rows.filter(function (r) { return r.projectName && Number.isFinite(r.contractValue); });
      if (!items.length) throw new Error('Add at least one project with contract value and retainage details.');
      var rowsOut = items.map(function (r) {
        var contract = r.contractValue;
        var retainagePct = r.retainagePct || 10;
        var billedToDate = r.billedToDate || 0;
        var retainageType = r.retainageType || 'Receivable';
        var retainageAmount = billedToDate * retainagePct / 100;
        var pctBilled = contract ? billedToDate / contract * 100 : 0;
        return { projectName: r.projectName, contractValue: contract, retainagePct: retainagePct, billedToDate: billedToDate, pctBilled: Math.min(pctBilled, 100), retainageAmount: retainageAmount, retainageType: retainageType };
      }).sort(function (a, b) { return b.retainageAmount - a.retainageAmount; });
      var receivables = rowsOut.filter(function (r) { return r.retainageType === 'Receivable'; });
      var payables = rowsOut.filter(function (r) { return r.retainageType === 'Payable'; });
      var totalRetReceivable = sum(receivables.map(function (r) { return r.retainageAmount; }));
      var totalRetPayable = sum(payables.map(function (r) { return r.retainageAmount; }));
      var netRetainage = totalRetReceivable - totalRetPayable;
      var totalContractValue = sum(rowsOut.map(function (r) { return r.contractValue; }));
      var totalBilled = sum(rowsOut.map(function (r) { return r.billedToDate; }));
      var totalRetainage = sum(rowsOut.map(function (r) { return r.retainageAmount; }));
      return buildResult(
        [
          { label: 'Retainage receivable', value: formatMoney(totalRetReceivable), tone: 'neutral', help: 'Total retainage held by owners on your billings.' },
          { label: 'Retainage payable', value: formatMoney(totalRetPayable), tone: 'neutral', help: 'Total retainage you are holding on subcontractor billings.' },
          { label: 'Net retainage position', value: formatMoney(netRetainage), tone: netRetainage < 0 ? 'warning' : 'positive', help: 'Receivable minus payable — positive means you are owed more than you hold.' },
          { label: 'Projects tracked', value: formatNumber(rowsOut.length), tone: 'neutral', help: 'Number of projects with retainage.' }
        ],
        [
          { title: 'Total contract exposure', value: formatMoney(totalContractValue), tone: 'neutral', text: 'Sum of all contract values across tracked projects.' },
          { title: 'Total billed', value: formatMoney(totalBilled), tone: 'neutral', text: 'Total billings to date across all projects.' },
          { title: 'Total retainage', value: formatMoney(totalRetainage), tone: 'neutral', text: 'Combined retainage receivable and payable.' },
          { title: 'Largest retainage', value: rowsOut[0].projectName, tone: 'neutral', text: formatMoney(rowsOut[0].retainageAmount) + ' (' + rowsOut[0].retainageType + ').' }
        ],
        [
          { title: 'Retainage receivable is a current asset', text: 'Report retainage receivable separately from accounts receivable on the balance sheet.' },
          { title: 'Retainage payable is a current liability', text: 'Retainage held on subcontractors should be tracked as a separate liability, not blended into AP.' },
          { title: 'Net position affects cash flow', text: 'If retainage payable exceeds receivable, you are financing subs — monitor this for cash impact.' },
          { title: 'Track release milestones', text: 'Retainage is typically released at substantial completion — track milestones to plan for both cash inflows and outflows.' }
        ],
        [
          { label: 'Retainage receivable', value: formatMoney(totalRetReceivable) },
          { label: 'Retainage payable', value: formatMoney(totalRetPayable) },
          { label: 'Net retainage', value: formatMoney(netRetainage) },
          { label: 'Total contracts', value: formatMoney(totalContractValue) },
          { label: 'Total billed', value: formatMoney(totalBilled) }
        ],
        { columns: [{ key: 'projectName', label: 'Project', type: 'text' }, { key: 'contractValue', label: 'Contract', type: 'money', align: 'right' }, { key: 'billedToDate', label: 'Billed', type: 'money', align: 'right' }, { key: 'retainagePct', label: 'Ret. %', type: 'percent', align: 'right' }, { key: 'retainageAmount', label: 'Retainage', type: 'money', align: 'right' }, { key: 'retainageType', label: 'Type', type: 'text' }], rows: rowsOut },
        rowsOut, 'Retainage tracking complete.'
      );
    },

    'equipment-cost-depreciation-tracker': function (values) {
      var cost = values.assetCost; if (!(cost > 0)) throw new Error('Enter the equipment purchase cost.');
      var salvage = Math.max(0, values.salvageValue || 0);
      var life = Math.round(values.usefulLife || 0); if (!(life >= 1)) throw new Error('Enter a useful life of at least 1 year.');
      if (salvage >= cost) throw new Error('Salvage value must be less than purchase cost.');
      var method = values.method || 'straight_line';
      var highlight = Math.min(life, Math.max(1, Math.round(values.currentYear || 1)));
      var depreciableBasis = cost - salvage;
      var schedule = [];
      var bookValue = cost;
      var accumulated = 0;
      var sydSum = life * (life + 1) / 2;
      for (var yr = 1; yr <= life; yr++) {
        var dep = 0;
        if (method === 'straight_line') {
          dep = depreciableBasis / life;
        } else if (method === 'double_declining') {
          var rate = 2 / life;
          dep = Math.min(bookValue - salvage, bookValue * rate);
          if (dep < 0) dep = 0;
        } else {
          dep = ((life - yr + 1) / sydSum) * depreciableBasis;
        }
        dep = Math.max(0, Math.min(dep, bookValue - salvage));
        accumulated += dep;
        bookValue -= dep;
        schedule.push({ year: yr, depreciation: dep, accumulated: accumulated, bookValue: bookValue });
      }
      var currentRow = schedule[highlight - 1] || schedule[0];
      var totalDep = schedule.reduce(function (t, r) { return t + r.depreciation; }, 0);
      var methodLabel = method === 'straight_line' ? 'Straight-Line' : method === 'double_declining' ? 'Double-Declining Balance' : 'Sum-of-Years-Digits';
      var tableRows = schedule.map(function (r) { return { Year: 'Year ' + r.year, 'Annual Depreciation': formatMoney(r.depreciation), 'Accumulated Depreciation': formatMoney(r.accumulated), 'Book Value': formatMoney(r.bookValue) }; });
      var exportRows = schedule.map(function (r) { return { Year: r.year, 'Annual Depreciation': Math.round(r.depreciation), 'Accumulated Depreciation': Math.round(r.accumulated), 'Book Value': Math.round(r.bookValue) }; });
      return buildResult(
        [{ label: 'Year ' + highlight + ' depreciation', value: formatMoney(currentRow.depreciation), tone: 'positive', help: 'Depreciation expense for the highlighted year.' }, { label: 'Depreciable basis', value: formatMoney(depreciableBasis), tone: 'neutral', help: 'Purchase cost less salvage value.' }, { label: 'Book value (Year ' + highlight + ')', value: formatMoney(currentRow.bookValue), tone: 'neutral', help: 'Remaining book value after Year ' + highlight + ' depreciation.' }, { label: 'Total depreciation', value: formatMoney(totalDep), tone: 'neutral', help: 'Total depreciation over the useful life.' }],
        [{ title: 'Method', value: methodLabel, tone: 'neutral', text: 'The depreciation method affects the timing of expense recognition over the asset\'s life.' }, { title: 'Useful life', value: formatNumber(life) + ' years', tone: 'neutral', text: 'Consistent life estimates across similar equipment support defensible capitalization policy.' }, { title: 'Salvage value', value: formatMoney(salvage), tone: salvage > 0 ? 'positive' : 'neutral', text: 'Salvage reduces the depreciable basis and prevents over-depreciation.' }],
        [{ title: 'Accelerated methods front-load expense', text: 'DDB produces larger deductions early in the asset\'s life, better matching heavy early use typical of construction equipment.' }, { title: 'Book value tracks replacement timing', text: 'When book value approaches zero, the asset may need replacement. Compare book value against current market value when making replacement decisions.' }, { title: 'Confirm partial-year treatment for live workpapers', text: 'This schedule uses full-year depreciation. Apply a half-year or mid-quarter convention if required by your tax or accounting policy.' }],
        [{ label: 'Purchase cost', value: formatMoney(cost) }, { label: 'Salvage value', value: formatMoney(salvage) }, { label: 'Depreciable basis', value: formatMoney(depreciableBasis) }, { label: 'Useful life', value: formatNumber(life) + ' years' }, { label: 'Method', value: methodLabel }, { label: 'Year 1 depreciation', value: formatMoney(schedule[0].depreciation) }, { label: 'Final year book value', value: formatMoney(schedule[life - 1].bookValue) }],
        { columns: [{ key: 'Year', label: 'Year' }, { key: 'Annual Depreciation', label: 'Annual Depreciation' }, { key: 'Accumulated Depreciation', label: 'Accumulated Depreciation' }, { key: 'Book Value', label: 'Book Value' }], rows: tableRows },
        exportRows, 'Equipment depreciation schedule built for ' + life + '-year ' + methodLabel + ' method.'
      );
    },

    'wip-schedule-builder': function (values) {
      var contractValue = values.contractValue; if (!(contractValue > 0)) throw new Error('Enter the contract value.');
      var estimatedCosts = values.estimatedCosts; if (!(estimatedCosts > 0)) throw new Error('Enter estimated total costs at completion.');
      var costsIncurred = values.costsIncurred; if (!(costsIncurred >= 0)) throw new Error('Enter costs incurred to date.');
      var billedToDate = values.billedToDate; if (!(billedToDate >= 0)) throw new Error('Enter billings to date.');
      if (costsIncurred > estimatedCosts) throw new Error('Costs incurred cannot exceed estimated total costs. Revise the estimated cost at completion.');
      var pctComplete = costsIncurred / estimatedCosts;
      var earnedRevenue = pctComplete * contractValue;
      var estimatedProfit = contractValue - estimatedCosts;
      var estimatedGrossMargin = estimatedProfit / contractValue * 100;
      var billingVsEarned = billedToDate - earnedRevenue;
      var isOverbilled = billingVsEarned > 0;
      var costsToComplete = estimatedCosts - costsIncurred;
      var revenueToEarn = contractValue - earnedRevenue;
      var isLossContract = estimatedProfit < 0;
      var exportRows = [
        { Line: 'Contract value', Amount: contractValue, Note: 'Signed contract price' },
        { Line: 'Estimated total costs', Amount: estimatedCosts, Note: 'Current EAC' },
        { Line: 'Costs incurred to date', Amount: costsIncurred, Note: 'From job cost ledger' },
        { Line: 'Percent complete', Amount: (pctComplete * 100).toFixed(1) + '%', Note: 'Cost-to-cost method' },
        { Line: 'Earned revenue', Amount: Math.round(earnedRevenue), Note: '% complete × contract value' },
        { Line: 'Billed to date', Amount: billedToDate, Note: 'From AR aging' },
        { Line: isOverbilled ? 'Overbilling (liability)' : 'Underbilling (asset)', Amount: Math.round(Math.abs(billingVsEarned)), Note: isOverbilled ? 'Billings in excess of earned revenue' : 'Earned revenue in excess of billings' },
        { Line: 'Estimated profit at completion', Amount: Math.round(estimatedProfit), Note: 'Contract value minus estimated costs' }
      ];
      return buildResult(
        [{ label: 'Percent complete', value: formatPercent(pctComplete * 100, 1), tone: 'positive', help: 'Costs incurred to date divided by estimated total costs.' }, { label: 'Earned revenue', value: formatMoney(earnedRevenue), tone: 'positive', help: '% complete × contract value.' }, { label: isOverbilled ? 'Overbilling' : 'Underbilling', value: formatMoney(Math.abs(billingVsEarned)), tone: isOverbilled ? 'warning' : 'positive', help: isOverbilled ? 'Billings exceed earned revenue — record as a liability.' : 'Earned revenue exceeds billings — record as a current asset.' }, { label: 'Estimated profit', value: formatMoney(estimatedProfit), tone: isLossContract ? 'critical' : 'positive', help: 'Contract value minus estimated total costs at completion.' }],
        [{ title: isOverbilled ? 'Overbilling position' : 'Underbilling position', value: formatMoney(Math.abs(billingVsEarned)), tone: isOverbilled ? 'warning' : 'positive', text: isOverbilled ? 'Billings exceed earned revenue. The overbilling is a current liability (billings in excess of costs).' : 'Earned revenue exceeds billings. The underbilling is a current asset (costs in excess of billings).' }, { title: 'Estimated gross margin', value: formatPercent(estimatedGrossMargin, 1), tone: isLossContract ? 'critical' : estimatedGrossMargin < 10 ? 'warning' : 'positive', text: isLossContract ? 'This contract has a projected loss — recognize the full loss immediately.' : 'The estimated margin at completion based on current EAC.' }, { title: 'Costs remaining', value: formatMoney(costsToComplete), tone: 'neutral', text: 'Estimated remaining spend needed to complete the contract.' }],
        [{ title: 'EAC quality drives percent complete', text: 'If the estimated cost at completion is outdated or optimistic, earned revenue and the WIP position are both unreliable.' }, { title: 'Loss contracts require immediate recognition', text: 'When estimated costs exceed contract value, the full estimated loss must be recognized in the current period — not spread over remaining completion.' }, { title: 'Tie billings to the AR aging', text: 'Billings-to-date should reconcile to the contract receivable balance on the balance sheet before the WIP schedule is finalized.' }],
        [{ label: 'Contract value', value: formatMoney(contractValue) }, { label: 'Estimated costs', value: formatMoney(estimatedCosts) }, { label: 'Costs incurred', value: formatMoney(costsIncurred) }, { label: 'Percent complete', value: formatPercent(pctComplete * 100, 1) }, { label: 'Earned revenue', value: formatMoney(earnedRevenue) }, { label: 'Billed to date', value: formatMoney(billedToDate) }, { label: isOverbilled ? 'Overbilling' : 'Underbilling', value: formatMoney(Math.abs(billingVsEarned)) }, { label: 'Estimated profit', value: formatMoney(estimatedProfit) }],
        { columns: [{ key: 'Line', label: 'Line' }, { key: 'Amount', label: 'Amount' }, { key: 'Note', label: 'Note' }], rows: exportRows },
        exportRows, isLossContract ? 'Loss contract — recognize full estimated loss immediately.' : (isOverbilled ? 'Overbilling: ' + formatMoney(billingVsEarned) + ' to record as liability.' : 'Underbilling: ' + formatMoney(Math.abs(billingVsEarned)) + ' to record as asset.')
      );
    },

    'real-estate-roi-calculator': function (values) {
      var purchasePrice = values.purchasePrice; if (!(purchasePrice > 0)) throw new Error('Enter the purchase price.');
      var closingCosts = values.closingCosts || 0;
      var renovationCosts = values.renovationCosts || 0;
      var downPayment = values.downPayment; if (!(downPayment > 0)) throw new Error('Enter the down payment.');
      var monthlyRent = values.monthlyRent; if (!(monthlyRent > 0)) throw new Error('Enter the monthly gross rent.');
      var vacancyRate = (values.vacancyRatePct || 0) / 100;
      var monthlyExpenses = values.monthlyExpenses || 0;
      var monthlyDebtService = values.monthlyDebtService || 0;
      var appreciationPct = (values.annualAppreciationPct || 0) / 100;
      var totalCashInvested = downPayment + closingCosts + renovationCosts;
      var annualGrossRent = monthlyRent * 12;
      var effectiveGrossIncome = annualGrossRent * (1 - vacancyRate);
      var annualExpenses = monthlyExpenses * 12;
      var annualDebtService = monthlyDebtService * 12;
      var noi = effectiveGrossIncome - annualExpenses;
      var annualCashFlow = noi - annualDebtService;
      var cocReturn = totalCashInvested > 0 ? annualCashFlow / totalCashInvested * 100 : 0;
      var annualAppreciation = purchasePrice * appreciationPct;
      var totalReturn = totalCashInvested > 0 ? (annualCashFlow + annualAppreciation) / totalCashInvested * 100 : 0;
      var expenseRatio = effectiveGrossIncome > 0 ? annualExpenses / effectiveGrossIncome * 100 : 0;
      var capRate = purchasePrice > 0 ? noi / purchasePrice * 100 : 0;
      var dscr = annualDebtService > 0 ? noi / annualDebtService : null;
      var exportRows = [
        { Metric: 'Total cash invested', Value: Math.round(totalCashInvested), Note: 'Down payment + closing costs + renovation' },
        { Metric: 'Annual gross rent', Value: Math.round(annualGrossRent), Note: 'At full occupancy' },
        { Metric: 'Effective gross income', Value: Math.round(effectiveGrossIncome), Note: 'After vacancy' },
        { Metric: 'Annual operating expenses', Value: Math.round(annualExpenses), Note: 'Before debt service' },
        { Metric: 'Net operating income (NOI)', Value: Math.round(noi), Note: 'EGI minus operating expenses' },
        { Metric: 'Annual debt service', Value: Math.round(annualDebtService), Note: 'Annual P&I payments' },
        { Metric: 'Annual cash flow', Value: Math.round(annualCashFlow), Note: 'NOI minus debt service' },
        { Metric: 'Cash-on-cash return', Value: cocReturn.toFixed(2) + '%', Note: 'Cash flow / total cash invested' },
        { Metric: 'Cap rate', Value: capRate.toFixed(2) + '%', Note: 'NOI / purchase price' },
        { Metric: 'Total return (with appreciation)', Value: totalReturn.toFixed(2) + '%', Note: 'Cash flow + appreciation / total invested' }
      ];
      return buildResult(
        [{ label: 'Cash-on-cash return', value: formatPercent(cocReturn, 1), tone: cocReturn < 0 ? 'critical' : cocReturn < 5 ? 'warning' : 'positive', help: 'Annual cash flow divided by total cash invested.' }, { label: 'Annual cash flow', value: formatMoney(annualCashFlow), tone: annualCashFlow < 0 ? 'critical' : 'positive', help: 'NOI minus annual debt service.' }, { label: 'Cap rate', value: formatPercent(capRate, 1), tone: capRate < 4 ? 'warning' : 'positive', help: 'NOI divided by purchase price.' }, { label: 'Total return', value: formatPercent(totalReturn, 1), tone: totalReturn < 5 ? 'warning' : 'positive', help: 'Annual cash flow plus appreciation divided by total cash invested.' }],
        [{ title: 'Total cash invested', value: formatMoney(totalCashInvested), tone: 'neutral', text: 'Includes down payment, closing costs, and renovation — the full out-of-pocket basis for the return calculation.' }, { title: 'NOI', value: formatMoney(noi), tone: noi < 0 ? 'critical' : 'positive', text: 'Net operating income before debt service. This is the number cap rate is based on.' }, { title: 'Debt coverage', value: dscr == null ? 'No debt' : formatRatio(dscr), tone: dscr == null ? 'positive' : dscr < 1.2 ? 'warning' : 'positive', text: dscr == null ? 'No debt entered — cash-on-cash equals unlevered yield.' : 'DSCR below 1.20x is often below minimum lender requirements.' }],
        [{ title: 'Vacancy is the most compressed input', text: 'A 5% vacancy rate difference changes effective gross income and every downstream metric. Use market vacancy, not optimistic occupancy.' }, { title: 'Cash-on-cash and total ROI tell different stories', text: 'Negative cash flow with strong appreciation means you are paying to hold an appreciating asset. Decide whether that strategy matches your investment thesis.' }, { title: 'Appreciation adds return but not liquidity', text: 'Appreciation is unrealized until sale. If the property is cash-flow negative, the investor must fund the deficit from other sources while waiting for appreciation.' }],
        [{ label: 'Purchase price', value: formatMoney(purchasePrice) }, { label: 'Total cash invested', value: formatMoney(totalCashInvested) }, { label: 'NOI', value: formatMoney(noi) }, { label: 'Annual cash flow', value: formatMoney(annualCashFlow) }, { label: 'Cash-on-cash return', value: formatPercent(cocReturn, 1) }, { label: 'Cap rate', value: formatPercent(capRate, 1) }, { label: 'Total return', value: formatPercent(totalReturn, 1) }],
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }, { key: 'Note', label: 'Note' }], rows: exportRows },
        exportRows, 'Real estate ROI: ' + formatPercent(cocReturn, 1) + ' cash-on-cash, ' + formatPercent(totalReturn, 1) + ' total return.'
      );
    },

    'cash-on-cash-return-calculator': function (values) {
      var downPayment = values.downPayment; if (!(downPayment > 0)) throw new Error('Enter the down payment.');
      var closingCosts = values.closingCosts || 0;
      var renovationCosts = values.renovationCosts || 0;
      var annualGrossRent = values.annualGrossRent; if (!(annualGrossRent > 0)) throw new Error('Enter the annual gross rent.');
      var vacancyRate = (values.vacancyRatePct || 0) / 100;
      var annualOperatingExpenses = values.annualOperatingExpenses || 0;
      var annualDebtService = values.annualDebtService || 0;
      var totalCashInvested = downPayment + closingCosts + renovationCosts;
      var egi = annualGrossRent * (1 - vacancyRate);
      var noi = egi - annualOperatingExpenses;
      var annualCashFlow = noi - annualDebtService;
      var cocReturn = totalCashInvested > 0 ? annualCashFlow / totalCashInvested * 100 : 0;
      var expenseRatio = egi > 0 ? annualOperatingExpenses / egi * 100 : 0;
      var dscr = annualDebtService > 0 ? noi / annualDebtService : null;
      var exportRows = [
        { Metric: 'Down payment', Value: Math.round(downPayment) },
        { Metric: 'Closing costs', Value: Math.round(closingCosts) },
        { Metric: 'Renovation costs', Value: Math.round(renovationCosts) },
        { Metric: 'Total cash invested', Value: Math.round(totalCashInvested) },
        { Metric: 'Annual gross rent', Value: Math.round(annualGrossRent) },
        { Metric: 'Effective gross income (after vacancy)', Value: Math.round(egi) },
        { Metric: 'Annual operating expenses', Value: Math.round(annualOperatingExpenses) },
        { Metric: 'Net operating income (NOI)', Value: Math.round(noi) },
        { Metric: 'Annual debt service', Value: Math.round(annualDebtService) },
        { Metric: 'Annual cash flow', Value: Math.round(annualCashFlow) },
        { Metric: 'Cash-on-cash return', Value: cocReturn.toFixed(2) + '%' }
      ];
      return buildResult(
        [{ label: 'Cash-on-cash return', value: formatPercent(cocReturn, 1), tone: cocReturn < 0 ? 'critical' : cocReturn < 5 ? 'warning' : 'positive', help: 'Annual pre-tax cash flow divided by total cash invested.' }, { label: 'Annual cash flow', value: formatMoney(annualCashFlow), tone: annualCashFlow < 0 ? 'critical' : 'positive', help: 'NOI minus debt service.' }, { label: 'NOI', value: formatMoney(noi), tone: noi < 0 ? 'critical' : 'positive', help: 'Effective gross income minus operating expenses.' }, { label: 'Total cash invested', value: formatMoney(totalCashInvested), tone: 'neutral', help: 'Down payment plus closing costs plus renovation.' }],
        [{ title: 'Expense ratio', value: formatPercent(expenseRatio, 1), tone: expenseRatio > 55 ? 'warning' : 'positive', text: 'Operating expenses as a percentage of EGI. Above 50-55% may indicate management or cost issues.' }, { title: 'Debt coverage', value: dscr == null ? 'No debt' : formatRatio(dscr), tone: dscr == null ? 'positive' : dscr < 1.2 ? 'warning' : 'positive', text: dscr == null ? 'No debt service entered.' : 'DSCR below 1.20x is often a minimum lender requirement.' }, { title: 'Return vs. target', value: cocReturn >= 8 ? 'Meets typical target' : cocReturn >= 5 ? 'Below typical target' : 'Negative cash flow', tone: cocReturn >= 8 ? 'positive' : cocReturn >= 5 ? 'warning' : 'critical', text: 'Most investors target 6-12% cash-on-cash for residential rentals.' }],
        [{ title: 'Total cash invested is the complete denominator', text: 'Down payment alone underestimates the investment. Closing costs and renovation are real cash outflows that reduce the effective return.' }, { title: 'Positive NOI does not guarantee positive cash flow', text: 'High leverage can push debt service above NOI, producing negative cash flow even on a property with strong NOI.' }, { title: 'Benchmark against comparable deals', text: 'Cash-on-cash return comparisons are only meaningful when the same inputs — especially vacancy and expense definitions — are used consistently.' }],
        [{ label: 'Total cash invested', value: formatMoney(totalCashInvested) }, { label: 'NOI', value: formatMoney(noi) }, { label: 'Cash flow', value: formatMoney(annualCashFlow) }, { label: 'Cash-on-cash return', value: formatPercent(cocReturn, 1) }, { label: 'Expense ratio', value: formatPercent(expenseRatio, 1) }, { label: 'DSCR', value: dscr == null ? 'N/A' : formatRatio(dscr) }],
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, 'Cash-on-cash return: ' + formatPercent(cocReturn, 1) + '.'
      );
    },

    'rental-property-income-expense-tracker': function (values) {
      var monthlyRent = values.monthlyRent; if (!(monthlyRent > 0)) throw new Error('Enter the monthly gross rent.');
      var vacancyRate = (values.vacancyRatePct || 0) / 100;
      var otherIncome = values.otherIncome || 0;
      var propertyTax = values.propertyTax || 0;
      var insurance = values.insurance || 0;
      var maintenance = values.maintenance || 0;
      var managementPct = (values.managementPct || 0) / 100;
      var annualMortgage = values.annualMortgage || 0;
      var otherExpenses = values.otherExpenses || 0;
      var annualGrossRent = monthlyRent * 12;
      var egi = annualGrossRent * (1 - vacancyRate) + otherIncome;
      var managementFee = egi * managementPct;
      var operatingExpenses = propertyTax + insurance + maintenance + managementFee + otherExpenses;
      var noi = egi - operatingExpenses;
      var cashFlowAfterDebt = noi - annualMortgage;
      var expenseRatio = egi > 0 ? operatingExpenses / egi * 100 : 0;
      var vacancyLoss = annualGrossRent * vacancyRate;
      var exportRows = [
        { Line: 'Gross potential rent', Amount: Math.round(annualGrossRent), Note: 'Monthly rent × 12' },
        { Line: 'Vacancy loss', Amount: -Math.round(vacancyLoss), Note: 'Vacancy rate applied' },
        { Line: 'Other income', Amount: Math.round(otherIncome), Note: 'Parking, laundry, etc.' },
        { Line: 'Effective gross income', Amount: Math.round(egi), Note: 'Net of vacancy' },
        { Line: 'Property tax', Amount: -Math.round(propertyTax), Note: '' },
        { Line: 'Insurance', Amount: -Math.round(insurance), Note: '' },
        { Line: 'Maintenance & repairs', Amount: -Math.round(maintenance), Note: '' },
        { Line: 'Property management fee', Amount: -Math.round(managementFee), Note: managementPct > 0 ? (managementPct * 100).toFixed(1) + '% of EGI' : 'Not entered' },
        { Line: 'Other expenses', Amount: -Math.round(otherExpenses), Note: '' },
        { Line: 'Total operating expenses', Amount: -Math.round(operatingExpenses), Note: '' },
        { Line: 'Net operating income (NOI)', Amount: Math.round(noi), Note: 'Before debt service' },
        { Line: 'Mortgage payment (P&I)', Amount: -Math.round(annualMortgage), Note: '' },
        { Line: 'Cash flow after debt service', Amount: Math.round(cashFlowAfterDebt), Note: '' }
      ];
      return buildResult(
        [{ label: 'Net operating income', value: formatMoney(noi), tone: noi < 0 ? 'critical' : 'positive', help: 'Effective gross income minus all operating expenses before debt service.' }, { label: 'Cash flow after debt', value: formatMoney(cashFlowAfterDebt), tone: cashFlowAfterDebt < 0 ? 'critical' : 'positive', help: 'NOI minus annual mortgage payments.' }, { label: 'Expense ratio', value: formatPercent(expenseRatio, 1), tone: expenseRatio > 55 ? 'warning' : 'positive', help: 'Operating expenses as a percentage of effective gross income.' }, { label: 'Effective gross income', value: formatMoney(egi), tone: 'positive', help: 'Gross rent less vacancy loss plus other income.' }],
        [{ title: 'Vacancy impact', value: formatMoney(vacancyLoss), tone: vacancyLoss > 0 ? 'warning' : 'neutral', text: 'Annual income lost to vacancy at the entered rate. This is money not collected, not a cash expense.' }, { title: 'Management fee', value: managementPct > 0 ? formatMoney(managementFee) : 'Not entered', tone: 'neutral', text: 'Property management fees are deductible expenses on Schedule E whether the property is self-managed or professionally managed.' }, { title: 'NOI vs. debt service', value: annualMortgage > 0 ? formatRatio(noi / annualMortgage) : 'No debt', tone: annualMortgage > 0 && noi / annualMortgage < 1.2 ? 'warning' : 'positive', text: 'NOI should comfortably cover debt service. A coverage ratio below 1.20x indicates thin margin.' }],
        [{ title: 'Expense completeness matters most', text: 'Missing expense categories overstates NOI and produces misleading return metrics. Review the full Schedule E expense list before finalizing.' }, { title: 'NOI excludes depreciation', text: 'Depreciation is a major tax deduction for rental properties but is not included in NOI. Track it separately for Schedule E preparation.' }, { title: 'Mortgage principal is not deductible', text: 'Only the interest portion of the mortgage payment is tax-deductible. The amortization table separates P&I for Schedule E preparation.' }],
        [{ label: 'Gross potential rent', value: formatMoney(annualGrossRent) }, { label: 'Effective gross income', value: formatMoney(egi) }, { label: 'Operating expenses', value: formatMoney(operatingExpenses) }, { label: 'NOI', value: formatMoney(noi) }, { label: 'Cash flow after debt', value: formatMoney(cashFlowAfterDebt) }, { label: 'Expense ratio', value: formatPercent(expenseRatio, 1) }],
        { columns: [{ key: 'Line', label: 'Line' }, { key: 'Amount', label: 'Amount ($)' }, { key: 'Note', label: 'Note' }], rows: exportRows },
        exportRows, 'NOI: ' + formatMoney(noi) + '. Cash flow after debt: ' + formatMoney(cashFlowAfterDebt) + '.'
      );
    },

    'rental-property-depreciation-schedule': function (values) {
      var purchasePrice = values.purchasePrice; if (!(purchasePrice > 0)) throw new Error('Enter the total acquisition cost.');
      var landValue = Math.max(0, values.landValue || 0);
      var improvements = Math.max(0, values.improvements || 0);
      if (landValue >= purchasePrice) throw new Error('Land value must be less than the total acquisition cost.');
      var propertyType = values.propertyType || 'residential';
      var serviceMonth = parseInt(values.placeInServiceMonth || '1', 10);
      var life = propertyType === 'residential' ? 27.5 : 39;
      var depreciableBasis = purchasePrice - landValue + improvements;
      var annualDep = depreciableBasis / life;
      // Mid-month convention: first year = (12.5 - month) / 12 × annual
      var firstYearMonths = 12.5 - serviceMonth;
      var firstYearDep = annualDep * (firstYearMonths / 12);
      var lastYearDep = annualDep - firstYearDep;
      var totalYears = Math.floor(life) + 1; // life + partial final year
      var schedule = [];
      var accumulated = 0;
      var bookValue = purchasePrice - landValue; // depreciable basis only (land separate)
      for (var yr = 1; yr <= totalYears; yr++) {
        var dep;
        if (yr === 1) { dep = firstYearDep; }
        else if (yr === totalYears) { dep = lastYearDep; }
        else { dep = annualDep; }
        dep = Math.min(dep, bookValue);
        accumulated += dep;
        bookValue -= dep;
        schedule.push({ year: yr, depreciation: dep, accumulated: accumulated, bookValueBuilding: Math.max(0, bookValue), adjustedBasis: Math.max(0, bookValue) + landValue });
      }
      var year1Dep = schedule[0].depreciation;
      var propertyLabel = propertyType === 'residential' ? 'Residential (27.5-year)' : 'Commercial / Nonresidential (39-year)';
      var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var tableRows = schedule.slice(0, Math.min(schedule.length, 40)).map(function (r) {
        return { Year: 'Year ' + r.year, 'Annual Depreciation': formatMoney(r.depreciation), 'Accumulated Depreciation': formatMoney(r.accumulated), 'Adjusted Basis': formatMoney(r.adjustedBasis) };
      });
      var exportRows = schedule.slice(0, 40).map(function (r) {
        return { Year: r.year, 'Annual Depreciation': Math.round(r.depreciation), 'Accumulated Depreciation': Math.round(r.accumulated), 'Adjusted Basis (Building Only)': Math.round(r.bookValueBuilding), 'Total Adjusted Basis': Math.round(r.adjustedBasis) };
      });
      return buildResult(
        [{ label: 'Annual depreciation', value: formatMoney(annualDep), tone: 'positive', help: 'Full-year straight-line amount.' }, { label: 'Year 1 depreciation', value: formatMoney(year1Dep), tone: 'positive', help: 'Prorated first-year amount using mid-month convention (placed in service ' + monthNames[serviceMonth - 1] + ').' }, { label: 'Depreciable basis', value: formatMoney(depreciableBasis), tone: 'neutral', help: 'Purchase price minus land value plus improvements.' }, { label: 'Useful life', value: life + ' years', tone: 'neutral', help: propertyLabel }],
        [{ title: 'Recovery class', value: propertyLabel, tone: 'neutral', text: 'Residential rental is 27.5-year property; nonresidential (commercial) is 39-year property.' }, { title: 'Land portion (not depreciable)', value: formatMoney(landValue), tone: landValue === 0 ? 'warning' : 'neutral', text: landValue === 0 ? 'No land value entered — confirm that land has been excluded from the depreciable basis.' : 'Land allocation excluded from depreciable basis as required.' }, { title: 'Mid-month first year', value: monthNames[serviceMonth - 1] + ' — ' + firstYearDep.toFixed(2) + ' prorated', tone: 'neutral', text: 'The IRS mid-month convention reduces first-year depreciation based on the acquisition month.' }],
        [{ title: 'Document the land allocation', text: 'The IRS may challenge land allocations without supporting documentation. Use assessor records, appraisal, or closing statement allocation as support.' }, { title: 'Track accumulated depreciation for basis', text: 'At sale, accumulated depreciation reduces adjusted basis and increases gain subject to Section 1250 unrecaptured depreciation tax at up to 25%.' }, { title: 'Mid-month convention applies at disposition too', text: 'When the property is sold, depreciation in the year of sale is also prorated using the mid-month convention for the disposal month.' }],
        [{ label: 'Property type', value: propertyLabel }, { label: 'Acquisition cost', value: formatMoney(purchasePrice) }, { label: 'Land value', value: formatMoney(landValue) }, { label: 'Improvements', value: formatMoney(improvements) }, { label: 'Depreciable basis', value: formatMoney(depreciableBasis) }, { label: 'Annual depreciation', value: formatMoney(annualDep) }, { label: 'Year 1 depreciation', value: formatMoney(year1Dep) }],
        { columns: [{ key: 'Year', label: 'Year' }, { key: 'Annual Depreciation', label: 'Annual Depreciation' }, { key: 'Accumulated Depreciation', label: 'Accumulated Depreciation' }, { key: 'Adjusted Basis', label: 'Adjusted Basis' }], rows: tableRows },
        exportRows, 'Rental property depreciation: ' + formatMoney(annualDep) + ' per year over ' + life + ' years.'
      );
    },

    '1031-exchange-boot-calculator': function (values) {
      var relinquishedFMV = values.relinquishedFMV; if (!(relinquishedFMV > 0)) throw new Error('Enter the relinquished property FMV.');
      var relinquishedBasis = values.relinquishedBasis; if (!(relinquishedBasis >= 0)) throw new Error('Enter the adjusted basis of the relinquished property.');
      var relinquishedMortgage = values.relinquishedMortgage || 0;
      var replacementFMV = values.replacementFMV; if (!(replacementFMV > 0)) throw new Error('Enter the replacement property FMV.');
      var replacementMortgage = values.replacementMortgage || 0;
      var cashPaid = values.cashPaid || 0;
      var cashReceived = values.cashReceived || 0;
      var gainRealized = relinquishedFMV - relinquishedBasis;
      var mortgageBoot = Math.max(0, relinquishedMortgage - replacementMortgage - cashPaid);
      var cashBoot = cashReceived;
      var totalBoot = mortgageBoot + cashBoot;
      var gainRecognized = Math.min(gainRealized, totalBoot);
      var gainDeferred = Math.max(0, gainRealized - gainRecognized);
      var exchangeQualifies = replacementFMV >= relinquishedFMV && (replacementMortgage + cashPaid) >= relinquishedMortgage;
      var newBasis = relinquishedBasis + (replacementFMV - relinquishedFMV) + gainRecognized;
      var exportRows = [
        { Line: 'Relinquished property FMV', Amount: Math.round(relinquishedFMV), Note: 'Sale price' },
        { Line: 'Adjusted basis (relinquished)', Amount: Math.round(relinquishedBasis), Note: 'Cost less accumulated depreciation' },
        { Line: 'Gain realized', Amount: Math.round(gainRealized), Note: 'FMV minus adjusted basis' },
        { Line: 'Mortgage relief (boot)', Amount: Math.round(Math.max(0, relinquishedMortgage - replacementMortgage)), Note: 'Net reduction in mortgage debt' },
        { Line: 'Cash boot offset', Amount: Math.round(cashPaid), Note: 'Cash paid to offset mortgage relief' },
        { Line: 'Net mortgage boot', Amount: Math.round(mortgageBoot), Note: '' },
        { Line: 'Cash received (boot)', Amount: Math.round(cashBoot), Note: '' },
        { Line: 'Total boot', Amount: Math.round(totalBoot), Note: '' },
        { Line: 'Gain recognized', Amount: Math.round(gainRecognized), Note: 'Lesser of boot and gain realized' },
        { Line: 'Gain deferred', Amount: Math.round(gainDeferred), Note: 'Deferred into replacement basis' }
      ];
      return buildResult(
        [{ label: 'Gain realized', value: formatMoney(gainRealized), tone: gainRealized > 0 ? 'warning' : 'positive', help: 'FMV minus adjusted basis of relinquished property.' }, { label: 'Total boot', value: formatMoney(totalBoot), tone: totalBoot > 0 ? 'warning' : 'positive', help: 'Cash boot plus net mortgage boot.' }, { label: 'Gain recognized', value: formatMoney(gainRecognized), tone: gainRecognized > 0 ? 'critical' : 'positive', help: 'Taxable gain — the lesser of total boot and gain realized.' }, { label: 'Gain deferred', value: formatMoney(gainDeferred), tone: gainDeferred > 0 ? 'positive' : 'neutral', help: 'Amount successfully deferred into the replacement property basis.' }],
        [{ title: 'Exchange qualification', value: exchangeQualifies ? 'Meets basic requirements' : 'May not qualify for full deferral', tone: exchangeQualifies ? 'positive' : 'warning', text: exchangeQualifies ? 'Replacement property value and debt replace or exceed the relinquished property on both measures.' : 'Replacement property value or debt does not meet the equal-or-greater requirement for full gain deferral.' }, { title: 'Mortgage boot', value: formatMoney(mortgageBoot), tone: mortgageBoot > 0 ? 'warning' : 'positive', text: mortgageBoot > 0 ? 'Net mortgage relief creates taxable boot even if no cash is received. Adding cash to the exchange can offset this.' : 'No mortgage boot. The new debt plus cash paid covers the old debt released.' }, { title: 'Estimated replacement basis', value: formatMoney(newBasis), tone: 'neutral', text: 'Approximate basis in the replacement property, incorporating the deferred gain.' }],
        [{ title: 'Restructure to eliminate boot before closing', text: 'Boot can be eliminated by adding cash to the exchange, increasing the replacement mortgage, or purchasing a higher-value replacement property.' }, { title: 'Depreciation recapture is not deferrable', text: 'Unrecaptured Section 1250 depreciation is taxed at up to 25% even in a successful 1031 exchange. This tool does not calculate that component separately.' }, { title: 'Qualified intermediary required', text: 'The exchanger cannot touch the proceeds. A QI must hold exchange funds from closing of the relinquished property to closing on the replacement.' }],
        [{ label: 'Gain realized', value: formatMoney(gainRealized) }, { label: 'Mortgage boot', value: formatMoney(mortgageBoot) }, { label: 'Cash boot', value: formatMoney(cashBoot) }, { label: 'Total boot', value: formatMoney(totalBoot) }, { label: 'Gain recognized', value: formatMoney(gainRecognized) }, { label: 'Gain deferred', value: formatMoney(gainDeferred) }],
        { columns: [{ key: 'Line', label: 'Line' }, { key: 'Amount', label: 'Amount ($)' }, { key: 'Note', label: 'Note' }], rows: exportRows },
        exportRows, gainRecognized > 0 ? 'Boot of ' + formatMoney(totalBoot) + ' triggers ' + formatMoney(gainRecognized) + ' taxable gain.' : 'No boot — full gain deferral achieved.'
      );
    },

    'real-estate-passive-loss-tracker': function (values) {
      var currentYearLoss = values.currentYearLoss; if (!(currentYearLoss >= 0)) throw new Error('Enter the current-year rental loss (enter 0 if none).');
      var priorSuspended = values.priorSuspendedLosses || 0;
      var passiveIncome = values.passiveIncome || 0;
      var agi = values.agi; if (!(agi >= 0)) throw new Error('Enter your adjusted gross income.');
      var participation = values.participationStatus || 'active';
      var totalLoss = currentYearLoss + priorSuspended;
      var deductible = 0;
      var allowance = 0;
      var allowanceLabel = '';
      if (participation === 'rep') {
        deductible = totalLoss;
        allowanceLabel = 'Real estate professional — no passive loss limitation';
      } else if (participation === 'passive') {
        deductible = Math.min(totalLoss, passiveIncome);
        allowanceLabel = 'Passive investor — offsets passive income only';
      } else {
        // Active participant: $25,000 allowance with AGI phase-out
        var baseAllowance = 25000;
        var phaseOutFloor = 100000;
        var phaseOutCeil = 150000;
        if (agi <= phaseOutFloor) {
          allowance = baseAllowance;
        } else if (agi >= phaseOutCeil) {
          allowance = 0;
        } else {
          allowance = baseAllowance - (agi - phaseOutFloor) * 0.5;
        }
        allowance = Math.max(0, allowance);
        deductible = Math.min(totalLoss, passiveIncome + allowance);
        allowanceLabel = 'Active participant — $25,000 allowance (AGI phase-out applied)';
      }
      deductible = Math.min(deductible, totalLoss);
      var suspended = Math.max(0, totalLoss - deductible);
      var phaseOutPct = agi > 150000 ? 100 : agi > 100000 ? (agi - 100000) / 500 : 0;
      var exportRows = [
        { Line: 'Current-year rental loss', Amount: currentYearLoss },
        { Line: 'Prior suspended losses', Amount: priorSuspended },
        { Line: 'Total loss available', Amount: totalLoss },
        { Line: 'Passive income (offset)', Amount: passiveIncome },
        { Line: '$25,000 allowance (after phase-out)', Amount: allowance },
        { Line: 'Total deductible this year', Amount: Math.round(deductible) },
        { Line: 'Suspended loss carryforward', Amount: Math.round(suspended) }
      ];
      return buildResult(
        [{ label: 'Deductible this year', value: formatMoney(deductible), tone: deductible > 0 ? 'positive' : 'warning', help: 'Amount of rental loss deductible against ordinary income this year.' }, { label: 'Suspended carryforward', value: formatMoney(suspended), tone: suspended > 0 ? 'warning' : 'positive', help: 'Amount carried forward to future years or released at sale.' }, { label: 'Total loss available', value: formatMoney(totalLoss), tone: 'neutral', help: 'Current-year loss plus prior suspended losses.' }, { label: '$25K allowance', value: participation === 'active' ? formatMoney(allowance) : (participation === 'rep' ? 'Not applicable' : 'Not applicable'), tone: participation === 'active' && allowance < 25000 ? 'warning' : 'neutral', help: allowanceLabel }],
        [{ title: 'Participation status', value: participation === 'rep' ? 'Real estate professional' : participation === 'active' ? 'Active participant' : 'Passive investor', tone: 'neutral', text: allowanceLabel }, { title: 'Phase-out applied', value: participation === 'active' ? formatPercent(phaseOutPct, 0) + ' phase-out' : 'N/A', tone: participation === 'active' && phaseOutPct > 0 ? 'warning' : 'neutral', text: participation === 'active' ? 'The $25,000 allowance phases out 50 cents per dollar of AGI above $100,000, reaching zero at $150,000 AGI.' : '' }, { title: 'Passive income offset', value: formatMoney(passiveIncome), tone: passiveIncome > 0 ? 'positive' : 'neutral', text: 'Passive income from any source can absorb passive rental losses before the allowance is applied.' }],
        [{ title: 'Plan dispositions with the suspended balance in mind', text: 'All suspended passive losses are released in the year of a fully taxable sale, potentially offsetting a large portion of the capital gain tax.' }, { title: 'RE professional qualification requires documentation', text: 'The 750-hour and 50%-of-time tests require contemporaneous time logs. Retroactive reconstruction is difficult to defend on audit.' }, { title: 'MFJ vs. MFS matters significantly', text: 'Married filing separately taxpayers have a $0 allowance for real estate losses, not $12,500. This is one of the most common filing-status errors on rental returns.' }],
        [{ label: 'Participation status', value: participation === 'rep' ? 'RE Professional' : participation === 'active' ? 'Active' : 'Passive' }, { label: 'Total loss available', value: formatMoney(totalLoss) }, { label: 'Passive income', value: formatMoney(passiveIncome) }, { label: 'Allowance', value: participation === 'active' ? formatMoney(allowance) : 'N/A' }, { label: 'Deductible', value: formatMoney(deductible) }, { label: 'Suspended', value: formatMoney(suspended) }],
        { columns: [{ key: 'Line', label: 'Line' }, { key: 'Amount', label: 'Amount ($)' }], rows: exportRows },
        exportRows, 'Deductible: ' + formatMoney(deductible) + '. Suspended carryforward: ' + formatMoney(suspended) + '.'
      );
    },

    'mortgage-amortization-table': function (values) {
      var loanAmount = values.loanAmount; if (!(loanAmount > 0)) throw new Error('Enter the loan amount.');
      var annualRate = values.annualRate; if (!(annualRate > 0)) throw new Error('Enter the annual interest rate.');
      var termYears = Math.round(values.termYears || 0); if (!(termYears >= 1)) throw new Error('Enter a loan term of at least 1 year.');
      var startYear = Math.round(values.startYear || 2024);
      var monthlyRate = annualRate / 100 / 12;
      var n = termYears * 12;
      var monthlyPayment = loanAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -n));
      var balance = loanAmount;
      var yearlyRows = [];
      for (var yr = 1; yr <= termYears; yr++) {
        var annualInterest = 0, annualPrincipal = 0;
        for (var mo = 1; mo <= 12; mo++) {
          var interest = balance * monthlyRate;
          var principal = Math.min(monthlyPayment - interest, balance);
          annualInterest += interest;
          annualPrincipal += principal;
          balance -= principal;
          if (balance < 0.01) balance = 0;
        }
        yearlyRows.push({ year: yr + startYear - 1, annualPayment: monthlyPayment * 12, annualInterest: annualInterest, annualPrincipal: annualPrincipal, endingBalance: Math.max(0, balance) });
      }
      var totalInterest = yearlyRows.reduce(function (t, r) { return t + r.annualInterest; }, 0);
      var totalPayments = monthlyPayment * n;
      var year1 = yearlyRows[0];
      var tableRows = yearlyRows.map(function (r) { return { Year: String(r.year), 'Annual Payment': formatMoney(r.annualPayment), 'Interest Paid': formatMoney(r.annualInterest), 'Principal Paid': formatMoney(r.annualPrincipal), 'Ending Balance': formatMoney(r.endingBalance) }; });
      var exportRows = yearlyRows.map(function (r) { return { Year: r.year, 'Annual Payment': Math.round(r.annualPayment), 'Interest Paid': Math.round(r.annualInterest), 'Principal Paid': Math.round(r.annualPrincipal), 'Ending Balance': Math.round(r.endingBalance) }; });
      return buildResult(
        [{ label: 'Monthly payment', value: formatMoney(monthlyPayment), tone: 'positive', help: 'Fixed monthly P&I payment over the loan term.' }, { label: 'Year 1 interest', value: formatMoney(year1.annualInterest), tone: 'neutral', help: 'Tax-deductible interest in the first year.' }, { label: 'Total interest', value: formatMoney(totalInterest), tone: 'neutral', help: 'Total interest paid over the full loan term.' }, { label: 'Total payments', value: formatMoney(totalPayments), tone: 'neutral', help: 'Total cash paid including principal and interest.' }],
        [{ title: 'Interest front-loading', value: formatPercent(year1.annualInterest / (monthlyPayment * 12) * 100, 1) + ' interest in Year 1', tone: 'neutral', text: 'Early in an amortizing loan, most of the payment is interest. The interest/principal mix shifts over time.' }, { title: 'Total financing cost', value: formatMoney(totalInterest), tone: 'neutral', text: 'The total interest paid over the life of the loan is the full cost of the financing beyond repaying the principal.' }, { title: 'Year 1 interest deduction', value: formatMoney(year1.annualInterest), tone: 'positive', text: 'The interest component is deductible for rental property. Use the year-by-year table to source Schedule E mortgage interest deductions.' }],
        [{ title: 'Interest vs. principal split changes each year', text: 'Schedule E mortgage interest deductions decrease slightly each year as the interest component of the payment declines. Use the table row for the applicable year.' }, { title: 'Reconcile against the lender Form 1098', text: 'The lender issues Form 1098 reporting interest paid. Reconcile the schedule against Form 1098 before entering the deduction on Schedule E.' }, { title: 'Refinancing resets the schedule', text: 'When a loan is refinanced, create a new amortization schedule from the refinance date using the new principal, rate, and term.' }],
        [{ label: 'Loan amount', value: formatMoney(loanAmount) }, { label: 'Annual rate', value: formatPercent(annualRate, 2) }, { label: 'Term', value: termYears + ' years' }, { label: 'Monthly payment', value: formatMoney(monthlyPayment) }, { label: 'Total interest', value: formatMoney(totalInterest) }, { label: 'Total payments', value: formatMoney(totalPayments) }],
        { columns: [{ key: 'Year', label: 'Year' }, { key: 'Annual Payment', label: 'Annual Payment' }, { key: 'Interest Paid', label: 'Interest Paid' }, { key: 'Principal Paid', label: 'Principal Paid' }, { key: 'Ending Balance', label: 'Ending Balance' }], rows: tableRows },
        exportRows, 'Monthly payment: ' + formatMoney(monthlyPayment) + '. Total interest over ' + termYears + ' years: ' + formatMoney(totalInterest) + '.'
      );
    },

    'gross-rent-multiplier-calculator': function (values) {
      var propertyPrice = values.propertyPrice; if (!(propertyPrice > 0)) throw new Error('Enter the property price.');
      var annualGrossRentOverride = values.annualGrossRent || 0;
      var monthlyRent = values.monthlyRent || 0;
      var annualGrossRent = annualGrossRentOverride > 0 ? annualGrossRentOverride : monthlyRent * 12;
      if (!(annualGrossRent > 0)) throw new Error('Enter monthly rent or annual gross rent.');
      var marketGRM = values.marketGRM || 0;
      var grm = propertyPrice / annualGrossRent;
      var impliedValueAtMarket = marketGRM > 0 ? marketGRM * annualGrossRent : null;
      var valuationGap = impliedValueAtMarket != null ? propertyPrice - impliedValueAtMarket : null;
      var grm80 = grm * 0.8;
      var grm90 = grm * 0.9;
      var grm110 = grm * 1.1;
      var grm120 = grm * 1.2;
      var exportRows = [
        { Metric: 'Property price', Value: Math.round(propertyPrice) },
        { Metric: 'Annual gross rent', Value: Math.round(annualGrossRent) },
        { Metric: 'Gross rent multiplier (GRM)', Value: grm.toFixed(2) },
        { Metric: 'Market GRM (entered)', Value: marketGRM > 0 ? marketGRM.toFixed(2) : 'Not entered' },
        { Metric: 'Implied value at market GRM', Value: impliedValueAtMarket != null ? Math.round(impliedValueAtMarket) : 'N/A' },
        { Metric: 'Valuation gap vs. market', Value: valuationGap != null ? Math.round(valuationGap) : 'N/A' },
        { Metric: 'Implied value at GRM × 0.8', Value: Math.round(grm80 * annualGrossRent) },
        { Metric: 'Implied value at GRM × 1.2', Value: Math.round(grm120 * annualGrossRent) }
      ];
      return buildResult(
        [{ label: 'Gross rent multiplier', value: grm.toFixed(2) + 'x', tone: grm < 8 ? 'positive' : grm < 14 ? 'neutral' : 'warning', help: 'Property price divided by annual gross rent.' }, { label: 'Annual gross rent', value: formatMoney(annualGrossRent), tone: 'neutral', help: 'Total annual gross rent at full occupancy.' }, { label: 'Implied value at market GRM', value: impliedValueAtMarket != null ? formatMoney(impliedValueAtMarket) : 'Not entered', tone: valuationGap != null && valuationGap > 0 ? 'warning' : 'positive', help: marketGRM > 0 ? 'Property value implied by market GRM × annual gross rent.' : 'Enter a market GRM to see implied value.' }, { label: 'Valuation gap', value: valuationGap != null ? formatMoney(Math.abs(valuationGap)) + (valuationGap > 0 ? ' above market' : ' below market') : 'N/A', tone: valuationGap != null && valuationGap > 0 ? 'warning' : 'positive', help: 'Difference between asking price and market-GRM implied value.' }],
        [{ title: 'GRM context', value: grm.toFixed(2) + 'x', tone: grm < 8 ? 'positive' : grm < 14 ? 'neutral' : 'warning', text: grm < 8 ? 'Low GRM — strong rental income relative to price. Verify expense ratios before concluding the deal is attractive.' : grm < 14 ? 'Mid-range GRM — in line with many residential markets. Compare to local comps for context.' : 'High GRM — relatively low rent income for the price. Normal in high-demand markets; requires appreciation thesis if expense ratios are typical.' }, { title: 'Implied value at -20% GRM', value: formatMoney(grm80 * annualGrossRent), tone: 'neutral', text: 'What the property would be worth if the market valued it at 20% below the current implied multiple.' }, { title: 'Implied value at +20% GRM', value: formatMoney(grm120 * annualGrossRent), tone: 'neutral', text: 'What the property would be worth if the market valued it at 20% above the current implied multiple.' }],
        [{ title: 'GRM is a screening metric, not a decision metric', text: 'Two properties with the same GRM can have very different cap rates if expenses differ. GRM does not capture operating costs.' }, { title: 'Use market GRM from comparable sales', text: 'Ask a broker for recently sold comparable properties and calculate their GRMs. This turns the metric from an abstract ratio into a defensible valuation anchor.' }, { title: 'Below-market rent distorts GRM', text: 'If a value-add property has below-market rents, calculate GRM on both in-place and market rent to see both the current multiple and the potential multiple.' }],
        [{ label: 'Property price', value: formatMoney(propertyPrice) }, { label: 'Annual gross rent', value: formatMoney(annualGrossRent) }, { label: 'GRM', value: grm.toFixed(2) + 'x' }, { label: 'Market GRM', value: marketGRM > 0 ? marketGRM.toFixed(2) + 'x' : 'N/A' }, { label: 'Implied value at market GRM', value: impliedValueAtMarket != null ? formatMoney(impliedValueAtMarket) : 'N/A' }],
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, 'GRM: ' + grm.toFixed(2) + 'x. ' + (impliedValueAtMarket != null ? 'Implied value at market GRM: ' + formatMoney(impliedValueAtMarket) + '.' : '')
      );
    },

    'internal-control-weakness-risk-scorer': function (values) {
      var likelihood = parseInt(values.likelihood || 3), impact = parseInt(values.impact || 3), detection = parseInt(values.detection || 3);
      var controlArea = values.controlArea || 'revenue';
      var areaLabels = { revenue: 'Revenue', expenditure: 'Expenditure', payroll: 'Payroll', financial_reporting: 'Financial Reporting', it: 'IT General Controls', inventory: 'Inventory' };
      var areaLabel = areaLabels[controlArea] || controlArea;
      var compositeScore = likelihood * impact * detection;
      var maxScore = 125;
      var riskPct = (compositeScore / maxScore) * 100;
      var tone = compositeScore >= 60 ? 'warning' : compositeScore >= 27 ? 'neutral' : 'positive';
      var riskLabel = compositeScore >= 60 ? 'High Risk' : compositeScore >= 27 ? 'Moderate Risk' : 'Low Risk';
      var likelihoodLabels = { 1: 'Very Low', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Very High' };
      var impactLabels = { 1: 'Negligible', 2: 'Minor', 3: 'Moderate', 4: 'Significant', 5: 'Severe' };
      var detectionLabels = { 1: 'Highly Detectable', 2: 'Likely Detected', 3: 'Moderate Detection', 4: 'Difficult to Detect', 5: 'Very Difficult to Detect' };
      var exportRows = [
        { Metric: 'Control area', Value: areaLabel },
        { Metric: 'Likelihood score', Value: likelihood + ' — ' + (likelihoodLabels[likelihood] || '') },
        { Metric: 'Impact score', Value: impact + ' — ' + (impactLabels[impact] || '') },
        { Metric: 'Detection score', Value: detection + ' — ' + (detectionLabels[detection] || '') },
        { Metric: 'Composite risk score', Value: compositeScore + ' / ' + maxScore },
        { Metric: 'Risk level', Value: riskLabel }
      ];
      return buildResult(
        [{ label: 'Composite risk score', value: compositeScore + ' / ' + maxScore, tone: tone, help: 'Likelihood × Impact × Detection. Range 1–125.' }, { label: 'Risk level', value: riskLabel, tone: tone, help: 'Low: <27, Moderate: 27–59, High: ≥60.' }, { label: 'Control area', value: areaLabel, tone: 'neutral', help: 'The financial process or control area being scored.' }, { label: 'Risk exposure %', value: riskPct.toFixed(1) + '%', tone: tone, help: 'Composite score as a percentage of maximum possible score (125).' }],
        [{ title: 'Likelihood: ' + likelihood + '/5', value: likelihoodLabels[likelihood] || '', tone: likelihood >= 4 ? 'warning' : 'neutral', text: 'The probability that the control weakness results in an actual error or fraud event.' }, { title: 'Impact: ' + impact + '/5', value: impactLabels[impact] || '', tone: impact >= 4 ? 'warning' : 'neutral', text: 'The magnitude of financial statement impact if the weakness leads to an error or fraud.' }, { title: 'Detection: ' + detection + '/5', value: detectionLabels[detection] || '', tone: detection >= 4 ? 'warning' : 'neutral', text: 'How difficult it is to detect the error or fraud before it affects the financial statements.' }],
        [{ title: 'Remediation priority', text: compositeScore >= 60 ? 'High-risk score requires immediate management attention and remediation plan. Evaluate whether the weakness may constitute a significant deficiency or material weakness.' : compositeScore >= 27 ? 'Moderate-risk score warrants a remediation plan within the current period. Assign an owner and target remediation date.' : 'Low-risk score. Monitor for deterioration and include in next annual control assessment cycle.' }, { title: 'Detection is the most controllable dimension', text: 'Increasing the frequency and rigor of detective controls (reconciliations, management review, exception reports) can reduce the detection score even when likelihood and impact cannot be reduced.' }, { title: 'Aggregation analysis', text: 'Multiple moderate-risk weaknesses in the same process can aggregate to a significant deficiency or material weakness. Evaluate weaknesses in the same control area together.' }],
        exportRows,
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, riskLabel + ': ' + compositeScore + '/125 composite score. Control area: ' + areaLabel + '.'
      );
    },

    'sox-404-control-testing-tracker': function (values) {
      var totalControls = Math.max(1, Math.round(values.totalKeyControls || 1));
      var tested = Math.min(totalControls, Math.round(values.controlsTested || 0));
      var passed = Math.min(tested, Math.round(values.controlsPassed || 0));
      var deficiencies = Math.max(0, Math.round(values.controlDeficiencies || 0));
      var sigDef = Math.max(0, Math.round(values.significantDeficiencies || 0));
      var matWeakness = Math.max(0, Math.round(values.materialWeaknesses || 0));
      var remediated = Math.max(0, Math.round(values.remediatedFindings || 0));
      var coverageRate = (tested / totalControls) * 100;
      var passRate = tested > 0 ? (passed / tested) * 100 : 0;
      var deficiencyRate = tested > 0 ? ((tested - passed) / tested) * 100 : 0;
      var untested = totalControls - tested;
      var totalFindings = deficiencies + sigDef + matWeakness;
      var openFindings = Math.max(0, totalFindings - remediated);
      var healthScore = Math.round(
        (coverageRate * 0.35) +
        (passRate * 0.35) +
        (matWeakness === 0 ? 20 : 0) +
        (sigDef === 0 ? 10 : sigDef <= 2 ? 5 : 0)
      );
      var healthTone = healthScore >= 80 ? 'positive' : healthScore >= 60 ? 'neutral' : 'warning';
      var exportRows = [
        { Metric: 'Total key controls in scope', Value: totalControls },
        { Metric: 'Controls tested', Value: tested + ' (' + coverageRate.toFixed(1) + '%)' },
        { Metric: 'Controls passed', Value: passed + ' (' + passRate.toFixed(1) + '% of tested)' },
        { Metric: 'Untested controls', Value: untested },
        { Metric: 'Control deficiencies', Value: deficiencies },
        { Metric: 'Significant deficiencies', Value: sigDef },
        { Metric: 'Material weaknesses', Value: matWeakness },
        { Metric: 'Remediated findings', Value: remediated },
        { Metric: 'Open findings', Value: openFindings },
        { Metric: 'Program health score', Value: healthScore + '/100' }
      ];
      return buildResult(
        [{ label: 'Testing coverage', value: coverageRate.toFixed(1) + '%', tone: coverageRate >= 90 ? 'positive' : coverageRate >= 70 ? 'neutral' : 'warning', help: 'Controls tested as a percentage of total key controls in scope.' }, { label: 'Pass rate', value: passRate.toFixed(1) + '%', tone: passRate >= 90 ? 'positive' : passRate >= 75 ? 'neutral' : 'warning', help: 'Controls that passed testing with no deficiencies.' }, { label: 'Material weaknesses', value: matWeakness.toString(), tone: matWeakness === 0 ? 'positive' : 'warning', help: 'Number of material weaknesses identified. Zero is required for a clean management assessment.' }, { label: 'Program health score', value: healthScore + '/100', tone: healthTone, help: 'Composite score based on coverage, pass rate, and deficiency severity.' }],
        [{ title: 'Untested controls', value: untested.toString(), tone: untested === 0 ? 'positive' : untested <= 10 ? 'neutral' : 'warning', text: untested === 0 ? 'All key controls have been tested.' : untested + ' controls remain untested. Prioritize based on risk and remaining time before the assessment deadline.' }, { title: 'Open findings', value: openFindings.toString(), tone: openFindings === 0 ? 'positive' : 'warning', text: openFindings === 0 ? 'All identified findings have been remediated.' : openFindings + ' findings are open and require remediation before the management assessment date.' }, { title: 'Material weaknesses', value: matWeakness.toString(), tone: matWeakness === 0 ? 'positive' : 'warning', text: matWeakness === 0 ? 'No material weaknesses identified.' : matWeakness + ' material weakness(es) identified. These must be disclosed in the annual report. Engage external auditors and counsel immediately.' }],
        [{ title: 'Coverage target: 100% before assessment', text: 'All key controls must be tested before the management assessment date. Build a testing schedule that completes by at least 2 weeks before year-end to allow time for deficiency evaluation and potential remediation.' }, { title: 'Deficiency aggregation', text: 'Multiple control deficiencies in the same process can aggregate to a significant deficiency or material weakness. Evaluate all deficiencies in each process together before finalizing severity classifications.' }, { title: 'Compensating controls and re-testing', text: 'Remediated deficiencies must be re-tested after remediation is complete. Document the re-test in the workpaper and confirm the control is operating effectively before closing the finding.' }],
        exportRows,
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, 'Coverage: ' + coverageRate.toFixed(1) + '%. Pass rate: ' + passRate.toFixed(1) + '%. Material weaknesses: ' + matWeakness + '. Health score: ' + healthScore + '/100.'
      );
    },

    'benfords-law-digit-analyzer': function (values) {
      var counts = [
        Math.max(0, Math.round(values.digit1 || 0)),
        Math.max(0, Math.round(values.digit2 || 0)),
        Math.max(0, Math.round(values.digit3 || 0)),
        Math.max(0, Math.round(values.digit4 || 0)),
        Math.max(0, Math.round(values.digit5 || 0)),
        Math.max(0, Math.round(values.digit6 || 0)),
        Math.max(0, Math.round(values.digit7 || 0)),
        Math.max(0, Math.round(values.digit8 || 0)),
        Math.max(0, Math.round(values.digit9 || 0))
      ];
      var total = counts.reduce(function (a, b) { return a + b; }, 0);
      if (total === 0) total = 1;
      var benfordExpected = [30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];
      var actualPcts = counts.map(function (c) { return (c / total) * 100; });
      var deviations = actualPcts.map(function (a, i) { return a - benfordExpected[i]; });
      var maxDeviation = Math.max.apply(null, deviations.map(function (d) { return Math.abs(d); }));
      var flaggedDigits = deviations.map(function (d, i) { return Math.abs(d) >= 5 ? (i + 1) : null; }).filter(function (d) { return d !== null; });
      var mseSum = deviations.reduce(function (a, d) { return a + d * d; }, 0);
      var conformityScore = Math.max(0, Math.round(100 - (mseSum / 9)));
      var overallTone = flaggedDigits.length === 0 ? 'positive' : flaggedDigits.length <= 2 ? 'neutral' : 'warning';
      var exportRows = [{ Metric: 'Total transactions analyzed', Value: total }];
      for (var i = 0; i < 9; i++) {
        exportRows.push({
          Metric: 'Digit ' + (i + 1),
          Value: 'Actual: ' + actualPcts[i].toFixed(1) + '% | Expected: ' + benfordExpected[i].toFixed(1) + '% | Deviation: ' + (deviations[i] >= 0 ? '+' : '') + deviations[i].toFixed(1) + '%' + (Math.abs(deviations[i]) >= 5 ? ' ⚑ FLAG' : '')
        });
      }
      exportRows.push({ Metric: 'Conformity score', Value: conformityScore + '/100' });
      exportRows.push({ Metric: 'Flagged digits', Value: flaggedDigits.length > 0 ? flaggedDigits.join(', ') : 'None' });
      return buildResult(
        [{ label: 'Total transactions', value: total.toLocaleString(), tone: 'neutral', help: 'Total transactions analyzed across all nine leading digits.' }, { label: 'Conformity score', value: conformityScore + '/100', tone: conformityScore >= 80 ? 'positive' : conformityScore >= 60 ? 'neutral' : 'warning', help: 'How closely the distribution follows Benford\'s Law. Lower = more deviation.' }, { label: 'Flagged digits', value: flaggedDigits.length > 0 ? 'Digits: ' + flaggedDigits.join(', ') : 'None', tone: flaggedDigits.length === 0 ? 'positive' : 'warning', help: 'Digits with actual frequency deviating more than 5 percentage points from Benford\'s expected frequency.' }, { label: 'Max deviation', value: maxDeviation.toFixed(1) + ' pp', tone: maxDeviation < 5 ? 'positive' : maxDeviation < 10 ? 'neutral' : 'warning', help: 'Largest single-digit deviation from Benford\'s expected frequency (percentage points).' }],
        deviations.map(function (dev, i) {
          var flag = Math.abs(dev) >= 5;
          return { title: 'Digit ' + (i + 1), value: 'Act: ' + actualPcts[i].toFixed(1) + '% / Exp: ' + benfordExpected[i].toFixed(1) + '%', tone: flag ? 'warning' : 'positive', text: (flag ? '⚑ Deviation of ' + (dev >= 0 ? '+' : '') + dev.toFixed(1) + ' pp — above threshold for follow-up. ' : 'Within normal range. ') + 'Expected: ' + benfordExpected[i].toFixed(1) + '%.' };
        }),
        [{ title: flaggedDigits.length > 0 ? 'Investigation recommended for flagged digits' : 'Distribution within expected range', text: flaggedDigits.length > 0 ? 'Digits ' + flaggedDigits.join(', ') + ' show deviations above the 5 pp flag threshold. Extract transactions starting with these digits and apply additional analytical or substantive testing procedures.' : 'No digits exceed the 5 pp deviation threshold. The distribution is broadly consistent with Benford\'s Law for naturally occurring financial data.' }, { title: 'Conformity score interpretation', text: conformityScore >= 80 ? 'High conformity (≥80) — the dataset distribution closely matches Benford\'s expected pattern. This is consistent with naturally generated financial data.' : conformityScore >= 60 ? 'Moderate conformity (60-79) — some deviations present. Investigate flagged digits but evaluate in context of dataset characteristics.' : 'Low conformity (<60) — significant deviations from Benford\'s pattern. This warrants investigation and may require expanded audit procedures.' }, { title: 'Context before concluding', text: 'Benford deviations are an analytical flag, not proof of fraud. Many legitimate explanations exist: industry pricing patterns, constrained data ranges, or a dataset that does not naturally conform to Benford\'s Law.' }],
        exportRows,
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, 'Conformity score: ' + conformityScore + '/100. Flagged digits: ' + (flaggedDigits.length > 0 ? flaggedDigits.join(', ') : 'None') + '. Total transactions: ' + total + '.'
      );
    },

    'monetary-unit-sampling-calculator': function (values) {
      var population = Math.max(1, values.populationValue || 1);
      var tolerable = Math.max(1, values.tolerableMisstatement || 1);
      var confidenceLevel = parseInt(values.confidenceLevel || 95);
      var expectedErrorRate = Math.max(0, values.expectedErrorRate || 0);
      var reliabilityFactors = { 95: 3.00, 90: 2.31, 80: 1.61 };
      var reliabilityFactor = reliabilityFactors[confidenceLevel] || 3.00;
      var expectedErrorAmt = population * (expectedErrorRate / 100);
      var basicSampleSize = Math.ceil((population * reliabilityFactor) / tolerable);
      var expansionFactor = expectedErrorRate > 0 ? 1 + (expectedErrorAmt / tolerable) : 1;
      var adjustedSampleSize = Math.ceil(basicSampleSize * expansionFactor);
      var samplingInterval = Math.floor(population / adjustedSampleSize);
      var basicPrecision = (population * reliabilityFactor) / adjustedSampleSize;
      var precisionRatio = basicPrecision / tolerable;
      var sampleTone = adjustedSampleSize <= 100 ? 'positive' : adjustedSampleSize <= 200 ? 'neutral' : 'warning';
      var expectedVsTolerable = expectedErrorAmt / tolerable;
      var exportRows = [
        { Metric: 'Population book value', Value: formatMoney(population) },
        { Metric: 'Tolerable misstatement', Value: formatMoney(tolerable) },
        { Metric: 'Confidence level', Value: confidenceLevel + '%' },
        { Metric: 'Reliability factor', Value: reliabilityFactor.toFixed(2) },
        { Metric: 'Expected error rate', Value: expectedErrorRate.toFixed(1) + '%' },
        { Metric: 'Expected error amount', Value: formatMoney(expectedErrorAmt) },
        { Metric: 'Basic sample size', Value: basicSampleSize.toString() },
        { Metric: 'Adjusted sample size', Value: adjustedSampleSize.toString() },
        { Metric: 'Sampling interval', Value: formatMoney(samplingInterval) },
        { Metric: 'Basic precision (zero errors)', Value: formatMoney(basicPrecision) }
      ];
      return buildResult(
        [{ label: 'Sample size', value: adjustedSampleSize.toString(), tone: sampleTone, help: 'Number of items to select using the sampling interval.' }, { label: 'Sampling interval', value: formatMoney(samplingInterval), tone: 'neutral', help: 'Select every nth dollar unit. Items larger than this amount are always selected.' }, { label: 'Basic precision (0 errors)', value: formatMoney(basicPrecision), tone: basicPrecision < tolerable ? 'positive' : 'warning', help: 'Upper error limit if no errors are found during testing. Must be less than tolerable misstatement.' }, { label: 'Expected vs. tolerable', value: (expectedVsTolerable * 100).toFixed(1) + '%', tone: expectedVsTolerable < 0.5 ? 'positive' : expectedVsTolerable < 0.75 ? 'neutral' : 'warning', help: 'Expected error as a percentage of tolerable misstatement. Should not exceed 50%.' }],
        [{ title: 'Confidence level: ' + confidenceLevel + '%', value: 'Factor: ' + reliabilityFactor.toFixed(2), tone: 'neutral', text: 'The Poisson reliability factor for ' + confidenceLevel + '% confidence with 0 expected errors is ' + reliabilityFactor.toFixed(2) + '. Higher confidence = larger reliability factor = larger sample.' }, { title: 'Population coverage', value: formatMoney(population), tone: 'neutral', text: 'Population: ' + formatMoney(population) + '. Items larger than the ' + formatMoney(samplingInterval) + ' sampling interval are automatically selected in every draw.' }, { title: 'Precision buffer', value: formatMoney(tolerable - basicPrecision), tone: (tolerable - basicPrecision) > 0 ? 'positive' : 'warning', text: basicPrecision < tolerable ? 'Basic precision (' + formatMoney(basicPrecision) + ') is within tolerable misstatement (' + formatMoney(tolerable) + '). The sample design has a precision buffer of ' + formatMoney(tolerable - basicPrecision) + '.' : 'Basic precision exceeds tolerable misstatement. Increase sample size or reduce expected error rate.' }],
        [{ title: 'Sample size formula', text: 'n = (Population × Reliability Factor) ÷ Tolerable Misstatement × Expansion Factor. Basic n = ' + basicSampleSize + '. Adjusted for expected errors: ' + adjustedSampleSize + '.' }, { title: 'After testing: upper error limit', text: 'If no errors are found, the UEL equals basic precision: ' + formatMoney(basicPrecision) + '. If errors are found, add incremental allowances for each tainting factor. Compare UEL to tolerable misstatement (' + formatMoney(tolerable) + ') to reach the audit conclusion.' }, { title: 'Large items', text: 'Any item with a book value exceeding the sampling interval (' + formatMoney(samplingInterval) + ') is automatically selected in full. These should be identified and listed before beginning systematic selection.' }],
        exportRows,
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, 'Sample size: ' + adjustedSampleSize + '. Sampling interval: ' + formatMoney(samplingInterval) + '. Basic precision: ' + formatMoney(basicPrecision) + '.'
      );
    },

    'audit-materiality-calculator': function (values) {
      var preTaxIncome = values.preTaxIncome || 0, totalRevenue = values.totalRevenue || 0, totalAssets = values.totalAssets || 0, totalEquity = values.totalEquity || 0;
      var benchmark = values.primaryBenchmark || 'pretax';
      var materialityPct = Math.max(0.1, values.materialityPct || 7);
      var performancePct = Math.max(1, Math.min(99, values.performancePct || 65));
      var trivialPct = Math.max(1, Math.min(20, values.trivialPct || 5));
      var benchmarkValues = { pretax: preTaxIncome, revenue: totalRevenue, assets: totalAssets, equity: totalEquity };
      var benchmarkLabels = { pretax: 'Pre-tax income', revenue: 'Total revenues', assets: 'Total assets', equity: 'Total equity' };
      var benchmarkValue = benchmarkValues[benchmark] || 0;
      var overallMateriality = Math.abs(benchmarkValue) * (materialityPct / 100);
      var performanceMateriality = overallMateriality * (performancePct / 100);
      var clearlyTrivial = overallMateriality * (trivialPct / 100);
      var altRevenueMateriality = totalRevenue > 0 ? totalRevenue * 0.005 : null;
      var altAssetsMateriality = totalAssets > 0 ? totalAssets * 0.01 : null;
      var altEquityMateriality = totalEquity > 0 ? totalEquity * 0.01 : null;
      var exportRows = [
        { Metric: 'Primary benchmark', Value: benchmarkLabels[benchmark] || benchmark },
        { Metric: 'Benchmark value', Value: formatMoney(Math.abs(benchmarkValue)) },
        { Metric: 'Materiality percentage', Value: materialityPct + '%' },
        { Metric: 'Overall materiality', Value: formatMoney(overallMateriality) },
        { Metric: 'Performance materiality', Value: formatMoney(performanceMateriality) + ' (' + performancePct + '% of overall)' },
        { Metric: 'Clearly trivial threshold', Value: formatMoney(clearlyTrivial) + ' (' + trivialPct + '% of overall)' }
      ];
      if (altRevenueMateriality) exportRows.push({ Metric: 'Alt: Revenue-based (0.5%)', Value: formatMoney(altRevenueMateriality) });
      if (altAssetsMateriality) exportRows.push({ Metric: 'Alt: Asset-based (1%)', Value: formatMoney(altAssetsMateriality) });
      return buildResult(
        [{ label: 'Overall materiality', value: formatMoney(overallMateriality), tone: 'neutral', help: 'Overall materiality = ' + materialityPct + '% × ' + benchmarkLabels[benchmark] + ' (' + formatMoney(Math.abs(benchmarkValue)) + ').' }, { label: 'Performance materiality', value: formatMoney(performanceMateriality), tone: 'neutral', help: 'Performance materiality = ' + performancePct + '% × overall materiality. Used for sample sizes and testing scope.' }, { label: 'Clearly trivial threshold', value: formatMoney(clearlyTrivial), tone: 'neutral', help: 'Clearly trivial = ' + trivialPct + '% × overall materiality. Misstatements below this are not accumulated.' }, { label: 'Benchmark', value: benchmarkLabels[benchmark] + ' at ' + materialityPct + '%', tone: 'neutral', help: 'Benchmark selected and percentage applied to calculate overall materiality.' }],
        [{ title: 'Overall materiality', value: formatMoney(overallMateriality), tone: 'neutral', text: 'If aggregate uncorrected misstatements exceed ' + formatMoney(overallMateriality) + ', the auditor must modify the opinion or require correction before issuing an unmodified report.' }, { title: 'Performance materiality', value: formatMoney(performanceMateriality), tone: 'neutral', text: 'Testing scope, sample sizes, and individual item testing thresholds are set based on performance materiality (' + formatMoney(performanceMateriality) + '), not overall materiality.' }, { title: 'Clearly trivial threshold', value: formatMoney(clearlyTrivial), tone: 'neutral', text: 'Misstatements below ' + formatMoney(clearlyTrivial) + ' are not accumulated or evaluated. Items at or above this amount are tracked in the summary of uncorrected misstatements.' }],
        [{ title: 'Benchmark alternatives', text: (altRevenueMateriality ? 'Revenue-based (0.5%): ' + formatMoney(altRevenueMateriality) + '. ' : '') + (altAssetsMateriality ? 'Asset-based (1%): ' + formatMoney(altAssetsMateriality) + '. ' : '') + (altEquityMateriality ? 'Equity-based (1%): ' + formatMoney(altEquityMateriality) + '. ' : '') + 'Compare alternatives and use the most conservative or most appropriate for the entity\'s primary users.' }, { title: 'Performance materiality factor justification', text: performancePct <= 60 ? 'A ' + performancePct + '% factor reflects conservative testing — appropriate for higher-risk engagements or where aggregate misstatements from multiple areas are a concern.' : performancePct >= 70 ? 'A ' + performancePct + '% factor reflects less conservative testing — appropriate for lower-risk, well-controlled entities with a strong history of clean audits.' : 'A ' + performancePct + '% factor is within the typical 60-65% range used for standard-risk engagements.' }, { title: 'Document the rationale', text: 'The audit file must document: (1) why this benchmark was selected, (2) why this percentage was chosen, (3) whether any prior-year adjustments or qualitative factors informed the selection, and (4) engagement partner approval of final materiality amounts.' }],
        exportRows,
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, 'Overall materiality: ' + formatMoney(overallMateriality) + '. Performance materiality: ' + formatMoney(performanceMateriality) + '. Clearly trivial: ' + formatMoney(clearlyTrivial) + '.'
      );
    },

    'segregation-of-duties-risk-matrix': function (values) {
      var critical = Math.max(0, Math.round(values.criticalConflicts || 0));
      var high = Math.max(0, Math.round(values.highConflicts || 0));
      var medium = Math.max(0, Math.round(values.mediumConflicts || 0));
      var low = Math.max(0, Math.round(values.lowConflicts || 0));
      var mitigated = Math.max(0, Math.round(values.mitigatedConflicts || 0));
      var totalRoles = Math.max(1, Math.round(values.totalRolesReviewed || 1));
      var totalUnmitigated = critical + high + medium + low;
      var totalConflicts = totalUnmitigated + mitigated;
      var weightedScore = (critical * 20) + (high * 10) + (medium * 5) + (low * 2) + (mitigated * 3);
      var maxScore = 300;
      var riskPct = Math.min(100, (weightedScore / maxScore) * 100);
      var riskLevel = riskPct >= 60 ? 'High' : riskPct >= 30 ? 'Moderate' : 'Low';
      var riskTone = riskPct >= 60 ? 'warning' : riskPct >= 30 ? 'neutral' : 'positive';
      var conflictRatePerRole = totalRoles > 0 ? (totalConflicts / totalRoles).toFixed(2) : '0.00';
      var mitigationCoverage = totalConflicts > 0 ? (mitigated / totalConflicts * 100).toFixed(1) : '0.0';
      var exportRows = [
        { Metric: 'Total roles reviewed', Value: totalRoles },
        { Metric: 'Critical conflicts (unmitigated)', Value: critical },
        { Metric: 'High conflicts (unmitigated)', Value: high },
        { Metric: 'Medium conflicts (unmitigated)', Value: medium },
        { Metric: 'Low conflicts (unmitigated)', Value: low },
        { Metric: 'Conflicts with compensating controls', Value: mitigated },
        { Metric: 'Total conflicts identified', Value: totalConflicts },
        { Metric: 'Conflicts per role', Value: conflictRatePerRole },
        { Metric: 'Mitigation coverage', Value: mitigationCoverage + '%' },
        { Metric: 'Weighted risk score', Value: weightedScore + ' / ' + maxScore },
        { Metric: 'SOD risk level', Value: riskLevel }
      ];
      return buildResult(
        [{ label: 'SOD risk level', value: riskLevel, tone: riskTone, help: 'Overall SOD risk based on conflict count, severity weighting, and mitigation coverage.' }, { label: 'Total conflicts', value: totalConflicts.toString(), tone: critical > 0 ? 'warning' : totalConflicts > 0 ? 'neutral' : 'positive', help: 'Total SOD conflicts identified across all severity levels.' }, { label: 'Critical/High unmitigated', value: (critical + high).toString(), tone: (critical + high) > 0 ? 'warning' : 'positive', help: 'Unmitigated critical and high-severity conflicts requiring immediate remediation.' }, { label: 'Mitigation coverage', value: mitigationCoverage + '%', tone: parseFloat(mitigationCoverage) >= 70 ? 'positive' : 'neutral', help: 'Percentage of total conflicts with tested compensating controls in place.' }],
        [{ title: 'Critical conflicts: ' + critical, value: critical > 0 ? 'Immediate action required' : 'None identified', tone: critical > 0 ? 'warning' : 'positive', text: critical > 0 ? critical + ' critical conflict(s) require immediate remediation. These represent the highest fraud risk — typically cash authorization and payment processing combinations.' : 'No critical conflicts identified.' }, { title: 'High conflicts: ' + high, value: high > 0 ? 'Remediation this period' : 'None identified', tone: high > 0 ? 'warning' : 'positive', text: high > 0 ? high + ' high-severity conflict(s) require a remediation plan within the current period.' : 'No high-severity conflicts identified.' }, { title: 'Compensating control coverage', value: mitigationCoverage + '%', tone: 'neutral', text: mitigated + ' conflict(s) have compensating controls. Coverage: ' + mitigationCoverage + '%. Ensure all compensating controls have been formally tested to receive credit.' }],
        [{ title: 'Remediation priority', text: critical > 0 ? 'Immediate action: address ' + critical + ' critical conflict(s) first. Reassign roles or implement supervisory controls before the next reconciliation cycle.' : high > 0 ? 'Near-term action: address ' + high + ' high-severity conflict(s) with a remediation plan and target date within the current period.' : 'No critical or high conflicts. Continue monitoring medium and low-severity items in the regular control assessment cycle.' }, { title: 'Compensating control testing', text: 'Compensating controls must be formally tested to count toward risk reduction. An untested compensating control should not reduce the severity classification of the underlying conflict.' }, { title: 'Aggregation analysis', text: 'The ' + totalConflicts + ' total conflicts affect ' + totalRoles + ' roles (' + conflictRatePerRole + ' conflicts per role). Evaluate whether conflicts in the same process area aggregate to a higher severity classification.' }],
        exportRows,
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, 'SOD risk: ' + riskLevel + '. Total conflicts: ' + totalConflicts + '. Critical/High unmitigated: ' + (critical + high) + '.'
      );
    },

    'chart-of-accounts-compliance-checker': function (values) {
      var total = Math.max(1, Math.round(values.totalAccounts || 1));
      var inactive = Math.max(0, Math.round(values.inactiveAccounts || 0));
      var duplicates = Math.max(0, Math.round(values.duplicateAccounts || 0));
      var classErrors = Math.max(0, Math.round(values.classificationErrors || 0));
      var missingRequired = Math.max(0, Math.round(values.missingRequiredAccounts || 0));
      var namingViolations = Math.max(0, Math.round(values.namingViolations || 0));
      var inactiveRatio = (inactive / total) * 100;
      var totalIssues = duplicates + classErrors + missingRequired;
      var deductions = (duplicates * 15) + (classErrors * 10) + (missingRequired * 12) + (namingViolations * 3) + (inactiveRatio >= 20 ? 10 : inactiveRatio >= 10 ? 5 : 0);
      var complianceScore = Math.max(0, Math.round(100 - deductions));
      var scoreTone = complianceScore >= 80 ? 'positive' : complianceScore >= 60 ? 'neutral' : 'warning';
      var exportRows = [
        { Metric: 'Total accounts', Value: total },
        { Metric: 'Inactive accounts', Value: inactive + ' (' + inactiveRatio.toFixed(1) + '%)' },
        { Metric: 'Duplicate account numbers', Value: duplicates },
        { Metric: 'Classification errors', Value: classErrors },
        { Metric: 'Missing required accounts', Value: missingRequired },
        { Metric: 'Naming convention violations', Value: namingViolations },
        { Metric: 'Total high-priority issues', Value: totalIssues },
        { Metric: 'COA compliance score', Value: complianceScore + '/100' }
      ];
      return buildResult(
        [{ label: 'Compliance score', value: complianceScore + '/100', tone: scoreTone, help: 'COA health score based on issue counts weighted by financial reporting impact.' }, { label: 'High-priority issues', value: totalIssues.toString(), tone: totalIssues === 0 ? 'positive' : totalIssues <= 5 ? 'neutral' : 'warning', help: 'Sum of duplicates, classification errors, and missing required accounts.' }, { label: 'Inactive account ratio', value: inactiveRatio.toFixed(1) + '%', tone: inactiveRatio < 10 ? 'positive' : inactiveRatio < 20 ? 'neutral' : 'warning', help: 'Inactive accounts as a percentage of total COA accounts. Above 15% indicates a governance issue.' }, { label: 'Total accounts', value: total.toString(), tone: 'neutral', help: 'Total accounts in the current chart of accounts.' }],
        [{ title: 'Duplicate accounts: ' + duplicates, value: duplicates === 0 ? 'None' : duplicates + ' found', tone: duplicates === 0 ? 'positive' : 'warning', text: duplicates === 0 ? 'No duplicate account numbers found.' : duplicates + ' duplicate account number(s) found. These must be merged immediately as they cause transaction miscoding and financial reporting errors.' }, { title: 'Classification errors: ' + classErrors, value: classErrors === 0 ? 'None' : classErrors + ' found', tone: classErrors === 0 ? 'positive' : 'warning', text: classErrors === 0 ? 'No classification errors found.' : classErrors + ' account(s) assigned to the wrong account type. Correct immediately — these distort financial statement line items.' }, { title: 'Missing required accounts: ' + missingRequired, value: missingRequired === 0 ? 'None' : missingRequired + ' missing', tone: missingRequired === 0 ? 'positive' : 'warning', text: missingRequired === 0 ? 'All required accounts are present.' : missingRequired + ' required account(s) missing. Missing intercompany, retained earnings, or deferred accounts cause consolidation errors and GAAP compliance gaps.' }],
        [{ title: 'Remediation order', text: 'Address issues in this order: (1) duplicate accounts — merge and recode transactions; (2) missing required accounts — create with proper type and number; (3) classification errors — reclassify and repost affected transactions; (4) naming violations — rename per convention; (5) inactive accounts — inactivate after confirming no pending entries.' }, { title: 'Governance improvement', text: 'Implement a COA change request process requiring controller approval. Log all new accounts, inactivations, and reclassifications with the date, requestor, and business reason.' }, { title: 'System-level controls', text: 'Configure the accounting system to require mandatory fields (description, account type) for new accounts and prevent deletion of accounts with historical transactions. Inactive accounts should be blocked from posting, not deleted.' }],
        exportRows,
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, 'COA compliance score: ' + complianceScore + '/100. High-priority issues: ' + totalIssues + '. Inactive ratio: ' + inactiveRatio.toFixed(1) + '%.'
      );
    },

    'expense-report-anomaly-detector': function (values) {
      var totalReports = Math.max(1, Math.round(values.totalReports || 1));
      var thresholdAvoidance = Math.max(0, Math.round(values.thresholdAvoidance || 0));
      var duplicates = Math.max(0, Math.round(values.duplicateClaims || 0));
      var roundNumbers = Math.max(0, Math.round(values.roundNumberClaims || 0));
      var offDay = Math.max(0, Math.round(values.offDaySubmissions || 0));
      var prohibited = Math.max(0, Math.round(values.prohibitedCategory || 0));
      var thresholdRate = (thresholdAvoidance / totalReports) * 100;
      var duplicateRate = (duplicates / totalReports) * 100;
      var roundRate = (roundNumbers / totalReports) * 100;
      var offDayRate = (offDay / totalReports) * 100;
      var prohibitedRate = (prohibited / totalReports) * 100;
      var weightedScore =
        (thresholdAvoidance * 25) +
        (duplicates * 30) +
        (roundNumbers * 5) +
        (offDay * 8) +
        (prohibited * 20);
      var maxPossible = totalReports * 30;
      var riskScore = Math.min(100, Math.round((weightedScore / maxPossible) * 100));
      var riskLevel = riskScore >= 60 ? 'High Risk' : riskScore >= 30 ? 'Moderate Risk' : 'Low Risk';
      var riskTone = riskScore >= 60 ? 'warning' : riskScore >= 30 ? 'neutral' : 'positive';
      var totalAnomalies = thresholdAvoidance + duplicates + roundNumbers + offDay + prohibited;
      var anomalyRate = (totalAnomalies / totalReports) * 100;
      var exportRows = [
        { Metric: 'Total reports reviewed', Value: totalReports },
        { Metric: 'Threshold avoidance instances', Value: thresholdAvoidance + ' (' + thresholdRate.toFixed(1) + '%)' },
        { Metric: 'Duplicate/near-duplicate claims', Value: duplicates + ' (' + duplicateRate.toFixed(1) + '%)' },
        { Metric: 'Round-number claims', Value: roundNumbers + ' (' + roundRate.toFixed(1) + '%)' },
        { Metric: 'Off-day submissions', Value: offDay + ' (' + offDayRate.toFixed(1) + '%)' },
        { Metric: 'Prohibited category claims', Value: prohibited + ' (' + prohibitedRate.toFixed(1) + '%)' },
        { Metric: 'Total anomaly instances', Value: totalAnomalies },
        { Metric: 'Overall anomaly rate', Value: anomalyRate.toFixed(1) + '%' },
        { Metric: 'Fraud risk score', Value: riskScore + '/100' },
        { Metric: 'Risk level', Value: riskLevel }
      ];
      return buildResult(
        [{ label: 'Fraud risk score', value: riskScore + '/100', tone: riskTone, help: 'Weighted risk score based on anomaly counts and fraud indicator severity.' }, { label: 'Risk level', value: riskLevel, tone: riskTone, help: 'Low: <30, Moderate: 30-59, High: ≥60.' }, { label: 'Highest-risk anomaly', value: duplicates > 0 ? 'Duplicate claims (' + duplicates + ')' : thresholdAvoidance > 0 ? 'Threshold avoidance (' + thresholdAvoidance + ')' : prohibited > 0 ? 'Prohibited categories (' + prohibited + ')' : 'None flagged', tone: (duplicates > 0 || thresholdAvoidance > 0 || prohibited > 0) ? 'warning' : 'positive', help: 'The highest-weight anomaly type present in the population.' }, { label: 'Overall anomaly rate', value: anomalyRate.toFixed(1) + '%', tone: anomalyRate < 10 ? 'positive' : anomalyRate < 25 ? 'neutral' : 'warning', help: 'Total anomaly instances as a percentage of total reports reviewed.' }],
        [{ title: 'Duplicate claims: ' + duplicates + ' (' + duplicateRate.toFixed(1) + '%)', value: duplicates > 0 ? 'Investigate' : 'None found', tone: duplicates > 0 ? 'warning' : 'positive', text: duplicates > 0 ? 'Duplicate claims carry the highest fraud weight (30 per instance). Extract all flagged items and compare original receipt dates and vendors across all reports from the same employee.' : 'No duplicate claims detected.' }, { title: 'Threshold avoidance: ' + thresholdAvoidance + ' (' + thresholdRate.toFixed(1) + '%)', value: thresholdAvoidance > 0 ? 'Investigate' : 'None found', tone: thresholdAvoidance > 0 ? 'warning' : 'positive', text: thresholdAvoidance > 0 ? 'Threshold avoidance is a deliberate control bypass. ' + thresholdAvoidance + ' instance(s) detected. Review all claims just below approval thresholds for each affected employee.' : 'No threshold avoidance pattern detected.' }, { title: 'Prohibited categories: ' + prohibited + ' (' + prohibitedRate.toFixed(1) + '%)', value: prohibited > 0 ? 'Policy violation' : 'None found', tone: prohibited > 0 ? 'warning' : 'positive', text: prohibited > 0 ? prohibited + ' claim(s) in prohibited expense categories. These are clear policy violations requiring manager follow-up and potential disciplinary action regardless of the dollar amount.' : 'No prohibited category claims detected.' }],
        [{ title: riskLevel + ': ' + riskScore + '/100', text: riskScore >= 60 ? 'High fraud risk score. Escalate to management and initiate detailed review of all flagged reports. Consider expanded testing of the submitting employee\'s full expense history.' : riskScore >= 30 ? 'Moderate fraud risk score. Conduct targeted review of duplicate and threshold avoidance instances. Document findings and communicate to manager.' : 'Low fraud risk score. Continue routine monitoring. Re-run analysis on a quarterly basis to detect emerging patterns.' }, { title: 'Per-employee analysis recommended', text: 'Run these anomaly tests at the employee level for the highest-risk anomaly types. An employee with 80% round-number claims or consistent threshold avoidance is far more suspicious than population-level statistics suggest.' }, { title: 'Investigation documentation', text: 'Document all anomaly tests, counts, risk scores, and follow-up actions in the audit workpaper before beginning any employee-facing investigation activities.' }],
        exportRows,
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, 'Fraud risk: ' + riskLevel + ' (' + riskScore + '/100). Total anomalies: ' + totalAnomalies + ' (' + anomalyRate.toFixed(1) + '% of reports).'
      );
    },

    'management-rep-letter-checklist': function (values) {
      var required = Math.max(0, Math.round(values.requiredRepresentations || 0));
      var totalRequired = Math.max(1, Math.round(values.totalRequiredCategories || 8));
      var additional = Math.max(0, Math.round(values.additionalRepresentations || 0));
      var goingConcern = values.goingConcernIncluded || 'na';
      var fraud = values.fraudRepresentationIncluded || 'yes';
      var subsequent = values.subsequentEventsIncluded || 'yes';
      var completionRate = (required / totalRequired) * 100;
      var missing = totalRequired - required;
      var criticalMissing = (fraud === 'no' ? 1 : 0) + (subsequent === 'no' ? 1 : 0) + (goingConcern === 'no' ? 1 : 0);
      var overallScore = Math.round(
        (completionRate * 0.7) +
        (fraud === 'yes' ? 10 : 0) +
        (subsequent === 'yes' ? 10 : 0) +
        (additional >= 3 ? 10 : additional >= 1 ? 5 : 0)
      );
      var scoreTone = overallScore >= 85 ? 'positive' : overallScore >= 65 ? 'neutral' : 'warning';
      var canIssueReport = missing === 0 && criticalMissing === 0;
      var exportRows = [
        { Metric: 'Required representations present', Value: required + ' of ' + totalRequired },
        { Metric: 'Completion rate', Value: completionRate.toFixed(1) + '%' },
        { Metric: 'Missing required representations', Value: missing.toString() },
        { Metric: 'Fraud representation', Value: fraud === 'yes' ? 'Present' : 'Missing' },
        { Metric: 'Subsequent events representation', Value: subsequent === 'yes' ? 'Present' : 'Missing' },
        { Metric: 'Going concern representation', Value: goingConcern === 'na' ? 'Not applicable' : goingConcern === 'yes' ? 'Present' : 'Required but missing' },
        { Metric: 'Additional representations', Value: additional.toString() },
        { Metric: 'Completeness score', Value: overallScore + '/100' },
        { Metric: 'Ready to issue report', Value: canIssueReport ? 'Yes' : 'No — resolve missing items first' }
      ];
      return buildResult(
        [{ label: 'Completeness score', value: overallScore + '/100', tone: scoreTone, help: 'Completeness score based on required representations present and critical item status.' }, { label: 'Required completions', value: required + ' / ' + totalRequired, tone: missing === 0 ? 'positive' : 'warning', help: 'Required representations present versus total required under AU-C 580.' }, { label: 'Missing representations', value: missing.toString(), tone: missing === 0 ? 'positive' : 'warning', help: 'Required representations not yet present in the letter.' }, { label: 'Ready to issue report', value: canIssueReport ? 'Yes' : 'No', tone: canIssueReport ? 'positive' : 'warning', help: 'The audit report cannot be issued until all required representations are obtained.' }],
        [{ title: 'Required completions: ' + required + '/' + totalRequired, value: completionRate.toFixed(1) + '%', tone: missing === 0 ? 'positive' : 'warning', text: missing === 0 ? 'All ' + totalRequired + ' required representation categories are present.' : missing + ' required representation(s) are missing. Revise the letter draft before sending to management for signature.' }, { title: 'Fraud representation', value: fraud === 'yes' ? 'Present' : 'MISSING', tone: fraud === 'yes' ? 'positive' : 'warning', text: fraud === 'yes' ? 'Fraud representation is present.' : 'Fraud representation is missing. Under AU-C 240, management must represent knowledge of fraud or suspected fraud. This is non-negotiable.' }, { title: 'Subsequent events representation', value: subsequent === 'yes' ? 'Present' : 'MISSING', tone: subsequent === 'yes' ? 'positive' : 'warning', text: subsequent === 'yes' ? 'Subsequent events representation is present.' : 'Subsequent events representation is missing. Management must represent the absence of material subsequent events through the report date.' }],
        [{ title: canIssueReport ? 'Letter is complete — ready to obtain signatures' : 'Letter incomplete — do not issue report until resolved', text: canIssueReport ? 'All required representations are present. Confirm the letter date matches the planned audit report date and that signatures will be obtained from both the CEO and CFO before report release.' : 'The letter is missing ' + missing + ' required representation(s) and ' + criticalMissing + ' critical item(s). Revise the draft, add missing items, and re-confirm with the engagement partner before sending for signature.' }, { title: 'Date and signatory requirements', text: 'The rep letter must be dated the same as the audit report — not before, not after. Signatories must be the principal executive officer (CEO) and principal financial officer (CFO) or equivalents with overall financial responsibility.' }, { title: 'Additional representations', text: additional + ' additional representation(s) included beyond AU-C 580 base requirements. Common additions: specific significant estimates (goodwill, pension), fair value measurements, going concern plans (if applicable), and regulatory compliance representations.' }],
        exportRows,
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, 'Completeness: ' + completionRate.toFixed(1) + '%. Score: ' + overallScore + '/100. Ready to issue: ' + (canIssueReport ? 'Yes' : 'No') + '.'
      );
    },

    'financial-close-control-calendar': function (values) {
      var closeDays = Math.max(1, values.closeDays || 7);
      var totalTasks = Math.max(1, Math.round(values.totalCloseTasks || 50));
      var controlCompletion = Math.max(0, Math.min(100, values.controlCompletionRate || 80));
      var onTimeDelivery = Math.max(0, Math.min(100, values.onTimeDeliveryRate || 70));
      var rework = Math.max(0, Math.round(values.reworkIncidents || 0));
      var closePeriod = values.closePeriod || 'monthly';
      var periodLabels = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' };
      var benchmarkDays = { monthly: { best: 4, typical: 7, lagging: 10 }, quarterly: { best: 6, typical: 10, lagging: 15 }, annual: { best: 10, typical: 15, lagging: 20 } };
      var bench = benchmarkDays[closePeriod] || benchmarkDays.monthly;
      var daysScore = closeDays <= bench.best ? 100 : closeDays <= bench.typical ? Math.round(100 - ((closeDays - bench.best) / (bench.typical - bench.best)) * 30) : closeDays <= bench.lagging ? Math.round(70 - ((closeDays - bench.typical) / (bench.lagging - bench.typical)) * 30) : Math.max(0, Math.round(40 - (closeDays - bench.lagging) * 5));
      var reworkPenalty = Math.min(20, rework * 2);
      var healthScore = Math.round((daysScore * 0.35) + (controlCompletion * 0.35) + (onTimeDelivery * 0.30) - reworkPenalty);
      healthScore = Math.max(0, Math.min(100, healthScore));
      var healthTone = healthScore >= 80 ? 'positive' : healthScore >= 60 ? 'neutral' : 'warning';
      var healthLevel = healthScore >= 80 ? 'Healthy' : healthScore >= 60 ? 'Needs Improvement' : 'At Risk';
      var dayVsBest = closeDays - bench.best;
      var annualDaysSaved = closePeriod === 'monthly' ? dayVsBest * 12 : closePeriod === 'quarterly' ? dayVsBest * 4 : dayVsBest;
      var closeStatus = closeDays <= bench.best ? 'Best-in-class' : closeDays <= bench.typical ? 'Typical' : 'Below benchmark';
      var exportRows = [
        { Metric: 'Close period type', Value: periodLabels[closePeriod] || closePeriod },
        { Metric: 'Current close length', Value: closeDays + ' business days' },
        { Metric: 'Best-in-class benchmark', Value: bench.best + ' business days' },
        { Metric: 'Typical benchmark', Value: bench.typical + ' business days' },
        { Metric: 'Close status', Value: closeStatus },
        { Metric: 'Total close tasks', Value: totalTasks },
        { Metric: 'Control completion rate', Value: controlCompletion + '%' },
        { Metric: 'On-time delivery rate', Value: onTimeDelivery + '%' },
        { Metric: 'Rework incidents per close', Value: rework },
        { Metric: 'Close health score', Value: healthScore + '/100 — ' + healthLevel },
        { Metric: 'Days to best-in-class', Value: dayVsBest > 0 ? dayVsBest + ' day(s)' : 'Already at or below benchmark' },
        { Metric: 'Annual days recoverable', Value: annualDaysSaved > 0 ? annualDaysSaved + ' days/year' : 'Already optimized' }
      ];
      return buildResult(
        [{ label: 'Close health score', value: healthScore + '/100', tone: healthTone, help: 'Composite score based on close length, control completion rate, on-time delivery, and rework incidents.' }, { label: 'Close status', value: closeStatus, tone: closeDays <= bench.best ? 'positive' : closeDays <= bench.typical ? 'neutral' : 'warning', help: closeDays + ' days vs. best-in-class ' + bench.best + ' days for a ' + (periodLabels[closePeriod] || closePeriod).toLowerCase() + ' close.' }, { label: 'Control completion rate', value: controlCompletion + '%', tone: controlCompletion >= 95 ? 'positive' : controlCompletion >= 85 ? 'neutral' : 'warning', help: 'Percentage of close controls completed on time. 100% is the target.' }, { label: 'Annual improvement opportunity', value: annualDaysSaved > 0 ? annualDaysSaved + ' days/year' : 'Already optimized', tone: annualDaysSaved > 0 ? 'neutral' : 'positive', help: 'Days per year that could be recovered by reaching best-in-class close length.' }],
        [{ title: 'Close length: ' + closeDays + ' days', value: closeStatus, tone: closeDays <= bench.best ? 'positive' : closeDays <= bench.typical ? 'neutral' : 'warning', text: 'Current close: ' + closeDays + ' days. Best-in-class ' + (periodLabels[closePeriod] || '').toLowerCase() + ' close: ' + bench.best + ' days. Typical: ' + bench.typical + ' days. Lagging: >' + bench.lagging + ' days.' }, { title: 'On-time delivery: ' + onTimeDelivery + '%', value: onTimeDelivery >= 90 ? 'On track' : 'Needs improvement', tone: onTimeDelivery >= 90 ? 'positive' : onTimeDelivery >= 70 ? 'neutral' : 'warning', text: onTimeDelivery + '% of closes delivered on time. ' + (onTimeDelivery < 90 ? 'Target is 90%+. Late closes indicate bottlenecks, dependencies, or resource constraints that need to be addressed.' : 'On-time delivery is strong. Focus on maintaining this rate as close compression continues.') }, { title: 'Rework incidents: ' + rework, value: rework === 0 ? 'None' : rework + ' per close', tone: rework === 0 ? 'positive' : rework <= 3 ? 'neutral' : 'warning', text: rework === 0 ? 'No rework incidents. Strong first-pass quality.' : rework + ' rework incident(s) per close. Each rework event adds delay and reduces team confidence. Root-cause the most frequent rework item and address the underlying process gap.' }],
        [{ title: 'Primary improvement lever', text: controlCompletion < 90 ? 'Control completion rate (' + controlCompletion + '%) is below the 90% target. Identify which controls are consistently completed late and reassign ownership or adjust due dates earlier in the close cycle.' : onTimeDelivery < 80 ? 'On-time delivery (' + onTimeDelivery + '%) needs improvement. Map the close on a day-by-day basis to identify where time is lost. Common bottlenecks: sub-ledger close delays, intercompany matching, and management review availability.' : closeDays > bench.typical ? 'Close length (' + closeDays + ' days) is above the typical benchmark (' + bench.typical + ' days). Move more tasks to pre-close (before period end) to compress the active close window.' : 'Close metrics are broadly in range. Focus on reducing rework and maintaining control completion rates.' }, { title: 'Technology investment case', text: annualDaysSaved > 0 ? 'Reaching best-in-class would recover approximately ' + annualDaysSaved + ' business days per year. Close management software (BlackLine, FloQast) typically reduces close length by 30-50% with positive ROI within 12-18 months for companies closing in 7+ days.' : 'Close length is already at or near best-in-class. Investment in close technology should focus on reducing rework and improving control completion consistency.' }, { title: 'Reporting cadence', text: 'Report close health score, on-time delivery rate, and control completion rate to the CFO and audit committee on a quarterly basis. Tracking these metrics over time demonstrates continuous improvement and supports the SOX 404 assertion about the effectiveness of close controls.' }],
        exportRows,
        { columns: [{ key: 'Metric', label: 'Metric' }, { key: 'Value', label: 'Value' }], rows: exportRows },
        exportRows, 'Close health: ' + healthLevel + ' (' + healthScore + '/100). Close: ' + closeDays + ' days (' + closeStatus + '). Control completion: ' + controlCompletion + '%.'
      );
    },

    'qbo-year-end-cleanup-checklist': function (values) {
      var banks = Math.max(1, Math.round(values.bankAccounts || 1)), hasPayroll = values.hasPayroll >= 1, has1099 = values.has1099Vendors >= 1, hasFA = values.hasFixedAssets >= 1, hasInv = values.hasInventory >= 1, entity = values.entityType || 'llc';
      var t = [];
      t.push({ p: 'Critical', task: 'Reconcile all ' + banks + ' bank accounts through Dec 31', owner: 'Bookkeeper', area: 'Cash', d: Math.ceil(banks * 0.5) });
      t.push({ p: 'Critical', task: 'Reconcile credit card accounts through Dec 31', owner: 'Bookkeeper', area: 'Cash', d: 1 });
      t.push({ p: 'Critical', task: 'Clear undeposited funds account', owner: 'Bookkeeper', area: 'Cash', d: 1 });
      t.push({ p: 'Critical', task: 'Write off uncollectible receivables', owner: 'Controller', area: 'Revenue', d: 1 });
      t.push({ p: 'Critical', task: 'Confirm all December expenses posted', owner: 'Bookkeeper', area: 'Expenses', d: 1 });
      t.push({ p: 'High', task: 'Review AR aging and follow up on past-due', owner: 'AR Clerk', area: 'Revenue', d: 1 });
      t.push({ p: 'High', task: 'Review AP aging and clear stale payables', owner: 'AP Clerk', area: 'Expenses', d: 1 });
      t.push({ p: 'High', task: 'Post adjusting entries (accruals, prepaids, deferrals)', owner: 'Controller', area: 'Adjustments', d: 2 });
      t.push({ p: 'High', task: 'Review P&L for reclassifications', owner: 'Controller', area: 'Reporting', d: 1 });
      t.push({ p: 'High', task: 'Verify all balance sheet accounts', owner: 'Controller', area: 'Reporting', d: 1 });
      if (hasPayroll) { t.push({ p: 'Critical', task: 'Reconcile payroll tax deposits to returns', owner: 'Payroll', area: 'Payroll', d: 2 }); t.push({ p: 'Critical', task: 'Review W-2 drafts before filing', owner: 'Payroll', area: 'Payroll', d: 1 }); }
      if (has1099) { t.push({ p: 'Critical', task: 'Flag vendors with payments >= $600 for 1099', owner: 'AP Clerk', area: '1099s', d: 1 }); t.push({ p: 'Critical', task: 'Verify W-9s on file for 1099 vendors', owner: 'AP Clerk', area: '1099s', d: 1 }); t.push({ p: 'High', task: 'File 1099-NEC by January 31', owner: 'Controller', area: '1099s', d: 1 }); }
      if (hasFA) { t.push({ p: 'High', task: 'Post December depreciation entries', owner: 'Staff', area: 'Fixed Assets', d: 1 }); t.push({ p: 'High', task: 'Review asset register for disposals', owner: 'Controller', area: 'Fixed Assets', d: 1 }); }
      if (hasInv) { t.push({ p: 'High', task: 'Physical inventory count', owner: 'Warehouse', area: 'Inventory', d: 2 }); t.push({ p: 'High', task: 'Adjust QBO to match count', owner: 'Bookkeeper', area: 'Inventory', d: 1 }); }
      t.push({ p: 'Medium', task: 'Merge or inactivate unused accounts', owner: 'Controller', area: 'Cleanup', d: 1 });
      t.push({ p: 'Medium', task: 'Clear Uncategorized Income/Expense', owner: 'Bookkeeper', area: 'Cleanup', d: 1 });
      t.push({ p: 'Medium', task: 'Clean up Products and Services list', owner: 'Bookkeeper', area: 'Cleanup', d: 1 });
      t.push({ p: 'Medium', task: 'Back up QBO data file', owner: 'Admin', area: 'Admin', d: 1 });
      if (entity === 'scorp' || entity === 'ccorp') t.push({ p: 'High', task: 'Review officer compensation for reasonable salary', owner: 'CPA', area: 'Tax', d: 1 });
      t.push({ p: 'Medium', task: 'Set closing date password to lock prior year', owner: 'Admin', area: 'Admin', d: 1 });
      var totalDays = sum(t.map(function (x) { return x.d; }));
      var crit = t.filter(function (x) { return x.p === 'Critical'; }).length, high = t.filter(function (x) { return x.p === 'High'; }).length, med = t.filter(function (x) { return x.p === 'Medium'; }).length;
      var rows = [], exp = [];
      t.forEach(function (x, i) { rows.push({ num: '#' + (i + 1), priority: x.p, task: x.task, owner: x.owner, area: x.area, est: x.d + 'd' }); exp.push({ '#': i + 1, Priority: x.p, Task: x.task, Owner: x.owner, Area: x.area, Days: x.d }); });
      return buildResult(
        [{ label: 'Total items', value: formatNumber(t.length), tone: 'neutral', help: 'Tasks based on your QBO setup.' }, { label: 'Critical', value: formatNumber(crit), tone: crit > 0 ? 'warning' : 'positive', help: 'Must complete before filing.' }, { label: 'Estimated effort', value: totalDays + ' days', tone: 'neutral', help: 'Total person-days.' }, { label: 'Entity', value: entity.toUpperCase(), tone: 'neutral', help: 'Affects compliance tasks.' }],
        [{ title: 'High priority', value: formatNumber(high), tone: 'neutral', text: 'Complete in January.' }, { title: 'Medium priority', value: formatNumber(med), tone: 'neutral', text: 'February cleanup.' }, { title: 'Bank accounts', value: formatNumber(banks), tone: 'neutral', text: 'Each needs Dec reconciliation.' }, { title: 'Modules', value: [hasPayroll ? 'Payroll' : '', has1099 ? '1099s' : '', hasFA ? 'FA' : '', hasInv ? 'Inventory' : ''].filter(Boolean).join(', ') || 'None', tone: 'neutral', text: 'Active features adding tasks.' }],
        [{ title: 'Start with bank reconciliations', text: 'Clean cash is the foundation for every other account.' }, { title: '1099 deadline is January 31', text: 'Missing this triggers IRS penalties.' }, { title: 'Lock the year when done', text: 'Set a closing date and password to prevent accidental changes.' }],
        [{ label: 'Entity', value: entity.toUpperCase() }, { label: 'Banks', value: formatNumber(banks) }, { label: 'Tasks', value: formatNumber(t.length) }, { label: 'Critical', value: formatNumber(crit) }, { label: 'High', value: formatNumber(high) }, { label: 'Medium', value: formatNumber(med) }, { label: 'Effort', value: totalDays + ' days' }],
        { columns: [{ key: 'num', label: '#' }, { key: 'priority', label: 'Priority' }, { key: 'task', label: 'Task' }, { key: 'owner', label: 'Owner' }, { key: 'area', label: 'Area' }, { key: 'est', label: 'Est.' }], rows: rows },
        exp, 'Year-end checklist: ' + t.length + ' items.'
      );
    },

    /* ── Nonprofit & Fund Accounting (101-110) ─────────────────────── */

    'restricted-unrestricted-fund-tracker': function (values, rows) {
      if (!rows || !rows.length) throw new Error('Add at least one fund row.');
      var unrestricted = 0, withDonor = 0, permanent = 0, totalReleased = 0, fundCount = rows.length;
      var tblRows = [], exp = [];
      rows.forEach(function (r) {
        var name = r.fundName || 'Unnamed';
        var rType = String(r.restrictionType || 'unrestricted').toLowerCase();
        var bal = r.balance || 0;
        var rel = r.releaseAmount || 0;
        var ending = bal - rel;
        if (rType === 'unrestricted') { unrestricted += ending; }
        else if (rType === 'permanent') { permanent += ending; withDonor += ending; }
        else { withDonor += ending; }
        totalReleased += rel;
        tblRows.push({ fund: name, type: rType === 'unrestricted' ? 'Without restrictions' : (rType === 'permanent' ? 'Permanent' : 'With donor restrictions'), balance: formatMoney(bal), released: formatMoney(rel), ending: formatMoney(ending) });
        exp.push({ Fund: name, Type: rType, 'Beginning Balance': bal, Released: rel, Ending: ending });
      });
      var total = unrestricted + withDonor;
      var restrictedPct = total ? (withDonor / total) * 100 : 0;
      var liquidityRatio = withDonor ? unrestricted / withDonor : 999;
      var signals = [
        { title: 'Restricted share', value: formatPercent(restrictedPct), tone: restrictedPct > 70 ? 'warning' : 'positive', text: restrictedPct > 70 ? 'Over 70% restricted — liquidity risk.' : 'Restriction mix is manageable.' },
        { title: 'Unrestricted balance', value: formatMoney(unrestricted), tone: unrestricted < 0 ? 'warning' : 'positive', text: unrestricted < 0 ? 'Negative unrestricted net assets.' : 'Positive unrestricted position.' },
        { title: 'Permanent endowment', value: formatMoney(permanent), tone: 'neutral', text: 'Corpus that cannot be spent.' },
        { title: 'Released this period', value: formatMoney(totalReleased), tone: 'neutral', text: 'Restrictions satisfied and released.' }
      ];
      return buildResult(
        [{ label: 'Total net assets', value: formatMoney(total), tone: 'neutral', help: 'Sum of all fund balances.' }, { label: 'Unrestricted', value: formatMoney(unrestricted), tone: unrestricted < 0 ? 'warning' : 'positive', help: 'Available for general use.' }, { label: 'With donor restrictions', value: formatMoney(withDonor), tone: 'neutral', help: 'Time, purpose, or permanent restrictions.' }, { label: 'Funds tracked', value: formatNumber(fundCount), tone: 'neutral', help: 'Number of fund rows entered.' }],
        signals,
        [{ title: 'Board reporting', text: 'Present the unrestricted vs restricted split to the board quarterly.' }, { title: 'Liquidity planning', text: 'Ensure unrestricted cash covers at least 3 months of operating expenses.' }, { title: 'Release documentation', text: 'Document the purpose or time condition met for each release.' }],
        [{ label: 'Unrestricted', value: formatMoney(unrestricted) }, { label: 'Donor-restricted', value: formatMoney(withDonor) }, { label: 'Permanent', value: formatMoney(permanent) }, { label: 'Restricted %', value: formatPercent(restrictedPct) }, { label: 'Released', value: formatMoney(totalReleased) }, { label: 'Liquidity ratio', value: formatRatio(liquidityRatio) }],
        { columns: [{ key: 'fund', label: 'Fund' }, { key: 'type', label: 'Classification' }, { key: 'balance', label: 'Beginning' }, { key: 'released', label: 'Released' }, { key: 'ending', label: 'Ending' }], rows: tblRows },
        exp, 'Fund tracker: ' + fundCount + ' funds, ' + formatPercent(restrictedPct) + ' restricted.'
      );
    },

    'grant-budget-vs-actual-tool': function (values, rows) {
      if (!rows || !rows.length) throw new Error('Add at least one budget line.');
      var grantName = values.grantName || 'Grant';
      var startDate = parseDate(values.grantStartDate);
      var endDate = parseDate(values.grantEndDate);
      var reportDate = parseDate(values.reportingDate);
      var indirectRate = toRatio(values.indirectCostRate || 0);
      var totalBudgeted = 0, totalActual = 0;
      var tblRows = [], exp = [];
      rows.forEach(function (r) {
        var cat = r.category || 'Unnamed';
        var bud = r.budgeted || 0;
        var act = r.actual || 0;
        var variance = bud - act;
        var spentPct = bud ? (act / bud) * 100 : 0;
        totalBudgeted += bud;
        totalActual += act;
        tblRows.push({ category: cat, budgeted: formatMoney(bud), actual: formatMoney(act), variance: formatMoney(variance), spentPct: formatPercent(spentPct) });
        exp.push({ Category: cat, Budgeted: bud, Actual: act, Variance: variance, 'Spent %': spentPct.toFixed(1) + '%' });
      });
      var totalVariance = totalBudgeted - totalActual;
      var overallSpentPct = totalBudgeted ? (totalActual / totalBudgeted) * 100 : 0;
      var grantDays = startDate && endDate ? daysBetween(startDate, endDate) : 0;
      var elapsedDays = startDate && reportDate ? daysBetween(startDate, reportDate) : 0;
      var elapsedPct = grantDays > 0 ? (Math.max(0, elapsedDays) / grantDays) * 100 : 0;
      var burnRate = elapsedDays > 0 ? totalActual / elapsedDays : 0;
      var projectedFinal = grantDays > 0 ? burnRate * grantDays : totalActual;
      var projectedVariance = totalBudgeted - projectedFinal;
      var indirectAmount = totalActual * indirectRate;
      var spendGap = overallSpentPct - elapsedPct;
      return buildResult(
        [{ label: 'Total budget', value: formatMoney(totalBudgeted), tone: 'neutral', help: 'Sum of all budget lines.' }, { label: 'Total spent', value: formatMoney(totalActual), tone: 'neutral', help: 'Actual costs to date.' }, { label: 'Spent %', value: formatPercent(overallSpentPct), tone: Math.abs(spendGap) > 20 ? 'warning' : 'positive', help: 'Actual as % of budget.' }, { label: 'Time elapsed', value: formatPercent(elapsedPct), tone: 'neutral', help: 'Grant period elapsed.' }],
        [
          { title: 'Burn rate', value: formatMoney(burnRate) + '/day', tone: 'neutral', text: 'Average daily spend since grant start.' },
          { title: 'Projected final', value: formatMoney(projectedFinal), tone: projectedVariance < 0 ? 'warning' : 'positive', text: projectedVariance < 0 ? 'Projected overspend of ' + formatMoney(-projectedVariance) + '.' : 'On track to finish under budget.' },
          { title: 'Spend vs time gap', value: formatPercent(spendGap) + ' pts', tone: Math.abs(spendGap) > 20 ? 'warning' : 'positive', text: spendGap > 0 ? 'Spending ahead of schedule.' : 'Spending behind schedule.' },
          { title: 'Indirect costs', value: formatMoney(indirectAmount), tone: 'neutral', text: 'At ' + formatPercent(values.indirectCostRate || 0) + ' rate.' }
        ],
        [{ title: 'Review overspent lines', text: 'Budget modifications may be needed for categories exceeding plan.' }, { title: 'Track indirect separately', text: 'Funders often cap indirect cost recovery.' }, { title: 'Align reporting to funder schedule', text: 'Match this analysis to required reporting periods.' }],
        [{ label: 'Grant', value: grantName }, { label: 'Budget', value: formatMoney(totalBudgeted) }, { label: 'Actual', value: formatMoney(totalActual) }, { label: 'Variance', value: formatMoney(totalVariance) }, { label: 'Spent %', value: formatPercent(overallSpentPct) }, { label: 'Elapsed %', value: formatPercent(elapsedPct) }, { label: 'Projected final', value: formatMoney(projectedFinal) }],
        { columns: [{ key: 'category', label: 'Category' }, { key: 'budgeted', label: 'Budgeted' }, { key: 'actual', label: 'Actual' }, { key: 'variance', label: 'Variance' }, { key: 'spentPct', label: 'Spent %' }], rows: tblRows },
        exp, grantName + ': ' + formatPercent(overallSpentPct) + ' spent, ' + formatPercent(elapsedPct) + ' elapsed.'
      );
    },

    'fund-balance-roll-forward': function (values, rows) {
      if (!rows || !rows.length) throw new Error('Add at least one fund row.');
      var totalTransfers = 0, negativeCount = 0;
      var tblRows = [], exp = [];
      rows.forEach(function (r) {
        var name = r.fundName || 'Unnamed';
        var beg = r.beginningBalance || 0;
        var rev = r.revenues || 0;
        var expenses = r.expenses || 0;
        var xfer = r.transfers || 0;
        var rel = r.releaseReclass || 0;
        var ending = beg + rev - expenses + xfer + rel;
        var netChange = ending - beg;
        totalTransfers += xfer;
        if (ending < 0) negativeCount++;
        tblRows.push({ fund: name, beginning: formatMoney(beg), revenues: formatMoney(rev), expenses: formatMoney(expenses), transfers: formatMoney(xfer), releases: formatMoney(rel), ending: formatMoney(ending) });
        exp.push({ Fund: name, Beginning: beg, Revenues: rev, Expenses: expenses, Transfers: xfer, 'Release/Reclass': rel, Ending: ending, 'Net Change': netChange });
      });
      var totalBeg = sum(rows.map(function (r) { return r.beginningBalance || 0; }));
      var totalEnd = sum(rows.map(function (r) { var b = r.beginningBalance || 0, rv = r.revenues || 0, ex = r.expenses || 0, xf = r.transfers || 0, rl = r.releaseReclass || 0; return b + rv - ex + xf + rl; }));
      var totalRev = sum(rows.map(function (r) { return r.revenues || 0; }));
      var totalExp = sum(rows.map(function (r) { return r.expenses || 0; }));
      var transfersNet = Math.abs(totalTransfers) > 0.01;
      return buildResult(
        [{ label: 'Beginning total', value: formatMoney(totalBeg), tone: 'neutral', help: 'Sum of all beginning balances.' }, { label: 'Ending total', value: formatMoney(totalEnd), tone: totalEnd < 0 ? 'warning' : 'positive', help: 'Sum of all ending balances.' }, { label: 'Net change', value: formatMoney(totalEnd - totalBeg), tone: (totalEnd - totalBeg) < 0 ? 'warning' : 'positive', help: 'Overall change across all funds.' }, { label: 'Funds', value: formatNumber(rows.length), tone: 'neutral', help: 'Number of funds tracked.' }],
        [
          { title: 'Total revenues', value: formatMoney(totalRev), tone: 'neutral', text: 'Across all funds.' },
          { title: 'Total expenses', value: formatMoney(totalExp), tone: 'neutral', text: 'Across all funds.' },
          { title: 'Transfers net', value: formatMoney(totalTransfers), tone: transfersNet ? 'warning' : 'positive', text: transfersNet ? 'Transfers do not net to zero — check interfund entries.' : 'Transfers balance across funds.' },
          { title: 'Negative funds', value: formatNumber(negativeCount), tone: negativeCount > 0 ? 'warning' : 'positive', text: negativeCount > 0 ? negativeCount + ' fund(s) ending with deficit.' : 'All funds have positive ending balances.' }
        ],
        [{ title: 'Verify interfund transfers', text: 'Transfers should net to zero across all funds.' }, { title: 'Investigate negative balances', text: 'A negative ending balance may indicate overspending against restricted funds.' }, { title: 'Board presentation', text: 'Present beginning, activity, and ending by fund for transparency.' }],
        [{ label: 'Beginning', value: formatMoney(totalBeg) }, { label: 'Revenues', value: formatMoney(totalRev) }, { label: 'Expenses', value: formatMoney(totalExp) }, { label: 'Transfers', value: formatMoney(totalTransfers) }, { label: 'Ending', value: formatMoney(totalEnd) }],
        { columns: [{ key: 'fund', label: 'Fund' }, { key: 'beginning', label: 'Beginning' }, { key: 'revenues', label: 'Revenues' }, { key: 'expenses', label: 'Expenses' }, { key: 'transfers', label: 'Transfers' }, { key: 'releases', label: 'Release/Reclass' }, { key: 'ending', label: 'Ending' }], rows: tblRows },
        exp, 'Roll-forward: ' + rows.length + ' funds, ending ' + formatMoney(totalEnd) + '.'
      );
    },

    'form-990-revenue-reconciler': function (values) {
      var contributions = values.contributions || 0;
      var programRev = values.programServiceRevenue || 0;
      var investmentIncome = values.investmentIncome || 0;
      var specialEvents = values.specialEventsRevenue || 0;
      var specialCosts = values.specialEventsCosts || 0;
      var salesOfAssets = values.salesOfAssets || 0;
      var costBasis = values.costBasis || 0;
      var otherRevenue = values.otherRevenue || 0;
      var pledgeAdj = values.pledgeTimingAdj || 0;
      var reported990 = values.reported990Total || 0;
      var bookTotal = contributions + programRev + investmentIncome + specialEvents + salesOfAssets + otherRevenue;
      var specialEventsNet = specialEvents - specialCosts;
      var gainOnSales = salesOfAssets - costBasis;
      var adjusted990 = contributions + programRev + investmentIncome + specialEventsNet + gainOnSales + otherRevenue + pledgeAdj;
      var reconDiff = adjusted990 - reported990;
      var diffWarning = Math.abs(reconDiff) > 1000;
      return buildResult(
        [{ label: 'Book revenue', value: formatMoney(bookTotal), tone: 'neutral', help: 'Total revenue per financial statements.' }, { label: 'Adjusted 990 basis', value: formatMoney(adjusted990), tone: 'neutral', help: 'Revenue adjusted for 990 reporting rules.' }, { label: 'Reported on 990', value: formatMoney(reported990), tone: 'neutral', help: 'Total revenue per filed Form 990.' }, { label: 'Reconciling difference', value: formatMoney(reconDiff), tone: diffWarning ? 'warning' : 'positive', help: 'Gap between adjusted and reported.' }],
        [
          { title: 'Special events net', value: formatMoney(specialEventsNet), tone: 'neutral', text: '990 reports net of direct costs.' },
          { title: 'Gain on asset sales', value: formatMoney(gainOnSales), tone: 'neutral', text: '990 uses gain, not gross proceeds.' },
          { title: 'Pledge timing adj', value: formatMoney(pledgeAdj), tone: 'neutral', text: 'Timing differences in pledge recognition.' },
          { title: 'Recon status', value: diffWarning ? 'Review needed' : 'Reconciled', tone: diffWarning ? 'warning' : 'positive', text: diffWarning ? 'Difference exceeds $1,000 threshold.' : 'Within acceptable tolerance.' }
        ],
        [{ title: 'Review special events netting', text: 'Form 990 reports special events net of direct costs on Part VIII.' }, { title: 'Check pledge timing', text: 'Conditional vs unconditional pledges may differ between books and 990.' }, { title: 'Document reconciling items', text: 'Keep a workpaper tying book revenue to 990 for audit readiness.' }],
        [{ label: 'Contributions', value: formatMoney(contributions) }, { label: 'Program revenue', value: formatMoney(programRev) }, { label: 'Investment income', value: formatMoney(investmentIncome) }, { label: 'Special events (gross)', value: formatMoney(specialEvents) }, { label: 'Special events (net)', value: formatMoney(specialEventsNet) }, { label: 'Asset sales gain', value: formatMoney(gainOnSales) }, { label: 'Other revenue', value: formatMoney(otherRevenue) }, { label: 'Pledge adj', value: formatMoney(pledgeAdj) }, { label: 'Book total', value: formatMoney(bookTotal) }, { label: 'Adjusted 990', value: formatMoney(adjusted990) }, { label: 'Difference', value: formatMoney(reconDiff) }],
        null,
        [{ 'Line': 'Contributions', Amount: contributions }, { 'Line': 'Program revenue', Amount: programRev }, { 'Line': 'Investment income', Amount: investmentIncome }, { 'Line': 'Special events net', Amount: specialEventsNet }, { 'Line': 'Asset sales gain', Amount: gainOnSales }, { 'Line': 'Other revenue', Amount: otherRevenue }, { 'Line': 'Pledge adj', Amount: pledgeAdj }, { 'Line': 'Adjusted 990 total', Amount: adjusted990 }, { 'Line': 'Reported 990', Amount: reported990 }, { 'Line': 'Difference', Amount: reconDiff }],
        'Revenue reconciliation: ' + (diffWarning ? 'difference of ' + formatMoney(reconDiff) + ' — review needed.' : 'reconciled within tolerance.')
      );
    },

    'donor-pledge-receivable-tracker': function (values, rows) {
      if (!rows || !rows.length) throw new Error('Add at least one pledge row.');
      var reportDate = parseDate(values.reportingDate) || new Date();
      var allowanceRate = toRatio(values.allowanceRate || 5);
      var totalPledged = 0, totalReceived = 0, pastDue90 = 0;
      var bucket0 = 0, bucket30 = 0, bucket60 = 0, bucket90 = 0;
      var tblRows = [], exp = [];
      rows.forEach(function (r) {
        var donor = r.donorName || 'Anonymous';
        var pledgeAmt = r.pledgeAmount || 0;
        var received = r.amountReceived || 0;
        var outstanding = pledgeAmt - received;
        var dueDate = parseDate(r.dueDate);
        var daysOverdue = dueDate ? daysBetween(dueDate, reportDate) : 0;
        if (daysOverdue < 0) daysOverdue = 0;
        totalPledged += pledgeAmt;
        totalReceived += received;
        var agingBucket = 'Current';
        if (daysOverdue > 90) { bucket90 += outstanding; pastDue90 += outstanding; agingBucket = '90+ days'; }
        else if (daysOverdue > 60) { bucket60 += outstanding; agingBucket = '61-90 days'; }
        else if (daysOverdue > 30) { bucket30 += outstanding; agingBucket = '31-60 days'; }
        else { bucket0 += outstanding; }
        tblRows.push({ donor: donor, pledged: formatMoney(pledgeAmt), received: formatMoney(received), outstanding: formatMoney(outstanding), aging: agingBucket });
        exp.push({ Donor: donor, Pledged: pledgeAmt, Received: received, Outstanding: outstanding, Aging: agingBucket, 'Days Overdue': daysOverdue });
      });
      var totalOutstanding = totalPledged - totalReceived;
      var allowance = totalOutstanding * allowanceRate;
      var netRealizable = totalOutstanding - allowance;
      var collectionRate = totalPledged ? (totalReceived / totalPledged) * 100 : 0;
      return buildResult(
        [{ label: 'Total pledged', value: formatMoney(totalPledged), tone: 'neutral', help: 'Sum of all pledge commitments.' }, { label: 'Collected', value: formatMoney(totalReceived), tone: 'neutral', help: 'Cash received to date.' }, { label: 'Outstanding', value: formatMoney(totalOutstanding), tone: 'neutral', help: 'Remaining receivable.' }, { label: 'Collection rate', value: formatPercent(collectionRate), tone: collectionRate < 80 ? 'warning' : 'positive', help: 'Received / pledged.' }],
        [
          { title: 'Net realizable value', value: formatMoney(netRealizable), tone: 'neutral', text: 'Outstanding less allowance for doubtful pledges.' },
          { title: 'Allowance', value: formatMoney(allowance), tone: 'neutral', text: 'At ' + formatPercent(values.allowanceRate || 5) + ' of outstanding.' },
          { title: 'Past due 90+', value: formatMoney(pastDue90), tone: pastDue90 > 0 ? 'warning' : 'positive', text: pastDue90 > 0 ? 'Significant past-due pledges need follow-up.' : 'No pledges past 90 days.' },
          { title: 'Pledges tracked', value: formatNumber(rows.length), tone: 'neutral', text: 'Individual pledge commitments.' }
        ],
        [{ title: 'Follow up on 90+ day pledges', text: 'Contact donors with overdue pledges to confirm intent and timing.' }, { title: 'Adjust allowance rate', text: 'If historical write-offs differ from the rate used, update the assumption.' }, { title: 'Board reporting', text: 'Report net realizable pledge receivable with aging summary to the board.' }],
        [{ label: 'Total pledged', value: formatMoney(totalPledged) }, { label: 'Received', value: formatMoney(totalReceived) }, { label: 'Outstanding', value: formatMoney(totalOutstanding) }, { label: 'Current', value: formatMoney(bucket0) }, { label: '31-60 days', value: formatMoney(bucket30) }, { label: '61-90 days', value: formatMoney(bucket60) }, { label: '90+ days', value: formatMoney(bucket90) }, { label: 'Allowance', value: formatMoney(allowance) }, { label: 'Net realizable', value: formatMoney(netRealizable) }],
        { columns: [{ key: 'donor', label: 'Donor' }, { key: 'pledged', label: 'Pledged' }, { key: 'received', label: 'Received' }, { key: 'outstanding', label: 'Outstanding' }, { key: 'aging', label: 'Aging' }], rows: tblRows },
        exp, 'Pledges: ' + formatMoney(totalOutstanding) + ' outstanding, ' + formatPercent(collectionRate) + ' collected.'
      );
    },

    'functional-expense-allocation-calculator': function (values, rows) {
      if (!rows || !rows.length) throw new Error('Add at least one expense row.');
      var method = values.allocationMethod || 'default';
      var defProgPct = toRatio(values.programPct || 75);
      var defMgPct = toRatio(values.mgPct || 15);
      var defFrPct = toRatio(values.fundraisingPct || 10);
      var totalProgram = 0, totalMg = 0, totalFr = 0, grandTotal = 0;
      var tblRows = [], exp = [];
      rows.forEach(function (r) {
        var cat = r.expenseCategory || 'Unnamed';
        var amt = r.totalAmount || 0;
        var pPct = r.programOverride != null && r.programOverride !== '' ? toRatio(r.programOverride) : defProgPct;
        var mPct = r.mgOverride != null && r.mgOverride !== '' ? toRatio(r.mgOverride) : defMgPct;
        var fPct = r.fundraisingOverride != null && r.fundraisingOverride !== '' ? toRatio(r.fundraisingOverride) : defFrPct;
        var pAmt = amt * pPct, mAmt = amt * mPct, fAmt = amt * fPct;
        totalProgram += pAmt; totalMg += mAmt; totalFr += fAmt; grandTotal += amt;
        tblRows.push({ category: cat, total: formatMoney(amt), program: formatMoney(pAmt), mg: formatMoney(mAmt), fundraising: formatMoney(fAmt) });
        exp.push({ Category: cat, Total: amt, Program: pAmt, 'M&G': mAmt, Fundraising: fAmt });
      });
      var programRatio = grandTotal ? (totalProgram / grandTotal) * 100 : 0;
      var mgRatio = grandTotal ? (totalMg / grandTotal) * 100 : 0;
      var frRatio = grandTotal ? (totalFr / grandTotal) * 100 : 0;
      return buildResult(
        [{ label: 'Total expenses', value: formatMoney(grandTotal), tone: 'neutral', help: 'Sum of all expense rows.' }, { label: 'Program', value: formatMoney(totalProgram), tone: 'neutral', help: 'Allocated to program services.' }, { label: 'Program ratio', value: formatPercent(programRatio), tone: programRatio < 65 ? 'warning' : 'positive', help: 'Program / total expenses.' }, { label: 'M&G + Fundraising', value: formatMoney(totalMg + totalFr), tone: 'neutral', help: 'Combined support services.' }],
        [
          { title: 'Program ratio', value: formatPercent(programRatio), tone: programRatio < 65 ? 'warning' : 'positive', text: programRatio < 65 ? 'Below 65% — donors and watchdogs flag this.' : 'Healthy program spending ratio.' },
          { title: 'M&G ratio', value: formatPercent(mgRatio), tone: mgRatio > 25 ? 'warning' : 'positive', text: mgRatio > 25 ? 'Management costs above 25%.' : 'Within acceptable range.' },
          { title: 'Fundraising ratio', value: formatPercent(frRatio), tone: frRatio > 20 ? 'warning' : 'positive', text: frRatio > 20 ? 'Fundraising above 20% threshold.' : 'Fundraising cost in range.' },
          { title: 'Method', value: method === 'default' ? 'Default splits' : method, tone: 'neutral', text: 'Allocation approach used for this analysis.' }
        ],
        [{ title: 'Document allocation methodology', text: 'GAAP requires disclosure of the method used to allocate joint costs.' }, { title: 'Review overrides', text: 'Line-level overrides should reflect actual usage or time studies.' }, { title: 'Benchmark against peers', text: 'Compare your program ratio to similar organizations in your subsector.' }],
        [{ label: 'Total', value: formatMoney(grandTotal) }, { label: 'Program', value: formatMoney(totalProgram) + ' (' + formatPercent(programRatio) + ')' }, { label: 'M&G', value: formatMoney(totalMg) + ' (' + formatPercent(mgRatio) + ')' }, { label: 'Fundraising', value: formatMoney(totalFr) + ' (' + formatPercent(frRatio) + ')' }],
        { columns: [{ key: 'category', label: 'Category' }, { key: 'total', label: 'Total' }, { key: 'program', label: 'Program' }, { key: 'mg', label: 'M&G' }, { key: 'fundraising', label: 'Fundraising' }], rows: tblRows },
        exp, 'Allocation: ' + formatPercent(programRatio) + ' program, ' + formatPercent(mgRatio) + ' M&G, ' + formatPercent(frRatio) + ' fundraising.'
      );
    },

    'irs-public-support-test-calculator': function (values) {
      var testType = values.testType || '509a1';
      var years = [];
      for (var i = 1; i <= 5; i++) {
        years.push({ label: values['yearLabel' + i] || ('Year ' + i), total: values['totalSupport' + i] || 0, pub: values['publicSupport' + i] || 0 });
      }
      var unusualGrant = values.unusualGrant || 0;
      var totalSupport5 = sum(years.map(function (y) { return y.total; }));
      var publicSupport5 = sum(years.map(function (y) { return y.pub; })) - unusualGrant;
      var pubPct = totalSupport5 ? (publicSupport5 / totalSupport5) * 100 : 0;
      var threshold = 33.33;
      var pass = pubPct >= threshold;
      var safetyMargin = pubPct - threshold;
      var yearPcts = years.map(function (y) { return y.total ? (y.pub / y.total) * 100 : 0; });
      var trend = yearPcts.length >= 2 ? yearPcts[yearPcts.length - 1] - yearPcts[0] : 0;
      var thinMargin = pass && safetyMargin < 5;
      var exp = years.map(function (y) { return { Year: y.label, 'Total Support': y.total, 'Public Support': y.pub, '%': y.total ? ((y.pub / y.total) * 100).toFixed(2) + '%' : '0%' }; });
      exp.push({ Year: '5-Year Total', 'Total Support': totalSupport5, 'Public Support': publicSupport5, '%': formatPercent(pubPct) });
      return buildResult(
        [{ label: 'Test type', value: testType === '509a1' ? '509(a)(1)' : '509(a)(2)', tone: 'neutral', help: 'Public charity classification test.' }, { label: 'Public support %', value: formatPercent(pubPct), tone: pass ? 'positive' : 'warning', help: '5-year public support percentage.' }, { label: 'Result', value: pass ? 'PASS' : 'FAIL', tone: pass ? 'positive' : 'warning', help: 'Against 33.33% threshold.' }, { label: 'Safety margin', value: formatPercent(safetyMargin) + ' pts', tone: thinMargin ? 'warning' : (pass ? 'positive' : 'warning'), help: 'Distance from threshold.' }],
        [
          { title: '5-year total support', value: formatMoney(totalSupport5), tone: 'neutral', text: 'Denominator for the test.' },
          { title: '5-year public support', value: formatMoney(publicSupport5), tone: 'neutral', text: 'After excluding unusual grants.' },
          { title: 'Unusual grant excluded', value: formatMoney(unusualGrant), tone: unusualGrant > 0 ? 'neutral' : 'positive', text: 'Excluded from public support numerator.' },
          { title: '5-year trend', value: (trend >= 0 ? '+' : '') + formatPercent(trend) + ' pts', tone: trend < -5 ? 'warning' : 'positive', text: trend < 0 ? 'Declining public support trend.' : 'Stable or improving trend.' }
        ],
        [{ title: pass ? 'Maintain public support' : 'Action required', text: pass ? 'Continue diversifying revenue to maintain the threshold.' : 'Public support below 33.33%. Consider a facts-and-circumstances test or reclassification strategy.' }, { title: 'Monitor unusual grants', text: 'Large single-source grants can be excluded if they meet the unusual grant criteria.' }, { title: 'Annual tracking', text: 'Calculate this annually to catch declining support before it causes reclassification.' }],
        [{ label: 'Test', value: testType === '509a1' ? '509(a)(1)' : '509(a)(2)' }, { label: 'Total support', value: formatMoney(totalSupport5) }, { label: 'Public support', value: formatMoney(publicSupport5) }, { label: 'Public %', value: formatPercent(pubPct) }, { label: 'Threshold', value: '33.33%' }, { label: 'Result', value: pass ? 'PASS' : 'FAIL' }, { label: 'Safety margin', value: formatPercent(safetyMargin) + ' pts' }, { label: 'Trend', value: (trend >= 0 ? '+' : '') + formatPercent(trend) + ' pts' }],
        null, exp, 'Public support test: ' + formatPercent(pubPct) + ' — ' + (pass ? 'PASS' : 'FAIL') + '.'
      );
    },

    'statement-of-activities-builder': function (values, rows) {
      if (!rows || !rows.length) throw new Error('Add at least one line item.');
      var orgName = values.orgName || 'Organization';
      var periodLabel = values.periodLabel || 'Current Period';
      var comparativeYear = values.comparativeYear || 'Comparative';
      var revWithout = 0, revWith = 0, expWithout = 0, expWith = 0, xferWithout = 0, xferWith = 0;
      var compRevWithout = 0, compRevWith = 0, compExpWithout = 0, compExpWith = 0;
      var tblRows = [], exp = [];
      rows.forEach(function (r) {
        var label = r.lineLabel || 'Unnamed';
        var lineType = String(r.lineType || 'Revenue').toLowerCase();
        var wo = r.withoutRestrictions || 0;
        var wr = r.withRestrictions || 0;
        var comp = r.comparative || 0;
        var total = wo + wr;
        if (lineType === 'revenue' || lineType === 'rev') { revWithout += wo; revWith += wr; compRevWithout += comp; }
        else if (lineType === 'expense' || lineType === 'exp') { expWithout += wo; expWith += wr; compExpWithout += comp; }
        else { xferWithout += wo; xferWith += wr; }
        tblRows.push({ line: label, type: lineType, without: formatMoney(wo), with: formatMoney(wr), total: formatMoney(total), comparative: formatMoney(comp) });
        exp.push({ Line: label, Type: lineType, 'Without Restrictions': wo, 'With Restrictions': wr, Total: total, Comparative: comp });
      });
      var changeWithout = revWithout - expWithout + xferWithout;
      var changeWith = revWith - expWith + xferWith;
      var totalChange = changeWithout + changeWith;
      var totalRev = revWithout + revWith;
      var deficitPct = totalRev ? (totalChange / totalRev) * 100 : 0;
      var releasesNet = xferWithout + xferWith;
      return buildResult(
        [{ label: 'Total revenue', value: formatMoney(totalRev), tone: 'neutral', help: 'All revenue across both columns.' }, { label: 'Total expenses', value: formatMoney(expWithout + expWith), tone: 'neutral', help: 'All expenses across both columns.' }, { label: 'Change in net assets', value: formatMoney(totalChange), tone: totalChange < 0 ? 'warning' : 'positive', help: 'Revenue less expenses plus transfers.' }, { label: 'Deficit as % of revenue', value: formatPercent(deficitPct), tone: deficitPct < -5 ? 'warning' : 'positive', help: 'Negative means deficit.' }],
        [
          { title: 'Without restrictions', value: formatMoney(changeWithout), tone: changeWithout < 0 ? 'warning' : 'positive', text: 'Change in unrestricted net assets.' },
          { title: 'With restrictions', value: formatMoney(changeWith), tone: 'neutral', text: 'Change in donor-restricted net assets.' },
          { title: 'Releases/transfers net', value: formatMoney(releasesNet), tone: Math.abs(releasesNet) > 0.01 ? 'warning' : 'positive', text: Math.abs(releasesNet) > 0.01 ? 'Releases do not net to zero across columns.' : 'Releases balance across columns.' },
          { title: 'Comparative year', value: comparativeYear, tone: 'neutral', text: orgName + ' | ' + periodLabel }
        ],
        [{ title: 'Check release netting', text: 'Net assets released from restriction should appear as positive in one column and negative in the other.' }, { title: 'Compare to prior year', text: 'Use the comparative column to identify significant year-over-year changes.' }, { title: 'Board-ready format', text: 'Export this as the basis for the Statement of Activities in your annual report.' }],
        [{ label: 'Revenue (without)', value: formatMoney(revWithout) }, { label: 'Revenue (with)', value: formatMoney(revWith) }, { label: 'Expenses (without)', value: formatMoney(expWithout) }, { label: 'Expenses (with)', value: formatMoney(expWith) }, { label: 'Change (without)', value: formatMoney(changeWithout) }, { label: 'Change (with)', value: formatMoney(changeWith) }, { label: 'Comparative year', value: comparativeYear }, { label: 'Total change', value: formatMoney(totalChange) }],
        { columns: [{ key: 'line', label: 'Line' }, { key: 'type', label: 'Type' }, { key: 'without', label: 'Without Restrictions' }, { key: 'with', label: 'With Restrictions' }, { key: 'total', label: 'Total' }, { key: 'comparative', label: comparativeYear }], rows: tblRows },
        exp, orgName + ' — ' + periodLabel + ': change in net assets ' + formatMoney(totalChange) + '.'
      );
    },

    'nonprofit-cash-flow-projector': function (values, rows) {
      var startCash = values.startingCash || 0;
      var monthlyOpEx = values.monthlyOpEx || 0;
      var monthlyRev = values.monthlyUnrestrictedRev || 0;
      var galaAmt = values.annualGala || 0;
      var galaMo = Math.max(1, Math.min(12, Math.round(values.galaMonth || 0)));
      var floor = values.targetCashFloor || 0;
      var loc = values.lineOfCredit || 0;
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var tblRows = [], exp = [];
      var cash = startCash, lowest = startCash, lowestMonth = 'Start', belowFloor = 0, negativeCount = 0;
      for (var m = 0; m < 12; m++) {
        var grantDraws = 0;
        if (rows && rows.length) {
          rows.forEach(function (r) {
            grantDraws += (r['m' + (m + 1)] || 0);
          });
        }
        var gala = (m + 1 === galaMo) ? galaAmt : 0;
        var inflows = monthlyRev + grantDraws + gala;
        var outflows = monthlyOpEx;
        var net = inflows - outflows;
        cash += net;
        if (cash < lowest) { lowest = cash; lowestMonth = months[m]; }
        if (cash < floor) belowFloor++;
        if (cash < 0) negativeCount++;
        tblRows.push({ month: months[m], inflows: formatMoney(inflows), outflows: formatMoney(outflows), net: formatMoney(net), ending: formatMoney(cash) });
        exp.push({ Month: months[m], Inflows: inflows, Outflows: outflows, Net: net, 'Ending Cash': cash });
      }
      var endingCash = cash;
      var coverageMonths = monthlyOpEx > 0 ? endingCash / monthlyOpEx : 99;
      return buildResult(
        [{ label: 'Starting cash', value: formatMoney(startCash), tone: 'neutral', help: 'Cash at beginning of projection.' }, { label: 'Ending cash', value: formatMoney(endingCash), tone: endingCash < 0 ? 'warning' : 'positive', help: 'Projected cash after 12 months.' }, { label: 'Lowest balance', value: formatMoney(lowest), tone: lowest < floor ? 'warning' : 'positive', help: 'Minimum cash during the year (' + lowestMonth + ').' }, { label: 'Months below floor', value: formatNumber(belowFloor), tone: belowFloor > 0 ? 'warning' : 'positive', help: 'Months below target minimum.' }],
        [
          { title: 'Lowest month', value: lowestMonth, tone: lowest < 0 ? 'warning' : 'neutral', text: 'Cash bottoms at ' + formatMoney(lowest) + '.' },
          { title: 'Coverage at end', value: coverageMonths.toFixed(1) + ' months', tone: coverageMonths < 3 ? 'warning' : 'positive', text: 'Ending cash / monthly OpEx.' },
          { title: 'Negative months', value: formatNumber(negativeCount), tone: negativeCount > 0 ? 'warning' : 'positive', text: negativeCount > 0 ? 'Cash goes negative — line of credit may be needed.' : 'Cash stays positive all year.' },
          { title: 'Line of credit', value: loc > 0 ? formatMoney(loc) : 'None', tone: negativeCount > 0 && loc === 0 ? 'warning' : 'neutral', text: loc > 0 ? 'Available as backstop.' : 'No credit line entered.' }
        ],
        [{ title: 'Plan for low months', text: 'If cash dips below the floor, consider accelerating grant draws or deferring non-essential spending.' }, { title: 'Gala timing matters', text: 'A gala in a low-cash month can prevent a shortfall.' }, { title: 'Update monthly', text: 'Re-run this projection monthly with actual results to keep the forecast current.' }],
        [{ label: 'Starting cash', value: formatMoney(startCash) }, { label: 'Ending cash', value: formatMoney(endingCash) }, { label: 'Lowest', value: formatMoney(lowest) + ' (' + lowestMonth + ')' }, { label: 'Below floor', value: belowFloor + ' months' }, { label: 'Coverage', value: coverageMonths.toFixed(1) + ' months' }],
        { columns: [{ key: 'month', label: 'Month' }, { key: 'inflows', label: 'Inflows' }, { key: 'outflows', label: 'Outflows' }, { key: 'net', label: 'Net' }, { key: 'ending', label: 'Ending Cash' }], rows: tblRows },
        exp, '12-month projection: ending ' + formatMoney(endingCash) + ', low ' + formatMoney(lowest) + ' in ' + lowestMonth + '.'
      );
    },

    'indirect-cost-rate-calculator': function (values) {
      var rateType = values.rateType || 'provisional';
      var baseType = values.baseType || 'mtdc';
      var totalDirect = values.totalDirectCosts || 0;
      var mtdcExclusions = values.mtdcExclusions || 0;
      var directSalaries = values.directSalaries || 0;
      var totalIndirect = values.totalIndirectCosts || 0;
      var unallowable = values.unallowableCosts || 0;
      var proposedDirect = values.proposedGrantDirectCosts || 0;
      var proposedExcl = values.proposedGrantMtdcExclusions || 0;
      var allowablePool = totalIndirect - unallowable;
      var base;
      if (baseType === 'salaries') { base = directSalaries; }
      else if (baseType === 'tdc') { base = totalDirect; }
      else { base = totalDirect - mtdcExclusions; }
      var rate = base > 0 ? (allowablePool / base) * 100 : 0;
      var proposedBase = baseType === 'mtdc' ? proposedDirect - proposedExcl : (baseType === 'salaries' ? proposedDirect * (directSalaries / Math.max(totalDirect, 1)) : proposedDirect);
      var grantIndirect = proposedBase * (rate / 100);
      var belowDeMinimis = rate < 10;
      var unallowablePct = totalIndirect ? (unallowable / totalIndirect) * 100 : 0;
      var exp = [{ Item: 'Total indirect', Amount: totalIndirect }, { Item: 'Unallowable', Amount: unallowable }, { Item: 'Allowable pool', Amount: allowablePool }, { Item: 'Base (' + baseType.toUpperCase() + ')', Amount: base }, { Item: 'Indirect rate', Amount: rate.toFixed(2) + '%' }, { Item: 'Grant direct', Amount: proposedDirect }, { Item: 'Grant indirect', Amount: grantIndirect }];
      return buildResult(
        [{ label: 'Indirect cost rate', value: formatPercent(rate), tone: belowDeMinimis ? 'warning' : 'positive', help: 'Allowable pool / allocation base.' }, { label: 'Allowable pool', value: formatMoney(allowablePool), tone: 'neutral', help: 'Indirect costs less unallowable.' }, { label: 'Allocation base', value: formatMoney(base), tone: 'neutral', help: baseType.toUpperCase() + ' base.' }, { label: 'Grant indirect $', value: formatMoney(grantIndirect), tone: 'neutral', help: 'Indirect recovery on proposed grant.' }],
        [
          { title: 'Rate type', value: rateType.charAt(0).toUpperCase() + rateType.slice(1), tone: 'neutral', text: 'Classification of the negotiated rate.' },
          { title: 'Base type', value: baseType.toUpperCase(), tone: 'neutral', text: 'Denominator used for rate calculation.' },
          { title: 'De minimis check', value: belowDeMinimis ? 'Below 10%' : 'Above 10%', tone: belowDeMinimis ? 'warning' : 'positive', text: belowDeMinimis ? 'Rate below the 10% de minimis — eligible orgs can elect 10% instead.' : 'Rate exceeds de minimis threshold.' },
          { title: 'Unallowable share', value: formatPercent(unallowablePct), tone: unallowablePct > 10 ? 'warning' : 'positive', text: unallowablePct > 10 ? 'Unallowable costs exceed 10% of indirect pool.' : 'Unallowable costs are a small share.' }
        ],
        [{ title: 'Negotiate with cognizant agency', text: 'Submit cost allocation plan and indirect rate proposal to your cognizant federal agency.' }, { title: 'Consider de minimis election', text: 'Organizations that have never had a negotiated rate can elect the 10% de minimis MTDC rate.' }, { title: 'Apply consistently', text: 'Use the same rate for all federal awards in the fiscal year.' }],
        [{ label: 'Rate type', value: rateType }, { label: 'Base type', value: baseType.toUpperCase() }, { label: 'Total indirect', value: formatMoney(totalIndirect) }, { label: 'Unallowable', value: formatMoney(unallowable) }, { label: 'Allowable pool', value: formatMoney(allowablePool) }, { label: 'Base', value: formatMoney(base) }, { label: 'Indirect rate', value: formatPercent(rate) }, { label: 'Grant direct', value: formatMoney(proposedDirect) }, { label: 'Grant indirect', value: formatMoney(grantIndirect) }],
        null, exp, 'Indirect rate: ' + formatPercent(rate) + ' on ' + baseType.toUpperCase() + ' base. Grant recovery: ' + formatMoney(grantIndirect) + '.'
      );
    },

    /* ── Payroll & HR Finance (141-150) ──────────────────────────── */

    'total-employee-cost-calculator': function (values) {
      var baseSalary = values.baseSalary;
      var payFrequency = values.payFrequency || 'annual';
      var annualSalary = payFrequency === 'hourly' ? baseSalary * (values.hoursPerWeek || 40) * 52 : (payFrequency === 'monthly' ? baseSalary * 12 : (payFrequency === 'biweekly' ? baseSalary * 26 : baseSalary));
      var ficaPct = values.ficaPct || 7.65;
      var futaPct = values.futaPct || 0.6;
      var sutaPct = values.sutaPct || 2.7;
      var healthIns = values.healthInsurance || 0;
      var dental = values.dentalVision || 0;
      var retirement = values.retirementMatch || 0;
      var retirementPct = values.retirementMatchPct || 0;
      var workerComp = values.workersComp || 0;
      var otherBenefits = values.otherBenefits || 0;
      if (!(annualSalary > 0)) throw new Error('Enter a positive base salary.');
      var ficaCost = annualSalary * ficaPct / 100;
      var futaCost = Math.min(annualSalary, 7000) * futaPct / 100;
      var sutaCost = Math.min(annualSalary, 7000) * sutaPct / 100;
      var retirementCost = retirementPct > 0 ? annualSalary * retirementPct / 100 : retirement;
      var totalTaxes = ficaCost + futaCost + sutaCost;
      var totalBenefits = healthIns + dental + retirementCost + workerComp + otherBenefits;
      var totalCost = annualSalary + totalTaxes + totalBenefits;
      var burdenRate = annualSalary ? (totalCost - annualSalary) / annualSalary * 100 : 0;
      var monthlyCost = totalCost / 12;
      var hourlyFullyCost = totalCost / 2080;
      return buildResult(
        [
          { label: 'Annual salary', value: formatMoney(annualSalary), tone: 'neutral', help: 'Base compensation annualized.' },
          { label: 'Total employer cost', value: formatMoney(totalCost), tone: 'neutral', help: 'Salary plus all employer-paid taxes and benefits.' },
          { label: 'Burden rate', value: formatPercent(burdenRate, 1), tone: burdenRate > 40 ? 'warning' : 'neutral', help: 'Additional cost above salary as a percentage.' },
          { label: 'Fully-loaded hourly', value: formatMoney(hourlyFullyCost), tone: 'neutral', help: 'Total cost divided by 2,080 annual hours.' }
        ],
        [
          { title: 'Monthly cost', value: formatMoney(monthlyCost), tone: 'neutral', text: 'Total cost spread over 12 months.' },
          { title: 'Payroll taxes', value: formatMoney(totalTaxes), tone: 'neutral', text: 'FICA + FUTA + SUTA employer share.' },
          { title: 'Benefits cost', value: formatMoney(totalBenefits), tone: 'neutral', text: 'Health, dental, retirement, workers comp, and other benefits.' },
          { title: 'Cost above salary', value: formatMoney(totalCost - annualSalary), tone: 'neutral', text: 'Total employer burden on top of base salary.' }
        ],
        [
          { title: 'True cost is always higher than salary', text: 'Employer payroll taxes and benefits typically add 25-40% on top of base salary.' },
          { title: 'FICA has a wage base cap for Social Security', text: 'The 6.2% Social Security portion caps at the wage base ($168,600 in 2024), but Medicare has no cap.' },
          { title: 'FUTA and SUTA apply to the first $7,000', text: 'Federal and state unemployment taxes apply only to the first $7,000 of wages per employee (varies by state for SUTA).' },
          { title: 'Use the fully-loaded rate for job costing', text: 'When pricing projects or allocating labor, use the fully-loaded hourly rate, not the base wage.' }
        ],
        [
          { label: 'Annual salary', value: formatMoney(annualSalary) },
          { label: 'FICA', value: formatMoney(ficaCost) },
          { label: 'FUTA', value: formatMoney(futaCost) },
          { label: 'SUTA', value: formatMoney(sutaCost) },
          { label: 'Health insurance', value: formatMoney(healthIns) },
          { label: 'Retirement', value: formatMoney(retirementCost) },
          { label: 'Total cost', value: formatMoney(totalCost) }
        ],
        null,
        [{ 'Salary': annualSalary, 'FICA': ficaCost, 'FUTA': futaCost, 'SUTA': sutaCost, 'Health': healthIns, 'Dental/Vision': dental, 'Retirement': retirementCost, 'Workers Comp': workerComp, 'Other': otherBenefits, 'Total': totalCost, 'Burden %': burdenRate.toFixed(1) + '%' }],
        'Total employee cost: ' + formatMoney(totalCost) + ' (' + formatPercent(burdenRate, 1) + ' burden rate).'
      );
    },
    'employer-benefits-cost-analyzer': function (values, rows) {
      var items = rows.filter(function (r) { return r.benefitName && Number.isFinite(r.employerCost); });
      if (!items.length) throw new Error('Add at least one benefit with an employer cost.');
      var headcount = values.headcount || 1;
      var totalPayroll = values.totalPayroll || 0;
      var rowsOut = items.map(function (r) {
        var cost = r.employerCost;
        var perEmployee = headcount > 0 ? cost / headcount : cost;
        var participation = r.participationPct || 100;
        return { benefitName: r.benefitName, employerCost: cost, participationPct: participation, perEmployee: perEmployee, monthlyPerEmp: perEmployee / 12 };
      }).sort(function (a, b) { return b.employerCost - a.employerCost; });
      var totalBenefitsCost = sum(rowsOut.map(function (r) { return r.employerCost; }));
      var benefitsAsPctPayroll = totalPayroll > 0 ? totalBenefitsCost / totalPayroll * 100 : 0;
      var perEmployeeTotal = headcount > 0 ? totalBenefitsCost / headcount : totalBenefitsCost;
      return buildResult(
        [
          { label: 'Total benefits cost', value: formatMoney(totalBenefitsCost), tone: 'neutral', help: 'Sum of all employer-paid benefit costs.' },
          { label: 'Cost per employee', value: formatMoney(perEmployeeTotal), tone: 'neutral', help: 'Average annual benefit cost per employee.' },
          { label: 'Benefits as % of payroll', value: formatPercent(benefitsAsPctPayroll, 1), tone: benefitsAsPctPayroll > 35 ? 'warning' : 'neutral', help: 'Total benefits divided by total payroll.' },
          { label: 'Benefits tracked', value: formatNumber(rowsOut.length), tone: 'neutral', help: 'Number of benefit programs analyzed.' }
        ],
        [
          { title: 'Largest benefit', value: rowsOut[0].benefitName, tone: 'neutral', text: formatMoney(rowsOut[0].employerCost) + ' annual employer cost.' },
          { title: 'Monthly per employee', value: formatMoney(perEmployeeTotal / 12), tone: 'neutral', text: 'Average monthly benefit cost per employee.' },
          { title: 'Headcount', value: formatNumber(headcount), tone: 'neutral', text: 'Total eligible employees for cost averaging.' },
          { title: 'Benefit-to-payroll ratio', value: formatPercent(benefitsAsPctPayroll, 1), tone: benefitsAsPctPayroll > 35 ? 'warning' : 'positive', text: benefitsAsPctPayroll > 35 ? 'Above typical range — review plan design.' : 'Within typical range for employer benefits.' }
        ],
        [
          { title: 'Health insurance is usually the largest cost', text: 'Employer-sponsored health coverage typically represents 60-70% of total benefit costs.' },
          { title: 'Participation rates affect true cost', text: 'Low participation may indicate plan design issues or that employees are covered elsewhere.' },
          { title: 'Benchmark against industry', text: 'BLS publishes employer cost data by industry — use it to evaluate competitiveness.' },
          { title: 'Consider total rewards perspective', text: 'Benefits are part of total compensation — communicate their value to employees.' }
        ],
        [
          { label: 'Total benefits', value: formatMoney(totalBenefitsCost) },
          { label: 'Headcount', value: formatNumber(headcount) },
          { label: 'Per employee', value: formatMoney(perEmployeeTotal) },
          { label: 'Total payroll', value: formatMoney(totalPayroll) },
          { label: 'Benefits/payroll', value: formatPercent(benefitsAsPctPayroll, 1) }
        ],
        { columns: [{ key: 'benefitName', label: 'Benefit', type: 'text' }, { key: 'employerCost', label: 'Employer cost', type: 'money', align: 'right' }, { key: 'participationPct', label: 'Participation', type: 'percent', align: 'right' }, { key: 'perEmployee', label: 'Per employee', type: 'money', align: 'right' }, { key: 'monthlyPerEmp', label: 'Monthly/emp', type: 'money', align: 'right' }], rows: rowsOut },
        rowsOut, 'Employer benefits cost analysis complete.'
      );
    },
    'fully-loaded-labor-rate-calculator': function (values) {
      var baseRate = values.baseHourlyRate;
      var annualHours = values.annualBillableHours || 2080;
      var ficaPct = values.ficaPct || 7.65;
      var futaSutaPct = values.futaSutaPct || 3.3;
      var healthPerHour = values.healthInsPerHour || 0;
      var retirementPct = values.retirementMatchPct || 0;
      var workerCompPct = values.workersCompPct || 0;
      var ptoHours = values.ptoHours || 0;
      var overheadPerHour = values.overheadPerHour || 0;
      if (!(baseRate > 0)) throw new Error('Enter a positive base hourly rate.');
      var productiveHours = Math.max(annualHours - ptoHours, 1);
      var effectiveBase = baseRate * annualHours / productiveHours;
      var ficaCost = effectiveBase * ficaPct / 100;
      var futaSutaCost = effectiveBase * futaSutaPct / 100;
      var retirementCost = effectiveBase * retirementPct / 100;
      var workerCompCost = effectiveBase * workerCompPct / 100;
      var totalTaxBenefit = ficaCost + futaSutaCost + healthPerHour + retirementCost + workerCompCost;
      var fullyLoaded = effectiveBase + totalTaxBenefit + overheadPerHour;
      var burden = fullyLoaded - baseRate;
      var burdenPct = baseRate ? burden / baseRate * 100 : 0;
      var annualCost = fullyLoaded * productiveHours;
      return buildResult(
        [
          { label: 'Base hourly rate', value: formatMoney(baseRate), tone: 'neutral', help: 'Wage before any employer costs.' },
          { label: 'Fully-loaded rate', value: formatMoney(fullyLoaded), tone: 'positive', help: 'Total cost per productive hour.' },
          { label: 'Burden per hour', value: formatMoney(burden), tone: 'neutral', help: 'Additional cost above the base rate.' },
          { label: 'Burden percentage', value: formatPercent(burdenPct, 1), tone: burdenPct > 50 ? 'warning' : 'neutral', help: 'Burden as a percentage of the base rate.' }
        ],
        [
          { title: 'Effective base rate', value: formatMoney(effectiveBase), tone: 'neutral', text: 'Base rate adjusted for PTO hours (' + formatNumber(ptoHours) + ' hrs PTO).' },
          { title: 'Productive hours', value: formatNumber(productiveHours), tone: 'neutral', text: 'Annual hours minus PTO hours.' },
          { title: 'Annual fully-loaded cost', value: formatMoney(annualCost), tone: 'neutral', text: 'Fully-loaded rate times productive hours.' },
          { title: 'Tax & benefit load', value: formatMoney(totalTaxBenefit), tone: 'neutral', text: 'Per-hour cost of employer taxes and benefits.' }
        ],
        [
          { title: 'PTO raises the effective rate', text: 'Paid time off reduces productive hours, which increases the effective cost per billable hour.' },
          { title: 'Use this rate for project pricing', text: 'The fully-loaded rate captures the true cost of labor for estimating, billing, and job costing.' },
          { title: 'Overhead adds another layer', text: 'If you include facility, equipment, or administrative costs per hour, the fully-loaded rate rises further.' },
          { title: 'Compare to bill rate for margin analysis', text: 'The spread between the fully-loaded rate and the bill rate is the gross margin per hour.' }
        ],
        [
          { label: 'Base rate', value: formatMoney(baseRate) },
          { label: 'Effective base', value: formatMoney(effectiveBase) },
          { label: 'FICA', value: formatMoney(ficaCost) + '/hr' },
          { label: 'FUTA/SUTA', value: formatMoney(futaSutaCost) + '/hr' },
          { label: 'Health', value: formatMoney(healthPerHour) + '/hr' },
          { label: 'Retirement', value: formatMoney(retirementCost) + '/hr' },
          { label: 'Overhead', value: formatMoney(overheadPerHour) + '/hr' },
          { label: 'Fully loaded', value: formatMoney(fullyLoaded) }
        ],
        null,
        [{ 'Base': baseRate, 'Effective base': effectiveBase.toFixed(2), 'FICA/hr': ficaCost.toFixed(2), 'Health/hr': healthPerHour, 'Retirement/hr': retirementCost.toFixed(2), 'Overhead/hr': overheadPerHour, 'Fully loaded': fullyLoaded.toFixed(2), 'Annual cost': annualCost.toFixed(0), 'Burden %': burdenPct.toFixed(1) + '%' }],
        'Fully-loaded labor rate: ' + formatMoney(fullyLoaded) + '/hr (' + formatPercent(burdenPct, 1) + ' burden).'
      );
    },
    'pto-accrual-liability-calculator': function (values, rows) {
      var items = rows.filter(function (r) { return r.employeeName && Number.isFinite(r.hourlyRate); });
      if (!items.length) throw new Error('Add at least one employee with an hourly rate and PTO balance.');
      var rowsOut = items.map(function (r) {
        var rate = r.hourlyRate;
        var accruedHours = r.accruedHours || 0;
        var usedHours = r.usedHours || 0;
        var maxCarryover = r.maxCarryover || 9999;
        var balance = Math.min(accruedHours - usedHours, maxCarryover);
        var liability = balance * rate;
        return { employeeName: r.employeeName, hourlyRate: rate, accruedHours: accruedHours, usedHours: usedHours, balance: balance, liability: liability };
      }).sort(function (a, b) { return b.liability - a.liability; });
      var totalLiability = sum(rowsOut.map(function (r) { return r.liability; }));
      var totalBalance = sum(rowsOut.map(function (r) { return r.balance; }));
      var avgRate = items.length ? sum(rowsOut.map(function (r) { return r.hourlyRate; })) / items.length : 0;
      var highBalance = rowsOut.filter(function (r) { return r.balance > 80; }).length;
      return buildResult(
        [
          { label: 'Total PTO liability', value: formatMoney(totalLiability), tone: totalLiability > 0 ? 'warning' : 'positive', help: 'Total accrued PTO liability across all employees.' },
          { label: 'Total hours balance', value: formatNumber(totalBalance), tone: 'neutral', help: 'Sum of PTO hours balances.' },
          { label: 'Employees tracked', value: formatNumber(rowsOut.length), tone: 'neutral', help: 'Number of employees analyzed.' },
          { label: 'High balance employees', value: formatNumber(highBalance), tone: highBalance > 0 ? 'warning' : 'positive', help: 'Employees with more than 80 hours accrued.' }
        ],
        [
          { title: 'Largest liability', value: rowsOut[0].employeeName, tone: 'neutral', text: formatMoney(rowsOut[0].liability) + ' (' + formatNumber(rowsOut[0].balance) + ' hrs).' },
          { title: 'Average hourly rate', value: formatMoney(avgRate), tone: 'neutral', text: 'Average rate used to value PTO hours.' },
          { title: 'Average balance', value: formatNumber(Math.round(totalBalance / rowsOut.length)) + ' hrs', tone: 'neutral', text: 'Average PTO hours per employee.' },
          { title: 'Liability trend', value: totalLiability > 50000 ? 'Review needed' : 'Manageable', tone: totalLiability > 50000 ? 'warning' : 'positive', text: 'Large PTO liabilities affect cash flow at termination or year-end.' }
        ],
        [
          { title: 'PTO is a compensated absence liability', text: 'Under ASC 710-10, vested or accumulated PTO must be accrued as a liability on the balance sheet.' },
          { title: 'Use current pay rates for valuation', text: 'PTO liability should be valued at the current hourly rate, not the rate when hours were earned.' },
          { title: 'Carryover caps limit liability growth', text: 'Use-it-or-lose-it policies and carryover caps reduce the accrued liability but may not be legal in all states.' },
          { title: 'Monitor high-balance employees', text: 'Employees with large PTO balances create concentration risk — encourage usage before year-end.' }
        ],
        [
          { label: 'Total liability', value: formatMoney(totalLiability) },
          { label: 'Total hours', value: formatNumber(totalBalance) },
          { label: 'Employees', value: formatNumber(rowsOut.length) },
          { label: 'High balance', value: formatNumber(highBalance) },
          { label: 'Avg rate', value: formatMoney(avgRate) }
        ],
        { columns: [{ key: 'employeeName', label: 'Employee', type: 'text' }, { key: 'hourlyRate', label: 'Rate', type: 'money', align: 'right' }, { key: 'accruedHours', label: 'Accrued', type: 'number', align: 'right' }, { key: 'usedHours', label: 'Used', type: 'number', align: 'right' }, { key: 'balance', label: 'Balance', type: 'number', align: 'right' }, { key: 'liability', label: 'Liability', type: 'money', align: 'right' }], rows: rowsOut },
        rowsOut, 'PTO accrual liability: ' + formatMoney(totalLiability) + '.'
      );
    },
    'flsa-overtime-pay-calculator': function (values) {
      var regularRate = values.regularRate;
      var regularHours = values.regularHours || 40;
      var overtimeHours = values.overtimeHours || 0;
      var overtimeMultiplier = values.overtimeMultiplier || 1.5;
      var shiftDifferential = values.shiftDifferential || 0;
      var bonus = values.weeklyBonus || 0;
      if (!(regularRate > 0)) throw new Error('Enter a positive regular hourly rate.');
      var totalHours = regularHours + overtimeHours;
      var regularPay = regularRate * regularHours;
      var shiftPay = shiftDifferential * totalHours;
      var totalStraightPay = regularPay + shiftPay + bonus;
      var effectiveRate = totalHours > 0 ? totalStraightPay / totalHours : regularRate;
      var otRate = effectiveRate * overtimeMultiplier;
      var otPremium = effectiveRate * (overtimeMultiplier - 1) * overtimeHours;
      var totalPay = totalStraightPay + otPremium;
      var otCostPct = totalPay > 0 ? otPremium / totalPay * 100 : 0;
      return buildResult(
        [
          { label: 'Regular rate of pay', value: formatMoney(effectiveRate), tone: 'neutral', help: 'FLSA regular rate including shift diff and non-discretionary bonus.' },
          { label: 'OT rate', value: formatMoney(otRate), tone: 'neutral', help: 'Overtime rate (regular rate x multiplier).' },
          { label: 'OT premium', value: formatMoney(otPremium), tone: overtimeHours > 0 ? 'warning' : 'neutral', help: 'Additional cost above straight time for overtime hours.' },
          { label: 'Total gross pay', value: formatMoney(totalPay), tone: 'neutral', help: 'Total weekly gross pay including overtime premium.' }
        ],
        [
          { title: 'Regular pay', value: formatMoney(regularPay), tone: 'neutral', text: formatNumber(regularHours) + ' hours at ' + formatMoney(regularRate) + '/hr.' },
          { title: 'Overtime hours', value: formatNumber(overtimeHours), tone: overtimeHours > 10 ? 'warning' : 'neutral', text: overtimeHours > 0 ? 'OT premium: ' + formatMoney(otPremium) : 'No overtime this period.' },
          { title: 'OT cost share', value: formatPercent(otCostPct, 1), tone: otCostPct > 15 ? 'warning' : 'neutral', text: 'Overtime premium as a percentage of total pay.' },
          { title: 'Effective rate includes extras', value: formatMoney(effectiveRate), tone: effectiveRate > regularRate ? 'warning' : 'neutral', text: effectiveRate > regularRate ? 'Shift differential and/or bonus raise the regular rate.' : 'No additional components affecting the rate.' }
        ],
        [
          { title: 'FLSA requires the regular rate, not just the base rate', text: 'Non-discretionary bonuses, shift differentials, and commissions must be included in the regular rate for OT calculation.' },
          { title: 'Standard OT is 1.5x the regular rate', text: 'Federal FLSA requires time-and-a-half for hours over 40 in a workweek. Some states have daily OT rules.' },
          { title: 'Misclassifying the regular rate is a common violation', text: 'Excluding non-discretionary components from the regular rate leads to underpayment and potential DOL liability.' },
          { title: 'Track OT cost as a percentage of labor', text: 'Consistently high OT may indicate understaffing — compare OT cost to hiring an additional employee.' }
        ],
        [
          { label: 'Base rate', value: formatMoney(regularRate) },
          { label: 'Regular rate (FLSA)', value: formatMoney(effectiveRate) },
          { label: 'OT rate', value: formatMoney(otRate) },
          { label: 'Regular hours', value: formatNumber(regularHours) },
          { label: 'OT hours', value: formatNumber(overtimeHours) },
          { label: 'OT premium', value: formatMoney(otPremium) },
          { label: 'Total pay', value: formatMoney(totalPay) }
        ],
        null,
        [{ 'Base rate': regularRate, 'Regular rate': effectiveRate.toFixed(2), 'OT rate': otRate.toFixed(2), 'Reg hrs': regularHours, 'OT hrs': overtimeHours, 'Regular pay': regularPay, 'OT premium': otPremium.toFixed(2), 'Total pay': totalPay.toFixed(2) }],
        'FLSA overtime calculation complete. Total pay: ' + formatMoney(totalPay) + '.'
      );
    },
    'contractor-vs-employee-cost': function (values) {
      var annualComp = values.annualCompensation;
      var contractorRate = values.contractorHourlyRate || 0;
      var contractorHours = values.contractorHoursPerYear || 2080;
      var ficaPct = values.ficaPct || 7.65;
      var futaSutaPct = values.futaSutaPct || 3.3;
      var healthIns = values.healthInsurance || 0;
      var retirementPct = values.retirementMatchPct || 0;
      var workerComp = values.workersComp || 0;
      var ptoWeeks = values.ptoWeeks || 0;
      var otherBenefits = values.otherBenefits || 0;
      if (!(annualComp > 0) && !(contractorRate > 0)) throw new Error('Enter employee salary or contractor rate.');
      var empSalary = annualComp || 0;
      var empFica = empSalary * ficaPct / 100;
      var empFutaSuta = Math.min(empSalary, 7000) * futaSutaPct / 100;
      var empRetirement = empSalary * retirementPct / 100;
      var ptoCost = ptoWeeks > 0 ? empSalary / 52 * ptoWeeks : 0;
      var empTotalBenefits = empFica + empFutaSuta + healthIns + empRetirement + workerComp + ptoCost + otherBenefits;
      var empTotalCost = empSalary + empTotalBenefits;
      var contractorTotal = contractorRate * contractorHours;
      var diff = contractorTotal - empTotalCost;
      var diffPct = empTotalCost > 0 ? diff / empTotalCost * 100 : 0;
      var empHourly = empTotalCost / 2080;
      var breakEvenRate = contractorHours > 0 ? empTotalCost / contractorHours : 0;
      return buildResult(
        [
          { label: 'Employee total cost', value: formatMoney(empTotalCost), tone: 'neutral', help: 'Salary plus all employer taxes and benefits.' },
          { label: 'Contractor total cost', value: formatMoney(contractorTotal), tone: 'neutral', help: 'Contractor rate times annual hours.' },
          { label: 'Difference', value: formatMoney(diff), tone: diff > 0 ? 'warning' : 'positive', help: 'Contractor cost minus employee cost. Positive means contractor is more expensive.' },
          { label: 'Break-even rate', value: formatMoney(breakEvenRate) + '/hr', tone: 'neutral', help: 'Contractor rate at which costs are equal.' }
        ],
        [
          { title: 'Employee hourly (fully loaded)', value: formatMoney(empHourly), tone: 'neutral', text: 'Employee total cost divided by 2,080 hours.' },
          { title: 'Contractor rate', value: formatMoney(contractorRate) + '/hr', tone: 'neutral', text: contractorHours + ' hours per year.' },
          { title: 'Cost comparison', value: diff > 0 ? 'Employee cheaper' : 'Contractor cheaper', tone: diff > 0 ? 'positive' : 'warning', text: formatMoney(Math.abs(diff)) + ' annual difference (' + formatPercent(Math.abs(diffPct), 1) + ').' },
          { title: 'Benefits burden', value: formatMoney(empTotalBenefits), tone: 'neutral', text: formatPercent(empSalary > 0 ? empTotalBenefits / empSalary * 100 : 0, 1) + ' of base salary.' }
        ],
        [
          { title: 'Cost is only one factor', text: 'Control, training requirements, and IRS classification rules determine whether a worker should be W-2 or 1099.' },
          { title: 'Contractors have no benefits cost but higher rates', text: 'Contractors set rates to cover their own taxes, insurance, and benefits — their rate is typically higher than employee wages.' },
          { title: 'Misclassification carries penalties', text: 'IRS, DOL, and state agencies impose penalties for misclassifying employees as contractors.' },
          { title: 'Consider the duration of the engagement', text: 'Short-term projects favor contractors; long-term roles often favor employees on a cost basis.' }
        ],
        [
          { label: 'Employee salary', value: formatMoney(empSalary) },
          { label: 'Employee FICA', value: formatMoney(empFica) },
          { label: 'Health insurance', value: formatMoney(healthIns) },
          { label: 'PTO cost', value: formatMoney(ptoCost) },
          { label: 'Employee total', value: formatMoney(empTotalCost) },
          { label: 'Contractor total', value: formatMoney(contractorTotal) },
          { label: 'Difference', value: formatMoney(diff) }
        ],
        null,
        [{ 'Employee salary': empSalary, 'Emp benefits': empTotalBenefits, 'Emp total': empTotalCost, 'Contractor rate': contractorRate, 'Contractor hrs': contractorHours, 'Contractor total': contractorTotal, 'Difference': diff, 'Break-even rate': breakEvenRate.toFixed(2) }],
        'Contractor vs employee comparison complete.'
      );
    },
    'wage-garnishment-calculator': function (values) {
      var grossPay = values.grossPay;
      var federalTax = values.federalTax || 0;
      var stateTax = values.stateTax || 0;
      var fica = values.ficaWithholding || 0;
      var healthPremium = values.healthPremium || 0;
      var garnishmentType = values.garnishmentType || 'creditor';
      if (!(grossPay > 0)) throw new Error('Enter a positive gross pay amount.');
      var disposableEarnings = grossPay - federalTax - stateTax - fica - healthPremium;
      var federalMinWeekly = 7.25 * 30;
      var maxGarnishment = 0;
      var rule = '';
      if (garnishmentType === 'child-support') {
        var pct = values.supportPct || 50;
        maxGarnishment = disposableEarnings * pct / 100;
        rule = pct + '% of disposable earnings (child support)';
      } else if (garnishmentType === 'tax-levy') {
        maxGarnishment = Math.max(disposableEarnings - (values.taxLevyExempt || 0), 0);
        rule = 'Disposable less exempt amount (tax levy)';
      } else if (garnishmentType === 'student-loan') {
        maxGarnishment = Math.min(disposableEarnings * 0.15, Math.max(disposableEarnings - federalMinWeekly, 0));
        rule = 'Lesser of 15% or amount above 30x min wage (student loan)';
      } else {
        var limit25 = disposableEarnings * 0.25;
        var limitAboveMin = Math.max(disposableEarnings - federalMinWeekly, 0);
        maxGarnishment = Math.min(limit25, limitAboveMin);
        rule = 'Lesser of 25% or amount above 30x minimum wage (creditor)';
      }
      maxGarnishment = Math.max(maxGarnishment, 0);
      var netAfterGarnishment = disposableEarnings - maxGarnishment;
      var garnishPct = disposableEarnings > 0 ? maxGarnishment / disposableEarnings * 100 : 0;
      return buildResult(
        [
          { label: 'Disposable earnings', value: formatMoney(disposableEarnings), tone: 'neutral', help: 'Gross pay minus mandatory deductions.' },
          { label: 'Max garnishment', value: formatMoney(maxGarnishment), tone: maxGarnishment > 0 ? 'warning' : 'neutral', help: 'Maximum amount that can be garnished this period.' },
          { label: 'Net after garnishment', value: formatMoney(netAfterGarnishment), tone: netAfterGarnishment < federalMinWeekly ? 'critical' : 'neutral', help: 'Disposable earnings minus garnishment.' },
          { label: 'Garnishment rate', value: formatPercent(garnishPct, 1), tone: 'neutral', help: 'Garnishment as a percentage of disposable earnings.' }
        ],
        [
          { title: 'Garnishment type', value: garnishmentType.replace(/-/g, ' '), tone: 'neutral', text: rule },
          { title: 'Gross pay', value: formatMoney(grossPay), tone: 'neutral', text: 'Pay period gross earnings.' },
          { title: 'Mandatory deductions', value: formatMoney(grossPay - disposableEarnings), tone: 'neutral', text: 'Federal tax, state tax, FICA, and health premiums.' },
          { title: '30x minimum wage', value: formatMoney(federalMinWeekly), tone: 'neutral', text: 'Federal floor: $7.25 x 30 = $217.50/week for creditor garnishments.' }
        ],
        [
          { title: 'Disposable earnings exclude voluntary deductions', text: 'Only mandatory deductions (taxes, FICA) reduce disposable earnings — 401(k) and voluntary deductions do not.' },
          { title: 'Child support limits are higher', text: 'Child support can take 50-65% of disposable earnings depending on arrears and other dependents.' },
          { title: 'State laws may provide more protection', text: 'Some states have lower garnishment limits or higher minimum wage floors — check local law.' },
          { title: 'Multiple garnishments have priority rules', text: 'Child support takes priority over creditor garnishments, and combined limits apply.' }
        ],
        [
          { label: 'Gross pay', value: formatMoney(grossPay) },
          { label: 'Disposable earnings', value: formatMoney(disposableEarnings) },
          { label: 'Garnishment type', value: garnishmentType },
          { label: 'Max garnishment', value: formatMoney(maxGarnishment) },
          { label: 'Net after garnishment', value: formatMoney(netAfterGarnishment) }
        ],
        null,
        [{ 'Gross': grossPay, 'Disposable': disposableEarnings, 'Type': garnishmentType, 'Max garnishment': maxGarnishment, 'Net': netAfterGarnishment }],
        'Wage garnishment calculation complete. Max: ' + formatMoney(maxGarnishment) + '.'
      );
    },
    '401k-employer-match-calculator': function (values) {
      var annualSalary = values.annualSalary;
      var empContribPct = values.employeeContribPct || 0;
      var matchFormula = values.matchFormula || 'standard';
      var matchPct = values.matchPct || 100;
      var matchUpTo = values.matchUpToPct || 6;
      var secondTierPct = values.secondTierPct || 50;
      var secondTierUpTo = values.secondTierUpToPct || 0;
      var annualLimit = values.annualMatchCap || 999999;
      if (!(annualSalary > 0)) throw new Error('Enter a positive annual salary.');
      var empContrib = annualSalary * empContribPct / 100;
      var irs402gLimit = 23000;
      var actualEmpContrib = Math.min(empContrib, irs402gLimit);
      var eligibleForMatch = Math.min(actualEmpContrib, annualSalary * matchUpTo / 100);
      var tier1Match = eligibleForMatch * matchPct / 100;
      var tier2Match = 0;
      if (matchFormula === 'tiered' && secondTierUpTo > 0) {
        var secondEligible = Math.max(Math.min(actualEmpContrib, annualSalary * (matchUpTo + secondTierUpTo) / 100) - annualSalary * matchUpTo / 100, 0);
        tier2Match = secondEligible * secondTierPct / 100;
      }
      var totalMatch = Math.min(tier1Match + tier2Match, annualLimit);
      var matchCostPct = annualSalary > 0 ? totalMatch / annualSalary * 100 : 0;
      var totalRetirement = actualEmpContrib + totalMatch;
      var irs415Limit = 69000;
      return buildResult(
        [
          { label: 'Employer match cost', value: formatMoney(totalMatch), tone: 'neutral', help: 'Annual employer matching contribution.' },
          { label: 'Match as % of salary', value: formatPercent(matchCostPct, 2), tone: 'neutral', help: 'Employer match divided by annual salary.' },
          { label: 'Employee contribution', value: formatMoney(actualEmpContrib), tone: 'neutral', help: 'Employee deferral (capped at 402(g) limit).' },
          { label: 'Total retirement', value: formatMoney(totalRetirement), tone: totalRetirement > irs415Limit ? 'warning' : 'positive', help: 'Employee plus employer contributions.' }
        ],
        [
          { title: 'Match formula', value: matchFormula === 'tiered' ? 'Tiered' : 'Standard', tone: 'neutral', text: matchPct + '% of first ' + matchUpTo + '% of salary' + (matchFormula === 'tiered' ? ', then ' + secondTierPct + '% of next ' + secondTierUpTo + '%' : '') + '.' },
          { title: 'Employee deferral rate', value: formatPercent(empContribPct, 1), tone: empContribPct < matchUpTo ? 'warning' : 'positive', text: empContribPct < matchUpTo ? 'Employee is not contributing enough to maximize the match.' : 'Employee is at or above the match threshold.' },
          { title: '402(g) limit', value: formatMoney(irs402gLimit), tone: actualEmpContrib >= irs402gLimit ? 'warning' : 'neutral', text: 'Annual employee deferral limit (' + (actualEmpContrib >= irs402gLimit ? 'at limit' : 'below limit') + ').' },
          { title: 'Annual match cost', value: formatMoney(totalMatch), tone: 'neutral', text: 'Per-employee annual employer cost for 401(k) matching.' }
        ],
        [
          { title: 'Match is an employer cost line item', text: 'Budget the total match as a payroll benefit expense — it varies with participation rates and salary levels.' },
          { title: 'Auto-enrollment increases match costs', text: 'Higher participation through auto-enrollment means more employees receiving the match.' },
          { title: 'Safe harbor match avoids ADP/ACP testing', text: 'A 100% match on 3% plus 50% on next 2% (or 3% non-elective) satisfies safe harbor requirements.' },
          { title: 'Monitor the 415 limit', text: 'Total employer plus employee contributions cannot exceed the IRC 415 annual additions limit.' }
        ],
        [
          { label: 'Annual salary', value: formatMoney(annualSalary) },
          { label: 'Employee contrib', value: formatMoney(actualEmpContrib) },
          { label: 'Tier 1 match', value: formatMoney(tier1Match) },
          { label: 'Tier 2 match', value: formatMoney(tier2Match) },
          { label: 'Total match', value: formatMoney(totalMatch) },
          { label: 'Match % of salary', value: formatPercent(matchCostPct, 2) }
        ],
        null,
        [{ 'Salary': annualSalary, 'Emp %': empContribPct + '%', 'Emp $': actualEmpContrib, 'Tier 1': tier1Match, 'Tier 2': tier2Match, 'Total match': totalMatch, 'Match % salary': matchCostPct.toFixed(2) + '%' }],
        'Employer match cost: ' + formatMoney(totalMatch) + ' (' + formatPercent(matchCostPct, 2) + ' of salary).'
      );
    },
    'workers-comp-premium-estimator': function (values, rows) {
      var items = rows.filter(function (r) { return r.classCode && Number.isFinite(r.annualPayroll); });
      if (!items.length) throw new Error('Add at least one class code with payroll.');
      var experienceMod = values.experienceMod || 1.0;
      var rowsOut = items.map(function (r) {
        var payroll = r.annualPayroll;
        var rate = r.ratePer100 || 1.0;
        var manualPremium = payroll / 100 * rate;
        var modifiedPremium = manualPremium * experienceMod;
        return { classCode: r.classCode, annualPayroll: payroll, ratePer100: rate, manualPremium: manualPremium, modifiedPremium: modifiedPremium };
      }).sort(function (a, b) { return b.modifiedPremium - a.modifiedPremium; });
      var totalPayroll = sum(rowsOut.map(function (r) { return r.annualPayroll; }));
      var totalManual = sum(rowsOut.map(function (r) { return r.manualPremium; }));
      var totalModified = sum(rowsOut.map(function (r) { return r.modifiedPremium; }));
      var blendedRate = totalPayroll > 0 ? totalModified / totalPayroll * 100 : 0;
      return buildResult(
        [
          { label: 'Estimated annual premium', value: formatMoney(totalModified), tone: 'neutral', help: 'Total modified premium after experience mod.' },
          { label: 'Manual premium', value: formatMoney(totalManual), tone: 'neutral', help: 'Premium before experience modification.' },
          { label: 'Experience mod', value: experienceMod.toFixed(2), tone: experienceMod > 1 ? 'warning' : 'positive', help: 'Experience modification factor (1.0 = industry average).' },
          { label: 'Blended rate', value: formatPercent(blendedRate, 2), tone: 'neutral', help: 'Premium as a percentage of total payroll.' }
        ],
        [
          { title: 'Highest premium class', value: rowsOut[0].classCode, tone: 'neutral', text: formatMoney(rowsOut[0].modifiedPremium) + ' annual premium.' },
          { title: 'Total payroll', value: formatMoney(totalPayroll), tone: 'neutral', text: 'Payroll across all class codes.' },
          { title: 'Mod impact', value: formatMoney(totalModified - totalManual), tone: experienceMod > 1 ? 'warning' : 'positive', text: experienceMod > 1 ? 'Mod above 1.0 increases premium by ' + formatMoney(totalModified - totalManual) + '.' : 'Mod at or below 1.0 — no surcharge.' },
          { title: 'Monthly estimate', value: formatMoney(totalModified / 12), tone: 'neutral', text: 'Estimated monthly workers comp premium.' }
        ],
        [
          { title: 'Class codes determine the base rate', text: 'Each employee classification has a different rate per $100 of payroll based on injury risk.' },
          { title: 'Experience mod reflects claim history', text: 'An EMR above 1.0 means worse-than-average loss experience; below 1.0 means better.' },
          { title: 'Premiums are auditable', text: 'Carriers audit actual payroll at policy end — estimated payroll should be close to actual to avoid large adjustments.' },
          { title: 'Misclassification increases cost', text: 'Employees in the wrong class code can lead to premium disputes and audit adjustments.' }
        ],
        [
          { label: 'Total payroll', value: formatMoney(totalPayroll) },
          { label: 'Manual premium', value: formatMoney(totalManual) },
          { label: 'Experience mod', value: experienceMod.toFixed(2) },
          { label: 'Modified premium', value: formatMoney(totalModified) },
          { label: 'Blended rate', value: formatPercent(blendedRate, 2) }
        ],
        { columns: [{ key: 'classCode', label: 'Class code', type: 'text' }, { key: 'annualPayroll', label: 'Payroll', type: 'money', align: 'right' }, { key: 'ratePer100', label: 'Rate/$100', type: 'number', align: 'right' }, { key: 'manualPremium', label: 'Manual prem.', type: 'money', align: 'right' }, { key: 'modifiedPremium', label: 'Modified prem.', type: 'money', align: 'right' }], rows: rowsOut },
        rowsOut, 'Workers comp premium estimate: ' + formatMoney(totalModified) + '.'
      );
    },
    'employee-turnover-cost-calculator': function (values) {
      var annualSalary = values.annualSalary;
      var recruitingCost = values.recruitingCost || 0;
      var onboardingWeeks = values.onboardingWeeks || 4;
      var trainingCost = values.trainingCost || 0;
      var productivityLossWeeks = values.productivityLossWeeks || 8;
      var productivityLossPct = values.productivityLossPct || 50;
      var separationCost = values.separationCost || 0;
      var headcount = values.headcount || 1;
      var annualTurnoverPct = values.annualTurnoverPct || 0;
      if (!(annualSalary > 0)) throw new Error('Enter a positive annual salary.');
      var weeklySalary = annualSalary / 52;
      var onboardingCost = weeklySalary * onboardingWeeks * 0.5;
      var lostProductivity = weeklySalary * productivityLossWeeks * productivityLossPct / 100;
      var totalCostPerTurnover = recruitingCost + onboardingCost + trainingCost + lostProductivity + separationCost;
      var costAsPctSalary = annualSalary > 0 ? totalCostPerTurnover / annualSalary * 100 : 0;
      var expectedTurnovers = headcount * annualTurnoverPct / 100;
      var annualTurnoverCost = totalCostPerTurnover * expectedTurnovers;
      return buildResult(
        [
          { label: 'Cost per turnover', value: formatMoney(totalCostPerTurnover), tone: totalCostPerTurnover > annualSalary * 0.5 ? 'warning' : 'neutral', help: 'Total estimated cost to replace one employee.' },
          { label: 'Cost as % of salary', value: formatPercent(costAsPctSalary, 0), tone: costAsPctSalary > 100 ? 'critical' : (costAsPctSalary > 50 ? 'warning' : 'neutral'), help: 'Replacement cost relative to annual salary.' },
          { label: 'Expected annual turnovers', value: expectedTurnovers.toFixed(1), tone: 'neutral', help: 'Based on headcount and turnover rate.' },
          { label: 'Annual turnover cost', value: formatMoney(annualTurnoverCost), tone: annualTurnoverCost > 0 ? 'warning' : 'neutral', help: 'Projected annual cost of turnover.' }
        ],
        [
          { title: 'Recruiting', value: formatMoney(recruitingCost), tone: 'neutral', text: 'Job posting, recruiter fees, interview time.' },
          { title: 'Onboarding', value: formatMoney(onboardingCost), tone: 'neutral', text: onboardingWeeks + ' weeks of reduced productivity during ramp-up.' },
          { title: 'Training', value: formatMoney(trainingCost), tone: 'neutral', text: 'Formal training, materials, and mentor time.' },
          { title: 'Lost productivity', value: formatMoney(lostProductivity), tone: 'neutral', text: productivityLossWeeks + ' weeks at ' + formatPercent(productivityLossPct, 0) + ' productivity loss.' }
        ],
        [
          { title: 'Total cost is often 50-200% of salary', text: 'SHRM estimates replacement cost at 50-60% for hourly roles and 100-200% for professional/management positions.' },
          { title: 'Hidden costs add up', text: 'Team morale, customer relationships, and institutional knowledge loss are hard to quantify but real.' },
          { title: 'Prevention is cheaper than replacement', text: 'Retention investments (compensation, development, culture) often cost less than the turnover they prevent.' },
          { title: 'Track turnover by department', text: 'High turnover in specific departments signals management or culture issues worth investigating.' }
        ],
        [
          { label: 'Annual salary', value: formatMoney(annualSalary) },
          { label: 'Recruiting cost', value: formatMoney(recruitingCost) },
          { label: 'Onboarding cost', value: formatMoney(onboardingCost) },
          { label: 'Training cost', value: formatMoney(trainingCost) },
          { label: 'Lost productivity', value: formatMoney(lostProductivity) },
          { label: 'Separation cost', value: formatMoney(separationCost) },
          { label: 'Total per turnover', value: formatMoney(totalCostPerTurnover) },
          { label: 'Annual turnover cost', value: formatMoney(annualTurnoverCost) }
        ],
        null,
        [{ 'Salary': annualSalary, 'Recruiting': recruitingCost, 'Onboarding': onboardingCost, 'Training': trainingCost, 'Productivity loss': lostProductivity, 'Separation': separationCost, 'Per turnover': totalCostPerTurnover, '% of salary': costAsPctSalary.toFixed(0) + '%', 'Annual cost': annualTurnoverCost }],
        'Turnover cost: ' + formatMoney(totalCostPerTurnover) + ' per employee (' + formatPercent(costAsPctSalary, 0) + ' of salary).'
      );
    },

    /* ── International & Multi-Currency (151-158) + Financial Statement Analysis (159-160) ── */

    'foreign-currency-translation-tool': function (values, rows) {
      if (!rows || !rows.length) throw new Error('Add at least one account row.');
      var funcCurrency = values.functionalCurrency || 'USD';
      var repCurrency = values.reportingCurrency || 'USD';
      var currentRate = values.currentRate || 1;
      var avgRate = values.averageRate || 1;
      var historicalRate = values.historicalRate || 1;
      var totalFunc = 0, totalTranslated = 0, totalCTA = 0;
      var tblRows = [], exp = [];
      rows.forEach(function (r) {
        var acct = r.accountName || 'Unnamed';
        var cat = String(r.accountCategory || 'asset').toLowerCase();
        var amt = r.localAmount || 0;
        var rate;
        if (cat === 'revenue' || cat === 'expense') rate = avgRate;
        else if (cat === 'equity') rate = historicalRate;
        else rate = currentRate;
        var translated = amt * rate;
        var cta = translated - (amt * historicalRate);
        totalFunc += amt; totalTranslated += translated; totalCTA += cta;
        tblRows.push({ account: acct, category: cat, local: formatMoney(amt), rate: rate.toFixed(4), translated: formatMoney(translated) });
        exp.push({ Account: acct, Category: cat, 'Local Amount': amt, Rate: rate, Translated: translated, CTA: cta });
      });
      return buildResult(
        [{ label: 'Functional total', value: formatMoney(totalFunc), tone: 'neutral', help: 'Sum in functional currency.' }, { label: 'Translated total', value: formatMoney(totalTranslated), tone: 'neutral', help: 'Sum in reporting currency.' }, { label: 'CTA impact', value: formatMoney(totalCTA), tone: Math.abs(totalCTA) > totalFunc * 0.05 ? 'warning' : 'neutral', help: 'Cumulative translation adjustment.' }, { label: 'Accounts', value: formatNumber(rows.length), tone: 'neutral', help: 'Accounts translated.' }],
        [{ title: 'Current rate', value: currentRate.toFixed(4), tone: 'neutral', text: 'For assets and liabilities.' }, { title: 'Average rate', value: avgRate.toFixed(4), tone: 'neutral', text: 'For income statement items.' }, { title: 'Historical rate', value: historicalRate.toFixed(4), tone: 'neutral', text: 'For equity accounts.' }, { title: 'CTA magnitude', value: formatPercent(totalFunc ? (totalCTA / totalFunc) * 100 : 0), tone: 'neutral', text: 'CTA as % of functional total.' }],
        [{ title: 'Verify rate sources', text: 'Use consistent rate sources (central bank, Bloomberg) for all translations.' }, { title: 'CTA goes to OCI', text: 'The cumulative translation adjustment is reported in other comprehensive income.' }, { title: 'Intercompany elimination', text: 'Eliminate intercompany balances before translation to avoid double-counting.' }],
        [{ label: 'From', value: funcCurrency }, { label: 'To', value: repCurrency }, { label: 'Current rate', value: currentRate.toFixed(4) }, { label: 'Average rate', value: avgRate.toFixed(4) }, { label: 'Historical rate', value: historicalRate.toFixed(4) }, { label: 'CTA', value: formatMoney(totalCTA) }],
        { columns: [{ key: 'account', label: 'Account' }, { key: 'category', label: 'Category' }, { key: 'local', label: 'Local Amount' }, { key: 'rate', label: 'Rate' }, { key: 'translated', label: 'Translated' }], rows: tblRows },
        exp, 'Translation: ' + formatMoney(totalTranslated) + ' (' + repCurrency + '), CTA ' + formatMoney(totalCTA) + '.'
      );
    },

    'asc-830-functional-currency-analyzer': function (values) {
      var entityName = values.entityName || 'Entity';
      var cashFlows = values.cashFlowIndicator || 50;
      var salesPrice = values.salesPriceIndicator || 50;
      var salesMarket = values.salesMarketIndicator || 50;
      var expenses = values.expenseIndicator || 50;
      var financing = values.financingIndicator || 50;
      var intercompany = values.intercompanyIndicator || 50;
      var indicators = [cashFlows, salesPrice, salesMarket, expenses, financing, intercompany];
      var localScore = sum(indicators);
      var parentScore = 600 - localScore;
      var localPct = (localScore / 600) * 100;
      var parentPct = (parentScore / 600) * 100;
      var functional = localPct >= 50 ? 'Local currency' : 'Parent currency';
      var margin = Math.abs(localPct - 50);
      var exp = [{ Indicator: 'Cash flows', 'Local Score': cashFlows, 'Parent Score': 100 - cashFlows }, { Indicator: 'Sales prices', 'Local Score': salesPrice, 'Parent Score': 100 - salesPrice }, { Indicator: 'Sales market', 'Local Score': salesMarket, 'Parent Score': 100 - salesMarket }, { Indicator: 'Expenses', 'Local Score': expenses, 'Parent Score': 100 - expenses }, { Indicator: 'Financing', 'Local Score': financing, 'Parent Score': 100 - financing }, { Indicator: 'Intercompany', 'Local Score': intercompany, 'Parent Score': 100 - intercompany }, { Indicator: 'TOTAL', 'Local Score': localScore, 'Parent Score': parentScore }];
      return buildResult(
        [{ label: 'Recommendation', value: functional, tone: 'neutral', help: 'Based on weighted indicator analysis.' }, { label: 'Local score', value: formatPercent(localPct), tone: 'neutral', help: 'Indicators favoring local currency.' }, { label: 'Parent score', value: formatPercent(parentPct), tone: 'neutral', help: 'Indicators favoring parent currency.' }, { label: 'Margin', value: formatPercent(margin) + ' pts', tone: margin < 10 ? 'warning' : 'positive', help: 'Distance from 50/50 threshold.' }],
        [{ title: 'Cash flow indicator', value: formatPercent(cashFlows) + ' local', tone: 'neutral', text: 'Higher = cash flows in local currency.' }, { title: 'Sales indicator', value: formatPercent(salesPrice) + ' local', tone: 'neutral', text: 'Higher = local pricing environment.' }, { title: 'Expense indicator', value: formatPercent(expenses) + ' local', tone: 'neutral', text: 'Higher = costs in local currency.' }, { title: 'Decision confidence', value: margin < 10 ? 'Low' : (margin < 25 ? 'Moderate' : 'High'), tone: margin < 10 ? 'warning' : 'positive', text: margin < 10 ? 'Close call — document judgment thoroughly.' : 'Clear indicator direction.' }],
        [{ title: 'Document the analysis', text: 'ASC 830-10-55 requires management judgment. Keep this analysis in the permanent file.' }, { title: 'Reassess periodically', text: 'Changes in operations may shift the functional currency determination.' }, { title: 'Close calls need disclosure', text: 'When indicators are mixed, disclose the rationale in the financial statement notes.' }],
        [{ label: 'Entity', value: entityName }, { label: 'Functional', value: functional }, { label: 'Local %', value: formatPercent(localPct) }, { label: 'Parent %', value: formatPercent(parentPct) }, { label: 'Margin', value: formatPercent(margin) + ' pts' }],
        null, exp, entityName + ': ' + functional + ' (' + formatPercent(localPct) + ' local score).'
      );
    },

    'fx-hedge-effectiveness-calculator': function (values) {
      var hedgeType = values.hedgeType || 'cash_flow';
      var notional = values.notionalAmount || 0;
      var hedgedItemChange = values.hedgedItemChange || 0;
      var hedgingInstrChange = values.hedgingInstrumentChange || 0;
      var ratio = hedgedItemChange !== 0 ? Math.abs(hedgingInstrChange / hedgedItemChange) : 0;
      var ratioPct = ratio * 100;
      var effective = ratioPct >= 80 && ratioPct <= 125;
      var ineffective = hedgingInstrChange + hedgedItemChange;
      var ineffectivePct = notional ? (Math.abs(ineffective) / notional) * 100 : 0;
      var exp = [{ Item: 'Notional', Amount: notional }, { Item: 'Hedged item change', Amount: hedgedItemChange }, { Item: 'Hedging instrument change', Amount: hedgingInstrChange }, { Item: 'Dollar offset ratio', Amount: ratioPct.toFixed(2) + '%' }, { Item: 'Ineffectiveness', Amount: ineffective }, { Item: 'Result', Amount: effective ? 'Effective' : 'Not effective' }];
      return buildResult(
        [{ label: 'Dollar offset ratio', value: formatPercent(ratioPct), tone: effective ? 'positive' : 'warning', help: 'Absolute ratio of changes. 80-125% = effective.' }, { label: 'Result', value: effective ? 'Effective' : 'Not effective', tone: effective ? 'positive' : 'warning', help: 'Per ASC 815 80-125% threshold.' }, { label: 'Ineffectiveness', value: formatMoney(ineffective), tone: Math.abs(ineffective) > 0 ? 'warning' : 'positive', help: 'Amount recognized in earnings.' }, { label: 'Notional', value: formatMoney(notional), tone: 'neutral', help: 'Hedge notional amount.' }],
        [{ title: 'Hedge type', value: hedgeType === 'cash_flow' ? 'Cash flow' : (hedgeType === 'fair_value' ? 'Fair value' : 'Net investment'), tone: 'neutral', text: 'Classification per ASC 815.' }, { title: 'Hedged item change', value: formatMoney(hedgedItemChange), tone: 'neutral', text: 'Fair value change of hedged item.' }, { title: 'Instrument change', value: formatMoney(hedgingInstrChange), tone: 'neutral', text: 'Fair value change of hedging instrument.' }, { title: 'Ineffectiveness %', value: formatPercent(ineffectivePct), tone: ineffectivePct > 5 ? 'warning' : 'positive', text: 'As % of notional.' }],
        [{ title: effective ? 'Maintain hedge documentation' : 'Consider dedesignation', text: effective ? 'Continue prospective and retrospective testing each period.' : 'The hedge may need to be dedesignated and redesignated.' }, { title: 'Record ineffectiveness', text: 'The ineffective portion goes to earnings immediately, even for cash flow hedges.' }, { title: 'Regression may be needed', text: 'If dollar offset is borderline, regression analysis provides more robust evidence.' }],
        [{ label: 'Hedge type', value: hedgeType }, { label: 'Notional', value: formatMoney(notional) }, { label: 'Hedged change', value: formatMoney(hedgedItemChange) }, { label: 'Instrument change', value: formatMoney(hedgingInstrChange) }, { label: 'Ratio', value: formatPercent(ratioPct) }, { label: 'Result', value: effective ? 'Effective' : 'Not effective' }, { label: 'Ineffectiveness', value: formatMoney(ineffective) }],
        null, exp, 'Hedge effectiveness: ' + formatPercent(ratioPct) + ' — ' + (effective ? 'EFFECTIVE' : 'NOT EFFECTIVE') + '.'
      );
    },

    'transfer-pricing-markup-calculator': function (values) {
      var method = values.method || 'cost_plus';
      var costBase = values.costBase || 0;
      var markupPct = toRatio(values.markupPercent || 0);
      var thirdPartyPrice = values.thirdPartyPrice || 0;
      var armLengthLow = toRatio(values.armLengthRangeLow || 0);
      var armLengthHigh = toRatio(values.armLengthRangeHigh || 0);
      var transferPrice = costBase * (1 + markupPct);
      var grossProfit = transferPrice - costBase;
      var withinRange = (markupPct >= armLengthLow && markupPct <= armLengthHigh);
      var thirdPartyDiff = thirdPartyPrice > 0 ? ((transferPrice - thirdPartyPrice) / thirdPartyPrice) * 100 : 0;
      var exp = [{ Item: 'Cost base', Amount: costBase }, { Item: 'Markup %', Amount: (markupPct * 100).toFixed(2) + '%' }, { Item: 'Transfer price', Amount: transferPrice }, { Item: 'Third-party price', Amount: thirdPartyPrice }, { Item: 'Difference', Amount: thirdPartyDiff.toFixed(2) + '%' }, { Item: 'In range', Amount: withinRange ? 'Yes' : 'No' }];
      return buildResult(
        [{ label: 'Transfer price', value: formatMoney(transferPrice), tone: 'neutral', help: 'Cost base plus markup.' }, { label: 'Markup %', value: formatPercent(markupPct * 100), tone: 'neutral', help: 'Applied markup percentage.' }, { label: 'Gross profit', value: formatMoney(grossProfit), tone: 'neutral', help: 'Transfer price minus cost.' }, { label: 'In range', value: withinRange ? 'Yes' : 'No', tone: withinRange ? 'positive' : 'warning', help: 'Within the arm\'s length range.' }],
        [{ title: 'Method', value: method === 'cost_plus' ? 'Cost plus' : (method === 'resale_price' ? 'Resale price' : 'TNMM'), tone: 'neutral', text: 'Transfer pricing method used.' }, { title: 'vs third-party', value: formatPercent(thirdPartyDiff), tone: Math.abs(thirdPartyDiff) > 10 ? 'warning' : 'positive', text: thirdPartyPrice > 0 ? 'Difference from comparable uncontrolled price.' : 'No third-party price provided.' }, { title: 'Range low', value: formatPercent(armLengthLow * 100), tone: 'neutral', text: 'Bottom of interquartile range.' }, { title: 'Range high', value: formatPercent(armLengthHigh * 100), tone: 'neutral', text: 'Top of interquartile range.' }],
        [{ title: 'Document the method', text: 'OECD and IRS require contemporaneous documentation of the method chosen and comparables used.' }, { title: 'Update benchmarking', text: 'Comparable studies should be refreshed every 1-3 years.' }, { title: 'Consider advance pricing agreement', text: 'For high-value transactions, an APA provides certainty.' }],
        [{ label: 'Method', value: method }, { label: 'Cost base', value: formatMoney(costBase) }, { label: 'Markup', value: formatPercent(markupPct * 100) }, { label: 'Transfer price', value: formatMoney(transferPrice) }, { label: 'Third-party price', value: formatMoney(thirdPartyPrice) }, { label: 'Difference', value: formatPercent(thirdPartyDiff) }, { label: 'In range', value: withinRange ? 'Yes' : 'No' }],
        null, exp, 'Transfer price: ' + formatMoney(transferPrice) + ' (' + formatPercent(markupPct * 100) + ' markup). ' + (withinRange ? 'Within range.' : 'Outside range.')
      );
    },

    'foreign-tax-credit-calculator': function (values) {
      var foreignIncome = values.foreignSourceIncome || 0;
      var worldwideIncome = values.worldwideIncome || 0;
      var foreignTaxesPaid = values.foreignTaxesPaid || 0;
      var usTaxBeforeCredits = values.usTaxBeforeCredits || 0;
      var category = values.incomeCategory || 'general';
      var limitationRatio = worldwideIncome > 0 ? foreignIncome / worldwideIncome : 0;
      var ftcLimit = usTaxBeforeCredits * limitationRatio;
      var creditAllowed = Math.min(foreignTaxesPaid, ftcLimit);
      var excess = foreignTaxesPaid - creditAllowed;
      var effectiveForeignRate = foreignIncome > 0 ? (foreignTaxesPaid / foreignIncome) * 100 : 0;
      var effectiveUSRate = worldwideIncome > 0 ? (usTaxBeforeCredits / worldwideIncome) * 100 : 0;
      var carryForward = excess > 0 ? excess : 0;
      var exp = [{ Item: 'Foreign income', Amount: foreignIncome }, { Item: 'Worldwide income', Amount: worldwideIncome }, { Item: 'Foreign taxes paid', Amount: foreignTaxesPaid }, { Item: 'US tax before credits', Amount: usTaxBeforeCredits }, { Item: 'Limitation ratio', Amount: (limitationRatio * 100).toFixed(2) + '%' }, { Item: 'FTC limit', Amount: ftcLimit }, { Item: 'Credit allowed', Amount: creditAllowed }, { Item: 'Excess / carryforward', Amount: carryForward }];
      return buildResult(
        [{ label: 'Credit allowed', value: formatMoney(creditAllowed), tone: 'positive', help: 'Lesser of taxes paid or limitation.' }, { label: 'FTC limitation', value: formatMoney(ftcLimit), tone: 'neutral', help: 'Maximum credit based on income ratio.' }, { label: 'Excess credit', value: formatMoney(carryForward), tone: carryForward > 0 ? 'warning' : 'positive', help: 'Available for 10-year carryforward.' }, { label: 'Limitation ratio', value: formatPercent(limitationRatio * 100), tone: 'neutral', help: 'Foreign / worldwide income.' }],
        [{ title: 'Foreign effective rate', value: formatPercent(effectiveForeignRate), tone: effectiveForeignRate > effectiveUSRate ? 'warning' : 'positive', text: effectiveForeignRate > effectiveUSRate ? 'Foreign rate exceeds US rate — expect excess credits.' : 'Foreign rate below US rate — full credit likely.' }, { title: 'US effective rate', value: formatPercent(effectiveUSRate), tone: 'neutral', text: 'Pre-credit US effective rate.' }, { title: 'Income category', value: category === 'general' ? 'General' : 'Passive', tone: 'neutral', text: 'FTC basket for this calculation.' }, { title: 'Utilization', value: formatPercent(foreignTaxesPaid > 0 ? (creditAllowed / foreignTaxesPaid) * 100 : 0), tone: 'neutral', text: 'Percentage of foreign taxes credited.' }],
        [{ title: 'Track by basket', text: 'General and passive category credits cannot be cross-credited.' }, { title: 'Carryforward planning', text: 'Excess credits carry forward 10 years. Plan sourcing to maximize utilization.' }, { title: 'Consider the deduction alternative', text: 'In some cases, deducting foreign taxes may be better than crediting if credits are limited.' }],
        [{ label: 'Category', value: category }, { label: 'Foreign income', value: formatMoney(foreignIncome) }, { label: 'Worldwide income', value: formatMoney(worldwideIncome) }, { label: 'Taxes paid', value: formatMoney(foreignTaxesPaid) }, { label: 'Limitation', value: formatMoney(ftcLimit) }, { label: 'Credit allowed', value: formatMoney(creditAllowed) }, { label: 'Excess', value: formatMoney(carryForward) }],
        null, exp, 'FTC: ' + formatMoney(creditAllowed) + ' allowed, ' + formatMoney(carryForward) + ' excess.'
      );
    },

    'multi-currency-pl-translator': function (values, rows) {
      if (!rows || !rows.length) throw new Error('Add at least one P&L line.');
      var reportingCurrency = values.reportingCurrency || 'USD';
      var avgRate = values.averageRate || 1;
      var totalLocal = 0, totalTranslated = 0;
      var tblRows = [], exp = [];
      rows.forEach(function (r) {
        var line = r.lineLabel || 'Unnamed';
        var lineType = String(r.lineType || 'revenue').toLowerCase();
        var localAmt = r.localAmount || 0;
        var customRate = r.customRate || null;
        var rate = customRate || avgRate;
        var translated = localAmt * rate;
        totalLocal += localAmt;
        totalTranslated += translated;
        tblRows.push({ line: line, type: lineType, local: formatMoney(localAmt), rate: rate.toFixed(4), translated: formatMoney(translated) });
        exp.push({ Line: line, Type: lineType, 'Local Amount': localAmt, Rate: rate, Translated: translated });
      });
      return buildResult(
        [{ label: 'Local total', value: formatMoney(totalLocal), tone: 'neutral', help: 'Sum in local currency.' }, { label: 'Translated total', value: formatMoney(totalTranslated), tone: 'neutral', help: 'Sum in ' + reportingCurrency + '.' }, { label: 'Avg rate used', value: avgRate.toFixed(4), tone: 'neutral', help: 'Period average exchange rate.' }, { label: 'Lines translated', value: formatNumber(rows.length), tone: 'neutral', help: 'Number of P&L lines.' }],
        [{ title: 'Revenue translated', value: formatMoney(sum(rows.filter(function (r) { return String(r.lineType || '').toLowerCase() === 'revenue'; }).map(function (r) { return (r.localAmount || 0) * (r.customRate || avgRate); }))), tone: 'neutral', text: 'Total revenue in reporting currency.' }, { title: 'Expense translated', value: formatMoney(sum(rows.filter(function (r) { return String(r.lineType || '').toLowerCase() === 'expense'; }).map(function (r) { return (r.localAmount || 0) * (r.customRate || avgRate); }))), tone: 'neutral', text: 'Total expenses in reporting currency.' }, { title: 'Net income', value: formatMoney(sum(rows.map(function (r) { var t = String(r.lineType || '').toLowerCase(); var a = (r.localAmount || 0) * (r.customRate || avgRate); return t === 'expense' ? -a : a; }))), tone: 'neutral', text: 'Revenue less expenses translated.' }, { title: 'Reporting currency', value: reportingCurrency, tone: 'neutral', text: 'Target currency.' }],
        [{ title: 'Use consistent avg rate', text: 'Apply the same average rate source for all P&L items unless a specific transaction date rate is required.' }, { title: 'Disclose FX impact', text: 'Management discussion should quantify the impact of currency translation on results.' }, { title: 'Reconcile to balance sheet', text: 'Ensure P&L translation aligns with the retained earnings roll-forward.' }],
        [{ label: 'Reporting currency', value: reportingCurrency }, { label: 'Avg rate', value: avgRate.toFixed(4) }, { label: 'Local total', value: formatMoney(totalLocal) }, { label: 'Translated total', value: formatMoney(totalTranslated) }],
        { columns: [{ key: 'line', label: 'Line' }, { key: 'type', label: 'Type' }, { key: 'local', label: 'Local' }, { key: 'rate', label: 'Rate' }, { key: 'translated', label: 'Translated' }], rows: tblRows },
        exp, 'P&L translation: ' + formatMoney(totalTranslated) + ' (' + reportingCurrency + ') at avg rate ' + avgRate.toFixed(4) + '.'
      );
    },

    'fbar-filing-threshold-checker': function (values) {
      var filingYear = values.filingYear || '2025';
      var accounts = [];
      for (var i = 1; i <= 6; i++) {
        var name = values['accountName' + i] || '';
        var max = values['maxBalance' + i] || 0;
        if (name || max > 0) accounts.push({ name: name || ('Account ' + i), max: max });
      }
      var totalMax = sum(accounts.map(function (a) { return a.max; }));
      var threshold = 10000;
      var filingRequired = totalMax > threshold;
      var margin = totalMax - threshold;
      var exp = accounts.map(function (a) { return { Account: a.name, 'Max Balance': a.max }; });
      exp.push({ Account: 'AGGREGATE MAX', 'Max Balance': totalMax });
      return buildResult(
        [{ label: 'Filing required', value: filingRequired ? 'Yes' : 'No', tone: filingRequired ? 'warning' : 'positive', help: 'FBAR required if aggregate max > $10,000.' }, { label: 'Aggregate max', value: formatMoney(totalMax), tone: totalMax > threshold ? 'warning' : 'positive', help: 'Combined maximum balance of all foreign accounts.' }, { label: 'Threshold', value: formatMoney(threshold), tone: 'neutral', help: '$10,000 aggregate threshold.' }, { label: 'Margin', value: formatMoney(margin), tone: 'neutral', help: 'Amount above or below threshold.' }],
        [{ title: 'Accounts reported', value: formatNumber(accounts.length), tone: 'neutral', text: 'Foreign accounts entered.' }, { title: 'Filing year', value: filingYear, tone: 'neutral', text: 'Calendar year for FBAR filing.' }, { title: 'Deadline', value: 'April 15 (auto ext. Oct 15)', tone: 'neutral', text: 'FinCEN 114 due date.' }, { title: 'Penalty risk', value: filingRequired ? 'File required' : 'None', tone: filingRequired ? 'warning' : 'positive', text: filingRequired ? 'Non-willful penalty up to $10,000/violation.' : 'Below filing threshold.' }],
        [{ title: filingRequired ? 'File FinCEN 114' : 'Monitor balances', text: filingRequired ? 'File electronically through BSA E-Filing. Deadline is April 15 with automatic extension to October 15.' : 'Track maximum balances throughout the year. Filing triggers if aggregate ever exceeds $10,000.' }, { title: 'Track max balances', text: 'Use the highest balance at any point during the year, not year-end balance.' }, { title: 'Consider FATCA overlap', text: 'FBAR and Form 8938 have different thresholds. Check both filing requirements.' }],
        [{ label: 'Year', value: filingYear }, { label: 'Accounts', value: formatNumber(accounts.length) }, { label: 'Aggregate max', value: formatMoney(totalMax) }, { label: 'Threshold', value: formatMoney(threshold) }, { label: 'Filing required', value: filingRequired ? 'Yes' : 'No' }],
        null, exp, 'FBAR: aggregate max ' + formatMoney(totalMax) + ' — ' + (filingRequired ? 'FILING REQUIRED' : 'below threshold') + '.'
      );
    },

    'gilti-tax-exposure-estimator': function (values) {
      var cFCIncome = values.cFCTestedIncome || 0;
      var cFCLosses = values.cFCTestedLoss || 0;
      var qbai = values.qbaiNet || 0;
      var interestExpense = values.specifiedInterestExpense || 0;
      var foreignTaxesCFC = values.foreignTaxesPaidCFC || 0;
      var usTaxRate = toRatio(values.usMarginalRate || 21);
      var section250Deduction = toRatio(values.section250DeductionPct || 50);
      var netTestedIncome = Math.max(0, cFCIncome - cFCLosses);
      var dtir = qbai * 0.10 - interestExpense;
      var giltiInclusion = Math.max(0, netTestedIncome - dtir);
      var grossUp = foreignTaxesCFC * 0.80;
      var taxableGILTI = giltiInclusion + grossUp;
      var deduction250 = taxableGILTI * section250Deduction;
      var netTaxable = taxableGILTI - deduction250;
      var usTax = netTaxable * usTaxRate;
      var ftcHaircut = foreignTaxesCFC * 0.80;
      var netTaxCost = Math.max(0, usTax - ftcHaircut);
      var effectiveRate = giltiInclusion > 0 ? (netTaxCost / giltiInclusion) * 100 : 0;
      var exp = [{ Item: 'CFC tested income', Amount: cFCIncome }, { Item: 'CFC tested loss', Amount: cFCLosses }, { Item: 'Net tested income', Amount: netTestedIncome }, { Item: 'QBAI (10%)', Amount: dtir }, { Item: 'GILTI inclusion', Amount: giltiInclusion }, { Item: 'Section 250 deduction', Amount: deduction250 }, { Item: 'Net taxable', Amount: netTaxable }, { Item: 'US tax', Amount: usTax }, { Item: 'FTC offset', Amount: ftcHaircut }, { Item: 'Net tax cost', Amount: netTaxCost }];
      return buildResult(
        [{ label: 'GILTI inclusion', value: formatMoney(giltiInclusion), tone: giltiInclusion > 0 ? 'warning' : 'positive', help: 'Net tested income less deemed tangible income return.' }, { label: 'Net tax cost', value: formatMoney(netTaxCost), tone: netTaxCost > 0 ? 'warning' : 'positive', help: 'US tax after Section 250 deduction and FTC.' }, { label: 'Effective rate', value: formatPercent(effectiveRate), tone: 'neutral', help: 'Net cost as % of GILTI inclusion.' }, { label: 'Section 250 deduction', value: formatMoney(deduction250), tone: 'neutral', help: '50% deduction for C-corps.' }],
        [{ title: 'Net tested income', value: formatMoney(netTestedIncome), tone: 'neutral', text: 'CFC income less tested losses.' }, { title: 'DTIR (10% QBAI)', value: formatMoney(dtir), tone: 'neutral', text: 'Deemed tangible income return: 10% of QBAI less interest.' }, { title: 'FTC offset', value: formatMoney(ftcHaircut), tone: 'neutral', text: '80% of foreign taxes paid as credit.' }, { title: 'Rate arbitrage', value: effectiveRate < 13.125 ? 'Favorable' : 'Unfavorable', tone: effectiveRate < 13.125 ? 'positive' : 'warning', text: 'Target below 13.125%.' }],
        [{ title: 'Maximize QBAI', text: 'Tangible asset investment in CFCs increases the DTIR exemption and reduces GILTI.' }, { title: 'Monitor CFC losses', text: 'Tested losses from one CFC offset tested income from others.' }, { title: 'Plan for Section 250 sunset', text: 'The 50% deduction drops to 37.5% after 2025 — model the impact.' }],
        [{ label: 'CFC income', value: formatMoney(cFCIncome) }, { label: 'CFC losses', value: formatMoney(cFCLosses) }, { label: 'QBAI DTIR', value: formatMoney(dtir) }, { label: 'GILTI', value: formatMoney(giltiInclusion) }, { label: 'Sec 250', value: formatMoney(deduction250) }, { label: 'FTC', value: formatMoney(ftcHaircut) }, { label: 'Net cost', value: formatMoney(netTaxCost) }, { label: 'Eff rate', value: formatPercent(effectiveRate) }],
        null, exp, 'GILTI: ' + formatMoney(giltiInclusion) + ' inclusion, ' + formatMoney(netTaxCost) + ' net tax cost (' + formatPercent(effectiveRate) + ').'
      );
    },

    'liquidity-ratio-suite': function (values) {
      var currentAssets = values.currentAssets || 0;
      var currentLiabilities = values.currentLiabilities || 0;
      var inventory = values.inventory || 0;
      var prepaidExpenses = values.prepaidExpenses || 0;
      var cashEquivalents = values.cashAndEquivalents || 0;
      var shortTermInvestments = values.shortTermInvestments || 0;
      var operatingCashFlow = values.operatingCashFlow || 0;
      var currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
      var quickAssets = currentAssets - inventory - prepaidExpenses;
      var quickRatio = currentLiabilities > 0 ? quickAssets / currentLiabilities : 0;
      var cashRatio = currentLiabilities > 0 ? (cashEquivalents + shortTermInvestments) / currentLiabilities : 0;
      var cashFlowRatio = currentLiabilities > 0 ? operatingCashFlow / currentLiabilities : 0;
      var workingCapital = currentAssets - currentLiabilities;
      var exp = [{ Ratio: 'Current ratio', Value: currentRatio.toFixed(2) + 'x', Benchmark: '1.5-2.0x' }, { Ratio: 'Quick ratio', Value: quickRatio.toFixed(2) + 'x', Benchmark: '1.0-1.5x' }, { Ratio: 'Cash ratio', Value: cashRatio.toFixed(2) + 'x', Benchmark: '0.5-1.0x' }, { Ratio: 'Cash flow ratio', Value: cashFlowRatio.toFixed(2) + 'x', Benchmark: '>1.0x' }, { Ratio: 'Working capital', Value: workingCapital, Benchmark: 'Positive' }];
      return buildResult(
        [{ label: 'Current ratio', value: formatRatio(currentRatio), tone: currentRatio < 1 ? 'warning' : (currentRatio > 2 ? 'neutral' : 'positive'), help: 'Current assets / current liabilities. Benchmark: 1.5-2.0x.' }, { label: 'Quick ratio', value: formatRatio(quickRatio), tone: quickRatio < 1 ? 'warning' : 'positive', help: '(Current assets - inventory - prepaids) / current liabilities.' }, { label: 'Cash ratio', value: formatRatio(cashRatio), tone: cashRatio < 0.2 ? 'warning' : 'positive', help: '(Cash + ST investments) / current liabilities.' }, { label: 'Working capital', value: formatMoney(workingCapital), tone: workingCapital < 0 ? 'warning' : 'positive', help: 'Current assets minus current liabilities.' }],
        [{ title: 'Cash flow ratio', value: formatRatio(cashFlowRatio), tone: cashFlowRatio < 1 ? 'warning' : 'positive', text: 'Operating cash flow / current liabilities.' }, { title: 'Inventory impact', value: formatMoney(inventory), tone: 'neutral', text: 'Excluded from quick ratio.' }, { title: 'Prepaid impact', value: formatMoney(prepaidExpenses), tone: 'neutral', text: 'Excluded from quick ratio.' }, { title: 'Cash position', value: formatMoney(cashEquivalents + shortTermInvestments), tone: 'neutral', text: 'Most liquid assets.' }],
        [{ title: 'Watch the current ratio trend', text: 'A declining current ratio over quarters signals deteriorating liquidity before it becomes critical.' }, { title: 'Quick ratio for seasonal businesses', text: 'Inventory-heavy businesses should focus on quick ratio since inventory may not convert quickly.' }, { title: 'Cash ratio is conservative', text: 'A cash ratio below 0.5x is common and not always alarming if receivables are strong.' }],
        [{ label: 'Current assets', value: formatMoney(currentAssets) }, { label: 'Current liabilities', value: formatMoney(currentLiabilities) }, { label: 'Inventory', value: formatMoney(inventory) }, { label: 'Cash + ST inv', value: formatMoney(cashEquivalents + shortTermInvestments) }, { label: 'Current ratio', value: formatRatio(currentRatio) }, { label: 'Quick ratio', value: formatRatio(quickRatio) }, { label: 'Cash ratio', value: formatRatio(cashRatio) }, { label: 'Cash flow ratio', value: formatRatio(cashFlowRatio) }],
        null, exp, 'Liquidity: current ' + formatRatio(currentRatio) + ', quick ' + formatRatio(quickRatio) + ', cash ' + formatRatio(cashRatio) + '.'
      );
    },

    'solvency-ratio-calculator': function (values) {
      var totalAssets = values.totalAssets || 0;
      var totalLiabilities = values.totalLiabilities || 0;
      var totalEquity = values.totalEquity || 0;
      var longTermDebt = values.longTermDebt || 0;
      var ebit = values.ebit || 0;
      var interestExpense = values.interestExpense || 0;
      var depAmort = values.depreciationAmortization || 0;
      var totalDebt = values.totalDebt || 0;
      var debtToEquity = totalEquity > 0 ? totalDebt / totalEquity : 0;
      var debtToAssets = totalAssets > 0 ? totalLiabilities / totalAssets : 0;
      var equityRatio = totalAssets > 0 ? totalEquity / totalAssets : 0;
      var interestCoverage = interestExpense > 0 ? ebit / interestExpense : 999;
      var debtServiceCoverage = interestExpense > 0 ? (ebit + depAmort) / interestExpense : 999;
      var leverageRatio = totalEquity > 0 ? totalAssets / totalEquity : 0;
      var exp = [{ Ratio: 'Debt-to-equity', Value: debtToEquity.toFixed(2) + 'x', Benchmark: '<2.0x' }, { Ratio: 'Debt-to-assets', Value: (debtToAssets * 100).toFixed(1) + '%', Benchmark: '<60%' }, { Ratio: 'Equity ratio', Value: (equityRatio * 100).toFixed(1) + '%', Benchmark: '>40%' }, { Ratio: 'Interest coverage', Value: interestCoverage >= 999 ? 'N/A' : interestCoverage.toFixed(2) + 'x', Benchmark: '>3.0x' }, { Ratio: 'Debt service coverage', Value: debtServiceCoverage >= 999 ? 'N/A' : debtServiceCoverage.toFixed(2) + 'x', Benchmark: '>1.5x' }, { Ratio: 'Leverage ratio', Value: leverageRatio.toFixed(2) + 'x', Benchmark: '<3.0x' }];
      return buildResult(
        [{ label: 'Debt-to-equity', value: formatRatio(debtToEquity), tone: debtToEquity > 2 ? 'warning' : 'positive', help: 'Total debt / total equity. Benchmark: <2.0x.' }, { label: 'Debt-to-assets', value: formatPercent(debtToAssets * 100), tone: debtToAssets > 0.6 ? 'warning' : 'positive', help: 'Total liabilities / total assets.' }, { label: 'Interest coverage', value: interestCoverage >= 999 ? 'N/A' : formatRatio(interestCoverage), tone: interestCoverage < 3 && interestCoverage < 999 ? 'warning' : 'positive', help: 'EBIT / interest expense.' }, { label: 'Equity ratio', value: formatPercent(equityRatio * 100), tone: equityRatio < 0.4 ? 'warning' : 'positive', help: 'Total equity / total assets.' }],
        [{ title: 'Debt service coverage', value: debtServiceCoverage >= 999 ? 'N/A' : formatRatio(debtServiceCoverage), tone: debtServiceCoverage < 1.5 && debtServiceCoverage < 999 ? 'warning' : 'positive', text: '(EBIT + D&A) / interest.' }, { title: 'Leverage ratio', value: formatRatio(leverageRatio), tone: leverageRatio > 3 ? 'warning' : 'positive', text: 'Total assets / equity.' }, { title: 'Long-term debt', value: formatMoney(longTermDebt), tone: 'neutral', text: 'Debt maturing beyond 1 year.' }, { title: 'EBIT', value: formatMoney(ebit), tone: 'neutral', text: 'Earnings before interest and taxes.' }],
        [{ title: 'Watch covenant triggers', text: 'Debt covenants often require minimum interest coverage and max leverage.' }, { title: 'Trend matters more than snapshot', text: 'Compare solvency ratios across quarters to spot deterioration before covenant breach.' }, { title: 'Peer comparison', text: 'Capital-intensive industries carry higher leverage. Compare within your sector.' }],
        [{ label: 'Total assets', value: formatMoney(totalAssets) }, { label: 'Total liabilities', value: formatMoney(totalLiabilities) }, { label: 'Total equity', value: formatMoney(totalEquity) }, { label: 'Total debt', value: formatMoney(totalDebt) }, { label: 'D/E', value: formatRatio(debtToEquity) }, { label: 'D/A', value: formatPercent(debtToAssets * 100) }, { label: 'Coverage', value: interestCoverage >= 999 ? 'N/A' : formatRatio(interestCoverage) }, { label: 'Equity ratio', value: formatPercent(equityRatio * 100) }],
        null, exp, 'Solvency: D/E ' + formatRatio(debtToEquity) + ', coverage ' + (interestCoverage >= 999 ? 'N/A' : formatRatio(interestCoverage)) + ', equity ' + formatPercent(equityRatio * 100) + '.'
      );
    },

    /* ── Financial Statement Analysis (161-170) ────────────────── */

    'profitability-ratio-dashboard': function (values) {
      var revenue = values.revenue;
      var cogs = values.cogs || 0;
      var operatingExpenses = values.operatingExpenses || 0;
      var depreciation = firstNumber(values.depreciation, values.depreciationAmortization, 0) || 0;
      var interestExpense = values.interestExpense || 0;
      var taxExpense = values.taxExpense || 0;
      var totalAssets = values.totalAssets || 0;
      var totalEquity = firstNumber(values.shareholderEquity, values.totalEquity, 0) || 0;
      if (!(revenue > 0)) throw new Error('Enter a positive revenue amount.');
      var grossProfit = revenue - cogs;
      var operatingIncome = grossProfit - operatingExpenses;
      var ebitda = operatingIncome + depreciation;
      var ebit = operatingIncome;
      var ebt = ebit - interestExpense;
      var netIncome = firstNumber(values.netIncome, ebt - taxExpense) || 0;
      var grossMargin = revenue ? grossProfit / revenue * 100 : 0;
      var operatingMargin = revenue ? operatingIncome / revenue * 100 : 0;
      var ebitdaMargin = revenue ? ebitda / revenue * 100 : 0;
      var netMargin = revenue ? netIncome / revenue * 100 : 0;
      var roa = totalAssets ? netIncome / totalAssets * 100 : 0;
      var roe = totalEquity ? netIncome / totalEquity * 100 : 0;
      var assetTurnover = totalAssets ? revenue / totalAssets : 0;
      var equityMultiplier = totalEquity ? totalAssets / totalEquity : 0;
      var dupont = netMargin / 100 * assetTurnover * equityMultiplier * 100;
      return buildResult(
        [
          { label: 'Gross margin', value: formatPercent(grossMargin, 1), tone: grossMargin < 20 ? 'warning' : 'positive', help: 'Gross profit / revenue.' },
          { label: 'Operating margin', value: formatPercent(operatingMargin, 1), tone: operatingMargin < 5 ? 'warning' : 'positive', help: 'Operating income / revenue.' },
          { label: 'Net margin', value: formatPercent(netMargin, 1), tone: netMargin < 0 ? 'critical' : (netMargin < 5 ? 'warning' : 'positive'), help: 'Net income / revenue.' },
          { label: 'ROE', value: formatPercent(roe, 1), tone: roe < 10 ? 'warning' : 'positive', help: 'Net income / total equity.' }
        ],
        [
          { title: 'ROA', value: formatPercent(roa, 1), tone: roa < 5 ? 'warning' : 'positive', text: 'Net income / total assets.' },
          { title: 'EBITDA margin', value: formatPercent(ebitdaMargin, 1), tone: ebitdaMargin < 10 ? 'warning' : 'positive', text: '(Operating income + D&A) / revenue.' },
          { title: 'Asset turnover', value: formatRatio(assetTurnover), tone: 'neutral', text: 'Revenue / total assets.' },
          { title: 'Equity multiplier', value: formatRatio(equityMultiplier), tone: equityMultiplier > 3 ? 'warning' : 'neutral', text: 'Total assets / total equity (leverage).' },
          { title: 'DuPont ROE', value: formatPercent(dupont, 1), tone: 'neutral', text: 'Net margin × asset turnover × equity multiplier.' }
        ],
        [
          { title: 'Gross margin reveals pricing and cost control', text: 'A declining gross margin signals either pricing pressure or rising input costs.' },
          { title: 'Operating margin shows operational efficiency', text: 'The gap between gross and operating margin reflects SG&A discipline.' },
          { title: 'DuPont decomposition isolates the driver', text: 'High ROE can come from margin, efficiency, or leverage — the DuPont breakdown shows which.' },
          { title: 'Compare to industry peers', text: 'Profitability ratios are meaningful only in the context of industry norms and trends.' }
        ],
        [
          { label: 'Revenue', value: formatMoney(revenue) },
          { label: 'Gross profit', value: formatMoney(grossProfit) },
          { label: 'Operating income', value: formatMoney(operatingIncome) },
          { label: 'EBITDA', value: formatMoney(ebitda) },
          { label: 'Net income', value: formatMoney(netIncome) },
          { label: 'Gross margin', value: formatPercent(grossMargin, 1) },
          { label: 'EBITDA margin', value: formatPercent(ebitdaMargin, 1) },
          { label: 'Operating margin', value: formatPercent(operatingMargin, 1) },
          { label: 'Net margin', value: formatPercent(netMargin, 1) },
          { label: 'ROA', value: formatPercent(roa, 1) },
          { label: 'ROE', value: formatPercent(roe, 1) }
        ],
        null,
        [{ Revenue: revenue, COGS: cogs, 'Gross profit': grossProfit, EBITDA: ebitda, 'Op. income': operatingIncome, 'Net income': netIncome, 'Gross %': grossMargin.toFixed(1) + '%', 'EBITDA %': ebitdaMargin.toFixed(1) + '%', 'Op %': operatingMargin.toFixed(1) + '%', 'Net %': netMargin.toFixed(1) + '%', ROA: roa.toFixed(1) + '%', ROE: roe.toFixed(1) + '%' }],
        'Profitability: gross ' + formatPercent(grossMargin, 1) + ', EBITDA ' + formatPercent(ebitdaMargin, 1) + ', net ' + formatPercent(netMargin, 1) + ', ROE ' + formatPercent(roe, 1) + '.'
      );
    },
    'activity-efficiency-ratio-calculator': function (values) {
      var revenue = values.revenue;
      var cogs = values.cogs || 0;
      var purchases = firstNumber(values.purchases, values.cogs, 0) || 0;
      var ar = firstNumber(values.avgAR, values.accountsReceivable, 0) || 0;
      var inventory = firstNumber(values.avgInventory, values.inventory, 0) || 0;
      var ap = firstNumber(values.avgAP, values.accountsPayable, 0) || 0;
      var totalAssets = firstNumber(values.avgTotalAssets, values.totalAssets, 0) || 0;
      var fixedAssets = firstNumber(values.avgFixedAssets, values.fixedAssets, 0) || 0;
      var payableBase = purchases > 0 ? purchases : cogs;
      if (!(revenue > 0)) throw new Error('Enter a positive revenue amount.');
      var dso = ar > 0 && revenue > 0 ? ar / revenue * 365 : 0;
      var dio = inventory > 0 && cogs > 0 ? inventory / cogs * 365 : 0;
      var dpo = ap > 0 && payableBase > 0 ? ap / payableBase * 365 : 0;
      var ccc = dso + dio - dpo;
      var arTurnover = ar > 0 ? revenue / ar : 0;
      var invTurnover = inventory > 0 && cogs > 0 ? cogs / inventory : 0;
      var apTurnover = ap > 0 && payableBase > 0 ? payableBase / ap : 0;
      var assetTurnover = totalAssets > 0 ? revenue / totalAssets : 0;
      var faTurnover = fixedAssets > 0 ? revenue / fixedAssets : 0;
      return buildResult(
        [
          { label: 'DSO', value: formatDays(dso), tone: dso > 45 ? 'warning' : 'positive', help: 'Days sales outstanding — AR / revenue × 365.' },
          { label: 'DIO', value: formatDays(dio), tone: dio > 60 ? 'warning' : 'positive', help: 'Days inventory outstanding — inventory / COGS × 365.' },
          { label: 'DPO', value: formatDays(dpo), tone: 'neutral', help: 'Days payable outstanding — AP / COGS × 365.' },
          { label: 'Cash conversion cycle', value: formatDays(ccc), tone: ccc > 60 ? 'warning' : (ccc < 0 ? 'positive' : 'neutral'), help: 'DSO + DIO − DPO.' }
        ],
        [
          { title: 'AR turnover', value: formatRatio(arTurnover), tone: arTurnover < 8 ? 'warning' : 'positive', text: 'Revenue / accounts receivable.' },
          { title: 'Inventory turnover', value: formatRatio(invTurnover), tone: invTurnover < 4 ? 'warning' : 'positive', text: 'COGS / inventory.' },
          { title: 'AP turnover', value: formatRatio(apTurnover), tone: 'neutral', text: 'Purchases / accounts payable.' },
          { title: 'Asset turnover', value: formatRatio(assetTurnover), tone: 'neutral', text: 'Revenue / total assets.' },
          { title: 'Fixed asset turnover', value: formatRatio(faTurnover), tone: 'neutral', text: 'Revenue / fixed assets.' }
        ],
        [
          { title: 'CCC is the master efficiency metric', text: 'The cash conversion cycle shows how many days cash is tied up in operations — lower is better.' },
          { title: 'DSO reflects collection effectiveness', text: 'Rising DSO may indicate lax credit terms or collection problems.' },
          { title: 'DIO reflects inventory management', text: 'High DIO means capital is tied up in inventory — watch for obsolescence risk.' },
          { title: 'DPO is a lever, not just a metric', text: 'Extending DPO improves CCC but may strain supplier relationships.' }
        ],
        [
          { label: 'Revenue', value: formatMoney(revenue) },
          { label: 'COGS', value: formatMoney(cogs) },
          { label: 'Purchases', value: formatMoney(payableBase) },
          { label: 'DSO', value: formatDays(dso) },
          { label: 'DIO', value: formatDays(dio) },
          { label: 'DPO', value: formatDays(dpo) },
          { label: 'CCC', value: formatDays(ccc) },
          { label: 'AR turnover', value: formatRatio(arTurnover) },
          { label: 'Inv turnover', value: formatRatio(invTurnover) },
          { label: 'AP turnover', value: formatRatio(apTurnover) }
        ],
        null,
        [{ Revenue: revenue, COGS: cogs, Purchases: payableBase, AR: ar, Inventory: inventory, AP: ap, DSO: dso.toFixed(1), DIO: dio.toFixed(1), DPO: dpo.toFixed(1), CCC: ccc.toFixed(1) }],
        'Efficiency: DSO ' + formatDays(dso) + ', DIO ' + formatDays(dio) + ', DPO ' + formatDays(dpo) + ', CCC ' + formatDays(ccc) + '.'
      );
    },
    'common-size-income-statement': function (values, rows) {
      var items = rows.map(function (r) {
        return {
          lineItem: firstText(r.lineItem, r.lineLabel, r.item, r.label, r.name, r.account),
          amount: firstNumber(r.amount, r.value, r.total, r.cost)
        };
      }).filter(function (r) { return r.lineItem && Number.isFinite(r.amount); });
      if (!items.length) throw new Error('Add at least one income statement line item.');
      var revenueRow = items.find(function (r) { return /revenue|sales|income/i.test(r.lineItem) && r.amount > 0; });
      var revenueBase = firstNumber(values.revenueBase, values.revenue, values.totalRevenue);
      if (!(revenueBase > 0)) {
        revenueBase = revenueRow ? revenueRow.amount : 0;
      }
      if (!(revenueBase > 0)) throw new Error('Enter a revenue base or include a revenue line item.');
      var rowsOut = items.map(function (r) {
        var pct = revenueBase ? r.amount / revenueBase * 100 : 0;
        return { lineItem: r.lineItem, amount: r.amount, pctOfRevenue: pct };
      });
      var totalAmount = sum(rowsOut.map(function (r) { return r.amount; }));
      var largest = rowsOut.slice().sort(function (a, b) { return Math.abs(b.pctOfRevenue) - Math.abs(a.pctOfRevenue); })[0];
      var expenseLines = rowsOut.filter(function (r) { return r.amount < 0 || (r.pctOfRevenue < 0 && r.amount !== revenueBase); });
      return buildResult(
        [
          { label: 'Revenue base', value: formatMoney(revenueBase), tone: 'neutral', help: 'Denominator for common-size percentages.' },
          { label: 'Line items', value: formatNumber(rowsOut.length), tone: 'neutral', help: 'Total income statement lines analyzed.' },
          { label: 'Total', value: formatMoney(totalAmount), tone: 'neutral', help: 'Sum of all line items.' },
          { label: 'Largest line', value: formatPercent(Math.abs(largest.pctOfRevenue), 1), tone: 'neutral', help: largest.lineItem + ' as % of revenue.' }
        ],
        [
          { title: 'Largest line item', value: largest.lineItem, tone: 'neutral', text: formatMoney(largest.amount) + ' (' + formatPercent(largest.pctOfRevenue, 1) + ' of revenue).' },
          { title: 'Revenue base', value: formatMoney(revenueBase), tone: 'neutral', text: 'All percentages are expressed relative to this amount.' },
          { title: 'Expense lines', value: formatNumber(expenseLines.length), tone: 'neutral', text: 'Lines below zero or with negative percentage.' },
          { title: 'Net as % of revenue', value: formatPercent(revenueBase ? totalAmount / revenueBase * 100 : 0, 1), tone: 'neutral', text: 'Sum of all lines / revenue.' }
        ],
        [
          { title: 'Common-size reveals the cost structure', text: 'Expressing each line as a percentage of revenue makes it easy to compare across periods or companies of different sizes.' },
          { title: 'Watch for structural shifts', text: 'A line item growing as a percentage of revenue signals a structural change, not just a one-time event.' },
          { title: 'Compare to peers and benchmarks', text: 'Common-size statements are most useful when compared to industry averages or direct competitors.' },
          { title: 'Pair with horizontal analysis', text: 'Common-size shows proportions; horizontal analysis shows growth rates — use both together.' }
        ],
        [
          { label: 'Revenue base', value: formatMoney(revenueBase) },
          { label: 'Lines analyzed', value: formatNumber(rowsOut.length) },
          { label: 'Total', value: formatMoney(totalAmount) }
        ],
        { columns: [{ key: 'lineItem', label: 'Line item', type: 'text' }, { key: 'amount', label: 'Amount', type: 'money', align: 'right' }, { key: 'pctOfRevenue', label: '% of revenue', type: 'percent', align: 'right' }], rows: rowsOut },
        rowsOut, 'Common-size income statement complete (' + rowsOut.length + ' lines).'
      );
    },
    'common-size-balance-sheet': function (values, rows) {
      var items = rows.map(function (r) {
        return {
          lineItem: firstText(r.lineItem, r.lineLabel, r.item, r.label, r.name, r.account),
          amount: firstNumber(r.amount, r.value, r.total, r.balance)
        };
      }).filter(function (r) { return r.lineItem && Number.isFinite(r.amount); });
      if (!items.length) throw new Error('Add at least one balance sheet line item.');
      var totalAssetsVal = firstNumber(values.totalAssetsBase, values.totalAssets, values.assetBase);
      if (!(totalAssetsVal > 0)) {
        totalAssetsVal = sum(items.filter(function (r) { return r.amount > 0; }).map(function (r) { return r.amount; }));
      }
      if (!(totalAssetsVal > 0)) throw new Error('Enter a total assets base or include positive balance sheet items.');
      var rowsOut = items.map(function (r) {
        var pct = totalAssetsVal ? r.amount / totalAssetsVal * 100 : 0;
        return { lineItem: r.lineItem, amount: r.amount, pctOfAssets: pct };
      });
      var largest = rowsOut.slice().sort(function (a, b) { return Math.abs(b.pctOfAssets) - Math.abs(a.pctOfAssets); })[0];
      return buildResult(
        [
          { label: 'Total assets base', value: formatMoney(totalAssetsVal), tone: 'neutral', help: 'Denominator for common-size percentages.' },
          { label: 'Line items', value: formatNumber(rowsOut.length), tone: 'neutral', help: 'Total balance sheet lines analyzed.' },
          { label: 'Largest line', value: formatPercent(Math.abs(largest.pctOfAssets), 1), tone: 'neutral', help: largest.lineItem + '.' },
          { label: 'Largest amount', value: formatMoney(Math.abs(largest.amount)), tone: 'neutral', help: 'Dollar amount of the largest line.' }
        ],
        [
          { title: 'Largest line', value: largest.lineItem, tone: 'neutral', text: formatMoney(largest.amount) + ' (' + formatPercent(largest.pctOfAssets, 1) + ' of total assets).' },
          { title: 'Asset base', value: formatMoney(totalAssetsVal), tone: 'neutral', text: 'All percentages relative to total assets.' },
          { title: 'Lines analyzed', value: formatNumber(rowsOut.length), tone: 'neutral', text: 'Assets, liabilities, and equity lines.' },
          { title: 'Composition view', value: 'Active', tone: 'positive', text: 'Each line shows its share of total assets.' }
        ],
        [
          { title: 'Asset composition reveals business model', text: 'Capital-intensive businesses have high fixed assets; service firms have high receivables and intangibles.' },
          { title: 'Liability structure shows risk', text: 'High short-term liabilities relative to total assets signal liquidity risk.' },
          { title: 'Compare across periods', text: 'Shifts in common-size percentages over time reveal structural balance sheet changes.' },
          { title: 'Use total assets as the base', text: 'Total assets is the standard base for common-size balance sheets — both sides of the equation equal 100%.' }
        ],
        [
          { label: 'Total assets', value: formatMoney(totalAssetsVal) },
          { label: 'Lines', value: formatNumber(rowsOut.length) },
          { label: 'Largest', value: largest.lineItem }
        ],
        { columns: [{ key: 'lineItem', label: 'Line item', type: 'text' }, { key: 'amount', label: 'Amount', type: 'money', align: 'right' }, { key: 'pctOfAssets', label: '% of assets', type: 'percent', align: 'right' }], rows: rowsOut },
        rowsOut, 'Common-size balance sheet complete (' + rowsOut.length + ' lines).'
      );
    },
    'horizontal-analysis-tool': function (values, rows) {
      var materialThreshold = firstNumber(values.materialityPct, values.materiality, 10);
      var baseLabel = firstText(values.baseYearLabel, values.priorPeriodLabel, 'Prior');
      var normalizedRows = rows.map(function (r) {
        return {
          lineItem: firstText(r.lineItem, r.lineLabel, r.item, r.label, r.account),
          priorPeriod: firstNumber(r.priorPeriod, r.baseYear, r.year0),
          midPeriod: firstNumber(r.year1, r.midPeriod, r.period1),
          currentPeriod: firstNumber(r.currentPeriod, r.year2, r.period2),
          usesThreePeriods: Number.isFinite(firstNumber(r.baseYear)) && Number.isFinite(firstNumber(r.year2))
        };
      });
      var hasThreePeriods = normalizedRows.some(function (r) { return r.usesThreePeriods; });
      var items = normalizedRows.filter(function (r) {
        return r.lineItem && Number.isFinite(r.priorPeriod) && Number.isFinite(r.currentPeriod);
      });
      if (!items.length) throw new Error('Add at least one line item with current and prior period amounts.');
      if (hasThreePeriods) {
        var hasMidPeriod = items.some(function (r) { return Number.isFinite(r.midPeriod); });
        var rowsOutThree = items.map(function (r) {
          var bridgeBase = Number.isFinite(r.midPeriod) ? r.midPeriod : r.priorPeriod;
          var firstChange = Number.isFinite(r.midPeriod) ? r.midPeriod - r.priorPeriod : null;
          var firstChangePct = Number.isFinite(firstChange) && r.priorPeriod !== 0 ? firstChange / Math.abs(r.priorPeriod) * 100 : null;
          var secondChange = r.currentPeriod - bridgeBase;
          var secondChangePct = bridgeBase !== 0 ? secondChange / Math.abs(bridgeBase) * 100 : null;
          var totalChange = r.currentPeriod - r.priorPeriod;
          var totalChangePct = r.priorPeriod !== 0 ? totalChange / Math.abs(r.priorPeriod) * 100 : null;
          var acceleration = firstChangePct != null && secondChangePct != null ? secondChangePct - firstChangePct : null;
          return {
            lineItem: r.lineItem,
            priorPeriod: r.priorPeriod,
            midPeriod: r.midPeriod,
            currentPeriod: r.currentPeriod,
            totalChange: totalChange,
            totalChangePct: totalChangePct,
            acceleration: acceleration
          };
        }).sort(function (a, b) { return Math.abs(b.totalChange) - Math.abs(a.totalChange); });
        var totalPriorThree = sum(items.map(function (r) { return r.priorPeriod; }));
        var totalCurrentThree = sum(items.map(function (r) { return r.currentPeriod; }));
        var totalChangeThree = totalCurrentThree - totalPriorThree;
        var totalChangePctThree = totalPriorThree !== 0 ? totalChangeThree / Math.abs(totalPriorThree) * 100 : 0;
        var acceleratingLines = rowsOutThree.filter(function (r) { return r.acceleration != null && r.acceleration > 0; }).length;
        var deceleratingLines = rowsOutThree.filter(function (r) { return r.acceleration != null && r.acceleration < 0; }).length;
        var materialLinesThree = rowsOutThree.filter(function (r) { return r.totalChangePct != null && Math.abs(r.totalChangePct) >= materialThreshold; }).length;
        var detailColumns = [
          { key: 'lineItem', label: 'Line item', type: 'text' },
          { key: 'priorPeriod', label: baseLabel, type: 'money', align: 'right' }
        ];
        if (hasMidPeriod) {
          detailColumns.push({ key: 'midPeriod', label: 'Year 1', type: 'money', align: 'right' });
        }
        detailColumns.push(
          { key: 'currentPeriod', label: hasMidPeriod ? 'Year 2' : 'Current', type: 'money', align: 'right' },
          { key: 'totalChange', label: 'Change $', type: 'money', align: 'right' },
          { key: 'totalChangePct', label: 'Change %', type: 'percent', align: 'right' }
        );
        return buildResult(
          [
            { label: 'Net change', value: formatMoney(totalChangeThree), tone: totalChangeThree < 0 ? 'warning' : 'positive', help: 'Total change from the base period to the latest period.' },
            { label: 'Net change %', value: formatPercent(totalChangePctThree, 1), tone: 'neutral', help: 'Percentage change from the base period total.' },
            { label: 'Material changes', value: formatNumber(materialLinesThree), tone: materialLinesThree > 0 ? 'warning' : 'neutral', help: 'Lines with change exceeding ' + materialThreshold + '% from the base period.' },
            { label: 'Lines analyzed', value: formatNumber(rowsOutThree.length), tone: 'neutral', help: 'Number of line items compared.' }
          ],
          [
            { title: 'Largest total change', value: rowsOutThree[0].lineItem, tone: Math.abs(rowsOutThree[0].totalChange) > 0 ? 'warning' : 'neutral', text: formatMoney(rowsOutThree[0].totalChange) + ' (' + (rowsOutThree[0].totalChangePct != null ? formatPercent(rowsOutThree[0].totalChangePct, 1) : 'N/A') + ') from ' + baseLabel + '.' },
            { title: 'Accelerating lines', value: formatNumber(acceleratingLines), tone: acceleratingLines > 0 ? 'positive' : 'neutral', text: 'Lines whose latest-period growth rate exceeds the prior step-up.' },
            { title: 'Decelerating lines', value: formatNumber(deceleratingLines), tone: deceleratingLines > 0 ? 'warning' : 'neutral', text: 'Lines whose latest-period growth rate slowed versus the prior step-up.' },
            { title: 'Materiality threshold', value: formatPercent(materialThreshold, 0), tone: 'neutral', text: 'Lines above this change threshold are flagged.' }
          ],
          [
            { title: 'Base-year math is the anchor', text: 'The latest-period change should be reviewed against the base period first so teams do not lose the long-run trend.' },
            { title: 'Use the middle period to spot acceleration', text: 'A three-period view makes it clear whether a line is speeding up or slowing down rather than simply changing.' },
            { title: 'Dollar and percentage changes tell different stories', text: 'A large percentage change on a small line may not matter; a modest percentage on a large line often does.' },
            { title: 'Pair with common-size analysis', text: 'Horizontal analysis shows the direction of change; common-size analysis shows the structural weight of each line.' }
          ],
          [
            { label: baseLabel + ' total', value: formatMoney(totalPriorThree) },
            { label: 'Latest total', value: formatMoney(totalCurrentThree) },
            { label: 'Change', value: formatMoney(totalChangeThree) },
            { label: 'Change %', value: formatPercent(totalChangePctThree, 1) },
            { label: 'Material lines', value: formatNumber(materialLinesThree) }
          ],
          { columns: detailColumns, rows: rowsOutThree },
          rowsOutThree, 'Horizontal analysis complete: ' + formatMoney(totalChangeThree) + ' net change (' + formatPercent(totalChangePctThree, 1) + ').'
        );
      }
      var rowsOut = items.map(function (r) {
        var change = r.currentPeriod - r.priorPeriod;
        var changePct = r.priorPeriod !== 0 ? change / Math.abs(r.priorPeriod) * 100 : null;
        return { lineItem: r.lineItem, priorPeriod: r.priorPeriod, currentPeriod: r.currentPeriod, change: change, changePct: changePct };
      }).sort(function (a, b) { return Math.abs(b.change) - Math.abs(a.change); });
      var totalPrior = sum(items.map(function (r) { return r.priorPeriod; }));
      var totalCurrent = sum(items.map(function (r) { return r.currentPeriod; }));
      var totalChange = totalCurrent - totalPrior;
      var totalChangePct = totalPrior !== 0 ? totalChange / Math.abs(totalPrior) * 100 : 0;
      var growingLines = rowsOut.filter(function (r) { return r.change > 0; }).length;
      var decliningLines = rowsOut.filter(function (r) { return r.change < 0; }).length;
      var materialLines = rowsOut.filter(function (r) { return r.changePct != null && Math.abs(r.changePct) >= materialThreshold; }).length;
      return buildResult(
        [
          { label: 'Net change', value: formatMoney(totalChange), tone: totalChange < 0 ? 'warning' : 'positive', help: 'Total change from prior to current period.' },
          { label: 'Net change %', value: formatPercent(totalChangePct, 1), tone: 'neutral', help: 'Percentage change in the total.' },
          { label: 'Material changes', value: formatNumber(materialLines), tone: materialLines > 0 ? 'warning' : 'neutral', help: 'Lines with change exceeding ' + materialThreshold + '% threshold.' },
          { label: 'Lines analyzed', value: formatNumber(rowsOut.length), tone: 'neutral', help: 'Number of line items compared.' }
        ],
        [
          { title: 'Largest change', value: rowsOut[0].lineItem, tone: Math.abs(rowsOut[0].change) > 0 ? 'warning' : 'neutral', text: formatMoney(rowsOut[0].change) + ' (' + (rowsOut[0].changePct != null ? formatPercent(rowsOut[0].changePct, 1) : 'N/A') + ').' },
          { title: 'Growing lines', value: formatNumber(growingLines), tone: 'neutral', text: 'Lines that increased period over period.' },
          { title: 'Declining lines', value: formatNumber(decliningLines), tone: 'neutral', text: 'Lines that decreased period over period.' },
          { title: 'Materiality threshold', value: formatPercent(materialThreshold, 0), tone: 'neutral', text: 'Lines with changes above this percentage are flagged.' }
        ],
        [
          { title: 'Horizontal analysis shows growth and decline', text: 'Comparing the same line across periods reveals trends that common-size analysis alone cannot show.' },
          { title: 'Dollar and percentage changes tell different stories', text: 'A large percentage change on a small line may not matter; a small percentage on a large line might.' },
          { title: 'Focus on material changes first', text: 'Set a materiality threshold and investigate the lines that exceed it before reviewing everything.' },
          { title: 'Pair with common-size analysis', text: 'Horizontal analysis shows rate of change; common-size shows proportional weight — use both.' }
        ],
        [
          { label: 'Prior total', value: formatMoney(totalPrior) },
          { label: 'Current total', value: formatMoney(totalCurrent) },
          { label: 'Change', value: formatMoney(totalChange) },
          { label: 'Change %', value: formatPercent(totalChangePct, 1) },
          { label: 'Material lines', value: formatNumber(materialLines) }
        ],
        { columns: [{ key: 'lineItem', label: 'Line item', type: 'text' }, { key: 'priorPeriod', label: 'Prior', type: 'money', align: 'right' }, { key: 'currentPeriod', label: 'Current', type: 'money', align: 'right' }, { key: 'change', label: 'Change $', type: 'money', align: 'right' }, { key: 'changePct', label: 'Change %', type: 'percent', align: 'right' }], rows: rowsOut },
        rowsOut, 'Horizontal analysis complete: ' + formatMoney(totalChange) + ' net change (' + formatPercent(totalChangePct, 1) + ').'
      );
    },
    'industry-benchmark-comparison': function (values, rows) {
      var items = rows.map(function (r) {
        return {
          metric: firstText(r.metric, r.lineItem, r.lineLabel, r.label),
          companyValue: firstNumber(r.companyValue, r.company, r.actualValue, r.value),
          benchmarkValue: firstNumber(r.benchmarkValue, r.benchmark, r.targetValue),
          direction: firstText(r.direction, r.preferredDirection)
        };
      }).filter(function (r) { return r.metric && Number.isFinite(r.companyValue) && Number.isFinite(r.benchmarkValue); });
      if (!items.length) {
        items = [
          { metric: 'Gross margin', companyValue: firstNumber(values.grossMargin), benchmarkValue: firstNumber(values.benchGrossMargin), direction: 'higher' },
          { metric: 'Operating margin', companyValue: firstNumber(values.operatingMargin), benchmarkValue: firstNumber(values.benchOperatingMargin), direction: 'higher' },
          { metric: 'Net margin', companyValue: firstNumber(values.netMargin), benchmarkValue: firstNumber(values.benchNetMargin), direction: 'higher' },
          { metric: 'ROE', companyValue: firstNumber(values.roe), benchmarkValue: firstNumber(values.benchROE), direction: 'higher' },
          { metric: 'Debt-to-equity', companyValue: firstNumber(values.debtToEquity), benchmarkValue: firstNumber(values.benchDebtToEquity), direction: 'lower' },
          { metric: 'Current ratio', companyValue: firstNumber(values.currentRatio), benchmarkValue: firstNumber(values.benchCurrentRatio), direction: 'higher' }
        ].filter(function (r) { return Number.isFinite(r.companyValue) && Number.isFinite(r.benchmarkValue); });
      }
      if (!items.length) throw new Error('Add at least one metric with company and benchmark values.');
      var rowsOut = items.map(function (r) {
        var gap = r.companyValue - r.benchmarkValue;
        var gapPct = r.benchmarkValue !== 0 ? gap / Math.abs(r.benchmarkValue) * 100 : 0;
        var favorable = r.direction === 'lower' ? gap < 0 : gap > 0;
        return { metric: r.metric, companyValue: r.companyValue, benchmarkValue: r.benchmarkValue, gap: gap, gapPct: gapPct, status: favorable ? 'Above benchmark' : (gap === 0 ? 'At benchmark' : 'Below benchmark') };
      });
      var aboveBenchmark = rowsOut.filter(function (r) { return r.status === 'Above benchmark'; }).length;
      var belowBenchmark = rowsOut.filter(function (r) { return r.status === 'Below benchmark'; }).length;
      var scorePct = rowsOut.length ? aboveBenchmark / rowsOut.length * 100 : 0;
      var strongest = rowsOut.filter(function (r) { return r.status === 'Above benchmark'; }).sort(function (a, b) { return Math.abs(b.gapPct) - Math.abs(a.gapPct); })[0];
      var weakest = rowsOut.filter(function (r) { return r.status === 'Below benchmark'; }).sort(function (a, b) { return Math.abs(b.gapPct) - Math.abs(a.gapPct); })[0];
      return buildResult(
        [
          { label: 'Metrics compared', value: formatNumber(rowsOut.length), tone: 'neutral', help: 'Total metrics benchmarked.' },
          { label: 'Above benchmark', value: formatNumber(aboveBenchmark), tone: aboveBenchmark > 0 ? 'positive' : 'neutral', help: 'Metrics where company outperforms.' },
          { label: 'Below benchmark', value: formatNumber(belowBenchmark), tone: belowBenchmark > 0 ? 'warning' : 'positive', help: 'Metrics where company underperforms.' },
          { label: 'Score', value: formatPercent(scorePct, 0), tone: scorePct >= 50 ? 'positive' : 'warning', help: 'Percentage of metrics at or above benchmark.' }
        ],
        [
          { title: 'Strongest metric', value: strongest ? strongest.metric : 'None', tone: 'positive', text: 'Largest outperformance vs benchmark.' },
          { title: 'Weakest metric', value: weakest ? weakest.metric : 'None', tone: 'warning', text: 'Largest underperformance vs benchmark.' },
          { title: 'Above', value: formatNumber(aboveBenchmark), tone: 'positive', text: 'Metrics outperforming industry.' },
          { title: 'Below', value: formatNumber(belowBenchmark), tone: belowBenchmark > 0 ? 'warning' : 'positive', text: 'Metrics underperforming industry.' }
        ],
        [
          { title: 'Benchmarks provide context', text: 'A ratio is only meaningful when compared to peers in the same industry and size category.' },
          { title: 'Direction matters', text: 'Some metrics are better when higher (margins, coverage); others are better when lower (leverage, DSO).' },
          { title: 'Use multiple sources', text: 'Industry benchmarks from RMA, BLS, IBISWorld, or public company data all have different biases.' },
          { title: 'Gap analysis drives action', text: 'Focus on the metrics with the largest negative gap — those represent the biggest improvement opportunities.' }
        ],
        [
          { label: 'Total metrics', value: formatNumber(rowsOut.length) },
          { label: 'Above', value: formatNumber(aboveBenchmark) },
          { label: 'Below', value: formatNumber(belowBenchmark) }
        ],
        { columns: [{ key: 'metric', label: 'Metric', type: 'text' }, { key: 'companyValue', label: 'Company', type: 'number', align: 'right' }, { key: 'benchmarkValue', label: 'Benchmark', type: 'number', align: 'right' }, { key: 'gap', label: 'Gap', type: 'number', align: 'right' }, { key: 'status', label: 'Status', type: 'text' }], rows: rowsOut },
        rowsOut, 'Benchmark comparison: ' + aboveBenchmark + ' of ' + rowsOut.length + ' metrics above benchmark.'
      );
    },
    'free-cash-flow-calculator': function (values) {
      var netIncome = values.netIncome;
      var depreciation = values.depreciation || 0;
      var amortization = values.amortization || 0;
      var changeInWC = values.changeInWorkingCapital || 0;
      var capex = values.capitalExpenditures || 0;
      var otherNonCash = firstNumber(values.otherNonCash, values.otherAdjustments, 0) || 0;
      var interestExpense = firstNumber(values.interestExpense, 0) || 0;
      var taxRatePct = firstNumber(values.taxRate, values.taxRatePct, 0) || 0;
      var debtRepayment = values.debtRepayment || 0;
      var netBorrowing = values.netBorrowing || 0;
      var revenue = values.revenue || 0;
      var marketCap = values.marketCap || 0;
      if (netIncome == null) throw new Error('Enter net income to calculate free cash flow.');
      var cfo = netIncome + depreciation + amortization + otherNonCash - changeInWC;
      var unleveredFcf = cfo - capex;
      var afterTaxInterest = interestExpense * (1 - taxRatePct / 100);
      var fcfe = unleveredFcf - debtRepayment + netBorrowing;
      var fcff = fcfe + afterTaxInterest + debtRepayment - netBorrowing;
      var fcfMargin = revenue > 0 ? fcfe / revenue * 100 : 0;
      var fcfYield = marketCap > 0 ? fcfe / marketCap * 100 : null;
      var capexToRevenue = revenue > 0 ? capex / revenue * 100 : 0;
      return buildResult(
        [
          { label: 'Operating cash flow', value: formatMoney(cfo), tone: cfo < 0 ? 'critical' : 'positive', help: 'Net income + D&A + non-cash − working capital change.' },
          { label: 'FCFE', value: formatMoney(fcfe), tone: fcfe < 0 ? 'critical' : 'positive', help: 'Cash flow available to equity after capex and financing flows.' },
          { label: 'FCFF', value: formatMoney(fcff), tone: fcff < 0 ? 'critical' : 'positive', help: 'Cash flow available to all capital providers before leverage effects.' },
          { label: 'FCF margin', value: formatPercent(fcfMargin, 1), tone: fcfMargin < 5 ? 'warning' : 'positive', help: 'FCFE / revenue.' }
        ],
        [
          { title: 'Net income', value: formatMoney(netIncome), tone: 'neutral', text: 'Starting point for the indirect method.' },
          { title: 'D&A add-back', value: formatMoney(depreciation + amortization), tone: 'neutral', text: 'Non-cash charges added back.' },
          { title: 'Working capital impact', value: formatMoney(-changeInWC), tone: changeInWC > 0 ? 'warning' : 'positive', text: changeInWC > 0 ? 'WC increase consumed cash.' : 'WC decrease released cash.' },
          { title: 'Capex intensity', value: formatPercent(capexToRevenue, 1), tone: capexToRevenue > 15 ? 'warning' : 'neutral', text: 'Capital expenditures / revenue.' },
          { title: 'After-tax interest', value: formatMoney(afterTaxInterest), tone: 'neutral', text: 'Interest expense after the tax shield.' },
          { title: 'FCF yield', value: fcfYield != null ? formatPercent(fcfYield, 1) : 'N/A', tone: fcfYield != null && fcfYield >= 5 ? 'positive' : 'neutral', text: marketCap > 0 ? 'FCFE / market capitalization.' : 'Enter market cap to calculate FCF yield.' }
        ],
        [
          { title: 'FCF is the cash available for allocation', text: 'Free cash flow is what remains after maintaining and growing the asset base — it funds dividends, buybacks, and debt reduction.' },
          { title: 'Net income ≠ cash flow', text: 'Accruals, working capital changes, and capex create a gap between earnings and cash — FCF bridges it.' },
          { title: 'Negative FCF is not always bad', text: 'High-growth companies may have negative FCF due to investment — context matters.' },
          { title: 'FCF margin benchmarks vary by industry', text: 'Asset-light businesses typically produce 15-25% FCF margins; capital-intensive industries run much lower.' }
        ],
        [
          { label: 'Net income', value: formatMoney(netIncome) },
          { label: 'D&A', value: formatMoney(depreciation + amortization) },
          { label: 'WC change', value: formatMoney(changeInWC) },
          { label: 'Other non-cash', value: formatMoney(otherNonCash) },
          { label: 'CFO', value: formatMoney(cfo) },
          { label: 'Capex', value: formatMoney(capex) },
          { label: 'FCFE', value: formatMoney(fcfe) },
          { label: 'FCFF', value: formatMoney(fcff) },
          { label: 'FCF margin', value: formatPercent(fcfMargin, 1) },
          { label: 'FCF yield', value: fcfYield != null ? formatPercent(fcfYield, 1) : 'N/A' }
        ],
        null,
        [{ 'Net income': netIncome, 'D&A': depreciation + amortization, 'WC change': changeInWC, 'Non-cash': otherNonCash, CFO: cfo, Capex: capex, 'After-tax interest': afterTaxInterest, FCFE: fcfe, FCFF: fcff, 'FCF margin': fcfMargin.toFixed(1) + '%', 'FCF yield': fcfYield != null ? fcfYield.toFixed(1) + '%' : 'N/A' }],
        'Free cash flow: FCFE ' + formatMoney(fcfe) + ', FCFF ' + formatMoney(fcff) + ', margin ' + formatPercent(fcfMargin, 1) + '.'
      );
    },
    'ocf-to-net-income-reconciler': function (values) {
      var netIncome = values.netIncome;
      var depreciation = values.depreciation || 0;
      var amortization = values.amortization || 0;
      var stockBasedComp = values.stockBasedComp || 0;
      var deferredTax = values.deferredTax || 0;
      var otherNonCash = firstNumber(values.otherNonCash, values.otherAdjustments, 0) || 0;
      var changeAR = values.changeAR || 0;
      var changeInventory = values.changeInventory || 0;
      var changeAP = values.changeAP || 0;
      var changeAccruals = values.changeAccruals || 0;
      var changePrepaid = values.changePrepaid || 0;
      var changeDeferredRev = values.changeDeferredRevenue || 0;
      if (netIncome == null) throw new Error('Enter net income.');
      var totalNonCash = depreciation + amortization + stockBasedComp + deferredTax + otherNonCash;
      var totalWC = -changeAR - changeInventory - changePrepaid + changeAP + changeAccruals + changeDeferredRev;
      var ocf = netIncome + totalNonCash + totalWC;
      var quality = netIncome !== 0 ? ocf / netIncome : 0;
      var accrualRatio = Math.abs(netIncome) > 0 ? (netIncome - ocf) / Math.abs(netIncome) * 100 : 0;
      return buildResult(
        [
          { label: 'Net income', value: formatMoney(netIncome), tone: 'neutral', help: 'Starting point.' },
          { label: 'Operating cash flow', value: formatMoney(ocf), tone: ocf < 0 ? 'critical' : 'positive', help: 'Net income + non-cash + WC changes.' },
          { label: 'Cash-to-income ratio', value: formatRatio(quality), tone: quality < 0.8 ? 'warning' : 'positive', help: 'OCF / net income. >1.0 indicates strong earnings quality.' },
          { label: 'Accrual component', value: formatPercent(accrualRatio, 1), tone: Math.abs(accrualRatio) > 30 ? 'warning' : 'neutral', help: '(Net income − OCF) / |net income|.' }
        ],
        [
          { title: 'Non-cash add-backs', value: formatMoney(totalNonCash), tone: 'neutral', text: 'D&A, SBC, deferred tax, other.' },
          { title: 'Working capital impact', value: formatMoney(totalWC), tone: totalWC < 0 ? 'warning' : 'positive', text: totalWC < 0 ? 'WC consumed cash.' : 'WC released cash.' },
          { title: 'Earnings quality', value: quality >= 1 ? 'Strong' : (quality >= 0.8 ? 'Adequate' : 'Weak'), tone: quality < 0.8 ? 'warning' : 'positive', text: 'OCF / net income = ' + formatRatio(quality) + '.' },
          { title: 'AR impact', value: formatMoney(-changeAR), tone: changeAR > 0 ? 'warning' : 'positive', text: changeAR > 0 ? 'AR growth consumed ' + formatMoney(changeAR) + '.' : 'AR decline released cash.' }
        ],
        [
          { title: 'OCF > net income signals high earnings quality', text: 'When operating cash flow exceeds net income, earnings are well-supported by actual cash generation.' },
          { title: 'AR and inventory growth consume cash', text: 'Increases in AR and inventory mean revenue and COGS are recognized but cash has not been collected or converted yet.' },
          { title: 'AP and deferrals improve OCF temporarily', text: 'Increasing payables and deferred revenue boost OCF in the current period but reverse in future periods.' },
          { title: 'Persistent accrual mismatches warrant investigation', text: 'If OCF consistently lags net income, investigate whether revenue recognition or expense timing is aggressive.' }
        ],
        [
          { label: 'Net income', value: formatMoney(netIncome) },
          { label: 'Non-cash', value: formatMoney(totalNonCash) },
          { label: 'WC changes', value: formatMoney(totalWC) },
          { label: 'OCF', value: formatMoney(ocf) },
          { label: 'Cash/income', value: formatRatio(quality) }
        ],
        null,
        [{ 'Net income': netIncome, 'D&A': depreciation + amortization, SBC: stockBasedComp, 'Def. tax': deferredTax, 'Other NC': otherNonCash, 'WC total': totalWC, OCF: ocf, 'Quality': quality.toFixed(2) + 'x' }],
        'OCF: ' + formatMoney(ocf) + ', cash-to-income ' + formatRatio(quality) + '.'
      );
    },
    '3-statement-model-starter': function (values) {
      var revenue = values.revenue;
      var revGrowthPct = firstNumber(values.revenueGrowth, values.revenueGrowthPct, 0) || 0;
      var grossMarginPct = values.grossMarginPct || 50;
      var opexPct = values.opexPct || 30;
      var taxRatePct = firstNumber(values.taxRate, values.taxRatePct, 21) || 21;
      var capexPct = values.capexPct || 5;
      var daPct = values.daPct || 4;
      var wcPctRevenue = firstNumber(values.nwcPctRevenue, values.wcPctRevenue, 10) || 10;
      var debtPct = values.debtPctAssets || 40;
      var interestRatePct = values.interestRatePct || 5;
      var forecastYears = Math.max(1, Math.min(5, Math.round(firstNumber(values.forecastYears, 3) || 3)));
      if (!(revenue > 0)) throw new Error('Enter a positive revenue amount.');
      var periods = [];
      var currentRev = revenue;
      var priorWC = revenue * wcPctRevenue / 100;
      for (var yr = 0; yr <= forecastYears; yr++) {
        if (yr > 0) currentRev = currentRev * (1 + revGrowthPct / 100);
        var cogs = currentRev * (1 - grossMarginPct / 100);
        var grossProfit = currentRev - cogs;
        var opex = currentRev * opexPct / 100;
        var da = currentRev * daPct / 100;
        var ebit = grossProfit - opex - da;
        var totalAssets = currentRev * 1.2;
        var debt = totalAssets * debtPct / 100;
        var interest = debt * interestRatePct / 100;
        var ebt = ebit - interest;
        var tax = Math.max(ebt * taxRatePct / 100, 0);
        var netIncome = ebt - tax;
        var capex = currentRev * capexPct / 100;
        var wc = currentRev * wcPctRevenue / 100;
        var deltaWc = yr === 0 ? 0 : wc - priorWC;
        var ocf = netIncome + da - deltaWc;
        var fcf = ocf - capex;
        var equity = totalAssets - debt;
        periods.push({ year: yr === 0 ? 'Base' : 'Year ' + yr, revenue: currentRev, grossProfit: grossProfit, ebit: ebit, netIncome: netIncome, totalAssets: totalAssets, debt: debt, equity: equity, ocf: ocf, fcf: fcf, capex: capex, wc: wc, deltaWc: deltaWc });
        priorWC = wc;
      }
      var base = periods[0];
      var final = periods[periods.length - 1];
      var finalYearLabel = final.year;
      var revenueCagr = forecastYears > 0 && base.revenue > 0 ? (Math.pow(final.revenue / base.revenue, 1 / forecastYears) - 1) * 100 : 0;
      var exp = periods.map(function (p) { return { Year: p.year, Revenue: p.revenue.toFixed(0), 'Net income': p.netIncome.toFixed(0), 'Total assets': p.totalAssets.toFixed(0), Debt: p.debt.toFixed(0), Equity: p.equity.toFixed(0), 'Delta NWC': p.deltaWc.toFixed(0), FCF: p.fcf.toFixed(0) }; });
      return buildResult(
        [
          { label: finalYearLabel + ' revenue', value: formatMoney(final.revenue), tone: 'neutral', help: 'Projected revenue in the final forecast year.' },
          { label: finalYearLabel + ' net income', value: formatMoney(final.netIncome), tone: final.netIncome < 0 ? 'critical' : 'positive', help: 'Projected net income in the final forecast year.' },
          { label: finalYearLabel + ' FCF', value: formatMoney(final.fcf), tone: final.fcf < 0 ? 'warning' : 'positive', help: 'Projected free cash flow in the final forecast year.' },
          { label: 'Revenue CAGR', value: formatPercent(revenueCagr, 1), tone: 'neutral', help: 'Compound annual growth rate from base to final forecast year.' }
        ],
        [
          { title: 'Gross margin', value: formatPercent(grossMarginPct, 1), tone: 'neutral', text: 'Assumed constant across all years.' },
          { title: 'Operating margin', value: formatPercent(final.ebit / final.revenue * 100, 1), tone: 'neutral', text: 'EBIT / revenue in the final forecast year.' },
          { title: 'Net margin', value: formatPercent(final.revenue ? final.netIncome / final.revenue * 100 : 0, 1), tone: 'neutral', text: 'Net income / revenue in the final forecast year.' },
          { title: 'NWC investment', value: formatMoney(final.deltaWc), tone: final.deltaWc > 0 ? 'warning' : 'positive', text: 'Incremental working capital absorbed in the final forecast year.' },
          { title: 'D/E ratio (' + finalYearLabel + ')', value: formatRatio(final.equity ? final.debt / final.equity : 0), tone: 'neutral', text: 'Projected leverage.' }
        ],
        [
          { title: 'Start with revenue assumptions', text: 'Revenue growth drives all three statements — get this assumption right and the model cascades correctly.' },
          { title: 'Keep margins constant initially', text: 'Start with flat margin assumptions, then adjust for scale effects, pricing changes, or mix shifts.' },
          { title: 'Balance sheet ties to the income statement', text: 'Assets are driven by revenue (WC, capex), liabilities by capital structure, equity by retained earnings.' },
          { title: 'Cash flow is the check', text: 'If FCF is persistently negative with no clear growth investment, the revenue assumptions may be too aggressive.' }
        ],
        [
          { label: 'Base revenue', value: formatMoney(revenue) },
          { label: 'Growth rate', value: formatPercent(revGrowthPct, 1) },
          { label: 'Gross margin', value: formatPercent(grossMarginPct, 1) },
          { label: 'Opex %', value: formatPercent(opexPct, 1) },
          { label: 'Tax rate', value: formatPercent(taxRatePct, 1) },
          { label: 'Capex %', value: formatPercent(capexPct, 1) },
          { label: 'NWC %', value: formatPercent(wcPctRevenue, 1) },
          { label: 'Forecast years', value: formatNumber(forecastYears) }
        ],
        { columns: [{ key: 'year', label: 'Year', type: 'text' }, { key: 'revenue', label: 'Revenue', type: 'money', align: 'right' }, { key: 'grossProfit', label: 'Gross profit', type: 'money', align: 'right' }, { key: 'netIncome', label: 'Net income', type: 'money', align: 'right' }, { key: 'totalAssets', label: 'Assets', type: 'money', align: 'right' }, { key: 'fcf', label: 'FCF', type: 'money', align: 'right' }], rows: periods },
        exp, '3-statement model: ' + finalYearLabel + ' revenue ' + formatMoney(final.revenue) + ', net income ' + formatMoney(final.netIncome) + ', FCF ' + formatMoney(final.fcf) + '.'
      );
    },
    'accruals-ratio-earnings-quality': function (values) {
      var netIncome = firstNumber(values.netIncome);
      var ocf = firstNumber(values.operatingCashFlow, values.cashFlowFromOps, values.cashFlowFromOperations);
      var totalAssetsBegin = firstNumber(values.totalAssetsBeginning, values.totalAssetsBegin, values.totalAssetsStart) || 0;
      var totalAssetsEnd = firstNumber(values.totalAssetsEnd, values.totalAssetsEnding, values.totalAssetsClose) || 0;
      if (netIncome == null || ocf == null) throw new Error('Enter net income and operating cash flow.');
      var totalAccruals = netIncome - ocf;
      var avgAssets = (totalAssetsBegin + totalAssetsEnd) / 2;
      var accrualRatioBs = avgAssets > 0 ? totalAccruals / avgAssets * 100 : 0;
      var accrualRatioNi = netIncome !== 0 ? totalAccruals / Math.abs(netIncome) * 100 : 0;
      var cashComponent = ocf;
      var accrualComponent = totalAccruals;
      var qualityScore = netIncome !== 0 ? ocf / netIncome : 0;
      var qualityLabel = qualityScore >= 1.2 ? 'High' : (qualityScore >= 0.8 ? 'Adequate' : (qualityScore >= 0 ? 'Low' : 'Negative'));
      var flag = Math.abs(accrualRatioBs) > 10 ? 'Elevated accruals — investigate' : 'Accruals within normal range';
      return buildResult(
        [
          { label: 'Total accruals', value: formatMoney(totalAccruals), tone: totalAccruals > 0 ? 'warning' : 'positive', help: 'Net income minus operating cash flow.' },
          { label: 'Accrual ratio (BS)', value: formatPercent(accrualRatioBs, 1), tone: Math.abs(accrualRatioBs) > 10 ? 'warning' : 'positive', help: 'Total accruals / average total assets.' },
          { label: 'Earnings quality', value: qualityLabel, tone: qualityScore < 0.8 ? 'warning' : 'positive', help: 'Based on OCF/NI ratio.' },
          { label: 'Cash-to-income', value: formatRatio(qualityScore), tone: qualityScore < 0.8 ? 'warning' : 'positive', help: 'Operating cash flow / net income.' }
        ],
        [
          { title: 'Net income', value: formatMoney(netIncome), tone: 'neutral', text: 'Accrual-basis earnings.' },
          { title: 'Operating cash flow', value: formatMoney(ocf), tone: ocf < 0 ? 'critical' : 'positive', text: 'Cash-basis earnings.' },
          { title: 'Accrual component', value: formatPercent(accrualRatioNi, 1) + ' of NI', tone: Math.abs(accrualRatioNi) > 30 ? 'warning' : 'neutral', text: 'Portion of net income from accruals vs cash.' },
          { title: 'Flag', value: flag, tone: Math.abs(accrualRatioBs) > 10 ? 'warning' : 'positive', text: Math.abs(accrualRatioBs) > 10 ? 'Accrual ratio above 10% of assets — investigate revenue recognition and expense timing.' : 'Accrual levels appear normal.' }
        ],
        [
          { title: 'Low accruals signal high earnings quality', text: 'When OCF exceeds net income, earnings are primarily cash-based and more sustainable.' },
          { title: 'High accruals may precede earnings reversals', text: 'Academic research (Sloan 1996) shows that high-accrual firms tend to have lower future earnings.' },
          { title: 'The balance sheet ratio normalizes for size', text: 'Dividing by average total assets makes the accrual ratio comparable across companies of different sizes.' },
          { title: 'Investigate the sources of accruals', text: 'Large accruals may come from revenue recognition timing, inventory build, or deferred costs — the source matters.' }
        ],
        [
          { label: 'Net income', value: formatMoney(netIncome) },
          { label: 'OCF', value: formatMoney(ocf) },
          { label: 'Total accruals', value: formatMoney(totalAccruals) },
          { label: 'Avg assets', value: formatMoney(avgAssets) },
          { label: 'Accrual ratio (BS)', value: formatPercent(accrualRatioBs, 1) },
          { label: 'Accrual ratio (NI)', value: formatPercent(accrualRatioNi, 1) },
          { label: 'Quality score', value: formatRatio(qualityScore) }
        ],
        null,
        [{ 'Net income': netIncome, OCF: ocf, Accruals: totalAccruals, 'Avg assets': avgAssets, 'Accrual ratio': accrualRatioBs.toFixed(1) + '%', 'Quality': qualityLabel, 'OCF/NI': qualityScore.toFixed(2) + 'x' }],
        'Earnings quality: ' + qualityLabel + ' (accrual ratio ' + formatPercent(accrualRatioBs, 1) + ', OCF/NI ' + formatRatio(qualityScore) + ').'
      );
    },

    /* ── Lease & Debt Accounting / ASC 842 (171-180) ─────────────── */

    'asc-842-operating-lease-calculator': function (values) {
      var leasePayment = values.monthlyPayment;
      var leaseTerm = values.leaseTermMonths;
      var discountRate = values.discountRatePct || 5;
      var prepaidRent = values.prepaidRent || 0;
      var initialDirectCosts = values.initialDirectCosts || 0;
      var leaseIncentive = values.leaseIncentive || 0;
      if (!(leasePayment > 0) || !(leaseTerm > 0)) throw new Error('Enter a positive monthly payment and lease term.');
      var monthlyRate = discountRate / 100 / 12;
      var pvFactor = monthlyRate > 0 ? (1 - Math.pow(1 + monthlyRate, -leaseTerm)) / monthlyRate : leaseTerm;
      var leaseLiability = leasePayment * pvFactor;
      var rouAsset = leaseLiability + prepaidRent + initialDirectCosts - leaseIncentive;
      var totalLeasePayments = leasePayment * leaseTerm;
      var totalInterest = totalLeasePayments - leaseLiability;
      var monthlyExpense = totalLeasePayments / leaseTerm;
      var schedule = [];
      var liabilityBal = leaseLiability;
      var rouBal = rouAsset;
      var monthlyAmort = rouAsset / leaseTerm;
      for (var m = 1; m <= Math.min(leaseTerm, 360); m++) {
        var intExp = liabilityBal * monthlyRate;
        var princReduction = leasePayment - intExp;
        liabilityBal = Math.max(liabilityBal - princReduction, 0);
        rouBal = Math.max(rouBal - monthlyAmort, 0);
        schedule.push({ month: m, payment: leasePayment, interest: intExp, principal: princReduction, liabilityBalance: liabilityBal, rouBalance: rouBal, leaseExpense: monthlyExpense });
      }
      var exp = schedule.map(function (r) { return { Month: r.month, Payment: r.payment, Interest: r.interest.toFixed(2), Principal: r.principal.toFixed(2), 'Liability bal': r.liabilityBalance.toFixed(2), 'ROU bal': r.rouBalance.toFixed(2) }; });
      return buildResult(
        [
          { label: 'Lease liability (Day 1)', value: formatMoney(leaseLiability), tone: 'neutral', help: 'Present value of lease payments at commencement.' },
          { label: 'ROU asset (Day 1)', value: formatMoney(rouAsset), tone: 'neutral', help: 'Right-of-use asset: liability + prepaid + IDC - incentive.' },
          { label: 'Monthly lease expense', value: formatMoney(monthlyExpense), tone: 'neutral', help: 'Straight-line lease expense for operating leases.' },
          { label: 'Total payments', value: formatMoney(totalLeasePayments), tone: 'neutral', help: 'Undiscounted total lease payments.' }
        ],
        [
          { title: 'Discount rate', value: formatPercent(discountRate, 2), tone: 'neutral', text: 'Rate used to present-value the lease payments.' },
          { title: 'Lease term', value: leaseTerm + ' months', tone: 'neutral', text: formatNumber(Math.round(leaseTerm / 12)) + ' years.' },
          { title: 'Total interest', value: formatMoney(totalInterest), tone: 'neutral', text: 'Difference between total payments and initial liability.' },
          { title: 'Lease incentive', value: formatMoney(leaseIncentive), tone: leaseIncentive > 0 ? 'positive' : 'neutral', text: leaseIncentive > 0 ? 'Reduces the ROU asset.' : 'No incentive applied.' }
        ],
        [
          { title: 'Operating leases use straight-line expense', text: 'Under ASC 842, operating lease expense is recognized on a straight-line basis even though the liability amortizes using the effective interest method.' },
          { title: 'ROU asset equals liability adjusted for prepayments and incentives', text: 'Add prepaid rent and initial direct costs, subtract lease incentives to get the Day 1 ROU asset.' },
          { title: 'Use the incremental borrowing rate if implicit rate is unknown', text: 'Most lessees cannot determine the rate implicit in the lease and should use their IBR.' },
          { title: 'Reassess when terms change', text: 'Modifications, renewals, and termination options require remeasurement of the liability and ROU asset.' }
        ],
        [
          { label: 'Monthly payment', value: formatMoney(leasePayment) },
          { label: 'Lease term', value: leaseTerm + ' months' },
          { label: 'Discount rate', value: formatPercent(discountRate, 2) },
          { label: 'Lease liability', value: formatMoney(leaseLiability) },
          { label: 'ROU asset', value: formatMoney(rouAsset) },
          { label: 'Monthly expense', value: formatMoney(monthlyExpense) }
        ],
        { columns: [{ key: 'month', label: 'Month', type: 'number' }, { key: 'payment', label: 'Payment', type: 'money', align: 'right' }, { key: 'interest', label: 'Interest', type: 'money', align: 'right' }, { key: 'principal', label: 'Principal', type: 'money', align: 'right' }, { key: 'liabilityBalance', label: 'Liability bal.', type: 'money', align: 'right' }, { key: 'rouBalance', label: 'ROU bal.', type: 'money', align: 'right' }], rows: schedule.slice(0, 120) },
        exp, 'ASC 842 operating lease: liability ' + formatMoney(leaseLiability) + ', ROU asset ' + formatMoney(rouAsset) + '.'
      );
    },
    'asc-842-finance-lease-schedule': function (values) {
      var leasePayment = values.monthlyPayment;
      var leaseTerm = values.leaseTermMonths;
      var discountRate = values.discountRatePct || 5;
      var residualGuarantee = values.residualGuarantee || 0;
      var purchaseOption = values.purchaseOptionPrice || 0;
      var prepaidRent = values.prepaidRent || 0;
      var initialDirectCosts = values.initialDirectCosts || 0;
      if (!(leasePayment > 0) || !(leaseTerm > 0)) throw new Error('Enter a positive monthly payment and lease term.');
      var monthlyRate = discountRate / 100 / 12;
      var pvPayments = monthlyRate > 0 ? leasePayment * (1 - Math.pow(1 + monthlyRate, -leaseTerm)) / monthlyRate : leasePayment * leaseTerm;
      var pvResidual = residualGuarantee > 0 ? residualGuarantee / Math.pow(1 + monthlyRate, leaseTerm) : 0;
      var pvPurchase = purchaseOption > 0 ? purchaseOption / Math.pow(1 + monthlyRate, leaseTerm) : 0;
      var leaseLiability = pvPayments + pvResidual + pvPurchase;
      var rouAsset = leaseLiability + prepaidRent + initialDirectCosts;
      var monthlyAmort = rouAsset / leaseTerm;
      var endOfTermPayment = residualGuarantee + purchaseOption;
      var schedule = [];
      var liabilityBal = leaseLiability;
      var rouBal = rouAsset;
      for (var m = 1; m <= Math.min(leaseTerm, 360); m++) {
        var intExp = liabilityBal * monthlyRate;
        var payment = leasePayment + (m === leaseTerm ? endOfTermPayment : 0);
        var princReduction = payment - intExp;
        liabilityBal = Math.max(liabilityBal - princReduction, 0);
        rouBal = Math.max(rouBal - monthlyAmort, 0);
        schedule.push({ month: m, payment: payment, interest: intExp, principal: princReduction, amortization: monthlyAmort, liabilityBalance: liabilityBal, rouBalance: rouBal });
      }
      var totalInterest = sum(schedule.map(function (r) { return r.interest; }));
      var totalAmort = sum(schedule.map(function (r) { return r.amortization; }));
      var exp = schedule.map(function (r) { return { Month: r.month, Payment: r.payment, Interest: r.interest.toFixed(2), Principal: r.principal.toFixed(2), Amortization: r.amortization.toFixed(2), 'Liability bal': r.liabilityBalance.toFixed(2), 'ROU bal': r.rouBalance.toFixed(2) }; });
      return buildResult(
        [
          { label: 'Lease liability (Day 1)', value: formatMoney(leaseLiability), tone: 'neutral', help: 'PV of payments + residual guarantee + purchase option.' },
          { label: 'ROU asset (Day 1)', value: formatMoney(rouAsset), tone: 'neutral', help: 'Liability + prepaid rent + initial direct costs.' },
          { label: 'Monthly amortization', value: formatMoney(monthlyAmort), tone: 'neutral', help: 'Straight-line ROU asset amortization.' },
          { label: 'End-of-term payment', value: formatMoney(endOfTermPayment), tone: endOfTermPayment > 0 ? 'warning' : 'neutral', help: 'Residual guarantee and purchase option due at lease end.' }
        ],
        [
          { title: 'Discount rate', value: formatPercent(discountRate, 2), tone: 'neutral', text: 'Rate used to discount future payments.' },
          { title: 'Lease term', value: leaseTerm + ' months', tone: 'neutral', text: formatNumber(Math.round(leaseTerm / 12)) + ' years.' },
          { title: 'Residual guarantee', value: formatMoney(residualGuarantee), tone: residualGuarantee > 0 ? 'warning' : 'neutral', text: residualGuarantee > 0 ? 'Included in liability measurement.' : 'No residual guarantee.' },
          { title: 'Purchase option', value: formatMoney(purchaseOption), tone: purchaseOption > 0 ? 'warning' : 'neutral', text: purchaseOption > 0 ? 'Included in the ending payment and initial liability.' : 'No purchase option included.' },
          { title: 'Front-loaded expense', value: 'Yes', tone: 'warning', text: 'Finance leases produce higher total expense in early periods (interest + amortization).' }
        ],
        [
          { title: 'Finance leases split expense into interest and amortization', text: 'Unlike operating leases, finance leases recognize interest expense on the liability and amortization on the ROU asset separately.' },
          { title: 'Interest is front-loaded', text: 'The effective interest method produces higher expense in early periods and lower expense later.' },
          { title: 'ROU asset amortizes straight-line', text: 'The ROU asset is amortized on a straight-line basis over the lease term.' },
          { title: 'Purchase options affect classification', text: 'A bargain purchase option is one of the criteria that makes a lease a finance lease under ASC 842.' }
        ],
        [
          { label: 'Monthly payment', value: formatMoney(leasePayment) },
          { label: 'Lease term', value: leaseTerm + ' months' },
          { label: 'Discount rate', value: formatPercent(discountRate, 2) },
          { label: 'Liability', value: formatMoney(leaseLiability) },
          { label: 'ROU asset', value: formatMoney(rouAsset) },
          { label: 'Total interest', value: formatMoney(totalInterest) },
          { label: 'End payment', value: formatMoney(endOfTermPayment) },
          { label: 'Total amortization', value: formatMoney(totalAmort) }
        ],
        { columns: [{ key: 'month', label: 'Month', type: 'number' }, { key: 'payment', label: 'Payment', type: 'money', align: 'right' }, { key: 'interest', label: 'Interest', type: 'money', align: 'right' }, { key: 'principal', label: 'Principal', type: 'money', align: 'right' }, { key: 'amortization', label: 'Amort.', type: 'money', align: 'right' }, { key: 'liabilityBalance', label: 'Liab. bal.', type: 'money', align: 'right' }, { key: 'rouBalance', label: 'ROU bal.', type: 'money', align: 'right' }], rows: schedule.slice(0, 120) },
        exp, 'Finance lease: liability ' + formatMoney(leaseLiability) + ', ROU asset ' + formatMoney(rouAsset) + '.'
      );
    },
    'lease-classification-test': function (values) {
      var assetFMV = values.assetFairMarketValue;
      var assetUsefulLife = values.assetUsefulLife;
      var leaseTerm = values.leaseTermMonths;
      var monthlyPayment = values.monthlyPayment;
      var discountRate = values.discountRatePct || 5;
      var transfersOwnership = values.transfersOwnership === 'yes';
      var hasBargainPurchase = values.bargainPurchaseOption === 'yes';
      var specializedAsset = values.specializedAsset === 'yes';
      if (!(assetFMV > 0) || !(assetUsefulLife > 0) || !(leaseTerm > 0)) throw new Error('Enter asset FMV, useful life, and lease term.');
      var leaseTermYears = leaseTerm / 12;
      var majorPartOfLife = leaseTermYears / assetUsefulLife >= 0.75;
      var monthlyRate = discountRate / 100 / 12;
      var pvPayments = monthlyRate > 0 ? monthlyPayment * (1 - Math.pow(1 + monthlyRate, -leaseTerm)) / monthlyRate : monthlyPayment * leaseTerm;
      var pvTestPct = assetFMV > 0 ? pvPayments / assetFMV * 100 : 0;
      var substantiallyAll = pvTestPct >= 90;
      var isFinance = transfersOwnership || hasBargainPurchase || majorPartOfLife || substantiallyAll || specializedAsset;
      var criteria = [];
      criteria.push({ test: 'Transfer of ownership', result: transfersOwnership ? 'Met' : 'Not met', met: transfersOwnership });
      criteria.push({ test: 'Bargain purchase option', result: hasBargainPurchase ? 'Met' : 'Not met', met: hasBargainPurchase });
      criteria.push({ test: 'Major part of economic life (≥75%)', result: formatPercent(leaseTermYears / assetUsefulLife * 100, 1) + ' — ' + (majorPartOfLife ? 'Met' : 'Not met'), met: majorPartOfLife });
      criteria.push({ test: 'Substantially all of FMV (≥90%)', result: formatPercent(pvTestPct, 1) + ' — ' + (substantiallyAll ? 'Met' : 'Not met'), met: substantiallyAll });
      criteria.push({ test: 'Specialized asset (no alternative use)', result: specializedAsset ? 'Met' : 'Not met', met: specializedAsset });
      var metCount = criteria.filter(function (c) { return c.met; }).length;
      var rows = criteria.map(function (c) { return { test: c.test, result: c.result, status: c.met ? 'Finance' : 'Operating' }; });
      return buildResult(
        [
          { label: 'Classification', value: isFinance ? 'Finance lease' : 'Operating lease', tone: isFinance ? 'warning' : 'positive', help: 'If any criterion is met, the lease is a finance lease.' },
          { label: 'Criteria met', value: metCount + ' of 5', tone: metCount > 0 ? 'warning' : 'positive', help: 'Number of ASC 842 finance lease criteria met.' },
          { label: 'PV of payments', value: formatMoney(pvPayments), tone: 'neutral', help: 'Present value of minimum lease payments.' },
          { label: 'PV as % of FMV', value: formatPercent(pvTestPct, 1), tone: pvTestPct >= 90 ? 'warning' : 'neutral', help: '90% threshold for substantially all test.' }
        ],
        [
          { title: 'Lease term vs useful life', value: formatPercent(leaseTermYears / assetUsefulLife * 100, 1), tone: majorPartOfLife ? 'warning' : 'positive', text: leaseTermYears.toFixed(1) + ' yr term / ' + assetUsefulLife + ' yr life. 75% threshold.' },
          { title: 'PV / FMV test', value: formatPercent(pvTestPct, 1), tone: substantiallyAll ? 'warning' : 'positive', text: formatMoney(pvPayments) + ' PV vs ' + formatMoney(assetFMV) + ' FMV. 90% threshold.' },
          { title: 'Ownership transfer', value: transfersOwnership ? 'Yes' : 'No', tone: transfersOwnership ? 'warning' : 'neutral', text: 'Lease transfers ownership at end of term.' },
          { title: 'Result', value: isFinance ? 'Finance lease' : 'Operating lease', tone: isFinance ? 'warning' : 'positive', text: isFinance ? 'One or more criteria met — classify as finance.' : 'No criteria met — classify as operating.' }
        ],
        [
          { title: 'Only one criterion needs to be met', text: 'If any of the five tests is satisfied, the lease is a finance lease under ASC 842.' },
          { title: 'The 75% and 90% thresholds are bright lines', text: 'ASC 842 retained the 75% life test and 90% FMV test from the old standard.' },
          { title: 'Classification affects expense pattern', text: 'Finance leases produce front-loaded expense; operating leases produce straight-line expense.' },
          { title: 'Document the analysis', text: 'Auditors expect a documented classification test for each lease at commencement.' }
        ],
        [
          { label: 'Asset FMV', value: formatMoney(assetFMV) },
          { label: 'Useful life', value: assetUsefulLife + ' years' },
          { label: 'Lease term', value: leaseTerm + ' months' },
          { label: 'PV of payments', value: formatMoney(pvPayments) },
          { label: 'PV / FMV', value: formatPercent(pvTestPct, 1) },
          { label: 'Classification', value: isFinance ? 'Finance' : 'Operating' }
        ],
        { columns: [{ key: 'test', label: 'Criterion', type: 'text' }, { key: 'result', label: 'Result', type: 'text' }, { key: 'status', label: 'Indication', type: 'text' }], rows: rows },
        rows, 'Lease classification: ' + (isFinance ? 'Finance lease' : 'Operating lease') + ' (' + metCount + ' of 5 criteria met).'
      );
    },
    'debt-covenant-compliance-checker': function (values, rows) {
      var items = rows.filter(function (r) { return r.covenantName && Number.isFinite(r.actualValue); });
      if (!items.length) throw new Error('Add at least one covenant with an actual value and threshold.');
      var rowsOut = items.map(function (r) {
        var actual = r.actualValue;
        var threshold = r.threshold || 0;
        var direction = r.direction || 'min';
        var inCompliance = direction === 'min' ? actual >= threshold : actual <= threshold;
        var cushion = direction === 'min' ? actual - threshold : threshold - actual;
        var cushionPct = threshold !== 0 ? Math.abs(cushion / threshold) * 100 : 0;
        return { covenantName: r.covenantName, actualValue: actual, threshold: threshold, direction: direction === 'min' ? 'Minimum' : 'Maximum', status: inCompliance ? 'Compliant' : 'Violation', cushion: cushion, cushionPct: cushionPct };
      });
      var violations = rowsOut.filter(function (r) { return r.status === 'Violation'; }).length;
      var nearBreach = rowsOut.filter(function (r) { return r.status === 'Compliant' && r.cushionPct < 10; }).length;
      return buildResult(
        [
          { label: 'Covenants tested', value: formatNumber(rowsOut.length), tone: 'neutral', help: 'Total debt covenants analyzed.' },
          { label: 'Violations', value: formatNumber(violations), tone: violations > 0 ? 'critical' : 'positive', help: 'Covenants currently in violation.' },
          { label: 'Near-breach', value: formatNumber(nearBreach), tone: nearBreach > 0 ? 'warning' : 'positive', help: 'Compliant but within 10% of threshold.' },
          { label: 'Compliance rate', value: formatPercent(rowsOut.length ? (rowsOut.length - violations) / rowsOut.length * 100 : 100, 0), tone: violations > 0 ? 'critical' : 'positive', help: 'Percentage of covenants in compliance.' }
        ],
        [
          { title: 'Most at risk', value: rowsOut.sort(function (a, b) { return a.cushionPct - b.cushionPct; })[0].covenantName, tone: rowsOut[0].status === 'Violation' ? 'critical' : 'warning', text: 'Cushion: ' + formatPercent(rowsOut[0].cushionPct, 1) + '.' },
          { title: 'Violations', value: formatNumber(violations), tone: violations > 0 ? 'critical' : 'positive', text: violations > 0 ? 'Immediate lender communication required.' : 'All covenants compliant.' },
          { title: 'Watch list', value: formatNumber(nearBreach), tone: nearBreach > 0 ? 'warning' : 'positive', text: nearBreach > 0 ? 'Covenants within 10% of threshold.' : 'No covenants near breach.' },
          { title: 'Total covenants', value: formatNumber(rowsOut.length), tone: 'neutral', text: 'Across all credit agreements.' }
        ],
        [
          { title: 'Violations trigger cross-default risk', text: 'A covenant violation in one agreement may trigger default provisions in other credit facilities.' },
          { title: 'Cure periods exist but are short', text: 'Most agreements provide 30-60 day cure periods — know the timeline and communicate early.' },
          { title: 'Waivers are available but costly', text: 'Lenders may waive violations in exchange for fees, tighter terms, or additional collateral.' },
          { title: 'Monitor quarterly', text: 'Most covenants are tested quarterly — run this check before each reporting period.' }
        ],
        [
          { label: 'Covenants tested', value: formatNumber(rowsOut.length) },
          { label: 'Violations', value: formatNumber(violations) },
          { label: 'Near-breach', value: formatNumber(nearBreach) },
          { label: 'Compliance rate', value: formatPercent(rowsOut.length ? (rowsOut.length - violations) / rowsOut.length * 100 : 100, 0) }
        ],
        { columns: [{ key: 'covenantName', label: 'Covenant', type: 'text' }, { key: 'direction', label: 'Type', type: 'text' }, { key: 'threshold', label: 'Threshold', type: 'number', align: 'right' }, { key: 'actualValue', label: 'Actual', type: 'number', align: 'right' }, { key: 'cushion', label: 'Cushion', type: 'number', align: 'right' }, { key: 'status', label: 'Status', type: 'text' }], rows: rowsOut },
        rowsOut, 'Covenant compliance: ' + (rowsOut.length - violations) + ' of ' + rowsOut.length + ' compliant.'
      );
    },
    'loan-amortization-schedule-builder': function (values) {
      var principal = values.loanAmount;
      var annualRate = values.annualInterestRate;
      var termMonths = values.termMonths;
      var startDate = values.startDate || '';
      if (!(principal > 0) || !(termMonths > 0)) throw new Error('Enter a positive loan amount and term.');
      var monthlyRate = annualRate / 100 / 12;
      var monthlyPayment = monthlyRate > 0 ? principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths)) : principal / termMonths;
      var hasStartDate = !!parseDate(startDate);
      var schedule = [];
      var balance = principal;
      var totalInterest = 0;
      var totalPrincipal = 0;
      for (var m = 1; m <= termMonths; m++) {
        var intPmt = balance * monthlyRate;
        var princPmt = monthlyPayment - intPmt;
        if (m === termMonths) princPmt = balance;
        balance = Math.max(balance - princPmt, 0);
        totalInterest += intPmt;
        totalPrincipal += princPmt;
        schedule.push({ month: m, paymentDate: hasStartDate ? formatDate(addMonths(startDate, m - 1)) : '', payment: monthlyPayment, interest: intPmt, principal: princPmt, balance: balance });
      }
      var totalPayments = monthlyPayment * termMonths;
      var exp = schedule.map(function (r) {
        var row = { Month: r.month, Payment: r.payment.toFixed(2), Interest: r.interest.toFixed(2), Principal: r.principal.toFixed(2), Balance: r.balance.toFixed(2) };
        if (hasStartDate) row['Payment date'] = r.paymentDate;
        return row;
      });
      return buildResult(
        [
          { label: 'Monthly payment', value: formatMoney(monthlyPayment), tone: 'neutral', help: 'Fixed monthly payment amount.' },
          { label: 'Total interest', value: formatMoney(totalInterest), tone: 'neutral', help: 'Total interest paid over the life of the loan.' },
          { label: 'Total payments', value: formatMoney(totalPayments), tone: 'neutral', help: 'Total of all payments (principal + interest).' },
          { label: 'Interest-to-principal', value: formatPercent(principal > 0 ? totalInterest / principal * 100 : 0, 1), tone: 'neutral', help: 'Total interest as a percentage of the original principal.' }
        ],
        [
          { title: 'Loan amount', value: formatMoney(principal), tone: 'neutral', text: 'Original principal balance.' },
          { title: 'Annual rate', value: formatPercent(annualRate, 2), tone: 'neutral', text: 'Nominal annual interest rate.' },
          { title: 'Term', value: termMonths + ' months', tone: 'neutral', text: formatNumber(Math.round(termMonths / 12)) + ' years.' },
          { title: 'First payment date', value: hasStartDate ? schedule[0].paymentDate : 'Not provided', tone: 'neutral', text: hasStartDate ? 'Schedule dates are anchored to the entered start date.' : 'Enter a start date to add dated payment rows.' },
          { title: 'First month interest', value: formatMoney(schedule[0].interest), tone: 'neutral', text: 'Interest portion of the first payment.' }
        ],
        [
          { title: 'Early payments are mostly interest', text: 'Standard amortization front-loads interest — the principal portion grows over time.' },
          { title: 'Extra payments reduce total interest', text: 'Additional principal payments shorten the term and reduce total interest paid.' },
          { title: 'Match the schedule to your GL', text: 'Use the monthly interest and principal split for journal entries.' },
          { title: 'Refinancing resets the schedule', text: 'A new rate or term produces a new amortization schedule from the remaining balance.' }
        ],
        [
          { label: 'Loan amount', value: formatMoney(principal) },
          { label: 'Rate', value: formatPercent(annualRate, 2) },
          { label: 'Term', value: termMonths + ' months' },
          { label: 'Start date', value: hasStartDate ? schedule[0].paymentDate : 'Not provided' },
          { label: 'Payment', value: formatMoney(monthlyPayment) },
          { label: 'Total interest', value: formatMoney(totalInterest) },
          { label: 'Total paid', value: formatMoney(totalPayments) }
        ],
        { columns: (hasStartDate ? [{ key: 'month', label: 'Month', type: 'number' }, { key: 'paymentDate', label: 'Payment date', type: 'text' }] : [{ key: 'month', label: 'Month', type: 'number' }]).concat([{ key: 'payment', label: 'Payment', type: 'money', align: 'right' }, { key: 'interest', label: 'Interest', type: 'money', align: 'right' }, { key: 'principal', label: 'Principal', type: 'money', align: 'right' }, { key: 'balance', label: 'Balance', type: 'money', align: 'right' }]), rows: schedule.slice(0, 360) },
        exp, 'Loan amortization: ' + formatMoney(monthlyPayment) + '/month, ' + formatMoney(totalInterest) + ' total interest.'
      );
    },
    'effective-interest-rate-calculator': function (values) {
      var nominalRate = values.nominalRatePct;
      var compoundingPeriods = parseFloat(values.compoundingPeriods) || 12;
      var loanAmount = values.loanAmount || 0;
      var fees = values.originationFees || 0;
      var termYears = values.termYears || 1;
      if (nominalRate == null) throw new Error('Enter a nominal interest rate.');
      var effectiveRate = (Math.pow(1 + nominalRate / 100 / compoundingPeriods, compoundingPeriods) - 1) * 100;
      var spreadBps = (effectiveRate - nominalRate) * 100;
      var netProceeds = loanAmount - fees;
      var apr = nominalRate;
      if (loanAmount > 0 && fees > 0 && termYears > 0) {
        var annualInterest = loanAmount * nominalRate / 100;
        apr = (annualInterest + fees / termYears) / netProceeds * 100;
      }
      var annualCostOnPrincipal = loanAmount > 0 ? loanAmount * effectiveRate / 100 : 0;
      var annualCostOnProceeds = netProceeds > 0 ? netProceeds * apr / 100 : 0;
      return buildResult(
        [
          { label: 'Effective annual rate', value: formatPercent(effectiveRate, 3), tone: 'neutral', help: 'Annual rate accounting for compounding.' },
          { label: 'Nominal rate', value: formatPercent(nominalRate, 3), tone: 'neutral', help: 'Stated annual rate before compounding.' },
          { label: 'Rate spread', value: spreadBps.toFixed(1) + ' bps', tone: 'neutral', help: 'Difference between effective and nominal rate in basis points.' },
          { label: 'APR (with fees)', value: formatPercent(apr, 3), tone: apr > effectiveRate ? 'warning' : 'neutral', help: 'Effective rate adjusted for origination fees.' }
        ],
        [
          { title: 'Compounding periods', value: formatNumber(compoundingPeriods) + '/year', tone: 'neutral', text: compoundingPeriods === 12 ? 'Monthly' : (compoundingPeriods === 4 ? 'Quarterly' : (compoundingPeriods === 2 ? 'Semi-annual' : (compoundingPeriods === 1 ? 'Annual' : compoundingPeriods + 'x/year'))) + ' compounding.' },
          { title: 'Net proceeds', value: loanAmount > 0 ? formatMoney(netProceeds) : 'N/A', tone: fees > 0 ? 'warning' : 'neutral', text: fees > 0 ? 'Loan amount minus ' + formatMoney(fees) + ' in fees.' : 'No fees applied.' },
          { title: 'Annual interest cost', value: formatMoney(annualCostOnPrincipal), tone: 'neutral', text: 'At the effective rate on the principal.' },
          { title: 'More compounding = higher effective rate', value: formatPercent(effectiveRate - nominalRate, 3), tone: 'neutral', text: 'Additional annual cost from compounding effect.' }
        ],
        [
          { title: 'Effective rate is always ≥ nominal rate', text: 'With compounding more than once per year, the effective rate exceeds the nominal rate.' },
          { title: 'Use effective rate for comparison', text: 'When comparing loans with different compounding frequencies, the effective annual rate is the apples-to-apples metric.' },
          { title: 'Fees raise the true cost', text: 'Origination fees reduce net proceeds, increasing the true annual percentage rate above the nominal rate.' },
          { title: 'ASC 835-30 requires effective interest method', text: 'For financial reporting, use the effective interest method to amortize premiums, discounts, and issuance costs.' }
        ],
        [
          { label: 'Nominal rate', value: formatPercent(nominalRate, 3) },
          { label: 'Compounding', value: formatNumber(compoundingPeriods) + '/year' },
          { label: 'Effective rate', value: formatPercent(effectiveRate, 3) },
          { label: 'APR', value: formatPercent(apr, 3) },
          { label: 'Spread', value: spreadBps.toFixed(1) + ' bps' }
        ],
        null,
        [{ 'Nominal': nominalRate.toFixed(3) + '%', 'Compounding': compoundingPeriods, 'Effective': effectiveRate.toFixed(3) + '%', 'Spread bps': spreadBps.toFixed(1), 'Loan': loanAmount, 'Fees': fees, 'APR': apr.toFixed(3) + '%' }],
        'Effective rate: ' + formatPercent(effectiveRate, 3) + ' (nominal ' + formatPercent(nominalRate, 3) + ', ' + compoundingPeriods + 'x compounding).'
      );
    },
    'debt-to-equity-ratio-tracker': function (values, rows) {
      var items = rows.filter(function (r) { return r.period && Number.isFinite(r.totalDebt) && Number.isFinite(r.totalEquity); });
      if (!items.length) throw new Error('Add at least one period with total debt and total equity.');
      var targetRatio = values.targetRatio || 2.0;
      var rowsOut = items.map(function (r) {
        var ratio = r.totalEquity !== 0 ? r.totalDebt / r.totalEquity : 0;
        var status = ratio <= targetRatio ? 'Within target' : 'Above target';
        return { period: r.period, totalDebt: r.totalDebt, totalEquity: r.totalEquity, ratio: ratio, status: status };
      });
      var latest = rowsOut[rowsOut.length - 1];
      var earliest = rowsOut[0];
      var trend = rowsOut.length > 1 ? latest.ratio - earliest.ratio : 0;
      var aboveTarget = rowsOut.filter(function (r) { return r.status === 'Above target'; }).length;
      return buildResult(
        [
          { label: 'Current D/E ratio', value: formatRatio(latest.ratio), tone: latest.ratio > targetRatio ? 'warning' : 'positive', help: 'Most recent period debt-to-equity ratio.' },
          { label: 'Target ratio', value: formatRatio(targetRatio), tone: 'neutral', help: 'Maximum acceptable D/E ratio.' },
          { label: 'Trend', value: (trend > 0 ? '+' : '') + trend.toFixed(2) + 'x', tone: trend > 0 ? 'warning' : 'positive', help: 'Change from first to last period.' },
          { label: 'Periods above target', value: formatNumber(aboveTarget) + ' of ' + formatNumber(rowsOut.length), tone: aboveTarget > 0 ? 'warning' : 'positive', help: 'Periods exceeding the target ratio.' }
        ],
        [
          { title: 'Latest period', value: latest.period, tone: 'neutral', text: 'D/E: ' + formatRatio(latest.ratio) + '.' },
          { title: 'Total debt (latest)', value: formatMoney(latest.totalDebt), tone: 'neutral', text: 'All interest-bearing obligations.' },
          { title: 'Total equity (latest)', value: formatMoney(latest.totalEquity), tone: latest.totalEquity <= 0 ? 'critical' : 'neutral', text: latest.totalEquity <= 0 ? 'Negative equity — review immediately.' : 'Shareholders\' equity.' },
          { title: 'Direction', value: trend > 0.1 ? 'Increasing leverage' : (trend < -0.1 ? 'Decreasing leverage' : 'Stable'), tone: trend > 0.1 ? 'warning' : 'positive', text: 'Change of ' + Math.abs(trend).toFixed(2) + 'x over the tracked periods.' }
        ],
        [
          { title: 'D/E ratio is a key solvency metric', text: 'Lenders, investors, and rating agencies use the debt-to-equity ratio to assess financial leverage and risk.' },
          { title: 'Industry norms vary widely', text: 'Capital-intensive industries (utilities, real estate) carry higher D/E ratios than asset-light businesses.' },
          { title: 'Trend matters as much as level', text: 'A rising D/E ratio signals increasing leverage and potential stress — even if the absolute level is acceptable.' },
          { title: 'Covenant implications', text: 'Many credit agreements include maximum leverage ratios — monitor against covenant thresholds.' }
        ],
        [
          { label: 'Current D/E', value: formatRatio(latest.ratio) },
          { label: 'Target', value: formatRatio(targetRatio) },
          { label: 'Trend', value: (trend > 0 ? '+' : '') + trend.toFixed(2) + 'x' },
          { label: 'Periods tracked', value: formatNumber(rowsOut.length) }
        ],
        { columns: [{ key: 'period', label: 'Period', type: 'text' }, { key: 'totalDebt', label: 'Total debt', type: 'money', align: 'right' }, { key: 'totalEquity', label: 'Total equity', type: 'money', align: 'right' }, { key: 'ratio', label: 'D/E ratio', type: 'number', align: 'right' }, { key: 'status', label: 'Status', type: 'text' }], rows: rowsOut },
        rowsOut, 'D/E ratio: ' + formatRatio(latest.ratio) + ' (target: ' + formatRatio(targetRatio) + ').'
      );
    },
    'lease-incentive-modification-analyzer': function (values) {
      var originalLiability = values.originalLiability;
      var originalRouAsset = values.originalRouAsset || originalLiability;
      var remainingTermMonths = values.remainingTermMonths;
      var revisedPayment = values.revisedMonthlyPayment;
      var revisedTermMonths = values.revisedTermMonths || remainingTermMonths;
      var discountRate = values.discountRatePct || 5;
      var leaseIncentive = values.leaseIncentive || 0;
      var modificationType = values.modificationType || 'remeasurement';
      if (!(remainingTermMonths > 0) || !(revisedPayment > 0)) throw new Error('Enter remaining term and revised payment.');
      var monthlyRate = discountRate / 100 / 12;
      var newLiability = monthlyRate > 0 ? revisedPayment * (1 - Math.pow(1 + monthlyRate, -revisedTermMonths)) / monthlyRate : revisedPayment * revisedTermMonths;
      var liabilityChange = newLiability - (originalLiability || 0);
      var newRouAsset = (originalRouAsset || 0) + liabilityChange - leaseIncentive;
      var rouChange = newRouAsset - (originalRouAsset || 0);
      var newMonthlyExpense = revisedPayment * revisedTermMonths / revisedTermMonths;
      var gainLoss = modificationType === 'partial-termination' ? (originalRouAsset || 0) * (Math.abs(liabilityChange) / Math.max(originalLiability, 1)) - Math.abs(liabilityChange) : 0;
      return buildResult(
        [
          { label: 'Revised liability', value: formatMoney(newLiability), tone: 'neutral', help: 'Remeasured lease liability after modification.' },
          { label: 'Liability change', value: formatMoney(liabilityChange), tone: liabilityChange > 0 ? 'warning' : 'positive', help: 'Change from original liability.' },
          { label: 'Revised ROU asset', value: formatMoney(newRouAsset), tone: 'neutral', help: 'ROU asset after modification adjustment.' },
          { label: 'Gain/(loss)', value: formatMoney(gainLoss), tone: gainLoss < 0 ? 'warning' : 'neutral', help: 'Gain or loss on partial termination (if applicable).' }
        ],
        [
          { title: 'Modification type', value: modificationType === 'partial-termination' ? 'Partial termination' : 'Remeasurement', tone: 'neutral', text: modificationType === 'partial-termination' ? 'Scope decrease — gain/loss recognized.' : 'No scope decrease — adjust ROU asset.' },
          { title: 'Revised term', value: revisedTermMonths + ' months', tone: 'neutral', text: 'Remaining lease term after modification.' },
          { title: 'Revised payment', value: formatMoney(revisedPayment) + '/month', tone: 'neutral', text: 'New monthly payment after modification.' },
          { title: 'Lease incentive', value: formatMoney(leaseIncentive), tone: leaseIncentive > 0 ? 'positive' : 'neutral', text: leaseIncentive > 0 ? 'Reduces the ROU asset.' : 'No incentive in this modification.' }
        ],
        [
          { title: 'Remeasure at the modification date', text: 'Use the revised discount rate at the modification date, not the original commencement date rate.' },
          { title: 'Scope decrease triggers gain/loss', text: 'If the modification reduces the right of use (partial termination), recognize a proportional gain or loss.' },
          { title: 'Scope increase or no scope change adjusts the ROU', text: 'If the modification extends the term or changes payments without reducing scope, adjust the ROU asset for the liability change.' },
          { title: 'Incentives reduce the ROU asset', text: 'New lease incentives received as part of a modification reduce the ROU asset, not the liability.' }
        ],
        [
          { label: 'Original liability', value: formatMoney(originalLiability || 0) },
          { label: 'Revised liability', value: formatMoney(newLiability) },
          { label: 'Change', value: formatMoney(liabilityChange) },
          { label: 'Original ROU', value: formatMoney(originalRouAsset || 0) },
          { label: 'Revised ROU', value: formatMoney(newRouAsset) },
          { label: 'Lease incentive', value: formatMoney(leaseIncentive) }
        ],
        null,
        [{ 'Orig liability': originalLiability, 'New liability': newLiability.toFixed(2), 'Change': liabilityChange.toFixed(2), 'Orig ROU': originalRouAsset, 'New ROU': newRouAsset.toFixed(2), 'Incentive': leaseIncentive, 'Gain/loss': gainLoss.toFixed(2) }],
        'Lease modification: liability ' + (liabilityChange >= 0 ? 'increased' : 'decreased') + ' by ' + formatMoney(Math.abs(liabilityChange)) + '.'
      );
    },
    'bond-premium-discount-amortization': function (values) {
      var faceValue = values.faceValue;
      var issuePrice = values.issuePrice;
      var couponRatePct = values.couponRatePct;
      var marketRatePct = values.marketRatePct;
      var termYears = values.termYears;
      var paymentsPerYear = values.paymentsPerYear || 2;
      if (!(faceValue > 0) || !(issuePrice > 0) || !(termYears > 0)) throw new Error('Enter face value, issue price, and term.');
      var totalPeriods = termYears * paymentsPerYear;
      var couponPayment = faceValue * (couponRatePct / 100) / paymentsPerYear;
      var marketRate = marketRatePct / 100 / paymentsPerYear;
      var premiumDiscount = issuePrice - faceValue;
      var isAtPremium = premiumDiscount > 0;
      var schedule = [];
      var carryingValue = issuePrice;
      var totalInterestExp = 0;
      var totalCoupon = 0;
      for (var p = 1; p <= totalPeriods; p++) {
        var interestExpense = carryingValue * marketRate;
        var amortization = couponPayment - interestExpense;
        carryingValue = carryingValue - amortization;
        if (p === totalPeriods) carryingValue = faceValue;
        totalInterestExp += interestExpense;
        totalCoupon += couponPayment;
        schedule.push({ period: p, couponPayment: couponPayment, interestExpense: interestExpense, amortization: Math.abs(amortization), carryingValue: carryingValue });
      }
      var exp = schedule.map(function (r) { return { Period: r.period, Coupon: r.couponPayment.toFixed(2), 'Interest exp': r.interestExpense.toFixed(2), Amortization: r.amortization.toFixed(2), 'Carrying value': r.carryingValue.toFixed(2) }; });
      return buildResult(
        [
          { label: isAtPremium ? 'Premium' : 'Discount', value: formatMoney(Math.abs(premiumDiscount)), tone: 'neutral', help: 'Difference between issue price and face value.' },
          { label: 'Total interest expense', value: formatMoney(totalInterestExp), tone: 'neutral', help: 'Total interest expense over the bond life (effective interest method).' },
          { label: 'Total coupon payments', value: formatMoney(totalCoupon), tone: 'neutral', help: 'Total cash coupon payments over the bond life.' },
          { label: 'Carrying value (Day 1)', value: formatMoney(issuePrice), tone: 'neutral', help: 'Initial carrying amount (issue price).' }
        ],
        [
          { title: 'Face value', value: formatMoney(faceValue), tone: 'neutral', text: 'Par value of the bond.' },
          { title: 'Coupon rate', value: formatPercent(couponRatePct, 2), tone: 'neutral', text: formatMoney(couponPayment) + ' per period.' },
          { title: 'Market rate', value: formatPercent(marketRatePct, 2), tone: 'neutral', text: 'Yield at issuance / effective interest rate.' },
          { title: 'Type', value: isAtPremium ? 'Premium bond' : 'Discount bond', tone: 'neutral', text: isAtPremium ? 'Coupon rate exceeds market rate.' : 'Market rate exceeds coupon rate.' }
        ],
        [
          { title: 'Use the effective interest method', text: 'ASC 835-30 requires the effective interest method for amortizing premiums and discounts on bonds.' },
          { title: 'Carrying value converges to face at maturity', text: 'The amortization schedule brings the carrying value to par by the maturity date.' },
          { title: 'Premium bonds have declining interest expense', text: 'As the carrying value decreases, interest expense (carrying value x market rate) decreases each period.' },
          { title: 'Discount bonds have increasing interest expense', text: 'As the carrying value increases toward par, interest expense increases each period.' }
        ],
        [
          { label: 'Face value', value: formatMoney(faceValue) },
          { label: 'Issue price', value: formatMoney(issuePrice) },
          { label: isAtPremium ? 'Premium' : 'Discount', value: formatMoney(Math.abs(premiumDiscount)) },
          { label: 'Coupon rate', value: formatPercent(couponRatePct, 2) },
          { label: 'Market rate', value: formatPercent(marketRatePct, 2) },
          { label: 'Periods', value: formatNumber(totalPeriods) }
        ],
        { columns: [{ key: 'period', label: 'Period', type: 'number' }, { key: 'couponPayment', label: 'Coupon', type: 'money', align: 'right' }, { key: 'interestExpense', label: 'Int. expense', type: 'money', align: 'right' }, { key: 'amortization', label: 'Amort.', type: 'money', align: 'right' }, { key: 'carryingValue', label: 'Carrying val.', type: 'money', align: 'right' }], rows: schedule },
        exp, 'Bond ' + (isAtPremium ? 'premium' : 'discount') + ' amortization: ' + formatMoney(Math.abs(premiumDiscount)) + ' over ' + totalPeriods + ' periods.'
      );
    },
    'lease-vs-buy-npv-asc842': function (values) {
      var assetCost = values.assetCost;
      var leasePayment = values.monthlyLeasePayment;
      var leaseTermMonths = values.leaseTermMonths;
      var discountRate = values.discountRatePct || 5;
      var residualValue = values.residualValue || 0;
      var taxRate = values.taxRatePct || 21;
      var depreciationYears = values.depreciationYears || Math.round(leaseTermMonths / 12);
      var maintenanceCost = values.annualMaintenance || 0;
      if (!(assetCost > 0) || !(leasePayment > 0) || !(leaseTermMonths > 0)) throw new Error('Enter asset cost, lease payment, and term.');
      var monthlyRate = discountRate / 100 / 12;
      var taxMultiplier = 1 - taxRate / 100;
      var pvLeasePayments = 0;
      for (var m = 1; m <= leaseTermMonths; m++) {
        pvLeasePayments += (leasePayment * taxMultiplier) / Math.pow(1 + monthlyRate, m);
      }
      var leaseLiability = monthlyRate > 0 ? leasePayment * (1 - Math.pow(1 + monthlyRate, -leaseTermMonths)) / monthlyRate : leasePayment * leaseTermMonths;
      var annualDepreciation = depreciationYears > 0 ? (assetCost - residualValue) / depreciationYears : 0;
      var depTaxShield = annualDepreciation * taxRate / 100;
      var pvBuyCost = assetCost;
      var pvResidual = residualValue / Math.pow(1 + discountRate / 100, depreciationYears);
      var pvMaintenance = 0;
      for (var y = 1; y <= Math.round(leaseTermMonths / 12); y++) {
        pvMaintenance += (maintenanceCost * taxMultiplier) / Math.pow(1 + discountRate / 100, y);
      }
      var pvDepShield = 0;
      for (var y2 = 1; y2 <= depreciationYears; y2++) {
        pvDepShield += depTaxShield / Math.pow(1 + discountRate / 100, y2);
      }
      var totalLeaseNPV = pvLeasePayments;
      var totalBuyNPV = pvBuyCost - pvResidual + pvMaintenance - pvDepShield;
      var advantage = totalLeaseNPV < totalBuyNPV ? 'Lease' : 'Buy';
      var savings = Math.abs(totalBuyNPV - totalLeaseNPV);
      return buildResult(
        [
          { label: 'Lease NPV', value: formatMoney(totalLeaseNPV), tone: advantage === 'Lease' ? 'positive' : 'warning', help: 'Net present value of after-tax lease payments.' },
          { label: 'Buy NPV', value: formatMoney(totalBuyNPV), tone: advantage === 'Buy' ? 'positive' : 'warning', help: 'Net present value of buying (cost - residual - tax shields + maintenance).' },
          { label: 'Advantage', value: advantage, tone: 'positive', help: 'Lower NPV is the better economic option.' },
          { label: 'NPV savings', value: formatMoney(savings), tone: 'positive', help: 'Difference between the two options.' }
        ],
        [
          { title: 'ASC 842 liability', value: formatMoney(leaseLiability), tone: 'neutral', text: 'Lease liability recognized on balance sheet under ASC 842.' },
          { title: 'Depreciation tax shield', value: formatMoney(pvDepShield), tone: 'neutral', text: 'PV of tax savings from depreciation if purchased.' },
          { title: 'Residual value (PV)', value: formatMoney(pvResidual), tone: residualValue > 0 ? 'positive' : 'neutral', text: 'Present value of expected residual value if purchased.' },
          { title: 'Discount rate', value: formatPercent(discountRate, 2), tone: 'neutral', text: 'Rate used to discount future cash flows.' }
        ],
        [
          { title: 'ASC 842 puts leases on the balance sheet', text: 'Both operating and finance leases now appear as ROU assets and lease liabilities, reducing the off-balance-sheet advantage of leasing.' },
          { title: 'NPV comparison should be after-tax', text: 'Include the tax impact of lease payments, depreciation, and maintenance for an accurate comparison.' },
          { title: 'Residual value favors buying', text: 'If the asset retains significant value, buying captures the upside that leasing does not.' },
          { title: 'Cash flow timing matters', text: 'Leasing preserves cash upfront; buying requires a large outlay. Consider the opportunity cost of capital.' }
        ],
        [
          { label: 'Asset cost', value: formatMoney(assetCost) },
          { label: 'Monthly lease', value: formatMoney(leasePayment) },
          { label: 'Lease term', value: leaseTermMonths + ' months' },
          { label: 'Lease NPV', value: formatMoney(totalLeaseNPV) },
          { label: 'Buy NPV', value: formatMoney(totalBuyNPV) },
          { label: 'Advantage', value: advantage },
          { label: 'Savings', value: formatMoney(savings) }
        ],
        null,
        [{ 'Asset cost': assetCost, 'Lease pmt': leasePayment, 'Term months': leaseTermMonths, 'Lease NPV': totalLeaseNPV.toFixed(0), 'Buy NPV': totalBuyNPV.toFixed(0), Advantage: advantage, Savings: savings.toFixed(0) }],
        advantage + ' is more favorable by ' + formatMoney(savings) + ' on an NPV basis.'
      );
    },

    /* ── 181 Pre / Post-Money Valuation Calculator ───────────────── */
    'pre-post-money-valuation-calculator': function (values) {
      var investmentAmount = parseFloat(values.investmentAmount) || 0;
      var preMoneyVal = parseFloat(values.preMoneyValuation) || 0;
      var existingShares = parseFloat(values.existingShares) || 0;
      var optionPoolPct = (parseFloat(values.optionPoolPct) || 0) / 100;
      var postMoneyVal = preMoneyVal + investmentAmount;
      var pricePerShare = existingShares > 0 ? preMoneyVal / existingShares : 0;
      var newShares = pricePerShare > 0 ? investmentAmount / pricePerShare : 0;
      var totalSharesPost = existingShares + newShares;
      var investorOwnership = totalSharesPost > 0 ? newShares / totalSharesPost : 0;
      var founderOwnership = 1 - investorOwnership;
      var poolShares = totalSharesPost > 0 ? totalSharesPost * optionPoolPct / (1 - optionPoolPct) : 0;
      var totalFullyDiluted = totalSharesPost + poolShares;
      var founderFD = totalFullyDiluted > 0 ? existingShares / totalFullyDiluted : 0;
      var investorFD = totalFullyDiluted > 0 ? newShares / totalFullyDiluted : 0;
      var poolFD = totalFullyDiluted > 0 ? poolShares / totalFullyDiluted : 0;
      var dilutionPct = existingShares > 0 ? 1 - existingShares / totalFullyDiluted : 0;
      return buildResult(
        [
          { label: 'Post-money valuation', value: formatMoney(postMoneyVal), tone: 'positive', help: 'Pre-money + investment amount.' },
          { label: 'Price per share', value: '$' + pricePerShare.toFixed(4), tone: 'neutral', help: 'Pre-money / existing shares outstanding.' },
          { label: 'Investor ownership', value: formatPercentFromRatio(investorOwnership, 1), tone: 'neutral', help: 'Investor share of post-money equity (pre-pool).' },
          { label: 'Founder dilution', value: formatPercentFromRatio(dilutionPct, 1), tone: dilutionPct > 0.5 ? 'warning' : 'neutral', help: 'Total dilution to existing holders from new shares + option pool.' }
        ],
        [
          { title: 'Post-money valuation', value: formatMoney(postMoneyVal), tone: 'positive', text: 'The company is valued at ' + formatMoney(postMoneyVal) + ' after the investment.' },
          { title: 'New shares issued', value: formatNumber(Math.round(newShares)), tone: 'neutral', text: 'Investor receives ' + formatNumber(Math.round(newShares)) + ' shares at ' + '$' + pricePerShare.toFixed(4) + ' each.' },
          { title: 'Option pool (post)', value: formatPercentFromRatio(poolFD, 1), tone: 'neutral', text: formatNumber(Math.round(poolShares)) + ' shares reserved for the option pool (' + formatPercentFromRatio(optionPoolPct, 1) + ' target).' },
          { title: 'Fully diluted shares', value: formatNumber(Math.round(totalFullyDiluted)), tone: 'neutral', text: 'Total shares including existing, new, and option pool.' }
        ],
        [
          { title: 'Pre-money sets the price', text: 'The pre-money valuation divided by existing shares determines the price per share for the new investor.' },
          { title: 'Option pool dilutes founders', text: 'When the option pool is created pre-money, existing shareholders bear the dilution, not the new investor.' },
          { title: 'Post-money = pre-money + cash in', text: 'The post-money valuation is simply pre-money plus the investment amount.' },
          { title: 'Fully diluted matters most', text: 'Always look at ownership on a fully diluted basis including the option pool.' }
        ],
        [
          { label: 'Pre-money', value: formatMoney(preMoneyVal) },
          { label: 'Investment', value: formatMoney(investmentAmount) },
          { label: 'Post-money', value: formatMoney(postMoneyVal) },
          { label: 'Existing shares', value: formatNumber(existingShares) },
          { label: 'New shares', value: formatNumber(Math.round(newShares)) },
          { label: 'Pool shares', value: formatNumber(Math.round(poolShares)) },
          { label: 'Founder FD %', value: formatPercentFromRatio(founderFD, 1) },
          { label: 'Investor FD %', value: formatPercentFromRatio(investorFD, 1) },
          { label: 'Pool FD %', value: formatPercentFromRatio(poolFD, 1) }
        ],
        null,
        [{ 'Pre-money': preMoneyVal, 'Investment': investmentAmount, 'Post-money': postMoneyVal, 'Price/share': pricePerShare.toFixed(4), 'Investor %': (investorOwnership * 100).toFixed(2), 'Founder FD %': (founderFD * 100).toFixed(2), 'Dilution %': (dilutionPct * 100).toFixed(2) }],
        'Post-money valuation is ' + formatMoney(postMoneyVal) + '. Investor owns ' + formatPercentFromRatio(investorOwnership, 1) + ' pre-pool, ' + formatPercentFromRatio(investorFD, 1) + ' fully diluted.'
      );
    },

    /* ── 182 Dilution & Cap Table Calculator ─────────────────────── */
    'dilution-cap-table-calculator': function (values, rows) {
      var newRoundShares = parseFloat(values.newRoundShares) || 0;
      var newRoundPPS = parseFloat(values.newRoundPPS) || 0;
      var optionPoolNew = parseFloat(values.optionPoolNew) || 0;
      var tblRows = []; var exp = [];
      var totalPreShares = 0; var totalPostShares = 0;
      rows.forEach(function (r) {
        var shares = parseFloat(r.shares) || 0;
        totalPreShares += shares;
      });
      totalPostShares = totalPreShares + newRoundShares + optionPoolNew;
      var roundSize = newRoundShares * newRoundPPS;
      var postMoneyVal = totalPostShares * newRoundPPS;
      var preMoneyVal = postMoneyVal - roundSize;
      rows.forEach(function (r) {
        var shares = parseFloat(r.shares) || 0;
        var prePct = totalPreShares > 0 ? shares / totalPreShares : 0;
        var postPct = totalPostShares > 0 ? shares / totalPostShares : 0;
        var dilution = prePct - postPct;
        var val = shares * newRoundPPS;
        tblRows.push([r.shareholderName || 'Unnamed', r.shareClass || 'Common', formatNumber(shares), formatPercentFromRatio(prePct, 1), formatPercentFromRatio(postPct, 1), formatPercentFromRatio(dilution, 1), formatMoney(val)]);
        exp.push({ Shareholder: r.shareholderName, Class: r.shareClass, Shares: shares, 'Pre %': (prePct * 100).toFixed(2), 'Post %': (postPct * 100).toFixed(2), 'Dilution %': (dilution * 100).toFixed(2), Value: val.toFixed(0) });
      });
      if (newRoundShares > 0) {
        var invPct = totalPostShares > 0 ? newRoundShares / totalPostShares : 0;
        tblRows.push(['New Investor', 'Preferred', formatNumber(newRoundShares), '—', formatPercent(invPct), '—', formatMoney(roundSize)]);
        exp.push({ Shareholder: 'New Investor', Class: 'Preferred', Shares: newRoundShares, 'Pre %': 0, 'Post %': (invPct * 100).toFixed(2), 'Dilution %': '—', Value: roundSize.toFixed(0) });
      }
      if (optionPoolNew > 0) {
        var poolPct = totalPostShares > 0 ? optionPoolNew / totalPostShares : 0;
        tblRows.push(['Option Pool', 'Reserved', formatNumber(optionPoolNew), '—', formatPercent(poolPct), '—', '—']);
        exp.push({ Shareholder: 'Option Pool', Class: 'Reserved', Shares: optionPoolNew, 'Pre %': 0, 'Post %': (poolPct * 100).toFixed(2), 'Dilution %': '—', Value: '—' });
      }
      var founderDilution = totalPreShares > 0 && totalPostShares > 0 ? 1 - totalPreShares / totalPostShares : 0;
      return buildResult(
        [
          { label: 'Pre-money valuation', value: formatMoney(preMoneyVal), tone: 'positive', help: 'Implied pre-money = post-money − round size.' },
          { label: 'Post-money valuation', value: formatMoney(postMoneyVal), tone: 'positive', help: 'Total post-round shares × price per share.' },
          { label: 'Round size', value: formatMoney(roundSize), tone: 'neutral', help: 'New shares × price per share.' },
          { label: 'Total dilution', value: formatPercentFromRatio(founderDilution, 1), tone: founderDilution > 0.4 ? 'warning' : 'neutral', help: 'Dilution to existing shareholders from new shares + pool.' }
        ],
        [
          { title: 'Post-money implied', value: formatMoney(postMoneyVal), tone: 'positive', text: 'Total fully diluted shares times the round PPS.' },
          { title: 'Pre-round shares', value: formatNumber(totalPreShares), tone: 'neutral', text: 'Sum of all existing shares before the round.' },
          { title: 'Post-round shares', value: formatNumber(totalPostShares), tone: 'neutral', text: 'Existing + new investor + option pool shares.' },
          { title: 'PPS', value: '$' + newRoundPPS.toFixed(4), tone: 'neutral', text: 'Price per share for this round.' }
        ],
        [
          { title: 'Cap tables should be fully diluted', text: 'Include all options, warrants, and convertible instruments for an accurate picture.' },
          { title: 'Pre-money option pool impacts founders', text: 'New option pools created before the round dilute existing holders, not the new investor.' },
          { title: 'Track by share class', text: 'Preferred shares carry liquidation preferences and other rights that affect economics beyond ownership percentage.' },
          { title: 'Model future rounds', text: 'Run this tool for each financing round to see cumulative dilution over the company lifecycle.' }
        ],
        [
          { label: 'Pre-money', value: formatMoney(preMoneyVal) },
          { label: 'Round size', value: formatMoney(roundSize) },
          { label: 'Post-money', value: formatMoney(postMoneyVal) },
          { label: 'Pre-round shares', value: formatNumber(totalPreShares) },
          { label: 'Post-round shares', value: formatNumber(totalPostShares) },
          { label: 'Total dilution', value: formatPercentFromRatio(founderDilution, 1) }
        ],
        { columns: ['Shareholder', 'Class', 'Shares', 'Pre %', 'Post %', 'Dilution', 'Value'], rows: tblRows },
        exp,
        'Post-money ' + formatMoney(postMoneyVal) + '. Existing holders diluted ' + formatPercentFromRatio(founderDilution, 1) + '.'
      );
    },

    /* ── 183 SAFE Note Conversion Calculator ─────────────────────── */
    'safe-note-conversion-calculator': function (values) {
      var safeAmount = parseFloat(values.safeAmount) || 0;
      var valuationCap = parseFloat(values.valuationCap) || 0;
      var discountPct = (parseFloat(values.discountPct) || 0) / 100;
      var pricePerShareRound = parseFloat(values.pricePerShareRound) || 0;
      var preMoneyVal = parseFloat(values.preMoneyValuation) || 0;
      var existingShares = parseFloat(values.existingShares) || 0;
      var mfnClause = values.mfnClause === 'yes';
      var capPPS = existingShares > 0 ? valuationCap / existingShares : 0;
      var discountPPS = pricePerShareRound > 0 ? pricePerShareRound * (1 - discountPct) : 0;
      var effectivePPS = 0;
      var conversionBasis = 'N/A';
      if (capPPS > 0 && discountPPS > 0) {
        if (capPPS <= discountPPS) { effectivePPS = capPPS; conversionBasis = 'Valuation cap'; }
        else { effectivePPS = discountPPS; conversionBasis = 'Discount'; }
      } else if (capPPS > 0) { effectivePPS = capPPS; conversionBasis = 'Valuation cap'; }
      else if (discountPPS > 0) { effectivePPS = discountPPS; conversionBasis = 'Discount'; }
      var sharesIssued = effectivePPS > 0 ? safeAmount / effectivePPS : 0;
      var totalSharesPost = existingShares + sharesIssued;
      var safeOwnership = totalSharesPost > 0 ? sharesIssued / totalSharesPost : 0;
      var impliedVal = effectivePPS * existingShares;
      var roundPreMoneyPPS = existingShares > 0 && preMoneyVal > 0 ? preMoneyVal / existingShares : 0;
      var safeAsPctOfPreMoney = preMoneyVal > 0 ? safeAmount / preMoneyVal : 0;
      var discount2Round = pricePerShareRound > 0 && effectivePPS > 0 ? 1 - effectivePPS / pricePerShareRound : 0;
      return buildResult(
        [
          { label: 'Effective PPS', value: '$' + effectivePPS.toFixed(4), tone: 'positive', help: 'The lower of cap PPS or discounted PPS — the price at which the SAFE converts.' },
          { label: 'Shares issued', value: formatNumber(Math.round(sharesIssued)), tone: 'neutral', help: 'SAFE amount divided by effective PPS.' },
          { label: 'SAFE ownership', value: formatPercentFromRatio(safeOwnership, 1), tone: 'neutral', help: 'SAFE holder percentage of post-conversion equity.' },
          { label: 'Conversion basis', value: conversionBasis, tone: 'neutral', help: 'Whether the cap or the discount produced the lower price.' }
        ],
        [
          { title: 'Cap PPS', value: '$' + capPPS.toFixed(4), tone: capPPS <= discountPPS || discountPPS === 0 ? 'positive' : 'neutral', text: 'Valuation cap / existing shares = ' + '$' + capPPS.toFixed(4) + '.' },
          { title: 'Discount PPS', value: '$' + discountPPS.toFixed(4), tone: discountPPS < capPPS ? 'positive' : 'neutral', text: 'Round PPS × (1 − ' + formatPercentFromRatio(discountPct, 1) + ') = ' + '$' + discountPPS.toFixed(4) + '.' },
          { title: 'Effective discount', value: formatPercentFromRatio(discount2Round, 1), tone: discount2Round > 0.3 ? 'positive' : 'neutral', text: 'Effective discount vs. round PPS.' },
          { title: 'SAFE vs pre-money', value: preMoneyVal > 0 ? formatPercentFromRatio(safeAsPctOfPreMoney, 1) : 'N/A', tone: 'neutral', text: preMoneyVal > 0 ? 'Round pre-money PPS is ' + '$' + roundPreMoneyPPS.toFixed(4) + '.' : 'Enter pre-money valuation for context.' },
          { title: 'MFN clause', value: mfnClause ? 'Yes' : 'No', tone: 'neutral', text: mfnClause ? 'Most Favored Nation clause applies — SAFE terms match the best later SAFE.' : 'No MFN clause.' }
        ],
        [
          { title: 'SAFEs convert at the lower price', text: 'When a SAFE has both a cap and a discount, the holder gets whichever produces the lower price per share (more shares).' },
          { title: 'Cap vs. discount depends on round price', text: 'If the priced round is at a high valuation, the cap likely governs. If the round is near or below the cap, the discount may dominate.' },
          { title: 'Post-money SAFEs include themselves', text: 'Y Combinator post-money SAFEs define the cap as inclusive of SAFE shares, changing the math vs. pre-money SAFEs.' },
          { title: 'Multiple SAFEs stack dilution', text: 'If a company has issued several SAFEs, all convert at the priced round, compounding dilution to founders.' }
        ],
        [
          { label: 'SAFE amount', value: formatMoney(safeAmount) },
          { label: 'Valuation cap', value: formatMoney(valuationCap) },
          { label: 'Discount', value: formatPercentFromRatio(discountPct, 1) },
          { label: 'Round PPS', value: '$' + pricePerShareRound.toFixed(4) },
          { label: 'Cap PPS', value: '$' + capPPS.toFixed(4) },
          { label: 'Discount PPS', value: '$' + discountPPS.toFixed(4) },
          { label: 'Effective PPS', value: '$' + effectivePPS.toFixed(4) },
          { label: 'Shares issued', value: formatNumber(Math.round(sharesIssued)) },
          { label: 'SAFE ownership', value: formatPercentFromRatio(safeOwnership, 1) }
        ],
        null,
        [{ 'SAFE amount': safeAmount, 'Cap': valuationCap, 'Discount %': (discountPct * 100).toFixed(1), 'Round PPS': pricePerShareRound.toFixed(4), 'Effective PPS': effectivePPS.toFixed(4), 'Shares': Math.round(sharesIssued), 'Ownership %': (safeOwnership * 100).toFixed(2) }],
        'SAFE converts at ' + '$' + effectivePPS.toFixed(4) + ' (' + conversionBasis.toLowerCase() + ') for ' + formatPercentFromRatio(safeOwnership, 1) + ' ownership.'
      );
    },

    /* ── 184 Startup Revenue Forecast Model ──────────────────────── */
    'startup-revenue-forecast-model': function (values) {
      var currentMRR = parseFloat(values.currentMRR) || 0;
      var monthlyGrowthRate = (parseFloat(values.monthlyGrowthRate) || 0) / 100;
      var churnRate = (parseFloat(values.churnRate) || 0) / 100;
      var forecastMonths = parseInt(values.forecastMonths, 10) || 12;
      if (forecastMonths > 36) forecastMonths = 36;
      var cac = parseFloat(values.cac) || 0;
      var newCustomersM1 = parseFloat(values.newCustomersMonth1) || 0;
      var arpu = parseFloat(values.arpu) || 0;
      var tblRows = []; var exp = [];
      var mrr = currentMRR;
      var totalRev = 0; var peakMRR = currentMRR; var customers = arpu > 0 ? currentMRR / arpu : 0;
      for (var m = 1; m <= forecastMonths; m++) {
        var newCust = newCustomersM1 * Math.pow(1 + monthlyGrowthRate, m - 1);
        var churned = customers * churnRate;
        customers = customers - churned + newCust;
        mrr = customers * arpu;
        if (mrr > peakMRR) peakMRR = mrr;
        totalRev += mrr;
        var arr = mrr * 12;
        tblRows.push(['Month ' + m, formatNumber(Math.round(customers)), formatNumber(Math.round(newCust)), formatNumber(Math.round(churned)), formatMoney(mrr), formatMoney(arr)]);
        exp.push({ Month: m, Customers: Math.round(customers), New: Math.round(newCust), Churned: Math.round(churned), MRR: mrr.toFixed(0), ARR: arr.toFixed(0) });
      }
      var endMRR = mrr;
      var endARR = endMRR * 12;
      var mrrGrowthTotal = currentMRR > 0 ? (endMRR - currentMRR) / currentMRR : 0;
      var impliedLTV = churnRate > 0 ? arpu / churnRate : 0;
      var ltvCac = cac > 0 ? impliedLTV / cac : 0;
      return buildResult(
        [
          { label: 'Ending MRR', value: formatMoney(endMRR), tone: 'positive', help: 'Monthly recurring revenue at the end of the forecast period.' },
          { label: 'Ending ARR', value: formatMoney(endARR), tone: 'positive', help: 'Annualized run-rate (MRR × 12).' },
          { label: 'Total revenue', value: formatMoney(totalRev), tone: 'neutral', help: 'Cumulative MRR over the forecast period.' },
          { label: 'MRR growth', value: formatPercentFromRatio(mrrGrowthTotal, 1), tone: mrrGrowthTotal > 1 ? 'positive' : 'neutral', help: 'Total percentage growth from starting to ending MRR.' }
        ],
        [
          { title: 'Peak MRR', value: formatMoney(peakMRR), tone: 'positive', text: 'Highest MRR reached during the forecast.' },
          { title: 'Ending customers', value: formatNumber(Math.round(customers)), tone: 'neutral', text: 'Active customer count at end of forecast.' },
          { title: 'Implied LTV', value: formatMoney(impliedLTV), tone: impliedLTV > 0 ? 'positive' : 'neutral', text: 'ARPU / monthly churn rate.' },
          { title: 'LTV:CAC', value: ltvCac > 0 ? formatRatio(ltvCac) : '—', tone: ltvCac >= 3 ? 'positive' : ltvCac >= 1 ? 'neutral' : 'warning', text: 'Customer lifetime value to acquisition cost ratio.' }
        ],
        [
          { title: 'MRR compounds quickly', text: 'Even small differences in monthly growth rate produce large differences in ARR over 12–36 months.' },
          { title: 'Churn is the silent killer', text: 'High churn requires proportionally more new customers just to maintain the same MRR.' },
          { title: 'LTV:CAC should exceed 3×', text: 'A healthy SaaS business targets LTV:CAC of 3× or higher. Below 1× means you lose money on each customer.' },
          { title: 'Forecasts are directional', text: 'Use this model to stress-test assumptions, not as a precise prediction of future revenue.' }
        ],
        [
          { label: 'Starting MRR', value: formatMoney(currentMRR) },
          { label: 'Ending MRR', value: formatMoney(endMRR) },
          { label: 'Ending ARR', value: formatMoney(endARR) },
          { label: 'Total revenue', value: formatMoney(totalRev) },
          { label: 'ARPU', value: formatMoney(arpu) },
          { label: 'CAC', value: formatMoney(cac) },
          { label: 'LTV', value: formatMoney(impliedLTV) },
          { label: 'LTV:CAC', value: ltvCac > 0 ? formatRatio(ltvCac) : '—' }
        ],
        { columns: ['Month', 'Customers', 'New', 'Churned', 'MRR', 'ARR'], rows: tblRows },
        exp,
        'MRR grows from ' + formatMoney(currentMRR) + ' to ' + formatMoney(endMRR) + ' over ' + forecastMonths + ' months (' + formatPercentFromRatio(mrrGrowthTotal, 1) + ').'
      );
    },

    /* ── 185 Customer Lifetime Value Calculator ──────────────────── */
    'customer-lifetime-value-calculator': function (values) {
      var arpu = parseFloat(values.arpu) || 0;
      var grossMarginPct = (parseFloat(values.grossMarginPct) || 100) / 100;
      var monthlyChurn = (parseFloat(values.monthlyChurnRate) || 0) / 100;
      var cac = parseFloat(values.cac) || 0;
      var discountRate = (parseFloat(values.annualDiscountRate) || 0) / 100;
      var expansionRevenue = parseFloat(values.expansionRevenue) || 0;
      var effectiveARPU = arpu + expansionRevenue;
      var avgLifetimeMonths = monthlyChurn > 0 ? 1 / monthlyChurn : 0;
      var simpleLTV = monthlyChurn > 0 ? effectiveARPU / monthlyChurn : 0;
      var grossMarginLTV = simpleLTV * grossMarginPct;
      var monthlyDiscount = discountRate / 12;
      var dcfLTV = (monthlyChurn + monthlyDiscount) > 0 ? effectiveARPU * grossMarginPct / (monthlyChurn + monthlyDiscount) : grossMarginLTV;
      var ltvCac = cac > 0 ? dcfLTV / cac : 0;
      var paybackMonths = (effectiveARPU * grossMarginPct) > 0 ? cac / (effectiveARPU * grossMarginPct) : 0;
      var annualChurn = 1 - Math.pow(1 - monthlyChurn, 12);
      var annualRetention = 1 - annualChurn;
      return buildResult(
        [
          { label: 'LTV (DCF)', value: formatMoney(dcfLTV), tone: 'positive', help: 'Discounted customer lifetime value = (ARPU × margin) / (churn + discount rate).' },
          { label: 'LTV:CAC', value: ltvCac > 0 ? formatRatio(ltvCac) : '—', tone: ltvCac >= 3 ? 'positive' : ltvCac >= 1 ? 'neutral' : 'warning', help: 'Lifetime value to customer acquisition cost ratio. Target ≥ 3×.' },
          { label: 'Payback period', value: paybackMonths > 0 ? formatMonths(paybackMonths) : '—', tone: paybackMonths <= 12 ? 'positive' : paybackMonths <= 18 ? 'neutral' : 'warning', help: 'Months to recover CAC from gross margin.' },
          { label: 'Avg lifetime', value: avgLifetimeMonths > 0 ? formatMonths(avgLifetimeMonths) : '—', tone: 'neutral', help: 'Expected customer lifetime = 1 / monthly churn.' }
        ],
        [
          { title: 'Simple LTV', value: formatMoney(simpleLTV), tone: 'neutral', text: 'ARPU / monthly churn (no margin or discounting).' },
          { title: 'Gross margin LTV', value: formatMoney(grossMarginLTV), tone: 'neutral', text: 'Simple LTV adjusted for gross margin.' },
          { title: 'Annual churn', value: formatPercentFromRatio(annualChurn, 1), tone: annualChurn > 0.1 ? 'warning' : 'neutral', text: 'Annualized churn = 1 − (1 − monthly churn)^12.' },
          { title: 'Annual retention', value: formatPercentFromRatio(annualRetention, 1), tone: annualRetention >= 0.9 ? 'positive' : 'neutral', text: 'Percentage of customers retained annually.' }
        ],
        [
          { title: 'LTV:CAC ≥ 3× is the benchmark', text: 'Most SaaS investors look for a 3× or better ratio. Below 1× means you spend more to acquire than you earn.' },
          { title: 'Payback under 12 months is ideal', text: 'The faster you recover CAC, the faster you can reinvest in growth.' },
          { title: 'Expansion revenue improves LTV', text: 'Upsells and cross-sells increase effective ARPU without additional acquisition cost.' },
          { title: 'Discounting matters for long lifetimes', text: 'When churn is very low, discounting prevents LTV from being unrealistically large.' }
        ],
        [
          { label: 'ARPU', value: formatMoney(arpu) },
          { label: 'Expansion', value: formatMoney(expansionRevenue) },
          { label: 'Effective ARPU', value: formatMoney(effectiveARPU) },
          { label: 'Monthly churn', value: formatPercentFromRatio(monthlyChurn, 1) },
          { label: 'Gross margin', value: formatPercentFromRatio(grossMarginPct, 1) },
          { label: 'CAC', value: formatMoney(cac) },
          { label: 'LTV (DCF)', value: formatMoney(dcfLTV) },
          { label: 'LTV:CAC', value: ltvCac > 0 ? formatRatio(ltvCac) : '—' },
          { label: 'Payback', value: paybackMonths > 0 ? formatMonths(paybackMonths) : '—' }
        ],
        null,
        [{ ARPU: arpu, 'Expansion': expansionRevenue, 'Churn %': (monthlyChurn * 100).toFixed(2), 'Margin %': (grossMarginPct * 100).toFixed(1), CAC: cac, 'LTV (DCF)': dcfLTV.toFixed(0), 'LTV:CAC': ltvCac.toFixed(2), 'Payback months': paybackMonths.toFixed(1) }],
        'LTV ' + formatMoney(dcfLTV) + ' | LTV:CAC ' + (ltvCac > 0 ? formatRatio(ltvCac) : '—') + ' | Payback ' + (paybackMonths > 0 ? formatMonths(paybackMonths) : '—') + '.'
      );
    },

    /* ── 186 Payback Period Calculator ───────────────────────────── */
    'payback-period-calculator': function (values) {
      var initialInvestment = parseFloat(values.initialInvestment) || 0;
      var discountRate = (parseFloat(values.discountRate) || 0) / 100;
      var cf1 = parseFloat(values.cashFlow1) || 0;
      var cf2 = parseFloat(values.cashFlow2) || 0;
      var cf3 = parseFloat(values.cashFlow3) || 0;
      var cf4 = parseFloat(values.cashFlow4) || 0;
      var cf5 = parseFloat(values.cashFlow5) || 0;
      var cf6 = parseFloat(values.cashFlow6) || 0;
      var cf7 = parseFloat(values.cashFlow7) || 0;
      var cf8 = parseFloat(values.cashFlow8) || 0;
      var flows = [cf1, cf2, cf3, cf4, cf5, cf6, cf7, cf8].filter(function (v, i) { return v !== 0 || i < 5; });
      var tblRows = []; var exp = [];
      var cumulative = -initialInvestment; var dcfCumulative = -initialInvestment;
      var simplePayback = -1; var discountedPayback = -1;
      var totalCF = 0; var totalDCF = 0;
      tblRows.push(['Year 0', formatMoney(-initialInvestment), formatMoney(-initialInvestment), formatMoney(-initialInvestment), formatMoney(-initialInvestment)]);
      exp.push({ Year: 0, 'Cash flow': -initialInvestment, Cumulative: -initialInvestment, 'DCF': -initialInvestment, 'DCF cumulative': -initialInvestment });
      for (var y = 0; y < flows.length; y++) {
        var cf = flows[y];
        var dcf = cf / Math.pow(1 + discountRate, y + 1);
        cumulative += cf;
        dcfCumulative += dcf;
        totalCF += cf;
        totalDCF += dcf;
        tblRows.push(['Year ' + (y + 1), formatMoney(cf), formatMoney(cumulative), formatMoney(dcf), formatMoney(dcfCumulative)]);
        exp.push({ Year: y + 1, 'Cash flow': cf.toFixed(0), Cumulative: cumulative.toFixed(0), DCF: dcf.toFixed(0), 'DCF cumulative': dcfCumulative.toFixed(0) });
        if (simplePayback < 0 && cumulative >= 0) {
          var prevCum = cumulative - cf;
          simplePayback = y + (cf !== 0 ? (-prevCum) / cf : 0);
        }
        if (discountedPayback < 0 && dcfCumulative >= 0) {
          var prevDCum = dcfCumulative - dcf;
          discountedPayback = y + (dcf !== 0 ? (-prevDCum) / dcf : 0);
        }
      }
      var npv = dcfCumulative;
      var roi = initialInvestment > 0 ? totalCF / initialInvestment : 0;
      return buildResult(
        [
          { label: 'Simple payback', value: simplePayback >= 0 ? simplePayback.toFixed(2) + ' years' : 'Not recovered', tone: simplePayback >= 0 && simplePayback <= 3 ? 'positive' : 'warning', help: 'Years to recover the initial investment (undiscounted).' },
          { label: 'Discounted payback', value: discountedPayback >= 0 ? discountedPayback.toFixed(2) + ' years' : 'Not recovered', tone: discountedPayback >= 0 && discountedPayback <= 4 ? 'positive' : 'warning', help: 'Years to recover the initial investment using discounted cash flows.' },
          { label: 'NPV', value: formatMoney(npv), tone: npv >= 0 ? 'positive' : 'warning', help: 'Net present value of all cash flows including initial investment.' },
          { label: 'ROI', value: formatPercentFromRatio(roi, 1), tone: roi > 0 ? 'positive' : 'warning', help: 'Total undiscounted return on investment.' }
        ],
        [
          { title: 'Total cash inflows', value: formatMoney(totalCF), tone: 'neutral', text: 'Sum of all projected cash flows (undiscounted).' },
          { title: 'Total discounted inflows', value: formatMoney(totalDCF), tone: 'neutral', text: 'Sum of all cash flows discounted at ' + formatPercentFromRatio(discountRate, 1) + '.' },
          { title: 'Investment', value: formatMoney(initialInvestment), tone: 'neutral', text: 'Initial cash outlay at Year 0.' },
          { title: 'Discount rate', value: formatPercentFromRatio(discountRate, 1), tone: 'neutral', text: 'Rate used for time value of money.' }
        ],
        [
          { title: 'Simple payback ignores time value', text: 'It treats a dollar received in Year 5 the same as Year 1. Discounted payback adjusts for this.' },
          { title: 'NPV is the gold standard', text: 'A positive NPV means the project creates value above the discount rate.' },
          { title: 'Payback ignores post-payback flows', text: 'A project may pay back quickly but generate little value after, or vice versa.' },
          { title: 'Use with IRR for a complete picture', text: 'Payback period tells you when; NPV and IRR tell you how much and at what return.' }
        ],
        [
          { label: 'Investment', value: formatMoney(initialInvestment) },
          { label: 'Simple payback', value: simplePayback >= 0 ? simplePayback.toFixed(2) + ' yrs' : 'N/A' },
          { label: 'Discounted payback', value: discountedPayback >= 0 ? discountedPayback.toFixed(2) + ' yrs' : 'N/A' },
          { label: 'NPV', value: formatMoney(npv) },
          { label: 'ROI', value: formatPercentFromRatio(roi, 1) }
        ],
        { columns: ['Period', 'Cash flow', 'Cumulative', 'DCF', 'DCF cumulative'], rows: tblRows },
        exp,
        'Simple payback ' + (simplePayback >= 0 ? simplePayback.toFixed(2) + ' years' : 'not recovered') + '. Discounted payback ' + (discountedPayback >= 0 ? discountedPayback.toFixed(2) + ' years' : 'not recovered') + '. NPV ' + formatMoney(npv) + '.'
      );
    },

    /* ── 187 409A Valuation Input Organizer ──────────────────────── */
    '409a-valuation-input-organizer': function (values) {
      var lastPreferred = parseFloat(values.lastPreferredPPS) || 0;
      var totalEquityValue = parseFloat(values.totalEquityValue) || 0;
      var totalShares = parseFloat(values.totalSharesOutstanding) || 0;
      var preferredShares = parseFloat(values.preferredSharesOutstanding) || 0;
      var liquidationPref = parseFloat(values.liquidationPreference) || 0;
      var dlomPct = (parseFloat(values.dlomPct) || 0) / 100;
      var dlocPct = (parseFloat(values.dlocPct) || 0) / 100;
      var stage = values.companyStage || 'Early';
      var lastRoundDate = values.lastRoundDate || 'N/A';
      var commonShares = totalShares - preferredShares;
      var residualValue = totalEquityValue - liquidationPref;
      if (residualValue < 0) residualValue = 0;
      var commonValuePreDiscount = commonShares > 0 ? residualValue / commonShares : 0;
      var afterDLOM = commonValuePreDiscount * (1 - dlomPct);
      var afterDLOC = afterDLOM * (1 - dlocPct);
      var fmv409a = afterDLOC;
      var discountToPreferred = lastPreferred > 0 ? 1 - fmv409a / lastPreferred : 0;
      var commonPctOfTotal = totalEquityValue > 0 ? (fmv409a * commonShares) / totalEquityValue : 0;
      return buildResult(
        [
          { label: 'Implied FMV (409A)', value: '$' + fmv409a.toFixed(4), tone: 'positive', help: 'Common stock fair market value after DLOM and DLOC.' },
          { label: 'Discount to preferred', value: formatPercentFromRatio(discountToPreferred, 1), tone: discountToPreferred > 0 ? 'positive' : 'neutral', help: '409A FMV as a discount to the last preferred PPS.' },
          { label: 'DLOM applied', value: formatPercentFromRatio(dlomPct, 1), tone: 'neutral', help: 'Discount for lack of marketability.' },
          { label: 'Residual to common', value: formatMoney(residualValue), tone: residualValue > 0 ? 'positive' : 'warning', help: 'Equity value remaining after liquidation preferences.' }
        ],
        [
          { title: 'Total equity value', value: formatMoney(totalEquityValue), tone: 'neutral', text: 'Enterprise value or equity value used for allocation.' },
          { title: 'Liquidation preference', value: formatMoney(liquidationPref), tone: 'neutral', text: 'Amount preferred shareholders receive first.' },
          { title: 'Pre-discount common PPS', value: '$' + commonValuePreDiscount.toFixed(4), tone: 'neutral', text: 'Residual value / common shares before discounts.' },
          { title: 'Company stage', value: stage, tone: 'neutral', text: 'Stage affects appropriate DLOM and allocation method.' },
          { title: 'Last round date', value: lastRoundDate, tone: 'neutral', text: 'Most recent financing round used for context.' }
        ],
        [
          { title: '409A protects employees from tax penalties', text: 'Stock options must be granted at or above FMV to avoid Section 409A penalties (20% tax + interest).' },
          { title: 'DLOM typically ranges 20–40%', text: 'The discount for lack of marketability reflects that private stock cannot be freely traded.' },
          { title: 'Backsolve from last round is common', text: 'The OPM backsolve method uses the most recent preferred round price to derive common stock value.' },
          { title: 'Update annually or at material events', text: 'A 409A valuation is valid for 12 months unless a material event occurs (new funding, M&A, etc.).' }
        ],
        [
          { label: 'Last preferred PPS', value: '$' + lastPreferred.toFixed(4) },
          { label: 'Total equity value', value: formatMoney(totalEquityValue) },
          { label: 'Liquidation preference', value: formatMoney(liquidationPref) },
          { label: 'Residual', value: formatMoney(residualValue) },
          { label: 'Common shares', value: formatNumber(commonShares) },
          { label: 'Pre-discount PPS', value: '$' + commonValuePreDiscount.toFixed(4) },
          { label: 'DLOM', value: formatPercentFromRatio(dlomPct, 1) },
          { label: 'DLOC', value: formatPercentFromRatio(dlocPct, 1) },
          { label: 'Last round', value: lastRoundDate },
          { label: '409A FMV', value: '$' + fmv409a.toFixed(4) }
        ],
        null,
        [{ 'Preferred PPS': lastPreferred.toFixed(4), 'Equity value': totalEquityValue, 'Liq pref': liquidationPref, 'Residual': residualValue.toFixed(0), 'Common shares': commonShares, 'Pre-disc PPS': commonValuePreDiscount.toFixed(4), 'DLOM %': (dlomPct * 100).toFixed(1), '409A FMV': fmv409a.toFixed(4) }],
        '409A FMV is $' + fmv409a.toFixed(4) + ' (' + formatPercentFromRatio(discountToPreferred, 1) + ' discount to preferred).'
      );
    },

    /* ── 188 Stock Option Expense (ASC 718) ──────────────────────── */
    'stock-option-expense-asc718': function (values) {
      var grantDateFMV = parseFloat(values.grantDateFMV) || 0;
      var exercisePrice = parseFloat(values.exercisePrice) || 0;
      var expectedTerm = parseFloat(values.expectedTerm) || 0;
      var volatility = (parseFloat(values.volatility) || 0) / 100;
      var riskFreeRate = (parseFloat(values.riskFreeRate) || 0) / 100;
      var dividendYield = (parseFloat(values.dividendYield) || 0) / 100;
      var numberOfOptions = parseFloat(values.numberOfOptions) || 0;
      var vestingYears = parseFloat(values.vestingYears) || 4;
      var forfeitureRate = (parseFloat(values.forfeitureRate) || 0) / 100;
      /* Black-Scholes */
      function normCdf(x) {
        var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        var sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.sqrt(2);
        var t = 1 / (1 + p * x);
        var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1 + sign * y);
      }
      var bsValue = 0;
      if (volatility > 0 && expectedTerm > 0 && grantDateFMV > 0 && exercisePrice > 0) {
        var d1 = (Math.log(grantDateFMV / exercisePrice) + (riskFreeRate - dividendYield + 0.5 * volatility * volatility) * expectedTerm) / (volatility * Math.sqrt(expectedTerm));
        var d2 = d1 - volatility * Math.sqrt(expectedTerm);
        bsValue = grantDateFMV * Math.exp(-dividendYield * expectedTerm) * normCdf(d1) - exercisePrice * Math.exp(-riskFreeRate * expectedTerm) * normCdf(d2);
      }
      var totalFV = bsValue * numberOfOptions;
      var netOptions = numberOfOptions * (1 - forfeitureRate);
      var totalExpense = bsValue * netOptions;
      var annualExpense = vestingYears > 0 ? totalExpense / vestingYears : totalExpense;
      var intrinsicValue = Math.max(grantDateFMV - exercisePrice, 0) * numberOfOptions;
      var timeValue = totalFV - intrinsicValue;
      return buildResult(
        [
          { label: 'Per-option FV', value: '$' + bsValue.toFixed(4), tone: 'positive', help: 'Black-Scholes fair value per option at grant date.' },
          { label: 'Total expense', value: formatMoney(totalExpense), tone: 'neutral', help: 'Total ASC 718 compensation expense (after forfeitures).' },
          { label: 'Annual expense', value: formatMoney(annualExpense), tone: 'neutral', help: 'Straight-line expense per year over the vesting period.' },
          { label: 'Effective options', value: formatNumber(Math.round(netOptions)), tone: 'neutral', help: 'Options expected to vest = grants × (1 − forfeiture rate).' }
        ],
        [
          { title: 'Intrinsic value', value: formatMoney(intrinsicValue), tone: intrinsicValue > 0 ? 'positive' : 'neutral', text: 'Max(FMV − strike, 0) × number of options.' },
          { title: 'Time value', value: formatMoney(timeValue), tone: 'neutral', text: 'Fair value less intrinsic value — the option premium for remaining life.' },
          { title: 'Total FV (pre-forfeiture)', value: formatMoney(totalFV), tone: 'neutral', text: 'Black-Scholes value × total options granted.' },
          { title: 'Vesting period', value: vestingYears + ' years', tone: 'neutral', text: 'Expense recognized straight-line over this period.' }
        ],
        [
          { title: 'ASC 718 requires fair-value expensing', text: 'All share-based compensation must be recognized as an expense at fair value over the vesting period.' },
          { title: 'Black-Scholes is the standard model', text: 'It uses stock price, strike, expected term, volatility, risk-free rate, and dividend yield as inputs.' },
          { title: 'Volatility has the biggest impact', text: 'A 10-point change in expected volatility can significantly change the per-option value.' },
          { title: 'Forfeitures can be estimated or actual', text: 'ASC 718 allows either estimating forfeitures upfront or recognizing them as they occur.' }
        ],
        [
          { label: 'FMV at grant', value: '$' + grantDateFMV.toFixed(4) },
          { label: 'Exercise price', value: '$' + exercisePrice.toFixed(4) },
          { label: 'Expected term', value: expectedTerm + ' years' },
          { label: 'Volatility', value: formatPercentFromRatio(volatility, 1) },
          { label: 'Risk-free rate', value: formatPercentFromRatio(riskFreeRate, 1) },
          { label: 'BS value', value: '$' + bsValue.toFixed(4) },
          { label: 'Options granted', value: formatNumber(numberOfOptions) },
          { label: 'Forfeiture rate', value: formatPercentFromRatio(forfeitureRate, 1) },
          { label: 'Total expense', value: formatMoney(totalExpense) },
          { label: 'Annual expense', value: formatMoney(annualExpense) }
        ],
        null,
        [{ 'FMV': grantDateFMV.toFixed(4), 'Strike': exercisePrice.toFixed(4), 'Term (yrs)': expectedTerm, 'Vol %': (volatility * 100).toFixed(1), 'RF %': (riskFreeRate * 100).toFixed(2), 'BS value': bsValue.toFixed(4), Options: numberOfOptions, 'Forfeiture %': (forfeitureRate * 100).toFixed(1), 'Total expense': totalExpense.toFixed(0), 'Annual': annualExpense.toFixed(0) }],
        'Per-option FV $' + bsValue.toFixed(4) + '. Total ASC 718 expense ' + formatMoney(totalExpense) + ' over ' + vestingYears + ' years.'
      );
    },

    /* ── 189 Headcount & Hiring Cost Planner ─────────────────────── */
    'headcount-hiring-cost-planner': function (values, rows) {
      var planMonths = parseInt(values.planMonths, 10) || 12;
      if (planMonths > 24) planMonths = 24;
      var benefitLoadPct = (parseFloat(values.benefitLoadPct) || 0) / 100;
      var recruitingCostPerHire = parseFloat(values.recruitingCostPerHire) || 0;
      var tblRows = []; var exp = [];
      var totalAnnualSalary = 0; var totalLoadedCost = 0; var totalRecruitingCost = 0;
      var totalHeadcount = 0; var monthlyCosts = [];
      for (var m = 0; m < planMonths; m++) monthlyCosts[m] = 0;
      rows.forEach(function (r) {
        var role = r.roleTitle || 'TBD';
        var salary = parseFloat(r.annualSalary) || 0;
        var startMonth = parseInt(r.startMonth, 10) || 1;
        var count = parseInt(r.headcount, 10) || 1;
        var monthlySalary = salary / 12;
        var monthlyLoaded = monthlySalary * (1 + benefitLoadPct);
        var activeMonths = Math.max(0, planMonths - startMonth + 1);
        var roleTotalCost = monthlyLoaded * activeMonths * count;
        var roleRecruiting = recruitingCostPerHire * count;
        totalAnnualSalary += salary * count;
        totalLoadedCost += roleTotalCost;
        totalRecruitingCost += roleRecruiting;
        totalHeadcount += count;
        for (var m = startMonth - 1; m < planMonths; m++) {
          monthlyCosts[m] += monthlyLoaded * count;
        }
        tblRows.push([role, formatNumber(count), 'Month ' + startMonth, formatMoney(salary), formatMoney(monthlyLoaded), formatNumber(activeMonths), formatMoney(roleTotalCost)]);
        exp.push({ Role: role, Count: count, Start: startMonth, Salary: salary, 'Loaded monthly': monthlyLoaded.toFixed(0), 'Active months': activeMonths, 'Total cost': roleTotalCost.toFixed(0) });
      });
      var grandTotal = totalLoadedCost + totalRecruitingCost;
      var avgMonthlyCost = planMonths > 0 ? totalLoadedCost / planMonths : 0;
      var peakMonthlyCost = Math.max.apply(null, monthlyCosts.length ? monthlyCosts : [0]);
      return buildResult(
        [
          { label: 'Total headcount', value: formatNumber(totalHeadcount), tone: 'neutral', help: 'Sum of all planned hires across roles.' },
          { label: 'Total loaded cost', value: formatMoney(grandTotal), tone: 'neutral', help: 'All-in cost = loaded salaries + recruiting fees.' },
          { label: 'Peak monthly burn', value: formatMoney(peakMonthlyCost), tone: 'neutral', help: 'Highest monthly loaded payroll cost once all hires are onboarded.' },
          { label: 'Avg monthly cost', value: formatMoney(avgMonthlyCost), tone: 'neutral', help: 'Average monthly loaded payroll over the plan period.' }
        ],
        [
          { title: 'Total base salaries', value: formatMoney(totalAnnualSalary), tone: 'neutral', text: 'Sum of annual base salaries × headcount.' },
          { title: 'Benefit load', value: formatPercentFromRatio(benefitLoadPct, 1), tone: 'neutral', text: 'Benefits, taxes, and overhead as a percentage of salary.' },
          { title: 'Recruiting costs', value: formatMoney(totalRecruitingCost), tone: 'neutral', text: formatMoney(recruitingCostPerHire) + ' per hire × ' + formatNumber(totalHeadcount) + ' hires.' },
          { title: 'Plan period', value: planMonths + ' months', tone: 'neutral', text: 'Planning horizon for headcount ramp.' }
        ],
        [
          { title: 'Loaded cost > base salary', text: 'Benefits, payroll taxes, equipment, and overhead typically add 25–40% on top of base salary.' },
          { title: 'Stagger start dates to manage burn', text: 'Hiring all at once spikes burn rate. Phasing hires smooths cash flow.' },
          { title: 'Recruiting costs are front-loaded', text: 'Agency fees, job boards, and recruiter time are incurred before the hire starts contributing.' },
          { title: 'Tie headcount plan to revenue milestones', text: 'Scale hiring to match projected revenue and fundraising to avoid running out of runway.' }
        ],
        [
          { label: 'Headcount', value: formatNumber(totalHeadcount) },
          { label: 'Base salaries', value: formatMoney(totalAnnualSalary) },
          { label: 'Loaded cost', value: formatMoney(totalLoadedCost) },
          { label: 'Recruiting', value: formatMoney(totalRecruitingCost) },
          { label: 'Grand total', value: formatMoney(grandTotal) },
          { label: 'Peak monthly', value: formatMoney(peakMonthlyCost) },
          { label: 'Avg monthly', value: formatMoney(avgMonthlyCost) }
        ],
        { columns: ['Role', 'Count', 'Start', 'Annual salary', 'Loaded monthly', 'Active months', 'Total cost'], rows: tblRows },
        exp,
        totalHeadcount + ' hires planned. Total loaded cost ' + formatMoney(grandTotal) + ' over ' + planMonths + ' months. Peak monthly burn ' + formatMoney(peakMonthlyCost) + '.'
      );
    },

    /* ── 190 Net Revenue Retention Calculator ────────────────────── */
    'net-revenue-retention-calculator': function (values) {
      var beginningARR = parseFloat(values.beginningARR) || 0;
      var expansion = parseFloat(values.expansionARR) || 0;
      var contraction = parseFloat(values.contractionARR) || 0;
      var churnedARR = parseFloat(values.churnedARR) || 0;
      var endingARR = beginningARR + expansion - contraction - churnedARR;
      var nrr = beginningARR > 0 ? endingARR / beginningARR : 0;
      var grossRetention = beginningARR > 0 ? (beginningARR - churnedARR) / beginningARR : 0;
      var expansionRate = beginningARR > 0 ? expansion / beginningARR : 0;
      var contractionRate = beginningARR > 0 ? contraction / beginningARR : 0;
      var churnRate = beginningARR > 0 ? churnedARR / beginningARR : 0;
      var netNewARR = expansion - contraction - churnedARR;
      var impliedLTV = churnRate > 0 ? (beginningARR / 12) / churnRate : 0;
      return buildResult(
        [
          { label: 'Net revenue retention', value: formatPercentFromRatio(nrr, 1), tone: nrr >= 1.1 ? 'positive' : nrr >= 1 ? 'neutral' : 'warning', help: 'NRR = (Beginning + Expansion − Contraction − Churn) / Beginning ARR.' },
          { label: 'Gross retention', value: formatPercentFromRatio(grossRetention, 1), tone: grossRetention >= 0.9 ? 'positive' : grossRetention >= 0.8 ? 'neutral' : 'warning', help: 'Revenue retained from existing customers before expansion.' },
          { label: 'Ending ARR', value: formatMoney(endingARR), tone: endingARR > beginningARR ? 'positive' : 'warning', help: 'Beginning ARR + expansion − contraction − churn.' },
          { label: 'Net new ARR', value: formatMoney(netNewARR), tone: netNewARR >= 0 ? 'positive' : 'warning', help: 'Expansion minus contraction minus churn.' }
        ],
        [
          { title: 'Expansion rate', value: formatPercentFromRatio(expansionRate, 1), tone: expansionRate > 0 ? 'positive' : 'neutral', text: 'Upsell and cross-sell revenue as % of beginning ARR.' },
          { title: 'Contraction rate', value: formatPercentFromRatio(contractionRate, 1), tone: contractionRate > 0.05 ? 'warning' : 'neutral', text: 'Downgrades as % of beginning ARR.' },
          { title: 'Churn rate', value: formatPercentFromRatio(churnRate, 1), tone: churnRate > 0.1 ? 'warning' : 'neutral', text: 'Lost customers as % of beginning ARR.' },
          { title: 'Implied LTV', value: impliedLTV > 0 ? formatMoney(impliedLTV) : '—', tone: 'neutral', text: 'Monthly ARPU / monthly churn rate (simplified).' }
        ],
        [
          { title: 'NRR > 110% is best-in-class', text: 'Top SaaS companies achieve NRR above 120%, meaning each cohort grows over time without new customers.' },
          { title: 'Gross retention sets the floor', text: 'You cannot have NRR above gross retention without expansion revenue from existing customers.' },
          { title: 'NRR compounds over time', text: 'NRR above 100% means existing customer revenue grows each year, creating a powerful compounding effect.' },
          { title: 'Separate logo churn from revenue churn', text: 'A few large customer losses can mask otherwise healthy logo retention. Track both metrics.' }
        ],
        [
          { label: 'Beginning ARR', value: formatMoney(beginningARR) },
          { label: 'Expansion', value: formatMoney(expansion) },
          { label: 'Contraction', value: formatMoney(contraction) },
          { label: 'Churned', value: formatMoney(churnedARR) },
          { label: 'Ending ARR', value: formatMoney(endingARR) },
          { label: 'NRR', value: formatPercentFromRatio(nrr, 1) },
          { label: 'Gross retention', value: formatPercentFromRatio(grossRetention, 1) },
          { label: 'Expansion rate', value: formatPercentFromRatio(expansionRate, 1) },
          { label: 'Churn rate', value: formatPercentFromRatio(churnRate, 1) }
        ],
        null,
        [{ 'Beginning ARR': beginningARR, Expansion: expansion, Contraction: contraction, Churned: churnedARR, 'Ending ARR': endingARR.toFixed(0), 'NRR %': (nrr * 100).toFixed(2), 'Gross ret %': (grossRetention * 100).toFixed(2) }],
        'NRR ' + formatPercentFromRatio(nrr, 1) + '. Gross retention ' + formatPercentFromRatio(grossRetention, 1) + '. Ending ARR ' + formatMoney(endingARR) + '.'
      );
    },

    /* ── 131 Net Operating Income (NOI) Calculator ───────────────── */
    'noi-calculator': function (values) {
      var grossRent = parseFloat(values.grossRentalIncome) || 0;
      var otherIncome = parseFloat(values.otherIncome) || 0;
      var vacancyPct = (parseFloat(values.vacancyRate) || 0) / 100;
      var propertyTax = parseFloat(values.propertyTax) || 0;
      var insurance = parseFloat(values.insurance) || 0;
      var maintenance = parseFloat(values.maintenance) || 0;
      var management = parseFloat(values.managementFees) || 0;
      var utilities = parseFloat(values.utilities) || 0;
      var otherExpenses = parseFloat(values.otherExpenses) || 0;
      var purchasePrice = parseFloat(values.purchasePrice) || 0;
      var pgi = grossRent + otherIncome;
      var vacancyLoss = pgi * vacancyPct;
      var egi = pgi - vacancyLoss;
      var totalOpex = propertyTax + insurance + maintenance + management + utilities + otherExpenses;
      var noi = egi - totalOpex;
      var capRate = purchasePrice > 0 ? noi / purchasePrice : 0;
      var expenseRatio = egi > 0 ? totalOpex / egi : 0;
      var noiMargin = egi > 0 ? noi / egi : 0;
      return buildResult(
        [{ label: 'Net operating income', value: formatMoney(noi), tone: noi > 0 ? 'positive' : 'warning', help: 'EGI minus total operating expenses.' },{ label: 'Cap rate', value: formatPercentFromRatio(capRate, 1), tone: capRate >= 0.05 ? 'positive' : 'neutral', help: 'NOI / purchase price.' },{ label: 'NOI margin', value: formatPercentFromRatio(noiMargin, 1), tone: noiMargin >= 0.5 ? 'positive' : 'neutral', help: 'NOI as a percentage of EGI.' },{ label: 'Expense ratio', value: formatPercentFromRatio(expenseRatio, 1), tone: expenseRatio <= 0.45 ? 'positive' : 'warning', help: 'Operating expenses / EGI.' }],
        [{ title: 'Potential gross income', value: formatMoney(pgi), tone: 'neutral', text: 'Gross rent + other income.' },{ title: 'Vacancy loss', value: formatMoney(vacancyLoss), tone: vacancyLoss > 0 ? 'warning' : 'neutral', text: formatPercentFromRatio(vacancyPct, 1) + ' vacancy.' },{ title: 'Effective gross income', value: formatMoney(egi), tone: 'neutral', text: 'PGI minus vacancy.' },{ title: 'Total operating expenses', value: formatMoney(totalOpex), tone: 'neutral', text: 'Sum of all operating costs.' }],
        [{ title: 'NOI excludes debt service', text: 'NOI measures property-level profitability before financing, making it comparable across properties.' },{ title: 'Cap rate = NOI / price', text: 'Higher cap rate means higher yield but often higher risk.' },{ title: 'Vacancy rate matters', text: 'Even a 5% difference in vacancy shifts NOI significantly.' },{ title: 'Management fees vary', text: 'Budget 8-12% for professional management.' }],
        [{ label: 'Gross rent', value: formatMoney(grossRent) },{ label: 'PGI', value: formatMoney(pgi) },{ label: 'Vacancy loss', value: formatMoney(vacancyLoss) },{ label: 'EGI', value: formatMoney(egi) },{ label: 'OpEx', value: formatMoney(totalOpex) },{ label: 'NOI', value: formatMoney(noi) },{ label: 'Cap rate', value: formatPercentFromRatio(capRate, 1) }],
        null,
        [{ 'Gross rent': grossRent, PGI: pgi, 'Vacancy': vacancyLoss.toFixed(0), EGI: egi.toFixed(0), OpEx: totalOpex.toFixed(0), NOI: noi.toFixed(0), 'Cap %': (capRate * 100).toFixed(2) }],
        'NOI ' + formatMoney(noi) + '. Cap rate ' + formatPercentFromRatio(capRate, 1) + '.'
      );
    },

    /* ── 132 Property Cash Flow Analyzer ─────────────────────────── */
    'property-cash-flow-analyzer': function (values) {
      var noi = parseFloat(values.noi) || 0; var annualDS = parseFloat(values.annualDebtService) || 0; var capex = parseFloat(values.capitalExpenditures) || 0; var loanBal = parseFloat(values.loanBalance) || 0; var price = parseFloat(values.purchasePrice) || 0; var down = parseFloat(values.downPayment) || 0; var appPct = (parseFloat(values.annualAppreciation) || 0) / 100; var hold = parseInt(values.holdingPeriod, 10) || 5;
      var cfBeforeCapex = noi - annualDS; var cf = cfBeforeCapex - capex; var dscr = annualDS > 0 ? noi / annualDS : 0; var coc = down > 0 ? cf / down : 0; var capRate = price > 0 ? noi / price : 0; var fv = price * Math.pow(1 + appPct, hold); var equity = fv - loanBal; var totalCF = cf * hold; var totalReturn = equity + totalCF - down; var roi = down > 0 ? totalReturn / down : 0;
      return buildResult(
        [{ label: 'Annual cash flow', value: formatMoney(cf), tone: cf > 0 ? 'positive' : 'warning', help: 'NOI minus debt service minus CapEx.' },{ label: 'Cash-on-cash', value: formatPercentFromRatio(coc, 1), tone: coc >= 0.08 ? 'positive' : 'neutral', help: 'Annual cash flow / down payment.' },{ label: 'DSCR', value: dscr > 0 ? formatRatio(dscr) : '—', tone: dscr >= 1.25 ? 'positive' : dscr >= 1 ? 'neutral' : 'warning', help: 'NOI / debt service. Lenders want >= 1.25x.' },{ label: 'Total ROI', value: formatPercentFromRatio(roi, 1), tone: roi > 0 ? 'positive' : 'warning', help: 'Total return over holding period / down payment.' }],
        [{ title: 'Cap rate', value: formatPercentFromRatio(capRate, 1), tone: 'neutral', text: 'NOI / purchase price.' },{ title: 'Future value', value: formatMoney(fv), tone: 'neutral', text: 'Property value after ' + hold + ' years.' },{ title: 'Equity', value: formatMoney(equity), tone: equity > 0 ? 'positive' : 'warning', text: 'Future value minus loan balance.' },{ title: 'Cumulative CF', value: formatMoney(totalCF), tone: totalCF > 0 ? 'positive' : 'warning', text: 'Annual CF x holding period.' }],
        [{ title: 'Cash flow is king', text: 'Positive cash flow from day one protects against downturns.' },{ title: 'DSCR >= 1.25x is the lender floor', text: 'Below 1.0x means the property cannot cover its debt.' },{ title: 'Appreciation is speculative', text: 'Underwrite on cash flow; treat appreciation as upside.' },{ title: 'CapEx reserves matter', text: 'Budget 5-10% of gross rent for capital reserves.' }],
        [{ label: 'NOI', value: formatMoney(noi) },{ label: 'Debt service', value: formatMoney(annualDS) },{ label: 'CapEx', value: formatMoney(capex) },{ label: 'Cash flow', value: formatMoney(cf) },{ label: 'DSCR', value: dscr > 0 ? formatRatio(dscr) : '—' },{ label: 'Cash-on-cash', value: formatPercentFromRatio(coc, 1) },{ label: 'Total ROI', value: formatPercentFromRatio(roi, 1) }],
        null,
        [{ NOI: noi, 'Debt svc': annualDS, CapEx: capex, CF: cf.toFixed(0), DSCR: dscr.toFixed(2), 'CoC %': (coc * 100).toFixed(2), 'ROI %': (roi * 100).toFixed(2) }],
        'Cash flow ' + formatMoney(cf) + '. DSCR ' + (dscr > 0 ? formatRatio(dscr) : '—') + '. Cash-on-cash ' + formatPercentFromRatio(coc, 1) + '.'
      );
    },

    /* ── 133 Revenue per Visit Calculator ────────────────────────── */
    'revenue-per-visit-calculator': function (values) {
      var totalRev = parseFloat(values.totalRevenue) || 0; var visits = parseFloat(values.totalVisits) || 0; var collections = parseFloat(values.totalCollections) || 0; var charges = parseFloat(values.totalCharges) || 0; var providers = parseFloat(values.providerCount) || 1; var days = parseFloat(values.workingDays) || 1;
      var rpv = visits > 0 ? totalRev / visits : 0; var cpv = visits > 0 ? collections / visits : 0; var collRate = charges > 0 ? collections / charges : 0; var vpd = visits / days; var rpp = totalRev / providers; var vpProvider = visits / providers;
      return buildResult(
        [{ label: 'Revenue per visit', value: formatMoney(rpv), tone: 'positive', help: 'Total revenue / visits.' },{ label: 'Collection per visit', value: formatMoney(cpv), tone: 'neutral', help: 'Collections / visits.' },{ label: 'Collection rate', value: formatPercentFromRatio(collRate, 1), tone: collRate >= 0.95 ? 'positive' : collRate >= 0.9 ? 'neutral' : 'warning', help: 'Collections / charges. Target >= 95%.' },{ label: 'Visits per day', value: vpd.toFixed(1), tone: 'neutral', help: 'Daily visit volume.' }],
        [{ title: 'Revenue per provider', value: formatMoney(rpp), tone: 'neutral', text: 'Total revenue / provider count.' },{ title: 'Visits per provider', value: formatNumber(Math.round(vpProvider)), tone: 'neutral', text: 'Avg visits per provider.' },{ title: 'Avg adjustment', value: formatPercentFromRatio(charges > 0 ? 1 - totalRev / charges : 0, 1), tone: 'neutral', text: 'Contractual adjustments as % of charges.' },{ title: 'Revenue per day', value: formatMoney(totalRev / days), tone: 'neutral', text: 'Daily revenue run rate.' }],
        [{ title: 'Revenue per visit is the core metric', text: 'It combines payer mix, coding accuracy, and fee schedule effectiveness.' },{ title: 'Collection rate should exceed 95%', text: 'Below 95% signals billing errors or denied claims.' },{ title: 'Track by payer type', text: 'Medicare, Medicaid, and commercial rates vary significantly.' },{ title: 'Volume drives revenue', text: 'Increasing visits per provider per day is often the fastest path to growth.' }],
        [{ label: 'Revenue', value: formatMoney(totalRev) },{ label: 'Visits', value: formatNumber(visits) },{ label: 'Rev/visit', value: formatMoney(rpv) },{ label: 'Collections', value: formatMoney(collections) },{ label: 'Collection rate', value: formatPercentFromRatio(collRate, 1) },{ label: 'Providers', value: formatNumber(providers) }],
        null,
        [{ Revenue: totalRev, Visits: visits, 'Rev/visit': rpv.toFixed(2), Collections: collections, 'Coll rate %': (collRate * 100).toFixed(2) }],
        'Revenue per visit ' + formatMoney(rpv) + '. Collection rate ' + formatPercentFromRatio(collRate, 1) + '.'
      );
    },

    /* ── 134 Insurance Reimbursement Rate Analyzer ───────────────── */
    'insurance-reimbursement-rate-analyzer': function (values) {
      var billed = parseFloat(values.billedCharges) || 0; var allowed = parseFloat(values.allowedAmount) || 0; var paid = parseFloat(values.paidAmount) || 0; var patResp = parseFloat(values.patientResponsibility) || 0; var medicareFee = parseFloat(values.medicareFeeSchedule) || 0; var claims = parseFloat(values.claimCount) || 1;
      var contractAdj = billed - allowed; var reimbRate = billed > 0 ? paid / billed : 0; var allowedRate = billed > 0 ? allowed / billed : 0; var paidPerClaim = paid / claims; var pctMedicare = medicareFee > 0 ? paid / medicareFee : 0;
      return buildResult(
        [{ label: 'Reimbursement rate', value: formatPercentFromRatio(reimbRate, 1), tone: reimbRate >= 0.5 ? 'positive' : 'warning', help: 'Paid / billed charges.' },{ label: 'Allowed rate', value: formatPercentFromRatio(allowedRate, 1), tone: 'neutral', help: 'Allowed / billed.' },{ label: '% of Medicare', value: medicareFee > 0 ? formatPercentFromRatio(pctMedicare, 1) : '—', tone: pctMedicare >= 1.2 ? 'positive' : 'neutral', help: 'Paid as % of Medicare fee schedule.' },{ label: 'Paid per claim', value: formatMoney(paidPerClaim), tone: 'neutral', help: 'Average payment per claim.' }],
        [{ title: 'Contractual adjustment', value: formatMoney(contractAdj), tone: 'neutral', text: 'Billed minus allowed.' },{ title: 'Patient responsibility', value: formatMoney(patResp), tone: 'neutral', text: 'Copays, deductibles, coinsurance.' },{ title: 'Billed per claim', value: formatMoney(billed / claims), tone: 'neutral', text: 'Average billed per claim.' },{ title: 'Claims', value: formatNumber(claims), tone: 'neutral', text: 'Total claims analyzed.' }],
        [{ title: 'Benchmark against Medicare', text: 'Commercial payers typically reimburse 120-200% of Medicare.' },{ title: 'Monitor by payer and CPT', text: 'Blended rates hide underpaying payers.' },{ title: 'Contractual adjustments are normal', text: 'Focus on allowed vs. paid and denials.' },{ title: 'Renegotiate underperforming contracts', text: 'Use data to identify and renegotiate weak payer contracts.' }],
        [{ label: 'Billed', value: formatMoney(billed) },{ label: 'Allowed', value: formatMoney(allowed) },{ label: 'Paid', value: formatMoney(paid) },{ label: 'Reimb rate', value: formatPercentFromRatio(reimbRate, 1) },{ label: '% Medicare', value: medicareFee > 0 ? formatPercentFromRatio(pctMedicare, 1) : '—' }],
        null,
        [{ Billed: billed, Allowed: allowed, Paid: paid, 'Reimb %': (reimbRate * 100).toFixed(2), '% Medicare': medicareFee > 0 ? (pctMedicare * 100).toFixed(2) : '—' }],
        'Reimbursement rate ' + formatPercentFromRatio(reimbRate, 1) + '.' + (medicareFee > 0 ? ' ' + formatPercentFromRatio(pctMedicare, 1) + ' of Medicare.' : '')
      );
    },

    /* ── 135 AR Days Calculator (Healthcare) ─────────────────────── */
    'ar-days-calculator-healthcare': function (values) {
      var totalAR = parseFloat(values.totalAR) || 0; var dailyCharges = parseFloat(values.avgDailyCharges) || 0; var totalCharges = parseFloat(values.totalCharges) || 0; var periodDays = parseInt(values.periodDays, 10) || 30;
      var ar030 = parseFloat(values.ar0to30) || 0; var ar3160 = parseFloat(values.ar31to60) || 0; var ar6190 = parseFloat(values.ar61to90) || 0; var ar91120 = parseFloat(values.ar91to120) || 0; var ar121 = parseFloat(values.ar121plus) || 0;
      if (dailyCharges === 0 && totalCharges > 0) dailyCharges = totalCharges / periodDays;
      var arDays = dailyCharges > 0 ? totalAR / dailyCharges : 0;
      var overdue = ar6190 + ar91120 + ar121; var overduePct = totalAR > 0 ? overdue / totalAR : 0;
      return buildResult(
        [{ label: 'A/R days', value: arDays.toFixed(1) + ' days', tone: arDays <= 35 ? 'positive' : arDays <= 50 ? 'neutral' : 'warning', help: 'Total A/R / avg daily charges. Target <= 35.' },{ label: 'Total A/R', value: formatMoney(totalAR), tone: 'neutral', help: 'Outstanding receivables.' },{ label: 'Over 60 days', value: formatPercentFromRatio(overduePct, 1), tone: overduePct <= 0.2 ? 'positive' : 'warning', help: 'A/R aged beyond 60 days. Target <= 20%.' },{ label: 'Avg daily charges', value: formatMoney(dailyCharges), tone: 'neutral', help: 'Average daily gross charges.' }],
        [{ title: '0-30 days', value: formatMoney(ar030), tone: 'positive', text: 'Current receivables.' },{ title: '31-60 days', value: formatMoney(ar3160), tone: 'neutral', text: 'First follow-up tier.' },{ title: '61-90 days', value: formatMoney(ar6190), tone: ar6190 > 0 ? 'warning' : 'neutral', text: 'Escalation tier.' },{ title: '91+ days', value: formatMoney(ar91120 + ar121), tone: 'warning', text: 'High-risk receivables.' }],
        [{ title: 'A/R days <= 35 is the benchmark', text: 'Above 50 signals systemic collection issues.' },{ title: 'Aging > 60 should be < 20%', text: 'More than 20% over 60 days indicates denied claims or poor follow-up.' },{ title: 'Track by payer', text: 'Government and commercial payers have different aging profiles.' },{ title: 'Denial management drives A/R days', text: 'A strong denial workflow is the fastest way to reduce A/R days.' }],
        [{ label: 'Total A/R', value: formatMoney(totalAR) },{ label: 'Daily charges', value: formatMoney(dailyCharges) },{ label: 'A/R days', value: arDays.toFixed(1) },{ label: '0-30', value: formatMoney(ar030) },{ label: '31-60', value: formatMoney(ar3160) },{ label: '61-90', value: formatMoney(ar6190) },{ label: '91+', value: formatMoney(ar91120 + ar121) }],
        null,
        [{ 'Total AR': totalAR, 'Daily charges': dailyCharges, 'AR days': arDays.toFixed(1), '0-30': ar030, '31-60': ar3160, '61-90': ar6190, '91+': ar91120 + ar121, 'Over60 %': (overduePct * 100).toFixed(1) }],
        'A/R days ' + arDays.toFixed(1) + '. ' + formatPercentFromRatio(overduePct, 1) + ' over 60 days.'
      );
    },

    /* ── 136 Cost per Procedure Calculator ───────────────────────── */
    'cost-per-procedure-calculator': function (values) {
      var labor = parseFloat(values.directLabor) || 0; var supplies = parseFloat(values.supplies) || 0; var equip = parseFloat(values.equipmentCost) || 0; var facilityOH = parseFloat(values.facilityOverhead) || 0; var adminOH = parseFloat(values.adminOverhead) || 0; var procCount = parseFloat(values.procedureCount) || 1; var reimb = parseFloat(values.avgReimbursement) || 0;
      var totalDirect = labor + supplies + equip; var totalIndirect = facilityOH + adminOH; var totalCost = totalDirect + totalIndirect; var cpp = totalCost / procCount; var margin = reimb - cpp; var marginPct = reimb > 0 ? margin / reimb : 0;
      return buildResult(
        [{ label: 'Cost per procedure', value: formatMoney(cpp), tone: 'neutral', help: 'Total cost / procedure count.' },{ label: 'Margin per procedure', value: formatMoney(margin), tone: margin > 0 ? 'positive' : 'warning', help: 'Reimbursement minus cost.' },{ label: 'Margin %', value: formatPercentFromRatio(marginPct, 1), tone: marginPct > 0.2 ? 'positive' : marginPct > 0 ? 'neutral' : 'warning', help: 'Margin / reimbursement.' },{ label: 'Breakeven volume', value: (reimb > 0 ? Math.ceil(totalCost / reimb) : 0) + '', tone: 'neutral', help: 'Procedures needed to cover total costs.' }],
        [{ title: 'Direct cost/proc', value: formatMoney(totalDirect / procCount), tone: 'neutral', text: 'Labor + supplies + equipment per procedure.' },{ title: 'Indirect cost/proc', value: formatMoney(totalIndirect / procCount), tone: 'neutral', text: 'Facility + admin per procedure.' },{ title: 'Total direct', value: formatMoney(totalDirect), tone: 'neutral', text: 'Sum of direct costs.' },{ title: 'Total indirect', value: formatMoney(totalIndirect), tone: 'neutral', text: 'Facility and admin overhead.' }],
        [{ title: 'Know your cost before negotiating', text: 'You cannot negotiate rates without knowing procedure costs.' },{ title: 'Indirect costs are often underestimated', text: 'Facility and admin can be 30-50% of total cost.' },{ title: 'Volume affects unit cost', text: 'Fixed overhead spreads across more procedures at higher volume.' },{ title: 'Track by CPT code', text: 'Different procedures have different cost profiles.' }],
        [{ label: 'Direct labor', value: formatMoney(labor) },{ label: 'Supplies', value: formatMoney(supplies) },{ label: 'Equipment', value: formatMoney(equip) },{ label: 'Facility OH', value: formatMoney(facilityOH) },{ label: 'Admin OH', value: formatMoney(adminOH) },{ label: 'Total cost', value: formatMoney(totalCost) },{ label: 'Cost/proc', value: formatMoney(cpp) },{ label: 'Margin/proc', value: formatMoney(margin) }],
        null,
        [{ 'Direct labor': labor, Supplies: supplies, Equipment: equip, 'Total cost': totalCost, Procedures: procCount, 'Cost/proc': cpp.toFixed(2), 'Margin/proc': margin.toFixed(2) }],
        'Cost per procedure ' + formatMoney(cpp) + '. Margin ' + formatMoney(margin) + ' (' + formatPercentFromRatio(marginPct, 1) + ').'
      );
    },

    /* ── 137 Provider Productivity & RVU Calculator ──────────────── */
    'provider-productivity-rvu-calculator': function (values) {
      var totalRVUs = parseFloat(values.totalRVUs) || 0; var wRVUs = parseFloat(values.workRVUs) || 0; var coll = parseFloat(values.totalCollections) || 0; var visits = parseFloat(values.totalVisits) || 0; var provs = parseFloat(values.providerCount) || 1; var days = parseFloat(values.workingDays) || 1; var comp = parseFloat(values.providerCompensation) || 0;
      var wrvuPP = wRVUs / provs; var collPerWRVU = wRVUs > 0 ? coll / wRVUs : 0; var compPerWRVU = wRVUs > 0 ? comp / wRVUs : 0; var compToColl = coll > 0 ? comp / coll : 0; var rvuPerVisit = visits > 0 ? totalRVUs / visits : 0;
      return buildResult(
        [{ label: 'wRVUs per provider', value: formatNumber(Math.round(wrvuPP)), tone: 'positive', help: 'Work RVUs per provider.' },{ label: 'Collection per wRVU', value: formatMoney(collPerWRVU), tone: 'neutral', help: 'Collections / work RVUs.' },{ label: 'Comp per wRVU', value: formatMoney(compPerWRVU), tone: 'neutral', help: 'Provider comp / work RVUs.' },{ label: 'Comp-to-collection', value: formatPercentFromRatio(compToColl, 1), tone: compToColl <= 0.55 ? 'positive' : compToColl <= 0.65 ? 'neutral' : 'warning', help: 'Provider comp / collections. Target <= 55%.' }],
        [{ title: 'Total RVUs', value: formatNumber(Math.round(totalRVUs)), tone: 'neutral', text: 'Work + practice expense + malpractice.' },{ title: 'RVUs per visit', value: rvuPerVisit.toFixed(2), tone: 'neutral', text: 'Average intensity per visit.' },{ title: 'RVUs per day', value: (totalRVUs / days).toFixed(1), tone: 'neutral', text: 'Daily production rate.' },{ title: 'Visits per provider', value: (visits / provs).toFixed(0), tone: 'neutral', text: 'Average visits per provider.' }],
        [{ title: 'wRVUs are the standard measure', text: 'Work RVUs measure physician effort independent of payer mix.' },{ title: 'Comp-to-collection <= 55%', text: 'Above 60% leaves too little for overhead and profit.' },{ title: 'Benchmark by specialty', text: 'Compare against MGMA/AMGA specialty-specific data.' },{ title: 'Volume vs. intensity', text: 'High visits with low RVUs/visit may signal undercoding.' }],
        [{ label: 'Work RVUs', value: formatNumber(wRVUs) },{ label: 'Collections', value: formatMoney(coll) },{ label: 'Providers', value: formatNumber(provs) },{ label: 'wRVU/provider', value: formatNumber(Math.round(wrvuPP)) },{ label: 'Comp/wRVU', value: formatMoney(compPerWRVU) },{ label: 'Comp-to-coll', value: formatPercentFromRatio(compToColl, 1) }],
        null,
        [{ 'Work RVUs': wRVUs, Collections: coll, Providers: provs, 'wRVU/prov': wrvuPP.toFixed(0), 'Comp/wRVU': compPerWRVU.toFixed(2), 'Comp/coll %': (compToColl * 100).toFixed(1) }],
        wrvuPP.toFixed(0) + ' wRVUs/provider. Comp-to-collection ' + formatPercentFromRatio(compToColl, 1) + '.'
      );
    },

    /* ── 138 HIPAA Billing Compliance Checklist ──────────────────── */
    'hipaa-billing-compliance-checklist': function (values) {
      var fields = ['patientConsent','npiValidation','cptAccuracy','icdLinkage','modifierUse','authOnFile','tosVerification','coPayCollection','eobReview','denialTracking','complianceTraining','auditSchedule'];
      var labels = ['Patient consent on file','NPI validation current','CPT code accuracy reviewed','ICD-10 linkage verified','Modifier use appropriate','Prior authorization on file','Time-of-service verification','Co-pay collection documented','EOB review completed','Denial tracking active','Staff compliance training current','Internal audit schedule maintained'];
      var total = fields.length; var passed = 0; var tblRows = []; var exp = [];
      fields.forEach(function (f, i) { var v = values[f] === 'yes'; if (v) passed++; tblRows.push([labels[i], v ? 'Pass' : 'Fail']); exp.push({ Item: labels[i], Status: v ? 'Pass' : 'Fail' }); });
      var score = passed / total; var failed = total - passed; var risk = score >= 0.9 ? 'Low' : score >= 0.7 ? 'Medium' : 'High';
      return buildResult(
        [{ label: 'Compliance score', value: formatPercentFromRatio(score, 1), tone: score >= 0.9 ? 'positive' : score >= 0.7 ? 'neutral' : 'warning', help: 'Percentage of items passed.' },{ label: 'Items passed', value: passed + '/' + total, tone: passed === total ? 'positive' : 'neutral', help: 'Compliance items satisfied.' },{ label: 'Items failed', value: failed + '', tone: failed === 0 ? 'positive' : 'warning', help: 'Items requiring remediation.' },{ label: 'Risk level', value: risk, tone: risk === 'Low' ? 'positive' : risk === 'Medium' ? 'neutral' : 'warning', help: 'Overall compliance risk.' }],
        [{ title: 'Score', value: formatPercentFromRatio(score, 1), tone: score >= 0.9 ? 'positive' : 'warning', text: passed + ' of ' + total + ' passed.' },{ title: 'Risk', value: risk, tone: risk === 'Low' ? 'positive' : 'warning', text: risk + ' risk.' },{ title: 'Failed', value: failed + '', tone: failed > 0 ? 'warning' : 'positive', text: failed > 0 ? 'Remediate failed items.' : 'All passed.' },{ title: 'Target', value: '100%', tone: 'neutral', text: 'All items should pass.' }],
        [{ title: 'HIPAA compliance is non-negotiable', text: 'Violations can result in fines up to $50K per occurrence.' },{ title: 'Regular audits catch drift', text: 'Schedule quarterly internal audits.' },{ title: 'Training must be ongoing', text: 'Refresh training at least annually.' },{ title: 'Document everything', text: 'If it is not documented, it did not happen.' }],
        [{ label: 'Score', value: formatPercentFromRatio(score, 1) },{ label: 'Passed', value: passed + '' },{ label: 'Failed', value: failed + '' },{ label: 'Risk', value: risk }],
        { columns: ['Compliance item', 'Status'], rows: tblRows }, exp,
        'Compliance ' + formatPercentFromRatio(score, 1) + ' (' + passed + '/' + total + '). Risk: ' + risk + '.'
      );
    },

    /* ── 139 Medical Practice Entity Tax Comparison ──────────────── */
    'medical-practice-entity-tax-comparison': function (values) {
      var ni = parseFloat(values.netIncome) || 0;
      var salary = parseFloat(values.ownerSalary) || 0;
      var filingStatus = values.filingStatus === 'mfj' ? 'mfj' : 'single';
      var stateRate = (parseFloat(values.stateTaxRate) || 0) / 100;
      var qbiOk = values.qbiEligible !== 'no';
      var socialSecurityWageBase = 184500;
      var cCorpRate = 0.21;
      var additionalMedicareThreshold = filingStatus === 'mfj' ? 250000 : 200000;
      var qbiThreshold = filingStatus === 'mfj' ? 394600 : 197300;
      var qbiPhaseoutRange = filingStatus === 'mfj' ? 100000 : 50000;
      var brackets = filingStatus === 'mfj'
        ? [[23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24], [501050, 0.32], [751600, 0.35], [Infinity, 0.37]]
        : [[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24], [250525, 0.32], [626350, 0.35], [Infinity, 0.37]];
      function progressiveTax(taxableIncome) {
        var income = Math.max(taxableIncome, 0);
        var total = 0;
        var prevLimit = 0;
        for (var index = 0; index < brackets.length && income > prevLimit; index += 1) {
          var limit = brackets[index][0];
          var rate = brackets[index][1];
          var taxed = Math.min(income, limit) - prevLimit;
          if (taxed > 0) total += taxed * rate;
          prevLimit = limit;
        }
        return total;
      }
      function payrollTaxTotal(wages) {
        var taxableWages = Math.max(wages, 0);
        var ssTax = Math.min(taxableWages, socialSecurityWageBase) * 0.124;
        var medicareTax = taxableWages * 0.029;
        var addlMedicare = Math.max(taxableWages - additionalMedicareThreshold, 0) * 0.009;
        return ssTax + medicareTax + addlMedicare;
      }
      function selfEmploymentTax(netIncome) {
        var seIncome = Math.max(netIncome, 0) * 0.9235;
        var ssTax = Math.min(seIncome, socialSecurityWageBase) * 0.124;
        var medicareTax = seIncome * 0.029;
        var addlMedicare = Math.max(seIncome - additionalMedicareThreshold, 0) * 0.009;
        return ssTax + medicareTax + addlMedicare;
      }
      var seTax = selfEmploymentTax(ni);
      var soleTaxable = Math.max(ni - seTax / 2, 0);
      var soleIncomeTax = progressiveTax(soleTaxable);
      var soleStateTax = soleTaxable * stateRate;
      var soleTax = seTax + soleIncomeTax + soleStateTax;
      var sPassthrough = Math.max(ni - salary, 0);
      var qbiPhaseoutFactor = !qbiOk ? 0 : (ni <= qbiThreshold ? 1 : (ni >= qbiThreshold + qbiPhaseoutRange ? 0 : 1 - ((ni - qbiThreshold) / qbiPhaseoutRange)));
      var qbi = sPassthrough * 0.20 * qbiPhaseoutFactor;
      var sTaxable = Math.max(salary + sPassthrough - qbi, 0);
      var sPayroll = payrollTaxTotal(salary);
      var sIncomeTax = progressiveTax(sTaxable);
      var sStateTax = sTaxable * stateRate;
      var sTax = sPayroll + sIncomeTax + sStateTax;
      var corpTaxable = Math.max(ni - salary, 0);
      var cEntityTax = corpTaxable * (cCorpRate + stateRate);
      var cAfterTaxEarnings = Math.max(corpTaxable - cEntityTax, 0);
      var dividendTax = cAfterTaxEarnings * 0.238;
      var cPayroll = payrollTaxTotal(salary);
      var cSalaryTax = progressiveTax(salary) + salary * stateRate;
      var cTotal = cEntityTax + dividendTax + cPayroll + cSalaryTax;
      var best = 'Sole Prop';
      var bestTax = soleTax;
      if (sTax < bestTax) { best = 'S-Corp'; bestTax = sTax; }
      if (cTotal < bestTax) { best = 'C-Corp'; bestTax = cTotal; }
      var savings = soleTax - bestTax;
      return buildResult(
        [{ label: 'Recommended entity', value: best, tone: 'positive', help: 'Lowest estimated total tax.' },{ label: 'Est. savings', value: formatMoney(savings), tone: savings > 0 ? 'positive' : 'neutral', help: 'Savings vs. sole prop.' },{ label: 'Best total tax', value: formatMoney(bestTax), tone: 'neutral', help: 'Total tax for recommended entity.' },{ label: 'Net income', value: formatMoney(ni), tone: 'neutral', help: 'Practice net income.' }],
        [{ title: 'Sole Prop', value: formatMoney(soleTax), tone: best === 'Sole Prop' ? 'positive' : 'neutral', text: 'Progressive individual tax + SE tax on all net income.' },{ title: 'S-Corp', value: formatMoney(sTax), tone: best === 'S-Corp' ? 'positive' : 'neutral', text: 'Payroll on salary + individual tax on salary and passthrough income.' },{ title: 'C-Corp', value: formatMoney(cTotal), tone: best === 'C-Corp' ? 'positive' : 'neutral', text: 'Entity tax + dividend tax + salary payroll and wage tax.' },{ title: 'QBI deduction', value: formatMoney(qbi), tone: qbi > 0 ? 'positive' : 'neutral', text: 'Section 199A deduction after filing-status phaseout.' },{ title: 'State tax rate', value: formatPercentFromRatio(stateRate, 1), tone: 'neutral', text: filingStatus === 'mfj' ? 'Married filing jointly assumptions.' : 'Single filer assumptions.' }],
        [{ title: 'S-Corp saves on self-employment tax', text: 'Distributions above reasonable salary avoid self-employment tax, but salary must remain defensible.' },{ title: 'QBI benefit phases out for physicians', text: 'Specified service trades and businesses can lose the QBI deduction above the filing-status threshold range.' },{ title: 'C-Corp adds a second layer of tax', text: 'Retained earnings may face entity tax first and dividend tax when distributed.' },{ title: 'Use this as a planning draft', text: 'The model uses 2025 federal brackets and simplified state treatment. Confirm the final election with your CPA.' }],
        [{ label: 'Net income', value: formatMoney(ni) },{ label: 'Owner salary', value: formatMoney(salary) },{ label: 'State tax', value: formatPercentFromRatio(stateRate, 1) },{ label: 'Filing status', value: filingStatus === 'mfj' ? 'MFJ' : 'Single' },{ label: 'Sole Prop', value: formatMoney(soleTax) },{ label: 'S-Corp', value: formatMoney(sTax) },{ label: 'C-Corp', value: formatMoney(cTotal) },{ label: 'Best', value: best },{ label: 'Savings', value: formatMoney(savings) }],
        null,
        [{ 'Net income': ni, 'Salary': salary, 'State rate %': (stateRate * 100).toFixed(1), 'Filing status': filingStatus, 'Sole Prop': soleTax.toFixed(0), 'S-Corp': sTax.toFixed(0), 'C-Corp': cTotal.toFixed(0), 'QBI deduction': qbi.toFixed(0), Best: best, Savings: savings.toFixed(0) }],
        best + ' saves ' + formatMoney(savings) + ' vs. sole proprietorship.'
      );
    },

    /* ── 140 Practice Overhead Ratio Analyzer ────────────────────── */
    'practice-overhead-ratio-analyzer': function (values) {
      var rev = parseFloat(values.totalRevenue) || 0; var staff = parseFloat(values.staffPayroll) || 0; var rent = parseFloat(values.rent) || 0; var supplies = parseFloat(values.supplies) || 0; var billing = parseFloat(values.billingCosts) || 0; var ins = parseFloat(values.insurance) || 0; var tech = parseFloat(values.technology) || 0; var other = parseFloat(values.otherOverhead) || 0; var provComp = parseFloat(values.providerCompensation) || 0;
      var totalOH = staff + rent + supplies + billing + ins + tech + other; var ohRatio = rev > 0 ? totalOH / rev : 0; var provRatio = rev > 0 ? provComp / rev : 0; var ni = rev - totalOH - provComp; var netMargin = rev > 0 ? ni / rev : 0;
      return buildResult(
        [{ label: 'Overhead ratio', value: formatPercentFromRatio(ohRatio, 1), tone: ohRatio <= 0.55 ? 'positive' : ohRatio <= 0.65 ? 'neutral' : 'warning', help: 'Total overhead / revenue. Target <= 55%.' },{ label: 'Net margin', value: formatPercentFromRatio(netMargin, 1), tone: netMargin >= 0.2 ? 'positive' : netMargin >= 0.1 ? 'neutral' : 'warning', help: 'Net income / revenue.' },{ label: 'Provider comp ratio', value: formatPercentFromRatio(provRatio, 1), tone: 'neutral', help: 'Provider comp / revenue.' },{ label: 'Net income', value: formatMoney(ni), tone: ni > 0 ? 'positive' : 'warning', help: 'Revenue minus overhead minus provider comp.' }],
        [{ title: 'Staff payroll', value: formatMoney(staff) + ' (' + formatPercentFromRatio(rev > 0 ? staff / rev : 0, 1) + ')', tone: rev > 0 && staff / rev > 0.3 ? 'warning' : 'neutral', text: 'Target <= 25-30% of revenue.' },{ title: 'Rent', value: formatMoney(rent) + ' (' + formatPercentFromRatio(rev > 0 ? rent / rev : 0, 1) + ')', tone: 'neutral', text: 'Target <= 6-10%.' },{ title: 'Billing', value: formatMoney(billing) + ' (' + formatPercentFromRatio(rev > 0 ? billing / rev : 0, 1) + ')', tone: 'neutral', text: 'Target <= 4-8%.' },{ title: 'Total overhead', value: formatMoney(totalOH), tone: 'neutral', text: 'Sum of all non-provider costs.' }],
        [{ title: 'Benchmarks vary by specialty', text: 'Primary care: 55-65%. Surgical: 40-50%.' },{ title: 'Staff is the largest line', text: 'Usually 25-30% of revenue. Over 30% may signal overstaffing.' },{ title: 'Billing under 8%', text: 'Track in-house vs. outsourced billing costs.' },{ title: 'Occupancy costs are fixed', text: 'Focus on maximizing revenue per square foot.' }],
        [{ label: 'Revenue', value: formatMoney(rev) },{ label: 'Staff', value: formatMoney(staff) },{ label: 'Rent', value: formatMoney(rent) },{ label: 'Supplies', value: formatMoney(supplies) },{ label: 'Billing', value: formatMoney(billing) },{ label: 'Total OH', value: formatMoney(totalOH) },{ label: 'OH ratio', value: formatPercentFromRatio(ohRatio, 1) },{ label: 'Net margin', value: formatPercentFromRatio(netMargin, 1) }],
        null,
        [{ Revenue: rev, Staff: staff, Rent: rent, 'Total OH': totalOH, 'OH %': (ohRatio * 100).toFixed(1), 'Net %': (netMargin * 100).toFixed(1) }],
        'Overhead ' + formatPercentFromRatio(ohRatio, 1) + '. Net margin ' + formatPercentFromRatio(netMargin, 1) + '.'
      );
    },
  };

  function readDefinition() {
    const configEl = document.getElementById('fpa-tool-config');
    if (!configEl) {
      return null;
    }
    return JSON.parse(configEl.textContent);
  }

  function calculateTool(slug, values, rows) {
    const calculator = CALCULATORS[slug];
    if (!calculator) {
      throw new Error('Unsupported tool: ' + slug);
    }
    return calculator(values || {}, rows || []);
  }

  function collectValues(definition, fieldGrid) {
    const values = {};
    definition.fields.forEach(function (field) {
      const input = fieldGrid.querySelector('[data-field-key="' + field.key + '"]');
      if (!input) {
        values[field.key] = field.default != null ? field.default : ((field.type === 'text' || field.type === 'select' || field.type === 'date') ? '' : 0);
        return;
      }
      if (field.type === 'text' || field.type === 'select' || field.type === 'date') {
        values[field.key] = String(input.value || '').trim();
      } else {
        values[field.key] = parseNumber(input.value) == null ? (field.default != null ? field.default : 0) : parseNumber(input.value);
      }
    });
    return values;
  }

  function createInputField(field, value) {
    const safeValue = value == null ? '' : value;
    const wrapperClass = 'fpa-field' + (field.wide ? ' fpa-field-wide' : '');
    const help = field.help ? '<div class="fpa-help">' + escapeHtml(field.help) + '</div>' : '';
    if (field.type === 'select') {
      return '<div class="' + wrapperClass + '">'
        + '<label for="fpa-field-' + escapeHtml(field.key) + '">' + escapeHtml(field.label) + '</label>'
        + '<div class="fpa-input-wrap">'
        + '<select id="fpa-field-' + escapeHtml(field.key) + '" class="fpa-select-input" data-field-key="' + escapeHtml(field.key) + '">'
        + (field.options || []).map(function (option) {
          const selected = String(option.value) === String(safeValue) ? ' selected' : '';
          return '<option value="' + escapeHtml(option.value) + '"' + selected + '>' + escapeHtml(option.label) + '</option>';
        }).join('')
        + '</select>'
        + '</div>'
        + help
        + '</div>';
    }
    const inputType = field.type === 'text' ? 'text' : (field.type === 'date' ? 'date' : 'number');
    return '<div class="' + wrapperClass + '">'
      + '<label for="fpa-field-' + escapeHtml(field.key) + '">' + escapeHtml(field.label) + '</label>'
      + '<div class="fpa-input-wrap">'
      + (field.affix ? '<span class="fpa-input-affix">' + escapeHtml(field.affix) + '</span>' : '')
      + '<input id="fpa-field-' + escapeHtml(field.key) + '" class="fpa-text-input' + (field.affix ? ' has-affix' : '') + '" data-field-key="' + escapeHtml(field.key) + '" type="' + inputType + '"' + (field.type === 'text' || field.type === 'date' ? '' : ' step="' + escapeHtml(field.step || '0.01') + '"') + ' value="' + escapeHtml(safeValue) + '" placeholder="' + escapeHtml(field.placeholder || '') + '">'
      + '</div>'
      + help
      + '</div>';
  }

  function renderFields(definition, state, fieldGrid) {
    fieldGrid.innerHTML = definition.fields.map(function (field) {
      const defaultValue = state.values[field.key] != null ? state.values[field.key] : (field.default != null ? field.default : '');
      return createInputField(field, defaultValue);
    }).join('');
  }

  function renderTableRows(definition, state, tbody) {
    if (!tbody || !definition.table) {
      return;
    }
    tbody.innerHTML = state.rows.map(function (row, rowIndex) {
      const cells = definition.table.columns.map(function (column) {
        const value = row[column.key] == null ? '' : row[column.key];
        if (column.type === 'select') {
          return '<td><select data-row-index="' + rowIndex + '" data-column-key="' + escapeHtml(column.key) + '">' + (column.options || []).map(function (option) {
            const selected = String(option.value) === String(value) ? ' selected' : '';
            return '<option value="' + escapeHtml(option.value) + '"' + selected + '>' + escapeHtml(option.label) + '</option>';
          }).join('') + '</select></td>';
        }
        return '<td><input type="' + (column.type === 'text' ? 'text' : 'number') + '" step="' + (column.type === 'number' ? '1' : '0.01') + '" data-row-index="' + rowIndex + '" data-column-key="' + escapeHtml(column.key) + '" placeholder="' + escapeHtml(column.placeholder || '') + '" value="' + escapeHtml(value) + '"></td>';
      }).join('');
      return '<tr>' + cells + '<td><button type="button" class="fpa-row-remove" data-role="remove-row" data-row-index="' + rowIndex + '">&times;</button></td></tr>';
    }).join('');
  }

  function renderTableShell(definition, state, host) {
    if (!host) {
      return;
    }
    if (!definition.table) {
      host.innerHTML = '';
      return;
    }
    const tableDef = definition.table;
    host.innerHTML = '<div class="fpa-table-shell">'
      + '<div class="fpa-panel-title"><h3>' + escapeHtml(tableDef.title) + '</h3><span>' + escapeHtml(tableDef.badge || 'Rows') + '</span></div>'
      + '<p class="fpa-inline-note">' + escapeHtml(tableDef.description || '') + '</p>'
      + '<label class="fpa-dropzone"><input type="file" accept=".csv,.txt,.tsv" data-role="table-file-input"><strong>Upload a small CSV or TSV file</strong><span>' + escapeHtml(tableDef.importHelp || 'Upload a file or paste rows copied from Excel.') + '</span></label>'
      + '<div class="fpa-split"><span>or</span></div>'
      + '<div class="fpa-paste-wrap"><textarea data-role="table-paste" placeholder="Paste spreadsheet rows here."></textarea></div>'
      + '<div class="fpa-action-row"><button type="button" class="fpa-btn fpa-btn-secondary" data-role="table-paste-button">Use pasted rows</button><button type="button" class="fpa-btn fpa-btn-tertiary" data-role="table-add-row">Add row</button><button type="button" class="fpa-btn fpa-btn-tertiary" data-role="table-clear">Clear rows</button></div>'
      + '<div class="fpa-import-help">The importer accepts header rows when the column names are recognizable. You can still edit everything manually below.</div>'
      + '<div class="fpa-sheet-wrap"><table class="fpa-sheet"><thead><tr>'
      + tableDef.columns.map(function (column) { return '<th>' + escapeHtml(column.label) + '</th>'; }).join('')
      + '<th>Del</th></tr></thead><tbody data-role="table-rows"></tbody></table></div></div>';
    renderTableRows(definition, state, host.querySelector('[data-role="table-rows"]'));
  }

  function collectRows(definition, app) {
    if (!definition.table) {
      return [];
    }
    const inputs = app.querySelectorAll('[data-row-index]');
    const rowsByIndex = {};
    inputs.forEach(function (input) {
      const rowIndex = Number.parseInt(input.getAttribute('data-row-index'), 10);
      const key = input.getAttribute('data-column-key');
      rowsByIndex[rowIndex] = rowsByIndex[rowIndex] || {};
      rowsByIndex[rowIndex][key] = input.value;
    });
    return Object.keys(rowsByIndex).map(function (index) {
      return cleanRowObject(rowsByIndex[index], definition.table);
    }).filter(function (row) {
      return definition.table.columns.some(function (column) {
        const value = row[column.key];
        return column.type === 'text' ? Boolean(String(value || '').trim()) : Number.isFinite(value);
      });
    });
  }

  function updateStatus(statusEl, tone, text) {
    statusEl.className = 'fpa-status ' + tone;
    statusEl.textContent = text;
  }

  function renderSummary(host, cards) {
    host.innerHTML = cards.map(function (card) {
      return '<div class="fpa-summary-card fpa-tone-' + escapeHtml(card.tone || 'neutral') + '"><strong>' + escapeHtml(card.label) + '</strong><div class="fpa-summary-value">' + escapeHtml(card.value) + '</div><p>' + escapeHtml(card.help || '') + '</p></div>';
    }).join('');
  }

  function renderSignals(host, cards) {
    host.innerHTML = cards.map(function (card) {
      return '<div class="fpa-signal-card fpa-tone-' + escapeHtml(card.tone || 'neutral') + '"><strong>' + escapeHtml(card.title) + '</strong><div class="fpa-summary-value" style="font-size:1.35rem;line-height:1.1;margin-top:0.4rem;">' + escapeHtml(card.value) + '</div><p>' + escapeHtml(card.text || '') + '</p></div>';
    }).join('');
  }

  function renderInsights(host, cards) {
    host.innerHTML = cards.map(function (card) {
      return '<div class="fpa-insight-card"><strong>' + escapeHtml(card.title) + '</strong><p>' + escapeHtml(card.text || '') + '</p></div>';
    }).join('');
  }

  function renderDetails(host, cards) {
    host.innerHTML = cards.map(function (card) {
      const label = firstText(card.label, card.metric, card.Metric, card.title);
      const value = firstText(card.value, card.Value, card.text);
      return '<div class="fpa-detail-card"><strong>' + escapeHtml(label) + '</strong><p>' + escapeHtml(value) + '</p></div>';
    }).join('');
  }

  function renderResultsTable(host, table) {
    if (!table || !table.rows || !table.rows.length) {
      host.innerHTML = '';
      return;
    }
    const normalizedColumns = (table.columns || []).map(function (column, index) {
      if (typeof column === 'string') {
        return { key: column, label: column, align: '', type: '', index: index };
      }
      return {
        key: column.key != null ? column.key : (column.label != null ? column.label : String(index)),
        label: column.label != null ? column.label : (column.key != null ? column.key : ''),
        align: column.align || '',
        type: column.type || '',
        index: index
      };
    });
    const head = normalizedColumns.map(function (column) {
      return '<th class="' + (column.align === 'right' ? 'fpa-align-right' : '') + '">' + escapeHtml(column.label) + '</th>';
    }).join('');
    const body = table.rows.map(function (row) {
      return '<tr>' + normalizedColumns.map(function (column) {
        const rawValue = Array.isArray(row) ? row[column.index] : row[column.key];
        let value = rawValue;
        if (column.type === 'money') value = formatMoney(rawValue);
        else if (column.type === 'percent') value = formatPercent(rawValue, 1);
        else if (column.type === 'number') value = formatNumber(rawValue);
        return '<td class="' + (column.align === 'right' ? 'fpa-align-right' : '') + '">' + escapeHtml(value) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    host.innerHTML = '<div class="fpa-results-table-wrap"><table class="fpa-results-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function downloadCsv(filename, rows) {
    if (!rows || !rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(',')].concat(rows.map(function (row) {
      return headers.map(function (header) { return csvEscape(row[header]); }).join(',');
    })).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function resetState(definition, state) {
    state.values = {};
    definition.fields.forEach(function (field) {
      state.values[field.key] = field.default != null ? field.default : '';
    });
    state.rows = [];
    if (definition.table) {
      for (let index = 0; index < (definition.table.emptyRows || 4); index += 1) {
        state.rows.push(createEmptyRow(definition.table));
      }
    }
    state.lastResult = null;
  }

  function loadSample(definition, state) {
    state.values = clone(definition.sample || {});
    state.rows = definition.table ? clone(definition.table.sampleRows || []) : [];
  }

  function attachTableHandlers(definition, state, app, statusEl) {
    if (!definition.table) return;
    const tableShell = app.querySelector('[data-role="table-shell"]');
    const tbody = tableShell.querySelector('[data-role="table-rows"]');
    const pasteButton = tableShell.querySelector('[data-role="table-paste-button"]');
    const pasteArea = tableShell.querySelector('[data-role="table-paste"]');
    const addRowButton = tableShell.querySelector('[data-role="table-add-row"]');
    const clearRowsButton = tableShell.querySelector('[data-role="table-clear"]');
    const fileInput = tableShell.querySelector('[data-role="table-file-input"]');

    function rerenderRows() {
      renderTableRows(definition, state, tbody);
    }

    pasteButton.addEventListener('click', function () {
      const imported = parseImportedRows(pasteArea.value, definition.table);
      if (!imported.length) {
        updateStatus(statusEl, 'error', 'No usable rows were found in the pasted data.');
        return;
      }
      state.rows = imported;
      rerenderRows();
      updateStatus(statusEl, 'success', 'Imported ' + formatNumber(imported.length) + ' row(s) from pasted data.');
    });

    addRowButton.addEventListener('click', function () {
      state.rows.push(createEmptyRow(definition.table));
      rerenderRows();
    });

    clearRowsButton.addEventListener('click', function () {
      state.rows = [createEmptyRow(definition.table), createEmptyRow(definition.table), createEmptyRow(definition.table)];
      rerenderRows();
    });

    fileInput.addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (loadEvent) {
        const imported = parseImportedRows(loadEvent.target.result, definition.table);
        if (!imported.length) {
          updateStatus(statusEl, 'error', 'No usable rows were found in the uploaded file.');
          return;
        }
        state.rows = imported;
        rerenderRows();
        updateStatus(statusEl, 'success', 'Imported ' + formatNumber(imported.length) + ' row(s) from the uploaded file.');
      };
      reader.readAsText(file);
    });

    tbody.addEventListener('input', function (event) {
      const input = event.target;
      if (!input.matches('input[data-row-index]')) return;
      const rowIndex = Number.parseInt(input.getAttribute('data-row-index'), 10);
      const key = input.getAttribute('data-column-key');
      const column = definition.table.columns.find(function (item) { return item.key === key; });
      state.rows[rowIndex] = state.rows[rowIndex] || createEmptyRow(definition.table);
      state.rows[rowIndex][key] = column.type === 'text' ? input.value : parseNumber(input.value);
    });

    tbody.addEventListener('click', function (event) {
      const button = event.target.closest('[data-role="remove-row"]');
      if (!button) return;
      const rowIndex = Number.parseInt(button.getAttribute('data-row-index'), 10);
      state.rows.splice(rowIndex, 1);
      if (!state.rows.length) state.rows.push(createEmptyRow(definition.table));
      rerenderRows();
    });
  }

  function initTool() {
    const app = document.getElementById('fpa-tool-app');
    const definition = readDefinition();
    if (!app || !definition) return;

    const state = { values: {}, rows: [], lastResult: null };
    resetState(definition, state);

    const fieldGrid = app.querySelector('[data-role="form-fields"]');
    const tableShell = app.querySelector('[data-role="table-shell"]');
    const statusEl = app.querySelector('[data-role="status"]');
    const emptyEl = app.querySelector('[data-role="empty"]');
    const resultsEl = app.querySelector('[data-role="results"]');
    const summaryEl = app.querySelector('[data-role="summary"]');
    const signalsEl = app.querySelector('[data-role="signals"]');
    const insightsEl = app.querySelector('[data-role="insights"]');
    const detailsEl = app.querySelector('[data-role="details"]');
    const resultTableEl = app.querySelector('[data-role="result-table"]');
    const analyzeButton = app.querySelector('[data-role="analyze-button"]');
    const sampleButton = app.querySelector('[data-role="sample-button"]');
    const resetButton = app.querySelector('[data-role="reset-button"]');
    const exportButton = app.querySelector('[data-role="export-button"]');

    function rerenderInputs() {
      renderFields(definition, state, fieldGrid);
      renderTableShell(definition, state, tableShell);
      attachTableHandlers(definition, state, app, statusEl);
    }

    function runAnalysis() {
      try {
        state.values = collectValues(definition, fieldGrid);
        state.rows = definition.table ? collectRows(definition, app) : [];
        state.lastResult = calculateTool(definition.slug, state.values, state.rows);
        renderSummary(summaryEl, state.lastResult.summary);
        renderSignals(signalsEl, state.lastResult.signals);
        renderInsights(insightsEl, state.lastResult.insights);
        renderDetails(detailsEl, state.lastResult.details);
        renderResultsTable(resultTableEl, state.lastResult.table);
        emptyEl.hidden = true;
        resultsEl.hidden = false;
        exportButton.disabled = !(state.lastResult.exportRows && state.lastResult.exportRows.length);
        updateStatus(statusEl, 'success', state.lastResult.statusText || 'Analysis complete.');
      } catch (error) {
        resultsEl.hidden = true;
        emptyEl.hidden = false;
        exportButton.disabled = true;
        updateStatus(statusEl, 'error', error.message || 'The analysis could not be completed.');
      }
    }

    rerenderInputs();

    analyzeButton.addEventListener('click', runAnalysis);
    sampleButton.addEventListener('click', function () {
      loadSample(definition, state);
      rerenderInputs();
      runAnalysis();
    });
    resetButton.addEventListener('click', function () {
      resetState(definition, state);
      rerenderInputs();
      resultsEl.hidden = true;
      emptyEl.hidden = false;
      exportButton.disabled = true;
      updateStatus(statusEl, 'muted', 'Enter assumptions or load a sample scenario to see the results.');
    });
    exportButton.addEventListener('click', function () {
      if (!state.lastResult || !state.lastResult.exportRows || !state.lastResult.exportRows.length) return;
      downloadCsv(definition.slug + '-results.csv', state.lastResult.exportRows);
    });
  }

  const api = { calculateTool: calculateTool, parseImportedRows: parseImportedRows };
  if (typeof window !== 'undefined') window.LedgerSummitFPATools = api;
  if (typeof globalThis !== 'undefined') globalThis.LedgerSummitFPATools = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTool);
    else initTool();
  }
})();
