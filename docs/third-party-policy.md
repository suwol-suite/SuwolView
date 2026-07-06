# Third-Party Policy

Every dependency, binary, decoder, test fixture, image, icon, and bundled asset
must have a clear origin and redistribution permission before it enters the
repository or release process.

## Dependency Review Checklist

Before adding a dependency:

1. Confirm the package name, source repository, publisher, and maintenance
   status.
2. Confirm the SPDX license or license file.
3. Run `npm run license:check` after installation.
4. Confirm the dependency does not introduce GPL, AGPL, SSPL, commercial-use
   restrictions, no-redistribution terms, or unclear licensing.
5. Check whether the package downloads or bundles native binaries.
6. If native binaries are present, document their license and redistribution
   terms in `THIRD_PARTY_LICENSES.md`.
7. Prefer pure JavaScript or well-documented native packages with permissive
   licenses.
8. Avoid adding a dependency for small utilities that can be implemented safely
   in the project.
9. Update `THIRD_PARTY_LICENSES.md` for direct dependency changes.
10. Include the review result in the pull request description.
11. For localization packages or translation tooling, run `npm run i18n:check`
    and confirm translation files do not introduce third-party text without a
    license that permits redistribution in this project.

LGPL and MPL dependencies require review but do not automatically fail the
license check. GPL, AGPL, SSPL, unknown licenses, commercial-use restrictions,
and no-redistribution terms fail the check.

## Optional External Tools

Future support for RAR, 7z, PDF, RAW, ImageMagick, LibRaw, or other native
decoders must use one of these paths:

- Built-in only after license and redistribution review succeeds.
- Optional plugin that is not enabled by default.
- User-installed external tool path with clear documentation and no automatic
  bundling.

## Asset Rules

- Use original assets created for SuwolView.
- Use third-party assets only when the license permits redistribution in this
  open-source desktop app.
- Preserve required attribution.
- Do not use assets copied from commercial viewer products.

## Release Review

Before publishing:

- Run `npm run verify`.
- Run packaging on each target OS.
- Re-run license checks after OS-specific optional packages are installed.
- Confirm `LICENSE`, `NOTICE`, and `THIRD_PARTY_LICENSES.md` are included.
- Confirm `README.md` and compliance docs are included.
- Confirm generated release artifacts have SHA-256 checksum files.
- Confirm the project package metadata uses SPDX `Apache-2.0`.
- Confirm human-facing SuwolView project notices say Apache License 2.0.
- Confirm review-required LGPL/MPL items remain documented and that blocked
  licenses remain blocked.
