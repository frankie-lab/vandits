-- =============================================
-- FASE 1: Sistema de Autenticación y Perfiles
-- =============================================

-- Tabla de perfiles de usuario
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false, -- Si es privado, requiere aprobación para seguir
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para búsquedas por username
CREATE INDEX idx_profiles_username ON public.profiles(username);

-- RLS para profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede ver perfiles públicos
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- Solo el usuario puede actualizar su propio perfil
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Usuarios autenticados pueden insertar su propio perfil
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =============================================
-- FASE 2: Sistema de Follows
-- =============================================

-- Estados de follow: pending (esperando aprobación), accepted, rejected
CREATE TYPE public.follow_status AS ENUM ('pending', 'accepted', 'rejected');

-- Tabla de relaciones de seguimiento
CREATE TABLE public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status follow_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Un usuario no puede seguirse a sí mismo
  CONSTRAINT no_self_follow CHECK (follower_id != following_id),
  -- Relación única
  UNIQUE (follower_id, following_id)
);

-- Índices para búsquedas eficientes
CREATE INDEX idx_follows_follower ON public.follows(follower_id);
CREATE INDEX idx_follows_following ON public.follows(following_id);
CREATE INDEX idx_follows_status ON public.follows(status);

-- RLS para follows
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Ver follows: el follower, el following, o si ambos perfiles son públicos
CREATE POLICY "Users can see their own follows"
  ON public.follows FOR SELECT
  USING (
    auth.uid() = follower_id OR 
    auth.uid() = following_id
  );

-- Crear follow: solo el follower puede crear
CREATE POLICY "Users can create follows"
  ON public.follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

-- Actualizar follow: solo el following puede aceptar/rechazar
CREATE POLICY "Following user can update status"
  ON public.follows FOR UPDATE
  USING (auth.uid() = following_id);

-- Eliminar follow: follower o following pueden eliminar
CREATE POLICY "Users can delete their follows"
  ON public.follows FOR DELETE
  USING (
    auth.uid() = follower_id OR 
    auth.uid() = following_id
  );

-- =============================================
-- FASE 3: Configuración de visibilidad por categoría
-- =============================================

-- Preferencias de categorías visibles para cada follow
CREATE TABLE public.follow_category_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_id UUID NOT NULL REFERENCES public.follows(id) ON DELETE CASCADE,
  classification_code TEXT NOT NULL, -- Código de clasificación (ej: "2.1.3")
  visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE (follow_id, classification_code)
);

-- RLS para preferencias
ALTER TABLE public.follow_category_preferences ENABLE ROW LEVEL SECURITY;

-- El follower puede gestionar sus preferencias
CREATE POLICY "Followers can manage their category preferences"
  ON public.follow_category_preferences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.follows 
      WHERE id = follow_category_preferences.follow_id 
      AND follower_id = auth.uid()
    )
  );

-- =============================================
-- FASE 4: Actualizar tablas existentes
-- =============================================

-- Añadir user_id a documents (propietario del documento)
ALTER TABLE public.documents 
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Añadir visibilidad a locations
ALTER TABLE public.locations
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'followers' 
    CHECK (visibility IN ('public', 'followers', 'private'));

-- Índice para filtrar por visibilidad
CREATE INDEX idx_locations_visibility ON public.locations(visibility);

-- Actualizar RLS de documents
DROP POLICY IF EXISTS "Public read documents" ON public.documents;
DROP POLICY IF EXISTS "Public insert documents" ON public.documents;
DROP POLICY IF EXISTS "Public update documents" ON public.documents;
DROP POLICY IF EXISTS "Public delete documents" ON public.documents;

-- Función helper para verificar si un usuario puede ver los documentos de otro
CREATE OR REPLACE FUNCTION public.can_view_user_documents(doc_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Es su propio documento
    doc_user_id = auth.uid()
    OR
    -- El documento es de un usuario que sigue con estado aceptado
    EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid()
      AND following_id = doc_user_id
      AND status = 'accepted'
    )
$$;

-- Nuevas políticas para documents
CREATE POLICY "Users can read their own documents"
  ON public.documents FOR SELECT
  USING (user_id = auth.uid() OR public.can_view_user_documents(user_id));

CREATE POLICY "Users can insert their own documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
  ON public.documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
  ON public.documents FOR DELETE
  USING (auth.uid() = user_id);

-- Actualizar RLS de locations
DROP POLICY IF EXISTS "Public read locations" ON public.locations;
DROP POLICY IF EXISTS "Public insert locations" ON public.locations;
DROP POLICY IF EXISTS "Public update locations" ON public.locations;
DROP POLICY IF EXISTS "Public delete locations" ON public.locations;

-- Función para verificar visibilidad de locations
CREATE OR REPLACE FUNCTION public.can_view_location(loc_row public.locations)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Es público
    loc_row.visibility = 'public'
    OR
    -- Es su propia location (vía document)
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = loc_row.document_id 
      AND user_id = auth.uid()
    )
    OR
    -- Es de alguien a quien sigue y no es privado
    (
      loc_row.visibility != 'private'
      AND EXISTS (
        SELECT 1 FROM public.documents d
        JOIN public.follows f ON f.following_id = d.user_id
        WHERE d.id = loc_row.document_id
        AND f.follower_id = auth.uid()
        AND f.status = 'accepted'
      )
    )
$$;

-- Nuevas políticas para locations
CREATE POLICY "Users can read visible locations"
  ON public.locations FOR SELECT
  USING (public.can_view_location(locations.*));

CREATE POLICY "Users can insert their own locations"
  ON public.locations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = document_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own locations"
  ON public.locations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = document_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own locations"
  ON public.locations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = document_id 
      AND user_id = auth.uid()
    )
  );

-- Actualizar RLS de enrichment_jobs
DROP POLICY IF EXISTS "Public read enrichment_jobs" ON public.enrichment_jobs;
DROP POLICY IF EXISTS "Public insert enrichment_jobs" ON public.enrichment_jobs;
DROP POLICY IF EXISTS "Public update enrichment_jobs" ON public.enrichment_jobs;
DROP POLICY IF EXISTS "Public delete enrichment_jobs" ON public.enrichment_jobs;

-- Solo el propietario puede ver/gestionar sus jobs
CREATE POLICY "Users can manage their own enrichment jobs"
  ON public.enrichment_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = document_id 
      AND user_id = auth.uid()
    )
  );

-- =============================================
-- FASE 5: Triggers y funciones auxiliares
-- =============================================

-- Auto-crear perfil cuando se registra un usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      SPLIT_PART(NEW.email, '@', 1) || '_' || LEFT(NEW.id::text, 4)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      SPLIT_PART(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Trigger para auto-crear perfil
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-aceptar follows si el perfil es público
CREATE OR REPLACE FUNCTION public.handle_new_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si el perfil seguido es público, aceptar automáticamente
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = NEW.following_id AND is_private = true
  ) THEN
    NEW.status := 'accepted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_follow_created
  BEFORE INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_follow();

-- Trigger para updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_follows_updated_at
  BEFORE UPDATE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();