-- Sandbox user creation + data clone (idempotent)
DO $$
DECLARE
  v_source_uid uuid := 'b977aa23-27eb-4195-ac4e-a754fbd20315';
  v_sandbox_uid uuid;
  v_existing_uid uuid;
BEGIN
  -- 1) Find or create sandbox auth user
  SELECT id INTO v_existing_uid FROM auth.users WHERE email = 'sandbox-agent@vandits.test';

  IF v_existing_uid IS NOT NULL THEN
    v_sandbox_uid := v_existing_uid;
    -- Wipe existing sandbox data so re-run is idempotent
    DELETE FROM collection_items ci USING collections c WHERE ci.collection_id = c.id AND c.user_id = v_sandbox_uid;
    DELETE FROM collections WHERE user_id = v_sandbox_uid;
    DELETE FROM location_photos WHERE user_id = v_sandbox_uid;
    DELETE FROM location_notes WHERE user_id = v_sandbox_uid;
    DELETE FROM document_tracks dt USING documents d WHERE dt.document_id = d.id AND d.user_id = v_sandbox_uid;
    DELETE FROM locations WHERE owner_user_id = v_sandbox_uid;
    DELETE FROM documents WHERE user_id = v_sandbox_uid;
    DELETE FROM personal_categories WHERE user_id = v_sandbox_uid;
    DELETE FROM onedrive_photo_index WHERE user_id = v_sandbox_uid;
    DELETE FROM preference_values WHERE scope_type = 'user' AND scope_id = v_sandbox_uid::text;
  ELSE
    v_sandbox_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_sandbox_uid, 'authenticated', 'authenticated',
      'sandbox-agent@vandits.test',
      crypt('SandboxAgent!2026', gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider','email','providers',ARRAY['email']),
      jsonb_build_object('full_name','Sandbox Agent','username','sandbox_agent'),
      false, '', '', '', ''
    );
    -- handle_new_user trigger should populate profiles; if not, insert
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (v_sandbox_uid, 'sandbox_agent', 'Sandbox Agent')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Make sandbox uid available to subsequent statements
  PERFORM set_config('app.sandbox_uid', v_sandbox_uid::text, true);
  PERFORM set_config('app.source_uid', v_source_uid::text, true);

  -- 2) Mirror profile preferences
  UPDATE public.profiles dst SET
    home_latitude = src.home_latitude,
    home_longitude = src.home_longitude,
    home_name = src.home_name,
    hide_home_location = src.hide_home_location,
    default_location_visibility = src.default_location_visibility,
    default_note_visibility = src.default_note_visibility,
    default_photo_visibility = src.default_photo_visibility,
    measurement_units = src.measurement_units,
    duplicate_threshold_meters = src.duplicate_threshold_meters,
    travel_profile = src.travel_profile,
    priority_ranking = src.priority_ranking,
    map_center_mode = src.map_center_mode,
    icon_library = src.icon_library,
    route_engine_defaults = src.route_engine_defaults,
    bio = COALESCE(src.bio,'Sandbox account for agent testing')
  FROM public.profiles src
  WHERE src.id = v_source_uid AND dst.id = v_sandbox_uid;

  -- 3) Pick 5 source documents (variety)
  CREATE TEMP TABLE tmp_doc_map ON COMMIT DROP AS
  SELECT id AS src_id, gen_random_uuid() AS new_id
  FROM (
    SELECT id FROM documents WHERE user_id = v_source_uid ORDER BY created_at DESC LIMIT 5
  ) s;

  INSERT INTO documents (id, user_id, name, original_filename, source_type, status, import_status, total_waypoints, resolved_count, pending_count, conflict_count, metadata, created_at, updated_at)
  SELECT m.new_id, v_sandbox_uid, d.name || ' (sandbox)', d.original_filename, d.source_type, d.status, d.import_status, d.total_waypoints, d.resolved_count, d.pending_count, d.conflict_count, d.metadata, now(), now()
  FROM tmp_doc_map m JOIN documents d ON d.id = m.src_id;

  -- 4) Locations: top 50 per doc
  CREATE TEMP TABLE tmp_loc_map ON COMMIT DROP AS
  SELECT l.id AS src_id, gen_random_uuid() AS new_id, m.new_id AS new_doc_id
  FROM tmp_doc_map m
  JOIN LATERAL (
    SELECT id FROM locations WHERE document_id = m.src_id AND deleted_at IS NULL ORDER BY created_at LIMIT 50
  ) l ON true;

  INSERT INTO locations (
    id, document_id, owner_user_id, name, description, latitude, longitude, altitude,
    continent, country, region, zone, place_type, custom_data, enriched_data, visibility,
    user_image_url, user_image_visibility, is_approved, enrichment_status,
    continent_id, country_id, region_id, zone_id, admin3_id, locality_id, sublocality_id, type_id, street_name,
    personal_category_id, created_at, updated_at
  )
  SELECT
    lm.new_id, lm.new_doc_id, v_sandbox_uid, l.name, l.description, l.latitude, l.longitude, l.altitude,
    l.continent, l.country, l.region, l.zone, l.place_type, l.custom_data, l.enriched_data, l.visibility,
    l.user_image_url, l.user_image_visibility, l.is_approved, l.enrichment_status,
    l.continent_id, l.country_id, l.region_id, l.zone_id, l.admin3_id, l.locality_id, l.sublocality_id, l.type_id, l.street_name,
    NULL, now(), now()
  FROM tmp_loc_map lm JOIN locations l ON l.id = lm.src_id;

  -- 5) Tracks
  INSERT INTO document_tracks (id, document_id, name, coordinates, color, date, metadata, created_at, updated_at)
  SELECT gen_random_uuid(), m.new_id, t.name, t.coordinates, t.color, t.date, t.metadata, now(), now()
  FROM tmp_doc_map m JOIN document_tracks t ON t.document_id = m.src_id;

  -- 6) Personal categories
  CREATE TEMP TABLE tmp_cat_map ON COMMIT DROP AS
  SELECT id AS src_id, gen_random_uuid() AS new_id FROM personal_categories WHERE user_id = v_source_uid;

  INSERT INTO personal_categories (id, user_id, name, description, color, icon, is_shared, sort_order, created_at, updated_at)
  SELECT cm.new_id, v_sandbox_uid, c.name, c.description, c.color, c.icon, c.is_shared, c.sort_order, now(), now()
  FROM tmp_cat_map cm JOIN personal_categories c ON c.id = cm.src_id;

  -- 7) Collections (all source user collections, up to 8)
  CREATE TEMP TABLE tmp_coll_map ON COMMIT DROP AS
  SELECT id AS src_id, gen_random_uuid() AS new_id
  FROM (SELECT id FROM collections WHERE user_id = v_source_uid ORDER BY created_at LIMIT 8) s;

  INSERT INTO collections (id, user_id, name, description, color, icon, visibility, in_catalog, created_at, updated_at)
  SELECT cm.new_id, v_sandbox_uid, c.name, c.description, c.color, c.icon, c.visibility, c.in_catalog, now(), now()
  FROM tmp_coll_map cm JOIN collections c ON c.id = cm.src_id;

  -- 8) Collection items: only those whose item_id maps to a cloned location
  INSERT INTO collection_items (id, collection_id, item_id, item_type, position, added_at)
  SELECT gen_random_uuid(), cm.new_id, lm.new_id, ci.item_type, ci.position, now()
  FROM collection_items ci
  JOIN tmp_coll_map cm ON cm.src_id = ci.collection_id
  JOIN tmp_loc_map lm ON lm.src_id = ci.item_id
  WHERE ci.item_type = 'place';

  -- Ensure each cloned collection has at least 3 items (pick from cloned locations if empty)
  INSERT INTO collection_items (id, collection_id, item_id, item_type, position, added_at)
  SELECT gen_random_uuid(), cm.new_id, lm.new_id, 'place', row_number() OVER (PARTITION BY cm.new_id ORDER BY lm.new_id), now()
  FROM tmp_coll_map cm
  CROSS JOIN LATERAL (
    SELECT new_id FROM tmp_loc_map ORDER BY random() LIMIT 5
  ) lm
  WHERE NOT EXISTS (SELECT 1 FROM collection_items x WHERE x.collection_id = cm.new_id);

  -- 9) Photos for cloned locations (image_url and visibility preserved)
  INSERT INTO location_photos (id, location_id, user_id, image_url, visibility, caption, is_primary, created_at, updated_at)
  SELECT gen_random_uuid(), lm.new_id, v_sandbox_uid, p.image_url, p.visibility, p.caption, p.is_primary, now(), now()
  FROM location_photos p JOIN tmp_loc_map lm ON lm.src_id = p.location_id;

  -- Seed at least 5 photos if none cloned (use enriched_data url if present)
  INSERT INTO location_photos (id, location_id, user_id, image_url, visibility, caption, is_primary, created_at, updated_at)
  SELECT gen_random_uuid(), l.id, v_sandbox_uid,
         COALESCE(l.user_image_url, 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/320px-PNG_transparency_demonstration_1.png'),
         'private', 'Sandbox seed photo', false, now(), now()
  FROM locations l
  WHERE l.owner_user_id = v_sandbox_uid
    AND NOT EXISTS (SELECT 1 FROM location_photos WHERE user_id = v_sandbox_uid)
  LIMIT 8;

  -- 10) Notes (clone source notes mapped to cloned locations + seed a few)
  INSERT INTO location_notes (id, location_id, user_id, content, visibility, created_at, updated_at)
  SELECT gen_random_uuid(), lm.new_id, v_sandbox_uid, n.content, n.visibility, now(), now()
  FROM location_notes n JOIN tmp_loc_map lm ON lm.src_id = n.location_id WHERE n.user_id = v_source_uid;

  INSERT INTO location_notes (id, location_id, user_id, content, visibility, created_at, updated_at)
  SELECT gen_random_uuid(), l.id, v_sandbox_uid, 'Nota de prueba sandbox para ' || l.name, 'private', now(), now()
  FROM (SELECT id, name FROM locations WHERE owner_user_id = v_sandbox_uid ORDER BY random() LIMIT 8) l
  WHERE NOT EXISTS (SELECT 1 FROM location_notes WHERE user_id = v_sandbox_uid);

  -- 11) OneDrive photo index (clone up to 100)
  INSERT INTO onedrive_photo_index (id, user_id, onedrive_id, name, latitude, longitude, altitude, taken_at, folder_path, camera_make, camera_model, thumbnail_url, created_at, updated_at)
  SELECT gen_random_uuid(), v_sandbox_uid, 'sandbox-' || o.onedrive_id, o.name, o.latitude, o.longitude, o.altitude, o.taken_at, o.folder_path, o.camera_make, o.camera_model, o.thumbnail_url, now(), now()
  FROM (SELECT * FROM onedrive_photo_index WHERE user_id = v_source_uid ORDER BY taken_at DESC LIMIT 100) o;

  -- 12) Preferences
  INSERT INTO preference_values (id, scope_type, scope_id, unit_key, values, updated_at)
  SELECT gen_random_uuid(), 'user', v_sandbox_uid::text, p.unit_key, p.values, now()
  FROM preference_values p WHERE p.scope_type = 'user' AND p.scope_id = v_source_uid::text;

  RAISE NOTICE 'Sandbox user UID: %', v_sandbox_uid;
END $$;