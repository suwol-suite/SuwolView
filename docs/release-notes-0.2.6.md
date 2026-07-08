# SuwolView 0.2.6

UI polish release for toolbar display controls, filter behavior, and pixel-art viewing.

## Highlights

- Display modes are now available from one top toolbar display button.
- Display mode choices include original size, fit window, fit width, fit height, smart two-page modes, and webtoon view.
- Display mode changes are saved through viewer preferences.
- Fit display modes now enable small-image upscaling so fit window, fit width, and fit height visibly resize small images.
- Default display mode is original size.
- Default filter preset is smooth.
- Filter presets remain available from the top toolbar filter button.
- The None filter preset uses nearest/pixelated rendering for crisp pixel art.
- Pixel-art zoom now scales image layout dimensions instead of using transform scale, avoiding Chromium smoothing on enlarged pixel art.
- Left and right panel toggle buttons are grouped next to Preferences.
- Project code is licensed under the Apache License 2.0.

## Downloads

- Windows installer: `SuwolView-0.2.6-setup.exe`
- Windows portable: `SuwolView-0.2.6-win-x64.zip`
- macOS Apple Silicon DMG: `SuwolView-0.2.6-mac-arm64.dmg`
- macOS Apple Silicon ZIP: `SuwolView-0.2.6-mac-arm64.zip`
- Linux AppImage: `SuwolView-0.2.6-linux-x64.AppImage`
- Linux portable: `SuwolView-0.2.6-linux-x64.tar.gz`

## Notes

- Windows/Linux assets may appear before macOS assets.
- macOS assets are attached to the same Release after notarization and stapling complete.
- `checksums.txt` and `checksums.txt.asc` are regenerated after macOS assets are attached.
- Intel Mac is not supported in this release.
- macOS ZIP is the intended macOS in-app update artifact.
- macOS DMG is the normal manual installation artifact.
- Linux AppImage remains the intended Linux in-app update artifact.
- Automatic update checks are off by default.
- Safe Mode disables update checks.
