export function createMockProject12Month() {
  return {
    id: "test-project-12",
    name: "Test Project",
    fundedValue: 1200,
    contractValue: 1200,
    planning: {
      labor: [
        {
          id: "line-labor-1",
          rate: 1,
          monthly: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
        }
      ],
      subcontractors: [],
      equipment: [],
      materials: [],
      odc: []
    },
    actuals: {
      labor: [100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      subcontractors: Array(12).fill(0),
      equipment: Array(12).fill(0),
      materials: Array(12).fill(0),
      odc: Array(12).fill(0),
      revenue: Array(12).fill(0)
    },
    budget: {
      revenue: 1200,
      cost: 1200
    },
    priorForecast: {
      revenueEac: 1200,
      costEac: 1200
    }
  };
}
