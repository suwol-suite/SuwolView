# SuwolView v0.2.8

SuwolView 0.2.8 improves nested archive browsing and macOS update registration cleanup.

## Highlights

- Recursively browse images inside ZIP/CBZ subfolders.
- View folder-based comics as one continuous reading list.
- Added continuous and folder-specific archive browsing.
- Added an archive folder tree with collapse/expand controls.
- Display image counts for archive folders.
- Show the current image's folder or chapter context.
- Added natural sorting for folder and file names.
- Preserve `1화`, `2화`, `10화` and `page1`, `page2`, `page10` ordering.
- Automatically open the first nested image when an archive has no root images.
- Handle nested folders and common wrapper folders.
- Preserve CP949, UTF-8, and Unicode Path Extra Field filename handling.
- Preserve duplicate-entry identity and ZIP path traversal protection.
- Use central-directory indexing and lazy extraction without unpacking the whole archive.
- Clean up stale macOS updater registrations after an automatic update.
- Re-register the currently installed SuwolView app with Launch Services.
- Never automatically delete user copies in Downloads, external drives, or other user-managed locations.
- Run cleanup once after a version change and continue startup if cleanup fails.

## Supported platforms

- Windows x64
- Linux x64
- macOS Apple Silicon arm64
- Intel macOS is not supported.

## Downloads and release policy

- Windows and Linux assets may be published before macOS assets.
- macOS assets are attached to this Release after Apple notarization and stapling.
- `checksums.txt` and `checksums.txt.asc` are regenerated after macOS assets are attached.
