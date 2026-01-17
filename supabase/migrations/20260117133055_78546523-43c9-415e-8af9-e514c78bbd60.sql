-- Add map center configuration to profiles table
ALTER TABLE public.profiles 
ADD COLUMN map_center_mode text NOT NULL DEFAULT 'auto',
ADD COLUMN home_latitude double precision,
ADD COLUMN home_longitude double precision,
ADD COLUMN home_name text;

-- Add constraint for valid mode values
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_map_center_mode_check 
CHECK (map_center_mode IN ('auto', 'geolocation', 'home'));