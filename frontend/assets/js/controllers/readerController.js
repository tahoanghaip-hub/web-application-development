/**
 * NOVELSTUDIO - READER CONTROLLER (readerController.js)
 * Trang đọc truyện công khai cho khách & tác giả: hỗ trợ URL chia sẻ, Back/Forward và mục lục responsive.
 */

import { $, api, notify, on, report } from '../core/api.js';
import { escapeHtml } from '../app.js';

let activeNovel = null;
let activeChapterId = null;
let detailChapterId = null;
let chapterLoadSeq = 0;

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

function renderChapterContent(chapterMeta, chapterData, chapterIndex) {
  activeChapterId = chapterMeta.chapterId;
  $('reader-chapter-unavailable').hidden = true;
  $('reader-article').hidden = false;

  $('reader-chapter-title').textContent = chapterData?.chapterTitle || chapterMeta.chapterTitle;
  const ts = chapterData?.timestamp || chapterMeta.timestamp;
  const formattedTime = ts ? new Date(ts).toLocaleString('vi-VN') : 'Chưa rõ';
  $('reader-version-info').innerHTML = `
    <i class="fa-solid fa-code-commit text-primary me-1" aria-hidden="true"></i>
    Bản tác giả đã xuất bản (${escapeHtml(formattedTime)})
  `;
  $('reader-content-body').textContent = chapterData?.content || '(Nội dung bản thảo rỗng)';

  renderToc(activeNovel.chapters, activeChapterId);
  updatePrevNext(activeNovel.chapters, chapterIndex);
  document.title = `${chapterData?.chapterTitle || chapterMeta.chapterTitle} — ${activeNovel.title} | NOVELSTUDIO`;
}

function renderChapterUnavailable() {
  const chapters = activeNovel.chapters;
  activeChapterId = null;
  $('reader-article').hidden = true;
  $('reader-chapter-unavailable').hidden = false;
  const firstHref = readerUrl(activeNovel.id, chapters[0].chapterId);
  const firstBtn = $('reader-open-first-chapter');
  firstBtn.href = firstHref;
  firstBtn.dataset.chapterId = chapters[0].chapterId;
  renderToc(chapters, null);
  document.title = `${activeNovel.title} — Chương không khả dụng | NOVELSTUDIO`;
}

async function fetchAndRenderChapter(chapterId) {
  if (!activeNovel) return;
  const chapters = activeNovel.chapters || [];
  const chapterIndex = chapters.findIndex(c => String(c.chapterId) === String(chapterId));
  if (chapterIndex === -1) {
    renderChapterUnavailable();
    return;
  }

  const seq = ++chapterLoadSeq;
  try {
    const chapterData = await api(
      '/studio/public/novels/' + encodeURIComponent(activeNovel.id) + '/chapters/' + encodeURIComponent(chapterId)
    );
    if (seq !== chapterLoadSeq) return;
    renderChapterContent(chapters[chapterIndex], chapterData, chapterIndex);
  } catch (error) {
    if (seq !== chapterLoadSeq) return;
    if (error.status === 404) {
      renderChapterUnavailable();
      return;
    }
    report(error);
  }
}

