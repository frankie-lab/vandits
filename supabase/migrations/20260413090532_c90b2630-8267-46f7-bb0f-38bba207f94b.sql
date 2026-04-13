-- Add approval column to locations
ALTER TABLE public.locations
ADD COLUMN is_approved boolean NOT NULL DEFAULT false;

-- Mark all existing locations as approved (backward compat)
UPDATE public.locations SET is_approved = true WHERE is_approved = false;