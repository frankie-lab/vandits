
-- 1. Ampliar transport_modes con nuevos campos
ALTER TABLE public.transport_modes 
  ADD COLUMN IF NOT EXISTS is_motorized boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_schedule boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_booking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allows_cargo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS supports_sleep boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_passengers integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS overhead_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_restrictions integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS score_load_capacity integer NOT NULL DEFAULT 5;

-- 2. Ampliar travel_profiles
ALTER TABLE public.travel_profiles
  ADD COLUMN IF NOT EXISTS weight_load double precision NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS weight_restrictions double precision NOT NULL DEFAULT 1.0;

-- 3. Crear cost_categories
CREATE TABLE public.cost_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT '💰',
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cost categories"
  ON public.cost_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Masters can manage cost categories"
  ON public.cost_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role));

-- 4. Crear transport_mode_costs
CREATE TABLE public.transport_mode_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_mode_id uuid NOT NULL REFERENCES public.transport_modes(id) ON DELETE CASCADE,
  cost_category_id uuid NOT NULL REFERENCES public.cost_categories(id) ON DELETE CASCADE,
  cost_per_km double precision NOT NULL DEFAULT 0,
  base_cost double precision NOT NULL DEFAULT 0,
  notes text,
  is_estimated boolean NOT NULL DEFAULT true,
  api_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(transport_mode_id, cost_category_id)
);

ALTER TABLE public.transport_mode_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read transport mode costs"
  ON public.transport_mode_costs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Masters can manage transport mode costs"
  ON public.transport_mode_costs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role));

-- 5. Crear route_analyses
CREATE TABLE public.route_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid REFERENCES public.routes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  profile_code text NOT NULL,
  weights_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget_max double precision,
  time_max_hours double precision,
  excluded_modes text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.route_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own analyses"
  ON public.route_analyses FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own analyses"
  ON public.route_analyses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own analyses"
  ON public.route_analyses FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 6. Crear route_analysis_alternatives
CREATE TABLE public.route_analysis_alternatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.route_analyses(id) ON DELETE CASCADE,
  rank integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  total_cost double precision NOT NULL DEFAULT 0,
  total_time_hours double precision NOT NULL DEFAULT 0,
  total_distance_km double precision NOT NULL DEFAULT 0,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  modes_used text[] DEFAULT '{}',
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.route_analysis_alternatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read alternatives of their analyses"
  ON public.route_analysis_alternatives FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.route_analyses ra
    WHERE ra.id = route_analysis_alternatives.analysis_id
    AND ra.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert alternatives for their analyses"
  ON public.route_analysis_alternatives FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.route_analyses ra
    WHERE ra.id = route_analysis_alternatives.analysis_id
    AND ra.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete alternatives of their analyses"
  ON public.route_analysis_alternatives FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.route_analyses ra
    WHERE ra.id = route_analysis_alternatives.analysis_id
    AND ra.user_id = auth.uid()
  ));
