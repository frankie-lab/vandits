
-- Remove unused columns from routes
ALTER TABLE public.routes DROP COLUMN IF EXISTS is_round_trip;
ALTER TABLE public.routes DROP COLUMN IF EXISTS avoid_same_return;
ALTER TABLE public.routes DROP COLUMN IF EXISTS outbound_color;
ALTER TABLE public.routes DROP COLUMN IF EXISTS accepted_modes;

-- Add transport_mode and road_preference
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS transport_mode text NOT NULL DEFAULT 'driving';
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS road_preference text NOT NULL DEFAULT 'fastest';
