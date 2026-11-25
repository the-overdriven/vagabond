'use strict'
// Rule-level test: exact Fireball footprint, delayed hits, save and replay.
const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const read=expression=>JSON.parse(JSON.stringify(run(expression)))
;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
    replayAnimationsDisabled=true;replayRecording=false;replayPlaying=false;
    raceOpen=false;player.hp=500;player.berserkTurns=0;player.deathShieldReady=false;
    currentZ=0;currentCave=-1;map=surfaceMap;player.x=40;player.y=40;
    enemies=[];npcs=[];groundItems=[];occupied=new Set();
    globalThis.ambientLogs=[];log=(message)=>ambientLogs.push(message);
    globalThis.phaseBefore=resolveEnemyPhase;resolveEnemyPhase=()=>{};
    for(let y=32;y<=52;y++)for(let x=32;x<=54;x++){
      surfaceMap[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
    }
    globalThis.gem=id=>({...makeArtifactTrinket('Stone',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id),identified:true});
    globalThis.spawnTestEnemy=(id,x,y,hp=300,level=0)=>addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,
      id,name:'Goblin',baseName:'Goblin',x,y,hp,maxHp:hp,
      level,levelKind:level===0?'surface':'chain',alive:true,poisonTurns:0,abilities:[]});
    player.inventory=[createItem('scrollOfFireball',{count:3}),gem('burst_bending'),gem('aftershock')];`)
  assert.equal(run('fireballBlastTiles(46,40).length'),17)
  assert.equal(run('fireballVisualTiles(46,40).length'),17)
  assert.equal(run('fireballBlastTiles(46,40).some(p=>p.x===47&&p.y===41)'),false)
  // Regression: clipping the old circular animation into a cross still
  // looked round. Check actual painted cells at early, midway and full burst.
  run(`globalThis.crossPaintedCells=(shape,age)=>{
    const drawn=[]
    const original=ctx.fillRect, originalPuff=fireballPuff
    fireballPuff=(x,y)=>ctx.fillRect(x,y,1,1)
    ctx.fillRect=(px,py,w,h)=>{
      if(w>0&&h>0)drawn.push([Math.floor((px+w/2)/TILE_PX)+camX,
        Math.floor((py+h/2)/TILE_PX)+camY])
    }
    const visible=undergroundTileVisible
    undergroundTileVisible=()=>true
    try {drawFireballBurst({x:46,y:40,cross:true,visualTiles:shape},age)}
    finally {ctx.fillRect=original;fireballPuff=originalPuff;undergroundTileVisible=visible}
    return [...new Set(drawn.map(p=>keyXY(p[0],p[1])))]
  };`)
  const shape=read('fireballBlastTiles(46,40)')
  assert.equal(run('crossPaintedCells(fireballBlastTiles(46,40),0).length'),1,
    'the impact begins only at the selected epicenter')
  assert.equal(run('crossPaintedCells(fireballBlastTiles(46,40),FIREBALL_BURST_MS*0.12).length'),5,
    'the four straight arms expand together, not as a circular ring')
  assert.equal(run('crossPaintedCells(fireballBlastTiles(46,40),FIREBALL_BURST_MS*0.20).length'),9,
    'the advancing front reaches the next four cardinal tiles')
  assert.deepEqual(new Set(read('crossPaintedCells(fireballBlastTiles(46,40),FIREBALL_BURST_MS*0.70)')),
    new Set(shape.map(p=>`${p.x},${p.y}`)),
    'fully expanded flames paint exactly the damaged cross cells')
  run("surfaceMap[40][48]='cavewall'")
  assert.equal(run('crossPaintedCells(fireballBlastTiles(46,40),FIREBALL_BURST_MS*0.70).length'),14,
    'the blocked arm does not visually travel through a wall')
  run("surfaceMap[40][48]='grass'")
  run("surfaceMap[40][48]='cavewall'")
  assert.equal(run('fireballBlastTiles(46,40).length'),14,'opaque wall stops only one arm')
  run("surfaceMap[40][48]='grass'")
  assert.deepEqual(read('fireballCornerStones(46,40)'),
    [{x:45,y:39},{x:47,y:39},{x:45,y:41},{x:47,y:41}])
  run("surfaceMap[39][45]='mountain'")
  assert.equal(run('fireballCornerStones(46,40).length'),3,'solid corners need no visual stone')
  run("surfaceMap[39][45]='grass'")
  assert.deepEqual(read(`(()=>{
    const oldDraw=drawImageVisual,oldVisible=undergroundTileVisible,oldTiles=USE_TILE_IMAGES
    const oldMap=map,oldZ=currentZ,oldText=ctx.fillText
    const images=[],glyphs=[]
    try {
      undergroundTileVisible=()=>true
      drawImageVisual=(x,y,visual,alpha)=>{images.push([visual.image,alpha]);return true}
      const a={cornerStones:[{x:45,y:39}]}
      USE_TILE_IMAGES=true
      for(const [terrain,z] of [[surfaceMap,0],[undergroundMap,-1]]) {
        map=terrain;currentZ=z
        drawFireballCornerStones(a,FIREBALL_FLIGHT_MS)
      }
      drawFireballCornerStones(a,FIREBALL_FLIGHT_MS+FIREBALL_BURST_MS+FIREBALL_STONE_FADE_MS/2)
      drawFireballCornerStones(a,fireballDuration(true))
      USE_TILE_IMAGES=false;ctx.fillText=ch=>glyphs.push(ch)
      drawFireballCornerStones(a,FIREBALL_FLIGHT_MS)
      return {images,glyphs}
    } finally {
      drawImageVisual=oldDraw;undergroundTileVisible=oldVisible;USE_TILE_IMAGES=oldTiles
      map=oldMap;currentZ=oldZ;ctx.fillText=oldText
    }
  })()`),{images:[['img/tiles/mountain-middle.png',1],['img/tiles/mountain-middle.png',1],
    ['img/tiles/mountain-middle.png',0.5]],glyphs:['▲']},
    'the same standalone mountain appears on all levels, fades, and uses its ASCII glyph')
  assert.equal(run('fireballDuration(true)-fireballDuration(false)'),240)
  run(`replayAnimationsDisabled=false;clearEnemyAnims();
    globalThis.blastTiming=queueEnemyAttackPresentation(fireballDuration(true));
    queueAftershockShake()`)
  assert.ok(run('aftershockShakeAnims[0].start>=blastTiming.start+fireballDuration(true)'))
  run('clearEnemyAnims();replayAnimationsDisabled=true')
  const before=read('ArtifactGeomancy.serialize()')
  assert.equal(before.aftershocks.length,0)
  const rngBefore=run('rngState'),turnBefore=run('turnCount')
  assert.equal(run('ArtifactGeomancy.scheduleAftershock([],itemDefinition("scrollOfFireball").effect)'),false,
    'empty area cannot queue a second hit')
  assert.equal(run('rngState'),rngBefore)
  assert.equal(run('turnCount'),turnBefore)
  // A position can be empty at cast time and occupied at the delayed impact.
  run(`globalThis.first=spawnTestEnemy('first',46,40);
    globalThis.offShape=spawnTestEnemy('off-shape',47,41);
    globalThis.initial=structuredClone(buildSaveObject());startReplayRecording()`)
  assert.equal(await run('castFireball(0,46,40)'),true)
  assert.equal(run('turnCount'),turnBefore+1)
  assert.equal(run('first.hp<300'),true)
  assert.equal(run('offShape.hp'),300)
  const afterCast=read('ArtifactGeomancy.serialize().aftershocks')
  assert.equal(afterCast.length,1)
  assert.equal(afterCast[0].dueTurn,turnBefore+2,'wait for one complete intervening world turn')
  assert.equal(afterCast[0].tiles.length,17,'effect stores actual cross, not the future trinket set')
  assert.equal(run('ArtifactGeomancy.pendingAftershockTiles().length'),17)
  assert.equal(run('player.inventory[0].count'),2)
  // The live replay and loaded save keep pending geometry and RNG stable.
  const afterCastState=read('({rngState,turnCount,hit:first.hp,scheduled:ArtifactGeomancy.serialize().aftershocks})')
  context.record=read('structuredClone(replayData)')
  run(`replayRecording=false;loadGameFromObject(structuredClone(record.initialState),{isReplayInit:true});
    activeReplay=record;replayRngIndex=record.actions[0]._rngStart;
    replayPlaying=true;replaySimulationMode=true;`)
  assert.equal(await run('runReplayAction(record.actions[0])'),undefined)
  assert.deepEqual(read('({turnCount,hit:enemies.find(e=>e.id==="first").hp,scheduled:ArtifactGeomancy.serialize().aftershocks})'),
    {turnCount:afterCastState.turnCount,hit:afterCastState.hit,
      scheduled:afterCastState.scheduled})
  assert.equal(run('replayRngIndex===record.actions[0]._rngEnd'),true)
  run('replayPlaying=false;replaySimulationMode=false;loadGameFromObject(structuredClone(initial),{isReplayInit:true})')
  // Recast without recording, then move to a different global level.
  assert.equal(await run('castFireball(0,46,40)'),true)
  const hitHp=run("enemies.find(e=>e.id==='first').hp")
  run(`currentZ=-1;map=undergroundMap;currentCave=-1;
    undergroundMap[40][46]='cavefloor';
    globalThis.lower=spawnTestEnemy('lower',46,40,300,-1);
    rebuildActiveLevelOccupancy();
    globalThis.preloaded=structuredClone(buildSaveObject());
    loadGameFromObject(preloaded,{isReplayInit:true});
    globalThis.targetSaved=enemies.find(e=>e.id==='first');
    globalThis.lowerSaved=enemies.find(e=>e.id==='lower');`)
  assert.equal(run('ArtifactGeomancy.serialize().aftershocks.length'),1)
  assert.equal(run('targetSaved.hp'),hitHp)
  assert.equal(run('occupied.has(keyXY(46,40))'),true,'active lower level indexes its own actor')
  run('enemyTurn()')
  assert.equal(run('ArtifactGeomancy.serialize().aftershocks.length'),0)
  assert.ok(run('targetSaved.hp') < hitHp,'damage resolved on saved upper-level coordinate')
  assert.equal(run('lowerSaved.hp'),300,'different Z remains unaffected')
  assert.equal(run('occupied.has(keyXY(46,40))'),true,'offlevel impact does not alter current occupancy')
  assert.equal(run('ArtifactGeomancy.pendingAftershockTiles().length'),0)
  // Removing the passive after casting must not erase the pending aftershock.
  run(`currentZ=0;map=surfaceMap;currentCave=-1;rebuildActiveLevelOccupancy();
    player.inventory=[createItem('scrollOfFireball'),gem('aftershock')];
    turnCount+=10;ArtifactGeomancy.scheduleAftershock([{x:50,y:40}],itemDefinition('scrollOfFireball').effect);
    player.inventory=[];player.groundingArmed=true;
    globalThis.newArrival=spawnTestEnemy('new-arrival',50,40,300);
    globalThis.turnAfter=turnCount;`)
  assert.equal(run('ArtifactGeomancy.serialize().aftershocks.length'),1)
  run('turnCount=turnAfter+2;ArtifactGeomancy.tick()')
  assert.equal(run('ArtifactGeomancy.serialize().aftershocks.length'),0)
  assert.ok(run('newArrival.hp')<300,'an actor entering an originally empty tile takes the shock')
  assert.equal(run('player.groundingArmed'),true,'secondary quake never consumes Grounding')
  // The player is also an occupant; one-use death protection must work.
  run(`player.inventory=[gem('aftershock')];player.hp=1;player.deathShieldReady=true;
    ArtifactGeomancy.scheduleAftershock([{x:player.x,y:player.y}],itemDefinition('scrollOfFireball').effect);
    turnCount+=2;ArtifactGeomancy.tick()`)
  assert.equal(run('player.hp'),1)
  assert.equal(run('player.deathShieldReady'),false)
  // No unsupported fake bridge through the Tower remains.
  assert.equal(run("typeof TowerMaze.chaosTarget==='undefined' && typeof TowerMaze.guaranteeChaosScroll==='undefined'"),true)
  console.log('PASS Burst Bending 17-cell cross, blocked arms, delayed Aftershock and off-Z save/replay')
})().catch(err=>{console.error(err);process.exitCode=1})
