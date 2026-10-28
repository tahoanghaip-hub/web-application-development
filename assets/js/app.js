/**
 * NOVELSTUDIO - MAIN APPLICATION ENTRY POINT (app.js)
 * Điều phối Theme (Dark/Light Mode), Quản lý Phiên đăng nhập người dùng giả lập,
 * Xử lý Khử độc XSS và Cung cấp các tiện ích dùng chung cho toàn bộ giao diện.
 */

import { StorageAdapter } from './core/StorageAdapter.js';

// Hằng số Keys LocalStorage
export const THEME_KEY = 'novelStudio_theme';
export const USER_KEY = 'novelStudio_user';

/**
 * Hàm khử độc chuỗi ký tự đặc biệt phòng chống tấn công XSS
 * @param {string} unsafeStr - Chuỗi chưa qua xử lý
 * @returns {string} Chuỗi an toàn để render vào DOM
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
 * Lấy trạng thái Theme hiện tại từ StorageAdapter hoặc tùy chọn hệ điều hành
 * @returns {'light' | 'dark'}
 */
export function getCurrentTheme() {
  const savedTheme = StorageAdapter.get(THEME_KEY, null);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }
  // Nếu chưa lưu, ưu tiên theo tùy chọn của trình duyệt / hệ điều hành
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/**
 * Thiết lập Theme và cập nhật toàn bộ giao diện, icon và nhãn truy cập
 * @param {'light' | 'dark'} theme 
 */
