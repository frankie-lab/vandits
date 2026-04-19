#!/usr/bin/env node
/**
 * VANDITS — Version bump helper
 *
 * Usage:
 *   node scripts/bump-version.mjs <patch|minor|major> "Resumen del cambio (opcional, multilínea)"
 *
 * Updates atomically:
 *   - src/lib/version.ts        → APP_VERSION, APP_BUILD_DATE, prepends changelog entry
 *   - package.json              → version
 *   - README.md                 → header "VANDITS vX.Y.Z" and shields badge
 *   - VANDITS-v2.0-DOCUMENTATION.md → "Última actualización" footer
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const VERSION_FILE = resolve(ROOT, 'src/lib/version.ts');
const PACKAGE_FILE = resolve(ROOT, 'package.json');
const README_FILE = resolve(ROOT, 'README.md');
const DOC_FILE = resolve(ROOT, 'VANDITS-v2.0-DOCUMENTATION.md');

const [, , bumpType = 'patch', ...summaryParts] = process.argv;
const summary = summaryParts.join(' ').trim();

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error(`❌ Bump type must be patch | minor | major (got "${bumpType}")`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────
// 1. Read current version from src/lib/version.ts
// ─────────────────────────────────────────────────────────
const versionSrc = readFileSync(VERSION_FILE, 'utf8');
const currentMatch = versionSrc.match(/export const APP_VERSION = '([^']+)';/);
if (!currentMatch) {
  console.error('❌ Could not find APP_VERSION in src/lib/version.ts');
  process.exit(1);
}
const current = currentMatch[1];
const [maj, min, patch] = current.split('.').map(Number);

let next;
if (bumpType === 'major') next = `${maj + 1}.0.0`;
else if (bumpType === 'minor') next = `${maj}.${min + 1}.0`;
else next = `${maj}.${min}.${patch + 1}`;

// Build date in ISO (YYYY-MM-DD)
const today = new Date().toISOString().slice(0, 10);

// ─────────────────────────────────────────────────────────
// 2. Update src/lib/version.ts
// ─────────────────────────────────────────────────────────
const summaryLines = summary
  ? summary.split(/\r?\n/).map((l) => `- ${l.trim()}`).join('\n')
  : '- (sin resumen)';

const newChangelogEntry = `\n## v${next} (${today})\n${summaryLines}\n`;

let newVersionSrc = versionSrc
  .replace(/\/\/ v[\d.]+ - .+/, `// v${next} - ${today}`)
  .replace(/export const APP_VERSION = '[^']+';/, `export const APP_VERSION = '${next}';`)
  .replace(/export const APP_BUILD_DATE = '[^']+';/, `export const APP_BUILD_DATE = '${today}';`);

// Insert new changelog entry right after the opening backtick of `changelog: \``
newVersionSrc = newVersionSrc.replace(
  /(changelog: `\n)/,
  `$1${newChangelogEntry}`
);

writeFileSync(VERSION_FILE, newVersionSrc, 'utf8');

// ─────────────────────────────────────────────────────────
// 3. Update package.json
// ─────────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(PACKAGE_FILE, 'utf8'));
pkg.version = next;
writeFileSync(PACKAGE_FILE, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// ─────────────────────────────────────────────────────────
// 4. Update README.md
// ─────────────────────────────────────────────────────────
let readme = readFileSync(README_FILE, 'utf8');
readme = readme
  .replace(/^# VANDITS v[\d.]+/m, `# VANDITS v${next}`)
  .replace(/VANDITS-v[\d.]+-blue/g, `VANDITS-v${next}-blue`);
writeFileSync(README_FILE, readme, 'utf8');

// ─────────────────────────────────────────────────────────
// 5. Touch DOCUMENTATION footer (best-effort)
// ─────────────────────────────────────────────────────────
try {
  let doc = readFileSync(DOC_FILE, 'utf8');
  const footerMarker = '<!-- BUMP-FOOTER -->';
  const footer = `${footerMarker}\n_Última actualización: v${next} — ${today}_\n`;
  if (doc.includes(footerMarker)) {
    doc = doc.replace(/<!-- BUMP-FOOTER -->[\s\S]*$/, footer);
  } else {
    doc = doc.trimEnd() + `\n\n---\n\n${footer}`;
  }
  writeFileSync(DOC_FILE, doc, 'utf8');
} catch {
  // Documentation file optional — ignore if missing
}

console.log(`✅ Version bumped: ${current} → ${next} (${bumpType})`);
console.log(`   • src/lib/version.ts`);
console.log(`   • package.json`);
console.log(`   • README.md`);
console.log(`   • VANDITS-v2.0-DOCUMENTATION.md`);
if (summary) console.log(`📝 Changelog: ${summary.split(/\r?\n/)[0]}…`);
