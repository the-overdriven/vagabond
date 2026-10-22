'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const snapshot=value=>JSON.parse(JSON.stringify(value))

;(async()=>{
  await run('loadContent()')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  context.fixture.version=run('SAVE_VERSION')
  run(`loadGameFromObject(fixture,{isReplayInit:true});
    collectiveMindFloors={};enemies=[];occupied=new Set();turnCount=100;
    log=()=>{};spawnDamageNumber=()=>{};
    player.x=40;player.y=40;player.invisibleTurns=0;player.godInvisible=false;
    for(let y=30;y<=65;y++)for(let x=30;x<=65;x++)map[y][x]='grass';
    createNaledi=(x,y,pack)=>{
      const t=ENEMY_TEMPLATE_BY_NAME.Naledi;
      return addEnemy({...t,baseName:t.name,x,y,level:0,levelKind:null,
        hp:t.hp,maxHp:t.hp,homeX:x,homeY:y,homeTileType:'grass',
        equipment:null,alive:true,collectiveMindPackId:pack});
    };
    scout=createNaledi(42,40,'scout-pack');
    allyA=createNaledi(51,40,'other-pack');
    allyB=createNaledi(52,40,'other-pack');
    occupied=new Set(enemies.map(e=>keyXY(e.x,e.y)));
    enemyIsVisibleOnMainView=()=>false;
    tryTriggerCollectiveMind(scout);`)
  assert.equal(run('collectiveMindFloors[collectiveMindFloorKey(scout)].secured'),false)
  assert(run('scout.collectiveMindRetreat'),'scout must have a separate reachable pack')
  run(`player.x=90;player.y=90;updateAlarmedEnemies()`)
  assert.equal(run('enemies.every(e=>e.alarmed)'),true,'the live scout prevents 20-tile fading')
  context.pending=snapshot(run('buildSaveObject()'))
  const rng=run('rngState')
  run(`loadGameFromObject(pending,{isReplayInit:true});
    scout=enemies.find(e=>e.id===pending.collectiveMindFloors['surface:0:-1'].scoutId);
    allyA=enemies.find(e=>e.collectiveMindPackId==='other-pack');
    updateAlarmedEnemies()`)
  assert.equal(run('rngState'),rng,'restoring the temporary alert consumes no RNG')
  assert.equal(run('allyA.alarmed'),true,'pending alert survives save and restoration')

  // Without a successful reunion, eliminating the scout stops the broadcast.
  run(`scout.alive=false;enemies=enemies.filter(e=>e!==scout);updateAlarmedEnemies()`)
  assert.equal(run('collectiveMindAlertActive(allyA)'),false)
  assert.equal(run('allyA.alarmed'),false,'the distant ally reverts to ordinary Alarmed decay')
  assert.equal(run('collectiveMindFloors[collectiveMindFloorKey(allyA)].spent'),true,
    'death cannot reset the one-per-floor event')

  // Reaching a DIFFERENT pack secures the alert. It outlives scout death,
  // travel away and back, and serialization.
  run(`loadGameFromObject(pending,{isReplayInit:true});
    scout=enemies.find(e=>e.id===pending.collectiveMindFloors['surface:0:-1'].scoutId);
    allyA=enemies.find(e=>e.collectiveMindPackId==='other-pack');
    occupied.delete(keyXY(scout.x,scout.y));scout.x=allyA.x-1;scout.y=allyA.y;
    occupied.add(keyXY(scout.x,scout.y));
    takeCollectiveMindRetreatTurn(scout)`)
  assert.equal(run('collectiveMindFloors[collectiveMindFloorKey(scout)].secured'),true)
  assert.equal(run('scout.collectiveMindRetreat'),null)
  run(`scout.alive=false;enemies=enemies.filter(e=>e!==scout);
    player.x=90;player.y=90;updateAlarmedEnemies()`)
  assert.equal(run('collectiveMindAlertActive(allyA)'),true)
  assert.equal(run('allyA.alarmed'),true,'secured alert ignores distance and scout death')
  context.secured=snapshot(run('buildSaveObject()'))
  const securedRng=run('rngState')
  run(`loadGameFromObject(secured,{isReplayInit:true});
    allyA=enemies.find(e=>e.collectiveMindPackId==='other-pack');
    currentZ=-1;updateAlarmedEnemies();currentZ=0;updateAlarmedEnemies()`)
  assert.equal(run('allyA.alarmed'),true,'returning restores a permanent alert')
  assert.equal(run('rngState'),securedRng)
  assert.equal(run('collectiveMindFloors[collectiveMindFloorKey(allyA)].secured'),true)

  // A singleton scout has no group to seek. It must flee rather than attack;
  // a new, reachable pack can later become its regrouping destination.
  run(`loadGameFromObject(fixture,{isReplayInit:true});
    collectiveMindFloors={};enemies=[];occupied=new Set();
    player.x=40;player.y=40;
    for(let y=30;y<=65;y++)for(let x=30;x<=65;x++)map[y][x]='grass';
    scout=createNaledi(42,40,'loner-pack');
    occupied=new Set([keyXY(scout.x,scout.y)]);
    tryTriggerCollectiveMind(scout);
    previousDistance=Math.max(Math.abs(scout.x-player.x),Math.abs(scout.y-player.y));
    moved=takeCollectiveMindRetreatTurn(scout)`)
  assert.equal(run('moved'),true,'a scout with no target spends its action fleeing')
  assert.equal(run('scout.collectiveMindRetreat'),null)
  assert(run('Math.max(Math.abs(scout.x-player.x),Math.abs(scout.y-player.y))>previousDistance'),
    'search movement must increase distance from the player')
  run(`allyA=createNaledi(55,44,'new-pack');
    occupied.add(keyXY(allyA.x,allyA.y));
    takeCollectiveMindRetreatTurn(scout)`)
  assert.equal(run('scout.collectiveMindRetreat.groupId'),'new-pack',
    'a lone scout can choose a pack that becomes reachable later')
  console.log('PASS Collective Mind persistence: scout alive, pre-regroup death, secure regroup, travel, save/replay')
})().catch(err=>{console.error(err.stack);process.exitCode=1})
