# Manual QC checklist

This checklist is for human verification before publishing SuwolView 0.2.0.
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

## Linux Manual QC

- [ ] AppImage starts
- [ ] AppImage opens an image path
- [ ] AppImage creates logs
- [ ] AppImage update check does not crash
- [ ] tar.gz extracted app starts
- [ ] tar.gz is documented as manual update only
- [ ] checksums.txt verifies
- [ ] checksums.txt.asc verifies with public key
