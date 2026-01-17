-- Add duplicate threshold preference to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS duplicate_threshold_meters integer NOT NULL DEFAULT 250;