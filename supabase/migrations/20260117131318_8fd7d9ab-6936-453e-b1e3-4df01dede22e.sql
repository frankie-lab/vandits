-- Crear tabla para notas de ubicaciones por usuario
CREATE TABLE public.location_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private', -- private, followers, public
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(location_id, user_id)
);

-- Habilitar RLS
ALTER TABLE public.location_notes ENABLE ROW LEVEL SECURITY;

-- Política: Usuarios pueden ver sus propias notas
CREATE POLICY "Users can read their own notes"
  ON public.location_notes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: Usuarios pueden ver notas públicas
CREATE POLICY "Users can read public notes"
  ON public.location_notes
  FOR SELECT
  USING (visibility = 'public');

-- Política: Usuarios pueden ver notas de seguidores aceptados
CREATE POLICY "Users can read follower notes"
  ON public.location_notes
  FOR SELECT
  USING (
    visibility = 'followers'
    AND EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid()
      AND following_id = location_notes.user_id
      AND status = 'accepted'
    )
  );

-- Política: Usuarios pueden insertar sus propias notas
CREATE POLICY "Users can insert their own notes"
  ON public.location_notes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: Usuarios pueden actualizar sus propias notas
CREATE POLICY "Users can update their own notes"
  ON public.location_notes
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Política: Usuarios pueden eliminar sus propias notas
CREATE POLICY "Users can delete their own notes"
  ON public.location_notes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_location_notes_updated_at
  BEFORE UPDATE ON public.location_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime para sincronización
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_notes;