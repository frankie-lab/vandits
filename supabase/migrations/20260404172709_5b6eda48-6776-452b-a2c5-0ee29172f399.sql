
-- Create transport mode enum
CREATE TYPE public.transport_mode AS ENUM ('walking', 'driving', 'flight', 'ferry');

-- Create route status enum
CREATE TYPE public.route_status AS ENUM ('draft', 'completed');

-- Create routes table
CREATE TABLE public.routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  status public.route_status NOT NULL DEFAULT 'draft',
  total_distance_meters DOUBLE PRECISION,
  total_duration_seconds DOUBLE PRECISION,
  route_geometry JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create route_waypoints table
CREATE TABLE public.route_waypoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  transport_mode public.transport_mode NOT NULL DEFAULT 'driving',
  segment_geometry JSONB,
  segment_distance_meters DOUBLE PRECISION,
  segment_duration_seconds DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(route_id, position)
);

-- Enable RLS
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_waypoints ENABLE ROW LEVEL SECURITY;

-- Routes RLS policies
CREATE POLICY "Users can read their own routes"
ON public.routes FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can read public routes"
ON public.routes FOR SELECT
USING (visibility = 'public');

CREATE POLICY "Users can read follower routes"
ON public.routes FOR SELECT
USING (
  visibility = 'followers'
  AND EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = auth.uid()
    AND following_id = routes.user_id
    AND status = 'accepted'
  )
);

CREATE POLICY "Users can insert their own routes"
ON public.routes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own routes"
ON public.routes FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own routes"
ON public.routes FOR DELETE
USING (auth.uid() = user_id);

-- Route waypoints RLS policies (inherit from route visibility)
CREATE POLICY "Users can read waypoints of visible routes"
ON public.route_waypoints FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_waypoints.route_id
    AND (
      r.user_id = auth.uid()
      OR r.visibility = 'public'
      OR (r.visibility = 'followers' AND EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = auth.uid()
        AND following_id = r.user_id
        AND status = 'accepted'
      ))
    )
  )
);

CREATE POLICY "Users can insert waypoints in their routes"
ON public.route_waypoints FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.routes
    WHERE id = route_waypoints.route_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can update waypoints in their routes"
ON public.route_waypoints FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.routes
    WHERE id = route_waypoints.route_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete waypoints in their routes"
ON public.route_waypoints FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.routes
    WHERE id = route_waypoints.route_id
    AND user_id = auth.uid()
  )
);

-- Triggers for updated_at
CREATE TRIGGER update_routes_updated_at
BEFORE UPDATE ON public.routes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_route_waypoints_updated_at
BEFORE UPDATE ON public.route_waypoints
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_routes_user_id ON public.routes(user_id);
CREATE INDEX idx_route_waypoints_route_id ON public.route_waypoints(route_id);
CREATE INDEX idx_route_waypoints_location_id ON public.route_waypoints(location_id);
