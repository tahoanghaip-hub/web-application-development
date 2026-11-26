/**
 * NOVELSTUDIO - EDITOR CONTROLLER (editorController.js)
 * Trang soạn thảo riêng: danh sách chương gọn, vùng viết ưu tiên, lịch sử phiên bản, chống mất dữ liệu.
 */

import { $, api, notify, on, report } from '../core/api.js';
import { sessionReady, escapeHtml } from '../app.js';

const studio = (path, method, data) => api('/studio' + path, method, data);

let activeNovel = null;
let activeChapter = null;
let dirty = false;
let saving = false;
let pendingSave = null;
let currentUrl = location.href;
let detailChapterId = null;
let handlingPopState = false;

function editorUrl(novelId, chapterId = '') {
  const params = new URLSearchParams();
  if (novelId) params.set('novel', novelId);
  if (chapterId) params.set('chapter', chapterId);
  return 'editor.html?' + params.toString();
}

function isDesktop() {
  return window.matchMedia('(min-width: 992px)').matches;
}

function closeMobileSidebar() {
  if (isDesktop()) return;
  const el = $('editor-sidebar');
  if (el && window.bootstrap) bootstrap.Offcanvas.getInstance(el)?.hide();
}

function hideHistoryOffcanvas() {
  const el = $('history-offcanvas');
  if (el && window.bootstrap) bootstrap.Offcanvas.getInstance(el)?.hide();
}

function showHistoryOffcanvas() {
  const el = $('history-offcanvas');
  if (el && window.bootstrap) bootstrap.Offcanvas.getOrCreateInstance(el).show();
}

function setSaveStatus(state, text) {
  const el = $('save-status');
  if (!el) return;
  el.dataset.state = state;
  el.textContent = text;
}

function updateWordCount() {
  const text = $('draft-editor-textarea')?.value || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  $('editor-word-count').textContent = `${words} từ · ${text.length} ký tự`;
}

function syncViewportHeight() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--vvh', `${Math.round(h)}px`);
}

function showEditorError(title, desc, canRetry = false) {
  $('editor-loading').hidden = true;
  $('editor-shell').hidden = true;
  $('editor-error-title').textContent = title;
  $('editor-error-desc').textContent = desc;
  $('editor-retry-btn').hidden = !canRetry;
  $('editor-error-state').hidden = false;
  document.title = 'NOVELSTUDIO — ' + title;
}

async function confirmAction(text, confirmText = 'Đồng ý', cancelText = 'Hủy') {
  const result = await Swal.fire({
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText
  });
  return result.isConfirmed;
}

async function promptChapterName(value = '') {
  const result = await Swal.fire({
    titleText: 'Tên chương',
    input: 'text',
    inputValue: value,
    confirmButtonText: 'Lưu',
    cancelButtonText: 'Hủy',
    showCancelButton: true,
    inputValidator: text => (text.trim().length < 2 ? 'Nhập ít nhất hai ký tự.' : undefined)
  });
  return result.isConfirmed ? result.value.trim() : null;
}

const confirmDiscard = () => !dirty || confirmAction('Rời chương và bỏ nội dung chưa lưu?', 'Rời đi', 'Ở lại');

function chapterPath(chapterId = activeChapter?.chapterId) {
  return '/novels/' + encodeURIComponent(activeNovel.id) + '/chapters/' + encodeURIComponent(chapterId);
}

function isChapterPublished(chapter) {
  return Boolean(chapter?.versions?.some(v => v.published));
}

