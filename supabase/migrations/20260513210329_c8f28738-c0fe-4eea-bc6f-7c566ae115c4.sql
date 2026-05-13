-- PR-OWNER-IDENTITY-2.5: purga acotada de paletas defectuosas previas.
-- Solo se borran versiones conocidas como defectuosas. Las filas con
-- v2.5 (o cualquier versión futura legítima) se preservan.
DELETE FROM public.user_owner_color_assignments
WHERE palette_version IN (
  'owner-v1',
  'owner-v2-oklch',
  'owner-v2.1-oklch',
  'owner-v2.2-oklch',
  'owner-v2.4-cool-hue-band'
);