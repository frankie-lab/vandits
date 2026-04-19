UPDATE public.app_settings
SET value = '"false"'::jsonb,
    updated_at = now()
WHERE key IN (
  'v2_data_read_places',
  'v2_data_read_user_places',
  'v2_map_features'
);