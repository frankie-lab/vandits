-- Add min_visibility_zoom column to curators table
-- This replaces the radius-based visibility with zoom-based visibility
ALTER TABLE public.curators 
ADD COLUMN IF NOT EXISTS min_visibility_zoom integer DEFAULT 8;

COMMENT ON COLUMN public.curators.min_visibility_zoom IS 'Minimum map zoom level (1-18) at which curator points become visible. Higher = more zoomed in. NULL = always visible.';