// Disposable PostgreSQL engine; never connects to the live Supabase project.
// Install @electric-sql/pglite@0.5.10, then run:
// node tests/highscores-database-check.cjs
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {PGlite} = require('@electric-sql/pglite')

test('Highscores PostgreSQL migration, ranking, constraints and anonymous permissions', async t => {
  const db = new PGlite()
  const insertSql = `INSERT INTO public.highscore_records
    (character_id, character_name, race, permadeath, level, atk, def, spd, grace,
      created_at, game_version, world_seed)
    VALUES ($1, $2, 'human', $3, $4, $5, 0, 1, 0, $6::timestamptz, 'v106', -2147483648)
    RETURNING *`
  const add = async (character, level, strength, mode = false, time = '2026-10-15T12:00:00Z', name = 'Same Name') => {
    const result = await db.query(insertSql, [character,name,mode,level,strength-1,time])
    return result.rows[0]
  }
  const board = async (mode = false) => (await db.query(
    'SELECT * FROM public.highscores_top_ten($1)', [mode])).rows
  const expectError = async (sql, params, code) => {
    await assert.rejects(db.query(sql, params), error => error.code === code)
  }
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; GRANT USAGE ON SCHEMA public TO anon, authenticated;')
    await db.exec("SET pgrst.db_pre_request = 'private.existing_graveyard_hook'")
    const migration = fs.readFileSync(path.join(__dirname, '../supabase-highscores.sql'), 'utf8')
    await db.exec(migration)

    await t.test('migration does not install or replace the Graveyard request hook', async () => {
      const result = await db.query("SELECT current_setting('pgrst.db_pre_request', true) AS hook")
      assert.equal(result.rows[0].hook, 'private.existing_graveyard_hook')
      assert.doesNotMatch(migration, /ALTER\s+(?:ROLE|DATABASE)\s/i)
    })

    await t.test('empty/partial boards and signed world seeds are valid', async () => {
      assert.equal((await board()).length, 0)
      const record = await add('low',2,4.125)
      assert.equal(Number(record.strength), 4.125)
      assert.equal(Number(record.world_seed), -2147483648)
      assert.equal((await board()).length, 1)
      assert.equal((await board(true)).length, 0)
    })

    await t.test('deduplication precedes limit and chooses the latest level, not strongest gear', async () => {
      for (let level = 2; level <= 13; level++) await add('many-milestones',level,level === 2 ? 999 : 2)
      for (let i = 0; i < 12; i++) await add(`other-${i}`,3+i,10+i)
      await add('permadeath-only',99,999,true)
      const rows = await board()
      assert.equal(rows.length, 10)
      assert.equal(new Set(rows.map(r=>r.character_id)).size, 10)
      const milestone = rows.find(r=>r.character_id === 'many-milestones')
      assert.equal(milestone.level, 13)
      assert.equal(Number(milestone.strength), 2)
      assert.equal(rows.some(r=>r.character_id === 'permadeath-only'), false)
      assert.equal((await board(true))[0].character_id, 'permadeath-only')
      assert.equal(rows.every(r=>r.character_name === 'Same Name'), true)
    })

    await t.test('numeric fractional score beats an earlier equal-level score', async () => {
      await add('tie-earlier',50,10.001,true,'2026-10-15T10:00:00Z')
      await add('tie-stronger',50,10.002,true,'2026-10-15T11:00:00Z')
      await add('tie-weaker',50,10,true,'2026-10-15T09:00:00Z')
      const rows = (await board(true)).filter(r=>r.level === 50)
      assert.deepEqual(rows.map(r=>r.character_id), ['tie-stronger','tie-earlier','tie-weaker'])
    })

    await t.test('timestamp microseconds settle exact ties and UUID settles equal timestamps', async () => {
      // Return timestamp text from SQL to avoid JS Date losing microseconds.
      const a = await add('micro-earlier',51,10,true,'2026-10-15T10:00:00.000001Z')
      const b = await add('micro-later',51,10,true,'2026-10-15T10:00:00.000002Z')
      const c = await add('micro-equal',51,10,true,'2026-10-15T10:00:00.000001Z')
      const expected = [a,c].sort((x,y)=>x.id<y.id?-1:1).map(r=>r.id).concat(b.id)
      assert.deepEqual((await board(true)).filter(r=>r.level===51).map(r=>r.id), expected)
    })

    await t.test('duplicate milestone cannot replace gear or create a second mode record', async () => {
      await expectError(insertSql, ['low','Changed','false',2,999,'2026-10-15T12:00:00Z'], '23505')
      await expectError(insertSql, ['low','Changed',true,2,999,'2026-10-15T12:00:00Z'], '23505')
      const rows = (await db.query("SELECT * FROM public.highscore_records WHERE character_id = 'low'")).rows
      assert.equal(rows.length, 1)
      assert.equal(Number(rows[0].strength), 4.125)
    })

    await t.test('invalid stats, score overrides, names, modes and oversized JSON are rejected', async () => {
      const base = `INSERT INTO public.highscore_records
        (character_id,character_name,race,permadeath,level,atk,def,spd,grace,game_version)
        VALUES ('invalid','Name','human',false,2,1,0,1,0,'v106')`
      for (const bad of ["'NaN'::numeric", "'Infinity'::numeric", "'-Infinity'::numeric", '1000000001']) {
        await expectError(base.replace("2,1,0,1,0,'v106'", `2,${bad},0,1,0,'v106'`), [], '23514')
      }
      await expectError(base.replace("false,2,1", "false,1,1"), [], '23514')
      await expectError(base.replace("false,2,1", "NULL,2,1"), [], '23502')
      await expectError(base.replace("'Name'", "'   '"), [], '23514')
      await expectError(base.replace("'human'", "'unknown'"), [], '23514')
      await expectError(base.replace("1,0,1,0,'v106'", "1,0,0,0,'v106'"), [], '23514')
      await expectError(base.replace('game_version)', 'game_version,strength)')
        .replace("'v106')", "'v106',999)"), [], '428C9')
      await expectError(base.replace('game_version)', 'game_version,equipment)')
        .replace("'v106')", "'v106','[]'::jsonb)"), [], '23514')
      await expectError(base.replace('game_version)', 'game_version,world_traits)')
        .replace("'v106')", "'v106',jsonb_build_array(repeat('x',40000)))"), [], '23514')
    })

    await t.test('multi-row inserts fail atomically', async () => {
      await expectError(`INSERT INTO public.highscore_records
        (character_id,character_name,race,permadeath,level,atk,def,spd,grace,game_version)
        VALUES ('batch-a','A','human',false,2,1,0,1,0,'v106'),
               ('batch-b','B','human',false,2,1,0,1,0,'v106')`, [], '23514')
      assert.equal((await db.query("SELECT count(*)::integer AS n FROM public.highscore_records WHERE character_id LIKE 'batch-%'")).rows[0].n, 0)
    })

    await t.test('anon/authenticated can read only bounded RPC, never raw table or writes', async () => {
      for (const role of ['anon','authenticated']) {
        await db.exec(`SET ROLE ${role}`)
        try {
          assert.equal((await board()).length, 10)
          assert.equal((await board(true)).every(r=>r.permadeath), true)
          assert.equal((await db.query('SELECT * FROM public.highscores_top_ten(NULL)')).rows.length, 0)
          for (const sql of [
            'SELECT * FROM public.highscore_records',
            "UPDATE public.highscore_records SET atk = 999",
            'DELETE FROM public.highscore_records',
            'TRUNCATE public.highscore_records',
            'SELECT public.highscores_single_row_insert()'
          ]) await expectError(sql, [], '42501')
          await expectError(insertSql, ['blocked','Blocked',false,2,1,'2026-10-15T12:00:00Z'], '42501')
        } finally { await db.exec('RESET ROLE') }
      }
    })
  } finally { await db.close() }
})
