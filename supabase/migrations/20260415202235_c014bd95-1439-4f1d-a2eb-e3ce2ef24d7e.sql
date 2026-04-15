
-- =============================================
-- VANDITS V2 — Core Schema Migration
-- =============================================

-- 1. ENUMS
-- =============================================

CREATE TYPE document_source_type AS ENUM ('kml', 'gpx', 'geojson', 'csv', 'manual');
CREATE TYPE document_import_status AS ENUM ('parsing', 'reviewing', 'confirmed', 'partial', 'failed');
CREATE TYPE map_context_type AS ENUM ('personal', 'document', 'social');
CREATE TYPE waypoint_resolution_status AS ENUM ('pending', 'resolved', 'conflict', 'dismissed');
CREATE TYPE waypoint_resolution_method AS ENUM ('auto', 'ai', 'manual');
CREATE TYPE visit_status_type AS ENUM ('not_visited', 'want_to_go', 'visited');
CREATE TYPE user_place_origin AS ENUM ('import', 'manual', 'adopted');
CREATE TYPE collection_item_type AS ENUM ('place', 'waypoint', 'route');

-- 2. PLACES (canonical, neutral)
-- =============================================

CREATE TABLE public.places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  altitude double precision,
  enriched_data jsonb,
  place_type text,
  classification jsonb,
  continent text,
  country text,
  region text,
  zone text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_places_coords ON public.places (latitude, longitude);
CREATE INDEX idx_places_country ON public.places (country);
CREATE INDEX idx_places_created_by ON public.places (created_by);

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view places"
  ON public.places FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert their own places"
  ON public.places FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own places"
  ON public.places FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own places"
  ON public.places FOR DELETE
  USING (auth.uid() = created_by);

CREATE POLICY "Masters can manage all places"
  ON public.places FOR ALL
  USING (has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER update_places_updated_at
  BEFORE UPDATE ON public.places
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. WAYPOINTS (import process identity)
-- =============================================

CREATE TABLE public.waypoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  place_id uuid REFERENCES public.places(id) ON DELETE SET NULL,
  raw_name text NOT NULL,
  normalized_name text NOT NULL DEFAULT '',
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  resolution_status waypoint_resolution_status NOT NULL DEFAULT 'pending',
  resolution_confidence double precision,
  resolution_method waypoint_resolution_method,
  resolved_by_user_id uuid,
  resolved_at timestamptz,
  source_hash text,
  enrichment_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_waypoints_document ON public.waypoints (document_id);
CREATE INDEX idx_waypoints_place ON public.waypoints (place_id);
CREATE INDEX idx_waypoints_status ON public.waypoints (resolution_status);
CREATE INDEX idx_waypoints_coords ON public.waypoints (latitude, longitude);

ALTER TABLE public.waypoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view waypoints in their documents"
  ON public.waypoints FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = waypoints.document_id
    AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert waypoints in their documents"
  ON public.waypoints FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = waypoints.document_id
    AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can update waypoints in their documents"
  ON public.waypoints FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = waypoints.document_id
    AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete waypoints in their documents"
  ON public.waypoints FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = waypoints.document_id
    AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Masters can manage all waypoints"
  ON public.waypoints FOR ALL
  USING (has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER update_waypoints_updated_at
  BEFORE UPDATE ON public.waypoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. DOCUMENT_TRACKS (linear geometries)
-- =============================================

CREATE TABLE public.document_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  coordinates jsonb NOT NULL DEFAULT '[]'::jsonb,
  color text,
  date timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_tracks_document ON public.document_tracks (document_id);

ALTER TABLE public.document_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tracks in their documents"
  ON public.document_tracks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = document_tracks.document_id
    AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert tracks in their documents"
  ON public.document_tracks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = document_tracks.document_id
    AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can update tracks in their documents"
  ON public.document_tracks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = document_tracks.document_id
    AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete tracks in their documents"
  ON public.document_tracks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = document_tracks.document_id
    AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Masters can manage all document tracks"
  ON public.document_tracks FOR ALL
  USING (has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER update_document_tracks_updated_at
  BEFORE UPDATE ON public.document_tracks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. USER_PLACES (orthogonal status)
-- =============================================

CREATE TABLE public.user_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  visit_status visit_status_type NOT NULL DEFAULT 'not_visited',
  is_saved boolean NOT NULL DEFAULT false,
  is_favorite boolean NOT NULL DEFAULT false,
  rating integer CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  visibility text NOT NULL DEFAULT 'followers',
  is_archived boolean NOT NULL DEFAULT false,
  origin user_place_origin NOT NULL DEFAULT 'manual',
  saved_from_user_id uuid,
  source_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  visited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, place_id)
);

CREATE INDEX idx_user_places_user ON public.user_places (user_id);
CREATE INDEX idx_user_places_place ON public.user_places (place_id);
CREATE INDEX idx_user_places_visit ON public.user_places (user_id, visit_status);
CREATE INDEX idx_user_places_favorite ON public.user_places (user_id) WHERE is_favorite = true;

ALTER TABLE public.user_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own user_places"
  ON public.user_places FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own user_places"
  ON public.user_places FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own user_places"
  ON public.user_places FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own user_places"
  ON public.user_places FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Masters can manage all user_places"
  ON public.user_places FOR ALL
  USING (has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER update_user_places_updated_at
  BEFORE UPDATE ON public.user_places
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. COLLECTIONS
-- =============================================

CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  icon text DEFAULT 'folder',
  color text DEFAULT '#6b7280',
  visibility text NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_collections_user ON public.collections (user_id);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own collections"
  ON public.collections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view public collections"
  ON public.collections FOR SELECT
  USING (auth.uid() IS NOT NULL AND visibility = 'public');

CREATE POLICY "Users can insert their own collections"
  ON public.collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collections"
  ON public.collections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own collections"
  ON public.collections FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Masters can manage all collections"
  ON public.collections FOR ALL
  USING (has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER update_collections_updated_at
  BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. COLLECTION_ITEMS (polymorphic-ready)
-- =============================================

CREATE TABLE public.collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  item_type collection_item_type NOT NULL,
  item_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(collection_id, item_type, item_id)
);

CREATE INDEX idx_collection_items_collection ON public.collection_items (collection_id);
CREATE INDEX idx_collection_items_reverse ON public.collection_items (item_type, item_id);

ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items in their collections"
  ON public.collection_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.collections
    WHERE collections.id = collection_items.collection_id
    AND collections.user_id = auth.uid()
  ));

