# NovelStudio — test cases và kết quả QA

**Phiên bản:** `cd73ada4fbc76c2baff55f9c7d035b11e55487b0` (`main`) cộng với working tree chưa commit tại thời điểm build QA. Các thay đổi gồm Identity, migration email, giao diện đăng ký/đăng nhập, Compose, README và test. Đây không phải bản phát hành có commit riêng.

**Môi trường:** Windows, Docker Compose project `novelstudio-qa-1127`; gateway `http://127.0.0.1:18082`, Mailpit `http://127.0.0.1:28025`; PostgreSQL volume `novelstudio-qa-1127_pgdata` riêng; dữ liệu giả lập, SMTP chỉ trỏ tới Mailpit.

**Ngày chạy:** 27/11/2026 (Asia/Bangkok).

**Công cụ đã dùng:** Git, Docker Compose, Python, Playwright/Chrome, Mailpit, rà soát mã nguồn, VS Code để thử mở Antigravity. Không có kết quả rà soát do Antigravity trả về.

Image ID của bản QA đã chạy: gateway `sha256:ba8b8859a8d76af4eb7fb8943fa47014c53b96837d44de8b6073fc5a10c9fca3`, identity `sha256:a0c1f4593864d6baf28686dafbfc01b1e41645a3fe7c2ae61006d526509cca0b`, studio `sha256:619f90542b59a0f64848726840c684013d3c31a97ad6933da61ec3b5abc8a486`. Các image này chỉ thuộc project QA; không suy ra phiên bản của các server Compose khác.

## Cách chạy lại

Chạy trong PowerShell từ thư mục gốc. Cần Docker Engine, Python và Playwright/Chrome theo README. Chọn cổng trống nếu `18082` hoặc `28025` đã được dùng. Mỗi lần chạy dùng project và volume QA mới; không dùng `.env` của server đang chạy.

```powershell
foreach ($key in 'POSTGRES_PASSWORD','IDENTITY_DB_PASSWORD','STUDIO_DB_PASSWORD','VERIFICATION_HMAC_KEY') {
    [Environment]::SetEnvironmentVariable($key, (py -c "import secrets; print(secrets.token_hex(32))"), 'Process')
}
$env:GATEWAY_BIND = '127.0.0.1'
$env:GATEWAY_PORT = '18082'
$env:MAILPIT_PORT = '28025'
$env:MAILPIT_URL = 'http://127.0.0.1:28025'
$env:TEST_URL = 'http://127.0.0.1:18082'
$env:COOKIE_SECURE = 'false'
$env:SMTP_HOST = 'mailpit'
$env:SMTP_PORT = '1025'
$env:SMTP_SECURITY = 'plain'
$env:SMTP_USERNAME = ''
$env:SMTP_PASSWORD = ''
docker compose --env-file .env.example --profile mailpit -p novelstudio-qa-1127 up -d --build --wait
py tests/api_smoke.py
.\.venv\Scripts\python tests/browser_smoke.py
docker compose --env-file .env.example --profile mailpit -p novelstudio-qa-1127 down -v
```

Giữ nguyên các biến mật khẩu trong cùng phiên PowerShell cho lệnh `down -v`. Bài API chờ 61 giây trước khi gửi lại và 301 giây để mã hết hạn. Bài tài khoản cũ dùng fixture giả lập với `email = NULL` trong database QA; không kiểm tra quá trình nâng cấp một volume thật từ migration 0001. Không ghi OTP, mật khẩu, cookie hay nội dung người dùng vào tài liệu này.

## Bằng chứng chạy

