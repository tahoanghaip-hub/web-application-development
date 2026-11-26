export function getStatusPieConfig(metrics, theme = 'light') {
  const isDark = theme === 'dark';
  return {
    labels: ['Hoàn thành (Done)', 'Đang sáng tác (Pending)'],
    datasets: [
      {
        data: [metrics.doneCount, metrics.pendingCount],
        backgroundColor: [
          isDark ? 'rgba(52, 211, 153, 0.85)' : 'rgba(16, 185, 129, 0.85)',
          isDark ? 'rgba(251, 191, 36, 0.85)' : 'rgba(245, 158, 11, 0.85)'
        ],
        borderColor: [
          isDark ? '#34d399' : '#10b981',
          isDark ? '#fbbf24' : '#f59e0b'
        ],
        borderWidth: 2,
        hoverOffset: 8
      }
    ]
  };
}

/**
 * Chuẩn bị cấu hình dữ liệu cho Biểu đồ Cột (Bar Chart - Mức ưu tiên)
 * @param {object} metrics - Kết quả từ getSummaryMetrics()
 * @param {'light'|'dark'} theme - Giao diện hiện tại
 * @returns {object} Cấu hình dữ liệu Chart.js
 */
export function getPriorityBarConfig(metrics, theme = 'light') {
  const isDark = theme === 'dark';
  return {
    labels: ['Thấp (Low)', 'Trung bình (Medium)', 'Cao (High)'],
    datasets: [
      {
        label: 'Số lượng tác phẩm',
        data: [metrics.lowCount, metrics.mediumCount, metrics.highCount],
        backgroundColor: [
          isDark ? 'rgba(56, 189, 248, 0.75)' : 'rgba(6, 182, 212, 0.75)',
          isDark ? 'rgba(251, 191, 36, 0.75)' : 'rgba(245, 158, 11, 0.75)',
          isDark ? 'rgba(248, 113, 113, 0.75)' : 'rgba(239, 68, 68, 0.75)'
        ],
        borderColor: [
          isDark ? '#38bdf8' : '#06b6d4',
          isDark ? '#fbbf24' : '#f59e0b',
          isDark ? '#f87171' : '#ef4444'
        ],
        borderWidth: 2,
        borderRadius: 8
      }
    ]
  };
}
