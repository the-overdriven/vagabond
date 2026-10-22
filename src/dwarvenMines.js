'use strict'

// The mine package occupies fixed world depths. Unused chain slots are
// intentionally impassable, not hidden playable Ruins or extra mine floors.
function minePackageConfig() {
  return dungeonPackageConfig('dwarvenMines')
}

function dwarvenMinesCageShortcut() {
  const id=minePackageConfig()?.shortcut?.id || 'dwarven-mines-haulage-cage-1'
  return dungeonShortcutById(id)
}

function mineUnusedChainLevel() {
  const cm = blankCaveMap()
  return {
    map: cm, caveMaps: [cm], caves: [], kind: 'unused',
    discovered: Array.from({length: MAP_H}, () => Array(MAP_W).fill(false))
  }
}

function mineCarveLine(cm, from, to, bounds, width = 1) {
  let x = from.x, y = from.y
  const carve = (cx,cy) => {
    for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) {
      const px = cx + dx, py = cy + dy
      if (px > bounds.x1 && px < bounds.x2 && py > bounds.y1 && py < bounds.y2)
        cm[py][px] = 'cavefloor2'
    }
  }
  carve(x,y)
  while (x !== to.x || y !== to.y) {
    if (x !== to.x) x += Math.sign(to.x - x)
    else y += Math.sign(to.y - y)
    carve(x,y)
  }
}

function mineFloorWalkable(cm, start) {
  const seen = new Set([keyXY(start.x,start.y)]), queue = [start]
  const directions = [[0,-1],[1,0],[0,1],[-1,0]]
  for (let i = 0; i < queue.length; i++) for (const [dx,dy] of directions) {
    const x = queue[i].x+dx, y = queue[i].y+dy, k = keyXY(x,y)
    if (cm[y]?.[x] !== 'cavefloor2' || seen.has(k)) continue
    seen.add(k);queue.push({x,y})
  }
  return seen
}

