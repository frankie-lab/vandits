-- Add new enrichment configuration columns to curators table
ALTER TABLE public.curators
ADD COLUMN IF NOT EXISTS enrichment_show_sources BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS enrichment_correct_coordinates BOOLEAN DEFAULT false;

-- Comment columns for documentation
COMMENT ON COLUMN public.curators.enrichment_show_sources IS 'Whether to include reference sources in enrichment output';
COMMENT ON COLUMN public.curators.enrichment_correct_coordinates IS 'Whether AI should suggest coordinate corrections if location is not exact';