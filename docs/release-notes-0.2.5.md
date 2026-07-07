# SuwolView 0.2.5

Patch release for release workflow stability and macOS attach handling.

## Highlights

- Windows and Linux release assets are published first.
- macOS Apple Silicon assets are built, signed, notarized, stapled, and attached to the same Release after core publishing.
- macOS notarization timeout can be extended in release workflows through `NOTARY_TIMEOUT_MINUTES`.
- Manual macOS attach workflow is available for delayed notarization recovery.
- `checksums.txt` and `checksums.txt.asc` are regenerated after macOS assets are attached.
- macOS build remains Apple Silicon only.
- Project code is licensed under the Apache License 2.0.

## Downloads

- Windows installer: `SuwolView-0.2.5-setup.exe`
- Windows portable: `SuwolView-0.2.5-win-x64.zip`
- macOS Apple Silicon DMG: `SuwolView-0.2.5-mac-arm64.dmg`
- macOS Apple Silicon ZIP: `SuwolView-0.2.5-mac-arm64.zip`
- Linux AppImage: `SuwolView-0.2.5-linux-x64.AppImage`
- Linux portable: `SuwolView-0.2.5-linux-x64.tar.gz`

## Notes

- Windows/Linux assets may appear before macOS assets.
- macOS assets are attached to the same Release after notarization and stapling complete.
- Intel Mac is not supported in this release.
- macOS ZIP is the intended macOS in-app update artifact.
- macOS DMG is the normal manual installation artifact.
- Linux AppImage remains the intended Linux in-app update artifact.
- Automatic update checks are off by default.
- Safe Mode disables update checks.
