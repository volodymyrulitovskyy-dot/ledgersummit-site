# Codex UI Improvement Task — EAC Planner Rebuild

You are an expert front-end engineer working on a vanilla JavaScript + Tailwind CSS application for government-contracting project financial planning (EAC, resource management, budgeting).

The app is a single-page application. There is **no build step**. All rendering is done in `src/app.js` via template string functions that write to `innerHTML`. Tailwind is loaded via CDN.

---

## What has already been changed (do not redo these)

A UI improvement pass was completed that made the following changes. These are already in the codebase.

**`src/app.js`**
- `layout()` rewritten: removed the decorative gradient layer, the module-description card (badge + h1 + description body), and the context panel. Project selector, forecast version, actuals-through label, and year selector are now inline in a 44px sticky dark header bar. Tab navigation now lives in a standalone tab bar row below the header.
- `navButton()` changed from pill buttons floating in a card to a border-bottom underline tab style (`border-b-2 border-sea` for active, transparent for inactive).
- `moduleButton()` changed from `text-sm rounded-full` pills to `text-xs rounded` compact buttons proportional to the header height.
- `resourcePanelHeader()` heading reduced from `text-2xl` to `text-base`.
- `summaryTile()` padding tightened (`py-3` → `py-2.5`, `mt-2` → `mt-1`).
- `heroMetricBlock()` padding and spacing tightened; added a border to distinguish from background.

**`css/styles.css`**
- `.header-select` class added: styles `<select>` elements in the dark header (low-opacity border, translucent background, white text, custom focus state).
- `.shadow-panel h2 { font-size: 1rem }` rule added: reduces all card section headings from `text-2xl` (24px) to 16px globally without touching individual render functions.

**`index.html`**
- Inter font loaded via Google Fonts CDN.
- `fontFamily.sans` extended to use Inter in the Tailwind config.
- `boxShadow.panel` changed from a heavy 60px blur to a tighter double-shadow (`0 4px 20px / 0 1px 3px`).
- Background changed from `bg-stone-100` to `bg-slate-50`.
- `antialiased` class added to `<body>`.

---

## Remaining UI issues to fix

### 1. Card section header pattern is still verbose — replace with a reusable helper

**Severity: High — affects every view**

After the `.shadow-panel h2 { font-size: 1rem }` CSS fix, the heading size is correct, but the markup is still verbose and inconsistent. The current pattern — repeated ~25 times across `renderOverviewTab`, `renderFinancialsView`, `renderResourcesOverview`, `renderBudgetOverview`, etc. — is:

```html
<p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Eyebrow label</p>
<h2 class="mt-1 text-2xl font-semibold tracking-tight">Section title</h2>
```

Some variants also include a description paragraph and an action button on the right.

**Fix:** Add a `cardHeader(title, options = {})` helper function near the top of `app.js` alongside the other helper functions (`summaryTile`, `heroMetricBlock`, etc.):

```js
// options: { eyebrow, description, action }
// action: { label, classes, attrs } — renders a button on the right
function cardHeader(title, { eyebrow = "", description = "", action = null } = {}) {
  const eyebrowHtml = eyebrow
    ? `<p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">${eyebrow}</p>`
    : "";
  const descHtml = description
    ? `<p class="mt-1 text-sm text-slate-500">${description}</p>`
    : "";
  const actionHtml = action
    ? `<button class="${action.classes || "rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white hover:bg-slateblue transition"}" ${action.attrs || ""}>${action.label}</button>`
    : "";

  return `
    <div class="flex flex-wrap items-center justify-between gap-3 ${description ? "mb-4" : "mb-3"}">
      <div>
        ${eyebrowHtml}
        <h2 class="text-base font-semibold text-ink">${title}</h2>
        ${descHtml}
      </div>
      ${actionHtml}
    </div>
  `;
}
```

Then replace the repeated `<p class="text-[11px]..."> + <h2 class="mt-1 text-2xl...">` pairs throughout all render functions with calls to `cardHeader(...)`. Prioritize the top-of-section headers that appear above tables or charts. Do not change the Workflow view content cards — those are intentional multi-line explanatory cards, not section headers.

---

### 2. Overview tab has duplicated financial data

**Severity: High — confusing to users**

`renderOverviewTab()` currently shows the same three numbers (Revenue, Cost, Margin %) twice:

1. First as a row of `heroMetricBlock()` tiles at the top of the overview card (Plan vs EAC side-by-side tiles).
2. Again in the "Core Financial Table" further down (a `<table>` with Plan, Prior Plan, EAC, Variance, Benchmark columns).

The table (section 2) is more complete because it adds Prior Plan and Benchmark columns. The heroMetricBlock tiles (section 1) add nothing that the table doesn't already show better.

**Fix:** Remove the `heroMetricBlock` tile row from `renderOverviewTab`. Keep the "Core Financial Table". Add the "Key Driver" block (currently the 4th column in the hero row) as a standalone tile above or alongside the table.

The section containing the heroMetricBlocks looks like this and should be removed:

```js
<div class="mt-5 grid gap-4 lg:grid-cols-[1.1fr_1.1fr_1.1fr_0.9fr]">
  ${heroMetricBlock("Revenue", ...)}
  ${heroMetricBlock("Cost", ...)}
  ${heroMetricBlock("Margin %", ...)}
  <div class="rounded-xl bg-stone-50 ...">Key Driver block</div>
