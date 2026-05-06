ALTER TABLE public.scrape_jobs
ADD COLUMN IF NOT EXISTS items_lost integer NOT NULL DEFAULT 0;