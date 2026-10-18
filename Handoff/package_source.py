"""Place the teammate handoff note and a clean Unity source archive beside Windows builds."""

from pathlib import Path
from shutil import copy2
from zipfile import ZIP_DEFLATED, ZipFile
import hashlib


root = Path(__file__).resolve().parents[1]
output = root / "Builds" / "Windows"
output.mkdir(parents=True, exist_ok=True)

note = root / "Handoff" / "队友交接说明.md"
copy2(note, output / note.name)

source_files = [root / "README.md"]
for directory in ("Assets", "Packages", "ProjectSettings", "Handoff"):
    source_files.extend(path for path in (root / directory).rglob("*") if path.is_file())
source_files.extend(path for path in (root / "Validation").iterdir() if path.is_file())

archive = output / "MiniGame_Unity工程_源码包.zip"
with ZipFile(archive, "w", ZIP_DEFLATED, compresslevel=6) as package:
    for path in sorted(source_files):
        package.write(path, path.relative_to(root).as_posix())

with ZipFile(archive) as package:
    bad_member = package.testzip()
    if bad_member:
        raise RuntimeError(f"Archive CRC check failed: {bad_member}")

digest = hashlib.sha256(archive.read_bytes()).hexdigest()
print(f"Created {archive} ({archive.stat().st_size} bytes)")
print(f"SHA-256: {digest}")
