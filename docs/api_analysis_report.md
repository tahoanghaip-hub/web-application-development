# BÁO CÁO PHÂN TÍCH API NỘI BỘ & CƠ CHẾ BẮT LỖI
## DỰ ÁN: NOVELSTUDIO (CREATIVE TASK MANAGER)
**Tác giả:** Principal Frontend Architect  
**Phiên bản tài liệu:** 1.0.0  
**Ngày cập nhật:** 2026-10-28  

---

## 1. TỔNG QUAN VỀ KIẾN TRÚC API ẢO (VIRTUAL IN-MEMORY API)
Trong dự án **NOVELSTUDIO**, ứng dụng tuân thủ nghiêm ngặt quy định không sử dụng backend bên ngoài (Node.js, PHP, Python, Firebase,...). Để đảm bảo tính độc lập giữa Tầng Giao diện (Presentation / Controllers) và Tầng Lưu trữ (Persistence / LocalStorage), hệ thống thiết kế một **Tầng Dịch vụ API Ảo (Virtual In-Memory API Layer)** bằng Vanilla JavaScript (ES6 Modules).

Tầng API ảo này đóng vai trò như một RESTful Service giả lập nhưng chạy trực tiếp trên Browser Runtime, cung cấp các hàm xử lý dữ liệu với:
- Đầu vào chuẩn hóa (DTO - Data Transfer Objects).
- Đầu ra có cấu trúc phản hồi nhất quán (Response wrapper hoặc Entity).
- Cơ chế kiểm tra tính hợp lệ dữ liệu (Validation Pipeline).
- Cơ chế bắt lỗi ngoại lệ tập trung (Exception Handling Strategy) an toàn tuyệt đối.

```
+--------------------------------------------------------------------------+
|                       CONTROLLERS / UI LAYER                            |
|             (indexController, dashboardController, statsController)      |
+--------------------------------------------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
|                           SERVICES LAYER                                 |
|      [novelService]       |      [filterService]      |  [statsService]  |
| - Validation Logic        | - Query Engine            | - Metrics Agg    |
| - Virtual ID Generation   | - Multi-criteria match    | - Data Mapping   |
+--------------------------------------------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
|                          STORAGE ADAPTER                                 |
|                       (StorageAdapter.js)                                |
| - JSON Serialization/Deserialization                                     |
| - QuotaExceededError Protection                                          |
| - Corrupted JSON Recovery                                                |
+--------------------------------------------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
|                    BROWSER window.localStorage                           |
+--------------------------------------------------------------------------+
```

---

## 2. ĐẶC TẢ CHI TIẾT CÁC METHOD TRONG HỆ THỐNG

### 2.1. Tầng Storage Core (`StorageAdapter.js`)

| Tên Hàm & Chữ Ký | Tham Số Đầu Vào | Kiểu Trả Về | Mô Tả & Ngoại Lệ Xử Lý |
|---|---|---|---|
| `StorageAdapter.get(key, defaultValue)` | `key: string`<br>`defaultValue: any = []` | `any` | Đọc dữ liệu từ `localStorage` và giải mã JSON. Nếu key không tồn tại hoặc dữ liệu JSON bị hỏng (corrupted), trả về `defaultValue` mà không làm crash ứng dụng. |
| `StorageAdapter.set(key, value)` | `key: string`<br>`value: any` | `boolean` | Mã hóa đối tượng thành chuỗi JSON và ghi vào `localStorage`. Sử dụng khối `try...catch` để bắt lỗi `QuotaExceededError` khi vượt ngưỡng 5MB, đồng thời gọi `Swal.fire` cảnh báo người dùng. |
| `StorageAdapter.remove(key)` | `key: string` | `void` | Xóa một key cụ thể khỏi `localStorage`. |
| `StorageAdapter.clearAll()` | `none` | `void` | Xóa toàn bộ dữ liệu ứng dụng liên quan đến prefix `novelStudio_`. |

