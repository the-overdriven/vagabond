'use strict'

// Elevated maps own their collision/discovery grids. Surface scenery is never
// copied into them, so every ordinary movement/targeting API sees only this floor.
let tower = null
let towerLevels = []
const TOWER_SIZE = 11
const TOWER_MIN_VILLAGE_GAP = 50

// Surface perspective is derived from player position; it is never saved or
// rolled with the world RNG. Six tiles away shows the darkened summit; closer
// shows the ground masonry without revealing the enclosed rooms.
const TOWER_NEAR_DISTANCE = 5
function towerContains(x, y) {
  return !!tower && x >= tower.x && x < tower.x + TOWER_SIZE &&
    y >= tower.y && y < tower.y + TOWER_SIZE
}
function towerInterior(x, y) {
  return !!tower && x > tower.x && x < tower.x + TOWER_SIZE - 1 &&
    y > tower.y && y < tower.y + TOWER_SIZE - 1
}
function towerFootprintDistance(x, y, left, top) {
  const dx = Math.max(left - x, 0, x - (left + TOWER_SIZE - 1))
  const dy = Math.max(top - y, 0, y - (top + TOWER_SIZE - 1))
  return Math.max(dx, dy)
}
function towerDistance(x = player.x, y = player.y) {
  return tower ? towerFootprintDistance(x, y, tower.x, tower.y) : Infinity
}
function towerShowsSummit() {
  return currentZ === 0 && towerDistance() > TOWER_NEAR_DISTANCE
}
function towerPlayerInside() {
  return towerInterior(player.x, player.y) ||
    (!!tower && player.x === tower.entrance.x && player.y === tower.entrance.y)
}

function towerPoint(dx, dy) {
  // Local tower coordinates rotate with the generated world. Keeping this
  // transform in one place also keeps staircase pairs aligned after rotation.
  const turns = tower?.rotation || 0
  if (turns === 1) [dx, dy] = [TOWER_SIZE - 1 - dy, dx]
  else if (turns === 2) [dx, dy] = [TOWER_SIZE - 1 - dx, TOWER_SIZE - 1 - dy]
  else if (turns === 3) [dx, dy] = [dy, TOWER_SIZE - 1 - dx]
  return {x: tower.x + dx, y: tower.y + dy}
}

function towerStair(z, up) {
  // Alternating landings stay in the western chambers of the unrotated layout.
  // Every tile in each landing's 3x3 neighborhood is ordinary marble floor.
  const north = up ? z % 2 : (z - 1) % 2
  return towerPoint(2, north ? 2 : 8)
}

function generateTower() {
  tower = null
  towerLevels = []
  const natural = new Set(['grass','forest','hill','sand','snow','taiga'])
  const protectedCells = new Set([...npcs, ...groundItems.filter(g => (g.level ?? 0) === 0),
    ...enemies.filter(e => (e.level ?? 0) === 0 && e.alive), spawnPoint,
    ...(treasureMapSpot ? [treasureMapSpot] : [])].map(p => keyXY(p.x,p.y)))
  const before = surfaceReachableFromTemple()
  const candidates = []
  // Leave an untouched, walkable ring around the footprint. It carries old
  // routes around the tower instead of sealing a narrow overworld passage.
  for (let y = 2; y < MAP_H-TOWER_SIZE-2; y++) for (let x = 2; x < MAP_W-TOWER_SIZE-2; x++) {
    if (Math.max(Math.abs(x+5-spawnPoint.x),Math.abs(y+5-spawnPoint.y)) < 18) continue
    if (villageHuts.some(hut => towerFootprintDistance(hut.x, hut.y, x, y) < TOWER_MIN_VILLAGE_GAP)) continue
    let valid = true
    for (let dy = -1; dy <= TOWER_SIZE && valid; dy++) for (let dx = -1; dx <= TOWER_SIZE; dx++) {
      if (!natural.has(map[y+dy][x+dx]) || protectedCells.has(keyXY(x+dx,y+dy))) {valid=false;break}
    }
    if (valid && before.has(keyXY(x+5,y+11))) candidates.push({x,y})
  }
  if (!candidates.length) return false
  tower = {...pick(candidates), size:TOWER_SIZE, floors:5, rotation:0}
  tower.entrance = towerPoint(5, 10)
  // Door states are rolled during generation, never on rendering or revisits.
  // This also applies to the outside entrance (which may reveal the foyer).
  const randomDoor = () => chance(0.1) ? 'dwarvendooropen' : 'dwarvendoorclosed'
  for (let z = 0; z <= 4; z++) {
    const terrain = z === 0 ? surfaceMap : Array.from({length:MAP_H},()=>Array(MAP_W).fill('towervoid'))
    for (let dy=0;dy<TOWER_SIZE;dy++) for (let dx=0;dx<TOWER_SIZE;dx++) {
      const edge=dx===0||dy===0||dx===10||dy===10
      const corner=(dx===0||dx===10)&&(dy===0||dy===10)
      terrain[tower.y+dy][tower.x+dx]=edge
        ? z===4 ? corner ? 'marble':'towerbattlement'
          : !corner && ((dy===0 && (dx===3 || dx===7)) || (dy===10 && dx===5) || ((dx===0 || dx===10) && dy===5)) ? 'towerwindow':'dwarvenwall'
        : 'marble'
      if(z===0) grasslandTrees.delete(keyXY(tower.x+dx,tower.y+dy))
    }
    if(z<4) {
      // Two chambers, joined by a normal unlocked door and a second open
      // passage. The stair approach is always free of furniture and enemies.
      const gap=randInt(2,3)
      for(let dy=1;dy<8;dy++) terrain[tower.y+dy][tower.x+5]='dwarvenwall'
      terrain[tower.y+gap][tower.x+5]=randomDoor()
      // Seal the partition junction: a missing diagonal corner permits
      // movement between chambers while both doors are still closed.
      terrain[tower.y+7][tower.x+5]='dwarvenwall'
      for (let dx=6;dx<10;dx++) terrain[tower.y+7][tower.x+dx]='dwarvenwall'
      terrain[tower.y+7][tower.x+8]=randomDoor()
      const p=towerStair(z,true);terrain[p.y][p.x]='towerstairsup'
    }
    if(z>0) {
      const p=towerStair(z,false);terrain[p.y][p.x]='towerstairsdown'
      towerLevels.push({map:terrain,discovered:Array.from({length:MAP_H},()=>Array(MAP_W).fill(false))})
    } else terrain[tower.entrance.y][tower.entrance.x]=randomDoor()
  }
  // All cells in the clear perimeter were walkable before stamping. A ring
  // gives every old ingress an egress, preserving exterior connectivity.
  map=surfaceMap
  return true
}

