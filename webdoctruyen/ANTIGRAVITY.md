# ANTIGRAVITY.md - Hướng Dẫn & Quy Chuẩn Dự Án Web Đọc Truyện

Tài liệu này chứa thông tin kiến trúc, quy chuẩn phát triển và hướng dẫn cho Antigravity AI khi làm việc trên dự án **Web Đọc Truyện (`webdoctruyen`)**.

---

## 1. Giới Thiệu Dự Án (Project Overview)

- **Tên dự án**: Web Đọc Truyện (`webdoctruyen`)
- **Mục tiêu**: Xây dựng ứng dụng web đọc truyện (truyện chữ / truyện tranh) hiện đại, tối ưu trải nghiệm người dùng (UX/UI), hỗ trợ giao diện đa thiết bị (responsive trên mobile, tablet, desktop).
- **Tính năng cốt lõi dự kiến**:
  - Trang chủ: Banner nổi bật, truyện mới cập nhật, truyện hot, bảng xếp hạng.
  - Phân loại & Tìm kiếm: Tìm kiếm theo từ khóa, lọc theo thể loại (tiên hiệp, ngôn tình, huyền huyễn, kiếm hiệp,...), trạng thái (đang ra, hoàn thành).
  - Trang chi tiết truyện: Thông tin tác giả, mô tả tóm tắt, danh sách chương (chương mới nhất / cũ nhất).
  - Trình đọc (Reader):
    - Đổi chế độ sáng / tối (Dark mode / Light mode).
    - Tùy chỉnh kích thước font chữ, font family, chiều rộng khung đọc, khoảng cách dòng.
    - Điều hướng chuyển chương nhanh (Next/Prev, phím tắt mũi tên).
  - Tiện ích cá nhân: Lưu lịch sử đọc truyện (Local Storage), đánh dấu chương đang đọc (Bookmark), danh sách yêu thích.

---

## 2. Cấu Trúc Thư Mục (Project Structure)

```text
webdoctruyen/
├── index.html              # Trang chủ ứng dụng
├── ANTIGRAVITY.md          # Tài liệu hướng dẫn cho AI & lập trình viên
├── css/
│   ├── style.css           # CSS chính (layout, biến giao diện chung)
│   ├── reader.css          # Giao diện dành riêng cho khung đọc truyện
│   └── responsive.css      # Tinh chỉnh responsive trên các thiết bị
├── js/
│   ├── app.js              # Script khởi chạy và điều hướng chung
│   ├── reader.js           # Xử lý logic trình đọc (đổi font, dark/light mode)
│   ├── storage.js          # Quản lý LocalStorage (lịch sử, bookmark, settings)
│   └── data.js             # Dữ liệu mẫu (mock data truyện/chương)
├── assets/
│   ├── images/             # Ảnh bìa truyện, banners, logo
│   └── icons/              # Icon hệ thống (SVG/Font icons)
└── pages/
    ├── story-detail.html   # Trang thông tin chi tiết truyện
    └── chapter-view.html   # Trang đọc chương truyện
```

---

## 3. Quy Chuẩn Kỹ Thuật (Tech Stack & Coding Standards)

### 3.1. Công nghệ (Tech Stack)
- **HTML5**: Cấu trúc ngữ nghĩa (`<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<footer>`).
- **CSS3**:
  - Thiết kế Mobile-First.
  - Sử dụng CSS Variables để quản lý Theme (Dark/Light Mode) và bảng màu chuẩn.
  - Sử dụng CSS Flexbox & Grid cho layout.
- **JavaScript**:
  - ES6+ (Arrow functions, async/await, Template literals, Modules nếu cần).
  - Mã sạch (Clean Code), tách biệt rõ ràng giữa logic hiển thị (UI) và xử lý dữ liệu (Data/Storage).

### 3.2. Tiêu Chuẩn Giao Diện & Trải Nghiệm (UI/UX Standards)
- **Chế độ đọc truyện thoải mái**:
  - Nền tối: Màu tối êm mắt (`#121212` hoặc `#1a1a1a`), màu chữ xám dịu (`#e0e0e0` / `#cccccc`), tránh độ tương phản quá gắt.
  - Nền sáng: Màu nền ngà vàng hoặc trắng kem nhẹ (`#f9f7f1` / `#fafafa`), tránh nền trắng 100% gây chói mắt.
- **Tương thích thiết bị**:
  - Hoạt động mượt mà trên màn hình cảm ứng di động.
  - Tự động ẩn thanh công cụ khi lướt đọc và hiển thị lại khi chạm/click.

---

## 4. Nguyên Tắc Cho Antigravity AI (AI Assistant Rules)

Khi làm việc trong dự án này, Antigravity AI cần tuân thủ các quy tắc sau:

1. **Bảo toàn mã & Cấu trúc gọn gàng**:
   - Viết mã HTML/CSS/JS có tổ chức, dễ bảo trì và có chú thích (comments) giải thích các hàm quan trọng.
2. **Ưu tiên giải pháp nhẹ & tối ưu**:
   - Sử dụng Vanilla JavaScript và CSS thuần chất lượng cao trước khi tích hợp các thư viện cồng kềnh.
   - Tránh nạp tài nguyên ngoài không cần thiết để đảm bảo tốc độ tải trang cao nhất.
3. **Kiểm tra và duy trì tính khả dụng**:
   - Đảm bảo các liên kết điều hướng và tính năng lưu trữ `localStorage` luôn có fallback an toàn khi gặp lỗi.
4. **Giao tiếp rõ ràng**:
   - Tóm tắt ngắn gọn các thay đổi sau khi tạo hoặc chỉnh sửa mã nguồn.

