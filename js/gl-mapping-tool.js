(function () {
  'use strict';

  var COLUMN_HINTS = {
    accountCode: ['account', 'accountnumber', 'accountcode', 'glaccount', 'glcode', 'acct', 'accountno', 'code', 'number', 'acctno', 'naturalaccount'],
    accountName: ['accountname', 'accountdescription', 'accounttitle', 'name', 'description', 'title', 'gldescription', 'glaccountname', 'acctname', 'label'],
    accountType: ['accounttype', 'type', 'category', 'classification', 'class', 'accttype', 'gltype', 'accountcategory', 'accountclass']
  };

  var SAMPLE_SOURCE = 'Account Code,Account Name,Account Type\n1000,Cash and Cash Equivalents,Asset\n1100,Accounts Receivable,Asset\n1200,Prepaid Expenses,Asset\n1500,Fixed Assets - Equipment,Asset\n2000,Accounts Payable,Liability\n2100,Accrued Liabilities,Liability\n2500,Long-Term Debt,Liability\n3000,Common Stock,Equity\n3100,Retained Earnings,Equity\n4000,Product Revenue,Revenue\n4100,Service Revenue,Revenue\n5000,Cost of Goods Sold,Expense\n6100,Salaries and Wages,Expense\n6200,Rent Expense,Expense\n6300,Marketing and Advertising,Expense';

  var SAMPLE_TARGET = 'Account Code,Account Name,Account Type\n10100,Cash & Equivalents,Asset\n10200,Trade Receivables,Asset\n10300,Prepaid Expense,Asset\n10400,Inventory,Asset\n15000,Property Plant and Equipment,Asset\n20100,AP - Trade,Liability\n20200,Accrued Expenses,Liability\n20500,Notes Payable Long Term,Liability\n30100,Share Capital,Equity\n30200,Retained Earnings,Equity\n40100,Sales Revenue - Products,Revenue\n40200,Sales Revenue - Services,Revenue\n50100,COGS,Expense\n60100,Payroll Expense,Expense\n60200,Occupancy and Rent,Expense\n60300,Advertising Expense,Expense\n60400,Travel and Entertainment,Expense';

  var state = {
    sourceParsed: null,
    targetParsed: null,
    sourceAccounts: [],
    targetAccounts: [],
    mappings: [],
    overrides: {}
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function slugify(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim().replace(/\s+/g, ' ');
  }

  function tokenize(text) {
    var n = normalizeText(text);
    return n ? n.split(' ').filter(function (t) { return t.length > 1; }) : [];
  }

  function csvEscape(value) {
    var t = String(value == null ? '' : value);
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  function detectDelimiter(text) {
    var candidates = [',', '\t', ';', '|'];
    var lines = String(text || '').split(/\r\n|\n|\r/).filter(function (l) { return l.trim(); }).slice(0, 8);
    var best = ',';
    var bestScore = 0;
    candidates.forEach(function (d) {
      var counts = lines.map(function (l) { return splitLine(l, d).length; });
      var avg = counts.reduce(function (s, c) { return s + c; }, 0) / Math.max(counts.length, 1);
      var consistent = counts.filter(function (c) { return c === counts[0]; }).length;
      var score = avg + consistent * 0.25;
      if (score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }

  function splitLine(line, delimiter) {
    var cells = [];
    var current = '';
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { current += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === delimiter && !inQ) {
        cells.push(current); current = '';
      } else { current += ch; }
    }
    cells.push(current);
    return cells;
  }

  function parseCSV(text) {
    var source = String(text || '').replace(/^\uFEFF/, '');
    var delimiter = detectDelimiter(source);
    var rows = [];
    var current = '';
    var row = [];
    var inQ = false;
    for (var i = 0; i < source.length; i++) {
      var ch = source[i];
      var next = source[i + 1];
      if (ch === '"') {
        if (inQ && next === '"') { current += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === delimiter && !inQ) {
        row.push(current); current = '';
      } else if ((ch === '\n' || ch === '\r') && !inQ) {
        if (ch === '\r' && next === '\n') { i++; }
        row.push(current); current = '';
        if (row.some(function (c) { return String(c).trim() !== ''; })) { rows.push(row); }
        row = [];
      } else { current += ch; }
    }
    if (current.length || row.length) {
      row.push(current);
      if (row.some(function (c) { return String(c).trim() !== ''; })) { rows.push(row); }
    }
    if (!rows.length) { throw new Error('No rows found in the uploaded file.'); }
    var headers = rows.shift().map(function (h, idx) {
      return String(h || 'Column ' + (idx + 1)).trim() || 'Column ' + (idx + 1);
    });
    var objects = rows.map(function (cells) {
      var obj = {};
      headers.forEach(function (h, ci) { obj[h] = cells[ci] == null ? '' : String(cells[ci]).trim(); });
      return obj;
    });
    return { headers: headers, rows: objects };
  }

  function guessColumn(headers, hints) {
    var normalized = headers.map(function (h) { return { original: h, slug: slugify(h) }; });
    var best = '';
    var bestScore = 0;
    normalized.forEach(function (h) {
      hints.forEach(function (hint) {
        if (h.slug === hint && bestScore < 100) { best = h.original; bestScore = 100; }
        else if (h.slug.indexOf(hint) !== -1 && bestScore < 60) { best = h.original; bestScore = 60; }
      });
    });
    return best;
  }

  function extractAccounts(parsed) {
    var codeCol = guessColumn(parsed.headers, COLUMN_HINTS.accountCode);
    var nameCol = guessColumn(parsed.headers, COLUMN_HINTS.accountName);
    var typeCol = guessColumn(parsed.headers, COLUMN_HINTS.accountType);
    if (!codeCol && !nameCol) {
      throw new Error('Could not detect an account code or account name column. Check your CSV headers.');
    }
    return parsed.rows.map(function (row) {
      var code = codeCol ? String(row[codeCol] || '').trim() : '';
      var name = nameCol ? String(row[nameCol] || '').trim() : '';
      var type = typeCol ? String(row[typeCol] || '').trim() : '';
      var label = code && name ? code + ' - ' + name : (code || name);
      return { code: code, name: name, type: type, label: label, normalized: normalizeText(name), tokens: tokenize(name), typeNorm: normalizeText(type) };
    }).filter(function (a) { return a.code || a.name; });
  }

  function computeSimilarity(sourceAcc, targetAcc) {
    if (sourceAcc.normalized && sourceAcc.normalized === targetAcc.normalized) {
      return { score: 1.0, type: 'exact' };
    }
    var sTokens = sourceAcc.tokens;
    var tTokens = targetAcc.tokens;
    if (!sTokens.length || !tTokens.length) { return { score: 0, type: 'none' }; }
    var overlap = 0;
    sTokens.forEach(function (st) {
      if (tTokens.indexOf(st) !== -1) { overlap++; }
      else {
        tTokens.forEach(function (tt) {
          if (st.length > 3 && tt.length > 3 && (st.indexOf(tt) !== -1 || tt.indexOf(st) !== -1)) {
            overlap += 0.6;
          }
        });
      }
    });
    var tokenScore = overlap / Math.max(sTokens.length, tTokens.length);
    var typeBonus = 0;
    if (sourceAcc.typeNorm && targetAcc.typeNorm && sourceAcc.typeNorm === targetAcc.typeNorm) {
      typeBonus = 0.15;
    }
    var codeBonus = 0;
    if (sourceAcc.code && targetAcc.code) {
      var sDigits = sourceAcc.code.replace(/[^0-9]/g, '');
      var tDigits = targetAcc.code.replace(/[^0-9]/g, '');
      if (sDigits.length >= 2 && tDigits.length >= 2 && sDigits.charAt(0) === tDigits.charAt(0)) {
        codeBonus = 0.05;
      }
    }
    var total = Math.min(1.0, tokenScore * 0.8 + typeBonus + codeBonus);
    if (total >= 0.95) { return { score: total, type: 'exact' }; }
    if (total >= 0.3) { return { score: total, type: 'fuzzy' }; }
    return { score: total, type: 'none' };
  }

  function buildMappings(sourceAccounts, targetAccounts) {
    var results = [];
    var usedTargets = {};
    sourceAccounts.forEach(function (src) {
      var bestMatch = null;
      var bestScore = 0;
      var bestType = 'unmapped';
      targetAccounts.forEach(function (tgt) {
        var sim = computeSimilarity(src, tgt);
        if (sim.score > bestScore) {
          bestScore = sim.score;
          bestMatch = tgt;
          bestType = sim.type;
        }
      });
      if (bestType === 'none' || !bestMatch) {
        bestMatch = null;
        bestType = 'unmapped';
        bestScore = 0;
      }
      results.push({
        source: src,
        target: bestMatch,
        matchType: bestType,
        score: bestScore
      });
      if (bestMatch) { usedTargets[bestMatch.label] = true; }
    });
    var unmappedTargets = targetAccounts.filter(function (t) { return !usedTargets[t.label]; });
    return { mappings: results, unmappedTargets: unmappedTargets };
  }

  function renderSummary(mappings, unmappedTargets) {
    var exact = mappings.filter(function (m) { return m.matchType === 'exact'; }).length;
    var fuzzy = mappings.filter(function (m) { return m.matchType === 'fuzzy'; }).length;
    var unmapped = mappings.filter(function (m) { return m.matchType === 'unmapped'; }).length;
    return '<div class="glm-summary-card"><strong>' + exact + '</strong><span>Exact matches</span></div>' +
      '<div class="glm-summary-card"><strong>' + fuzzy + '</strong><span>Fuzzy matches</span></div>' +
      '<div class="glm-summary-card"><strong>' + unmapped + '</strong><span>Unmapped source</span></div>' +
      '<div class="glm-summary-card"><strong>' + unmappedTargets.length + '</strong><span>Unused targets</span></div>';
  }

  function renderMappingTable(mappings, targetAccounts) {
    if (!mappings.length) {
      return '<p class="glda-status muted">No mappings to display.</p>';
    }
    var targetOptions = '<option value="">-- Not mapped --</option>' +
      targetAccounts.map(function (t) {
        return '<option value="' + escapeHtml(t.label) + '">' + escapeHtml(t.label) + '</option>';
      }).join('');

    var rows = mappings.map(function (m, idx) {
      var badgeClass = m.matchType === 'exact' ? 'glm-badge-exact' :
        m.matchType === 'fuzzy' ? 'glm-badge-fuzzy' : 'glm-badge-unmapped';
      var badgeLabel = m.matchType === 'exact' ? 'Exact' :
        m.matchType === 'fuzzy' ? 'Fuzzy' : 'Unmapped';
      var confidence = m.score > 0 ? Math.round(m.score * 100) + '%' : '';
      var overrideKey = String(idx);
      var currentTarget = state.overrides[overrideKey] !== undefined
        ? state.overrides[overrideKey]
        : (m.target ? m.target.label : '');
      return '<tr>' +
        '<td><strong>' + escapeHtml(m.source.code) + '</strong></td>' +
        '<td>' + escapeHtml(m.source.name) + (m.source.type ? '<br><small>' + escapeHtml(m.source.type) + '</small>' : '') + '</td>' +
        '<td><span class="glm-badge ' + badgeClass + '">' + badgeLabel + '</span>' +
        (confidence ? ' <small>' + confidence + '</small>' : '') + '</td>' +
        '<td>' + (m.target ? escapeHtml(m.target.label) : '<em>No match</em>') + '</td>' +
        '<td><select class="glm-override-select" data-row="' + idx + '">' +
        targetOptions.replace(
          'value="' + escapeHtml(currentTarget) + '"',
          'value="' + escapeHtml(currentTarget) + '" selected'
        ) + '</select></td>' +
        '</tr>';
    }).join('');

    return '<div class="glm-table-wrap"><table class="glm-table">' +
      '<thead><tr><th>Source Code</th><th>Source Name</th><th>Match</th><th>Suggested Target</th><th>Override</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function renderUnmappedTargets(unmappedTargets) {
    if (!unmappedTargets.length) { return ''; }
    return unmappedTargets.map(function (t) {
      return '<div class="glm-unmapped-item"><strong>' + escapeHtml(t.label) + '</strong>' +
        (t.type ? '<span>' + escapeHtml(t.type) + '</span>' : '<span>No type specified</span>') + '</div>';
    }).join('');
  }

  function setStatus(message, type) {
    var el = document.getElementById('glm-status');
    el.className = 'glda-status' + (type ? ' ' + type : '');
    el.textContent = message;
  }

  function setUploadStatus(id, message, loaded) {
    var el = document.getElementById(id);
    el.textContent = message;
    el.className = 'glm-upload-status' + (loaded ? ' loaded' : '');
  }

  function readFileAsText(file, callback) {
    var reader = new FileReader();
    reader.onload = function () { callback(null, reader.result); };
    reader.onerror = function () { callback(new Error('Could not read the selected file.')); };
    reader.readAsText(file);
  }

  function runAnalysis() {
    if (!state.sourceParsed || !state.targetParsed) {
      setStatus('Upload both source and target account lists before analyzing.', 'error');
      return;
    }
    try {
      state.sourceAccounts = extractAccounts(state.sourceParsed);
      state.targetAccounts = extractAccounts(state.targetParsed);
      if (!state.sourceAccounts.length) { throw new Error('No accounts found in the source file.'); }
      if (!state.targetAccounts.length) { throw new Error('No accounts found in the target file.'); }
      var result = buildMappings(state.sourceAccounts, state.targetAccounts);
      state.mappings = result.mappings;
      state.overrides = {};
      document.getElementById('glm-summary-grid').innerHTML = renderSummary(result.mappings, result.unmappedTargets);
      document.getElementById('glm-mapping-table').innerHTML = renderMappingTable(result.mappings, state.targetAccounts);
      var unmappedHtml = renderUnmappedTargets(result.unmappedTargets);
      var unmappedSection = document.getElementById('glm-unmapped-section');
      if (unmappedHtml) {
        document.getElementById('glm-unmapped-list').innerHTML = unmappedHtml;
        unmappedSection.hidden = false;
      } else {
        unmappedSection.hidden = true;
      }
      document.getElementById('glm-results').hidden = false;
      document.getElementById('glm-empty').hidden = true;
      document.getElementById('glm-export').disabled = false;
      bindOverrideSelects();
      var exact = result.mappings.filter(function (m) { return m.matchType === 'exact'; }).length;
      var fuzzy = result.mappings.filter(function (m) { return m.matchType === 'fuzzy'; }).length;
      var unmapped = result.mappings.filter(function (m) { return m.matchType === 'unmapped'; }).length;
      setStatus('Mapping complete. ' + exact + ' exact, ' + fuzzy + ' fuzzy, ' + unmapped + ' unmapped out of ' + result.mappings.length + ' source accounts.', 'success');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  function bindOverrideSelects() {
    var selects = document.querySelectorAll('.glm-override-select');
    selects.forEach(function (sel) {
      sel.addEventListener('change', function () {
        var idx = sel.getAttribute('data-row');
        state.overrides[idx] = sel.value;
      });
    });
  }

  function getEffectiveTarget(mapping, idx) {
    var overrideKey = String(idx);
    if (state.overrides[overrideKey] !== undefined) {
      var overrideLabel = state.overrides[overrideKey];
      if (!overrideLabel) { return null; }
      for (var i = 0; i < state.targetAccounts.length; i++) {
        if (state.targetAccounts[i].label === overrideLabel) { return state.targetAccounts[i]; }
      }
      return null;
    }
    return mapping.target;
  }

  function exportMapping() {
    if (!state.mappings.length) { return; }
    var lines = ['Source Code,Source Name,Source Type,Target Code,Target Name,Target Type,Match Type'];
    state.mappings.forEach(function (m, idx) {
      var tgt = getEffectiveTarget(m, idx);
      var matchType = m.matchType;
      if (state.overrides[String(idx)] !== undefined) {
        matchType = state.overrides[String(idx)] ? 'manual' : 'unmapped';
      }
      lines.push([
        csvEscape(m.source.code),
        csvEscape(m.source.name),
        csvEscape(m.source.type),
        csvEscape(tgt ? tgt.code : ''),
        csvEscape(tgt ? tgt.name : ''),
        csvEscape(tgt ? tgt.type : ''),
        csvEscape(matchType)
      ].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'ledger-summit-gl-mapping.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function resetTool() {
    state.sourceParsed = null;
    state.targetParsed = null;
    state.sourceAccounts = [];
    state.targetAccounts = [];
    state.mappings = [];
    state.overrides = {};
    document.getElementById('glm-source-file').value = '';
    document.getElementById('glm-target-file').value = '';
    setUploadStatus('glm-source-status', 'No file loaded', false);
    setUploadStatus('glm-target-status', 'No file loaded', false);
    document.getElementById('glm-results').hidden = true;
    document.getElementById('glm-empty').hidden = false;
    document.getElementById('glm-export').disabled = true;
    setStatus('Tool reset. Upload new source and target files to start.', 'muted');
  }

  function loadSampleData() {
    try {
      state.sourceParsed = parseCSV(SAMPLE_SOURCE);
      state.targetParsed = parseCSV(SAMPLE_TARGET);
      setUploadStatus('glm-source-status', state.sourceParsed.rows.length + ' source accounts loaded', true);
      setUploadStatus('glm-target-status', state.targetParsed.rows.length + ' target accounts loaded', true);
      setStatus('Sample data loaded. Click Analyze mapping or review the results below.', 'success');
      runAnalysis();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  function bindEvents() {
    var sourceFile = document.getElementById('glm-source-file');
    var targetFile = document.getElementById('glm-target-file');
    var analyzeBtn = document.getElementById('glm-analyze');
    var sampleBtn = document.getElementById('glm-sample');
    var exportBtn = document.getElementById('glm-export');
    var resetBtn = document.getElementById('glm-reset');

    sourceFile.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) { return; }
      readFileAsText(file, function (err, text) {
        if (err) { setStatus(err.message, 'error'); return; }
        try {
          state.sourceParsed = parseCSV(text);
          setUploadStatus('glm-source-status', state.sourceParsed.rows.length + ' source accounts loaded', true);
          setStatus('Source file loaded. ' + (state.targetParsed ? 'Both files ready. Click Analyze mapping.' : 'Now upload the target file.'), 'success');
        } catch (parseErr) {
          setStatus('Source file error: ' + parseErr.message, 'error');
        }
      });
    });

    targetFile.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) { return; }
      readFileAsText(file, function (err, text) {
        if (err) { setStatus(err.message, 'error'); return; }
        try {
          state.targetParsed = parseCSV(text);
          setUploadStatus('glm-target-status', state.targetParsed.rows.length + ' target accounts loaded', true);
          setStatus('Target file loaded. ' + (state.sourceParsed ? 'Both files ready. Click Analyze mapping.' : 'Now upload the source file.'), 'success');
        } catch (parseErr) {
          setStatus('Target file error: ' + parseErr.message, 'error');
        }
      });
    });

    analyzeBtn.addEventListener('click', runAnalysis);
    sampleBtn.addEventListener('click', loadSampleData);
    exportBtn.addEventListener('click', exportMapping);
    resetBtn.addEventListener('click', resetTool);

    // Drag-and-drop for upload areas
    ['glm-source-area', 'glm-target-area'].forEach(function (areaId) {
      var area = document.getElementById(areaId);
      var isSource = areaId === 'glm-source-area';
      area.addEventListener('dragover', function (e) { e.preventDefault(); area.classList.add('active'); });
      area.addEventListener('dragleave', function () { area.classList.remove('active'); });
      area.addEventListener('drop', function (e) {
        e.preventDefault();
        area.classList.remove('active');
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) { return; }
        readFileAsText(file, function (err, text) {
          if (err) { setStatus(err.message, 'error'); return; }
          try {
            var parsed = parseCSV(text);
            if (isSource) {
              state.sourceParsed = parsed;
              setUploadStatus('glm-source-status', parsed.rows.length + ' source accounts loaded', true);
            } else {
              state.targetParsed = parsed;
              setUploadStatus('glm-target-status', parsed.rows.length + ' target accounts loaded', true);
            }
            var both = state.sourceParsed && state.targetParsed;
            setStatus((isSource ? 'Source' : 'Target') + ' file loaded. ' + (both ? 'Both files ready. Click Analyze mapping.' : 'Now upload the ' + (isSource ? 'target' : 'source') + ' file.'), 'success');
          } catch (parseErr) {
            setStatus((isSource ? 'Source' : 'Target') + ' file error: ' + parseErr.message, 'error');
          }
        });
      });
    });
  }

  function init() {
    var root = document.getElementById('glm-app');
    if (!root) { return; }
    bindEvents();
    setStatus('Upload source and target CSV files to begin, or try the sample data.', 'muted');
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }
}());
