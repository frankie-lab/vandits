-- Add color columns to marker_size_config
ALTER TABLE public.marker_size_config
  ADD COLUMN fill_color text NOT NULL DEFAULT '#6b7280',
  ADD COLUMN fill_color_light text NOT NULL DEFAULT '#9ca3af';

-- Set correct default colors per marker type
UPDATE public.marker_size_config SET fill_color = '#6b7280', fill_color_light = '#9ca3af' WHERE marker_type = 'own_new';
UPDATE public.marker_size_config SET fill_color = '#f97316', fill_color_light = '#fb923c' WHERE marker_type = 'own_empty';
UPDATE public.marker_size_config SET fill_color = '#22c55e', fill_color_light = '#4ade80' WHERE marker_type = 'own_enriched';
UPDATE public.marker_size_config SET fill_color = '#3b82f6', fill_color_light = '#60a5fa' WHERE marker_type = 'followed_new';
UPDATE public.marker_size_config SET fill_color = '#3b82f6', fill_color_light = '#60a5fa' WHERE marker_type = 'followed_enriched';
UPDATE public.marker_size_config SET fill_color = '#a855f7', fill_color_light = '#c084fc' WHERE marker_type = 'druid_new';
UPDATE public.marker_size_config SET fill_color = '#a855f7', fill_color_light = '#c084fc' WHERE marker_type = 'druid_enriched';
UPDATE public.marker_size_config SET fill_color = '#94a3b8', fill_color_light = '#cbd5e1' WHERE marker_type = 'curator_default';
UPDATE public.marker_size_config SET fill_color = '#14b8a6', fill_color_light = '#5eead4' WHERE marker_type = 'curator_enriched';