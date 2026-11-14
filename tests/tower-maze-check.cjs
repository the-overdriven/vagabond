const assert = require('node:assert/strict')
const {run} = require('./helpers/node-game-runtime.cjs')

async function main() {
  await run('loadContent()')
  run(`CaveSilhouettes.prepare=async seed=>{
    CAVE_SILHOUETTES=[{id:CaveSilhouettes.idForSeed(seed),sourceIds:['a','b'],
      rows:Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>
        ((x-15)**2+(y-15)**2<212?'1':'0')).join(''))}]
    return CAVE_SILHOUETTES[0]
  };log=()=>{};renderInventory=()=>{};replayAnimationsDisabled=true;
  replayRecording=false;raceOpen=false`)
  // Minotaur substitutions use the game's existing base-combat strength
  // measure plus HP/tier guards, and the roll is independently 30% for each
  // eligible monster. Stronger candidates are never downgraded.
  const swapRules=JSON.parse(run(`(()=>{
    const minotaur=ENEMY_TEMPLATE_BY_NAME.Minotaur
    const cases={}
    for(const name of ['Wretchling','Owlbear','Giant Spider','Ogre',
      'White Tiger','Cyclops','NULK','Vampire','Minotaur']) {
      const template=ENEMY_TEMPLATE_BY_NAME[name]
      cases[name]=TowerMaze.weakerThanMinotaur(template)
    }
    const oldPick=pickWeighted,oldChance=chance
    const results={}
    try {
      for(const name of Object.keys(cases)) {
        let rolls=0,observedProbability=null
        pickWeighted=()=>ENEMY_TEMPLATE_BY_NAME[name]
        chance=p=>{observedProbability=p;return rolls++%10<3}
        const names=Array.from({length:100},()=>TowerMaze.sampleMazeEnemy(
          ENEMY_TEMPLATE_BY_NAME[name].tier).name)
        results[name]={minotaurs:names.filter(n=>n==='Minotaur').length,
          calls:rolls,probability:observedProbability}
      }
    } finally {pickWeighted=oldPick;chance=oldChance}
    return JSON.stringify({cases,results})
  })()`))
  for(const name of ['Wretchling','Owlbear','Giant Spider']) {
    assert.equal(swapRules.cases[name],true,name+' should be eligible')
    assert.equal(swapRules.results[name].calls,100)
    assert.equal(swapRules.results[name].minotaurs,30)
    assert.equal(swapRules.results[name].probability,0.30)
  }
  for(const name of ['Ogre','White Tiger','Cyclops','NULK','Vampire','Minotaur']) {
    assert.equal(swapRules.cases[name],false,name+' must not be replaced')
    assert.equal(swapRules.results[name].calls,0)
    assert.equal(swapRules.results[name].minotaurs,name==='Minotaur'?100:0)
  }
  for (const seed of [67893]) {
    run(`WORLD_SEED=${seed};rngState=WORLD_SEED;applyWorldTraits([],'XS');
      player.inventory=[];player.curseDebuffs=[];enemies=[];groundItems=[];
      occupied=new Set();map=[];surfaceMap=null;currentZ=0;currentCave=-1`)
    await run('generateNewWorld()')
    assert.equal(run('!!towerMaze'),true,'tower and labyrinth must be generated together')
    const details=run(`(()=>{
      const maze=towerMaze,stairs=maze.center,lower=maze.down
      const snapshot=JSON.stringify({maze,surface:surfaceMap[stairs.y][stairs.x],
        upper:undergroundMap[stairs.y][stairs.x],down:undergroundMap[lower.y][lower.x],
        up:deepLevels[0].map[lower.y][lower.x],
        entities:enemies.filter(e=>e.towerMazeResident).map(e=>({
          name:e.baseName,level:e.level,x:e.x,y:e.y,abilities:e.abilities,
          biomes:enemyBiomes(e)
        })),
        chests:groundItems.filter(g=>g.towerMazeTreasure),
        looseChaos:groundItems.filter(g=>g.kind==='scrollOfChaos'&&(g.level??0)===0),
        positions:maze.levels.map(l=>({
          z:l.z,metrics:l.metrics,spawns:l.enemySpots,
          roomWalk:l.patches.filter(p=>p.tile!=='cavewall'),
          ring:l.patches.every(p=>inBounds(p.x,p.y))
        }))
      })
      function inBounds(x,y){return x>=0&&y>=0&&x<MAP_W&&y<MAP_H}
      return snapshot
    })()`)
    const d=JSON.parse(details)
    assert.equal(d.surface,'mazestairsdown')
    assert.equal(d.upper,'mazestairsup')
    assert.equal(d.down,'cavedown')
    assert.equal(d.up,'caveup')
    assert.equal(d.chests.length,1)
    assert.equal(d.chests[0].level,-2)
    assert.equal(d.chests[0].x,d.maze.treasure.x)
    assert.equal(d.chests[0].y,d.maze.treasure.y)
    assert.equal(d.positions.length,2)
    assert.ok(d.looseChaos.length>=1,'a loose surface Chaos scroll is guaranteed')
    const pool = run(`JSON.stringify(ENEMY_TEMPLATES.filter(t=>t.tier>=2&&t.tier<=4&&
      t.rarity>0&&!t.adaptiveOnly&&!t.abilities?.includes('fly')&&
      !t.abilities?.includes('ethereal')&&
      !enemyBiomes(t).some(b=>['z-10','z-11','z-12'].includes(b))).map(t=>t.name))`)
    const allowed=new Set(JSON.parse(pool))
    for(const enemy of d.entities){
      assert.equal(allowed.has(enemy.name),true,`invalid maze creature: ${enemy.name}`)
      assert.equal(enemy.abilities.includes('fly'),false)
      assert.equal(enemy.abilities.includes('ethereal'),false)
    }
    for(const level of d.positions){
      assert.ok(level.metrics.width>=30&&level.metrics.width<=40)
      assert.ok(level.metrics.loopCount>=0&&level.metrics.loopCount<=1)
      assert.ok(level.metrics.routeTiles>0)
      assert.ok(level.metrics.branchEnds>=level.metrics.spawnBranches+1)
      assert.ok(level.metrics.branchEnds<level.metrics.spawnBranches*2)
      assert.ok(level.spawns.length>=8&&level.spawns.length<=15)
      assert.equal(level.ring,true)
      assert.equal(d.entities.filter(e=>e.level===level.z).length,level.spawns.length)
    }
    assert.equal(run(`(()=>{
      currentZ=-1;map=undergroundMap;currentCave=-1;
      const {rect}=towerMaze
      let wall=null
      for(let y=rect.y;y<rect.y+rect.h && !wall;y++)for(let x=rect.x;x<rect.x+rect.w;x++)
        if(map[y][x]==='cavewall'){wall={x,y};break}
      return !!wall && TowerMaze.isProtectedWall(-1,wall.x,wall.y) &&
        !Mining.canTarget(wall.x,wall.y)
    })()`),true,'maze stone must never be mineable')
    assert.equal(run(`(()=>{
      currentZ=0;map=surfaceMap;Object.assign(player,towerMaze.center)
      const start={x:player.x,y:player.y}
      const into=TowerMaze.switchStairs()&&currentZ===-1&&player.x===start.x&&player.y===start.y
      Object.assign(player,towerMaze.down)
      const next={x:player.x,y:player.y}
      const deeper=TowerMaze.switchStairs()&&currentZ===-2&&player.x===next.x&&player.y===next.y
      const back=TowerMaze.switchStairs()&&currentZ===-1&&player.x===next.x&&player.y===next.y
      Object.assign(player,towerMaze.center)
      const surface=TowerMaze.switchStairs()&&currentZ===0&&player.x===start.x&&player.y===start.y
      return into&&deeper&&back&&surface
    })()`),true,'all four maze stair trips preserve x/y')
    // The initially sealed basement gate must respond to a bump, never
    // consume a turn, and never disclose that an upstairs lever controls it.
    assert.equal(await run(`(async()=>{
      const oldZ=currentZ,oldMap=map,oldPos={x:player.x,y:player.y},oldLog=log
      const text=[],gate=towerMaze.gate,center=towerMaze.center
      const dx=Math.sign(gate.x-center.x),dy=Math.sign(gate.y-center.y)
      try {
        currentZ=-1;map=undergroundMap;currentCave=-1
        Object.assign(player,{x:gate.x-dx,y:gate.y-dy})
        log=message=>text.push(message)
        const before=turnCount
        await tryMove(dx,dy)
        return undergroundMap[gate.y][gate.x]==='mazegatesealed' &&
          text.length===1 && text[0]==="The door won't budge." &&
          turnCount===before && player.x===gate.x-dx && player.y===gate.y-dy
      }finally{currentZ=oldZ;map=oldMap;Object.assign(player,oldPos);log=oldLog}
    })()`),true,'sealed basement gate gives feedback without leaking or passing a turn')
    assert.equal(run(`(()=>{
      currentZ=3;map=towerLevels[2].map;
      const p=towerMaze.lever
      Object.assign(player,{x:p.x-1,y:p.y})
      const messages=[],oldLog=log
      log=message=>messages.push(message)
      try {
        const before=TowerMaze.atLever(p.x,p.y)
        const toggled=TowerMaze.toggle(p.x,p.y)
        const sealed=towerMaze.active&&towerLevels[2].map[p.y][p.x]==='dwarvenleverpulled'&&surfaceMap[tower.entrance.y][tower.entrance.x]==='towerentrancesealed'&&
          undergroundMap[towerMaze.gate.y][towerMaze.gate.x]==='mazegateopen'
        // Enemy actions may legitimately log combat after this one-turn lever
        // interaction; the first message alone describes the mechanism.
        return before&&toggled&&sealed&&
          messages[0]==='From far below comes a heavy clang sound.' &&
          !/path|open|entrance|gate|mechanism/i.test(messages[0])
      }finally{log=oldLog}
    })()`),true,'lever acts atomically and its log reveals no solution')
    // With the lever switched, the main Tower entrance behaves identically.
    assert.equal(await run(`(async()=>{
      const oldZ=currentZ,oldMap=map,oldPos={x:player.x,y:player.y},oldLog=log
      const text=[],door=tower.entrance
      try {
        currentZ=0;map=surfaceMap
        Object.assign(player,{x:door.x,y:door.y+1})
        log=message=>text.push(message)
        const before=turnCount
        await tryMove(0,-1)
        return surfaceMap[door.y][door.x]==='towerentrancesealed' &&
          text.length===1 && text[0]==="The door won't budge." &&
          turnCount===before && player.x===door.x && player.y===door.y+1
      }finally{currentZ=oldZ;map=oldMap;Object.assign(player,oldPos);log=oldLog}
    })()`),true,'sealed Tower entrance gives feedback without leaking or passing a turn')
    assert.equal(run(`(()=>{
      const oldVisible=undergroundTileVisible,oldZ=currentZ,oldMap=map
      const oldPos={x:player.x,y:player.y}
      try {
        undergroundTileVisible=()=>true
        currentZ=3;map=towerLevels[2].map
        Object.assign(player,{x:towerMaze.lever.x-1,y:towerMaze.lever.y})
        const lever=tileInspectInfo(towerMaze.lever.x,towerMaze.lever.y)?.html||''
        currentZ=-1;map=undergroundMap
        const gate=tileInspectInfo(towerMaze.gate.x,towerMaze.gate.y)?.html||''
        return lever.includes('Old Lever') && gate.includes('Basement Gate') &&
          !/upstairs|below|exchange|opens|mechanism/i.test(lever+' '+gate)
      } finally {
        undergroundTileVisible=oldVisible;currentZ=oldZ;map=oldMap
        Object.assign(player,oldPos)
      }
    })()`),true,'lever and gate tooltips must not reveal the mechanism')
    assert.equal(run(`(()=>{
      const descriptions=['mazegatesealed','mazegateopen','towerentrancesealed']
        .map(tile=>TILE_DESC[tile]||'')
      return descriptions.every(text=>text &&
        !/mechanism|lever|upstairs|lower maze|distant/i.test(text))
    })()`),true,'all maze door tile descriptions are spoiler-free')
    const saved=JSON.parse(run('JSON.stringify(buildSaveObject())'))
    run(`loadGameFromObject(${JSON.stringify(saved)},{isReplayInit:true})`)
    assert.equal(run('towerMaze.active'),true,'lever state persists in saves')
    assert.equal(run('towerLevels[2].map[towerMaze.lever.y][towerMaze.lever.x]'),'dwarvenleverpulled')
    assert.equal(run('surfaceMap[tower.entrance.y][tower.entrance.x]'),'towerentrancesealed')
    assert.equal(run('undergroundMap[towerMaze.gate.y][towerMaze.gate.x]'),'mazegateopen')
    assert.equal(run('deepLevels[0].map[towerMaze.down.y][towerMaze.down.x]'),'caveup')
    assert.equal(run('groundItems.filter(g=>g.towerMazeTreasure).length'),1)
    assert.equal(run(`(()=>{
      currentZ=0;map=surfaceMap
      const targets=[]
      for(let y=tower.y-1;y<=tower.y+tower.size;y++)for(let x=tower.x-1;x<=tower.x+tower.size;x++){
        if(towerContains(x,y)||!TILE[map[y]?.[x]]?.walk)continue
        if(DIRS8.some(([dx,dy])=>towerContains(x+dx,y+dy)&&
          ['dwarvenwall','towerwindow','towerentrancesealed','dwarvendoorclosed','dwarvendooropen']
          .includes(map[y+dy]?.[x+dx])))targets.push({x,y})
      }
      if(!targets.length)return false
      const t=TowerMaze.chaosTarget(targets[0],new Set())
      return t&&towerInterior(t.x,t.y)&&Math.max(Math.abs(t.x-targets[0].x),
        Math.abs(t.y-targets[0].y))<=8
    })()`),true,'tower Chaos always lands inside at the same z')
    assert.equal(run(`(()=>{
      currentZ=0;map=surfaceMap
      let origin=null
      for(let y=tower.y-1;y<=tower.y+tower.size&&!origin;y++)
        for(let x=tower.x-1;x<=tower.x+tower.size;x++){
          if(towerContains(x,y)||!TILE[map[y]?.[x]]?.walk)continue
          if(DIRS8.some(([dx,dy])=>towerContains(x+dx,y+dy)&&
            ['dwarvenwall','towerwindow','towerentrancesealed','dwarvendoorclosed','dwarvendooropen']
            .includes(map[y+dy]?.[x+dx]))){origin={x,y};break}
        }
      if(!origin)return false
      const original=enemies
      try{
        const blocker=[]
        for(let y=tower.y+1;y<tower.y+tower.size-1;y++)
          for(let x=tower.x+1;x<tower.x+tower.size-1;x++)
            if(towerInterior(x,y)&&surfaceMap[y][x]==='marble')
              blocker.push({x,y,level:0,levelKind:'surface',alive:true})
        enemies=blocker
        const p=TowerMaze.chaosTarget(origin,new Set())
        return p&&p.actor&&p.actor.x===p.x&&p.actor.y===p.y&&
          towerInterior(p.x,p.y)
      }finally{enemies=original}
    })()`),true,'fully occupied Tower interior uses the agreed monster swap')
    // The final chest must not also trigger an ordinary chest loot roll.
    assert.equal(run(`(()=>{
      currentZ=-2;map=deepLevels[0].map;currentCave=-1
      Object.assign(player,towerMaze.treasure)
      const before=player.gold
      checkGroundAt(player.x,player.y)
      return player.gold>before&&
        groundItems.filter(g=>g.towerMazeTreasure).length===0
    })()`),true,'the final chest is a single persistent custom reward')
    const savedJson=JSON.stringify(saved)
    run(`loadGameFromObject(${savedJson},{isReplayInit:true})`)
    assert.equal(run('towerMaze.active'),true)
    // Exercise repeated whole-world rotations after restoring a maze save.
    // The identical x/y pair must still be the entrance on both global grids.
    assert.equal(run(`(()=>{
      currentZ=0;map=surfaceMap
      for(let turn=0;turn<4;turn++){
        rotateGeneratedWorld(1)
        if(surfaceMap[towerMaze.center.y]?.[towerMaze.center.x]!=='mazestairsdown' ||
           undergroundMap[towerMaze.center.y]?.[towerMaze.center.x]!=='mazestairsup' ||
           undergroundMap[towerMaze.down.y]?.[towerMaze.down.x]!=='cavedown' ||
           deepLevels[0].map[towerMaze.down.y]?.[towerMaze.down.x]!=='caveup' ||
           surfaceMap[tower.entrance.y]?.[tower.entrance.x]!=='towerentrancesealed' ||
           !towerMaze.levels.every(l=>l.patches.every(p=>
             (l.z===-1?undergroundMap:deepLevels[0].map)[p.y]?.[p.x]===p.tile)) ||
           !TowerMaze.inRegion(-1,towerMaze.center.x,towerMaze.center.y) ||
           !TowerMaze.inRegion(-2,towerMaze.treasure.x,towerMaze.treasure.y))return false
      }
      return true
    })()`),true,'repeated rotations preserve maze maps, protected footprints and stair pairs')
    console.log(`tower maze seed ${seed}: routes ${d.positions.map(p=>p.metrics.routeTiles).join('/')}, `+
      `monsters ${d.positions.map(p=>p.spawns.length).join('/')}, rotation ${d.maze.side}`)
  }
  console.log('tower maze rules checks passed')
}
main().catch(e=>{console.error(e);process.exitCode=1})
