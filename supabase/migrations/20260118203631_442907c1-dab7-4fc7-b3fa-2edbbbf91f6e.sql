-- Add validation radius field to curators
ALTER TABLE public.curators
ADD COLUMN validation_radius_meters integer DEFAULT 500;

-- Add comment to explain the field
COMMENT ON COLUMN public.curators.validation_radius_meters IS 'Maximum distance in meters for users to validate/review curator points';

-- Create curator location reviews table
CREATE TABLE public.curator_location_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  confirmed_exists boolean NOT NULL DEFAULT true,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  -- Each user can only review a location once
  CONSTRAINT unique_user_location_review UNIQUE (location_id, user_id)
);

-- Add comment to explain the table
COMMENT ON TABLE public.curator_location_reviews IS 'User reviews and validations for curator-managed locations';

-- Enable RLS
ALTER TABLE public.curator_location_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone authenticated can read reviews
CREATE POLICY "Authenticated users can read reviews"
ON public.curator_location_reviews
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Users can insert their own reviews
CREATE POLICY "Users can insert their own reviews"
ON public.curator_location_reviews
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own reviews
CREATE POLICY "Users can update their own reviews"
ON public.curator_location_reviews
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete their own reviews"
ON public.curator_location_reviews
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_curator_location_reviews_updated_at
BEFORE UPDATE ON public.curator_location_reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_curator_location_reviews_location ON public.curator_location_reviews(location_id);
CREATE INDEX idx_curator_location_reviews_user ON public.curator_location_reviews(user_id);