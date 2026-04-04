
CREATE TABLE public.user_transport_modes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  transport_mode_code TEXT NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, transport_mode_code)
);

ALTER TABLE public.user_transport_modes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own transport modes"
  ON public.user_transport_modes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own transport modes"
  ON public.user_transport_modes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own transport modes"
  ON public.user_transport_modes FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own transport modes"
  ON public.user_transport_modes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_user_transport_modes_updated_at
  BEFORE UPDATE ON public.user_transport_modes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