</div>
```

Move the Key Driver block to the top of the right-side column (currently starts with "Project Profile" and "Contract Setup" cards).

---

### 3. Plan view sub-tabs live inside a card header — separate them

**Severity: Medium**

`renderPlanView()` wraps both the sub-tab navigation (Summary, Labor, Subs, Equipment, Materials, ODC) and the plan content inside a single white card. The sub-tabs appear in the top-right corner of the card header row. This is awkward because:
- The sub-tabs look like card actions, not navigation
- All plan content — including the large data tables — is nested inside this card, making the card enormous

**Fix:** Restructure `renderPlanView()` to emit the sub-tabs as a standalone row above the card, not inside it:

```js
function renderPlanView() {
  const current = state.ui.planSubtab || "summary";
  return `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-base font-semibold text-ink">Planning Workspace</h2>
      <div class="flex gap-1.5">
        ${PLAN_SUBTABS.map(([key, label]) => `
          <button data-plan-subtab="${key}" class="plan-subtab rounded-full px-3 py-1.5 text-sm font-semibold transition ${
            current === key ? "bg-ink text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
          }">${label}</button>
        `).join("")}
      </div>
    </div>
    <div class="rounded-[1.5rem] border border-white/70 bg-white/90 p-5 shadow-panel">
      ${current === "summary" ? renderPlanSummary() : renderPlanningDetail(current)}
    </div>
  `;
}
```

---

### 4. Workflow tab should not be a primary tab for daily users

**Severity: Medium**

The Workflow tab (`renderWorkflowView()`) contains a static explanation of how the app works — six ordered steps, a calculation chain diagram, and a module description. This content is useful once for onboarding but is never needed in a daily review session. Having it as a primary tab forces users to navigate past it every time.

**Fix:** Remove `["workflow", "Workflow"]` from `NAV_ITEMS` (the EAC module tab list). Add a small `?` help button in the header or in the Overview card header that opens a modal or inline accordion with the workflow content. The `renderWorkflowView()` function can stay as-is — just wire it to a toggle instead of a tab.

The help trigger could be a button rendered in `cardHeader()` when `eyebrow === "Overview"`, or a persistent icon in the tab bar.

---

### 5. `dashboardStatLight` label/value layout is hard to scan at a glance

**Severity: Low-Medium**

`dashboardStatLight(label, value)` renders as a full-width row with the label on the left and the value right-aligned:

```html
<div class="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
  <span class="text-slate-600">Label</span>
  <strong class="text-ink">Value</strong>
