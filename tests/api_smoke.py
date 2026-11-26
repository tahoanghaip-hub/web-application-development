"""Black-box tests. Use a disposable Compose project. All test accounts are synthetic."""
import copy
import json
import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.parse import urlparse
from uuid import uuid4
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = os.getenv("TEST_URL", "http://127.0.0.1:8080")
assert urlparse(BASE).hostname in ("127.0.0.1", "localhost")


class Client:
    def __init__(self):
        self.cookies = CookieJar()
        self.http = build_opener(HTTPCookieProcessor(self.cookies))

    def call(self, path, method="GET", data=None, expect=200, csrf=True, headers=None):
        options = {"Content-Type": "application/json", **(headers or {})}
        if csrf:
            options["X-NovelStudio"] = "1"
        body = json.dumps(data).encode() if data is not None else None
        request = Request(BASE + path, data=body, method=method, headers=options)
        try:
            response = self.http.open(request, timeout=8)
        except HTTPError as error:
            response = error
        with response:
            assert response.status == expect, (method, path, response.status, expect)
            if response.headers.get_content_type() == "application/json":
                return json.load(response)

    def studio(self, path, *args, **kwargs):
        return self.call("/api/v1/studio" + path, *args, **kwargs)

    def auth(self, path, *args, **kwargs):
        return self.call("/api/v1/auth" + path, *args, **kwargs)


def signup(client):
    credentials = {"username": "test-" + secrets.token_hex(6), "password": secrets.token_urlsafe(24)}
    user = client.auth("/register", "POST", credentials | {"role": "Admin"}, 201)
    assert user["role"] == "Author"
    client.auth("/register", "POST", credentials, 409)
    client.auth("/login", "POST", credentials, 403, csrf=False)
    client.auth("/login", "POST", credentials)
    assert client.auth("/me") == user
    assert "HttpOnly" in next(iter(client.cookies))._rest
    return user


