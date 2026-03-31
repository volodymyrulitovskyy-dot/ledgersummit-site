import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, "tool-categories");
const SITE_URL = "https://ledgersummit.com";
const HUB_PATH = "/tool-categories/";
const HUB_URL = `${SITE_URL}${HUB_PATH}`;
const HUB_DEPLOY_FILE = "tool-categories.html";
const ASSET_ROOT = "/assets";
const LOGO_URL = `${ASSET_ROOT}/logo-ledger-summit.svg`;
const FAVICON_URL = `${ASSET_ROOT}/favicon.svg`;

const CATEGORY_META = {
  "GL & Journal Entry Tools": {
    slug: "gl-journal-entry-tools",
    color: "is-blue",
    eyebrow: "GL & Journal Entry",
    title: "GL, journal entry, and close-support tools",
    summary:
      "Review exported ledgers, validate journals, support close checklists, and move faster through intercompany, accrual, and revenue workflows.",
    heroCopy:
      "This category page keeps GL review, journal controls, close support, and core accounting cleanup in one place so teams can get from raw exports to the right tool faster.",
    keywords: ["GL", "journal entry", "close", "accruals", "revenue", "mapping"],
  },
  "QuickBooks / QBO Tools": {
    slug: "quickbooks-qbo-tools",
    color: "is-gold",
    eyebrow: "QuickBooks / QBO",
    title: "QuickBooks and QBO cleanup, review, and reporting tools",
    summary:
      "Browse QBO tools for transaction analysis, chart cleanup, bank feeds, payroll, AR, AP, allocation logic, and year-end cleanup support.",
    heroCopy:
      "These pages focus on the everyday QBO jobs finance teams actually need to finish: cleaner books, better classifications, faster reconciliation, and stronger reporting.",
    keywords: ["QuickBooks", "QBO", "transactions", "bank feeds", "payroll", "cleanup"],
  },
  "Roll-Forward Schedules": {
    slug: "roll-forward-schedules",
    color: "is-coral",
    eyebrow: "Roll-Forward Schedules",
    title: "Roll-forward schedules for balance sheet support and close prep",
    summary:
      "Find roll-forward tools for fixed assets, receivables, debt, equity, inventory, tax provision, and related balance sheet support schedules.",
    heroCopy:
      "Use this section when the job is simple but important: take a beginning balance, roll activity through the period, and leave with an ending schedule everyone can follow.",
    keywords: ["roll-forward", "fixed assets", "equity", "inventory", "tax", "debt"],
  },
  "Personal Finance Calculators": {
    slug: "personal-finance-calculators",
    color: "is-slate",
    eyebrow: "Personal Finance",
    title: "Personal finance calculators for tax, retirement, debt, and budgeting",
    summary:
      "Explore consumer-friendly finance tools for tax planning, IRA choices, emergency funds, debt payoff strategy, home affordability, savings, and inflation.",
    heroCopy:
      "This category is organized around the personal money questions people search for most often, with calculators that answer one decision at a time.",
    keywords: ["tax planning", "retirement", "budgeting", "debt", "home", "inflation"],
  },
  "Business Finance & FP&A Tools": {
    slug: "business-finance-fpa-tools",
    color: "is-emerald",
    eyebrow: "Business Finance & FP&A",
    title: "Business finance and FP&A tools for margins, cash, and forecasting",
    summary:
      "Use these tools for cost analysis, profitability, liquidity, forecasting, startup runway, budgeting, and SaaS metrics.",
    heroCopy:
      "The goal here is practical decision support: clearer unit economics, faster variance work, and planning outputs that leadership teams can use right away.",
    keywords: ["FP&A", "margins", "runway", "forecasting", "budgeting", "SaaS"],
  },
  "Depreciation & Asset Tools": {
    slug: "depreciation-asset-tools",
    color: "is-indigo",
    eyebrow: "Depreciation & Assets",
    title: "Depreciation and asset tools for tax, book, and disposal workflows",
    summary:
      "Browse depreciation tools for MACRS, straight-line, double-declining balance, Section 179, bonus depreciation, lease-vs-buy, and asset disposal decisions.",
    heroCopy:
      "This category keeps tax depreciation, book depreciation, and asset-management questions in one browse flow so users are not forced through unrelated finance content.",
    keywords: ["depreciation", "MACRS", "Section 179", "bonus", "assets", "lease vs buy"],
  },
  "Reconciliation & Audit Tools": {
    slug: "reconciliation-audit-tools",
    color: "is-terra",
    eyebrow: "Reconciliation & Audit",
    title: "Reconciliation and audit tools for tie-outs and review support",
    summary:
      "This category covers bank and card reconciliations, AP tie-outs, petty cash, intercompany balances, trial balance checks, and audit sampling support.",
    heroCopy:
      "If the job is proving balances, finding mismatches, or preparing evidence for review, these tools keep the browse path tight and useful.",
    keywords: ["reconciliation", "audit", "bank", "AP", "trial balance", "sampling"],
  },
  "Investment & Valuation Tools": {
    slug: "investment-valuation-tools",
    color: "is-teal",
    eyebrow: "Investment & Valuation",
    title: "Investment and valuation tools for cash flow and return analysis",
    summary:
      "Open valuation tools for DCF, WACC, EV/EBITDA, IRR, NPV, cap rate, dividend yield, and P/E analysis.",
    heroCopy:
      "These pages are built for the questions analysts and operators ask when a decision depends on return math, valuation ranges, or capital budgeting.",
    keywords: ["DCF", "IRR", "NPV", "WACC", "valuation", "returns"],
  },
  "Tax & Payroll Calculators": {
    slug: "tax-payroll-calculators",
    color: "is-navy",
    eyebrow: "Tax & Payroll",
    title: "Tax and payroll calculators for estimates, deductions, and compliance",
    summary:
      "Browse calculators for estimated taxes, self-employment tax, mileage, home office, worker classification, payroll taxes, business tax planning, and bonus withholding.",
    heroCopy:
      "This category keeps practical payroll and tax math together so users can move straight to the rule or estimate they need without scanning the whole library.",
    keywords: ["estimated tax", "self-employment", "payroll", "deductions", "sales tax", "bonus"],
  },
  "Converters & Reference Tools": {
    slug: "converters-reference-tools",
    color: "is-amber",
    eyebrow: "Converters & Reference",
    title: "Converters, quick references, and finance utility tools",
    summary:
      "Find utility tools for date periods, currency conversion, number formatting, DSO and DPO math, annualized returns, compound interest, financial ratios, and invoice terms.",
    heroCopy:
      "These are the quick-hit tools users need between larger workflows: simple conversions, clean references, and finance math that should never take more than a minute to find.",
    keywords: ["converter", "reference", "DSO", "DPO", "ratio", "invoice terms"],
  },
  "Nonprofit & Fund Accounting": {
    slug: "nonprofit-fund-accounting",
    color: "is-emerald",
    eyebrow: "Nonprofit & Fund Accounting",
    title: "Nonprofit and fund accounting tools for grants, reporting, and compliance",
    summary:
      "This category covers restricted funds, grant budgets, Form 990 support, donor pledges, functional expense allocations, indirect cost rates, and nonprofit reporting.",
    heroCopy:
      "The nonprofit library is organized around the actual reporting and compliance work finance teams face when grants, restrictions, and public-support rules matter.",
    keywords: ["nonprofit", "fund accounting", "grants", "Form 990", "donor", "indirect cost"],
  },
  "Construction & Job Costing": {
    slug: "construction-job-costing",
    color: "is-coral",
    eyebrow: "Construction & Job Costing",
    title: "Construction finance and job costing tools",
    summary:
      "Browse construction tools for job cost tracking, percentage-of-completion, completed-contract analysis, overhead allocations, AIA billing, retainage, equipment, and WIP schedules.",
    heroCopy:
      "This section is built around project-based finance work where margins, billing, retainage, and WIP need to stay visible at the job level.",
    keywords: ["construction", "job costing", "retainage", "AIA billing", "WIP", "bid margin"],
  },
  "Real Estate Accounting": {
    slug: "real-estate-accounting",
    color: "is-slate",
    eyebrow: "Real Estate Accounting",
    title: "Real estate accounting and property analysis tools",
    summary:
      "Use these tools for ROI, cash-on-cash return, rental tracking, property depreciation, 1031 planning, mortgage amortization, NOI, and cash flow analysis.",
    heroCopy:
      "The real estate set keeps property-level income, return, financing, and tax questions together so investors and accountants can find the right page quickly.",
    keywords: ["real estate", "NOI", "cash-on-cash", "1031", "mortgage", "rental"],
  },
  "Healthcare & Medical Practice": {
    slug: "healthcare-medical-practice",
    color: "is-amber",
    eyebrow: "Healthcare & Medical Practice",
    title: "Healthcare and medical practice finance tools",
    summary:
      "Browse tools for revenue cycle review, reimbursement analysis, healthcare A/R, procedure costs, provider productivity, HIPAA billing compliance, and overhead benchmarking.",
    heroCopy:
      "This category stays focused on practice economics, billing performance, and healthcare-specific compliance questions instead of generic business finance copy.",
    keywords: ["healthcare", "revenue cycle", "RVU", "HIPAA", "A/R", "reimbursement"],
  },
  "Payroll & HR Finance": {
    slug: "payroll-hr-finance",
    color: "is-sky",
    eyebrow: "Payroll & HR Finance",
    title: "Payroll and HR finance tools for labor cost and compliance planning",
    summary:
      "Find tools for employee cost, benefits, loaded labor rates, PTO liabilities, overtime, contractor-vs-employee math, garnishments, 401(k) match, workers comp, and turnover cost.",
    heroCopy:
      "These pages are organized around employer-side labor cost planning so teams can jump straight into the people-cost model they need.",
    keywords: ["HR finance", "labor cost", "PTO", "overtime", "401k", "turnover"],
  },
  "International & Multi-Currency": {
    slug: "international-multi-currency",
    color: "is-sky",
    eyebrow: "International & Multi-Currency",
    title: "International accounting and multi-currency tools",
    summary:
      "Use these tools for FX translation, ASC 830, hedge effectiveness, transfer pricing, foreign tax credits, FBAR, GILTI, and reporting-currency analysis.",
    heroCopy:
      "This category keeps cross-border accounting tasks together so users can move from translation to compliance to tax exposure without jumping between unrelated workflows.",
    keywords: ["FX", "ASC 830", "transfer pricing", "FBAR", "GILTI", "foreign tax credit"],
  },
  "Financial Statement Analysis": {
    slug: "financial-statement-analysis",
    color: "is-violet",
    eyebrow: "Financial Statement Analysis",
    title: "Financial statement analysis tools for ratios, trends, and cash flow",
    summary:
      "Browse ratio suites, common-size builders, horizontal analysis, industry benchmarks, free cash flow, OCF reconciliation, starter models, and earnings-quality tools.",
    heroCopy:
      "This page is built around the standard analysis paths users already recognize: ratio work, statement reshaping, trend review, cash flow interpretation, and earnings quality.",
    keywords: ["ratios", "common-size", "horizontal analysis", "cash flow", "earnings quality", "benchmarking"],
  },
  "Lease & Debt Accounting (ASC 842)": {
    slug: "lease-debt-accounting-asc-842",
    color: "is-indigo",
    eyebrow: "Lease & Debt Accounting",
    title: "Lease and debt accounting tools with ASC 842 support",
    summary:
      "Find tools for operating leases, finance lease schedules, lease classification, debt covenants, loan amortization, effective interest, debt ratios, and bond amortization.",
    heroCopy:
      "This category groups lease and debt math into one browse path so users can move from classification to measurement to compliance checks without leaving the section.",
    keywords: ["ASC 842", "lease accounting", "debt", "loan amortization", "effective interest", "covenants"],
  },
  "Startup & Venture Finance": {
    slug: "startup-venture-finance",
    color: "is-rose",
    eyebrow: "Startup & Venture Finance",
    title: "Startup and venture finance tools for fundraising and unit economics",
    summary:
      "Use these pages for pre/post-money valuation, cap tables, SAFE conversion, startup forecasting, LTV, payback, 409A, ASC 718, hiring plans, and NRR.",
    heroCopy:
      "This section keeps the venture workflow intact from fundraising math through hiring plans and retention metrics, which makes the browse path more useful for operators and founders.",
    keywords: ["startup", "venture", "SAFE", "cap table", "409A", "NRR"],
  },
  "Audit, Compliance & Controls": {
    slug: "audit-compliance-controls",
    color: "is-rose",
    eyebrow: "Audit, Compliance & Controls",
    title: "Audit, compliance, and controls tools for risk and review support",
    summary:
      "Browse tools for internal controls, SOX testing, fraud detection, monetary-unit sampling, audit materiality, segregation-of-duties risk, and close-control calendars.",
    heroCopy:
      "This category is organized around the jobs reviewers actually perform: testing controls, sizing audit thresholds, flagging fraud risks, and keeping compliance calendars current.",
    keywords: ["SOX", "fraud", "controls", "materiality", "sampling", "close controls"],
  },
};

