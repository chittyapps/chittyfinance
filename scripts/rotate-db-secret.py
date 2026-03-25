"""
rotate-db-secret.py

1. Reads the Neon API key from 1Password Connect.
2. Resets neondb_owner password on the ChittyRental Neon project via the
   Neon API.
3. Builds the pooled DATABASE_URL entirely in Python — the credential never
   touches a shell variable or a command-line argument.
4. Writes the DATABASE_URL to a temp file (mode 0600, deleted after use),
   then execs wrangler secret put reading from that file via stdin so the
   value is never exposed in ps/env output.

Run:
  python3 scripts/rotate-db-secret.py
"""

import json
import os
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

# ── Config ────────────────────────────────────────────────────────────────────

OP_HOST  = os.environ.get("OP_CONNECT_HOST", "").rstrip("/")
OP_TOKEN = os.environ.get("OP_CONNECT_TOKEN", "")

NEON_KEY_VAULT  = "oxwo63jlcbo66c7kwx67lquw4i"   # ChittyOS-Core
NEON_KEY_ITEM   = "yze3gaaxpopweq5b7uab6sq4ji"    # chittyfoundation_neon_api_key
NEON_KEY_FIELD  = "neon_api_key"

NEON_PROJECT    = "young-mouse-42795827"           # ChittyRental
NEON_BRANCH     = "br-hidden-hill-ajef0w5d"
NEON_ROLE       = "neondb_owner"
NEON_DB         = "neondb"
POOLER_HOST     = "ep-delicate-breeze-aj9gmu1i-pooler.c-3.us-east-2.aws.neon.tech"

# ── Helpers ───────────────────────────────────────────────────────────────────

def op_get(path):
    req = urllib.request.Request(
        f"{OP_HOST}{path}",
        headers={"Authorization": f"Bearer {OP_TOKEN}"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def neon_post(path, api_key):
    req = urllib.request.Request(
        f"https://console.neon.tech/api/v2{path}",
        data=b"",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


# ── Step 1: retrieve Neon API key from 1Password ──────────────────────────────

print("[1] Retrieving Neon API key from 1Password Connect...", file=sys.stderr)
item = op_get(f"/v1/vaults/{NEON_KEY_VAULT}/items/{NEON_KEY_ITEM}")
neon_api_key = next(
    (f["value"] for f in item.get("fields", []) if f.get("label") == NEON_KEY_FIELD),
    None,
)
if not neon_api_key:
    print("ERROR: neon_api_key field not found or empty", file=sys.stderr)
    sys.exit(1)
print("[1] OK", file=sys.stderr)

# ── Step 2: reset neondb_owner password via Neon API ─────────────────────────

print(f"[2] Resetting {NEON_ROLE} password on project {NEON_PROJECT}...", file=sys.stderr)
reset = neon_post(
    f"/projects/{NEON_PROJECT}/branches/{NEON_BRANCH}/roles/{NEON_ROLE}/reset_password",
    neon_api_key,
)
new_password = reset.get("role", {}).get("password", "")
if not new_password:
    print(f"ERROR: no password in Neon reset response: {json.dumps(reset)[:200]}", file=sys.stderr)
    sys.exit(1)
print("[2] Password reset OK", file=sys.stderr)

# ── Step 3: build DATABASE_URL entirely in Python ────────────────────────────

database_url = (
    f"postgresql://{NEON_ROLE}:{new_password}"
    f"@{POOLER_HOST}/{NEON_DB}?sslmode=require"
)
print("[3] DATABASE_URL constructed", file=sys.stderr)

# ── Step 4: write DATABASE_URL to a 0600 temp file, pipe into wrangler ────────

print("[4] Writing DATABASE_URL to secure temp file and calling wrangler...", file=sys.stderr)

wrangler_config = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "deploy", "system-wrangler.toml",
)

fd, tmp_path = tempfile.mkstemp(prefix="chittyfinance_db_", suffix=".tmp")
try:
    os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR)  # 0600
    with os.fdopen(fd, "w") as fh:
        fh.write(database_url)
        fh.flush()

    with open(tmp_path, "r") as stdin_fh:
        result = subprocess.run(
            [
                "npx", "wrangler", "secret", "put", "DATABASE_URL",
                "--config", wrangler_config,
            ],
            stdin=stdin_fh,
            capture_output=True,
            text=True,
        )

    if result.returncode == 0:
        print("[4] wrangler secret put succeeded", file=sys.stderr)
        print(result.stdout, file=sys.stderr)
    else:
        print(f"ERROR: wrangler exited {result.returncode}", file=sys.stderr)
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)
finally:
    try:
        os.unlink(tmp_path)
        print("[4] Temp file deleted", file=sys.stderr)
    except OSError:
        pass

print("[5] Done. DATABASE_URL secret updated on chittyfinance Worker.", file=sys.stderr)
