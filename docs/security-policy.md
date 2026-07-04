# Security Policy

SuwolView treats local files, archives, and decoded images as untrusted input.
The current security posture is intentionally conservative.

## Current Controls

- `contextIsolation` is enabled.
- `nodeIntegration` is disabled.
- Renderer code cannot access `fs` directly.
- Renderer code uses the preload API only.
- IPC channels are explicitly registered.
- ZIP and CBZ entry names are checked for absolute paths and `..` traversal.
- External URLs are not opened automatically.
- The Electron remote module is not used.
- Display images are served through the app-controlled `suwol-image` protocol.

## Release Checks

- Run `npm run verify` before release.
- Run `npm run package:smoke` after packaging.
- Confirm legal documents are included in packaged resources.
- Re-run license checks on each target operating system.

## TODO

- Add archive size and entry-count limits before enabling larger archive sets.
- Add per-image decode timeout and cache eviction policy.
- Add stricter SVG handling review before expanding SVG-related features.
- Add plugin signing or trust prompts before enabling optional external decoders.
