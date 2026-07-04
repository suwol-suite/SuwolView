# Legal Policy

SuwolView is developed as an independent free open-source desktop viewer. The
project must avoid third-party product identity, branding, proprietary assets,
or marketing language that implies affiliation.

## Product Identity

- Use only original SuwolView names, icons, screenshots, interface text, and
  release materials.
- Do not use third-party product names, logos, icons, slogans, screenshots, or
  distinctive layout assets in the app, README, release notes, or website.
- Describe features as general viewer capabilities rather than by comparison to
  another product.
- Keep donation messaging optional and neutral.

## Licensing Defaults

The default application may use permissive dependencies after review, with
preference for MIT, Apache-2.0, BSD, ISC, Zlib, and Unlicense terms. MPL and
LGPL terms are review-required. Dependencies with LGPL terms require explicit
documentation and a redistribution review before public builds are published.

The default application must not include:

- GPL or AGPL packages or binaries
- SSPL packages or binaries
- Commercial-use-restricted licenses
- No-redistribution licenses
- Binaries with unknown source
- Packages with unknown license status

LGPL and MPL dependencies are not automatic blockers, but they must be reported
as review-required by `npm run license:check` and documented before release.

If a restricted tool is the only practical route for a future format, it must be
handled as a user-installed external tool. It must not be bundled, downloaded
automatically, or represented as part of the default application.

## Distribution Rules

- Keep `LICENSE`, `NOTICE`, `THIRD_PARTY_LICENSES.md`, `README.md`, and
  relevant docs in distributed builds.
- Run `npm run license:check` before release.
- Re-check native packages on each target operating system.
- Review `docs/lgpl-compliance.md` when native image libraries are present.
- Document any external binary requirement before enabling a plugin path.
- Generate release checksums for downloadable artifacts.

## Support Policy

Support is optional and unrelated to app behavior.

- No feature locks
- No paid-only features
- No startup prompts requesting payment
- No popup ads
- No support-status tracking
- No telemetry tied to support behavior
