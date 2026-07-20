# SuwolView v0.2.7

SuwolView 0.2.7 is a stability and usability release for image, comic, and archive viewing.

## Highlights

- Simplified the top toolbar.
- Replaced File, Folder, and Recent actions with icon controls.
- Positioned the zoom percentage between the zoom-out and zoom-in buttons.
- Moved display mode and interpolation filter controls into Preferences.
- Clarified the behavior and meaning of 90-degree rotation and flip controls.
- Fixed Windows-only file association content appearing on macOS.
- Added separate file association guidance for Windows, macOS, and Linux.
- Implemented real checks for the latest stable GitHub Release.
- Displayed current version, latest version, publication date, and release content.
- Added SemVer comparison, a 15-second timeout, and stale-request protection.
- Detects whether automatic update packages exist for the current platform.
- Added CP949 Korean filename support inside ZIP/CBZ archives.
- Added UTF-8, Unicode Path Extra Field, CP949, and CP437 filename handling.
- Blocks ZIP path traversal entries.
- Added previous/next image navigation with the mouse wheel.
- Added PageUp/PageDown image navigation.
- Added Ctrl/Cmd+wheel zooming.
- Added trackpad momentum cooldown to prevent repeated page advances.
- Fixed organization-secret connections and signing workflow reliability.
- Expanded stability and regression test coverage.

## Supported platforms

- Windows x64
- Linux x64
- macOS Apple Silicon arm64
- Intel macOS is not supported.

## Downloads and release policy

- Windows/Linux assets may appear before macOS assets.
- macOS assets are attached to the same Release after notarization and stapling complete.
- `checksums.txt` and `checksums.txt.asc` are regenerated after macOS assets are attached.

## Assets

- Windows installer: `SuwolView-0.2.7-setup.exe`
- Windows portable: `SuwolView-0.2.7-win-x64.zip`
- Linux AppImage: `SuwolView-0.2.7-linux-x64.AppImage`
- Linux portable: `SuwolView-0.2.7-linux-x64.tar.gz`
- macOS Apple Silicon DMG: `SuwolView-0.2.7-mac-arm64.dmg`
- macOS Apple Silicon ZIP: `SuwolView-0.2.7-mac-arm64.zip`
- `latest.yml`, `latest-linux.yml`, and `latest-mac.yml`
- `checksums.txt`, `checksums.txt.asc`, and `suwol-release-public-key.asc`
