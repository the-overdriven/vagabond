// Run: node --test tests/highscores-client-check.cjs
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.join(__dirname, '..')
const flush = () => new Promise(resolve => setImmediate(resolve))

function fixture(options = {}) {
  const calls = {clients:0, reads:[], inserts:[], storage:0, warnings:0,configuration:null}
  const storage = new Map()
  const client = {
    rpc(name, args) {
      calls.reads.push({name,args})
      return options.read ? options.read(name === 'highscores_permadeath_top_ten') : Promise.resolve({data:[],error:null})
    },
    from(table) { return {insert(record) {
      calls.inserts.push({table,record})
      return options.insert ? options.insert(record) : Promise.resolve({error:null})
    }} }
  }
  const ctx = vm.createContext({structuredClone, URL, AbortController, setTimeout, clearTimeout,
    Uint8Array, crypto:{randomUUID:()=>'11111111-1111-4111-8111-111111111111'},
    navigator:{onLine:options.online !== false},
    window:{addEventListener() {}, supabase:{createClient(url,key,options) {
      calls.clients++; calls.configuration={url,key,options}; return client
    }}},
    document:{getElementById:()=>({addEventListener(){}})},
    self:{VAGABOND_GAME_VERSION:'v107'},
    console:{warn(){calls.warnings++}},
    localStorage:{getItem(key) {
      calls.storage++; if(options.storageFails) throw Error('storage blocked'); return storage.get(key) ?? null
    }, setItem(key,value) {
      calls.storage++; if(options.storageFails) throw Error('storage blocked'); storage.set(key,value)
    }}, replaying:false,
    Math:Object.assign(Object.create(Math),{random(){throw Error('no random game rules')}})
  })
  const sources = ['supabase','graveyard','highscores'].map(name=>
    fs.readFileSync(path.join(root, `src/${name}.js`),'utf8')).join('\n')
  vm.runInContext(sources + '\nglobalThis.highscores = Highscores; globalThis.graveyard = Graveyard; globalThis.transport = OnlineSupabase', ctx)
  const init = () => {
    const options = {isReplayPlaybackActive:()=>ctx.replaying,onVisibilityChange(){}}
    ctx.transport.init(options)
    ctx.graveyard.init(options)
    ctx.highscores.init(options)
  }
  return {ctx,calls,storage,init,highscores:ctx.highscores,client}
}

function character(id = 'character-a') {
  return {characterId:id,highscoresDisqualified:false,godMode:false}
}

function snapshot(id = 'character-a', level = 2, mode = false) {
  return {character_id:id,character_name:'Tester',race:'elf',permadeath:mode,level,
    atk:2.25,def:1.5,spd:4,grace:2,equipment:{weapon:{name:'Sword',atk:2.25}},
    artifacts:[],world_traits:[],strongest_enemy_killed:null}
}

test('startup reads both modes once with the configured shared Supabase SDK/client', async () => {
  const f = fixture(); f.init(); f.init()
  await flush()
  assert.equal(f.calls.clients, 1)
  assert.equal(f.calls.configuration.url,vm.runInContext('SUPABASE_URL',f.ctx))
  assert.equal(f.calls.configuration.key,vm.runInContext('SUPABASE_PUBLISHABLE_KEY',f.ctx))
  assert.equal(f.calls.configuration.options.auth.persistSession,false)
  assert.deepEqual(f.calls.reads.map(c=>c.name),
    ['highscores_top_ten','highscores_permadeath_top_ten'])
  assert.equal(f.calls.reads[0].args.p_permadeath, false)
  assert.equal(f.calls.reads[1].args, undefined)
  assert.equal(f.highscores.getBoard(false).status, 'loaded')
  assert.equal(f.highscores.getBoard(true).status, 'loaded')
})

test('Graveyard and Highscores use one configured client, and replay cancels pending death writes', async () => {
  const f=fixture();f.init();await flush()
  f.ctx.graveyard.recordDeath({strongest_enemy_killed:null})
  f.highscores.recordLevel(character(),()=>snapshot());await flush()
  assert.equal(f.calls.clients,1)
  assert.deepEqual(f.calls.inserts.map(call=>call.table).sort(),['death_records','highscore_records'])
  f.ctx.graveyard.recordDeath({strongest_enemy_killed:null})
  f.ctx.replaying=true;await flush()
  assert.equal(f.calls.inserts.length,2)
})

