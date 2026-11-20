"""The site kit (website/kit/: the lightbox, modals and their helpers), kept as one master copy here
and synced into the other sites that use it.

    python tools/website/kit.py check              # the files match kit.json (build.py runs this)
    python tools/website/kit.py stamp              # after changing the kit: new hashes in kit.json
    python tools/website/kit.py sync <folder> [<check-script>]
                                                   # copy the kit into another site's folder

Every file starts with the same header, naming the kit's version and where its master lives. A
change to a file means a new version: bump VERSION below, run `stamp` (it rewrites the headers and
kit.json), and sync the sites. A copy carries kit.json and is checked by check-kit.mjs (node, no
dependencies), so an edit made to a copy instead of here fails that site's checks.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / "website" / "kit"
VERSION = "1.0.1"
FILES = ["core.js", "modal.js", "lightbox.js", "kit.css"]
HEADER = re.compile(r"^/\*! SiteKit (\d+\.\d+\.\d+) \| synced from anefzaoui/misterdownloadmanager website/kit/ \| MIT License \*/$")


def digest(path: Path) -> str:
    # Line endings don't count: a checkout with CRLF is the same file.
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def problems(folder: Path) -> list[str]:
    out = []
    manifest = folder / "kit.json"
    if not manifest.is_file():
        return [f"{manifest} is missing"]
    data = json.loads(manifest.read_text("utf-8"))
    for name in FILES:
        f = folder / name
        if not f.is_file():
            out.append(f"{name} is missing")
            continue
        m = HEADER.match(f.read_text("utf-8").splitlines()[0])
        if not m or m.group(1) != data["version"]:
            out.append(f"{name}: its first line isn't the SiteKit {data['version']} header")
        if digest(f) != data["files"].get(name):
            out.append(f"{name} differs from SiteKit {data['version']} (kit.json)")
    return out


def stamp() -> None:
    files = {}
    for name in FILES:
        f = KIT / name
        lines = f.read_text("utf-8").split("\n")
        lines[0] = f"/*! SiteKit {VERSION} | synced from anefzaoui/misterdownloadmanager website/kit/ | MIT License */"
        text = "\n".join(lines)
        text = re.sub(r'K\.version = "[\d.]+";', f'K.version = "{VERSION}";', text)
        f.write_text(text, "utf-8", newline="\n")
        files[name] = digest(f)
    (KIT / "kit.json").write_text(json.dumps({
        "name": "SiteKit", "version": VERSION,
        "master": "https://github.com/anefzaoui/misterdownloadmanager/tree/main/website/kit",
        "files": files,
    }, indent=2) + "\n", "utf-8", newline="\n")
    print(f"SiteKit {VERSION}: kit.json stamped")


def sync(dest: Path, checker: Path | None) -> None:
    bad = problems(KIT)
    if bad:
        sys.exit("The master copy doesn't match kit.json; run `stamp` first:\n  " + "\n  ".join(bad))
    dest.mkdir(parents=True, exist_ok=True)
    for name in FILES + ["kit.json"]:
        shutil.copyfile(KIT / name, dest / name)
    if checker:
        checker.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(KIT / "check-kit.mjs", checker)
    print(f"SiteKit {VERSION} -> {dest}")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "stamp":
        stamp()
    elif cmd == "check":
        bad = problems(KIT)
        if bad:
            sys.exit("website/kit/ doesn't match kit.json (bump VERSION in tools/website/kit.py, then "
                     "`python tools/website/kit.py stamp`):\n  " + "\n  ".join(bad))
        print(f"SiteKit {json.loads((KIT / 'kit.json').read_text('utf-8'))['version']}: ok")
    elif cmd == "sync" and len(sys.argv) > 2:
        sync(Path(sys.argv[2]), Path(sys.argv[3]) if len(sys.argv) > 3 else None)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
