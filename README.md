# NovelStudio

NovelStudio là không gian viết tiểu thuyết cá nhân trên Windows. Tác giả quản lý tác phẩm, chương và lịch sử bản thảo ở Trạm Sáng Tác. Khách đọc các phiên bản tác giả đã chọn xuất bản. Trang Thống kê tổng hợp dữ liệu của tài khoản đang đăng nhập.

## Khởi động từ checkout mới

Cài Docker Desktop cho Windows, bật Linux containers và khởi động Docker Engine. Lần build đầu cần Internet để tải image, gói Python và thư viện giao diện. Các trang, phông chữ, biểu đồ và API sau khi build đều được phục vụ cùng origin.

Nếu PowerShell báo không tìm thấy `docker`, kiểm tra Docker Desktop đã được cài, sau đó mở một PowerShell mới. Nếu chọn WSL 2 và Windows báo thiếu WSL, mở PowerShell với quyền quản trị và chạy `wsl --install --no-distribution`. Khởi động lại nếu Windows yêu cầu, rồi cài và mở Docker Desktop. Đợi `docker version` hiển thị cả Client và Server trước khi chạy Compose. [Cài Docker Desktop trên Windows](https://docs.docker.com/desktop/setup/install/windows-install/) · [Lệnh WSL](https://learn.microsoft.com/windows/wsl/reference)

Mở PowerShell ở thư mục có `compose.yaml` và chạy các lệnh sau.

```powershell
docker version
docker compose version
powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\ops\New-Environment.ps1
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
Start-Process http://127.0.0.1:8080
```

Lệnh tạo môi trường dùng lại `.env` nếu file đã tồn tại. Với checkout mới, lệnh tạo file từ `.env.example` với ba mật khẩu ngẫu nhiên khác nhau. Cũng có thể sao chép mẫu rồi tự điền cả ba mật khẩu. Volume mới sẽ được khởi tạo bằng `ops/init.sql`. Mỗi API tự chạy migration của mình trước khi nhận yêu cầu. Giữ bản sao riêng của `.env`. Sau khi đã có volume, đổi mật khẩu trong PostgreSQL cùng lúc với cấu hình tương ứng.

## Viết, xuất bản và quản trị

1. Mở **Trạm Sáng Tác → Đăng nhập để mở không gian cá nhân**. Nhập tên và mật khẩu, chọn **Đăng ký**, rồi **Đăng nhập**. Menu tài khoản cho phép đổi bút danh và đăng xuất.
2. Chọn **Thêm tác phẩm**, nhập thông tin và hạn hoàn thành. Mở nút hình ngòi bút ở hàng vừa tạo, thêm chương, soạn nội dung và chọn **Lưu phiên bản**. Có thể lọc danh sách theo từ khóa, trạng thái, mức ưu tiên và chuyển trang.
3. Chờ thông báo **Đã lưu phiên bản**. Nếu mất kết nối, giữ tab mở và bấm lưu lại. Nếu phiên đã hết hạn, đăng nhập lại cùng tài khoản trong menu rồi thử lưu. Bản đang gõ nằm trong bộ nhớ tab cho đến khi server xác nhận. Tải lại hoặc đóng tab có thể làm mất phần chưa lưu.
4. Chọn **Khôi phục** ở một bản cũ để tạo bản mới từ nội dung đó. Chọn **Xuất bản** ở phiên bản muốn chia sẻ. Tên chương, thông tin tác phẩm tại thời điểm xuất bản và nội dung bản được chọn sẽ xuất hiện ở trang chủ. Mỗi chương có tối đa một bản công khai. Muốn thu hồi, chọn **Gỡ chương công khai**. Đánh dấu tác phẩm hoàn thành chỉ cập nhật tiến độ.
5. Mở **Thống kê** để xem số tác phẩm, chương, phiên bản, tỷ lệ hoàn thành và phân bố ưu tiên.

Tạo một tài khoản Admin mới bằng lệnh tương tác sau. Mật khẩu được nhập ẩn.

```powershell
docker compose exec identity python -m app.admin
```

Admin đăng nhập rồi mở **Tài khoản → Danh sách tài khoản**. Thư viện bản thảo của Admin cũng chịu cùng điều kiện sở hữu như Author.

## Chuyển thư viện localStorage cũ

Mở đúng trình duyệt, hồ sơ, giao thức, host và cổng đã dùng với bản tĩnh. Ở dashboard cũ, bấm **Xuất JSON**. Nếu phiên bản mới chạy ngay trên origin cũ, dashboard có nút **Xuất JSON từ thư viện cũ trên trình duyệt này** khi tìm thấy khóa `novelStudio_data`. Nút này tải nguyên chuỗi đang lưu. Thao tác xuất có thể thực hiện trước khi đăng nhập. Ví dụ, `localhost:5500` và `127.0.0.1:8080` là hai origin khác nhau.

Giữ nguyên file nguồn để đối chiếu. Đăng nhập trên máy chủ mới, chọn **Nhập JSON**, rồi mở chương đối chiếu nội dung, số phiên bản và thời điểm. Dữ liệu được thêm vào thư viện hiện có và luôn bắt đầu ở chế độ riêng tư. Server cấp ID mới, giữ thứ tự chương, thứ tự lịch sử, nội dung, ghi chú và thời điểm. Giờ hiển thị phụ thuộc múi giờ người đọc. Cùng một bản sao lưu đã nhập vào cùng tài khoản sẽ trả về số tác phẩm thêm bằng 0, kể cả khi hai yêu cầu đến đồng thời. Bản sao khác nội dung được coi là lần nhập khác. Xóa toàn bộ thư viện cũng xóa dấu nhập của tài khoản. Gateway nhận tối đa 32 MiB mỗi yêu cầu.

Có thể dùng [file mẫu giả lập](examples/legacy-demo.json) để thử. Trang chủ và thư viện mới bắt đầu rỗng.

## Vận hành bằng PowerShell

```powershell
docker compose logs --tail 100 -f gateway identity studio db
docker compose stop
docker compose up -d --wait
docker compose exec identity alembic current
docker compose exec studio alembic current
docker compose run --rm identity alembic upgrade head
docker compose run --rm studio alembic upgrade head
docker compose up -d --build --no-deps studio
docker compose restart identity
docker compose down
```

Chạy migration khi service tương ứng đang dừng hoặc trong thời gian bảo trì. `down` giữ volume PostgreSQL. Tùy chọn `down -v` xóa volume của project. GitHub chứa mã nguồn, migrations và dữ liệu mẫu. Dữ liệu tác phẩm, tài khoản và phiên thật nằm trong volume `pgdata` của project trên máy chủ. Bản sao lưu nằm ở nơi chủ máy lưu trữ.

### Sao lưu và diễn tập phục hồi

Trong cửa sổ bảo trì, dừng gateway để ngăn yêu cầu mới, chờ các thao tác đang lưu hoàn tất rồi chạy script. Hai file định dạng custom của PostgreSQL được sao chép bằng `docker compose cp` để giữ nguyên byte trên Windows PowerShell. Manifest SHA-256 được ghi sau khi có đủ hai dump.

```powershell
docker compose stop gateway
try {
    powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\ops\Backup.ps1
    if ($LASTEXITCODE) { throw "Backup failed" }
} finally {
    docker compose start gateway
}
```

Mỗi lần sao lưu tạo một thư mục riêng ở `ops/backups/`. Giữ thêm bản sao ở thiết bị riêng. Nếu đã chạy với project name tùy chọn, truyền `-Project ten-project` cho Backup.ps1. Dump identity chứa hash mật khẩu và thông tin phiên, còn dump studio chứa toàn bộ bản thảo.

Thử phục hồi từ một cặp dump vào project mới với volume riêng. Thay đường dẫn dưới đây bằng thư mục vừa sao lưu.

```powershell
powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\ops\Restore-Test.ps1 -Backup .\ops\backups\THU-MUC-VUA-TAO -Port 18080
```

Script kiểm tra cả hai checksum, tạo project tên ngẫu nhiên, khởi động riêng DB, restore bằng role sở hữu từng database rồi chạy migrations và gateway localhost. Các phiên được sao chép sẽ hết hiệu lực trong bản thử. Dùng cửa sổ riêng tư để đăng nhập lại, đối chiếu số liệu và mở một phiên bản cũ. Script in tên project và lệnh dừng để có thể kiểm tra lại sau này.

### Ba mức truy cập

| Phạm vi | Khi chủ máy muốn sử dụng |
|---|---|
| Máy chủ | Mặc định gateway bind `127.0.0.1:8080`. Mở `http://127.0.0.1:8080`. |
| LAN riêng | Đặt `GATEWAY_BIND` thành IPv4 LAN của máy chủ trong `.env`. Chạy `docker compose up -d gateway`. Chỉ khi cần, cho phép TCP cổng gateway trên firewall profile Private từ LocalSubnet. Thiết bị cùng mạng mở `http://IP-LAN:8080`. HTTP truyền thông tin đăng nhập không mã hóa, chỉ sử dụng mạng tin cậy. |
| Liên kết HTTPS tạm | Giữ `GATEWAY_BIND=127.0.0.1`, đặt `COOKIE_SECURE=true` rồi chạy `docker compose up -d identity gateway`. Khi muốn chia sẻ, chạy `cloudflared tunnel --url http://127.0.0.1:8080` trên máy chủ. Dùng URL HTTPS ngẫu nhiên do cloudflared in ra, kể cả khi chưa mua tên miền. |

Máy cá nhân cần bật, có kết nối tới người dùng và các container đang chạy. Tunnel cần Internet và tiến trình cloudflared hoạt động. Quick Tunnel phù hợp với demo, địa chỉ thay đổi khi mở phiên tunnel mới. Dừng bằng Ctrl+C. Khi trở lại localhost HTTP, đưa `COOKIE_SECURE` về `false` rồi tạo lại identity. Nếu đã bật LAN, đưa bind về localhost và tạo lại gateway để thu hẹp truy cập. PostgreSQL và hai API luôn ở mạng riêng Compose. [Hướng dẫn Quick Tunnels của Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

## Kiểm chứng và tài liệu

Để chạy lại kiểm thử trên một project thử với volume mới, dùng cổng localhost riêng. Các bài thử tạo tài khoản giả.

```powershell
$env:GATEWAY_PORT = '18081'
$env:GATEWAY_BIND = '127.0.0.1'
$env:COOKIE_SECURE = 'false'
docker compose -p novelstudio-qa up -d --build --wait
$env:TEST_URL = 'http://127.0.0.1:18081'
py tests/api_smoke.py
# Bài thử UI dùng Chrome đã cài trên Windows và Python Playwright
py -m venv .venv
.\.venv\Scripts\python -m pip install playwright
.\.venv\Scripts\python tests/browser_smoke.py
docker compose -p novelstudio-qa restart
docker compose -p novelstudio-qa up -d --wait
# Mở lại phiên tác giả trong trình duyệt để đối chiếu nội dung sau restart
docker compose -p novelstudio-qa down
Remove-Item Env:GATEWAY_PORT, Env:GATEWAY_BIND, Env:COOKIE_SECURE, Env:TEST_URL
```

[Kiến trúc, use case, ERD và danh sách API](docs/full-stack.md) · [Kết quả kiểm thử, ảnh chạy thật và đối chiếu rubric](docs/verification.md). Các báo cáo frontend ban đầu trong `docs/` được giữ lại làm tài liệu lịch sử.
