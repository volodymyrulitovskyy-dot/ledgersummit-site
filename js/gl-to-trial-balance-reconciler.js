(function () {
  'use strict';

  /* ── Field definitions and auto-mapping hints ── */
  var GL_FIELDS = [
    { key: 'accountCode', label: 'Account code', hints: ['account', 'accountnumber', 'accountcode', 'glaccount', 'glcode', 'acct', 'accountno', 'acctno', 'naturalaccount'] },
    { key: 'accountName', label: 'Account name', hints: ['accountname', 'accountdescription', 'accounttitle', 'gldescription', 'glaccountname', 'acctname', 'name'] },
    { key: 'amount', label: 'Signed amount', hints: ['amount', 'signedamount', 'netamount', 'value', 'lineamount', 'transactionamount'] },
    { key: 'debit', label: 'Debit', hints: ['debit', 'debits', 'dr'] },
    { key: 'credit', label: 'Credit', hints: ['credit', 'credits', 'cr'] }
  ];

  var TB_FIELDS = [
    { key: 'accountCode', label: 'Account code', hints: ['account', 'accountnumber', 'accountcode', 'glaccount', 'glcode', 'acct', 'accountno', 'acctno', 'naturalaccount'] },
    { key: 'accountName', label: 'Account name', hints: ['accountname', 'accountdescription', 'accounttitle', 'gldescription', 'glaccountname', 'acctname', 'name'] },
    { key: 'balance', label: 'Balance', hints: ['balance', 'endingbalance', 'ending', 'netbalance', 'amount', 'total', 'endbalance'] },
    { key: 'debit', label: 'Debit', hints: ['debit', 'debits', 'dr', 'debitbalance'] },
    { key: 'credit', label: 'Credit', hints: ['credit', 'credits', 'cr', 'creditbalance'] }
  ];

  /* ── Sample data ── */
  var GL_SAMPLE = [
    'Account Code,Account Name,Description,Debit,Credit',
    '1000,Cash,Customer payment received,12500.00,0',
    '1000,Cash,Vendor payment issued,0,3200.00',
    '1000,Cash,Payroll disbursement,0,8450.00',
    '1200,Accounts Receivable,Invoice 1042,7500.00,0',
    '1200,Accounts Receivable,Customer payment applied,0,12500.00',
    '1200,Accounts Receivable,Invoice 1055,6200.00,0',
    '2000,Accounts Payable,Vendor invoice 8801,0,4100.00',
    '2000,Accounts Payable,Vendor payment cleared,3200.00,0',
    '2000,Accounts Payable,Vendor invoice 8815,0,2750.00',
    '4000,Revenue,Service revenue Jan,0,15000.00',
    '4000,Revenue,Service revenue Feb,0,18500.00',
    '4000,Revenue,Product revenue Feb,0,4200.00',
    '6100,Marketing Expense,Digital campaign,2800.00,0',
    '6100,Marketing Expense,Conference sponsorship,1450.00,0',
    '6100,Marketing Expense,Print collateral,375.00,0'
  ].join('\n');

  var TB_SAMPLE = [
    'Account Code,Account Name,Debit,Credit',
    '1000,Cash,850.00,0',
    '1200,Accounts Receivable,1200.00,0',
    '2000,Accounts Payable,0,3650.00',
    '4000,Revenue,0,37500.00',
    '6100,Marketing Expense,4625.00,0'
  ].join('\n');
  // GL sums:  1000 = 12500-3200-8450 = 850;  1200 = 7500-12500+6200 = 1200;
  //           2000 = 3200-4100-2750 = -3650;  4000 = -(15000+18500+4200) = -37700;
  //           6100 = 2800+1450+375 = 4625
  // TB:       1000=850, 1200=1200, 2000=-3650, 4000=-37500, 6100=4625
  // Intentional diffs: 4000 GL=-37700 vs TB=-37500 (diff=200)

  /* ── Utility functions ── */
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function detectDelimiter(text) {
    var first = text.split('\n')[0] || '';
    if (first.indexOf('\t') >= 0) return '\t';
    var commas = (first.match(/,/g) || []).length;
    var semis = (first.match(/;/g) || []).length;
    var pipes = (first.match(/\|/g) || []).length;
    if (semis > commas && semis > pipes) return ';';
    if (pipes > commas && pipes > semis) return '|';
    return ',';
  }

  function parseCSV(text) {
    var delim = detectDelimiter(text);
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cells = [];
      var inQuote = false;
      var cell = '';
      for (var j = 0; j < line.length; j++) {
        var ch = line[j];
        if (inQuote) {
          if (ch === '"' && line[j + 1] === '"') { cell += '"'; j++; }
          else if (ch === '"') { inQuote = false; }
          else { cell += ch; }
        } else {
          if (ch === '"') { inQuote = true; }
          else if (ch === delim) { cells.push(cell.trim()); cell = ''; }
          else { cell += ch; }
        }
      }
      cells.push(cell.trim());
      rows.push(cells);
    }
    return rows;
  }

  function normalizeHeader(h) {
    return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function autoMap(headers, fields) {
    var mapping = {};
    var used = {};
    fields.forEach(function (f) {
      var norm = headers.map(normalizeHeader);
      for (var i = 0; i < norm.length; i++) {
        if (used[i]) continue;
        for (var j = 0; j < f.hints.length; j++) {
          if (norm[i] === f.hints[j] || norm[i].indexOf(f.hints[j]) >= 0) {
            mapping[f.key] = i;
            used[i] = true;
            return;
          }
        }
      }
    });
    return mapping;
  }

  function parseNumber(v) {
    if (v == null || v === '') return 0;
    var s = String(v).replace(/[$,\s]/g, '').replace(/\(([^)]+)\)/, '-$1');
    var n = Number(s);
    return isNaN(n) ? 0 : n;
  }

  function fmt(n) {
    if (n == null) return '-';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeCSV(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /* ── State ── */
  var state = { gl: null, tb: null, glMapping: null, tbMapping: null, reconRows: null };

  /* ── DOM references ── */
  var glShell = qs('[data-dataset="gl"]');
  var tbShell = qs('[data-dataset="tb"]');
  var analyzeBtn = qs('#gltb-analyze');
  var exportBtn = qs('#gltb-export');
  var sampleBothBtn = qs('#gltb-sample-both');
  var resetAllBtn = qs('#gltb-reset-all');
  var emptyEl = qs('#gltb-empty');
  var resultsEl = qs('#gltb-results');
  var summaryEl = qs('#gltb-summary');
  var tableWrap = qs('#gltb-table-wrap');

  /* ── Dataset helpers ── */
  function getShell(side) { return side === 'gl' ? glShell : tbShell; }
  function getFields(side) { return side === 'gl' ? GL_FIELDS : TB_FIELDS; }

  function loadData(side, csvText) {
    var shell = getShell(side);
    var statusEl = qs('[data-role="status"]', shell);
    var mapSection = qs('[data-role="mapping-section"]', shell);
    var mapGrid = qs('[data-role="mapping-grid"]', shell);

    var rows = parseCSV(csvText);
    if (rows.length < 2) {
      statusEl.textContent = 'File needs at least a header row and one data row.';
      return;
    }

    var headers = rows[0];
    var data = rows.slice(1);
    var fields = getFields(side);
    var mapping = autoMap(headers, fields);

    if (side === 'gl') { state.gl = { headers: headers, data: data }; state.glMapping = mapping; }
    else { state.tb = { headers: headers, data: data }; state.tbMapping = mapping; }

    statusEl.textContent = data.length + ' rows loaded across ' + headers.length + ' columns.';
    mapSection.style.display = '';
    mapGrid.innerHTML = '';

    fields.forEach(function (f) {
      var div = document.createElement('div');
      div.className = 'gltb-mapping-item';
      var lbl = document.createElement('label');
      lbl.textContent = f.label;
      var sel = document.createElement('select');
      sel.setAttribute('data-field', f.key);
      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = '-- skip --';
      sel.appendChild(opt0);
      for (var i = 0; i < headers.length; i++) {
        var opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = headers[i];
        if (mapping[f.key] === i) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', function () {
        var mp = side === 'gl' ? state.glMapping : state.tbMapping;
        var val = sel.value;
        if (val === '') { delete mp[f.key]; }
        else { mp[f.key] = parseInt(val, 10); }
      });
      div.appendChild(lbl);
      div.appendChild(sel);
      mapGrid.appendChild(div);
    });

    updateAnalyzeState();
  }

  function resetSide(side) {
    var shell = getShell(side);
    qs('[data-role="status"]', shell).textContent = '';
    qs('[data-role="mapping-section"]', shell).style.display = 'none';
    qs('[data-role="mapping-grid"]', shell).innerHTML = '';
    var fileInput = qs('[data-role="file-input"]', shell);
    if (fileInput) fileInput.value = '';
    var pasteInput = qs('[data-role="paste-input"]', shell);
    if (pasteInput) pasteInput.value = '';
    if (side === 'gl') { state.gl = null; state.glMapping = null; }
    else { state.tb = null; state.tbMapping = null; }
    updateAnalyzeState();
  }

  function updateAnalyzeState() {
    var ready = state.gl && state.tb;
    analyzeBtn.disabled = !ready;
  }

  /* ── Wire up each dataset shell ── */
  function wireDataset(side) {
    var shell = getShell(side);
    var fileInput = qs('[data-role="file-input"]', shell);
    var pasteBtn = qs('[data-role="paste-button"]', shell);
    var sampleBtn = qs('[data-role="sample-button"]', shell);
    var resetBtn = qs('[data-role="reset-button"]', shell);
    var pasteArea = qs('[data-role="paste-input"]', shell);

    fileInput.addEventListener('change', function () {
      if (!fileInput.files || !fileInput.files[0]) return;
      var reader = new FileReader();
      reader.onload = function (e) { loadData(side, e.target.result); };
      reader.readAsText(fileInput.files[0]);
    });

    pasteBtn.addEventListener('click', function () {
      var text = pasteArea.value.trim();
      if (text) loadData(side, text);
    });

    sampleBtn.addEventListener('click', function () {
      loadData(side, side === 'gl' ? GL_SAMPLE : TB_SAMPLE);
    });

    resetBtn.addEventListener('click', function () { resetSide(side); });

    /* Drag and drop */
    var dropzone = qs('.gltb-dropzone', shell);
    dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.style.borderColor = '#2d68f6'; });
    dropzone.addEventListener('dragleave', function () { dropzone.style.borderColor = ''; });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.style.borderColor = '';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        var reader = new FileReader();
        reader.onload = function (ev) { loadData(side, ev.target.result); };
        reader.readAsText(e.dataTransfer.files[0]);
      }
    });
  }

  wireDataset('gl');
  wireDataset('tb');

  /* ── Sample both ── */
  sampleBothBtn.addEventListener('click', function () {
    loadData('gl', GL_SAMPLE);
    loadData('tb', TB_SAMPLE);
  });

  /* ── Reset all ── */
  resetAllBtn.addEventListener('click', function () {
    resetSide('gl');
    resetSide('tb');
    state.reconRows = null;
    resultsEl.classList.remove('active');
    emptyEl.style.display = '';
    exportBtn.disabled = true;
    summaryEl.innerHTML = '';
    tableWrap.innerHTML = '';
  });

  /* ── Reconciliation analysis ── */
  function getGLAmount(row, mapping) {
    if (mapping.amount != null) return parseNumber(row[mapping.amount]);
    var dr = mapping.debit != null ? parseNumber(row[mapping.debit]) : 0;
    var cr = mapping.credit != null ? parseNumber(row[mapping.credit]) : 0;
    return dr - cr;
  }

  function getTBBalance(row, mapping) {
    if (mapping.balance != null) return parseNumber(row[mapping.balance]);
    var dr = mapping.debit != null ? parseNumber(row[mapping.debit]) : 0;
    var cr = mapping.credit != null ? parseNumber(row[mapping.credit]) : 0;
    return dr - cr;
  }

  function runReconciliation() {
    var glMap = state.glMapping;
    var tbMap = state.tbMapping;

    if (glMap.accountCode == null) { alert('Map the Account Code column on the GL side.'); return; }
    if (tbMap.accountCode == null) { alert('Map the Account Code column on the TB side.'); return; }
    if (glMap.amount == null && glMap.debit == null && glMap.credit == null) {
      alert('Map at least a signed amount or debit/credit columns on the GL side.'); return;
    }
    if (tbMap.balance == null && tbMap.debit == null && tbMap.credit == null) {
      alert('Map at least a balance or debit/credit columns on the TB side.'); return;
    }

    /* Sum GL detail by account code */
    var glTotals = {};
    var glNames = {};
    state.gl.data.forEach(function (row) {
      var code = String(row[glMap.accountCode] || '').trim();
      if (!code) return;
      var amt = getGLAmount(row, glMap);
      glTotals[code] = (glTotals[code] || 0) + amt;
      if (glMap.accountName != null && row[glMap.accountName]) {
        glNames[code] = row[glMap.accountName].trim();
      }
    });

    /* Build TB lookup */
    var tbBalances = {};
    var tbNames = {};
    state.tb.data.forEach(function (row) {
      var code = String(row[tbMap.accountCode] || '').trim();
      if (!code) return;
      tbBalances[code] = getTBBalance(row, tbMap);
      if (tbMap.accountName != null && row[tbMap.accountName]) {
        tbNames[code] = row[tbMap.accountName].trim();
      }
    });

    /* Build combined account list */
    var allCodes = {};
    Object.keys(glTotals).forEach(function (c) { allCodes[c] = true; });
    Object.keys(tbBalances).forEach(function (c) { allCodes[c] = true; });

    var reconRows = [];
    var matched = 0;
    var diffs = 0;
    var glOnly = 0;
    var tbOnly = 0;

    Object.keys(allCodes).sort().forEach(function (code) {
      var hasGL = glTotals.hasOwnProperty(code);
      var hasTB = tbBalances.hasOwnProperty(code);
      var glTotal = hasGL ? Math.round(glTotals[code] * 100) / 100 : null;
      var tbBal = hasTB ? Math.round(tbBalances[code] * 100) / 100 : null;
      var name = glNames[code] || tbNames[code] || '';
      var diff = null;
      var status = '';

      if (hasGL && hasTB) {
        diff = Math.round((glTotal - tbBal) * 100) / 100;
        if (Math.abs(diff) < 0.005) { status = 'Match'; matched++; }
        else { status = 'Difference'; diffs++; }
      } else if (hasGL && !hasTB) {
        status = 'GL Only'; glOnly++;
      } else {
        status = 'TB Only'; tbOnly++;
      }

      reconRows.push({
        code: code, name: name, glTotal: glTotal, tbBal: tbBal, diff: diff, status: status
      });
    });

    state.reconRows = reconRows;

    /* Render summary */
    var glCount = Object.keys(glTotals).length;
    var tbCount = Object.keys(tbBalances).length;
    var exceptCount = diffs + glOnly + tbOnly;

    summaryEl.innerHTML = [
      '<div class="gltb-summary-card"><div class="gltb-card-value">' + glCount + '</div><div class="gltb-card-label">GL Accounts</div></div>',
      '<div class="gltb-summary-card"><div class="gltb-card-value">' + tbCount + '</div><div class="gltb-card-label">TB Accounts</div></div>',
      '<div class="gltb-summary-card' + (matched > 0 ? ' gltb-ok' : '') + '"><div class="gltb-card-value">' + matched + '</div><div class="gltb-card-label">Matched</div></div>',
      '<div class="gltb-summary-card' + (exceptCount > 0 ? ' gltb-alert' : ' gltb-ok') + '"><div class="gltb-card-value">' + exceptCount + '</div><div class="gltb-card-label">Exceptions</div></div>'
    ].join('');

    renderTable('all');
    emptyEl.style.display = 'none';
    resultsEl.classList.add('active');
    exportBtn.disabled = false;
  }

  function renderTable(filter) {
    var rows = state.reconRows;
    if (!rows) return;

    if (filter === 'exceptions') {
      rows = rows.filter(function (r) { return r.status !== 'Match'; });
    }

    var html = '<table class="gltb-recon-table"><thead><tr>' +
      '<th>Account</th><th>Name</th><th style="text-align:right">GL Total</th>' +
      '<th style="text-align:right">TB Balance</th><th style="text-align:right">Difference</th><th>Status</th></tr></thead><tbody>';

    if (rows.length === 0) {
      html += '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:#617087">No exceptions found. All accounts tie.</td></tr>';
    } else {
      rows.forEach(function (r) {
        var cls = '';
        var badge = '';
        if (r.status === 'Match') {
          cls = 'gltb-row-match';
          badge = '<span class="gltb-status-badge gltb-badge-match">Match</span>';
        } else if (r.status === 'Difference') {
          cls = 'gltb-row-diff';
          badge = '<span class="gltb-status-badge gltb-badge-diff">Difference</span>';
        } else if (r.status === 'GL Only') {
          cls = 'gltb-row-missing';
          badge = '<span class="gltb-status-badge gltb-badge-gl-only">GL Only</span>';
        } else {
          cls = 'gltb-row-missing';
          badge = '<span class="gltb-status-badge gltb-badge-tb-only">TB Only</span>';
        }

        html += '<tr class="' + cls + '">' +
          '<td>' + r.code + '</td>' +
          '<td>' + (r.name || '-') + '</td>' +
          '<td style="text-align:right">' + (r.glTotal != null ? fmt(r.glTotal) : '-') + '</td>' +
          '<td style="text-align:right">' + (r.tbBal != null ? fmt(r.tbBal) : '-') + '</td>' +
          '<td style="text-align:right">' + (r.diff != null ? fmt(r.diff) : '-') + '</td>' +
          '<td>' + badge + '</td></tr>';
      });
    }

    html += '</tbody></table>';
    tableWrap.innerHTML = html;
  }

  /* ── Event: Analyze ── */
  analyzeBtn.addEventListener('click', runReconciliation);

  /* ── Event: Filter buttons ── */
  qsa('.gltb-filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      qsa('.gltb-filter-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderTable(btn.getAttribute('data-filter'));
    });
  });

  /* ── Event: Export CSV ── */
  exportBtn.addEventListener('click', function () {
    if (!state.reconRows) return;
    var lines = ['Account Code,Account Name,GL Total,TB Balance,Difference,Status'];
    state.reconRows.forEach(function (r) {
      lines.push([
        escapeCSV(r.code),
        escapeCSV(r.name),
        r.glTotal != null ? r.glTotal.toFixed(2) : '',
        r.tbBal != null ? r.tbBal.toFixed(2) : '',
        r.diff != null ? r.diff.toFixed(2) : '',
        escapeCSV(r.status)
      ].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'gl-to-tb-reconciliation.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

})();
