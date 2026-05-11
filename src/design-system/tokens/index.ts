/**
 * @vandits/design-system/tokens — public barrel
 *
 * Single source of truth for design tokens. The TS export mirrors the JSON
 * sources in source/*.json (auto-generated via `npm run tokens:build`).
 *
 * Usage:
 *   import { tokens } from '@/design-system/tokens';
 *   tokens.color.light.primary    // "24 75% 50%"
 *   tokens.motion.duration.base   // "200ms"
 *
 * The CSS variables emitted by build/tokens.css are imported globally in
 * src/index.css; this barrel exposes the values for TS consumers (motion
 * presets, runtime calculations, Storybook stories).
 */
export { tokens } from './build/tokens';
export type { Tokens } from './build/tokens';
