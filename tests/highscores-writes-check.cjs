// Disposable PostgreSQL/pgcrypto verification. Never connects to Supabase.
// Run: node --test tests/highscores-writes-check.cjs
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto')
const root=path.join(__dirname,'..')
const foundation=fs.readFileSync(path.join(root,'supabase-highscores.sql'),'utf8')
const migration=fs.readFileSync(path.join(root,'supabase-highscores-enable-writes.sql'),'utf8')
const repair=fs.readFileSync(path.join(root,'supabase-highscores-restore-graveyard.sql'),'utf8')
const earlier=fs.readFileSync(path.join(__dirname,'support/highscores-combined-hook-fixture.sql'),'utf8')
const fixture=fs.readFileSync(path.join(__dirname,'support/graveyard-rate-limit-fixture.sql'),'utf8')

test('Highscores write migration with the deployed Graveyard hook and real HMAC',async t=>{
  const db=new PGlite({extensions:{pgcrypto}})
  let serial=0
  const record=(overrides={})=>({character_id:`character-${++serial}`,player_id:null,
    character_name:'Tester',race:'elf',permadeath:false,level:2,atk:2.25,def:1.5,spd:4,grace:2,
    max_hp:60,mf:0,cumulated_xp:60,gold:0,death_number:0,steps_taken:10,creatures_slain:2,
    weapon:'Sword',armor:null,shield:null,equipment:{weapon:{name:'Sword',stat_line:'ATK 2.25'}},
    artifacts:[],strongest_enemy_killed:null,world_seed:-123,world_size:'L',world_traits:[],
    game_version:'v110',...overrides})
  const sqlFor=r=>{
    const columns=Object.keys(r)
    return {sql:`INSERT INTO public.highscore_records (${columns.map(c=>`"${c}"`).join(',')}) VALUES (${columns.map((_,i)=>`$${i+1}`).join(',')})`,
      params:columns.map(c=>r[c]!==null&&typeof r[c]==='object'?JSON.stringify(r[c]):r[c])}
  }
  const request=async ({role='anon',route='highscore_records',method='POST',ip='203.0.113.10',timezone,sql,params=[]}={})=>{
    await db.exec(`BEGIN; SET LOCAL ROLE ${role}`)
    try {
      if(timezone) await db.query("SELECT set_config('TimeZone',$1,true)",[timezone])
      await db.query(`SELECT set_config('request.method',$1,true), set_config('request.path',$2,true), set_config('request.headers',$3,true)`,
        [method,route,JSON.stringify(ip===null?{}:{'x-forwarded-for':ip})])
      await db.query('SELECT private.limit_graveyard_writes()')
      const result=sql?await db.query(sql,params):null
      await db.exec('COMMIT');return result
    }catch(error){await db.exec('ROLLBACK');throw error}
  }
  const post=async (r=record(),options={})=>request({...options,...sqlFor(r)})
  const expectError=async (action,code,status)=>assert.rejects(action,error=>
    error.code===code&&(status===undefined||JSON.parse(error.detail).status===status))
  const quota=async(table,ip)=>(await db.query(`SELECT attempts FROM private.${table}
    WHERE source_hash=extensions.hmac(convert_to($1,'UTF8'),convert_to((SELECT secret FROM private.${table==='highscore_rate_limits'?'highscore_secret':'graveyard_secret'} WHERE id=1),'UTF8'),'sha256')
    AND hour_start=date_trunc('hour',now())`,[ip])).rows[0]?.attempts||0
  try {
    await db.exec(fixture);await db.exec(foundation)
    await request({route:'death_records',sql:"INSERT INTO public.death_records(label) VALUES ('before migration')"})
    const oldOwnerAcl=(await db.query("SELECT proowner,proacl::text,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE oid='private.limit_graveyard_writes()'::regprocedure")).rows[0]
    const oldTrigger=(await db.query("SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgname='one_death_per_request'")).rows[0]
    await db.exec(migration)

    await t.test('preserves configured hook, ownership, grants, existing death quota and trigger',async()=>{
      assert.deepEqual((await db.query("SELECT proowner,proacl::text,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE oid='private.limit_graveyard_writes()'::regprocedure")).rows[0],oldOwnerAcl)
      assert.deepEqual((await db.query("SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgname='one_death_per_request'")).rows[0],oldTrigger)
      assert.equal(await quota('graveyard_rate_limits','203.0.113.10'),1)
      assert.equal((await db.query("SELECT setconfig FROM pg_db_role_setting WHERE setrole='authenticator'::regrole")).rows[0].setconfig.includes('pgrst.db_pre_request=private.limit_graveyard_writes'),true)
    })

    await t.test('anon/authenticated can insert the exact client payload and read bounded RPC',async()=>{
      for(const role of ['anon','authenticated']) {
        const r=record();await post(r,{role})
        await db.exec(`SET ROLE ${role}`)
        try {
          const rows=(await db.query('SELECT * FROM public.highscores_top_ten(false)')).rows
          assert.equal(rows.some(row=>row.character_id===r.character_id&&Number(row.strength)===9.75),true)
        }finally{await db.exec('RESET ROLE')}
      }
    })

    await t.test('clients cannot control protected fields, read raw tables, edit or delete',async()=>{
      for(const role of ['anon','authenticated']) {
        for(const protectedField of [{id:'11111111-1111-4111-8111-111111111111'},
          {created_at:'2020-01-01T00:00:00Z'},{strength:999}]) {
          await expectError(()=>post(record(protectedField),{role}),'strength' in protectedField?'428C9':'42501')
        }
        for(const sql of ['SELECT * FROM public.highscore_records',
          'UPDATE public.highscore_records SET atk=999','DELETE FROM public.highscore_records',
          'SELECT * FROM private.highscore_rate_limits','SELECT * FROM private.highscore_secret',
          'SELECT * FROM private.graveyard_secret','SELECT private.limit_highscore_writes()']) {
          await expectError(()=>request({role,route:'rpc/highscores_top_ten',sql}),'42501')
        }
      }
    })

    await t.test('duplicate/multi-row rejection is atomic, and rolled-back requests do not consume quota',async()=>{
      const r=record(),ip='203.0.113.30';await post(r,{ip})
      await expectError(()=>post(r,{ip}),'23505')
      assert.equal(await quota('highscore_rate_limits',ip),1)
      const first=sqlFor(record()),second=record()
      const suffix=Object.keys(second).map((_,i)=>`$${first.params.length+i+1}`).join(',')
      await expectError(()=>request({ip,sql:first.sql+`, (${suffix})`,params:[...first.params,...sqlFor(second).params]}),'23514')
      assert.equal(await quota('highscore_rate_limits',ip),1)
    })

    await t.test('same IP has independent limits of 20 deaths and 60 Highscores writes',async()=>{
      const ip='203.0.113.40'
      for(let i=0;i<20;i++)await request({ip,route:'/death_records/',sql:"INSERT INTO public.death_records(label) VALUES ('death')"})
      await expectError(()=>request({ip,route:'death_records',sql:"INSERT INTO public.death_records(label) VALUES ('blocked')"}),'PGRST',429)
      for(let i=0;i<60;i++)await post(record(),{ip})
      await expectError(()=>post(record(),{ip}),'PGRST',429)
      await expectError(()=>post(record(),{ip,timezone:'Asia/Kolkata'}),'PGRST',429)
      assert.equal(await quota('graveyard_rate_limits',ip),20)
      assert.equal(await quota('highscore_rate_limits',ip),60)
      await post(record(),{ip:'203.0.113.41'})
    })

    await t.test('missing/malformed IPs fail closed; forwarded lists retain original first-IP convention',async()=>{
      await expectError(()=>post(record(),{ip:null}),'PGRST',403)
      await expectError(()=>post(record(),{ip:'not-an-ip'}),'22P02')
      await post(record(),{ip:'203.0.113.50, 10.0.0.1'})
      assert.equal(await quota('highscore_rate_limits','203.0.113.50'),1)
      const rows=(await db.query('SELECT source_hash FROM private.highscore_rate_limits')).rows
      assert.equal(rows.every(row=>row.source_hash.byteLength===32),true)
    })

    await t.test('reads and unrelated POST routes bypass quotas; expired Highscores buckets are pruned',async()=>{
      await request({method:'GET',route:'highscore_records',ip:null})
      await request({route:'rpc/highscores_top_ten',ip:null})
      await request({route:'unrelated',ip:null})
      await db.query("INSERT INTO private.highscore_rate_limits VALUES (decode('aa','hex'),date_trunc('hour',now())-interval '3 hours',1)")
      await post(record(),{ip:'203.0.113.60'})
      assert.equal((await db.query("SELECT count(*)::integer AS n FROM private.highscore_rate_limits WHERE hour_start<date_trunc('hour',now())-interval '2 hours'")).rows[0].n,0)
    })

    await t.test('reapplying migration preserves quotas and removes accidental timestamp column grants',async()=>{
      await db.exec('GRANT INSERT(created_at) ON public.highscore_records TO anon')
      await db.exec(migration)
      assert.equal(await quota('highscore_rate_limits','203.0.113.40'),60)
      assert.equal(await quota('graveyard_rate_limits','203.0.113.40'),20)
      await expectError(()=>post(record({created_at:'2020-01-01T00:00:00Z'})),'42501')
      await post(record(),{ip:'203.0.113.70'})
    })

    await t.test('unrelated hook configuration is left untouched',async()=>{
      await db.exec("ALTER ROLE authenticator SET pgrst.db_pre_request='private.some_other_hook'")
      await db.exec(migration)
      const setting=(await db.query("SELECT setconfig FROM pg_db_role_setting WHERE setrole='authenticator'::regrole")).rows[0].setconfig
      assert.equal(setting.includes('pgrst.db_pre_request=private.some_other_hook'),true)
    })

    await t.test('Highscores trigger enforces quota without calling any request hook',async()=>{
      await db.exec('BEGIN; SET LOCAL ROLE anon')
      try {
        await db.query("SELECT set_config('request.headers',$1,true)",[JSON.stringify({'x-forwarded-for':'203.0.113.40'})])
        const insert=sqlFor(record())
        await expectError(()=>db.query(insert.sql,insert.params),'PGRST',429)
      }finally{await db.exec('ROLLBACK')}
    })

    await t.test('already-applied combined draft is detected; optional repair restores exact original',async()=>{
      await db.exec("ALTER ROLE authenticator SET pgrst.db_pre_request='private.limit_graveyard_writes'")
      await db.exec(earlier)
      await assert.rejects(db.exec(migration),/Earlier combined hook detected/)
      await db.exec('ROLLBACK')
      await db.exec(repair)
      assert.deepEqual((await db.query("SELECT proowner,proacl::text,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE oid='private.limit_graveyard_writes()'::regprocedure")).rows[0],oldOwnerAcl)
      await db.exec(migration)
      assert.equal(await quota('highscore_rate_limits','203.0.113.40'),60)
      assert.equal(await quota('graveyard_rate_limits','203.0.113.40'),20)
      await post(record(),{ip:'203.0.113.80'})
      assert.equal(await quota('highscore_rate_limits','203.0.113.80'),1)
    })
  }finally{await db.close()}
})
