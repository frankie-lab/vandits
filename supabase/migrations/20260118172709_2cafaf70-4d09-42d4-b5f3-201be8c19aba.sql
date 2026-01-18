-- Step 1: Add 'curator' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'curator';