const TOOL_ROWS = String.raw`
1	GL & Journal Entry Tools	GL Analysis	GL Detail Analyzer	https://ledgersummit.com/tools/gl-detail-analyzer
2	GL & Journal Entry Tools	Journal Entries	Journal Entry Validator	https://ledgersummit.com/tools/journal-entry-validator
3	GL & Journal Entry Tools	Consolidation	Intercompany Elimination Checker	https://ledgersummit.com/tools/intercompany-elimination-checker
4	GL & Journal Entry Tools	Chart of Accounts	Chart of Accounts Builder	https://ledgersummit.com/tools/chart-of-accounts-builder
5	GL & Journal Entry Tools	GL Mapping	GL Mapping Tool	https://ledgersummit.com/tools/gl-mapping-tool
6	GL & Journal Entry Tools	Journal Entries	Duplicate Journal Entry Detector	https://ledgersummit.com/tools/duplicate-journal-entry-detector
7	GL & Journal Entry Tools	Audit & Risk	High-Risk Transaction Flagger	https://ledgersummit.com/tools/high-risk-transaction-flagger
8	GL & Journal Entry Tools	Close Process	Month-End Close Checklist Generator	https://ledgersummit.com/tools/month-end-close-checklist
9	GL & Journal Entry Tools	Accruals	Accrual Reversal Scheduler	https://ledgersummit.com/tools/accrual-reversal-scheduler
10	GL & Journal Entry Tools	Accruals	Prepaid Expense Amortization Schedule	https://ledgersummit.com/tools/prepaid-expense-amortization
11	GL & Journal Entry Tools	Revenue	Deferred Revenue Waterfall	https://ledgersummit.com/tools/deferred-revenue-waterfall
12	GL & Journal Entry Tools	Reconciliation	GL to Trial Balance Reconciler	https://ledgersummit.com/tools/gl-to-trial-balance-reconciler
13	QuickBooks / QBO Tools	Transaction Analysis	QBO Transaction Analyzer	https://ledgersummit.com/tools/qbo-transaction-analyzer
14	QuickBooks / QBO Tools	Chart of Accounts	QBO Chart of Accounts Cleaner	https://ledgersummit.com/tools/qbo-chart-of-accounts-cleaner
15	QuickBooks / QBO Tools	Reporting	QBO P&L Variance Tool	https://ledgersummit.com/tools/qbo-pl-variance-tool
16	QuickBooks / QBO Tools	Banking	QBO Bank Feed Matcher	https://ledgersummit.com/tools/qbo-bank-feed-matcher
17	QuickBooks / QBO Tools	Data Management	QBO to Excel Formatter	https://ledgersummit.com/tools/qbo-to-excel-formatter
18	QuickBooks / QBO Tools	Allocation	QBO Class/Department Allocator	https://ledgersummit.com/tools/qbo-class-department-allocator
19	QuickBooks / QBO Tools	Payroll	QBO Payroll Tax Reconciler	https://ledgersummit.com/tools/qbo-payroll-tax-reconciler
20	QuickBooks / QBO Tools	Accounts Receivable	QBO Customer Aging Analyzer	https://ledgersummit.com/tools/qbo-customer-aging-analyzer
21	QuickBooks / QBO Tools	Accounts Payable	QBO Vendor Spend Analyzer	https://ledgersummit.com/tools/qbo-vendor-spend-analyzer
22	QuickBooks / QBO Tools	Year-End	QBO Year-End Cleanup Checklist	https://ledgersummit.com/tools/qbo-year-end-cleanup-checklist
23	Roll-Forward Schedules	Fixed Assets	Fixed Asset Roll-Forward	https://ledgersummit.com/tools/fixed-asset-roll-forward
24	Roll-Forward Schedules	Accounts Receivable	Accounts Receivable Roll-Forward	https://ledgersummit.com/tools/accounts-receivable-roll-forward
25	Roll-Forward Schedules	Debt	Debt Roll-Forward Schedule	https://ledgersummit.com/tools/debt-roll-forward-schedule
26	Roll-Forward Schedules	Equity	Equity Roll-Forward	https://ledgersummit.com/tools/equity-roll-forward
27	Roll-Forward Schedules	Intangibles	Goodwill & Intangibles Roll-Forward	https://ledgersummit.com/tools/goodwill-intangibles-roll-forward
28	Roll-Forward Schedules	Inventory	Inventory Roll-Forward	https://ledgersummit.com/tools/inventory-roll-forward
29	Roll-Forward Schedules	Tax	Tax Provision Roll-Forward	https://ledgersummit.com/tools/tax-provision-roll-forward
30	Roll-Forward Schedules	Accounts Receivable	Allowance for Doubtful Accounts Roll-Forward	https://ledgersummit.com/tools/allowance-doubtful-accounts-roll-forward
31	Personal Finance Calculators	Tax Planning	Paycheck Tax Estimator	https://ledgersummit.com/tools/paycheck-tax-estimator
32	Personal Finance Calculators	Tax Planning	W-4 Allowance Calculator	https://ledgersummit.com/tools/w4-allowance-calculator
33	Personal Finance Calculators	Retirement	Roth vs Traditional IRA Calculator	https://ledgersummit.com/tools/roth-vs-traditional-ira-calculator
34	Personal Finance Calculators	Budgeting	Emergency Fund Calculator	https://ledgersummit.com/tools/emergency-fund-calculator
35	Personal Finance Calculators	Debt Management	Debt Avalanche vs Snowball Comparison	https://ledgersummit.com/tools/debt-avalanche-vs-snowball
36	Personal Finance Calculators	Budgeting	Net Worth Tracker	https://ledgersummit.com/tools/net-worth-tracker
37	Personal Finance Calculators	Retirement	FIRE Number Calculator	https://ledgersummit.com/tools/fire-number-calculator
38	Personal Finance Calculators	Retirement	Social Security Benefit Estimator	https://ledgersummit.com/tools/social-security-benefit-estimator
39	Personal Finance Calculators	Debt Management	Student Loan Payoff Planner	https://ledgersummit.com/tools/student-loan-payoff-planner
40	Personal Finance Calculators	Real Estate	Home Affordability Calculator	https://ledgersummit.com/tools/home-affordability-calculator
41	Personal Finance Calculators	Tax Planning	Tax Bracket Visualizer	https://ledgersummit.com/tools/tax-bracket-visualizer
42	Personal Finance Calculators	Tax Planning	Side Hustle Tax Calculator	https://ledgersummit.com/tools/side-hustle-tax-calculator
43	Personal Finance Calculators	Budgeting	Savings Rate Calculator	https://ledgersummit.com/tools/savings-rate-calculator
44	Personal Finance Calculators	Inflation	Inflation Impact Calculator	https://ledgersummit.com/tools/inflation-impact-calculator
45	Business Finance & FP&A Tools	Cost Analysis	Break-Even Analysis Calculator	https://ledgersummit.com/tools/break-even-analysis-calculator
46	Business Finance & FP&A Tools	Profitability	Gross Margin Analyzer	https://ledgersummit.com/tools/gross-margin-analyzer
47	Business Finance & FP&A Tools	Profitability	EBITDA Calculator	https://ledgersummit.com/tools/ebitda-calculator
48	Business Finance & FP&A Tools	Liquidity	Working Capital Ratio Calculator	https://ledgersummit.com/tools/working-capital-ratio-calculator
49	Business Finance & FP&A Tools	Efficiency	Cash Conversion Cycle Calculator	https://ledgersummit.com/tools/cash-conversion-cycle-calculator
50	Business Finance & FP&A Tools	Forecasting	Revenue Run Rate Calculator	https://ledgersummit.com/tools/revenue-run-rate-calculator
51	Business Finance & FP&A Tools	Startup Finance	Burn Rate & Runway Calculator	https://ledgersummit.com/tools/burn-rate-runway-calculator
52	Business Finance & FP&A Tools	Budgeting	Budget vs Actual Variance Analyzer	https://ledgersummit.com/tools/budget-vs-actual-variance-analyzer
53	Business Finance & FP&A Tools	SaaS Metrics	SaaS Metrics Calculator	https://ledgersummit.com/tools/saas-metrics-calculator
54	Business Finance & FP&A Tools	SaaS Metrics	Unit Economics Calculator	https://ledgersummit.com/tools/unit-economics-calculator
55	Business Finance & FP&A Tools	Cost Analysis	Operating Leverage Calculator	https://ledgersummit.com/tools/operating-leverage-calculator
56	Business Finance & FP&A Tools	Cost Analysis	Overhead Allocation Calculator	https://ledgersummit.com/tools/overhead-allocation-calculator
57	Depreciation & Asset Tools	Tax Depreciation	MACRS Depreciation Calculator	https://ledgersummit.com/tools/macrs-depreciation-calculator
58	Depreciation & Asset Tools	Book Depreciation	Straight-Line Depreciation Calculator	https://ledgersummit.com/tools/straight-line-depreciation-calculator
59	Depreciation & Asset Tools	Book Depreciation	Double Declining Balance Calculator	https://ledgersummit.com/tools/double-declining-balance-calculator
60	Depreciation & Asset Tools	Tax Depreciation	Section 179 Deduction Calculator	https://ledgersummit.com/tools/section-179-deduction-calculator
61	Depreciation & Asset Tools	Tax Depreciation	Bonus Depreciation Calculator	https://ledgersummit.com/tools/bonus-depreciation-calculator
62	Depreciation & Asset Tools	Asset Management	Asset Disposal Gain/Loss Calculator	https://ledgersummit.com/tools/asset-disposal-gain-loss-calculator
63	Depreciation & Asset Tools	Asset Management	Lease vs Buy Analysis Tool	https://ledgersummit.com/tools/lease-vs-buy-analysis-tool
64	Depreciation & Asset Tools	Asset Management	Asset Life Expectancy Tool	https://ledgersummit.com/tools/asset-life-expectancy-tool
65	Reconciliation & Audit Tools	Banking	Bank Reconciliation Tool	https://ledgersummit.com/tools/bank-reconciliation-tool
66	Reconciliation & Audit Tools	Banking	Credit Card Reconciliation Tool	https://ledgersummit.com/tools/credit-card-reconciliation-tool
67	Reconciliation & Audit Tools	Accounts Payable	Accounts Payable Reconciliation	https://ledgersummit.com/tools/accounts-payable-reconciliation
68	Reconciliation & Audit Tools	Cash Management	Petty Cash Reconciliation	https://ledgersummit.com/tools/petty-cash-reconciliation
69	Reconciliation & Audit Tools	Consolidation	Intercompany Balance Checker	https://ledgersummit.com/tools/intercompany-balance-checker
70	Reconciliation & Audit Tools	Trial Balance	Trial Balance Crossfoot Checker	https://ledgersummit.com/tools/trial-balance-crossfoot-checker
71	Reconciliation & Audit Tools	Analysis	Account Flux Analysis Tool	https://ledgersummit.com/tools/account-flux-analysis-tool
72	Reconciliation & Audit Tools	Audit	Audit Sampling Calculator	https://ledgersummit.com/tools/audit-sampling-calculator
73	Investment & Valuation Tools	Valuation	DCF Valuation Calculator	https://ledgersummit.com/tools/dcf-valuation-calculator
74	Investment & Valuation Tools	Capital Budgeting	IRR Calculator	https://ledgersummit.com/tools/irr-calculator
75	Investment & Valuation Tools	Capital Budgeting	NPV Calculator	https://ledgersummit.com/tools/npv-calculator
76	Investment & Valuation Tools	Real Estate	Cap Rate Calculator	https://ledgersummit.com/tools/cap-rate-calculator
77	Investment & Valuation Tools	Stocks	Dividend Yield Calculator	https://ledgersummit.com/tools/dividend-yield-calculator
78	Investment & Valuation Tools	Stocks	P/E Ratio Analyzer	https://ledgersummit.com/tools/pe-ratio-analyzer
79	Investment & Valuation Tools	Valuation	WACC Calculator	https://ledgersummit.com/tools/wacc-calculator
80	Investment & Valuation Tools	Valuation	EV/EBITDA Multiple Calculator	https://ledgersummit.com/tools/ev-ebitda-multiple-calculator
81	Tax & Payroll Calculators	Estimated Tax	Quarterly Estimated Tax Calculator	https://ledgersummit.com/tools/quarterly-estimated-tax-calculator
82	Tax & Payroll Calculators	Self-Employment	Self-Employment Tax Calculator	https://ledgersummit.com/tools/self-employment-tax-calculator
83	Tax & Payroll Calculators	Deductions	Mileage Deduction Calculator	https://ledgersummit.com/tools/mileage-deduction-calculator
84	Tax & Payroll Calculators	Deductions	Home Office Deduction Calculator	https://ledgersummit.com/tools/home-office-deduction-calculator
85	Tax & Payroll Calculators	Employment	1099 vs W-2 Comparison Tool	https://ledgersummit.com/tools/1099-vs-w2-comparison-tool
86	Tax & Payroll Calculators	Payroll	Payroll Tax Deposit Calculator	https://ledgersummit.com/tools/payroll-tax-deposit-calculator
87	Tax & Payroll Calculators	Payroll	FICA Tax Calculator	https://ledgersummit.com/tools/fica-tax-calculator
88	Tax & Payroll Calculators	Business Tax	S-Corp Reasonable Salary Calculator	https://ledgersummit.com/tools/s-corp-reasonable-salary-calculator
89	Tax & Payroll Calculators	Sales Tax	Sales Tax Calculator by State	https://ledgersummit.com/tools/sales-tax-calculator-by-state
90	Tax & Payroll Calculators	Payroll	Bonus Tax Calculator	https://ledgersummit.com/tools/bonus-tax-calculator
91	Converters & Reference Tools	Date & Period	Accounting Date Period Converter	https://ledgersummit.com/tools/accounting-date-period-converter
92	Converters & Reference Tools	Currency	Currency Converter (Accounting Focus)	https://ledgersummit.com/tools/currency-converter-accounting
93	Converters & Reference Tools	Number Format	Thousands/Millions Converter	https://ledgersummit.com/tools/thousands-millions-converter
94	Converters & Reference Tools	Efficiency Ratios	Days Sales Outstanding (DSO) Calculator	https://ledgersummit.com/tools/dso-calculator
95	Converters & Reference Tools	Efficiency Ratios	Days Payable Outstanding (DPO) Calculator	https://ledgersummit.com/tools/dpo-calculator
96	Converters & Reference Tools	Returns	Annualized Return Calculator	https://ledgersummit.com/tools/annualized-return-calculator
97	Converters & Reference Tools	Interest	Compound Interest Calculator	https://ledgersummit.com/tools/compound-interest-calculator
98	Converters & Reference Tools	Reference	Financial Ratio Quick Reference	https://ledgersummit.com/tools/financial-ratio-quick-reference
99	Converters & Reference Tools	Accounting Basics	Accounting Equation Checker	https://ledgersummit.com/tools/accounting-equation-checker
100	Converters & Reference Tools	Invoicing	Invoice Payment Terms Calculator	https://ledgersummit.com/tools/invoice-payment-terms-calculator
101	Nonprofit & Fund Accounting	Fund Accounting	Restricted vs Unrestricted Fund Tracker	https://ledgersummit.com/tools/restricted-unrestricted-fund-tracker
102	Nonprofit & Fund Accounting	Grant Management	Grant Budget vs Actual Tool	https://ledgersummit.com/tools/grant-budget-vs-actual-tool
103	Nonprofit & Fund Accounting	Fund Accounting	Fund Balance Roll-Forward	https://ledgersummit.com/tools/fund-balance-roll-forward
104	Nonprofit & Fund Accounting	Reporting	Form 990 Revenue Reconciler	https://ledgersummit.com/tools/form-990-revenue-reconciler
105	Nonprofit & Fund Accounting	Fundraising	Donor Pledge Receivable Tracker	https://ledgersummit.com/tools/donor-pledge-receivable-tracker
106	Nonprofit & Fund Accounting	Allocation	Functional Expense Allocation Calculator	https://ledgersummit.com/tools/functional-expense-allocation-calculator
107	Nonprofit & Fund Accounting	Compliance	IRS Public Support Test Calculator	https://ledgersummit.com/tools/irs-public-support-test-calculator
108	Nonprofit & Fund Accounting	Reporting	Statement of Activities Builder	https://ledgersummit.com/tools/statement-of-activities-builder
109	Nonprofit & Fund Accounting	Cash Flow	Nonprofit Cash Flow Projector	https://ledgersummit.com/tools/nonprofit-cash-flow-projector
110	Nonprofit & Fund Accounting	Grant Management	Indirect Cost Rate Calculator	https://ledgersummit.com/tools/indirect-cost-rate-calculator
111	Nonprofit & Fund Accounting	Compliance	In-Kind Contribution Valuation Tool	https://ledgersummit.com/tools/in-kind-contribution-valuation
112	Nonprofit & Fund Accounting	Reporting	Net Asset Classification Checker	https://ledgersummit.com/tools/net-asset-classification-checker
113	Construction & Job Costing	Job Costing	Job Cost Budget vs Actual Tracker	https://ledgersummit.com/tools/job-cost-budget-vs-actual
114	Construction & Job Costing	Revenue Recognition	Percentage of Completion Calculator	https://ledgersummit.com/tools/percentage-of-completion-calculator
115	Construction & Job Costing	Revenue Recognition	Completed Contract Method Analyzer	https://ledgersummit.com/tools/completed-contract-method-analyzer
116	Construction & Job Costing	Overhead	Construction Overhead Allocation Tool	https://ledgersummit.com/tools/construction-overhead-allocation
117	Construction & Job Costing	Billing	AIA Billing / Schedule of Values Builder	https://ledgersummit.com/tools/aia-billing-schedule-of-values
118	Construction & Job Costing	Profitability	Subcontractor Cost Tracker	https://ledgersummit.com/tools/subcontractor-cost-tracker
119	Construction & Job Costing	Estimating	Construction Bid Margin Calculator	https://ledgersummit.com/tools/construction-bid-margin-calculator
120	Construction & Job Costing	Retainage	Retainage Receivable & Payable Tracker	https://ledgersummit.com/tools/retainage-receivable-payable-tracker
121	Construction & Job Costing	Equipment	Equipment Cost & Depreciation Tracker	https://ledgersummit.com/tools/equipment-cost-depreciation-tracker
122	Construction & Job Costing	WIP	Work-in-Progress (WIP) Schedule Builder	https://ledgersummit.com/tools/wip-schedule-builder
123	Real Estate Accounting	Investment Analysis	Real Estate ROI Calculator	https://ledgersummit.com/tools/real-estate-roi-calculator
124	Real Estate Accounting	Investment Analysis	Cash-on-Cash Return Calculator	https://ledgersummit.com/tools/cash-on-cash-return-calculator
125	Real Estate Accounting	Rental Income	Rental Property Income & Expense Tracker	https://ledgersummit.com/tools/rental-property-income-expense-tracker
126	Real Estate Accounting	Depreciation	Rental Property Depreciation Schedule	https://ledgersummit.com/tools/rental-property-depreciation-schedule
127	Real Estate Accounting	Tax	1031 Exchange Boot Calculator	https://ledgersummit.com/tools/1031-exchange-boot-calculator
128	Real Estate Accounting	Tax	Real Estate Passive Loss Tracker	https://ledgersummit.com/tools/real-estate-passive-loss-tracker
129	Real Estate Accounting	Financing	Mortgage Amortization Table Generator	https://ledgersummit.com/tools/mortgage-amortization-table
130	Real Estate Accounting	Investment Analysis	Gross Rent Multiplier Calculator	https://ledgersummit.com/tools/gross-rent-multiplier-calculator
131	Real Estate Accounting	Investment Analysis	Net Operating Income (NOI) Calculator	https://ledgersummit.com/tools/noi-calculator
132	Real Estate Accounting	Investment Analysis	Property Cash Flow Analyzer	https://ledgersummit.com/tools/property-cash-flow-analyzer
133	Healthcare & Medical Practice	Revenue Cycle	Medical Practice Revenue per Visit Calculator	https://ledgersummit.com/tools/revenue-per-visit-calculator
134	Healthcare & Medical Practice	Revenue Cycle	Insurance Reimbursement Rate Analyzer	https://ledgersummit.com/tools/insurance-reimbursement-rate-analyzer
135	Healthcare & Medical Practice	Revenue Cycle	Accounts Receivable Days Calculator (Healthcare)	https://ledgersummit.com/tools/ar-days-calculator-healthcare
136	Healthcare & Medical Practice	Cost Analysis	Cost per Procedure Calculator	https://ledgersummit.com/tools/cost-per-procedure-calculator
137	Healthcare & Medical Practice	Staffing	Provider Productivity & RVU Calculator	https://ledgersummit.com/tools/provider-productivity-rvu-calculator
138	Healthcare & Medical Practice	Compliance	HIPAA Billing Compliance Checklist	https://ledgersummit.com/tools/hipaa-billing-compliance-checklist
139	Healthcare & Medical Practice	Tax	Medical Practice Entity Tax Comparison	https://ledgersummit.com/tools/medical-practice-entity-tax-comparison
140	Healthcare & Medical Practice	Profitability	Practice Overhead Ratio Analyzer	https://ledgersummit.com/tools/practice-overhead-ratio-analyzer
141	Payroll & HR Finance	Payroll Costing	Total Employee Cost Calculator	https://ledgersummit.com/tools/total-employee-cost-calculator
142	Payroll & HR Finance	Benefits	Employer Benefits Cost Analyzer	https://ledgersummit.com/tools/employer-benefits-cost-analyzer
143	Payroll & HR Finance	Payroll Costing	Fully-Loaded Labor Rate Calculator	https://ledgersummit.com/tools/fully-loaded-labor-rate-calculator
144	Payroll & HR Finance	PTO & Leave	PTO Accrual & Liability Calculator	https://ledgersummit.com/tools/pto-accrual-liability-calculator
145	Payroll & HR Finance	Overtime	FLSA Overtime Pay Calculator	https://ledgersummit.com/tools/flsa-overtime-pay-calculator
146	Payroll & HR Finance	Payroll Costing	Contractor vs Employee Cost Comparison	https://ledgersummit.com/tools/contractor-vs-employee-cost
147	Payroll & HR Finance	Garnishments	Wage Garnishment Calculator	https://ledgersummit.com/tools/wage-garnishment-calculator
148	Payroll & HR Finance	401k	401(k) Employer Match Cost Calculator	https://ledgersummit.com/tools/401k-employer-match-calculator
149	Payroll & HR Finance	Compliance	Workers Comp Premium Estimator	https://ledgersummit.com/tools/workers-comp-premium-estimator
150	Payroll & HR Finance	Turnover	Employee Turnover Cost Calculator	https://ledgersummit.com/tools/employee-turnover-cost-calculator
151	International & Multi-Currency	FX Translation	Foreign Currency Translation Gain/Loss Tool	https://ledgersummit.com/tools/foreign-currency-translation-tool
152	International & Multi-Currency	FX Translation	ASC 830 Functional Currency Analyzer	https://ledgersummit.com/tools/asc-830-functional-currency-analyzer
153	International & Multi-Currency	Hedging	FX Hedge Effectiveness Calculator	https://ledgersummit.com/tools/fx-hedge-effectiveness-calculator
154	International & Multi-Currency	Transfer Pricing	Transfer Pricing Markup Calculator	https://ledgersummit.com/tools/transfer-pricing-markup-calculator
155	International & Multi-Currency	Tax	Foreign Tax Credit Calculator	https://ledgersummit.com/tools/foreign-tax-credit-calculator
156	International & Multi-Currency	FX Translation	Multi-Currency P&L Translator	https://ledgersummit.com/tools/multi-currency-pl-translator
157	International & Multi-Currency	Compliance	FBAR Filing Threshold Checker	https://ledgersummit.com/tools/fbar-filing-threshold-checker
158	International & Multi-Currency	Tax	GILTI Tax Exposure Estimator	https://ledgersummit.com/tools/gilti-tax-exposure-estimator
159	Financial Statement Analysis	Ratio Analysis	Liquidity Ratio Suite (Current, Quick, Cash)	https://ledgersummit.com/tools/liquidity-ratio-suite
160	Financial Statement Analysis	Ratio Analysis	Solvency Ratio Calculator	https://ledgersummit.com/tools/solvency-ratio-calculator
161	Financial Statement Analysis	Ratio Analysis	Profitability Ratio Dashboard	https://ledgersummit.com/tools/profitability-ratio-dashboard
162	Financial Statement Analysis	Ratio Analysis	Activity / Efficiency Ratio Calculator	https://ledgersummit.com/tools/activity-efficiency-ratio-calculator
163	Financial Statement Analysis	Trend Analysis	Common-Size Income Statement Builder	https://ledgersummit.com/tools/common-size-income-statement
164	Financial Statement Analysis	Trend Analysis	Common-Size Balance Sheet Builder	https://ledgersummit.com/tools/common-size-balance-sheet
165	Financial Statement Analysis	Trend Analysis	Horizontal Analysis (Multi-Year Trend) Tool	https://ledgersummit.com/tools/horizontal-analysis-tool
166	Financial Statement Analysis	Benchmarking	Industry Benchmark Comparison Tool	https://ledgersummit.com/tools/industry-benchmark-comparison
167	Financial Statement Analysis	Cash Flow	Free Cash Flow Calculator	https://ledgersummit.com/tools/free-cash-flow-calculator
168	Financial Statement Analysis	Cash Flow	Operating Cash Flow to Net Income Reconciler	https://ledgersummit.com/tools/ocf-to-net-income-reconciler
169	Financial Statement Analysis	Forecasting	3-Statement Model Starter (IS/BS/CF)	https://ledgersummit.com/tools/3-statement-model-starter
170	Financial Statement Analysis	Earnings Quality	Accruals Ratio & Earnings Quality Analyzer	https://ledgersummit.com/tools/accruals-ratio-earnings-quality
171	Lease & Debt Accounting (ASC 842)	Operating Leases	ASC 842 Operating Lease ROU & Liability Calculator	https://ledgersummit.com/tools/asc-842-operating-lease-calculator
172	Lease & Debt Accounting (ASC 842)	Finance Leases	ASC 842 Finance Lease Amortization Schedule	https://ledgersummit.com/tools/asc-842-finance-lease-schedule
173	Lease & Debt Accounting (ASC 842)	Lease Classification	Lease Classification Test (Finance vs Operating)	https://ledgersummit.com/tools/lease-classification-test
174	Lease & Debt Accounting (ASC 842)	Debt	Debt Covenant Compliance Checker	https://ledgersummit.com/tools/debt-covenant-compliance-checker
175	Lease & Debt Accounting (ASC 842)	Debt	Loan Amortization Schedule Builder	https://ledgersummit.com/tools/loan-amortization-schedule-builder
176	Lease & Debt Accounting (ASC 842)	Debt	Effective Interest Rate Calculator	https://ledgersummit.com/tools/effective-interest-rate-calculator
177	Lease & Debt Accounting (ASC 842)	Debt	Debt-to-Equity Ratio Tracker	https://ledgersummit.com/tools/debt-to-equity-ratio-tracker
178	Lease & Debt Accounting (ASC 842)	Operating Leases	Lease Incentive & Modification Analyzer	https://ledgersummit.com/tools/lease-incentive-modification-analyzer
179	Lease & Debt Accounting (ASC 842)	Debt	Bond Premium/Discount Amortization (Effective Interest)	https://ledgersummit.com/tools/bond-premium-discount-amortization
180	Lease & Debt Accounting (ASC 842)	Operating Leases	Lease vs Buy NPV Comparison (ASC 842)	https://ledgersummit.com/tools/lease-vs-buy-npv-asc842
181	Startup & Venture Finance	Fundraising	Pre-Money / Post-Money Valuation Calculator	https://ledgersummit.com/tools/pre-post-money-valuation-calculator
182	Startup & Venture Finance	Fundraising	Dilution & Cap Table Calculator	https://ledgersummit.com/tools/dilution-cap-table-calculator
183	Startup & Venture Finance	Fundraising	SAFE Note Conversion Calculator	https://ledgersummit.com/tools/safe-note-conversion-calculator
184	Startup & Venture Finance	Forecasting	Startup Revenue Forecast Model	https://ledgersummit.com/tools/startup-revenue-forecast-model
185	Startup & Venture Finance	Unit Economics	Customer Lifetime Value (LTV) Calculator	https://ledgersummit.com/tools/customer-lifetime-value-calculator
186	Startup & Venture Finance	Unit Economics	Payback Period Calculator	https://ledgersummit.com/tools/payback-period-calculator
187	Startup & Venture Finance	Fundraising	409A Valuation Input Organizer	https://ledgersummit.com/tools/409a-valuation-input-organizer
188	Startup & Venture Finance	Equity	Stock Option Expense (ASC 718) Estimator	https://ledgersummit.com/tools/stock-option-expense-asc718
189	Startup & Venture Finance	Forecasting	Headcount & Hiring Cost Planner	https://ledgersummit.com/tools/headcount-hiring-cost-planner
190	Startup & Venture Finance	Metrics	Net Revenue Retention (NRR) Calculator	https://ledgersummit.com/tools/net-revenue-retention-calculator
191	Audit, Compliance & Controls	Internal Controls	Internal Control Weakness Risk Scorer	https://ledgersummit.com/tools/internal-control-weakness-risk-scorer
192	Audit, Compliance & Controls	SOX Compliance	SOX 404 Control Testing Tracker	https://ledgersummit.com/tools/sox-404-control-testing-tracker
193	Audit, Compliance & Controls	Fraud Detection	Benford's Law Digit Frequency Analyzer	https://ledgersummit.com/tools/benfords-law-digit-analyzer
194	Audit, Compliance & Controls	Sampling	Monetary Unit Sampling Calculator	https://ledgersummit.com/tools/monetary-unit-sampling-calculator
195	Audit, Compliance & Controls	Materiality	Audit Materiality Calculator	https://ledgersummit.com/tools/audit-materiality-calculator
196	Audit, Compliance & Controls	Fraud Detection	Segregation of Duties Risk Matrix	https://ledgersummit.com/tools/segregation-of-duties-risk-matrix
197	Audit, Compliance & Controls	Compliance	Chart of Accounts Compliance Checker	https://ledgersummit.com/tools/chart-of-accounts-compliance-checker
198	Audit, Compliance & Controls	Fraud Detection	Expense Report Anomaly Detector	https://ledgersummit.com/tools/expense-report-anomaly-detector
199	Audit, Compliance & Controls	Reporting	Management Representation Letter Checklist	https://ledgersummit.com/tools/management-rep-letter-checklist
200	Audit, Compliance & Controls	Compliance	Financial Close Control Calendar Builder	https://ledgersummit.com/tools/financial-close-control-calendar
`;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeUrl(url) {
  if (/^https:\/\/ledgersummit\.com\/.+[^/]$/.test(url)) {
    return `${url}/`;
  }
  return url;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleCase(value) {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseTools() {
  return TOOL_ROWS.trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [index, category, subcategory, name, rawUrl] = line.split("\t");
      return {
        index: Number(index),
        category,
        subcategory,
        name,
        url: normalizeUrl(rawUrl),
      };
    });
}

