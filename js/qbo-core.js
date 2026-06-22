(function () {
  'use strict';

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
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '');
  }

  function titleCase(value) {
    return String(value || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
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
    const cleaned = raw.replace(/[,$\s]/g, '').replace(/[()]/g, '').replace(/[^0-9.\-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') {
      return null;
    }
    const parsed = Number.parseFloat(cleaned);
    return Number.isNaN(parsed) ? null : (negative ? -parsed : parsed);
  }

  function parsePercent(value) {
    if (value == null) {
      return null;
    }
    const raw = String(value).trim();
    if (!raw) {
      return null;
    }
    const normalized = raw.endsWith('%') ? raw.slice(0, -1) : raw;
    return parseNumber(normalized);
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
    const yearPart = Number.parseInt(match[3], 10);
    const year = yearPart < 100 ? 2000 + yearPart : yearPart;
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function csvEscape(value) {
    const text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: Math.abs(value || 0) >= 1000 ? 0 : 2,
      maximumFractionDigits: Math.abs(value || 0) >= 1000 ? 0 : 2
    }).format(value || 0);
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? value.toFixed(Math.abs(value) >= 10 ? 0 : 1) + '%' : '0%';
  }

  function formatDateValue(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return 'No date';
    }
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  function toIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function median(values) {
    if (!values.length) {
      return 0;
    }
    const sorted = values.slice().sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  }

  function sum(values) {
    return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
  }
  function detectDelimiter(text) {
    const candidates = [',', '\t', ';', '|'];
    const lines = String(text || '').split(/\r\n|\n|\r/).filter((line) => line.trim()).slice(0, 8);
    const scored = candidates.map((delimiter) => {
      const counts = lines.map((line) => splitLine(line, delimiter).length);
      const average = counts.reduce((total, count) => total + count, 0) / Math.max(counts.length, 1);
      const consistent = counts.filter((count) => count === counts[0]).length;
      return { delimiter, score: average + consistent * 0.25 };
    });
    scored.sort((left, right) => right.score - left.score);
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
        rows.push(row);
      }
    }

    if (!rows.length) {
      throw new Error('No rows were found in the uploaded file.');
    }

    const headers = rows.shift().map((header, index) => String(header || 'Column ' + (index + 1)).trim() || 'Column ' + (index + 1));
    const objects = rows.map((cells, rowIndex) => {
      const entry = { __rowNumber: rowIndex + 2 };
      headers.forEach((header, columnIndex) => {
        entry[header] = cells[columnIndex] == null ? '' : String(cells[columnIndex]).trim();
      });
      return entry;
    });

    return { headers, rows: objects, delimiter };
  }

  function getColumnSamples(rows, header, limit) {
    return rows.map((row) => String(row[header] || '').trim()).filter(Boolean).slice(0, limit || 24);
  }

  function buildColumnProfile(samples) {
    const values = samples.filter(Boolean);
    const total = values.length || 1;
    const numericValues = values.map(parseNumber).filter((value) => value != null && !Number.isNaN(value));
    const dateValues = values.map(parseDate).filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));
    const normalized = values.map(normalizeText).filter(Boolean);
    const uniqueRatio = values.length ? new Set(normalized).size / values.length : 0;
    const averageLength = values.length ? values.reduce((totalLength, value) => totalLength + value.length, 0) / values.length : 0;
    const positiveRatio = numericValues.length ? numericValues.filter((value) => value > 0).length / numericValues.length : 0;
    const negativeRatio = numericValues.length ? numericValues.filter((value) => value < 0).length / numericValues.length : 0;
    const zeroRatio = numericValues.length ? numericValues.filter((value) => Math.abs(value) < 0.0001).length / numericValues.length : 0;
    const booleanSet = new Set(['yes', 'no', 'true', 'false', 'active', 'inactive', 'y', 'n', 'paid', 'open', 'closed']);

    return {
      count: values.length,
      numericRatio: numericValues.length / total,
      dateRatio: dateValues.length / total,
      uniqueRatio,
      averageLength,
      positiveRatio,
      negativeRatio,
      zeroRatio,
      codeRatio: values.filter((value) => /^\d{2,8}$/.test(String(value).trim()) || /^[A-Za-z]{1,5}[-_]?[0-9]{2,}$/.test(String(value).trim())).length / total,
      idRatio: values.filter((value) => /^[A-Za-z0-9_-]{4,24}$/.test(String(value).trim())).length / total,
      nameRatio: normalized.filter((value) => value.length >= 5 && value.includes(' ') && !/\b(current|paid|open|inactive|class|dept)\b/.test(value)).length / total,
      memoRatio: normalized.filter((value) => value.length >= 10 && value.includes(' ')).length / total,
      statusRatio: normalized.filter((value) => booleanSet.has(value)).length / total,
      percentRatio: values.filter((value) => /%/.test(String(value)) || (() => { const parsed = parsePercent(value); return parsed != null && parsed >= 0 && parsed <= 100; })()).length / total,
      shortCategoryRatio: normalized.filter((value) => value.length >= 2 && value.length <= 18 && value.split(' ').length <= 3).length / total,
      termsRatio: normalized.filter((value) => /\bnet\s?\d+|due on receipt|cod|eom\b/.test(value)).length / total,
      repeatRatio: 1 - uniqueRatio
    };
  }

  function getHeaderHintScore(fieldKey, column, columnHints) {
    const hints = columnHints[fieldKey] || [];
    let bestScore = 0;
    hints.forEach((hint) => {
      if (column.slug === hint) {
        bestScore = Math.max(bestScore, 120);
      } else if (column.slug.startsWith(hint) || column.slug.endsWith(hint)) {
        bestScore = Math.max(bestScore, 92);
      } else if (column.slug.includes(hint)) {
        bestScore = Math.max(bestScore, 76);
      } else if (column.text.includes(hint)) {
        bestScore = Math.max(bestScore, 58);
      }
    });
    return bestScore;
  }
  function scoreColumnForField(fieldDefinition, column, columnHints) {
    const profile = column.profile;
    let score = getHeaderHintScore(fieldDefinition.key, column, columnHints);
    const kind = fieldDefinition.kind || 'text';

    switch (kind) {
      case 'date':
      case 'dueDate':
        if (profile.dateRatio >= 0.7) { score += 54; } else if (profile.dateRatio >= 0.35) { score += 28; }
        if (kind === 'dueDate' && column.text.includes('due')) { score += 34; }
        break;
      case 'id':
        if (profile.idRatio >= 0.45) { score += 26; }
        if (profile.repeatRatio >= 0.2) { score += 16; }
        break;
      case 'account':
      case 'code':
        if (profile.codeRatio >= 0.6) { score += 54; } else if (profile.codeRatio >= 0.3) { score += 28; }
        if (profile.nameRatio >= 0.45) { score -= 22; }
        break;
      case 'accountName':
      case 'name':
      case 'customer':
      case 'vendor':
      case 'agency':
        if (profile.nameRatio >= 0.55) { score += 48; } else if (profile.nameRatio >= 0.3) { score += 24; }
        break;
      case 'memo':
      case 'description':
        if (profile.memoRatio >= 0.55) { score += 46; } else if (profile.memoRatio >= 0.3) { score += 22; }
        if (profile.averageLength >= 14) { score += 8; }
        break;
      case 'amount':
      case 'balance':
        if (profile.numericRatio >= 0.8) { score += 30; }
        if (profile.positiveRatio >= 0.1 && profile.negativeRatio >= 0.1) { score += 24; }
        break;
      case 'debit':
      case 'credit':
        if (profile.numericRatio >= 0.8) { score += 22; }
        if (profile.zeroRatio >= 0.2) { score += 12; }
        break;
      case 'status':
      case 'boolean':
        if (profile.statusRatio >= 0.45) { score += 38; } else if (profile.shortCategoryRatio >= 0.6 && profile.uniqueRatio <= 0.4) { score += 14; }
        break;
      case 'type':
      case 'class':
      case 'department':
      case 'location':
      case 'terms':
        if (profile.shortCategoryRatio >= 0.55) { score += 30; }
        if (kind === 'terms' && profile.termsRatio >= 0.25) { score += 34; }
        break;
      case 'percent':
        if (profile.percentRatio >= 0.5) { score += 56; } else if (profile.numericRatio >= 0.7) { score += 18; }
        break;
      default:
        if (profile.uniqueRatio <= 0.5 && profile.shortCategoryRatio >= 0.4) { score += 10; }
        break;
    }

    return score;
  }

  function guessMapping(headers, rows, fieldDefinitions, columnHints) {
    const columns = headers.map((header) => ({
      original: header,
      slug: slugifyHeader(header),
      text: normalizeText(header),
      profile: buildColumnProfile(getColumnSamples(rows || [], header))
    }));
    const mapping = {};
    const usedHeaders = new Set();
    const candidates = [];

    fieldDefinitions.forEach((fieldDefinition) => {
      columns.forEach((column) => {
        const score = scoreColumnForField(fieldDefinition, column, columnHints || {});
        if (score > 0) {
          candidates.push({ field: fieldDefinition.key, header: column.original, score });
        }
      });
    });

    candidates.sort((left, right) => right.score - left.score || left.field.localeCompare(right.field)).forEach((candidate) => {
      if (candidate.score < 42) {
        return;
      }
      if (!mapping[candidate.field] && !usedHeaders.has(candidate.header)) {
        mapping[candidate.field] = candidate.header;
        usedHeaders.add(candidate.header);
      }
    });

    fieldDefinitions.forEach((fieldDefinition) => {
      mapping[fieldDefinition.key] = mapping[fieldDefinition.key] || '';
    });

    return mapping;
  }

  function buildMappingMarkup(headers, fieldDefinitions, mapping) {
    return fieldDefinitions.map((fieldDefinition) => {
      const options = ['<option value="">Not mapped</option>']
        .concat(headers.map((header) => '<option value="' + escapeHtml(header) + '"' + (mapping[fieldDefinition.key] === header ? ' selected' : '') + '>' + escapeHtml(header) + '</option>'))
        .join('');

      return [
        '<div class="qbo-field">',
        '<label for="field-' + escapeHtml(fieldDefinition.key) + '">' + escapeHtml(fieldDefinition.label) + '</label>',
        '<select class="qbo-select" id="field-' + escapeHtml(fieldDefinition.key) + '" data-field="' + escapeHtml(fieldDefinition.key) + '">',
        options,
        '</select>',
        '<div class="qbo-help">' + escapeHtml(fieldDefinition.help || '') + '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function toCsv(rows, columns) {
    const selectedColumns = columns && columns.length ? columns : Object.keys(rows[0] || {});
    return [selectedColumns.join(',')].concat(rows.map((row) => selectedColumns.map((column) => csvEscape(row[column])).join(','))).join('\n');
  }

  function downloadCsv(fileName, rows, columns) {
    if (!rows || !rows.length || typeof document === 'undefined') {
      return;
    }
    const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function renderFlags(flags) {
    if (!flags || !flags.length) {
      return '<span class="qbo-flag is-good">Clear</span>';
    }
    return '<div class="qbo-flag-list">' + flags.map((flag) => '<span class="qbo-flag' + (flag.tone ? ' is-' + escapeHtml(flag.tone) : '') + '">' + escapeHtml(flag.label || flag) + '</span>').join('') + '</div>';
  }

  function renderTable(target, columns, rows, emptyMessage) {
    if (!target) {
      return;
    }
    if (!rows || !rows.length) {
      target.innerHTML = '<div class="qbo-inline-note">' + escapeHtml(emptyMessage || 'No rows to show.') + '</div>';
      return;
    }
    const thead = columns.map((column) => '<th>' + escapeHtml(column.label) + '</th>').join('');
    const tbody = rows.map((row) => '<tr>' + columns.map((column) => '<td>' + (column.render ? column.render(row, QBOCore) : escapeHtml(row[column.key])) + '</td>').join('') + '</tr>').join('');
    target.innerHTML = '<div class="qbo-table-wrap"><table class="qbo-table"><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table></div>';
  }

  function renderSummaryCards(target, items) {
    if (!target) {
      return;
    }
    target.innerHTML = (items || []).map((item) => '<div class="qbo-summary-card"><span>' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(item.value) + '</strong><p>' + escapeHtml(item.detail || '') + '</p></div>').join('');
  }

  function renderSignalCards(target, items) {
    if (!target) {
      return;
    }
    target.innerHTML = (items || []).map((item) => '<div class="qbo-signal-card"><span>' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(item.value) + '</strong><p>' + escapeHtml(item.detail || '') + '</p></div>').join('');
  }

  function renderInsightCards(target, items) {
    if (!target) {
      return;
    }
    target.innerHTML = (items || []).map((item) => '<div class="qbo-insight-card"><strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.description || '') + '</p>' + (item.items && item.items.length ? '<ul class="qbo-inline-note">' + item.items.map((entry) => '<li>' + escapeHtml(entry) + '</li>').join('') + '</ul>' : '') + '</div>').join('');
  }

  function collectMapping(root) {
    const mapping = {};
    root.querySelectorAll('[data-field]').forEach((element) => {
      mapping[element.getAttribute('data-field')] = element.value;
    });
    return mapping;
  }

  function filterRowsBySearch(rows, search) {
    const term = normalizeText(search);
    if (!term) {
      return rows || [];
    }
    return (rows || []).filter((row) => Object.values(row).some((value) => normalizeText(value).includes(term)));
  }

  function setText(target, value) {
    if (target) {
      target.textContent = value;
    }
  }

  function setStatus(statusElement, message, tone) {
    if (!statusElement) {
      return;
    }
    statusElement.className = 'qbo-status ' + (tone || 'muted');
    statusElement.textContent = message;
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.readAsText(file);
    });
  }
  function initResults(root, labels) {
    setText(root.querySelector('[data-role="signals-title"]'), labels.signalsTitle || 'Priority signals');
    setText(root.querySelector('[data-role="signals-description"]'), labels.signalsDescription || 'The biggest issues in the current file.');
    setText(root.querySelector('[data-role="insights-title"]'), labels.insightsTitle || 'Review insights');
    setText(root.querySelector('[data-role="insights-description"]'), labels.insightsDescription || 'Useful patterns that explain where cleanup or follow-up is likely to happen.');
    setText(root.querySelector('[data-role="findings-title"]'), labels.findingsTitle || 'Priority queue');
    setText(root.querySelector('[data-role="findings-description"]'), labels.findingsDescription || 'Highest-value items first.');
    setText(root.querySelector('[data-role="explorer-title"]'), labels.explorerTitle || 'Detailed explorer');
    setText(root.querySelector('[data-role="explorer-description"]'), labels.explorerDescription || 'Search the reviewed rows directly in the browser.');
  }

  function renderAnalysis(root, state, analysis) {
    const empty = root.querySelector('[data-role="empty"]');
    const results = root.querySelector('[data-role="results"]');
    if (empty) { empty.hidden = true; }
    if (results) { results.hidden = false; }
    renderSummaryCards(root.querySelector('[data-role="summary"]'), analysis.summary || []);
    renderSignalCards(root.querySelector('[data-role="signals"]'), analysis.signalCards || []);
    renderInsightCards(root.querySelector('[data-role="insights"]'), analysis.insightCards || []);
    renderTable(root.querySelector('[data-role="findings-table"]'), analysis.findingsColumns || [], analysis.findingsRows || [], analysis.findingsEmpty || 'No priority rows found.');
    const searchInput = root.querySelector('[data-role="explorer-search"]');
    const explorerRows = filterRowsBySearch(analysis.explorerRows || [], searchInput ? searchInput.value : '');
    renderTable(root.querySelector('[data-role="explorer-table"]'), analysis.explorerColumns || [], explorerRows, analysis.explorerEmpty || 'No rows matched the current search.');
    state.analysis = analysis;
    const exportButton = root.querySelector('[data-role="export-button"]');
    if (exportButton) { exportButton.disabled = !analysis.exportRows || !analysis.exportRows.length; }
    initResults(root, analysis);
  }

  function createSingleFileTool(config) {
    const state = { parsed: null, mapping: {}, normalized: [], analysis: null };
    const root = typeof document !== 'undefined' ? document.getElementById(config.rootId) : null;
    if (!root) { return; }

    const fileInput = root.querySelector('[data-role="file-input"]');
    const pasteInput = root.querySelector('[data-role="paste-input"]');
    const pasteButton = root.querySelector('[data-role="paste-button"]');
    const sampleButton = root.querySelector('[data-role="sample-button"]');
    const resetButton = root.querySelector('[data-role="reset-button"]');
    const analyzeButton = root.querySelector('[data-role="analyze-button"]');
    const exportButton = root.querySelector('[data-role="export-button"]');
    const statusElement = root.querySelector('[data-role="status"]');
    const metaElement = root.querySelector('[data-role="meta"]');
    const mappingGrid = root.querySelector('[data-role="mapping-grid"]');
    const emptyElement = root.querySelector('[data-role="empty"]');
    const searchInput = root.querySelector('[data-role="explorer-search"]');

    initResults(root, config.results || {});
    setStatus(statusElement, config.introStatus || 'Load a file or try the sample to start.', 'muted');

    function reset() {
      state.parsed = null;
      state.mapping = {};
      state.normalized = [];
      state.analysis = null;
      if (fileInput) { fileInput.value = ''; }
      if (pasteInput) { pasteInput.value = ''; }
      if (mappingGrid) { mappingGrid.innerHTML = ''; }
      if (metaElement) { metaElement.innerHTML = ''; }
      if (emptyElement) { emptyElement.hidden = false; }
      const results = root.querySelector('[data-role="results"]');
      if (results) { results.hidden = true; }
      if (exportButton) { exportButton.disabled = true; }
      setStatus(statusElement, config.introStatus || 'Load a file or try the sample to start.', 'muted');
    }

    function handleParsedData(parsed, autoAnalyze) {
      state.parsed = parsed;
      state.mapping = guessMapping(parsed.headers, parsed.rows, config.fieldDefinitions, config.columnHints);
      if (mappingGrid) { mappingGrid.innerHTML = buildMappingMarkup(parsed.headers, config.fieldDefinitions, state.mapping); }
      if (metaElement) {
        const autoMapped = Object.values(state.mapping).filter(Boolean).length;
        metaElement.innerHTML = [
          '<span class="qbo-meta-chip"><strong>' + escapeHtml(formatNumber(parsed.rows.length)) + '</strong> rows loaded</span>',
          '<span class="qbo-meta-chip"><strong>' + escapeHtml(formatNumber(parsed.headers.length)) + '</strong> columns detected</span>',
          '<span class="qbo-meta-chip"><strong>' + escapeHtml(formatNumber(autoMapped)) + '</strong> fields auto-mapped</span>',
          '<span class="qbo-meta-chip"><strong>' + escapeHtml(parsed.delimiter === '\t' ? 'Tab-delimited' : parsed.delimiter) + '</strong> delimiter</span>'
        ].join('');
      }
      setStatus(statusElement, 'Loaded ' + parsed.rows.length + ' rows and ' + parsed.headers.length + ' columns. Smart mapping prefilled ' + Object.values(state.mapping).filter(Boolean).length + ' fields. Review the mapping and click ' + (config.analyzeButtonLabel || 'Analyze') + '.', 'success');
      if (autoAnalyze) { runAnalysis(); }
    }

    function loadText(text, autoAnalyze) {
      try {
        const delimiter = detectDelimiter(text);
        const parsed = parseDelimited(text, delimiter);
        handleParsedData(parsed, autoAnalyze);
      } catch (error) {
        setStatus(statusElement, error.message || 'The file could not be parsed.', 'error');
      }
    }

    function normalizeRows() {
      const mapping = collectMapping(root);
      state.mapping = mapping;
      if (config.validateMapping) {
        const validationError = config.validateMapping(mapping);
        if (validationError) { throw new Error(validationError); }
      }
      const normalized = state.parsed.rows.map((row) => config.mapRow(row, mapping, QBOCore)).filter(Boolean);
      if (!normalized.length) { throw new Error('No usable rows remained after mapping. Check the selected columns and try again.'); }
      state.normalized = normalized;
      return normalized;
    }

    function runAnalysis() {
      if (!state.parsed) {
        setStatus(statusElement, 'Load a file first, then review the mapping.', 'error');
        return;
      }
      try {
        const normalized = normalizeRows();
        const analysis = config.analyze(normalized, QBOCore, state.mapping, state.parsed);
        renderAnalysis(root, state, analysis);
        setStatus(statusElement, analysis.statusMessage || 'Analysis completed. Review the priority queue below.', 'success');
      } catch (error) {
        setStatus(statusElement, error.message || 'The analysis could not be completed.', 'error');
      }
    }
    if (fileInput) {
      fileInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) { return; }
        try {
          const text = await readFile(file);
          loadText(text, false);
        } catch (error) {
          setStatus(statusElement, error.message || 'The selected file could not be read.', 'error');
        }
      });
    }
    if (pasteButton) { pasteButton.addEventListener('click', () => loadText(pasteInput ? pasteInput.value : '', false)); }
    if (sampleButton) {
      sampleButton.addEventListener('click', () => {
        if (pasteInput) { pasteInput.value = config.sampleCsv; }
        loadText(config.sampleCsv, true);
      });
    }
    if (resetButton) { resetButton.addEventListener('click', reset); }
    if (analyzeButton) { analyzeButton.addEventListener('click', runAnalysis); }
    if (exportButton) {
      exportButton.addEventListener('click', () => {
        if (state.analysis && state.analysis.exportRows && state.analysis.exportRows.length) {
          downloadCsv(state.analysis.exportFileName || config.exportFileName || 'qbo-tool-export.csv', state.analysis.exportRows, state.analysis.exportColumns);
        }
      });
      exportButton.disabled = true;
    }
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (!state.analysis) { return; }
        const explorerRows = filterRowsBySearch(state.analysis.explorerRows || [], searchInput.value);
        renderTable(root.querySelector('[data-role="explorer-table"]'), state.analysis.explorerColumns || [], explorerRows, state.analysis.explorerEmpty || 'No rows matched the current search.');
      });
    }
  }

  function createDualFileTool(config) {
    const state = { datasets: {} };
    const root = typeof document !== 'undefined' ? document.getElementById(config.rootId) : null;
    if (!root) { return; }
    const exportButton = root.querySelector('[data-role="export-button"]');
    const analyzeButton = root.querySelector('[data-role="analyze-button"]');
    const results = root.querySelector('[data-role="results"]');
    const empty = root.querySelector('[data-role="empty"]');
    const searchInput = root.querySelector('[data-role="explorer-search"]');
    initResults(root, config.results || {});

    config.datasets.forEach((datasetConfig) => {
      const shell = root.querySelector('[data-dataset="' + datasetConfig.key + '"]');
      state.datasets[datasetConfig.key] = { config: datasetConfig, shell, parsed: null, mapping: {} };
      setStatus(shell.querySelector('[data-role="status"]'), datasetConfig.introStatus || 'Load a file or try the sample to start.', 'muted');
    });

    function resetAll() {
      Object.values(state.datasets).forEach((datasetState) => {
        const shell = datasetState.shell;
        datasetState.parsed = null;
        datasetState.mapping = {};
        const fileInput = shell.querySelector('[data-role="file-input"]');
        const pasteInput = shell.querySelector('[data-role="paste-input"]');
        if (fileInput) { fileInput.value = ''; }
        if (pasteInput) { pasteInput.value = ''; }
        shell.querySelector('[data-role="mapping-grid"]').innerHTML = '';
        shell.querySelector('[data-role="meta"]').innerHTML = '';
        setStatus(shell.querySelector('[data-role="status"]'), datasetState.config.introStatus || 'Load a file or try the sample to start.', 'muted');
      });
      if (results) { results.hidden = true; }
      if (empty) { empty.hidden = false; }
      if (exportButton) { exportButton.disabled = true; }
      delete state.analysis;
    }

    function loadText(datasetState, text) {
      try {
        const delimiter = detectDelimiter(text);
        const parsed = parseDelimited(text, delimiter);
        datasetState.parsed = parsed;
        datasetState.mapping = guessMapping(parsed.headers, parsed.rows, datasetState.config.fieldDefinitions, datasetState.config.columnHints);
        const autoMapped = Object.values(datasetState.mapping).filter(Boolean).length;
        datasetState.shell.querySelector('[data-role="mapping-grid"]').innerHTML = buildMappingMarkup(parsed.headers, datasetState.config.fieldDefinitions, datasetState.mapping);
        datasetState.shell.querySelector('[data-role="meta"]').innerHTML = [
          '<span class="qbo-meta-chip"><strong>' + escapeHtml(formatNumber(parsed.rows.length)) + '</strong> rows loaded</span>',
          '<span class="qbo-meta-chip"><strong>' + escapeHtml(formatNumber(parsed.headers.length)) + '</strong> columns detected</span>',
          '<span class="qbo-meta-chip"><strong>' + escapeHtml(formatNumber(autoMapped)) + '</strong> fields auto-mapped</span>'
        ].join('');
        setStatus(datasetState.shell.querySelector('[data-role="status"]'), 'Loaded ' + parsed.rows.length + ' rows. Smart mapping prefilled ' + autoMapped + ' fields.', 'success');
      } catch (error) {
        setStatus(datasetState.shell.querySelector('[data-role="status"]'), error.message || 'The file could not be parsed.', 'error');
      }
    }

    function getNormalizedDataset(datasetState) {
      const mapping = collectMapping(datasetState.shell);
      datasetState.mapping = mapping;
      if (datasetState.config.validateMapping) {
        const errorMessage = datasetState.config.validateMapping(mapping);
        if (errorMessage) { throw new Error(errorMessage); }
      }
      const normalized = datasetState.parsed.rows.map((row) => datasetState.config.mapRow(row, mapping, QBOCore)).filter(Boolean);
      if (!normalized.length) { throw new Error('No usable rows remained for ' + datasetState.config.title + '. Check the selected columns and try again.'); }
      return normalized;
    }

    function runAnalysis() {
      try {
        const normalizedDatasets = {};
        config.datasets.forEach((datasetConfig) => {
          const datasetState = state.datasets[datasetConfig.key];
          if (!datasetState.parsed) { throw new Error('Load the ' + datasetConfig.title.toLowerCase() + ' before running the tool.'); }
          normalizedDatasets[datasetConfig.key] = getNormalizedDataset(datasetState);
        });
        const analysis = config.analyze(normalizedDatasets, QBOCore, state.datasets);
        renderAnalysis(root, state, analysis);
        if (empty) { empty.hidden = true; }
        if (results) { results.hidden = false; }
      } catch (error) {
        const statusHost = config.datasets[0] && state.datasets[config.datasets[0].key] ? state.datasets[config.datasets[0].key].shell.querySelector('[data-role="status"]') : null;
        setStatus(statusHost, error.message || 'The analysis could not be completed.', 'error');
      }
    }
    config.datasets.forEach((datasetConfig) => {
      const datasetState = state.datasets[datasetConfig.key];
      const shell = datasetState.shell;
      const fileInput = shell.querySelector('[data-role="file-input"]');
      const pasteInput = shell.querySelector('[data-role="paste-input"]');
      const pasteButton = shell.querySelector('[data-role="paste-button"]');
      const sampleButton = shell.querySelector('[data-role="sample-button"]');
      const resetButton = shell.querySelector('[data-role="reset-button"]');
      if (fileInput) {
        fileInput.addEventListener('change', async (event) => {
          const file = event.target.files && event.target.files[0];
          if (!file) { return; }
          try {
            const text = await readFile(file);
            loadText(datasetState, text);
          } catch (error) {
            setStatus(shell.querySelector('[data-role="status"]'), error.message || 'The selected file could not be read.', 'error');
          }
        });
      }
      if (pasteButton) { pasteButton.addEventListener('click', () => loadText(datasetState, pasteInput ? pasteInput.value : '')); }
      if (sampleButton) {
        sampleButton.addEventListener('click', () => {
          if (pasteInput) { pasteInput.value = datasetConfig.sampleCsv; }
          loadText(datasetState, datasetConfig.sampleCsv);
        });
      }
      if (resetButton) { resetButton.addEventListener('click', resetAll); }
    });

    if (analyzeButton) { analyzeButton.addEventListener('click', runAnalysis); }
    if (exportButton) {
      exportButton.addEventListener('click', () => {
        if (state.analysis && state.analysis.exportRows && state.analysis.exportRows.length) {
          downloadCsv(state.analysis.exportFileName || config.exportFileName || 'qbo-tool-export.csv', state.analysis.exportRows, state.analysis.exportColumns);
        }
      });
      exportButton.disabled = true;
    }
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (!state.analysis) { return; }
        const explorerRows = filterRowsBySearch(state.analysis.explorerRows || [], searchInput.value);
        renderTable(root.querySelector('[data-role="explorer-table"]'), state.analysis.explorerColumns || [], explorerRows, state.analysis.explorerEmpty || 'No rows matched the current search.');
      });
    }
  }

  const QBOCore = {
    escapeHtml,
    normalizeText,
    slugifyHeader,
    titleCase,
    parseNumber,
    parsePercent,
    parseDate,
    csvEscape,
    formatNumber,
    formatMoney,
    formatPercent,
    formatDateValue,
    toIsoDate,
    median,
    sum,
    detectDelimiter,
    parseDelimited,
    guessMapping,
    buildMappingMarkup,
    downloadCsv,
    renderFlags,
    createSingleFileTool,
    createDualFileTool
  };

  if (typeof window !== 'undefined') {
    window.QBOCore = QBOCore;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = QBOCore;
  }
}());
