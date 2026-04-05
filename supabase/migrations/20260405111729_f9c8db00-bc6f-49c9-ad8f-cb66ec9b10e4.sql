
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS outbound_color text DEFAULT '#2563eb',
  ADD COLUMN IF NOT EXISTS is_round_trip boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS avoid_same_return boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepted_modes text[] DEFAULT '{}';
