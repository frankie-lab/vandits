-- Add enrichment_status column to locations
ALTER TABLE public.locations 
ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT NULL;

-- Add index for fast filtering of unresolved locations
CREATE INDEX IF NOT EXISTS idx_locations_enrichment_status 
ON public.locations (enrichment_status) 
WHERE enrichment_status IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.locations.enrichment_status IS 'Enrichment status: null=not attempted, enriched=success, unresolved=no match found, manual=user managed, pending=in progress';