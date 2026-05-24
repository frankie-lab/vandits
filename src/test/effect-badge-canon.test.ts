/**
 * PR-BACKOFFICE-UX-CLOSURE-1 — Contract test del EffectBadge canon.
 *
 * Garantiza que:
 *   1. Toda capability del SoT mapea a ≥ 1 effect (no hay capabilities mudas).
 *   2. Capabilities `destructive` siempre incluyen el badge 'destructive'.
 *   3. Capabilities `internal` siempre incluyen el badge 'internal'.
 *   4. Capabilities `runtime='none'` mapean a 'read-only'.
 *   5. Capabilities `runtime='deferred'` mapean a 'deferred' + 'batch'.
 */
import { describe, it, expect } from 'vitest';
import { CAPABILITIES } from '@/domains/identity/capabilities';
import { CAPABILITY_META } from '@/components/admin/permissions/capability-metadata';
import { effectsForCapability } from '@/components/admin/EffectBadge';

describe('EffectBadge canon — coverage', () => {
  it('toda capability mapea a ≥ 1 effect', () => {
    for (const cap of CAPABILITIES) {
      const effects = effectsForCapability(cap);
      expect(effects.length, `capability ${cap} sin effects`).toBeGreaterThan(0);
    }
  });

  it('destructive=true implica badge destructive', () => {
    for (const cap of CAPABILITIES) {
      const meta = CAPABILITY_META[cap];
      if (meta?.destructive) {
        expect(effectsForCapability(cap)).toContain('destructive');
      }
    }
  });

  it('internal=true implica badge internal', () => {
    for (const cap of CAPABILITIES) {
      const meta = CAPABILITY_META[cap];
      if (meta?.internal) {
        expect(effectsForCapability(cap)).toContain('internal');
      }
    }
  });

  it('runtime=none implica read-only', () => {
    for (const cap of CAPABILITIES) {
      const meta = CAPABILITY_META[cap];
      if (meta?.runtime === 'none') {
        expect(effectsForCapability(cap)).toContain('read-only');
      }
    }
  });

  it('runtime=deferred implica deferred + batch', () => {
    for (const cap of CAPABILITIES) {
      const meta = CAPABILITY_META[cap];
      if (meta?.runtime === 'deferred') {
        const e = effectsForCapability(cap);
        expect(e).toContain('deferred');
        expect(e).toContain('batch');
      }
    }
  });
});
