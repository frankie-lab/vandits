
ALTER TABLE public.marker_size_config ADD COLUMN hover_size integer DEFAULT NULL;

-- Migrate: take hover_normal as the single hover value
UPDATE public.marker_size_config SET hover_size = hover_normal;

ALTER TABLE public.marker_size_config DROP COLUMN hover_normal;
ALTER TABLE public.marker_size_config DROP COLUMN hover_selected;
ALTER TABLE public.marker_size_config DROP COLUMN hover_focused;
ALTER TABLE public.marker_size_config DROP COLUMN hover_recent;
