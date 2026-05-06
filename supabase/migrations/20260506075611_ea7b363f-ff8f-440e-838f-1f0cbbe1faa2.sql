ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS target_collection_id uuid NULL REFERENCES public.collections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS new_collection_name text NULL;