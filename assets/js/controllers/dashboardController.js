/**
 * NOVELSTUDIO - DASHBOARD CONTROLLER (dashboardController.js)
 * Điều phối toàn bộ hoạt động của trang Quản lý:
 * - Chu kỳ CRUD Tác phẩm (Thêm, Sửa, Xóa, Toggle Hoàn thành)
 * - Xác thực Form Realtime (Bắt lỗi Deadline quá khứ, mô tả < 10 ký tự, tiêu đề rỗng)
 * - Động cơ Lọc đa chiều & Sắp xếp
 * - Xuất / Nhập file JSON (Backup & Restore)
 * - Không gian Biên tập 2 cột & Quản lý Phiên bản Nháp (Git-like Version Control & Restore)
 */

import {
  getAllNovels,
  getNovelById,
  createNovel,
  updateNovel,
  deleteNovel,
  toggleNovelStatus,
  clearAllNovels,
  addChapter,
  saveChapterVersion,
  restoreVersion,
  exportToJson,
  importFromJson,
  validateNovelData
} from '../services/novelService.js';

import { applyFilters } from '../services/filterService.js';
import { escapeHtml } from '../app.js';

// ==========================================
// APPLICATION STATE
// ==========================================
let allNovels = [];
let activeNovelId = null;
let activeChapterId = null;

let currentFilters = {
  keyword: '',
  status: 'All',
  priority: 'All',
  sortBy: 'created-desc'
};

/**
 * Khởi tạo Controller Dashboard
 */
export function initDashboardController() {
  setMinDeadlineToday();
  setupFilterEventListeners();
  setupModalFormValidation();
  setupWorkspaceEvents();
  setupDataToolsEvents();
  loadAndRenderTable();
}

/**
 * Thiết lập thuộc tính min cho ô Deadline = ngày hôm nay
 */
function setMinDeadlineToday() {
  const deadlineInput = document.getElementById('novel-deadline');
  if (deadlineInput) {
    const todayStr = new Date().toISOString().split('T')[0];
    deadlineInput.setAttribute('min', todayStr);
  }
}

/**
 * Nạp dữ liệu và hiển thị lên Bảng
 */
export function loadAndRenderTable() {
  allNovels = getAllNovels();
  const filteredNovels = applyFilters(allNovels, currentFilters);
  renderTableRows(filteredNovels);

  const countBadge = document.getElementById('novel-count-badge');
  if (countBadge) {
    countBadge.textContent = `${filteredNovels.length} / ${allNovels.length}`;
  }
}