| Mã | Quan sát |
|---|---|
| E01 | `docker compose ... up -d --build --wait`: cả `db`, `identity`, `studio`, `gateway`, `mailpit` đều healthy; gateway chỉ publish `127.0.0.1:18082`, Mailpit chỉ publish `127.0.0.1:28025`. Hai Compose project khác đang chạy không bị thay đổi. |
| E02 | `tests/browser_smoke.py`: in `PASS UI register, login, create novel/chapter, save and reload`. |
| E03 | `tests/browser_smoke.py`: in `PASS public reading while session pending, cancel, wrong password, one-time create form and expired session`. |
| E04 | `tests/browser_smoke.py`: in `PASS lost acknowledgement, reauthentication without reload, JSON UI round trip` và `PASS failed save, retry, statistics, theme, mobile guest reader`; tiến trình kết thúc mã 0. |
| E05 | `tests/api_smoke.py`: in `PASS registration, profile, session, create and save`. |
| E06 | `tests/api_smoke.py`: in `PASS scoped reads/writes, Author permissions, CSRF, publication, restore, search and pagination`. |
| E07 | `tests/api_smoke.py`: in `PASS transactional import, concurrent duplicate, timestamps, private import, delete, logout`. |
| E08 | `tests/api_smoke.py`: in `PASS resend invalidates previous code; waiting for actual expiry`. |
| E09 | Fixture QA có `email = NULL` và tên kiểu email: đăng nhập bằng tên (không phân biệt hoa/thường) thành công; đăng ký email trùng tên cũ trả 409. |
| E10 | `git diff --check` kết thúc mã 0. Không tìm thấy tiến trình `cloudflared` đang chạy; không có URL HTTPS được cung cấp để đối chiếu đúng bản chia sẻ. |
| E11 | `tests/api_smoke.py`: in `PASS expiry and cumulative attempt limit`; tiến trình kết thúc mã 0 sau khi chờ đồng hồ thật. |

## Test cases

`PASS` chỉ dành cho thao tác đã chạy. Với `BLOCKED` hoặc `NOT RUN`, ô **Kết quả thực tế** để trống và lý do nằm ở **Bằng chứng**. Các test tự động dùng tài khoản và tác phẩm giả lập `example.com`.

