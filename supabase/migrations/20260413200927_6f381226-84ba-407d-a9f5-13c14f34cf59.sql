
CREATE TABLE public.onedrive_photo_index (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  onedrive_id TEXT NOT NULL,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION,
  taken_at TIMESTAMPTZ,
  folder_path TEXT,
  camera_make TEXT,
  camera_model TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, onedrive_id)
);

ALTER TABLE public.onedrive_photo_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own photo index"
  ON public.onedrive_photo_index FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own photo index"
  ON public.onedrive_photo_index FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own photo index"
  ON public.onedrive_photo_index FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own photo index"
  ON public.onedrive_photo_index FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
