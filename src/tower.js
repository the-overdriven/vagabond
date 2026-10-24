'use strict'

// Elevated maps own their collision/discovery grids. Surface scenery is never
// copied into them, so every ordinary movement/targeting API sees only this floor.
let tower = null
let towerLevels = []
const TOWER_SIZE = 11

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
function towerDistance(x = player.x, y = player.y) {
  if (!tower) return Infinity
  const dx = Math.max(tower.x - x, 0, x - (tower.x + TOWER_SIZE - 1))
  const dy = Math.max(tower.y - y, 0, y - (tower.y + TOWER_SIZE - 1))
  return Math.max(dx, dy)
}
function towerShowsSummit() {
  return currentZ === 0 && towerDistance() > TOWER_NEAR_DISTANCE
}
function towerPlayerInside() {
  return towerInterior(player.x, player.y) ||
    (!!tower && player.x === tower.entrance.x && player.y === tower.entrance.y)
}

function towerStair(z, up) {
  // Alternating landings stay in the western chambers, away from internal doors.
  // Every tile in each landing's 3x3 neighborhood is ordinary marble floor.
  const north = up ? z % 2 : (z - 1) % 2
  return {x: tower.x + 2, y: tower.y + (north ? 2 : 8)}
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
    let valid = true
    for (let dy = -1; dy <= TOWER_SIZE && valid; dy++) for (let dx = -1; dx <= TOWER_SIZE; dx++) {
      if (!natural.has(map[y+dy][x+dx]) || protectedCells.has(keyXY(x+dx,y+dy))) {valid=false;break}
    }
    if (valid && before.has(keyXY(x+5,y+11))) candidates.push({x,y})
  }
  if (!candidates.length) return false
  tower = {...pick(candidates), size:TOWER_SIZE, floors:5}
  tower.entrance = {x:tower.x+5,y:tower.y+10}
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
      terrain[tower.y+gap][tower.x+5]='dwarvendoorclosed'
      // Seal the partition junction: a missing diagonal corner permits
      // movement between chambers while both doors are still closed.
      terrain[tower.y+7][tower.x+5]='dwarvenwall'
      for (let dx=6;dx<10;dx++) terrain[tower.y+7][tower.x+dx]='dwarvenwall'
      terrain[tower.y+7][tower.x+8]='dwarvendoorclosed'
      const p=towerStair(z,true);terrain[p.y][p.x]='towerstairsup'
    }
    if(z>0) {
      const p=towerStair(z,false);terrain[p.y][p.x]='towerstairsdown'
      towerLevels.push({map:terrain,discovered:Array.from({length:MAP_H},()=>Array(MAP_W).fill(false))})
    } else terrain[tower.entrance.y][tower.entrance.x]='dwarvendoorclosed'
  }
  // All cells in the clear perimeter were walkable before stamping. A ring
  // gives every old ingress an egress, preserving exterior connectivity.
  map=surfaceMap
  return true
}

function populateTower() {
  const rosters=[['Giant Rat','Giant Bat'],['Goblin','Skeleton','Goblin'],
    ['Skeleton','Orc','Goblin','Orc'],['Orc','Ogre','Gargoyle','Orc'],['Gargoyle','Lich','Gargoyle']]
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
    for(const name of rosters[z]) {
      const p=take(),tmpl=ENEMY_TEMPLATE_BY_NAME[name]
      const e={...tmpl,baseName:tmpl.name,abilities:[...tmpl.abilities],...p,level:z,
        levelKind:z===0?'surface':'tower',caveIndex:-1,homeX:p.x,homeY:p.y,
        homeTileType:'marble',maxHp:tmpl.hp,alive:true,prefix:null,equipment:null}
      // Use the ordinary humanoid gear pipeline, without special tower stats.
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
  log(destination?`You climb to tower floor +${destination}.`:'You return to the tower entrance.','info')
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
