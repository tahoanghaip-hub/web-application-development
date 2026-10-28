/**
 * NOVELSTUDIO - FILTER & SEARCH SERVICE (filterService.js)
 * Cung cấp bộ máy truy vấn, lọc đa chiều và sắp xếp dữ liệu tiểu thuyết.
 */

/**
 * Áp dụng kết hợp các tiêu chí lọc và sắp xếp lên danh sách tác phẩm
 * @param {Array} novels - Mảng danh sách tác phẩm gốc
 * @param {object} criteria - { keyword, status, priority, sortBy }
 * @returns {Array} Mảng kết quả sau khi lọc và sắp xếp (không làm thay đổi mảng gốc)
 */
export function applyFilters(novels = [], criteria = {}) {
  if (!Array.isArray(novels)) return [];

  const {
    keyword = '',
    status = 'All',
    priority = 'All',
    sortBy = 'created-desc'
  } = criteria;

  // 1. Sao chép mảng nông để không làm biến đổi dữ liệu nguồn
  let result = [...novels];

  // 2. Lọc theo từ khóa (Keyword match in Title or Description)
  const cleanKeyword = (keyword || '').trim().toLowerCase();
  if (cleanKeyword.length > 0) {
    result = result.filter((novel) => {
      const titleMatch = (novel.title || '').toLowerCase().includes(cleanKeyword);
      const descMatch = (novel.description || '').toLowerCase().includes(cleanKeyword);
      return titleMatch || descMatch;
    });
  }

  // 3. Lọc theo Trạng thái (Status filter)
  if (status && status !== 'All') {
    result = result.filter((novel) => novel.status === status);
  }

  // 4. Lọc theo Mức độ ưu tiên (Priority filter)
  if (priority && priority !== 'All') {
    result = result.filter((novel) => novel.priority === priority);
  }

  // 5. Sắp xếp (Sorting Engine)
  result.sort((a, b) => {
    switch (sortBy) {
      case 'deadline-asc': {
        // Hạn chót gần nhất trước
        const dateA = new Date(a.deadline).getTime() || 0;
        const dateB = new Date(b.deadline).getTime() || 0;
        return dateA - dateB;
      }
      case 'deadline-desc': {
        // Hạn chót xa nhất trước
        const dateA = new Date(a.deadline).getTime() || 0;
        const dateB = new Date(b.deadline).getTime() || 0;
        return dateB - dateA;
      }
      case 'title-asc': {
        // Thứ tự bảng chữ cái A-Z
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        return titleA.localeCompare(titleB, 'vi');
      }
      case 'created-desc':
      default: {
        // Mới tạo nhất lên đầu
        const createdA = new Date(a.createdAt).getTime() || 0;
        const createdB = new Date(b.createdAt).getTime() || 0;
        return createdB - createdA;
      }
    }
  });

  return result;
}
