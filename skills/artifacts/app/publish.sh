#!/usr/bin/env bash
# Publish an artifact to the Ryugi cloud through the project's running artifacts server and print
# the result as one JSON line.
# Usage: publish.sh [--project-dir <path>] --artifact <type>/<id> [--public | --private] [--unpublish]
#        publish.sh [--project-dir <path>] --list | --delete <cloud-id> | --login | --logout
#
#   --artifact <t>/<id>   Publish (or republish, keeping its link) that artifact.
#   --public, --private   Publish with that visibility. New artifacts are private.
#   --unpublish           Delete the artifact's cloud copy; its link stops working.
#   --list                List every cloud artifact of the signed-in account.
#   --delete <cloud-id>   Delete one cloud artifact by the id --list shows.
#   --login, --logout     Print a sign-in link, or forget this machine's sign-in.
#
# The server must already be running (start-server.sh). Exit codes: 0 done, 1 error,
# 2 sign-in needed: open "url" from the output, then run the same command again.

PROJECT_DIR="$PWD"
ACTION=""
ARTIFACT=""
VISIBILITY=""
CLOUD_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --artifact)
      if ! [[ "${2:-}" =~ ^(artboard|document|html)/[a-z0-9][a-z0-9-]*$ ]]; then
        echo '{"error": "--artifact must be <type>/<id>: type artboard, document or html, id of lowercase letters, digits and hyphens"}'
        exit 1
      fi
      ARTIFACT="$2"
      shift 2
      ;;
    --public) VISIBILITY="public"; shift ;;
    --private) VISIBILITY="private"; shift ;;
    --unpublish) ACTION="unpublish"; shift ;;
    --list) ACTION="list"; shift ;;
    --delete)
      if ! [[ "${2:-}" =~ ^[A-Za-z0-9_-]{1,64}$ ]]; then
        echo '{"error": "--delete needs a cloud artifact id from --list"}'
        exit 1
      fi
      ACTION="delete"
      CLOUD_ID="$2"
      shift 2
      ;;
    --login) ACTION="login"; shift ;;
    --logout) ACTION="logout"; shift ;;
    *) echo "{\"error\": \"Unknown argument: $1\"}"; exit 1 ;;
  esac
done

if [[ -z "$ACTION" || "$ACTION" == "unpublish" ]]; then
  if [[ -z "$ARTIFACT" ]]; then
    echo '{"error": "--artifact <type>/<id> is required"}'
    exit 1
  fi
  [[ -z "$ACTION" ]] && ACTION="publish"
fi

if ! PROJECT_REAL="$(cd "$PROJECT_DIR" 2>/dev/null && pwd -P)"; then
  echo "{\"error\": \"Project directory not found: $PROJECT_DIR\"}"
  exit 1
fi
INFO_FILE="$PROJECT_REAL/.ryugi/artifacts/.state/server-info"

exec node -e '
const fs = require("node:fs");
const [infoFile, action, artifact, visibility, cloudId] = process.argv.slice(1);
const DONE = Symbol("done");
const print = (value, code = 0) => {
  console.log(JSON.stringify(value));
  process.exitCode = code;
  throw DONE;
};
const notRunning = "No artifacts server is running for this project. Start it with start-server.sh, then run this again.";

async function main() {
  let info;
  try {
    info = JSON.parse(fs.readFileSync(infoFile, "utf8"));
  } catch {
    print({ error: notRunning }, 1);
  }
  const base = new URL(info.url);
  const key = base.searchParams.get("key") ?? "";
  if (base.hostname === "localhost") base.hostname = "127.0.0.1";
  const call = async (method, path, body) => {
    let res;
    try {
      res = await fetch(`${base.origin}${path}?key=${encodeURIComponent(key)}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      print({ error: notRunning }, 1);
    }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) {
      print({ type: "login-required", url: json.loginUrl, message: "Open url to sign in to the Ryugi cloud, then run the same command again." }, 2);
    }
    if (!res.ok) print({ error: json.error || `HTTP ${res.status}`, ...(json.reasons ? { reasons: json.reasons } : {}) }, 1);
    return json;
  };

  if (action === "list") print({ type: "cloud-artifacts", artifacts: (await call("GET", "/api/cloud/artifacts")).artifacts });
  if (action === "delete") {
    await call("DELETE", `/api/cloud/artifacts/${cloudId}`);
    print({ type: "deleted", id: cloudId });
  }
  if (action === "login") print({ type: "login", url: (await call("POST", "/api/cloud/login")).url, message: "Open url to sign in to the Ryugi cloud." });
  if (action === "logout") {
    await call("POST", "/api/cloud/logout");
    print({ type: "logged-out" });
  }
  if (action === "unpublish") {
    await call("DELETE", `/api/cloud/publish/${artifact}`);
    print({ type: "unpublished", artifact });
  }
  const published = await call("POST", `/api/cloud/publish/${artifact}`, visibility ? { visibility } : undefined);
  print({ type: "published", artifact, url: published.url, visibility: published.visibility });
}

main().catch((err) => {
  if (err === DONE) return;
  console.log(JSON.stringify({ error: err.message }));
  process.exitCode = 1;
});
' "$INFO_FILE" "$ACTION" "$ARTIFACT" "$VISIBILITY" "$CLOUD_ID"
