# SuwolView v0.2.11

SuwolView v0.2.11 fixes the update screen remaining indefinitely on “Checking
for updates” and makes every update-check outcome visible and actionable.

## Update check improvements

- Shows the current processing phase, elapsed time, and maximum wait time.
- Separates GitHub Release lookup from the native updater check.
- Applies a 15-second GitHub API timeout, a 20-second native updater timeout,
  and a 25-second safety limit for the complete check flow.
- Ends the checking state on success, error, and timeout paths.
- Prevents duplicate requests, ignores stale responses, and cleans up updater
  listeners and timers.
- Uses the same state handling for startup checks and manual checks.
- Corrects download and install button activation conditions.
- Allows retry after errors and timeouts.
- Keeps the Release page available for manual download when automatic updating
  cannot be confirmed.
- Improves the display of current version, latest version, and last checked
  time.

## Upgrade note

If the update screen remains stuck on an older v0.2.10 installation, install
v0.2.11 once manually from the [SuwolView Releases page](https://github.com/suwol-suite/SuwolView/releases).
Settings and library data are preserved; no app-data reset or deletion is
needed. Starting with v0.2.11, update progress and timeout results are shown
clearly.

## Supported platforms

- Windows x64
- Linux x64
- macOS Apple Silicon arm64
- Intel macOS is not supported

Windows and Linux assets may be published before macOS assets. macOS assets
are added to this same release after signing and notarization. When macOS
assets are added, `checksums.txt` and `checksums.txt.asc` are regenerated.
