// Shared by the browser regression and the source-runtime verification.
async function checkTowerReplayAndIsolation() {
  const check=(ok,message)=>{if(!ok)throw Error(message)}
  replayRecording=false;replayAnimationsDisabled=true;raceOpen=false
  currentZ=0;currentCave=-1;map=surfaceMap;Object.assign(player,towerStair(0,true))
  player.godMode=false;player.hp=playerMaxHp();stopCameraAnimation();rebuildActiveLevelOccupancy()
  const initial=JSON.parse(JSON.stringify(buildSaveObject()))
  const actions=[{type:'inspect'},{type:'move',dx:1,dy:0},{type:'move',dx:-1,dy:0},{type:'inspect'}]
  const digest=()=>JSON.stringify({z:currentZ,x:player.x,y:player.y,hp:player.hp,rng:rngState,
    turn:turnCount,levels:towerLevels,enemies:enemies.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp,level:e.level})),
    items:groundItems})
  const execute=async()=>{for(const action of actions){replayAnimationsDisabled=true;await runReplayAction(action)}}
  await execute();const first=digest()
  loadGameFromObject(initial,{isReplayInit:true});await execute()
  check(digest()===first,'tower actions replay with identical turns, RNG, terrain and actors')
  loadGameFromObject(initial,{isReplayInit:true});inspect()
  check(currentZ===1&&currentLevelKind()==='tower','inspect climbs to the first upper floor')
  const surfaceFog=JSON.stringify(discovered),surfaceTerrain=JSON.stringify(surfaceMap)
  currentUndergroundFov()
  const x=tower.x-1,y=tower.y+5
  check(!isWalkableForPlayer(x,y),'empty space blocks player movement')
  check(!enemyCanTraverse({abilities:['ethereal']},x,y),'empty space blocks ethereal movement')
  check(!enemyCanTraverse({abilities:['fly']},x,y),'empty space blocks flying movement')
  check(tileInspectInfo(x,y)===null,'background has no inspection target')
  check(projectileTerrainBlocks({x:player.x,y:player.y},x,y),'empty space blocks projectiles')
  check(JSON.stringify(discovered)===surfaceFog,'tower visibility never explores surface terrain')
  check(JSON.stringify(surfaceMap)===surfaceTerrain,'tower rendering does not rewrite the surface')
  check(currentMapViewKey()==='tower:1','map selection identifies the positive floor')
  check(exploredMapLevels().some(l=>l.key==='tower:1'),'explored tower floor appears in map controls')
  const blocker=addEnemy({...ENEMY_TEMPLATE_BY_NAME['Giant Rat'],baseName:'Giant Rat',level:0,
    levelKind:'surface',x:player.x,y:player.y,homeX:player.x,homeY:player.y,alive:true,maxHp:6})
  check(!onCurrentLevel(blocker),'surface creatures do not participate upstairs')
  inspect();check(currentZ===1,'an occupied stair landing blocks descent')
  blocker.alive=false;inspect();check(currentZ===0,'clearing the landing permits descent')
  inspect();check(currentZ===1,'returning does not recreate the floor')
  const door={x:tower.x+5,y:tower.y+2}
  map[door.y][door.x]='dwarvendooropen'
  const guard=enemies.find(e=>e.level===1),chest=groundItems.find(g=>g.level===1&&g.kind==='chest')
  guard.hp=3;chest.opened=true
  const saved=JSON.parse(JSON.stringify(buildSaveObject())),savedRng=rngState
  loadGameFromObject(saved,{isReplayInit:true})
  check(currentZ===1&&map===towerLevels[0].map,'save load restores active positive elevation')
  check(map[door.y][door.x]==='dwarvendooropen','doors survive saving upstairs')
  check(enemies.find(e=>e.id===guard.id).hp===3,'damaged defender survives saving upstairs')
  check(groundItems.find(g=>g.level===1&&g.kind==='chest').opened,'collected treasure survives saving upstairs')
  check(rngState===savedRng,'restoring tower state consumes no gameplay RNG')
  return true
}
if(typeof module!=='undefined')module.exports={checkTowerReplayAndIsolation}
