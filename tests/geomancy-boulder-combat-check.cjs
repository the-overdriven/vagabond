'use strict'
const assert = require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const copy = expr => JSON.parse(JSON.stringify(run(expr)))

;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`globalThis.resetGeomancyCombat=()=>{
    loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
    replayAnimationsDisabled=true;replayRecording=false;replayPlaying=false;
    replaySimulationMode=false;player.godMode=false;player.hp=200;
    player.inventory=[];player.equip={weapon:null,armor:null,shield:null};
    player.wayfaring=ArtifactWayfaring.freshState();player.x=40;player.y=40;
    currentZ=0;currentCave=-1;map=surfaceMap;
    enemies=[];npcs=[];groundItems=[];occupied=new Set();
    ArtifactGeomancy.resetWorld();turnCount=100;
    fxAnims=[];damageAnims=[];projectileAnims=[];enemyAttackVisualEnd=0;
    for(let y=25;y<=55;y++)for(let x=25;x<=65;x++) {
      surfaceMap[y][x]='grass';grasslandTrees.delete(keyXY(x,y));
      discovered[y][x]=true;
    }
    camX=32;camY=32;
    globalThis.messages=[];log=(msg)=>messages.push(msg);
    globalThis.originalEnemyPhase=resolveEnemyPhase;
    resolveEnemyPhase=()=>{};
    globalThis.gemCombat=id=>({...makeArtifactTrinket('Stone',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id),identified:true});
    globalThis.foeCombat=(name,x,y)=>{
      const t=ENEMY_TEMPLATE_BY_NAME[name];
      const e=addEnemy({...t,baseName:name,x,y,level:0,levelKind:'surface',
        hp:300,maxHp:300,alive:true,aware:true,alarmed:true,
        homeX:x,homeY:y,homeTileType:'grass'});
      occupied.add(keyXY(x,y));return e;
    }
    globalThis.naturalCombat=(x,y)=>{
      surfaceMap[y][x]='boulder';tileUnderlays[keyXY(x,y)]='grass';
    }
    globalThis.clearCombat=(x,y)=>{
      surfaceMap[y][x]='grass';delete tileUnderlays[keyXY(x,y)];
    }
  };resetGeomancyCombat()`)
  run(`player.inventory=[gemCombat('stonepress')];naturalCombat(41,40);`)
  assert.deepEqual(copy('ArtifactGeomancy.availablePressDirections()'),[[1,0]],
    'Stonepress only offers directions containing a movable adjacent rock')
  const old = copy('({turnCount,rngState})')
  assert.equal(run('ArtifactGeomancy.activate(0,[-1,0])'),false)
  assert.deepEqual(copy('({turnCount,rngState})'),old,'invalid direction is cost-free')
  assert.equal(run('ArtifactGeomancy.activate(0,[1,0])'),true)
  assert.equal(run('map[40][41]'),'grass')
  assert.equal(run('map[40][45]'),'boulder')
  assert.equal(run('tileUnderlays[keyXY(45,40)]'),'grass')
  assert.equal(run('tileUnderlays[keyXY(41,40)]'),undefined)
  assert.equal(run('miningSurfaceProgress[keyXY(41,40)]'),undefined)
  assert.equal(run('turnCount'),101)
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("stonepress")'),499)
  assert.equal(run('messages.filter(m=>m.includes("Stonepress drives")).length'),1,
    'one meaningful activation log rather than one message per tile')

  run(`resetGeomancyCombat();player.inventory=[gemCombat('stonepress')];naturalCombat(41,40);
    replayAnimationsDisabled=false;invOpen=true;
    ArtifactGeomancy.activate(0,[1,0]);
    globalThis.pressStart=ArtifactGeomancy.stonepressFrame(0).slide.start;`)
  assert.equal(run('invOpen'),false)
  for (const [ms,x] of [[0,41],[150,41.5],[600,43],[1050,44.5]]) {
    assert.equal(run('ArtifactGeomancy.stonepressFrame(pressStart+'+ms+').x'),x)
  }
  assert.equal(run('ArtifactGeomancy.stonepressFrame(pressStart+1200)'),null)

  // A victim can be pushed while the stone advances; traps use final occupancy.
  run(`resetGeomancyCombat();player.inventory=[gemCombat('stonepress')];naturalCombat(41,40);
    globalThis.victim=foeCombat('Goblin',42,40);`)
  assert.equal(run('ArtifactGeomancy.activate(0,[1,0])'),true)
  assert.equal(run('victim.hp<300'),true)
  assert.equal(run('victim.alive'),true)
  assert.equal(run('victim.x'),46)
  assert.equal(run('map[40][45]'),'boulder')
  assert.equal(run('occupied.has(keyXY(victim.x,victim.y))'),true)

  // A wall stops a pinned enemy; impact and crushing have separate seeded rolls.
  run(`resetGeomancyCombat();player.inventory=[gemCombat('stonepress')];naturalCombat(41,40);
    globalThis.victim=foeCombat('Goblin',42,40);map[40][43]='dwarvenwall';
    globalThis.originalRandInt=randInt;randInt=(lo,hi)=>lo;`)
  assert.equal(run('ArtifactGeomancy.activate(0,[1,0])'),true)
  assert.equal(run('victim.hp'),270,'10 hit + 20 crush damage, not 4 repetitive hits')
  assert.equal(run('map[40][41]'),'boulder','pinned stone never overlaps its victim')
  assert.equal(run('victim.x'),42)
  run('randInt=originalRandInt')

  // Even when Stonepress kills a pinned foe, the launch is reported before
  // the death, XP and loot instead of appearing as an afterthought.
  run(`resetGeomancyCombat();player.inventory=[gemCombat('stonepress')];
    naturalCombat(41,40);globalThis.victim=foeCombat('Wolf',42,40);
    victim.hp=3;player.lvl=11;player.xp=0;map[40][43]='dwarvenwall';`)
  assert.equal(run('ArtifactGeomancy.activate(0,[1,0])'),true)
  const pressLogs=copy('messages')
  assert.equal(pressLogs.findIndex(m=>m.startsWith('Stonepress drives'))===0,true)
  assert.equal(pressLogs.findIndex(m=>m.includes('You have slain the Wolf!'))>0,true)

  // Diagonal pushes never slip a stone between two blocked corner cells.
  run(`resetGeomancyCombat();player.inventory=[gemCombat('stonepress')];
    naturalCombat(41,41);map[41][42]='dwarvenwall';map[42][41]='dwarvenwall';`)
  assert.equal(run('ArtifactGeomancy.canActivate(0,[1,1])'),false)
  assert.equal(run('map[41][41]'),'boulder')

  // No room to move and no enemy to hit: no cooldown, time or RNG use.
  run(`resetGeomancyCombat();player.inventory=[gemCombat('stonepress')];naturalCombat(41,40);
    map[40][42]='dwarvenwall';`)
  const blockedBefore=copy('({turnCount,rngState})')
  assert.equal(run('ArtifactGeomancy.canActivate(0,[1,0])'),false)
  assert.equal(run('ArtifactGeomancy.activate(0,[1,0])'),false)
  assert.deepEqual(copy('({turnCount,rngState})'),blockedBefore)

  // Cragbowl: nearest rock and nearest enemy are independent; 3 aligned
  // creatures take one primary roll, half for each additional target.
  run(`resetGeomancyCombat();player.inventory=[gemCombat('cragbowl')];
    naturalCombat(42,40);
    globalThis.a=foeCombat('Goblin',45,40);
    globalThis.b=foeCombat('Goblin',46,40);
    globalThis.c=foeCombat('Goblin',47,40);
    globalThis.originalRandInt=randInt;randInt=(lo,hi)=>lo;`)
  assert.equal(run('ArtifactGeomancy.canActivate(0)'),true)
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  assert.equal(run('a.hp'),270)
  assert.equal(run('b.hp'),285)
  assert.equal(run('c.hp'),285)
  assert.deepEqual(copy('[a.x,b.x,c.x]'),[47,48,49],
    'whole line moves 2 cells with distinct occupancy')
  assert.equal(run('occupied.size'),3)
  assert.equal(run('map[40][42]'),'grass','Cragbowl destroys the original rock')
  assert.equal(run('tileUnderlays[keyXY(42,40)]'),undefined)
  assert.equal(run('miningSurfaceProgress[keyXY(42,40)]'),undefined)
  assert.equal(run('messages.filter(m=>m.includes("Cragbowl hurls")).length'),1)
  run('randInt=originalRandInt')

  // The modal is closed before impact; combat messages are in causal order.
  // A lethal hit leaves a visual-only corpse at the impact tile while the
  // projectile flies there. Saved gameplay does not depend on the frames.
  run(`resetGeomancyCombat();player.inventory=[gemCombat('cragbowl')];
    naturalCombat(42,40);globalThis.wolf=foeCombat('Wolf',45,40);wolf.hp=5;
    player.lvl=11;player.xp=0;invOpen=true;replayAnimationsDisabled=false;messages.length=0;`)
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  assert.equal(run('invOpen'),false,'modal closes as soon as the cast commits')
  assert.equal(run('wolf.alive'),false,'combat already resolved before any frames')
  const visualMessages=copy('messages')
  const castPos=visualMessages.findIndex(m=>m.startsWith('Cragbowl hurls a boulder!'))
  const killPos=visualMessages.findIndex(m=>m.includes('You have slain the Wolf!'))
  const xpPos=visualMessages.findIndex(m=>m.includes('You gain '))
  assert.equal(castPos>=0 && killPos>castPos && xpPos>killPos,true,
    'throw, death and XP are logged in causal order')
  assert.equal(visualMessages.filter(m=>m.startsWith('Cragbowl hurls')).length,1,
    'only one launch message per cast')
  const visuals=copy(`({projectiles:projectileAnims.map(p=>({duration:p.duration,start:p.start,projectile:p.projectile})),
    deaths:fxAnims.filter(p=>p.holdUntilImpact).map(p=>({start:p.start,x:p.x,y:p.y})),
    damages:damageAnims.filter(p=>p.x===45 && p.y===40 && typeof p.amount==='number').map(p=>p.delay)})`)
  assert.equal(visuals.projectiles.length,1)
  assert.equal(visuals.projectiles[0].projectile,'bigStone','Cragbowl uses the large projectile')
  assert.equal(visuals.deaths.length,1,'killed actor waits in place until impact')
  assert.equal(visuals.deaths[0].start,visuals.projectiles[0].duration)
  assert.equal(visuals.damages[0],visuals.projectiles[0].duration)
  run('replayAnimationsDisabled=true')

  // The rear wall blocks collective knockback; no monster may overlap or
  // sidestep into an arbitrary destination.
  run(`resetGeomancyCombat();player.inventory=[gemCombat('cragbowl')];naturalCombat(42,40);
    globalThis.a=foeCombat('Goblin',45,40);globalThis.b=foeCombat('Goblin',46,40);
    map[40][47]='dwarvenwall';`)
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  assert.deepEqual(copy('[a.x,b.x]'),[45,46])

  // A lethal middle hit does not shift a dead actor, duplicate loot or
  // leave ghost occupied cells between its surviving neighbors.
  run(`resetGeomancyCombat();player.inventory=[gemCombat('cragbowl')];naturalCombat(42,40);
    globalThis.a=foeCombat('Goblin',45,40);
    globalThis.b=foeCombat('Goblin',46,40);b.hp=5;
    globalThis.c=foeCombat('Goblin',47,40);`)
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  assert.equal(run('b.alive'),false)
  assert.equal(run('occupied.size'),2)
  assert.equal(run('new Set(enemies.map(e=>keyXY(e.x,e.y))).size'),2)

  // A moved underground boulder modifies the one global Z map and every
  // matching cave mask, never a disconnected virtual room or another floor.
  run(`resetGeomancyCombat();currentZ=-1;currentCave=0;map=undergroundMap;
    player.inventory=[gemCombat('stonepress')];
    for(let y=39;y<=41;y++)for(let x=39;x<=46;x++){
      map[y][x]='cavefloor';for(const cm of caveMaps)cm[y][x]='cavefloor';
    }
    map[40][41]='boulder';for(const cm of caveMaps)cm[40][41]='boulder';
    tileUnderlays[tileUnderlayKey(41,40,-1)]='cavefloor';`)
  assert.equal(run('ArtifactGeomancy.activate(0,[1,0])'),true)
  assert.equal(run('map[40][45]'),'boulder')
  assert.equal(run('caveMaps.every(cm=>cm[40][45]==="boulder" && cm[40][41]==="cavefloor")'),true)
  assert.equal(run('tileUnderlays[tileUnderlayKey(45,40,-1)]'),'cavefloor')

  // An intervening wall blocks the specifically chosen pair, without trying
  // the next rock/enemy or spending resources.
  run(`resetGeomancyCombat();player.inventory=[gemCombat('cragbowl')];
    naturalCombat(42,40);naturalCombat(35,40);
    globalThis.a=foeCombat('Goblin',45,40);map[40][43]='dwarvenwall';`)
  const failed=copy('({turnCount,rngState})')
  assert.equal(run('ArtifactGeomancy.canActivate(0)'),false)
  assert.equal(run('ArtifactGeomancy.activate(0)'),false)
  assert.deepEqual(copy('({turnCount,rngState})'),failed)

  // Directional actions resolve by stable replay IDs; the natural underlay
  // and cooldown are restored exactly from the pre-cast save.
  run(`resetGeomancyCombat();player.inventory=[gemCombat('stonepress')];
    naturalCombat(41,40);ensureReplayItemIds();`)
  const beforeReplay=copy('buildSaveObject()')
  const itemId=run('player.inventory[0].replayId')
  const result=()=>copy(`({turnCount,rngState,underlay:tileUnderlays[keyXY(45,40)],
    end:map[40][45],start:map[40][41],cooldown:ArtifactGeomancy.cooldownRemaining('stonepress')})`)
  assert.equal(run('ArtifactGeomancy.activate(0,[1,0])'),true)
  const expected=result()
  context.beforeReplay=beforeReplay
  context.replayAction={type:'useItem',action:'geomancyPower',replayId:itemId,direction:[1,0]}
  run('loadGameFromObject(structuredClone(beforeReplay),{isReplayInit:true})')
  await run('runReplayAction(replayAction)')
  assert.deepEqual(result(),expected,'same stone, underlay, RNG, cooldown and turn after replay')

  run(`resetGeomancyCombat();player.inventory=[gemCombat('cragbowl')];
    naturalCombat(42,40);globalThis.a=foeCombat('Goblin',45,40);
    globalThis.b=foeCombat('Goblin',46,40);ensureReplayItemIds();`)
  const bowlBefore=copy('buildSaveObject()')
  const bowlId=run('player.inventory[0].replayId')
  const bowlResult=()=>copy(`({turnCount,rngState,stone:map[40][42],
    positions:enemies.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp})),
    cooldown:ArtifactGeomancy.cooldownRemaining('cragbowl')})`)
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  const bowlExpected=bowlResult()
  context.bowlBefore=bowlBefore
  context.bowlAction={type:'useItem',action:'geomancyPower',replayId:bowlId}
  run('loadGameFromObject(structuredClone(bowlBefore),{isReplayInit:true})')
  await run('runReplayAction(bowlAction)')
  assert.deepEqual(bowlResult(),bowlExpected,'Cragbowl replay preserves target IDs, HP, RNG and push')
  console.log('PASS Geomancy combat: stonepress, crush, chain push, obstacles, logs, cooldowns and replay')
})().catch(err=>{console.error(err.stack);process.exitCode=1})
