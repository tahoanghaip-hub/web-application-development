import { $, api, on, notify, report } from './core/api.js';
import { StorageAdapter } from './core/StorageAdapter.js';

// Hằng số Keys LocalStorage
export const THEME_KEY = 'novelStudio_theme';


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


let account = null;
let previousId = null;

function showAccount(user) {
  account = user;
  $('user-status-badge').textContent = user ? user.displayName + ' · ' + user.role : 'Khách';
  $('login-form').hidden = Boolean(user);
  $('profile-form').hidden = !user;
  $('logout-btn').hidden = !user;
  $('admin-users').hidden = user?.role !== 'Admin';
  $('display-name').value = user?.displayName || '';
  $('account-list').replaceChildren();
}

applyTheme(getCurrentTheme());
on($('theme-toggle-btn'), 'click', toggleTheme);
export const sessionReady = api('/auth/me').catch(error => {
  if (error.status !== 401) report(error);
  return null;
}).then(user => {
  showAccount(user);
  previousId = user?.id;
  if ($('access-message')) {
    $('access-message').hidden = Boolean(user);
    document.querySelector('main').hidden = !user;
    if ($('open-add-modal-btn')) $('open-add-modal-btn').hidden = !user;
  }
  return user;
});

on($('login-form'), 'submit', async event => {
  event.preventDefault();
  const register = event.submitter?.value === 'register';
  try {
    const user = await api('/auth/' + (register ? 'register' : 'login'), 'POST', {
      username: $('login-username').value, password: $('login-password').value
    });
    if (register) {
      $('auth-message').textContent = 'Đã tạo tài khoản. Bấm Đăng nhập để tiếp tục.';
    } else if (user.id === previousId) {
      showAccount(user);
      $('login-password').value = '';
      bootstrap.Modal.getInstance($('login-modal'))?.hide();
      notify('Đã đăng nhập lại. Bạn có thể thử lưu.');
    } else location.reload();
  } catch (error) {
    $('auth-message').textContent = error.message;
  }
});
window.addEventListener('session-expired', () => {
  if (account) showAccount(null);
});
on($('profile-form'), 'submit', async event => {
  event.preventDefault();
  showAccount(await api('/auth/me', 'PATCH', { displayName: $('display-name').value }));
  notify('Đã cập nhật hồ sơ.');
});
on($('admin-users'), 'click', async () => {
  const users = await api('/auth/users');
  $('account-list').replaceChildren(...users.map(user => {
    const li = document.createElement('li');
    li.textContent = user.username + ' · ' + user.displayName + ' · ' + user.role;
    return li;
  }));
});
on($('logout-btn'), 'click', async () => {
  await api('/auth/logout', 'POST');
  location.reload();
});
