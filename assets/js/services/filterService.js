/**
 * NOVELSTUDIO - FILTER SERVICE (filterService.js)
 * Động cơ Lọc đa chiều & Sắp xếp tác phẩm
 */

/**
 * Áp dụng các tiêu chí lọc và sắp xếp cho danh sách tác phẩm
 * @param {Array} novels - Danh sách tác phẩm gốc
 * @param {object} criteria - { keyword, status, priority, sortBy }
 * @returns {Array} Danh sách tác phẩm sau khi lọc và sắp xếp
 */
export function applyFilters(novels, criteria = {}) {
  if (!Array.isArray(novels)) return [];

  const {
    keyword = '',
    status = 'All',
    priority = 'All',
    sortBy = 'created-desc'
  } = criteria;

  let result = [...novels];

  // 1. Lọc theo từ khóa (Tiêu đề hoặc Mô tả)
  if (keyword && keyword.trim()) {
    const kw = keyword.toLowerCase().trim();
    result = result.filter((novel) => {
      const titleMatch = (novel.title || '').toLowerCase().includes(kw);
      const descMatch = (novel.description || '').toLowerCase().includes(kw);
      return titleMatch || descMatch;
    });
  }

  // 2. Lọc theo Trạng thái (All / Pending / Done)
  if (status && status !== 'All') {
    result = result.filter((novel) => novel.status === status);
  }

  // 3. Lọc theo Mức độ ưu tiên (All / Low / Medium / High)
  if (priority && priority !== 'All') {
    result = result.filter((novel) => novel.priority === priority);
  }

  // 4. Sắp xếp
  result.sort((a, b) => {
    switch (sortBy) {
      case 'deadline-asc': {
        const dateA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const dateB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return dateA - dateB;
      }
      case 'deadline-desc': {
        const dateA = a.deadline ? new Date(a.deadline).getTime() : -Infinity;
        const dateB = b.deadline ? new Date(b.deadline).getTime() : -Infinity;
        return dateB - dateA;
      }
      case 'title-asc': {
        return (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base' });
      }
      case 'created-desc':
      default: {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      }
    }
  });

  return result;
}

