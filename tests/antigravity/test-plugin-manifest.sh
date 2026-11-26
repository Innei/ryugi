#!/usr/bin/env bash
# Validate the native Antigravity plugin: the Marketplace manifest, the skill
# description agy relies on to bootstrap using-adeck, the Antigravity hooks
# configuration, and the repo layout agy depends on. CI-safe; when `agy` is on
# PATH, also runs `agy plugin validate` against the repo and `agy plugin
# validate --strict` against a staged native Antigravity plugin.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "test-plugin-manifest: checking Antigravity plugin"

python3 - "$REPO_ROOT" << 'PY'
import json
import re
import struct
import sys
from pathlib import Path

root = Path(sys.argv[1])

def fail(message):
    raise SystemExit(f"FAIL: {message}")

manifest_path = root / ".antigravity-plugin" / "plugin.json"
if not manifest_path.is_file():
    fail(f"manifest missing at {manifest_path}")
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

# --- Marketplace-required fields -------------------------------------------
for field in ["name", "description", "displayName", "logo",
              "suggestedPrompts", "version", "author"]:
    if not manifest.get(field):
        fail(f"manifest field {field!r} is missing or empty")

if manifest["name"] != "adeck":
    fail(f"name must be 'adeck', got {manifest['name']!r}")
if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", manifest["name"]):
    fail("name is not kebab-case")

description_length = len(manifest["description"])
# The guide recommends 120-160 characters for Marketplace cards; we use a
# shorter tagline by choice, so enforce only the upper bound.
if description_length > 160:
    fail(f"description is {description_length} characters; Marketplace cards fit at most 160")

prompts = manifest["suggestedPrompts"]
if not isinstance(prompts, list) or not 1 <= len(prompts) <= 3:
    fail("suggestedPrompts must be a list of 1-3 prompts")
if not all(isinstance(p, str) and p.strip() for p in prompts):
    fail("suggestedPrompts entries must be non-empty strings")

