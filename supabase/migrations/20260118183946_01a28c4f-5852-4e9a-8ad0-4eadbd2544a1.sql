-- Add curator_id column to enrichment_jobs table for curator-specific enrichment
ALTER TABLE public.enrichment_jobs
ADD COLUMN curator_id uuid REFERENCES public.curators(id) ON DELETE SET NULL;