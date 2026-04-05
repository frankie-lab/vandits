
-- Add layer and preference columns to user_transport_modes
ALTER TABLE public.user_transport_modes
  ADD COLUMN IF NOT EXISTS layer text NOT NULL DEFAULT 'owned'
    CHECK (layer IN ('owned', 'rentable', 'infrastructure')),
  ADD COLUMN IF NOT EXISTS preference text NOT NULL DEFAULT 'allowed'
    CHECK (preference IN ('required', 'preferred', 'allowed'));

-- Drop the unique constraint if exists and recreate with layer
-- First drop existing unique index on (user_id, transport_mode_code) if any
DO $$
BEGIN
  -- Drop old unique constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_transport_modes_user_id_transport_mode_code_key'
  ) THEN
    ALTER TABLE public.user_transport_modes 
      DROP CONSTRAINT user_transport_modes_user_id_transport_mode_code_key;
  END IF;
END $$;

-- Add new unique constraint including layer
ALTER TABLE public.user_transport_modes
  ADD CONSTRAINT user_transport_modes_user_layer_code_key 
  UNIQUE (user_id, transport_mode_code, layer);
