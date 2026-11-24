// Shared headless and browser coverage of scouting and map identity.
async function wayfaringScoutingChecks(fixture) {
  const check=(v,msg)=>{if(!v)throw Error(msg)}
  const restore=save=>{loadGameFromObject(structuredClone(save),{isReplayInit:true});replayRecording=false;replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=true}
  const sample=id=>makeArtifactTrinket('Feather',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id)
  restore(fixture)
  enemies=[];npcs=[];groundItems=[];occupied=new Set();player.inventory=['farsight','spelunker','pilgrim','trailblazer'].map(sample)
  player.equip={weapon:null,shield:null,armor:null};player.race='human';player.baseMf=0;player.hp=200;player.maxHp=200;player.godMode=false
  currentZ=-1;currentCave=0;map=undergroundMap;undergroundDiscovered=undergroundDiscoveredL1;player.x=40;player.y=40;turnCount=0
  player.wayfaring=ArtifactWayfaring.freshState();player.wayfaring.visitedZ=[-1];player.wayfaring.lastVisitedZ=-1
  for(const row of map)row.fill('cavewall')
  for(const row of undergroundDiscovered)row.fill(true)
  for(let x=40;x<=59;x++)map[40][x]='cavefloor'
  map[40][45]='dwarvendoorlocked';map[40][46]='water';map[40][47]='boulder';map[40][48]='lava'
  for(let y=40;y<44;y++)for(let x=56;x<60;x++){map[y][x]='cavefloor';undergroundDiscovered[y][x]=false}
  for(let y=50;y<54;y++)for(let x=56;x<60;x++){map[y][x]='cavefloor';undergroundDiscovered[y][x]=false}
  const w=map[0].length
  check(ArtifactWayfaring.farsightSize()===4,'base vision size');player.baseMf=5;check(ArtifactWayfaring.farsightSize()===5,'MF size threshold');player.baseMf=100;check(ArtifactWayfaring.farsightSize()===6,'MF cap');player.baseMf=0
  const rngBefore=rngState
  check(JSON.stringify(ArtifactWayfaring.farsightTargets())===JSON.stringify([40*w+56]),'only wholly unknown connected square, doors/water/lava/boulder ignored')
  check(rngState===rngBefore,'target enumeration is RNG-free')
  // Three equally sized unknown squares: two floors with obstacles, half
  // walkable, and all walkable. Keep randomness among useful views only.
  for(let y=35;y<=39;y++){map[y][40]='cavefloor';map[y][48]='cavefloor'}
  for(let y=32;y<36;y++)for(let x=40;x<44;x++)undergroundDiscovered[y][x]=false
  for(let y=32;y<36;y++)for(let x=48;x<52;x++)undergroundDiscovered[y][x]=false
  map[35][41]='cavefloor';map[35][42]='water';map[35][43]='dwarvendoorlocked'
  map[34][40]='boulder';map[34][41]='lava'
  for(let y=34;y<36;y++)for(let x=48;x<52;x++)map[y][x]='cavefloor'
  check(JSON.stringify(ArtifactWayfaring.farsightTargets())===JSON.stringify([32*w+48,40*w+56]),'at least half walkable; sparse square excluded despite survey obstacles')
  undergroundDiscovered[41][57]=true
  for(let x=49;x<52;x++)map[34][x]='cavewall'
  check(JSON.stringify(ArtifactWayfaring.farsightTargets())===JSON.stringify([32*w+48]),'narrow cave fallback selects greatest walkable density')
  for(let x=49;x<52;x++)map[35][x]='cavewall'
  map[34][49]='cavewall';map[34][48]='cavewall'
  check(JSON.stringify(ArtifactWayfaring.farsightTargets())===JSON.stringify([32*w+40]),'a sparse corridor remains eligible if no richer square exists')
  for(let y=32;y<36;y++)for(let x of [40,41,42,43,48,49,50,51]){map[y][x]='cavewall';undergroundDiscovered[y][x]=true}
  for(let y=36;y<=39;y++){map[y][40]='cavewall';map[y][48]='cavewall'}
  undergroundDiscovered[41][57]=false
  check(rngState===rngBefore,'density ranking does not consume RNG')
  undergroundDiscovered[41][57]=true;check(!ArtifactWayfaring.farsightTargets().length,'partly explored square rejected');undergroundDiscovered[41][57]=false
  player.inventory[0].identified=false;check(!ArtifactWayfaring.activate(0)&&turnCount===0,'identification required');player.inventory[0].identified=true
  try {
    snapCameraToPlayer()
    startReplayRecording()
    check(ArtifactWayfaring.activate(0),'Farsight activation succeeds')
    check(turnCount===1&&player.x===40&&player.y===40&&currentZ===-1,'one turn, same position and Z')
    const vision=ArtifactWayfaring.farsightRegion()
    check(vision?.x===56&&vision.y===40&&vision.size===4&&vision.until===2,'one further live vision turn')
    check(mapOpen&&farsightViewOpen&&document.getElementById('farsightCanvas').width===vision.size*TILE_PX,'remote scene opens')
    check(canvas===document.getElementById('game')&&camX===targetCamX()&&camY===targetCamY(),'main camera restored')
    const openTurn=turnCount,openRng=rngState;toggleMap(false)
    check(!mapOpen&&!farsightViewOpen&&turnCount===openTurn&&rngState===openRng,'closing view is free')
    check(undergroundDiscovered[43][59]&&!undergroundDiscovered[50][56],'only selected area revealed')
    check(!undergroundTileVisible(57,41),'reveal does not extend gameplay FOV')
    check(player.wayfaring.pilgrimTiles===0&&player.wayfaring.trailblazerTiles===0&&!player.wayfaring.discoveredPrevious,'magical discovery is not exploration')
    check(ArtifactWayfaring.cooldownRemaining('farsight')===999,'1000-turn cooldown')
    let save=structuredClone(buildSaveObject()),recorded=structuredClone(replayData)
    const state=JSON.stringify(player.wayfaring)
    restore(save);check(JSON.stringify(player.wayfaring)===state&&ArtifactWayfaring.farsightRegion(),'save restores vision')
    restore(recorded.initialState);activeReplay=recorded;replayRngIndex=0;replayPlaying=true;replaySimulationMode=true
    for(const action of recorded.actions)await runReplayAction(action)
    check(JSON.stringify(player.wayfaring)===state&&replayRngIndex===recorded.rng.length,'deterministic activation replay')
    replayPlaying=false;replaySimulationMode=false
    enemies=[{id:1,x:57,y:41,level:-1,levelKind:'chain',alive:true,hp:20},{id:2,x:57,y:41,level:-2,levelKind:'chain',alive:true,hp:20}]
    check(ArtifactWayfaring.farsightEnemies().length===1,'only same floor live creatures')
    const realDraw=drawEnemyVisual,realTile=drawTile,tiles=[],actors=[];const baseMode=USE_TILE_IMAGES
    try {
      USE_TILE_IMAGES=false
      drawTile=(px,py,...args)=>{tiles.push([px,py]);return realTile(px,py,...args)}
      drawEnemyVisual=(px,py,e)=>actors.push([px,py,e.id])
      const camera=[camX,camY,VIEW_W,VIEW_H],r=rngState,t=turnCount
      renderFarsightView(ArtifactWayfaring.farsightRegion())
      check(tiles.length===16&&tiles.every(([x,y])=>x>=0&&y>=0&&x<4*TILE_PX&&y<4*TILE_PX),'remote ASCII renders exact square without FOV')
      check(actors.length===1&&actors[0][0]===TILE_PX&&actors[0][1]===TILE_PX&&actors[0][2]===1,'remote actor rendered at live world position')
      check(JSON.stringify(camera)===JSON.stringify([camX,camY,VIEW_W,VIEW_H])&&rngState===r&&turnCount===t,'remote rendering cannot change camera, RNG or time')
      USE_TILE_IMAGES=true;actors.length=0
      const realStack=drawTerrainVisualStack,drawn=[]
      try {
        drawTerrainVisualStack=(px,py,key,x,y,...args)=>{drawn.push([x,y]);return realStack(px,py,key,x,y,...args)}
        renderFarsightView(ArtifactWayfaring.farsightRegion())
        check(drawn.length>=16&&drawn.every(([x,y])=>x>=56&&x<60&&y>=40&&y<44),'remote tile mode uses regular terrain layers inside the vision')
        check(actors.length===1&&actors[0][2]===1,'remote tile mode draws live creatures')
        check(JSON.stringify(camera)===JSON.stringify([camX,camY,VIEW_W,VIEW_H])&&rngState===r&&turnCount===t,'tile mode leaves main camera, RNG and time unchanged')
      } finally {drawTerrainVisualStack=realStack}
    } finally {drawTile=realTile;drawEnemyVisual=realDraw;USE_TILE_IMAGES=baseMode}
    const realMap=map;map=cryptLevel2.map;check(!ArtifactWayfaring.farsightRegion(),'different legacy map identity excluded');map=realMap
    enemies[0].x=60;check(!ArtifactWayfaring.farsightEnemies().length,'live positions not snapshot')
    enemies[0].x=57;enemies[0].alive=false;check(!ArtifactWayfaring.farsightEnemies().length,'dead creatures excluded')
    enemies=[];enemyTurn();check(!ArtifactWayfaring.farsightRegion()&&undergroundDiscovered[41][57],'vision expires, terrain remains')
    player.wayfaring.cooldowns={};const t=turnCount,rng=rngState;check(!ArtifactWayfaring.activate(0)&&turnCount===t&&rngState===rng,'no eligible square costs neither turn nor RNG')
    player.wayfaring.cooldowns.farsight=turnCount+500;ArtifactWayfaring.discover(5);check(ArtifactWayfaring.cooldownRemaining('farsight')===499,'Trailblazer reduces Farsight')
  } finally {toggleMap(false)}
  // Matching entry/exit endpoints and disconnected cave on shared Z.
  currentZ=0;map=surfaceMap;player.x=40;player.y=40;map[40][40]='caveentrance';map[40][42]='caveentrance';caves=[{entrances:[{x:40,y:40},{x:42,y:40}]}]
  for(const row of discovered)row.fill(true)
  for(let y=70;y<74;y++)for(let x=70;x<74;x++)discovered[y][x]=false
  check(JSON.stringify(ArtifactWayfaring.farsightTargets())===JSON.stringify([70*map[0].length+70]),'surface vision accepts fully unknown square')
  for(const row of undergroundMap)row.fill('cavewall')
  for(let y=40;y<50;y++)for(let x=40;x<50;x++)undergroundMap[y][x]='cavefloor'
  undergroundMap[40][40]='caveentrance';undergroundMap[40][42]='caveentrance';undergroundMap[49][49]='cavedown';depthUndergroundMap(2)[49][49]='caveup'
  for(let y=60;y<80;y++)for(let x=60;x<80;x++)undergroundMap[y][x]='cavefloor'
  const survey=ArtifactWayfaring.caveSurvey();check(survey?.size==='Small'&&survey.deeper&&survey.otherExit,'100-cell cave with lower passage and another exit, excluding disconnected cavern')
  depthUndergroundMap(2)[49][49]='cavewall';surfaceMap[40][42]='grass';check(!ArtifactWayfaring.caveSurvey().deeper&&!ArtifactWayfaring.caveSurvey().otherExit,'invalid geometry excluded')
  undergroundMap[40][40]='cavewall';check(!ArtifactWayfaring.caveSurvey(),'no mismatched entry survey')
  restore(fixture);player.godArtifactStockGranted=false;grantGodArtifactStock()
  for(const id of ['farsight','spelunker'])check(merchantStock.filter(i=>i.godTestArtifact&&i.abilityId===id).length===1,'God Mode stock '+id)
  check(ARTIFACT_ABILITIES.domains.wayfaring.length===33,'complete Wayfaring domain')
}

if(typeof module!=="undefined")module.exports={wayfaringScoutingChecks}