def run():
    a, b, guest = Client(), Client(), Client()
    guest.call("/internal/session", expect=404)
    guest.studio("/novels", expect=401)
    guest.studio("/public")
    alice = signup(a)
    bob = signup(b)
    assert a.auth("/me", "PATCH", {"displayName": "Bút danh thử"})["displayName"] == "Bút danh thử"
    a.auth("/users", expect=403)
    assert a.studio("/novels")["total"] == 0
    data = {"title": alice["username"], "description": "Dữ liệu minh họa cho kiểm thử.",
            "deadline": str((datetime.now(UTC) + timedelta(days=10)).date()),
            "priority": "High", "status": "Pending", "owner_id": bob["id"]}
    nid = a.studio("/novels", "POST", data, 201)["id"]
    path = "/novels/" + nid
    cid = a.studio(path + "/chapters", "POST", {"chapterTitle": "Khởi đầu"}, 201)["chapterId"]
    chapter = path + "/chapters/" + cid
    draft = {"content": "Công khai", "commitMessage": "ghi chú riêng", "requestId": str(uuid4())}
    version = a.studio(chapter + "/versions", "POST", draft, 201)
    assert a.studio(chapter + "/versions", "POST", draft, 201) == version
    a.studio(chapter + "/versions", "POST", draft | {"content": "khác"}, 409)
    vp = chapter + "/versions/" + version["versionId"]
    print("PASS registration, profile, session, create and save")
    for route, method, payload in [(path, "GET", None), (path, "PUT", data), (path, "DELETE", None),
        (path + "/chapters", "POST", {"chapterTitle": "Chương thử"}),
        (chapter, "PUT", {"chapterTitle": "Thử đổi"}), (chapter, "DELETE", None),
        (chapter + "/versions", "POST", {"content": "test"}), (vp + "/restore", "POST", None),
        (vp + "/publish", "PUT", None), (chapter + "/publication", "DELETE", None)]:
        b.studio(route, method, payload, 404, headers={"X-User-Id": alice["id"], "X-Role": "Admin"})
    assert b.studio("/export") == [] and b.studio("/statistics")["total"] == 0
    a.studio(vp + "/publish", "PUT", expect=403, csrf=False)
    a.studio(vp + "/publish", "PUT")
    a.studio(chapter + "/versions", "POST", {"content": "Bản nháp mới"}, 201)
    a.studio(path, "PUT", data | {"description": "Mô tả chưa xuất bản"})
    public = next(x for x in guest.studio("/public") if x["id"] == nid)
    assert public["description"] == data["description"]
    visible = public["chapters"][0]["versions"]
    assert len(visible) == 1 and visible[0]["content"] == "Công khai" and "commitMessage" not in visible[0]
    restored = a.studio(vp + "/restore", "POST", expect=201)
    assert restored["content"] == "Công khai" and restored["versionId"] != version["versionId"]
    assert a.studio("/statistics")["totalVersions"] == 3
    a.studio(chapter, "PUT", {"chapterTitle": "Mở đầu"})
    a.studio(path, "PUT", data | {"status": "Done"})
    assert a.studio("/novels?status=Done&priority=High&keyword=test-&size=1")["total"] == 1
    assert a.studio("/novels?size=1&page=2")["items"] == []
    extra = a.studio("/novels", "POST", data | {"title": "ZZZ test", "priority": "Low"}, 201)
    first = a.studio("/novels?size=1&sortBy=created-desc&page=1")
    second = a.studio("/novels?size=1&sortBy=created-desc&page=2")
    assert first["total"] == second["total"] == 2
    assert [first["items"][0]["id"], second["items"][0]["id"]] == [extra["id"], nid]
    assert a.studio("/novels?priority=Low")["total"] == 1
    a.studio("/novels/" + extra["id"], "DELETE")
    print("PASS scoped reads/writes, Author permissions, CSRF, publication, restore, search and pagination")
    backup = a.studio("/export")
    backup[0]["createdAt"] = "2020-01-01T04:00:00+07:00"
    backup[0]["chapters"][0]["versions"][0]["timestamp"] = "2019-02-03T01:02:03.456Z"
    broken = copy.deepcopy(backup[0])
    del broken["chapters"][0]["versions"][0]["timestamp"]
    b.studio("/import", "POST", backup + [broken], 422)
    assert b.studio("/statistics")["total"] == 0
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: b.studio("/import", "POST", backup), range(2)))
    assert sorted(r["count"] for r in results) == [0,1]
    exported = b.studio("/export")
    assert len(exported) == 1 and exported[0]["chapters"][0]["status"] == "Draft"
    for old, new in zip(backup[0]["chapters"][0]["versions"], exported[0]["chapters"][0]["versions"], strict=True):
        for field in ["content", "commitMessage"]:
            assert old[field] == new[field]
        assert datetime.fromisoformat(old["timestamp"]) == datetime.fromisoformat(new["timestamp"])
    assert datetime.fromisoformat(backup[0]["createdAt"]) == datetime.fromisoformat(exported[0]["createdAt"])
    assert all(x["id"] != exported[0]["id"] for x in guest.studio("/public"))
    a.studio(chapter + "/publication", "DELETE")
    assert all(x["id"] != nid for x in guest.studio("/public"))
    a.studio(chapter, "DELETE")
    a.studio(path, "DELETE")
    assert a.studio("/statistics")["total"] == 0
    b.studio("/novels", "DELETE")
    assert b.studio("/export") == []
    cookie = next(iter(a.cookies))
    a.auth("/logout", "POST")
    guest.auth("/me", expect=401, headers={"Cookie": cookie.name + "=" + cookie.value})
    guest.studio("/novels", expect=401, headers={"Cookie": cookie.name + "=" + cookie.value})
    print("PASS transactional import, concurrent duplicate, timestamps, private import, delete, logout")


if __name__ == "__main__":
    run()