async function loadPublicNovel({ replaceIfDefault = true } = {}) {
  const params = new URLSearchParams(location.search);
  const novelId = params.get('novel') || '';
  const requestedChapter = params.get('chapter') || '';

  if (!novelId) {
    showLoadError('Chưa chọn tác phẩm', 'Liên kết đọc truyện thiếu mã tác phẩm. Vui lòng chọn truyện từ trang Khám phá.');
    return;
  }

  $('reader-loading').hidden = false;
  $('reader-error').hidden = true;
  $('reader-shell').hidden = true;

  const query = new URLSearchParams();
  if (requestedChapter) {
    query.set('chapter', requestedChapter);
  } else {
    query.set('includeDefault', '1');
  }

  let data;
  try {
    data = await api('/studio/public/novels/' + encodeURIComponent(novelId) + '?' + query.toString());
  } catch (error) {
    if (error.status === 404) {
      showLoadError(
        'Tác phẩm không tồn tại hoặc chưa công khai',
        'Tác phẩm này chưa có chương nào được xuất bản công khai hoặc không còn khả dụng.'
      );
      return;
    }
    showLoadError('Chưa tải được nội dung truyện', 'Không thể kết nối tới thư viện công khai. Vui lòng thử lại.', true);
    report(error);
    return;
  }

  activeNovel = data;
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
  if (!requestedChapter) {
    const firstId = chapters[0].chapterId;
    if (replaceIfDefault) {
      history.replaceState({ novelId: activeNovel.id, chapterId: firstId }, '', readerUrl(activeNovel.id, firstId));
    }
    if (activeNovel.activeChapter) {
      renderChapterContent(chapters[0], activeNovel.activeChapter, 0);
    } else {
      await fetchAndRenderChapter(firstId);
    }
    return;
  }

  const chapterIndex = chapters.findIndex(c => String(c.chapterId) === String(requestedChapter));
  if (chapterIndex === -1 || !activeNovel.activeChapter) {
    renderChapterUnavailable();
    return;
  }

  renderChapterContent(chapters[chapterIndex], activeNovel.activeChapter, chapterIndex);
}

function navigateToChapter(chapterId) {
  if (!activeNovel || !chapterId) return;
  if (String(chapterId) === String(activeChapterId) && !$('reader-article').hidden) {
    closeMobileToc();
    return;
  }
  const url = readerUrl(activeNovel.id, chapterId);
  history.pushState({ novelId: activeNovel.id, chapterId }, '', url);
  closeMobileToc();
  window.scrollTo({ top: 0, behavior: 'auto' });
  fetchAndRenderChapter(chapterId);
}

function openChapterDetailModal(chapterId) {
  if (!activeNovel) return;
  const index = activeNovel.chapters.findIndex(c => String(c.chapterId) === String(chapterId));
  if (index === -1) return;

  const chapter = activeNovel.chapters[index];
  const latest = Array.isArray(chapter.versions) ? chapter.versions[0] : null;
  const ts = chapter.timestamp || latest?.timestamp;
  let words = chapter.wordCount;
  let chars = chapter.charCount;
  if (words === undefined || chars === undefined) {
    const content = latest?.content || '';
    words = content.trim() ? content.trim().split(/\s+/).length : 0;
    chars = content.length;
  }

  detailChapterId = chapter.chapterId;
  $('detail-chapter-num').textContent = `Chương ${index + 1} / ${activeNovel.chapters.length}`;
  $('chapterDetailTitle').textContent = chapter.chapterTitle;
  $('detail-chapter-time').textContent = ts
    ? new Date(ts).toLocaleString('vi-VN')
    : 'Chưa rõ';
  $('detail-chapter-length').textContent = `${words} từ · ${chars} ký tự`;

  const readBtn = $('detail-chapter-read');
  readBtn.href = readerUrl(activeNovel.id, chapter.chapterId);
  readBtn.dataset.chapterId = chapter.chapterId;

  closeMobileToc();
  const modalEl = $('chapter-detail-modal');
  if (modalEl && window.bootstrap) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
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
  on($('reader-retry-btn'), 'click', () => loadPublicNovel({ replaceIfDefault: true }));

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
    const params = new URLSearchParams(location.search);
    const novelId = params.get('novel') || '';
    const requestedChapter = params.get('chapter') || '';
    if (!activeNovel || String(novelId) !== String(activeNovel.id)) {
      loadPublicNovel({ replaceIfDefault: false });
      return;
    }
    fetchAndRenderChapter(requestedChapter || activeNovel.chapters?.[0]?.chapterId || '');
  });
}

function initReaderController() {
  bindEvents();
  loadPublicNovel({ replaceIfDefault: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReaderController);
} else {
  initReaderController();
}
