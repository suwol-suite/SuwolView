# Third-Party Licenses

This file tracks direct runtime and build dependencies used by SuwolView.
Run `npm run license:check` after every dependency change and update this file
when a new direct dependency is added or removed.

## Direct Runtime Dependencies

| Dependency | Purpose | License notes |
| --- | --- | --- |
| Electron | Cross-platform desktop runtime | MIT |
| React | Renderer UI | MIT |
| React DOM | Renderer UI mounting | MIT |
| lucide-react | Interface icons | ISC |
| sharp | Image conversion and thumbnail pipeline | Apache-2.0 package; native libvips redistribution must remain documented |
| @img/sharp-win32-x64 | Windows native sharp image pipeline package | Apache-2.0 AND LGPL-3.0-or-later; review-required |
| exifr | EXIF and image metadata parsing | MIT |
| yauzl | ZIP/CBZ archive reading | MIT |
| Settings store | Recent files and preferences | File-based JSON; no database dependency |

## Direct Development Dependencies

| Dependency | Purpose | License notes |
| --- | --- | --- |
| TypeScript | Type checking | Apache-2.0 |
| Vite | Renderer and Electron bundle builds | MIT |
| @vitejs/plugin-react | React support for Vite | MIT |
| ESLint / @eslint/js | Linting | MIT |
| typescript-eslint | TypeScript linting | MIT |
| Vitest | Unit tests | MIT |
| electron-builder | Local packaging | MIT |
| lightningcss | Vite CSS transform dependency | MPL-2.0; review-required notice |
| @types packages | Type declarations | MIT or declaration-package license |

## Native Component Notes

SuwolView uses `sharp` for the initial conversion layer. The installed Windows
package currently reports `Apache-2.0 AND LGPL-3.0-or-later` for
`@img/sharp-win32-x64`. Before publishing downloadable builds, confirm the
installed native package licenses with `npm run license:check` on each target
platform and preserve any required notices.

`lightningcss` and its platform package currently report MPL-2.0. They are build
pipeline dependencies and remain in the review-required category.

See `docs/lgpl-compliance.md` for the project policy covering LGPL-related
native image processing components.

Optional decoders for RAR, 7z, PDF, RAW, or command-line conversion tools must
not be bundled into the default app until their license and redistribution terms
are reviewed and documented.
