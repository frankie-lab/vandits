-- Create druids table (similar structure to curators + search config)
CREATE TABLE public.druids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text DEFAULT '🌿',
  color text DEFAULT '#22c55e',
  category text,
  avatar_url text,
  
  -- Visibility settings (same as curators)
  visibility_radius_meters integer DEFAULT 50000,
  min_visibility_zoom integer DEFAULT 8,
  
  -- Enrichment settings (same as curators)
  enrichment_tone text DEFAULT 'divulgativo',
  enrichment_expected_nature text DEFAULT 'poi',
  enrichment_min_length integer DEFAULT 1500,
  enrichment_focus_keywords text[],
  enrichment_exclude_keywords text[],
  enrichment_custom_prompt text,
  enrichment_correct_coordinates boolean DEFAULT false,
  enrichment_include_image boolean DEFAULT true,
  enrichment_include_web boolean DEFAULT true,
  enrichment_include_tags boolean DEFAULT true,
  enrichment_include_interest_index boolean DEFAULT true,
  enrichment_search_radius_meters integer DEFAULT 500,
  enrichment_include_contact boolean DEFAULT true,
  enrichment_show_sources boolean DEFAULT true,
  
  -- Search configuration (specific to druids)
  search_center_lat double precision,
  search_center_lng double precision,
  search_radius_km integer DEFAULT 50,
  overpass_query text, -- e.g., "amenity=monastery" or "[historic=ruins]"
  search_keywords text[], -- semantic keywords for filtering
  category_filter text, -- place type filter
  max_results integer DEFAULT 100,
  refresh_interval_hours integer DEFAULT 24,
  last_refresh_at timestamp with time zone,
  auto_enrich boolean DEFAULT true,
  
  -- Metadata
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create druid_locations table (cached points from searches)
CREATE TABLE public.druid_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  druid_id uuid NOT NULL REFERENCES public.druids(id) ON DELETE CASCADE,
  
  -- Location data
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  osm_id text, -- To avoid duplicates
  osm_type text, -- node/way/relation
  
  -- Raw data from OSM
  osm_data jsonb DEFAULT '{}'::jsonb,
  
  -- Enriched data (same structure as locations)
  enriched_data jsonb,
  place_type text,
  
  -- Cache management
  expires_at timestamp with time zone NOT NULL,
  enrichment_status text DEFAULT 'pending', -- pending, enriched, failed
  
  -- Metadata
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Prevent duplicates per druid
  UNIQUE(druid_id, osm_id)
);

-- Enable RLS
ALTER TABLE public.druids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.druid_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for druids (same pattern as curators)
CREATE POLICY "Authenticated users can view active druids"
ON public.druids FOR SELECT
USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "Masters can manage druids"
ON public.druids FOR ALL
USING (has_role(auth.uid(), 'master'));

-- RLS Policies for druid_locations
CREATE POLICY "Authenticated users can view druid locations"
ON public.druid_locations FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.druids 
    WHERE id = druid_locations.druid_id 
    AND is_active = true
  )
);

CREATE POLICY "Masters can manage druid locations"
ON public.druid_locations FOR ALL
USING (has_role(auth.uid(), 'master'));

-- Indexes for performance
CREATE INDEX idx_druid_locations_druid_id ON public.druid_locations(druid_id);
CREATE INDEX idx_druid_locations_expires_at ON public.druid_locations(expires_at);
CREATE INDEX idx_druid_locations_coords ON public.druid_locations(latitude, longitude);
CREATE INDEX idx_druids_active ON public.druids(is_active) WHERE is_active = true;

-- Update trigger for druids
CREATE TRIGGER update_druids_updated_at
BEFORE UPDATE ON public.druids
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update trigger for druid_locations
CREATE TRIGGER update_druid_locations_updated_at
BEFORE UPDATE ON public.druid_locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();