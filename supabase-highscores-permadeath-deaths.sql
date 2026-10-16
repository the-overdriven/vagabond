-- Apply once to the existing Supabase project, before deploying the v114 client.
-- Requires the original Graveyard table and the Highscores foundation + write
-- migration. Does not replace the existing Graveyard pre-request hook, triggers,
-- RLS policies, quota counters or the non-permadeath Highscores RPC.
BEGIN;

-- Old Graveyard rows retain NULL; their character identity cannot be proven
-- from names or the browser-wide player_id.
ALTER TABLE public.death_records
  ADD COLUMN IF NOT EXISTS character_id text;
ALTER TABLE public.death_records
  ADD CONSTRAINT death_character_id_format_check CHECK (
    character_id IS NULL OR char_length(character_id) BETWEEN 1 AND 200
  );

-- The existing Graveyard insert policy and rate limit still apply. Grant only
-- this new client payload column; no raw reads/updates/deletes are granted.
GRANT INSERT (character_id) ON TABLE public.death_records TO anon, authenticated;

-- Lookup by character ID, but index only permadeath records, since normal-mode
-- leaderboards must not consult Graveyard at all.
CREATE INDEX death_permadeath_character_id_idx
  ON public.death_records (character_id)
  WHERE permadeath IS TRUE AND character_id IS NOT NULL;

-- Separate bounded RPC: retain highscores_top_ten(boolean) exactly as deployed.
-- It first resolves the top ten; only those rows get indexed death lookups.
CREATE FUNCTION public.highscores_permadeath_top_ten()
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  character_id text,
  player_id uuid,
  character_name text,
  race text,
  permadeath boolean,
  level integer,
  atk numeric,
  def numeric,
  spd numeric,
  grace numeric,
  strength numeric,
  max_hp numeric,
  mf numeric,
  cumulated_xp bigint,
  gold bigint,
  death_number bigint,
  steps_taken bigint,
  creatures_slain bigint,
  weapon text,
  armor text,
  shield text,
  equipment jsonb,
  artifacts jsonb,
  strongest_enemy_killed jsonb,
  world_seed bigint,
  world_size text,
  world_traits jsonb,
  game_version text,
  is_dead boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH top_ten AS MATERIALIZED (
    SELECT * FROM public.highscores_top_ten(true)
  )
  SELECT top_ten.*,
    EXISTS (
      SELECT 1 FROM public.death_records AS d
      WHERE d.character_id = top_ten.character_id
        AND d.permadeath IS TRUE
    ) AS is_dead
  FROM top_ten
  ORDER BY top_ten.level DESC, top_ten.strength DESC,
    top_ten.created_at ASC, top_ten.id ASC;
$function$;

REVOKE ALL ON FUNCTION public.highscores_permadeath_top_ten() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.highscores_permadeath_top_ten() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
