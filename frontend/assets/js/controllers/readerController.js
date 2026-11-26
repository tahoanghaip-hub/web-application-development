/**
 * NOVELSTUDIO - READER CONTROLLER (readerController.js)
 * Trang đọc truyện công khai cho khách & tác giả: hỗ trợ URL chia sẻ, Back/Forward và mục lục responsive.
 */

import { $, api, notify, on, report } from '../core/api.js';
import { escapeHtml } from '../app.js';

let publicNovels = [];
let activeNovel = null;
let activeChapterId = null;
let detailChapterId = null;

function readerUrl(novelId, chapterId = '') {
  const params = new URLSearchParams();
  if (novelId) params.set('novel', novelId);
  if (chapterId) params.set('chapter', chapterId);
  return 'reader.html?' + params.toString();
}

function isDesktop() {
  return window.matchMedia('(min-width: 992px)').matches;
}

function closeMobileToc() {
  if (isDesktop()) return;
  const panel = $('reader-toc-panel');
  if (panel && window.bootstrap) {
    bootstrap.Offcanvas.getInstance(panel)?.hide();
  }
}

function openMobileToc() {
  const panel = $('reader-toc-panel');
  if (panel && window.bootstrap) {
    bootstrap.Offcanvas.getOrCreateInstance(panel).show();
  }
}

function showLoadError(title, desc, canRetry = false) {
  $('reader-loading').hidden = true;
  $('reader-shell').hidden = true;
  $('reader-error-title').textContent = title;
  $('reader-error-desc').textContent = desc;
  $('reader-retry-btn').hidden = !canRetry;
  $('reader-error').hidden = false;
  document.title = 'NOVELSTUDIO — ' + title;
}

