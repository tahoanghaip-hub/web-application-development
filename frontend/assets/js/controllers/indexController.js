/**
 * NOVELSTUDIO - INDEX CONTROLLER (indexController.js)
 * Điều phối hiển thị trang chủ và tìm kiếm nhanh tác phẩm đã xuất bản.
 */

import { api, report } from '../core/api.js';
import { escapeHtml } from '../app.js';

let currentNovelsList = [];

/**
 * Khởi tạo Controller trang chủ
 */
export function initIndexController() {
  loadNovels().catch(error => {
    document.getElementById('published-novels-grid').textContent = 'Chưa tải được thư viện. Tải lại trang để thử lại.';
    report(error);
  });
  setupSearchListener();
}

/**
 * Nạp danh sách tác phẩm và hiển thị lên lưới
 */
async function loadNovels() {
  currentNovelsList = await api('/studio/public');
  renderNovelsGrid(currentNovelsList);
}

/**
 * Render danh sách tác phẩm vào lưới #published-novels-grid
 * @param {Array} novels
 */
function renderNovelsGrid(novels) {
  const gridContainer = document.getElementById('published-novels-grid');
  if (!gridContainer) return;

  if (!Array.isArray(novels) || novels.length === 0) {
    gridContainer.innerHTML = `
      <div class="col-12">
        <div class="empty-state p-5 rounded-4" style="background-color: var(--bg-surface); border: 1px dashed var(--border-color);">
          <div class="empty-state-icon"><i class="fa-solid fa-feather"></i></div>
          <h4 class="fw-bold mb-2">Chưa có tác phẩm nào phù hợp</h4>
          <p class="text-secondary mb-0">Tác phẩm có chương đã xuất bản sẽ xuất hiện ở đây nếu khớp với từ khóa tìm kiếm.</p>
        </div>
      </div>
    `;
    return;
  }

  const html = novels.map((novel) => {
    const safeTitle = escapeHtml(novel.title);
    const safeDesc = escapeHtml(novel.description);
    const deadlineStr = novel.deadline ? new Date(novel.deadline).toLocaleDateString('vi-VN') : 'Không có';
    const readerHref = `reader.html?novel=${encodeURIComponent(novel.id)}`;

    // Xử lý Badge Priority
    let priorityClass = 'badge-priority-medium';
    let priorityText = 'Trung bình';
    if (novel.priority === 'High') {
      priorityClass = 'badge-priority-high';
      priorityText = 'Cao';
    } else if (novel.priority === 'Low') {
      priorityClass = 'badge-priority-low';
      priorityText = 'Thấp';
    }

    // Xử lý Badge Status
    const isDone = novel.status === 'Done';
    const statusClass = isDone ? 'badge-done' : 'badge-pending';
    const statusText = isDone ? 'Hoàn thành' : 'Đang sáng tác';
    const statusIcon = isDone ? 'fa-circle-check' : 'fa-clock';

    // Đếm số chương
    const chaptersCount = Array.isArray(novel.chapters) ? novel.chapters.length : 0;

    return `
      <div class="col-md-6 col-lg-4 animate-fade-in">
        <div class="card novel-card h-100 p-4 d-flex flex-column">
          <!-- Card Header Badges -->
          <div class="d-flex align-items-center justify-content-between mb-3 gap-2 flex-wrap">
            <span class="badge badge-novel ${statusClass}">
              <i class="fa-solid ${statusIcon}"></i> ${statusText}
            </span>
            <span class="badge badge-novel ${priorityClass}">
              <i class="fa-solid fa-flag"></i> ${priorityText}
            </span>
          </div>

          <!-- Title & Description -->
          <h3 class="h5 fw-bold mb-2 text-primary" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.8rem;">
            ${safeTitle}
          </h3>
          <p class="text-secondary small mb-4 flex-grow-1" style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; min-height: 4.2rem;">
            ${safeDesc}
          </p>

          <!-- Meta Info -->
          <div class="pt-3 border-top mt-auto" style="border-color: var(--border-color) !important;">
            <div class="d-flex justify-content-between align-items-center text-secondary small mb-3">
              <span><i class="fa-regular fa-calendar me-1"></i> Hạn: <strong>${deadlineStr}</strong></span>
              <span><i class="fa-solid fa-layer-group me-1"></i> <strong>${chaptersCount}</strong> chương</span>
            </div>

            <!-- Action Read Link -->
            <a class="btn btn-outline-novel w-100 btn-read-novel" href="${readerHref}" data-novel-id="${escapeHtml(novel.id)}">
              <i class="fa-solid fa-book-open text-primary me-2" aria-hidden="true"></i> Đọc truyện
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  gridContainer.innerHTML = html;
}

/**
 * Lắng nghe ô tìm kiếm realtime trên trang chủ
 */
function setupSearchListener() {
  const searchInput = document.getElementById('home-search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const keyword = e.target.value.trim().toLowerCase();
    if (!keyword) {
      renderNovelsGrid(currentNovelsList);
      return;
    }

    const filtered = currentNovelsList.filter((novel) => {
      const titleMatch = (novel.title || '').toLowerCase().includes(keyword);
      const descMatch = (novel.description || '').toLowerCase().includes(keyword);
      return titleMatch || descMatch;
    });

    renderNovelsGrid(filtered);
  });
}

// Tự động khởi tạo Controller khi DOM sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIndexController);
} else {
  initIndexController();
}