function populateTower() {
  // Each ordinary floor rolls both its pack size and a power mix of existing
  // species. The summit deliberately keeps its Lich and two Gargoyles.
  // Weighted pools yield occasional tougher visitors without boosting stats.
  const encounters = [
    {min:1,max:3,roster:['Giant Rat','Giant Rat','Giant Bat','Giant Bat','Goblin']},
    {min:2,max:4,roster:['Goblin','Goblin','Skeleton','Skeleton','Giant Bat','Orc']},
    {min:3,max:5,roster:['Skeleton','Skeleton','Orc','Orc','Goblin','Ogre']},
    {min:3,max:6,roster:['Orc','Orc','Ogre','Ogre','Skeleton','Gargoyle']}
  ]
  for(let z=0;z<=4;z++) {
    const terrain=z===0?surfaceMap:towerLevels[z-1].map
    const spots=[]
    const stairs=[...(z<4?[towerStair(z,true)]:[]),...(z>0?[towerStair(z,false)]:[])]
    for(let dy=1;dy<=5;dy++)for(let dx=1;dx<=9;dx++) {
      const x=tower.x+dx,y=tower.y+dy
      if(terrain[y][x]==='marble' && stairs.every(p =>
        Math.max(Math.abs(x-p.x),Math.abs(y-p.y))>=3))spots.push({x,y})
    }
    const take=()=>spots.splice(randInt(0,spots.length-1),1)[0]
    const roster = z===4 ? ['Gargoyle','Lich','Gargoyle'] :
      Array.from({length:randInt(encounters[z].min,encounters[z].max)},()=>pick(encounters[z].roster))
    for(const name of roster) {
      const p=take(),tmpl=ENEMY_TEMPLATE_BY_NAME[name]
      const e={...tmpl,baseName:tmpl.name,abilities:[...tmpl.abilities],...p,level:z,
        levelKind:z===0?'surface':'tower',caveIndex:-1,homeX:p.x,homeY:p.y,
        homeTileType:'marble',maxHp:tmpl.hp,alive:true,prefix:null,equipment:null}
      // Existing equipment and stats retain the normal threat differences.
      prepareEnemyEquipment(e)
      addEnemy(e)
    }
    if(z>0) groundItems.push({...take(),level:z,levelKind:'tower',caveIndex:-1,
      kind:'chest',tier:z===4?5:Math.min(3,z+1),opened:false})
  }
}

