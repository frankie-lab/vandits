
-- Transport modes reference table
CREATE TABLE public.transport_modes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT '🚗',
  category text NOT NULL DEFAULT 'land',
  avg_speed_kmh double precision NOT NULL DEFAULT 60,
  cost_per_km double precision NOT NULL DEFAULT 0.15,
  base_cost double precision NOT NULL DEFAULT 0,
  setup_time_minutes integer NOT NULL DEFAULT 0,
  score_comfort integer NOT NULL DEFAULT 5 CHECK (score_comfort BETWEEN 1 AND 10),
  score_flexibility integer NOT NULL DEFAULT 5 CHECK (score_flexibility BETWEEN 1 AND 10),
  score_autonomy integer NOT NULL DEFAULT 5 CHECK (score_autonomy BETWEEN 1 AND 10),
  score_risk integer NOT NULL DEFAULT 5 CHECK (score_risk BETWEEN 1 AND 10),
  score_cargo integer NOT NULL DEFAULT 5 CHECK (score_cargo BETWEEN 1 AND 10),
  score_scenic integer NOT NULL DEFAULT 5 CHECK (score_scenic BETWEEN 1 AND 10),
  requires_license text[] DEFAULT '{}',
  max_range_km double precision,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.transport_modes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read transport modes"
  ON public.transport_modes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Masters can manage transport modes"
  ON public.transport_modes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role));

-- Travel profiles table
CREATE TABLE public.travel_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT '🧭',
  description text,
  weight_cost double precision NOT NULL DEFAULT 1.0,
  weight_time double precision NOT NULL DEFAULT 1.0,
  weight_flexibility double precision NOT NULL DEFAULT 1.0,
  weight_autonomy double precision NOT NULL DEFAULT 1.0,
  weight_comfort double precision NOT NULL DEFAULT 1.0,
  weight_risk double precision NOT NULL DEFAULT 1.0,
  weight_scenic double precision NOT NULL DEFAULT 1.0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.travel_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read travel profiles"
  ON public.travel_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Masters can manage travel profiles"
  ON public.travel_profiles FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role));
