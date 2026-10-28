/**
 * NOVELSTUDIO - NOVEL SERVICE (novelService.js)
 * Tầng Nghiệp vụ quản lý Tác phẩm, Chương truyện, Lịch sử phiên bản nháp,
 * Khởi tạo dữ liệu mẫu (Seed Data) và Xuất/Nhập dữ liệu JSON.
 */

import { StorageAdapter } from '../core/StorageAdapter.js';

export const DATA_KEY = 'novelStudio_data';

/**
 * Danh sách dữ liệu mẫu chất lượng cao (Seed Data) phục vụ việc chấm điểm ngay lần đầu chạy
 */
const SEED_NOVELS = [
  {
    id: "novel_1710001",
    title: "Biên Niên Sử Vùng Đất Rồng (Aethelgard)",
    description: "Câu chuyện sử thi kỳ ảo về cuộc chiến tranh giành quyền lực giữa các gia tộc kỵ sĩ rồng cổ đại tại lục địa tuyết trắng Aethelgard.",
    deadline: "2026-12-31",
    priority: "High",
    status: "Pending",
    createdAt: "2026-10-25T08:30:00.000Z",
    chapters: [
      {
        chapterId: "chap_101",
        chapterTitle: "Chương 1: Bình minh trên thung lũng tuyết",
        status: "Published",
        versions: [
          {
            versionId: "ver_101_2",
            content: "Ánh dương rạng ngời chiếu xuyên qua rặng thông già của thung lũng Aethelgard. Kỵ sĩ trẻ Sean xiết chặt thanh kiếm thép gia bảo, lắng nghe tiếng gầm gừ xa xăm vọng lại từ đỉnh núi tuyết.",
            commitMessage: "Trau chuốt văn phong miêu tả và bổ sung lời thoại nội tâm nhân vật Sean",
            timestamp: "2026-10-26T14:20:00.000Z"
          },
          {
            versionId: "ver_101_1",
            content: "Ánh dương chiếu xuyên qua rừng thông. Sean cầm kiếm nhìn lên ngọn núi rồng.",
            commitMessage: "Bản phác thảo mở đầu chương 1",
            timestamp: "2026-10-25T09:00:00.000Z"
          }
        ]
      },
      {
        chapterId: "chap_102",
        chapterTitle: "Chương 2: Tiếng gọi từ hang sâu bí ẩn",
        status: "Draft",
        versions: [
          {
            versionId: "ver_102_1",
            content: "Bóng tối bao trùm vòm đá ẩm ướt. Từng giọt thạch nhũ rơi xuống tạo nên những thanh âm tí tách vang vọng giữa lòng đất.",
            commitMessage: "Bản nháp sơ khởi cảnh tiến vào hang cổ",
            timestamp: "2026-10-27T10:15:00.000Z"
          }
        ]
      }
    ]
  },
  {
    id: "novel_1710002",
    title: "Thám Tử Không Gian & Trạm Vũ Trụ Số 7",
    description: "Vụ án mạng bí ẩn xảy ra trong buồng kín tại trạm không gian quỹ đạo sao Hỏa. Thám tử Thomas chỉ có 48 giờ để vạch trần kẻ mạo danh trước khi oxy cạn kiệt.",
    deadline: "2026-11-20",
    priority: "Medium",
    status: "Done",
    createdAt: "2026-10-20T10:00:00.000Z",
    chapters: [
      {
        chapterId: "chap_201",
        chapterTitle: "Chương 1: Tiếng còi báo động lúc nửa đêm",
        status: "Published",
        versions: [
          {
            versionId: "ver_201_1",
            content: "02:14 AM giờ trạm. Còi báo động áp suất khoang B réo rắt liên hồi. Đèn khẩn cấp màu đỏ chớp tắt soi rõ vết rạn nứt trên lớp kính cường lực.",
            commitMessage: "Hoàn thiện cảnh mở màn gây cấn",
            timestamp: "2026-10-21T03:00:00.000Z"
          }
        ]
      }
    ]
  },
  {
    id: "novel_1710003",
    title: "Quán Trà Bên Góc Phố Mùa Thu",
    description: "Tản văn nhẹ nhàng ghi lại những mảnh ghép cuộc sống thường nhật, hương trà hoa cúc và những tâm sự của những vị khách ghé qua trong ngày mưa.",
    deadline: "2026-11-15",
    priority: "Low",
    status: "Pending",
    createdAt: "2026-10-22T15:45:00.000Z",
    chapters: [
      {
        chapterId: "chap_301",
        chapterTitle: "Chương 1: Vị chát đầu lưỡi và giọt mật ngọt ngào",
        status: "Draft",
        versions: [
          {
            versionId: "ver_301_1",
            content: "Nước sôi sủi tăm lăn tăn nơi miệng ấm gốm Bát Tràng. Mùi trà sớm hòa lẫn với hương đất ẩm sau cơn mưa rào đêm qua.",
            commitMessage: "Viết cảm nghĩ về hương vị trà mùa thu",
            timestamp: "2026-10-23T08:00:00.000Z"
          }
        ]
      }
    ]
  }
];

