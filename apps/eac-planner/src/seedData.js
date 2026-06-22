export const DEFAULT_PLANNING_YEAR = 2026;

const monthLabels = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function hours(...values) {
  return values;
}

function amounts(...values) {
  return values;
}

export function createEmptyProjectState(projectId = "proj-new") {
  return {
    id: projectId,
    name: "Untitled Project",
    client: "Unassigned Customer",
    manager: "",
    contractType: "TIME_AND_MATERIALS",
    contractValue: 0,
    fundedValue: 0,
    sourceContractValue: 0,
    sourceFundedValue: 0,
    commercialModificationValue: 0,
    effectiveContractValue: 0,
    effectiveFundedValue: 0,
    feePct: 0,
    startDate: "",
    endDate: "",
    version: "Working Forecast",
    lastSyncAt: null,
    syncStatus: "Not Started",
    priorForecast: {
      revenueEac: 0,
      costEac: 0,
      profitEac: 0
    },
    budget: {
      revenue: 0,
      cost: 0
    },
    reviewSignals: {
      openRisks: 0,
      pendingChanges: 0,
      missingActualMappings: 0
    },
    benchmarks: {
      revenue: 0,
      cost: 0,
      marginPct: 0
    },
    planning: {
      labor: [],
      subcontractors: [],
      equipment: [],
      materials: [],
      odc: []
    },
    actuals: {
      labor: Array(12).fill(0),
      subcontractors: Array(12).fill(0),
      equipment: Array(12).fill(0),
      materials: Array(12).fill(0),
      odc: Array(12).fill(0),
      totalCost: Array(12).fill(0),
      revenue: Array(12).fill(0)
    },
    quickbooksMappings: []
  };
}

