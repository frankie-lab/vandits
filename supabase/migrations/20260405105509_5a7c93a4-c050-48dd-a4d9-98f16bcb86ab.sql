
-- Add missing transport modes
INSERT INTO public.transport_modes (code, name, category, sub_category, icon, is_active, is_complementary, is_motorized, avg_speed_kmh, max_passengers, allows_cargo, requires_booking, requires_schedule, supports_sleep, setup_time_minutes, overhead_minutes)
VALUES
  ('taxi', 'Taxi / VTC / Transfer', 'land', 'on_demand', 'Car', true, false, true, 40, 4, false, true, false, false, 5, 5),
  ('rental_bicycle', 'Bicicleta de alquiler', 'land', 'rental', 'Bike', true, false, false, 15, 1, false, true, false, false, 10, 10),
  ('rental_camper', 'Camper / Autocaravana de alquiler', 'land', 'rental', 'Caravan', true, false, true, 80, 4, true, true, false, true, 30, 15),
  ('rental_caravan', 'Caravana de alquiler', 'land', 'rental', 'Caravan', true, false, true, 80, 4, true, true, false, true, 30, 15)
ON CONFLICT (code) DO NOTHING;

-- Fix sub_categories to match the 5-group structure
UPDATE public.transport_modes SET sub_category = 'autonomous' WHERE code IN ('walking', 'bicycle');
UPDATE public.transport_modes SET sub_category = 'own_vehicle' WHERE code IN ('own_car', 'own_motorcycle', 'camper_van', 'car_caravan', 'own_boat', 'private_plane');
UPDATE public.transport_modes SET sub_category = 'rental' WHERE code IN ('rental_car', 'rental_motorcycle', 'rental_boat', 'rental_bicycle', 'rental_camper', 'rental_caravan');
UPDATE public.transport_modes SET sub_category = 'public_transport' WHERE code IN ('public_bus', 'train', 'airline', 'ferry');
UPDATE public.transport_modes SET sub_category = 'on_demand' WHERE code = 'taxi';
