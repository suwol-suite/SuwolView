# Manual QC checklist

This checklist is for human verification before publishing SuwolView 0.2.9.
Do not treat it as an automated test script.

## Windows and Linux launch

- [ ] Windows x64 ZIP launches and opens supported image files
- [ ] Windows x64 installer launches and registers supported file associations
- [ ] Linux x64 AppImage launches and opens supported image files
- [ ] Platform-specific file association guidance is correct

## Nested archive browsing

- [ ] ZIP/CBZ root images and nested images are listed
- [ ] Archives without root images open the first nested image
- [ ] Nested chapter/season folders can be browsed
- [ ] Continuous view crosses folder boundaries
- [ ] Folder view stays within the selected folder
- [ ] Folder tree collapse/expand works
- [ ] Folder image counts and current-folder highlighting are correct
- [ ] Natural ordering places `1화`, `2화`, `10화` in that order
- [ ] CP949 Korean folder names open correctly
- [ ] UTF-8 and Unicode Path Extra Field names open correctly
- [ ] Duplicate names remain distinct and traversal entries are rejected safely

## Navigation and updates

- [ ] Mouse wheel moves to the previous/next image
- [ ] PageUp/PageDown moves between images
- [ ] Trackpad continuous input is limited without skipping unexpectedly
- [ ] Update check shows the current/latest version and release details
- [ ] A macOS 0.2.7 or 0.2.8 development install can update to 0.2.9
- [ ] Stale macOS updater registrations are removed from Finder “Open With” entries
- [ ] User-copied apps in Downloads or external storage are not deleted

## Release assets

- [ ] Windows and Linux assets are available after the core Release job
- [ ] macOS Apple Silicon DMG/ZIP are attached after notarization
- [ ] `latest.yml`, `latest-linux.yml`, and `latest-mac.yml` are uploaded
- [ ] Checksums and the GPG signature verify
- [ ] Intel macOS is not supported in this release
