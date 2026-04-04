
UPDATE public.transport_modes SET
  score_flexibility = 3,
  score_autonomy = 4,
  score_scenic = 4,
  score_restrictions = 8,
  score_load_capacity = 4
WHERE code = 'private_plane';

UPDATE public.transport_modes SET
  score_flexibility = 3,
  score_autonomy = 2,
  score_scenic = 3,
  score_restrictions = 4
WHERE code = 'airline';

UPDATE public.transport_modes SET
  score_flexibility = 4,
  score_autonomy = 3
WHERE code = 'rental_boat';

UPDATE public.transport_modes SET
  score_flexibility = 3,
  score_autonomy = 2,
  score_scenic = 5
WHERE code = 'ferry';
