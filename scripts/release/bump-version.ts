#!/usr/bin/env -S bun run
/**
 * scripts/release/bump-version.ts
 *
 * Atomic, idempotent version bump for VANDITS releases.
 *
 *   bun scripts/release/bump-version.ts <patch|minor|major> "<note>"
 *
 * Updates, in one shot:
 *   1. src/lib/app-version.ts   (APP_VERSION constant — the SoT)
 *   2. package.json             (version field)
 *   3. docs/releases/version-history.md
 *        - appends new row to the 1.x ASCII tree
 *        - moves the "← versión actual (stable / current)" marker
 *        - appends a Release / rollback anchor bullet
 *   4. README.md
 *        - title `# VANDITS vX.Y.Z`
 *        - shield badge `VANDITS-vX.Y.Z-blue`
 *        - prepends a new `### vX.Y.Z (YYYY-MM-DD)` block at the top of
 *          the "## 📝 Changelog (últimas 5 versiones)" section
 *
 * After running, the script prints the git tag command the operator must
 * execute manually (this environment cannot create git tags).
 *
 * Contract: `src/test/version-parity.test.ts` MUST stay green after the
 * bump. Run `npm test` before commit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type BumpKind = 'patch' | 'minor' | 'major';

const repoRoot = resolve(import.meta.dir, '..', '..');
const read = (p: string) => readFileSync(resolve(repoRoot, p), 'utf8');
const write = (p: string, c: string) => writeFileSync(resolve(repoRoot, p), c);

function fail(msg: string): never {
  console.error(`[bump-version] ${msg}`);
  process.exit(1);
}

const [kindArg, ...noteParts] = process.argv.slice(2);
const note = noteParts.join(' ').trim();
if (!kindArg || !['patch', 'minor', 'major'].includes(kindArg)) {
  fail('Usage: bun scripts/release/bump-version.ts <patch|minor|major> "<note>"');
}
if (!note) fail('Note (second argument) is required and non-empty.');
const kind = kindArg as BumpKind;

// --- 1. Read current version from SoT --------------------------------------
const appVerFile = 'src/lib/app-version.ts';
const appVerSrc = read(appVerFile);
const cur = appVerSrc.match(/APP_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/)?.[1];
if (!cur) fail(`Could not parse APP_VERSION from ${appVerFile}.`);

const [maj, min, pat] = cur.split('.').map(Number);
const next =
  kind === 'major' ? `${maj + 1}.0.0` :
  kind === 'minor' ? `${maj}.${min + 1}.0` :
                     `${maj}.${min}.${pat + 1}`;
const today = new Date().toISOString().slice(0, 10);

console.log(`[bump-version] ${cur} → ${next} (${kind})`);

// --- 2. Write APP_VERSION ---------------------------------------------------
write(appVerFile, appVerSrc.replace(
  /APP_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/,
  `APP_VERSION = '${next}'`,
));

// --- 3. package.json --------------------------------------------------------
const pkgPath = 'package.json';
const pkg = JSON.parse(read(pkgPath));
pkg.version = next;
write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// --- 4. version-history.md --------------------------------------------------
const histPath = 'docs/releases/version-history.md';
let hist = read(histPath);
const currentMarker = /\s+←\s+versión actual\s+\(stable\s*\/\s*current\)/g;
hist = hist.replace(currentMarker, '');
hist = hist.replace(
  new RegExp(`^(\\s{2}${cur.replace(/\./g, '\\.')}\\s+.*)$`, 'm'),
  (line) => `${line.trimEnd()}\n  ${next}        ${note}  ← versión actual (stable / current)`,
);
// Append anchor bullet at the end of the anchors list (find last "- `vX.Y.Z`:" line and insert after).
hist = hist.replace(
  /(- `v\d+\.\d+\.\d+`:[^\n]*\n)(?!- `v)/,
  (full, lastLine, _offset, _all) => `${lastLine} - \`v${next}\`: ${note}\n`,
);
write(histPath, hist);

// --- 5. README.md -----------------------------------------------------------
const readmePath = 'README.md';
let readme = read(readmePath);
readme = readme.replace(/^#\s+VANDITS\s+v\d+\.\d+\.\d+/m, `# VANDITS v${next}`);
readme = readme.replace(/VANDITS-v\d+\.\d+\.\d+-blue/g, `VANDITS-v${next}-blue`);
const newEntry = `### v${next} (${today})\n- ${note}\n\n`;
readme = readme.replace(
  /(## 📝 Changelog[^\n]*\n[\s\S]*?\n\n)(### v)/,
  `$1${newEntry}$2`,
);
write(readmePath, readme);

// --- 6. Done ----------------------------------------------------------------
console.log(`[bump-version] OK. Files updated:
  - ${appVerFile}
  - ${pkgPath}
  - ${histPath}
  - ${readmePath}

Next steps (operator action — required for rollback anchor):
  npm test                # parity test must pass
  git add -A && git commit -m "bump: v${next} — ${note}"
  git tag v${next} -m "v${next}"
  git push && git push origin v${next}
`);