function getSubject(name, suffix) {
  if (suffix && name.endsWith(suffix)) {
    return name.slice(0, -suffix.length).trim();
  }
  return name.trim();
}

function buildToolDescription(tool) {
  const name = tool.name;
  const normalizedName = name.replace(/\s+\([^)]*\)$/, "").trim();
  const lowercase = (value) => value.replace(/\s+/g, " ").trim().toLowerCase();

  if (/roll-forward/i.test(normalizedName)) {
    const subject = lowercase(
      normalizedName
        .replace(/\s+schedule/gi, "")
        .replace(/\s+roll-forward/gi, "")
        .trim(),
    );
    return `Roll ${subject} forward across periods with a clearer beginning-to-ending view.`;
  }

  const suffixActions = [
    [" Analyzer", (subject) => `Analyze ${lowercase(subject)} with a faster browser-based review.`],
    [" Validator", (subject) => `Validate ${lowercase(subject)} and catch issues before review moves forward.`],
    [" Flagger", (subject) => `Flag ${lowercase(subject)} issues and prioritize the items that need attention first.`],
    [" Calculator", (subject) => `Calculate ${lowercase(subject)} using your own assumptions and inputs.`],
    [" Checker", (subject) => `Check ${lowercase(subject)} for gaps, mismatches, or compliance issues.`],
    [" Builder", (subject) => `Build ${lowercase(subject)} in a more structured workflow.`],
    [" Detector", (subject) => `Detect ${lowercase(subject)} patterns and exceptions faster.`],
    [" Generator", (subject) => `Generate ${lowercase(subject)} from guided inputs.`],
    [" Schedule", (subject) => `Build a ${lowercase(subject)} schedule with cleaner period-by-period visibility.`],
    [" Scheduler", (subject) => `Schedule ${lowercase(subject)} with cleaner period-by-period timing.`],
    [" Formatter", (subject) => `Format ${lowercase(subject)} into a cleaner export-ready layout.`],
    [" Allocator", (subject) => `Allocate ${lowercase(subject)} across the right categories or departments.`],
    [" Cleaner", (subject) => `Clean up ${lowercase(subject)} and standardize the output.`],
    [" Matcher", (subject) => `Match ${lowercase(subject)} and surface likely pairs faster.`],
    [" Tracker", (subject) => `Track ${lowercase(subject)} over time in one focused workspace.`],
    [" Planner", (subject) => `Plan ${lowercase(subject)} with a clearer model and guided outputs.`],
    [" Visualizer", (subject) => `Visualize ${lowercase(subject)} in a cleaner decision-ready view.`],
    [" Converter", (subject) => `Convert ${lowercase(subject)} into the format you need.`],
    [" Reconciler", (subject) => `Reconcile ${lowercase(subject)} and identify mismatches quickly.`],
    [" Reconciliation", (subject) => `Reconcile ${lowercase(subject)} and spot exceptions sooner.`],
    [" Estimator", (subject) => `Estimate ${lowercase(subject)} from practical inputs and assumptions.`],
    [" Dashboard", (subject) => `Review ${lowercase(subject)} side by side in one dashboard.`],
    [" Suite", (subject) => `Review ${lowercase(subject)} together in one consolidated view.`],
    [" Projector", (subject) => `Project ${lowercase(subject)} with guided forecasting inputs.`],
    [" Translator", (subject) => `Translate ${lowercase(subject)} with a cleaner reporting-ready workflow.`],
    [" Waterfall", (subject) => `Model ${lowercase(subject)} across periods in a waterfall view.`],
    [" Comparison", (subject) => `Compare ${lowercase(subject)} side by side to support the right decision.`],
    [" Tool", (subject) => `Work through ${lowercase(subject)} with focused inputs and outputs.`],
    [" Model", (subject) => `Model ${lowercase(subject)} with assumptions you can adjust quickly.`],
    [" Starter", (subject) => `Start ${lowercase(subject)} with a guided setup and faster first draft.`],
    [" Organizer", (subject) => `Organize ${lowercase(subject)} into a cleaner decision-ready structure.`],
    [" Reference", (subject) => `Review ${lowercase(subject)} in a quick-reference format built for faster lookup.`],
    [" Scorer", (subject) => `Score ${lowercase(subject)} and prioritize what deserves attention first.`],
    [" Matrix", (subject) => `Map ${lowercase(subject)} in a structured risk matrix view.`],
    [" Test", (subject) => `Test ${lowercase(subject)} with a more structured pass/fail workflow.`],
    [" Amortization", (subject) => `Model ${lowercase(subject)} across periods with clearer amortization detail.`],
    [" Checklist", (subject) => `Use a guided checklist for ${lowercase(subject)} and follow-up review.`],
  ];

  for (const [suffix, createDescription] of suffixActions) {
    if (normalizedName.endsWith(suffix)) {
      return createDescription(getSubject(normalizedName, suffix));
    }
  }

  const keywordActions = [
    [" Calculator", (subject) => `Calculate ${lowercase(subject)} using your own assumptions and inputs.`],
    [" Suite", (subject) => `Review ${lowercase(subject)} together in one consolidated view.`],
    [" Reference", (subject) => `Review ${lowercase(subject)} in a quick-reference format built for faster lookup.`],
    [" Comparison", (subject) => `Compare ${lowercase(subject)} side by side to support the right decision.`],
    [" Schedule", (subject) => `Build a ${lowercase(subject)} schedule with cleaner period-by-period visibility.`],
  ];

  for (const [keyword, createDescription] of keywordActions) {
    if (normalizedName.includes(keyword)) {
      const subject = normalizedName.replace(keyword, "").trim();
      if (subject) {
        return createDescription(subject);
      }
    }
  }

  return `Use ${name} in a focused ${tool.subcategory.toLowerCase()} workflow.`;
}

