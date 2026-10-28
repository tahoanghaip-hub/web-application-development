/**
 * NOVELSTUDIO - MAIN APPLICATION ENTRY POINT (app.js)
 * Điều phối Theme (Dark/Light Mode), Quản lý Phiên đăng nhập người dùng giả lập,
 * và Cung cấp các tiện ích dùng chung cho toàn bộ 3 trang giao diện.
 */

import { StorageAdapter } from './core/StorageAdapter.js';

// Hằng số Keys LocalStorage
export const THEME_KEY = 'novelStudio_theme';
export const USER_KEY = 'novelStudio_user';

/**
 * Hàm khử độc chuỗi ký tự đặc biệt phòng chống tấn công XSS
 * @param {string} unsafeStr - Chuỗi chưa qua xử lý
 * @returns {string} Chuỗi an toàn
 */
export function escapeHtml(unsafeStr) {
  if (typeof unsafeStr !== 'string') return '';
  return unsafeStr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Lấy trạng thái Theme hiện tại
 * @returns {'light' | 'dark'}
 */
export function getCurrentTheme() {
  const savedTheme = StorageAdapter.get(THEME_KEY, null);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }
  // Nếu chưa lưu, ưu tiên theo tùy chọn của hệ điều hành
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/**
 * Thiết lập Theme và cập nhật toàn bộ giao diện
 * @param {'light' | 'dark'} theme 
 */
export function applyTheme(theme) {
  const htmlElement = document.documentElement;
  htmlElement.setAttribute('data-bs-theme', theme);
  StorageAdapter.set(THEME_KEY, theme);

  // Cập nhật icon trên nút #theme-toggle-btn
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.setAttribute('title', theme === 'dark' ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối');
    themeBtn.innerHTML = theme === 'dark' 
      ? '<i class="fa-solid fa-sun text-warning"></i>' 
      : '<i class="fa-solid fa-moon text-primary"></i>';
  }

  // Phát sự kiện toàn cục để các Controller (như statsController) lắng nghe và update Charts
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
}

/**
 * Chuyển đổi qua lại giữa Light và Dark mode
 */
export function toggleTheme() {
  const current = getCurrentTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

/**
 * Quản lý phiên đăng nhập người dùng giả lập
 */
export function initUserSession() {
  let user = StorageAdapter.get(USER_KEY, null);
  if (!user) {
    user = {
      username: 'Hàn Mặc Tử',
      role: 'Tác giả Trưởng',
      loginTime: new Date().toISOString()
    };
    StorageAdapter.set(USER_KEY, user);
  }

  renderUserStatusBadge(user);
  setupAuthEventListeners();
}

/**
 * Hiển thị huy hiệu trạng thái người dùng trên Navbar
 * @param {object} user 
 */
function renderUserStatusBadge(user) {
  const userBadge = document.getElementById('user-status-badge');
  if (!userBadge) return;

  if (user && user.username) {
    userBadge.innerHTML = `
      <span class="user-status-dot"></span>
      <span class="d-none d-sm-inline">${escapeHtml(user.username)}</span>
      <small class="badge bg-primary-subtle text-primary ms-1">${escapeHtml(user.role || 'Author')}</small>
    `;
    userBadge.setAttribute('title', `Đăng nhập lúc: ${new Date(user.loginTime).toLocaleTimeString('vi-VN')}`);
  } else {
    userBadge.innerHTML = `
      <span class="user-status-dot bg-secondary"></span>
      <span>Khách</span>
    `;
  }
}

/**
 * Thiết lập các sự kiện Đăng nhập / Đăng xuất giả lập
 */
function setupAuthEventListeners() {
  const loginForm = document.getElementById('login-form');
  const logoutBtn = document.getElementById('logout-btn');

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('login-username');
      const roleSelect = document.getElementById('login-role');
      const username = usernameInput ? usernameInput.value.trim() : 'Tác giả';
      const role = roleSelect ? roleSelect.value : 'Author';

      if (!username) return;

      const newUser = {
        username,
        role,
        loginTime: new Date().toISOString()
      };
      StorageAdapter.set(USER_KEY, newUser);
      renderUserStatusBadge(newUser);

      // Đóng modal đăng nhập
      const loginModalElement = document.getElementById('login-modal');
      if (loginModalElement && window.bootstrap) {
        const modalInstance = window.bootstrap.Modal.getInstance(loginModalElement);
        if (modalInstance) modalInstance.hide();
      }

      if (window.Swal) {
        window.Swal.fire({
          icon: 'success',
          title: 'Đăng nhập thành công!',
          text: `Chào mừng tác giả ${username} đã quay trở lại NovelStudio.`,
          timer: 1800,
          showConfirmButton: false
        });
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      StorageAdapter.remove(USER_KEY);
      renderUserStatusBadge(null);
      if (window.Swal) {
        window.Swal.fire({
          icon: 'info',
          title: 'Đã đăng xuất',
          text: 'Phiên làm việc hiện tại đã kết thúc.',
          timer: 1500,
          showConfirmButton: false
        });
      }
    });
  }
}

/**
 * Khởi tạo UI chung khi tải trang
 */
export function initGlobalApp() {
  // 1. Áp dụng Theme ngay lập tức
  const initialTheme = getCurrentTheme();
  applyTheme(initialTheme);

  // 2. Gắn sự kiện click cho nút đổi Theme
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      toggleTheme();
    });
  }

  // 3. Khởi tạo phiên người dùng
  initUserSession();
}

// Tự động kích hoạt khi DOM đã sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGlobalApp);
} else {
  initGlobalApp();
}
