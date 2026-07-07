# SuwolView 0.2.4

Patch release for Apple Silicon macOS distribution.

## Highlights

- macOS Apple Silicon arm64 signed and notarized release.
- macOS DMG and ZIP artifacts.
- `latest-mac.yml` update metadata.
- macOS universal build removed to avoid native sharp module merge issues.
- Existing Windows installer/ZIP and Linux AppImage/tar.gz release artifacts are retained.
- Linux AppImage update-ready path is retained.
- `checksums.txt` and detached GPG signature remain part of the release.
- Project code is licensed under the Apache License 2.0.
- Windows and Linux assets can be published before macOS if Apple notarization is still pending.
- macOS assets are attached to the same Release after notarization and stapling complete.
- `checksums.txt` and `checksums.txt.asc` are regenerated after macOS assets are attached.

## Downloads

- Windows installer: `SuwolView-0.2.4-setup.exe`
- Windows portable: `SuwolView-0.2.4-win-x64.zip`
- macOS Apple Silicon DMG: `SuwolView-0.2.4-mac-arm64.dmg`
- macOS Apple Silicon ZIP: `SuwolView-0.2.4-mac-arm64.zip`
- Linux AppImage: `SuwolView-0.2.4-linux-x64.AppImage`
- Linux portable: `SuwolView-0.2.4-linux-x64.tar.gz`

## Notes

- Intel Mac is not supported in this release.
- v0.2.3 release workflow failed before release creation due to macOS universal sharp native package merge conflict.
- v0.2.4 replaces the failed v0.2.3 release attempt.
- macOS ZIP is the intended macOS in-app update artifact.
- macOS DMG is the normal manual installation artifact.
- macOS notarization can take a long time, so Windows/Linux assets may appear before macOS assets.
- Linux AppImage remains the intended Linux in-app update artifact.
- Automatic update checks are off by default.
- Safe Mode disables update checks.
