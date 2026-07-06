# Security Policy

SuwolView treats local files, archives, and decoded images as untrusted input.
The current security posture is intentionally conservative.

## Current Controls

- `contextIsolation` is enabled.
- `nodeIntegration` is disabled.
- Renderer code cannot access `fs` directly.
- Renderer code uses the preload API only.
- IPC channels are explicitly registered.
- Renderer code receives language and locale data through explicit preload API
  methods instead of calling Node or Electron APIs directly.
- Drag and drop handling extracts local file paths in preload and validates
  them in the main process before opening.
- Dropped `http://`, `https://`, and `file://` URL strings are not opened
  automatically.
- Launch arguments are filtered in the main process and only local file-system
  paths are passed to the open-path classifier.
- Safe mode (`--safe-mode`) skips launch argument auto-open and uses default
  layout settings so the app can start even when recent open state or stored
  preferences are unsafe.
- Safe mode disables update checks. Development mode also does not perform real
  update checks.
- Second-instance file-open requests are queued and delivered to the existing
  app window instead of creating extra renderer windows.
- ZIP and CBZ entry names are checked for absolute paths and `..` traversal.
- External URLs are not opened automatically. The app only opens whitelisted
  external targets from the main process, currently Windows Default Apps
  settings and the project Releases page.
- Linux in-app update checks target packaged AppImage builds. Linux tar.gz
  builds remain manual update packages.
- File association registration is handled by the Windows installer and OS
  settings. The portable ZIP build does not modify registry associations.
- The Electron remote module is not used.
- Display images are served through the app-controlled `suwol-image` protocol.
- Metadata extraction is isolated in a worker with file-size, timeout, and
  memory limits. Metadata failures are returned as structured errors and do not
  stop image display.
- Crash, main-process, renderer, and worker error logs are written under
  `app.getPath("userData")/logs`. Logs may include local file paths for
  troubleshooting, but they do not intentionally include image file contents or
  raw metadata. Log files are rotated at about 2 MB with up to 5 backups.
- Only the logs folder under the app user data directory can be opened by the
  logs maintenance action.
- Corrupt `settings.json` files are renamed to a
  `settings.corrupt-YYYYMMDD-HHMMSS.json` backup and defaults are recreated.
- Cache maintenance can clear thumbnail files and in-memory metadata failure
  state without deleting source images.
- The Windows NSIS installer is the recommended Windows distribution path for
  file association registration. Portable ZIP builds do not modify registry
  associations.

## Release Checks

- Run `npm run verify` before release.
- Run `npm run package:smoke` after packaging.
- Confirm legal documents are included in packaged resources.
- Re-run license checks on each target operating system.

## TODO

- Add archive size and entry-count limits before enabling larger archive sets.
- Add per-image decode timeout and cache eviction policy.
- Add stricter SVG handling review before expanding SVG-related features.
- Add plugin signing or trust prompts before enabling optional external decoders.
