-- Add no_image counter to image_recovery_jobs to separate "no image found"
-- (correct technical outcome, no fix needed) from "failed" (technical error).

ALTER TABLE public.image_recovery_jobs
  ADD COLUMN IF NOT EXISTS no_image integer NOT NULL DEFAULT 0;

-- Drop and recreate RPC with the new _no_image_delta parameter (signature change).
DROP FUNCTION IF EXISTS public.increment_image_recovery_progress(uuid, integer, integer, integer, integer, jsonb);

CREATE OR REPLACE FUNCTION public.increment_image_recovery_progress(
  _job_id uuid,
  _scanned_delta integer,
  _updated_delta integer,
  _no_image_delta integer,
  _skipped_delta integer,
  _failed_delta integer,
  _item jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _new_recent jsonb;
begin
  if _item is not null and _item <> 'null'::jsonb then
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
      into _new_recent
      from (
        select elem
          from jsonb_array_elements(
            jsonb_build_array(_item) ||
            coalesce((select recent_items from public.image_recovery_jobs where id = _job_id), '[]'::jsonb)
          ) elem
        limit 30
      ) s;
  else
    _new_recent := (select recent_items from public.image_recovery_jobs where id = _job_id);
  end if;

  update public.image_recovery_jobs
     set scanned      = coalesce(scanned, 0)  + coalesce(_scanned_delta, 0),
         updated      = coalesce(updated, 0)  + coalesce(_updated_delta, 0),
         no_image     = coalesce(no_image, 0) + coalesce(_no_image_delta, 0),
         skipped      = coalesce(skipped, 0)  + coalesce(_skipped_delta, 0),
         failed       = coalesce(failed, 0)   + coalesce(_failed_delta, 0),
         recent_items = _new_recent,
         remaining    = case
                          when total_in_scope is not null
                            then greatest(0, total_in_scope - (coalesce(scanned, 0) + coalesce(_scanned_delta, 0)))
                          else remaining
                        end,
         last_tick_at = now()
   where id = _job_id;
end;
$function$;