export function applyTheme(theme) {
  const htmlElement = document.documentElement;
  htmlElement.setAttribute('data-bs-theme', theme);
  StorageAdapter.set(THEME_KEY, theme);

  // Cập nhật icon và nhãn truy cập trên nút #theme-toggle-btn
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    const isDark = theme === 'dark';
    themeBtn.setAttribute('title', isDark ? 'Chế độ Tối đang bật (Bấm để chuyển sang Sáng)' : 'Chế độ Sáng đang bật (Bấm để chuyển sang Tối)');
    themeBtn.setAttribute('aria-label', isDark ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối');
    themeBtn.innerHTML = isDark
      ? '<i class="fa-solid fa-sun text-warning fs-5"></i>' 
      : '<i class="fa-solid fa-moon text-primary fs-5"></i>';

    // Hiệu ứng micro-interaction phản hồi xúc giác
    themeBtn.classList.add('animate-fade-in');
    setTimeout(() => themeBtn.classList.remove('animate-fade-in'), 300);
  }

  // Phát sự kiện toàn cục để các Controller (như statsController) lắng nghe và update Charts realtime
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
 * Lấy thông tin phiên người dùng hiện tại (Session Mockup)
 * @returns {object|null}
 */
export function getCurrentUser() {
  const raw = window.localStorage.getItem(USER_KEY);
  if (raw === null) {
    // Lần đầu chạy: khởi tạo tác giả mẫu mặc định
    const defaultUser = {
      username: 'Hàn Mặc Tử',
      role: 'Tác giả Trưởng',
      loginTime: new Date().toISOString()
    };
    StorageAdapter.set(USER_KEY, defaultUser);
    return defaultUser;
  }

  const parsed = StorageAdapter.get(USER_KEY, null);
  if (!parsed || parsed.isGuest) {
    return null;
  }
  return parsed;
}

/**
 * Quản lý phiên đăng nhập người dùng giả lập
 */
export function initUserSession() {
  const user = getCurrentUser();
  renderUserStatusBadge(user);
  setupAuthEventListeners();
}

/**
 * Hiển thị huy hiệu trạng thái người dùng trên Navbar và cập nhật Dropdown
 * @param {object|null} user 
 */
export function renderUserStatusBadge(user) {
  const userBadge = document.getElementById('user-status-badge');
  const dropdownMenu = userBadge ? userBadge.nextElementSibling : null;
  if (!userBadge) return;

  if (user && user.username) {
    userBadge.innerHTML = `
      <span class="user-status-dot" title="Trạng thái: Đang hoạt động"></span>
      <span class="d-none d-sm-inline fw-semibold">${escapeHtml(user.username)}</span>
      <span class="badge bg-primary-subtle text-primary ms-1 d-none d-md-inline" style="font-size: 0.72rem;">${escapeHtml(user.role || 'Tác giả')}</span>
    `;
    userBadge.setAttribute('title', `Đang đăng nhập: ${user.username} (${user.role})`);
    userBadge.setAttribute('aria-label', `Tài khoản tác giả: ${user.username}`);

    if (dropdownMenu && dropdownMenu.classList.contains('dropdown-menu')) {
      dropdownMenu.innerHTML = `
        <li class="px-3 py-2 border-bottom mb-1" style="border-color: var(--border-color) !important;">
          <div class="small fw-bold text-primary"><i class="fa-solid fa-feather-pointed me-1"></i> ${escapeHtml(user.username)}</div>
          <div class="text-secondary" style="font-size: 0.75rem;">${escapeHtml(user.role || 'Tác giả')} • Đang hoạt động</div>
        </li>
        <li>
          <button class="dropdown-item" type="button" data-bs-toggle="modal" data-bs-target="#login-modal">
            <i class="fa-solid fa-user-pen me-2 text-primary"></i> Đổi tác giả / Sửa hồ sơ
          </button>
        </li>
        <li><hr class="dropdown-divider"></li>
        <li>
          <button id="logout-btn" class="dropdown-item text-danger" type="button">
            <i class="fa-solid fa-arrow-right-from-bracket me-2"></i> Đăng xuất (Về chế độ Khách)
          </button>
        </li>
      `;
    }
  } else {
    userBadge.innerHTML = `
      <span class="user-status-dot dot-guest" title="Chưa đăng nhập"></span>
      <span class="text-secondary">Khách vãng lai</span>
      <span class="badge bg-secondary-subtle text-secondary ms-1">Đăng nhập</span>
    `;
    userBadge.setAttribute('title', 'Chưa đăng nhập - Nhấp để đăng nhập tác giả');
    userBadge.setAttribute('aria-label', 'Chưa đăng nhập - Nhấp để đăng nhập');

    if (dropdownMenu && dropdownMenu.classList.contains('dropdown-menu')) {
      dropdownMenu.innerHTML = `
        <li class="px-3 py-2 border-bottom mb-1" style="border-color: var(--border-color) !important;">
          <div class="small fw-bold text-secondary"><i class="fa-solid fa-user me-1"></i> Khách vãng lai</div>
          <div class="text-muted" style="font-size: 0.75rem;">Bạn đang ở chế độ xem đọc thử</div>
        </li>
        <li>
          <button class="dropdown-item" type="button" data-bs-toggle="modal" data-bs-target="#login-modal">
            <i class="fa-solid fa-arrow-right-to-bracket me-2 text-primary"></i> Đăng nhập hồ sơ tác giả
          </button>
        </li>
      `;
    }
  }

  // Pre-fill dữ liệu vào Modal đăng nhập nếu đang mở
  prefillLoginModal(user);
}

/**
 * Điền trước thông tin tác giả vào Modal đăng nhập
 * @param {object|null} user 
 */
function prefillLoginModal(user) {
  const usernameInput = document.getElementById('login-username');
  const roleSelect = document.getElementById('login-role');
  if (usernameInput) {
    usernameInput.value = user && user.username ? user.username : '';
  }
  if (roleSelect && user && user.role) {
    roleSelect.value = user.role;
  }
}

/**
 * Thiết lập các sự kiện Đăng nhập / Đăng xuất giả lập
 */
function setupAuthEventListeners() {
  const loginForm = document.getElementById('login-form');
  const userDropdownMenu = document.getElementById('user-status-badge')?.nextElementSibling;

  if (loginForm && !loginForm.dataset.listenerAttached) {
    loginForm.dataset.listenerAttached = 'true';
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
      setupAuthEventListeners();

      // Đóng modal đăng nhập
      const loginModalElement = document.getElementById('login-modal');
      if (loginModalElement && window.bootstrap) {
        const modalInstance = window.bootstrap.Modal.getInstance(loginModalElement);
        if (modalInstance) modalInstance.hide();
      }

      if (window.Swal) {
        const Toast = window.Swal.mixin({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000,
          timerProgressBar: true
        });
        Toast.fire({
          icon: 'success',
          title: `Chào mừng tác giả ${username}!`
        });
      }
    });
  }

  // Lắng nghe sự kiện click Đăng xuất thông qua event delegation trên menu
  if (userDropdownMenu && !userDropdownMenu.dataset.listenerAttached) {
    userDropdownMenu.dataset.listenerAttached = 'true';
    userDropdownMenu.addEventListener('click', (e) => {
      const logoutTarget = e.target.closest('#logout-btn');
      if (logoutTarget) {
        e.preventDefault();
        StorageAdapter.set(USER_KEY, { isGuest: true });
        renderUserStatusBadge(null);
        setupAuthEventListeners();

        if (window.Swal) {
          const Toast = window.Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true
          });
          Toast.fire({
            icon: 'info',
            title: 'Đã chuyển về chế độ Khách vãng lai'
          });
        }
      }
    });
  }
}

/**
 * Hỗ trợ phím Escape đóng Modal toàn cục an toàn
 */
function setupGlobalKeyboardAccessibility() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModal = document.querySelector('.modal.show');
      if (openModal && window.bootstrap) {
        const modalInstance = window.bootstrap.Modal.getInstance(openModal);
        if (modalInstance) {
          modalInstance.hide();
        }
      }
    }
  });
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
  if (themeToggleBtn && !themeToggleBtn.dataset.listenerAttached) {
    themeToggleBtn.dataset.listenerAttached = 'true';
    themeToggleBtn.addEventListener('click', () => {
      toggleTheme();
    });
  }

  // 3. Khởi tạo phiên người dùng
  initUserSession();

  // 4. Hỗ trợ phím Escape và khả năng truy cập
  setupGlobalKeyboardAccessibility();
}

// Tự động kích hoạt khi DOM đã sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGlobalApp);
} else {
  initGlobalApp();
}