function mineFloorCandidate(floorIndex, floorCount) {
  const cfg = minePackageConfig().layout
  const width = randInt(...cfg.widthRange), height = randInt(...cfg.heightRange)
  if (width + cfg.edgeMargin*2 >= MAP_W || height + cfg.edgeMargin*2 >= MAP_H) return null
  const bounds = {
    x1: Math.floor((MAP_W-width)/2), y1: Math.floor((MAP_H-height)/2)
  }
  bounds.x2 = bounds.x1+width-1
  bounds.y2 = bounds.y1+height-1
  const xL = bounds.x1+5, xA = bounds.x1+Math.floor(width/3)
  const xB = bounds.x1+Math.floor(width*2/3), xR = bounds.x2-5
  const yT = bounds.y1+6, yB = bounds.y2-7
  const main = [
    {x:xL,y:yT}, {x:xA,y:yT}, {x:xA,y:yB},
    {x:xB,y:yB}, {x:xB,y:yT}, {x:xR,y:yT}
  ]
  const cm = blankCaveMap()
  const widthAt = () => chance(cfg.widePassageChance) ? cfg.passageWidthRange[1] : cfg.passageWidthRange[0]
  for (let i = 1; i < main.length; i++) mineCarveLine(cm,main[i-1],main[i],bounds,widthAt())
  // This deliberately links distant portions of the winding backbone. Before
  // carving, the existing detour is long, so it is a real alternate route.
  const priorDetour = caveDryPathLength(cm,main[1],main[4],'cavefloor2')
  if (priorDetour < xB-xA+cfg.minAlternateRouteSaving) return null
  mineCarveLine(cm,main[1],main[4],bounds,1)

  const branchCount = randInt(...cfg.branchesRange)
  const dirs = [[1,0],[0,1],[-1,0],[0,-1]]
  const mainCells = []
  for (let y=bounds.y1+2;y<bounds.y2-1;y++) for(let x=bounds.x1+2;x<bounds.x2-1;x++)
    if (cm[y][x]==='cavefloor2') mainCells.push({x,y})
  let usefulBranches=0
  for (let n=0;n<branchCount*4 && usefulBranches<branchCount;n++) {
    const start = pick(mainCells)
    const [dx,dy] = pick(dirs)
    const length = randInt(...cfg.straightRunRange)
    const end={x:start.x+dx*length,y:start.y+dy*length}
    if(end.x<=bounds.x1+2||end.x>=bounds.x2-2||end.y<=bounds.y1+2||end.y>=bounds.y2-2)continue
    if(cm[end.y][end.x]==='cavefloor2')continue
    mineCarveLine(cm,start,end,bounds,widthAt())
    usefulBranches++
  }
  const floorCells=[]
  for(let y=bounds.y1+2;y<bounds.y2-1;y++)for(let x=bounds.x1+2;x<bounds.x2-1;x++)
    if(cm[y][x]==='cavefloor2')floorCells.push({x,y})
  // Passing pockets have at least 3x3 free area; they remain traversable.
  for(let n=0;n<randInt(...cfg.pocketsRange);n++) {
    const spot=pick(floorCells)
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
      if(spot.x+dx>bounds.x1&&spot.x+dx<bounds.x2&&spot.y+dy>bounds.y1&&spot.y+dy<bounds.y2)
        cm[spot.y+dy][spot.x+dx]='cavefloor2'
  }
  // One backbone loop is guaranteed above; optional extra connectors only
  // count when they offer a genuinely shorter alternate route.
  let loops=1
  const desiredLoops=randInt(...cfg.loopCountRange)
  for(let attempt=0;attempt<cfg.additionalLoopRetries && loops<desiredLoops;attempt++) {
    const start=pick(floorCells),end=pick(floorCells)
    const direct=Math.abs(start.x-end.x)+Math.abs(start.y-end.y)
    if(direct<cfg.minStairWalkingDistance/2)continue
    const previous=caveDryPathLength(cm,start,end,'cavefloor2')
    if(!Number.isFinite(previous)||previous-direct<cfg.minAlternateRouteSaving)continue
    mineCarveLine(cm,start,end,bounds,1)
    loops++
  }
  const reachable=mineFloorWalkable(cm,main[0])
  let floorTiles=0
  for(let y=bounds.y1;y<=bounds.y2;y++)for(let x=bounds.x1;x<=bounds.x2;x++)
    if(cm[y][x]==='cavefloor2')floorTiles++
  if(reachable.size!==floorTiles || usefulBranches===0 ||
      caveDryPathLength(cm,main[0],main[5],'cavefloor2')<cfg.minStairWalkingDistance)return null

  const upper=main[0], lower=main[5]
  // Keep the shortcut away from both stair approaches, even on a short floor.
  const cageCandidates=floorCells.filter(p=>
    Math.max(Math.abs(p.x-upper.x),Math.abs(p.y-upper.y))>8 &&
    Math.max(Math.abs(p.x-lower.x),Math.abs(p.y-lower.y))>8 &&
    reachable.has(keyXY(p.x,p.y)))
  if(!cageCandidates.length)return null
  const cagePad=pick(cageCandidates)
  cm[upper.y][upper.x]='minestairsup'
  if(floorIndex<floorCount-1)cm[lower.y][lower.x]='minestairsdown'
  return {
    kind:'dwarvenMines',dungeonPackage:'dwarvenMines',dungeonFloor:floorIndex+1,floorCount,
    map:cm,caveMaps:[cm],caves:[{x:upper.x,y:upper.y,entrances:[upper,
      ...(floorIndex<floorCount-1?[lower]:[])]}],
    discovered:Array.from({length:MAP_H},()=>Array(MAP_W).fill(false)),
    mineUpstairs:upper,mineDownstairs:floorIndex<floorCount-1?lower:null,
    mineCagePad:cagePad,mineTransitions:{},mineFloorTiles:floorTiles
  }
}

function minePlacedStair(level, tile) {
  for(let y=0;y<level.map.length;y++) {
    const x=level.map[y].indexOf(tile)
    if(x>=0)return {x,y}
  }
  return null
}

