(function () {
  'use strict';

  /* ── State ── */
  var accounts = [];
  var TYPE_ORDER = ['Asset', 'Liability', 'Equity', 'Revenue', 'COGS', 'Expense'];

  /* ── Starter template (20 accounts) ── */
  var STARTER = [
    { number: '1000', name: 'Cash', type: 'Asset', detail: 'Bank' },
    { number: '1100', name: 'Accounts Receivable', type: 'Asset', detail: 'Accounts Receivable' },
    { number: '1200', name: 'Inventory', type: 'Asset', detail: 'Other Current Asset' },
    { number: '1500', name: 'Fixed Assets', type: 'Asset', detail: 'Fixed Asset' },
    { number: '2000', name: 'Accounts Payable', type: 'Liability', detail: 'Accounts Payable' },
    { number: '2100', name: 'Accrued Liabilities', type: 'Liability', detail: 'Other Current Liability' },
    { number: '2500', name: 'Notes Payable', type: 'Liability', detail: 'Long Term Liability' },
    { number: '3000', name: 'Common Stock', type: 'Equity', detail: 'Equity' },
    { number: '3100', name: 'Retained Earnings', type: 'Equity', detail: 'Retained Earnings' },
    { number: '4000', name: 'Revenue', type: 'Revenue', detail: 'Sales of Product Income' },
    { number: '4100', name: 'Service Revenue', type: 'Revenue', detail: 'Service/Fee Income' },
    { number: '5000', name: 'Cost of Goods Sold', type: 'COGS', detail: 'Supplies & Materials COGS' },
    { number: '6000', name: 'Salaries & Wages', type: 'Expense', detail: 'Payroll Expenses' },
    { number: '6100', name: 'Rent Expense', type: 'Expense', detail: 'Rent or Lease' },
    { number: '6200', name: 'Utilities', type: 'Expense', detail: 'Utilities' },
    { number: '6300', name: 'Insurance', type: 'Expense', detail: 'Insurance' },
    { number: '6400', name: 'Depreciation Expense', type: 'Expense', detail: 'Depreciation' },
    { number: '7000', name: 'Interest Expense', type: 'Expense', detail: 'Interest Paid' },
    { number: '8000', name: 'Income Tax Expense', type: 'Expense', detail: 'Taxes Paid' },
    { number: '9000', name: 'Other Income', type: 'Revenue', detail: 'Other Income' }
  ];

  /* ── DOM refs ── */
  var elNumber = document.getElementById('cab-acct-number');
  var elName = document.getElementById('cab-acct-name');
  var elType = document.getElementById('cab-acct-type');
  var elDetail = document.getElementById('cab-detail-type');
  var elAddBtn = document.getElementById('cab-add-btn');
  var elTemplateBtn = document.getElementById('cab-template-btn');
  var elExportBtn = document.getElementById('cab-export-btn');
  var elResetBtn = document.getElementById('cab-reset-btn');
  var elStatus = document.getElementById('cab-status');
  var elSummary = document.getElementById('cab-summary');
  var elValidation = document.getElementById('cab-validation');
  var elTableWrap = document.getElementById('cab-table-wrap');
  var elEmpty = document.getElementById('cab-empty');
  var elCount = document.getElementById('cab-count');

  /* ── Helpers ── */
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function setStatus(msg, cls) {
    elStatus.textContent = msg;
    elStatus.className = 'cab-status' + (cls ? ' ' + cls : '');
  }

  function typeCls(t) {
    return t.toLowerCase().replace(/\s+/g, '');
  }

  /* ── Validation ── */
  function validate() {
    var issues = [];
    var numMap = {};
    var typesPresent = {};

    accounts.forEach(function (a, i) {
      typesPresent[a.type] = true;

      if (!a.type) {
        issues.push({ level: 'error', msg: 'Account "' + a.name + '" (#' + a.number + ') is missing an account type.' });
      }

      if (numMap[a.number]) {
        issues.push({ level: 'error', msg: 'Duplicate account number ' + a.number + ': "' + numMap[a.number] + '" and "' + a.name + '".' });
      } else {
        numMap[a.number] = a.name;
      }
    });

    /* Missing type coverage */
    TYPE_ORDER.forEach(function (t) {
      if (!typesPresent[t]) {
        issues.push({ level: 'warn', msg: 'No ' + t + ' accounts found. Most COAs include at least one.' });
      }
    });

    /* Gap warnings within each type */
    TYPE_ORDER.forEach(function (t) {
      var nums = accounts
        .filter(function (a) { return a.type === t; })
        .map(function (a) { return parseInt(a.number, 10); })
        .filter(function (n) { return !isNaN(n); })
        .sort(function (a, b) { return a - b; });

      for (var i = 1; i < nums.length; i++) {
        var gap = nums[i] - nums[i - 1];
        if (gap > 500) {
          issues.push({ level: 'warn', msg: t + ' accounts: gap of ' + gap + ' between ' + nums[i - 1] + ' and ' + nums[i] + '.' });
        }
      }
    });

    return issues;
  }

  /* ── Render summary cards ── */
  function renderSummary() {
    if (accounts.length === 0) {
      elSummary.style.display = 'none';
      return;
    }
    elSummary.style.display = '';
    var counts = {};
    TYPE_ORDER.forEach(function (t) { counts[t] = 0; });
    accounts.forEach(function (a) { if (counts[a.type] !== undefined) counts[a.type]++; });

    var html = '<div class="cab-summary-card"><strong>' + accounts.length + '</strong><span>Total</span></div>';
    TYPE_ORDER.forEach(function (t) {
      html += '<div class="cab-summary-card"><strong>' + counts[t] + '</strong><span>' + esc(t) + '</span></div>';
    });
    elSummary.innerHTML = html;
  }

  /* ── Render validation ── */
  function renderValidation() {
    var issues = validate();
    if (issues.length === 0 && accounts.length > 0) {
      elValidation.innerHTML = '<div class="cab-validation-item" style="background:rgba(15,211,160,.08);color:#6ee7b7;border-left:3px solid rgba(15,211,160,.4)">No validation issues found.</div>';
      return;
    }
    var html = '';
    issues.forEach(function (i) {
      html += '<div class="cab-validation-item ' + i.level + '">' + esc(i.msg) + '</div>';
    });
    elValidation.innerHTML = html;
  }

  /* ── Render account table ── */
  function renderTable() {
    elCount.textContent = accounts.length + ' account' + (accounts.length !== 1 ? 's' : '');
    elExportBtn.disabled = accounts.length === 0;

    if (accounts.length === 0) {
      elTableWrap.innerHTML = '<div class="cab-empty-table">No accounts yet. Add one above or load the starter template.</div>';
      return;
    }

    /* Group by type */
    var grouped = {};
    TYPE_ORDER.forEach(function (t) { grouped[t] = []; });
    accounts.forEach(function (a) {
      if (grouped[a.type]) grouped[a.type].push(a);
    });

    var html = '<table class="cab-table"><thead><tr><th>Number</th><th>Account Name</th><th>Type</th><th>Detail Type</th><th></th></tr></thead><tbody>';

    TYPE_ORDER.forEach(function (t) {
      if (grouped[t].length === 0) return;
      html += '<tr><td colspan="5" class="cab-type-header">' + esc(t) + ' (' + grouped[t].length + ')</td></tr>';
      grouped[t]
        .sort(function (a, b) { return (a.number || '').localeCompare(b.number || '', undefined, { numeric: true }); })
        .forEach(function (a) {
          html += '<tr data-id="' + esc(a.id) + '">';
          html += '<td>' + esc(a.number) + '</td>';
          html += '<td>' + esc(a.name) + '</td>';
          html += '<td><span class="cab-type-badge ' + typeCls(a.type) + '">' + esc(a.type) + '</span></td>';
          html += '<td>' + esc(a.detail || '') + '</td>';
          html += '<td><button class="cab-btn cab-btn-danger cab-delete-btn" data-id="' + esc(a.id) + '">Delete</button></td>';
          html += '</tr>';
        });
    });

    html += '</tbody></table>';
    elTableWrap.innerHTML = html;

    /* Wire delete buttons */
    var btns = elTableWrap.querySelectorAll('.cab-delete-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', handleDelete);
    }
  }

  /* ── Full render ── */
  function render() {
    renderSummary();
    renderValidation();
    renderTable();
  }

  /* ── Generate unique ID ── */
  var idCounter = 0;
  function nextId() {
    return 'cab-' + (++idCounter) + '-' + Date.now();
  }

  /* ── Add account ── */
  function addAccount(number, name, type, detail, silent) {
    accounts.push({
      id: nextId(),
      number: (number || '').trim(),
      name: (name || '').trim(),
      type: type || '',
      detail: (detail || '').trim()
    });
    if (!silent) render();
  }

  /* ── Handlers ── */
  function handleAdd() {
    var num = elNumber.value.trim();
    var name = elName.value.trim();
    var type = elType.value;
    var detail = elDetail.value.trim();

    if (!num) { setStatus('Please enter an account number.', 'error'); elNumber.focus(); return; }
    if (!name) { setStatus('Please enter an account name.', 'error'); elName.focus(); return; }
    if (!type) { setStatus('Please select an account type.', 'error'); elType.focus(); return; }

    /* Check duplicate number */
    var dup = accounts.some(function (a) { return a.number === num; });
    if (dup) { setStatus('Account number ' + num + ' already exists.', 'error'); elNumber.focus(); return; }

    addAccount(num, name, type, detail);

    /* Clear form */
    elNumber.value = '';
    elName.value = '';
    elType.value = '';
    elDetail.value = '';
    setStatus('Added account ' + num + ' — ' + name + '.', 'success');
    elNumber.focus();
  }

  function handleTemplate() {
    /* Prevent duplicates if template already loaded */
    var existing = {};
    accounts.forEach(function (a) { existing[a.number] = true; });
    var added = 0;

    STARTER.forEach(function (s) {
      if (!existing[s.number]) {
        addAccount(s.number, s.name, s.type, s.detail, true);
        added++;
      }
    });

    render();

    if (added === 0) {
      setStatus('All starter template accounts already exist.', 'error');
    } else {
      setStatus('Loaded ' + added + ' starter template account' + (added !== 1 ? 's' : '') + '.', 'success');
    }
  }

  function handleDelete(e) {
    var id = e.currentTarget.getAttribute('data-id');
    accounts = accounts.filter(function (a) { return a.id !== id; });
    render();
    setStatus('Account deleted.', 'success');
  }

  function handleReset() {
    if (accounts.length > 0 && !confirm('Reset will remove all accounts. Continue?')) return;
    accounts = [];
    elNumber.value = '';
    elName.value = '';
    elType.value = '';
    elDetail.value = '';
    render();
    elValidation.innerHTML = '';
    setStatus('All accounts cleared.', 'success');
  }

  /* ── CSV Export ── */
  function handleExport() {
    if (accounts.length === 0) return;

    var sorted = accounts.slice().sort(function (a, b) {
      var ai = TYPE_ORDER.indexOf(a.type);
      var bi = TYPE_ORDER.indexOf(b.type);
      if (ai !== bi) return ai - bi;
      return (a.number || '').localeCompare(b.number || '', undefined, { numeric: true });
    });

    var rows = [['Account Number', 'Account Name', 'Account Type', 'Detail Type']];
    sorted.forEach(function (a) {
      rows.push([a.number, a.name, a.type, a.detail || '']);
    });

    var csv = rows.map(function (r) {
      return r.map(function (cell) {
        var s = String(cell).replace(/"/g, '""');
        return '"' + s + '"';
      }).join(',');
    }).join('\r\n');

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'chart-of-accounts.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('CSV exported with ' + accounts.length + ' accounts.', 'success');
  }

  /* ── Keyboard: Enter to add ── */
  function handleFormKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  }

  /* ── Wire events ── */
  elAddBtn.addEventListener('click', handleAdd);
  elTemplateBtn.addEventListener('click', handleTemplate);
  elExportBtn.addEventListener('click', handleExport);
  elResetBtn.addEventListener('click', handleReset);

  elNumber.addEventListener('keydown', handleFormKeydown);
  elName.addEventListener('keydown', handleFormKeydown);
  elDetail.addEventListener('keydown', handleFormKeydown);

  /* Initial render */
  render();
})();
