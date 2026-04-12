
-- Create personal categories table
CREATE TABLE public.personal_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📍',
  color TEXT NOT NULL DEFAULT '#6b7280',
  is_shared BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: user can't have two categories with the same name
CREATE UNIQUE INDEX idx_personal_categories_user_name ON public.personal_categories (user_id, name);

-- Enable RLS
ALTER TABLE public.personal_categories ENABLE ROW LEVEL SECURITY;

-- Users can see their own categories
CREATE POLICY "Users can read their own categories"
  ON public.personal_categories FOR SELECT
  USING (auth.uid() = user_id);

-- Users can see shared categories from users they follow
CREATE POLICY "Users can read shared categories from followed users"
  ON public.personal_categories FOR SELECT
  USING (
    is_shared = true
    AND EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid()
        AND following_id = personal_categories.user_id
        AND status = 'accepted'
    )
  );

-- Users can create their own categories
CREATE POLICY "Users can create their own categories"
  ON public.personal_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own categories
CREATE POLICY "Users can update their own categories"
  ON public.personal_categories FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own categories
CREATE POLICY "Users can delete their own categories"
  ON public.personal_categories FOR DELETE
  USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE TRIGGER update_personal_categories_updated_at
  BEFORE UPDATE ON public.personal_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add personal_category_id to locations table
ALTER TABLE public.locations
  ADD COLUMN personal_category_id UUID REFERENCES public.personal_categories(id) ON DELETE SET NULL;
