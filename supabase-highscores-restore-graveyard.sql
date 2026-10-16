-- ONLY if the previous combined-hook draft was already applied.
-- Restores the exact Graveyard logic supplied for this project. No data removed.
BEGIN;
DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.proname = 'limit_graveyard_writes'
      AND p.pronargs = 0 AND p.prosrc LIKE '%private.highscore_rate_limits%') THEN
    RAISE EXCEPTION 'Earlier combined Highscores hook not detected; no repair is needed';
  END IF;
END;
$check$;
CREATE OR REPLACE FUNCTION private.limit_graveyard_writes()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  ip text;
  hash bytea;
  accepted integer;
begin
  if current_setting('request.method', true) is distinct from 'POST'
     or trim(both '/' from current_setting('request.path', true)) <> 'death_records' then
    return;
  end if;
  ip := btrim(split_part(
    coalesce(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''), ',', 1));
  if ip = '' then
    raise sqlstate 'PGRST' using message = '{"message":"Missing client address"}', detail = '{"status":403}';
  end if;
  perform ip::inet;
  select extensions.hmac(
    pg_catalog.convert_to(ip, 'UTF8'),
    pg_catalog.convert_to(secret, 'UTF8'), 'sha256')
    into hash from private.graveyard_secret where id = 1;
  if hash is null then
    raise exception 'Graveyard rate limit is not configured';
  end if;
  delete from private.graveyard_rate_limits
    where hour_start < date_trunc('hour', now()) - interval '2 hours';
  insert into private.graveyard_rate_limits (source_hash, hour_start, attempts)
    values (hash, date_trunc('hour', now()), 1)
    on conflict (source_hash, hour_start)
    do update set attempts = private.graveyard_rate_limits.attempts + 1
      where private.graveyard_rate_limits.attempts < 20
    returning attempts into accepted;
  if accepted is null then
    raise sqlstate 'PGRST' using message = '{"message":"Rate limit exceeded"}', detail = '{"status":429}';
  end if;
end;
$function$;
COMMIT;