/**
 * Render danh sách hàng vào tbody #novel-table-body
 * @param {Array} novels 
 */
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
    const chaptersCount = Array.isArray(novel.chapters) ? novel.chapters.length : 0;

    return `
      <tr class="animate-fade-in" data-id="${novel.id}">
        <td class="text-secondary fw-semibold">${index + 1}</td>
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
  bindTableActionEvents();
}

/**
 * Gắn kết sự kiện cho các nút hành động trên mỗi hàng của bảng
 */
function bindTableActionEvents() {
  const tbody = document.getElementById('novel-table-body');
  if (!tbody) return;

  // 1. Đổi trạng thái nhanh (Toggle Status)
  tbody.querySelectorAll('.btn-toggle-status').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const updated = toggleNovelStatus(id);
      if (updated) {
        showToast('success', `Đã chuyển sang trạng thái "${updated.status === 'Done' ? 'Hoàn thành' : 'Đang sáng tác'}"`);
        loadAndRenderTable();
      }
    });
  });

  // 2. Mở Không gian soạn thảo (Workspace)
  tbody.querySelectorAll('.btn-open-workspace').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openWorkspace(id);
    });
  });

  // 3. Chỉnh sửa truyện (Edit)
  tbody.querySelectorAll('.btn-edit-novel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openEditModal(id);
    });
  });

  // 4. Xóa truyện (Delete)
  tbody.querySelectorAll('.btn-delete-novel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      confirmDeleteNovel(id);
    });
  });
}

// ============================================================
// KHU VỰC BỘ LỌC ĐA CHIỀU (SEARCH, STATUS, PRIORITY, SORT)
// ============================================================

/**
 * Thiết lập các sự kiện cho thanh công cụ Lọc & Sắp xếp
 */
function setupFilterEventListeners() {
  const searchInput = document.getElementById('search-input');
  const filterStatus = document.getElementById('filter-status');
  const filterPriority = document.getElementById('filter-priority');
  const sortDeadline = document.getElementById('sort-deadline');
  const resetBtn = document.getElementById('reset-filter-btn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilters.keyword = e.target.value;
      loadAndRenderTable();
    });
  }

  if (filterStatus) {
    filterStatus.addEventListener('change', (e) => {
      currentFilters.status = e.target.value;
      loadAndRenderTable();
    });
  }

  if (filterPriority) {
    filterPriority.addEventListener('change', (e) => {
      currentFilters.priority = e.target.value;
      loadAndRenderTable();
    });
  }

  if (sortDeadline) {
    sortDeadline.addEventListener('change', (e) => {
      currentFilters.sortBy = e.target.value;
      loadAndRenderTable();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      currentFilters = {
        keyword: '',
        status: 'All',
        priority: 'All',
        sortBy: 'created-desc'
      };

      if (searchInput) searchInput.value = '';
      if (filterStatus) filterStatus.value = 'All';
      if (filterPriority) filterPriority.value = 'All';
      if (sortDeadline) sortDeadline.value = 'created-desc';

      loadAndRenderTable();
      showToast('info', 'Đã đặt lại bộ lọc về mặc định');
    });
  }
}

// ============================================================
// MODAL THÊM / SỬA TRUYỆN & VALIDATION REALTIME
// ============================================================

/**
 * Thiết lập sự kiện và kiểm tra tính hợp lệ dữ liệu Form realtime
 */
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
    novelForm.addEventListener('submit', handleFormSubmit);
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
  const novel = getNovelById(novelId);
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

/**
 * Xử lý khi bấm nút Submit form thêm/sửa tác phẩm
 * @param {Event} e 
 */
function handleFormSubmit(e) {
  e.preventDefault();

  const formData = getFormData();
  const errors = validateNovelData(formData);

  // Hiển thị lỗi lên từng field
  const fields = ['title', 'deadline', 'priority', 'status', 'description'];
  fields.forEach((f) => {
    const inputEl = document.getElementById(`novel-${f}`);
    const errorEl = document.getElementById(`error-novel-${f}`);
    if (errors[f]) {
      if (inputEl) inputEl.classList.add('is-invalid');
      if (errorEl) errorEl.textContent = errors[f];
    } else {
      if (inputEl) inputEl.classList.remove('is-invalid');
      if (errorEl) errorEl.textContent = '';
    }
  });

  if (Object.keys(errors).length > 0) {
    // Focus vào trường lỗi đầu tiên
    const firstErrorKey = Object.keys(errors)[0];
    const firstEl = document.getElementById(`novel-${firstErrorKey}`);
    if (firstEl) firstEl.focus();
    return;
  }

  // Thực hiện thêm mới hoặc cập nhật
  if (formData.id) {
    // Cập nhật
    const result = updateNovel(formData.id, formData);
    if (result.success) {
      showToast('success', 'Đã cập nhật tác phẩm thành công!');
      closeModal();
      loadAndRenderTable();
      if (activeNovelId === formData.id) {
        updateWorkspaceHeader(result.novel);
      }
    }
  } else {
    // Thêm mới
    const result = createNovel(formData);
    if (result.success) {
      showToast('success', 'Đã tạo mới tác phẩm sáng tác thành công!');
      closeModal();
      loadAndRenderTable();
    }
  }
}

/**
 * Đóng Modal Thêm/Sửa
 */
function closeModal() {
  const modalEl = document.getElementById('novel-modal');
  if (modalEl && window.bootstrap) {
    const modalInstance = window.bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();
  }
}

/**
 * Hộp thoại SweetAlert2 xác nhận xóa truyện
 * @param {string} novelId 
 */
function confirmDeleteNovel(novelId) {
  const novel = getNovelById(novelId);
  if (!novel) return;

  if (window.Swal) {
    window.Swal.fire({
      title: 'Xóa tác phẩm này?',
      html: `Bạn có chắc chắn muốn xóa bộ truyện <b>"${escapeHtml(novel.title)}"</b>?<br>Toàn bộ chương mục và lịch sử nháp sẽ bị xóa vĩnh viễn!`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Đồng ý xóa',
      cancelButtonText: 'Hủy bỏ'
    }).then((result) => {
      if (result.isConfirmed) {
        deleteNovel(novelId);
        showToast('success', 'Đã xóa tác phẩm khỏi hệ thống');
        loadAndRenderTable();
        if (activeNovelId === novelId) {
          closeWorkspace();
        }
      }
    });
  } else {
    if (confirm(`Bạn có chắc chắn muốn xóa "${novel.title}"?`)) {
      deleteNovel(novelId);
      loadAndRenderTable();
      if (activeNovelId === novelId) closeWorkspace();
    }
  }
}

// ============================================================
// KHU VỰC 3: KHÔNG GIAN BIÊN TẬP 2 CỘT & VERSION CONTROL
// ============================================================

/**
 * Mở Không gian Biên tập cho tác phẩm
 * @param {string} novelId 
 */
function openWorkspace(novelId) {
  const novel = getNovelById(novelId);
  if (!novel) return;

  activeNovelId = novel.id;
  const workspaceSection = document.getElementById('workspace-section');
  if (workspaceSection) {
    workspaceSection.classList.remove('d-none');
    workspaceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  updateWorkspaceHeader(novel);
  refreshChapterSelector(novel);
}

/**
 * Đóng Không gian Biên tập
 */
function closeWorkspace() {
  activeNovelId = null;
  activeChapterId = null;
  const workspaceSection = document.getElementById('workspace-section');
  if (workspaceSection) {
    workspaceSection.classList.add('d-none');
  }
}

/**
 * Cập nhật tiêu đề trên Workspace Header
 * @param {object} novel 
 */
function updateWorkspaceHeader(novel) {
  const badgeTitle = document.getElementById('active-novel-title');
  if (badgeTitle && novel) {
    badgeTitle.textContent = `Đang mở: ${novel.title}`;
  }
}

/**
 * Làm mới danh sách chương trong thẻ select
 * @param {object} novel 
 */
function refreshChapterSelector(novel) {
  const chapterSelect = document.getElementById('chapter-select');
  const editorTextarea = document.getElementById('draft-editor-textarea');
  if (!chapterSelect) return;

  const chapters = Array.isArray(novel.chapters) ? novel.chapters : [];

  if (chapters.length === 0) {
    chapterSelect.innerHTML = '<option value="">(Chưa có chương nào - Bấm "+ Thêm Chương")</option>';
    if (editorTextarea) {
      editorTextarea.value = '';
      editorTextarea.setAttribute('disabled', 'disabled');
      editorTextarea.placeholder = 'Vui lòng bấm nút "+ Thêm Chương" phía trên để bắt đầu viết...';
    }
    activeChapterId = null;
    renderVersionTimeline([]);
    return;
  }

  if (editorTextarea) {
    editorTextarea.removeAttribute('disabled');
    editorTextarea.placeholder = 'Bắt đầu viết những dòng văn đầu tiên của bạn tại đây...';
  }

  chapterSelect.innerHTML = chapters.map((c) => {
    return `<option value="${c.chapterId}">${escapeHtml(c.chapterTitle)}</option>`;
  }).join('');

  // Mặc định chọn chương đầu tiên nếu chưa chọn
  if (!activeChapterId || !chapters.some((c) => c.chapterId === activeChapterId)) {
    activeChapterId = chapters[0].chapterId;
  }
  chapterSelect.value = activeChapterId;

  // Nạp nội dung và lịch sử commit của chương đang chọn
  loadSelectedChapterData(novel, activeChapterId);
}

/**
 * Nạp nội dung bản thảo và timeline của chương được chọn
 * @param {object} novel 
 * @param {string} chapterId 
 */
function loadSelectedChapterData(novel, chapterId) {
  const chapter = (novel.chapters || []).find((c) => c.chapterId === chapterId);
  const editorTextarea = document.getElementById('draft-editor-textarea');
  if (!chapter) return;

  const versions = Array.isArray(chapter.versions) ? chapter.versions : [];
  if (versions.length > 0) {
    // Bản nháp mới nhất ở đầu mảng
    if (editorTextarea) editorTextarea.value = versions[0].content || '';
  } else {
    if (editorTextarea) editorTextarea.value = '';
  }

  renderVersionTimeline(versions);
}

/**
 * Render danh sách lịch sử commit vào timeline cột phải
 * @param {Array} versions 
 */
function renderVersionTimeline(versions) {
  const timelineList = document.getElementById('version-timeline-list');
  const countBadge = document.getElementById('version-count-badge');
  if (!timelineList) return;

  if (countBadge) {
    countBadge.textContent = `${versions.length} bản`;
  }

  if (!Array.isArray(versions) || versions.length === 0) {
    timelineList.innerHTML = `
      <div class="text-center py-4 text-secondary small">
        <i class="fa-solid fa-pen-ruler fs-4 mb-2 d-block opacity-50"></i>
        Chưa có phiên bản nào được lưu.<br>Viết nội dung và bấm <b>"Lưu Phiên Bản"</b> để tạo commit đầu tiên!
      </div>
    `;
    return;
  }

  timelineList.innerHTML = versions.map((ver, idx) => {
    const isLatest = idx === 0;
    const timeFormatted = new Date(ver.timestamp).toLocaleString('vi-VN');
    const safeCommit = escapeHtml(ver.commitMessage || 'Cập nhật bản thảo');

    return `
      <div class="timeline-item">
        <div class="timeline-marker"></div>
        <div class="timeline-content">
          <div class="commit-title d-flex align-items-center justify-content-between">
            <span>${safeCommit}</span>
            ${isLatest ? '<span class="badge bg-success-subtle text-success small" style="font-size: 0.65rem;">Mới nhất</span>' : ''}
          </div>
          <div class="commit-meta">
            <span><i class="fa-regular fa-clock me-1"></i>${timeFormatted}</span>
            <span class="text-muted small">${(ver.content || '').length} ký tự</span>
          </div>
          <div class="text-end">
            <button class="btn-restore-version" data-version-id="${ver.versionId}">
              <i class="fa-solid fa-clock-rotate-left me-1"></i> Khôi phục bản này
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Gắn sự kiện Khôi phục (Restore Version)
  timelineList.querySelectorAll('.btn-restore-version').forEach((btn) => {
    btn.addEventListener('click', () => {
      const versionId = btn.getAttribute('data-version-id');
      handleRestoreVersion(versionId);
    });
  });
}

