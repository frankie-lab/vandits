/**
 * Version Parity Contract
 * =======================
 *
 * Single Source of Truth (SoT) of the user-facing version is
 * `src/lib/app-version.ts` (`APP_VERSION`). Every other surface that
 * exposes a version must derive from or be validated against it.
 *
 * This test fails the build if ANY of the following drifts:
 *
 *  1. `APP_VERSION` !== `package.json.version`
 *  2. README top changelog entry (`### vX.Y.Z`) !== `APP_VERSION`
 *  3. README title / badge !== `APP_VERSION`
 *  4. `docs/releases/version-history.md` top `1.x` tree row !== `APP_VERSION`
 *  5. `APP_VERSION` is not a valid semver
 *  6. `src/lib/version.ts` reintroduces hardcoded `vX.Y.Z` literals
 *     (anti-regression of the historical `VERSION_INFO.changelog` field
 *     that stranded the file at v1.1.1 and confused external agents).
 *
 * When you bump the version, run:
 *   bun scripts/release/bump-version.ts <patch|minor|major> "<note>"
 *
 * Never edit version literals by hand across multiple files.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_VERSION } from '@/lib/app-version';

const repoRoot = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), 'utf8');

const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

describe('version parity (SoT = src/lib/app-version.ts)', () => {
  it('APP_VERSION is a valid semver', () => {
    expect(APP_VERSION).toMatch(SEMVER_RE);
  });

  it('package.json.version === APP_VERSION', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    expect(pkg.version).toBe(APP_VERSION);
  });

  it('README top changelog entry === APP_VERSION', () => {
    const readme = read('README.md');
    const match = readme.match(/^###\s+v(\d+\.\d+\.\d+(?:-[\w.]+)?)/m);
    expect(match, 'No "### vX.Y.Z" heading found in README').not.toBeNull();
    expect(match![1]).toBe(APP_VERSION);
  });

  it('README title (# VANDITS vX.Y.Z) === APP_VERSION', () => {
    const readme = read('README.md');
    const match = readme.match(/^#\s+VANDITS\s+v(\d+\.\d+\.\d+(?:-[\w.]+)?)/m);
    expect(match, 'README must start with "# VANDITS vX.Y.Z"').not.toBeNull();
    expect(match![1]).toBe(APP_VERSION);
  });

  it('README badge (VANDITS-vX.Y.Z-blue) === APP_VERSION', () => {
    const readme = read('README.md');
    const match = readme.match(/VANDITS-v(\d+\.\d+\.\d+(?:-[\w.]+)?)-blue/);
    expect(match, 'README must contain the VANDITS-vX.Y.Z-blue shield').not.toBeNull();
    expect(match![1]).toBe(APP_VERSION);
  });

  it('docs/releases/version-history.md top 1.x tree row === APP_VERSION', () => {
    const hist = read('docs/releases/version-history.md');
    // Isolate the "1.x" subtree inside the ASCII Árbol general so that
    // future placeholders like "2.0.0 Reservado para …" never match.
    const oneXBlock = hist.match(/1\.x[\s\S]*?(?=^2\.x|^```|^---)/m);
    expect(oneXBlock, 'No 1.x subtree found in version-history').not.toBeNull();
    const rows = [...oneXBlock![0].matchAll(/^\s{2}(\d+\.\d+\.\d+)\s+/gm)];
    expect(rows.length, 'No version rows found in 1.x subtree').toBeGreaterThan(0);
    const last = rows[rows.length - 1][1];
    expect(last).toBe(APP_VERSION);
  });


  it('src/lib/version.ts contains no hardcoded vX.Y.Z literal (anti-regression)', () => {
    const src = read('src/lib/version.ts');
    // Strip comments before scanning — comments are allowed to reference
    // historical versions for context. Code/strings must not.
    const stripped = src
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const found = stripped.match(/v\d+\.\d+\.\d+/);
    expect(
      found,
      `src/lib/version.ts reintroduced a hardcoded version literal (${found?.[0]}). ` +
        'The changelog field is forbidden here — the SoT is docs/releases/version-history.md.',
    ).toBeNull();
  });
});
