-- Add visibility radius field to curators table
ALTER TABLE public.curators
ADD COLUMN visibility_radius_meters integer DEFAULT 50000;

-- Add comment for documentation
COMMENT ON COLUMN public.curators.visibility_radius_meters IS 'Maximum distance in meters from map center or user location for points to be visible. NULL means always visible.';