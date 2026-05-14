-- ============================================================
-- image_recovery_jobs: server-side persistent job for the
-- "Recuperar imágenes faltantes" admin tool. Mirrors the shape
-- of geocoding_jobs so the UI/lane patterns can be reused.
-- ============================================================

-- 1. Status enum
DO $$ BEGIN
  CREATE TYPE public.image_recovery_job_status AS ENUM (
    'running', 'canceling', 'done', 'canceled', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.image_recovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_by uuid,
  status public.image_recovery_job_status NOT NULL DEFAULT 'running',
  -- Operation config
  mode text NOT NULL DEFAULT 'missing'
    CHECK (mode IN ('missing', 'refresh', 'full')),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- {scope:'user'|'ids'|'all', userId?, locationIds?,
  --  continent?, country?, region?, zone?, createdBefore?, createdAfter?}
  dry_run boolean NOT NULL DEFAULT false,
  force boolean NOT NULL DEFAULT false,
  retry_stale_days integer NOT NULL DEFAULT 30,
  -- Pagination / pacing
  cursor text,
  page_size integer NOT NULL DEFAULT 50,
  cooldown_ms integer NOT NULL DEFAULT 0,
  max_total integer,
  -- Counters
  total_in_scope integer,
  scanned integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  remaining integer,
  waves integer NOT NULL DEFAULT 0,
  recent_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  label text,
  last_tick_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS image_recovery_jobs_active
  ON public.image_recovery_jobs (status, last_tick_at NULLS FIRST)
  WHERE status IN ('running', 'canceling');

CREATE UNIQUE INDEX IF NOT EXISTS image_recovery_jobs_one_active_per_user
  ON public.image_recovery_jobs (user_id)
  WHERE status IN ('running', 'canceling');

CREATE INDEX IF NOT EXISTS image_recovery_jobs_user_status
  ON public.image_recovery_jobs (user_id, status);

-- 4. updated_at trigger (reuse existing fn)
DROP TRIGGER IF EXISTS image_recovery_jobs_set_updated_at ON public.image_recovery_jobs;
CREATE TRIGGER image_recovery_jobs_set_updated_at
  BEFORE UPDATE ON public.image_recovery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RLS
ALTER TABLE public.image_recovery_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own image recovery jobs"
  ON public.image_recovery_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own image recovery jobs"
  ON public.image_recovery_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users cancel own image recovery jobs"
  ON public.image_recovery_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all image recovery jobs select"
  ON public.image_recovery_jobs FOR SELECT
  USING (public._is_admin_or_master(auth.uid()));

CREATE POLICY "Admins manage all image recovery jobs insert"
  ON public.image_recovery_jobs FOR INSERT
  WITH CHECK (public._is_admin_or_master(auth.uid()));

CREATE POLICY "Admins manage all image recovery jobs update"
  ON public.image_recovery_jobs FOR UPDATE
  USING (public._is_admin_or_master(auth.uid()))
  WITH CHECK (public._is_admin_or_master(auth.uid()));

-- 6. Realtime
ALTER TABLE public.image_recovery_jobs REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.image_recovery_jobs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. Cancel RPC
CREATE OR REPLACE FUNCTION public.cancel_image_recovery_job(_job_id uuid)
RETURNS TABLE(updated_count integer, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_caller uuid := auth.uid();
  v_status text;
  v_updated integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT user_id, status::text INTO v_owner, v_status
  FROM public.image_recovery_jobs
  WHERE id = _job_id;

  IF v_owner IS NULL THEN
    RETURN QUERY SELECT 0, NULL::text;
    RETURN;
  END IF;

  IF v_owner <> v_caller AND NOT public._is_admin_or_master(v_caller) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_status NOT IN ('running', 'canceling') THEN
    RETURN QUERY SELECT 0, v_status;
    RETURN;
  END IF;

  UPDATE public.image_recovery_jobs
  SET status = 'canceling'
  WHERE id = _job_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN QUERY SELECT v_updated, 'canceling'::text;
END;
$$;