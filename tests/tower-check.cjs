const assert=require('node:assert/strict'),fs=require('node:fs')
const {run,context}=require('./helpers/node-game-runtime.cjs')
;(async()=>{
 await run('loadContent()')
 context.fixture=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'saves/Tester_start.json')))
 run('loadGameFromObject(fixture,{isReplayInit:true});replayRecording=false;replayAnimationsDisabled=true;raceOpen=false;log=()=>{}')
 assert.equal(run('towerLevels.length'),4)
 // The surface perspective must not change the active map or consume RNG.
 const visibilityRng=run('rngState')
 run(`currentZ=0;map=surfaceMap;player.godMode=false;
   Object.assign(player,{x:tower.x+5,y:tower.y+16});invalidateUndergroundFov()`)
 assert.equal(run('towerDistance()'),6)
 assert.equal(run('towerShowsSummit()'),true)
 assert.equal(run('surfaceTowerTileVisible(tower.x+5,tower.y+9)'),false)
 assert.equal(run('undergroundTileVisible(tower.entrance.x,tower.entrance.y)'),false)
 run('Object.assign(player,{x:tower.x+5,y:tower.y+15});invalidateUndergroundFov()')
 assert.equal(run('towerDistance()'),5)
 assert.equal(run('towerShowsSummit()'),false)
 assert.equal(run('surfaceTowerTileVisible(tower.x,tower.y+5)'),true)
 assert.equal(run('surfaceTowerTileVisible(tower.x+5,tower.y+9)'),false)
 run('Object.assign(player,{x:tower.x+5,y:tower.y+11});invalidateUndergroundFov();currentSurfaceTowerFov()')
 assert.equal(run('surfaceTowerTileVisible(tower.x+5,tower.y+9)'),false)
 assert.equal(run('discovered[tower.y+9][tower.x+5]'),false)
 assert.equal(run('tileInspectInfo(tower.x+5,tower.y+9)'),null)
 assert.equal(run('openDungeonDoorAt(tower.entrance.x,tower.entrance.y)'),true)
 assert.equal(run('surfaceTowerTileVisible(tower.x+5,tower.y+9)'),true)
 assert.equal(run('discovered[tower.y+9][tower.x+5]'),true)
 assert.equal(run('closeDungeonDoorAt(tower.entrance.x,tower.entrance.y)'),true)
 assert.equal(run('surfaceTowerTileVisible(tower.x+5,tower.y+9)'),false)
 assert.equal(run('discovered[tower.y+9][tower.x+5]'),true)
 context.surfaceVisibilitySave=JSON.parse(run('JSON.stringify(buildSaveObject())'))
 run('loadGameFromObject(surfaceVisibilitySave,{isReplayInit:true})')
 assert.equal(run('discovered[tower.y+9][tower.x+5]'),true)
 assert.equal(run('surfaceMap[tower.entrance.y][tower.entrance.x]'),'dwarvendoorclosed')
 assert.equal(run('surfaceTowerTileVisible(tower.x+5,tower.y+9)'),false)
 run('Object.assign(player,{x:tower.x+5,y:tower.y+9});invalidateUndergroundFov()')
 assert.equal(run('surfaceTowerTileVisible(tower.x+5,tower.y+8)'),true)
 assert.equal(run('surfaceTowerTileVisible(tower.x+5,tower.y+4)'),false) // partition wall hides room beyond
 assert.equal(run('rngState'),visibilityRng)
 run('loadGameFromObject(fixture,{isReplayInit:true});replayRecording=false;replayAnimationsDisabled=true;raceOpen=false;log=()=>{}')
 run(`currentZ=0;map=surfaceMap;Object.assign(player,towerStair(0,true));enterCave()`)
 assert.equal(run('currentZ'),1)
 assert.equal(run('currentLevelKind()'),'tower')
 assert.equal(run('map===towerLevels[0].map'),true)
 assert.equal(run('isWalkableForPlayer(tower.x-1,tower.y)'),false)
 assert.equal(run("enemyCanTraverse({abilities:['ethereal']},tower.x-1,tower.y)"),false)
 assert.equal(run('tileInspectInfo(tower.x-1,tower.y)'),null)
 const surfaceSeen=run('JSON.stringify(discovered)')
 run('currentUndergroundFov()')
 assert.equal(run('JSON.stringify(discovered)'),surfaceSeen)
 run(`towerLevels[0].map[tower.y+2][tower.x+5]='dwarvendooropen';
  enemies.find(e=>e.level===1).hp=3;groundItems.find(g=>g.level===1&&g.kind==='chest').opened=true`)
 const snapshot=()=>run('JSON.stringify({tower,levels:towerLevels,enemies:enemies.filter(e=>e.level>0).map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp,level:e.level,levelKind:e.levelKind})),items:groundItems.filter(g=>g.level>0),rng:rngState})')
 const before=snapshot()
 context.save=JSON.parse(run('JSON.stringify(buildSaveObject())'))
 run('loadGameFromObject(save,{isReplayInit:true})')
 assert.equal(run('currentZ'),1);assert.equal(snapshot(),before)
 for(let z=1;z<4;z++) {run(`Object.assign(player,towerStair(${z},true));enterCave()`);assert.equal(run('currentZ'),z+1)}
 for(let z=4;z>0;z--) {run(`Object.assign(player,towerStair(${z},false));enterCave()`);assert.equal(run('currentZ'),z-1)}
 // The real world generator is exercised; only the missing enemy silhouette
 // artwork is replaced by a fixed alpha mask, as in the existing world tests.
 run(`CaveSilhouettes.prepare=async(seed)=>{CAVE_SILHOUETTES=[{id:CaveSilhouettes.idForSeed(seed),sourceIds:['mock-a','mock-b'],rows:Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>((x-15)**2+(y-15)**2<212?'1':'0')).join(''))}];return CAVE_SILHOUETTES[0]};log=()=>{};renderInventory=()=>{}`)
 for(const [seed,traits] of [[67893,[]],[12345,['things_below']]]) {
  run(`WORLD_SEED=${seed};rngState=WORLD_SEED;applyWorldTraits(${JSON.stringify(traits)}.map(name=>WORLD_TRAITS.find(t=>t.name===name)),'XS');player.inventory=[];player.curseDebuffs=[];player.poisonTurns=0;player.berryRegenTurns=0;enemies=[];groundItems=[];occupied=new Set()`)
  await run('generateNewWorld()')
  assert.equal(run('towerLevels.length'),4)
  assert.equal(run("towerLevels[0].map[tower.y][tower.x+5]"),'dwarvenwall')
  assert.equal(run("towerLevels[0].map[tower.y][tower.x+3]"),'towerwindow')
  assert.equal(run("towerLevels[0].map[tower.y+7][tower.x+6]"),'dwarvenwall')
  assert.equal(run("towerLevels[0].map[tower.y+7][tower.x+8]"),'dwarvendoorclosed')
  assert.equal(run('surfaceReachableFromTemple().has(keyXY(tower.entrance.x,tower.entrance.y+1))'),true)
  assert.equal(run('isBigBellReachableFromTemple()'),true)
  assert.equal(run('validateDwarvenRuinsStratum().ok'),true)
  assert.equal(run(`towerLevels.every((level,i)=>{
   const stairs=[towerStair(i+1,false),...(i<3?[towerStair(i+1,true)]:[])];
   const queue=[stairs[0]],seen=new Set();
   for(let j=0;j<queue.length;j++){const p=queue[j],k=keyXY(p.x,p.y);if(seen.has(k))continue;seen.add(k);
    for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy,t=level.map[y]?.[x];if((TILE[t]?.walk||t==='dwarvendoorclosed')&&!seen.has(keyXY(x,y)))queue.push({x,y})}}
   return stairs.every(p=>seen.has(keyXY(p.x,p.y)))&&enemies.filter(e=>e.level===i+1).every(e=>seen.has(keyXY(e.x,e.y))&&stairs.every(p=>Math.max(Math.abs(p.x-e.x),Math.abs(p.y-e.y))>=3))
  })`),true)
  console.log('PASS tower seed',seed,traits,run('JSON.stringify(tower)'))
 }
 console.log('PASS tower travel, boundaries, fog, persistence and world invariants')
})().catch(e=>{console.error(e);process.exitCode=1})
