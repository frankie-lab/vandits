ALTER TABLE public.geocoding_jobs
  ADD COLUMN IF NOT EXISTS location_ids uuid[],
  ADD COLUMN IF NOT EXISTS admin_scope jsonb;