/**
 * Khởi tạo dữ liệu mẫu nếu localStorage chưa có
 * @returns {Array} Danh sách tiểu thuyết
 */
export function initSeedData() {
  const existingData = StorageAdapter.get(DATA_KEY, null);
  if (!existingData || !Array.isArray(existingData) || existingData.length === 0) {
    StorageAdapter.set(DATA_KEY, SEED_NOVELS);
    return SEED_NOVELS;
  }
  return existingData;
}

/**
 * Lấy toàn bộ danh sách tác phẩm
 * @returns {Array}
 */
export function getAllNovels() {
  const novels = StorageAdapter.get(DATA_KEY, null);
  if (!novels || !Array.isArray(novels)) {
    return initSeedData();
  }
  return novels;
}

/**
 * Lấy danh sách tác phẩm phục vụ trang chủ (trạng thái Done hoặc có chương Published)
 * @returns {Array}
 */
export function getPublishedNovels() {
  const novels = getAllNovels();
  return novels.filter((n) => {
    if (n.status === 'Done') return true;
    if (Array.isArray(n.chapters)) {
      return n.chapters.some((c) => c.status === 'Published');
    }
    return false;
  });
}

/**
 * Lấy thông tin một tác phẩm theo ID
 * @param {string} id 
 * @returns {object|null}
 */
export function getNovelById(id) {
  const novels = getAllNovels();
  return novels.find((n) => n.id === id) || null;
}

/**
 * Kiểm tra tính hợp lệ dữ liệu biểu mẫu tác phẩm
 * @param {object} data 
 * @returns {Record<string, string>} Danh sách lỗi theo từng trường
 */
