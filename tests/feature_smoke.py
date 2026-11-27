"""End-to-end API and Playwright tests for NovelStudio privacy, discover/search, and chapter comments."""
import os
import re
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from api_smoke import BASE, Client, signup
from playwright.sync_api import expect, sync_playwright

assert urlparse(BASE).hostname in ("127.0.0.1", "localhost")


def create_user_credentials():
    username = "feat-" + secrets.token_hex(5)
    password = secrets.token_urlsafe(18)
    client = Client()
    user = signup(client)
    return client, user


def run_api_tests():
    a, alice = create_user_credentials()
    b, bob = create_user_credentials()
    guest = Client()

    # 1. Privacy matrix (guest, owner, other) + 0-chapter public novel + JSON import always private
    n_priv = a.studio("/novels", "POST", {
        "title": "Priv Matrix " + secrets.token_hex(3),
        "description": "Private novel for API matrix testing.",
        "deadline": str(date.today() + timedelta(days=7)),
        "priority": "High",
        "status": "Pending",
    }, 201)
    assert n_priv["visibility"] == "Private"
    nid = n_priv["id"]
    cid_pub = a.studio(f"/novels/{nid}/chapters", "POST", {"chapterTitle": "Pub Chap"}, 201)["chapterId"]
    cid_priv = a.studio(f"/novels/{nid}/chapters", "POST", {"chapterTitle": "Priv Chap"}, 201)["chapterId"]
    v1 = a.studio(f"/novels/{nid}/chapters/{cid_pub}/versions", "POST", {"content": "V1 body", "commitMessage": "v1"}, 201)["versionId"]
    v2 = a.studio(f"/novels/{nid}/chapters/{cid_pub}/versions", "POST", {"content": "V2 body", "commitMessage": "v2"}, 201)["versionId"]
    a.studio(f"/novels/{nid}/chapters/{cid_priv}/versions", "POST", {"content": "Secret chap", "commitMessage": "s1"}, 201)
    a.studio(f"/novels/{nid}/chapters/{cid_pub}/versions/{v1}/publish", "PUT")

    # Novel is Private -> hidden for guest, owner on public routes, and other user
    for viewer in (guest, a, b):
        assert all(x["id"] != nid for x in viewer.studio("/public"))
        assert all(x["id"] != nid for x in viewer.studio("/public/novels"))
        viewer.studio(f"/public/novels/{nid}", expect=404)
        viewer.studio(f"/public/novels/{nid}/chapters/{cid_pub}", expect=404)
        viewer.studio(f"/public/novels/{nid}/chapters/{cid_pub}/comments", expect=404)
    assert guest.studio(f"/public/search?keyword={n_priv['title'].replace(' ', '%20')}")["total"] == 0
    b.studio(f"/novels/{nid}", expect=404)

    # Set Public -> cid_pub appears, cid_priv stays hidden, no private fields leaked
    a.studio(f"/novels/{nid}", "PUT", {
        "title": n_priv["title"],
        "description": n_priv["description"],
        "deadline": n_priv["deadline"],
        "priority": "High",
        "status": "Done",
        "visibility": "Public",
    })
    for viewer in (guest, a, b):
        pub = viewer.studio(f"/public/novels/{nid}")
        assert [c["chapterId"] for c in pub["chapters"]] == [cid_pub]
        for secret_field in ("owner_id", "deadline", "priority"):
            assert secret_field not in pub
        ch_res = viewer.studio(f"/public/novels/{nid}/chapters/{cid_pub}")
        assert ch_res["content"] == "V1 body"
        viewer.studio(f"/public/novels/{nid}/chapters/{cid_priv}", expect=404)

    # Import JSON claiming Public & Published -> forced Private & Draft
    exported = a.studio("/export")
    exported[0]["visibility"] = "Public"
    b.studio("/import", "POST", exported)
    b_list = b.studio("/novels?size=10")["items"]
    assert b_list[0]["visibility"] == "Private"
    assert b_list[0]["publishedChapterCount"] == 0

    # Concurrent double publish & publish+unpublish
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda vid: a.studio(f"/novels/{nid}/chapters/{cid_pub}/versions/{vid}/publish", "PUT"), [v1, v2, v1, v2]))
    vers = a.studio(f"/novels/{nid}")["chapters"][0]["versions"]
    assert sum(1 for v in vers if v["published"]) == 1

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(a.studio, f"/novels/{nid}/chapters/{cid_pub}/versions/{v2}/publish", "PUT")
        f2 = pool.submit(a.studio, f"/novels/{nid}/chapters/{cid_pub}/publication", "DELETE")
        assert f1.result()["ok"] and f2.result()["ok"]
    vers = a.studio(f"/novels/{nid}")["chapters"][0]["versions"]
    assert sum(1 for v in vers if v["published"]) <= 1

    # Re-publish v2 for comment tests
    a.studio(f"/novels/{nid}/chapters/{cid_pub}/versions/{v2}/publish", "PUT")

    # 2. Discover & Search across > 12 novels (ensure at least 15 public novels exist)
    d_now = guest.studio("/public/discover")
    created_pub_ids = [nid]
    need = max(0, 15 - d_now["totalPublic"])
    for i in range(need):
        res = a.studio("/novels", "POST", {
            "title": f"ExtraPub {i} " + secrets.token_hex(3),
            "description": f"Public discover sample {i} for full search test.",
            "deadline": str(date.today() + timedelta(days=5)),
            "priority": "Low",
            "status": "Pending",
            "visibility": "Public",
        }, 201)
        created_pub_ids.append(res["id"])
    disc = a.studio("/public/discover")
    assert len(disc["items"]) == 12 and len({x["id"] for x in disc["items"]}) == 12
    disc_ids = {x["id"] for x in disc["items"]}
    outside_id = next((x for x in created_pub_ids if x not in disc_ids), None)
    if outside_id:
        outside_title = a.studio(f"/novels/{outside_id}")["title"]
        sr = guest.studio(f"/public/search?keyword={outside_title.replace(' ', '%20')}")
        assert sr["total"] == 1 and sr["items"][0]["id"] == outside_id

    # 3. Comments API checks
    c_path = f"/public/novels/{nid}/chapters/{cid_pub}/comments"
    rid = str(uuid4())
    c1 = b.studio(c_path, "POST", {"content": "API bình luận đầu", "requestId": rid}, 201)
    assert b.studio(c_path, "POST", {"content": "API bình luận đầu", "requestId": rid}, 201)["id"] == c1["id"]
    b.studio(c_path, "POST", {"content": "Khác nội dung", "requestId": rid}, 409)
    r1 = a.studio(c_path, "POST", {"content": "API trả lời", "parentId": c1["id"]}, 201)
    b.studio(c_path, "POST", {"content": "Cấp 2", "parentId": r1["id"]}, 422)
    a.studio(f"{c_path}/{c1['id']}", "DELETE", expect=403)
    b.studio(f"{c_path}/{c1['id']}", "DELETE")
    after_del = guest.studio(c_path)["items"][0]
    assert after_del["deleted"] is True and len(after_del["replies"]) == 1

    print("PASS feature_smoke API matrix, privacy, discover/search, and comments")


