#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

node - "$REPO_ROOT" << 'EOF'
const fs = require("fs");
const path = require("path");
const root = process.argv[2];
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const marketplace = read(".claude-plugin/marketplace.json");
const bump = read(".version-bump.json");
const failures = [];

const variant = marketplace.plugins.find((plugin) => plugin.name === "ryugi-artifacts");
if (!variant) failures.push("marketplace has no ryugi-artifacts entry");
else {
  if (variant.source !== "./") failures.push(`ryugi-artifacts source is ${variant.source}`);
  const skills = JSON.stringify(variant.skills);
  if (skills !== JSON.stringify(["./skills/artifacts", "./skills/interface-craft"]))
    failures.push(`ryugi-artifacts skills are ${skills}`);
  if (/brainstorm|tdd/i.test(variant.description ?? "")) failures.push("ryugi-artifacts description names the workflow");
}

const full = marketplace.plugins.find((plugin) => plugin.name === "ryugi");
if (!full || full.skills) failures.push("the full ryugi entry must stay unrestricted");

marketplace.plugins.forEach((_, index) => {
  const declared = bump.files.some(
    (file) => file.path === ".claude-plugin/marketplace.json" && file.field === `plugins.${index}.version`,
  );
  if (!declared) failures.push(`.version-bump.json does not declare plugins.${index}.version`);
});

if (failures.length) {
  console.error(failures.map((line) => `  [FAIL] ${line}`).join("\n"));
  process.exit(1);
}
console.log("  [PASS] marketplace variants and their versions");
EOF

if command -v claude > /dev/null 2>&1; then
  if claude plugin validate "$REPO_ROOT" > /dev/null 2>&1; then
    echo "  [PASS] claude plugin validate"
  else
    echo "  [FAIL] claude plugin validate"
    claude plugin validate "$REPO_ROOT" 2>&1 | sed 's/^/      /'
    exit 1
  fi
fi
