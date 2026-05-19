/**
 * PR-HYGIENE-2: contract test que prohíbe resurrección de capabilities
 * zombie purgadas del catálogo RBAC.
 *
 * Las siguientes capabilities NO tenían consumidores reales (ni UI, ni edge,
 * ni RLS) y fueron eliminadas del enum `app_permission`, del SoT cliente
 * y del espejo Deno. Cualquier intento de re-añadirlas requiere primero
 * cablearlas a un gate real y eliminar esta lista negra.
 */
import { describe, it, expect } from 'vitest';
import { CAPABILITIES as CLIENT_CAPS } from '@/domains/identity/capabilities';
import { CAPABILITIES as DENO_CAPS } from '../../supabase/functions/_shared/capabilities';
import { CAPABILITY_META } from '@/components/admin/permissions/capability-metadata';

const PURGED_ZOMBIES = [
  'view_all_locations',
  'edit_all_locations',
  'manage_documents',
  'view_analytics',
  'upload_files',
  'add_locations',
] as const;

describe('PR-HYGIENE-2 — capabilities zombie purgadas', () => {
  it('ninguna capability zombie sigue en el SoT cliente', () => {
    for (const cap of PURGED_ZOMBIES) {
      expect(CLIENT_CAPS as readonly string[]).not.toContain(cap);
    }
  });

  it('ninguna capability zombie sigue en el espejo Deno', () => {
    for (const cap of PURGED_ZOMBIES) {
      expect(DENO_CAPS as readonly string[]).not.toContain(cap);
    }
  });

  it('ninguna capability zombie tiene metadata RBAC', () => {
    for (const cap of PURGED_ZOMBIES) {
      expect(Object.keys(CAPABILITY_META)).not.toContain(cap);
    }
  });
});
