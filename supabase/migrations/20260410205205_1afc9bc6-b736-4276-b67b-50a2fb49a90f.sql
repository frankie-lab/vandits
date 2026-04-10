
-- Table to cache pre-computed user statistics for the BI dashboard
CREATE TABLE public.user_stats_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  
  -- Location counts
  total_locations integer NOT NULL DEFAULT 0,
  enriched_locations integer NOT NULL DEFAULT 0,
  pending_locations integer NOT NULL DEFAULT 0,
  
  -- Geographic reach
  countries_count integer NOT NULL DEFAULT 0,
  continents_count integer NOT NULL DEFAULT 0,
  regions_count integer NOT NULL DEFAULT 0,
  
  -- Detailed breakdowns (JSON for flexibility)
  geo_distribution jsonb NOT NULL DEFAULT '{}',
  classification_distribution jsonb NOT NULL DEFAULT '{}',
  
  -- Routes
  total_routes integer NOT NULL DEFAULT 0,
  completed_routes integer NOT NULL DEFAULT 0,
  total_distance_km double precision NOT NULL DEFAULT 0,
  total_duration_hours double precision NOT NULL DEFAULT 0,
  transport_mode_distribution jsonb NOT NULL DEFAULT '{}',
  
  -- Social
  followers_count integer NOT NULL DEFAULT 0,
  following_count integer NOT NULL DEFAULT 0,
  public_locations_count integer NOT NULL DEFAULT 0,
  
  -- Top content
  top_rated_locations jsonb NOT NULL DEFAULT '[]',
  recent_activity jsonb NOT NULL DEFAULT '[]',
  monthly_activity jsonb NOT NULL DEFAULT '[]',
  
  -- Duplicates
  duplicate_candidates integer NOT NULL DEFAULT 0,
  
  -- Metadata
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stats"
  ON public.user_stats_cache FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "System can upsert stats"
  ON public.user_stats_cache FOR ALL
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'master'::app_role));

