"""Integration checks for a disposable, local API using api/schema.sql.

Configure its bootstrap admin as workspace-admin@example.test with the test
password below. Set PAPER_NOTES_TEST_URL to that isolated server's /api URL.
Never point this at an existing account or production database.
"""
import http.cookiejar
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid

base = os.environ.get("PAPER_NOTES_TEST_URL", "").rstrip("/")
assert urllib.parse.urlparse(base).hostname in {"127.0.0.1", "localhost"}, "Set a disposable localhost PAPER_NOTES_TEST_URL."
checks = 0


def check(condition, message):
    global checks
    assert condition, message
    checks += 1


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = ""

    def request(self, path, method="GET", data=None, status=200, csrf=True):
        headers = {"Content-Type": "application/json"}
        if csrf and self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        request = urllib.request.Request(base + path, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        payload = response.read()
        check(response.status == status, f"{method} {path}: expected {status}, received {response.status}")
        return json.loads(payload) if payload else None

    def login(self, email):
        result = self.request("/auth/login", "POST", {"email": email, "password": "Workspace-test-only-2026"})
        self.csrf = result["csrf_token"]


admin = Client()
admin.login("workspace-admin@example.test")
personal = admin.request("/workspaces")[0]
check(personal["name"] == "Personal", "A fresh account starts in Personal.")
suffix = uuid.uuid4().hex[:8]
work = admin.request("/workspaces", "POST", {"name": "Work " + suffix}, 201)
reference = admin.request("/workspaces", "POST", {"name": "Reference " + suffix}, 201)
admin.request("/workspaces", "POST", {"name": work["name"]}, 409)
admin.request("/workspaces", "POST", {"name": "  "}, 422)
admin.request("/workspaces", "POST", {"name": "x" * 61}, 422)
admin.request("/workspaces", "POST", {"name": "No CSRF"}, 403, csrf=False)

personal_category = admin.request("/categories", "POST", {"name": "Tasks " + suffix, "workspace_id": personal["id"]}, 201)
work_category = admin.request("/categories", "POST", {"name": personal_category["name"], "workspace_id": work["id"]}, 201)
check(admin.request(f"/categories?workspace_id={work['id']}") == [work_category], "Categories stay inside their workspace; names can repeat across workspaces.")

payload = {"workspace_id": personal["id"], "title": "Workspace integration note " + suffix,
           "content": '<p><strong>Keep this content.</strong></p><p><span style="color: #93566b; font-family: Georgia; font-size: 20px">Styled text</span></p>',
           "color": "#d4f4f3", "is_pinned": True, "is_archived": True, "category_id": personal_category["id"]}
note = admin.request("/notes", "POST", payload, 201)
note_id = note["id"]
check(any(item["id"] == note_id for item in admin.request(f"/notes?workspace_id={personal['id']}")), "Personal includes its archived and pinned notes.")
check(admin.request(f"/notes?workspace_id={work['id']}") == [], "Work starts with no Personal notes.")
check(admin.request(f"/notes?workspace_id={reference['id']}") == [], "Reference is separate too.")

admin.request("/notes", "POST", {**payload, "workspace_id": work["id"]}, 422)
unchanged = admin.request(f"/notes/{note_id}/move", "POST", {"workspace_id": personal["id"]})
check(unchanged["category_id"] == personal_category["id"], "Moving to the same workspace preserves its category.")
admin.request(f"/notes/{note_id}/move", "POST", {"workspace_id": ""}, 422)
admin.request(f"/notes/{note_id}/move", "POST", {"workspace_id": "garbage"}, 422)
moved = admin.request(f"/notes/{note_id}/move", "POST", {"workspace_id": work["id"]})
for field in ["id", "title", "content", "color", "is_pinned", "is_archived", "created_at", "user_id"]:
    check(moved[field] == note[field], f"Moving preserves {field}.")
check(moved["category_id"] is None, "A move clears the old workspace's category.")
check(not any(item["id"] == note_id for item in admin.request(f"/notes?workspace_id={personal['id']}")), "Moved notes leave the old library.")
check(admin.request(f"/notes?workspace_id={work['id']}")[0]["id"] == note_id, "Moved notes appear in the new library.")

updated = admin.request(f"/notes/{note_id}", "PUT", {**moved, "category_id": work_category["id"], "is_archived": False})
check(updated["category_id"] == work_category["id"] and updated["is_archived"] == 0, "Moved notes can be categorized and restored.")
admin.request(f"/notes/{note_id}", "PUT", {**updated, "category_id": personal_category["id"]}, 422)
renamed = admin.request(f"/workspaces/{work['id']}", "PUT", {"name": "Studio " + suffix})
check(renamed["id"] == work["id"], "Renaming keeps the workspace identity.")
check(admin.request(f"/notes?workspace_id={work['id']}")[0]["id"] == note_id, "Renaming keeps its notes.")
legacy_update = dict(updated)
legacy_update.pop("workspace_id")
check(admin.request(f"/notes/{note_id}", "PUT", legacy_update)["workspace_id"] == work["id"], "Updates without workspace_id keep the existing workspace.")

email = "workspace-member-" + suffix + "@example.test"
admin.request("/admin/users", "POST", {"display_name": "Another user", "email": email, "password": "Workspace-test-only-2026", "is_admin": False}, 201)
member = Client()
member.login(email)
member_personal = member.request("/workspaces")[0]
check(member_personal["id"] != personal["id"], "Each account gets a separate Personal workspace.")
check(member.request("/notes") == [], "New accounts cannot see another account's default notes.")
member.request(f"/notes?workspace_id={work['id']}", status=422)
member.request(f"/categories?workspace_id={work['id']}", status=422)
member.request(f"/workspaces/{work['id']}", "PUT", {"name": "Unauthorized rename"}, 422)
member.request(f"/notes/{note_id}", status=404)
member.request(f"/notes/{note_id}/move", "POST", {"workspace_id": member_personal["id"]}, 404)
admin.request(f"/notes/{note_id}/move", "POST", {"workspace_id": member_personal["id"]}, 422)
admin.request("/notes", "POST", {**payload, "workspace_id": member_personal["id"]}, 422)
admin.request("/categories", "POST", {"name": "Not allowed", "workspace_id": member_personal["id"]}, 422)
check(admin.request(f"/notes/{note_id}")["workspace_id"] == work["id"], "Rejected operations leave the note in its original workspace.")
print(f"{checks} workspace API checks passed.")
