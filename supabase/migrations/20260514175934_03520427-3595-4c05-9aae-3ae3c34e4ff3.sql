create or replace function public.increment_image_recovery_progress(
  _job_id uuid,
  _scanned_delta int,
  _updated_delta int,
  _skipped_delta int,
  _failed_delta int,
  _item jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
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
     set scanned     = coalesce(scanned, 0) + coalesce(_scanned_delta, 0),
         updated     = coalesce(updated, 0) + coalesce(_updated_delta, 0),
         skipped     = coalesce(skipped, 0) + coalesce(_skipped_delta, 0),
         failed      = coalesce(failed, 0)  + coalesce(_failed_delta, 0),
         recent_items = _new_recent,
         remaining   = case
                         when total_in_scope is not null
                           then greatest(0, total_in_scope - (coalesce(scanned, 0) + coalesce(_scanned_delta, 0)))
                         else remaining
                       end,
         last_tick_at = now()
   where id = _job_id;
end;
$$;