# SuwolView v0.2.9

SuwolView v0.2.9 completes the nested archive browsing and macOS update
registration work from the unreleased v0.2.8 line, including a Windows path
compatibility test fix.

## Highlights

- Recursively browse images inside ZIP/CBZ subfolders.
- Support compressed comics organized by chapter or season folders.
- Use one continuous reading view or a folder-specific view.
- Browse an archive folder tree with collapse and expand controls.
- Display image counts for each folder.
- Show the current image's folder or chapter.
- Naturally sort folder and file names, including `1화`, `2화`, `10화` and `page1`, `page2`, `page10`.
- Open the first nested image automatically when an archive has no root image.
- Handle nested folders and common wrapper folders.
- Preserve CP949, UTF-8, and Unicode Path Extra Field filename handling.
- Preserve duplicate-entry identity and ZIP path traversal protection.
- Extract entries lazily without unpacking the whole archive.
- Navigate with the mouse wheel, PageUp, and PageDown, with trackpad input limiting.
- Clean up stale macOS updater registrations after an automatic update.
- Limit cleanup to updater staging registrations and re-register the current installed app with Launch Services.
- Never automatically delete user-managed app copies.
- Improve platform-specific file association guidance and update checks.
- Fix Windows path compatibility coverage for macOS Launch Services calculations.

## Supported platforms

- Windows x64
- Linux x64
- macOS Apple Silicon arm64
- Intel macOS is not supported.

## Downloads and release policy

- Windows and Linux assets may be published first.
- macOS Apple Silicon assets are attached to the same v0.2.9 Release after Apple notarization and stapling.
- `checksums.txt` and `checksums.txt.asc` are regenerated after macOS assets are attached.
