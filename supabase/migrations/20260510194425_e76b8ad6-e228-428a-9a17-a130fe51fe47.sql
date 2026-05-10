CREATE INDEX IF NOT EXISTS idx_locations_alive_created
  ON public.locations (created_at)
  WHERE deleted_at IS NULL;