
-- Rename 'followed' to 'followed_enriched'
UPDATE public.marker_size_config SET marker_type = 'followed_enriched' WHERE marker_type = 'followed';

-- Add followed_new (circle, same defaults as own_new)
INSERT INTO public.marker_size_config (marker_type, marker_shape, base_normal, base_selected, base_focused, base_recent, hover_normal, hover_selected, hover_focused, hover_recent)
VALUES ('followed_new', 'circle', 12, 16, 18, 12, null, null, null, null)
ON CONFLICT DO NOTHING;

-- Add druid_enriched (pin, same defaults as curator_enriched)
INSERT INTO public.marker_size_config (marker_type, marker_shape, base_normal, base_selected, base_focused, base_recent, hover_normal, hover_selected, hover_focused, hover_recent)
VALUES ('druid_enriched', 'pin', 28, 36, 40, 44, null, null, null, null)
ON CONFLICT DO NOTHING;

-- Add druid_new (icon, same defaults as curator_default)
INSERT INTO public.marker_size_config (marker_type, marker_shape, base_normal, base_selected, base_focused, base_recent, hover_normal, hover_selected, hover_focused, hover_recent)
VALUES ('druid_new', 'icon', 26, 30, 32, 26, null, null, null, null)
ON CONFLICT DO NOTHING;
