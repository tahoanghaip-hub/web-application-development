/**
 * NOVELSTUDIO - INDEX CONTROLLER (indexController.js)
 * Điều phối hiển thị trang khám phá tác phẩm, bộ lọc đa tiêu chí, tìm kiếm realtime,
 * và Không gian Đọc thử Tiểu thuyết (Reader Modal & Experience).
 */

import { getPublishedNovels, getNovelById } from '../services/novelService.js';
import { escapeHtml } from '../app.js';

let publishedNovelsList = [];
let activeReadingNovel = null;
let currentReadingChapterIndex = 0;
let currentFilterStatus = 'all'; // 'all' | 'done' | 'pending'
let currentSearchKeyword = '';
let currentReaderFontSize = 1.1; // rem

/**
 * Khởi tạo Controller trang chủ
 */
export function initIndexController() {
  loadPublishedNovels();
  setupSearchListener();
  setupFilterChipsListeners();
  setupReaderModalEvents();
}

/**
 * Nạp danh sách tác phẩm đủ điều kiện xuất bản theo đúng logic của novelService.js
 */
export function loadPublishedNovels() {
  publishedNovelsList = getPublishedNovels();
  applyAndRenderGrid();
}

/**
 * Lọc và hiển thị danh sách tác phẩm ra giao diện
 */
function applyAndRenderGrid() {
  let filtered = [...publishedNovelsList];

  // 1. Lọc theo trạng thái hoàn thành / đang sáng tác
  if (currentFilterStatus === 'done') {
    filtered = filtered.filter((n) => n.status === 'Done');
  } else if (currentFilterStatus === 'pending') {
    filtered = filtered.filter((n) => n.status === 'Pending');
  }

  // 2. Lọc theo từ khóa tìm kiếm (Tiêu đề hoặc Mô tả)
  if (currentSearchKeyword) {
    const kw = currentSearchKeyword.toLowerCase();
    filtered = filtered.filter((n) => {
      const titleMatch = (n.title || '').toLowerCase().includes(kw);
      const descMatch = (n.description || '').toLowerCase().includes(kw);
      return titleMatch || descMatch;
    });
  }

  // Cập nhật huy hiệu đếm số lượng
  const countBadge = document.getElementById('published-count-badge');
  if (countBadge) {
    countBadge.textContent = `${filtered.length} tác phẩm`;
  }

  renderNovelsGrid(filtered);
}

/**
 * Render danh sách thẻ tác phẩm vào lưới #published-novels-grid
 * @param {Array} novels 
 */
