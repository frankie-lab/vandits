
-- Update camper_van to be the unified option
UPDATE transport_modes SET name = 'Camper / Autocaravana' WHERE code = 'camper_van';

-- Migrate user_transport_modes references from motorhome to camper_van
UPDATE user_transport_modes SET transport_mode_code = 'camper_van' 
WHERE transport_mode_code = 'motorhome' 
AND NOT EXISTS (
  SELECT 1 FROM user_transport_modes u2 
  WHERE u2.user_id = user_transport_modes.user_id AND u2.transport_mode_code = 'camper_van'
);

-- Delete duplicate references (user already has camper_van)
DELETE FROM user_transport_modes WHERE transport_mode_code = 'motorhome';

-- Delete the motorhome transport mode
DELETE FROM transport_modes WHERE code = 'motorhome';