export const defaultState = {
  selectedProjectId: "proj-apex",
  selectedYear: DEFAULT_PLANNING_YEAR,
  selectedForecastVersionId: "fv-apex-039",
  masterData: {
    organizations: [
      { id: "org-east", name: "East Region" },
      { id: "org-central", name: "Central Region" }
    ],
    departments: [
      { id: "dept-pm", organizationId: "org-east", name: "Project Management" },
      { id: "dept-eng", organizationId: "org-east", name: "Engineering" },
      { id: "dept-field", organizationId: "org-east", name: "Field Operations" },
      { id: "dept-controls", organizationId: "org-central", name: "Project Controls" }
    ],
    laborCategories: [
      { id: "lc-pm", name: "Project Manager" },
      { id: "lc-eng", name: "Controls Engineer" },
      { id: "lc-tech", name: "Field Technician" },
      { id: "lc-pc", name: "Project Controls" },
      { id: "lc-des", name: "Design Engineer" }
    ],
    employees: [
      { id: "emp-olivia", name: "Olivia Chen", organizationId: "org-east", departmentId: "dept-pm", laborCategoryId: "lc-pm", rate: 145 },
      { id: "emp-marcus", name: "Marcus Hill", organizationId: "org-east", departmentId: "dept-eng", laborCategoryId: "lc-eng", rate: 118 },
      { id: "emp-sofia", name: "Sofia Alvarez", organizationId: "org-east", departmentId: "dept-eng", laborCategoryId: "lc-eng", rate: 116 },
      { id: "emp-daniel", name: "Daniel Brooks", organizationId: "org-east", departmentId: "dept-field", laborCategoryId: "lc-tech", rate: 84 },
      { id: "emp-jamie", name: "Jamie Carter", organizationId: "org-east", departmentId: "dept-pm", laborCategoryId: "lc-pm", rate: 150 },
      { id: "emp-morgan", name: "Morgan Lee", organizationId: "org-central", departmentId: "dept-controls", laborCategoryId: "lc-pc", rate: 128 },
      { id: "emp-priya", name: "Priya Singh", organizationId: "org-central", departmentId: "dept-eng", laborCategoryId: "lc-des", rate: 132 }
    ],
    forecastVersions: [
      { id: "fv-apex-budget", projectId: "proj-apex", code: "BUD-2026", name: "Approved Budget", status: "Approved", actualsThrough: "2025-12" },
      { id: "fv-apex-039", projectId: "proj-apex", code: "FC-03+09", name: "Forecast 3+9", status: "Working", actualsThrough: "2026-03" },
      { id: "fv-apex-prev", projectId: "proj-apex", code: "FC-02+10", name: "Prior Forecast", status: "Approved", actualsThrough: "2026-02" },
      { id: "fv-harbor-budget", projectId: "proj-harbor", code: "BUD-2026", name: "Approved Budget", status: "Approved", actualsThrough: "2025-12" },
      { id: "fv-harbor-cur", projectId: "proj-harbor", code: "FC-03+09", name: "Forecast 3+9", status: "Working", actualsThrough: "2026-03" }
    ]
  },
  projects: [
    {
      id: "proj-apex",
      name: "Apex Controls Program",
      client: "North Ridge Infrastructure",
      manager: "Jamie Carter",
      contractType: "COST_PLUS",
      contractValue: 18400000,
      fundedValue: 17200000,
      feePct: 0.12,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      version: "Forecast 3+9",
      lastSyncAt: "2026-04-02T04:15:00-04:00",
      syncStatus: "Healthy",
      priorForecast: {
        revenueEac: 3605000,
        costEac: 3210000,
        profitEac: 395000
      },
      budget: {
        revenue: 3480000,
        cost: 3115000
      },
      reviewSignals: {
        openRisks: 182000,
        pendingChanges: 96000,
        missingActualMappings: 1
      },
      benchmarks: {
        revenue: 3550000,
        cost: 3150000,
        marginPct: 11.3
      },
      planning: {
        labor: [
          {
            id: "lab-1",
            employeeId: "emp-olivia",
            laborCategoryId: "lc-pm",
            organizationId: "org-east",
            departmentId: "dept-pm",
            rate: 145,
            monthly: hours(160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160)
          },
          {
            id: "lab-2",
            employeeId: "emp-marcus",
            laborCategoryId: "lc-eng",
            organizationId: "org-east",
            departmentId: "dept-eng",
            rate: 118,
            monthly: hours(168, 172, 176, 176, 180, 180, 180, 176, 172, 172, 168, 168)
          },
          {
            id: "lab-3",
            employeeId: "emp-sofia",
            laborCategoryId: "lc-eng",
            organizationId: "org-east",
            departmentId: "dept-eng",
            rate: 116,
            monthly: hours(164, 168, 172, 176, 176, 176, 176, 172, 168, 168, 164, 164)
          },
          {
            id: "lab-4",
            employeeId: "emp-daniel",
            laborCategoryId: "lc-tech",
            organizationId: "org-east",
            departmentId: "dept-field",
            rate: 84,
            monthly: hours(176, 176, 184, 192, 196, 200, 200, 196, 192, 188, 184, 180)
          }
        ],
        subcontractors: [
          {
            id: "sub-1",
            vendor: "Precision Installers",
            item: "Panel Installation Crew",
            monthly: amounts(82000, 82000, 90000, 92000, 98000, 104000, 108000, 108000, 104000, 98000, 92000, 90000)
          },
          {
            id: "sub-2",
            vendor: "Summit Commissioning",
            item: "Startup and Commissioning",
            monthly: amounts(45000, 38000, 42000, 48000, 52000, 56000, 62000, 68000, 72000, 74000, 70000, 66000)
          }
        ],
        equipment: [
          {
            id: "eq-1",
            item: "Lift Rental",
            unit: "day",
            rate: 420,
            monthly: hours(18, 18, 20, 22, 24, 25, 26, 26, 24, 22, 20, 20)
          },
          {
            id: "eq-2",
            item: "Testing Trailer",
            unit: "week",
            rate: 1850,
            monthly: hours(2, 2, 2, 3, 3, 3, 3, 3, 3, 2, 2, 2)
          }
        ],
        materials: [
          {
            id: "mat-1",
            item: "Control Panels",
            unit: "ea",
            rate: 14500,
            monthly: hours(2, 2, 2, 3, 3, 3, 3, 3, 2, 2, 2, 2)
          },
          {
            id: "mat-2",
            item: "Cable and Tray",
            unit: "lot",
            rate: 18000,
            monthly: hours(1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1)
          }
        ],
        odc: [
          {
            id: "odc-1",
            item: "Travel",
            monthly: amounts(12000, 11000, 13000, 14000, 14500, 15000, 15000, 14800, 14500, 13800, 13200, 12800)
          },
          {
            id: "odc-2",
            item: "Permits and Fees",
            monthly: amounts(9000, 6000, 11000, 12000, 12000, 13000, 13000, 13000, 12000, 11000, 9000, 9000)
          }
        ]
      },
      actuals: {
        labor: [62296, 63384, 65232, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        subcontractors: [125000, 118000, 132000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        equipment: [11260, 11260, 12190, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        materials: [47000, 47000, 47000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        odc: [20500, 17000, 24000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        revenue: [297309, 290830, 305783, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      },
      quickbooksMappings: [
        { source: "Customer: Apex Controls", target: "Project", status: "Mapped" },
        { source: "Class: Field Labor", target: "Labor", status: "Mapped" },
        { source: "Class: Subcontract", target: "Subcontractors", status: "Mapped" },
        { source: "Item: Job Material", target: "Materials", status: "Mapped" },
        { source: "Account: Misc Expense", target: "ODC", status: "Needs Review" }
      ]
    },
    {
      id: "proj-harbor",
      name: "Harbor Expansion Package",
      client: "CityWorks Authority",
      manager: "Morgan Lee",
      contractType: "FIXED_PRICE",
      contractValue: 12300000,
      fundedValue: 12300000,
      feePct: 0.08,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      version: "Approved Budget",
      lastSyncAt: "2026-04-02T03:40:00-04:00",
      syncStatus: "Attention",
      priorForecast: {
        revenueEac: 12300000,
        costEac: 2500000,
        profitEac: 9800000
      },
      budget: {
        revenue: 12300000,
        cost: 2440000
      },
      reviewSignals: {
        openRisks: 54000,
        pendingChanges: 135000,
        missingActualMappings: 1
      },
      benchmarks: {
        revenue: 12300000,
        cost: 2480000,
        marginPct: 79.8
      },
      planning: {
        labor: [
          {
            id: "hlab-1",
            employeeId: "emp-morgan",
            laborCategoryId: "lc-pc",
            organizationId: "org-central",
            departmentId: "dept-controls",
            rate: 128,
            monthly: hours(156, 156, 160, 160, 160, 160, 156, 156, 152, 152, 148, 148)
          },
          {
            id: "hlab-2",
            employeeId: "emp-priya",
            laborCategoryId: "lc-des",
            organizationId: "org-central",
            departmentId: "dept-eng",
            rate: 132,
            monthly: hours(168, 168, 172, 176, 176, 180, 180, 176, 172, 172, 168, 168)
          }
        ],
        subcontractors: [
          {
            id: "hsub-1",
            vendor: "Marine Fabricators",
            item: "Structural Steel Install",
            monthly: amounts(72000, 76000, 78000, 82000, 84000, 86000, 86000, 84000, 82000, 80000, 78000, 76000)
          }
        ],
        equipment: [
          {
            id: "heq-1",
            item: "Crawler Crane",
            unit: "day",
            rate: 1450,
            monthly: hours(10, 11, 11, 12, 12, 12, 12, 12, 11, 11, 10, 10)
          }
        ],
        materials: [
          {
            id: "hmat-1",
            item: "Marine Cabling",
            unit: "lot",
            rate: 22000,
            monthly: hours(1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1)
          }
        ],
        odc: [
          {
            id: "hodc-1",
            item: "Barges and Logistics",
            monthly: amounts(18000, 18000, 19000, 20000, 20000, 21000, 21000, 21000, 20500, 20000, 19000, 19000)
          }
        ]
      },
      actuals: {
        labor: [43008, 43008, 43968, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        subcontractors: [71000, 77000, 78500, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        equipment: [14500, 15950, 15950, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        materials: [22000, 22000, 22000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        odc: [18000, 18000, 19500, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        revenue: [1025000, 1025000, 1025000, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      },
      quickbooksMappings: [
        { source: "Customer: Harbor Expansion", target: "Project", status: "Mapped" },
        { source: "Class: Engineering", target: "Labor", status: "Mapped" },
        { source: "Item: Heavy Equipment", target: "Equipment", status: "Needs Review" }
      ]
    }
  ],
  importBatches: [
    { id: "imp-001", ranAt: "2026-04-02 04:15", source: "QuickBooks", status: "Success", rows: 1384 },
    { id: "imp-002", ranAt: "2026-04-01 04:15", source: "QuickBooks", status: "Success", rows: 1368 }
  ],
  resourceManagement: {
    plannedHires: [],
    plannedExits: [],
    openPositions: []
  },
  ui: {
    activeModule: "eac",
    activeTab: "overview",
    planSubtab: "summary",
    planHorizonStartYear: 2026,
    planHorizonEndYear: 2026,
    adminSetupStep: "project",
    askAiOpen: false,
    askAiDraft: "",
    askAiResponse: "",
    cardModes: {
      overviewCommercial: "visual",
      overviewForecast: "visual",
      financialCommercial: "visual",
      financialForecast: "visual"
    },
    resourceEditor: {
      kind: null,
      mode: "create",
      entityId: null
    }
  },
  meta: {
    months: monthLabels
  }
};
