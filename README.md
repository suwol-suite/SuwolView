# SuwolView

SuwolView is a free open-source cross-platform image, comic, webtoon, and
metadata viewer.

SuwolView has no ads, no payment feature, no paid-only feature, and no support
status tracking. Optional support links may be added later with neutral wording,
but support status will never change available features.

SuwolView is an independent project and is not affiliated with any third-party
image viewer product.

## Platform Status

| Platform | Goal | Current status |
| --- | --- | --- |
| Windows | NSIS installer and ZIP package | Verified locally |
| Linux | ZIP package | GitHub Actions target prepared |
| macOS | Future package | Not included in the 0.2.0 release scope |

## Current Features

- Open image files, folders, ZIP archives, and CBZ archives
- Open image files, folders, ZIP archives, and CBZ archives from launch arguments
- Open local image files, folders, ZIP archives, and CBZ archives by drag and drop
- Build an image list from a folder or archive
- Move to previous and next image
- Zoom, drag-pan, fit window, fit width, and original size
- Rotate and flip horizontally
- Thumbnail sidebar and metadata panel, both hidden by default and resizable when shown
- Immersive default viewer with an auto-hidden top toolbar and a status bar
  that appears with the toolbar or side panels
- Dark and light themes
- Korean and English UI language support with system language detection
- Recent open list
- Keyboard shortcuts
- Webtoon vertical scroll mode
- File information and EXIF/basic metadata panel
- Metadata extraction runs with file-size, timeout, and worker memory limits so
  metadata failures do not block image viewing
- Crash/error logs, settings reset, thumbnail cache reset, and safe mode launch
  for recovery

## Support Levels

| Level | Meaning |
| --- | --- |
| Native | Electron can display the format directly through the app image protocol |
| Converted | The decoder layer converts the source to a displayable image |
| Container | The file contains image entries that are loaded lazily |
| Experimental | May be explored later after format, security, and license review |
| External | Requires an optional user-installed tool or plugin, not bundled by default |

## Format Support

| Format | Level | Notes |
| --- | --- | --- |
| jpg, jpeg | Native | Displayed directly |
| png | Native | Displayed directly |
| gif | Native | Displayed directly |
| webp | Native | Displayed directly |
| avif | Native | Displayed directly |
| bmp | Native | Displayed directly |
| ico | Native | Displayed directly |
| svg | Native | Served through the app image protocol |
| tif, tiff | Converted | Converted through the decoder layer |
| zip, cbz | Container | Archive entries are loaded lazily |

Future formats and containers such as HEIC, HEIF, JXL, JP2, EXR, HDR, PDF,
RAR/CBR, 7z/CB7, and camera raw files require separate security and license
review before they are enabled.

## Install And Run

For published builds, download the package for your operating system from the
GitHub Releases page.

Recommended downloads:

- Windows installer: `SuwolView-0.2.0-setup.exe`
- Windows portable ZIP: `SuwolView-0.2.0-win-x64.zip`
- Linux portable ZIP: `SuwolView-0.2.0-linux-x64.zip`

Automatic updates are not enabled yet.

For local development:

```sh
npm install
npm run icons:generate
npm run dev
```

## Development

Run validation:

```sh
npm run icons:check
npm run i18n:check
npm run typecheck
npm run lint
npm run test
npm run build
npm run license:check
npm run package:smoke
```

Run the full local verification set:

```sh
npm run verify
```

Build local packages:

```sh
npm run dist
```

For a Windows ZIP package only:

```sh
npm run dist -- --win zip --publish never
```

For Windows ZIP plus installer:

```sh
npm run dist -- --win zip nsis --publish never
```

## Launch Arguments And File Associations

SuwolView accepts local file-system paths as launch arguments:

```powershell
SuwolView.exe "C:\Images\a.png"
SuwolView.exe "C:\Images"
SuwolView.exe "C:\Comics\book.cbz"
SuwolView.exe "C:\Images\a.png" "C:\Images\b.jpg"
```

Supported launch arguments include image files, folders, ZIP archives, and CBZ
archives. Unsupported or missing paths fail without crashing the app.

On Windows, the portable ZIP build does not automatically register file
associations. The NSIS installer is the recommended Windows package for normal
users. You can also choose SuwolView in Windows Default Apps to configure Open
with behavior. The in-app File associations section can open Windows Default
Apps and copy the current executable path.

The stable Windows association list is: jpg, jpeg, png, gif, webp, avif, bmp,
ico, svg, tif, tiff, zip, and cbz. Experimental formats are not registered by
default.

