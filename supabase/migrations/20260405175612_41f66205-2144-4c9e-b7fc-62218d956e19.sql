INSERT INTO public.ferry_routes (route_name, origin_port_name, origin_lat, origin_lng, origin_country, destination_port_name, destination_lat, destination_lng, destination_country, distance_km, estimated_duration_minutes, operators, region, is_active) VALUES
-- Inter-island: Las Palmas ↔ Santa Cruz de Tenerife
('Las Palmas - Santa Cruz de Tenerife', 'Las Palmas de Gran Canaria', 28.1436, -15.4318, 'ES', 'Santa Cruz de Tenerife', 28.4682, -16.2546, 'ES', 95, 100, ARRAY['Fred. Olsen', 'Naviera Armas', 'Trasmediterránea'], 'canary_islands', true),
-- Inter-island: Los Cristianos ↔ San Sebastián de La Gomera
('Los Cristianos - San Sebastián de La Gomera', 'Los Cristianos', 28.0520, -16.7155, 'ES', 'San Sebastián de La Gomera', 28.0916, -17.1107, 'ES', 38, 50, ARRAY['Fred. Olsen', 'Naviera Armas'], 'canary_islands', true),
-- Inter-island: Morro Jable ↔ Las Palmas
('Morro Jable - Las Palmas', 'Morro Jable', 28.0500, -14.3500, 'ES', 'Las Palmas de Gran Canaria', 28.1436, -15.4318, 'ES', 70, 120, ARRAY['Fred. Olsen', 'Naviera Armas'], 'canary_islands', true),
-- Inter-island: Arrecife ↔ Las Palmas
('Arrecife - Las Palmas', 'Arrecife', 28.9630, -13.5477, 'ES', 'Las Palmas de Gran Canaria', 28.1436, -15.4318, 'ES', 210, 300, ARRAY['Naviera Armas', 'Trasmediterránea'], 'canary_islands', true),
-- Inter-island: Santa Cruz de La Palma ↔ Los Cristianos
('Santa Cruz de La Palma - Los Cristianos', 'Santa Cruz de La Palma', 28.6835, -17.7642, 'ES', 'Los Cristianos', 28.0520, -16.7155, 'ES', 140, 180, ARRAY['Fred. Olsen', 'Naviera Armas'], 'canary_islands', true),
-- Mainland to Tenerife
('Huelva - Santa Cruz de Tenerife', 'Huelva', 37.2614, -6.9447, 'ES', 'Santa Cruz de Tenerife', 28.4682, -16.2546, 'ES', 1150, 2100, ARRAY['Naviera Armas', 'Trasmediterránea'], 'atlantic', true),
('Cádiz - Santa Cruz de Tenerife', 'Cádiz', 36.5271, -6.2886, 'ES', 'Santa Cruz de Tenerife', 28.4682, -16.2546, 'ES', 1200, 2280, ARRAY['Naviera Armas', 'Trasmediterránea'], 'atlantic', true);