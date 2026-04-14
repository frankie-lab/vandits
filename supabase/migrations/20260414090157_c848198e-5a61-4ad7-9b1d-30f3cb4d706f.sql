INSERT INTO public.marker_size_config (marker_type, base_normal, base_selected, base_focused, base_recent, hover_size, marker_shape, fill_color, fill_color_light)
VALUES
  ('photo_thumbnail',   44, 52, 56, 44, NULL, 'square',  '#6366f1', '#818cf8'),
  ('home',              24, 28, 32, 24, NULL, 'circle',  '#16a34a', '#4ade80'),
  ('user_gps',          14, 18, 20, 14, NULL, 'circle',  '#3b82f6', '#60a5fa'),
  ('nearby_result',     10, 14, 16, 10, NULL, 'circle',  '#6b7280', '#9ca3af'),
  ('route_waypoint',    22, 26, 28, 22, NULL, 'circle',  '#f59e0b', '#fbbf24'),
  ('route_flag',        36, 40, 44, 36, NULL, 'circle',  '#dc2626', '#f87171'),
  ('route_stage_break', 28, 32, 36, 28, NULL, 'circle',  '#f59e0b', '#fbbf24'),
  ('route_stop_overnight', 32, 36, 40, 32, NULL, 'circle', '#f59e0b', '#fbbf24'),
  ('route_stop_refuel', 32, 36, 40, 32, NULL, 'circle',  '#ef4444', '#f87171'),
  ('route_stop_port',   26, 30, 34, 26, NULL, 'circle',  '#0891b2', '#22d3ee'),
  ('route_stop_airport',26, 30, 34, 26, NULL, 'circle',  '#9333ea', '#c084fc'),
  ('route_stop_custom', 32, 36, 40, 32, NULL, 'circle',  '#6b7280', '#9ca3af')
ON CONFLICT (marker_type) DO NOTHING;