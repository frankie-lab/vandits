/**
 * @vandits/design-system/primitives — Public barrel for atomic UI primitives.
 *
 * Phase 3 scaffold: every primitive lives in its own sub-folder so future
 * additions (stories, variants, tests) have a stable home. Today the
 * implementations are re-exported from `@/components/ui/*` — no behavior
 * change. The canonical import path is the sub-path:
 *
 *   import { Button } from '@/design-system/primitives/button';
 *   import { Card }   from '@/design-system/primitives/card';
 *
 * Avoid importing the root barrel below in product code; it exists for
 * tooling (Storybook discovery, codemods) and tree-shaking remains safe
 * because each sub-folder re-exports a single module.
 *
 * Migration policy (later phases):
 *   1. Move implementation into the sub-folder.
 *   2. Update tests / Storybook stories.
 *   3. Leave a thin re-export at `@/components/ui/*` until grep is clean.
 *   4. Phase 5 ESLint forbids new imports from `@/components/ui/*`.
 */
export * from './button';
export * from './input';
export * from './textarea';
export * from './label';
export * from './card';
export * from './dialog';
export * from './badge';
export * from './separator';
export * from './tooltip';
export * from './popover';
export * from './select';
export * from './switch';
export * from './checkbox';
export * from './tabs';