function travelTowerStairs() {
  const tile=map[player.y]?.[player.x]
  if(tile!=='towerstairsup'&&tile!=='towerstairsdown')return false
  const destination=currentZ+(tile==='towerstairsup'?1:-1)
  if(destination<0||destination>towerLevels.length)return false
  const terrain=destination===0?surfaceMap:towerLevels[destination-1].map
  // Matching stairs share coordinates. A monster occupying the landing blocks
  // travel; do not teleport either actor or silently reset the encounter.
  if(enemies.some(e=>e.alive&&(e.level??0)===destination&&e.x===player.x&&e.y===player.y)) {
    log('The stair landing is occupied. You cannot pass.','info');return true
  }
  currentZ=destination;currentCave=-1;map=terrain
  undergroundDiscovered=destination===0?undergroundDiscoveredL1:towerLevels[destination-1].discovered
  resetSwimming();clearAutoPath();pendingMove=null;hoveredEnemy=null;stopCameraAnimation()
  invalidateUndergroundFov();minimapDirty=true
  log(destination ? `${tile==='towerstairsup' ? 'You climb' : 'You descend'} to tower floor +${destination}.` : 'You descend to the tower entrance.','info')
  render();updateHud();return true
}

function towerBackgroundVisual(tile, x, y) {
  const base = RENDER_STYLE.terrainTiles[tile]
  if (!base) return null
  // Use the same coordinate variants and rock-strip pieces as the surface.
  // Read adjacent terrain from the surface map, not the current tower map.
  const sameLeft = surfaceMap[y]?.[x-1] === tile
  const sameRight = surfaceMap[y]?.[x+1] === tile
  let image = base.variants?.length ? tileVariantImage(base.variants, x, y) : base.image
  if (base.leftImage || base.middleImage || base.rightImage || base.singleImage) {
    if (sameLeft && sameRight) image=base.middleImage || base.image
    else if (sameRight) image=base.leftImage || base.middleImage || base.image
    else if (sameLeft) image=base.rightImage || base.middleImage || base.image
    else image=base.singleImage || base.image || base.middleImage
  }
  return coordinateVisualVariant({...base,image},x,y,0)
}

function towerBackgroundGround(tile,x,y) {
  if(tile==='taiga'||tile==='snowmountain')return 'snow'
  if(['forest','ancientForest','hill','mountain','boulder'].includes(tile)) {
    const saved=tileUnderlays[keyXY(x,y)]
    return saved==='snow'||saved==='sand' ? saved : 'grass'
  }
  return null
}

function drawTowerBackground(x,y) {
  if(!discovered[y]?.[x])return
  const tile=surfaceMap[y]?.[x],t=TILE[tile]
  if(!t)return
  const px=Math.round((x-camX)*TILE_PX),py=Math.round((y-camY)*TILE_PX)
  ctx.fillStyle=t.bg;ctx.fillRect(px,py,TILE_PX,TILE_PX)
  // Draw a single surface landscape for each cell. Generic saved underlays
  // can contain forest under a rock tile, which previously stacked trees and
  // rocks together. Only snow/sand replace the plain grass base of scenery.
  if(USE_TILE_IMAGES) {
    const k=keyXY(x,y)
    const overlayGround=towerBackgroundGround(tile,x,y)
    const visual=towerBackgroundVisual(tile,x,y)
    const ground=towerBackgroundVisual(visual?.baseTileKey||overlayGround,x,y)
    if(ground?.image)drawImageVisual(px,py,ground)
    if(visual?.image)drawImageVisual(px,py,visual)
    if(tile==='grass'&&grasslandTrees.has(k)) {
      // Surface trees use seven deterministic image variants, scaling/mirroring.
      const tree=coordinateVisualVariant(RENDER_STYLE.specialTiles.grassTree,x,y,41)
      drawImageVisual(px,py,tree)
    }
  } else {
    const tree=tile==='grass'&&grasslandTrees.has(keyXY(x,y))
    drawTile(px,py,tree?RENDER_STYLE.specialTiles.grassTree.glyph:t.ch,
      tree?RENDER_STYLE.specialTiles.grassTree.color:t.color,t.bg)
  }
}


