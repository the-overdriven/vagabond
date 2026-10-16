-- Run after supabase-highscores.sql in Supabase SQL Editor as the database owner.
-- Uses only Highscores objects; leaves the Graveyard hook and config untouched.
-- Highscores gets an independent quota of 60 committed write requests/hour/IP.
BEGIN;

DO $check$
BEGIN
  IF pg_catalog.to_regclass('public.highscore_records') IS NULL THEN
    RAISE EXCEPTION 'Run supabase-highscores.sql first';
  END IF;
  IF pg_catalog.to_regprocedure('extensions.hmac(bytea,bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'pgcrypto must be enabled in the extensions schema';
  END IF;
  -- An earlier draft modified the Graveyard hook. Refuse double counting if
  -- that draft was already applied; restore it with the supplied repair first.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.proname = 'limit_graveyard_writes'
      AND p.pronargs = 0 AND p.prosrc LIKE '%private.highscore_rate_limits%') THEN
    RAISE EXCEPTION 'Earlier combined hook detected: run supabase-highscores-restore-graveyard.sql first';
  END IF;
END;
$check$;

CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.highscore_secret (
  id integer PRIMARY KEY CHECK (id = 1),
  secret text NOT NULL
);
INSERT INTO private.highscore_secret (id, secret)
  VALUES (1, pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'))
  ON CONFLICT (id) DO NOTHING;
ALTER TABLE private.highscore_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.highscore_secret FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.highscore_rate_limits (
  source_hash bytea NOT NULL,
  hour_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 60),
  PRIMARY KEY (source_hash, hour_start)
);

ALTER TABLE private.highscore_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.highscore_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.limit_highscore_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  ip text;
  hash bytea;
  accepted integer;
BEGIN
  ip := pg_catalog.btrim(pg_catalog.split_part(
    coalesce(pg_catalog.current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''), ',', 1));
  IF ip = '' THEN
    RAISE SQLSTATE 'PGRST' USING message = '{"message":"Missing client address"}', detail = '{"status":403}';
  END IF;
  PERFORM ip::inet;
  SELECT extensions.hmac(
    pg_catalog.convert_to(ip, 'UTF8'),
    pg_catalog.convert_to(secret, 'UTF8'), 'sha256')
    INTO hash FROM private.highscore_secret WHERE id = 1;
  IF hash IS NULL THEN
    RAISE EXCEPTION 'Highscores rate limit is not configured';
  END IF;

  DELETE FROM private.highscore_rate_limits
    WHERE hour_start < date_trunc('hour', now(), 'UTC') - interval '2 hours';
  INSERT INTO private.highscore_rate_limits (source_hash, hour_start, attempts)
    VALUES (hash, date_trunc('hour', now(), 'UTC'), 1)
    ON CONFLICT (source_hash, hour_start)
    DO UPDATE SET attempts = private.highscore_rate_limits.attempts + 1
      WHERE private.highscore_rate_limits.attempts < 60
    RETURNING attempts INTO accepted;

  IF accepted IS NULL THEN
    RAISE SQLSTATE 'PGRST' USING message = '{"message":"Rate limit exceeded"}', detail = '{"status":429}';
  END IF;
  RETURN NULL; -- Statement trigger; the return value is ignored.
END;
$function$;

REVOKE ALL ON FUNCTION private.limit_highscore_writes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS highscore_write_limit ON public.highscore_records;
CREATE TRIGGER highscore_write_limit BEFORE INSERT ON public.highscore_records
  FOR EACH STATEMENT EXECUTE FUNCTION private.limit_highscore_writes();

ALTER TABLE public.highscore_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.highscore_records FROM PUBLIC, anon, authenticated;

GRANT INSERT (
  character_id, player_id, character_name, race, permadeath, level,
  atk, def, spd, grace, max_hp, mf, cumulated_xp, gold, death_number,
  steps_taken, creatures_slain, weapon, armor, shield, equipment, artifacts,
  strongest_enemy_killed, world_seed, world_size, world_traits, game_version
) ON TABLE public.highscore_records TO anon, authenticated;

DROP POLICY IF EXISTS highscore_client_insert ON public.highscore_records;
CREATE POLICY highscore_client_insert ON public.highscore_records
  FOR INSERT TO anon, authenticated WITH CHECK (true);

COMMENT ON TABLE public.highscore_records IS
  'Immutable level-up achievements. Browser roles may insert payload fields only; reads use highscores_top_ten. Writes use a dedicated Highscores trigger and quota.';

NOTIFY pgrst, 'reload schema';
COMMIT;
