/**
 * NOVELSTUDIO - INDEX CONTROLLER (indexController.js)
 * Điều phối hiển thị tối đa 12 gợi ý ngẫu nhiên ở Khám phá và tìm kiếm toàn bộ tác phẩm công khai.
 */

import { $, api, on, report } from '../core/api.js';
import { escapeHtml } from '../app.js';

const SEARCH_PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 250;

let discoverItems = [];
let totalPublic = 0;
let searchTimer = null;
let searchSeq = 0;
let activeSearchKeyword = '';
let searchItems = [];
let searchPage = 1;
let searchHasMore = false;

export function initIndexController() {
  loadDiscover().catch(error => {
    const grid = $('published-novels-grid');
    if (grid) grid.textContent = 'Chưa tải được thư viện. Tải lại trang để thử lại.';
    report(error);
  });
  setupSearchListener();
  setupLoadMoreListener();
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      const input = $('home-search-input');
      const kw = (input?.value || '').trim();
      if (kw) {
        runSearch(kw, 1, false).catch(report);
      } else {
        loadDiscover().catch(report);
      }
    }
  });
}

async function loadDiscover() {
  const result = await api('/studio/public/discover');
  discoverItems = Array.isArray(result?.items) ? result.items : [];
  totalPublic = Number(result?.totalPublic ?? discoverItems.length);
  const currentKw = ($('home-search-input')?.value || '').trim();
  if (!currentKw) {
    renderDiscoverView();
  }
}

function renderDiscoverView() {
  activeSearchKeyword = '';
  searchItems = [];
  searchPage = 1;
  searchHasMore = false;
  updateLoadMoreVisibility();

  const heading = $('discover-heading');
  const subtitle = $('discover-subtitle');
  if (heading) heading.textContent = 'Gợi ý khám phá';
  if (subtitle) {
    if (totalPublic === 0) {
      subtitle.textContent = 'Hiện chưa có tác phẩm công khai nào.';
    } else if (totalPublic <= discoverItems.length) {
      subtitle.textContent = `Hiển thị tất cả ${discoverItems.length} tác phẩm công khai.`;
    } else {
      subtitle.textContent = `Hiển thị ${discoverItems.length} gợi ý ngẫu nhiên trong tổng số ${totalPublic} tác phẩm công khai (tải lại để lấy mẫu mới).`;
    }
  }
  renderNovelsGrid(discoverItems);
}

function updateLoadMoreVisibility() {
  const wrap = $('home-load-more-wrap');
  const btn = $('home-load-more-btn');
  if (!wrap || !btn) return;
  wrap.hidden = !activeSearchKeyword || !searchHasMore;
  btn.disabled = false;
}

function novelCardMarkup(novel) {
  const safeTitle = escapeHtml(novel.title);
  const safeDesc = escapeHtml(novel.description);
  const readerHref = `reader.html?novel=${encodeURIComponent(novel.id)}`;

  const isDone = novel.status === 'Done';
  const statusClass = isDone ? 'badge-done' : 'badge-pending';
  const statusText = isDone ? 'Hoàn thành' : 'Đang sáng tác';
  const statusIcon = isDone ? 'fa-circle-check' : 'fa-clock';

  const chaptersCount = novel.chapterCount ?? (Array.isArray(novel.chapters) ? novel.chapters.length : 0);
  const chapterMetaText = chaptersCount > 0
    ? `<strong>${chaptersCount}</strong> chương công khai`
    : 'Chưa có chương công khai';
  const actionLabel = chaptersCount > 0 ? 'Đọc truyện' : 'Xem tác phẩm';
  const actionIcon = chaptersCount > 0 ? 'fa-book-open' : 'fa-eye';

  return `
    <div class="col-md-6 col-lg-4 animate-fade-in">
      <div class="card novel-card h-100 p-4 d-flex flex-column">
        <div class="d-flex align-items-center justify-content-between mb-3 gap-2 flex-wrap">
          <span class="badge badge-novel ${statusClass}">
            <i class="fa-solid ${statusIcon}"></i> ${statusText}
          </span>
        </div>

        <h3 class="h5 fw-bold mb-2 text-primary" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.8rem;">
          ${safeTitle}
        </h3>
        <p class="text-secondary small mb-4 flex-grow-1" style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; min-height: 4.2rem;">
          ${safeDesc}
        </p>

        <div class="pt-3 border-top mt-auto" style="border-color: var(--border-color) !important;">
          <div class="d-flex justify-content-between align-items-center text-secondary small mb-3">
            <span><i class="fa-solid fa-layer-group me-1"></i> ${chapterMetaText}</span>
          </div>

          <a class="btn btn-outline-novel w-100 btn-read-novel" href="${readerHref}" data-novel-id="${escapeHtml(novel.id)}">
            <i class="fa-solid ${actionIcon} text-primary me-2" aria-hidden="true"></i> ${actionLabel}
          </a>
        </div>
      </div>
    </div>
  `;
}

