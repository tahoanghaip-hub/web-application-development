"""Run against a disposable localhost stack. Requires Python Playwright and Chrome."""
import os
import secrets
from pathlib import Path
from datetime import date, timedelta
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

base = os.environ.get("TEST_URL", "http://127.0.0.1:8080")
assert urlparse(base).hostname in ("127.0.0.1", "localhost")
name = "ui-" + secrets.token_hex(4)
password = secrets.token_urlsafe(18)
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome")
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(base + "/dashboard.html")
    page.locator("#access-message button").click()
    page.locator("#login-username").fill(name)
    page.locator("#login-password").fill(password)
    page.locator("button[value=register]").click()
    expect(page.locator("#auth-message")).to_contain_text("Đã tạo")
    page.locator("button[value=login]").click()
    page.locator("#open-add-modal-btn").click()
    page.locator("#novel-title").fill(name)
    page.locator("#novel-description").fill("Tác phẩm giả lập để kiểm thử.")
    page.locator("#novel-deadline").fill(str(date.today() + timedelta(days=3)))
    page.locator("#save-novel-btn").click()
    page.locator(".btn-open-workspace").click()
    page.locator("#new-chapter-btn").click()
    page.locator(".swal2-input").fill("Chương thử nghiệm")
    page.locator(".swal2-confirm").click()
    editor = page.locator("#draft-editor-textarea")
    editor.fill("Bản đã công khai")
    page.locator("#save-version-btn").click()
    expect(page.locator("#save-status")).to_have_text("Đã lưu phiên bản.")
    page.reload()
    page.locator(".btn-open-workspace").click()
    expect(editor).to_have_value("Bản đã công khai")
    print("PASS UI register, login, create novel/chapter, save and reload", flush=True)
    page.locator('[data-action=publish]').click()
    page.locator(".swal2-confirm").click()
    expect(page.locator('[data-action=publish]')).to_be_disabled()
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
    evidence = os.getenv("TEST_SCREENSHOTS")
    if evidence:
        Path(evidence).mkdir(parents=True, exist_ok=True)
        page.locator(".swal2-toast").wait_for(state="hidden")
        page.locator("#workspace-section").screenshot(path=str(Path(evidence)/"workspace.png"))
    page.goto(base + "/statistics.html")
    expect(page.locator("#stat-versions")).to_have_text("2")
    expect(page.locator("#stat-chapters")).to_have_text("1")
    page.locator("#theme-toggle-btn").click()
    if evidence:
        page.locator("main").screenshot(path=str(Path(evidence)/"statistics.png"), animations="disabled")
    guest = browser.new_page(viewport={"width": 390,"height": 844})
    guest.goto(base + "/index.html")
    guest.locator("#home-search-input").fill(name)
    guest.locator(".btn-read-novel").click()
    expect(guest.locator("#reader-content-body")).to_have_text("Bản đã công khai")
    page.goto(base + "/dashboard.html")
    page.locator(".btn-open-workspace").click()
    expect(page.locator("#version-count-badge")).to_have_text("2 bản")
    editor.fill("Chưa lưu khi hết phiên")
    page.request.post(base + "/api/v1/auth/logout", headers={"X-NovelStudio":"1"})
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
    sample = Path(__file__).resolve().parents[1]/"examples/legacy-demo.json"
    for _ in range(2):
        with page.expect_response("**/studio/import") as imported:
            page.locator("#import-json-input").set_input_files(sample)
        assert imported.value.ok
    expect(page.locator("#novel-count-badge")).to_have_text("2")
    with page.expect_download() as exported:
        page.locator("#export-json-btn").click()
    import json
    books = json.loads(exported.value.path().read_text(encoding="utf8"))
    assert len(books) == 2
    print("PASS lost acknowledgement, reauthentication without reload, JSON UI round trip")
    assert not errors, errors
    print("PASS failed save, retry, statistics, theme, mobile guest reader")
    browser.close()
