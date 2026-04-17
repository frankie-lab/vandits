/**
 * Domain boundaries test — guards Frente 1 of the refactor.
 *
 * Ensures application code never imports from the deprecated hook/store
 * shim paths. The shims have been removed; this test pins the contract
 * so they can never come back as a copy-paste accident.
 *
 * Exempt directories: `src/hooks/`, `src/store/`, `src/domains/` (these
 * are internal implementation paths) and `src/test/`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'src');

const EXEMPT_PREFIXES = [
  'hooks/',
  'store/',
  'domains/',
  'test/',
  'integrations/',
];

const FORBIDDEN_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  {
    regex: /from\s+['"]@\/hooks\/use-auth['"]/,
    reason: "use '@/domains/identity'",
  },
  {
    regex: /from\s+['"]@\/hooks\/use-permissions['"]/,
    reason: "use '@/domains/identity'",
  },
  {
    regex: /from\s+['"]@\/hooks\/use-routes['"]/,
    reason: "use '@/domains/routes'",
  },
  {
    regex: /from\s+['"]@\/hooks\/use-route-(calculation|stops)['"]/,
    reason: "use '@/domains/routes'",
  },
  {
    regex: /from\s+['"]@\/hooks\/use-travel-advisor['"]/,
    reason: "use '@/domains/routes'",
  },
  {
    regex: /from\s+['"]@\/hooks\/use-database-sync['"]/,
    reason: "use '@/domains/content'",
  },
  {
    regex: /from\s+['"]@\/hooks\/use-social-stats['"]/,
    reason: "use '@/domains/social'",
  },
  {
    regex: /from\s+['"]@\/store\/locations-store['"]/,
    reason: "use '@/domains/content'",
  },
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield full;
    }
  }
}

function isExempt(rel: string): boolean {
  return EXEMPT_PREFIXES.some((p) => rel.startsWith(p));
}

describe('domain boundaries', () => {
  it('no application file imports from a deprecated hook/store shim', () => {
    const violations: string[] = [];

    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (isExempt(rel)) continue;

      const content = readFileSync(file, 'utf8');
      for (const { regex, reason } of FORBIDDEN_PATTERNS) {
        if (regex.test(content)) {
          violations.push(`${rel}: forbidden import (${reason})`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
