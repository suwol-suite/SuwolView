# LGPL Compliance Notes

This document is a project compliance note, not legal advice. It records how
SuwolView treats LGPL-related dependencies before public distribution.

## Current Image Processing Use

SuwolView uses `sharp` for image conversion, metadata-assisted processing, and
thumbnail generation. The `sharp` package itself reports an Apache-2.0 license.
Platform-specific prebuilt packages associated with the sharp image pipeline may
report additional native library terms.

On the current Windows install, `npm run license:check` reports
`@img/sharp-win32-x64` as:

```text
Apache-2.0 AND LGPL-3.0-or-later
```

This is managed as a review-required item. It is not treated the same way as
GPL, AGPL, or SSPL, which remain blocked for the default app.

## Project Policy

- LGPL and MPL items are review-required, not automatic blockers.
- Review-required items must remain documented in `THIRD_PARTY_LICENSES.md`.
- Release packages must include `LICENSE`, `NOTICE`,
  `THIRD_PARTY_LICENSES.md`, and relevant docs.
- Native or prebuilt libraries must have clear source, license, and
  redistribution terms before release.
- User rights and relinking or modification requirements for any LGPL component
  must be reviewed before publishing downloadable builds.

## Future Native Decoders

Future support for additional native decoders, command-line conversion tools,
archive tools, PDF tools, or camera raw processing must be reviewed before it is
enabled.

If a tool has restrictive, reciprocal, unclear, or platform-specific
redistribution terms, the default app must not bundle it. The preferred path is
an optional plugin or user-installed external tool that is clearly separated
from the default app.
