# NOVELSTUDIO — NỀN TẢNG QUẢN LÝ SÁNG TÁC TIỂU THUYẾT CÁ NHÂN
> **Dự án Nâng cấp Sáng tạo từ Bài toán "Task Manager"**  
> **Môn học:** Phát triển Ứng dụng Web (Web Application Development)  
> **Xếp loại mục tiêu:** Xuất sắc (100/100 Điểm Chuẩn + 10 Điểm Thưởng Bonus)

---

## 1. GIỚI THIỆU DỰ ÁN
**NOVELSTUDIO** là giải pháp số hóa toàn diện dành cho các tác giả văn học độc lập, chuyển hóa bài toán quản lý tác vụ thông thường (Task Management) thành một **Studio Quản lý Sáng tác & Theo dõi Bản thảo chuyên nghiệp**.

Thay vì chỉ quản lý các đầu việc đơn giản (Title, Deadline, Status), **NOVELSTUDIO** xây dựng mô hình dữ liệu 3 cấp độ:
- **Tác phẩm (Novel / Project Task):** Quản lý mục tiêu tổng thể, tiến độ, thời hạn xuất bản và mức độ ưu tiên.
- **Chương truyện (Chapter / Sub-task):** Chia nhỏ tác phẩm thành các mốc nội dung.
- **Bản nháp & Lịch sử phiên bản (Draft Versioning / Git-like Commits):** Cho phép tác giả lưu trữ từng mốc chỉnh sửa, ghi chú thay đổi (Commit Message), theo dõi dòng thời gian (Timeline) và khôi phục (Restore) lại các câu từ đắt giá đã viết trước đó.

---

## 2. CÔNG NGHỆ ÁP DỤNG & TÍNH ĐỘC LẬP
- **Ngôn ngữ lõi:** HTML5, CSS3, Vanilla JavaScript (ES6+ Modules).
- **Thư viện CDN chuẩn mực:**
  * **Bootstrap 5.3.3:** Nền tảng Responsive Grid và hệ thống Native Dark Mode (`data-bs-theme`).
  * **FontAwesome 6.5.1:** Bộ biểu tượng giao diện hiện đại.
  * **SweetAlert2 (v11):** Hộp thoại cảnh báo và xác nhận cao cấp, được ghi đè CSS Variables tự động đổi màu theo Theme.
  * **Chart.js (v4):** Trực quan hóa số liệu thống kê với cơ chế tái tạo màu chữ/lưới tự động khi đổi chế độ sáng/tối.
- **Không phụ thuộc Backend:** 100% dữ liệu được lưu trữ an toàn trong `window.localStorage` qua `StorageAdapter.js` có cơ chế chống tràn bộ nhớ 5MB và phục hồi JSON hỏng.

---

## 3. HƯỚNG DẪN CÀI ĐẶT & KHỞI CHẠY (QUICK START)

Ứng dụng sử dụng **ES6 Modules** (`import` / `export`), do đó bắt buộc phải chạy qua một HTTP Server cục bộ (Local Web Server) thay vì mở trực tiếp file `file:///` trên trình duyệt.

### Cách 1: Sử dụng Extension "Live Server" trên Visual Studio Code (Khuyên dùng)
1. Cài đặt extension **Live Server** (tác giả *Ritwick Dey*) trong VS Code.
2. Nhấp chuột phải vào file `index.html` trong cây thư mục dự án.
3. Chọn **"Open with Live Server"** (hoặc bấm tổ hợp phím `Alt + L, Alt + O`).
4. Trình duyệt mặc định sẽ tự động mở địa chỉ: `http://127.0.0.1:5500/index.html`.

### Cách 2: Sử dụng lệnh Node.js (`npx serve`)
Mở cửa sổ dòng lệnh (Terminal / PowerShell) tại thư mục dự án:
```powershell
npx -y serve . -p 5500
```
Truy cập: `http://localhost:5500`

### Cách 3: Sử dụng Python
Nếu máy tính đã cài đặt sẵn Python:
```powershell
python -m http.server 5500
```
Truy cập: `http://localhost:5500`

---

## 4. TÀI LIỆU KỸ THUẬT THAM KHẢO TRONG THƯ MỤC `docs/`
- [api_analysis_report.md](file:///c:/Users/tahoa/Desktop/GK_WEB/test3/docs/api_analysis_report.md): Phân tích chi tiết chữ ký hàm API nội bộ, xử lý lỗi ngoại lệ và mã lỗi.
- [bao-cao-kien-truc-du-an_2.md](file:///c:/Users/tahoa/Desktop/GK_WEB/test3/docs/bao-cao-kien-truc-du-an_2.md): Báo cáo kiến trúc hệ thống, sơ đồ luồng dữ liệu MVC và cơ chế đồng bộ Dark Mode.
- [catalog_db_analysis.md](file:///c:/Users/tahoa/Desktop/GK_WEB/test3/docs/catalog_db_analysis.md): Đặc tả cấu trúc JSON Schema 3 cấp, bài toán giới hạn 5MB LocalStorage và phòng chống XSS.
- [ke_hoach_trien_khai.md](file:///c:/Users/tahoa/Desktop/GK_WEB/test3/docs/ke_hoach_trien_khai.md): Kế hoạch triển khai 5 giai đoạn và ma trận ánh xạ Rubric chấm điểm 110 điểm.