// The two cages occupy one vertical shaft. Floors without a cage have a
// visible, impassable opening instead, surrounded by a connected landing.
// Choose the position after every floor exists so it is safe on all of them.
function mineAlignCageShaft(mine) {
  const original=mine[0].mineCagePad
  const positions=[]
  for(let y=3;y<MAP_H-3;y++)for(let x=3;x<MAP_W-3;x++)
    if(mine[0].map[y][x]==='cavefloor2')positions.push({x,y})
  positions.sort((a,b)=>
    (Math.abs(a.x-original.x)+Math.abs(a.y-original.y))-
    (Math.abs(b.x-original.x)+Math.abs(b.y-original.y)) || a.y-b.y || a.x-b.x)
  for(const anchor of positions){
    if(mine.some(level=>[level.mineUpstairs,level.mineDownstairs].filter(Boolean).some(stair=>
      Math.max(Math.abs(stair.x-anchor.x),Math.abs(stair.y-anchor.y))<=8)))continue
    const staged=[]
    for(let index=0;index<mine.length;index++){
      const level=mine[index],cm=level.map.map(row=>row.slice())
      let nearest=null,distance=Infinity
      for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++){
        if(cm[y][x]!=='cavefloor2')continue
        const delta=Math.max(0,Math.abs(x-anchor.x)-1)+Math.max(0,Math.abs(y-anchor.y)-1)
        if(delta<distance){distance=delta;nearest={x,y}}
      }
      if(!nearest){staged.length=0;break}
      const rim={x:Math.min(anchor.x+1,Math.max(anchor.x-1,nearest.x)),
        y:Math.min(anchor.y+1,Math.max(anchor.y-1,nearest.y))}
      mineCarveLine(cm,rim,nearest,{x1:1,y1:1,x2:MAP_W-2,y2:MAP_H-2})
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
        cm[anchor.y+dy][anchor.x+dx]='cavefloor2'
      cm[anchor.y][anchor.x]=index===0?'minecageupperoff':
        index===mine.length-1?'minecageloweroff':'mineshaftrope'
      // A new approach must not overwrite either ordinary mine stair.
      cm[level.mineUpstairs.y][level.mineUpstairs.x]='minestairsup'
      if(level.mineDownstairs)cm[level.mineDownstairs.y][level.mineDownstairs.x]='minestairsdown'
      const reachable=dungeonWalkDistances(cm,level.mineUpstairs)
      let traversable=0,floorTiles=0
      for(const row of cm)for(const tile of row){
        if(TILE[tile]?.walk)traversable++
        if(tile==='cavefloor2')floorTiles++
      }
      if(reachable.size!==traversable ||
        (level.mineDownstairs && (reachable.get(keyXY(level.mineDownstairs.x,level.mineDownstairs.y))??Infinity)<
          minePackageConfig().layout.minStairWalkingDistance)){
        staged.length=0;break
      }
      staged.push({cm,floorTiles})
    }
    if(staged.length!==mine.length)continue
    for(let index=0;index<mine.length;index++){
      const level=mine[index]
      level.map=staged[index].cm
      level.caveMaps[0]=level.map
      level.mineCagePad={x:anchor.x,y:anchor.y}
      level.mineFloorTiles=staged[index].floorTiles
    }
    return true
  }
  return false
}

// A flooded excavation is a side chamber carved out of previously solid rock:
// one dry doorway, a dry ring, and deep water in the middle. It never replaces
// an existing corridor, stair approach or haulage-shaft landing.
function mineFloodSideChambers(mine) {
  const cfg=minePackageConfig().layout.floodedSideChambers
  if(!cfg)return true
  const dirs=[[0,-1],[1,0],[0,1],[-1,0]]
  for(let floorIndex=0;floorIndex<mine.length;floorIndex++) {
    const mandatory=floorIndex+1===cfg.guaranteedFloor
    if(!mandatory && (floorIndex===0 || !chance(cfg.optionalChance)))continue
    const level=mine[floorIndex],cm=level.map
    const protectedSites=[level.mineUpstairs,level.mineDownstairs,level.mineCagePad].filter(Boolean)
    const sites=[]
    for(let y=cfg.roomRadius+2;y<MAP_H-cfg.roomRadius-2;y++)
      for(let x=cfg.roomRadius+2;x<MAP_W-cfg.roomRadius-2;x++){
        if(cm[y][x]!=='cavefloor2')continue
        for(const [dx,dy] of dirs) {
          const cx=x+dx*(cfg.roomRadius+1),cy=y+dy*(cfg.roomRadius+1)
          if(cx-cfg.roomRadius<2 || cy-cfg.roomRadius<2 ||
             cx+cfg.roomRadius>=MAP_W-2 || cy+cfg.roomRadius>=MAP_H-2)continue
          let untouched=true
          for(let yy=cy-cfg.roomRadius;yy<=cy+cfg.roomRadius && untouched;yy++)
            for(let xx=cx-cfg.roomRadius;xx<=cx+cfg.roomRadius;xx++){
              if(cm[yy][xx]!=='cavewall' || protectedSites.some(p=>
                Math.max(Math.abs(xx-p.x),Math.abs(yy-p.y))<=cfg.protectedClearance)){
                untouched=false;break
              }
            }
          if(untouched)sites.push({cx,cy})
        }
      }
    if(!sites.length) {
      if(mandatory)return false
      continue
    }
    const {cx,cy}=pick(sites)
    for(let y=cy-cfg.roomRadius;y<=cy+cfg.roomRadius;y++)
      for(let x=cx-cfg.roomRadius;x<=cx+cfg.roomRadius;x++)
        cm[y][x]=Math.max(Math.abs(x-cx),Math.abs(y-cy))<=cfg.waterRadius
          ? 'water' : 'cavefloor2'
    level.mineFloorTiles=cm.flat().filter(tile=>tile==='cavefloor2').length
  }
  return true
}

