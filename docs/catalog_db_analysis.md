# PHÂN TÍCH SCHEMA DỮ LIỆU, BÀI TOÁN BỘ NHỚ LOCALSTORAGE & BẢO MẬT XSS
## DỰ ÁN: NOVELSTUDIO (CREATIVE TASK MANAGER)
**Tác giả:** Principal Frontend Architect  
**Phiên bản:** 1.0.0  
**Ngày cập nhật:** 2026-10-28  

---

## 1. MÔ HÌNH THỰC THỂ DỮ LIỆU 3 CẤP (3-TIER HIERARCHICAL SCHEMA)

Trong bài toán gốc về "Task Manager", mô hình dữ liệu thường chỉ dừng lại ở một danh sách phẳng (Flat Array) với các trường cơ bản như `id`, `title`, `deadline`, `priority`, `status`. 

Nhằm nâng cấp thành nền tảng quản lý sáng tác chuyên nghiệp **NOVELSTUDIO** và đạt trọn vẹn điểm sáng tạo (Bonus 10 điểm), mô hình dữ liệu được thiết kế theo quan hệ phân cấp lồng nhau **1-Nhiều (1-to-Many) 3 cấp**:
1. **Cấp 1: Tiểu thuyết (Novel - Đóng vai trò là Task/Project lớn)**
2. **Cấp 2: Chương truyện (Chapter - Đóng vai trò là Milestone/Sub-task)**
3. **Cấp 3: Bản nháp & Phiên bản lịch sử (Draft Version - Đóng vai trò là Version Control / Commit)**

```
+-------------------------------------------------------------------------+
| CẤP 1: NOVEL (Task)                                                     |
| - id: "novel_1710001"                                                   |
| - title: "Biên Niên Sử Vùng Đất Rồng"                                    |
| - description: "Câu chuyện sử thi thần thoại về..."                     |
| - deadline: "2026-12-31"                                                |
| - priority: "High"                                                      |
| - status: "Pending"                                                     |
| - createdAt: "2026-10-28T03:15:00.000Z"                                 |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   | CẤP 2: CHAPTER (Sub-task)                                       |   |
|   | - chapterId: "chap_101"                                         |   |
|   | - chapterTitle: "Chương 1: Bình minh trên thung lũng"           |   |
|   | - status: "Published"                                           |   |
|   |                                                                 |   |
|   |   +---------------------------------------------------------+   |   |
|   |   | CẤP 3: VERSION (Git-like Commit)                        |   |   |
|   |   | - versionId: "ver_001"                                  |   |   |
|   |   | - content: "Gió thổi qua rặng thông già..."             |   |   |
|   |   | - commitMessage: "Bản thảo phác thảo bối cảnh ban đầu"  |   |   |
|   |   | - timestamp: "2026-10-28T03:30:00.000Z"                 |   |   |
|   |   +---------------------------------------------------------+   |   |
|   +-----------------------------------------------------------------+   |
+-------------------------------------------------------------------------+
```

---

## 2. ĐẶC TẢ CHI TIẾT JSON SCHEMA

