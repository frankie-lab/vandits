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

// PR-HYGIENE-4 — renames semánticos. Los nombres viejos NO pueden volver.
const RENAMED_LEGACY = [
  'manage_design_system', // -> inspect_design_system
  'manage_criteria',      // -> manage_editorial_criteria
] as const;

const RENAMED_CANON = [
  'inspect_design_system',
  'manage_editorial_criteria',
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

describe('PR-HYGIENE-4 — capabilities renombradas (drift semántico corregido)', () => {
  it('los nombres legacy NO existen en el SoT cliente', () => {
    for (const cap of RENAMED_LEGACY) {
      expect(CLIENT_CAPS as readonly string[]).not.toContain(cap);
    }
  });

  it('los nombres legacy NO existen en el espejo Deno', () => {
    for (const cap of RENAMED_LEGACY) {
      expect(DENO_CAPS as readonly string[]).not.toContain(cap);
    }
  });

  it('los nombres legacy NO tienen metadata RBAC', () => {
    for (const cap of RENAMED_LEGACY) {
      expect(Object.keys(CAPABILITY_META)).not.toContain(cap);
    }
  });

  it('los nombres canon SÍ existen en SoT cliente, Deno y metadata', () => {
    for (const cap of RENAMED_CANON) {
      expect(CLIENT_CAPS as readonly string[]).toContain(cap);
      expect(DENO_CAPS as readonly string[]).toContain(cap);
      expect(Object.keys(CAPABILITY_META)).toContain(cap);
    }
  });
});