export function validateNovelData(data) {
  const errors = {};

  // 1. Kiểm tra Tiêu đề
  const title = (data.title || '').trim();
  if (!title) {
    errors.title = 'Tiêu đề tác phẩm không được để trống.';
  } else if (title.length < 3) {
    errors.title = 'Tiêu đề tác phẩm phải có ít nhất 3 ký tự.';
  } else if (title.length > 150) {
    errors.title = 'Tiêu đề tác phẩm không được vượt quá 150 ký tự.';
  }

  // 2. Kiểm tra Mô tả
  const description = (data.description || '').trim();
  if (!description) {
    errors.description = 'Mô tả cốt truyện không được để trống.';
  } else if (description.length < 10) {
    errors.description = `Mô tả cốt truyện tối thiểu 10 ký tự (hiện có ${description.length} ký tự).`;
  }

  // 3. Kiểm tra Deadline (Không được nhỏ hơn ngày hôm nay)
  const deadlineStr = (data.deadline || '').trim();
  if (!deadlineStr) {
    errors.deadline = 'Vui lòng chọn thời hạn hoàn thành (Deadline).';
  } else {
    const deadlineDate = new Date(deadlineStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadlineDate.setHours(0, 0, 0, 0);

    if (isNaN(deadlineDate.getTime())) {
      errors.deadline = 'Định dạng ngày không hợp lệ (YYYY-MM-DD).';
    } else if (deadlineDate < today) {
      errors.deadline = 'Thời hạn hoàn thành không được nhỏ hơn ngày hiện tại.';
    }
  }

  // 4. Kiểm tra Mức độ ưu tiên
  const validPriorities = ['Low', 'Medium', 'High'];
  if (!data.priority || !validPriorities.includes(data.priority)) {
    errors.priority = 'Mức độ ưu tiên phải là Low, Medium hoặc High.';
  }

  // 5. Kiểm tra Trạng thái
  const validStatuses = ['Pending', 'Done'];
  if (data.status && !validStatuses.includes(data.status)) {
    errors.status = 'Trạng thái tác phẩm phải là Pending hoặc Done.';
  }

  return errors;
}

/**
 * Tạo mới một tác phẩm (Create Novel)
 * @param {object} data - { title, description, deadline, priority, status }
 * @returns {{ success: boolean, novel?: object, errors?: Record<string, string> }}
 */
export function createNovel(data) {
  const errors = validateNovelData(data);
  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const novels = getAllNovels();
  const newNovel = {
    id: `novel_${Date.now()}`,
    title: data.title.trim(),
    description: data.description.trim(),
    deadline: data.deadline.trim(),
    priority: data.priority,
    status: data.status || 'Pending',
    createdAt: new Date().toISOString(),
    chapters: []
  };

  novels.unshift(newNovel);
  StorageAdapter.set(DATA_KEY, novels);

  return { success: true, novel: newNovel };
}

/**
 * Cập nhật thông tin tác phẩm (Update Novel)
 * @param {string} id 
 * @param {object} data 
 * @returns {{ success: boolean, novel?: object, errors?: Record<string, string> }}
 */
export function updateNovel(id, data) {
  const errors = validateNovelData(data);
  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const novels = getAllNovels();
  const targetIndex = novels.findIndex((n) => n.id === id);

  if (targetIndex === -1) {
    return { success: false, errors: { general: 'Không tìm thấy tác phẩm để cập nhật.' } };
  }

  const currentNovel = novels[targetIndex];
  const updatedNovel = {
    ...currentNovel,
    title: data.title.trim(),
    description: data.description.trim(),
    deadline: data.deadline.trim(),
    priority: data.priority,
    status: data.status || currentNovel.status
  };

  novels[targetIndex] = updatedNovel;
  StorageAdapter.set(DATA_KEY, novels);

  return { success: true, novel: updatedNovel };
}

/**
 * Xóa một tác phẩm theo ID (Delete Novel)
 * @param {string} id 
 * @returns {boolean}
 */
export function deleteNovel(id) {
  const novels = getAllNovels();
  const filtered = novels.filter((n) => n.id !== id);
  if (filtered.length === novels.length) {
    return false;
  }
  StorageAdapter.set(DATA_KEY, filtered);
  return true;
}

/**
 * Đổi nhanh trạng thái hoàn thành giữa 'Pending' và 'Done' (Toggle Status)
 * @param {string} id 
 * @returns {object|null} Tác phẩm sau khi đổi trạng thái
 */
export function toggleNovelStatus(id) {
  const novels = getAllNovels();
  const novel = novels.find((n) => n.id === id);
  if (!novel) return null;

  novel.status = novel.status === 'Done' ? 'Pending' : 'Done';
  StorageAdapter.set(DATA_KEY, novels);
  return novel;
}

/**
 * Xóa toàn bộ danh sách tác phẩm
 */
export function clearAllNovels() {
  StorageAdapter.set(DATA_KEY, []);
}

// ============================================================
// QUẢN LÝ CHƯƠNG & KIỂM SOÁT PHIÊN BẢN (VERSION CONTROL)
// ============================================================

/**
 * Thêm một chương mới vào tác phẩm
 * @param {string} novelId 
 * @param {string} chapterTitle 
 * @returns {object|null} Chương vừa tạo
 */
export function addChapter(novelId, chapterTitle) {
  const cleanTitle = (chapterTitle || '').trim();
  if (!cleanTitle || cleanTitle.length < 2) {
    return null;
  }

  const novels = getAllNovels();
  const novel = novels.find((n) => n.id === novelId);
  if (!novel) return null;

  if (!Array.isArray(novel.chapters)) {
    novel.chapters = [];
  }

  const newChapter = {
    chapterId: `chap_${Date.now()}`,
    chapterTitle: cleanTitle,
    status: 'Draft',
    versions: []
  };

  novel.chapters.push(newChapter);
  StorageAdapter.set(DATA_KEY, novels);
  return newChapter;
}

/**
 * Lưu một phiên bản bản thảo mới (Commit version)
 * @param {string} novelId 
 * @param {string} chapterId 
 * @param {string} content - Nội dung bản thảo
 * @param {string} commitMessage - Ghi chú thay đổi
 * @returns {object|null} Phiên bản vừa lưu
 */
export function saveChapterVersion(novelId, chapterId, content, commitMessage) {
  const novels = getAllNovels();
  const novel = novels.find((n) => n.id === novelId);
  if (!novel || !Array.isArray(novel.chapters)) return null;

  const chapter = novel.chapters.find((c) => c.chapterId === chapterId);
  if (!chapter) return null;

  if (!Array.isArray(chapter.versions)) {
    chapter.versions = [];
  }

  const cleanMessage = (commitMessage || '').trim() || `Cập nhật bản thảo - ${new Date().toLocaleTimeString('vi-VN')} ${new Date().toLocaleDateString('vi-VN')}`;

  const newVersion = {
    versionId: `ver_${Date.now()}`,
    content: content || '',
    commitMessage: cleanMessage,
    timestamp: new Date().toISOString()
  };

  // Chèn vào đầu mảng versions để hiển thị commit mới nhất lên trước
  chapter.versions.unshift(newVersion);
  StorageAdapter.set(DATA_KEY, novels);
  return newVersion;
}

/**
 * Khôi phục nội dung của một phiên bản cũ
 * @param {string} novelId 
 * @param {string} chapterId 
 * @param {string} versionId 
 * @returns {string|null} Nội dung văn bản của phiên bản
 */
export function restoreVersion(novelId, chapterId, versionId) {
  const novel = getNovelById(novelId);
  if (!novel || !Array.isArray(novel.chapters)) return null;

  const chapter = novel.chapters.find((c) => c.chapterId === chapterId);
  if (!chapter || !Array.isArray(chapter.versions)) return null;

  const version = chapter.versions.find((v) => v.versionId === versionId);
  return version ? version.content : null;
}

// ============================================================
// SAO LƯU & PHỤC HỒI FILE JSON (EXPORT / IMPORT)
// ============================================================

/**
 * Xuất toàn bộ dữ liệu ra chuỗi JSON có định dạng thụt lề
 * @returns {string}
 */
export function exportToJson() {
  const novels = getAllNovels();
  return JSON.stringify(novels, null, 2);
}

/**
 * Nhập và phục hồi dữ liệu từ chuỗi JSON ngoài
 * @param {string} jsonString 
 * @returns {{ success: boolean, count: number, message: string }}
 */
export function importFromJson(jsonString) {
  try {
    const parsedData = JSON.parse(jsonString);

    if (!Array.isArray(parsedData)) {
      return { success: false, count: 0, message: 'Dữ liệu không hợp lệ: File JSON phải chứa một mảng danh sách tác phẩm.' };
    }

    // Kiểm tra cấu trúc các phần tử cơ bản
    const validNovels = parsedData.filter((item) => {
      return (
        item &&
        typeof item === 'object' &&
        item.title &&
        item.description &&
        item.deadline &&
        item.priority
      );
    });

    if (validNovels.length === 0) {
      return { success: false, count: 0, message: 'Không tìm thấy tác phẩm hợp lệ nào trong file JSON.' };
    }

    // Chuẩn hóa và gán ID nếu thiếu
    const sanitizedNovels = validNovels.map((novel, idx) => ({
      id: novel.id || `novel_${Date.now()}_${idx}`,
      title: String(novel.title).trim(),
      description: String(novel.description).trim(),
      deadline: String(novel.deadline).trim(),
      priority: ['Low', 'Medium', 'High'].includes(novel.priority) ? novel.priority : 'Medium',
      status: ['Pending', 'Done'].includes(novel.status) ? novel.status : 'Pending',
      createdAt: novel.createdAt || new Date().toISOString(),
      chapters: Array.isArray(novel.chapters) ? novel.chapters : []
    }));

    StorageAdapter.set(DATA_KEY, sanitizedNovels);
    return {
      success: true,
      count: sanitizedNovels.length,
      message: `Đã khôi phục thành công ${sanitizedNovels.length} tác phẩm vào hệ thống.`
    };
  } catch (parseErr) {
    return {
      success: false,
      count: 0,
      message: 'Lỗi định dạng: File tải lên không phải là JSON hợp lệ.'
    };
  }
}