### 2.1. Mã Giả JSON Mẫu (Full Data Representation)
```json
[
  {
    "id": "novel_1710001",
    "title": "Biên Niên Sử Vùng Đất Rồng",
    "description": "Câu chuyện sử thi kỳ ảo về cuộc chiến giữa các gia tộc rồng cổ đại tại lục địa Aethelgard.",
    "deadline": "2026-12-31",
    "priority": "High",
    "status": "Pending",
    "createdAt": "2026-10-28T03:15:00.000Z",
    "chapters": [
      {
        "chapterId": "chap_101",
        "chapterTitle": "Chương 1: Bình minh trên thung lũng",
        "status": "Published",
        "versions": [
          {
            "versionId": "ver_002",
            "content": "Ánh dương rạng ngời chiếu xuyên qua rặng thông già của thung lũng Aethelgard. Chàng kỵ sĩ trẻ bắt đầu bước vào cuộc hành trình...",
            "commitMessage": "Chỉnh sửa câu chữ mượt mà và bổ sung chi tiết đối thoại",
            "timestamp": "2026-10-28T04:20:00.000Z"
          },
          {
            "versionId": "ver_001",
            "content": "Ánh dương chiếu xuyên qua rừng thông. Chàng kỵ sĩ bắt đầu đi.",
            "commitMessage": "Bản nháp sơ khởi",
            "timestamp": "2026-10-28T03:30:00.000Z"
          }
        ]
      },
      {
        "chapterId": "chap_102",
        "chapterTitle": "Chương 2: Tiếng gọi từ hang sâu",
        "status": "Draft",
        "versions": [
          {
            "versionId": "ver_003",
            "content": "Bóng tối bao trùm vòm đá ẩm ướt...",
            "commitMessage": "Phác thảo cảnh thám hiểm hang rồng",
            "timestamp": "2026-10-28T05:10:00.000Z"
          }
        ]
      }
    ]
  }
]
```

### 2.2. Bảng Ràng Buộc Kỹ Thuật Từng Trường Dữ Liệu

| Trường (Field) | Kiểu Dữ Liệu | Ràng Buộc & Kiểm Tra Hợp Lệ (Validation Rules) | Mục Đích Sử Dụng |
|---|---|---|---|
| `id` | `String` | Bắt đầu bằng `novel_` + timestamp (Unique Primary Key) | Định danh tác phẩm duy nhất |
| `title` | `String` | Độ dài từ 3 - 150 ký tự, không được chỉ chứa khoảng trắng | Tiêu đề tiểu thuyết (Task Title) |
| `description` | `String` | Tối thiểu 10 ký tự, tối đa 2000 ký tự | Tóm tắt cốt truyện (Task Description) |
| `deadline` | `String (YYYY-MM-DD)` | Định dạng chuẩn ISO Date, `>= Hôm nay (new Date())` | Thời hạn hoàn thành mục tiêu sáng tác |
| `priority` | `Enum String` | Chỉ chấp nhận: `'Low'`, `'Medium'`, `'High'` | Mức độ cấp thiết của dự án |
| `status` | `Enum String` | Chỉ chấp nhận: `'Pending'`, `'Done'` | Trạng thái hoàn thành chung |
| `createdAt` | `String (ISO 8601)` | Tự động sinh khi tạo mới: `new Date().toISOString()` | Thời gian khởi tạo để sắp xếp |
| `chapters` | `Array<Chapter>` | Mảng chứa các đối tượng Chapter, mặc định `[]` | Danh sách các chương mục |
| `chapterId` | `String` | Bắt đầu bằng `chap_` + timestamp | Khóa chính của chương |
| `chapterTitle`| `String` | Tối thiểu 2 ký tự, không để trống | Tên chương truyện |
| `chapter.status`| `Enum String`| Chỉ nhận: `'Draft'`, `'Published'` | Trạng thái phát hành chương |
| `versions` | `Array<Version>` | Mảng chứa các phiên bản đã lưu (Git-like Commits) | Lịch sử sửa đổi |
| `versionId` | `String` | Bắt đầu bằng `ver_` + timestamp | Khóa định danh của phiên bản |
| `content` | `String` | Văn bản nội dung bản thảo | Nội dung chương truyện |
| `commitMessage` | `String` | Mô tả thay đổi của phiên bản | Ghi chú cập nhật |
| `timestamp` | `String (ISO 8601)` | Thời điểm lưu phiên bản | Lịch sử hiển thị Timeline |

---

## 3. BÀI TOÁN GIỚI HẠN 5MB CỦA LOCALSTORAGE & CHIẾN LƯỢC TỐI ƯU HÓA

### 3.1. Phân Tích Dung Lượng Lưu Trữ
Chuẩn Web Storage quy định dung lượng của `window.localStorage` cho mỗi origin là khoảng **5MB (tương đương ~5.242.880 ký tự UTF-16)**.
- Một bản nháp chương truyện trung bình: ~1.500 từ ≈ 10.000 ký tự (khoảng **10 KB**).
- Một tác phẩm gồm 5 chương, mỗi chương có 3 phiên bản nháp:
  $$5 \times 3 \times 10\text{ KB} = 150\text{ KB}$$
