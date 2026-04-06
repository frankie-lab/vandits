
-- Create enum for stop types
CREATE TYPE public.route_stop_type AS ENUM (
  'overnight',
  'port',
  'airport',
  'refuel',
  'rest',
  'scenic',
  'custom'
);

-- Create route_stops table
CREATE TABLE public.route_stops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  stop_type route_stop_type NOT NULL DEFAULT 'rest',
  icon TEXT,
  arrival_estimate TEXT,
  departure_estimate TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create route_day_stages table
CREATE TABLE public.route_day_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  start_latitude DOUBLE PRECISION NOT NULL,
  start_longitude DOUBLE PRECISION NOT NULL,
  start_name TEXT NOT NULL,
  end_latitude DOUBLE PRECISION NOT NULL,
  end_longitude DOUBLE PRECISION NOT NULL,
  end_name TEXT NOT NULL,
  distance_meters DOUBLE PRECISION,
  duration_seconds DOUBLE PRECISION,
  overnight_stop_id UUID REFERENCES public.route_stops(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_day_stages ENABLE ROW LEVEL SECURITY;

-- RLS for route_stops
CREATE POLICY "Users can read stops of their routes"
  ON public.route_stops FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_stops.route_id
    AND (r.user_id = auth.uid()
      OR r.visibility = 'public'
      OR (r.visibility = 'followers' AND EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = auth.uid() AND following_id = r.user_id AND status = 'accepted'
      ))
    )
  ));

CREATE POLICY "Users can insert stops in their routes"
  ON public.route_stops FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.routes WHERE id = route_stops.route_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can update stops in their routes"
  ON public.route_stops FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.routes WHERE id = route_stops.route_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can delete stops in their routes"
  ON public.route_stops FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.routes WHERE id = route_stops.route_id AND user_id = auth.uid()
  ));

-- RLS for route_day_stages
CREATE POLICY "Users can read day stages of their routes"
  ON public.route_day_stages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_day_stages.route_id
    AND (r.user_id = auth.uid()
      OR r.visibility = 'public'
      OR (r.visibility = 'followers' AND EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = auth.uid() AND following_id = r.user_id AND status = 'accepted'
      ))
    )
  ));

CREATE POLICY "Users can insert day stages in their routes"
  ON public.route_day_stages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.routes WHERE id = route_day_stages.route_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can update day stages in their routes"
  ON public.route_day_stages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.routes WHERE id = route_day_stages.route_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can delete day stages in their routes"
  ON public.route_day_stages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.routes WHERE id = route_day_stages.route_id AND user_id = auth.uid()
  ));

-- Triggers for updated_at
CREATE TRIGGER update_route_stops_updated_at
  BEFORE UPDATE ON public.route_stops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_route_day_stages_updated_at
  BEFORE UPDATE ON public.route_day_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_route_stops_route_id ON public.route_stops(route_id);
CREATE INDEX idx_route_stops_type ON public.route_stops(stop_type);
CREATE INDEX idx_route_day_stages_route_id ON public.route_day_stages(route_id);
CREATE INDEX idx_route_day_stages_day_number ON public.route_day_stages(route_id, day_number);
