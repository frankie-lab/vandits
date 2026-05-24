/**
 * PR-BACKOFFICE-UX-CLOSURE-1 — Contract test del PanelEffectHeader.
 *
 * Cada tab del BackOffice debe tener una capability con effects derivables.
 * Si alguien añade un tab sin metadata, este test cae.
 */
import { describe, it, expect } from 'vitest';
import { ADMIN_TABS } from '@/components/admin/admin-tabs';
import { effectsForCapability } from '@/components/admin/EffectBadge';
import { CAPABILITY_META } from '@/components/admin/permissions/capability-metadata';
import { operationKeyForCapability } from '@/components/admin/PanelEffectHeader';

describe('Admin tabs — PanelEffectHeader coverage', () => {
  it('toda capability de ADMIN_TABS tiene metadata RBAC', () => {
    for (const tab of ADMIN_TABS) {
      expect(CAPABILITY_META[tab.capability], `tab ${tab.key} sin meta`).toBeDefined();
    }
  });

  it('toda capability de ADMIN_TABS produce ≥ 1 effect', () => {
    for (const tab of ADMIN_TABS) {
      expect(effectsForCapability(tab.capability).length, `tab ${tab.key} sin effects`).toBeGreaterThan(0);
    }
  });

  it('operationKeyForCapability usa prefijo cap:', () => {
    expect(operationKeyForCapability('run_image_recovery')).toBe('cap:run_image_recovery');
  });
});
