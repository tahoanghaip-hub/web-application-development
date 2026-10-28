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

## 4. KỊCH BẢN THUYẾT TRÌNH DEMO 3 PHÚT (PERFECT 3-MINUTE PITCH)

Dưới đây là kịch bản chuẩn từng giây giúp bạn gây ấn tượng tuyệt đối với Giảng viên chấm điểm:

### PHÚT 1 (0:00 - 1:00) — TỔNG QUAN, GIAO DIỆN & DARK/LIGHT MODE HOÀN HẢO
1. **Mở đầu (15s):**  
   *"Kính thưa Thầy/Cô, hôm nay em xin giới thiệu NOVELSTUDIO — nền tảng quản lý sáng tác truyện cá nhân, được em nâng cấp sáng tạo từ đề tài Task Manager để giải quyết bài toán thực tế của các nhà văn."*
2. **Trình diễn Seed Data (15s):**  
   Chỉ vào màn hình trang chủ `index.html`:  
   *"Hệ thống đã tự động nạp sẵn Dữ liệu mẫu (Seed Data) chuẩn mực ngay lần đầu truy cập, gồm nhiều tác phẩm phong phú trạng thái và chương hồi."*
3. **Trình diễn Dark/Light Mode đồng bộ 100% (30s):**  
   - Bấm vào nút chuyển Theme hình Mặt trời/Mặt trăng trên thanh Navbar (`#theme-toggle-btn`).
   - Nhấn mạnh: *"Toàn bộ hệ thống sử dụng Bootstrap 5.3 kết hợp với CSS Variables tự định nghĩa trong `themes.css`. Nhờ đó, từ thẻ card, bảng, khung nhập liệu, cho đến modal và popup SweetAlert2 đều chuyển đổi màu nền/chữ tức thì mà KHÔNG hề bị lỗi chữ đen trên nền tối hay lóa mắt."*
   - Chuyển trang sang `dashboard.html` và `statistics.html` để chứng minh trạng thái Theme được ghi nhớ xuyên suốt qua `localStorage`.

---

### PHÚT 2 (1:00 - 2:00) — CHU KỲ CRUD ĐẦY ĐỦ, VALIDATION REALTIME & BỘ LỌC ĐA TIÊU CHÍ
1. **Thêm mới tác phẩm & Validation (30s):**  
   - Tại `dashboard.html`, bấm nút **"+ Thêm truyện mới"** (`#open-add-modal-btn`).
   - Cố tình để trống và bấm Lưu: Form hiển thị ngay các thông báo lỗi màu đỏ dưới từng ô nhập liệu.
   - Thử chọn một ngày trong quá khứ: Hệ thống chặn lại và báo *"Deadline không được nhỏ hơn hôm nay"*.
   - Nhập một truyện hợp lệ: Tiêu đề `"Huyền Thoại Biển Sâu"`, Mô tả trên 10 ký tự, chọn Deadline, Priority `"High"`, Status `"Pending"` -> Bấm Lưu.
   - Một Toast SweetAlert2 hiện lên báo thành công, bảng danh sách cập nhật ngay lập tức dòng mới.
2. **Sửa & Đổi trạng thái nhanh (15s):**  
   - Bấm nút icon **Check** trên một dòng truyện: Trạng thái chuyển đổi từ `Pending` sang `Done` (Badge đổi màu xanh lá).
   - Bấm nút icon **Bút chì**: Modal hiển thị lại thông tin để cập nhật.
3. **Tìm kiếm & Bộ lọc kết hợp (15s):**  
   - Gõ từ khóa vào ô `#search-input` -> Bảng lọc tức thời.
   - Kết hợp chọn Bộ lọc Trạng thái (`Done`) và Mức ưu tiên (`High`).
   - Đổi kiểu sắp xếp: Sắp xếp theo Deadline gần nhất.
   - Bấm nút **"Đặt lại"** (`#reset-filter-btn`) để phục hồi danh sách ban đầu.

---

### PHÚT 3 (2:00 - 3:00) — 4 TÍNH NĂNG ĐỘT PHÁ ĐẠT ĐIỂM THƯỞNG (+10 ĐIỂM BONUS)
1. **Tính năng Bonus 1: Quản lý Chương & Kiểm soát Phiên bản Nháp (Git-like Versioning) (30s):**  
   - Tại bảng, bấm nút **"Soạn thảo"** của một bộ truyện -> Khối `#workspace-section` mở ra mượt mà phía dưới.
   - Bấm **"+ Thêm chương mới"** -> Tạo `"Chương 1: Lời nguyền cổ xưa"`.
   - Nhập nội dung vào khung soạn thảo `#draft-editor-textarea`, điền Commit Message: *"Phác thảo bối cảnh bờ biển"*, bấm **"Lưu phiên bản"**.
   - Cột Timeline bên phải lập tức hiển thị commit mới với thời gian cụ thể.
   - Thử sửa lại vài câu trong Editor, lưu commit thứ hai: *"Thêm lời thoại kịch tính"*.
   - Giờ hãy bấm nút **"Khôi phục" (Restore)** ở commit thứ nhất -> Toàn bộ văn bản cũ lập tức được nạp lại vào Editor!
2. **Tính năng Bonus 2: Sao lưu & Phục hồi JSON (Export / Import) (15s):**  
   - Bấm nút **"Xuất JSON"** (`#export-json-btn`): Trình duyệt tải ngay file `novelstudio_backup_*.json`.
   - Bấm **"Xóa tất cả"** (`#clear-all-btn`): Bảng trở về trạng thái trống.
   - Bấm **"Nhập JSON"** (`#import-json-input`) và chọn lại file vừa tải: Dữ liệu được khôi phục 100% nguyên vẹn.
3. **Tính năng Bonus 3: Trung tâm Thống kê & Chart.js Đổi Màu Tự Động (15s):**  
   - Chuyển sang trang `statistics.html`.
   - Giới thiệu 2 biểu đồ: Tỷ lệ hoàn thành truyện và Phân bổ mức độ ưu tiên.
   - **Đặc biệt:** Bấm nút chuyển sang Dark Mode ngay tại trang này -> Hai biểu đồ lập tức cập nhật lại màu chữ và đường lưới sắc nét sang tông sáng, không bị chìm màu.
4. **Kết thúc:** *"Em xin cảm ơn Quý Thầy/Cô đã theo dõi bài báo cáo!"*

---

## 5. TÀI LIỆU KỸ THUẬT THAM KHẢO TRONG THƯ MỤC `docs/`
- [api_analysis_report.md](file:///c:/Users/tahoa/Desktop/GK_WEB/test3/docs/api_analysis_report.md): Phân tích chi tiết chữ ký hàm API nội bộ, xử lý lỗi ngoại lệ và mã lỗi.
- [bao-cao-kien-truc-du-an_2.md](file:///c:/Users/tahoa/Desktop/GK_WEB/test3/docs/bao-cao-kien-truc-du-an_2.md): Báo cáo kiến trúc hệ thống, sơ đồ luồng dữ liệu MVC và cơ chế đồng bộ Dark Mode.
- [catalog_db_analysis.md](file:///c:/Users/tahoa/Desktop/GK_WEB/test3/docs/catalog_db_analysis.md): Đặc tả cấu trúc JSON Schema 3 cấp, bài toán giới hạn 5MB LocalStorage và phòng chống XSS.
- [ke_hoach_trien_khai.md](file:///c:/Users/tahoa/Desktop/GK_WEB/test3/docs/ke_hoach_trien_khai.md): Kế hoạch triển khai 5 giai đoạn và ma trận ánh xạ Rubric chấm điểm 110 điểm.
