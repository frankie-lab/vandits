-- Add catalog marker types to marker_size_config
INSERT INTO marker_size_config (marker_type, marker_shape, fill_color, fill_color_light, base_normal, base_recent, base_focused, base_selected, hover_size)
VALUES 
  ('catalog_enriched', 'pin', '#0ea5e9', '#38bdf8', 22, 26, 24, 22, 36),
  ('catalog_new', 'circle', '#0ea5e9', '#38bdf8', 14, 18, 16, 14, NULL),
  ('catalog_empty', 'circle', '#f59e0b', '#fbbf24', 14, 18, 16, 14, NULL)
ON CONFLICT DO NOTHING;