function placeDwarvenMinePickaxe(ruins) {
  const floor=ruins[Math.max(0,ruins.length-2)]
  if(!floor)return false
  const level=floor.level,z=floor.z
  const start=level.caves[0]?.entrances?.[0]
  if(!start)return false
  const reachable=dungeonWalkDistances(level.map,start)
  const blocked=new Set(groundItems.filter(g=>g.level===z).map(g=>keyXY(g.x,g.y)))
  const stairs=new Set((level.caves[0]?.entrances||[]).map(p=>keyXY(p.x,p.y)))
  const available=[]
  for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++){
    const key=keyXY(x,y)
    if(level.map[y][x]!=='marble'||blocked.has(key)||stairs.has(key)||!reachable.has(key)||
      !DungeonTraps.safeSpawn(x,y,z,'chain'))continue
    if(Math.max(Math.abs(x-start.x),Math.abs(y-start.y))<6)continue
    available.push({x,y})
  }
  if(!available.length)return false
  const sideRooms=(level.rooms||[]).filter(r=>!r.stairRoom&&!r.landmark&&!r.gallery&&!r.crusherReserved)
  const interior=p=>sideRooms.some(r=>p.x>r.x+1&&p.x<r.x+r.w-2&&p.y>r.y+1&&p.y<r.y+r.h-2)
  const preferred=available.filter(interior)
  const spot=pick(preferred.length?preferred:available)
  groundItems.push({x:spot.x,y:spot.y,level:z,levelKind:'chain',caveIndex:-1,kind:'pickaxe'})
  return true
}

function buildDwarvenMinesStratum() {
  const cfg=minePackageConfig()
  const ruins=dungeonPackageLevels('dwarvenRuins')
  const last=ruins[ruins.length-1]
  const sealed=last&&minePlacedStair(last.level,'dwarvenminessealed')
  if(!sealed)return false
  const count=pickWeighted(cfg.floorCounts.map((n,i)=>({n,weight:cfg.floorCountWeights[i]})),e=>e.weight).n
  const mine=[]
  for(let index=0;index<count;index++){
    let level=null
    for(let attempt=0;attempt<cfg.layout.floorGenerationRetries&&!level;attempt++)level=mineFloorCandidate(index,count)
    if(!level)return false
    mine.push(level)
  }
  if(!mineAlignCageShaft(mine))return false
  if(!mineFloodSideChambers(mine))return false
  // 3- or 4-floor Ruins jump to z:-9 from their actual final floor.
  while(deepLevels.length<Math.abs(cfg.firstZ)-2)deepLevels.push(mineUnusedChainLevel())
  for(const level of mine)deepLevels.push(level)
  last.level.mineTransitions={...(last.level.mineTransitions||{}),down:{z:cfg.firstZ,...mine[0].mineUpstairs}}
  mine[0].mineTransitions.up={z:last.z,...sealed}
  for(let index=1;index<count;index++){
    const above=mine[index-1],below=mine[index]
    const aboveZ=cfg.firstZ-index+1,belowZ=cfg.firstZ-index
    above.mineTransitions.down={z:belowZ,...below.mineUpstairs}
    below.mineTransitions.up={z:aboveZ,...above.mineDownstairs}
  }
  const upper=mine[0].mineCagePad,lower=mine[count-1].mineCagePad
  dungeonShortcuts.push({
    id:cfg.shortcut.id,packageId:'dwarvenMines',kind:'haulageCage',unlocked:false,
    upper:{floor:1,z:cfg.firstZ,x:upper.x,y:upper.y},
    lower:{floor:count,z:cfg.firstZ-count+1,x:lower.x,y:lower.y}
  })
  return placeDwarvenMinePickaxe(ruins)
}

