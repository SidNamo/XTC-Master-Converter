#!/usr/bin/env python3
"""Rewrite CoolReader's bundled thirdparty patches to a uniform `a/`/`b/`
prefix scheme so `patch -p1` works regardless of upstream convention.

CoolReader's bundled patches mix several header styles:
  --- CMakeLists.txt.orig       (no slashes, needs -p0)
  --- libpng-1.6.37-orig/foo    (one slash, different stem each)
  --- a/foo                     (already fine)

Rewrites every `---`/`+++` header to `--- a/foo` / `+++ b/foo` and strips
trailing `.orig`. Timestamps are preserved.
"""
import sys
from pathlib import Path


def fix_header(line: str, prefix: str) -> str:
    # line starts with "--- " or "+++ "
    tag, rest = line[:4], line[4:]
    # split filename from optional trailing whitespace + timestamp
    head, sep, tail = rest.partition("\t")
    fname = head.strip()
    if fname == "/dev/null":
        return line
    # Strip the single leading directory component ("libpng-orig/CMakeLists.txt"
    # -> "CMakeLists.txt"). This assumes CoolReader's bundled patches always use
    # a single top-level prefix dir; multi-component paths would be truncated.
    if "/" in fname:
        fname = fname.split("/", 1)[1]
    # strip trailing .orig on --- side
    if prefix == "a/" and fname.endswith(".orig"):
        fname = fname[: -len(".orig")]
    suffix = (sep + tail) if sep else ""
    if not suffix.endswith("\n"):
        suffix += "\n"
    return f"{tag}{prefix}{fname}{suffix}"


def normalize(path: Path) -> None:
    lines = path.read_text().splitlines(keepends=True)
    out = []
    for line in lines:
        if line.startswith("--- "):
            out.append(fix_header(line, "a/"))
        elif line.startswith("+++ "):
            out.append(fix_header(line, "b/"))
        else:
            out.append(line)
    path.write_text("".join(out))


if __name__ == "__main__":
    for p in sys.argv[1:]:
        normalize(Path(p))
