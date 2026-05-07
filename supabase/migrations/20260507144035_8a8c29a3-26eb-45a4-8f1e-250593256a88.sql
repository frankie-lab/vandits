
CREATE OR REPLACE VIEW public.v_geo_coverage
WITH (security_invoker = true)
AS
SELECT
  l.owner_user_id AS user_id,
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE l.country_code IS NOT NULL)::int AS with_country,
  COUNT(*) FILTER (WHERE l.admin1_iso IS NOT NULL)::int AS with_admin1,
  COUNT(*) FILTER (WHERE l.timezone IS NOT NULL)::int AS with_timezone,
  COUNT(*) FILTER (WHERE l.postal_code IS NOT NULL)::int AS with_postal,
  COUNT(*) FILTER (WHERE l.geo_resolved_at IS NOT NULL)::int AS resolved,
  ROUND(AVG(l.geo_confidence) FILTER (WHERE l.geo_confidence IS NOT NULL))::int AS avg_confidence
FROM public.locations l
WHERE l.deleted_at IS NULL
  AND (l.owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'master'::app_role))
GROUP BY l.owner_user_id;

GRANT SELECT ON public.v_geo_coverage TO authenticated;
