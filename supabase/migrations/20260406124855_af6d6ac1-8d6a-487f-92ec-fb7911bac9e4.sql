
-- Add parent route reference and segment position
ALTER TABLE public.routes
  ADD COLUMN parent_route_id uuid REFERENCES public.routes(id) ON DELETE CASCADE DEFAULT NULL,
  ADD COLUMN segment_position integer DEFAULT NULL;

-- Index for fast lookups of child routes
CREATE INDEX idx_routes_parent_id ON public.routes(parent_route_id) WHERE parent_route_id IS NOT NULL;
