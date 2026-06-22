(function () {
  'use strict';

  /* ── Field definitions & auto-mapping hints ── */
  var FIELDS = [
    { key: 'entity',       label: 'Entity',              help: 'The entity that recorded the transaction.' },
    { key: 'counterparty', label: 'Counterparty',        help: 'The other entity involved in the IC transaction.' },
    { key: 'account',      label: 'Account',             help: 'GL account or IC account code.' },
    { key: 'amount',       label: 'Signed amount',       help: 'Use when the export has positive and negative values.' },
    { key: 'debit',        label: 'Debit',               help: 'Use if signed amount is not available.' },
    { key: 'credit',       label: 'Credit',              help: 'Use if signed amount is not available.' },
    { key: 'description',  label: 'Description or memo', help: 'Optional but helps identify specific transactions.' }
  ];

  var HINTS = {
    entity:       ['entity', 'company', 'subsidiary', 'businessunit', 'division', 'legalentity', 'reportingentity', 'fromentity', 'sourceentity'],
    counterparty: ['counterparty', 'counterpartyentity', 'toentity', 'partner', 'relatedentity', 'icentity', 'intercompanyentity', 'tradingpartner', 'targetentity'],
    account:      ['account', 'accountnumber', 'accountcode', 'glaccount', 'glcode', 'accountname', 'icaccount'],
    amount:       ['amount', 'signedamount', 'netamount', 'value', 'lineamount', 'transactionamount', 'balance'],
    debit:        ['debit', 'debits', 'dr'],
    credit:       ['credit', 'credits', 'cr'],
    description:  ['description', 'memo', 'comment', 'notes', 'details', 'transactiondescription', 'linedescription']
  };

  /* ── Sample data: 3 entities (US, UK, DE) with mixed/unmatched IC txns ── */
  var SAMPLE_CSV = [
    'Entity,Counterparty,Account,Amount,Description',
    'US,UK,1400-IC Receivable,50000,Management fee Q1',
    'UK,US,2400-IC Payable,-50000,Management fee Q1',
    'US,DE,1400-IC Receivable,30000,Shared services allocation',
    'DE,US,2400-IC Payable,-30000,Shared services allocation',
    'UK,DE,1400-IC Receivable,20000,Royalty payment Mar',
    'DE,UK,2400-IC Payable,-19500,Royalty payment Mar',
    'US,UK,1400-IC Receivable,15000,IT cost sharing Feb',
    'DE,US,1400-IC Receivable,8000,Inventory transfer'
  ].join('\n');

  /* ── App state ── */
  var state = { parsed: null, analysis: null, mapping: {} };

  /* ── Utility helpers ── */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function slug(v) {
    return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function fmtNum(v) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v || 0);
  }

  function fmtMoney(v) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2
    }).format(v || 0);
  }

  function parseNum(v) {
    if (v == null) return null;
    var raw = String(v).trim();
    if (!raw) return null;
    var neg = /^\(.*\)$/.test(raw);
    var cleaned = raw.replace(/[,$\s()]/g, '').replace(/[^0-9.\-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;
    var n = parseFloat(cleaned);
    if (isNaN(n)) return null;
    return neg ? -n : n;
  }

  function csvEsc(v) {
    var t = String(v == null ? '' : v);
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  /* ── CSV parsing ── */
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

  function splitLine(line, delim) {
    var cells = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], nx = line[i + 1];
      if (ch === '"') { if (inQ && nx === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
      else if (ch === delim && !inQ) { cells.push(cur); cur = ''; }
      else { cur += ch; }
    }
    cells.push(cur);
    return cells;
  }

  function parseCSV(text, delim) {
    var src = String(text || '').replace(/^\uFEFF/, '');
    var rows = [], cur = '', row = [], inQ = false;
    for (var i = 0; i < src.length; i++) {
      var ch = src[i], nx = src[i + 1];
      if (ch === '"') { if (inQ && nx === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
      else if (ch === delim && !inQ) { row.push(cur); cur = ''; }
      else if ((ch === '\n' || ch === '\r') && !inQ) {
        if (ch === '\r' && nx === '\n') i++;
        row.push(cur); cur = '';
        if (row.some(function (c) { return String(c).trim() !== ''; })) rows.push(row);
        row = [];
      } else { cur += ch; }
    }
    if (cur.length || row.length) { row.push(cur); if (row.some(function (c) { return String(c).trim() !== ''; })) rows.push(row); }
    if (!rows.length) throw new Error('No rows found in the uploaded file.');
    var headers = rows.shift().map(function (h, idx) { return String(h || 'Column ' + (idx + 1)).trim() || 'Column ' + (idx + 1); });
    var objects = rows.map(function (cells, ri) {
      var o = { __row: ri + 2 };
      headers.forEach(function (h, ci) { o[h] = cells[ci] == null ? '' : String(cells[ci]).trim(); });
      return o;
    });
    return { headers: headers, rows: objects, delimiter: delim };
  }

  /* ── Auto-mapping ── */
  function guessMapping(headers) {
    var normed = headers.map(function (h) { return { orig: h, s: slug(h) }; });
    var mapping = {};
    FIELDS.forEach(function (f) {
      var best = '', score = 0;
      normed.forEach(function (h) {
        (HINTS[f.key] || []).forEach(function (hint) {
          if (h.s === hint && score < 100) { best = h.orig; score = 100; }
          else if (h.s.indexOf(hint) !== -1 && score < 60) { best = h.orig; score = 60; }
        });
      });
      mapping[f.key] = best;
    });
    return mapping;
  }

  /* ── Normalize rows using mapping ── */
  function normalizeRows(parsed, mapping) {
    return parsed.rows.map(function (row) {
      var debit = parseNum(mapping.debit ? row[mapping.debit] : null);
      var credit = parseNum(mapping.credit ? row[mapping.credit] : null);
      var amountVal = parseNum(mapping.amount ? row[mapping.amount] : null);
      var amount = amountVal != null ? amountVal : (debit || 0) - (credit || 0);
      return {
        rowNumber: row.__row,
        raw: row,
        entity: mapping.entity ? String(row[mapping.entity] || '').trim().toUpperCase() : '',
        counterparty: mapping.counterparty ? String(row[mapping.counterparty] || '').trim().toUpperCase() : '',
        account: mapping.account ? String(row[mapping.account] || '').trim() : '',
        amount: amount,
        description: mapping.description ? String(row[mapping.description] || '').trim() : ''
      };
    }).filter(function (r) {
      return r.entity && r.counterparty && (r.amount !== 0 || r.account);
    });
  }

  /* ── Core analysis ── */
  function analyzeIC(rows) {
    var pairKey = function (a, b) { return a < b ? a + ' | ' + b : b + ' | ' + a; };
    var pairMap = {};   // canonical pair -> { sideA, sideB, rows }
    var entityMap = {}; // entity -> stats
    var allEntities = {};

    // Collect all entities on both sides
    rows.forEach(function (r) {
      allEntities[r.entity] = true;
      allEntities[r.counterparty] = true;
    });

    // Group by canonical pair
    rows.forEach(function (r) {
      var key = pairKey(r.entity, r.counterparty);
      if (!pairMap[key]) {
        var sides = key.split(' | ');
        pairMap[key] = { key: key, sideA: sides[0], sideB: sides[1], rows: [], netA: 0, netB: 0, countA: 0, countB: 0 };
      }
      var p = pairMap[key];
      p.rows.push(r);
      if (r.entity === p.sideA) { p.netA += r.amount; p.countA++; }
      else { p.netB += r.amount; p.countB++; }

      // Entity stats
      if (!entityMap[r.entity]) entityMap[r.entity] = { entity: r.entity, rows: 0, flagged: 0, totalAbs: 0, net: 0, partners: {} };
      var es = entityMap[r.entity];
      es.rows++; es.totalAbs += Math.abs(r.amount); es.net += r.amount;
      es.partners[r.counterparty] = true;
    });

    // Analyze pairs
    var pairs = [];
    var exceptions = [];
    var totalPairs = 0, balancedPairs = 0, unbalancedPairs = 0, unmatchedPairs = 0;
    var missingCounterparties = {};

    Object.keys(pairMap).forEach(function (key) {
      var p = pairMap[key];
      totalPairs++;
      var pairNet = p.netA + p.netB;
      var absDiff = Math.abs(pairNet);
      var status, tags = [];

      // Check if counterparty entities actually have rows as entities (not just referenced)
      var sideAHasRows = rows.some(function (r) { return r.entity === p.sideA; });
      var sideBHasRows = rows.some(function (r) { return r.entity === p.sideB; });

      if (!sideAHasRows) { missingCounterparties[p.sideA] = true; }
      if (!sideBHasRows) { missingCounterparties[p.sideB] = true; }

      if (p.countA === 0 || p.countB === 0) {
        // One side has no entries for this pair
        status = 'unmatched';
        tags.push('unmatched');
        unmatchedPairs++;
        if (p.countA === 0 && !sideAHasRows) tags.push('missing');
        if (p.countB === 0 && !sideBHasRows) tags.push('missing');
      } else if (absDiff > 0.01) {
        status = 'unbalanced';
        tags.push('unbalanced');
        unbalancedPairs++;
      } else {
        status = 'balanced';
        balancedPairs++;
      }

      pairs.push({
        key: key, sideA: p.sideA, sideB: p.sideB,
        netA: p.netA, netB: p.netB, pairNet: pairNet, absDiff: absDiff,
        countA: p.countA, countB: p.countB,
        status: status, tags: tags, rows: p.rows
      });

      // Build exception rows for non-balanced pairs
      if (status !== 'balanced') {
        p.rows.forEach(function (r) {
          var eTags = tags.slice();
          // Flag individual rows from the side that has no counterparty entries
          if (p.countA === 0 && r.entity === p.sideB) eTags.push('no-offset');
          if (p.countB === 0 && r.entity === p.sideA) eTags.push('no-offset');

          exceptions.push({
            rowNumber: r.rowNumber,
            entity: r.entity,
            counterparty: r.counterparty,
            account: r.account,
            amount: r.amount,
            description: r.description,
            pairKey: key,
            pairNet: pairNet,
            tags: eTags,
            raw: r.raw
          });

          // Update entity flagged count
          if (entityMap[r.entity]) entityMap[r.entity].flagged++;
        });
      }
    });

    // Check for missing counterparties (entities referenced but never appear as "entity")
    var missingList = Object.keys(missingCounterparties);

    // Sort pairs: exceptions first, then by abs difference
    pairs.sort(function (a, b) {
      if (a.status === 'balanced' && b.status !== 'balanced') return 1;
      if (a.status !== 'balanced' && b.status === 'balanced') return -1;
      return b.absDiff - a.absDiff;
    });

    // Sort exceptions by absolute amount desc
    exceptions.sort(function (a, b) { return Math.abs(b.amount) - Math.abs(a.amount); });

    // Entity summary
    var entities = Object.keys(entityMap).map(function (k) { return entityMap[k]; })
      .sort(function (a, b) { return b.flagged - a.flagged || b.totalAbs - a.totalAbs; });

    return {
      pairs: pairs,
      exceptions: exceptions,
      entities: entities,
      missingCounterparties: missingList,
      metrics: {
        totalRows: rows.length,
        totalPairs: totalPairs,
        balancedPairs: balancedPairs,
        unbalancedPairs: unbalancedPairs,
        unmatchedPairs: unmatchedPairs,
        exceptionRows: exceptions.length,
        missingEntities: missingList.length
      }
    };
  }

  /* ── Rendering ── */
  function renderMappingGrid(headers) {
    var opts = '<option value="">Not mapped</option>' +
      headers.map(function (h) { return '<option value="' + esc(h) + '">' + esc(h) + '</option>'; }).join('');
    return FIELDS.map(function (f) {
      return '<div class="ice-field"><label for="ice-map-' + f.key + '">' + esc(f.label) +
        '</label><select id="ice-map-' + f.key + '" data-field="' + f.key + '">' + opts +
        '</select><small>' + esc(f.help) + '</small></div>';
    }).join('');
  }

  function applyMapping(mapping) {
    FIELDS.forEach(function (f) {
      var el = document.querySelector('[data-field="' + f.key + '"]');
      if (el) el.value = mapping[f.key] || '';
    });
  }

  function readMapping() {
    var m = {};
    document.querySelectorAll('[data-field]').forEach(function (el) {
      m[el.getAttribute('data-field')] = el.value;
    });
    return m;
  }

  function validateMapping(m) {
    if (!m.entity) throw new Error('Map the Entity column so the tool can group IC transactions by originator.');
    if (!m.counterparty) throw new Error('Map the Counterparty column so the tool can match IC pairs.');
    if (!m.amount && !m.debit && !m.credit) throw new Error('Map either a signed Amount column or Debit and Credit columns.');
  }

  function tagHTML(tags) {
    return tags.map(function (t) {
      var cls = 'ice-tag ';
      if (t === 'unbalanced') cls += 'ice-tag-unbalanced';
      else if (t === 'unmatched' || t === 'no-offset') cls += 'ice-tag-unmatched';
      else if (t === 'missing') cls += 'ice-tag-missing';
      else cls += 'ice-tag-ok';
      var label = t === 'no-offset' ? 'No offset' : t === 'missing' ? 'Missing entity' : t.charAt(0).toUpperCase() + t.slice(1);
      return '<span class="' + cls + '">' + esc(label) + '</span>';
    }).join('');
  }

  function renderSummary(m) {
    var cards = [
      { val: fmtNum(m.totalRows), label: 'IC transactions loaded' },
      { val: fmtNum(m.totalPairs), label: 'entity pairs identified' },
      { val: fmtNum(m.balancedPairs), label: 'pairs balanced (net zero)' },
      { val: fmtNum(m.unbalancedPairs + m.unmatchedPairs), label: 'pairs with exceptions' }
    ];
    return cards.map(function (c) {
      return '<div class="ice-summary-card"><strong>' + esc(c.val) + '</strong><span>' + esc(c.label) + '</span></div>';
    }).join('');
  }

  function renderPairTable(pairs) {
    if (!pairs.length) return '<p class="ice-status muted">No IC pairs found. Check the entity and counterparty mapping.</p>';
    var html = '<div class="ice-table-wrap"><table class="ice-table"><thead><tr>' +
      '<th>Entity pair</th><th>Side A net</th><th>Side B net</th><th>Pair net</th><th>Status</th></tr></thead><tbody>';
    pairs.forEach(function (p) {
      html += '<tr><td><strong>' + esc(p.sideA) + ' &harr; ' + esc(p.sideB) + '</strong>' +
        '<span>' + esc(fmtNum(p.countA)) + ' + ' + esc(fmtNum(p.countB)) + ' rows</span></td>' +
        '<td>' + esc(fmtMoney(p.netA)) + '</td>' +
        '<td>' + esc(fmtMoney(p.netB)) + '</td>' +
        '<td><strong>' + esc(fmtMoney(p.pairNet)) + '</strong></td>' +
        '<td>' + tagHTML(p.status === 'balanced' ? ['balanced'] : p.tags) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderExceptionTable(exceptions) {
    if (!exceptions.length) return '<p class="ice-status muted">No exceptions found. All IC pairs net to zero.</p>';
    var html = '<div class="ice-table-wrap"><table class="ice-table"><thead><tr>' +
      '<th>Row</th><th>Entity</th><th>Counterparty</th><th>Account</th><th>Amount</th><th>Pair net</th><th>Issue</th></tr></thead><tbody>';
    exceptions.slice(0, 30).forEach(function (e) {
      html += '<tr><td>' + esc(e.rowNumber) + '</td>' +
        '<td><strong>' + esc(e.entity) + '</strong></td>' +
        '<td>' + esc(e.counterparty) + '</td>' +
        '<td>' + esc(e.account || 'No account') + (e.description ? '<span>' + esc(e.description) + '</span>' : '') + '</td>' +
        '<td><strong>' + esc(fmtMoney(e.amount)) + '</strong></td>' +
        '<td>' + esc(fmtMoney(e.pairNet)) + '</td>' +
        '<td>' + tagHTML(e.tags) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    if (exceptions.length > 30) html += '<p class="ice-status muted">Showing first 30 of ' + exceptions.length + ' exception rows. Export the full list to review all.</p>';
    return html;
  }

  function renderEntityGrid(entities) {
    if (!entities.length) return '<p class="ice-status muted">Entity summaries will appear after analysis.</p>';
    return entities.map(function (e) {
      var partnerCount = Object.keys(e.partners).length;
      return '<article class="ice-pair-card"><h4>' + esc(e.entity) + '</h4>' +
        '<p>' + esc(fmtNum(e.rows)) + ' IC transactions across ' + esc(fmtNum(partnerCount)) + ' partner' + (partnerCount !== 1 ? 's' : '') + '</p>' +
        '<div class="ice-pair-stats">' +
        '<div class="ice-pair-stat"><strong>' + esc(fmtNum(e.flagged)) + '</strong><span>flagged rows</span></div>' +
        '<div class="ice-pair-stat"><strong>' + esc(fmtMoney(e.totalAbs)) + '</strong><span>absolute volume</span></div>' +
        '<div class="ice-pair-stat"><strong>' + esc(fmtMoney(e.net)) + '</strong><span>net IC balance</span></div>' +
        '</div></article>';
    }).join('');
  }

  /* ── Status helper ── */
  function setStatus(msg, type) {
    var el = document.getElementById('ice-status');
    el.className = 'ice-status' + (type ? ' ' + type : '');
    el.textContent = msg;
  }

  /* ── Export exceptions as CSV ── */
  function exportExceptions() {
    if (!state.analysis || !state.parsed) return;
    var headers = state.parsed.headers.concat(['Pair Key', 'Pair Net', 'Exception Tags']);
    var lines = [headers.map(csvEsc).join(',')];
    state.analysis.exceptions.forEach(function (e) {
      var vals = state.parsed.headers.map(function (h) { return e.raw[h] || ''; });
      vals.push(e.pairKey);
      vals.push(e.pairNet);
      vals.push(e.tags.join(' | '));
      lines.push(vals.map(csvEsc).join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'ledger-summit-ic-elimination-exceptions.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /* ── Main analysis flow ── */
  function runAnalysis() {
    try {
      var mapping = readMapping();
      validateMapping(mapping);
      var normalized = normalizeRows(state.parsed, mapping);
      if (!normalized.length) throw new Error('No analyzable rows after mapping. Check that Entity and Counterparty columns are correct.');
      var analysis = analyzeIC(normalized);
      state.mapping = mapping;
      state.analysis = analysis;
      var m = analysis.metrics;

      document.getElementById('ice-summary-grid').innerHTML = renderSummary(m);
      document.getElementById('ice-pair-table').innerHTML = renderPairTable(analysis.pairs);
      document.getElementById('ice-exception-table').innerHTML = renderExceptionTable(analysis.exceptions);
      document.getElementById('ice-entity-grid').innerHTML = renderEntityGrid(analysis.entities);
      document.getElementById('ice-results').hidden = false;
      document.getElementById('ice-empty').hidden = true;
      document.getElementById('ice-export').disabled = analysis.exceptions.length === 0;

      var exPct = m.totalPairs ? Math.round(((m.unbalancedPairs + m.unmatchedPairs) / m.totalPairs) * 100) : 0;
      setStatus('Elimination check complete. ' + (m.unbalancedPairs + m.unmatchedPairs) + ' of ' + m.totalPairs + ' pairs have exceptions (' + exPct + '%).' +
        (m.missingEntities ? ' ' + m.missingEntities + ' counterpart' + (m.missingEntities > 1 ? 'ies' : 'y') + ' missing from entity data.' : ''), 'success');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  /* ── Data loading ── */
  function handleParsed(parsed, autoRun) {
    state.parsed = parsed;
    state.mapping = guessMapping(parsed.headers);
    document.getElementById('ice-mapping-grid').innerHTML = renderMappingGrid(parsed.headers);
    applyMapping(state.mapping);
    document.getElementById('ice-setup-meta').innerHTML =
      '<span class="ice-meta-chip"><strong>' + esc(fmtNum(parsed.rows.length)) + '</strong> rows loaded</span>' +
      '<span class="ice-meta-chip"><strong>' + esc(fmtNum(parsed.headers.length)) + '</strong> columns detected</span>' +
      '<span class="ice-meta-chip"><strong>' + esc(parsed.delimiter === '\t' ? 'Tab' : parsed.delimiter) + '</strong> delimiter</span>';
    setStatus('Loaded ' + parsed.rows.length + ' rows. Review the mapping and click Check Eliminations.', 'success');
    if (autoRun) runAnalysis();
  }

  function loadText(text, autoRun) {
    try {
      var delim = detectDelimiter(text);
      var parsed = parseCSV(text, delim);
      handleParsed(parsed, autoRun);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  /* ── Event binding ── */
  function bindEvents() {
    var fileInput = document.getElementById('ice-file');
    var textarea = document.getElementById('ice-paste');
    var pasteBtn = document.getElementById('ice-paste-button');
    var sampleBtn = document.getElementById('ice-sample');
    var analyzeBtn = document.getElementById('ice-analyze');
    var resetBtn = document.getElementById('ice-reset');
    var exportBtn = document.getElementById('ice-export');

    fileInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { loadText(reader.result, false); };
      reader.onerror = function () { setStatus('Could not read file. Try exporting again as CSV.', 'error'); };
      reader.readAsText(file);
    });

    sampleBtn.addEventListener('click', function () {
      textarea.value = SAMPLE_CSV;
      loadText(SAMPLE_CSV, true);
    });

    pasteBtn.addEventListener('click', function () {
      if (!textarea.value.trim()) { setStatus('Paste CSV or tab-delimited data first.', 'error'); return; }
      loadText(textarea.value, false);
    });

    analyzeBtn.addEventListener('click', function () {
      if (!state.parsed) { setStatus('Load a file or paste data before running the checker.', 'error'); return; }
      runAnalysis();
    });

    resetBtn.addEventListener('click', function () {
      state.parsed = null;
      state.analysis = null;
      state.mapping = {};
      textarea.value = '';
      fileInput.value = '';
      document.getElementById('ice-mapping-grid').innerHTML = '';
      document.getElementById('ice-setup-meta').innerHTML = '';
      document.getElementById('ice-results').hidden = true;
      document.getElementById('ice-empty').hidden = false;
      document.getElementById('ice-export').disabled = true;
      setStatus('Tool reset. Load a new export or try the sample data.', 'muted');
    });

    exportBtn.addEventListener('click', exportExceptions);
  }

  /* ── Init ── */
  function init() {
    if (!document.getElementById('ice-app')) return;
    bindEvents();
    setStatus('Load a CSV export or try the sample data to start.', 'muted');
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }
}());
