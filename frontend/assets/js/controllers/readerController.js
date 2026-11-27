/**
 * NOVELSTUDIO - READER CONTROLLER (readerController.js)
 * Trang đọc truyện công khai cho khách & tác giả: hỗ trợ URL chia sẻ, Back/Forward, mục lục responsive và bình luận theo chương.
 */

import { $, api, notify, on, report } from '../core/api.js';
import { escapeHtml, getAccount, sessionReady } from '../app.js';

const COMMENTS_PAGE_SIZE = 10;
const REPLIES_PAGE_SIZE = 5;
const COMMENT_MAX_LENGTH = 1000;

let activeNovel = null;
let activeChapterId = null;
let detailChapterId = null;
let chapterLoadSeq = 0;

let commentsLoadSeq = 0;
let commentsPage = 1;
let commentsHasMore = false;
let commentsTotal = 0;
let commentsItems = [];
let submittingComment = false;
let pendingComment = null;
let activeReplyParentId = null;
const replyState = new Map();

function newUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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

function resetCommentsState() {
  commentsLoadSeq++;
  commentsPage = 1;
  commentsHasMore = false;
  commentsTotal = 0;
  commentsItems = [];
  pendingComment = null;
  activeReplyParentId = null;
  replyState.clear();
  if ($('comments-list')) $('comments-list').replaceChildren();
  if ($('comments-count-badge')) $('comments-count-badge').textContent = '0';
  if ($('comments-loading')) $('comments-loading').hidden = true;
  if ($('comments-error')) $('comments-error').hidden = true;
  if ($('comments-empty')) $('comments-empty').hidden = true;
  if ($('comments-load-more-wrap')) $('comments-load-more-wrap').hidden = true;
  if ($('comment-submit-error')) {
    $('comment-submit-error').hidden = true;
    $('comment-submit-error').textContent = '';
  }
  if ($('reader-comments-section')) $('reader-comments-section').hidden = true;
}

function clearRenderedChapter() {
  activeChapterId = null;
  $('reader-chapter-title').textContent = '';
  $('reader-version-info').textContent = '';
  $('reader-content-body').textContent = '';
  resetCommentsState();
}

function showLoadError(title, desc, canRetry = false) {
  activeNovel = null;
  clearRenderedChapter();
  $('reader-toc-list').replaceChildren();
  $('reader-toc-count').textContent = '0';
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
  const count = activeNovel.chapters.length;

  $('reader-topbar-title').textContent = activeNovel.title;
  $('reader-novel-title').textContent = activeNovel.title;
  $('reader-novel-meta').textContent = count > 0
    ? `${statusLabel} • ${count} chương công khai`
    : `${statusLabel} • Chưa có chương công khai`;
  $('reader-toc-novel-meta').innerHTML = `
    <div class="fw-bold text-body mb-1 text-break">${escapeHtml(activeNovel.title)}</div>
    <div>${escapeHtml(statusLabel)} • ${count > 0 ? `${count} chương công khai` : 'Chưa có chương công khai'}</div>
  `;
}

function renderEmptyPublicNovel() {
  clearRenderedChapter();
  $('reader-article').hidden = true;
  $('reader-chapter-unavailable').hidden = true;
  $('reader-empty-chapters').hidden = false;
  const isDone = activeNovel.status === 'Done';
  const statusEl = $('reader-empty-status');
  statusEl.className = 'badge badge-novel ' + (isDone ? 'badge-done' : 'badge-pending');
  statusEl.textContent = isDone ? 'Hoàn thành' : 'Đang sáng tác';
  $('reader-empty-title').textContent = activeNovel.title;
  $('reader-empty-desc').textContent = activeNovel.description || '';
  renderToc([], null);
  document.title = `${activeNovel.title} | NOVELSTUDIO`;
}

function renderChapterContent(chapterMeta, chapterData, chapterIndex) {
  const changedChapter = String(activeChapterId) !== String(chapterMeta.chapterId);
  activeChapterId = chapterMeta.chapterId;
  $('reader-empty-chapters').hidden = true;
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

  if (changedChapter || $('reader-comments-section').hidden) {
    resetCommentsState();
    $('reader-comments-section').hidden = false;
    syncCommentComposerAuth(getAccount());
    loadComments(activeChapterId, 1, false);
  }
}