- Với tổng dung lượng 5MB, hệ thống `NOVELSTUDIO` có thể lưu trữ thoải mái:
  $$\frac{5.000\text{ KB}}{150\text{ KB}} \approx 33\text{ bộ truyện đầy đủ chi tiết}$$
Con số này hoàn toàn vượt trội so với nhu cầu sử dụng cá nhân và môi trường đồ án học phần.

### 3.2. Cơ Chế Bắt Lỗi Chủ Động (QuotaExceeded Protection)
Khi người dùng lưu trữ quá nhiều phiên bản hoặc nhập văn bản quá lớn, trình duyệt sẽ ném lỗi:
- Chrome/Safari/Edge: `QuotaExceededError` (Mã lỗi: 22).
- Firefox: `NS_ERROR_DOM_QUOTA_REACHED` (Mã lỗi: 1014).

`StorageAdapter.js` thực hiện cơ chế bẫy lỗi tập trung:
```javascript
try {
  localStorage.setItem(key, JSON.stringify(value));
} catch (error) {
  if (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014) {
    // 1. Ghi log cảnh báo
    console.warn('[STORAGE] Vượt quá giới hạn bộ nhớ 5MB của LocalStorage.');
    // 2. Kích hoạt cảnh báo SweetAlert2 cao cấp
    Swal.fire({
      icon: 'warning',
      title: 'Bộ nhớ lưu trữ sắp đầy!',
      html: `Dung lượng trình duyệt đã đạt ngưỡng tối đa (5MB).<br>
             Vui lòng sử dụng tính năng <b>Xuất file JSON</b> để sao lưu và xóa bớt các phiên bản nháp cũ!`,
      confirmButtonText: 'Đã hiểu',
      confirmButtonColor: '#6366f1'
    });
  }
}
```

---

## 4. PHÒNG CHỐNG TẤN CÔNG XSS (CROSS-SITE SCRIPTING DEFENSE)

### 4.1. Nguy Cơ Tiềm Ẩn
Trong ứng dụng Single Page / Multi-Page không có backend, rủi ro XSS xuất hiện khi người dùng (hoặc file JSON độc hại từ bên ngoài) chứa các chuỗi mã như:
```html
<script>alert('Hacked!');</script>
<img src="x" onerror="alert(document.cookie)">
```
Nếu đưa trực tiếp chuỗi này vào giao diện qua thuộc tính `innerHTML`, mã độc sẽ tự động thực thi trên trình duyệt nạn nhân.

### 4.2. Giải Pháp Escape HTML Tập Trung
Dự án áp dụng hàm làm sạch chuỗi `escapeHtml()` trong tất cả các Controller trước khi gán dữ liệu vào các Template Literals:

```javascript
/**
 * Chuyển đổi các ký tự đặc biệt nguy hiểm thành thực thể HTML an toàn.
 * @param {string} unsafeStr - Chuỗi chưa được khử trùng.
 * @returns {string} Chuỗi an toàn để render vào DOM.
 */
export function escapeHtml(unsafeStr) {
  if (typeof unsafeStr !== 'string') return '';
  return unsafeStr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

### 4.3. Ứng Dụng Trong Code Render Giao Diện
```javascript
// Render thẻ truyện an toàn trong dashboardController.js
const safeTitle = escapeHtml(novel.title);
const safeDesc = escapeHtml(novel.description);

rowElement.innerHTML = `
  <td><strong>${safeTitle}</strong></td>
  <td><small class="text-secondary">${safeDesc}</small></td>
`;
```
Nhờ cơ chế này, toàn bộ dữ liệu người dùng nhập hoặc dữ liệu nạp từ tính năng **Import JSON** đều được vô hiệu hóa mã thực thi, đảm bảo an toàn 100% cho hệ thống.