function spawnDwarvenMinesEncounters() {
  const cfg=minePackageConfig(),ec=cfg.encounters
  const groupKeys=['early','middle','late']
  const mine=dungeonPackageLevels('dwarvenMines')
  for(let floorIndex=0;floorIndex<mine.length;floorIndex++){
    const {level,z}=mine[floorIndex]
    const entrances=[level.mineUpstairs,...(level.mineDownstairs?[level.mineDownstairs]:[])]
    const candidates=[],floodedCandidates=[]
    for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++){
      const terrain=level.map[y][x]
      if(!['cavefloor2','water'].includes(terrain) || entrances.some(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))<=ec.entranceClearance)||
         (level.mineCagePad&&Math.max(Math.abs(x-level.mineCagePad.x),
           Math.abs(y-level.mineCagePad.y))<=1))continue
      if(terrain==='water')floodedCandidates.push({x,y})
      else candidates.push({x,y})
    }
    const occupiedSpots=[]
    const target=Math.min(ec.maxMonstersPerFloor,Math.round(level.mineFloorTiles/ec.tilesPerMonster[floorIndex]))
    const selectGroup=()=>pickWeighted(groupKeys.map((key,i)=>({key,weight:ec.groupWeights[floorIndex][i]}))
      .filter(v=>v.weight>0),v=>v.weight).key
    const placePack=(tmpl,count)=>{
      let leader=null,placed=0,coordinationPackId=null
      for(let member=0;member<count;member++){
        const available=(tmpl.name==='Xibal'?floodedCandidates:candidates).filter(p=>{
          if(occupiedSpots.some(o=>o.x===p.x&&o.y===p.y))return false
          if(leader&&Math.max(Math.abs(leader.x-p.x),Math.abs(leader.y-p.y))>3)return false
          if(tmpl.name==='Wyrdhag'&&occupiedSpots.some(o=>Math.max(Math.abs(o.x-p.x),Math.abs(o.y-p.y))<ec.wyrdhagSeparation))return false
          if(occupiedSpots.some(o=>o.name==='Wyrdhag'&&Math.max(Math.abs(o.x-p.x),Math.abs(o.y-p.y))<ec.wyrdhagSeparation))return false
          return !occupiedSpots.some(o=>Math.max(Math.abs(o.x-p.x),Math.abs(o.y-p.y))<ec.minimumSpacing)
        })
        if(!available.length)break
        // Any ability holder may use a wall-adjacent spawn. If the pack has no
        // such position, it spawns normally without becoming concealed.
        const wallSites=tmpl.abilities?.includes('wallAmbush')
          ? available.filter(p=>enemyWallAmbushWallAt(level.map,p.x,p.y)) : []
        const spot=pick(wallSites.length?wallSites:available)
        leader||=spot
        const concealed=wallSites.length>0
        const enemy=addEnemy({name:tmpl.name,baseName:tmpl.name,tier:tmpl.tier,
          level:z,levelKind:'chain',caveIndex:-1,hp:tmpl.hp,maxHp:tmpl.hp,
          atk:tmpl.atk,def:tmpl.def,spd:tmpl.spd,grace:tmpl.grace,
          abilities:[...tmpl.abilities],humanoid:!!tmpl.humanoid,aggro:tmpl.aggro,
          x:spot.x,y:spot.y,homeX:spot.x,homeY:spot.y,homeTileType:level.map[spot.y][spot.x],
          alive:true,prefix:null,equipment:null,
          collectiveMindPackId:tmpl.abilities?.includes('collectiveMind') ? coordinationPackId : null,
          wallAmbushHidden:concealed,
          wallAmbushSpent:tmpl.abilities?.includes('wallAmbush') && !concealed})
        if(tmpl.abilities?.includes('collectiveMind') && !coordinationPackId)
          coordinationPackId=enemy.id
        occupiedSpots.push({...spot,name:tmpl.name,id:enemy.id})
        placed++
      }
      return placed
    }
    // Reserve one encounter per species before the weighted population fills
    // the remaining budget. Early and middle creatures stay on their own floor;
    // late creatures first appear together on floor 3, even in four-floor mines.
    let populated=0
    const guaranteedGroup=groupKeys[floorIndex]
    const required=(ec.groups[guaranteedGroup]||[]).slice()
    // Xibal must claim a water tile before unrelated shoreline encounters can
    // occupy every legal approach to the guaranteed flood chamber.
    if(required.includes('Xibal')) {
      required.splice(required.indexOf('Xibal'),1)
      required.unshift('Xibal')
    }
    if(ec.guaranteeEachSpecies && guaranteedGroup) for(const name of required) {
      const tmpl=ENEMY_TEMPLATE_BY_NAME[name]
      if(!tmpl?.biomes?.includes(`z-${Math.abs(z)}`) || placePack(tmpl,1)!==1)
        throw new Error(`Dwarven Mines could not place guaranteed species: ${name} at ${z}`)
      populated++
    }
    while(populated<target){
      const group=selectGroup()
      const pool=ec.groups[group].map(name=>ENEMY_TEMPLATE_BY_NAME[name]).filter(t=>
        t && t.biomes.includes(`z-${Math.abs(z)}`) && (t.name!=='Xibal'||
          floodedCandidates.some(p=>!occupiedSpots.some(o=>
            Math.max(Math.abs(o.x-p.x),Math.abs(o.y-p.y))<ec.minimumSpacing ||
            (o.name==='Wyrdhag'&&Math.max(Math.abs(o.x-p.x),Math.abs(o.y-p.y))<ec.wyrdhagSeparation)))))
      if(!pool.length)break
      const tmpl=pickWeighted(pool,t=>t.rarity??1)
      const sizes=ec.packSizes[tmpl.name]
      const count=Math.min(target-populated,sizes?randInt(...sizes):1)
      const placed=placePack(tmpl,count)
      if(!placed)break
      populated+=placed
    }
  }
}

