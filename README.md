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
| Windows | ZIP package | Verified locally |
| Linux | ZIP package | GitHub Actions target prepared |
| macOS | Future package | Not included in the 0.1.0 release scope |

## Current Features

- Open image files, folders, ZIP archives, and CBZ archives
- Build an image list from a folder or archive
- Move to previous and next image
- Zoom, drag-pan, fit window, fit width, and original size
- Rotate and flip horizontally
- Thumbnail sidebar
- Dark and light themes
- Recent open list
- Keyboard shortcuts
- Webtoon vertical scroll mode
- File information and EXIF/basic metadata panel

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

## Release Artifacts

Release workflows are configured to produce:

- Windows ZIP
- Linux ZIP
- SHA-256 checksum files
- Draft release notes

The current locally verified package target is Windows ZIP. Linux ZIP is built
by GitHub Actions.

## License Policy

SuwolView is distributed under the MIT License.

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
- ZIP and CBZ entry paths are validated against zip-slip patterns
- External URLs are not opened automatically
- The Electron remote module is not used

More detail is available in `docs/security-policy.md`.

## Contributing

Contributions should keep the project independent, avoid third-party product
branding, and include dependency license review when new packages or binaries
are added. Run `npm run verify` before opening a pull request.
