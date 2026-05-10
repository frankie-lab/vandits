CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_error_ids
  ON public.enrichment_jobs USING GIN (error_ids);