def register_browser_user(page, prefix):
    name = f"{prefix}-{secrets.token_hex(4)}"
    password = secrets.token_urlsafe(18)
    email = f"{name}@example.com"
    client = Client()
    challenge = client.auth("/register", "POST", {"username": name, "email": email, "password": password}, 202)
    from mailbox_helpers import read_code
    code = read_code(email)
    client.auth("/register/verify", "POST", {"requestId": challenge["requestId"], "code": code}, 201)
    client.auth("/login", "POST", {"username": email, "password": password})

    page.goto(BASE + "/index.html")
    page.locator("#user-status-badge").click()
    page.locator(".dropdown-menu [data-bs-target='#login-modal']").click()
    page.locator("#login-username").fill(name)
    page.locator("#login-password").fill(password)
    page.locator("button[value=login]").click()
    expect(page.locator("#login-modal")).to_be_hidden()
    expect(page.locator("#user-status-badge")).to_contain_text(name)
    return name, password, client


def run_browser_tests():
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")

        # Owner context (PC 1366x800) and Guest/Reader context
        owner_ctx = browser.new_context(viewport={"width": 1366, "height": 800})
        owner_page = owner_ctx.new_page()
        owner_page.on("pageerror", lambda e: errors.append("owner: " + str(e)))
        owner_name, owner_pw, owner_client = register_browser_user(owner_page, "own")

        # Seed 15 extra public novels via API for Discover (>12) & Search test
        search_tag = "TimKiemNgoai12_" + secrets.token_hex(4)
        extra_ids = []
        for i in range(14):
            res = owner_client.studio("/novels", "POST", {
                "title": f"{search_tag}_{i:02d}",
                "description": f"Mô tả tác phẩm công khai số {i} cho thử nghiệm Khám phá.",
                "deadline": str(date.today() + timedelta(days=10)),
                "priority": "Medium",
                "status": "Pending",
                "visibility": "Public",
            }, 201)
            extra_ids.append(res["id"])

        # 1. Dashboard Privacy UI: default Private, disclosure, 0-chapter public novel
        owner_page.goto(BASE + "/dashboard.html")
        owner_page.locator("#open-add-modal-btn").click()
        expect(owner_page.locator("#novel-visibility")).to_have_value("Private")
        expect(owner_page.locator("#novel-visibility-disclosure")).to_contain_text("Hạn chót")
        expect(owner_page.locator("#novel-visibility-disclosure")).to_contain_text("Mức ưu tiên")

        main_title = "TruyenChinh_" + secrets.token_hex(4)
        owner_page.locator("#novel-title").fill(main_title)
        owner_page.locator("#novel-description").fill("Cốt truyện thử nghiệm quyền riêng tư và bình luận theo chương.")
        owner_page.locator("#novel-deadline").fill(str(date.today() + timedelta(days=5)))
        owner_page.locator("#novel-visibility").select_option("Public")
        owner_page.locator("#save-novel-btn").click()

        # Verify separate Status & Visibility badges on PC
        owner_page.locator("#search-input").fill(main_title)
        row = owner_page.locator("#novel-table-body tr", has_text=main_title).first
        expect(row.locator(".btn-toggle-status")).to_contain_text("Đang sáng tác")
        expect(row.locator("[data-visibility='Public']")).to_contain_text("Công khai")

        # 2. 0-chapter public novel on Khám phá -> "Xem tác phẩm" & "Chưa có chương công khai"
        guest_ctx = browser.new_context(viewport={"width": 1366, "height": 800})
        guest_page = guest_ctx.new_page()
        guest_page.on("pageerror", lambda e: errors.append("guest: " + str(e)))
        guest_page.goto(BASE + "/index.html")
        guest_page.locator("#home-search-input").fill(main_title)
        expect(guest_page.locator("#discover-heading")).to_have_text("Kết quả tìm kiếm")
        zero_card = guest_page.locator(".novel-card", has_text=main_title).first
        expect(zero_card).to_contain_text("Chưa có chương công khai")
        expect(zero_card.locator("a.btn-read-novel")).to_contain_text("Xem tác phẩm")
        zero_card.locator("a.btn-read-novel").click()
        expect(guest_page.locator("#reader-empty-chapters")).to_be_visible()
        expect(guest_page.locator("#reader-empty-chapters")).to_contain_text("Chưa có chương công khai")

        # 3. Editor Chapter Privacy (`⋯` menu -> "Quyền riêng tư")
        row.locator("a.btn-open-workspace").click()
        expect(owner_page).to_have_url(re.compile(r"/editor\.html\?novel="))
        novel_id = parse_qs(urlparse(owner_page.url).query)["novel"][0]
        expect(owner_page.locator("#editor-novel-visibility-badge")).to_contain_text("Tác phẩm Công khai")

        # Empty chapter -> open ⋯ -> Quyền riêng tư -> Công khai shows save guidance & disabled button
        owner_page.locator("#empty-new-chapter-btn").click()
        owner_page.locator(".swal2-input").fill("Chương 1: Khởi hành")
        owner_page.locator(".swal2-confirm").click()
        expect(owner_page.locator("#active-chapter-heading")).to_have_text("Chương 1: Khởi hành")
        owner_page.locator("#chapter-list .btn-chapter-more").first.click()
        owner_page.locator("#editor-detail-privacy").click()
        owner_page.locator("#chap-vis-public").check()
        expect(owner_page.locator("#chapter-privacy-no-versions")).to_be_visible()
        expect(owner_page.locator("#chapter-privacy-save-btn")).to_be_disabled()
        owner_page.locator("#chapter-privacy-modal .btn-close").click()

        # Save v1 & v2, publish v1 via Quyền riêng tư modal
        editor = owner_page.locator("#draft-editor-textarea")
        editor.fill("Nội dung chương 1 bản V1")
        owner_page.locator("#commit-message-input").fill("Bản V1")
        owner_page.locator("#save-version-btn").click()
        expect(owner_page.locator("#save-status")).to_contain_text("Đã lưu phiên bản.")

        editor.fill("Nội dung chương 1 bản V2 nháp")
        owner_page.locator("#commit-message-input").fill("Bản V2")
        owner_page.locator("#save-version-btn").click()
        expect(owner_page.locator("#version-count-badge")).to_have_text("2 bản")

        owner_page.locator("#chapter-list .btn-chapter-more").first.click()
        owner_page.locator("#editor-detail-privacy").click()
        owner_page.locator("#chap-vis-public").check()
        # Select V1 radio (2nd radio since versions are newest-first)
        owner_page.locator("input[name='chapter-privacy-version']").nth(1).check()
        owner_page.locator("#chapter-privacy-save-btn").click()
        expect(owner_page.locator("#active-chapter-status-badge")).to_contain_text("Công khai")

        # Save v3 and restore v1 -> published version remains V1 (not auto-published)
        editor.fill("Nội dung bản V3 nháp")
        owner_page.locator("#save-version-btn").click()
        expect(owner_page.locator("#version-count-badge")).to_have_text("3 bản")
        ch1_id = owner_client.studio(f"/novels/{novel_id}")["chapters"][0]["chapterId"]
        assert Client().studio(f"/public/novels/{novel_id}/chapters/{ch1_id}")["content"] == "Nội dung chương 1 bản V1"
        owner_page.locator("#toggle-history-btn").click()
        owner_page.locator("[data-action='restore']").last.click()
        owner_page.locator(".swal2-confirm").click()
        expect(owner_page.locator("#version-count-badge")).to_have_text("4 bản")
        assert Client().studio(f"/public/novels/{novel_id}/chapters/{ch1_id}")["content"] == "Nội dung chương 1 bản V1"

        # Add Chapter 2 and publish it
        owner_page.locator("#new-chapter-btn").click()
        owner_page.locator(".swal2-input").fill("Chương 2: Đường xa")
        owner_page.locator(".swal2-confirm").click()
        expect(owner_page.locator("#active-chapter-heading")).to_have_text("Chương 2: Đường xa")
        editor.fill("Nội dung chương 2 công khai")
        owner_page.locator("#save-version-btn").click()
        expect(owner_page.locator("#save-status")).to_contain_text("Đã lưu phiên bản.")
        owner_page.locator("#chapter-list .btn-chapter-more").nth(1).click()
        owner_page.locator("#editor-detail-privacy").click()
        owner_page.locator("#chap-vis-public").check()
        owner_page.locator("#chapter-privacy-save-btn").click()
        expect(owner_page.locator("#active-chapter-status-badge")).to_contain_text("Công khai")

        # Add Chapter 3 (Private only)
        owner_page.locator("#new-chapter-btn").click()
        owner_page.locator(".swal2-input").fill("Chương 3: Bản nháp bí mật")
        owner_page.locator(".swal2-confirm").click()
        expect(owner_page.locator("#active-chapter-heading")).to_have_text("Chương 3: Bản nháp bí mật")
        editor.fill("Bí mật riêng tư")
        owner_page.locator("#save-version-btn").click()
        expect(owner_page.locator("#save-status")).to_contain_text("Đã lưu phiên bản.")

        # Two-tab concurrent publish on editor
        owner_tab2 = owner_ctx.new_page()
        owner_tab2.on("pageerror", lambda e: errors.append("owner_tab2: " + str(e)))
        owner_tab2.goto(f"{BASE}/editor.html?novel={novel_id}&chapter={ch1_id}")
        expect(owner_tab2.locator("#active-chapter-heading")).to_have_text("Chương 1: Khởi hành")
        owner_tab2.locator("#toggle-history-btn").click()
        # Publish V3 (2nd newest, index 1 because restore added V4 at index 0) in tab2
        owner_tab2.locator("[data-action='publish']").nth(1).click()
        owner_tab2.locator(".swal2-confirm").click()
        expect(owner_tab2.locator("[data-action='publish']").nth(1)).to_be_disabled()
        owner_tab2.close()

        # 4. Guest reads Chapter 1, then Owner sets novel Private -> Guest reload/switch/Back clears content!
        guest_page.goto(f"{BASE}/reader.html?novel={novel_id}&chapter={ch1_id}")
        expect(guest_page.locator("#reader-content-body")).to_contain_text("Nội dung bản V3 nháp")

        # Set novel Private in Dashboard
        owner_page.goto(BASE + "/dashboard.html")
        owner_page.locator("#search-input").fill(main_title)
        expect(owner_page.locator("#novel-table-body tr", has_text=main_title)).to_have_count(1)
        owner_page.locator("#novel-table-body .btn-edit-novel").first.click()
        owner_page.locator("#novel-visibility").select_option("Private")
        expect(owner_page.locator("#novel-visibility-impact")).to_contain_text("bị ẩn")
        owner_page.locator("#save-novel-btn").click()
        expect(owner_page.locator("#novel-table-body [data-visibility='Private']").first).to_be_visible()

        # Editor shows hidden-by-novel reason for Chapter 1
        owner_page.goto(f"{BASE}/editor.html?novel={novel_id}&chapter={ch1_id}")
        expect(owner_page.locator("#editor-novel-visibility-badge")).to_contain_text("Tác phẩm Riêng tư")
        expect(owner_page.locator("#editor-chapter-hidden-banner")).to_be_visible()
        expect(owner_page.locator("#chapter-list .compact-status-pill").first).to_contain_text("Ẩn theo truyện")

        # Guest switches to Chapter 2 -> 404 clears rendered content and shows unavailable state!
        guest_page.locator("#reader-next-btn").click()
        expect(guest_page.locator("#reader-error")).to_be_visible()
        expect(guest_page.locator("#reader-content-body")).to_be_empty()
        guest_page.reload()
        expect(guest_page.locator("#reader-error")).to_be_visible()
        expect(guest_page.locator("#reader-content-body")).to_be_empty()

        # Owner switches novel back to Public -> Dashboard warns exact count (2 chapters)
        owner_page.goto(BASE + "/dashboard.html")
        owner_page.locator("#search-input").fill(main_title)
        expect(owner_page.locator("#novel-table-body tr", has_text=main_title)).to_have_count(1)
        owner_page.locator("#novel-table-body .btn-edit-novel").first.click()
        owner_page.locator("#novel-visibility").select_option("Public")
        expect(owner_page.locator("#novel-visibility-impact")).to_contain_text("2 chương")
        owner_page.locator("#save-novel-btn").click()
        expect(owner_page.locator(".swal2-html-container")).to_contain_text("2 chương")
        owner_page.locator(".swal2-confirm").click()
        expect(owner_page.locator("#novel-table-body [data-visibility='Public']").first).to_be_visible()

        # 5. Discover (12 max) & Debounced Search + Stale Response Ignore + Load More + Clear restores sample
        guest_page.goto(BASE + "/index.html")
        expect(guest_page.locator(".novel-card")).to_have_count(12)
        initial_ids = guest_page.locator("a.btn-read-novel").evaluate_all("els => els.map(e => e.dataset.novelId)")
        assert len(initial_ids) == 12 and len(set(initial_ids)) == 12

        # Find an extra_id NOT in initial_ids (or pick first extra_id if needed)
        outside_idx = next((i for i, eid in enumerate(extra_ids) if eid not in initial_ids), 0)
        outside_kw = f"{search_tag}_{outside_idx:02d}"

        # Delay first search response so a second search supersedes it (stale response test)
        stale_routes = []
        def delay_search(route):
            if "NonExistentFirstQuery" in route.request.url:
                stale_routes.append(route)
            else:
                route.continue_()

        guest_page.route("**/public/search*", delay_search)
        guest_page.locator("#home-search-input").fill("NonExistentFirstQuery")
        time.sleep(0.35)
        guest_page.locator("#home-search-input").fill(outside_kw)
        expect(guest_page.locator(".novel-card")).to_have_count(1)
        expect(guest_page.locator(".novel-card").first).to_contain_text(outside_kw)
        # Fulfill stale route after new results arrived -> UI must NOT revert to stale empty results!
        for r in stale_routes:
            r.continue_()
        guest_page.unroute("**/public/search*")
        time.sleep(0.15)
        expect(guest_page.locator(".novel-card").first).to_contain_text(outside_kw)

        # Search prefix matching > 12 items -> "Xem thêm" pagination
        guest_page.locator("#home-search-input").fill(search_tag)
        expect(guest_page.locator(".novel-card")).to_have_count(12)
        expect(guest_page.locator("#home-load-more-btn")).to_be_visible()
        guest_page.locator("#home-load-more-btn").click()
        expect(guest_page.locator(".novel-card")).to_have_count(14)

        # Clear search -> returns exact same 12 discover items of this view
        guest_page.locator("#home-search-input").fill("")
        expect(guest_page.locator("#discover-heading")).to_have_text("Gợi ý khám phá")
        restored_ids = guest_page.locator("a.btn-read-novel").evaluate_all("els => els.map(e => e.dataset.novelId)")
        assert restored_ids == initial_ids, (restored_ids, initial_ids)

        # 6. Comments UI: guest views & clicks login -> returns to exact novel & chapter
        reader_url = f"{BASE}/reader.html?novel={novel_id}&chapter={ch1_id}"
        reader2_ctx = browser.new_context(viewport={"width": 1366, "height": 800})
        reader2_page = reader2_ctx.new_page()
        reader2_page.on("pageerror", lambda e: errors.append("reader2: " + str(e)))
        reader2_page.goto(reader_url)
        expect(reader2_page.locator("#reader-comments-section")).to_be_visible()
        expect(reader2_page.locator("#comments-guest-prompt")).to_be_visible()

        # Register reader2 account via API, then log in from reader comments login button
        r2_name = "rdr-" + secrets.token_hex(4)
        r2_pw = secrets.token_urlsafe(18)
        r2_email = r2_name + "@example.com"
        r2_cli = Client()
        chal = r2_cli.auth("/register", "POST", {"username": r2_name, "email": r2_email, "password": r2_pw}, 202)
        from mailbox_helpers import read_code
        r2_cli.auth("/register/verify", "POST", {"requestId": chal["requestId"], "code": read_code(r2_email)}, 201)

        reader2_page.locator("#comments-login-btn").click()
        reader2_page.locator("#login-username").fill(r2_name)
        reader2_page.locator("#login-password").fill(r2_pw)
        reader2_page.locator("button[value=login]").click()
        expect(reader2_page).to_have_url(reader_url)
        expect(reader2_page.locator("#comment-form")).to_be_visible()

        # Check PC width of comments section matches reading column (70ch)
        article_width = reader2_page.locator("#reader-content-body").evaluate("el => el.getBoundingClientRect().width")
        comments_width = reader2_page.locator("#reader-comments-section").evaluate("el => el.getBoundingClientRect().width")
        assert abs(article_width - comments_width) <= 2, (article_width, comments_width)

        # Post comment with XSS + lost-response retry
        xss_text = "<img src=x onerror=alert(1)> Cảm nhận chương 1"
        reader2_page.locator("#comment-input").fill(xss_text)
        def lose_comment_resp(route):
            if route.request.method == "POST":
                assert route.fetch().ok
                route.abort()
            else:
                route.continue_()
        reader2_page.route("**/comments", lose_comment_resp)
        reader2_page.locator("#comment-submit-btn").click()
        expect(reader2_page.locator("#comment-submit-error")).to_be_visible()
        expect(reader2_page.locator("#comment-input")).to_have_value(xss_text)
        reader2_page.unroute("**/comments")

        # Retry with same requestId -> creates only 1 comment!
        reader2_page.locator("#comment-submit-btn").click()
        expect(reader2_page.locator("#comments-list .comment-card")).to_have_count(1)
        expect(reader2_page.locator("#comments-list .comment-body").first).to_have_text(xss_text)
        assert reader2_page.locator("#comments-list img").count() == 0

        # Owner replies 1 level in owner_page
        owner_page.goto(reader_url)
        expect(owner_page.locator("#comments-list .comment-card")).to_have_count(1)
        owner_page.locator(".btn-reply-comment").first.click()
        owner_page.locator(".reply-textarea").first.fill("Cảm ơn độc giả!")
        owner_page.locator(".btn-submit-reply").first.click()
        expect(owner_page.locator(".comment-reply-card")).to_have_count(1)

        # Reader2 deletes parent comment -> shows "Bình luận đã xóa" and keeps reply
        reader2_page.reload()
        expect(reader2_page.locator(".comment-reply-card")).to_have_count(1)
        reader2_page.locator(".btn-delete-comment").first.click()
        reader2_page.locator(".swal2-confirm").click()
        expect(reader2_page.locator(".comment-deleted").first).to_have_text("Bình luận đã xóa")
        expect(reader2_page.locator(".comment-reply-card")).to_have_count(1)

        # Switch chapter while old chapter's comment GET is delayed -> late response ignored
        delayed_ch1_comments = []
        def delay_ch1_comments(route):
            if f"/chapters/{ch1_id}/comments" in route.request.url and route.request.method == "GET":
                delayed_ch1_comments.append(route)
            else:
                route.continue_()
        reader2_page.route("**/comments*", delay_ch1_comments)
        reader2_page.reload()
        reader2_page.locator("#reader-next-btn").click()
        expect(reader2_page.locator("#reader-content-body")).to_contain_text("Nội dung chương 2 công khai")
        expect(reader2_page.locator("#comments-empty")).to_be_visible()
        for r in delayed_ch1_comments:
            r.continue_()
        reader2_page.unroute("**/comments*")
        time.sleep(0.15)
        expect(reader2_page.locator("#comments-empty")).to_be_visible()
        expect(reader2_page.locator(".comment-card")).to_have_count(0)

        # Mobile 390x844 and 320x700 in Light & Dark themes (zero horizontal overflow)
        reader2_page.goto(reader_url)
        for theme in ("light", "dark"):
            if theme == "dark":
                reader2_page.locator("#theme-toggle-btn").click()
            for w in (390, 320):
                reader2_page.set_viewport_size({"width": w, "height": 844})
                assert reader2_page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"reader overflow {theme} {w}"
        # Check mobile index.html (Light & Dark), dashboard & editor zero overflow too
        guest_page.set_viewport_size({"width": 1366, "height": 800})
        guest_page.goto(BASE + "/index.html")
        for theme in ("light", "dark"):
            if theme == "dark":
                guest_page.set_viewport_size({"width": 1366, "height": 800})
                guest_page.locator("#theme-toggle-btn").click()
            for w in (390, 320):
                guest_page.set_viewport_size({"width": w, "height": 844})
                assert guest_page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"index overflow {theme} {w}"
        owner_page.goto(BASE + "/dashboard.html")
        for w in (390, 320):
            owner_page.set_viewport_size({"width": w, "height": 844})
            assert owner_page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"dashboard overflow {w}"
        owner_page.goto(f"{BASE}/editor.html?novel={novel_id}&chapter={ch1_id}")
        for w in (390, 320):
            owner_page.set_viewport_size({"width": w, "height": 844})
            assert owner_page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"editor overflow {w}"

        assert not errors, errors
        browser.close()
    print("PASS feature_smoke browser matrix (privacy, discover/search, comments, PC/Mobile light/dark)")


if __name__ == "__main__":
    run_api_tests()
    run_browser_tests()
