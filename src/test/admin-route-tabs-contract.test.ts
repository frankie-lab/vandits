/**
 * Contract: cada tab en routeMode='route' tiene capability y Component,
 * y su URL canónica es `/admin/<key>`. Garantiza que el shell no monte
 * una ruta sin gate de capability (PR-BACKOFFICE-UX-CANON-3).
 */
import { describe, it, expect } from 'vitest';
import { ADMIN_TABS, isRouteModeTab, getAdminTabPath } from '@/components/admin/admin-tabs';
import { CAPABILITIES } from '@/domains/identity/capabilities';

describe('admin route tabs contract', () => {
  const routeTabs = ADMIN_TABS.filter(isRouteModeTab);

  it('expose the canonical route panels (PR-3 + PR-5)', () => {
    expect(routeTabs.map(t => t.key).sort()).toEqual(
      ['audit', 'design-system', 'enrichment', 'geography', 'image-recovery', 'internal-tools', 'sources'].sort(),
    );
  });

  it.each(ADMIN_TABS.filter(isRouteModeTab))('tab %s has capability + Component + canonical path', (tab) => {
    expect(tab.capability).toBeTruthy();
    expect(CAPABILITIES).toContain(tab.capability);
    expect(tab.Component).toBeTruthy();
    expect(getAdminTabPath(tab.key)).toBe(`/admin/${tab.key}`);
  });

  it('modal-mode tabs are not exposed as routes', () => {
    const modalKeys = ADMIN_TABS.filter(t => !isRouteModeTab(t)).map(t => t.key);
    expect(modalKeys.sort()).toEqual(['icons', 'markers', 'permissions', 'routes', 'users'].sort());
  });
});