function getCustomStyles() {
  return `
  <style>
    :root {
      --ls-ink: #0f172a;
      --ls-muted: #4b5563;
      --ls-line: #dbe4ef;
      --ls-panel: #ffffff;
      --ls-page: #f8fbff;
      --ls-brand: #0a66c2;
      --ls-brand-soft: #eaf3ff;
      --ls-shadow: 0 20px 55px rgba(15, 23, 42, 0.08);
      --ls-radius-lg: 24px;
      --ls-radius-md: 18px;
      --ls-radius-sm: 14px;
      --ls-max: 1420px;
      --ls-rail: 980px;
      --accent: #0a66c2;
      --accent-soft: #eaf3ff;
      --accent-line: #bcd7f6;
    }

    body.tools-category-page,
    body.tools-category-hub {
      margin: 0;
      color: var(--ls-ink);
      font-family: "Manrope", sans-serif;
      background:
        radial-gradient(circle at 14% 0%, rgba(10, 102, 194, 0.08), transparent 28%),
        linear-gradient(180deg, #ffffff 0%, var(--ls-page) 100%);
    }

    .tools-category-page *,
    .tools-category-hub * {
      box-sizing: border-box;
    }

    .tools-category-page html,
    .tools-category-hub html {
      scroll-behavior: smooth;
    }

    .skip-link {
      position: absolute;
      left: 16px;
      top: 12px;
      z-index: 120;
      padding: 10px 14px;
      border-radius: 999px;
      background: #ffffff;
      border: 1px solid var(--ls-line);
      color: var(--ls-ink);
      transform: translateY(-160%);
      transition: transform 160ms ease;
    }

    .skip-link:focus {
      transform: translateY(0);
    }

    .nav {
      position: sticky;
      top: 0;
      z-index: 80;
      background: rgba(255, 255, 255, 0.94);
      border-bottom: 1px solid var(--ls-line);
      backdrop-filter: blur(10px);
    }

    .nav-inner {
      width: min(96%, var(--ls-max));
      min-height: 74px;
      margin-inline: auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }

    .nav-logo,
    .footer-brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: var(--ls-ink);
      font-family: "Space Grotesk", sans-serif;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .nav-logo img,
    .footer-brand img {
      display: block;
      height: auto;
    }

    .nav-logo img {
      width: 212px;
    }

    .footer-brand img {
      width: 176px;
    }

    .nav-links,
    .footer-links {
      list-style: none;
      display: flex;
      align-items: center;
      gap: 20px;
      margin: 0;
      padding: 0;
    }

    .nav-links a,
    .footer-links a {
      color: #334155;
      font-size: 0.95rem;
      font-weight: 700;
    }

    .nav-links a:hover,
    .footer-links a:hover {
      color: var(--accent);
    }

    .hamburger {
      display: none;
      width: 46px;
      height: 46px;
      padding: 0;
      border: 1px solid var(--ls-line);
      border-radius: 999px;
      background: #ffffff;
      color: var(--ls-ink);
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .hamburger span {
      display: block;
      width: 18px;
      height: 2px;
      margin: 3px auto;
      border-radius: 999px;
      background: currentColor;
      transition: transform 160ms ease, opacity 160ms ease;
    }

    .hamburger[aria-expanded="true"] span:nth-child(1) {
      transform: translateY(5px) rotate(45deg);
    }

    .hamburger[aria-expanded="true"] span:nth-child(2) {
      opacity: 0;
    }

    .hamburger[aria-expanded="true"] span:nth-child(3) {
      transform: translateY(-5px) rotate(-45deg);
    }

    .mobile-nav {
      display: none;
      width: min(96%, var(--ls-max));
      margin: 0 auto;
      padding: 0 0 16px;
      gap: 10px;
      border-bottom: 1px solid var(--ls-line);
    }

    .mobile-nav.is-open {
      display: grid;
    }

    .mobile-nav a {
      display: block;
      padding: 12px 14px;
      border: 1px solid var(--ls-line);
      border-radius: 14px;
      background: #ffffff;
      color: var(--ls-ink);
      font-weight: 700;
    }

    .mobile-nav a.btn-primary {
      color: #ffffff;
      border-color: transparent;
    }

    .tools-category-page h1,
    .tools-category-page h2,
    .tools-category-page h3,
    .tools-category-hub h1,
    .tools-category-hub h2,
    .tools-category-hub h3 {
      margin: 0;
      color: var(--ls-ink);
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.02em;
      line-height: 1.06;
    }

    .tools-category-page p,
    .tools-category-hub p,
    .tools-category-page li,
    .tools-category-hub li {
      color: var(--ls-muted);
      line-height: 1.62;
    }

    .tools-category-page a,
    .tools-category-hub a {
      text-decoration: none;
    }

    .tools-category-page main,
    .tools-category-hub main {
      padding: 28px 0 88px;
    }

    .tools-category-page .container,
    .tools-category-hub .container {
      width: min(96%, var(--ls-max));
      margin-inline: auto;
    }

    .tools-category-page .tools-hub-hero,
    .tools-category-hub .tools-hub-hero {
      margin-bottom: 0;
      padding: 26px 0 24px;
    }

    .tools-category-page .tools-hub-hero-grid,
    .tools-category-hub .tools-hub-hero-grid {
      display: grid;
      gap: 24px;
      grid-template-columns: 1fr;
      align-items: start;
      max-width: var(--ls-rail);
      margin-inline: auto;
    }

    .tools-category-page .tools-hub-copy,
    .tools-category-page .tools-hub-panel,
    .tools-category-hub .tools-hub-copy,
    .tools-category-hub .tools-hub-panel,
    .tools-category-page .tools-hub-toolbar,
    .tools-category-hub .tools-hub-toolbar,
    .tools-category-page .tools-hub-empty,
    .tools-category-hub .tools-hub-empty,
    .tools-category-page .ls-subcategory-block,
    .tools-category-hub .ls-subcategory-block,
    .tools-category-page .cta-content,
    .tools-category-hub .cta-content {
      background: rgba(255, 255, 255, 0.94);
      border: 1px solid var(--ls-line);
      border-radius: var(--ls-radius-lg);
      box-shadow: var(--ls-shadow);
    }

    .tools-category-page .tools-hub-copy,
    .tools-category-page .tools-hub-panel,
    .tools-category-hub .tools-hub-copy,
    .tools-category-hub .tools-hub-panel {
      padding: 30px;
    }

    .tools-category-page .section-label,
    .tools-category-hub .section-label {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      margin-bottom: 14px;
      border: 1px solid var(--accent-line);
      background: var(--accent-soft);
      color: var(--accent);
      border-radius: 999px;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .tools-category-page h1,
    .tools-category-hub h1 {
      font-size: clamp(2.4rem, 5vw, 4.7rem);
      max-width: 12ch;
      margin-bottom: 12px;
    }

    .tools-category-page h2,
    .tools-category-hub h2 {
      font-size: clamp(1.8rem, 3.4vw, 2.8rem);
      max-width: 18ch;
    }

    .tools-category-page h3,
    .tools-category-hub h3 {
      font-size: 1.32rem;
    }

    .tools-category-page .tools-hub-copy > p,
    .tools-category-hub .tools-hub-copy > p {
      max-width: 68ch;
      font-size: 1.04rem;
      margin: 0;
    }

    .tools-category-page .tools-hub-answer-strip,
    .tools-category-hub .tools-hub-answer-strip {
      margin-top: 18px;
      padding: 16px 18px;
      border-left: 4px solid var(--accent);
      border-radius: 0 16px 16px 0;
      background: linear-gradient(90deg, rgba(10, 102, 194, 0.08), rgba(255, 255, 255, 0.9));
    }

    .tools-category-page .tools-hub-answer-strip strong,
    .tools-category-hub .tools-hub-answer-strip strong {
      display: block;
      margin-bottom: 6px;
      color: var(--ls-ink);
      font-size: 0.95rem;
      font-weight: 800;
    }

    .tools-category-page .tools-hub-answer-strip span,
    .tools-category-hub .tools-hub-answer-strip span {
      display: block;
      color: var(--ls-muted);
      font-size: 0.98rem;
    }

    .tools-category-page .tools-hub-actions,
    .tools-category-hub .tools-hub-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
    }

    .tools-category-page .btn-primary,
    .tools-category-page .btn-secondary,
    .tools-category-hub .btn-primary,
    .tools-category-hub .btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 0 18px;
      border-radius: 999px;
      font-size: 0.95rem;
      font-weight: 800;
      transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
    }

    .tools-category-page .btn-primary,
    .tools-category-hub .btn-primary {
      background: var(--accent);
      color: #ffffff;
      box-shadow: 0 14px 32px rgba(10, 102, 194, 0.18);
    }

    .tools-category-page .btn-secondary,
    .tools-category-hub .btn-secondary {
      border: 1px solid var(--ls-line);
      background: #ffffff;
      color: var(--ls-ink);
    }

    .tools-category-page .btn-primary:hover,
    .tools-category-page .btn-secondary:hover,
    .tools-category-hub .btn-primary:hover,
    .tools-category-hub .btn-secondary:hover {
      transform: translateY(-1px);
    }

    .tools-category-page .tools-hub-pills,
    .tools-category-hub .tools-hub-pills,
    .ls-category-summary,
    .ls-subcategory-rail {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 18px;
    }

    .tools-category-page .tools-hub-pill,
    .tools-category-hub .tools-hub-pill,
    .ls-category-chip,
    .ls-subcategory-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0.45rem 0.92rem;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background: rgba(255, 255, 255, 0.94);
      color: #1e293b;
      font-size: 0.92rem;
      font-weight: 700;
    }

    .tools-category-page .tools-hub-pill i,
    .tools-category-hub .tools-hub-pill i {
      width: 8px;
      height: 8px;
      margin-right: 10px;
      border-radius: 999px;
      background: var(--accent);
      display: inline-block;
    }

    .tools-category-page .tools-hub-panel-badge,
    .tools-category-hub .tools-hub-panel-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--accent);
      font-size: 0.85rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .tools-category-page .tools-hub-panel-badge i,
    .tools-category-hub .tools-hub-panel-badge i {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--accent);
      display: inline-block;
    }

    .tools-category-page .tools-hub-panel-head,
    .tools-category-hub .tools-hub-panel-head {
      margin-top: 14px;
    }

    .tools-category-page .tools-hub-panel-head h2,
    .tools-category-hub .tools-hub-panel-head h2 {
      font-size: clamp(1.45rem, 2.6vw, 2rem);
      max-width: 15ch;
    }

    .tools-category-page .tools-hub-panel-head p,
    .tools-category-hub .tools-hub-panel-head p {
      margin: 12px 0 0;
      font-size: 0.98rem;
    }

    .tools-category-page .tools-hub-metrics,
    .tools-category-hub .tools-hub-metrics {
      display: grid;
      gap: 12px;
      grid-template-columns: 1fr;
      margin-top: 22px;
    }

    .tools-category-page .tools-hub-metric,
    .tools-category-hub .tools-hub-metric {
      padding: 16px;
      border-radius: var(--ls-radius-md);
      background: linear-gradient(180deg, rgba(234, 243, 255, 0.56), rgba(255, 255, 255, 0.92));
      border: 1px solid rgba(188, 215, 246, 0.88);
    }

    .tools-category-page .tools-hub-metric strong,
    .tools-category-hub .tools-hub-metric strong {
      display: block;
      color: var(--ls-ink);
      font-size: 1.4rem;
      line-height: 1;
      margin-bottom: 5px;
    }

    .tools-category-page .tools-hub-metric span,
    .tools-category-hub .tools-hub-metric span {
      color: var(--ls-muted);
      font-size: 0.94rem;
      line-height: 1.55;
    }

    .tools-category-page .tools-hub-links,
    .tools-category-hub .tools-hub-links {
      margin-top: 18px;
      display: grid;
      gap: 12px;
    }

    .tools-category-page .tools-hub-link,
    .tools-category-hub .tools-hub-link {
      padding-top: 12px;
      border-top: 1px solid rgba(219, 228, 239, 0.9);
      display: grid;
      gap: 4px;
    }

    .tools-category-page .tools-hub-link strong,
    .tools-category-hub .tools-hub-link strong,
    .tools-category-page .tools-hub-toolbar-meta strong,
    .tools-category-hub .tools-hub-toolbar-meta strong,
    .tools-category-page .tools-hub-empty strong,
    .tools-category-hub .tools-hub-empty strong,
    .ls-subcategory-head strong {
      color: var(--ls-ink);
    }

    .tools-category-page .page-section,
    .tools-category-hub .page-section,
    .tools-category-page .cta-section,
    .tools-category-hub .cta-section {
      padding: 28px 0 0;
    }

    .tools-category-page .section-header,
    .tools-category-hub .section-header {
      max-width: var(--ls-rail);
      margin: 0 auto 18px;
    }

    .tools-category-page .section-header p,
    .tools-category-hub .section-header p {
      margin: 10px 0 0;
      font-size: 1.02rem;
    }

    .tools-category-page .tools-hub-toolbar,
    .tools-category-hub .tools-hub-toolbar {
      display: grid;
      gap: 16px;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
      padding: 20px 22px;
      max-width: var(--ls-rail);
      margin-inline: auto;
      margin-bottom: 18px;
    }

    .tools-category-page .tools-hub-search-shell,
    .tools-category-hub .tools-hub-search-shell {
      display: grid;
      gap: 10px;
    }

    .tools-category-page .tools-hub-search-label,
    .tools-category-hub .tools-hub-search-label {
      color: var(--ls-ink);
      font-size: 0.95rem;
      font-weight: 800;
    }

    .tools-category-page .tools-hub-search-input,
    .tools-category-hub .tools-hub-search-input {
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr);
      align-items: center;
      min-height: 54px;
      padding: 0 16px;
      border: 1px solid var(--ls-line);
      border-radius: 999px;
      background: #ffffff;
    }

    .tools-category-page .tools-hub-search-input span,
    .tools-category-hub .tools-hub-search-input span {
      color: #94a3b8;
      font-weight: 800;
      font-size: 1rem;
    }

    .tools-category-page .tools-hub-search-input input,
    .tools-category-hub .tools-hub-search-input input {
      width: 100%;
      border: 0;
      outline: 0;
      padding: 0;
      background: transparent;
      color: var(--ls-ink);
      font: inherit;
    }

    .tools-category-page .tools-hub-search-input input::placeholder,
    .tools-category-hub .tools-hub-search-input input::placeholder {
      color: #94a3b8;
    }

    .tools-category-page .tools-hub-search-shell p,
    .tools-category-hub .tools-hub-search-shell p {
      margin: 0;
      font-size: 0.93rem;
    }

    .tools-category-page .tools-hub-toolbar-meta,
    .tools-category-hub .tools-hub-toolbar-meta {
      white-space: nowrap;
      font-size: 0.95rem;
    }

    .tools-category-page .tools-hub-empty,
    .tools-category-hub .tools-hub-empty {
      padding: 18px 22px;
      max-width: var(--ls-rail);
      margin-inline: auto;
    }

    .tools-category-page .tools-hub-empty p,
    .tools-category-hub .tools-hub-empty p {
      margin: 8px 0 0;
    }

    .tools-category-page .tools-library-grid,
    .tools-category-hub .tools-library-grid {
      display: grid;
      gap: 18px;
      grid-template-columns: 1fr;
      max-width: var(--ls-rail);
    }

    .tools-category-page .tools-library-card,
    .tools-category-hub .tools-library-card {
      position: relative;
      display: grid;
      gap: 12px;
      min-height: 100%;
      padding: 22px;
      border-radius: 20px;
      border: 1px solid var(--ls-line);
      background: #ffffff;
      box-shadow: 0 14px 36px rgba(15, 23, 42, 0.06);
      transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
    }

    .tools-category-page .tools-library-card::before,
    .tools-category-hub .tools-library-card::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 4px;
      border-radius: 20px 20px 0 0;
      background: linear-gradient(90deg, var(--accent), rgba(10, 102, 194, 0.3));
    }

    .tools-category-page .tools-library-card:hover,
    .tools-category-hub .tools-library-card:hover {
      transform: translateY(-3px);
      border-color: rgba(10, 102, 194, 0.22);
      box-shadow: 0 22px 48px rgba(15, 23, 42, 0.09);
    }

    .tools-category-page .tools-library-badge,
    .tools-category-hub .tools-library-badge {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      min-height: 30px;
      padding: 0.35rem 0.72rem;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      border: 1px solid var(--accent-line);
      font-size: 0.82rem;
      font-weight: 800;
      letter-spacing: 0.01em;
    }

    .tools-category-page .tools-library-card h3,
    .tools-category-hub .tools-library-card h3 {
      font-size: 1.28rem;
      max-width: 18ch;
    }

    .tools-category-page .tools-library-card p,
    .tools-category-hub .tools-library-card p {
      margin: 0;
      font-size: 0.97rem;
    }

    .tools-category-page .tools-library-tags,
    .tools-category-hub .tools-library-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tools-category-page .tools-library-tags span,
    .tools-category-hub .tools-library-tags span {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 0.28rem 0.7rem;
      border-radius: 999px;
      background: #f8fafc;
      border: 1px solid rgba(219, 228, 239, 0.95);
      color: #475569;
      font-size: 0.82rem;
      font-weight: 700;
    }

    .tools-category-page .tools-library-link,
    .tools-category-hub .tools-library-link {
      margin-top: auto;
      color: var(--accent);
      font-weight: 800;
      font-size: 0.94rem;
    }

    .ls-back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.1rem;
      color: var(--accent);
      font-size: 0.95rem;
      font-weight: 800;
    }

    .ls-back-link:hover,
    .ls-subcategory-chip:hover {
      text-decoration: underline;
    }

    .ls-subcategory-block {
      margin-top: 24px;
      padding: 24px;
      scroll-margin-top: 7rem;
    }

    .ls-subcategory-block:first-child {
      margin-top: 0;
    }

    .ls-subcategory-head {
      display: flex;
      justify-content: space-between;
      align-items: start;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 18px;
    }

    .ls-subcategory-head p {
      margin: 10px 0 0;
      max-width: 56ch;
    }

    .ls-count-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0.45rem 0.9rem;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      border: 1px solid var(--accent-line);
      font-size: 0.88rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .tools-category-page .cta-content,
    .tools-category-hub .cta-content {
      display: grid;
      gap: 14px;
      padding: 28px 30px;
      max-width: var(--ls-rail);
      margin-top: 24px;
      margin-inline: auto;
      text-align: left;
    }

    .ls-subcategory-rail,
    .ls-category-shell,
    .ls-category-summary {
      max-width: var(--ls-rail);
      margin-left: auto;
      margin-right: auto;
    }

    .tools-category-page .cta-content h2,
    .tools-category-hub .cta-content h2 {
      max-width: 16ch;
    }

    .tools-category-page .cta-content p,
    .tools-category-hub .cta-content p {
      margin: 0;
      max-width: 72ch;
    }

    .footer {
      margin-top: 36px;
      border-top: 1px solid var(--ls-line);
      background: rgba(255, 255, 255, 0.92);
    }

    .footer .container {
      padding: 22px 0 30px;
    }

    .footer-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      flex-wrap: wrap;
    }

    .footer-bottom {
      margin-top: 14px;
      color: var(--ls-muted);
      font-size: 0.92rem;
    }

    .footer-bottom p {
      margin: 0;
    }

    .scroll-top-btn {
      position: fixed;
      right: 22px;
      bottom: 22px;
      width: 48px;
      height: 48px;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      color: #ffffff;
      box-shadow: 0 16px 34px rgba(15, 23, 42, 0.2);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity 180ms ease, transform 180ms ease;
      transform: translateY(10px);
    }

    .scroll-top-btn.is-visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    .ls-hidden {
      display: none !important;
    }

    .tools-hub-empty.ls-visible {
      display: block !important;
    }

    #category-grid,
    #category-tools {
      scroll-margin-top: 7rem;
    }

    .is-blue { --accent: #0a66c2; --accent-soft: #eaf3ff; --accent-line: #bcd7f6; }
    .is-gold { --accent: #a16207; --accent-soft: #fff7db; --accent-line: #f2d388; }
    .is-coral { --accent: #c2410c; --accent-soft: #fff0e7; --accent-line: #fdba8c; }
    .is-slate { --accent: #475569; --accent-soft: #f1f5f9; --accent-line: #cbd5e1; }
    .is-emerald { --accent: #047857; --accent-soft: #e9fbf4; --accent-line: #9adfc5; }
    .is-indigo { --accent: #4338ca; --accent-soft: #eef1ff; --accent-line: #c7d2fe; }
    .is-terra { --accent: #9a3412; --accent-soft: #fff3ee; --accent-line: #fdba8c; }
    .is-teal { --accent: #0f766e; --accent-soft: #ebfffb; --accent-line: #99f6e4; }
    .is-navy { --accent: #1d4ed8; --accent-soft: #eff6ff; --accent-line: #bfdbfe; }
    .is-amber { --accent: #b45309; --accent-soft: #fff7ed; --accent-line: #fcd7aa; }
    .is-sky { --accent: #0369a1; --accent-soft: #eff8ff; --accent-line: #bae6fd; }
    .is-violet { --accent: #6d28d9; --accent-soft: #f5f3ff; --accent-line: #ddd6fe; }
    .is-rose { --accent: #be123c; --accent-soft: #fff1f5; --accent-line: #fecdd3; }

    @media (max-width: 980px) {
      .nav-links {
        display: none;
      }

      .hamburger {
        display: inline-flex;
      }

      .tools-category-page .tools-hub-hero-grid,
      .tools-category-hub .tools-hub-hero-grid,
      .tools-category-page .tools-hub-toolbar,
      .tools-category-hub .tools-hub-toolbar {
        grid-template-columns: 1fr;
      }

      .tools-category-page .tools-hub-toolbar-meta,
      .tools-category-hub .tools-hub-toolbar-meta {
        white-space: normal;
      }

      .ls-subcategory-head {
        align-items: start;
        flex-direction: column;
      }
    }

    @media (max-width: 767px) {
      .tools-category-page main,
      .tools-category-hub main {
        padding: 16px 0 72px;
      }

      .nav-inner {
        min-height: 68px;
      }

      .nav-logo img {
        width: 172px;
      }

      .tools-category-page .tools-hub-copy,
      .tools-category-page .tools-hub-panel,
      .tools-category-hub .tools-hub-copy,
      .tools-category-hub .tools-hub-panel,
      .tools-category-page .tools-hub-toolbar,
      .tools-category-hub .tools-hub-toolbar,
      .tools-category-page .ls-subcategory-block,
      .tools-category-hub .ls-subcategory-block,
      .tools-category-page .cta-content,
      .tools-category-hub .cta-content {
        padding: 22px 18px;
        border-radius: 20px;
      }

      .tools-category-page .tools-hub-metrics,
      .tools-category-hub .tools-hub-metrics,
      .tools-category-page .tools-library-grid,
      .tools-category-hub .tools-library-grid {
        grid-template-columns: 1fr;
      }

      .tools-category-page h1,
      .tools-category-hub h1 {
        max-width: 11ch;
      }

      .footer-inner,
      .footer-links {
        align-items: start;
        flex-direction: column;
      }

      .scroll-top-btn {
        right: 16px;
        bottom: 16px;
      }
    }
  </style>
  `;
}

