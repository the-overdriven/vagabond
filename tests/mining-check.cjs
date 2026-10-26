const assert = require('node:assert/strict')
const {run, context} = require('./helpers/node-game-runtime.cjs')
const plain = value => JSON.parse(JSON.stringify(value))

;(async () => {
  await run('loadContent()')
  run(`WORLD_SEED=610061;rngState=WORLD_SEED;applyWorldTraits([],'XS');
    MAP_W=260;MAP_H=260;enemies=[];groundItems=[];occupied=new Set();
    replayAnimationsDisabled=true;replayRecording=false;raceOpen=false;log=()=>{};
    let miningTrial=null;for(let attempt=0;attempt<16&&!miningTrial;attempt++)
      miningTrial=mineFloorCandidate(0,4);
    if(!miningTrial)throw Error('mine floor candidate failed');
    Mining.generate([miningTrial]);
    deepLevels=Array.from({length:7},()=>mineUnusedChainLevel()).concat(miningTrial);
    surfaceMap=blankCaveMap();caveMaps=[blankCaveMap()];caves=[];
    discovered=Array.from({length:MAP_H},()=>Array(MAP_W).fill(false));
    undergroundDiscoveredL1=Array.from({length:MAP_H},()=>Array(MAP_W).fill(false));
    spawnPoint={x:5,y:5};currentZ=-9;currentCave=-1;map=miningTrial.map;
    undergroundDiscovered=miningTrial.discovered;addInventoryItem('pickaxe');
    const routes=dungeonWalkDistances(map,miningTrial.mineUpstairs);
    let testSeam=null,testApproach=null;
    for(const seam of miningTrial.mineExcavations.filter(d=>d.kind==='wall'&&d.threshold===0)){
      for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
        if(routes.has(keyXY(seam.x+dx,seam.y+dy))){testSeam=seam;testApproach={x:seam.x+dx,y:seam.y+dy};break}
      }
      if(testSeam)break
    }
    if(!testSeam)throw Error('missing safe obvious seam');
    player.x=testApproach.x;player.y=testApproach.y;player.hp=playerMaxHp();
    invalidateUndergroundFov()`)
  assert.equal(run('miningTrial.minePockets.length>=3&&miningTrial.minePockets.length<=10'), true)
  assert.equal(run('miningTrial.minePockets.every(p=>p.cells.length>0&&p.entrances.length>0)'), true)
  const pocketDepths = plain(run('miningTrial.minePockets.map(p=>p.approachDepth)'))
  assert(pocketDepths.every(d => Number.isInteger(d) && d >= 1 && d <= 20),
    'every pocket has a finite mineable approach between one and twenty walls')
  assert(pocketDepths.some(d => d >= 10),
    'the fixed seed contains a pocket far beyond the first corridor wall')
  assert.equal(run(`miningTrial.minePockets.every(p=>{
    const entrance=p.entrances[0]
    return [[0,-1],[1,0],[0,1],[-1,0]].some(([dx,dy])=>
      miningTrial.mineExcavations.filter(t=>t.kind==='wall'&&t.pocketId===p.id)
        .every(t=>t.removed===false) &&
      Array.from({length:p.approachDepth},(_,n)=>({x:entrance.x+dx*n,y:entrance.y+dy*n}))
        .every(t=>miningTrial.mineExcavations.some(s=>s.kind==='wall'&&s.pocketId===p.id&&s.x===t.x&&s.y===t.y)) &&
      p.cells.some(c=>c.x===entrance.x+dx*p.approachDepth&&c.y===entrance.y+dy*p.approachDepth))
  })`), true, 'every pocket approach remains a continuous mineable route')
  assert.equal(run('miningTrial.mineMineralValue>=50&&miningTrial.mineMineralValue<=150'), true)
  const initialCrystal = plain(run('miningTrial.mineExcavations.find(t=>t.kind===\'exposed\')'))
  assert(initialCrystal,'the test mine includes an exposed crystal')
  context.initialCrystal = initialCrystal
  assert.equal(run('Mining.blocksPathAt(initialCrystal.x,initialCrystal.y)'),true,
    'exposed formations block ordinary paths until extracted')
  assert.equal(run('playerPathCanTraverse(initialCrystal.x,initialCrystal.y)'),false,
    'auto-travel routes around exposed corridor crystals')
  assert.equal(run('enemyCanTraverse({abilities:[]},initialCrystal.x,initialCrystal.y)'),false,
    'monsters do not walk through an exposed formation')
  const initialTurn = run('turnCount')
  await run('tryMove(testSeam.x-player.x,testSeam.y-player.y)')
  assert.equal(run('turnCount'),initialTurn,'mining warning is free')
  assert.equal(run('player.miningTutorialSeen'),true,'the one-time mining warning is marked seen')
  await run('tryMove(testSeam.x-player.x,testSeam.y-player.y)')
  assert.equal(run('turnCount'),initialTurn+1,'each mining strike consumes exactly one turn')
  assert.equal(run('testSeam.progress'),1)
  const saved = plain(run('buildSaveObject()'))
  assert.equal(saved.player.miningTutorialSeen,true,'the one-time tutorial flag is saved')
  context.testSaved = saved
  const rngBefore = run('rngState')
  const firstProgress = saved.deepLevels.at(-1).mineExcavations
    .find(t => t.x === run('testSeam.x') && t.y === run('testSeam.y')).progress
  assert.equal(firstProgress,1,'partial mining recorded in current save')
  run('loadGameFromObject(testSaved,{isReplayInit:true})')
  run('replayAnimationsDisabled=true;attackAnim=null;cameraAnimating=false;pendingMove=null')
  // A full mine save is used as a replay initial snapshot; restoration must
  // preserve both excavation progress and the current deterministic RNG state.
  assert.equal(run('rngState'),rngBefore)
  assert.equal(run('player.miningTutorialSeen'),true,'loading never shows the tutorial again')
  assert.equal(run('Mining.find(Mining.activeLevel(),testSeam.x,testSeam.y).progress'),1)
  await run('tryMove(testSeam.x-player.x,testSeam.y-player.y)')
  assert.equal(run('map[testSeam.y][testSeam.x]'),'cavefloor2')
  assert.equal(run('Mining.excavatedAt(Mining.activeLevel(),testSeam.x,testSeam.y)'),true)
  assert.equal(run('player.mining'),0,'one weak seam no longer grants an entire Mining level')
  assert.equal(run('player.miningXpUnits'),1000000,'earned Mining XP is preserved as the level threshold increases')
  assert.equal(run('MINING_CONFIG.skill.xpRequiredMultiplier'),3)
  assert.equal(run('mineSightDarknessAt(player.x+2,player.y)'),0)
  assert.equal(run('mineSightDarknessAt(player.x+3,player.y)'),0.25)
  assert.equal(run('mineSightDarknessAt(player.x+4,player.y)'),0.5)
  assert.equal(run('mineSightDarknessAt(player.x+5,player.y)'),0.75)
  assert.equal(run('mineSightDarknessAt(player.x+6,player.y)'),0,
    'crystal-lit terrain outside ordinary mine sight is not darkened by its outer ring')
  const renderedDarkness = plain(run(`(()=>{
    const previousMap=map,previousX=player.x,previousY=player.y
    const previousFill=ctx.fillRect,previousTileMode=USE_TILE_IMAGES
    const previousStatus=updatePlayerStatuses,previousAlarm=updateAlarmedEnemies
    const previousMinimap=renderMinimap
    const bands=new Set()
    try {
      map=Array.from({length:MAP_H},()=>Array(MAP_W).fill('cavefloor2'))
      player.x=20;player.y=20;USE_TILE_IMAGES=false
      invalidateUndergroundFov()
      updatePlayerStatuses=()=>{};updateAlarmedEnemies=()=>{};renderMinimap=()=>{}
      ctx.fillRect=function(x,y,w,h){
        if(w===TILE_PX&&h===TILE_PX&&typeof this.fillStyle==='string'&&
          this.fillStyle.startsWith('rgba(0, 0, 0, ')) bands.add(this.fillStyle)
        return previousFill.call(this,x,y,w,h)
      }
      renderScene(0)
      return [...bands]
    } finally {
      ctx.fillRect=previousFill;map=previousMap;player.x=previousX;player.y=previousY
      USE_TILE_IMAGES=previousTileMode;updatePlayerStatuses=previousStatus
      updateAlarmedEnemies=previousAlarm;renderMinimap=previousMinimap;invalidateUndergroundFov()
    }
  })()`))
  for (const opacity of ['0.25','0.5','0.75']) {
    assert(renderedDarkness.includes(`rgba(0, 0, 0, ${opacity})`),
      `the canvas draws its ${opacity} mine darkness band`)
  }
  const asciiCrystalShade = plain(run(`(()=>{
    const level=Mining.activeLevel(),oldDeposits=level.mineExcavations
    const oldMap=map,oldX=player.x,oldY=player.y,oldCamX=camX,oldCamY=camY
    const oldMode=USE_TILE_IMAGES,oldFill=ctx.fillRect
    const shades=new Map()
    try {
      map=Array.from({length:MAP_H},()=>Array(MAP_W).fill('cavefloor2'))
      player.x=20;player.y=20;camX=15;camY=15;USE_TILE_IMAGES=false
      level.mineExcavations=[{x:25,y:20,kind:'exposed',mineral:'ruby',removed:false,threshold:0}]
      const visible=UndergroundFov.compute(map,20,20,5)
      ctx.fillRect=function(x,y,w,h){
        if(w===TILE_PX&&h===TILE_PX&&typeof this.fillStyle==='string'&&
          this.fillStyle.startsWith('rgba(0, 0, 0, '))shades.set(x+','+y,this.fillStyle)
        return oldFill.call(this,x,y,w,h)
      }
      drawMineSightDarkness(visible,15,15,VIEW_W,VIEW_H)
      return {
        source:shades.get((25-15)*TILE_PX+','+(20-15)*TILE_PX)||null,
        unlit:shades.get((20-15)*TILE_PX+','+(25-15)*TILE_PX)||null
      }
    } finally {
      ctx.fillRect=oldFill;level.mineExcavations=oldDeposits;map=oldMap
      player.x=oldX;player.y=oldY;camX=oldCamX;camY=oldCamY;USE_TILE_IMAGES=oldMode
      invalidateUndergroundFov()
    }
  })()`))
  assert.equal(asciiCrystalShade.source,null,
    'crystal source on the fifth ring has no FOV darkness even in ASCII mode')
  assert.equal(asciiCrystalShade.unlit,'rgba(0, 0, 0, 0.75)',
    'an unlit fifth-ring tile retains its normal FOV darkness')
  const bareRock = plain(run(`(()=>{
    const level=Mining.activeLevel()
    for(const p of level.minePockets.flatMap(p=>p.entrances)){
      for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
        const x=p.x+dx,y=p.y+dy
        if(map[y]?.[x]!=='cavefloor2')continue
        for(const [ax,ay] of [[0,-1],[1,0],[0,1],[-1,0]]){
          const tx=x+ax,ty=y+ay
          if(map[ty]?.[tx]==='cavewall'&&!Mining.find(level,tx,ty))return {x,y,tx,ty}
        }
      }
    }
    return null
  })()`))
  assert(bareRock,'an ordinary unmineable wall remains beside the mine path')
  context.bareRock = bareRock
  run('player.x=bareRock.x;player.y=bareRock.y;player.miningArmedTarget=null')
  const solidTurn = run('turnCount'), skillBefore = run('player.mining'), xpBefore = run('player.miningXpUnits')
  await run('tryMove(bareRock.tx-player.x,bareRock.ty-player.y)')
  assert.equal(run('turnCount'),solidTurn+1,'subsequent rock probes immediately consume a turn')
  await run('tryMove(bareRock.tx-player.x,bareRock.ty-player.y)')
  assert.equal(run('turnCount'),solidTurn+2,'solid rock still resists repeated mining')
  assert.equal(run('player.mining'),skillBefore)
  assert.equal(run('player.miningXpUnits'),xpBefore)
  const godTurn = run('turnCount')
  run('player.godMode=true')
  assert.equal(run('Mining.canTarget(bareRock.tx,bareRock.ty)'),false,
    'god mode bypasses futile mining against solid mine walls')
  await run('tryMove(bareRock.tx-player.x,bareRock.ty-player.y)')
  assert.equal(run('player.x===bareRock.tx&&player.y===bareRock.ty'),true,
    'god mode walks into otherwise solid mine rock')
  assert.equal(run('map[bareRock.ty][bareRock.tx]'),'cavewall',
    'god mode wall traversal does not modify permanent terrain')
  assert.equal(run('turnCount'),godTurn+1,'god mode wall traversal uses a normal movement turn')
  run('player.godMode=false;player.x=bareRock.x;player.y=bareRock.y;invalidateUndergroundFov()')
  const illumination = plain(run(`(()=>{
    const level=Mining.activeLevel(),original=level.mineExcavations
    const terrain=Array.from({length:25},()=>Array(25).fill('cavefloor2'))
    level.mineExcavations=[{x:12,y:10,kind:'exposed',mineral:'ruby',removed:false,threshold:0}]
    try {
      const ordinary=UndergroundFov.compute(terrain,2,10,5)
      const lit=Mining.lightVisible(terrain,2,10,ordinary)
      terrain[10][14]='cavewall'
      const behindCrystal=Mining.lightVisible(terrain,2,10,ordinary)
      terrain[10][14]='cavefloor2';terrain[10][8]='cavewall'
      const behindPlayerWall=Mining.lightVisible(terrain,2,10,ordinary)
      level.mineExcavations[0].removed=true
      const exhausted=Mining.lightVisible(terrain,2,10,ordinary)
      return {ordinary:ordinary.has('12,10'),distant:lit.has('12,10'),
        litTile:lit.has('15,10'),outOfGlow:lit.has('17,10'),
        blockedBehindCrystal:behindCrystal.has('15,10'),
        blockedBehindPlayer:behindPlayerWall.has('12,10'),
        spillAroundCorner:behindPlayerWall.has('12,8'),
        removedStillLit:exhausted.has('12,10')}
    } finally {level.mineExcavations=original}
  })()`))
  assert.equal(illumination.ordinary,false,'distant ruby lies outside the normal five-tile FOV')
  assert.equal(illumination.distant,true,'crystal itself remains visible beyond the combined sight and glow range')
  assert.equal(illumination.litTile,true,'distant illuminated terrain is visible')
  assert.equal(illumination.outOfGlow,false,'crystal only lights its configured radius')
  assert.equal(illumination.blockedBehindCrystal,false,'solid rock blocks crystal light')
  assert.equal(illumination.blockedBehindPlayer,false,'solid rock blocks the player’s view of distant light')
  assert.equal(illumination.spillAroundCorner,true,'light can reveal visible tiles when the source is around a corner')
  assert.equal(illumination.removedStillLit,false,'mined crystals no longer illuminate terrain')
  const litWallFaces = plain(run(`(()=>{
    const terrain=Array.from({length:25},()=>Array(25).fill('cavefloor2'))
    terrain[10][10]='cavewall'
    return {
      fromSameSide:Mining.lightCanReach(terrain,12,10,10,10,13,10),
      fromOppositeSide:Mining.lightCanReach(terrain,12,10,10,10,8,10),
      sameDiagonalFace:Mining.lightCanReach(terrain,12,9,10,10,13,11),
      oppositeDiagonalFace:Mining.lightCanReach(terrain,12,9,10,10,8,11),
      unobstructedFloor:Mining.lightCanReach(terrain,12,10,11,10,13,10),
      rockBlocksFloor:Mining.lightCanReach(terrain,12,10,9,10,8,10),
      seesWall:UndergroundFov.canSee(terrain,8,10,10,10)
    }
  })()`))
  assert.equal(litWallFaces.fromSameSide,true,'crystals illuminate the wall face toward their source')
  assert.equal(litWallFaces.fromOppositeSide,false,'crystals cannot tint the opposite face of an opaque wall')
  assert.equal(litWallFaces.sameDiagonalFace,true,'a diagonal viewer can share a lit wall face')
  assert.equal(litWallFaces.oppositeDiagonalFace,false,'diagonal rays cannot light a hidden wall face')
  assert.equal(litWallFaces.unobstructedFloor,true,'unblocked floor tiles still receive light')
  assert.equal(litWallFaces.rockBlocksFloor,false,'solid rock still blocks illumination beyond itself')
  assert.equal(litWallFaces.seesWall,true,'the unlit wall remains visible to the player')
  const diagonalLight = plain(run(`(()=>{
    const terrain=Array.from({length:7},()=>Array(7).fill('cavefloor2'))
    terrain[1][2]='cavewall'
    const openSide=Mining.lightCanReach(terrain,2,2,3,1,4,2)
    terrain[2][3]='cavewall'
    const sealedCorner=Mining.lightCanReach(terrain,2,2,3,1,4,2)
    return {openSide,sealedCorner}
  })()`))
  assert.equal(diagonalLight.openSide,true,
    'a crystal lights diagonal floor through the one open side of a corner')
  assert.equal(diagonalLight.sealedCorner,false,
    'two diagonally adjacent walls continue to block light')
  const embeddedLight = plain(run(`(()=>{
    const level=Mining.activeLevel(),old=level.mineExcavations
    const terrain=Array.from({length:12},()=>Array(12).fill('cavefloor2'))
    const deposit={x:6,y:5,kind:'embedded',mineral:'quartz',removed:false,threshold:0}
    terrain[5][6]='cavewall'
    level.mineExcavations=[deposit]
    try {
      const ordinary=UndergroundFov.compute(terrain,2,5,1)
      const exposed=Mining.lightVisible(terrain,2,5,ordinary)
      deposit.threshold=50
      const hidden=Mining.lightVisible(terrain,2,5,ordinary)
      deposit.threshold=0
      terrain[4][6]='cavewall'
      return {radius:Mining.lightInfo(deposit).radius,near:exposed.has('5,5'),
        beyond:exposed.has('4,5'),concealed:!!Mining.lightInfo({...deposit,threshold:50}),
        hiddenLight:hidden.has('5,5'),ordinaryCorner:UndergroundFov.canSee(terrain,5,5,6,4),
        blockedCorner:Mining.lightCanReach(terrain,5,5,6,4,5,5),
        straight:Mining.lightCanReach(terrain,6,5,7,5,7,5)}
    } finally {level.mineExcavations=old}
  })()`))
  assert.equal(embeddedLight.radius,1,'wall crystals glow at a smaller radius')
  assert.equal(embeddedLight.near,true,'visible embedded minerals light nearby floor')
  assert.equal(embeddedLight.beyond,false,'embedded glow does not extend to exposed crystal range')
  assert.equal(embeddedLight.concealed,false,'concealed deposits do not announce themselves with light')
  assert.equal(embeddedLight.hiddenLight,false,'concealed deposits cannot reveal distant tiles')
  assert.equal(embeddedLight.ordinaryCorner,true,'normal FOV permits a diagonal corner sightline')
  assert.equal(embeddedLight.blockedCorner,false,'crystal light cannot leak diagonally past a wall corner')
  assert.equal(embeddedLight.straight,true,'light still reaches unobstructed corridor tiles')
  run(`(()=>{
    player.x=testApproach.x;player.y=testApproach.y
    const ground=groundItems.find(g=>onCurrentLevel(g)&&g.x===player.x&&g.y===player.y)
    if(ground)throw Error('test approach unexpectedly contains a ground item')
    addInventoryItem('ruby',{count:2})
    dropCrystal(player.inventory.findIndex(item=>item.kind==='ruby'))
    dropCrystal(player.inventory.findIndex(item=>item.kind==='ruby'))
  })()`)
  assert.equal(run('groundItems.filter(g=>onCurrentLevel(g)&&g.kind===\'ruby\').length'), 1,
    'two dropped crystals of one type share one ground object')
  assert.equal(run('groundItems.find(g=>onCurrentLevel(g)&&g.kind===\'ruby\').count'), 2,
    'dropping removes exactly one unit per inventory action')
  assert.equal(run('player.inventory.some(i=>i.kind===\'ruby\')'), false)
  assert.equal(run('Mining.lightInfo(Mining.lightSources().find(s=>s.kind===\'dropped\')).radius'),3,
    'a dropped ruby provides the agreed smaller light radius')
  const otherFloorLight = plain(run(`(()=>{
    const z=currentZ
    const crystal={x:player.x,y:player.y,level:-1,levelKind:'chain',kind:'quartz',count:1}
    groundItems.push(crystal)
    try {
      currentZ=-1
      const underground=Mining.lightSources().some(s=>s.kind==='dropped'&&s.mineral==='quartz')
      currentZ=0
      const surface=Mining.lightSources().some(s=>s.kind==='dropped')
      return {underground,surface}
    } finally {currentZ=z;groundItems.splice(groundItems.indexOf(crystal),1)}
  })()`))
  assert.equal(otherFloorLight.underground,true,'portable crystal light works on other underground floors')
  assert.equal(otherFloorLight.surface,false,'a crystal does not illuminate the surface')
  const daylight = plain(run(`(()=>{
    const previous={z:currentZ,map,caves,x:player.x,y:player.y}
    try {
      currentZ=-1;map=Array.from({length:25},()=>Array(25).fill('cavefloor'))
      map[10][12]='caveentrance';caves=[{entrances:[{x:12,y:10},{x:12,y:10}]}]
      player.x=2;player.y=10
      const sources=Mining.lightSources().filter(source=>source.kind==='surfaceExit')
      const info=Mining.lightInfo(sources[0])
      const normal=UndergroundFov.compute(map,2,10,8)
      const lit=Mining.lightVisible(map,2,10,normal)
      map[10][9]='cavewall'
      const blocked=Mining.lightVisible(map,2,10,normal)
      currentZ=-2
      const deeper=Mining.lightSources().some(source=>source.kind==='surfaceExit')
      return {sources:sources.length,info,normal:normal.has('12,10'),exit:lit.has('12,10'),
        nearby:lit.has('13,10'),outside:lit.has('14,10'),blocked:blocked.has('12,10'),deeper}
    } finally {
      currentZ=previous.z;map=previous.map;caves=previous.caves
      player.x=previous.x;player.y=previous.y
    }
  })()`))
  assert.equal(daylight.sources,1,'a repeated entrance descriptor emits only one light source')
  assert.deepEqual(daylight.info,{radius:1,opacity:0.55,color:'#ffe1a3',pulse:false},
    'surface daylight is steady and configured independently of crystals')
  assert.equal(daylight.normal,false)
  assert.equal(daylight.exit,true,'daylight reveals a cave exit outside normal sight')
  assert.equal(daylight.nearby,true,'sunlight brightens adjacent cave floor')
  assert.equal(daylight.outside,false,'sunlight does not extend indefinitely')
  assert.equal(daylight.blocked,false,'rock between player and exit blocks the daylight view')
  assert.equal(daylight.deeper,false,'surface daylight belongs only to the first cave layer')
  const crystalSave = plain(run('buildSaveObject()'))
  context.crystalSave = crystalSave
  run('loadGameFromObject(crystalSave,{isReplayInit:true})')
  assert.equal(run('groundItems.find(g=>onCurrentLevel(g)&&g.kind===\'ruby\').count'),2,
    'a stack of dropped glowing crystals survives save/replay initialization')
  assert.equal(run('Mining.lightSources().some(s=>s.kind===\'dropped\')'),true,
    'a restored crystal is an active light source')
  const pickupTurn = run('turnCount')
  run('lootSkeletonOrForage()')
  assert.equal(run('turnCount'),pickupTurn+1,'F picks up a dropped crystal stack in one turn')
  assert.equal(run('player.inventory.find(i=>i.kind===\'ruby\').count'),2)
  assert.equal(run('Mining.lightSources().some(s=>s.kind===\'dropped\')'),false,
    'recovering a crystal immediately removes its light')
  run(`(()=>{
    const target=keyXY(bareRock.tx,bareRock.ty)
    const approaches=dungeonWalkDistances(map,{x:bareRock.x,y:bareRock.y})
    const place=[...approaches].find(([position,steps])=>steps>=4&&steps<=8&&position!==target)
    if(!place)throw Error('no nearby ordinary traversal site for sound investigator')
    const [x,y]=place[0].split(',').map(Number),tmpl=ENEMY_TEMPLATE_BY_NAME['Giant Rat']
    addEnemy({name:tmpl.name,baseName:tmpl.name,level:-9,levelKind:'chain',
      caveIndex:-1,x,y,hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,
      spd:tmpl.spd,grace:tmpl.grace,abilities:[...tmpl.abilities],alive:true})
    MINING_CONFIG.sound.minimumHearingChance=1
    MINING_CONFIG.sound.maximumHearingChance=1
    MINING_CONFIG.sound.investigationChance=1
    MINING_CONFIG.sound.investigationSteps=[2,2]
    player.miningArmedTarget='-9:'+bareRock.tx+','+bareRock.ty
    Mining.strike(bareRock.tx,bareRock.ty)
  })()`)
  assert.equal(run('enemies.at(-1).alarmed'),true,'nearby monster becomes Alarmed after hearing the strike')
  assert.equal(run('enemies.at(-1).miningInvestigation.steps'),2,
    'hearing and the independent investigation roll produce a finite movement budget')
  const heardSaved=plain(run('buildSaveObject()')),heardRng=run('rngState')
  context.heardSaved=heardSaved
  run('loadGameFromObject(heardSaved,{isReplayInit:true})')
  run('replayAnimationsDisabled=true;attackAnim=null;cameraAnimating=false;pendingMove=null')
  assert.equal(run('rngState'),heardRng)
  assert.equal(run('enemies.at(-1).miningInvestigation.steps'),2,'sound investigation survives save restoration')
  for (let n = 1; n <= 6; n++) {
    const underlay = ['grass','sand','hill','forest','sand','grass'][n-1]
    run(`currentZ=0;map=surfaceMap;player.x=${10+n};player.y=10;
      surfaceMap[10][${11+n}]='boulder';
      tileUnderlays[keyXY(${11+n},10)]='${underlay}';player.miningArmedTarget=null`)
    if (n === 2) {
      context.unminedSandBoulder = plain(run('buildSaveObject()'))
      run('loadGameFromObject(unminedSandBoulder,{isReplayInit:true})')
      run('replayAnimationsDisabled=true;attackAnim=null;cameraAnimating=false;pendingMove=null')
      assert.equal(run(`tileUnderlays[keyXY(${11+n},10)]`),'sand',
        'the hidden sand beneath a boulder survives save/replay initialization')
    }
    await run('tryMove(1,0)')
    await run('tryMove(1,0)')
    assert.equal(run(`surfaceMap[10][${11+n}]`),underlay,
      'mined boulders restore their original surface terrain')
    assert.equal(run(`tileUnderlays[keyXY(${11+n},10)]`),undefined,
      'the boulder-only underlay is consumed after mining')
  }
  const clearedSurface=plain(run('buildSaveObject()'))
  context.clearedSurface=clearedSurface
  run('loadGameFromObject(clearedSurface,{isReplayInit:true})')
  assert.equal(run('surfaceMap[10][13]'),'sand','mined sand persists through save/load')
  assert.equal(run('surfaceMap[10][15]'),'forest','mined forest persists through save/load')
  assert.equal(run('player.minedSurfaceStones'),6)
  assert.equal(run('player.mining'),2,
    'the first six total Mining XP buy only two levels at three XP per level')
  assert(run('player.miningXpUnits')>0 && run('player.miningXpUnits')<1000000,
    'the sixth overworld stone grants only fractional fixed-point experience')
  assert.equal(run('mineSightDarknessAt(player.x+5,player.y)'),0,
    'surface exploration never inherits mine darkness')
  for (const [seed, count] of [[610061, 4], [610063, 5], [554433, 4]]) {
    const survey = plain(run(`(()=>{
      WORLD_SEED=${seed};rngState=WORLD_SEED;
      const levels=Array.from({length:${count}},(_,i)=>{
        let level=null;for(let n=0;n<24&&!level;n++)level=mineFloorCandidate(i,${count});
        return level
      });
      if(levels.some(l=>!l))throw Error('unable to construct mine level');
      if(!mineAlignCageShaft(levels))throw Error('unaligned cage');
      Mining.generate(levels);
      return levels.map(level=>({pockets:level.minePockets,tiles:level.map,
        crystals:level.mineExcavations.filter(t=>t.kind==='exposed').map(t=>({x:t.x,y:t.y})),
        minerals:level.mineExcavations.filter(t=>t.mineral)
          .map(t=>({x:t.x,y:t.y,mineral:t.mineral})),
        entrances:[level.mineUpstairs,level.mineDownstairs,level.mineCagePad],
        mineralValue:level.mineMineralValue,up:level.mineUpstairs,
        availableXp:level.mineExcavations.reduce((total,t)=>total+(t.mineral?
          MINING_CONFIG.skill.xp[MINING_CONFIG.minerals[t.mineral].tier]:
          MINING_CONFIG.skill.xp[t.hardness]),0),
        stairDistance:level.mineDownstairs?
          dungeonWalkDistances(level.map,level.mineUpstairs).get(keyXY(level.mineDownstairs.x,level.mineDownstairs.y)):null,
        budget:level.mineMineralBudget}))
    })()`))
    assert.equal(survey.length,count)
    let wideCorridorCrystals=0
    console.log(`seed ${seed}: ${count} floors, ${survey.reduce((n,f)=>n+f.availableXp,0)} available mining XP`)
    for (let i = 0; i < survey.length; i++) {
      const floor=survey[i], limits=[[50,150],[250,450],[350,650],[500,900],[700,1000]][i]
      assert(floor.pockets.length>=3&&floor.pockets.length<=10,`${seed}: pocket count on floor ${i+1}`)
      assert(floor.mineralValue>=limits[0]&&floor.mineralValue<=limits[1],
        `${seed}: floor ${i+1} generated mineral value remains in budget`)
      const queue=[floor.up], visited=new Set([`${floor.up.x},${floor.up.y}`])
      for(let head=0;head<queue.length;head++)for(const [dx,dy] of
        [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[-1,1],[1,-1],[1,1]]){
        const x=queue[head].x+dx,y=queue[head].y+dy
        if(!['cavefloor2','minestairsup','minestairsdown','minecageupperoff','minecageloweroff'].includes(floor.tiles[y]?.[x])||visited.has(`${x},${y}`))continue
        visited.add(`${x},${y}`);queue.push({x,y})
      }
      for(const p of floor.pockets){
        const xs=p.cells.map(c=>c.x),ys=p.cells.map(c=>c.y)
        assert(Math.max(...xs)-Math.min(...xs)<8&&Math.max(...ys)-Math.min(...ys)<8,
          `${seed}: pocket bounding box`)
        assert(p.entrances.length>=1,`${seed}: pocket has a mineable approach`)
        assert(p.cells.every(c=>!visited.has(`${c.x},${c.y}`)),
          `${seed}: floor ${i+1} pocket ${p.id} must remain sealed until mining opens its wall`)
        if(p.type==='geode'){
          const within=floor.minerals.filter(m=>p.cells.some(c=>c.x===m.x&&c.y===m.y))
          assert(new Set(within.map(m=>m.mineral)).size<=1,
            `${seed}: geode pocket contains only one mineral type`)
        }
      }
      const separation=run('MINING_CONFIG.generation.differentMineralSeparation')
      for(let a=0;a<floor.minerals.length;a++)for(let b=a+1;b<floor.minerals.length;b++){
        const one=floor.minerals[a],two=floor.minerals[b]
        if(one.mineral===two.mineral)continue
        assert(Math.max(Math.abs(one.x-two.x),Math.abs(one.y-two.y))>=separation,
          `${seed}: different minerals must remain at least ${separation} tiles apart`)
      }
      for(const stair of floor.entrances.filter(Boolean))
        if(floor.tiles[stair.y]?.[stair.x]!=='mineshaftrope')
          assert(visited.has(`${stair.x},${stair.y}`),`${seed}: mandatory mine transit remains reachable`)
      const pocketCells=new Set(floor.pockets.flatMap(p=>p.cells.map(c=>`${c.x},${c.y}`)))
      const blockedCrystals=new Set(floor.crystals.map(c=>`${c.x},${c.y}`))
      for(const crystal of floor.crystals){
        const neighbours=[[0,-1],[1,0],[0,1],[-1,0],[-1,-1],[-1,1],[1,-1],[1,1]]
          .filter(([dx,dy])=>floor.tiles[crystal.y+dy]?.[crystal.x+dx]==='cavefloor2').length
        if(!pocketCells.has(`${crystal.x},${crystal.y}`)&&neighbours>=5)wideCorridorCrystals++
      }
      const open=[floor.up],route=new Set([`${floor.up.x},${floor.up.y}`])
      for(let head=0;head<open.length;head++)for(const [dx,dy] of
        [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[-1,1],[1,-1],[1,1]]){
        const x=open[head].x+dx,y=open[head].y+dy,k=`${x},${y}`
        if(blockedCrystals.has(k)||route.has(k)||
          !['cavefloor2','minestairsup','minestairsdown','minecageupperoff','minecageloweroff'].includes(floor.tiles[y]?.[x]))continue
        route.add(k);open.push({x,y})
      }
      for(const site of visited){
        if(!blockedCrystals.has(site))assert(route.has(site),
          `${seed}: exposed crystals must never isolate open corridor floor ${site}`)
      }
      if(floor.entrances[1]){
        const down=floor.entrances[1]
        assert(visited.has(`${down.x},${down.y}`) && floor.stairDistance>=30,
          `${seed}: the lower mine staircase remains open with a 30-tile route`)
      }
    }
    assert(wideCorridorCrystals>0,`${seed}: some exposed crystals should grow in wider corridors`)
    console.log(`seed ${seed}: ${wideCorridorCrystals} exposed crystals on wider corridor floors`)
  }
  const nest = plain(run(`(()=>{
    const level=miningTrial,pocket=level.minePockets.find(p=>p.cells.length>=3)
    if(!pocket)throw Error('no pocket is large enough for a three-monster nest')
    const oldType=pocket.type,oldSize=MINING_CONFIG.generation.nestSize,oldEnemies=enemies
    try {
      pocket.type='nest';MINING_CONFIG.generation.nestSize=[3,3];enemies=[]
      Mining.spawnNests(level,-9,1)
      const members=enemies.filter(e=>pocket.cells.some(c=>c.x===e.x&&c.y===e.y))
      return {count:members.length,species:[...new Set(members.map(e=>e.baseName))],
        nonhumanoid:members.every(e=>!e.humanoid)}
    } finally {pocket.type=oldType;MINING_CONFIG.generation.nestSize=oldSize;enemies=oldEnemies}
  })()`))
  assert.equal(nest.count,3,'a sufficiently large pocket can hold three nest monsters')
  assert.equal(nest.species.length,1,'all monsters in a pocket nest share one species')
  assert.equal(nest.nonhumanoid,true,'nest inhabitants remain nonhumanoid')
  console.log('PASS Mining generation, turn cost, persistence and skill progression')
})().catch(err => { console.error(err.stack); process.exitCode = 1 })