/**
 * Thiết lập các sự kiện cho Workspace
 */
function setupWorkspaceEvents() {
  // Nút đóng Workspace
  const closeBtn = document.getElementById('close-workspace-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeWorkspace);
  }

  // Đổi chương truyện qua Select box
  const chapterSelect = document.getElementById('chapter-select');
  if (chapterSelect) {
    chapterSelect.addEventListener('change', (e) => {
      activeChapterId = e.target.value;
      const novel = getNovelById(activeNovelId);
      if (novel) {
        loadSelectedChapterData(novel, activeChapterId);
      }
    });
  }

  // Nút thêm chương mới (SweetAlert2 Input)
  const newChapterBtn = document.getElementById('new-chapter-btn');
  if (newChapterBtn) {
    newChapterBtn.addEventListener('click', handleAddNewChapter);
  }

  // Nút lưu phiên bản (Commit Version)
  const saveVersionBtn = document.getElementById('save-version-btn');
  if (saveVersionBtn) {
    saveVersionBtn.addEventListener('click', handleSaveVersion);
  }
}

/**
 * Xử lý thêm chương mới cho tác phẩm đang active
 */
function handleAddNewChapter() {
  if (!activeNovelId) return;

  if (window.Swal) {
    window.Swal.fire({
      title: 'Thêm Chương Mới',
      input: 'text',
      inputLabel: 'Tên chương truyện:',
      inputPlaceholder: 'Ví dụ: Chương 1: Khởi đầu mới...',
      showCancelButton: true,
      confirmButtonText: 'Tạo chương',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#6366f1',
      inputValidator: (value) => {
        if (!value || value.trim().length < 2) {
          return 'Tên chương truyện phải có ít nhất 2 ký tự!';
        }
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const chapterTitle = result.value.trim();
        const createdChapter = addChapter(activeNovelId, chapterTitle);
        if (createdChapter) {
          activeChapterId = createdChapter.chapterId;
          const novel = getNovelById(activeNovelId);
          refreshChapterSelector(novel);
          loadAndRenderTable();
          showToast('success', `Đã tạo "${chapterTitle}" thành công!`);
        }
      }
    });
  }
}

