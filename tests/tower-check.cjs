const assert=require('node:assert/strict'),fs=require('node:fs')
const {run,context}=require('./helpers/node-game-runtime.cjs')
;(async()=>{
 await run('loadContent()')
 context.fixture=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'saves/Tester_start.json')))
 run('loadGameFromObject(fixture,{isReplayInit:true});replayRecording=false;replayAnimationsDisabled=true;raceOpen=false;log=()=>{}')
 assert.equal(run('towerLevels.length'),4)
 assert.equal(run('tower.size'),11,'saved tower retains its original generated footprint')
 assert.equal(run('tower.cornerCut || 0'),0)
 // The above-ground surface remains alive without acquiring the player upstairs.
 // Use a single existing surface enemy on a known explored perimeter tile.
 const ambientSetup = run(`(()=>{
   currentZ=1;map=towerLevels[0].map;Object.assign(player,towerStair(1,false))
   const e=enemies.find(e=>e.alive&&(e.level??0)===0&&!towerContains(e.x,e.y))
   e.x=tower.x-2;e.y=tower.y+4;e.homeX=e.x;e.homeY=e.y
   e.aware=false;e.sleeping=false;e.wallAmbushHidden=false;e.pendingAbility=null;e.wander='roam'
   e.invisibleUntilTurn=0;discovered[e.y][e.x]=true
   ENEMY_WANDER_CHANCE=1;camX=tower.x-5;camY=tower.y-5
   return {id:e.id,x:e.x,y:e.y,seen:discovered[e.y][e.x]}
 })()`)
 assert.equal(ambientSetup.seen,true)
 assert.equal(run('towerSurfaceMonsterVisible(enemies.find(e=>e.id===' + JSON.stringify(ambientSetup.id) + '))'),true)
 assert.equal(run('tileInspectInfo(tower.x-2,tower.y+4)'),null)
 // No unseen/invisible surface creature may leak through the overhead view.
 assert.equal(run(`(()=>{const e=enemies.find(e=>e.id===${JSON.stringify(ambientSetup.id)});
   discovered[e.y][e.x]=false;const unknown=towerSurfaceMonsterVisible(e);
   discovered[e.y][e.x]=true;e.wallAmbushHidden=true;
   const ambush=towerSurfaceMonsterVisible(e);e.wallAmbushHidden=false;
   currentZ=0;const sameFloor=towerSurfaceMonsterVisible(e);currentZ=1;
   return !unknown&&!ambush&&!sameFloor})()`),true)
 // Background monsters share the normal creature visual path, never the
 // interactive enemy/overlay pass.
 context.surfaceCreatureDraws=[]
 run(`(()=>{const original=drawEnemyVisual;drawEnemyVisual=(...args)=>surfaceCreatureDraws.push(args);
   try{drawTowerSurfaceMonsters(0)}finally{drawEnemyVisual=original}})()`)
 assert.equal(context.surfaceCreatureDraws.length>0,true)
 assert.equal(run(`(()=>{const e=enemies.find(e=>e.id===${JSON.stringify(ambientSetup.id)});
   return surfaceCreatureDraws.some(d=>d[2]===e)})()`),true)
 // A single overlay covers both terrain and silhouettes at +1 to +3, never
 // the summit or playable tower interior, in either tile/ASCII presentation.
 for (const z of [1,2,3,4]) {
   const shade=run(`(()=>{currentZ=${z};const old=ctx.fillRect;const rects=[];
     ctx.fillRect=(...rect)=>rects.push({color:ctx.fillStyle,rect});
     try{shadeTowerExterior()}finally{ctx.fillRect=old}
     return rects})()`)
   assert.equal(shade.length,z===4?0:4)
   assert.equal(shade.every(x=>x.color==='rgba(0, 0, 0, 0.5)'),true)
 }
 run('currentZ=1')
 context.ambientStartSave=JSON.parse(run('JSON.stringify(buildSaveObject())'))
 const step=()=>run(`(()=>{wanderSurfaceBelowTower();const e=enemies.find(e=>e.id===${JSON.stringify(ambientSetup.id)});
   return JSON.stringify({x:e.x,y:e.y,aware:e.aware,hp:e.hp,rng:rngState})})()`)
 const firstMove=step()
 assert.equal(JSON.parse(firstMove).aware,false)
 assert.equal(run('enemies.find(e=>e.id===' + JSON.stringify(ambientSetup.id) + ').level'),0)
 run('loadGameFromObject(ambientStartSave,{isReplayInit:true});ENEMY_WANDER_CHANCE=1')
 assert.equal(step(),firstMove) // both random choices and positions match after loading
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
 context.towerMessages=[]
 run(`log=msg=>towerMessages.push(msg);currentZ=4;map=towerLevels[3].map;undergroundDiscovered=towerLevels[3].discovered;Object.assign(player,towerStair(4,false));enterCave()`)
 assert.equal(context.towerMessages.at(-1),'You descend to tower floor +3.')
 run(`Object.assign(player,towerStair(3,false));enterCave()`)
 assert.equal(context.towerMessages.at(-1),'You descend to tower floor +2.')

 // The real world generator is exercised; only the missing enemy silhouette
 // artwork is replaced by a fixed alpha mask, as in the existing world tests.
 run(`CaveSilhouettes.prepare=async(seed)=>{CAVE_SILHOUETTES=[{id:CaveSilhouettes.idForSeed(seed),sourceIds:['mock-a','mock-b'],rows:Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>((x-15)**2+(y-15)**2<212?'1':'0')).join(''))}];return CAVE_SILHOUETTES[0]};log=()=>{};renderInventory=()=>{}`)
 for(const [seed,traits] of [[67893,[]],[12345,['things_below']]]) {
  run(`WORLD_SEED=${seed};rngState=WORLD_SEED;applyWorldTraits(${JSON.stringify(traits)}.map(name=>WORLD_TRAITS.find(t=>t.name===name)),'XS');player.inventory=[];player.curseDebuffs=[];player.poisonTurns=0;player.berryRegenTurns=0;enemies=[];groundItems=[];occupied=new Set()`)
  await run('generateNewWorld()')
  assert.equal(run('towerLevels.length'),4)
  assert.equal(run('tower.size'),10,'new towers use a 10x10 bounding footprint')
  assert.equal(run('tower.cornerCut'),1,'all four outer corners are chamfered')
  assert.equal(run(`(()=>{
    const trees=[...grasslandTrees].map(key=>key.split(',').map(Number))
      .filter(([x,y])=>towerDeadTreeAt(x,y))
    return trees.length>=2 && trees.every(([x,y])=>towerDistance(x,y)>=2 &&
      towerGrassTreeVisual(x,y).image.includes('grassland-tree-dead-'))
  })()`),true,'the tower has at least two dead trees beyond its unobstructed perimeter')
  assert.equal(run(`(()=>{
    for(const [dx,dy] of [[0,0],[9,0],[0,9],[9,9]]){
      const p=towerPoint(dx,dy)
      if(towerContains(p.x,p.y)||!TILE[surfaceMap[p.y]?.[p.x]]?.walk) return false
      for(const level of towerLevels) if(level.map[p.y]?.[p.x]!=='towervoid')return false
    }
    for(const [dx,dy] of [[1,0],[0,1],[8,0],[9,1],[0,8],[1,9],[9,8],[8,9]]){
      const p=towerPoint(dx,dy)
      if(surfaceMap[p.y]?.[p.x]!=='dwarvenwall')return false
    }
    for(const [dx,dy] of [[1,1],[8,1],[1,8],[8,8]]){
      const p=towerPoint(dx,dy)
      if(surfaceMap[p.y]?.[p.x]!=='dwarvenwall')return false
      if(towerLevels[3].map[p.y]?.[p.x]!=='marble')return false
    }
    return true
  })()`),true,'beveled corners preserve original terrain outside and sealed walls inside')
  assert.equal(run(`(()=>{
    const oldZ=currentZ,oldMap=map,oldDiscovered=undergroundDiscovered
    try {
      currentZ=4;map=towerLevels[3].map;undergroundDiscovered=towerLevels[3].discovered
      invalidateUndergroundFov()
      const visible=currentUndergroundFov()
      return Array.from({length:tower.size},(_,dy)=>Array.from({length:tower.size},(_,dx)=>{
        const x=tower.x+dx,y=tower.y+dy
        return visible.has(keyXY(x,y))===towerContains(x,y)
      })).flat().every(Boolean)
    } finally {currentZ=oldZ;map=oldMap;undergroundDiscovered=oldDiscovered;invalidateUndergroundFov()}
  })()`),true,'the summit displays all playable stone without revealing its missing corners')
  assert.equal(run(`(()=>{
    currentZ=1;const old=ctx.fillRect,rects=[]
    ctx.fillRect=(...rect)=>rects.push(rect)
    try {shadeTowerExterior();return rects.length===8}
    finally {ctx.fillRect=old;currentZ=0}
  })()`),true,'the exterior overlay also covers four chamfered corners')
  assert.equal(run('Math.min(...villageHuts.map(h=>towerDistance(h.x,h.y)))>=TOWER_MIN_VILLAGE_GAP'),true,
    'every village hut is at least 50 tiles from the full tower footprint')
  assert.equal(run(`(()=>{const p=towerPoint(5,0);return towerLevels[0].map[p.y][p.x]})()`),'dwarvenwall')
  assert.equal(run(`(()=>{const p=towerPoint(3,0);return towerLevels[0].map[p.y][p.x]})()`),'towerwindow')
  assert.equal(run(`(()=>{const p=towerPoint(5,6);return towerLevels[0].map[p.y][p.x]})()`),'dwarvenwall')
  assert.equal(run(`(()=>{const p=towerPoint(6,6);return towerLevels[0].map[p.y][p.x]})()`),'dwarvenwall')
  assert.equal(run(`(()=>{const p=towerPoint(7,6);return ['dwarvendoorclosed','dwarvendooropen'].includes(towerLevels[0].map[p.y][p.x])})()`),true)
  assert.equal(run(`(()=>{const p=towerPoint(5,9);return tower.entrance.x===p.x&&tower.entrance.y===p.y})()`),true)
  assert.equal(run(`(()=>{
    const doors=[surfaceMap[tower.entrance.y]?.[tower.entrance.x]]
    for(let z=0;z<4;z++){
      const board=z===0?surfaceMap:towerLevels[z-1].map
      const p=towerPoint(7,6)
      doors.push(board[p.y][p.x])
      // Partition's randomized northern doorway is on the local x=5 line.
      let count=0;for(let dy=2;dy<=3;dy++){
        const d=towerPoint(5,dy)
        if(['dwarvendooropen','dwarvendoorclosed'].includes(board[d.y][d.x]))count++
      }
      if(count!==1)return false
    }
    return doors.every(d=>d==='dwarvendoorclosed'||d==='dwarvendooropen')
  })()`),true)
  // Both stair layouts have open floor on all eight neighboring cells.
  assert.equal(run(`Array.from({length:5},(_,z)=>{
    const terrain=z===0?surfaceMap:towerLevels[z-1].map
    const stairs=[...(z<4?[towerStair(z,true)]:[]),...(z>0?[towerStair(z,false)]:[])]
    return stairs.every(p=>[-1,0,1].every(dy=>[-1,0,1].every(dx=>
      (dx===0&&dy===0)||terrain[p.y+dy]?.[p.x+dx]==='marble')))
  }).every(Boolean)`),true)
  assert.equal(run('towerStair(1,true).x'),run('towerPoint(3,2).x'))
  assert.equal(run('towerStair(1,true).y'),run('towerPoint(3,2).y'))
  assert.equal(run(`towerLevels[3].map[towerPoint(3,2).y][towerPoint(3,2).x]==='towerstairsdown' &&
    towerLevels[3].map[towerPoint(3,7).y][towerPoint(3,7).x]==='marble'`),true)
  // Even with generous eight-direction movement, no closed-door diagonal cut exists.
  assert.equal(run(`towerLevels.slice(0,3).every(l=>{
    const board=l.map,start=towerPoint(3,4),right=towerPoint(7,4),goal=keyXY(right.x,right.y)
    const queue=[start],seen=new Set()
    for(let i=0;i<queue.length;i++) {
      const {x,y}=queue[i],k=keyXY(x,y)
      if(k===goal)return false
      if(seen.has(k))continue
      seen.add(k)
      for(const [dx,dy] of DIRS8){const nx=x+dx,ny=y+dy
        if(board[ny]?.[nx]==='marble'&&!seen.has(keyXY(nx,ny)))queue.push({x:nx,y:ny})}
    }
    return true
  })`),true)
  // Upper-floor backdrop ignores saved forest under rock sprites.
  assert.equal(run(`towerBackgroundGround('hill',tower.x-1,tower.y-1)`),'grass')
  assert.equal(run(`towerBackgroundVisual('grass',tower.x-1,tower.y-1).image ===
    tileVariantImage(RENDER_STYLE.terrainTiles.grass.variants,tower.x-1,tower.y-1)`),true)
  assert.equal(run(`(()=>{
    const x=tower.x-1,y=tower.y-1,k=keyXY(x,y),oldTile=surfaceMap[y][x]
    const oldUnder=tileUnderlays[k],oldSeen=discovered[y][x],oldDraw=drawImageVisual
    const images=[]
    try {
      drawImageVisual=(px,py,v)=>{images.push(v.image);return true}
      discovered[y][x]=true;tileUnderlays[k]='forest';surfaceMap[y][x]='hill'
      drawTowerBackground(x,y)
      const noDoubleLayer=images.length===2 &&
        images[0].startsWith('img/tiles/grassland') &&
        images[1].startsWith('img/tiles/hill') &&
        !images.some(img=>img.includes('forest-tree'))
      images.length=0;surfaceMap[y][x]='grass';grasslandTrees.add(k)
      drawTowerBackground(x,y)
      const expected=coordinateVisualVariant(RENDER_STYLE.specialTiles.grassTree,x,y,41)
      return noDoubleLayer && images.length===2 && images[1]===expected.image
    } finally {
      surfaceMap[y][x]=oldTile;discovered[y][x]=oldSeen;drawImageVisual=oldDraw
      if(oldUnder===undefined)delete tileUnderlays[k];else tileUnderlays[k]=oldUnder
      grasslandTrees.delete(k)
    }
  })()`),true)

  assert.equal(run('(()=>{const p=towerPoint(5,10);return surfaceReachableFromTemple().has(keyXY(p.x,p.y))})()'),true)
  assert.equal(run('isBigBellReachableFromTemple()'),true)
  assert.equal(run('validateDwarvenRuinsStratum().ok'),true)
  // Threat changes through ordinary enemy species and encounter size; the
  // summit remains a fixed set of defenders. No floor-specific stat buffs.
  assert.equal(run(`(()=>{
    const ground=enemies.filter(e=>e.alive&&e.level===0&&towerInterior(e.x,e.y))
    const upper=Array.from({length:4},(_,i)=>enemies.filter(e=>e.alive&&e.level===i+1))
    return ground.length>=1&&ground.length<=3 &&
      upper[0].length>=2&&upper[0].length<=4 &&
      upper[1].length>=3&&upper[1].length<=5 &&
      upper[2].length>=3&&upper[2].length<=6 &&
      JSON.stringify(upper[3].map(e=>e.baseName).sort())===JSON.stringify(['Gargoyle','Lich','Gargoyle'].sort())
  })()`),true)
  assert.equal(run(`towerLevels.every((level,i)=>{
   const stairs=[towerStair(i+1,false),...(i<3?[towerStair(i+1,true)]:[])];
   const queue=[stairs[0]],seen=new Set();
   for(let j=0;j<queue.length;j++){const p=queue[j],k=keyXY(p.x,p.y);if(seen.has(k))continue;seen.add(k);
    for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy,t=level.map[y]?.[x];if((TILE[t]?.walk||t==='dwarvendoorclosed')&&!seen.has(keyXY(x,y)))queue.push({x,y})}}
   return stairs.every(p=>seen.has(keyXY(p.x,p.y)))&&enemies.filter(e=>e.level===i+1).every(e=>seen.has(keyXY(e.x,e.y))&&stairs.every(p=>Math.max(Math.abs(p.x-e.x),Math.abs(p.y-e.y))>=3))
  })`),true)
  // A further cardinal rotation must carry walls, doorways, stairs, monsters,
  // and floor grids together, including after dimensions swap.
  const prevWidth=run('MAP_W'),prevHeight=run('MAP_H')
  run('rotateGeneratedWorld(1)')
  assert.equal(run('MAP_W'),prevHeight);assert.equal(run('MAP_H'),prevWidth)
  assert.equal(run(`(()=>{const p=towerPoint(5,9);return tower.entrance.x===p.x&&tower.entrance.y===p.y})()`),true)
  assert.equal(run(`Array.from({length:5},(_,z)=>{
    const board=z===0?surfaceMap:towerLevels[z-1].map
    return [z<4?towerStair(z,true):null,z>0?towerStair(z,false):null].filter(Boolean)
      .every(p=>['towerstairsup','towerstairsdown'].includes(board[p.y]?.[p.x]))
  }).every(Boolean)`),true)
  assert.equal(run(`enemies.filter(e=>e.level>0).every(e=>
    towerContains(e.x,e.y)&&towerLevels[e.level-1].map[e.y]?.[e.x]!=='towervoid')`),true)
  const rotatedSnapshot=run('JSON.stringify({tower,towerLevels,actors:enemies.filter(e=>e.level>0).map(e=>({x:e.x,y:e.y,level:e.level})),rng:rngState})')
  context.rotatedSave=JSON.parse(run('JSON.stringify(buildSaveObject())'))
  run('loadGameFromObject(rotatedSave,{isReplayInit:true})')
  assert.equal(run('JSON.stringify({tower,towerLevels,actors:enemies.filter(e=>e.level>0).map(e=>({x:e.x,y:e.y,level:e.level})),rng:rngState})'),rotatedSnapshot)
  console.log('PASS tower seed',seed,traits,run('JSON.stringify(tower)'))
 }
 console.log('PASS tower travel, boundaries, fog, persistence and world invariants')
})().catch(e=>{console.error(e);process.exitCode=1})