function getNav() {
  return `
  <nav class="nav nav-dark" id="nav" aria-label="Main navigation">
    <div class="nav-inner">
      <a href="${SITE_URL}/" class="nav-logo">
        <img src="${LOGO_URL}" alt="Ledger Summit logo" width="212" height="36">
      </a>
      <ul class="nav-links">
        <li><a href="${SITE_URL}/services/">Services</a></li>
        <li><a href="${SITE_URL}/tools/">Tools</a></li>
        <li><a href="${SITE_URL}/blog/">Blog</a></li>
        <li><a href="${SITE_URL}/about/">About</a></li>
        <li><a href="${SITE_URL}/contact/">Contact</a></li>
      </ul>
      <button class="hamburger" id="hamburger" aria-label="Toggle menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>

  <div class="mobile-nav" id="mobileNav" aria-hidden="true">
    <a href="${SITE_URL}/services/" onclick="closeMobileNav()">Services</a>
    <a href="${SITE_URL}/tools/" onclick="closeMobileNav()">Tools</a>
    <a href="${SITE_URL}/blog/" onclick="closeMobileNav()">Blog</a>
    <a href="${SITE_URL}/about/" onclick="closeMobileNav()">About</a>
    <a href="${SITE_URL}/contact/" onclick="closeMobileNav()">Contact</a>
    <a href="${SITE_URL}/book-a-call/" class="btn-primary" onclick="closeMobileNav()">Book a free call</a>
  </div>
  `;
}

