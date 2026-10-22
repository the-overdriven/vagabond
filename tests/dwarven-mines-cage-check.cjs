'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const copy=value=>JSON.parse(JSON.stringify(value))

;(async()=>{
  await run('loadContent()')
  run(`CAVE_SILHOUETTE_SOURCES=CAVE_SILHOUETTE_SOURCES.filter(source=>
    ['glaber','marsutal','duiwel','trogloraptor','sifulian','vrakeber',
    'tmusapod','akravis','adelocosa','bellroach','barolg','alacran','amplyg',
    'wyrdhag','tholosum','xibal','naledi','troglodyte','cave_troll'].includes(source.id))`)
  run(`WORLD_SEED=610061;rngState=WORLD_SEED;applyWorldTraits([],'XS');
    log=()=>{};replayAnimationsDisabled=true;replayRecording=false;raceOpen=false;
    player.inventory=[];player.curseDebuffs=[];enemies=[];groundItems=[];occupied=new Set()`)
  await run('generateNewWorld()')
  const endpoints=copy(run('dwarvenMinesCageShortcut()'))
  assert(endpoints && endpoints.kind==='haulageCage' && !endpoints.unlocked)
  const ruinsLift=copy(run('dwarvenRuinsLiftShortcut()'))
  assert(ruinsLift && ruinsLift.kind==='lift' && ruinsLift.packageId==='dwarvenRuins',
    'the existing Ruins lift remains independently registered')
  assert.equal(endpoints.upper.z,-9)
  assert([-11,-12].includes(endpoints.lower.z))
  assert.equal(endpoints.upper.floor,1)
  assert([3,4].includes(endpoints.lower.floor))
  assert.deepEqual(copy(run('dungeonPackageLevels("dwarvenMines")[0].level.mineCagePad')),
    {x:endpoints.upper.x,y:endpoints.upper.y})
  assert.deepEqual(copy(run('dungeonPackageLevels("dwarvenMines").at(-1).level.mineCagePad')),
    {x:endpoints.lower.x,y:endpoints.lower.y})

  // Art and ASCII semantics are different for the inactive pad, active upper
  // carriage and active lower carriage; every tile has a unique save code.
  const names=['minecageupperoff','minecageloweroff','minecageupperon','minecageloweron']
  assert.equal(new Set(names.map(name=>run(`TILE_CODE[${JSON.stringify(name)}]`))).size,4)
  for(const name of names){
    assert(run(`TILE[${JSON.stringify(name)}].walk`),`${name} remains traversable`)
    const asset=run(`RENDER_STYLE.terrainTiles[${JSON.stringify(name)}].image`)
    assert(asset && fs.existsSync(path.resolve(__dirname,'..',asset)),`${name} has an installed sprite`)
    assert(run(`TILE[${JSON.stringify(name)}].ch.length`)===1,`${name} has an ASCII glyph`)
    assert.equal(run(`RENDER_STYLE.terrainTiles[${JSON.stringify(name)}].baseTileKey`),'cavefloor2')
  }
  run(`enemies=[];occupied=new Set();resolveEnemyTurn=()=>{};npcTurn=()=>{};
    player.hp=999;player.maxHp=999;deathTransition=false;player.poisonTurns=0;
    player.invisibleTurns=0;resetSwimming=()=>{};
    cageCameraSnaps=0;snapCameraToPlayer=()=>{cageCameraSnaps++};
    placeOnCage=(position)=>{
      currentZ=position.z;currentCave=-1;
      const layer=deepLevels[chainDepthForZ(currentZ)-2];
      map=layer.map;undergroundDiscovered=layer.discovered;
      player.x=position.x;player.y=position.y;
    };
    placeOnCage(dwarvenMinesCageShortcut().upper)`)
  assert.equal(run('map[player.y][player.x]'),'minecageupperoff')
  const lockedTurn=run('turnCount')
  assert(run('enterCave()'),'the upper cage explains its locked state')
  assert.equal(run('turnCount'),lockedTurn,'upper cage refuses travel without consuming a turn')
  assert.equal(run('currentZ'),-9)

  context.beforeUnlock=copy(run('buildSaveObject()'))
  const beforeRng=run('rngState')
  run('loadGameFromObject(beforeUnlock,{isReplayInit:true})')
  assert.equal(run('rngState'),beforeRng)
  assert.equal(run('dwarvenMinesCageShortcut().unlocked'),false)
  assert.equal(run('map[player.y][player.x]'),'minecageupperoff')
  run('placeOnCage(dwarvenMinesCageShortcut().lower)')
  assert.equal(run('map[player.y][player.x]'),'minecageloweroff')
  const lowerZ=run('currentZ'),turn=run('turnCount')
  assert(run('enterCave()'),'the lower cage can be released')
  assert.equal(run('turnCount'),turn+1,'unlock takes exactly one gameplay turn')
  assert.equal(run('currentZ'),lowerZ,'unlock does not also transport the player')
  assert.equal(run('dwarvenMinesCageShortcut().unlocked'),true)
  assert.equal(run('map[player.y][player.x]'),'minecageloweron')
  assert.equal(run('depthUndergroundMap(9)[dwarvenMinesCageShortcut().upper.y][dwarvenMinesCageShortcut().upper.x]'),'minecageupperon')

  context.afterUnlock=copy(run('buildSaveObject()'))
  const afterRng=run('rngState')
  run('loadGameFromObject(afterUnlock,{isReplayInit:true})')
  assert.equal(run('rngState'),afterRng,'restoring unlocked cage uses no RNG')
  assert.equal(run('dwarvenMinesCageShortcut().unlocked'),true)
  assert.equal(run('map[player.y][player.x]'),'minecageloweron')
  assert.equal(run('depthUndergroundMap(9)[dwarvenMinesCageShortcut().upper.y][dwarvenMinesCageShortcut().upper.x]'),'minecageupperon')
  assert.equal(run('dungeonShortcutsForPackage("dwarvenMines").length'),1,'single shared cage state')
  assert.deepEqual(copy(run('dwarvenRuinsLiftShortcut()')),ruinsLift,
    'cage activation cannot unlock or alter the separate Ruins lift')

  // The lower floor must forget prepared attacks when the player skips it.
  run(`const first=enemies.find(e=>e.alive && e.level===currentZ)
    if(first){markEnemyAbility(first,'rupture',[{x:player.x,y:player.y}]);globalThis.warningEnemyId=first.id}`)
  const travelTurn=run('turnCount')
  const travelCameraSnaps=run('cageCameraSnaps')
  assert(run('enterCave()'),'lower cage rides directly to first floor')
  assert.equal(run('currentZ'),-9)
  assert.equal(run('turnCount'),travelTurn,'same turn convention as ordinary dungeon stairs')
  assert(run('cageCameraSnaps')>travelCameraSnaps,'cage travel snaps the camera to its destination')
  if(run('typeof warningEnemyId!=="undefined"'))
    assert.equal(run('enemies.find(e=>e.id===warningEnemyId).pendingAbility'),null,
      'a cage transition cancels departure-floor telegraphs')
  assert(run('enterCave()'),'upper cage returns to final mine floor')
  assert.equal(run('currentZ'),lowerZ)

  // A creature on the intended landing cannot be overwritten; the existing
  // arrival search instead chooses a legal adjacent place.
  run(`placeOnCage(dwarvenMinesCageShortcut().upper);
    const p=dwarvenMinesCageShortcut().lower;
    enemies.push({id:'cage_landing_blocker',alive:true,level:p.z,levelKind:'chain',x:p.x,y:p.y})`)
  assert(run('enterCave()'))
  assert.equal(run('currentZ'),lowerZ)
  assert.notDeepEqual(copy(run('({x:player.x,y:player.y})')),
    {x:endpoints.lower.x,y:endpoints.lower.y},'occupied endpoint is not used as landing')
  assert(run('TILE[map[player.y][player.x]].walk'))

  // Exercise the real denial path, retaining all active state if even the
  // nearest legal passage is blocked.
  run(`placeOnCage(dwarvenMinesCageShortcut().upper);
    originalMineArrival=mineTransitionArrival;mineTransitionArrival=()=>null`)
  const denied=copy(run('({z:currentZ,x:player.x,y:player.y,turn:turnCount})'))
  assert(run('enterCave()'),'a blocked destination is handled without an exception')
  assert.deepEqual(copy(run('({z:currentZ,x:player.x,y:player.y,turn:turnCount})')),denied)
  run('mineTransitionArrival=originalMineArrival')

  run('enemies=enemies.filter(e=>e.id!=="cage_landing_blocker")')
  context.returnSnapshot=copy(run('buildSaveObject()'))
  run('loadGameFromObject(returnSnapshot,{isReplayInit:true})')
  assert.equal(run('dwarvenMinesCageShortcut().unlocked'),true)
  assert.equal(run('map[player.y][player.x]'),'minecageupperon')

  // Record and replay the real Inspect action, starting while the bottom
  // endpoint is still locked. No animation frame controls the result.
  run(`loadGameFromObject(beforeUnlock,{isReplayInit:true});
    enemies=[];occupied=new Set();resolveEnemyTurn=()=>{};npcTurn=()=>{};
    placeOnCage(dwarvenMinesCageShortcut().lower);
    replayRecording=false;replayPlaying=false;replayData=null;
    turnCount=0;startReplayRecording();inspect()`)
  await Promise.resolve()
  const recorded=copy(run('replayData'))
  assert.equal(recorded.actions.length,1)
  assert.equal(recorded.actions[0].type,'inspect')
  assert.equal(run('turnCount'),1)
  assert.equal(run('dwarvenMinesCageShortcut().unlocked'),true)
  context.cageReplay=recorded
  run(`replayRecording=false;
    loadGameFromObject(cageReplay.initialState,{isReplayInit:true});
    activeReplay=cageReplay;replayPlaying=true;replaySimulationMode=true;replayRngIndex=0`)
  await run('runReplayAction(cageReplay.actions[0])')
  assert.equal(run('dwarvenMinesCageShortcut().unlocked'),true)
  assert.equal(run('turnCount'),1)
  assert.equal(run('replayRngIndex'),recorded.rng.length,'identical recorded/replayed RNG use')
  run('replayPlaying=false;replaySimulationMode=false;activeReplay=null')
  console.log('PASS Batch E mine cage: 3/4-floor endpoints, art/ASCII, lower unlock, fast return, blocked landing and save/replay')
})().catch(error=>{console.error(error.stack);process.exitCode=1})