function renderChapterUnavailable() {
  const chapters = activeNovel?.chapters || [];
  clearRenderedChapter();
  $('reader-empty-chapters').hidden = true;
  $('reader-article').hidden = true;
  $('reader-chapter-unavailable').hidden = false;
  const firstBtn = $('reader-open-first-chapter');
  if (chapters.length > 0) {
    firstBtn.hidden = false;
    firstBtn.href = readerUrl(activeNovel.id, chapters[0].chapterId);
    firstBtn.dataset.chapterId = chapters[0].chapterId;
  } else {
    firstBtn.hidden = true;
  }
  renderToc(chapters, null);
  document.title = `${activeNovel.title} — Chương không khả dụng | NOVELSTUDIO`;
}

async function handleChapterGone404(novelId, seq) {
  clearRenderedChapter();
  try {
    const refreshed = await api('/studio/public/novels/' + encodeURIComponent(novelId));
    if (seq !== chapterLoadSeq) return;
    activeNovel = refreshed;
    renderNovelMeta();
    if (!Array.isArray(activeNovel.chapters) || activeNovel.chapters.length === 0) {
      renderEmptyPublicNovel();
    } else {
      renderChapterUnavailable();
    }
  } catch (novelErr) {
    if (seq !== chapterLoadSeq) return;
    if (novelErr.status === 404) {
      showLoadError(
        'Tác phẩm không tồn tại hoặc chưa công khai',
        'Tác phẩm này không còn công khai hoặc không tồn tại.'
      );
      return;
    }
    report(novelErr);
  }
}

async function fetchAndRenderChapter(chapterId) {
  if (!activeNovel) return;
  const novelId = activeNovel.id;
  const seq = ++chapterLoadSeq;
  try {
    const chapterData = await api(
      '/studio/public/novels/' + encodeURIComponent(novelId) + '/chapters/' + encodeURIComponent(chapterId)
    );
    if (seq !== chapterLoadSeq) return;
    const chapters = activeNovel?.chapters || [];
    const chapterIndex = chapters.findIndex(c => String(c.chapterId) === String(chapterId));
    if (chapterIndex === -1) {
      await loadPublicNovel({ replaceIfDefault: false });
      return;
    }
    renderChapterContent(chapters[chapterIndex], chapterData, chapterIndex);
  } catch (error) {
    if (seq !== chapterLoadSeq) return;
    if (error.status === 404) {
      await handleChapterGone404(novelId, seq);
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
  clearRenderedChapter();

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
        'Tác phẩm này không còn công khai hoặc không tồn tại.'
      );
      return;
    }
    showLoadError('Chưa tải được nội dung truyện', 'Không thể kết nối tới thư viện công khai. Vui lòng thử lại.', true);
    report(error);
    return;
  }

  activeNovel = data;
  if (!activeNovel || !Array.isArray(activeNovel.chapters)) {
    showLoadError(
      'Tác phẩm không tồn tại hoặc chưa công khai',
      'Tác phẩm này không còn công khai hoặc không tồn tại.'
    );
    return;
  }

  $('reader-loading').hidden = true;
  $('reader-error').hidden = true;
  $('reader-shell').hidden = false;
  renderNovelMeta();

  const chapters = activeNovel.chapters;
  if (chapters.length === 0) {
    renderEmptyPublicNovel();
    return;
  }

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

/* ============================================================
   CHAPTER COMMENTS & 1-LEVEL REPLIES
   ============================================================ */
function syncCommentComposerAuth(user) {
  const loggedIn = Boolean(user);
  if ($('comments-guest-prompt')) $('comments-guest-prompt').hidden = loggedIn;
  if ($('comment-form')) $('comment-form').hidden = !loggedIn;
  if (!loggedIn) activeReplyParentId = null;
  if (activeChapterId && !$('reader-comments-section').hidden) {
    renderComments();
  }
}

function updateCommentCharCount() {
  const input = $('comment-input');
  const counter = $('comment-char-count');
  if (!input || !counter) return;
  counter.textContent = `${input.value.length} / ${COMMENT_MAX_LENGTH} ký tự`;
}

function formatCommentTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('vi-VN');
}

function replyCardMarkup(reply) {
  const author = escapeHtml(reply.authorDisplayName || 'Người dùng');
  const timeText = escapeHtml(formatCommentTime(reply.createdAt));
  const body = escapeHtml(reply.content);
  const delBtn = reply.canDelete
    ? `<button type="button" class="btn btn-outline-novel comment-action-btn text-danger btn-delete-comment" data-comment-id="${reply.id}">
         <i class="fa-solid fa-trash-can" aria-hidden="true"></i> Xóa
       </button>`
    : '';

  return `
    <article class="comment-reply-card" data-comment-id="${reply.id}">
      <div class="comment-meta">
        <span class="comment-author">${author}</span>
        <span class="comment-time">${timeText}</span>
      </div>
      <div class="comment-body">${body}</div>
      ${delBtn ? `<div class="comment-actions">${delBtn}</div>` : ''}
    </article>
  `;
}

function commentCardMarkup(comment, loggedIn) {
  const isDeleted = Boolean(comment.deleted);
  const timeText = escapeHtml(formatCommentTime(comment.createdAt));
  const bodyMarkup = isDeleted
    ? '<div class="comment-deleted">Bình luận đã xóa</div>'
    : `<div class="comment-body">${escapeHtml(comment.content)}</div>`;

  const actions = [];
  if (!isDeleted && loggedIn) {
    actions.push(
      `<button type="button" class="btn btn-outline-novel comment-action-btn btn-reply-comment" data-comment-id="${comment.id}">
         <i class="fa-solid fa-reply" aria-hidden="true"></i> Trả lời
       </button>`
    );
  }
  if (!isDeleted && comment.canDelete) {
    actions.push(
      `<button type="button" class="btn btn-outline-novel comment-action-btn text-danger btn-delete-comment" data-comment-id="${comment.id}">
         <i class="fa-solid fa-trash-can" aria-hidden="true"></i> Xóa
       </button>`
    );
  }

  const replyDraftValue =
    pendingComment && String(pendingComment.parentId) === String(comment.id)
      ? escapeHtml(pendingComment.content)
      : '';
  const showReplyForm = !isDeleted && loggedIn && String(activeReplyParentId) === String(comment.id);
  const replyFormMarkup = showReplyForm
    ? `
      <form class="comment-reply-form" data-parent-id="${comment.id}" novalidate>
        <label for="reply-input-${comment.id}" class="form-label small fw-semibold mb-1">Trả lời ${escapeHtml(comment.authorDisplayName || '')}</label>
        <textarea id="reply-input-${comment.id}" class="form-control form-control-sm reply-textarea" rows="2" maxlength="1000"
          placeholder="Nhập phản hồi (tối đa 1000 ký tự)...">${replyDraftValue}</textarea>
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-2">
          <div class="small text-danger reply-error" hidden role="alert"></div>
          <div class="d-flex gap-2 ms-auto">
            <button type="button" class="btn btn-outline-novel comment-action-btn btn-cancel-reply">Hủy</button>
            <button type="submit" class="btn btn-primary-novel comment-action-btn btn-submit-reply">Gửi trả lời</button>
          </div>
        </div>
      </form>
    `
    : '';

  const replies = Array.isArray(comment.replies) ? comment.replies : [];
  const rState = replyState.get(comment.id) || { loading: false };
  const moreRepliesBtn = comment.repliesHasMore
    ? `<button type="button" class="btn btn-outline-novel btn-sm align-self-start btn-load-more-replies" data-parent-id="${comment.id}" ${rState.loading ? 'disabled' : ''}>
         ${rState.loading ? 'Đang tải...' : `Xem thêm trả lời (${Math.max(0, (comment.replyCount || 0) - replies.length)})`}
       </button>`
    : '';

  const repliesMarkup =
    replies.length > 0 || moreRepliesBtn
      ? `<div class="comment-replies">${replies.map(replyCardMarkup).join('')}${moreRepliesBtn}</div>`
      : '';

  return `
    <article class="comment-card" data-comment-id="${comment.id}">
      <div class="comment-meta">
        <span class="comment-author">${isDeleted ? 'Bình luận' : escapeHtml(comment.authorDisplayName || 'Người dùng')}</span>
        <span class="comment-time">${timeText}</span>
      </div>
      ${bodyMarkup}
      ${actions.length ? `<div class="comment-actions">${actions.join('')}</div>` : ''}
      ${replyFormMarkup}
      ${repliesMarkup}
    </article>
  `;
}

