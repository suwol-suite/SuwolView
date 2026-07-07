# SuwolView 0.2.3

Patch release for signed and notarized macOS distribution.

## Highlights

- macOS signed and notarized release build.
- macOS DMG and ZIP artifacts.
- `latest-mac.yml` update metadata.
- Existing Windows installer/ZIP and Linux AppImage/tar.gz release artifacts are retained.
- Linux AppImage update-ready path is retained.
- `checksums.txt` and detached GPG signature remain part of the release.
- Project code is licensed under the Apache License 2.0.

## Downloads

- Windows installer: `SuwolView-0.2.3-setup.exe`
- Windows portable: `SuwolView-0.2.3-win-x64.zip`
- macOS signed DMG: `SuwolView-0.2.3-mac-universal.dmg`
- macOS update/archive ZIP: `SuwolView-0.2.3-mac-universal.zip`
- Linux AppImage: `SuwolView-0.2.3-linux-x64.AppImage`
- Linux portable: `SuwolView-0.2.3-linux-x64.tar.gz`

## Notes

- v0.2.2 release workflow failed before release creation due to a macOS universal sharp native package merge conflict.
- v0.2.3 replaces the failed v0.2.2 release attempt.
- macOS ZIP is the intended macOS in-app update artifact.
- macOS DMG is the normal manual installation artifact.
- Linux AppImage remains the intended Linux in-app update artifact.
- Automatic update checks are off by default.
- Safe Mode disables update checks.
