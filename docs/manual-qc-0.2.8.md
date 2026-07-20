# Manual QC checklist

This checklist is for human verification before publishing SuwolView 0.2.8.
Do not treat it as an automated test script.

## Viewer and navigation

- [ ] Open image, folder, ZIP, and CBZ files
- [ ] Drag/drop image, folder, and archive files
- [ ] Mouse wheel moves to the previous/next image
- [ ] PageUp/PageDown moves between images
- [ ] Webtoon mode keeps normal vertical scrolling
- [ ] Display modes and interpolation filters work from Preferences

## Nested archive browsing

- [ ] Root images and nested images are listed
- [ ] Archives without root images open the first nested image
- [ ] Continuous view crosses folder/chapter boundaries
- [ ] Folder view stays within the selected folder
- [ ] Folder tree collapse/expand and keyboard activation work
- [ ] Folder image counts and current-folder highlighting are correct
- [ ] Natural ordering places 1화, 2화, 10화 in that order
- [ ] CP949, UTF-8, Unicode Path Extra Field, duplicate names, and traversal entries behave correctly

## File associations and updates

- [ ] Windows, macOS, and Linux file-association guidance is platform-specific
- [ ] Update check displays current/latest version and release details
- [ ] Safe Mode and development builds do not perform installation
- [ ] After a macOS update, stale updater registration cleanup does not block startup
- [ ] User-managed app copies are not deleted or unregistered automatically

## Stability and release assets

- [ ] Bad images and large metadata do not crash the app
- [ ] Settings reset, cache clear, logs, and Safe Mode work
- [ ] Windows/Linux assets are available after the core Release job
- [ ] macOS Apple Silicon DMG/ZIP are attached after notarization
- [ ] `latest.yml`, `latest-linux.yml`, and `latest-mac.yml` are uploaded
- [ ] Checksums and GPG signature verify
- [ ] Intel macOS is not supported in this release
