-- Crear bucket para fotos de ubicaciones de usuarios
INSERT INTO storage.buckets (id, name, public)
VALUES ('location-photos', 'location-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS para el bucket de fotos
CREATE POLICY "Users can upload their own location photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'location-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own location photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'location-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own location photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'location-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view public location photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'location-photos');

-- Añadir campo user_image_url a locations para foto principal del usuario
ALTER TABLE public.locations 
ADD COLUMN IF NOT EXISTS user_image_url TEXT,
ADD COLUMN IF NOT EXISTS user_image_visibility TEXT DEFAULT 'private';

-- Crear tabla para múltiples fotos por ubicación
CREATE TABLE IF NOT EXISTS public.location_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  caption TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para location_photos
CREATE INDEX IF NOT EXISTS idx_location_photos_location_id ON public.location_photos(location_id);
CREATE INDEX IF NOT EXISTS idx_location_photos_user_id ON public.location_photos(user_id);

-- Habilitar RLS
ALTER TABLE public.location_photos ENABLE ROW LEVEL SECURITY;

-- RLS policies para location_photos
CREATE POLICY "Users can read their own photos"
ON public.location_photos FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can read public photos"
ON public.location_photos FOR SELECT
USING (visibility = 'public');

CREATE POLICY "Users can read follower photos"
ON public.location_photos FOR SELECT
USING (
  visibility = 'followers' 
  AND EXISTS (
    SELECT 1 FROM public.follows 
    WHERE follower_id = auth.uid() 
    AND following_id = location_photos.user_id 
    AND status = 'accepted'
  )
);

CREATE POLICY "Users can insert their own photos"
ON public.location_photos FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own photos"
ON public.location_photos FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own photos"
ON public.location_photos FOR DELETE
USING (auth.uid() = user_id);

-- Añadir preferencia de visibilidad por defecto a profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS default_photo_visibility TEXT DEFAULT 'private';

-- Trigger para actualizar updated_at
CREATE TRIGGER update_location_photos_updated_at
BEFORE UPDATE ON public.location_photos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();