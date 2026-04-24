"""
rotate-db-secret.py

1. Reads the Neon API key from 1Password Connect.
2. Resets neondb_owner password on the ChittyRental Neon project via the
   Neon API.
3. Builds the pooled DATABASE_URL entirely in Python — the credential never
   touches a shell variable or a command-line argument. Password is
   URL-encoded to handle special characters.
4. For each target environment, writes the DATABASE_URL to a temp file
   (mode 0600, deleted after use), then runs wrangler secret put with that
   file piped to stdin so the value is never exposed in ps/env output.

Run:
  python3 scripts/rotate-db-secret.py                    # default: top-level + production
  python3 scripts/rotate-db-secret.py --env production    # single env
  python3 scripts/rotate-db-secret.py --env staging --env production  # multiple envs
"""

import argparse
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
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

DEFAULT_ENVS    = [None, "production"]  # top-level (Workers Builds) + production

# ── Helpers ───────────────────────────────────────────────────────────────────

def op_get(path):
    req = urllib.request.Request(
        f"{OP_HOST}{path}",
        headers={"Authorization": f"Bearer {OP_TOKEN}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                print(f"ERROR: 1Password Connect returned non-JSON: {body[:200]}", file=sys.stderr)
                sys.exit(1)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        print(f"ERROR: 1Password Connect returned HTTP {e.code}: {body}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"ERROR: Cannot reach 1Password Connect at {OP_HOST}: {e.reason}", file=sys.stderr)
        sys.exit(1)


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
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                print(f"ERROR: Neon API returned non-JSON: {body[:200]}", file=sys.stderr)
                sys.exit(1)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        print(f"ERROR: Neon API returned HTTP {e.code}: {body}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"ERROR: Cannot reach Neon API: {e.reason}", file=sys.stderr)
        sys.exit(1)


def deploy_secret(database_url, wrangler_config, env_name):
    """Deploy DATABASE_URL to a specific wrangler environment via temp file."""
    label = env_name or "top-level"
    fd, tmp_path = tempfile.mkstemp(prefix="chittyfinance_db_", suffix=".tmp")
    try:
        os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR)  # 0600
        with os.fdopen(fd, "w") as fh:
            fh.write(database_url)
            fh.flush()

        cmd = ["npx", "wrangler", "secret", "put", "DATABASE_URL", "--config", wrangler_config]
        if env_name:
            cmd.extend(["--env", env_name])

        with open(tmp_path, "r") as stdin_fh:
            try:
                result = subprocess.run(cmd, stdin=stdin_fh, capture_output=True, text=True, timeout=60)
            except subprocess.TimeoutExpired:
                print(f"  [{label}] ERROR: wrangler timed out after 60s", file=sys.stderr)
                return False

        if result.returncode == 0:
            print(f"  [{label}] wrangler secret put succeeded", file=sys.stderr)
        else:
            print(f"  [{label}] ERROR: wrangler exited {result.returncode}", file=sys.stderr)
            print(result.stdout, file=sys.stderr)
            print(result.stderr, file=sys.stderr)
            return False
    finally:
        try:
            os.unlink(tmp_path)
        except FileNotFoundError:
            pass
        except OSError as e:
            print(f"  WARNING: Failed to delete temp file {tmp_path}: {e}", file=sys.stderr)
            print("  SECURITY: Temp file may contain DATABASE_URL in plaintext", file=sys.stderr)
    return True


# ── CLI ───────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Rotate Neon DB password and deploy to Cloudflare Workers")
parser.add_argument("--env", action="append", dest="envs",
                    help="Wrangler environment(s) to deploy to (default: top-level + production). "
                         "Pass multiple times for multiple envs. Use '' for top-level only.")
args = parser.parse_args()
target_envs = args.envs if args.envs else DEFAULT_ENVS

# ── Validate required env vars (after argparse so --help works) ──────────────

if not OP_HOST:
    print("ERROR: OP_CONNECT_HOST environment variable is required", file=sys.stderr)
    sys.exit(1)
if not OP_TOKEN:
    print("ERROR: OP_CONNECT_TOKEN environment variable is required", file=sys.stderr)
    sys.exit(1)

# Pre-flight: verify npx/wrangler available BEFORE rotating the password.
# If wrangler is missing, rotating would leave a new password that can't be deployed.
if not shutil.which("npx"):
    print("ERROR: npx not found on PATH. Cannot deploy secrets to Cloudflare Workers.", file=sys.stderr)
    print("ABORTING before password rotation to avoid partial failure.", file=sys.stderr)
    sys.exit(1)

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

encoded_password = urllib.parse.quote(new_password, safe="")
database_url = (
    f"postgresql://{NEON_ROLE}:{encoded_password}"
    f"@{POOLER_HOST}/{NEON_DB}?sslmode=require"
)
print("[3] DATABASE_URL constructed (password URL-encoded)", file=sys.stderr)

# ── Step 4: deploy to wrangler environments ──────────────────────────────────

wrangler_config = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "deploy", "system-wrangler.jsonc",
)

env_labels = [e or "top-level" for e in target_envs]
print(f"[4] Deploying DATABASE_URL to: {', '.join(env_labels)}", file=sys.stderr)

failed = []
for env_name in target_envs:
    if not deploy_secret(database_url, wrangler_config, env_name):
        failed.append(env_name or "top-level")

if failed:
    print(f"ERROR: Failed to deploy to: {', '.join(failed)}", file=sys.stderr)
    sys.exit(1)

print("[4] Done. DATABASE_URL secret updated on all target environments.", file=sys.stderr)
