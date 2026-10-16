"""Package application code for a fresh Hostinger PHP/MySQL installation."""
from pathlib import Path
from datetime import datetime, timezone
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib

root = Path(__file__).resolve().parent
release = root / "release"
release.mkdir(exist_ok=True)
stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
archive = release / f"rahmeen-hostinger-{stamp}.zip"
entries = []
allowed = {".html", ".js", ".css", ".svg", ".webp", ".png", ".jpg", ".jpeg", ".ico", ".woff", ".woff2"}
for path in sorted((root / "dist").rglob("*")):
    if not path.is_file() or path.is_symlink():
        continue
    relative = path.relative_to(root / "dist")
    if "uploads" in relative.parts and relative.as_posix() != "uploads/.htaccess":
        continue
    if any(part.startswith(".") for part in relative.parts) and path.name != ".htaccess":
        continue
    if path.suffix not in allowed and path.name != ".htaccess" and relative.as_posix() != "api/index.php":
        continue
    entries.append((path, "public_html/" + relative.as_posix()))
for relative in ["app/bootstrap.php", "app/seed-products.json", "scripts/create-admin.php", "config.example.php", "HOSTINGER.md"]:
    path = root / relative
    if not path.is_file():
        raise SystemExit(f"Required file missing: {relative}")
    entries.append((path, relative))
required = {"public_html/index.html", "public_html/api/index.php", "public_html/admin/index.html", "public_html/uploads/.htaccess"}
if not required.issubset({name for _, name in entries}):
    raise SystemExit("The public application is incomplete.")
with ZipFile(archive, "x", ZIP_DEFLATED, compresslevel=6) as output:
    for path, name in entries:
        output.write(path, name)
    output.writestr("INSTALL.txt", "Read HOSTINGER.md before upload. Extract one level ABOVE public_html.\nThis package contains application code and sample catalogue only. No accounts, credentials, orders, database or uploaded images are included.\n")
with ZipFile(archive) as check:
    damaged = check.testzip()
    if damaged:
        raise SystemExit(f"Archive verification failed: {damaged}")
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(".sha256").write_text(f"{checksum}  {archive.name}\n", encoding="utf-8")
print(f"Created {archive}")
print(f"Verified {len(entries) + 1} files; SHA-256 {checksum}")