| ID | Mục tiêu | Ưu tiên | Tiền điều kiện | Dữ liệu thử | Các bước | Kết quả mong đợi | Kết quả thực tế | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|---|---|---|---|
| QA-01 | Khách tìm và đọc chương công khai | P0 | Có bản đã xuất bản trong QA | Tên truyện giả lập | Mở trang chủ; tìm tên; mở truyện; chuyển chương | Tìm thấy truyện, chỉ đọc nội dung chương đã xuất bản | Đọc được hai chương đã xuất bản trên trình duyệt khách | PASS | E03; `tests/browser_smoke.py` |
| QA-02 | Bản nháp riêng không xuất hiện công khai | P0 | Có bản công khai và bản nháp mới | Nội dung giả lập khác nhau | Lưu bản nháp mới; gọi thư viện công khai; mở bằng khách | Khách chỉ thấy bản đã xuất bản; không thấy ghi chú riêng | API công khai trả đúng một phiên bản công khai, không có nội dung/ghi chú bản nháp | PASS | E06; `tests/api_smoke.py` |
| QA-03 | “Tạo tác phẩm” dẫn tới đúng form sau đăng nhập | P0 | Khách ở trang chủ | Tài khoản QA đã xác minh | Bấm Tạo tác phẩm; đăng nhập; xem dashboard; tải lại | Form tạo mở một lần sau đăng nhập; tải lại không tự mở lại | Form tạo hiện đúng một lần, không gửi yêu cầu tạo tự động | PASS | E03; `tests/browser_smoke.py` |
| QA-04 | Hủy hoặc nhập sai mật khẩu vẫn đọc được | P0 | Khách thấy truyện công khai | Mật khẩu giả lập sai | Bấm Tạo tác phẩm; nhập sai; đóng modal; tìm và đọc | Vẫn ở trang chủ và đọc được truyện | Đọc lại được chương công khai | PASS | E03; `tests/browser_smoke.py` |
| QA-05 | Đăng ký hợp lệ nhận mã 4 số qua Mailpit | P0 | Mailpit QA healthy | Tên/email `example.com` và mật khẩu ngẫu nhiên | Gửi form đăng ký; đọc thư ở Mailpit | Nhận một mã gồm đúng 4 chữ số; chưa tạo phiên đăng nhập | Mailpit nhận một thư; helper đọc được mã 4 số | PASS | E02, E05; `tests/mailbox_helpers.py` |
| QA-06 | Tài khoản chưa xác minh không đăng nhập được | P0 | Đã gửi mã, chưa xác minh | Tài khoản mới giả lập | Thử đăng nhập trước xác minh | Bị từ chối | API trả 401 | PASS | E05; `tests/api_smoke.py` |
| QA-07 | Xác minh rồi đăng nhập bằng tên hoặc email | P0 | Có mã Mailpit hợp lệ | Tên và email với chữ hoa/thường | Xác minh; đăng nhập lần lượt bằng tên và email | Tài khoản Author hoạt động bằng cả hai định danh | Xác minh thành công; hai cách đăng nhập trả cùng người dùng | PASS | E02, E05; `tests/api_smoke.py` |
| QA-08 | Chặn đăng ký trùng tên hoặc email | P0 | Đã có tài khoản xác minh | Tên/email đã dùng | Gửi đăng ký với tên trùng; gửi với email trùng | Mỗi trường hợp trả lỗi xung đột | Cả hai trả 409 | PASS | E05; `tests/api_smoke.py` |
| QA-09 | Mã sai và mã đã dùng bị từ chối | P0 | Có challenge QA | Mã khác mã Mailpit; mã đã xác minh | Nhập mã sai; xác minh đúng; dùng lại mã | Mã sai/đã dùng không xác minh lần nữa | Mã sai trả 400; mã dùng lại trả 400; xác minh đồng thời chỉ một yêu cầu thành công | PASS | E05; `tests/api_smoke.py` |
| QA-10 | Gửi lại vô hiệu mã cũ | P0 | Có challenge, qua thời gian chờ 60 giây | Hai mã Mailpit liên tiếp | Gửi lại; thử mã cũ | Mã mới khác mã cũ; mã cũ bị từ chối | Mã mới khác; mã cũ trả 400 | PASS | E08; `tests/api_smoke.py` |
| QA-11 | Mã hết hạn và giới hạn lần nhập sai | P0 | Có challenge QA, chờ đồng hồ thật | Mã sau gửi lại; 5 lần sai | Chờ quá 5 phút; thử mã; gửi lại; nhập sai nhiều lần | Mã hết hạn bị từ chối; hết lượt bị khóa | Mã hết hạn trả 400; sau 5 lần sai, mã đúng cũng trả 429 | PASS | E11; `tests/api_smoke.py` |
| QA-12 | Tài khoản cũ không email đăng nhập bằng tên | P0 | Fixture `email = NULL` trong QA | Tên kiểu email, mật khẩu giả lập | Đăng nhập bằng tên viết hoa; thử đăng ký email trùng tên cũ | Đăng nhập được; chặn xung đột định danh | Đăng nhập thành công; trường hợp trùng trả 409 | PASS | E09; `services/identity/app/main.py`, `tests/api_smoke.py` |
| QA-13 | Đăng nhập lại cùng tài khoản giữ bản đang soạn trong tab | P0 | Đang soạn, phiên hết hạn | Nội dung chưa lưu giả lập | Làm hết phiên; thử lưu; đăng nhập lại cùng tài khoản | Nội dung trong editor còn nguyên, lưu lại được | Nội dung giữ nguyên và số phiên bản tăng sau lưu | PASS | E04; `tests/browser_smoke.py` |
| QA-14 | Người dùng không xem/sửa tác phẩm người khác | P0 | Hai tài khoản QA | ID tác phẩm của tài khoản A | B gọi đọc/sửa/xóa, tạo chương, lưu/xuất bản bằng ID của A; thử header vai trò giả | Bị 404; dữ liệu B không lẫn A | Các thao tác bị 404; thống kê/xuất của B không chứa dữ liệu A | PASS | E06; `services/studio/app/security.py`, `services/studio/app/main.py` |
| QA-15 | Tạo tác phẩm, chương, lưu bản nháp, tải lại | P0 | Đã đăng nhập | Tác phẩm và chương giả lập | Tạo; soạn; lưu; reload | Nội dung đã lưu còn nguyên | UI hiển thị đúng nội dung sau reload | PASS | E02; `tests/browser_smoke.py` |
| QA-16 | Xuất bản rồi gỡ công khai | P0 | Có phiên bản đã lưu | Bản giả lập | Xuất bản; đọc bằng khách; gỡ công khai; đọc lại | Chỉ bản được chọn xuất hiện; gỡ xong biến mất | API công khai hiện bản đã chọn rồi không còn truyện sau gỡ | PASS | E06; `tests/api_smoke.py` |
| QA-17 | Phân quyền Admin và bảo vệ thao tác ghi | P1 | Tài khoản Author QA | Yêu cầu thiếu header xác nhận | Gọi danh sách tài khoản; xuất bản thiếu header | Author không xem được danh sách; thao tác ghi thiếu header bị chặn | Trả 403 cho cả hai | PASS | E06; `tests/api_smoke.py` |
| QA-18 | Mất phản hồi khi lưu và thử lại | P1 | Đang soạn ở QA | Bản nháp giả lập | Giả lập lỗi mạng trước/sau server nhận; thử lưu lại | Giữ bản đang gõ; không tạo bản trùng | Editor giữ nội dung; thử lại tạo đúng một bản mới | PASS | E04; `tests/browser_smoke.py` |
| QA-19 | Mở trang trên HTTPS đúng bản đang chia sẻ | P0 | Có URL HTTPS đang chạy | URL chia sẻ | Mở HTTPS; đối chiếu phiên bản | Trang mở qua HTTPS đúng bản cần kiểm |  | BLOCKED | Không được cung cấp URL HTTPS; không thấy tiến trình `cloudflared` đang chạy (E10). Không thay đổi server để tự tạo tunnel. |
| QA-20 | Đăng nhập và reload qua HTTPS | P0 | QA-19 khả dụng | Tài khoản thử được phép | Đăng nhập trên HTTPS; tải lại | Cookie Secure giữ phiên trên cùng origin |  | BLOCKED | Phụ thuộc QA-19; chưa kiểm tra cookie trên HTTPS. |
| QA-21 | Truy cập HTTPS từ thiết bị ở mạng khác | P1 | Có URL HTTPS và thiết bị khác | Thiết bị thử | Mở URL từ mạng khác | Trang và phiên hoạt động |  | NOT RUN | Không có thiết bị/mạng thứ hai trong phiên QA này. |

