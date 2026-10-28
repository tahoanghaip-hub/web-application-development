/**
 * NOVELSTUDIO - STORAGE ADAPTER CORE MODULE
 * Quản lý tương tác với window.localStorage
 * Bắt lỗi JSON parsing, bẫy lỗi QuotaExceededError (5MB) và tích hợp cảnh báo SweetAlert2
 */

export class StorageAdapter {
  /**
   * Đọc và giải mã dữ liệu từ LocalStorage an toàn
   * @param {string} key - Tên khóa lưu trữ
   * @param {any} defaultValue - Giá trị mặc định nếu key chưa tồn tại hoặc bị lỗi
   * @returns {any} Dữ liệu đã giải mã
   */
  static get(key, defaultValue = []) {
    try {
      const rawData = window.localStorage.getItem(key);
      if (rawData === null || rawData === undefined) {
        return defaultValue;
      }
      return JSON.parse(rawData);
    } catch (parseError) {
      console.error(`[StorageAdapter] Lỗi giải mã JSON từ khóa "${key}":`, parseError);
      return defaultValue;
    }
  }

  /**
   * Tuần tự hóa và lưu dữ liệu vào LocalStorage có bẫy lỗi tràn bộ nhớ
   * @param {string} key - Tên khóa lưu trữ
   * @param {any} value - Dữ liệu cần lưu
   * @returns {boolean} Kết quả thành công (true) hoặc thất bại (false)
   */
  static set(key, value) {
    try {
      const serializedData = JSON.stringify(value);
      window.localStorage.setItem(key, serializedData);
      return true;
    } catch (storageError) {
      const isQuotaExceeded =
        storageError.name === 'QuotaExceededError' ||
        storageError.code === 22 ||
        storageError.code === 1014 ||
        storageError.name === 'NS_ERROR_DOM_QUOTA_REACHED';

      if (isQuotaExceeded) {
        console.error(`[StorageAdapter] Tràn dung lượng lưu trữ cục bộ 5MB khi ghi khóa "${key}":`, storageError);
        if (window.Swal) {
          window.Swal.fire({
            icon: 'error',
            title: 'Tràn Bộ Nhớ Lưu Trữ (5MB)!',
            html: `Bộ nhớ trình duyệt (LocalStorage) đã đạt đến giới hạn tối đa.<br>
                   Vui lòng bấm nút <b>"Xuất JSON"</b> để sao lưu và xóa bớt các phiên bản nháp cũ.`,
            confirmButtonText: 'Đã Hiểu',
            confirmButtonColor: '#6366f1'
          });
        }
      } else {
        console.error(`[StorageAdapter] Lỗi không xác định khi lưu khóa "${key}":`, storageError);
      }
      return false;
    }
  }

  /**
   * Xóa một khóa cụ thể khỏi LocalStorage
   * @param {string} key - Tên khóa cần xóa
   */
  static remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (removeError) {
      console.error(`[StorageAdapter] Lỗi khi xóa khóa "${key}":`, removeError);
    }
  }

  /**
   * Xóa toàn bộ các khóa liên quan đến ứng dụng NovelStudio
   */
  static clearAll() {
    try {
      const appKeys = ['novelStudio_data', 'novelStudio_theme', 'novelStudio_user'];
      appKeys.forEach((k) => window.localStorage.removeItem(k));
    } catch (clearError) {
      console.error('[StorageAdapter] Lỗi khi dọn sạch dữ liệu ứng dụng:', clearError);
    }
  }
}
