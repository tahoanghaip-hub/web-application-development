import { $, api, on, notify, report } from '../core/api.js';
import { sessionReady, escapeHtml } from '../app.js';
import { validateNovelData } from '../services/novelService.js';

const studio = (path, method, data) => api('/studio' + path, method, data);
const pageSize = 10;
let page = 1;
let queryId = 0;
let items = [];
let detailNovelId = null;

function editorHref(novelId) {
  return 'editor.html?novel=' + encodeURIComponent(novelId);
}

function getPriorityInfo(priority) {
  if (priority === 'High') return { cls: 'badge-priority-high', label: 'Cao' };
  if (priority === 'Low') return { cls: 'badge-priority-low', label: 'Thấp' };
  return { cls: 'badge-priority-medium', label: 'Trung bình' };
}

function getStatusInfo(status) {
  const isDone = status === 'Done';
  return {
    isDone,
    cls: isDone ? 'badge-done' : 'badge-pending',
    label: isDone ? 'Hoàn thành' : 'Đang sáng tác',
    shortLabel: isDone ? 'Hoàn thành' : 'Đang viết',
    icon: isDone ? 'fa-circle-check' : 'fa-hourglass-start'
  };
}

function getVisibilityInfo(visibility) {
  const isPublic = visibility === 'Public';
  return {
    isPublic,
    cls: isPublic ? 'badge-visibility-public' : 'badge-visibility-private',
    pillCls: isPublic ? 'is-published' : 'is-draft',
    label: isPublic ? 'Công khai' : 'Riêng tư',
    icon: isPublic ? 'fa-globe' : 'fa-lock'
  };
}

function renderEmptyMarkup() {
  return `
    <div class="empty-state">
      <div class="empty-state-icon"><i class="fa-solid fa-folder-open"></i></div>
      <h5 class="fw-bold mb-2">Không tìm thấy tác phẩm nào</h5>
      <p class="text-secondary small mb-3">Thử đặt lại bộ lọc hoặc tạo một tác phẩm mới để bắt đầu quản lý sáng tác.</p>
      <button type="button" class="btn btn-primary-novel btn-sm btn-empty-add">
        <i class="fa-solid fa-plus me-1"></i> Thêm Truyện Mới
      </button>
    </div>
  `;
}