// An isolated bonus encounter, outside the established z:-2 ecosystem pool.
function maybeSpawnCaveTrollInDeepCaves() {
  const ec=minePackageConfig().encounters
  if(!chance(ec.caveTrollZ2Chance))return
  const deep=deepLevels[0],tmpl=ENEMY_TEMPLATE_BY_NAME['Cave Troll']
  if(!deep||!tmpl)return
  if(enemies.filter(e=>e.alive && e.baseName==='Cave Troll' && e.level===-2 &&
    e.levelKind==='chain').length >= ec.caveTrollZ2Max)return
  const entryPoints=deep.caves.flatMap(c=>c.entrances||[])
  const candidates=[]
  for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++){
    if(deep.map[y]?.[x]!=='cavefloor2'||entryPoints.some(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))<8)||
      enemies.some(e=>e.alive&&e.level===-2&&e.levelKind==='chain'&&Math.max(Math.abs(e.x-x),Math.abs(e.y-y))<3)||
      groundItems.some(g=>g.level===-2&&g.x===x&&g.y===y))continue
    const caveIndex=deep.caveMaps.findIndex(cm=>cm[y]?.[x]==='cavefloor2')
    if(caveIndex>=0)candidates.push({x,y,caveIndex})
  }
  if(!candidates.length)return
  const spot=pick(candidates)
  addEnemy({name:tmpl.name,baseName:tmpl.name,tier:tmpl.tier,level:-2,levelKind:'chain',
    caveIndex:spot.caveIndex,hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,
    spd:tmpl.spd,grace:tmpl.grace,abilities:[...tmpl.abilities],humanoid:false,aggro:tmpl.aggro,
    x:spot.x,y:spot.y,homeX:spot.x,homeY:spot.y,homeTileType:'cavefloor2',alive:true,
    prefix:null,equipment:null})
}
