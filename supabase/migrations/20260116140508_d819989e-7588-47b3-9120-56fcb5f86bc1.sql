-- Create table to track batch enrichment jobs
CREATE TABLE public.enrichment_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'error')),
  total_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  current_location_id UUID,
  current_location_name TEXT,
  location_ids UUID[] NOT NULL DEFAULT '{}',
  processed_ids UUID[] NOT NULL DEFAULT '{}',
  error_ids UUID[] NOT NULL DEFAULT '{}',
  error_messages JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;

-- Public access policies (same pattern as other tables)
CREATE POLICY "Public read enrichment_jobs" ON public.enrichment_jobs FOR SELECT USING (true);
CREATE POLICY "Public insert enrichment_jobs" ON public.enrichment_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update enrichment_jobs" ON public.enrichment_jobs FOR UPDATE USING (true);
CREATE POLICY "Public delete enrichment_jobs" ON public.enrichment_jobs FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_enrichment_jobs_updated_at
BEFORE UPDATE ON public.enrichment_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();