#### Code Minh Họa Cơ Chế Bắt Lỗi Storage:
```javascript
export class StorageAdapter {
  static get(key, defaultValue = []) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return defaultValue;
      return JSON.parse(raw);
    } catch (error) {
      console.error(`[StorageAdapter] Lỗi giải mã JSON từ key "${key}":`, error);
      return defaultValue;
    }
  }

  static set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      if (
        error.name === 'QuotaExceededError' ||
        error.code === 22 ||
        error.code === 1014 ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      ) {
        console.error('[StorageAdapter] Quá dung lượng bộ nhớ LocalStorage (5MB)!', error);
        if (window.Swal) {
          window.Swal.fire({
            icon: 'error',
            title: 'Tràn bộ nhớ trình duyệt!',
            text: 'Dung lượng lưu trữ cục bộ đã vượt quá giới hạn 5MB. Vui lòng xuất dữ liệu JSON hoặc xóa bớt truyện cũ!',
            confirmButtonColor: '#6366f1'
          });
        }
      } else {
        console.error(`[StorageAdapter] Lỗi không xác định khi lưu key "${key}":`, error);
      }
      return false;
    }
  }
}
```

---

### 2.2. Dịch Vụ Nghiệp Vụ Truyện (`novelService.js`)

#### A. Khởi tạo & Đọc Dữ Liệu
* **`initSeedData(): Novel[]`**
  - *Mục đích:* Kiểm tra xem `novelStudio_data` có dữ liệu chưa. Nếu rỗng, nạp sẵn 3 bộ truyện mẫu đa dạng trạng thái (`Pending`, `Done`), cấp độ ưu tiên (`Low`, `Medium`, `High`), cùng các chương và lịch sử phiên bản để giáo viên có thể chấm điểm ngay lập tức.
  - *Trả về:* Mảng danh sách tiểu thuyết.
* **`getAllNovels(): Novel[]`**
  - *Mục đích:* Lấy toàn bộ danh sách truyện từ `StorageAdapter`.
* **`getPublishedNovels(): Novel[]`**
  - *Mục đích:* Lấy danh sách các tiểu thuyết có trạng thái hoàn thành (`status === 'Done'`) hoặc có ít nhất một chương ở trạng thái `Published` để phục vụ hiển thị trên trang chủ `index.html`.
* **`getNovelById(id: string): Novel | null`**
  - *Mục đích:* Tìm một tác phẩm theo mã ID duy nhất (`novel_...`). Trả về `null` nếu không tìm thấy.

#### B. Thao Tác CRUD Truyện (Task Management)
* **`createNovel(data: CreateNovelDTO): { success: boolean, novel?: Novel, errors?: Record<string, string> }`**
  - *Validation Rules:*
    - `title`: Chuỗi không rỗng, tối thiểu 3 ký tự, tối đa 150 ký tự.
    - `description`: Chuỗi tối thiểu 10 ký tự.
    - `deadline`: Định dạng `YYYY-MM-DD`, không được nhỏ hơn ngày hiện tại (so sánh với `new Date().setHours(0,0,0,0)`).
    - `priority`: Phải thuộc tập hợp `['Low', 'Medium', 'High']`.
    - `status`: Phải thuộc tập hợp `['Pending', 'Done']` (mặc định `'Pending'`).
  - *Cơ chế sinh ID:* `novel_${Date.now()}` đảm bảo tính duy nhất.
  - *Khởi tạo trường phụ thuộc:* `chapters = []`, `createdAt = new Date().toISOString()`.

* **`updateNovel(id: string, data: UpdateNovelDTO): { success: boolean, novel?: Novel, errors?: Record<string, string> }`**
  - *Xử lý:* Tìm truyện theo ID. Nếu không có, ném lỗi `NovelNotFoundException`.
  - Giữ nguyên `id`, `createdAt`, và mảng `chapters` hiện có, chỉ cập nhật các trường được chỉnh sửa (`title`, `description`, `deadline`, `priority`, `status`).

* **`deleteNovel(id: string): boolean`**
  - *Xử lý:* Lọc bỏ truyện có `id` tương ứng bằng `Array.prototype.filter()`. Ghi đè lại mảng mới vào storage.

