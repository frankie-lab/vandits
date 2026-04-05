-- Add vehicle dimension columns to transport_modes
ALTER TABLE public.transport_modes
  ADD COLUMN IF NOT EXISTS width_m double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS height_m double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS length_m double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS weight_kg double precision DEFAULT NULL;

-- Add custom dimension overrides to user_transport_modes
ALTER TABLE public.user_transport_modes
  ADD COLUMN IF NOT EXISTS custom_width_m double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_height_m double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_length_m double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_weight_kg double precision DEFAULT NULL;

-- Add route preferences jsonb to routes
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS route_preferences jsonb DEFAULT '{}'::jsonb;