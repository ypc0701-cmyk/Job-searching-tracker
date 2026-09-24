#!/usr/bin/env python3
"""Regenerate resume-library.json from the .docx files in resume-templates/.

Always overwrites the same two fixed files (never creates extras):
  resume-templates/resume-library.json   (read by the website)
  extension/resume-library.json          (read by the Chrome extension)

Usage:
  python3 scripts/sync_resumes.py            # sync once
  python3 scripts/sync_resumes.py --watch    # keep running, re-sync when a .docx changes
  python3 scripts/sync_resumes.py --root DIR # use another repo root (for testing)
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import docx


def list_docx(src: Path):
    # Word creates "~$name.docx" lock files while a resume is open; skip those
    return sorted(p for p in src.glob("*.docx") if not p.name.startswith(("~$", ".")))


def tag_of(path: Path) -> str:
    # "Pin-Chu Yin_Business Intelligence.docx" and "Business Intelligence.docx"
    # both map to the resume version name "Business Intelligence"
    return path.stem.rsplit("_", 1)[-1].strip()


def extract_library(src: Path):
    library, source = {}, {}
    # oldest first, so if two files map to the same version the newest wins
    for path in sorted(list_docx(src), key=lambda p: p.stat().st_mtime_ns):
        tag = tag_of(path)
        if tag in source:
            print(f"[{stamp()}] warning: '{source[tag]}' and '{path.name}' are both '{tag}'; using the newer '{path.name}'", flush=True)
        document = docx.Document(str(path))
        library[tag] = "\n".join(p.text for p in document.paragraphs if p.text.strip())
        source[tag] = path.name
    return dict(sorted(library.items()))


def write_if_changed(path: Path, content: str) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)  # atomic: readers never see a half-written file
    return True


def sync(root: Path) -> None:
    src = root / "resume-templates"
    outputs = [src / "resume-library.json", root / "extension" / "resume-library.json"]
    try:
        library = extract_library(src)
    except Exception as exc:  # e.g. a .docx still being saved
        print(f"[{stamp()}] skipped, kept existing JSON: {exc}", flush=True)
        return
    if not library:
        print(f"[{stamp()}] no .docx found in {src}, kept existing JSON", flush=True)
        return
    content = json.dumps(library, ensure_ascii=False, indent=2)
    changed = [str(p.relative_to(root)) for p in outputs if write_if_changed(p, content)]
    if changed:
        print(f"[{stamp()}] updated {', '.join(changed)} ({len(library)} resumes)", flush=True)
    else:
        print(f"[{stamp()}] already up to date ({len(library)} resumes)", flush=True)


def signature(src: Path):
    return tuple((p.name, p.stat().st_mtime_ns, p.stat().st_size) for p in list_docx(src))


def stamp() -> str:
    return time.strftime("%H:%M:%S")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    args = parser.parse_args()
    root = Path(args.root).resolve()

    sync(root)
    if not args.watch:
        return

    src = root / "resume-templates"
    last = signature(src)
    while True:
        time.sleep(2)
        try:
            current = signature(src)
            if current == last:
                continue
            time.sleep(1.5)  # let the save finish before reading
            if signature(src) != current:
                continue  # still changing, check again next round
        except FileNotFoundError:
            continue  # file replaced mid-scan
        sync(root)
        last = current


if __name__ == "__main__":
    sys.exit(main())
