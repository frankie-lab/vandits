
-- Estados
CREATE TYPE public.scrape_job_status AS ENUM ('queued','running','paused','done','error','cancelled');
CREATE TYPE public.scrape_page_status AS ENUM ('pending','done','error');
CREATE TYPE public.scrape_item_status AS ENUM ('pending','done','skipped','error');

-- Jobs
CREATE TABLE public.scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  seed_url text NOT NULL,
  document_id uuid,
  status public.scrape_job_status NOT NULL DEFAULT 'queued',
  max_items integer,
  rate_per_tick integer NOT NULL DEFAULT 3,
  min_tick_seconds integer NOT NULL DEFAULT 60,
  max_tick_seconds integer NOT NULL DEFAULT 180,
  pause_after_min integer NOT NULL DEFAULT 25,
  pause_after_max integer NOT NULL DEFAULT 75,
  pause_duration_min_minutes integer NOT NULL DEFAULT 5,
  pause_duration_max_minutes integer NOT NULL DEFAULT 20,
  items_until_pause integer NOT NULL DEFAULT 50,
  next_tick_at timestamptz NOT NULL DEFAULT now(),
  paused_until timestamptz,
  pages_seen integer NOT NULL DEFAULT 0,
  items_found integer NOT NULL DEFAULT 0,
  items_imported integer NOT NULL DEFAULT 0,
  items_skipped integer NOT NULL DEFAULT 0,
  last_tick_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scrape_jobs_due ON public.scrape_jobs (status, next_tick_at) WHERE status = 'running';
CREATE INDEX idx_scrape_jobs_user ON public.scrape_jobs (user_id, created_at DESC);

-- Pages
CREATE TABLE public.scrape_job_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.scrape_jobs(id) ON DELETE CASCADE,
  url text NOT NULL,
  page_number integer NOT NULL DEFAULT 1,
  status public.scrape_page_status NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, url)
);
CREATE INDEX idx_scrape_pages_pending ON public.scrape_job_pages (job_id, status) WHERE status = 'pending';

-- Items
CREATE TABLE public.scrape_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.scrape_jobs(id) ON DELETE CASCADE,
  url text NOT NULL,
  status public.scrape_item_status NOT NULL DEFAULT 'pending',
  location_id uuid,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, url)
);
CREATE INDEX idx_scrape_items_pending ON public.scrape_job_items (job_id, status) WHERE status = 'pending';

-- updated_at trigger
CREATE TRIGGER trg_scrape_jobs_updated
BEFORE UPDATE ON public.scrape_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_job_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_job_items ENABLE ROW LEVEL SECURITY;

-- scrape_jobs policies
CREATE POLICY "Users manage their own scrape jobs"
ON public.scrape_jobs FOR ALL
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'master'::app_role))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'master'::app_role));

-- scrape_job_pages policies
CREATE POLICY "Users access pages of their jobs"
ON public.scrape_job_pages FOR ALL
USING (EXISTS (SELECT 1 FROM public.scrape_jobs j WHERE j.id = scrape_job_pages.job_id AND (j.user_id = auth.uid() OR public.has_role(auth.uid(), 'master'::app_role))))
WITH CHECK (EXISTS (SELECT 1 FROM public.scrape_jobs j WHERE j.id = scrape_job_pages.job_id AND (j.user_id = auth.uid() OR public.has_role(auth.uid(), 'master'::app_role))));

-- scrape_job_items policies
CREATE POLICY "Users access items of their jobs"
ON public.scrape_job_items FOR ALL
USING (EXISTS (SELECT 1 FROM public.scrape_jobs j WHERE j.id = scrape_job_items.job_id AND (j.user_id = auth.uid() OR public.has_role(auth.uid(), 'master'::app_role))))
WITH CHECK (EXISTS (SELECT 1 FROM public.scrape_jobs j WHERE j.id = scrape_job_items.job_id AND (j.user_id = auth.uid() OR public.has_role(auth.uid(), 'master'::app_role))));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_jobs;
