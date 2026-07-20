# SuwolView v0.2.10

This release fixes update checks that could remain permanently on “Checking for
updates” in older 0.2.7 and 0.2.9 builds.

## Update flow fixes

- GitHub latest Release lookup now uses the Main Process `/releases/latest`
  endpoint with a 15-second timeout, response-size protection, stable-release
  filtering, structured HTTP/network errors, and SemVer comparison.
- Release information and the native `electron-updater` check are separate
  stages. Release title, date, notes, URL, package availability, and manual
  download fallback remain visible even when the native check times out.
- Native checks register listeners before calling the updater, allow only one
  in-flight request, finish on updater events or Promise completion, and clean
  up listeners/timers on success, failure, and timeout. Late rejections are
  consumed safely.
- Downloads no longer perform a second update check. Progress and inactivity
  timeout states are reported, and installation remains an explicit user
  action.
- Update state is not persisted as `checking`, `downloading`, or `installing`;
  restarting the app begins from an idle update state.

## Platform notes

Automatic package availability is checked against `latest.yml` plus a Windows
installer, `latest-mac.yml` plus the signed arm64 ZIP, or `latest-linux.yml`
plus an AppImage. A DMG alone is not treated as a macOS automatic-update
package.

The supported release targets are Windows x64, Linux x64, and macOS arm64.
Intel macOS remains unsupported.

## One-time manual installation

Users upgrading from 0.2.7 or 0.2.9 should install 0.2.10 once manually from
the [SuwolView Releases page](https://github.com/suwol-suite/SuwolView/releases).
The fixed updater flow is used for subsequent checks. No private paths,
secrets, stack traces, or complete release bodies are written to update logs.
