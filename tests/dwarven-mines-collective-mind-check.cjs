'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const copy=value=>JSON.parse(JSON.stringify(value))

;(async()=>{
  await run('loadContent()')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  context.fixture.version=run('SAVE_VERSION')
  run(`loadGameFromObject(fixture,{isReplayInit:true});turnCount=100;
    enemies=[];occupied=new Set();collectiveMindFloors={};log=()=>{};
    spawnDamageNumber=()=>{};replayAnimationsDisabled=true;
    enemyAttackPlayer=()=>false;enemyWander=()=>false;
    enemyStepTowardPlayer=()=>false;blindPursuitHesitates=()=>false;
    enemyInsideSanctuary=()=>false;playerInsideSanctuary=()=>false;
    enemyIsVisibleOnMainView=()=>true;enemyHasSight=()=>true;
    player.x=40;player.y=40;player.hp=1000;player.invisibleTurns=0;
    player.godMode=false;player.godInvisible=false;
    for(let y=30;y<=57;y++)for(let x=30;x<=57;x++)map[y][x]='grass';
    makeCollective=(x,y,pack)=>{
      const t=ENEMY_TEMPLATE_BY_NAME.Naledi;
      return addEnemy({...t,x,y,baseName:'Naledi',level:0,levelKind:null,
        hp:t.hp,maxHp:t.hp,homeX:x,homeY:y,homeTileType:'grass',
        alive:true,aware:false,sleeping:false,equipment:null,
        collectiveMindPackId:pack})
    };
    scout=makeCollective(42,40,'scout_pack');
    solo=makeCollective(45,44,'near_solo');
    pairA=makeCollective(49,41,'distant_pair');
    pairB=makeCollective(49,43,'distant_pair');
    occupied=new Set(enemies.map(e=>keyXY(e.x,e.y)));
  `)
  assert(run('ENEMY_TEMPLATE_BY_NAME.Naledi.abilities.includes("collectiveMind")'))
  assert.equal(run('Object.keys(collectiveMindFloors).length'),0)
  assert.equal(run(`collectiveMindSearchingScout({alive:true,hp:10,id:undefined,level:0,levelKind:null,caveIndex:-1})`),false,
    'ordinary enemies without a Collective Mind floor record never become searching scouts')
  const chosen=copy(run('collectiveMindChooseGroup(scout)'))
  assert.equal(chosen.groupId,'distant_pair','a reachable two-member group beats a closer singleton')
  assert(chosen.arrival.distance>0)
  assert(run('tryTriggerCollectiveMind(scout)'),'first actual detection spends the floor alert')
  assert.equal(run('collectiveMindFloors[collectiveMindFloorKey(scout)].scoutId'),run('scout.id'))
  assert.equal(run('enemies.every(e=>e.alarmed)'),true,'all living ability holders are Alarmed')
  assert.equal(run('solo.aware'),false,'the alert does not forcibly set ordinary awareness')
  assert.equal(run('scout.collectiveMindRetreat.groupId'),'distant_pair')
  assert.deepEqual(copy(run('scout.collectiveMindRetreat.allyIds')).sort(),
    [run('pairA.id'),run('pairB.id')].sort())
  assert.equal(run('tryTriggerCollectiveMind(solo)'),false,'same floor cannot alert twice')
  // Existing Alarmed pursuit around an unseen wall is intentionally retained.
  run('enemyHasSight=()=>false;solo.aware=false;player.x=45;player.y=41')
  assert(run('solo.alarmed && !enemyHasSight(solo)'),
    'collective alert does not require visual contact for the Alarmed state')
  run('player.x=40;player.y=40;enemyHasSight=()=>true')

  // A scout spends actions on its selected allies; it can jump, but never
  // teleports or attacks immediately on preparation.
  const start=copy(run('({x:scout.x,y:scout.y})'))
  assert(run('takeCollectiveMindRetreatTurn(scout)'))
  assert.equal(run('scout.pendingAbility?.type'),'jump','retreat can reuse generic Jump')
  assert.deepEqual(copy(run('({x:scout.x,y:scout.y})')),start)
  const targeted=copy(run('scout.pendingAbility.destination'))
  context.prepared=copy(run('buildSaveObject()'))
  const preparedRng=run('rngState')
  run('loadGameFromObject(prepared,{isReplayInit:true});scout=enemies.find(e=>e.id===prepared.enemies[0].id)')
  assert.equal(run('rngState'),preparedRng,'resuming a pending retreat Jump consumes no RNG')
  assert.equal(run('scout.pendingAbility.type'),'jump')
  assert.equal(run('scout.collectiveMindRetreat.groupId'),'distant_pair')
  run('turnCount++;resolveEnemyTelegraphIfPending(scout)')
  assert.deepEqual(copy(run('({x:scout.x,y:scout.y})')),targeted)
  assert.equal(run('enemyAbilityCooldown(scout,"jump")'),4)

  // Save/replay keeps one-spent floor alert, chosen ally IDs and delayed
  // movement state, independently of rendering and without consuming RNG.
  run('scout.collectiveMindRetreatAnnounced=true')
  context.saved=copy(run('buildSaveObject()'))
  const savedRng=run('rngState')
  const savedAlert=copy(run('collectiveMindFloors'))
  const savedRetreat=copy(run('scout.collectiveMindRetreat'))
  run('loadGameFromObject(saved,{isReplayInit:true})')
  assert.equal(run('rngState'),savedRng)
  assert.deepEqual(copy(run('collectiveMindFloors')),savedAlert)
  assert.deepEqual(copy(run(`enemies.find(e=>e.id===${JSON.stringify(context.saved.enemies[0].id)}).collectiveMindRetreat`)),savedRetreat)
  assert.equal(run('collectiveMindFloors[collectiveMindFloorKey(enemies[0])].spent'),true)
  assert.equal(run('enemies.filter(e=>e.collectiveMindRetreat).length'),1)
  assert.equal(run('enemies.filter(e=>e.collectiveMindPackId==="distant_pair").length'),2)

  // Losing the target pack stops that particular route, but the scout
  // continues to flee and search instead of attacking immediately.
  run(`scout=enemies.find(e=>e.id===saved.enemies[0].id);
    enemies.filter(e=>e.collectiveMindPackId==='distant_pair').forEach(e=>e.alive=false);
    occupied=new Set(enemies.filter(e=>e.alive).map(e=>keyXY(e.x,e.y)))`)
  assert.equal(run('takeCollectiveMindRetreatTurn(scout)'),true)
  assert.equal(run('scout.collectiveMindRetreat'),null)
  assert.equal(run('tryTriggerCollectiveMind(scout)'),false)

  // An invalid route cancels the destination, never the scout's flight.
  run(`scout.collectiveMindRetreat={groupId:'near_solo',allyIds:[solo.id]};
    solo=enemies.find(e=>e.collectiveMindPackId==='near_solo');
    for(const [dx,dy] of DIRS8)map[solo.y+dy][solo.x+dx]='cavewall';
    map[solo.y][solo.x]='grass';
    occupied=new Set(enemies.filter(e=>e.alive).map(e=>keyXY(e.x,e.y)))`)
  assert.equal(run('takeCollectiveMindRetreatTurn(scout)'),true)
  assert.equal(run('scout.collectiveMindRetreat'),null)

  // A separate floor retains its own independent once-only alert flag.
  run(`otherFloor=makeCollective(35,35,'other_floor');otherFloor.level=-9;
    otherFloor.levelKind='chain';otherFloor.caveIndex=-1`)
  assert.equal(run('tryTriggerCollectiveMind(otherFloor)'),true)
  assert.equal(run('Object.keys(collectiveMindFloors).length'),2)

  // Exercise the real turn hook: first normal acquisition chooses a scout,
  // commits the one alert and spends its action attempting to regroup.
  run(`loadGameFromObject(fixture,{isReplayInit:true});enemies=[];
    occupied=new Set();collectiveMindFloors={};turnCount=400;
    player.x=40;player.y=40;player.hp=1000;player.invisibleTurns=0;
    for(let y=30;y<=57;y++)for(let x=30;x<=57;x++)map[y][x]='grass';
    first=makeCollective(42,40,'solo_scout');
    support1=makeCollective(48,42,'support_pack');
    support2=makeCollective(48,44,'support_pack');
    occupied=new Set(enemies.map(e=>keyXY(e.x,e.y)));
    enemyHasSight=()=>true;enemyWander=()=>false;
    enemyStepTowardPlayer=()=>false;blindPursuitHesitates=()=>false;
    enemyTurn()`)
  assert.equal(run('collectiveMindFloors[collectiveMindFloorKey(first)].scoutId'),run('first.id'))
  assert.equal(run('collectiveMindFloors[collectiveMindFloorKey(first)].spent'),true)
  assert.equal(run('first.collectiveMindRetreat?.groupId'),'support_pack')
  assert.equal(run('support1.alarmed && support2.alarmed'),true)
  assert.equal(run('support1.collectiveMindRetreat'),null,'only the detecting member scouts')
  run(`first.aware=false;first.pendingAbility=null;first.collectiveMindRetreat=null;
    first.abilityCooldowns.jump=10;support1.abilityCooldowns.jump=10;
    support1.x=43;support1.y=43;support1.aware=false;support1.alarmed=false;
    occupied=new Set(enemies.map(e=>keyXY(e.x,e.y)));
    collectiveMindFloors={};nonvisualChases=0;
    enemyHasSight=e=>e===first;
    enemyStepTowardPlayer=e=>{if(e===support1)nonvisualChases++;return false};
    enemyTurn()`)
  assert(run('nonvisualChases>0'),
    'a blind ally alerted by Collective Mind retains normal around-corner pursuit')

  // A cornered lone scout must not spend every turn waiting while adjacent.
  // Its alert remains unsecured, and the ordinary combat action resumes.
  run(`loadGameFromObject(fixture,{isReplayInit:true});enemies=[];
    occupied=new Set();collectiveMindFloors={};turnCount=500;
    player.x=41;player.y=40;player.hp=1000;player.invisibleTurns=0;
    for(let y=36;y<=44;y++)for(let x=37;x<=46;x++)map[y][x]='cavewall';
    map[40][41]='grass';map[40][42]='grass';
    cornered=makeCollective(42,40,'trapped_scout');
    occupied=new Set([keyXY(cornered.x,cornered.y)]);
    enemyHasSight=()=>true;enemyWander=()=>false;
    enemyInsideSanctuary=()=>false;playerInsideSanctuary=()=>false;
    meleeAttempts=0;enemyAttackPlayer=e=>{if(e===cornered)meleeAttempts++;return false};
    tryTriggerCollectiveMind(cornered)`)
  assert.equal(run('collectiveMindSearchTurn(cornered)'),false,'adjacent scout with no escape may defend itself')
  run('enemyTurn()')
  assert.equal(run('meleeAttempts'),1,'the normal enemy turn performs one melee attack')
  assert.equal(run('collectiveMindFloors[collectiveMindFloorKey(cornered)].secured'),false)
  context.corneredSave=copy(run('buildSaveObject()'))
  const corneredRng=run('rngState')
  run('loadGameFromObject(corneredSave,{isReplayInit:true});cornered=enemies.find(e=>e.id===corneredSave.enemies[0].id)')
  assert.equal(run('rngState'),corneredRng,'restoring a cornered scout consumes no RNG')
  assert.equal(run('collectiveMindSearchingScout(cornered)'),true)
  assert.equal(run('collectiveMindSearchTurn(cornered)'),false,'cornered combat fallback survives save/replay')

  // Once an escape opens, the scout resumes fleeing instead of attacking.
  run(`map[40][43]='grass';meleeAttempts=0;enemyAttackPlayer=e=>{meleeAttempts++;return false};enemyTurn()`)
  assert.equal(run('meleeAttempts'),0,'a mobile scout still favors escape')
  assert.equal(run('cornered.x'),43,'search moves away through the newly opened tile')
  console.log('PASS Batch D Collective Mind: alert scope, sensory Alarmed, group preference, Jump, invalidation, save/replay')
})().catch(e=>{console.error(e.stack);process.exitCode=1})
