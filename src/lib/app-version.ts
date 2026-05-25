// =============================================================
//  VANDITS — Canonical Version Single Source of Truth (SoT)
// =============================================================
//
// THIS FILE IS THE ONE TRUE SOURCE for the user-facing app version.
//
// Everything else MUST derive from or be validated against this:
//   - `package.json` → "version"            (must match APP_VERSION)
//   - README.md      → title + badge + top changelog entry
//   - docs/releases/version-history.md      → top entry
//
// A CI parity test (`src/test/version-parity.test.ts`) fails the build
// if any of the above drifts. Do not edit this constant by hand for a
// release — use `scripts/release/bump-version.ts`.
//
// History note: a duplicate hardcoded changelog used to live in
// `src/lib/version.ts` and drifted to v1.1.1, confusing external
// agents. That field has been removed; the changelog now lives ONLY
// in `docs/releases/version-history.md`.
// =============================================================

export const APP_VERSION = '1.5.14';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