function getFooter() {
  return `
  <footer class="footer">
    <div class="container">
      <div class="footer-inner">
        <a href="${SITE_URL}/" class="footer-brand">
          <img src="${LOGO_URL}" alt="Ledger Summit" width="176" height="30">
        </a>
        <ul class="footer-links">
          <li><a href="${SITE_URL}/services/">Services</a></li>
          <li><a href="${SITE_URL}/tools/">Tools</a></li>
          <li><a href="${SITE_URL}/blog/">Blog</a></li>
          <li><a href="${SITE_URL}/about/">About</a></li>
          <li><a href="${SITE_URL}/contact/">Contact</a></li>
          <li><a href="${SITE_URL}/book-a-call/">Book a Call</a></li>
        </ul>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 Ledger Summit. AI-powered accounting and finance automation.</p>
      </div>
    </div>
  </footer>

  <button id="scrollTopBtn" class="scroll-top-btn" aria-label="Scroll to top" title="Back to top">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  </button>
  `;
}

function pageShell({ title, description, canonical, bodyClass, schema, content, inlineScript = "" }) {
  const schemaTags = Array.isArray(schema)
    ? schema
        .map(
          (item) =>
            `<script type="application/ld+json">\n${JSON.stringify(item, null, 2)}\n</script>`,
        )
        .join("\n")
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${LOGO_URL}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${LOGO_URL}">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_URL}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
  ${getCustomStyles().trim()}
  ${schemaTags}
</head>
<body class="${escapeHtml(bodyClass)}">
  <a href="#main" class="skip-link">Skip to main content</a>
  ${getNav().trim()}
  <main id="main">
    ${content.trim()}
  </main>
  ${getFooter().trim()}
  ${getShellScript().trim()}
  ${inlineScript.trim()}
</body>
</html>
`;
}

function getShellScript() {
  return `
  <script>
    (() => {
      const hamburger = document.getElementById("hamburger");
      const mobileNav = document.getElementById("mobileNav");
      const scrollTopBtn = document.getElementById("scrollTopBtn");

      const closeMobileNav = () => {
        if (!hamburger || !mobileNav) return;
        hamburger.setAttribute("aria-expanded", "false");
        mobileNav.classList.remove("is-open");
        mobileNav.setAttribute("aria-hidden", "true");
      };

      const openMobileNav = () => {
        if (!hamburger || !mobileNav) return;
        hamburger.setAttribute("aria-expanded", "true");
        mobileNav.classList.add("is-open");
        mobileNav.setAttribute("aria-hidden", "false");
      };

      window.closeMobileNav = closeMobileNav;

      if (hamburger && mobileNav) {
        hamburger.addEventListener("click", () => {
          const isOpen = hamburger.getAttribute("aria-expanded") === "true";
          if (isOpen) {
            closeMobileNav();
          } else {
            openMobileNav();
          }
        });

        window.addEventListener("resize", () => {
          if (window.innerWidth > 980) closeMobileNav();
        });
      }

      if (scrollTopBtn) {
        const updateScrollTop = () => {
          scrollTopBtn.classList.toggle("is-visible", window.scrollY > 260);
        };

        scrollTopBtn.addEventListener("click", () => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        });

        window.addEventListener("scroll", updateScrollTop, { passive: true });
        updateScrollTop();
      }
    })();
  </script>
  `;
}

function getHubSearchScript(categoryCount) {
  return `
  <script>
    (() => {
      const input = document.querySelector("[data-category-search]");
      const cards = [...document.querySelectorAll("[data-category-card]")];
      const empty = document.querySelector("[data-category-empty]");
      const status = document.querySelector("[data-category-status]");
      if (!input || !cards.length || !empty || !status) return;

      const update = () => {
        const term = input.value.trim().toLowerCase();
        let visible = 0;

        for (const card of cards) {
          const haystack = (card.getAttribute("data-search") || "").toLowerCase();
          const match = !term || haystack.includes(term);
          card.classList.toggle("ls-hidden", !match);
          if (match) visible += 1;
        }

        empty.classList.toggle("ls-hidden", visible !== 0);
        status.textContent = term
          ? "Showing " + visible + " matching categories."
          : "Showing all " + ${categoryCount} + " categories.";
      };

      input.addEventListener("input", update);
      update();
    })();
  </script>
  `;
}

function getCategorySearchScript(totalTools) {
  return `
  <script>
    (() => {
      const input = document.querySelector("[data-tool-search]");
      const cards = [...document.querySelectorAll("[data-tool-card]")];
      const groups = [...document.querySelectorAll("[data-subcategory-group]")];
      const empty = document.querySelector("[data-tool-empty]");
      const status = document.querySelector("[data-tool-status]");
      if (!input || !cards.length || !groups.length || !empty || !status) return;

      const update = () => {
        const term = input.value.trim().toLowerCase();
        let visibleCards = 0;

        for (const card of cards) {
          const haystack = (card.getAttribute("data-search") || "").toLowerCase();
          const match = !term || haystack.includes(term);
          card.classList.toggle("ls-hidden", !match);
          if (match) visibleCards += 1;
        }

        for (const group of groups) {
          const hasVisible = !!group.querySelector("[data-tool-card]:not(.ls-hidden)");
          group.classList.toggle("ls-hidden", !hasVisible);
        }

        empty.classList.toggle("ls-hidden", visibleCards !== 0);
        status.textContent = term
          ? "Showing " + visibleCards + " matching tools."
          : "Showing all " + ${totalTools} + " tools in this category.";
      };

      input.addEventListener("input", update);
      update();
    })();
  </script>
  `;
}

function buildHubPage(categories) {
  const categoryCards = categories
    .map((category) => {
      const searchValue = [
        category.name,
        category.meta.summary,
        ...category.meta.keywords,
        ...category.subcategories.map((item) => item.name),
      ].join(" ");
      return `
      <a
        href="${HUB_PATH}${category.meta.slug}/"
        class="tools-library-card ${category.meta.color} reveal"
        data-category-card
        data-search="${escapeHtml(searchValue)}"
      >
        <span class="tools-library-badge">${category.tools.length} tools</span>
        <h3>${escapeHtml(category.name)}</h3>
        <p>${escapeHtml(category.meta.summary)}</p>
        <div class="tools-library-tags">
          ${category.subcategories
            .slice(0, 3)
            .map((sub) => `<span>${escapeHtml(sub.name)}</span>`)
            .join("")}
        </div>
        <span class="tools-library-link">Open category page &rarr;</span>
      </a>
      `;
    })
    .join("\n");

  const description =
    "Browse 20 Ledger Summit tool categories in a cleaner category-first catalogue. Each category opens its own page with individual tools, brief descriptions, and direct links.";

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Ledger Summit Tool Categories",
      description,
      url: HUB_URL,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Tool Categories",
          item: HUB_URL,
        },
      ],
    },
  ];

  return pageShell({
    title: "Tool Categories | Ledger Summit",
    description,
    canonical: HUB_URL,
    bodyClass: "tools-hub-page tools-category-hub",
    schema,
    content: `
      <section class="tools-hub-hero">
        <div class="container">
          <div class="tools-hub-hero-grid">
            <div class="tools-hub-copy reveal">
              <span class="section-label">Category-First Catalogue</span>
              <h1>Browse Ledger Summit tools by category.</h1>
              <p>This route keeps the existing <a href="${SITE_URL}/tools/">tools hub</a> untouched and gives users a cleaner starting point: choose a workflow category first, then open a focused page with individual tools and short descriptions.</p>
              <div class="tools-hub-answer-strip">
                <strong>Direct answer</strong>
                <span>Choose the workflow first. Each category page then lists only the tools in that category, which makes the path shorter, clearer, and easier to scan.</span>
              </div>
              <div class="tools-hub-actions">
                <a href="#category-grid" class="btn-primary btn-glow">Browse categories</a>
                <a href="${SITE_URL}/tools/" class="btn-secondary">Keep existing tools hub</a>
              </div>
              <div class="tools-hub-pills">
                <span class="tools-hub-pill"><i></i>200 tools mapped</span>
                <span class="tools-hub-pill"><i></i>20 category pages</span>
                <span class="tools-hub-pill"><i></i>Same Ledger Summit UI system</span>
              </div>
            </div>
            <aside class="tools-hub-panel reveal-right">
              <span class="tools-hub-panel-badge"><i></i>Category-first</span>
              <div class="tools-hub-panel-head">
                <h2>One clean step into a category, then into the right tool.</h2>
                <p>Instead of putting every tool on one long page, this route follows how users already think about finance work: start with the workflow, then choose the exact tool.</p>
              </div>
              <div class="tools-hub-metrics">
                <div class="tools-hub-metric">
                  <strong>20</strong>
                  <span>top-level categories from your supplied mapping</span>
                </div>
                <div class="tools-hub-metric">
                  <strong>200</strong>
                  <span>individual tools linked out to their Ledger Summit pages</span>
                </div>
                <div class="tools-hub-metric">
                  <strong>Focused</strong>
                  <span>category pages keep users inside one workflow at a time</span>
                </div>
                <div class="tools-hub-metric">
                  <strong>Consistent</strong>
                  <span>shared Ledger Summit nav, footer, card system, and CTA pattern</span>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section class="page-section bg-light" id="category-grid">
        <div class="container">
          <div class="section-header" style="margin-top:0;">
            <span class="section-label">All Categories</span>
            <h2>Choose the workflow first</h2>
            <p>The category grid below lists only top-level categories. Open one to see the tools in that workflow, grouped by sub-category and linked individually.</p>
          </div>

          <div class="tools-hub-toolbar reveal">
            <div class="tools-hub-search-shell">
              <label class="tools-hub-search-label" for="categorySearch">Find a category fast</label>
              <div class="tools-hub-search-input">
                <span aria-hidden="true">/</span>
                <input id="categorySearch" type="search" name="category-search" autocomplete="off" spellcheck="false" placeholder="Search by workflow, platform, or use case..." data-category-search>
              </div>
              <p>Search by terms like payroll, tax, construction, startup, reconciliation, or nonprofit.</p>
            </div>
            <div class="tools-hub-toolbar-meta">
              <strong data-category-status>Showing all ${categories.length} categories.</strong>
            </div>
          </div>

          <div class="tools-hub-empty ls-hidden" data-category-empty>
            <strong>No matching categories</strong>
            <p>Try a broader search term like payroll, tax, construction, startup, or reconciliation.</p>
          </div>

          <div class="tools-library-grid" style="margin-top:1.6rem;">
            ${categoryCards}
          </div>
        </div>
      </section>

      <section class="cta-section">
        <div class="container">
          <div class="cta-content">
            <h2>Need a library shaped around your own workflow?</h2>
            <p>Ledger Summit can keep the public catalogue lightweight while shaping internal tools, approvals, and review logic around the way your team actually closes the books.</p>
            <a href="${SITE_URL}/book-a-call/" class="btn-primary btn-glow">Book a free call</a>
          </div>
        </div>
      </section>
    `,
    inlineScript: getHubSearchScript(categories.length),
  });
}

function buildCategoryPage(category) {
  const subcategoryLinks = category.subcategories
    .map(
      (sub) =>
        `<a class="ls-subcategory-chip" href="#${escapeHtml(sub.slug)}">${escapeHtml(sub.name)} (${sub.tools.length})</a>`,
    )
    .join("");

  const subcategorySections = category.subcategories
    .map((sub) => {
      const toolCards = sub.tools
        .map((tool) => {
          const searchValue = [tool.name, tool.subcategory, tool.category, tool.description].join(" ");
          return `
          <a
            href="${escapeHtml(tool.url)}"
            class="tools-library-card ${category.meta.color} reveal"
            data-tool-card
            data-search="${escapeHtml(searchValue)}"
          >
            <span class="tools-library-badge">${escapeHtml(tool.subcategory)}</span>
            <h3>${escapeHtml(tool.name)}</h3>
            <p>${escapeHtml(tool.description)}</p>
            <span class="tools-library-link">Open the tool &rarr;</span>
          </a>
          `;
        })
        .join("\n");

      return `
      <section class="ls-subcategory-block" id="${escapeHtml(sub.slug)}" data-subcategory-group>
        <div class="ls-subcategory-head">
          <div>
            <span class="section-label">${escapeHtml(category.name)}</span>
            <h2>${escapeHtml(sub.name)}</h2>
            <p>${escapeHtml(toTitleCase(sub.name))} tools inside ${escapeHtml(
              category.name.toLowerCase(),
            )}.</p>
          </div>
          <span class="ls-count-pill">${sub.tools.length} tools</span>
        </div>
        <div class="tools-library-grid">
          ${toolCards}
        </div>
      </section>
      `;
    })
    .join("\n");

  const pageUrl = `${HUB_URL}${category.meta.slug}/`;
  const description = `${category.meta.summary} Browse ${category.tools.length} tools across ${category.subcategories.length} sub-categories, each with a short description and direct Ledger Summit link.`;

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: category.name,
      description,
      url: pageUrl,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Tool Categories",
          item: HUB_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: category.name,
          item: pageUrl,
        },
      ],
    },
  ];

  return pageShell({
    title: `${category.name} | Ledger Summit Tool Categories`,
    description,
    canonical: pageUrl,
    bodyClass: `tools-hub-page tools-category-page ${category.meta.color}`,
    schema,
    content: `
      <section class="tools-hub-hero">
        <div class="container">
          <a class="ls-back-link" href="${HUB_PATH}">&larr; Back to all tool categories</a>
          <div class="tools-hub-hero-grid" style="margin-top:1.4rem;">
            <div class="tools-hub-copy reveal">
              <span class="section-label">${escapeHtml(category.meta.eyebrow)}</span>
              <h1>${escapeHtml(category.meta.title)}</h1>
              <p>${escapeHtml(category.meta.heroCopy)}</p>
              <div class="tools-hub-answer-strip">
                <strong>Direct answer</strong>
                <span>${escapeHtml(category.meta.summary)}</span>
              </div>
              <div class="tools-hub-actions">
                <a href="#category-tools" class="btn-primary btn-glow">Browse ${category.tools.length} tools</a>
                <a href="${SITE_URL}/book-a-call/" class="btn-secondary">Need a custom version?</a>
              </div>
              <div class="tools-hub-pills">
                <span class="tools-hub-pill"><i></i>${category.tools.length} tools</span>
                <span class="tools-hub-pill"><i></i>${category.subcategories.length} sub-categories</span>
                <span class="tools-hub-pill"><i></i>Direct links to live tool pages</span>
              </div>
            </div>
            <aside class="tools-hub-panel reveal-right">
              <span class="tools-hub-panel-badge"><i></i>Focused browse</span>
              <div class="tools-hub-panel-head">
                <h2>Stay inside one workflow instead of scanning the whole library.</h2>
                <p>Everything below is grouped by sub-category so users can move from a workflow concept to the exact tool page in fewer clicks.</p>
              </div>
              <div class="tools-hub-metrics">
                <div class="tools-hub-metric">
                  <strong>${category.tools.length}</strong>
                  <span>linked tools in this category</span>
                </div>
                <div class="tools-hub-metric">
                  <strong>${category.subcategories.length}</strong>
                  <span>sub-categories to keep the browse path organized</span>
                </div>
                <div class="tools-hub-metric">
                  <strong>Short</strong>
                  <span>brief descriptions on every tool card before the click</span>
                </div>
                <div class="tools-hub-metric">
                  <strong>Same UI</strong>
                  <span>shared Ledger Summit layout, cards, nav, footer, and CTA</span>
                </div>
              </div>
              <div class="tools-hub-links">
                <div class="tools-hub-link"><strong>Grouped by sub-category</strong><span>Users can jump into the exact workflow slice they recognize.</span></div>
                <div class="tools-hub-link"><strong>Direct tool access</strong><span>Every card opens the live Ledger Summit tool page immediately.</span></div>
                <div class="tools-hub-link"><strong>Consistent browse pattern</strong><span>Hero, card layout, search shell, and CTA rhythm match the rest of the tools library.</span></div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section class="page-section bg-light" id="category-tools">
        <div class="container">
          <div class="section-header" style="margin-top:0;">
            <span class="section-label">Category Tools</span>
            <h2>${escapeHtml(category.name)}</h2>
            <p>${escapeHtml(category.meta.summary)}</p>
          </div>

          <div class="ls-subcategory-rail">
            ${subcategoryLinks}
          </div>

          <div class="tools-hub-toolbar reveal">
            <div class="tools-hub-search-shell">
              <label class="tools-hub-search-label" for="toolSearch-${escapeHtml(category.meta.slug)}">Search inside this category</label>
              <div class="tools-hub-search-input">
                <span aria-hidden="true">/</span>
                <input id="toolSearch-${escapeHtml(
                  category.meta.slug,
                )}" type="search" name="tool-search-${escapeHtml(
                  category.meta.slug,
                )}" autocomplete="off" spellcheck="false" placeholder="Search by tool name, sub-category, or use case..." data-tool-search>
              </div>
              <p>Search by tool name, sub-category, or use case to narrow this workflow quickly.</p>
            </div>
            <div class="tools-hub-toolbar-meta">
              <strong data-tool-status>Showing all ${category.tools.length} tools in this category.</strong>
            </div>
          </div>

          <div class="tools-hub-empty ls-hidden" data-tool-empty>
            <strong>No matching tools in this category</strong>
            <p>Try a broader term from the tool name or sub-category.</p>
          </div>

          <div class="ls-category-shell">
            ${subcategorySections}
          </div>
        </div>
      </section>

      <section class="cta-section">
        <div class="container">
          <div class="cta-content">
            <h2>Need this workflow turned into a custom internal tool?</h2>
            <p>Ledger Summit can take the public calculator or checker and shape it into a deeper internal workflow with your logic, approvals, exports, and operating rules.</p>
            <a href="${SITE_URL}/book-a-call/" class="btn-primary btn-glow">Book a free call</a>
          </div>
        </div>
      </section>
    `,
    inlineScript: getCategorySearchScript(category.tools.length),
  });
}

function ensureEmptyDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeFile(relativePath, content) {
  const fullPath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${content}\n`, "utf8");
}

