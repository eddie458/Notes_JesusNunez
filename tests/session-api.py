"""Run only against tests/fixtures/session-router.php and an isolated database.

Set PAPER_NOTES_TEST_URL to the local /api URL and
PAPER_NOTES_SESSION_TEST_DIR to its /private/tmp/paper-notes-session-tests-* directory.
The fixture bootstrap account is workspace-admin@example.test / Workspace-test-only-2026.
"""
import http.cookiejar
import json
import os
import pathlib
import stat
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

base = os.environ["PAPER_NOTES_TEST_URL"].rstrip("/")
root = pathlib.Path(os.environ["PAPER_NOTES_SESSION_TEST_DIR"]).resolve()
assert urllib.parse.urlparse(base).hostname in {"127.0.0.1", "localhost"}
assert root.parent == pathlib.Path("/private/tmp") and root.name.startswith("paper-notes-session-tests-")
ttl = 30 * 86400
checks = 0


def check(condition, message):
    global checks
    assert condition, message
    checks += 1


class Client:
    def __init__(self, jar=None):
        self.jar = jar if jar is not None else http.cookiejar.MozillaCookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = ""

    def request(self, path, method="GET", data=None, status=200, headers=None):
        sent = {"Content-Type": "application/json"}
        if self.csrf:
            sent["X-CSRF-Token"] = self.csrf
        sent.update(headers or {})
        request = urllib.request.Request(base + path, data=json.dumps(data).encode() if data is not None else None, headers=sent, method=method)
        try:
            response = self.opener.open(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        assert response.headers.get("X-Paper-Notes-Test-Fixture") == "sessions", "Refusing to test a non-fixture API."
        check(response.status == status, f"{method} {path}: expected {status}, received {response.status}")
        payload = response.read()
        return (json.loads(payload) if payload else None), response.headers

    def cookie(self):
        return next(cookie for cookie in self.jar if cookie.name == "paper_notes_session_test")

    def login(self):
        payload, headers = self.request("/auth/login", "POST", {"email": "workspace-admin@example.test", "password": "Workspace-test-only-2026"})
        self.csrf = payload["csrf_token"]
        return headers


def seed_activity(client, last_activity):
    # Only change a test session's clock fields, never real account data.
    program = "$c=require $argv[1];session_name($c['session_name']);session_save_path($c['session_save_path']);session_id($argv[2]);session_start();$_SESSION['last_activity_at']=(int)$argv[3];$_SESSION['expires_at']=(int)$argv[3]+2592000;session_write_close();"
    subprocess.run(["php", "-r", program, str(root / "api/config.php"), client.cookie().value, str(last_activity)], check=True, capture_output=True)


client = Client()
_, headers = client.request("/auth/me", status=401)
check("HttpOnly" in headers.get("Set-Cookie", "") and "SameSite=Lax" in headers.get("Set-Cookie", ""), "Cookies must retain HttpOnly and SameSite protections.")
check("no-store" in headers.get("Cache-Control", ""), "Authentication responses must not be cached.")
check(not client.cookie().discard, "The cookie must persist across browser restarts.")
anonymous_id = client.cookie().value
client.request("/auth/login", "POST", {"email": "workspace-admin@example.test", "password": "wrong"}, status=401)
headers = client.login()
check(client.cookie().value != anonymous_id, "Successful login must rotate the session ID.")
check(abs(client.cookie().expires - time.time() - ttl) < 5, "Login must set a 30-day cookie.")
check("Max-Age=2592000" in headers.get("Set-Cookie", ""), "The cookie must explicitly declare the persistence duration.")
check(stat.S_IMODE((root / "sessions").stat().st_mode) == 0o700, "The session directory must be private.")

cookie_file = root / "browser-cookies.txt"
client.jar.save(str(cookie_file), ignore_discard=False)
reopened_jar = http.cookiejar.MozillaCookieJar(str(cookie_file))
reopened_jar.load(ignore_discard=False)
reopened = Client(reopened_jar)
payload, _ = reopened.request("/auth/me")
check(payload["user"]["email"] == "workspace-admin@example.test", "A reopened browser must remain signed in.")
reopened.csrf = payload["csrf_token"]

for inactive_seconds in [301, 10 * 86400]:
    before = int(time.time()) - inactive_seconds
    seed_activity(reopened, before)
    session_file = root / "sessions" / ("sess_" + reopened.cookie().value)
    os.utime(session_file, (before, before))
    # Force PHP GC, proving a shorter host default cannot collect this app's data.
    program = "require $argv[1];$c=require $argv[2];NoteSession::start($c);session_gc();session_write_close();"
    subprocess.run(["php", "-r", program, str(root / "api/NoteSession.php"), str(root / "api/config.php")], check=True, capture_output=True)
    check(session_file.exists(), "A session idle for less than 30 days must survive cleanup.")
    payload, _ = reopened.request("/auth/me")
    check(abs(reopened.cookie().expires - time.time() - ttl) < 5, "Returning after inactivity must renew the full 30-day window.")
    check(payload["csrf_token"] == reopened.csrf, "Returning to a valid session must retain its CSRF token.")

seed_activity(reopened, int(time.time()) - ttl - 1)
reopened.request("/auth/me", status=401)
reopened.login()
reopened.request("/auth/logout", "POST", {}, status=403, headers={"X-CSRF-Token": "wrong"})
reopened.request("/auth/me")
old_id = reopened.cookie().value
_, logout_headers = reopened.request("/auth/logout", "POST", {}, status=204)
check(len(logout_headers.get_all("Set-Cookie", [])) == 1, "Logout must send a single definitive cookie expiration.")
check(not any(cookie.name == "paper_notes_session_test" for cookie in reopened.jar), "Logout must remove the browser cookie.")
check(not (root / "sessions" / ("sess_" + old_id)).exists(), "Logout must destroy server session data.")
Client().request("/auth/me", status=401, headers={"Cookie": "paper_notes_session_test=" + old_id})
fixed_id = "0123456789abcdef0123456789abcdef"
unknown = Client()
unknown.request("/auth/me", status=401, headers={"Cookie": "paper_notes_session_test=" + fixed_id})
check(unknown.cookie().value != fixed_id, "Strict mode must reject an uninitialized session ID.")
_, secure_headers = Client().request("/auth/me", status=401, headers={"X-Test-HTTPS": "yes"})
check("; secure" in secure_headers.get("Set-Cookie", "").lower(), "HTTPS session cookies must remain Secure.")

print(f"Passed {checks} session persistence and security checks.")