function renderToc(chapters, currentChapterId) {
  const listEl = $('reader-toc-list');
  $('reader-toc-count').textContent = String(chapters.length);

  listEl.innerHTML = chapters.map((chap, idx) => {
    const isActive = String(chap.chapterId) === String(currentChapterId);
    const safeTitle = escapeHtml(chap.chapterTitle);
    const href = readerUrl(activeNovel.id, chap.chapterId);

    return `
      <div class="compact-row ${isActive ? 'is-active' : ''}" data-chapter-id="${escapeHtml(chap.chapterId)}">
        <a class="compact-row-main reader-toc-link" href="${href}" data-chapter-id="${escapeHtml(chap.chapterId)}">
          <span class="compact-row-num">Ch. ${idx + 1}</span>
          <span class="compact-row-text">
            <span class="compact-row-title">${safeTitle}</span>
            <span class="compact-row-sub">
              <span>${isActive ? 'Đang đọc' : 'Đã xuất bản'}</span>
            </span>
          </span>
        </a>
        <div class="compact-row-actions">
          <span class="compact-status-pill is-published d-none d-sm-inline-flex">Công khai</span>
          <button type="button" class="btn btn-outline-novel btn-more-row btn-toc-more"
            data-chapter-id="${escapeHtml(chap.chapterId)}"
            aria-label="Thông tin và thao tác cho ${safeTitle}">
            <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function updatePrevNext(chapters, index) {
  const prevBtn = $('reader-prev-btn');
  const nextBtn = $('reader-next-btn');

  if (index > 0) {
    const prev = chapters[index - 1];
    prevBtn.href = readerUrl(activeNovel.id, prev.chapterId);
    prevBtn.dataset.chapterId = prev.chapterId;
    prevBtn.classList.remove('disabled');
    prevBtn.removeAttribute('aria-disabled');
    prevBtn.removeAttribute('tabindex');
  } else {
    prevBtn.href = '#';
    delete prevBtn.dataset.chapterId;
    prevBtn.classList.add('disabled');
    prevBtn.setAttribute('aria-disabled', 'true');
    prevBtn.setAttribute('tabindex', '-1');
  }

  if (index >= 0 && index < chapters.length - 1) {
    const next = chapters[index + 1];
    nextBtn.href = readerUrl(activeNovel.id, next.chapterId);
    nextBtn.dataset.chapterId = next.chapterId;
    nextBtn.classList.remove('disabled');
    nextBtn.removeAttribute('aria-disabled');
    nextBtn.removeAttribute('tabindex');
  } else {
    nextBtn.href = '#';
    delete nextBtn.dataset.chapterId;
    nextBtn.classList.add('disabled');
    nextBtn.setAttribute('aria-disabled', 'true');
    nextBtn.setAttribute('tabindex', '-1');
  }
}

function renderNovelMeta() {
  const statusLabel = activeNovel.status === 'Done' ? 'Hoàn thành' : 'Đang sáng tác';
  const deadlineLabel = activeNovel.deadline
    ? new Date(activeNovel.deadline).toLocaleDateString('vi-VN')
    : 'Không có hạn';
  const count = activeNovel.chapters.length;

  $('reader-topbar-title').textContent = activeNovel.title;
  $('reader-novel-title').textContent = activeNovel.title;
  $('reader-novel-meta').textContent = `${statusLabel} • ${count} chương công khai`;
  $('reader-toc-novel-meta').innerHTML = `
    <div class="fw-bold text-body mb-1 text-break">${escapeHtml(activeNovel.title)}</div>
    <div>${escapeHtml(statusLabel)} • Hạn: ${escapeHtml(deadlineLabel)}</div>
  `;
}

function renderFromUrl({ replaceIfDefault = true } = {}) {
  const params = new URLSearchParams(location.search);
  const novelId = params.get('novel') || '';
  const requestedChapter = params.get('chapter') || '';

  if (!novelId) {
    showLoadError('Chưa chọn tác phẩm', 'Liên kết đọc truyện thiếu mã tác phẩm. Vui lòng chọn truyện từ trang Khám phá.');
    return;
  }

  activeNovel = publicNovels.find(book => String(book.id) === String(novelId)) || null;
  if (!activeNovel || !Array.isArray(activeNovel.chapters) || activeNovel.chapters.length === 0) {
    showLoadError(
      'Tác phẩm không tồn tại hoặc chưa công khai',
      'Tác phẩm này chưa có chương nào được xuất bản công khai hoặc không còn khả dụng.'
    );
    return;
  }

  $('reader-loading').hidden = true;
  $('reader-error').hidden = true;
  $('reader-shell').hidden = false;
  renderNovelMeta();

  const chapters = activeNovel.chapters;
  let chapterIndex = -1;

  if (!requestedChapter) {
    chapterIndex = 0;
    const firstId = chapters[0].chapterId;
    if (replaceIfDefault) {
      history.replaceState({ novelId: activeNovel.id, chapterId: firstId }, '', readerUrl(activeNovel.id, firstId));
    }
  } else {
    chapterIndex = chapters.findIndex(c => String(c.chapterId) === String(requestedChapter));
  }

  if (chapterIndex === -1) {
    activeChapterId = null;
    $('reader-article').hidden = true;
    $('reader-chapter-unavailable').hidden = false;
    const firstHref = readerUrl(activeNovel.id, chapters[0].chapterId);
    const firstBtn = $('reader-open-first-chapter');
    firstBtn.href = firstHref;
    firstBtn.dataset.chapterId = chapters[0].chapterId;
    renderToc(chapters, null);
    document.title = `${activeNovel.title} — Chương không khả dụng | NOVELSTUDIO`;
    return;
  }

  const chapter = chapters[chapterIndex];
  activeChapterId = chapter.chapterId;
  $('reader-chapter-unavailable').hidden = true;
  $('reader-article').hidden = false;

  $('reader-chapter-title').textContent = chapter.chapterTitle;
  const latestVersion = Array.isArray(chapter.versions) ? chapter.versions[0] : null;
  const formattedTime = latestVersion?.timestamp
    ? new Date(latestVersion.timestamp).toLocaleString('vi-VN')
    : 'Chưa rõ';
  $('reader-version-info').innerHTML = `
    <i class="fa-solid fa-code-commit text-primary me-1" aria-hidden="true"></i>
    Bản tác giả đã xuất bản (${escapeHtml(formattedTime)})
  `;
  $('reader-content-body').textContent = latestVersion?.content || '(Nội dung bản thảo rỗng)';

  renderToc(chapters, activeChapterId);
  updatePrevNext(chapters, chapterIndex);
  document.title = `${chapter.chapterTitle} — ${activeNovel.title} | NOVELSTUDIO`;
}

function navigateToChapter(chapterId) {
  if (!activeNovel || !chapterId) return;
  if (String(chapterId) === String(activeChapterId) && !$('reader-article').hidden) {
    closeMobileToc();
    return;
  }
  const url = readerUrl(activeNovel.id, chapterId);
  history.pushState({ novelId: activeNovel.id, chapterId }, '', url);
  renderFromUrl({ replaceIfDefault: false });
  closeMobileToc();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function openChapterDetailModal(chapterId) {
  if (!activeNovel) return;
  const index = activeNovel.chapters.findIndex(c => String(c.chapterId) === String(chapterId));
  if (index === -1) return;

  const chapter = activeNovel.chapters[index];
  const latest = Array.isArray(chapter.versions) ? chapter.versions[0] : null;
  const content = latest?.content || '';
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  detailChapterId = chapter.chapterId;
  $('detail-chapter-num').textContent = `Chương ${index + 1} / ${activeNovel.chapters.length}`;
  $('chapterDetailTitle').textContent = chapter.chapterTitle;
  $('detail-chapter-time').textContent = latest?.timestamp
    ? new Date(latest.timestamp).toLocaleString('vi-VN')
    : 'Chưa rõ';
  $('detail-chapter-length').textContent = `${words} từ · ${content.length} ký tự`;

  const readBtn = $('detail-chapter-read');
  readBtn.href = readerUrl(activeNovel.id, chapter.chapterId);
  readBtn.dataset.chapterId = chapter.chapterId;

  closeMobileToc();
  const modalEl = $('chapter-detail-modal');
  if (modalEl && window.bootstrap) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

async function loadPublicData() {
  $('reader-loading').hidden = false;
  $('reader-error').hidden = true;
  $('reader-shell').hidden = true;
  try {
    publicNovels = await api('/studio/public');
    renderFromUrl({ replaceIfDefault: true });
  } catch (error) {
    showLoadError('Chưa tải được nội dung truyện', 'Không thể kết nối tới thư viện công khai. Vui lòng thử lại.', true);
    report(error);
  }
}

function handleInternalChapterClick(event, linkEl) {
  if (!linkEl) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const targetId = linkEl.dataset.chapterId;
  if (!targetId) return;
  event.preventDefault();
  navigateToChapter(targetId);
}

function bindEvents() {
  on($('reader-retry-btn'), 'click', loadPublicData);

  const toggleBtn = $('reader-toc-toggle');
  on(toggleBtn, 'click', () => {
    if (isDesktop()) {
      const collapsed = $('reader-shell').classList.toggle('toc-collapsed');
      toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    } else {
      const panel = $('reader-toc-panel');
      if (panel && window.bootstrap) {
        bootstrap.Offcanvas.getOrCreateInstance(panel).toggle();
      }
    }
  });

  on($('reader-nav-toc-btn'), 'click', openMobileToc);
  on($('reader-unavailable-toc-btn'), 'click', openMobileToc);

  on($('reader-toc-list'), 'click', (event) => {
    const moreBtn = event.target.closest('.btn-toc-more');
    if (moreBtn) {
      openChapterDetailModal(moreBtn.dataset.chapterId);
      return;
    }
    const link = event.target.closest('a.reader-toc-link');
    handleInternalChapterClick(event, link);
  });

  on($('reader-prev-btn'), 'click', (event) => {
    const btn = event.currentTarget;
    if (btn.classList.contains('disabled')) {
      event.preventDefault();
      return;
    }
    handleInternalChapterClick(event, btn);
  });

  on($('reader-next-btn'), 'click', (event) => {
    const btn = event.currentTarget;
    if (btn.classList.contains('disabled')) {
      event.preventDefault();
      return;
    }
    handleInternalChapterClick(event, btn);
  });

  on($('reader-open-first-chapter'), 'click', (event) => {
    handleInternalChapterClick(event, event.currentTarget);
  });

  on($('detail-chapter-read'), 'click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const modalEl = $('chapter-detail-modal');
    if (modalEl && window.bootstrap) {
      bootstrap.Modal.getInstance(modalEl)?.hide();
    }
    navigateToChapter(event.currentTarget.dataset.chapterId);
  });

  on($('detail-chapter-copy'), 'click', async () => {
    if (!activeNovel || !detailChapterId) return;
    const fullUrl = new URL(readerUrl(activeNovel.id, detailChapterId), location.href).href;
    try {
      await navigator.clipboard.writeText(fullUrl);
      notify('Đã sao chép liên kết chương.');
    } catch {
      notify('Không thể tự sao chép. Bạn có thể chép liên kết từ thanh địa chỉ.', 'info');
    }
  });

  window.addEventListener('popstate', () => {
    if (publicNovels.length) {
      renderFromUrl({ replaceIfDefault: false });
    }
  });
}

function initReaderController() {
  bindEvents();
  loadPublicData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReaderController);
} else {
  initReaderController();
}
