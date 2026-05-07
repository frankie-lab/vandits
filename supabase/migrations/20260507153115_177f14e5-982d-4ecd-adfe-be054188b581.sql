
-- Enum
DO $$ BEGIN
  CREATE TYPE public.geocoding_job_status AS ENUM ('running','canceling','canceled','completed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.geocoding_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status public.geocoding_job_status NOT NULL DEFAULT 'running',
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'fill',
  document_id uuid,
  catalog_only boolean NOT NULL DEFAULT false,
  label text,
  page_size int NOT NULL DEFAULT 25,
  "offset" int NOT NULL DEFAULT 0,
  total_in_scope int,
  processed int NOT NULL DEFAULT 0,
  updated int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  remaining int,
  last_tick_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Solo un job activo por usuario
CREATE UNIQUE INDEX IF NOT EXISTS geocoding_jobs_one_active_per_user
  ON public.geocoding_jobs (user_id)
  WHERE status IN ('running','canceling');

-- Índice para el cron
CREATE INDEX IF NOT EXISTS geocoding_jobs_active
  ON public.geocoding_jobs (status, last_tick_at)
  WHERE status IN ('running','canceling');

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_geocoding_jobs_updated_at ON public.geocoding_jobs;
CREATE TRIGGER trg_geocoding_jobs_updated_at
  BEFORE UPDATE ON public.geocoding_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.geocoding_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own geocoding jobs"
  ON public.geocoding_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own geocoding jobs"
  ON public.geocoding_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users cancel own geocoding jobs"
  ON public.geocoding_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Realtime
ALTER TABLE public.geocoding_jobs REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.geocoding_jobs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