function renderComments() {
  const listEl = $('comments-list');
  const emptyEl = $('comments-empty');
  const countBadge = $('comments-count-badge');
  const loadMoreWrap = $('comments-load-more-wrap');
  const loadMoreBtn = $('comments-load-more-btn');
  if (!listEl || !emptyEl) return;

  countBadge.textContent = String(commentsTotal);
  const loggedIn = Boolean(getAccount());
  emptyEl.hidden = commentsItems.length > 0 || !$('comments-loading').hidden || !$('comments-error').hidden;
  listEl.innerHTML = commentsItems.map(c => commentCardMarkup(c, loggedIn)).join('');
  if (loadMoreWrap && loadMoreBtn) {
    loadMoreWrap.hidden = !commentsHasMore;
    loadMoreBtn.disabled = false;
  }
}

async function loadComments(chapterId, page = 1, append = false) {
  if (!activeNovel || !chapterId) return;
  const novelId = activeNovel.id;
  const seq = ++commentsLoadSeq;

  $('comments-error').hidden = true;
  if (!append) {
    $('comments-empty').hidden = true;
    $('comments-loading').hidden = false;
  } else {
    $('comments-load-more-btn').disabled = true;
  }

  try {
    const query = new URLSearchParams({
      page: String(page),
      size: String(COMMENTS_PAGE_SIZE),
      replySize: '3'
    });
    const data = await api(
      `/studio/public/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/comments?${query}`
    );
    if (seq !== commentsLoadSeq || String(activeChapterId) !== String(chapterId)) return;

    $('comments-loading').hidden = true;
    commentsPage = data.page || page;
    commentsTotal = Number(data.total || 0);
    commentsHasMore = Boolean(data.hasMore);
    const pageItems = Array.isArray(data.items) ? data.items : [];
    commentsItems = append ? [...commentsItems, ...pageItems] : pageItems;
    renderComments();
  } catch (error) {
    if (seq !== commentsLoadSeq || String(activeChapterId) !== String(chapterId)) return;
    $('comments-loading').hidden = true;
    if (error.status === 404) {
      await handleChapterGone404(novelId, chapterLoadSeq);
      return;
    }
    if (!append) {
      $('comments-error').hidden = false;
      $('comments-empty').hidden = true;
    } else {
      $('comments-load-more-btn').disabled = false;
    }
    report(error);
  }
}

async function loadMoreReplies(parentId) {
  if (!activeNovel || !activeChapterId) return;
  const parent = commentsItems.find(c => String(c.id) === String(parentId));
  if (!parent) return;

  const novelId = activeNovel.id;
  const chapterId = activeChapterId;
  const seq = commentsLoadSeq;
  const existingReplies = Array.isArray(parent.replies) ? parent.replies : [];
  const state = replyState.get(parent.id) || { page: 0, loading: false };
  if (state.loading) return;

  const nextPage = Math.floor(existingReplies.length / REPLIES_PAGE_SIZE) + 1;
  replyState.set(parent.id, { page: nextPage, loading: true });
  renderComments();

  try {
    const query = new URLSearchParams({ page: String(nextPage), size: String(REPLIES_PAGE_SIZE) });
    const data = await api(
      `/studio/public/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/comments/${parent.id}/replies?${query}`
    );
    if (seq !== commentsLoadSeq || String(activeChapterId) !== String(chapterId)) return;

    const seen = new Set(existingReplies.map(r => r.id));
    for (const r of data.items || []) {
      if (!seen.has(r.id)) {
        existingReplies.push(r);
        seen.add(r.id);
      }
    }
    parent.replies = existingReplies;
    parent.replyCount = Number(data.total ?? parent.replyCount);
    parent.repliesHasMore = existingReplies.length < parent.replyCount;
    replyState.set(parent.id, { page: nextPage, loading: false });
    renderComments();
  } catch (error) {
    if (seq !== commentsLoadSeq || String(activeChapterId) !== String(chapterId)) return;
    replyState.set(parent.id, { page: state.page, loading: false });
    renderComments();
    report(error);
  }
}

