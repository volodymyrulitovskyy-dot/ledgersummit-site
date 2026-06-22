(function () {
  'use strict';

  function parseNumber(value) {
    if (value == null || value === '') {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    var raw = String(value).trim();
    if (!raw) {
      return null;
    }
    var negative = /^\(.*\)$/.test(raw);
    var cleaned = raw.replace(/[,$\s]/g, '').replace(/[()]/g, '').replace(/[^0-9.\-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') {
      return null;
    }
    var parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: Math.abs(value || 0) >= 1000 ? 0 : 2,
      maximumFractionDigits: Math.abs(value || 0) >= 1000 ? 0 : 2
    }).format(Number.isFinite(value) ? value : 0);
  }

  function number(value, digits) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0
    }).format(Number.isFinite(value) ? value : 0);
  }

  function percent(value, digits) {
    return Number.isFinite(value) ? value.toFixed(Number.isInteger(digits) ? digits : (Math.abs(value || 0) >= 10 ? 0 : 1)) + '%' : '0%';
  }

  function round(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function csvValue(value) {
    var text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function downloadCsv(name, rows) {
    if (!rows || !rows.length || typeof document === 'undefined') {
      return;
    }
    var headers = Object.keys(rows[0]);
    var lines = [headers.map(csvValue).join(',')].concat(rows.map(function (row) {
      return headers.map(function (key) { return csvValue(row[key]); }).join(',');
    }));
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function toneClass(tone) {
    return tone === 'positive' ? 'fpa-tone-positive' : tone === 'warning' ? 'fpa-tone-warning' : tone === 'critical' ? 'fpa-tone-critical' : 'fpa-tone-neutral';
  }

  function table(columns, rows) {
    return { columns: columns, rows: rows };
  }

  function build(summary, signals, insights, details, resultTable, exportRows, statusText) {
    return {
      summary: summary || [],
      signals: signals || [],
      insights: insights || [],
      details: details || [],
      table: resultTable || null,
      exportRows: exportRows || [],
      statusText: statusText || 'Analysis complete.'
    };
  }

  var CALCULATORS = {
    'petty-cash-reconciliation': function (values) {
      var authorizedFund = values.authorizedFund;
      var countedCash = values.countedCash;
      var vouchersTotal = values.vouchersTotal;
      var replenishmentsInTransit = values.replenishmentsInTransit || 0;
      var missingReceiptCount = values.missingReceiptCount || 0;
      var oldestVoucherDays = values.oldestVoucherDays || 0;
      var unusualSpend = values.unusualSpend || 0;
      if (!(authorizedFund > 0)) {
        throw new Error('Enter the authorized petty-cash fund.');
      }
      if (countedCash == null || vouchersTotal == null) {
        throw new Error('Enter counted cash on hand and voucher total.');
      }
      var expectedFund = countedCash + vouchersTotal + replenishmentsInTransit;
      var overShort = expectedFund - authorizedFund;
      var replenishmentNeeded = Math.max(0, vouchersTotal - replenishmentsInTransit);
      var coverage = authorizedFund ? (expectedFund / authorizedFund) * 100 : 0;
      var exportRows = [
        { Line: 'Authorized fund', Amount: round(authorizedFund), Note: 'Approved petty-cash float' },
        { Line: 'Counted cash', Amount: round(countedCash), Note: 'Physical cash on hand' },
        { Line: 'Receipts and vouchers', Amount: round(vouchersTotal), Note: 'Documented spend awaiting replenishment' },
        { Line: 'Replenishments in transit', Amount: round(replenishmentsInTransit), Note: 'Replenishments not yet reflected in the count' },
        { Line: 'Expected fund total', Amount: round(expectedFund), Note: 'Counted cash plus support plus in-transit replenishments' },
        { Line: 'Over or short', Amount: round(overShort), Note: 'Positive means over, negative means short' }
      ];
      return build(
        [
          { label: 'Expected fund total', value: money(expectedFund), tone: Math.abs(overShort) <= 1 ? 'positive' : 'warning', help: 'Counted cash plus vouchers plus replenishments in transit.' },
          { label: 'Over / short', value: money(overShort), tone: Math.abs(overShort) <= 1 ? 'positive' : 'critical', help: 'Difference between the expected fund total and the authorized petty-cash fund.' },
          { label: 'Replenishment needed', value: money(replenishmentNeeded), tone: replenishmentNeeded > 0 ? 'warning' : 'neutral', help: 'Amount still needed to replenish the current receipts and vouchers.' },
          { label: 'Fund coverage', value: percent(coverage, 1), tone: coverage >= 99 && coverage <= 101 ? 'positive' : 'warning', help: 'How closely the current support ties back to the authorized petty-cash fund.' }
        ],
        [
          { title: 'Missing support', value: number(missingReceiptCount), tone: missingReceiptCount > 0 ? 'critical' : 'positive', text: 'Unsigned or missing receipts are usually the first control issue reviewers challenge.' },
          { title: 'Oldest open voucher', value: number(oldestVoucherDays) + ' days', tone: oldestVoucherDays > 30 ? 'warning' : 'neutral', text: 'Stale vouchers suggest replenishment or follow-up is lagging.' },
          { title: 'Unusual spend flagged', value: money(unusualSpend), tone: unusualSpend > 0 ? 'warning' : 'neutral', text: 'Use this to isolate spend that may not fit normal petty-cash policy.' }
        ],
        [],
        [
          { label: 'Authorized fund', value: money(authorizedFund) },
          { label: 'Counted cash on hand', value: money(countedCash) },
          { label: 'Receipts and vouchers', value: money(vouchersTotal) },
          { label: 'Replenishments in transit', value: money(replenishmentsInTransit) },
          { label: 'Missing receipt count', value: number(missingReceiptCount) },
          { label: 'Oldest voucher age', value: number(oldestVoucherDays) + ' days' },
          { label: 'Unusual spend flagged', value: money(unusualSpend) },
          { label: 'Over / short', value: money(overShort) }
        ],
        table(
          [
            { key: 'line', label: 'Reconciliation line' },
            { key: 'amount', label: 'Amount', align: 'right' },
            { key: 'note', label: 'What it means' }
          ],
          exportRows.map(function (row) {
            return { line: row.Line, amount: money(row.Amount), note: row.Note };
          })
        ),
        exportRows,
        'Petty cash reconciliation complete.'
      );
    },
    'audit-sampling-calculator': function (values) {
      var populationSize = values.populationSize;
      var populationValue = values.populationValue;
      var tolerableDeviationRate = values.tolerableDeviationRate;
      var expectedDeviationRate = values.expectedDeviationRate || 0;
      var tolerableMisstatement = values.tolerableMisstatement;
      var expectedMisstatement = values.expectedMisstatement || 0;
      var confidenceLevel = String(values.confidenceLevel || '95');
      if (!(populationSize > 0) || !(populationValue > 0)) {
        throw new Error('Enter population size and population value.');
      }
      if (!(tolerableDeviationRate > 0) || !(tolerableMisstatement > 0)) {
        throw new Error('Enter tolerable deviation and tolerable misstatement.');
      }
      if (expectedDeviationRate >= tolerableDeviationRate) {
        throw new Error('Expected deviation should be below tolerable deviation.');
      }
      var zMap = { '90': 1.645, '95': 1.96, '99': 2.576 };
      var confidenceFactorMap = { '90': 1.0, '95': 1.25, '99': 1.6 };
      var z = zMap[confidenceLevel] || 1.96;
      var confidenceFactor = confidenceFactorMap[confidenceLevel] || 1.25;
      var p = Math.min(0.5, Math.max(expectedDeviationRate / 100, 0.05));
      var margin = Math.max((tolerableDeviationRate - expectedDeviationRate) / 100, 0.005);
      var n0 = (z * z * p * (1 - p)) / (margin * margin);
      var attributeSample = Math.ceil((populationSize * n0) / (populationSize + n0 - 1));
      var interval = Math.max(1, (tolerableMisstatement - expectedMisstatement) / confidenceFactor);
      var monetarySample = Math.ceil(populationValue / interval);
      var recommendedSample = Math.min(populationSize, Math.max(attributeSample, monetarySample));
      var coverage = (recommendedSample / populationSize) * 100;
      var expectedExceptions = recommendedSample * (expectedDeviationRate / 100);
      var projectedValuePerItem = populationSize ? populationValue / populationSize : 0;
      var impliedTestValue = recommendedSample * projectedValuePerItem;
      var exportRows = [
        { Measure: 'Population size', Value: round(populationSize), Note: 'Items in the population' },
        { Measure: 'Population value', Value: round(populationValue), Note: 'Book value of the population' },
        { Measure: 'Attribute sample size', Value: round(attributeSample), Note: 'Planning estimate based on deviation-rate inputs' },
        { Measure: 'Monetary sample size', Value: round(monetarySample), Note: 'Planning estimate based on tolerable and expected misstatement' },
        { Measure: 'Recommended sample size', Value: round(recommendedSample), Note: 'Higher of the attribute and monetary estimates' },
        { Measure: 'Sampling interval', Value: round(interval), Note: 'Approximate MUS interval based on current assumptions' }
      ];
      return build(
        [
          { label: 'Recommended sample size', value: number(recommendedSample), tone: 'positive', help: 'Planning estimate using the higher of the attribute and monetary sample calculations.' },
          { label: 'Sampling interval', value: money(interval), tone: 'neutral', help: 'Approximate monetary-unit interval implied by tolerable and expected misstatement.' },
          { label: 'Population coverage', value: percent(coverage, 1), tone: coverage > 20 ? 'warning' : 'neutral', help: 'Share of items this sample would cover if selected one-for-one from the population.' },
          { label: 'Expected exceptions in sample', value: number(expectedExceptions, 1), tone: expectedExceptions >= 1 ? 'warning' : 'neutral', help: 'Expected deviation rate applied to the recommended sample size.' }
        ],
        [
          { title: 'Confidence level', value: confidenceLevel + '%', tone: confidenceLevel === '99' ? 'warning' : 'neutral', text: 'Higher confidence pushes sample size up, especially when tolerances are tight.' },
          { title: 'Tolerable vs expected gap', value: percent(tolerableDeviationRate - expectedDeviationRate, 1), tone: (tolerableDeviationRate - expectedDeviationRate) <= 2 ? 'critical' : 'warning', text: 'A narrow gap between expected and tolerable deviation usually drives larger samples.' },
          { title: 'Implied value tested', value: money(impliedTestValue), tone: 'neutral', text: 'Population average item value multiplied by the recommended sample size.' }
        ],
        [],
        [
          { label: 'Population size', value: number(populationSize) },
          { label: 'Population value', value: money(populationValue) },
          { label: 'Tolerable deviation rate', value: percent(tolerableDeviationRate, 1) },
          { label: 'Expected deviation rate', value: percent(expectedDeviationRate, 1) },
          { label: 'Tolerable misstatement', value: money(tolerableMisstatement) },
          { label: 'Expected misstatement', value: money(expectedMisstatement) },
          { label: 'Confidence level', value: confidenceLevel + '%' },
          { label: 'Monetary sampling interval', value: money(interval) }
        ],
        table(
          [
            { key: 'measure', label: 'Planning measure' },
            { key: 'value', label: 'Value', align: 'right' },
            { key: 'note', label: 'What it means' }
          ],
          exportRows.map(function (row) {
            return {
              measure: row.Measure,
              value: typeof row.Value === 'number' && row.Measure.indexOf('value') >= 0 || row.Measure.indexOf('interval') >= 0 ? money(row.Value) : number(row.Value),
              note: row.Note
            };
          })
        ),
        exportRows,
        'Audit sampling estimate complete.'
      );
    }
  };

  function renderField(field, value) {
    var id = 'recon-calc-' + field.key;
    if (field.type === 'select') {
      return '<div class="fpa-field"><label for="' + escapeHtml(id) + '">' + escapeHtml(field.label) + '</label><select class="fpa-text-input" id="' + escapeHtml(id) + '" data-field-key="' + escapeHtml(field.key) + '">' + (field.options || []).map(function (option) {
        return '<option value="' + escapeHtml(option.value) + '"' + (String(option.value) === String(value) ? ' selected' : '') + '>' + escapeHtml(option.label) + '</option>';
      }).join('') + '</select>' + (field.help ? '<div class="fpa-help">' + escapeHtml(field.help) + '</div>' : '') + '</div>';
    }
    var step = field.step ? ' step="' + escapeHtml(field.step) + '"' : '';
    var min = field.min != null ? ' min="' + escapeHtml(field.min) + '"' : '';
    var placeholder = field.placeholder ? ' placeholder="' + escapeHtml(field.placeholder) + '"' : '';
    var affix = field.affix ? '<span class="fpa-input-affix">' + escapeHtml(field.affix) + '</span>' : '';
    var className = field.affix ? 'fpa-text-input has-affix' : 'fpa-text-input';
    var val = value == null ? '' : value;
    return '<div class="fpa-field"><label for="' + escapeHtml(id) + '">' + escapeHtml(field.label) + '</label><div class="fpa-input-wrap">' + affix + '<input class="' + className + '" type="number" id="' + escapeHtml(id) + '" data-field-key="' + escapeHtml(field.key) + '" value="' + escapeHtml(val) + '"' + step + min + placeholder + '></div>' + (field.help ? '<div class="fpa-help">' + escapeHtml(field.help) + '</div>' : '') + '</div>';
  }

  function renderFields(node, fields, defaults) {
    node.innerHTML = (fields || []).map(function (field) {
      return renderField(field, Object.prototype.hasOwnProperty.call(defaults || {}, field.key) ? defaults[field.key] : field.default);
    }).join('');
  }

  function collectValues(fields, node) {
    var output = {};
    (fields || []).forEach(function (field) {
      var input = node.querySelector('[data-field-key="' + field.key + '"]');
      if (!input) {
        output[field.key] = field.default;
        return;
      }
      if (field.type === 'select') {
        output[field.key] = input.value;
      } else {
        var parsed = parseNumber(input.value);
        output[field.key] = parsed == null ? (field.default != null ? field.default : null) : parsed;
      }
    });
    return output;
  }

  function applyValues(fields, node, values) {
    (fields || []).forEach(function (field) {
      var input = node.querySelector('[data-field-key="' + field.key + '"]');
      if (!input) {
        return;
      }
      var value = Object.prototype.hasOwnProperty.call(values || {}, field.key) ? values[field.key] : field.default;
      input.value = value == null ? '' : value;
    });
  }

  function renderSummary(node, cards) {
    if (!node) {
      return;
    }
    node.innerHTML = (cards || []).map(function (card) {
      return '<article class="fpa-summary-card ' + toneClass(card.tone) + '"><strong>' + escapeHtml(card.label) + '</strong><div class="fpa-summary-value">' + escapeHtml(card.value) + '</div><p>' + escapeHtml(card.help || '') + '</p></article>';
    }).join('');
  }

  function renderGrid(node, cards, className) {
    if (!node) {
      return;
    }
    var panel = node && node.closest ? node.closest('.fpa-result-card') : null;
    if (panel) {
      panel.hidden = !(cards && cards.length);
    }
    node.innerHTML = (cards || []).map(function (card) {
      return '<article class="' + className + ' ' + toneClass(card.tone) + '"><strong>' + escapeHtml(card.title || card.label || '') + '</strong>' + (card.value ? '<div class="fpa-summary-value">' + escapeHtml(card.value) + '</div>' : '') + '<p>' + escapeHtml(card.text || '') + '</p></article>';
    }).join('');
  }

  function renderDetails(node, cards) {
    if (!node) {
      return;
    }
    node.innerHTML = (cards || []).map(function (card) {
      return '<article class="fpa-detail-card"><strong>' + escapeHtml(card.label || card.metric || card.Metric || card.title || '') + '</strong><div class="fpa-summary-value">' + escapeHtml(card.value != null ? card.value : (card.Value != null ? card.Value : (card.text || ''))) + '</div></article>';
    }).join('');
  }

  function renderTable(node, resultTable) {
    if (!node) {
      return;
    }
    if (!resultTable || !resultTable.columns || !resultTable.rows || !resultTable.rows.length) {
      node.innerHTML = '';
      return;
    }
    var header = resultTable.columns.map(function (column) {
      return '<th' + (column.align === 'right' ? ' class="fpa-align-right"' : '') + '>' + escapeHtml(column.label) + '</th>';
    }).join('');
    var body = resultTable.rows.map(function (row) {
      return '<tr>' + resultTable.columns.map(function (column) {
        return '<td' + (column.align === 'right' ? ' class="fpa-align-right"' : '') + '>' + escapeHtml(row[column.key] == null ? '' : row[column.key]) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    node.innerHTML = '<div class="fpa-results-table-wrap"><table class="fpa-results-table"><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function setStatus(node, tone, message) {
    node.className = 'fpa-status ' + tone;
    node.textContent = message;
  }

  function init() {
    var configNode = document.getElementById('reconciliation-calculator-config');
    var app = document.getElementById('reconciliation-calculator-app');
    if (!configNode || !app) {
      return;
    }
    var config = JSON.parse(configNode.textContent || '{}');
    var calculator = CALCULATORS[config.slug];
    if (!calculator) {
      return;
    }
    var fieldNode = app.querySelector('[data-role="form-fields"]');
    var summaryNode = app.querySelector('[data-role="summary"]');
    var signalsNode = app.querySelector('[data-role="signals"]');
    var insightsNode = app.querySelector('[data-role="insights"]');
    var detailsNode = app.querySelector('[data-role="details"]');
    var tableNode = app.querySelector('[data-role="result-table"]');
    var emptyNode = app.querySelector('[data-role="empty"]');
    var resultsNode = app.querySelector('[data-role="results"]');
    var statusNode = app.querySelector('[data-role="status"]');
    var analyzeButton = app.querySelector('[data-role="analyze-button"]');
    var sampleButton = app.querySelector('[data-role="sample-button"]');
    var resetButton = app.querySelector('[data-role="reset-button"]');
    var exportButton = app.querySelector('[data-role="export-button"]');
    var latest = null;

    renderFields(fieldNode, config.fields || [], config.defaults || {});

    function clear(message) {
      latest = null;
      if (emptyNode) { emptyNode.hidden = false; }
      if (resultsNode) { resultsNode.hidden = true; }
      if (summaryNode) { summaryNode.innerHTML = ''; }
      if (signalsNode) { renderGrid(signalsNode, [], 'fpa-signal-card'); }
      if (insightsNode) { renderGrid(insightsNode, [], 'fpa-insight-card'); }
      if (detailsNode) { detailsNode.innerHTML = ''; }
      if (tableNode) { tableNode.innerHTML = ''; }
      if (exportButton) { exportButton.disabled = true; }
      if (statusNode) { setStatus(statusNode, 'muted', message || config.idleMessage || 'Enter assumptions or load the sample scenario to see the result.'); }
    }

    clear();

    analyzeButton.addEventListener('click', function () {
      try {
        latest = calculator(collectValues(config.fields || [], fieldNode));
        if (emptyNode) { emptyNode.hidden = true; }
        if (resultsNode) { resultsNode.hidden = false; }
        renderSummary(summaryNode, latest.summary || []);
        renderGrid(signalsNode, latest.signals || [], 'fpa-signal-card');
        renderGrid(insightsNode, latest.insights || [], 'fpa-insight-card');
        renderDetails(detailsNode, latest.details || []);
        renderTable(tableNode, latest.table || null);
        if (exportButton) { exportButton.disabled = !(latest.exportRows && latest.exportRows.length); }
        if (statusNode) { setStatus(statusNode, 'success', latest.statusText || 'Analysis complete.'); }
      } catch (error) {
        clear();
        if (statusNode) { setStatus(statusNode, 'error', error && error.message ? error.message : 'The tool could not finish the calculation.'); }
      }
    });

    sampleButton.addEventListener('click', function () {
      applyValues(config.fields || [], fieldNode, config.sample || {});
      clear(config.sampleMessage || 'Sample assumptions loaded. Run the analysis to see the result.');
    });

    resetButton.addEventListener('click', function () {
      applyValues(config.fields || [], fieldNode, config.defaults || {});
      clear(config.idleMessage || 'Enter assumptions or load the sample scenario to see the result.');
    });

    exportButton.addEventListener('click', function () {
      if (!latest || !latest.exportRows || !latest.exportRows.length) {
        return;
      }
      downloadCsv(config.slug + '-results.csv', latest.exportRows);
    });
  }

  if (typeof window !== 'undefined') {
    window.__ledgerReconCalculators = { calculators: CALCULATORS };
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calculators: CALCULATORS };
  }
}());
