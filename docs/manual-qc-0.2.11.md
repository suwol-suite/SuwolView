# Manual QC checklist

This checklist is for human verification before publishing SuwolView 0.2.11.
It is not an automated test script.

## Update screen

- [ ] The initial update state is idle after launch.
- [ ] Clicking Check for updates shows a spinner and the current phase.
- [ ] Elapsed time changes once per second and the maximum 25-second wait is visible.
- [ ] Current version, latest version, and last checked time are displayed.
- [ ] An up-to-date check ends in a terminal result.
- [ ] Blocking the network ends in an error or timeout within 25 seconds.
- [ ] Retry is available after an error or timeout.
- [ ] The Release page fallback button is available when lookup fails.

## Interaction states

- [ ] Check, download, and install buttons are disabled while checking.
- [ ] Download is enabled only when an update, platform package, and native
      updater availability are all confirmed.
- [ ] Install and restart is enabled only after `update-downloaded`, with
      download status `downloaded` and install status `ready`.
- [ ] Closing and reopening Preferences matches the actual update state.
- [ ] Restarting the app does not restore a previous `checking` state.
- [ ] Two consecutive checks do not duplicate listeners or double the elapsed timer.

## Platform and package checks

- [ ] Windows, Linux, and macOS platform asset detection is correct.
- [ ] Packaged apps contain `app-update.yml` pointing to the
      `suwol-suite/SuwolView` GitHub provider.
- [ ] `latest.yml`, `latest-linux.yml`, and `latest-mac.yml` are present in
      their matching release assets.
- [ ] Windows x64 ZIP and installer launch correctly.
- [ ] Linux x64 AppImage launches correctly.
- [ ] macOS arm64 signed DMG and ZIP launch correctly after notarization.
- [ ] Intel macOS is clearly marked unsupported.
