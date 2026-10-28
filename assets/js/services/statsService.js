/**
 * NOVELSTUDIO - STATS & ANALYTICS SERVICE (statsService.js)
 * Tổng hợp số liệu thống kê tiến độ sáng tác, phân tích tỷ lệ hoàn thành,
 * và chuẩn bị dữ liệu cho biểu đồ Chart.js.
 */

import { getAllNovels } from './novelService.js';

/**
 * Tổng hợp toàn bộ chỉ số thống kê của dự án
 * @param {Array|null} inputNovels - Mảng tác phẩm truyền vào hoặc tự động lấy từ Storage
 * @returns {object} Bản báo cáo số liệu tổng hợp
 */
export function getSummaryMetrics(inputNovels = null) {
  const novels = Array.isArray(inputNovels) ? inputNovels : getAllNovels();

  const total = novels.length;
  let doneCount = 0;
  let pendingCount = 0;
  let lowCount = 0;
  let mediumCount = 0;
  let highCount = 0;
  let totalChapters = 0;
  let totalVersions = 0;

  novels.forEach((novel) => {
    // 1. Phân loại theo Trạng thái
    if (novel.status === 'Done') {
      doneCount++;
    } else {
      pendingCount++;
    }

    // 2. Phân loại theo Mức độ ưu tiên
    if (novel.priority === 'High') {
      highCount++;
    } else if (novel.priority === 'Low') {
      lowCount++;
    } else {
      mediumCount++;
    }

    // 3. Đếm số Chương và Phiên bản nháp (Nested Aggregation)
    if (Array.isArray(novel.chapters)) {
      totalChapters += novel.chapters.length;
      novel.chapters.forEach((chapter) => {
        if (Array.isArray(chapter.versions)) {
          totalVersions += chapter.versions.length;
        }
      });
    }
  });

  const completionRate = total > 0 ? Number(((doneCount / total) * 100).toFixed(1)) : 0;

  return {
    total,
    doneCount,
    pendingCount,
    completionRate,
    lowCount,
    mediumCount,
    highCount,
    totalChapters,
    totalVersions
  };
}

/**
 * Chuẩn bị cấu hình dữ liệu cho Biểu đồ Tròn (Pie Chart - Trạng thái)
 * @param {object} metrics - Kết quả từ getSummaryMetrics()
 * @param {'light'|'dark'} theme - Giao diện hiện tại
 * @returns {object} Cấu hình dữ liệu Chart.js
 */
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
