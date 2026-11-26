import json
import os
import re
import time
from urllib.parse import urlencode, urlparse
from urllib.request import urlopen

MAILPIT = os.environ.get("MAILPIT_URL", "http://127.0.0.1:8025")
assert urlparse(MAILPIT).hostname in ("localhost", "127.0.0.1")


def mailbox(path):
    with urlopen(MAILPIT + "/api/v1/" + path, timeout=5) as response:
        return json.load(response)


def messages(email):
    return mailbox("search?" + urlencode({"query": "to:" + email}))["messages"]


def read_code(email, count=1):
    for _ in range(50):
        mail = messages(email)
        if len(mail) == count:
            body = mailbox("message/" + mail[0]["ID"])["Text"]
            return re.search(r"\b([0-9]{4})\b", body)[1]
        time.sleep(0.1)
    raise AssertionError("Verification email did not arrive")