## Rà soát độc lập và lỗi

Extension Antigravity đã cài và mở được trong VS Code. Bước gửi yêu cầu rà soát bị cơ chế duyệt tự động từ chối vì Antigravity là đích ngoài chưa được xác minh và có thể đọc/chuyển mã nguồn hoặc cấu hình chưa commit, gồm dữ liệu nhạy cảm. Do đó **không có phát hiện nào từ Antigravity** để đối chiếu; không ghi công cụ này như đã thực hiện rà soát. Việc rà soát tự thực hiện đã đọc Identity, migration email, phân quyền Studio, luồng giao diện và Compose/gateway, rồi đối chiếu với các bài API/UI ở trên.

**Lỗi sản phẩm đã xác nhận:** chưa có trong phạm vi HTTP/Mailpit và các luồng đã chạy. Không gộp sự cố dựng fixture QA hoặc cổng Mailpit bị chiếm vào lỗi sản phẩm. Các mục HTTPS và truy cập từ mạng khác chưa được kết luận.

## Tổng kết

| PASS | FAIL | BLOCKED | NOT RUN | Tổng |
|---:|---:|---:|---:|---:|
| 18 | 0 | 2 | 1 | 21 |

**Ưu tiên theo dõi:** (1) QA-19/20 trên URL HTTPS thực tế; (2) QA-21 từ thiết bị ở mạng khác. Hiện chưa có lỗi sản phẩm đã xác nhận để xếp hạng.
