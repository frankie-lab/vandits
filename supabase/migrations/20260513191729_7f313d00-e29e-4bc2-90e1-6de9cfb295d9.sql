-- PR-OWNER-IDENTITY-2: persistent perceptual identity allocation (OKLCH maximin)
-- Add OKLCH columns to user_owner_color_assignments and backfill from v1 indices.

ALTER TABLE public.user_owner_color_assignments
  ADD COLUMN IF NOT EXISTS oklch_l double precision,
  ADD COLUMN IF NOT EXISTS oklch_c double precision,
  ADD COLUMN IF NOT EXISTS oklch_h double precision,
  ADD COLUMN IF NOT EXISTS degraded boolean NOT NULL DEFAULT false;

-- color_index becomes nullable (legacy v1). New v2 rows write OKLCH directly.
ALTER TABLE public.user_owner_color_assignments
  ALTER COLUMN color_index DROP NOT NULL;

-- Backfill v1 → v2 OKLCH preserving exact visual color (no reassignment).
-- Values precomputed from HSL palette via OKLab math.
UPDATE public.user_owner_color_assignments
SET
  oklch_l = CASE color_index
    WHEN 0 THEN 0.6531 WHEN 1 THEN 0.6081 WHEN 2 THEN 0.5755 WHEN 3 THEN 0.5716
    WHEN 4 THEN 0.5012 WHEN 5 THEN 0.4607 WHEN 6 THEN 0.5541 WHEN 7 THEN 0.5446
  END,
  oklch_c = CASE color_index
    WHEN 0 THEN 0.1203 WHEN 1 THEN 0.1395 WHEN 2 THEN 0.1537 WHEN 3 THEN 0.1737
    WHEN 4 THEN 0.1906 WHEN 5 THEN 0.2129 WHEN 6 THEN 0.1745 WHEN 7 THEN 0.1877
  END,
  oklch_h = CASE color_index
    WHEN 0 THEN 227.19 WHEN 1 THEN 245.38 WHEN 2 THEN 252.47 WHEN 3 THEN 262.35
    WHEN 4 THEN 269.54 WHEN 5 THEN 270.83 WHEN 6 THEN 291.14 WHEN 7 THEN 299.25
  END,
  palette_version = 'owner-v2-oklch'
WHERE palette_version = 'owner-v1' AND color_index IS NOT NULL AND oklch_l IS NULL;

-- Validation constraint for OKLCH ranges (only when populated).
ALTER TABLE public.user_owner_color_assignments
  DROP CONSTRAINT IF EXISTS user_owner_color_assignments_oklch_check;
ALTER TABLE public.user_owner_color_assignments
  ADD CONSTRAINT user_owner_color_assignments_oklch_check
  CHECK (
    oklch_l IS NULL OR (oklch_l >= 0 AND oklch_l <= 1
      AND oklch_c >= 0 AND oklch_c <= 0.5
      AND oklch_h >= 0 AND oklch_h < 360)
  );