function renderNovelsGrid(novels, emptyTitle = 'Chưa có tác phẩm nào phù hợp', emptyDesc = 'Các tác phẩm công khai phù hợp sẽ xuất hiện tại đây.') {
  const gridContainer = $('published-novels-grid');
  if (!gridContainer) return;

  if (!Array.isArray(novels) || novels.length === 0) {
    gridContainer.innerHTML = `
      <div class="col-12">
        <div class="empty-state p-5 rounded-4" style="background-color: var(--bg-surface); border: 1px dashed var(--border-color);">
          <div class="empty-state-icon"><i class="fa-solid fa-feather"></i></div>
          <h4 class="fw-bold mb-2">${escapeHtml(emptyTitle)}</h4>
          <p class="text-secondary mb-0">${escapeHtml(emptyDesc)}</p>
        </div>
      </div>
    `;
    return;
  }

  gridContainer.innerHTML = novels.map(novelCardMarkup).join('');
}

async function runSearch(keyword, page = 1, append = false) {
  const seq = ++searchSeq;
  const params = new URLSearchParams({
    keyword,
    page: String(page),
    size: String(SEARCH_PAGE_SIZE)
  });
  const btn = $('home-load-more-btn');
  if (append && btn) btn.disabled = true;

  try {
    const result = await api('/studio/public/search?' + params.toString());
    const currentInput = ($('home-search-input')?.value || '').trim();
    if (seq !== searchSeq || currentInput !== keyword) return;

    activeSearchKeyword = keyword;
    searchPage = result.page || page;
    searchHasMore = Boolean(result.hasMore);
    const pageItems = Array.isArray(result.items) ? result.items : [];
    searchItems = append ? [...searchItems, ...pageItems] : pageItems;

    const heading = $('discover-heading');
    const subtitle = $('discover-subtitle');
    if (heading) heading.textContent = 'Kết quả tìm kiếm';
    if (subtitle) {
      subtitle.textContent = `Tìm thấy ${result.total ?? searchItems.length} tác phẩm công khai cho "${keyword}".`;
    }

    if (append) {
      const gridContainer = $('published-novels-grid');
      if (gridContainer && pageItems.length > 0) {
        gridContainer.insertAdjacentHTML('beforeend', pageItems.map(novelCardMarkup).join(''));
      }
    } else {
      renderNovelsGrid(
        searchItems,
        'Không tìm thấy tác phẩm phù hợp',
        'Thử từ khóa khác hoặc xóa từ khóa để quay lại danh sách gợi ý.'
      );
    }
    updateLoadMoreVisibility();
  } catch (error) {
    if (seq !== searchSeq) return;
    if (btn) btn.disabled = false;
    report(error);
  }
}

function setupSearchListener() {
  const searchInput = $('home-search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const keyword = e.target.value.trim();
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }

    if (!keyword) {
      searchSeq++;
      renderDiscoverView();
      return;
    }

    searchTimer = setTimeout(() => {
      searchTimer = null;
      runSearch(keyword, 1, false);
    }, SEARCH_DEBOUNCE_MS);
  });
}

function setupLoadMoreListener() {
  on($('home-load-more-btn'), 'click', async () => {
    if (!activeSearchKeyword || !searchHasMore) return;
    await runSearch(activeSearchKeyword, searchPage + 1, true);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIndexController);
} else {
  initIndexController();
}
