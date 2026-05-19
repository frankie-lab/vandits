-- PR-HYGIENE-4: rename semántico de capabilities (alineación canon ↔ runtime).
--
-- 1) manage_design_system  -> inspect_design_system
--    (el panel es read-only/inspector; no edita tokens persistentes).
-- 2) manage_criteria       -> manage_editorial_criteria
--    (clarifica ownership: reglas editoriales IA / freshness / thresholds).
--
-- ALTER TYPE ... RENAME VALUE preserva las filas de role_permissions
-- (mismo enum interno, sólo cambia el label). Idempotente.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'app_permission'
      AND e.enumlabel = 'manage_design_system'
  ) THEN
    ALTER TYPE public.app_permission
      RENAME VALUE 'manage_design_system' TO 'inspect_design_system';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'app_permission'
      AND e.enumlabel = 'manage_criteria'
  ) THEN
    ALTER TYPE public.app_permission
      RENAME VALUE 'manage_criteria' TO 'manage_editorial_criteria';
  END IF;
END $$;