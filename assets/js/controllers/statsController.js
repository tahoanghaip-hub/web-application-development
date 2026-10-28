/**
 * NOVELSTUDIO - STATS CONTROLLER (statsController.js)
 * Điều phối trang Thống kê, khởi tạo và cập nhật màu sắc biểu đồ Chart.js
 * tự động phản hồi theo sự kiện themeChanged (Dark/Light Mode).
 */

import { getSummaryMetrics, getStatusPieConfig, getPriorityBarConfig } from '../services/statsService.js';
import { getCurrentTheme } from '../app.js';

let statusPieChartInstance = null;
let priorityBarChartInstance = null;

/**
 * Khởi tạo Controller Thống Kê
 */
export function initStatsController() {
  const metrics = getSummaryMetrics();
  renderCounters(metrics);
  renderCharts(metrics);
  setupThemeChangeListener();
}

/**
 * Hiển thị các con số thống kê lên các thẻ Counter Card
 * @param {object} metrics 
 */
function renderCounters(metrics) {
  const totalEl = document.getElementById('stat-total');
  const doneEl = document.getElementById('stat-done');
  const pendingEl = document.getElementById('stat-pending');
  const rateEl = document.getElementById('stat-rate');
  const chaptersEl = document.getElementById('stat-chapters');
  const versionsEl = document.getElementById('stat-versions');

  if (totalEl) totalEl.textContent = metrics.total;
  if (doneEl) doneEl.textContent = metrics.doneCount;
  if (pendingEl) pendingEl.textContent = metrics.pendingCount;
  if (rateEl) rateEl.textContent = `${metrics.completionRate}%`;
  if (chaptersEl) chaptersEl.textContent = metrics.totalChapters;
  if (versionsEl) versionsEl.textContent = metrics.totalVersions;
}

/**
 * Lấy cấu hình màu chữ và lưới theo Theme hiện tại
 * @param {'light'|'dark'} theme 
 * @returns {object} { textColor, gridColor }
 */
function getChartThemeColors(theme) {
  const isDark = theme === 'dark';
  return {
    textColor: isDark ? '#94a3b8' : '#475569',
    gridColor: isDark ? 'rgba(51, 65, 85, 0.6)' : 'rgba(148, 163, 184, 0.25)',
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipTitle: isDark ? '#f8fafc' : '#0f172a',
    tooltipBody: isDark ? '#94a3b8' : '#475569',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0'
  };
}

/**
 * Khởi tạo các biểu đồ Chart.js
 * @param {object} metrics 
 */
function renderCharts(metrics) {
  if (typeof window.Chart === 'undefined') {
    console.warn('[statsController] Chart.js chưa được tải.');
    return;
  }

  const currentTheme = getCurrentTheme();
  const colors = getChartThemeColors(currentTheme);

  // 1. Biểu đồ tròn: Trạng thái (Status Pie Chart)
  const pieCanvas = document.getElementById('statusPieChart');
  if (pieCanvas) {
    if (statusPieChartInstance) {
      statusPieChartInstance.destroy();
    }

    const pieData = getStatusPieConfig(metrics, currentTheme);

    statusPieChartInstance = new window.Chart(pieCanvas, {
      type: 'doughnut',
      data: pieData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: colors.textColor,
              font: {
                family: "'Plus Jakarta Sans', sans-serif",
                weight: '600',
                size: 13
              },
              padding: 16,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: colors.tooltipBg,
            titleColor: colors.tooltipTitle,
            bodyColor: colors.tooltipBody,
            borderColor: colors.tooltipBorder,
            borderWidth: 1,
            padding: 12,
            boxPadding: 6,
            usePointStyle: true
          }
        },
        cutout: '65%'
      }
    });
  }

  // 2. Biểu đồ cột: Mức ưu tiên (Priority Bar Chart)
  const barCanvas = document.getElementById('priorityBarChart');
  if (barCanvas) {
    if (priorityBarChartInstance) {
      priorityBarChartInstance.destroy();
    }

    const barData = getPriorityBarConfig(metrics, currentTheme);

    priorityBarChartInstance = new window.Chart(barCanvas, {
      type: 'bar',
      data: barData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: colors.tooltipBg,
            titleColor: colors.tooltipTitle,
            bodyColor: colors.tooltipBody,
            borderColor: colors.tooltipBorder,
            borderWidth: 1,
            padding: 12,
            boxPadding: 6
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: colors.textColor,
              font: {
                family: "'Plus Jakarta Sans', sans-serif",
                weight: '600'
              }
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: colors.textColor,
              font: {
                family: "'Plus Jakarta Sans', sans-serif"
              }
            },
            grid: {
              color: colors.gridColor
            }
          }
        }
      }
    });
  }
}

/**
 * Lắng nghe sự kiện đổi Theme toàn cục để cập nhật màu chữ/lưới Chart.js realtime
 */
function setupThemeChangeListener() {
  window.addEventListener('themeChanged', (event) => {
    const newTheme = (event.detail && event.detail.theme) || getCurrentTheme();
    const metrics = getSummaryMetrics();
    const colors = getChartThemeColors(newTheme);

    // Cập nhật Pie Chart
    if (statusPieChartInstance) {
      const updatedPieData = getStatusPieConfig(metrics, newTheme);
      statusPieChartInstance.data = updatedPieData;
      statusPieChartInstance.options.plugins.legend.labels.color = colors.textColor;
      statusPieChartInstance.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
      statusPieChartInstance.options.plugins.tooltip.titleColor = colors.tooltipTitle;
      statusPieChartInstance.options.plugins.tooltip.bodyColor = colors.tooltipBody;
      statusPieChartInstance.options.plugins.tooltip.borderColor = colors.tooltipBorder;
      statusPieChartInstance.update();
    }

    // Cập nhật Bar Chart
    if (priorityBarChartInstance) {
      const updatedBarData = getPriorityBarConfig(metrics, newTheme);
      priorityBarChartInstance.data = updatedBarData;
      priorityBarChartInstance.options.scales.x.ticks.color = colors.textColor;
      priorityBarChartInstance.options.scales.y.ticks.color = colors.textColor;
      priorityBarChartInstance.options.scales.y.grid.color = colors.gridColor;
      priorityBarChartInstance.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
      priorityBarChartInstance.options.plugins.tooltip.titleColor = colors.tooltipTitle;
      priorityBarChartInstance.options.plugins.tooltip.bodyColor = colors.tooltipBody;
      priorityBarChartInstance.options.plugins.tooltip.borderColor = colors.tooltipBorder;
      priorityBarChartInstance.update();
    }
  });
}

// Khởi tạo Controller khi DOM đã sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStatsController);
} else {
  initStatsController();
}
