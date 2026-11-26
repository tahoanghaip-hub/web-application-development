import { $, api, on, notify, report } from '../core/api.js';
import { sessionReady, escapeHtml } from '../app.js';
import { validateNovelData } from '../services/novelService.js';

const studio = (path, method, data) => api('/studio' + path, method, data);
const pageSize = 10;
let page = 1;
let queryId = 0;
let items = [];
let activeNovel = null;
let activeChapter = null;
let dirty = false;
let opening = 0;
let pendingSave = null;

function renderTableRows(novels) {
  const tbody = document.getElementById('novel-table-body');
  if (!tbody) return;

  if (!Array.isArray(novels) || novels.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5">
          <div class="empty-state">
            <div class="empty-state-icon"><i class="fa-solid fa-folder-open"></i></div>
            <h5 class="fw-bold mb-2">Không tìm thấy tác phẩm nào</h5>
            <p class="text-secondary small mb-3">Thử đặt lại bộ lọc hoặc tạo một tác phẩm mới để bắt đầu quản lý sáng tác.</p>
            <button class="btn btn-primary-novel btn-sm" id="empty-add-btn">
              <i class="fa-solid fa-plus me-1"></i> Thêm Truyện Mới
            </button>
          </div>
        </td>
      </tr>
    `;

    const emptyAddBtn = document.getElementById('empty-add-btn');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', openAddModal);
    }
    return;
  }

  const rowsHtml = novels.map((novel, index) => {
    const safeTitle = escapeHtml(novel.title);
    const safeDesc = escapeHtml(novel.description);
    const deadlineFormatted = novel.deadline
      ? new Date(novel.deadline).toLocaleDateString('vi-VN')
      : 'Chưa đặt';

    // Xử lý Badge Mức ưu tiên
    let priorityClass = 'badge-priority-medium';
    let priorityLabel = 'Trung bình';
    if (novel.priority === 'High') {
      priorityClass = 'badge-priority-high';
      priorityLabel = 'Cao';
    } else if (novel.priority === 'Low') {
      priorityClass = 'badge-priority-low';
      priorityLabel = 'Thấp';
    }

    // Xử lý Badge & Nút Toggle Trạng thái
    const isDone = novel.status === 'Done';
    const statusClass = isDone ? 'badge-done' : 'badge-pending';
    const statusLabel = isDone ? 'Hoàn thành' : 'Đang sáng tác';

    // Đếm số chương
    const chaptersCount = novel.chapterCount;

    return `
      <tr class="animate-fade-in" data-id="${novel.id}">
        <td class="text-secondary fw-semibold">${(page - 1) * pageSize + index + 1}</td>
        <td>
          <div class="fw-bold text-primary mb-1">${safeTitle}</div>
          <small class="text-secondary"><i class="fa-solid fa-layer-group me-1"></i>${chaptersCount} chương mục</small>
        </td>
        <td>
          <div class="text-secondary small text-truncate" style="max-width: 320px;" title="${safeDesc}">
            ${safeDesc}
          </div>
        </td>
        <td>
          <span class="small fw-semibold"><i class="fa-regular fa-calendar me-1 text-secondary"></i>${deadlineFormatted}</span>
        </td>
        <td>
          <span class="badge badge-novel ${priorityClass}">${priorityLabel}</span>
        </td>
        <td>
          <button class="btn btn-sm badge-novel ${statusClass} border-0 cursor-pointer btn-toggle-status" data-id="${novel.id}" title="Bấm để đổi trạng thái">
            <i class="fa-solid ${isDone ? 'fa-circle-check' : 'fa-hourglass-start'} me-1"></i>
            ${statusLabel}
          </button>
        </td>
        <td class="text-end">
          <div class="action-btn-group">
            <button class="btn btn-icon btn-action-workspace btn-open-workspace" data-id="${novel.id}" title="Mở không gian soạn thảo & phiên bản">
              <i class="fa-solid fa-pen-nib"></i>
            </button>
            <button class="btn btn-icon btn-action-edit btn-edit-novel" data-id="${novel.id}" title="Chỉnh sửa thông tin">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-icon btn-action-delete btn-delete-novel" data-id="${novel.id}" title="Xóa tác phẩm">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;

}

function setupModalFormValidation() {
  const openAddBtn = document.getElementById('open-add-modal-btn');
  if (openAddBtn) {
    openAddBtn.addEventListener('click', openAddModal);
  }

  const novelForm = document.getElementById('novel-form');
  const titleInput = document.getElementById('novel-title');
  const descInput = document.getElementById('novel-description');
  const deadlineInput = document.getElementById('novel-deadline');
  const descCounter = document.getElementById('desc-char-counter');

  // Đếm ký tự mô tả realtime
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

  // Realtime blur/input validation
  if (titleInput) {
    titleInput.addEventListener('input', () => validateField('title'));
  }
  if (deadlineInput) {
    deadlineInput.addEventListener('change', () => validateField('deadline'));
  }
  if (descInput) {
    descInput.addEventListener('input', () => validateField('description'));
  }

  // Xử lý gửi Form (Submit)
  if (novelForm) {
    on(novelForm, 'submit', handleFormSubmit);
  }
}

/**
 * Kiểm tra tính hợp lệ của một trường đơn lẻ
 * @param {'title'|'deadline'|'description'|'priority'} fieldName
 */
function validateField(fieldName) {
  const formData = getFormData();
  const errors = validateNovelData(formData);

  const inputEl = document.getElementById(`novel-${fieldName}`);
  const errorEl = document.getElementById(`error-novel-${fieldName}`);

  if (!inputEl || !errorEl) return;

  if (errors[fieldName]) {
    inputEl.classList.add('is-invalid');
    errorEl.textContent = errors[fieldName];
  } else {
    inputEl.classList.remove('is-invalid');
    errorEl.textContent = '';
  }
}

/**
 * Đọc dữ liệu từ form modal
 * @returns {object}
 */
function getFormData() {
  const idInput = document.getElementById('novel-id');
  const titleInput = document.getElementById('novel-title');
  const deadlineInput = document.getElementById('novel-deadline');
  const prioritySelect = document.getElementById('novel-priority');
  const statusSelect = document.getElementById('novel-status');
  const descInput = document.getElementById('novel-description');

  return {
    id: idInput ? idInput.value : '',
    title: titleInput ? titleInput.value : '',
    deadline: deadlineInput ? deadlineInput.value : '',
    priority: prioritySelect ? prioritySelect.value : 'Medium',
    status: statusSelect ? statusSelect.value : 'Pending',
    description: descInput ? descInput.value : ''
  };
}

/**
 * Mở modal ở chế độ Thêm Tác Phẩm Mới
 */
function openAddModal() {
  resetNovelForm();
  const modalTitle = document.getElementById('novelModalTitle');
  if (modalTitle) {
    modalTitle.innerHTML = '<i class="fa-solid fa-plus-circle text-primary me-2"></i> Thêm Tác Phẩm Mới';
  }

  const modalEl = document.getElementById('novel-modal');
  if (modalEl && window.bootstrap) {
    const modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modalInstance.show();
  }
}

/**
 * Mở modal ở chế độ Chỉnh Sửa Tác Phẩm
 * @param {string} novelId
 */
function openEditModal(novelId) {
  resetNovelForm();
  const novel = items.find(book => book.id === novelId);
  if (!novel) return;

  const modalTitle = document.getElementById('novelModalTitle');
  if (modalTitle) {
    modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square text-primary me-2"></i> Chỉnh Sửa Tác Phẩm';
  }

  // Điền dữ liệu vào form
  const idInput = document.getElementById('novel-id');
  const titleInput = document.getElementById('novel-title');
  const deadlineInput = document.getElementById('novel-deadline');
  const prioritySelect = document.getElementById('novel-priority');
  const statusSelect = document.getElementById('novel-status');
  const descInput = document.getElementById('novel-description');
  const descCounter = document.getElementById('desc-char-counter');

  if (idInput) idInput.value = novel.id;
  if (titleInput) titleInput.value = novel.title;
  if (deadlineInput) deadlineInput.value = novel.deadline || '';
  if (prioritySelect) prioritySelect.value = novel.priority || 'Medium';
  if (statusSelect) statusSelect.value = novel.status || 'Pending';
  if (descInput) {
    descInput.value = novel.description || '';
    if (descCounter) {
      const len = descInput.value.length;
      descCounter.textContent = `${len} / 10 ký tự`;
      descCounter.className = len >= 10 ? 'text-success' : 'text-danger';
    }
  }

  const modalEl = document.getElementById('novel-modal');
  if (modalEl && window.bootstrap) {
    const modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modalInstance.show();
  }
}

/**
 * Đặt lại form và xóa toàn bộ thông báo lỗi
 */
function resetNovelForm() {
  const form = document.getElementById('novel-form');
  if (form) form.reset();

  const idInput = document.getElementById('novel-id');
  if (idInput) idInput.value = '';

  const fields = ['title', 'deadline', 'priority', 'status', 'description'];
  fields.forEach((f) => {
    const inputEl = document.getElementById(`novel-${f}`);
    const errorEl = document.getElementById(`error-novel-${f}`);
    if (inputEl) inputEl.classList.remove('is-invalid');
    if (errorEl) errorEl.textContent = '';
  });

  const descCounter = document.getElementById('desc-char-counter');
  if (descCounter) {
    descCounter.textContent = '0 / 10 ký tự';
    descCounter.className = 'text-secondary';
  }
}


async function loadTable() {
  const current = ++queryId;
  const query = new URLSearchParams({
    keyword: $('search-input').value, status: $('filter-status').value,
    priority: $('filter-priority').value, sortBy: $('sort-deadline').value,
    page, size: pageSize
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
  for (const field of ['title','description','priority','deadline','status']) validateField(field);
  if (Object.keys(errors).length) return;
  const button = $('save-novel-btn');
  button.disabled = true;
  try {
    const updated = await studio('/novels' + (data.id ? '/' + data.id : ''), data.id ? 'PUT' : 'POST', data);
    if (updated.id === activeNovel?.id) $('active-novel-title').textContent = updated.title;
    bootstrap.Modal.getInstance($('novel-modal')).hide();
    notify('Đã lưu tác phẩm.');
    await loadTable();
  } finally {
    button.disabled = false;
  }
}

async function confirmAction(text) {
  const result = await Swal.fire({text, icon: 'question', showCancelButton: true,
    confirmButtonText: 'Đồng ý', cancelButtonText: 'Hủy'});
  return result.isConfirmed;
}

async function chapterName(value = '') {
  const result = await Swal.fire({ titleText: 'Tên chương', input: 'text', inputValue: value,
    confirmButtonText: 'Lưu', cancelButtonText: 'Hủy', showCancelButton: true,
    inputValidator: text => text.trim().length < 2 ? 'Nhập ít nhất hai ký tự.' : undefined });
  return result.isConfirmed ? result.value.trim() : null;
}

function closeWorkspace() {
  ++opening;
  activeNovel = activeChapter = null;
  dirty = false;
  $('workspace-section').classList.add('d-none');
}

function timeline() {
  const history = activeChapter?.versions || [];
  $('version-count-badge').textContent = history.length + ' bản';
  $('version-timeline-list').innerHTML = history.map(version => `
    <div class="timeline-item"><div class="timeline-marker"></div><div class="timeline-content">
      <div class="commit-title">${escapeHtml(version.commitMessage)}</div>
      <div class="commit-meta">${new Date(version.timestamp).toLocaleString('vi-VN')} · ${version.content.length} ký tự</div>
      <button class="btn-restore-version" data-version="${version.versionId}" data-action="restore">Khôi phục</button>
      <button class="btn-restore-version" data-version="${version.versionId}" data-action="publish" ${version.published ? 'disabled' : ''}>
        ${version.published ? 'Đang công khai' : 'Xuất bản'}</button>
    </div></div>`).join('') || 'Chưa có phiên bản.';
  $('unpublish').hidden = !history.some(v => v.published);
}

function selectChapter(id) {
  activeChapter = activeNovel.chapters.find(c => c.chapterId === id) || null;
  const editor = $('draft-editor-textarea');
  editor.disabled = !activeChapter;
  editor.value = activeChapter?.versions[0]?.content || '';
  $('commit-message-input').value = '';
  $('chapter-select').value = id || '';
  for (const button of ['rename-chapter','delete-chapter','save-version-btn']) $(button).disabled = !activeChapter;
  $('save-status').textContent = activeChapter ? '' : 'Tạo một chương để bắt đầu viết.';
  dirty = false;
  timeline();
}

async function openWorkspace(id, chapterId) {
  const request = ++opening;
  const book = await studio('/novels/' + id);
  if (request !== opening) return;
  activeNovel = book;
  $('active-novel-title').textContent = book.title;
  $('chapter-select').replaceChildren(...book.chapters.map(c => new Option(c.chapterTitle, c.chapterId)));
  selectChapter(chapterId || book.chapters[0]?.chapterId);
  $('workspace-section').classList.remove('d-none');
  $('workspace-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const discard = () => !dirty || confirmAction('Rời chương và bỏ nội dung chưa lưu?');
const chapterPath = () => '/novels/' + activeNovel.id + '/chapters/' + activeChapter.chapterId;

async function handleTableAction(event) {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const book = items.find(item => item.id === button.dataset.id);
  if (!book) return;
  if (button.classList.contains('btn-open-workspace')) {
    if (await discard()) await openWorkspace(book.id);
  } else if (button.classList.contains('btn-edit-novel')) {
    openEditModal(book.id);
  } else if (button.classList.contains('btn-toggle-status')) {
    await studio('/novels/' + book.id, 'PUT', {...book, status: book.status === 'Done' ? 'Pending' : 'Done'});
    notify('Đã đổi trạng thái.');
    await loadTable();
  } else if (await confirmAction('Xóa tác phẩm cùng tất cả chương và phiên bản?')) {
    await studio('/novels/' + book.id, 'DELETE');
    if (activeNovel?.id === book.id) closeWorkspace();
    notify('Đã xóa tác phẩm.');
    await loadTable();
  }
}

function workspaceEvents() {
  on($('close-workspace-btn'), 'click', async () => { if (await discard()) closeWorkspace(); });
  on($('chapter-select'), 'change', async e => {
    const id = e.target.value;
    if (await discard()) selectChapter(id);
    else e.target.value = activeChapter.chapterId;
  });
  on($('new-chapter-btn'), 'click', async () => {
    if (!await discard()) return;
    const title = await chapterName();
    if (!title) return;
    const id = activeNovel.id;
    const created = await studio('/novels/' + id + '/chapters', 'POST', { chapterTitle: title });
    await openWorkspace(id, created.chapterId);
    notify('Đã tạo chương.');
    await loadTable();
  });
  on($('rename-chapter'), 'click', async () => {
    const chapter = activeChapter;
    const name = await chapterName(chapter.chapterTitle);
    if (!name) return;
    await studio(chapterPath(), 'PUT', {chapterTitle: name});
    chapter.chapterTitle = name;
    if (activeChapter === chapter) $('chapter-select').selectedOptions[0].textContent = name;
    notify('Đã đổi tên chương.');
  });
  on($('delete-chapter'), 'click', async () => {
    if (!await confirmAction('Xóa chương, nội dung đang soạn và toàn bộ lịch sử của chương?')) return;
    const id = activeNovel.id;
    await studio(chapterPath(), 'DELETE');
    await openWorkspace(id);
    notify('Đã xóa chương.');
    await loadTable();
  });
  const editor = $('draft-editor-textarea');
  on(editor, 'input', () => { dirty = true; $('save-status').textContent = 'Có thay đổi chưa lưu.'; });
  window.addEventListener('beforeunload', e => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  on($('save-version-btn'), 'click', async () => {
    const chapter = activeChapter;
    const content = editor.value;
    const message = $('commit-message-input').value;
    if (!content.trim()) return notify('Nhập nội dung trước khi lưu.', 'warning');
    $('save-version-btn').disabled = true;
    $('save-status').textContent = 'Đang lưu…';
    try {
      if (pendingSave?.chapter !== chapter || pendingSave.content !== content || pendingSave.message !== message) {
        // getRandomValues also works on a plain HTTP LAN origin.
        const digits = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
        pendingSave = {chapter, content, message, requestId: digits};
      }
      const version = await studio(chapterPath() + '/versions', 'POST',
        {content, commitMessage: message, requestId: pendingSave.requestId});
      pendingSave = null;
      chapter.versions.unshift(version);
      if (chapter === activeChapter) {
        dirty = editor.value !== content;
        if ($('commit-message-input').value === message) $('commit-message-input').value = '';
        $('save-status').textContent = dirty ? 'Đã lưu phiên bản. Có chỉnh sửa mới chưa lưu.' : 'Đã lưu phiên bản.';
        timeline();
      }
    } catch (error) {
      if (chapter === activeChapter) {
        dirty = true;
        $('save-status').textContent = 'Chưa xác nhận lưu. Nội dung vẫn ở đây. Bấm Lưu phiên bản để thử lại.';
      }
      throw error;
    } finally {
      $('save-version-btn').disabled = !activeChapter;
    }
  });
  on($('version-timeline-list'), 'click', async e => {
    const button = e.target.closest('[data-version]');
    if (!button) return;
    const publishing = button.dataset.action === 'publish';
    if (!await confirmAction(publishing ? 'Công khai nội dung phiên bản này trên trang chủ?' :
        'Tạo bản mới từ phiên bản này và thay nội dung đang soạn?')) return;
    const path = chapterPath() + '/versions/' + button.dataset.version;
    const chapter = activeChapter;
    if (publishing) {
      await studio(path + '/publish', 'PUT');
      for (const v of chapter.versions) v.published = v.versionId === button.dataset.version;
      notify('Đã xuất bản.');
    } else {
      const version = await studio(path + '/restore', 'POST');
      chapter.versions.unshift(version);
      if (activeChapter === chapter) selectChapter(chapter.chapterId);
      notify('Đã khôi phục thành một phiên bản mới.');
    }
    timeline();
  });
  on($('unpublish'), 'click', async () => {
    const chapter = activeChapter;
    await studio(chapterPath() + '/publication', 'DELETE');
    for (const v of chapter.versions) v.published = false;
    timeline();
    notify('Đã gỡ chương khỏi trang chủ.');
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
    closeWorkspace();
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
  const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
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
  workspaceEvents();
  dataEvents();
  on($('novel-table-body'), 'click', handleTableAction);
  const filters = ['search-input','filter-status','filter-priority','sort-deadline'];
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
  report(error);
});