async function submitComment({ parentId = null, inputEl, errorEl, submitBtn }) {
  if (submittingComment || !activeNovel || !activeChapterId) return;
  const raw = inputEl?.value || '';
  const trimmed = raw.trim();
  const showError = (msg) => {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.hidden = !msg;
    }
  };
  showError('');

  if (!trimmed) {
    showError('Vui lòng nhập nội dung trước khi gửi.');
    return;
  }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    showError(`Bình luận tối đa ${COMMENT_MAX_LENGTH} ký tự.`);
    return;
  }

  const targetNovelId = activeNovel.id;
  const targetChapterId = String(activeChapterId);
  const seq = commentsLoadSeq;

  if (
    !pendingComment ||
    String(pendingComment.chapterId) !== targetChapterId ||
    String(pendingComment.parentId ?? '') !== String(parentId ?? '') ||
    pendingComment.content !== trimmed
  ) {
    pendingComment = {
      chapterId: targetChapterId,
      parentId,
      content: trimmed,
      requestId: newUuid()
    };
  }

  submittingComment = true;
  if (submitBtn) submitBtn.disabled = true;

  try {
    const created = await api(
      `/studio/public/novels/${encodeURIComponent(targetNovelId)}/chapters/${encodeURIComponent(targetChapterId)}/comments`,
      'POST',
      {
        content: trimmed,
        parentId,
        requestId: pendingComment.requestId
      }
    );
    if (seq !== commentsLoadSeq || String(activeChapterId) !== targetChapterId) return;

    pendingComment = null;
    if (inputEl) inputEl.value = '';
    updateCommentCharCount();

    if (parentId === null) {
      if (!commentsItems.some(c => c.id === created.id)) {
        commentsItems.unshift(created);
        commentsTotal += 1;
      }
    } else {
      const parent = commentsItems.find(c => String(c.id) === String(parentId));
      if (parent) {
        parent.replies = Array.isArray(parent.replies) ? parent.replies : [];
        if (!parent.replies.some(r => r.id === created.id)) {
          if (!parent.repliesHasMore) {
            parent.replies.push(created);
          }
          parent.replyCount = Number(parent.replyCount || 0) + 1;
        }
      }
      activeReplyParentId = null;
    }
    renderComments();
    notify(parentId === null ? 'Đã đăng bình luận.' : 'Đã gửi trả lời.');
  } catch (error) {
    if (seq !== commentsLoadSeq || String(activeChapterId) !== targetChapterId) return;
    if (error.status === 404) {
      await handleChapterGone404(targetNovelId, chapterLoadSeq);
      return;
    }
    showError(error.message || 'Không gửi được bình luận. Nội dung vẫn được giữ lại để bạn thử lại.');
  } finally {
    submittingComment = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function deleteCommentFlow(commentId) {
  if (!activeNovel || !activeChapterId) return;
  const confirm = await Swal.fire({
    text: 'Xóa bình luận này?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Xóa',
    cancelButtonText: 'Hủy'
  });
  if (!confirm.isConfirmed) return;

  const novelId = activeNovel.id;
  const chapterId = String(activeChapterId);
  const seq = commentsLoadSeq;

  try {
    const result = await api(
      `/studio/public/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/comments/${encodeURIComponent(commentId)}`,
      'DELETE'
    );
    if (seq !== commentsLoadSeq || String(activeChapterId) !== chapterId) return;

    const topIdx = commentsItems.findIndex(c => String(c.id) === String(commentId));
    if (topIdx !== -1) {
      if (result?.softDeleted) {
        commentsItems[topIdx].deleted = true;
        commentsItems[topIdx].content = '';
        commentsItems[topIdx].authorDisplayName = null;
        commentsItems[topIdx].canDelete = false;
      } else {
        commentsItems.splice(topIdx, 1);
        commentsTotal = Math.max(0, commentsTotal - 1);
      }
    } else {
      for (let i = 0; i < commentsItems.length; i++) {
        const parent = commentsItems[i];
        const replies = Array.isArray(parent.replies) ? parent.replies : [];
        const rIdx = replies.findIndex(r => String(r.id) === String(commentId));
        if (rIdx !== -1) {
          replies.splice(rIdx, 1);
          parent.replyCount = Math.max(0, Number(parent.replyCount || 1) - 1);
          if (parent.deleted && parent.replyCount === 0) {
            commentsItems.splice(i, 1);
            commentsTotal = Math.max(0, commentsTotal - 1);
          }
          break;
        }
      }
    }
    renderComments();
    notify('Đã xóa bình luận.');
  } catch (error) {
    if (seq !== commentsLoadSeq || String(activeChapterId) !== chapterId) return;
    if (error.status === 404) {
      await handleChapterGone404(novelId, chapterLoadSeq);
      return;
    }
    report(error);
  }
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

  on($('comment-input'), 'input', updateCommentCharCount);

  on($('comment-form'), 'submit', async (event) => {
    event.preventDefault();
    await submitComment({
      parentId: null,
      inputEl: $('comment-input'),
      errorEl: $('comment-submit-error'),
      submitBtn: $('comment-submit-btn')
    });
  });

  on($('comments-retry-btn'), 'click', () => {
    if (activeChapterId) loadComments(activeChapterId, 1, false);
  });

  on($('comments-load-more-btn'), 'click', () => {
    if (activeChapterId && commentsHasMore) loadComments(activeChapterId, commentsPage + 1, true);
  });

  on($('comments-list'), 'click', async (event) => {
    const replyBtn = event.target.closest('.btn-reply-comment');
    if (replyBtn) {
      const pid = replyBtn.dataset.commentId;
      activeReplyParentId = String(activeReplyParentId) === String(pid) ? null : pid;
      renderComments();
      if (activeReplyParentId) {
        $('reply-input-' + activeReplyParentId)?.focus();
      }
      return;
    }

    const cancelReplyBtn = event.target.closest('.btn-cancel-reply');
    if (cancelReplyBtn) {
      activeReplyParentId = null;
      if (pendingComment && pendingComment.parentId !== null) pendingComment = null;
      renderComments();
      return;
    }

    const delBtn = event.target.closest('.btn-delete-comment');
    if (delBtn) {
      await deleteCommentFlow(delBtn.dataset.commentId);
      return;
    }

    const moreRepliesBtn = event.target.closest('.btn-load-more-replies');
    if (moreRepliesBtn) {
      await loadMoreReplies(moreRepliesBtn.dataset.parentId);
    }
  });

  on($('comments-list'), 'submit', async (event) => {
    const form = event.target.closest('.comment-reply-form');
    if (!form) return;
    event.preventDefault();
    const parentId = Number(form.dataset.parentId);
    await submitComment({
      parentId,
      inputEl: form.querySelector('.reply-textarea'),
      errorEl: form.querySelector('.reply-error'),
      submitBtn: form.querySelector('.btn-submit-reply')
    });
  });

  window.addEventListener('popstate', () => {
    const params = new URLSearchParams(location.search);
    const novelId = params.get('novel') || '';
    const requestedChapter = params.get('chapter') || '';
    if (!activeNovel || String(novelId) !== String(activeNovel.id)) {
      loadPublicNovel({ replaceIfDefault: false });
      return;
    }
    if (requestedChapter) {
      fetchAndRenderChapter(requestedChapter);
    } else {
      loadPublicNovel({ replaceIfDefault: false });
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      loadPublicNovel({ replaceIfDefault: false });
    }
  });

  window.addEventListener('session-restored', (event) => {
    syncCommentComposerAuth(event.detail);
  });

  window.addEventListener('session-expired', () => {
    syncCommentComposerAuth(null);
  });
}

function initReaderController() {
  bindEvents();
  sessionReady.then(syncCommentComposerAuth);
  loadPublicNovel({ replaceIfDefault: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReaderController);
} else {
  initReaderController();
}
