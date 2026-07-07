# SuwolView 0.2.2

Patch release preparing signed macOS distribution.

## Highlights

- macOS signed DMG and ZIP release targets.
- macOS notarization is required for the release workflow and is verified when
  Apple notarization secrets are present.
- `latest-mac.yml` update metadata for macOS ZIP-based in-app updates.
- macOS signed builds are treated as update-ready packaged builds.
- Existing Windows installer/ZIP and Linux AppImage/tar.gz release paths are
  retained.
- `checksums.txt` and detached GPG signature remain part of the release.
- Project code is licensed under the Apache License 2.0.

## Downloads

- Windows installer: `SuwolView-0.2.2-setup.exe`
- Windows portable: `SuwolView-0.2.2-win-x64.zip`
- macOS signed DMG: `SuwolView-0.2.2-mac-universal.dmg`
- macOS update/archive ZIP: `SuwolView-0.2.2-mac-universal.zip`
- Linux AppImage: `SuwolView-0.2.2-linux-x64.AppImage`
- Linux portable: `SuwolView-0.2.2-linux-x64.tar.gz`

## Notes

- macOS ZIP is the intended macOS in-app update artifact.
- macOS DMG is the normal manual installation artifact.
- Linux AppImage remains the intended Linux in-app update artifact.
- Portable archives may require manual updates.
- Automatic update checks are off by default.
- Safe Mode disables update checks.
- No Mac App Store build is included yet.
