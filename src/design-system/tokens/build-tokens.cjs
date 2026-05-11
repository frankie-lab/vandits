/**
 * VANDITS Design System — Token build pipeline
 * =============================================
 * Lee los JSON fuente en src/design-system/tokens/source/, los compone con
 * Style Dictionary y emite 3 artefactos:
 *
 *   build/tokens.css           ← CSS vars (:root + .dark + reduced-motion)
 *   build/tokens.ts            ← constantes TypeScript
 *   build/tailwind.tokens.cjs  ← objeto plano consumible desde tailwind.config.ts
 *
 * Convención: cada hoja del árbol JSON tiene `value` y `_css` (nombre literal
 * de la CSS var). Las hojas bajo `color.dark.*` se emiten en `.dark { }`;
 * las hojas con `_reducedMotion` también se emiten dentro de
 * `@media (prefers-reduced-motion: reduce)`.
 *
 * Filosofía Fase 1: cero cambios visuales. La salida CSS reproduce 1:1 los
 * tokens que hoy viven en src/shared/styles/tokens/*.css y los colores
 * semánticos inline en src/index.css.
 */
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname);
const SOURCE_DIR = path.join(ROOT, 'source');
const BUILD_DIR = path.join(ROOT, 'build');

// ─── 1. Load all source JSONs ──────────────────────────────────────────────
function loadSources() {
  const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.json'));
  const merged = {};
  for (const file of files) {
    const json = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8'));
    Object.assign(merged, json);
  }
  return merged;
}

// ─── 2. Walk tree, collect tokens with metadata ────────────────────────────
function collectTokens(tree, breadcrumbs = []) {
  const tokens = [];
  for (const [key, node] of Object.entries(tree)) {
    if (!node || typeof node !== 'object') continue;
    if (key.startsWith('$')) continue;
    if ('value' in node) {
      // `_css` is optional: tokens without it are emitted in TS only
      // (e.g. zoom thresholds, numeric scales, pane z-indices consumed
      // exclusively from TypeScript rules/adapters).
      tokens.push({
        path: [...breadcrumbs, key],
        cssName: node._css || null,
        value: node.value,
        reducedMotion: node._reducedMotion,
      });
    } else {
      tokens.push(...collectTokens(node, [...breadcrumbs, key]));
    }
  }
  return tokens;
}

// ─── 3. CSS emitter ────────────────────────────────────────────────────────
function emitCss(tokens) {
  const lightVars = [];
  const darkVars = [];
  const reducedMotionVars = [];

  for (const t of tokens) {
    if (!t.cssName) continue;
    const line = `  ${t.cssName}: ${t.value};`;
    const isDark = t.path[0] === 'color' && t.path[1] === 'dark';
    if (isDark) {
      darkVars.push(line);
    } else {
      lightVars.push(line);
    }
    if (t.reducedMotion !== undefined) {
      reducedMotionVars.push(`    ${t.cssName}: ${t.reducedMotion};`);
    }
  }

  return `/*
 * VANDITS Design System — Generated tokens
 * ─────────────────────────────────────────
 *  AUTO-GENERATED. Do not edit by hand.
 *  Source of truth: src/design-system/tokens/source/*.json
 *  Regenerate:      npm run tokens:build
 */

:root {
${lightVars.join('\n')}
}

.dark {
${darkVars.join('\n')}
}

@media (prefers-reduced-motion: reduce) {
  :root {
${reducedMotionVars.join('\n')}
  }
}
`;
}

// ─── 4. TS emitter ─────────────────────────────────────────────────────────
function toCamel(parts) {
  return parts
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
}

function emitTs(tokens) {
  // Build a typed namespace per top-level category. Light/dark colors are
  // split so consumers can `import { tokens } from '@/design-system/tokens'`
  // and read `tokens.color.light.primary` or `tokens.color.dark.primary`.
  const tree = {};
  for (const t of tokens) {
    let cursor = tree;
    for (let i = 0; i < t.path.length - 1; i++) {
      const seg = t.path[i];
      cursor[seg] = cursor[seg] || {};
      cursor = cursor[seg];
    }
    cursor[t.path[t.path.length - 1]] = t.value;
  }

  const header = `/**
 * VANDITS Design System — Generated tokens (TypeScript)
 * ─────────────────────────────────────────────────────
 *  AUTO-GENERATED. Do not edit by hand.
 *  Source of truth: src/design-system/tokens/source/*.json
 *  Regenerate:      npm run tokens:build
 *
 *  Values are strings (CSS-ready). Color values are HSL triplets without
 *  the hsl() wrapper, ready to feed into hsl(var(--name)) consumers.
 */
`;

  const body = `export const tokens = ${JSON.stringify(tree, null, 2)} as const;\n\nexport type Tokens = typeof tokens;\n`;
  return header + body;
}

// ─── 5. Tailwind emitter ───────────────────────────────────────────────────
function emitTailwind(tokens) {
  // For Phase 1 the Tailwind config keeps reading CSS vars by name, so this
  // file just exposes the literal var() references grouped by category.
  // It's primarily a reference / future hook; tailwind.config.ts does not
  // need to import it yet.
  const grouped = {};
  for (const t of tokens) {
    const category = t.path[0];
    grouped[category] = grouped[category] || {};
    grouped[category][t.cssName] = `var(${t.cssName})`;
  }
  return `/**
 * VANDITS Design System — Tailwind token bridge (auto-generated)
 * ──────────────────────────────────────────────────────────────
 *  AUTO-GENERATED. Do not edit by hand.
 *  Regenerate: npm run tokens:build
 */
module.exports = ${JSON.stringify(grouped, null, 2)};
`;
}

// ─── 6. Run ────────────────────────────────────────────────────────────────
function run() {
  if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true });

  const sources = loadSources();
  const tokens = collectTokens(sources);

  fs.writeFileSync(path.join(BUILD_DIR, 'tokens.css'), emitCss(tokens));
  fs.writeFileSync(path.join(BUILD_DIR, 'tokens.ts'), emitTs(tokens));
  fs.writeFileSync(path.join(BUILD_DIR, 'tailwind.tokens.cjs'), emitTailwind(tokens));

  console.log(`[design-system] Built ${tokens.length} tokens → ${path.relative(process.cwd(), BUILD_DIR)}`);
}

run();