function main() {
  const tools = parseTools().map((tool) => ({ ...tool, description: buildToolDescription(tool) }));

  const categories = Object.entries(
    tools.reduce((acc, tool) => {
      acc[tool.category] ??= [];
      acc[tool.category].push(tool);
      return acc;
    }, {}),
  )
    .map(([name, categoryTools]) => {
      const meta = CATEGORY_META[name];
      if (!meta) {
        throw new Error(`Missing category metadata for "${name}"`);
      }

      const subcategories = Object.entries(
        categoryTools.reduce((acc, tool) => {
          acc[tool.subcategory] ??= [];
          acc[tool.subcategory].push(tool);
          return acc;
        }, {}),
      )
        .map(([subcategoryName, subcategoryTools]) => ({
          name: subcategoryName,
          slug: slugify(subcategoryName),
          firstIndex: Math.min(...subcategoryTools.map((tool) => tool.index)),
          tools: subcategoryTools.sort((a, b) => a.index - b.index),
        }))
        .sort((a, b) => a.firstIndex - b.firstIndex);

      return {
        name,
        meta,
        firstIndex: Math.min(...categoryTools.map((tool) => tool.index)),
        tools: categoryTools.sort((a, b) => a.index - b.index),
        subcategories,
      };
    })
    .sort((a, b) => a.firstIndex - b.firstIndex);

  ensureEmptyDir(OUTPUT_ROOT);
  writeFile(path.join("tool-categories", "index.html"), buildHubPage(categories));
  writeFile(HUB_DEPLOY_FILE, buildHubPage(categories));

  for (const category of categories) {
    const deployFileName = `tool-categories-${category.meta.slug}.html`;
    writeFile(
      path.join("tool-categories", category.meta.slug, "index.html"),
      buildCategoryPage(category),
    );
    writeFile(deployFileName, buildCategoryPage(category));
  }

  console.log(
    `Generated ${categories.length + 1} pages for ${tools.length} tools across ${categories.length} categories.`,
  );
}

main();