## Panel Layout

SuwolView starts in an immersive layout: the image canvas uses the full window,
the top toolbar is hidden until the mouse reaches the top edge, and the bottom
status bar appears when the toolbar or either side panel is visible. The View
layout settings can disable top-toolbar auto-hide.

The thumbnail panel and information panel start hidden on first launch. Use the
toolbar buttons or keyboard shortcuts to show or hide them:

- `T`: toggle the left thumbnail panel
- `I`: toggle the right information panel
- `Tab`: toggle the right information panel from the viewer surface
- `F11`: toggle fullscreen
- `Esc`: exit fullscreen when fullscreen is active

When a panel is visible, drag its splitter to resize it. Visibility and panel
widths are saved and restored on the next launch. Use Reset panel sizes in the
File associations/settings section to restore the default panel widths. The
top toolbar auto-hide setting is also saved and restored.

Viewer text and metadata labels are not drag-selectable by default; use the
copy buttons for values that are intended to be copied.

## Recovery And Diagnostics

SuwolView writes best-effort diagnostic logs under the app user data directory:

- `logs/main.log`
- `logs/renderer.log`
- `logs/crash.log`

Logs can include local file paths for troubleshooting, but they do not
intentionally store image file contents or raw metadata blocks.

The settings panel includes maintenance actions:

- Open logs folder
- Reset settings
- Clear thumbnail cache
- Restart in safe mode

Safe mode can also be launched from a terminal:

```powershell
SuwolView.exe --safe-mode
```

Safe mode starts with the default image-first layout, skips launch-item auto
open, keeps side panels hidden, and allows the app to start even when stored
settings need recovery.

## Language Support

SuwolView includes built-in English and Korean UI translations. By default the
app follows the system language when it can resolve the system locale to a
supported language. If the system language is not supported, the UI falls back
to English.

The language can be changed inside the app from the Language control in the top
toolbar. Language changes are saved immediately and applied without restarting
the app.

Translation files live in `src/shared/i18n/locales`.

To add a language:

1. Add `src/shared/i18n/locales/<code>.json`.
2. Register the language code and display name in `src/shared/i18n/languages.ts`.
3. Run `npm run i18n:check`.

## Release Artifacts

Release workflows are configured to produce:

- Windows NSIS installer
- Windows ZIP
- Linux ZIP
- `SHA256SUMS.txt`
- Release notes based on `docs/release-notes-0.2.0.md`

The current locally verified Windows targets are the NSIS installer and ZIP
package. Linux ZIP is built by GitHub Actions.

## License Policy

License: Apache-2.0.

SuwolView project code is distributed under the Apache License, Version 2.0
from the 0.2.0 release line onward. Earlier public releases may have been
distributed under the MIT License and remain under the license terms that
applied to those releases.

New dependencies must pass the checklist in `docs/third-party-policy.md`.
The default app blocks GPL, AGPL, SSPL, commercial-use-restricted licenses,
no-redistribution licenses, unknown-origin binaries, and packages with unclear
license status.

LGPL and MPL components are not treated as automatic blockers, but they are
review-required. Review-required items must be documented in
`THIRD_PARTY_LICENSES.md` and, when relevant, `docs/lgpl-compliance.md`.

Third-party license details are maintained in `THIRD_PARTY_LICENSES.md`.

## Security Summary

- `contextIsolation: true`
- `nodeIntegration: false`
- Renderer code does not access the filesystem directly
- Renderer communicates through the preload API only
- IPC handlers are explicitly registered
- Drag and drop only opens local file and folder paths; dropped URLs are not
  opened automatically
- ZIP and CBZ entry paths are validated against zip-slip patterns
- External URLs are not opened automatically
- The Electron remote module is not used

## Metadata Safety

Metadata reading is best-effort and separate from image display. If metadata
reading fails, times out, exceeds the worker memory limit, or is skipped because
the file is too large, the image viewer remains usable.

Current metadata safety limits:

- Maximum metadata source file size: 80 MB
- Metadata worker timeout: 5000 ms
- Metadata worker old generation limit: 128 MB
- Metadata worker young generation limit: 32 MB
- Metadata text and JSON extraction limits: 2 MB each

Large or unsafe metadata blocks may be skipped or truncated.

More detail is available in `docs/security-policy.md`.

## Contributing

Contributions should keep the project independent, avoid third-party product
branding, and include dependency license review when new packages or binaries
are added. Run `npm run verify` before opening a pull request.
