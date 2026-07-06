# SuwolView 0.2.0

SuwolView 0.2.0 combines the local 0.1.1 through 0.1.5 stabilization work into
one release.

## Major Changes

- License changed to Apache-2.0 for current and future project code releases.
- Korean and English localization.
- Drag and drop open for local image files, folders, ZIP archives, and CBZ archives.
- Launch argument open for local image files, folders, ZIP archives, and CBZ archives.
- Single-instance open handling.
- Windows installer build.
- Windows file association ready structure.
- Immersive image-first layout.
- Auto-hidden top toolbar.
- Bottom status bar follows the toolbar or side panels.
- Left and right panels hidden by default.
- Resizable side panels.
- Fullscreen button, F11 toggle, and Esc exit.
- Tab toggles the right information panel from the viewer surface.
- Metadata worker OOM protection.
- Safer metadata failure handling.
- Crash, renderer, worker, and main log files under the app user data directory.
- Log rotation at about 2 MB with up to 5 backups per log.
- Settings reset with confirmation, corrupt settings recovery, thumbnail cache
  maintenance, cache statistics, and safe mode launch option.
- Safe mode reduces background metadata/cache work and skips launch-item
  recovery.
- Package smoke tests and release artifact checks.

## Downloads

- Windows installer: `SuwolView-0.2.0-setup.exe`
- Windows portable: `SuwolView-0.2.0-win-x64.zip`
- Linux AppImage: `SuwolView-0.2.0-linux-x64.AppImage`
- Linux portable archive: `SuwolView-0.2.0-linux-x64.tar.gz`
- Linux update metadata: `latest-linux.yml`
- Signed checksums: `checksums.txt` and `checksums.txt.asc`

## Linux

- AppImage build.
- tar.gz portable archive.
- `latest-linux.yml` update metadata.
- `checksums.txt` and detached GPG signature.
- Public release key included.
- AppImage is the intended Linux in-app update path.
- tar.gz remains manual update only.

## Notes

- Windows installer is recommended for normal Windows users.
- ZIP builds are portable.
- Startup update checks are off by default and Safe Mode disables update checks.
- macOS builds are not included yet.
- Logs may include local file paths, but they do not intentionally store image
  file contents or raw metadata.
- Review-required dependency licenses are documented in
  `THIRD_PARTY_LICENSES.md` and `docs/lgpl-compliance.md`.