test('offline startup and level-ups do no SDK, storage or network work; no reconnect queue', async () => {
  const f = fixture({online:false}); f.init()
  f.highscores.recordLevel(character(),()=>{throw Error('must skip snapshot')})
  await flush()
  assert.equal(f.calls.clients,0); assert.equal(f.calls.storage,0)
  assert.equal(f.calls.reads.length,0); assert.equal(f.calls.inserts.length,0)
  assert.equal(f.highscores.getBoard(false).rows,null)
  f.ctx.navigator.onLine = true
  await flush()
  assert.equal(f.calls.inserts.length,0)
  f.highscores.recordLevel(character(),()=>snapshot('character-a',3))
  await flush()
  assert.equal(f.calls.inserts.length,1)
  assert.equal(f.calls.inserts[0].record.level,3)
  assert.equal(f.calls.reads.length,0)
})

test('unresolved startup reads do not block level-up, and snapshots are deeply captured', async () => {
  const f = fixture({read:()=>new Promise(()=>{})}); f.init()
  const data = snapshot()
  f.highscores.recordLevel(character(),()=>data)
  data.character_name='Different character'; data.level=99; data.equipment.weapon.name='Changed'
  await flush()
  assert.equal(f.highscores.getBoard(false).status,'loading')
  const sent=f.calls.inserts[0]
  assert.equal(sent.table,'highscore_records')
  assert.equal(sent.record.character_name,'Tester'); assert.equal(sent.record.level,2)
  assert.equal(sent.record.equipment.weapon.name,'Sword')
  assert.equal(sent.record.game_version,'v107')
  for(const key of ['id','created_at','strength']) assert.equal(key in sent.record,false)
})

test('unidentified abacus hides owner and stats from public highscore snapshots', async () => {
  const f=fixture();f.init();await flush()
  const data=snapshot()
  data.artifacts=[{kind:'artifact',identified:false,noun:'Abacus',name:'Abacus of Zolgrin',
    stat_line:'ATK +15, CURSED',bonuses:{atk:15},curse:{everyTurns:7},effectId:'secret'},
    {kind:'artifact',identified:false,name:'The Abacus of Secret Dwarf',stat_line:'ATK +17'},
    {kind:'artifact',identified:false,name:'Unidentified Tea Strainer',stat_line:'DEF +22'}]
  data.equipment.armor={kind:'artifact',identified:false,noun:'Mail',name:'Mail of Glomir',
    stat_line:'DEF 15',bonuses:{def:15}}
  f.highscores.recordLevel(character(),()=>data)
  await flush()
  const sent=f.calls.inserts[0].record
  assert.equal(sent.artifacts[0].name,'Unidentified Abacus')
  assert.equal(sent.artifacts[0].stat_line,'???')
  assert.equal(sent.artifacts[1].name,'Unidentified Abacus')
  assert.equal(sent.artifacts[1].stat_line,'???')
  assert.equal(sent.artifacts[2].name,'Unidentified Tea Strainer')
  assert.equal(sent.equipment.armor.name,'Unidentified Mail')
  for(const item of [...sent.artifacts,sent.equipment.armor]) {
    for(const hidden of ['bonuses','curse','effectId','atk','def','ownerLore','possessor'])
      assert.equal(Object.hasOwn(item,hidden),false,`hidden ${hidden} absent from highscore JSON`)
  }
  assert.equal(data.artifacts[0].name,'Abacus of Zolgrin','no mutation of live item data')
})

test('startup failures are mode-local, unknown cutoff allows submission, no retries', async () => {
  const f=fixture({read:mode=> mode?Promise.resolve({data:[],error:null}):Promise.reject(Error('network')),
    insert:()=>Promise.reject(Error('write timeout'))})
  f.init(); await flush()
  assert.equal(f.highscores.getBoard(false).status,'unavailable')
  assert.equal(f.highscores.getBoard(true).status,'loaded')
  f.highscores.recordLevel(character(),()=>snapshot()); await flush(); await flush()
  assert.equal(f.calls.inserts.length,1)
  assert.equal(f.calls.reads.length,2)
  assert.equal(f.calls.warnings,1)
})

test('full-board level and exact-strength cutoffs apply independently by mode', async () => {
  const full=Array.from({length:10},(_,i)=>({id:`r${i}`,character_id:`r${i}`,level:5,
    strength:10+i,permadeath:true,is_dead:false,created_at:'2026-10-15T12:00:00+00:00'}))
  const f=fixture({read:mode=>Promise.resolve({data:mode?full:[],error:null})}); f.init(); await flush()
  f.highscores.recordLevel(character('skip'),()=>snapshot('skip',4,true))
  f.highscores.recordLevel(character('exact'),()=>({...snapshot('exact',5,true),atk:2.5}))
  f.highscores.recordLevel(character('strong'),()=>({...snapshot('strong',5,true),atk:2.51}))
  f.highscores.recordLevel(character('normal'),()=>snapshot('normal',2,false))
  await flush()
  assert.deepEqual(f.calls.inserts.map(x=>x.record.character_id),['strong','normal'])
})