</div>
```

In the "Project Profile" and "Contract Setup" panels, there are 6–8 of these rows stacked. The alternating text/background contrast is low and the value text (bold, right-aligned) doesn't stand out enough for quick scanning.

**Fix:** Update `dashboardStatLight` to use a subtle divider instead of background, and give the value text slightly more weight:

```js
function dashboardStatLight(label, value) {
  return `
    <div class="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span class="text-slate-500">${label}</span>
      <span class="font-semibold text-ink">${value}</span>
    </div>
  `;
}
```

Also remove the `rounded-xl bg-stone-50` wrapper from the outer container in the Project Profile and Contract Setup sections — it adds unnecessary visual noise around what are simple label/value pairs.

---

### 6. Status indicators are text labels — add semantic color chips

**Severity: Low-Medium**

Several places show statuses as plain text: `currentVersion?.status || "Working"` in the header context, and resource management statuses like `"Approved"`, `"Recruiting"`, `"Planned"`. These are hard to scan in a table row.

**Fix:** Add a `statusChip(label)` helper that maps known status strings to colored badge styles:

```js
const STATUS_COLORS = {
  "Working":     "bg-sky-50 text-sky-700",
  "Approved":    "bg-emerald-50 text-emerald-700",
  "Baselined":   "bg-violet-50 text-violet-700",
  "Submitted":   "bg-amber-50 text-amber-700",
  "Recruiting":  "bg-amber-50 text-amber-700",
  "Planned":     "bg-slate-100 text-slate-600",
  "Offer":       "bg-sky-50 text-sky-700",
  "Forecast":    "bg-slate-100 text-slate-600",
  "Open":        "bg-rose-50 text-rose-700",
  "Pending Approval": "bg-amber-50 text-amber-700"
};

function statusChip(label) {
  const color = STATUS_COLORS[label] || "bg-slate-100 text-slate-600";
  return `<span class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${color}">${label}</span>`;
}
```

Use `statusChip()` in:
- The forecast version line in the page header (replacing the plain text status)
- `renderResourceHiringView()` — Status column
- `renderResourceAttritionView()` — Status column
- `renderResourcesOverview()` — open positions list

---

### 7. Card spacing is inconsistent — standardize padding

**Severity: Low**

Cards currently use a mix of `p-5`, `px-4 py-3`, and `p-4` on the `.shadow-panel` container. This inconsistency creates visual wobble when cards sit side-by-side in a grid.

**Fix:** Standardize all `.shadow-panel` cards to `px-4 py-4` (16px all sides). Specific exceptions:
- The compact planning tables (Labor, Subs, etc.) in the Plan view can keep `p-5` since they contain full-width tables that benefit from the extra horizontal breathing room.
- Form cards (assignment editor, hiring editor) can keep their current padding.

The change is a find-and-replace across `renderOverviewTab`, `renderFinancialsView`, `renderResourcesOverview`, `renderBudgetOverview`, and `renderAdminView` — change all instances of `p-5 shadow-panel` to `px-4 py-4 shadow-panel`.

---

### 8. Variance values mix positive and negative sign conventions

**Severity: Low — polish**

`formatVarianceCell(amount, percent)` returns `"$12,400 (3.2%)"` with no leading `+` sign for favorable variances. This makes it impossible to scan a variance column at a glance — users have to read the color (rose/emerald) to understand direction.

**Fix:** Update `formatVarianceCell` and `formatMarginVariance` to include explicit `+` prefix for positive values:

```js
function formatVarianceCell(amount, percent) {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${formatCompactCurrency(amount)} (${sign}${percent.toFixed(1)}%)`;
}

function formatMarginVariance(points) {
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)} pts`;
}
```

Note: the sign convention for "good vs bad" depends on context (cost variance: negative is good; revenue variance: positive is good). The color coding already handles the good/bad distinction — the sign just adds direction clarity independent of color.

---

## Task summary

1. Implement **all 8 changes** above in working code.
2. Do **not** modify `eacEngine.js`, `calculations.js`, `state.js`, `charts.js`, or the `qbo-backend/` directory. All changes are UI-only in `src/app.js`, `css/styles.css`, and `index.html`.
3. Do **not** undo any of the changes listed in the "What has already been changed" section at the top.
4. After your changes, confirm the app still renders without JavaScript errors by tracing the critical render path: `renderApp()` → `layout()` → `renderEacModule()` → `renderOverviewTab()`.
5. Run `node --test tests/eacEngine.test.js tests/reconciliation.test.js` and confirm all tests still pass (these are logic tests, not UI tests, but verify no accidental JS syntax errors were introduced).

Provide a brief summary of each change made, the function(s) modified, and any trade-offs.
