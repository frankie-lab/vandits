ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS auto_enrich boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_visibility text NOT NULL DEFAULT 'followers';