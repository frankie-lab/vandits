
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS default_location_visibility text NOT NULL DEFAULT 'followers',
  ADD COLUMN IF NOT EXISTS default_note_visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS hide_home_location boolean NOT NULL DEFAULT true;