* **`toggleNovelStatus(id: string): Novel | null`**
  - *Xử lý:* Đảo trạng thái nhanh giữa `'Pending'` và `'Done'` (tương đương thao tác Toggle Complete của bài toán Task Manager).

* **`clearAllNovels(): void`**
  - *Xử lý:* Xóa toàn bộ danh sách truyện trong storage.

---

### 2.3. Quản Lý Chương & Kiểm Soát Phiên Bản (Bonus Feature: Version Control Engine)

* **`addChapter(novelId: string, chapterTitle: string): Chapter | null`**
  - *Validation:* `chapterTitle` không rỗng, tối thiểu 2 ký tự.
  - *Cấu trúc Chapter sinh mới:*
    ```json
    {
      "chapterId": "chap_1710001999",
      "chapterTitle": "Chương 2: Biến cố bất ngờ",
      "status": "Draft",
      "versions": []
    }
    ```
  - Thêm vào mảng `chapters` của truyện tương ứng.

* **`saveChapterVersion(novelId: string, chapterId: string, content: string, commitMessage: string): Version | null`**
  - *Mục đích:* Lưu một phiên bản bản thảo mới (tương tự như `git commit`).
  - *Validation:* 
    - `content`: Không được để trống.
    - `commitMessage`: Không được để trống (nếu rỗng, tự gán giá trị mặc định `"Cập nhật bản nháp - HH:mm:ss DD/MM/YYYY"`).
  - *Cấu trúc Version sinh mới:*
    ```json
    {
      "versionId": "ver_1710002888",
      "content": "Nội dung chi tiết của chương truyện...",
      "commitMessage": "Hoàn thiện cảnh hành động cao trào",
      "timestamp": "2026-10-28T03:15:00.000Z"
    }
    ```
  - *Cơ chế:* Chèn phiên bản mới nhất vào **đầu mảng** (`unshift`) của `versions` để hiển thị Timeline từ mới nhất đến cũ nhất.

* **`restoreVersion(novelId: string, chapterId: string, versionId: string): string | null`**
  - *Mục đích:* Lấy lại nội dung của một commit cũ trong lịch sử để nạp ngược lại vào khung soạn thảo Editor.
  - *Trả về:* Chuỗi `content` của version đó, phục vụ việc chỉnh sửa tiếp.

---

### 2.4. Xuất / Nhập Dữ Liệu (Backup & Restore Engine)

* **`exportToJson(): string`**
  - Chuyển toàn bộ danh sách `novels` thành chuỗi định dạng JSON có thụt lề (`JSON.stringify(novels, null, 2)`).
  - Trình điều khiển Controller sẽ chuyển chuỗi này thành Blob để kích hoạt tải file tự động `novelstudio_backup_YYYYMMDD.json`.

* **`importFromJson(jsonString: string): { success: boolean, count: number, message: string }`**
  - *Quy trình xác thực an toàn (Strict Schema Validation):*
    1. Kiểm tra JSON cú pháp hợp lệ (`JSON.parse`).
    2. Kiểm tra dữ liệu đầu ra có phải là mảng (`Array.isArray`).
    3. Duyệt từng phần tử để kiểm tra các trường bắt buộc (`id`, `title`, `deadline`, `priority`, `status`).
    4. Khử độc mã XSS đối với các trường văn bản.
    5. Ghi đè vào LocalStorage và thông báo số lượng bản ghi đã khôi phục.

---

### 2.5. Động Cơ Lọc & Sắp Xếp Đa Tiêu Chí (`filterService.js`)

