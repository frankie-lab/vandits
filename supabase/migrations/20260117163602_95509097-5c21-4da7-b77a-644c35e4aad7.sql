-- Crear enum para roles
CREATE TYPE public.app_role AS ENUM ('master', 'admin', 'user');

-- Crear tabla de roles de usuario
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Habilitar RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Función para verificar rol (SECURITY DEFINER evita recursión RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Política: solo los masters pueden ver roles
CREATE POLICY "Masters can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master') OR user_id = auth.uid());

-- Política: solo masters pueden gestionar roles
CREATE POLICY "Masters can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

-- Crear tabla de criterios de enriquecimiento globales
CREATE TABLE public.enrichment_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_description_length integer NOT NULL DEFAULT 1000,
  description_tone text NOT NULL DEFAULT 'informative',
  image_sources text[] NOT NULL DEFAULT ARRAY['wikimedia', 'verified', 'uploaded'],
  image_min_resolution text NOT NULL DEFAULT '1200x800',
  min_tags_count integer NOT NULL DEFAULT 3,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1
);

-- Habilitar RLS
ALTER TABLE public.enrichment_criteria ENABLE ROW LEVEL SECURITY;

-- Política: todos pueden leer criterios
CREATE POLICY "Anyone can read enrichment criteria"
ON public.enrichment_criteria
FOR SELECT
TO authenticated
USING (true);

-- Política: solo masters pueden actualizar criterios
CREATE POLICY "Masters can update enrichment criteria"
ON public.enrichment_criteria
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

-- Insertar criterios por defecto
INSERT INTO public.enrichment_criteria (id) 
VALUES ('00000000-0000-0000-0000-000000000001');

-- Tabla para tracking de re-enriquecimiento global
CREATE TABLE public.global_enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by uuid REFERENCES auth.users(id) NOT NULL,
  criteria_version integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_count integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.global_enrichment_jobs ENABLE ROW LEVEL SECURITY;

-- Política: todos pueden ver jobs globales
CREATE POLICY "Anyone can view global enrichment jobs"
ON public.global_enrichment_jobs
FOR SELECT
TO authenticated
USING (true);

-- Política: solo masters pueden crear/actualizar jobs globales
CREATE POLICY "Masters can manage global enrichment jobs"
ON public.global_enrichment_jobs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

-- Habilitar realtime para criterios y jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.enrichment_criteria;
ALTER PUBLICATION supabase_realtime ADD TABLE public.global_enrichment_jobs;