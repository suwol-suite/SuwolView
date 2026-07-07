# Manual QC checklist

This checklist is for human verification before publishing SuwolView 0.2.4.
Do not treat it as an automated test script.

## Viewer

- [ ] Open image file
- [ ] Open folder
- [ ] Drag image
- [ ] Drag folder
- [ ] Drag ZIP/CBZ
- [ ] Launch with image path
- [ ] Second-instance open
- [ ] Mouse wheel zoom
- [ ] Pan image
- [ ] Previous/next
- [ ] Fit window
- [ ] Fit width
- [ ] Original size
- [ ] Rotate/flip

## UI

- [ ] Text is not selected by dragging
- [ ] Fullscreen button works
- [ ] F11 toggles fullscreen
- [ ] Esc exits fullscreen
- [ ] Tab toggles right info panel
- [ ] T toggles left panel
- [ ] I toggles right panel
- [ ] Top toolbar auto-hide
- [ ] Bottom status bar appears with toolbar or side panels
- [ ] Left/right splitter resize

## Stability

- [ ] Bad image does not crash app
- [ ] Large PNG metadata failure does not crash app
- [ ] Empty folder shows friendly message
- [ ] Unsupported file shows friendly message
- [ ] Settings reset works
- [ ] Cache clear works
- [ ] Logs folder opens
- [ ] Safe mode starts

## Release Assets

- [ ] v0.2.4 release page exists
- [ ] Windows/Linux assets are available immediately after the core release job
- [ ] macOS assets may be pending while Apple notarization is still running
- [ ] Windows setup.exe is uploaded
- [ ] Windows ZIP is uploaded
- [ ] macOS Apple Silicon DMG is uploaded
- [ ] macOS Apple Silicon ZIP is uploaded
- [ ] Linux AppImage is uploaded
- [ ] Linux tar.gz is uploaded
- [ ] latest.yml is uploaded
- [ ] latest-mac.yml is uploaded
- [ ] latest-linux.yml is uploaded
- [ ] checksums.txt is uploaded
- [ ] checksums.txt.asc is uploaded
- [ ] suwol-release-public-key.asc is uploaded
- [ ] After macOS attach, checksums.txt includes macOS files
- [ ] After macOS attach, latest-mac.yml is uploaded
- [ ] checksums verify
- [ ] GPG signature verifies

## macOS Apple Silicon

- [ ] DMG opens
- [ ] App copies to Applications
- [ ] App launches without Gatekeeper block
- [ ] App opens image path
- [ ] App opens folder
- [ ] Drag/drop works
- [ ] Fullscreen works
- [ ] Tab toggles info panel
- [ ] Update check does not crash
- [ ] App is signed
- [ ] App is notarized/stapled

## Unsupported

- [ ] Intel Mac is not supported in this release.

## Linux Manual QC

- [ ] AppImage starts
- [ ] AppImage opens image path
- [ ] AppImage update check does not crash
- [ ] tar.gz extracted app starts
- [ ] tar.gz is manual update only
