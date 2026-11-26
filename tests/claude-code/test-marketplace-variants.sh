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

for (const name of ["adeck-lite", "ryugi-artifacts"]) {
  const variant = marketplace.plugins.find((plugin) => plugin.name === name);
  if (!variant) failures.push(`marketplace has no ${name} entry`);
  else {
    if (variant.source !== "./") failures.push(`${name} source is ${variant.source}`);
    const skills = JSON.stringify(variant.skills);
    if (skills !== JSON.stringify(["./skills/artifacts", "./skills/interface-craft"]))
      failures.push(`${name} skills are ${skills}`);
    if (/brainstorm|tdd/i.test(variant.description ?? "")) failures.push(`${name} description names the workflow`);
  }
}

for (const name of ["adeck", "ryugi"]) {
  const full = marketplace.plugins.find((plugin) => plugin.name === name);
  if (!full || full.skills) failures.push(`the full ${name} entry must stay unrestricted`);
}
if (marketplace.name !== "ryugi-dev") failures.push(`marketplace is named ${marketplace.name}; installed users know it as ryugi-dev`);

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