CREATE POLICY "Users can view items in public collections"
  ON public.collection_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.collections
    WHERE collections.id = collection_items.collection_id
    AND collections.visibility = 'public'
    AND auth.uid() IS NOT NULL
  ));

CREATE POLICY "Users can insert items in their collections"
  ON public.collection_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.collections
    WHERE collections.id = collection_items.collection_id
    AND collections.user_id = auth.uid()
  ));

CREATE POLICY "Users can update items in their collections"
  ON public.collection_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.collections
    WHERE collections.id = collection_items.collection_id
    AND collections.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete items in their collections"
  ON public.collection_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.collections
    WHERE collections.id = collection_items.collection_id
    AND collections.user_id = auth.uid()
  ));

CREATE POLICY "Masters can manage all collection items"
  ON public.collection_items FOR ALL
  USING (has_role(auth.uid(), 'master'::app_role));

-- 8. USER_MAP_PREFERENCES
-- =============================================

CREATE TABLE public.user_map_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  context map_context_type NOT NULL,
  visible_layers jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  viewport jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, context)
);

ALTER TABLE public.user_map_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own map preferences"
  ON public.user_map_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own map preferences"
  ON public.user_map_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own map preferences"
  ON public.user_map_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own map preferences"
  ON public.user_map_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- 9. PLACE_MERGE_HISTORY (canonicalization audit)
-- =============================================

CREATE TABLE public.place_merge_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_place_id uuid NOT NULL,
  target_place_id uuid NOT NULL,
  merged_at timestamptz NOT NULL DEFAULT now(),
  merged_by uuid,
  reason text
);

CREATE INDEX idx_merge_source ON public.place_merge_history (source_place_id);
CREATE INDEX idx_merge_target ON public.place_merge_history (target_place_id);

ALTER TABLE public.place_merge_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view merge history"
  ON public.place_merge_history FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Masters can manage merge history"
  ON public.place_merge_history FOR ALL
  USING (has_role(auth.uid(), 'master'::app_role));

-- 10. EXTEND DOCUMENTS with audit fields
-- =============================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source_type document_source_type,
  ADD COLUMN IF NOT EXISTS import_status document_import_status DEFAULT 'reviewing',
  ADD COLUMN IF NOT EXISTS total_waypoints integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conflict_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 11. FEATURE FLAGS seed
-- =============================================

INSERT INTO public.app_settings (key, value, description)
VALUES
  ('v2_data_read_places', '"false"'::jsonb, 'V2: Read from places+waypoints instead of locations'),
  ('v2_data_read_user_places', '"false"'::jsonb, 'V2: Read status/favorites from user_places'),
  ('v2_data_write_imports', '"false"'::jsonb, 'V2: Imports write to waypoints+documents audit'),
  ('v2_data_write_user_places', '"false"'::jsonb, 'V2: Favorites/visited write to user_places'),
  ('v2_map_features', '"false"'::jsonb, 'V2: Map consumes MapFeature[] view model'),
  ('v2_collections', '"false"'::jsonb, 'V2: My Places section with collections UI')
ON CONFLICT DO NOTHING;
