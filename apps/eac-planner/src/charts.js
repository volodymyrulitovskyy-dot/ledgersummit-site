function moneyTick(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function percentTick(value) {
  return `${Number(value || 0).toFixed(0)}%`;
}

function actualsWindowPlugin(actualsThroughIndex) {
  return {
    id: "actualsWindow",
    beforeDatasetsDraw(chart) {
      if (!Number.isInteger(actualsThroughIndex) || actualsThroughIndex < 0) return;
      const { ctx, chartArea, scales } = chart;
      const x = scales.x;
      if (!x || !chartArea) return;

      const startX = chartArea.left;
      const endIndex = Math.min(actualsThroughIndex, chart.data.labels.length - 1);
      const endCenter = x.getPixelForValue(endIndex);
      const nextCenter = endIndex < chart.data.labels.length - 1 ? x.getPixelForValue(endIndex + 1) : chartArea.right;
      const endX = Math.min(chartArea.right, (endCenter + nextCenter) / 2);

      ctx.save();
      ctx.fillStyle = "rgba(148, 163, 184, 0.14)";
      ctx.fillRect(startX, chartArea.top, Math.max(endX - startX, 0), chartArea.bottom - chartArea.top);
      ctx.restore();
    }
  };
}

export function buildTrendChart(ctx, data) {
  const usesPercentAxis = (data.datasets || []).some((dataset) => dataset.yAxisID === "yPercent");
  const usesSecondaryAxis = (data.datasets || []).some((dataset) => dataset.yAxisID === "ySecondary");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: data.labels,
      datasets: data.datasets || [
        {
          label: "Revenue",
          data: data.revenue,
          borderColor: "#355c7d",
          backgroundColor: "rgba(53, 92, 125, 0.12)",
          borderWidth: 3,
          tension: 0.35,
          fill: false,
          pointRadius: 3
        },
        {
          label: "Cost",
          data: data.cost,
          borderColor: "#d97757",
          backgroundColor: "rgba(217, 119, 87, 0.12)",
          borderWidth: 3,
          tension: 0.35,
          fill: false,
          pointRadius: 3
        },
        {
          label: "Profit",
          data: data.profit,
          borderColor: "#1d6f6d",
          backgroundColor: "rgba(29, 111, 109, 0.2)",
          borderWidth: 2,
          borderDash: [6, 5],
          tension: 0.3,
          fill: false,
          pointRadius: 3
        }
      ]
    },
    plugins: [actualsWindowPlugin(data.actualsThroughIndex)],
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            padding: 18
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              const label = context.dataset.label ? `${context.dataset.label}: ` : "";
              const axisId = context.dataset.yAxisID || "y";
              if (axisId === "yPercent") {
                return `${label}${percentTick(context.raw)}`;
              }
              return `${label}${moneyTick(context.raw)}`;
            }
          }
        }
      },
      scales: {
        y: {
          stacked: Boolean(data.stacked),
          ...(Number.isFinite(data.yMin) ? { min: data.yMin } : {}),
          ...(Number.isFinite(data.yMax) ? { max: data.yMax } : {}),
          title: {
            display: Boolean(data.yAxisTitle),
            text: data.yAxisTitle || ""
          },
          ticks: {
            callback: data.yTickCallback || moneyTick
          },
          grid: {
            color: "rgba(148, 163, 184, 0.18)"
          }
        },
        ...(usesPercentAxis ? {
          yPercent: {
            position: "right",
            title: {
              display: Boolean(data.percentAxisTitle),
              text: data.percentAxisTitle || ""
            },
            ticks: {
              callback: percentTick
            },
            grid: {
              drawOnChartArea: false
            }
          }
        } : {}),
        ...(usesSecondaryAxis ? {
          ySecondary: {
            position: "right",
            ...(Number.isFinite(data.secondaryYMin) ? { min: data.secondaryYMin } : {}),
            ...(Number.isFinite(data.secondaryYMax) ? { max: data.secondaryYMax } : {}),
            title: {
              display: Boolean(data.secondaryYAxisTitle),
              text: data.secondaryYAxisTitle || ""
            },
            ticks: {
              callback: data.secondaryYTickCallback || data.yTickCallback || moneyTick
            },
            grid: {
              drawOnChartArea: false
            }
          }
        } : {}),
        x: {
          stacked: Boolean(data.stacked),
          title: {
            display: Boolean(data.xAxisTitle),
            text: data.xAxisTitle || ""
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

export function buildCostMixChart(ctx, data) {
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: data.datasets
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            padding: 18
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${moneyTick(context.raw)}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: Boolean(data.xAxisTitle),
            text: data.xAxisTitle || ""
          },
          ticks: {
            callback: moneyTick
          },
          grid: {
            color: "rgba(148, 163, 184, 0.18)"
          }
        },
        y: {
          title: {
            display: Boolean(data.yAxisTitle),
            text: data.yAxisTitle || ""
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

export function buildHealthChart(ctx, data) {
  return new Chart(ctx, {
    type: "radar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: "Current",
          data: data.current,
          borderColor: "#d97757",
          backgroundColor: "rgba(217, 119, 87, 0.22)",
          pointBackgroundColor: "#d97757",
          borderWidth: 2
        },
        {
          label: "Target",
          data: data.target,
          borderColor: "#1d6f6d",
          backgroundColor: "rgba(29, 111, 109, 0.12)",
          pointBackgroundColor: "#1d6f6d",
          borderWidth: 2
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        r: {
          suggestedMin: 0,
          suggestedMax: 100,
          angleLines: {
            color: "rgba(148, 163, 184, 0.2)"
          },
          grid: {
            color: "rgba(148, 163, 184, 0.2)"
          },
          pointLabels: {
            color: "#334155",
            font: {
              size: 12
            }
          },
          ticks: {
            backdropColor: "transparent",
            color: "#64748b"
          }
        }
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            padding: 18
          }
        }
      }
    }
  });
}
