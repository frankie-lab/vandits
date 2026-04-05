
CREATE TABLE public.airports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ident text NOT NULL UNIQUE,
  iata_code text,
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  elevation_ft integer,
  type text NOT NULL DEFAULT 'medium_airport',
  continent text,
  iso_country text,
  iso_region text,
  municipality text,
  scheduled_service boolean NOT NULL DEFAULT true,
  wikipedia_link text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_airports_lat ON public.airports (latitude);
CREATE INDEX idx_airports_lng ON public.airports (longitude);
CREATE INDEX idx_airports_iata ON public.airports (iata_code) WHERE iata_code IS NOT NULL;
CREATE INDEX idx_airports_country ON public.airports (iso_country);

ALTER TABLE public.airports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read airports"
  ON public.airports FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Masters can manage airports"
  ON public.airports FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role));