/**
 * Xử lý lưu phiên bản bản thảo (Commit)
 */
function handleSaveVersion() {
  if (!activeNovelId || !activeChapterId) {
    showToast('warning', 'Vui lòng chọn hoặc tạo một chương trước khi lưu phiên bản!');
    return;
  }

  const editorTextarea = document.getElementById('draft-editor-textarea');
  const commitInput = document.getElementById('commit-message-input');
  if (!editorTextarea) return;

  const content = editorTextarea.value;
  const commitMessage = commitInput ? commitInput.value.trim() : '';

  if (!content.trim()) {
    showToast('warning', 'Nội dung bản thảo đang trống, không thể lưu phiên bản!');
    return;
  }

  const newVersion = saveChapterVersion(activeNovelId, activeChapterId, content, commitMessage);
  if (newVersion) {
    if (commitInput) commitInput.value = '';
    const novel = getNovelById(activeNovelId);
    const chapter = (novel.chapters || []).find((c) => c.chapterId === activeChapterId);
    renderVersionTimeline(chapter ? chapter.versions : []);
    showToast('success', 'Đã lưu phiên bản mới (Commit) thành công!');
  }
}

/**
 * Xử lý khôi phục phiên bản lịch sử cũ (Restore Version)
 * @param {string} versionId 
 */
