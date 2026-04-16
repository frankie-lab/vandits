-- Create preference_values table
CREATE TABLE public.preference_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_key text NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('system', 'role', 'domain', 'user', 'device', 'session')),
  scope_id text,
  values jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(unit_key, scope_type, scope_id)
);

-- Index for fast user lookups
CREATE INDEX idx_preference_values_user ON public.preference_values (scope_type, scope_id) WHERE scope_type = 'user';

-- Enable RLS
ALTER TABLE public.preference_values ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all preferences (needed to resolve system/role/domain defaults)
CREATE POLICY "Authenticated users can read all preferences"
ON public.preference_values
FOR SELECT
TO authenticated
USING (true);

-- Users can insert their own user-scoped preferences
CREATE POLICY "Users can insert their own preferences"
ON public.preference_values
FOR INSERT
TO authenticated
WITH CHECK (
  (scope_type = 'user' AND scope_id = auth.uid()::text)
  OR has_role(auth.uid(), 'master'::app_role)
);

-- Users can update their own user-scoped preferences
CREATE POLICY "Users can update their own preferences"
ON public.preference_values
FOR UPDATE
TO authenticated
USING (
  (scope_type = 'user' AND scope_id = auth.uid()::text)
  OR has_role(auth.uid(), 'master'::app_role)
);

-- Users can delete their own user-scoped preferences
CREATE POLICY "Users can delete their own preferences"
ON public.preference_values
FOR DELETE
TO authenticated
USING (
  (scope_type = 'user' AND scope_id = auth.uid()::text)
  OR has_role(auth.uid(), 'master'::app_role)
);

-- Auto-update timestamp trigger
CREATE TRIGGER update_preference_values_updated_at
BEFORE UPDATE ON public.preference_values
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();