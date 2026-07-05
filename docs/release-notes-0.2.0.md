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
- Crash and error log files under the app user data directory.
- Settings reset, thumbnail cache reset, and safe mode launch option.
- Package smoke tests and release artifact checks.

## Downloads

- Windows installer: `SuwolView-0.2.0-setup.exe`
- Windows portable: `SuwolView-0.2.0-win-x64.zip`
- Linux portable: `SuwolView-0.2.0-linux-x64.zip`

## Notes

- Windows installer is recommended for normal Windows users.
- ZIP builds are portable.
- Automatic updates are not enabled yet.
- macOS builds are not included yet.
- Logs may include local file paths, but they do not intentionally store image
  file contents or raw metadata.
- Review-required dependency licenses are documented in
  `THIRD_PARTY_LICENSES.md` and `docs/lgpl-compliance.md`.
