# Manual QC checklist

This checklist is for human verification before publishing SuwolView 0.2.10.
Do not treat it as an automated test script.

## Launch and package structure

- [ ] Windows x64 ZIP launches and opens supported image files
- [ ] Windows x64 installer launches and registers supported file associations
- [ ] Linux x64 AppImage launches and opens supported image files
- [ ] macOS arm64 signed app launches from the DMG and ZIP
- [ ] Packaged Windows, Linux, and macOS apps contain `app-update.yml` with the
      `suwol-suite/SuwolView` GitHub provider
- [ ] `latest.yml`, `latest-linux.yml`, and `latest-mac.yml` are present in the
      matching release

## Update checking

- [ ] Preferences shows current version and always shows a terminal result
- [ ] Release lookup ends within 15 seconds when GitHub is offline or hanging
- [ ] Native updater check ends within 20 seconds when no updater event arrives
- [ ] The renderer IPC path ends within 25 seconds and can be retried
- [ ] Repeated clicks share one in-flight check and do not duplicate listeners
- [ ] Closing Preferences before a response arrives does not update stale UI
- [ ] Up-to-date, update-available, ahead-of-release, no-release, HTTP error,
      malformed response, and timeout states are readable
- [ ] Release title, published date, notes, URL, current-platform asset status,
      and manual download fallback are displayed

## Download and install

- [ ] Download is a separate explicit action and reports progress
- [ ] Download inactivity ends with an error and allows retry
- [ ] `update-downloaded` enables the install button
- [ ] Install/restart occurs only after the user clicks the install button
- [ ] No update state is restored as checking/downloading/installing after restart

## Recovery and existing behavior

- [ ] A 0.2.7 or 0.2.9 install can be upgraded once by manual installation
- [ ] Nested ZIP/CBZ browsing, Unicode filenames, folder view, and navigation work
- [ ] Stale macOS updater registrations are removed without deleting user-copied apps
- [ ] Windows/Linux/macOS release assets, checksums, and GPG signature verify
- [ ] Intel macOS is clearly marked unsupported
