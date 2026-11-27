"""Run against a disposable localhost stack. Requires Python Playwright and Chrome."""
import json
import os
import re
import secrets
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from mailbox_helpers import read_code
from playwright.sync_api import expect, sync_playwright

base = os.environ.get("TEST_URL", "http://127.0.0.1:8080")
assert urlparse(base).hostname in ("127.0.0.1", "localhost")
name = "ui-" + secrets.token_hex(4)
novel_title = name + " — Hành trình dài trên dòng sông ký ức"
password = secrets.token_urlsafe(18)

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome")
    page = browser.new_page(viewport={"width": 1366, "height": 800})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Auth modal contract across all 5 pages
    for path in ("/index.html", "/dashboard.html", "/statistics.html", "/reader.html", "/editor.html"):
        page.goto(base + path)
        page.locator("#user-status-badge").click()
        page.locator(".dropdown-menu [data-bs-target='#login-modal']").click()
        expect(page.get_by_label("Email hoặc tên đăng nhập", exact=True)).to_be_visible()
        expect(page.locator("#login-form input")).to_have_count(2)
        page.locator("#open-register").click()
        expect(page.locator("#register-form input")).to_have_count(3)
        expect(page.get_by_label("Tạo mật khẩu", exact=True)).to_be_visible()

    # 2. Pending /auth/me hides private dashboard until session resolves
    pending_session = []
    page.route("**/auth/me", lambda route: pending_session.append(route))
    page.goto(base + "/dashboard.html")
    expect(page.locator("#open-add-modal-btn")).to_be_hidden()
    expect(page.locator("main")).to_be_hidden()
    page.wait_for_function("document.readyState === 'complete'")
    pending_session.pop().continue_()
    page.unroute("**/auth/me")

    # 3. Register, verify via Mailpit, login, create novel
    page.locator("#access-message button").click()
    page.locator("#open-register").click()
    page.locator("#register-name").fill(name)
    email = name + "@example.com"
    page.locator("#register-email").fill(email)
    page.locator("#register-password").fill(password)
    page.get_by_role("button", name="Gửi mã xác nhận").click()
    expect(page.locator("#verify-form")).to_be_visible()
    code = read_code(email)
    page.locator("#resend-code").click()
    expect(page.locator("#auth-message")).to_contain_text("60 giây")
    page.locator("#verify-code").fill(f"{(int(code) + 1) % 10000:04d}")
    page.get_by_role("button", name="Xác nhận", exact=True).click()
    expect(page.locator("#auth-message")).to_contain_text("không đúng")
    page.locator("#verify-code").fill(code)
    page.get_by_role("button", name="Xác nhận", exact=True).click()
    expect(page.locator("#auth-message")).to_contain_text("Đã đăng ký")
    expect(page.locator("#login-username")).to_have_value(name)
    page.locator("#login-password").fill(password)
    page.locator("button[value=login]").click()
    page.locator("#open-add-modal-btn").click()
    expect(page.locator("#novel-visibility")).to_have_value("Private")
    page.locator("#novel-title").fill(novel_title)
    page.locator("#novel-description").fill("Tác phẩm giả lập để kiểm thử giao diện đọc và soạn thảo riêng.")
    page.locator("#novel-deadline").fill(str(date.today() + timedelta(days=3)))
    page.locator("#novel-visibility").select_option("Public")
    page.locator("#save-novel-btn").click()

    # 4. Open dedicated editor page from Dashboard "Soạn thảo" link
    write_link = page.locator("a.btn-open-workspace:visible").first
    expect(write_link).to_contain_text("Soạn thảo")
    write_link.click()
    expect(page).to_have_url(re.compile(r"/editor\.html\?novel="))

    # 5. Empty chapters state -> immediate "Thêm chương" button
    expect(page.locator("#editor-empty-chapters")).to_be_visible()
    page.locator("#empty-new-chapter-btn").click()
    page.locator(".swal2-input").fill("Chương thử nghiệm một")
    page.locator(".swal2-confirm").click()
    editor = page.locator("#draft-editor-textarea")
    published_text = "Bản đã công khai dòng một\n\nBản đã công khai dòng hai"
    editor.fill(published_text)
    page.locator("#commit-message-input").fill("Bản xuất bản đầu tiên")
    page.locator("#save-version-btn").click()
    expect(page.locator("#save-status")).to_contain_text("Đã lưu phiên bản.")
    expect(page).to_have_url(re.compile(r"chapter="))

    # Direct reload on editor URL keeps chapter & content
    editor_ch1_url = page.url
    page.reload()
    expect(page).to_have_url(editor_ch1_url)
    expect(editor).to_have_value(published_text)
    print("PASS UI register, login, create novel/chapter, dedicated editor save and reload", flush=True)

    # 6. Publish via History offcanvas, then test failed save & idempotent retry
    page.locator("#toggle-history-btn").click()
    expect(page.locator("#history-offcanvas")).to_be_visible()
    page.locator('[data-action=publish]').click()
    page.locator(".swal2-confirm").click()
    expect(page.locator('[data-action=publish]')).to_be_disabled()
    page.locator("#history-offcanvas .btn-close").click()
    expect(page.locator("#history-offcanvas")).to_be_hidden()

    editor.fill("Bản riêng tư mới hơn")
    page.route("**/versions", lambda route: route.abort())
    page.locator("#save-version-btn").click()
    expect(page.locator("#save-status")).to_contain_text("Chưa xác nhận")
    expect(editor).to_have_value("Bản riêng tư mới hơn")
    page.unroute("**/versions")

    # A second failure after the server has committed exercises the retry key.
    def lose_response(route):
        assert route.fetch().ok
        route.abort()

    page.route("**/versions", lose_response)
    page.locator("#save-version-btn").click()
    expect(page.locator("#save-status")).to_contain_text("Chưa xác nhận")
    page.unroute("**/versions")
    page.locator("#save-version-btn").click()
    expect(page.locator("#version-count-badge")).to_have_text("2 bản")

    # 7. Create Chapter 2, publish it, and verify unsaved-leave cancel & back-to-studio
    page.locator("#new-chapter-btn").click()
    page.locator(".swal2-input").fill("Chương thứ hai")
    page.locator(".swal2-confirm").click()
    expect(page.locator("#active-chapter-heading")).to_have_text("Chương thứ hai")
    editor.fill("Nội dung chương hai")
    page.locator("#save-version-btn").click()
    expect(page.locator("#save-status")).to_contain_text("Đã lưu phiên bản.")
    page.locator("#toggle-history-btn").click()
    page.locator('[data-action=publish]').click()
    page.locator(".swal2-confirm").click()
    expect(page.locator('[data-action=publish]')).to_be_disabled()
    page.locator("#history-offcanvas .btn-close").click()

    editor_ch2_url = page.url
    editor.fill("Bản chưa lưu cần giữ nguyên khi hủy")
    page.locator("#chapter-list .btn-select-chapter").first.click()
    page.locator(".swal2-cancel").click()
    expect(page).to_have_url(editor_ch2_url)
    expect(page.locator("#active-chapter-heading")).to_have_text("Chương thứ hai")
    expect(editor).to_have_value("Bản chưa lưu cần giữ nguyên khi hủy")

    page.locator("#back-to-studio-btn").click()
    page.locator(".swal2-cancel").click()
    expect(page).to_have_url(editor_ch2_url)
    expect(editor).to_have_value("Bản chưa lưu cần giữ nguyên khi hủy")

    # Revert edit and test Back to Studio navigation
    page.locator("#back-to-studio-btn").click()
    page.locator(".swal2-confirm").click()
    expect(page).to_have_url(base + "/dashboard.html")

    # Unauthorized / nonexistent novel on editor.html
    page.goto(base + "/editor.html?novel=00000000-0000-0000-0000-000000000000")
    expect(page.locator("#editor-error-state")).to_be_visible()

    evidence = os.getenv("TEST_SCREENSHOTS")
    if evidence:
        Path(evidence).mkdir(parents=True, exist_ok=True)
        page.goto(editor_ch1_url)
        page.locator(".swal2-toast").wait_for(state="hidden")
        page.locator("#editor-shell").screenshot(path=str(Path(evidence) / "workspace.png"))

    # 8. Statistics & theme toggle
    page.goto(base + "/statistics.html")
    expect(page.locator("#stat-versions")).to_have_text("3")
    expect(page.locator("#stat-chapters")).to_have_text("2")
    page.locator("#theme-toggle-btn").click()
    if evidence:
        page.locator("main").screenshot(path=str(Path(evidence) / "statistics.png"), animations="disabled")

    # 9. Guest Public Reader on mobile viewport (390x844) + direct links + Back/Forward
    guest = browser.new_page(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
    guest.on("pageerror", lambda e: errors.append(str(e)))
    guest.add_init_script("""window.createFormShows = 0;
        document.addEventListener('show.bs.modal', event => {
            if (event.target.id === 'novel-modal') window.createFormShows++;
        });""")
    creates = []
    guest.on("request", lambda req: creates.append(req) if req.method == "POST"
             and req.url.endswith("/studio/novels") else None)
    guest.route("**/auth/me", lambda route: pending_session.append(route))
    guest.goto(base + "/index.html")
    guest.locator("#home-search-input").fill(name)
    expect(guest.locator("#discover-heading")).to_have_text("Kết quả tìm kiếm")
    read_link = guest.locator("a.btn-read-novel").first
    expect(read_link).to_contain_text("Đọc truyện")
    href = read_link.get_attribute("href")
    assert href and href.startswith("reader.html?novel="), href
    read_link.click()

    expect(guest).to_have_url(re.compile(r"/reader\.html\?novel=.*chapter="))
    expect(guest.locator("#reader-content-body")).to_have_text(published_text)
    assert "Bản riêng tư mới hơn" not in guest.locator("#reader-content-body").inner_text()
    assert guest.locator("#reader-content-body").evaluate("el => getComputedStyle(el).whiteSpace") == "pre-wrap"
    reader_ch1_url = guest.url
    novel_id = parse_qs(urlparse(reader_ch1_url).query)["novel"][0]

    # Switch to Chapter 2 via Next button, reload, and test Back/Forward
    guest.locator("#reader-next-btn").click()
    expect(guest.locator("#reader-content-body")).to_have_text("Nội dung chương hai")
    reader_ch2_url = guest.url
    assert reader_ch2_url != reader_ch1_url
    guest.reload()
    expect(guest).to_have_url(reader_ch2_url)
    expect(guest.locator("#reader-content-body")).to_have_text("Nội dung chương hai")
    guest.go_back()
    expect(guest).to_have_url(reader_ch1_url)
    expect(guest.locator("#reader-content-body")).to_have_text(published_text)
    guest.go_forward()
    expect(guest).to_have_url(reader_ch2_url)
    expect(guest.locator("#reader-content-body")).to_have_text("Nội dung chương hai")

    # Mobile bottom-sheet TOC & ⋯ detail modal & zero horizontal overflow
    guest.locator("#reader-toc-toggle").click()
    expect(guest.locator("#reader-toc-panel")).to_be_visible()
    guest.locator(".btn-toc-more").first.click()
    expect(guest.locator("#chapter-detail-modal")).to_be_visible()
    guest.locator("#chapter-detail-modal .btn-close").click()
    assert guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

    # Nonexistent / unpublished chapter URL shows clear fallback
    guest.goto(f"{base}/reader.html?novel={novel_id}&chapter=999999")
    expect(guest.locator("#reader-chapter-unavailable")).to_be_visible()
    expect(guest.locator("a[href='index.html']").first).to_be_visible()

    # Finish pending /auth/me & test guest create-novel login flow
    guest.goto(base + "/index.html")
    pending_session.pop().continue_()
    guest.unroute("**/auth/me")
    create = guest.get_by_role("button", name="Tạo tác phẩm", exact=True)
    guest.locator("#home-search-input").fill(name + "-missing")
    expect(guest.locator(".btn-read-novel")).to_have_count(0)
    create.click()
    guest.locator("#login-username").fill(name)
    guest.locator("#login-password").fill(password + "-wrong")
    guest.locator("button[value=login]").click()
    expect(guest.locator("#auth-message")).not_to_be_empty()
    guest.locator("#login-modal .btn-close").click()
    expect(guest).to_have_url(base + "/index.html")
    create.click()
    guest.locator("#login-password").fill(password)
    guest.locator("button[value=login]").click()
    for attempt in range(2):
        if attempt:
            guest.goto(base + "/index.html")
            create.click()
        expect(guest.locator("#novel-form")).to_be_visible()
        expect(guest).to_have_url(base + "/dashboard.html")
        assert guest.evaluate("window.createFormShows") == 1
        guest.reload()
        expect(guest.locator("#open-add-modal-btn")).to_be_visible()
        expect(guest.locator("#novel-form")).to_be_hidden()
    assert not creates

    # Mobile Dashboard compact list check on 390px and 320px (zero horizontal overflow)
    for w in (390, 320):
        guest.set_viewport_size({"width": w, "height": 700})
        expect(guest.locator("#novel-mobile-list")).to_be_visible()
        expect(guest.locator("table.novel-table")).to_be_hidden()
        assert guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"overflow at {w}px"
    guest.locator(".btn-novel-more").first.click()
    expect(guest.locator("#novel-detail-modal")).to_be_visible()
    expect(guest.locator("#novelDetailTitle")).to_contain_text(name)
    guest.locator("#novel-detail-modal .btn-close").click()

    guest.goto(base + "/index.html")
    expect(guest.locator("#user-status-badge")).to_contain_text("Author")
    assert guest.request.post(base + "/api/v1/auth/logout", headers={"X-NovelStudio": "1"}).ok
    create.click()
    expect(guest.locator("#login-form")).to_be_visible()
    print("PASS public reader, direct link, reload, Back/Forward, mobile lists, create form and expired session", flush=True)

    # 10. Expired session re-authentication without reload on editor.html & JSON round trip on dashboard.html
    page.goto(editor_ch1_url)
    expect(page.locator("#version-count-badge")).to_have_text("2 bản")
    editor.fill("Chưa lưu khi hết phiên")
    page.request.post(base + "/api/v1/auth/logout", headers={"X-NovelStudio": "1"})
    page.locator("#save-version-btn").click()
    expect(page.locator("#save-status")).to_contain_text("Chưa xác nhận")
    page.locator("#user-status-badge").click()
    page.locator(".dropdown-menu [data-bs-target='#login-modal']").click()
    page.locator("#login-username").fill(name)
    page.locator("#login-password").fill(password)
    page.locator("button[value=login]").click()
    expect(page.locator("#login-modal")).to_be_hidden()
    expect(editor).to_have_value("Chưa lưu khi hết phiên")
    page.locator("#save-version-btn").click()
    expect(page.locator("#version-count-badge")).to_have_text("3 bản")

    page.goto(base + "/dashboard.html")
    sample = Path(__file__).resolve().parents[1] / "examples/legacy-demo.json"
    for _ in range(2):
        with page.expect_response("**/studio/import") as imported:
            page.locator("#import-json-input").set_input_files(sample)
        assert imported.value.ok
    expect(page.locator("#novel-count-badge")).to_have_text("2")
    with page.expect_download() as exported:
        page.locator("#export-json-btn").click()
    books = json.loads(exported.value.path().read_text(encoding="utf8"))
    assert len(books) == 2
    print("PASS lost acknowledgement, reauthentication without reload, JSON UI round trip", flush=True)
    assert not errors, errors
    print("PASS failed save, retry, statistics, theme, responsive reader & editor", flush=True)
    browser.close()
