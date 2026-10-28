/**
 * NOVELSTUDIO - INDEX CONTROLLER (indexController.js)
 * Điều phối hiển thị trang chủ, tìm kiếm nhanh và modal đọc thử tác phẩm.
 */

import { getAllNovels, getNovelById } from '../services/novelService.js';
import { escapeHtml } from '../app.js';

let currentNovelsList = [];
let activeReadingNovel = null;

/**
 * Khởi tạo Controller trang chủ
 */
export function initIndexController() {
  loadNovels();
  setupSearchListener();
  setupReaderModalEvents();
}

/**
 * Nạp danh sách tác phẩm và hiển thị lên lưới
 */
function loadNovels() {
  currentNovelsList = getAllNovels();
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
          <p class="text-secondary mb-4">Hãy thử tìm kiếm với từ khóa khác hoặc chuyển sang Trạm Sáng Tác để tạo tác phẩm đầu tiên.</p>
          <a href="dashboard.html" class="btn btn-primary-novel btn-sm">
            <i class="fa-solid fa-plus me-1"></i> Tạo Tác Phẩm Mới
          </a>
        </div>
      </div>
    `;
    return;
  }

  const html = novels.map((novel) => {
    const safeTitle = escapeHtml(novel.title);
    const safeDesc = escapeHtml(novel.description);
    const deadlineStr = novel.deadline ? new Date(novel.deadline).toLocaleDateString('vi-VN') : 'Không có';
    
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

            <!-- Action Read Button -->
            <button class="btn btn-outline-novel w-100 btn-read-novel" data-novel-id="${novel.id}">
              <i class="fa-solid fa-book-open text-primary me-2"></i> Đọc Thử Bản Thảo
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  gridContainer.innerHTML = html;

  // Gắn sự kiện click vào tất cả nút "Đọc Thử Bản Thảo"
  const readButtons = gridContainer.querySelectorAll('.btn-read-novel');
  readButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const novelId = btn.getAttribute('data-novel-id');
      openReaderModal(novelId);
    });
  });
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

/**
 * Mở modal đọc thử tác phẩm và thiết lập dữ liệu chương
 * @param {string} novelId 
 */
function openReaderModal(novelId) {
  const novel = getNovelById(novelId);
  if (!novel) return;

  activeReadingNovel = novel;

  // Điền tiêu đề & meta
  const titleEl = document.getElementById('reader-novel-title');
  const metaEl = document.getElementById('reader-novel-meta');
  const chapterSelect = document.getElementById('reader-chapter-select');

  if (titleEl) titleEl.textContent = novel.title;
  if (metaEl) {
    const deadlineStr = novel.deadline ? new Date(novel.deadline).toLocaleDateString('vi-VN') : 'Không có hạn';
    metaEl.textContent = `Hạn hoàn thành: ${deadlineStr} • Trạng thái: ${novel.status === 'Done' ? 'Đã hoàn thành' : 'Đang sáng tác'}`;
  }

  // Nạp danh sách chương vào select box
  if (chapterSelect) {
    const chapters = Array.isArray(novel.chapters) ? novel.chapters : [];
    if (chapters.length === 0) {
      chapterSelect.innerHTML = '<option value="">(Tác phẩm này chưa có chương nào được tạo)</option>';
      renderChapterContent(null);
    } else {
      chapterSelect.innerHTML = chapters.map((chap, idx) => {
        return `<option value="${chap.chapterId}">${escapeHtml(chap.chapterTitle)}</option>`;
      }).join('');

      // Hiển thị chương đầu tiên
      renderChapterContent(chapters[0]);
    }
  }

  // Mở modal Bootstrap
  const modalEl = document.getElementById('reader-modal');
  if (modalEl && window.bootstrap) {
    const modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modalInstance.show();
  }
}

/**
 * Cài đặt sự kiện chuyển đổi chương trong Reader Modal
 */
function setupReaderModalEvents() {
  const chapterSelect = document.getElementById('reader-chapter-select');
  if (!chapterSelect) return;

  chapterSelect.addEventListener('change', (e) => {
    const chapterId = e.target.value;
    if (!activeReadingNovel || !Array.isArray(activeReadingNovel.chapters)) return;

    const selectedChapter = activeReadingNovel.chapters.find((c) => c.chapterId === chapterId);
    renderChapterContent(selectedChapter);
  });
}

/**
 * Render nội dung bản thảo của chương được chọn
 * @param {object|null} chapter 
 */
function renderChapterContent(chapter) {
  const contentBody = document.getElementById('reader-content-body');
  const versionInfo = document.getElementById('reader-version-info');
  if (!contentBody) return;

  if (!chapter) {
    contentBody.innerHTML = '<p class="text-secondary italic">Tác giả đang chuẩn bị bản thảo cho tác phẩm này...</p>';
    if (versionInfo) versionInfo.innerHTML = '<i class="fa-solid fa-pen-ruler me-1"></i> Chưa có bản thảo';
    return;
  }

  const versions = Array.isArray(chapter.versions) ? chapter.versions : [];
  if (versions.length === 0) {
    contentBody.innerHTML = '<p class="text-secondary italic">Chương này chưa có nội dung bản thảo nào được lưu.</p>';
    if (versionInfo) versionInfo.innerHTML = '<i class="fa-solid fa-pen-ruler me-1"></i> Chưa có bản thảo';
    return;
  }

  // Lấy phiên bản mới nhất (ở đầu mảng)
  const latestVersion = versions[0];
  const formattedTime = new Date(latestVersion.timestamp).toLocaleString('vi-VN');
  
  contentBody.textContent = latestVersion.content || '(Nội dung bản thảo rỗng)';
  
  if (versionInfo) {
    versionInfo.innerHTML = `
      <i class="fa-solid fa-code-commit text-primary me-1"></i>
      Phiên bản mới nhất: <strong>${escapeHtml(latestVersion.commitMessage || 'Bản nháp')}</strong> 
      <span class="text-muted ms-1">(${formattedTime})</span>
    `;
  }
}

// Tự động khởi tạo Controller khi DOM sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIndexController);
} else {
  initIndexController();
}