claude_manifest = json.loads(
    (root / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
if manifest["version"] != claude_manifest["version"]:
    fail(f"version {manifest['version']!r} != .claude-plugin version "
         f"{claude_manifest['version']!r}")
if manifest["author"] != claude_manifest["author"]:
    fail("author does not match .claude-plugin/plugin.json")

# --- Logo ------------------------------------------------------------------
logo = root / manifest["logo"]
if not logo.is_file():
    fail(f"logo {manifest['logo']!r} does not exist")
header = logo.read_bytes()[:26]
if header[:8] != b"\x89PNG\r\n\x1a\n":
    fail("logo is not a PNG")
width, height = struct.unpack(">II", header[16:24])
if width != height or width < 128:
    fail(f"logo must be square and at least 128x128, got {width}x{height}")

# --- Version bumps ---------------------------------------------------------
version_config = json.loads((root / ".version-bump.json").read_text(encoding="utf-8"))
if not any(entry.get("path") == ".antigravity-plugin/plugin.json"
           and entry.get("field") == "version"
           for entry in version_config.get("files", [])):
    fail(".version-bump.json does not register .antigravity-plugin/plugin.json")

# --- Bootstrap: agy lists each skill's description, and using-adeck's
# description + SessionStart hook get the model to load it at session start.
skill_md = (root / "skills" / "using-adeck" / "SKILL.md").read_text(encoding="utf-8")
frontmatter = re.match(r"---\n(.*?)\n---\n", skill_md, re.DOTALL)
description = frontmatter and re.search(r"^description:(.*)$", frontmatter.group(1), re.MULTILINE)
if not description or "Use when starting any conversation" not in description.group(1):
    fail("using-adeck description no longer says 'Use when starting any "
         "conversation'; Antigravity relies on it to bootstrap")

# --- Antigravity hooks template --------------------------------------------
hooks_path = root / "hooks" / "hooks-antigravity.json"
if not hooks_path.is_file():
    fail(f"Antigravity hooks template missing at {hooks_path}")
hooks_data = json.loads(hooks_path.read_text(encoding="utf-8"))
ryugi_hooks = hooks_data.get("adeck")
if not isinstance(ryugi_hooks, dict):
    fail("hooks/hooks-antigravity.json must define top-level 'adeck' hook spec")
for event in ["SessionStart", "PreInvocation", "PreToolUse", "PostToolUse", "Stop"]:
    if not isinstance(ryugi_hooks.get(event), list) or not ryugi_hooks[event]:
        fail(f"hooks/hooks-antigravity.json missing non-empty {event!r} handler list")

# --- Antigravity UI sidecar ------------------------------------------------
sidecar_dir = root / "sidecars" / "artifacts"
sidecar_manifest_path = sidecar_dir / "sidecar.json"
if not sidecar_manifest_path.is_file():
    fail(f"Antigravity sidecar manifest missing at {sidecar_manifest_path}")
sidecar_manifest = json.loads(sidecar_manifest_path.read_text(encoding="utf-8"))
if sidecar_manifest.get("command") != "node":
    fail(f"sidecar command must be 'node', got {sidecar_manifest.get('command')!r}")
if sidecar_manifest.get("args") != ["server.cjs"]:
    fail(f"sidecar args must be ['server.cjs'], got {sidecar_manifest.get('args')!r}")
if not (sidecar_dir / "server.cjs").is_file():
    fail(f"sidecar entrypoint missing at {sidecar_dir / 'server.cjs'}")
if sidecar_manifest.get("restart_policy") != "always":
    fail(f"sidecar restart_policy must be 'always', got {sidecar_manifest.get('restart_policy')!r}")
if sidecar_manifest.get("display_name") != "Artideck":
    fail(f"sidecar display_name must be 'Artideck', got {sidecar_manifest.get('display_name')!r}")
if not isinstance(sidecar_manifest.get("description"), str) or not sidecar_manifest["description"].strip():
    fail("sidecar description must be a non-empty string")
if sidecar_manifest.get("has_web_ui") is not True:
    fail("sidecar has_web_ui must be true")
if sidecar_manifest.get("agent_permissions") != {"allows_user_interactions": False}:
    fail("sidecar agent_permissions must set allows_user_interactions to false")
ui_config = sidecar_manifest.get("ui_config")
if not isinstance(ui_config, dict) or ui_config.get("display_name") != "Artideck":
    fail("sidecar ui_config must set display_name to 'Artideck'")
views = ui_config.get("views")
if views != [{"path": "/", "entrypoint": "SIDECAR_UI_ENTRYPOINT_AUX_PANE", "title": "Artideck"}]:
    fail(f"sidecar ui_config.views mismatch: {views!r}")

# --- Layout agy depends on -------------------------------------------------
# A root plugin.json would be read instead of .antigravity-plugin/plugin.json,
# a root hooks.json would conflict with other harnesses in the repo root, and
# Cursor loads any rules/*.md shipped in a plugin.
for stray in ["plugin.json", "hooks.json", "rules"]:
    if (root / stray).exists():
        fail(f"root {stray} must not exist")
PY

if command -v agy > /dev/null 2>&1; then
  output="$(agy plugin validate --json "$REPO_ROOT" 2>&1)" \
    || {
      echo "$output" >&2
      echo "FAIL: agy plugin validate --json failed on repo root" >&2
      exit 1
    }
  python3 - "$output" << 'PY'
import json
import sys

report = json.loads(sys.argv[1])
if report.get("name") != "adeck":
    raise SystemExit(f"FAIL: expected name 'adeck', got {report.get('name')!r}")
skills = report.get("components", {}).get("skills", 0)
if skills < 1:
    raise SystemExit(f"FAIL: agy found no skills ({skills})")
sidecars = report.get("components", {}).get("sidecars", 0)
if sidecars < 1:
    raise SystemExit(f"FAIL: agy found no sidecars ({sidecars})")
errors = [f for f in report.get("findings", []) if f.get("severity") == "error"]
if errors:
    raise SystemExit(f"FAIL: agy plugin validate reported errors: {errors}")
PY

  # Also validate a staged native Antigravity plugin (with root hooks.json and
  # without other harnesses' root files) in --strict mode (0 warnings).
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' EXIT
  cp -R "$REPO_ROOT/.antigravity-plugin" "$REPO_ROOT/assets" "$REPO_ROOT/skills" "$REPO_ROOT/hooks" "$REPO_ROOT/sidecars" "$stage/"
  cp "$REPO_ROOT/hooks/hooks-antigravity.json" "$stage/hooks.json"
  rm -f "$stage/hooks/hooks.json" "$stage/hooks/hooks-cursor.json" "$stage/hooks/hooks-antigravity.json"
  strict_out="$(agy plugin validate --strict --json "$stage" 2>&1)" \
    || {
      echo "$strict_out" >&2
      echo "FAIL: agy plugin validate --strict failed on staged plugin" >&2
      exit 1
    }
  python3 - "$strict_out" << 'PY'
import json
import sys

report = json.loads(sys.argv[1])
sidecars = report.get("components", {}).get("sidecars", 0)
if sidecars < 1:
    raise SystemExit(f"FAIL: staged strict validation found {sidecars} sidecars, expected >= 1")
findings = [f for f in report.get("findings", []) if f.get("severity") in ("error", "warning")]
if findings:
    raise SystemExit(f"FAIL: staged strict validation reported findings: {findings}")
PY
else
  echo "SKIP: agy not on PATH; not running agy plugin validate"
fi

echo "PASS: Antigravity plugin manifest and layout valid"
