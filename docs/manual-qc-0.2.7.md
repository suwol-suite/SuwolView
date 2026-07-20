# Manual QC checklist

This checklist is for human verification before publishing SuwolView 0.2.7.
Do not treat it as an automated test script.

## Viewer and navigation

- [ ] Open image, folder, ZIP, and CBZ files
- [ ] Drag/drop image, folder, and archive files
- [ ] Mouse wheel moves to the previous/next image
- [ ] Ctrl/Cmd+wheel zooms without changing images
- [ ] Trackpad momentum does not skip multiple images
- [ ] PageUp/PageDown moves between images
- [ ] PageUp/PageDown does not intercept input fields or Preferences
- [ ] Webtoon mode keeps normal vertical scrolling
- [ ] Display modes and interpolation filters work from Preferences
- [ ] Rotate 90 degrees and horizontal/vertical flip behave as labeled

## File associations and updates

- [ ] Windows shows Windows default-app guidance and button
- [ ] macOS shows Finder association guidance without Windows text
- [ ] Linux shows desktop settings, `.desktop`, and `xdg-mime` guidance
- [ ] Unsupported system-settings IPC returns a friendly error
- [ ] Update check displays current/latest version and terminal status
- [ ] Update check displays release date, title, notes, and asset availability
- [ ] Update timeout and retry paths clear the checking state
- [ ] Safe Mode and development builds do not perform installation

## Archive filenames and safety

- [ ] UTF-8 archive filenames display correctly
- [ ] CP949 Korean archive filenames display correctly
- [ ] Nested Korean paths display and sort correctly
- [ ] Unicode Path Extra Field names display correctly
- [ ] Duplicate decoded names remain independently selectable
- [ ] Path traversal entries are ignored and never extracted

## Stability and release assets

- [ ] Bad images and large metadata do not crash the app
- [ ] Settings reset, cache clear, logs, and Safe Mode work
- [ ] Windows/Linux assets are available after the core Release job
- [ ] macOS Apple Silicon DMG/ZIP are attached after notarization
- [ ] `latest.yml`, `latest-linux.yml`, and `latest-mac.yml` are uploaded
- [ ] Checksums and GPG signature verify
- [ ] Intel macOS is not supported in this release