function renderTableRows(novels) {
  const tbody = $('novel-table-body');
  const mobileList = $('novel-mobile-list');

  if (!Array.isArray(novels) || novels.length === 0) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">${renderEmptyMarkup()}</td></tr>`;
    }
    if (mobileList) {
      mobileList.innerHTML = renderEmptyMarkup();
    }
    return;
  }

  if (tbody) {
    tbody.innerHTML = novels.map((novel, index) => {
      const safeTitle = escapeHtml(novel.title);
      const safeDesc = escapeHtml(novel.description);
      const deadlineFormatted = novel.deadline
        ? new Date(novel.deadline).toLocaleDateString('vi-VN')
        : 'Chưa đặt';
      const prio = getPriorityInfo(novel.priority);
      const stat = getStatusInfo(novel.status);
      const vis = getVisibilityInfo(novel.visibility);
      const chaptersCount = novel.chapterCount ?? 0;
      const pubChaptersCount = novel.publishedChapterCount ?? 0;

      return `
        <tr class="animate-fade-in" data-id="${escapeHtml(novel.id)}">
          <td class="text-secondary fw-semibold">${(page - 1) * pageSize + index + 1}</td>
          <td>
            <div class="fw-bold text-primary mb-1">${safeTitle}</div>
            <small class="text-secondary"><i class="fa-solid fa-layer-group me-1"></i>${chaptersCount} chương mục${pubChaptersCount > 0 ? ` · ${pubChaptersCount} đã xuất bản` : ''}</small>
          </td>
          <td>
            <div class="text-secondary small text-truncate" style="max-width: 300px;" title="${safeDesc}">
              ${safeDesc}
            </div>
          </td>
          <td>
            <span class="small fw-semibold"><i class="fa-regular fa-calendar me-1 text-secondary"></i>${deadlineFormatted}</span>
          </td>
          <td>
            <span class="badge badge-novel ${prio.cls}">${prio.label}</span>
          </td>
          <td>
            <div class="d-flex flex-column align-items-start gap-1">
              <button type="button" class="btn btn-sm badge-novel ${stat.cls} border-0 cursor-pointer btn-toggle-status"
                data-id="${escapeHtml(novel.id)}" title="Bấm để đổi trạng thái">
                <i class="fa-solid ${stat.icon} me-1"></i>
                ${stat.label}
              </button>
              <span class="badge badge-novel ${vis.cls}" data-visibility="${escapeHtml(novel.visibility || 'Private')}">
                <i class="fa-solid ${vis.icon}"></i>
                ${vis.label}
              </span>
            </div>
          </td>
          <td class="text-end">
            <div class="action-btn-group">
              <a class="btn btn-sm btn-action-workspace btn-open-workspace"
                href="${editorHref(novel.id)}"
                title="Soạn thảo tác phẩm"
                aria-label="Soạn thảo ${safeTitle}">
                <i class="fa-solid fa-pen-nib" aria-hidden="true"></i> Soạn thảo
              </a>
              <button type="button" class="btn btn-icon btn-action-edit btn-edit-novel"
                data-id="${escapeHtml(novel.id)}"
                title="Sửa thông tin tác phẩm"
                aria-label="Sửa thông tin tác phẩm ${safeTitle}">
                <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
              </button>
              <button type="button" class="btn btn-icon btn-action-delete btn-delete-novel"
                data-id="${escapeHtml(novel.id)}"
                title="Xóa tác phẩm"
                aria-label="Xóa tác phẩm ${safeTitle}">
                <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  if (mobileList) {
    mobileList.innerHTML = novels.map((novel) => {
      const safeTitle = escapeHtml(novel.title);
      const stat = getStatusInfo(novel.status);
      const vis = getVisibilityInfo(novel.visibility);
      const chaptersCount = novel.chapterCount ?? 0;

      return `
        <div class="compact-row animate-fade-in" data-id="${escapeHtml(novel.id)}">
          <a class="compact-row-main" href="${editorHref(novel.id)}" aria-label="Mở soạn thảo ${safeTitle}">
            <span class="compact-row-text">
              <span class="compact-row-title">${safeTitle}</span>
              <span class="compact-row-sub flex-wrap">
                <span>${chaptersCount} chương</span>
                <span class="compact-status-pill ${stat.isDone ? 'is-published' : 'is-pending'}">${stat.shortLabel}</span>
                <span class="compact-status-pill ${vis.pillCls}">${vis.label}</span>
              </span>
            </span>
          </a>
          <div class="compact-row-actions">
            <a class="btn btn-primary-novel btn-sm novel-mobile-write btn-open-workspace"
              href="${editorHref(novel.id)}"
              aria-label="Soạn thảo ${safeTitle}">
              Soạn thảo
            </a>
            <button type="button" class="btn btn-outline-novel btn-more-row btn-novel-more"
              data-id="${escapeHtml(novel.id)}"
              aria-label="Chi tiết và thao tác cho ${safeTitle}">
              <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
}

function setupModalFormValidation() {
  const openAddBtn = $('open-add-modal-btn');
  if (openAddBtn) {
    openAddBtn.addEventListener('click', openAddModal);
  }

  const novelForm = $('novel-form');
  const titleInput = $('novel-title');
  const descInput = $('novel-description');
  const deadlineInput = $('novel-deadline');
  const descCounter = $('desc-char-counter');

  if (descInput && descCounter) {
    descInput.addEventListener('input', () => {
      const length = descInput.value.trim().length;
      descCounter.textContent = `${length} / 10 ký tự`;
      if (length < 10) {
        descCounter.classList.add('text-danger');
        descCounter.classList.remove('text-success');
      } else {
        descCounter.classList.remove('text-danger');
        descCounter.classList.add('text-success');
      }
    });
  }

  if (titleInput) titleInput.addEventListener('input', () => validateField('title'));
  if (deadlineInput) deadlineInput.addEventListener('change', () => validateField('deadline'));
  if (descInput) descInput.addEventListener('input', () => validateField('description'));
  const visibilitySelect = $('novel-visibility');
  if (visibilitySelect) visibilitySelect.addEventListener('change', updateVisibilityImpact);
  if (novelForm) on(novelForm, 'submit', handleFormSubmit);
}

function updateVisibilityImpact() {
  const impactEl = $('novel-visibility-impact');
  const selectEl = $('novel-visibility');
  if (!impactEl || !selectEl) return;
  const targetVis = selectEl.value || 'Private';
  const novelId = $('novel-id')?.value || '';
  const novel = novelId ? items.find(book => book.id === novelId) : null;

  if (!novel) {
    if (targetVis === 'Public') {
      impactEl.textContent = 'Tác phẩm mới sẽ hiển thị trên Khám phá với trạng thái "Chưa có chương công khai" cho đến khi bạn xuất bản chương.';
      impactEl.hidden = false;
    } else {
      impactEl.hidden = true;
      impactEl.textContent = '';
    }
    return;
  }

  const prevVis = novel.visibility || 'Private';
  const pubCount = novel.publishedChapterCount ?? 0;
  if (prevVis === 'Private' && targetVis === 'Public') {
    if (pubCount > 0) {
      impactEl.textContent = `Khi công khai lại, ${pubCount} chương đã chọn xuất bản trước đó sẽ hiện lại cho người đọc. Các chương đang để riêng tư vẫn tiếp tục ẩn.`;
    } else {
      impactEl.textContent = 'Tác phẩm hiện chưa có chương nào xuất bản, nên sẽ hiển thị trên Khám phá với thông báo "Chưa có chương công khai".';
    }
    impactEl.hidden = false;
  } else if (prevVis === 'Public' && targetVis === 'Private') {
    impactEl.textContent = 'Khi chuyển sang Riêng tư, tác phẩm, mục lục, các chương và bình luận sẽ bị ẩn khỏi người đọc. Lịch sử và phiên bản đã chọn xuất bản vẫn được giữ trong Studio.';
    impactEl.hidden = false;
  } else {
    impactEl.hidden = true;
    impactEl.textContent = '';
  }
}

function validateField(fieldName) {
  const formData = getFormData();
  const errors = validateNovelData(formData);

  const inputEl = $(`novel-${fieldName}`);
  const errorEl = $(`error-novel-${fieldName}`);
  if (!inputEl || !errorEl) return;

  if (errors[fieldName]) {
    inputEl.classList.add('is-invalid');
    errorEl.textContent = errors[fieldName];
  } else {
    inputEl.classList.remove('is-invalid');
    errorEl.textContent = '';
  }
}

function getFormData() {
  return {
    id: $('novel-id')?.value || '',
    title: $('novel-title')?.value || '',
    deadline: $('novel-deadline')?.value || '',
    priority: $('novel-priority')?.value || 'Medium',
    status: $('novel-status')?.value || 'Pending',
    visibility: $('novel-visibility')?.value || 'Private',
    description: $('novel-description')?.value || ''
  };
}

function openAddModal() {
  resetNovelForm();
  if ($('novel-visibility')) $('novel-visibility').value = 'Private';
  updateVisibilityImpact();
  const modalTitle = $('novelModalTitle');
  if (modalTitle) {
    modalTitle.innerHTML = '<i class="fa-solid fa-plus-circle text-primary me-2"></i> Thêm Tác Phẩm Mới';
  }
  const modalEl = $('novel-modal');
  if (modalEl && window.bootstrap) {
    window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

function openEditModal(novelId) {
  resetNovelForm();
  const novel = items.find(book => book.id === novelId);
  if (!novel) return;

  const modalTitle = $('novelModalTitle');
  if (modalTitle) {
    modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square text-primary me-2"></i> Sửa Thông Tin Tác Phẩm';
  }

  $('novel-id').value = novel.id;
  $('novel-title').value = novel.title;
  $('novel-deadline').value = novel.deadline || '';
  $('novel-priority').value = novel.priority || 'Medium';
  $('novel-status').value = novel.status || 'Pending';
  if ($('novel-visibility')) $('novel-visibility').value = novel.visibility || 'Private';
  updateVisibilityImpact();
  const descInput = $('novel-description');
  const descCounter = $('desc-char-counter');
  descInput.value = novel.description || '';
  if (descCounter) {
    const len = descInput.value.length;
    descCounter.textContent = `${len} / 10 ký tự`;
    descCounter.className = len >= 10 ? 'text-success' : 'text-danger';
  }

  const modalEl = $('novel-modal');
  if (modalEl && window.bootstrap) {
    window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

function resetNovelForm() {
  $('novel-form')?.reset();
  if ($('novel-id')) $('novel-id').value = '';

  for (const f of ['title', 'deadline', 'priority', 'status', 'description']) {
    $(`novel-${f}`)?.classList.remove('is-invalid');
    const errorEl = $(`error-novel-${f}`);
    if (errorEl) errorEl.textContent = '';
  }

  const descCounter = $('desc-char-counter');
  if (descCounter) {
    descCounter.textContent = '0 / 10 ký tự';
    descCounter.className = 'text-secondary';
  }
  const impactEl = $('novel-visibility-impact');
  if (impactEl) {
    impactEl.hidden = true;
    impactEl.textContent = '';
  }
}

async function loadTable() {
  const current = ++queryId;
  const query = new URLSearchParams({
    keyword: $('search-input').value,
    status: $('filter-status').value,
    priority: $('filter-priority').value,
    sortBy: $('sort-deadline').value,
    page,
    size: pageSize
  });
  const result = await studio('/novels?' + query);
  if (current !== queryId) return;
  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  if (page > pages) {
    page = pages;
    return loadTable();
  }
  items = result.items;
  renderTableRows(items);
  $('novel-count-badge').textContent = result.total;
  $('page-info').textContent = 'Trang ' + page + ' / ' + pages;
  $('prev-page').disabled = page <= 1;
  $('next-page').disabled = page >= pages;
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const data = getFormData();
  const errors = validateNovelData(data);
  for (const field of ['title', 'description', 'priority', 'deadline', 'status']) validateField(field);
  if (Object.keys(errors).length) return;

  if (data.id) {
    const existing = items.find(book => book.id === data.id);
    const pubCount = existing?.publishedChapterCount ?? 0;
    if (existing && (existing.visibility || 'Private') === 'Private' && data.visibility === 'Public' && pubCount > 0) {
      const ok = await confirmAction(
        `Công khai tác phẩm này? ${pubCount} chương đã chọn xuất bản trước đó sẽ hiện lại cho người đọc. Các chương đang để riêng tư vẫn tiếp tục ẩn.`
      );
      if (!ok) return;
    }
  }

  const button = $('save-novel-btn');
  button.disabled = true;
  try {
    await studio('/novels' + (data.id ? '/' + data.id : ''), data.id ? 'PUT' : 'POST', data);
    bootstrap.Modal.getInstance($('novel-modal')).hide();
    notify('Đã lưu tác phẩm.');
    await loadTable();
  } finally {
    button.disabled = false;
  }
}

async function confirmAction(text) {
  const result = await Swal.fire({
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Đồng ý',
    cancelButtonText: 'Hủy'
  });
  return result.isConfirmed;
}

async function toggleNovelStatus(book) {
  await studio('/novels/' + book.id, 'PUT', {
    ...book,
    status: book.status === 'Done' ? 'Pending' : 'Done'
  });
  notify('Đã đổi trạng thái.');
  await loadTable();
}

async function deleteNovel(book) {
  if (!(await confirmAction('Xóa tác phẩm cùng tất cả chương và phiên bản?'))) return;
  await studio('/novels/' + book.id, 'DELETE');
  notify('Đã xóa tác phẩm.');
  await loadTable();
}

function openNovelDetailModal(novelId) {
  const novel = items.find(book => book.id === novelId);
  if (!novel) return;
  detailNovelId = novel.id;

  const prio = getPriorityInfo(novel.priority);
  const stat = getStatusInfo(novel.status);
  const vis = getVisibilityInfo(novel.visibility);
  const deadlineFormatted = novel.deadline
    ? new Date(novel.deadline).toLocaleDateString('vi-VN')
    : 'Chưa đặt';

  $('novelDetailTitle').textContent = novel.title;
  $('detail-novel-badges').innerHTML = `
    <span class="badge badge-novel ${stat.cls}"><i class="fa-solid ${stat.icon}"></i> ${stat.label}</span>
    <span class="badge badge-novel ${vis.cls}"><i class="fa-solid ${vis.icon}"></i> ${vis.label}</span>
    <span class="badge badge-novel ${prio.cls}"><i class="fa-solid fa-flag"></i> Ưu tiên ${prio.label}</span>
  `;
  const pubCount = novel.publishedChapterCount ?? 0;
  $('detail-novel-chapters').textContent = pubCount > 0
    ? `${novel.chapterCount ?? 0} chương (${pubCount} đã xuất bản)`
    : `${novel.chapterCount ?? 0} chương`;
  $('detail-novel-deadline').textContent = deadlineFormatted;
  $('detail-novel-description').textContent = novel.description || '';
  $('detail-novel-write').href = editorHref(novel.id);

  const modalEl = $('novel-detail-modal');
  if (modalEl && window.bootstrap) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

async function handleTableAction(event) {
  if (event.target.closest('.btn-empty-add')) {
    openAddModal();
    return;
  }
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const book = items.find(item => item.id === button.dataset.id);
  if (!book) return;

  if (button.classList.contains('btn-novel-more')) {
    openNovelDetailModal(book.id);
  } else if (button.classList.contains('btn-edit-novel')) {
    openEditModal(book.id);
  } else if (button.classList.contains('btn-toggle-status')) {
    await toggleNovelStatus(book);
  } else if (button.classList.contains('btn-delete-novel')) {
    await deleteNovel(book);
  }
}

function detailModalEvents() {
  const hideDetail = () => {
    const modalEl = $('novel-detail-modal');
    if (modalEl && window.bootstrap) bootstrap.Modal.getInstance(modalEl)?.hide();
  };

  on($('detail-novel-edit'), 'click', () => {
    const id = detailNovelId;
    hideDetail();
    if (id) openEditModal(id);
  });

  on($('detail-novel-toggle'), 'click', async () => {
    const book = items.find(item => item.id === detailNovelId);
    hideDetail();
    if (book) await toggleNovelStatus(book);
  });

  on($('detail-novel-delete'), 'click', async () => {
    const book = items.find(item => item.id === detailNovelId);
    hideDetail();
    if (book) await deleteNovel(book);
  });
}

function dataEvents() {
  on($('export-json-btn'), 'click', async () => {
    const books = await studio('/export');
    downloadJson(JSON.stringify(books, null, 2));
  });
  on($('import-json-input'), 'change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { throw new Error('Không đọc được file JSON.'); }
    const result = await studio('/import', 'POST', data);
    notify(result.duplicate ? 'Bản sao lưu này đã được nhập.' : 'Đã nhập ' + result.count + ' tác phẩm riêng tư.');
    await loadTable();
  });
  on($('clear-all-btn'), 'click', async () => {
    if (!await confirmAction('Xóa tất cả tác phẩm, chương và lịch sử của tài khoản này?')) return;
    await studio('/novels', 'DELETE');
    notify('Đã xóa thư viện cá nhân.');
    await loadTable();
  });
}

function legacyExport() {
  const button = $('legacy-export');
  try { button.hidden = localStorage.getItem('novelStudio_data') === null; }
  catch { return; }
  on(button, 'click', () => {
    const raw = localStorage.getItem('novelStudio_data');
    if (raw === null) throw new Error('Không tìm thấy thư viện cũ ở địa chỉ này.');
    downloadJson(raw);
  });
}

function downloadJson(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'novelstudio_backup_' + Date.now() + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function init() {
  legacyExport();
  if (!await sessionReady) return;
  setupModalFormValidation();
  detailModalEvents();
  dataEvents();
  on($('novel-table-body'), 'click', handleTableAction);
  on($('novel-mobile-list'), 'click', handleTableAction);

  const filters = ['search-input', 'filter-status', 'filter-priority', 'sort-deadline'];
  for (const id of filters) {
    on($(id), id === 'search-input' ? 'input' : 'change', () => { page = 1; return loadTable(); });
  }
  on($('reset-filter-btn'), 'click', () => {
    filters.forEach((id, i) => { $(id).value = ['', 'All', 'All', 'created-desc'][i]; });
    page = 1;
    return loadTable();
  });
  on($('prev-page'), 'click', () => { page--; return loadTable(); });
  on($('next-page'), 'click', () => { page++; return loadTable(); });

  if (location.hash === '#create-novel') {
    history.replaceState(history.state, '', location.pathname + location.search);
    openAddModal();
  }
  await loadTable();
}

init().catch(error => {
  $('novel-table-body').innerHTML = '<tr><td colspan="7">Chưa tải được danh sách. Tải lại trang để thử lại.</td></tr>';
  if ($('novel-mobile-list')) {
    $('novel-mobile-list').innerHTML = '<div class="p-4 text-center text-secondary">Chưa tải được danh sách. Tải lại trang để thử lại.</div>';
  }
  report(error);
});
