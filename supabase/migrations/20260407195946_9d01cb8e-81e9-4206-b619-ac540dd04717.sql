
CREATE TABLE public.marker_size_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marker_type text NOT NULL UNIQUE,
  base_normal integer NOT NULL DEFAULT 12,
  base_selected integer NOT NULL DEFAULT 16,
  base_focused integer NOT NULL DEFAULT 18,
  base_recent integer NOT NULL DEFAULT 18,
  hover_normal integer DEFAULT NULL,
  hover_selected integer DEFAULT NULL,
  hover_focused integer DEFAULT NULL,
  hover_recent integer DEFAULT NULL,
  marker_shape text NOT NULL DEFAULT 'circle',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.marker_size_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read marker config"
  ON public.marker_size_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Masters can manage marker config"
  ON public.marker_size_config FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'master'::app_role));

INSERT INTO public.marker_size_config (marker_type, base_normal, base_selected, base_focused, base_recent, hover_normal, hover_selected, hover_focused, hover_recent, marker_shape) VALUES
  ('own_enriched', 12, 16, 18, 18, 24, 28, 30, 32, 'pin'),
  ('own_new', 12, 16, 18, 12, NULL, NULL, NULL, NULL, 'circle'),
  ('followed', 12, 16, 18, 20, 24, 28, 30, 32, 'circle'),
  ('curator_enriched', 28, 36, 40, 44, NULL, NULL, NULL, NULL, 'pin'),
  ('curator_default', 26, 30, 32, 26, NULL, NULL, NULL, NULL, 'icon');