* **`applyFilters(novels: Novel[], criteria: FilterCriteria): Novel[]`**
  - *Tham số `criteria`:*
    ```typescript
    interface FilterCriteria {
      keyword?: string;     // Tìm kiếm không phân biệt hoa thường theo title & description
      status?: string;      // 'All' | 'Pending' | 'Done'
      priority?: string;    // 'All' | 'Low' | 'Medium' | 'High'
      sortBy?: string;      // 'deadline-asc' | 'deadline-desc' | 'created-desc' | 'title-asc'
    }
    ```
  - *Thuật toán xử lý:*
    1. **Text Search:** Chuẩn hóa chuỗi bằng `.toLowerCase().trim()`. Lọc các truyện thỏa mãn `novel.title.toLowerCase().includes(kw) || novel.description.toLowerCase().includes(kw)`.
    2. **Status Match:** Nếu `status !== 'All'`, kiểm tra `novel.status === status`.
    3. **Priority Match:** Nếu `priority !== 'All'`, kiểm tra `novel.priority === priority`.
    4. **Sorting Comparator:**
       - `deadline-asc`: `new Date(a.deadline) - new Date(b.deadline)` (Hạn chót gần nhất trước).
       - `deadline-desc`: `new Date(b.deadline) - new Date(a.deadline)` (Hạn chót xa nhất trước).
       - `created-desc`: `new Date(b.createdAt) - new Date(a.createdAt)` (Mới tạo nhất lên đầu).
       - `title-asc`: `a.title.localeCompare(b.title)` (Thứ tự bảng chữ cái).

---

### 2.6. Thống Kê & Phân Tích Số Liệu (`statsService.js`)

* **`getSummaryMetrics(novels?: Novel[]): MetricsReport`**
  - *Cấu trúc dữ liệu trả về:*
    ```json
    {
      "total": 12,
      "doneCount": 5,
      "pendingCount": 7,
      "completionRate": 41.67,
      "lowCount": 3,
      "mediumCount": 6,
      "highCount": 3,
      "totalChapters": 28,
      "totalVersions": 64
    }
    ```
  - *Mục đích:* Cung cấp số liệu chính xác để hiển thị các Counter Badge và vẽ biểu đồ hình tròn (Pie Chart trạng thái), biểu đồ cột (Bar Chart mức độ ưu tiên) trên trang `statistics.html`.

---

## 3. BẢNG MÃ LỖI & CHIẾN LƯỢC XỬ LÝ (ERROR CODE CATALOG)

| Mã Lỗi Nội Bộ | Tên Ngoại Lệ | Nguyên Nhân Gốc | Hành Động Phục Hồi |
|---|---|---|---|
| `ERR_TITLE_REQUIRED` | Tiêu đề không hợp lệ | Ô Title rỗng hoặc < 3 ký tự | Hiển thị thông báo đỏ dưới input, focus vào `#novel-title` |
| `ERR_DESC_TOO_SHORT` | Mô tả quá ngắn | Ô Description < 10 ký tự | Hiển thị cảnh báo realtime số ký tự còn thiếu |
| `ERR_DEADLINE_PAST` | Hạn chót ở quá khứ | Chọn ngày deadline < ngày hôm nay | Không cho submit, báo lỗi `Deadline không được nhỏ hơn hôm nay` |
| `ERR_NOVEL_NOT_FOUND` | Không tìm thấy truyện | ID truyền vào không tồn tại trong mảng | Thông báo Toast lỗi, reset form hoặc refresh bảng |
| `ERR_STORAGE_QUOTA` | Tràn bộ nhớ LocalStorage | Trình duyệt chạm mốc ~5MB | Bật Modal SweetAlert2 hướng dẫn Export JSON và dọn bớt |
| `ERR_INVALID_IMPORT` | File JSON hỏng/sai format | File backup thiếu cấu trúc chuẩn | Từ chối nạp, giữ nguyên dữ liệu hiện tại, báo lỗi chi tiết |

---

## 4. TỔNG KẾT
Tầng API nội bộ của **NOVELSTUDIO** được thiết kế mạch lạc, tuân thủ nguyên lý Single Responsibility (SRP) và Separation of Concerns (SoC). Nhờ vậy, toàn bộ logic nghiệp vụ được đóng gói độc lập, giúp việc mở rộng tính năng, bảo trì và kiểm thử trở nên dễ dàng và đạt chuẩn đồ án xuất sắc.