-- Function to refresh stats for a given user
CREATE OR REPLACE FUNCTION public.refresh_user_stats(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int;
  _enriched int;
  _pending int;
  _countries int;
  _continents int;
  _regions int;
  _geo jsonb;
  _classification jsonb;
  _total_routes int;
  _completed_routes int;
  _distance_km float8;
  _duration_hours float8;
  _transport_modes jsonb;
  _followers int;
  _following int;
  _public_locs int;
  _top_rated jsonb;
  _monthly jsonb;
  _recent jsonb;
BEGIN
  -- Location counts
  SELECT 
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE l.enriched_data IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE l.enriched_data IS NULL)::int
  INTO _total, _enriched, _pending
  FROM locations l
  JOIN documents d ON d.id = l.document_id
  WHERE d.user_id = _user_id AND l.deleted_at IS NULL;

  -- Geographic reach
  SELECT 
    COUNT(DISTINCT l.country) FILTER (WHERE l.country IS NOT NULL)::int,
    COUNT(DISTINCT l.continent) FILTER (WHERE l.continent IS NOT NULL)::int,
    COUNT(DISTINCT l.region) FILTER (WHERE l.region IS NOT NULL)::int
  INTO _countries, _continents, _regions
  FROM locations l
  JOIN documents d ON d.id = l.document_id
  WHERE d.user_id = _user_id AND l.deleted_at IS NULL;

  -- Geo distribution: continent -> country -> count
  SELECT COALESCE(jsonb_object_agg(continent, countries), '{}')
  INTO _geo
  FROM (
    SELECT 
      COALESCE(l.continent, 'Desconocido') as continent,
      jsonb_object_agg(COALESCE(l.country, 'Desconocido'), cnt) as countries
    FROM (
      SELECT 
        l.continent, l.country, COUNT(*)::int as cnt
      FROM locations l
      JOIN documents d ON d.id = l.document_id
      WHERE d.user_id = _user_id AND l.deleted_at IS NULL
      GROUP BY l.continent, l.country
    ) l
    GROUP BY continent
  ) sub;

  -- Classification distribution from enriched_data
  SELECT COALESCE(jsonb_object_agg(cat, cnt), '{}')
  INTO _classification
  FROM (
    SELECT 
      COALESCE(l.enriched_data->'clasificacion'->>'categoria_principal', 'Sin clasificar') as cat,
      COUNT(*)::int as cnt
    FROM locations l
    JOIN documents d ON d.id = l.document_id
    WHERE d.user_id = _user_id AND l.deleted_at IS NULL
    GROUP BY cat
  ) sub;

  -- Routes stats
  SELECT 
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE r.status = 'completed')::int,
    COALESCE(SUM(r.total_distance_meters) / 1000.0, 0),
    COALESCE(SUM(r.total_duration_seconds) / 3600.0, 0)
  INTO _total_routes, _completed_routes, _distance_km, _duration_hours
  FROM routes r
  WHERE r.user_id = _user_id;

  -- Transport mode distribution
  SELECT COALESCE(jsonb_object_agg(mode, cnt), '{}')
  INTO _transport_modes
  FROM (
    SELECT r.transport_mode as mode, COUNT(*)::int as cnt
    FROM routes r
    WHERE r.user_id = _user_id
    GROUP BY r.transport_mode
  ) sub;

  -- Social stats
  SELECT COUNT(*)::int INTO _followers
  FROM follows WHERE following_id = _user_id AND status = 'accepted';

  SELECT COUNT(*)::int INTO _following
  FROM follows WHERE follower_id = _user_id AND status = 'accepted';

  SELECT COUNT(*)::int INTO _public_locs
  FROM locations l
  JOIN documents d ON d.id = l.document_id
  WHERE d.user_id = _user_id AND l.visibility = 'public' AND l.deleted_at IS NULL;

  -- Top rated locations (by interest index, top 10)
  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]')
  INTO _top_rated
  FROM (
    SELECT l.id, l.name, l.country,
      (l.enriched_data->>'indice_interes')::int as rating,
      l.enriched_data->'clasificacion'->>'categoria_principal' as categoria
    FROM locations l
    JOIN documents d ON d.id = l.document_id
    WHERE d.user_id = _user_id 
      AND l.deleted_at IS NULL
      AND l.enriched_data->>'indice_interes' IS NOT NULL
    ORDER BY (l.enriched_data->>'indice_interes')::int DESC, l.name
    LIMIT 10
  ) sub;

  -- Monthly activity (last 12 months)
  SELECT COALESCE(jsonb_agg(row_to_json(sub) ORDER BY sub.month), '[]')
  INTO _monthly
  FROM (
    SELECT 
      TO_CHAR(l.created_at, 'YYYY-MM') as month,
      COUNT(*)::int as locations_added
    FROM locations l
    JOIN documents d ON d.id = l.document_id
    WHERE d.user_id = _user_id 
      AND l.deleted_at IS NULL
      AND l.created_at >= NOW() - INTERVAL '12 months'
    GROUP BY TO_CHAR(l.created_at, 'YYYY-MM')
  ) sub;

  -- Recent activity (last 10 locations)
  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]')
  INTO _recent
  FROM (
    SELECT l.id, l.name, l.country, l.created_at,
      CASE WHEN l.enriched_data IS NOT NULL THEN true ELSE false END as enriched
    FROM locations l
    JOIN documents d ON d.id = l.document_id
    WHERE d.user_id = _user_id AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC
    LIMIT 10
  ) sub;

  -- Upsert the stats
  INSERT INTO user_stats_cache (
    user_id, total_locations, enriched_locations, pending_locations,
    countries_count, continents_count, regions_count,
    geo_distribution, classification_distribution,
    total_routes, completed_routes, total_distance_km, total_duration_hours,
    transport_mode_distribution,
    followers_count, following_count, public_locations_count,
    top_rated_locations, monthly_activity, recent_activity,
    computed_at, updated_at
  ) VALUES (
    _user_id, _total, _enriched, _pending,
    _countries, _continents, _regions,
    _geo, _classification,
    _total_routes, _completed_routes, _distance_km, _duration_hours,
    _transport_modes,
    _followers, _following, _public_locs,
    _top_rated, _monthly, _recent,
    NOW(), NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_locations = EXCLUDED.total_locations,
    enriched_locations = EXCLUDED.enriched_locations,
    pending_locations = EXCLUDED.pending_locations,
    countries_count = EXCLUDED.countries_count,
    continents_count = EXCLUDED.continents_count,
    regions_count = EXCLUDED.regions_count,
    geo_distribution = EXCLUDED.geo_distribution,
    classification_distribution = EXCLUDED.classification_distribution,
    total_routes = EXCLUDED.total_routes,
    completed_routes = EXCLUDED.completed_routes,
    total_distance_km = EXCLUDED.total_distance_km,
    total_duration_hours = EXCLUDED.total_duration_hours,
    transport_mode_distribution = EXCLUDED.transport_mode_distribution,
    followers_count = EXCLUDED.followers_count,
    following_count = EXCLUDED.following_count,
    public_locations_count = EXCLUDED.public_locations_count,
    top_rated_locations = EXCLUDED.top_rated_locations,
    monthly_activity = EXCLUDED.monthly_activity,
    recent_activity = EXCLUDED.recent_activity,
    computed_at = NOW(),
    updated_at = NOW();
END;
$$;
