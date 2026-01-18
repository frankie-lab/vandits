-- Add enrichment preferences columns to curators table
ALTER TABLE public.curators
  ADD COLUMN IF NOT EXISTS enrichment_tone TEXT DEFAULT 'divulgativo',
  ADD COLUMN IF NOT EXISTS enrichment_min_length INTEGER DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS enrichment_custom_prompt TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_include_image BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enrichment_include_web BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enrichment_include_tags BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enrichment_include_interest_index BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enrichment_focus_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS enrichment_exclude_keywords TEXT[];

-- Add comment for documentation
COMMENT ON COLUMN public.curators.enrichment_tone IS 'Tono de descripción: tecnico, divulgativo, poetico, formal, casual';
COMMENT ON COLUMN public.curators.enrichment_min_length IS 'Longitud mínima de descripción en caracteres';
COMMENT ON COLUMN public.curators.enrichment_custom_prompt IS 'Instrucciones adicionales personalizadas para la IA';
COMMENT ON COLUMN public.curators.enrichment_include_image IS 'Incluir búsqueda de imagen de Wikimedia';
COMMENT ON COLUMN public.curators.enrichment_include_web IS 'Incluir URL de referencia web';
COMMENT ON COLUMN public.curators.enrichment_include_tags IS 'Generar etiquetas/hashtags';
COMMENT ON COLUMN public.curators.enrichment_include_interest_index IS 'Calcular índice de interés 1-5';
COMMENT ON COLUMN public.curators.enrichment_focus_keywords IS 'Palabras clave a enfatizar en el contenido';
COMMENT ON COLUMN public.curators.enrichment_exclude_keywords IS 'Palabras clave a evitar en el contenido';