function renderNovelsGrid(novels) {
  const gridContainer = document.getElementById('published-novels-grid');
  if (!gridContainer) return;

  if (!Array.isArray(novels) || novels.length === 0) {
    gridContainer.innerHTML = `
      <div class="col-12 animate-fade-in">
        <div class="empty-state p-5 rounded-4" style="background-color: var(--bg-surface); border: 1px dashed var(--border-color);">
          <div class="empty-state-icon"><i class="fa-solid fa-feather-pointed"></i></div>
          <h4 class="fw-bold mb-2">Không tìm thấy tác phẩm phù hợp</h4>
          <p class="text-secondary mb-4" style="max-width: 500px; margin: 0 auto;">
            ${currentSearchKeyword ? `Không có tác phẩm nào khớp với từ khóa "<strong>${escapeHtml(currentSearchKeyword)}</strong>".` : 'Chưa có tác phẩm nào đạt chuẩn xuất bản hoặc hoàn thành trong danh mục này.'}
          </p>
          <div class="d-flex justify-content-center gap-2">
            ${currentSearchKeyword ? `
              <button class="btn btn-outline-novel btn-sm" id="btn-clear-search">
                <i class="fa-solid fa-rotate-left me-1"></i> Xóa tìm kiếm
              </button>
            ` : ''}
            <a href="dashboard.html" class="btn btn-primary-novel btn-sm">
              <i class="fa-solid fa-pen-nib me-1"></i> Đến Trạm Sáng Tác
            </a>
          </div>
        </div>
      </div>
    `;

    const clearSearchBtn = document.getElementById('btn-clear-search');
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        const searchInput = document.getElementById('home-search-input');
        if (searchInput) searchInput.value = '';
        currentSearchKeyword = '';
        applyAndRenderGrid();
      });
    }
    return;
  }

  const html = novels.map((novel) => {
    const safeTitle = escapeHtml(novel.title);
    const safeDesc = escapeHtml(novel.description);
    const deadlineStr = novel.deadline ? new Date(novel.deadline).toLocaleDateString('vi-VN') : 'Không có';
    
    // Mức độ ưu tiên
    let priorityClass = 'badge-priority-medium';
    let priorityText = 'Vừa';
    if (novel.priority === 'High') {
      priorityClass = 'badge-priority-high';
      priorityText = 'Cao';
    } else if (novel.priority === 'Low') {
      priorityClass = 'badge-priority-low';
      priorityText = 'Thấp';
    }

    // Trạng thái tác phẩm
    const isDone = novel.status === 'Done';
    const statusClass = isDone ? 'badge-done' : 'badge-pending';
    const statusText = isDone ? 'Đã hoàn thành' : 'Đang ra chương';
    const statusIcon = isDone ? 'fa-circle-check' : 'fa-hourglass-start';

    // Số chương hiện có
    const chapters = Array.isArray(novel.chapters) ? novel.chapters : [];
    const chaptersCount = chapters.length;
    const publishedChaptersCount = chapters.filter((c) => c.status === 'Published').length;

    return `
      <div class="col-md-6 col-lg-4 animate-fade-in">
        <div class="card novel-card h-100 p-4 d-flex flex-column" data-novel-id="${novel.id}" style="cursor: pointer;" tabindex="0" role="region" aria-label="Tác phẩm ${safeTitle}">
          <!-- Badges trạng thái & ưu tiên -->
          <div class="d-flex align-items-center justify-content-between mb-3 gap-2 flex-wrap">
            <span class="badge badge-novel ${statusClass}">
              <i class="fa-solid ${statusIcon}"></i> ${statusText}
            </span>
            <span class="badge badge-novel ${priorityClass}" title="Mức độ ưu tiên">
              <i class="fa-solid fa-flag"></i> Ưu tiên ${priorityText}
            </span>
          </div>

          <!-- Tiêu đề tác phẩm -->
          <h3 class="novel-card-title mb-2" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 3.5rem;">
            ${safeTitle}
          </h3>

          <!-- Tóm tắt cốt truyện -->
          <p class="text-secondary small mb-4 flex-grow-1" style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; min-height: 4.2rem; line-height: 1.6;" title="${safeDesc}">
            ${safeDesc}
          </p>

          <!-- Thông tin meta -->
          <div class="pt-3 border-top mt-auto" style="border-color: var(--border-color) !important;">
            <div class="d-flex justify-content-between align-items-center text-secondary small mb-3">
              <span><i class="fa-regular fa-calendar me-1"></i> Hạn: <strong>${deadlineStr}</strong></span>
              <span title="${publishedChaptersCount} chương đã phát hành"><i class="fa-solid fa-book-bookmark me-1 text-primary"></i> <strong>${chaptersCount}</strong> chương</span>
            </div>

            <!-- Nút Đọc thử bản thảo -->
            <button class="btn btn-outline-novel w-100 btn-read-novel" data-novel-id="${novel.id}" type="button">
              <i class="fa-solid fa-book-open text-primary me-2"></i> Đọc Thử Bản Thảo
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  gridContainer.innerHTML = html;

  // Gắn sự kiện click vào nút "Đọc Thử Bản Thảo" và thẻ tác phẩm
  gridContainer.querySelectorAll('.novel-card').forEach((card) => {
    const novelId = card.getAttribute('data-novel-id');
    const readBtn = card.querySelector('.btn-read-novel');

    if (readBtn) {
      readBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openReaderModal(novelId);
      });
    }

    card.addEventListener('click', () => {
      openReaderModal(novelId);
    });

    // Hỗ trợ phím Enter khi focus thẻ
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        openReaderModal(novelId);
      }
    });
  });
}

/**
 * Lắng nghe ô tìm kiếm realtime
 */
function setupSearchListener() {
  const searchInput = document.getElementById('home-search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    currentSearchKeyword = e.target.value.trim();
    applyAndRenderGrid();
  });
}

/**
 * Lắng nghe các nút chuyển danh mục / filter chips
 */
function setupFilterChipsListeners() {
  const chips = document.querySelectorAll('.filter-chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilterStatus = chip.getAttribute('data-filter') || 'all';
      applyAndRenderGrid();
    });
  });
}

/**
 * Mở modal đọc thử tác phẩm và thiết lập dữ liệu chương
 * @param {string} novelId 
 */
export function openReaderModal(novelId) {
  const novel = getNovelById(novelId);
  if (!novel) return;

  activeReadingNovel = novel;
  currentReadingChapterIndex = 0;

  // 1. Điền tiêu đề & tóm tắt tác phẩm
  const titleEl = document.getElementById('reader-novel-title');
  const descEl = document.getElementById('reader-novel-desc');
  const metaEl = document.getElementById('reader-novel-meta');

  if (titleEl) titleEl.textContent = novel.title;
  if (descEl) descEl.textContent = novel.description || 'Chưa có tóm tắt cốt truyện.';
  if (metaEl) {
    const deadlineStr = novel.deadline ? new Date(novel.deadline).toLocaleDateString('vi-VN') : 'Không giới hạn';
    metaEl.textContent = `Hạn hoàn thành: ${deadlineStr} • Trạng thái: ${novel.status === 'Done' ? 'Đã hoàn thành' : 'Đang sáng tác'}`;
  }

  // 2. Nạp danh sách chương
  const chapters = Array.isArray(novel.chapters) ? novel.chapters : [];
  const chapterSelect = document.getElementById('reader-chapter-select');

  if (chapterSelect) {
    if (chapters.length === 0) {
      chapterSelect.innerHTML = '<option value="">(Tác phẩm này chưa có chương nào được tạo)</option>';
      chapterSelect.setAttribute('disabled', 'disabled');
      renderChapterContent(null);
      updateReaderNavButtons(0, 0);
    } else {
      chapterSelect.removeAttribute('disabled');
      chapterSelect.innerHTML = chapters.map((chap, idx) => {
        const statusLabel = chap.status === 'Published' ? '• [Đã xuất bản]' : '• [Bản nháp]';
        return `<option value="${chap.chapterId}">${idx + 1}. ${escapeHtml(chap.chapterTitle)} ${statusLabel}</option>`;
      }).join('');

      chapterSelect.value = chapters[0].chapterId;
      renderChapterContent(chapters[0]);
      updateReaderNavButtons(0, chapters.length);
    }
  }

  // 3. Mở Modal Bootstrap
  const modalEl = document.getElementById('reader-modal');
  if (modalEl && window.bootstrap) {
    const modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modalInstance.show();
  }
}

/**
 * Cập nhật trạng thái enabled/disabled cho các nút chuyển chương Trước / Sau
 * @param {number} currentIndex 
 * @param {number} totalChapters 
 */
function updateReaderNavButtons(currentIndex, totalChapters) {
  const prevBtn = document.getElementById('reader-prev-chapter-btn');
  const nextBtn = document.getElementById('reader-next-chapter-btn');

  if (prevBtn) {
    prevBtn.disabled = currentIndex <= 0 || totalChapters <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = currentIndex >= totalChapters - 1 || totalChapters <= 1;
  }
}

/**
 * Cài đặt các sự kiện bên trong Reader Modal (chuyển chương, chỉnh font chữ)
 */
function setupReaderModalEvents() {
  const chapterSelect = document.getElementById('reader-chapter-select');
  const prevBtn = document.getElementById('reader-prev-chapter-btn');
  const nextBtn = document.getElementById('reader-next-chapter-btn');
  const fontDecBtn = document.getElementById('reader-font-decrease-btn');
  const fontIncBtn = document.getElementById('reader-font-increase-btn');

  // Đổi chương qua thẻ select
  if (chapterSelect) {
    chapterSelect.addEventListener('change', (e) => {
      const chapterId = e.target.value;
      if (!activeReadingNovel || !Array.isArray(activeReadingNovel.chapters)) return;

      const idx = activeReadingNovel.chapters.findIndex((c) => c.chapterId === chapterId);
      if (idx !== -1) {
        currentReadingChapterIndex = idx;
        renderChapterContent(activeReadingNovel.chapters[idx]);
        updateReaderNavButtons(currentReadingChapterIndex, activeReadingNovel.chapters.length);
      }
    });
  }

  // Nút Chương trước
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (!activeReadingNovel || !Array.isArray(activeReadingNovel.chapters)) return;
      if (currentReadingChapterIndex > 0) {
        currentReadingChapterIndex--;
        const chap = activeReadingNovel.chapters[currentReadingChapterIndex];
        if (chapterSelect) chapterSelect.value = chap.chapterId;
        renderChapterContent(chap);
        updateReaderNavButtons(currentReadingChapterIndex, activeReadingNovel.chapters.length);
      }
    });
  }

  // Nút Chương sau
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (!activeReadingNovel || !Array.isArray(activeReadingNovel.chapters)) return;
      if (currentReadingChapterIndex < activeReadingNovel.chapters.length - 1) {
        currentReadingChapterIndex++;
        const chap = activeReadingNovel.chapters[currentReadingChapterIndex];
        if (chapterSelect) chapterSelect.value = chap.chapterId;
        renderChapterContent(chap);
        updateReaderNavButtons(currentReadingChapterIndex, activeReadingNovel.chapters.length);
      }
    });
  }

  // Nút Giảm cỡ chữ (Min: 0.9rem)
  if (fontDecBtn) {
    fontDecBtn.addEventListener('click', () => {
      if (currentReaderFontSize > 0.9) {
        currentReaderFontSize -= 0.1;
        applyReaderFontSize();
      }
    });
  }

  // Nút Tăng cỡ chữ (Max: 1.5rem)
  if (fontIncBtn) {
    fontIncBtn.addEventListener('click', () => {
      if (currentReaderFontSize < 1.5) {
        currentReaderFontSize += 0.1;
        applyReaderFontSize();
      }
    });
  }
}

/**
 * Áp dụng kích thước cỡ chữ cho vùng nội dung đọc thử
 */
function applyReaderFontSize() {
  const contentBody = document.getElementById('reader-content-body');
  if (contentBody) {
    contentBody.style.fontSize = `${currentReaderFontSize.toFixed(1)}rem`;
  }
}

/**
 * Render nội dung bản thảo của chương được chọn vào trang giấy đọc
 * @param {object|null} chapter 
 */
function renderChapterContent(chapter) {
  const headingEl = document.getElementById('reader-chapter-title-heading');
  const contentBody = document.getElementById('reader-content-body');
  const versionInfo = document.getElementById('reader-version-info');

  if (!contentBody) return;

  // Nếu tác phẩm chưa có chương nào
  if (!chapter) {
    if (headingEl) headingEl.classList.add('d-none');
    contentBody.innerHTML = `
      <div class="text-center py-5 text-secondary">
        <i class="fa-solid fa-feather-pointed fs-1 mb-3 text-muted opacity-75"></i>
        <h5 class="fw-bold mb-2">Tác giả đang chuẩn bị bản thảo</h5>
        <p class="small text-secondary mb-0">Tác phẩm này chưa có chương mục nào. Vui lòng quay lại thưởng thức sau khi tác giả hoàn thiện chương đầu tiên!</p>
      </div>
    `;
    if (versionInfo) {
      versionInfo.innerHTML = '<i class="fa-solid fa-pen-ruler me-1"></i> Chưa có bản thảo';
    }
    return;
  }

  // Hiển thị tiêu đề chương
  if (headingEl) {
    headingEl.textContent = chapter.chapterTitle || 'Chương không tên';
    headingEl.classList.remove('d-none');
  }

  const versions = Array.isArray(chapter.versions) ? chapter.versions : [];

  // Nếu chương chưa có phiên bản nháp nào
  if (versions.length === 0) {
    contentBody.innerHTML = `
      <div class="text-center py-5 text-secondary">
        <i class="fa-solid fa-file-pen fs-1 mb-3 text-muted opacity-75"></i>
        <h5 class="fw-bold mb-2">Chương chưa có nội dung nháp</h5>
        <p class="small text-secondary mb-0">Tác giả chưa lưu phiên bản nháp nào cho chương này.</p>
      </div>
    `;
    if (versionInfo) {
      versionInfo.innerHTML = '<i class="fa-solid fa-clock-rotate-left me-1"></i> Phiên bản trống';
    }
    return;
  }

  // Lấy phiên bản mới nhất (ở vị trí đầu mảng versions)
  const latestVersion = versions[0];
  const formattedTime = new Date(latestVersion.timestamp).toLocaleString('vi-VN');
  const rawContent = latestVersion.content || '';
  const charCount = rawContent.length;
  const wordCount = rawContent.trim() ? rawContent.trim().split(/\s+/).length : 0;

  // Chia văn bản thành các đoạn và render an toàn
  const paragraphs = rawContent.split(/\n\s*\n/).filter((p) => p.trim());
  if (paragraphs.length > 0) {
    contentBody.innerHTML = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  } else {
    contentBody.innerHTML = `<p>${escapeHtml(rawContent)}</p>`;
  }

  // Cập nhật thông tin phiên bản commit
  if (versionInfo) {
    const commitMsg = latestVersion.commitMessage || 'Cập nhật bản thảo';
    versionInfo.innerHTML = `
      <i class="fa-solid fa-code-commit text-primary me-1"></i>
      Phiên bản: <strong>${escapeHtml(commitMsg)}</strong> 
      <span class="text-muted ms-1">(${formattedTime} • ${wordCount} từ / ${charCount} ký tự)</span>
    `;
  }

  applyReaderFontSize();
}

// Khởi tạo Controller khi DOM sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIndexController);
} else {
  initIndexController();
}
