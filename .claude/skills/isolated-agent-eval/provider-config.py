#!/usr/bin/env python3
"""Copy one provider out of the host's OMP models.yml into a 0600 file.

    python3 -I provider-config.py <provider> <output file>

The container gets only this file, never the host's ~/.omp. The key is not
printed. Delete the output when the runs are done.
"""
import os
import re
import sys

provider, dest = sys.argv[1], sys.argv[2]
source = os.path.expanduser("~/.omp/agent/models.yml")
lines, inside = ["providers:"], False
for line in open(source, encoding="utf-8").read().splitlines():
    if re.match(rf"^  {re.escape(provider)}:\s*$", line):
        inside = True
    elif inside and re.match(r"^ {0,2}\S", line):
        break
    if inside:
        lines.append(line)
if len(lines) == 1:
    sys.exit(f"provider {provider!r} not found in {source}")
os.makedirs(os.path.dirname(os.path.abspath(dest)), mode=0o700, exist_ok=True)
fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, ("\n".join(lines) + "\n").encode())
os.close(fd)
print(f"{dest}: provider {provider}, {len(lines) - 1} lines, mode 600")
