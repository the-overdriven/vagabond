'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const copy=v=>JSON.parse(JSON.stringify(v))
;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  const setup=`loadGameFromObject(fixture,{isReplayInit:true});log=()=>{};
    replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;
    enemies=[];npcs=[];groundItems=[];occupied=new Set();player.hp=playerMaxHp();
    player.inventory=[createItem('homecomingscroll',{count:2})];
    currentZ=-1;currentCave=0;map=undergroundMap;undergroundDiscovered=undergroundDiscoveredL1;
    player.x=40;player.y=40;map[40][40]='cavefloor';map[39][40]='cavefloor';
    player.berserkTurns=0;player.poisonTurns=0;surfaceDepartureTurn=turnCount;
    rebuildActiveLevelOccupancy()`
  run(setup)
  const initialTurn=run('turnCount')
  // Retain one ordinary surface NPC so Homecoming's arrival consumes real RNG.
  run(`npcs=[structuredClone(fixture.npcs.find(n=>!n.static))];
    Object.assign(npcs[0],{x:spawnPoint.x+2,y:spawnPoint.y,homeX:spawnPoint.x+2,homeY:spawnPoint.y,talkFreezeTurns:0});
    surfaceMap[spawnPoint.y][spawnPoint.x+2]='grass';rebuildActiveLevelOccupancy()`)
  run('startReplayRecording()')
  await run('ITEM_ACTION_HANDLERS.homecomingscroll(0)')
  assert.equal(run('currentZ'),0)
  assert.equal(run('turnCount'),initialTurn+1)
  assert.equal(run('player.inventory[0].count'),1)
  assert.deepEqual(copy(run('player.inventory[1].destination')),{x:40,y:40,z:-1,levelKind:'chain',caveIndex:0})
  assert.equal(run('itemSellValue(player.inventory[1])'),0)
  assert.equal(run('canDropInventoryItem(player.inventory[1])'),false)
  assert.equal(run('merchantStock.some(it=>it.kind==="wayfaringscroll")'),false)
  assert.equal(run('itemIconPath("wayfaringscroll")'),'img/icons/wayfaringscroll.svg')
  assert(fs.existsSync(__dirname+'/../img/icons/wayfaringscroll.svg'))
  context.saved=copy(run('buildSaveObject()'))
  run('loadGameFromObject(saved,{isReplayInit:true})')
  assert.deepEqual(copy(run('player.inventory[1].destination')),context.saved.player.inventory[1].destination)
  await run('ITEM_ACTION_HANDLERS.wayfaringscroll(1)')
  assert.deepEqual(copy(run('({x:player.x,y:player.y,z:currentZ,kind:currentLevelKind(),cave:currentCave})')),{x:40,y:40,z:-1,kind:'chain',cave:0})
  assert.equal(run('turnCount'),initialTurn+2)
  assert.equal(run('player.inventory.some(i=>i.kind==="wayfaringscroll")'),false)
  context.recorded=copy(run('replayData'))
  assert.deepEqual(context.recorded.actions.map(a=>a.action),['homecomingscroll','wayfaringscroll'])
  const final=copy(run('({x:player.x,y:player.y,z:currentZ,turn:turnCount,hp:player.hp,npcs:npcs.map(n=>[n.x,n.y]),inventory:player.inventory.map(i=>({kind:i.kind,count:i.count}))})'))
  assert(context.recorded.rng.length>0,'nontrivial live RNG tape')
  run('loadGameFromObject(recorded.initialState,{isReplayInit:true});activeReplay=recorded;replayRngIndex=0;replayPlaying=true;replayRecording=false')
  for(const action of context.recorded.actions){
    assert.equal(run('replayRngIndex'),action._rngStart)
    await run(`runReplayAction(${JSON.stringify(action)})`)
    assert.equal(run('replayRngIndex'),action._rngEnd)
  }
  assert.equal(run('replayRngIndex'),context.recorded.rng.length)
  run('replayPlaying=false;activeReplay=null')
  assert.deepEqual(copy(run('({x:player.x,y:player.y,z:currentZ,turn:turnCount,hp:player.hp,npcs:npcs.map(n=>[n.x,n.y]),inventory:player.inventory.map(i=>({kind:i.kind,count:i.count}))})')),final)
  // Repeated Homecoming replaces the anchor; separate global maps cannot collide.
  run(setup)
  await run('useHomecomingScroll(0)')
  run(`player.x=42;player.y=42;surfaceMap[42][42]='grass'`)
  await run('useHomecomingScroll(0)')
  assert.equal(run('player.inventory.length'),1)
  assert.deepEqual(copy(run('player.inventory[0].destination')),{x:42,y:42,z:0,levelKind:'surface',caveIndex:-1})
  run('surfaceMap[42][42]="cavewall"')
  const blockedTurn=run('turnCount')
  const blockedRng=run('rngState')
  await run('useWayfaringScroll(0)')
  assert.equal(run('player.inventory.length'),1)
  assert.equal(run('turnCount'),blockedTurn)
  assert.equal(run('rngState'),blockedRng)
  // A monster on the remembered tile is displaced on its own floor; a monster
  // at identical X/Y on another floor is untouched.
  run(setup)
  await run('useHomecomingScroll(0)')
  run(`enemies=[{id:'target',name:'Test',alive:true,hp:1,level:-1,levelKind:'chain',x:40,y:40},
    {id:'other',name:'Test',alive:true,hp:1,level:-2,levelKind:'crypt2',x:40,y:40}];
    resolveEnemyTurn=()=>{};npcTurn=()=>{};rebuildActiveLevelOccupancy()`)
  await run('useWayfaringScroll(1)')
  assert.deepEqual(copy(run('({px:player.x,py:player.y,z:currentZ,actors:enemies.map(e=>[e.x,e.y])})')),
    {px:40,py:40,z:-1,actors:[[40,39],[40,40]]})
  // Legacy crypt identity and positive tower Z use the actual map, not chain.
  for(const kind of ['crypt2','tower']){
    run(setup)
    run(`currentZ=${kind==='crypt2'?-2:1};currentCave=-1;
      ${kind==='crypt2'?`if(!cryptLevel2)cryptLevel2={map:structuredClone(undergroundMap),discovered:structuredClone(undergroundDiscoveredL1)};map=cryptLevel2.map;undergroundDiscovered=cryptLevel2.discovered`:`if(!towerLevels[0])towerLevels.push({map:structuredClone(undergroundMap),discovered:structuredClone(undergroundDiscoveredL1)});map=towerLevels[0].map;undergroundDiscovered=towerLevels[0].discovered`};
      map[40][40]='cavefloor'`)
    await run('useHomecomingScroll(0)')
    await run('useWayfaringScroll(1)')
    assert.equal(run('currentLevelKind()'),kind)
    assert.equal(run('map[40][40]'),'cavefloor')
    assert.equal(run('player.x'),40)
  }
  console.log('PASS Wayfaring: stacks, latest anchor, save/load, replay, blocked target, displacement, Crypt and Tower')
})().catch(err=>{console.error(err);process.exitCode=1})
