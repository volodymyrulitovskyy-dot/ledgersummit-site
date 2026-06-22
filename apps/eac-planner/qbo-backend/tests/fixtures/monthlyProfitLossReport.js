export function createMonthlyProfitLossReportFixture() {
  return {
    Header: {
      ReportName: "ProfitAndLoss"
    },
    Columns: {
      Column: [
        { ColTitle: "" },
        { ColTitle: "Jan 2026" },
        { ColTitle: "Feb 2026" },
        { ColTitle: "Mar 2026" }
      ]
    },
    Rows: {
      Row: [
        {
          group: "Income",
          Summary: {
            ColData: [
              { value: "Income" },
              { value: "1000" },
              { value: "1200" },
              { value: "1100" }
            ]
          }
        },
        {
          group: "Expenses",
          Summary: {
            ColData: [
              { value: "Expenses" },
              { value: "-700" },
              { value: "-800" },
              { value: "-900" }
            ]
          }
        },
        {
          group: "NetIncome",
          Summary: {
            ColData: [
              { value: "Net Income" },
              { value: "300" },
              { value: "400" },
              { value: "200" }
            ]
          }
        }
      ]
    }
  };
}