function handleRestoreVersion(versionId) {
  if (!activeNovelId || !activeChapterId) return;

  if (window.Swal) {
    window.Swal.fire({
      title: 'Khôi phục phiên bản này?',
      text: 'Nội dung trong khung soạn thảo sẽ được thay thế bằng văn bản của phiên bản đã chọn!',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#6366f1',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Khôi phục ngay',
      cancelButtonText: 'Hủy'
    }).then((result) => {
      if (result.isConfirmed) {
        const restoredContent = restoreVersion(activeNovelId, activeChapterId, versionId);
        if (restoredContent !== null) {
          const editorTextarea = document.getElementById('draft-editor-textarea');
          if (editorTextarea) {
            editorTextarea.value = restoredContent;
            editorTextarea.focus();
          }
          showToast('success', 'Đã nạp lại nội dung phiên bản vào khung soạn thảo!');
        }
      }
    });
  }
}

// ============================================================
// CÔNG CỤ DỮ LIỆU: XUẤT / NHẬP JSON & XÓA TẤT CẢ
// ============================================================

/**
 * Thiết lập sự kiện cho công cụ Sao lưu / Phục hồi JSON & Xóa tất cả
 */
function setupDataToolsEvents() {
  // 1. Xuất file JSON (Export)
  const exportBtn = document.getElementById('export-json-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExportJson);
  }

  // 2. Nhập file JSON (Import)
  const importInput = document.getElementById('import-json-input');
  if (importInput) {
    importInput.addEventListener('change', handleImportJson);
  }

  // 3. Xóa tất cả (Clear All)
  const clearAllBtn = document.getElementById('clear-all-btn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', handleClearAllNovels);
  }
}

/**
 * Xử lý xuất toàn bộ tác phẩm ra file JSON tải về
 */
function handleExportJson() {
  const jsonString = exportToJson();
  const blob = new Blob([jsonString], { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(blob);

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `novelstudio_backup_${timestampStr}.json`;

  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(downloadUrl);

  showToast('success', `Đã xuất dữ liệu ra file "${fileName}"`);
}

/**
 * Xử lý nhập file JSON từ máy tính người dùng
 * @param {Event} e 
 */
function handleImportJson(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const fileContent = event.target.result;
    const result = importFromJson(fileContent);

    if (result.success) {
      if (window.Swal) {
        window.Swal.fire({
          icon: 'success',
          title: 'Phục hồi thành công!',
          text: result.message,
          confirmButtonColor: '#6366f1'
        });
      }
      loadAndRenderTable();
      closeWorkspace();
    } else {
      if (window.Swal) {
        window.Swal.fire({
          icon: 'error',
          title: 'Không thể nhập file',
          text: result.message,
          confirmButtonColor: '#ef4444'
        });
      }
    }

    // Reset input file để có thể chọn lại file cùng tên
    e.target.value = '';
  };

  reader.onerror = () => {
    showToast('error', 'Đã xảy ra lỗi khi đọc file!');
    e.target.value = '';
  };

  reader.readAsText(file);
}

/**
 * Xử lý Xóa toàn bộ tác phẩm
 */
function handleClearAllNovels() {
  if (window.Swal) {
    window.Swal.fire({
      title: 'Xóa toàn bộ tác phẩm?',
      html: 'Hành động này sẽ dọn sạch toàn bộ danh sách truyện, chương và các phiên bản nháp.<br><b>Không thể hoàn tác!</b>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Đồng ý xóa hết',
      cancelButtonText: 'Hủy'
    }).then((result) => {
      if (result.isConfirmed) {
        clearAllNovels();
        closeWorkspace();
        loadAndRenderTable();
        showToast('info', 'Đã dọn sạch toàn bộ dữ liệu tác phẩm.');
      }
    });
  }
}

/**
 * Hàm hiển thị thông báo Toast SweetAlert2 nhanh
 * @param {'success'|'error'|'warning'|'info'} icon 
 * @param {string} title 
 */
function showToast(icon, title) {
  if (window.Swal) {
    const Toast = window.Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.addEventListener('mouseenter', window.Swal.stopTimer);
        toast.addEventListener('mouseleave', window.Swal.resumeTimer);
      }
    });
    Toast.fire({ icon, title });
  }
}

// Khởi tạo Controller khi DOM đã sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboardController);
} else {
  initDashboardController();
}
