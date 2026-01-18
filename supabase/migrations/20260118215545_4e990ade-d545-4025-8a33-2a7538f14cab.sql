-- Add measurement units preference to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS measurement_units text NOT NULL DEFAULT 'metric';

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.measurement_units IS 'User preference for measurement units: metric, imperial, or auto (detect by country)';