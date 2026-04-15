-- Activate V2 feature flags: Phase A→E
UPDATE app_settings SET value = to_jsonb('true'::text) WHERE key = 'v2_data_read_places';
UPDATE app_settings SET value = to_jsonb('true'::text) WHERE key = 'v2_data_read_user_places';
UPDATE app_settings SET value = to_jsonb('true'::text) WHERE key = 'v2_data_write_imports';
UPDATE app_settings SET value = to_jsonb('true'::text) WHERE key = 'v2_data_write_user_places';
UPDATE app_settings SET value = to_jsonb('true'::text) WHERE key = 'v2_map_features';
UPDATE app_settings SET value = to_jsonb('true'::text) WHERE key = 'v2_collections';