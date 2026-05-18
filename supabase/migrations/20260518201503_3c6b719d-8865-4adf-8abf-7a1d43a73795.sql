-- PR-ADMIN-AUDIT-3 Fase A: drop función huérfana is_curator(uuid).
-- Sin callers en RLS/funciones/edge (verificado). Rol 'curator' tiene 0 titulares.
-- Las tablas `curators`/`druids` ya estaban purgadas; esto cierra el residuo.
DROP FUNCTION IF EXISTS public.is_curator(uuid);