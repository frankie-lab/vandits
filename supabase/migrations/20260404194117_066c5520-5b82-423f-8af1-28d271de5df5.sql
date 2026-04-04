-- Add sub_category to transport_modes for better grouping
ALTER TABLE public.transport_modes 
ADD COLUMN IF NOT EXISTS sub_category text NOT NULL DEFAULT 'autonomous';

-- Add is_complementary flag to distinguish main vs auxiliary transport
ALTER TABLE public.transport_modes 
ADD COLUMN IF NOT EXISTS is_complementary boolean NOT NULL DEFAULT false;

-- Add priority_ranking to profiles (ordered array of priority codes)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS priority_ranking jsonb DEFAULT '["cost","time","comfort","scenic","flexibility","adventure"]'::jsonb;