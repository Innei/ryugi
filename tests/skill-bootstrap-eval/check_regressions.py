#!/usr/bin/env python3
"""Check whether each bug-fix run's tests catch the original defect."""

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    args = parser.parse_args()
    results = []
    for record_path in sorted(args.run_dir.glob("runs/bug-*/record.json")):
        record = json.loads(record_path.read_text())
        project = args.run_dir / "projects" / record["name"]
        # Create a fresh copy with the original bug, preserving the model's project.
        with tempfile.TemporaryDirectory(prefix="ryugi-regression-check-") as temporary:
            target = Path(temporary)
            for source in project.iterdir():
                if source.name in (".git", "node_modules", "filter.cjs"):
                    continue
                if source.is_dir():
                    shutil.copytree(source, target / source.name)
                else:
                    shutil.copy2(source, target / source.name)
            (target / "filter.cjs").write_text(
                "exports.filterByPrice = (items, min, max) =>\n"
                "  items.filter(item => item.price >= min && item.price < max);\n"
            )
            process = subprocess.run(["node", "--test"], cwd=target, capture_output=True,
                                     text=True, timeout=15)
            output = process.stdout + process.stderr
            catches = process.returncode != 0 and "ERR_ASSERTION" in output
            results.append({"name": record["name"], "arm": record["arm"],
                            "catches_original_bug": catches, "exit_code": process.returncode,
                            "output": output})
            print(record["name"], "catches_original_bug=" + str(catches))
    (args.run_dir / "regression-checks.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