test('in-flight and accepted duplicate milestones are suppressed; database duplicates are benign', async () => {
  let resolve
  const f=fixture({insert:()=>new Promise(r=>{resolve=r})}); f.init(); await flush()
  f.highscores.recordLevel(character(),()=>snapshot())
  f.highscores.recordLevel(character(),()=>snapshot()); await flush()
  assert.equal(f.calls.inserts.length,1)
  resolve({error:{code:'23505'}}); await flush()
  f.highscores.recordLevel(character(),()=>snapshot()); await flush()
  assert.equal(f.calls.inserts.length,1)
  assert.equal(f.calls.warnings,0)
})

test('replay blocks reads, snapshots, storage and pending inserts', async () => {
  const f=fixture(); f.ctx.replaying=true; f.init()
  const p=character()
  f.highscores.recordLevel(p,()=>{throw Error('no replay snapshot')})
  f.highscores.markDisqualified(p)
  f.highscores.reconcileExclusion(p)
  await f.highscores.refresh(false); await flush()
  assert.equal(p.highscoresDisqualified,true)
  assert.equal(f.calls.clients,0); assert.equal(f.calls.storage,0)
  f.ctx.replaying=false
  f.highscores.recordLevel(character('pending'),()=>snapshot('pending'))
  f.ctx.replaying=true
  await flush()
  assert.equal(f.calls.inserts.length,0)
})

test('god-mode exclusion persists across rollback and replay restore never consults the ledger', async () => {
  const f=fixture(); f.init(); await flush()
  const p=character(); f.highscores.markDisqualified(p)
  assert.equal(f.storage.get('vagabond_highscores_disqualified_character-a'),'1')
  const rollback=character(); f.highscores.reconcileExclusion(rollback)
  assert.equal(rollback.highscoresDisqualified,true)
  const reads=f.calls.storage
  const replayState=character(); f.highscores.reconcileExclusion(replayState,true)
  assert.equal(replayState.highscoresDisqualified,false); assert.equal(f.calls.storage,reads)
  f.highscores.recordLevel(rollback,()=>{throw Error('excluded character')})
  f.highscores.recordLevel(character('other'),()=>snapshot('other')); await flush()
  assert.equal(f.calls.inserts.length,1)
  assert.equal(f.calls.inserts[0].record.character_id,'other')
})

test('storage failures retain same-session exclusion and do not prevent other characters submitting', async () => {
  const f=fixture({storageFails:true}); f.init(); await flush()
  f.highscores.markDisqualified(character())
  const rollback=character(); f.highscores.reconcileExclusion(rollback)
  assert.equal(rollback.highscoresDisqualified,true)
  f.highscores.recordLevel(character('other'),()=>snapshot('other')); await flush()
  assert.equal(f.calls.inserts.length,1)
  assert.equal(f.calls.inserts[0].record.player_id,null)
})

test('enabling god mode or going offline cancels pending work before its insert', async () => {
  const f=fixture(); f.init(); await flush()
  const p=character()
  f.highscores.recordLevel(p,()=>snapshot())
  f.highscores.markDisqualified(p)
  await flush(); assert.equal(f.calls.inserts.length,0)
  f.highscores.recordLevel(character('other'),()=>snapshot('other'))
  f.ctx.navigator.onLine=false
  await flush(); assert.equal(f.calls.inserts.length,0)
})

test('out-of-order refresh responses cannot replace a newer board', async () => {
  const pending=[]
  const f=fixture({read:()=>new Promise(resolve=>pending.push(resolve))}); f.init(); await flush()
  const newest=f.highscores.refresh(false); await flush()
  pending[2]({data:[],error:null}); await newest
  pending[0]({data:null,error:{message:'old request failed'}}); await flush()
  assert.equal(f.highscores.getBoard(false).status,'loaded')
  assert.equal(f.highscores.getBoard(false).rows.length,0)
  pending[1]({data:[],error:null}); await flush()
})

test('permadeath status must be a server boolean; normal board does not require it', async () => {
  const base={id:'row',character_id:'row',character_name:'Test',race:'human',level:3,
    strength:8,created_at:'2026-10-15T12:00:00+00:00'}
  const f=fixture({read:mode=>Promise.resolve({data:[{...base,permadeath:mode,...(mode?{is_dead:true}:{})}],error:null})})
  f.init(); await flush()
  assert.equal(f.highscores.getBoard(false).status,'loaded')
  assert.equal(f.highscores.getBoard(true).rows[0].is_dead,true)
  const invalid=fixture({read:mode=>Promise.resolve({data:[{...base,permadeath:mode}],error:null})})
  invalid.init();await flush()
  assert.equal(invalid.highscores.getBoard(false).status,'loaded')
  assert.equal(invalid.highscores.getBoard(true).status,'unavailable')
})