// The surface remains a separate world while the player is upstairs. Nearby
// outside creatures get ordinary passive wandering opportunities on gameplay
// turns, without spotting the player, crossing a tower wall or activating AI.
// No additional counters or saved state are required: positions use existing
// enemy serialization and choices use the replay-recorded game RNG.
function wanderSurfaceBelowTower() {
  if (currentZ <= 0 || !tower) return
  const blocked = new Set(npcs.map(n => keyXY(n.x, n.y)))
  for (const e of enemies) if (e.alive && (e.level ?? 0) === 0) blocked.add(keyXY(e.x, e.y))
  for (const e of enemies) {
    if (!e.alive || (e.level ?? 0) !== 0 || (e.levelKind && e.levelKind !== 'surface') ||
        towerContains(e.x, e.y) || e.aware || e.sleeping || e.wallAmbushHidden ||
        e.pendingAbility || enemyWanderMode(e) === false ||
        Math.max(Math.abs(e.x - player.x), Math.abs(e.y - player.y)) > ENEMY_WANDER_ACTIVE_RADIUS) continue
    if (!chance(ENEMY_WANDER_CHANCE)) continue
    const mode = enemyWanderMode(e)
    const anchored = (mode === 'homeReanchored' || mode === 'homeReturn') && ENEMY_WANDER_LEASH
    const homeX = e.homeX ?? e.x, homeY = e.homeY ?? e.y
    const radius = enemyHomeRadius(e)
    // If a returning creature has strayed beyond its home range, select
    // only steps that bring it closer. Others respect their usual leash.
    const fromHome = Math.max(Math.abs(e.x - homeX), Math.abs(e.y - homeY))
    const returning = mode === 'homeReturn' && anchored && fromHome > radius
    const choices = []
    for (const [dx, dy] of DIRS8) {
      const x = e.x + dx, y = e.y + dy
      const key = keyXY(x, y)
      if (towerContains(x, y) || blocked.has(key) || !TILE[surfaceMap[y]?.[x]]?.walk ||
          (anchored && !returning && Math.max(Math.abs(x-homeX), Math.abs(y-homeY)) > radius) ||
          (returning && Math.max(Math.abs(x-homeX), Math.abs(y-homeY)) >= fromHome)) continue
      // Do not cut through masonry or terrain corners diagonally.
      if (dx && dy && (!TILE[surfaceMap[e.y]?.[x]]?.walk ||
          !TILE[surfaceMap[y]?.[e.x]]?.walk)) continue
      choices.push({x, y})
    }
    if (!choices.length) continue
    const next = choices[randInt(0, choices.length - 1)]
    blocked.delete(keyXY(e.x, e.y))
    const fromX = e.x, fromY = e.y
    e.x = next.x; e.y = next.y
    blocked.add(keyXY(e.x, e.y))
    if (mode === 'homeReanchored' && anchored && fromHome > radius) {
      e.homeX = fromX; e.homeY = fromY
    }
    beginEnemyMoveAnim(e, fromX, fromY) // presentation only; outcome already resolved
  }
}

function towerSurfaceMonsterVisible(e) {
  return currentZ > 0 && e.alive && (e.level ?? 0) === 0 &&
    (!e.levelKind || e.levelKind === 'surface') && !towerContains(e.x, e.y) &&
    map[e.y]?.[e.x] === 'towervoid' && !!discovered[e.y]?.[e.x] &&
    !e.wallAmbushHidden && e.pendingAbility?.type !== 'burrow' && !enemyInvisibleActive(e)
}

// Purely visual. These silhouettes are not added to visibleEnemies or any
// inspection/range/target lists, and so cannot reveal awareness or aggro.
function drawTowerSurfaceMonsters(now) {
  if (currentZ <= 0 || !tower) return
  for (const e of enemies) {
    if (!towerSurfaceMonsterVisible(e)) continue
    let x = e.x, y = e.y
    if (e.animStart !== undefined) {
      const t = Math.max(0, Math.min(1, (now - e.animStart) / MOVE_ANIM_MS))
      if (t >= 1) e.animStart = undefined
      else {
        const eased = 1 - (1 - t) ** 3
        x = e.animFromX + (e.x - e.animFromX) * eased
        y = e.animFromY + (e.y - e.animFromY) * eased
      }
    }
    const vx = Math.round((x - camX) * TILE_PX)
    const vy = Math.round((y - camY) * TILE_PX)
    if (vx < -TILE_PX || vy < -TILE_PX || vx > canvas.width || vy > canvas.height) continue
    // Use ordinary species artwork in tile mode and its glyph in ASCII.
    // Do not expose upstairs combat indicators or targeting overlays.
    drawEnemyVisual(vx, vy, e)
  }
}

// A single, inexpensive screen-space pass darkens the outside world, including
// its moving creatures. The open summit deliberately keeps daylight.
function shadeTowerExterior() {
  if (currentZ <= 0 || currentZ >= 4 || !tower) return
  const left = Math.max(0, Math.min(canvas.width, Math.round((tower.x - camX) * TILE_PX)))
  const right = Math.max(0, Math.min(canvas.width, Math.round((tower.x + TOWER_SIZE - camX) * TILE_PX)))
  const top = Math.max(0, Math.min(canvas.height, Math.round((tower.y - camY) * TILE_PX)))
  const bottom = Math.max(0, Math.min(canvas.height, Math.round((tower.y + TOWER_SIZE - camY) * TILE_PX)))
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.fillRect(0, 0, canvas.width, top)
  ctx.fillRect(0, bottom, canvas.width, canvas.height - bottom)
  ctx.fillRect(0, top, left, bottom - top)
  ctx.fillRect(right, top, canvas.width - right, bottom - top)
}