function renderChapterList() {
  const listEl = $('chapter-list');
  const chapters = activeNovel?.chapters || [];
  $('chapter-count-badge').textContent = String(chapters.length);

  if (chapters.length === 0) {
    listEl.innerHTML = '<div class="p-3 small text-secondary text-center">Chưa có chương nào.</div>';
    return;
  }

  listEl.innerHTML = chapters.map((chap, idx) => {
    const isActive = activeChapter && String(chap.chapterId) === String(activeChapter.chapterId);
    const published = isChapterPublished(chap);
    const safeTitle = escapeHtml(chap.chapterTitle);
    const versionCount = Array.isArray(chap.versions) ? chap.versions.length : 0;

    return `
      <div class="compact-row ${isActive ? 'is-active' : ''}" data-chapter-id="${escapeHtml(chap.chapterId)}">
        <button type="button" class="compact-row-main btn-select-chapter"
          data-chapter-id="${escapeHtml(chap.chapterId)}"
          aria-current="${isActive ? 'true' : 'false'}">
          <span class="compact-row-num">Ch. ${idx + 1}</span>
          <span class="compact-row-text">
            <span class="compact-row-title">${safeTitle}</span>
            <span class="compact-row-sub">
              <span>${versionCount} bản</span>
            </span>
          </span>
        </button>
        <div class="compact-row-actions">
          <span class="compact-status-pill ${published ? 'is-published' : 'is-draft'}">
            ${published ? 'Công khai' : 'Nháp'}
          </span>
          <button type="button" class="btn btn-outline-novel btn-more-row btn-chapter-more"
            data-chapter-id="${escapeHtml(chap.chapterId)}"
            aria-label="Chi tiết và thao tác cho ${safeTitle}">
            <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderTimeline() {
  const history = activeChapter?.versions || [];
  const hasPublished = history.some(v => v.published);
  $('version-count-badge').textContent = history.length + ' bản';
  $('history-btn-count').textContent = String(history.length);
  $('unpublish').hidden = !hasPublished;
  $('history-unpublish-bar').hidden = !hasPublished;

  const badge = $('active-chapter-status-badge');
  if (activeChapter) {
    badge.className = 'compact-status-pill ' + (hasPublished ? 'is-published' : 'is-draft');
    badge.textContent = hasPublished ? 'Đã xuất bản' : 'Bản nháp';
  }

  $('version-timeline-list').innerHTML = history.map(version => {
    const timeText = new Date(version.timestamp).toLocaleString('vi-VN');
    const pubBadge = version.published
      ? '<span class="compact-status-pill is-published">Đang công khai</span>'
      : '<span class="compact-status-pill is-draft">Riêng tư</span>';
    return `
      <div class="timeline-item">
        <div class="timeline-marker"></div>
        <div class="timeline-content">
          <div class="d-flex align-items-start justify-content-between gap-2 mb-1">
            <div class="commit-title mb-0">${escapeHtml(version.commitMessage)}</div>
            ${pubBadge}
          </div>
          <div class="commit-meta">
            <span>${escapeHtml(timeText)}</span>
            <span>${version.content.length} ký tự</span>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <button type="button" class="btn-restore-version" data-version="${escapeHtml(version.versionId)}" data-action="restore">
              Khôi phục
            </button>
            <button type="button" class="btn-restore-version" data-version="${escapeHtml(version.versionId)}" data-action="publish" ${version.published ? 'disabled' : ''}>
              ${version.published ? 'Đang công khai' : 'Xuất bản'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('') || '<p class="text-secondary small mb-0">Chưa có phiên bản nào được lưu.</p>';
}

function syncHistoryUrl(chapterId, mode) {
  if (!activeNovel) return;
  const target = editorUrl(activeNovel.id, chapterId);
  if (mode === 'push') {
    history.pushState({ novelId: activeNovel.id, chapterId: chapterId || '' }, '', target);
  } else if (mode === 'replace') {
    history.replaceState({ novelId: activeNovel.id, chapterId: chapterId || '' }, '', target);
  }
  currentUrl = location.href;
}

function selectChapter(id, { historyMode = 'push' } = {}) {
  const chapters = activeNovel?.chapters || [];
  activeChapter = chapters.find(c => String(c.chapterId) === String(id)) || null;
  pendingSave = null;
  dirty = false;

  const hasChapter = Boolean(activeChapter);
  $('editor-empty-chapters').hidden = hasChapter;
  $('editor-writing-area').hidden = !hasChapter;
  $('save-version-btn').disabled = !hasChapter;
  $('chapter-settings-btn').disabled = !hasChapter;
  $('toggle-history-btn').disabled = !hasChapter;

  const editor = $('draft-editor-textarea');
  editor.disabled = !hasChapter;
  editor.value = activeChapter?.versions?.[0]?.content || '';
  $('commit-message-input').value = '';

  if (activeChapter) {
    $('toolbar-chapter-label').textContent = activeChapter.chapterTitle;
    $('active-chapter-heading').textContent = activeChapter.chapterTitle;
    setSaveStatus('idle', activeChapter.versions?.length ? 'Đã đồng bộ' : 'Chưa lưu phiên bản');
    document.title = `${activeChapter.chapterTitle} — ${activeNovel.title} | NOVELSTUDIO`;
  } else {
    $('toolbar-chapter-label').textContent = 'Chưa có chương';
    setSaveStatus('idle', 'Tạo chương để bắt đầu');
    document.title = `${activeNovel.title} — Soạn thảo | NOVELSTUDIO`;
  }

  updateWordCount();
  renderChapterList();
  renderTimeline();
  syncHistoryUrl(activeChapter?.chapterId || '', historyMode);
}

async function loadNovel({ preferredChapterId = null, historyMode = 'replace' } = {}) {
  const params = new URLSearchParams(location.search);
  const novelId = params.get('novel') || '';
  const requestedChapter = preferredChapterId ?? (params.get('chapter') || '');

  if (!novelId) {
    showEditorError('Thiếu mã tác phẩm', 'Hãy chọn một tác phẩm từ Trạm Sáng Tác để mở trang soạn thảo.');
    return;
  }

  $('editor-loading').hidden = false;
  $('editor-error-state').hidden = true;
  $('editor-shell').hidden = true;
  $('editor-notice').hidden = true;

  try {
    activeNovel = await studio('/novels/' + encodeURIComponent(novelId));
  } catch (error) {
    if (error.status === 401) {
      $('editor-loading').hidden = true;
      $('access-message').hidden = false;
      document.querySelector('main').hidden = true;
      return;
    }
    if (error.status === 403 || error.status === 404) {
      showEditorError(
        'Không có quyền truy cập hoặc tác phẩm không tồn tại',
        'Bạn không thể mở tác phẩm này bằng tài khoản hiện tại.'
      );
      return;
    }
    showEditorError(
      'Không tải được tác phẩm',
      'Đã xảy ra lỗi khi tải dữ liệu từ máy chủ. Vui lòng thử lại.',
      true
    );
    report(error);
    return;
  }

  $('editor-loading').hidden = true;
  $('editor-shell').hidden = false;
  $('editor-novel-title').textContent = activeNovel.title;

  const chapters = activeNovel.chapters || [];
  if (chapters.length === 0) {
    selectChapter('', { historyMode: 'replace' });
    return;
  }

  let target = chapters[0];
  if (requestedChapter) {
    const matched = chapters.find(c => String(c.chapterId) === String(requestedChapter));
    if (matched) {
      target = matched;
    } else {
      const notice = $('editor-notice');
      notice.textContent = 'Chương trong liên kết không còn tồn tại. Đã mở chương đầu tiên của tác phẩm.';
      notice.hidden = false;
    }
  }

  selectChapter(target.chapterId, { historyMode });
}

async function createChapterFlow() {
  closeMobileSidebar();
  if (activeChapter && !(await confirmDiscard())) return;
  const title = await promptChapterName();
  if (!title) return;
  const created = await studio('/novels/' + encodeURIComponent(activeNovel.id) + '/chapters', 'POST', {
    chapterTitle: title
  });
  await loadNovel({ preferredChapterId: created.chapterId, historyMode: 'push' });
  notify('Đã tạo chương.');
}

async function renameChapterFlow(chapter) {
  if (!chapter) return;
  const name = await promptChapterName(chapter.chapterTitle);
  if (!name) return;
  await studio(chapterPath(chapter.chapterId), 'PUT', { chapterTitle: name });
  chapter.chapterTitle = name;
  if (activeChapter && String(activeChapter.chapterId) === String(chapter.chapterId)) {
    $('toolbar-chapter-label').textContent = name;
    $('active-chapter-heading').textContent = name;
    document.title = `${name} — ${activeNovel.title} | NOVELSTUDIO`;
  }
  renderChapterList();
  notify('Đã đổi tên chương.');
}

async function deleteChapterFlow(chapter) {
  if (!chapter) return;
  if (!(await confirmAction('Xóa chương, nội dung đang soạn và toàn bộ lịch sử của chương?'))) return;
  const deletingActive = activeChapter && String(activeChapter.chapterId) === String(chapter.chapterId);
  await studio(chapterPath(chapter.chapterId), 'DELETE');
  if (deletingActive) dirty = false;
  const fallbackId = deletingActive ? '' : activeChapter?.chapterId;
  await loadNovel({ preferredChapterId: fallbackId, historyMode: 'replace' });
  notify('Đã xóa chương.');
}

async function unpublishChapterFlow(chapter) {
  if (!chapter) return;
  await studio(chapterPath(chapter.chapterId) + '/publication', 'DELETE');
  for (const v of chapter.versions || []) v.published = false;
  chapter.status = 'Draft';
  renderChapterList();
  if (activeChapter && String(activeChapter.chapterId) === String(chapter.chapterId)) {
    renderTimeline();
  }
  notify('Đã gỡ chương khỏi trang chủ.');
}

async function saveVersion() {
  if (saving || !activeChapter) return;
  const editor = $('draft-editor-textarea');
  const chapter = activeChapter;
  const content = editor.value;
  const message = $('commit-message-input').value;

  if (!content.trim()) {
    notify('Nhập nội dung trước khi lưu.', 'warning');
    return;
  }

  saving = true;
  $('save-version-btn').disabled = true;
  setSaveStatus('saving', 'Đang lưu…');

  try {
    if (pendingSave?.chapter !== chapter || pendingSave.content !== content || pendingSave.message !== message) {
      // getRandomValues also works on a plain HTTP LAN origin.
      const digits = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
      pendingSave = { chapter, content, message, requestId: digits };
    }
    const version = await studio(chapterPath(chapter.chapterId) + '/versions', 'POST', {
      content,
      commitMessage: message,
      requestId: pendingSave.requestId
    });
    pendingSave = null;
    chapter.versions.unshift(version);
    $('relogin-inline-btn').hidden = true;

    if (chapter === activeChapter) {
      dirty = editor.value !== content;
      if ($('commit-message-input').value === message) $('commit-message-input').value = '';
      setSaveStatus(
        dirty ? 'dirty' : 'saved',
        dirty ? 'Đã lưu phiên bản. Có chỉnh sửa mới chưa lưu.' : 'Đã lưu phiên bản.'
      );
      renderTimeline();
      renderChapterList();
    }
  } catch (error) {
    if (chapter === activeChapter) {
      dirty = true;
      setSaveStatus('error', 'Chưa xác nhận lưu. Nội dung vẫn ở đây. Bấm Lưu phiên bản để thử lại.');
      if (error.status === 401) {
        $('relogin-inline-btn').hidden = false;
      }
    }
    throw error;
  } finally {
    saving = false;
    $('save-version-btn').disabled = !activeChapter;
  }
}

function openChapterDetailModal(chapterId) {
  const idx = (activeNovel?.chapters || []).findIndex(c => String(c.chapterId) === String(chapterId));
  if (idx === -1) return;
  const chapter = activeNovel.chapters[idx];
  const published = isChapterPublished(chapter);
  const versions = Array.isArray(chapter.versions) ? chapter.versions : [];
  const latest = versions[0] || null;

  detailChapterId = chapter.chapterId;
  $('editor-detail-num').textContent = `Chương ${idx + 1} / ${activeNovel.chapters.length}`;
  $('editorChapterDetailTitle').textContent = chapter.chapterTitle;
  $('editor-detail-status-wrap').innerHTML = `
    <span class="compact-status-pill ${published ? 'is-published' : 'is-draft'}">
      ${published ? 'Đã xuất bản công khai' : 'Bản nháp riêng tư'}
    </span>
  `;
  $('editor-detail-versions').textContent = `${versions.length} phiên bản`;
  $('editor-detail-updated').textContent = latest?.timestamp
    ? new Date(latest.timestamp).toLocaleString('vi-VN')
    : 'Chưa lưu phiên bản';
  $('editor-detail-unpublish').hidden = !published;

  closeMobileSidebar();
  const modalEl = $('chapter-detail-modal');
  if (modalEl && window.bootstrap) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

function bindEvents() {
  on($('editor-retry-btn'), 'click', () => loadNovel({ historyMode: 'replace' }));

  on($('toggle-chapters-btn'), 'click', () => {
    const btn = $('toggle-chapters-btn');
    if (isDesktop()) {
      const collapsed = $('editor-workspace').classList.toggle('sidebar-collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
    } else {
      const el = $('editor-sidebar');
      if (el && window.bootstrap) bootstrap.Offcanvas.getOrCreateInstance(el).toggle();
    }
  });

  on($('toggle-history-btn'), 'click', showHistoryOffcanvas);
  on($('new-chapter-btn'), 'click', createChapterFlow);
  on($('empty-new-chapter-btn'), 'click', createChapterFlow);
  on($('rename-chapter'), 'click', () => renameChapterFlow(activeChapter));
  on($('delete-chapter'), 'click', () => deleteChapterFlow(activeChapter));
  on($('unpublish'), 'click', () => unpublishChapterFlow(activeChapter));
  on($('history-unpublish-btn'), 'click', () => unpublishChapterFlow(activeChapter));

  on($('chapter-list'), 'click', async (event) => {
    const moreBtn = event.target.closest('.btn-chapter-more');
    if (moreBtn) {
      openChapterDetailModal(moreBtn.dataset.chapterId);
      return;
    }
    const selectBtn = event.target.closest('.btn-select-chapter');
    if (!selectBtn) return;
    const targetId = selectBtn.dataset.chapterId;
    if (activeChapter && String(targetId) === String(activeChapter.chapterId)) {
      closeMobileSidebar();
      return;
    }
    closeMobileSidebar();
    if (await confirmDiscard()) {
      selectChapter(targetId, { historyMode: 'push' });
    }
  });

  const hideDetailModal = () => {
    const modalEl = $('chapter-detail-modal');
    if (modalEl && window.bootstrap) bootstrap.Modal.getInstance(modalEl)?.hide();
  };

  const getDetailChapter = () =>
    (activeNovel?.chapters || []).find(c => String(c.chapterId) === String(detailChapterId)) || null;

  on($('editor-detail-open'), 'click', async () => {
    const chapter = getDetailChapter();
    hideDetailModal();
    if (!chapter) return;
    if (activeChapter && String(chapter.chapterId) === String(activeChapter.chapterId)) return;
    if (await confirmDiscard()) {
      selectChapter(chapter.chapterId, { historyMode: 'push' });
    }
  });

  on($('editor-detail-rename'), 'click', async () => {
    const chapter = getDetailChapter();
    hideDetailModal();
    await renameChapterFlow(chapter);
  });

  on($('editor-detail-unpublish'), 'click', async () => {
    const chapter = getDetailChapter();
    hideDetailModal();
    await unpublishChapterFlow(chapter);
  });

  on($('editor-detail-delete'), 'click', async () => {
    const chapter = getDetailChapter();
    hideDetailModal();
    await deleteChapterFlow(chapter);
  });

  const editor = $('draft-editor-textarea');
  on(editor, 'input', () => {
    dirty = true;
    setSaveStatus('dirty', 'Có thay đổi chưa lưu.');
    updateWordCount();
  });

  on(editor, 'keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveVersion().catch(report);
    }
  });

  on($('save-version-btn'), 'click', saveVersion);

  on($('version-timeline-list'), 'click', async (event) => {
    const button = event.target.closest('[data-version]');
    if (!button || !activeChapter) return;
    const publishing = button.dataset.action === 'publish';
    const versionId = button.dataset.version;

    // Close offcanvas before SweetAlert2 modal to prevent Bootstrap FocusTrap interference.
    hideHistoryOffcanvas();
    const ok = await confirmAction(
      publishing
        ? 'Công khai nội dung phiên bản này trên trang chủ?'
        : 'Tạo bản mới từ phiên bản này và thay nội dung đang soạn?'
    );
    if (!ok) {
      showHistoryOffcanvas();
      return;
    }

    const chapter = activeChapter;
    const path = chapterPath(chapter.chapterId) + '/versions/' + encodeURIComponent(versionId);
    if (publishing) {
      await studio(path + '/publish', 'PUT');
      for (const v of chapter.versions) v.published = String(v.versionId) === String(versionId);
      chapter.status = 'Published';
      notify('Đã xuất bản.');
      renderChapterList();
      renderTimeline();
      showHistoryOffcanvas();
    } else {
      const version = await studio(path + '/restore', 'POST');
      chapter.versions.unshift(version);
      if (activeChapter === chapter) {
        selectChapter(chapter.chapterId, { historyMode: 'none' });
      }
      notify('Đã khôi phục thành một phiên bản mới.');
    }
  });

  on($('back-to-studio-btn'), 'click', async (event) => {
    if (!dirty) return;
    event.preventDefault();
    const targetHref = event.currentTarget.href;
    if (await confirmDiscard()) {
      dirty = false;
      location.assign(targetHref);
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  window.addEventListener('popstate', async () => {
    if (!activeNovel || handlingPopState) return;
    const params = new URLSearchParams(location.search);
    const targetId = params.get('chapter') || '';
    if (activeChapter && String(targetId) === String(activeChapter.chapterId)) {
      currentUrl = location.href;
      return;
    }
    if (dirty) {
      handlingPopState = true;
      try {
        if (!(await confirmDiscard())) {
          history.pushState({ novelId: activeNovel.id, chapterId: activeChapter?.chapterId || '' }, '', currentUrl);
          return;
        }
      } finally {
        handlingPopState = false;
      }
    }
    selectChapter(targetId || activeNovel.chapters?.[0]?.chapterId || '', { historyMode: 'none' });
  });

  window.addEventListener('session-expired', () => {
    if (activeNovel) {
      $('relogin-inline-btn').hidden = false;
    }
  });

  window.addEventListener('session-restored', () => {
    $('relogin-inline-btn').hidden = true;
    if (dirty) {
      setSaveStatus('dirty', 'Đã đăng nhập lại. Bấm Lưu phiên bản để lưu.');
    }
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewportHeight);
  }
  window.addEventListener('resize', syncViewportHeight);
}

async function init() {
  syncViewportHeight();
  bindEvents();
  const user = await sessionReady;
  $('session-loading').hidden = true;
  if (!user) return;
  await loadNovel({ historyMode: 'replace' });
}

init().catch(error => {
  $('session-loading').hidden = true;
  showEditorError('Chưa tải được trang soạn thảo', 'Vui lòng tải lại trang để thử lại.', true);
  report(error);
});
