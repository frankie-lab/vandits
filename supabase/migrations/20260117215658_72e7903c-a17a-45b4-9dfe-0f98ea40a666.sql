
-- Tabla de definiciones de logros (editable por master)
CREATE TABLE public.achievement_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT '🏆',
  category text NOT NULL DEFAULT 'general',
  levels jsonb NOT NULL DEFAULT '[
    {"level": 1, "name": "Bronce", "threshold": 1, "icon": "🥉"},
    {"level": 2, "name": "Plata", "threshold": 10, "icon": "🥈"},
    {"level": 3, "name": "Oro", "threshold": 50, "icon": "🥇"},
    {"level": 4, "name": "Platino", "threshold": 100, "icon": "💎"},
    {"level": 5, "name": "Diamante", "threshold": 500, "icon": "👑"}
  ]'::jsonb,
  metric_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabla de logros de usuarios
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_code text NOT NULL REFERENCES public.achievement_definitions(code) ON DELETE CASCADE,
  current_level integer NOT NULL DEFAULT 0,
  progress_count integer NOT NULL DEFAULT 0,
  unlocked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_code)
);

-- Añadir pioneer_user_id a locations para marcar al primer usuario
ALTER TABLE public.locations ADD COLUMN pioneer_user_id uuid REFERENCES auth.users(id);

-- Índices
CREATE INDEX idx_user_achievements_user ON public.user_achievements(user_id);
CREATE INDEX idx_user_achievements_code ON public.user_achievements(achievement_code);
CREATE INDEX idx_locations_pioneer ON public.locations(pioneer_user_id);
CREATE INDEX idx_achievement_definitions_active ON public.achievement_definitions(is_active, sort_order);

-- RLS para achievement_definitions
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active achievements"
ON public.achievement_definitions FOR SELECT
USING (is_active = true OR has_role(auth.uid(), 'master'));

CREATE POLICY "Masters can manage achievement definitions"
ON public.achievement_definitions FOR ALL
USING (has_role(auth.uid(), 'master'));

-- RLS para user_achievements
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all achievements"
ON public.user_achievements FOR SELECT
USING (true);

CREATE POLICY "System can manage user achievements"
ON public.user_achievements FOR ALL
USING (user_id = auth.uid() OR has_role(auth.uid(), 'master'));

-- Trigger para updated_at
CREATE TRIGGER update_achievement_definitions_updated_at
BEFORE UPDATE ON public.achievement_definitions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_achievements_updated_at
BEFORE UPDATE ON public.user_achievements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
