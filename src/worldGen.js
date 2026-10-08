/**
 * Whole logic in this file
 * should run ONLY ONCE
 * after new game is created
 */

'use strict'

/* ============================== MAP GENERATION ============================== */
function makeNoise(cellsX, cellsY) {
  const grid = []
  for (let y = 0; y <= cellsY; y++) {
    const row = []
    for (let x = 0; x <= cellsX; x++) row.push(rng())
    grid.push(row)
  }
  return function (x, y, w, h) {
    const fx = x / w * cellsX, fy = y / h * cellsY
    let x0 = Math.floor(fx), y0 = Math.floor(fy)
    x0 = Math.min(x0, cellsX - 1)
    y0 = Math.min(y0, cellsY - 1)
    const x1 = x0 + 1, y1 = y0 + 1
    const sx = fx - x0, sy = fy - y0
    const lerp = (a, b, t) => a + (b - a) * t
    const top = lerp(grid[y0][x0], grid[y0][x1], sx)
    const bot = lerp(grid[y1][x0], grid[y1][x1], sx)
    return lerp(top, bot, sy)
  }
}

function combineWeightedNoise(noiseFunctions, weights, x, y, width, height) {
  let weightedSum = 0
  let totalWeight = 0
  for (let i = 0; i < noiseFunctions.length; i++) {
    weightedSum += noiseFunctions[i](x, y, width, height) * weights[i]
    totalWeight += weights[i]
  }
  return weightedSum / totalWeight
}

let map = [] // map[y][x] = tile key string
let surfaceMap = null
// Transparent terrain props replace their map cell but render on top of its
// original floor. Surface keys remain x,y; underground keys include the depth
// so a prop at the same coordinates on another floor cannot borrow its ground.
let tileUnderlays = {}
function tileUnderlayKey(x, y, z = 0) {
  return z === 0 ? keyXY(x, y) : `${z}:${keyXY(x, y)}`
}
// Visual-only trees scattered through broad grassland.
let grasslandTrees = new Set()
let undergroundMap = null       // z:-1 shared map (storage)
let caveMaps = []               // z:-1 per-cave local template maps (storage)
let caves = []                  // z:-1 cave descriptors (storage)
let undergroundDiscoveredL1 = [] // z:-1 discovery grid (storage)
// Deeper levels in the generic cavedown/caveup chain, generalized so
// adding another level is just another entry here instead of a new set
// of hardcoded variables. deepLevels[i] = the level at chain-depth (i+2).
// z:-2 is a normal shared underground depth and may also be used by the
// crypt's dedicated second map. Map identity, not the z number, keeps those
// two maps separate. Each entry: {map, caveMaps, caves, discovered}.
let deepLevels = []
let dungeonShortcuts = [] // persistent shortcut registry shared by reusable dungeon packages

function dungeonShortcutsForPackage(packageId) {
  return (dungeonShortcuts || []).filter(shortcut => shortcut?.packageId === packageId)
}

function dungeonShortcutById(shortcutId) {
  return (dungeonShortcuts || []).find(shortcut => shortcut?.id === shortcutId) || null
}

function dwarvenRuinsLiftShortcut() {
  const shortcutId = dungeonPackageConfig('dwarvenRuins')?.shortcut?.id || 'dwarven-ruins-lift-1'
  return dungeonShortcutById(shortcutId)
}

function dungeonPackageLevels(packageId) {
  return deepLevels.map((level, index) => ({level, index, z: chainZForDepth(index + 2)}))
    .filter(entry => entry.level?.dungeonPackage === packageId)
}
let undergroundDiscovered = [] // ACTIVE underground discovery grid, swapped on every level transition
let currentZ = 0
let currentCave = -1

// The generic underground chain uses its actual depth as z:
// depth 1 = z:-1, depth 2 = z:-2, depth 3 = z:-3, and so on.
// The crypt's dedicated second map also uses z:-2, but map identity keeps it
// separate from the generic chain.
function chainZForDepth(depth) {
  return Number.isInteger(depth) && depth > 0 ? -depth : null
}
function chainDepthForZ(z) {
  return Number.isInteger(z) && z < 0 ? -z : null
}

// Reusable dungeon-package helpers. Content packages (Dwarven Ruins now, later
// Mines/Caverns/etc.) keep their own terrain/art while sharing identity, graph,
// progression and validation primitives.
function dungeonPackageConfig(packageId) {
  return WORLD_GEN_CONFIG.dungeons?.[packageId] || null
}

function dungeonStableFeatureId(namespace, level, kind, points) {
  const sorted = (points || []).map(p => ({x: p.x, y: p.y}))
    .sort((a, b) => a.y - b.y || a.x - b.x)
  return `${namespace}:${level}:${kind}:${sorted.map(p => `${p.x},${p.y}`).join('|')}`
}

function dungeonPackageLockId(packageId, level, kind, leaves) {
  const namespace = dungeonPackageConfig(packageId)?.lockNamespace || packageId
  return dungeonStableFeatureId(namespace, level, kind, leaves)
}

// Compatibility wrapper for Dwarven content; the namespace itself comes from
// package configuration so later strata can reuse the lock identity system.
function dwarvenDungeonLockId(level, kind, leaves) {
  return dungeonPackageLockId('dwarvenRuins', level, kind, leaves)
}

function dungeonProgressMultiplier(range, progress, fallback = 1) {
  if (!Array.isArray(range) || range.length < 2) return fallback
  const t = Math.max(0, Math.min(1, Number(progress) || 0))
  return Number(range[0]) + (Number(range[1]) - Number(range[0])) * t
}

function dungeonRoomGraphDegree(graph, roomIndex) {
  return (graph?.edges || []).reduce((count, edge) => count + Number(edge.a === roomIndex || edge.b === roomIndex), 0)
}
// depth means "chain position below the surface": 1 = z:-1, 2 = z:-2, etc.

/* Entrance flavor is loaded from content/dwarven_ruin_entrances.json. */
let villageHuts = []
let mausoleumMap = null
let mausoleumHutPos = null

function createMausoleum() {
  const w = 9, h = 9, m = Array.from({length: h}, () => Array(w).fill('crypt2floor'))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) m[y][x] = 'mountain'
  // The staircase stays close to the southern wall, as in the original layout.
  m[7][4] = 'mausoleumstairsup'
  m[4][4] = 'sarcophagus'
  return m
}

function initializeMausoleum() {
  const hut = villageHuts.find(h => h.mausoleum)
  if (!hut || !undergroundMap) return
  if (isMausoleumAdjacentToRandomCave()) return

  mausoleumMap = createMausoleum()
  mausoleumHutPos = {x: hut.x, y: hut.y}
  const originX = hut.x
  const originY = hut.y

  for (let y = 0; y < mausoleumMap.length; y++) {
    for (let x = 0; x < mausoleumMap[0].length; x++) {
      const worldX = originX + x - 4
      const worldY = originY + y - 7
      if (worldX < 0 || worldY < 0 || worldX >= MAP_W || worldY >= MAP_H) continue
      if (mausoleumMap[y][x] !== 'mountain') undergroundMap[worldY][worldX] = mausoleumMap[y][x]
    }
  }
  undergroundMap[originY][originX] = 'mausoleumstairsup'

  // Mausoleum loot is part of the generated world, not an entry-time event.
  groundItems = groundItems.filter(item => !item.mausoleumChest)
  const chestPositions = [[1, 1], [7, 1], [1, 7], [7, 7]]
  for (const [localX, localY] of chestPositions) {
    groundItems.push({
      x: originX + localX - 4,
      y: originY + localY - 7,
      kind: 'chest',
      tier: 5,
      opened: false,
      level: -1,
      mausoleumChest: true
    })
  }
}

let spawnPoint = {x: 0, y: 0}
let discovered = [] // discovered[y][x] = has the player ever seen this tile on the main screen
let minimapDirty = true
let miniPlayerX = -1, miniPlayerY = -1

function initDiscovered() {
  discovered = []
  for (let y = 0; y < MAP_H; y++) discovered.push(new Array(MAP_W).fill(false))
}

function generateSurface() {
  const cfg = WORLD_GEN_CONFIG.surface
  shuffleTombstoneOrder()
  mausoleumMap = null
  mausoleumHutPos = null
  tileUnderlays = {}
  grasslandTrees = new Set()
  map.length = 0 // a retried world must not append onto the discarded one
  // A rejected cave/fort layout may already have spawned story loot and ghosts.
  enemies = []
  groundItems = []
  caveDecorations = []
  occupied = new Set()
  const elevationNoiseFunctions = cfg.elevationNoise.layers.map(([x, y]) => makeNoise(x, y))
  const elevationNoiseWeights = cfg.elevationNoise.weights
  const moistureNoiseFunctions = cfg.moistureNoise.layers.map(([x, y]) => makeNoise(x, y))
  const moistureNoiseWeights = cfg.moistureNoise.weights
  const roughnessNoiseFunction = makeNoise(...cfg.elevationNoise.roughnessCells)
  const moistureDetailNoiseFunction = makeNoise(...cfg.moistureNoise.detailCells)
  const lakeNoiseFunction = makeNoise(...cfg.lakes.noiseCells)
  const boulderNoiseFunction = makeNoise(...cfg.boulders.noiseCells)

  const elev = [], moist = []
  for (let y = 0; y < MAP_H; y++) {
    elev.push(new Float32Array(MAP_W))
    moist.push(new Float32Array(MAP_W))
  }
  const cx = MAP_W / 2, cy = MAP_H / 2
  const maxD = Math.sqrt(cx * cx + cy * cy)
  const northernFalloffDepth = MAP_H * cfg.islandFalloff.northernDepthFraction
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      let e = combineWeightedNoise(elevationNoiseFunctions, elevationNoiseWeights, x, y, MAP_W, MAP_H)
      e += (roughnessNoiseFunction(x, y, MAP_W, MAP_H) - 0.5) * cfg.elevationNoise.roughnessAmplitude
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD
      e -= Math.pow(d, cfg.islandFalloff.distancePower) * cfg.islandFalloff.strength * Math.min(1, y / northernFalloffDepth) // island falloff fades out at the northern edge
      const lk = lakeNoiseFunction(x, y, MAP_W, MAP_H)
      if (lk > cfg.lakes.noiseThreshold && e > cfg.lakes.minElevation && e < cfg.lakes.maxElevation) e -= cfg.lakes.carveAmount // carve inland lakes
      if (y < cfg.northBoundary.rows) e = Math.max(e, cfg.northBoundary.minElevation) // keep the cold northern boundary on land
      elev[y][x] = e
      moist[y][x] = combineWeightedNoise(moistureNoiseFunctions, moistureNoiseWeights, x, y, MAP_W, MAP_H) + (moistureDetailNoiseFunction(x, y, MAP_W, MAP_H) - 0.5) * cfg.moistureNoise.detailAmplitude
    }
  }

  for (let y = 0; y < MAP_H; y++) {
    const row = []
    for (let x = 0; x < MAP_W; x++) {
      const e = elev[y][x], m = moist[y][x]
      let t
      if (e < cfg.terrainThresholds.waterMaxElevation) t = 'water'
      else if (e < cfg.terrainThresholds.sandMaxElevation) t = 'sand'
      else if (e < cfg.terrainThresholds.lowlandMaxElevation) {
        if (m > cfg.terrainThresholds.forestMinMoisture) t = 'forest'
        else t = 'grass'
      } else if (e < cfg.terrainThresholds.hillMaxElevation) t = 'hill'
      else if (e < cfg.terrainThresholds.mountainMaxElevation) t = 'mountain'
      else t = (m > cfg.terrainThresholds.highElevationSnowMinMoisture) ? 'snow' : 'mountain'
      row.push(t)
    }
    map.push(row)
  }

  // Arctic north: freeze the top of the world into a ragged snow band. Snow used to
  // require elevation > 0.86 AND moisture > 0.5, which the island falloff made
  // almost unreachable, so the biome effectively never generated.
  const SNOW_BAND = Math.round(MAP_H * cfg.snow.bandFraction)
  const snowEdgeFn = makeNoise(...cfg.snow.edgeNoiseCells)
  for (let y = 0; y < SNOW_BAND; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = map[y][x]
      if (t !== 'grass' && t !== 'forest' && t !== 'hill' && t !== 'sand') continue
      const coldness = (SNOW_BAND - y) / SNOW_BAND + (snowEdgeFn(x, y, MAP_W, MAP_H) - 0.5) * cfg.snow.edgeNoiseAmplitude
      if (coldness > cfg.snow.coldnessThreshold) map[y][x] = 'snow'
    }
  }
  // Snowy north: exposed mountains get a snow cap, with a few more peaks
  // breaking through the tundra. Ordinary forest does NOT grow inside the
  // snow biome; taiga is the only normal tree cover there.
  for (let y = 0; y < SNOW_BAND; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (map[y][x] === 'mountain' && chance(cfg.snow.mountainSnowChance)) map[y][x] = 'snowmountain'
    }
  }

  for (let y = 0; y < SNOW_BAND; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (map[y][x] === 'snow' && chance(cfg.snow.extraPeakChance)) map[y][x] = 'snowmountain'
    }
  }
  // Dense taiga in the northern snow biome: trees grow in broad, irregular
  // stands rather than as isolated specks. They still grow directly out of
  // the snow so the snow underlay remains visible through their transparent glyph.
  // First seed the biome fairly generously, then let the seeds spread into
  // neighboring snow to form natural-looking wooded patches.
  const taigaSeeds = []
  for (let y = 0; y < SNOW_BAND; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (map[y][x] === 'snow' && chance(cfg.taiga.seedChance)) taigaSeeds.push({x, y})
    }
  }
  for (const seed of taigaSeeds) {
    if (map[seed.y][seed.x] !== 'snow') continue
    tileUnderlays[keyXY(seed.x, seed.y)] = 'snow'
    map[seed.y][seed.x] = 'taiga'
  }
  // Several growth passes make taiga noticeably denser, while retaining
  // holes and ragged edges instead of turning the whole snow band into forest.
  for (let pass = 0; pass < cfg.taiga.growthPasses; pass++) {
    const additions = []
    for (let y = 0; y < SNOW_BAND; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (map[y][x] !== 'snow') continue
        let nearbyTaiga = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= SNOW_BAND) continue
          if (map[ny][nx] === 'taiga') nearbyTaiga++
        }
        const growChance = nearbyTaiga >= 3 ? cfg.taiga.growthChanceThreePlusNeighbors : nearbyTaiga >= 1 ? cfg.taiga.growthChanceOnePlusNeighbors : cfg.taiga.growthChanceNoNeighbors
        if (chance(growChance)) additions.push({x, y})
      }
    }
    for (const tile of additions) {
      if (map[tile.y][tile.x] !== 'snow') continue
      tileUnderlays[keyXY(tile.x, tile.y)] = 'snow'
      map[tile.y][tile.x] = 'taiga'
    }
  }

  // Scattered boulders: sprinkle extra impassable terrain across walkable lowlands
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = map[y][x]
      if (t === 'grass' || t === 'forest' || t === 'hill' || t === 'sand') {
        const b = boulderNoiseFunction(x, y, MAP_W, MAP_H)
        if (b > cfg.boulders.noiseThreshold) map[y][x] = 'boulder'
      }
    }
  }

  // Lone trees in broad grassland: scattered visual features with enough
  // density to make large open fields feel naturally wooded.
  const treeEdge = cfg.grasslandTrees.edgeMargin
  const treeRadius = cfg.grasslandTrees.densityRadius
  for (let y = treeEdge; y < MAP_H - treeEdge; y++) for (let x = treeEdge; x < MAP_W - treeEdge; x++) {
    if (map[y][x] !== 'grass' || chance(cfg.grasslandTrees.candidateSkipChance)) continue
    let grassCount = 0
    for (let dy = -treeRadius; dy <= treeRadius; dy++) for (let dx = -treeRadius; dx <= treeRadius; dx++)
      if (map[y + dy][x + dx] === 'grass') grassCount++
    if (grassCount < cfg.grasslandTrees.minGrassTiles) continue
    let tooClose = false
    for (const key of grasslandTrees) {
      const [tx, ty] = key.split(',').map(Number)
      if (Math.max(Math.abs(tx - x), Math.abs(ty - y)) < cfg.grasslandTrees.minSpacing) {
        tooClose = true
        break
      }
    }
    if (!tooClose) grasslandTrees.add(keyXY(x, y))
  }

  // Rivers: from random high points, descend toward water
  // Rivers begin in the highlands. Pick actual mountain cells so every
  // headwater visibly emerges from a mountain range.
  const mountainSources = []
  const riverEdge = cfg.rivers.sourceEdgeMargin
  for (let y = riverEdge; y < MAP_H - riverEdge; y++) for (let x = riverEdge; x < MAP_W - riverEdge; x++) {
    if (map[y][x] === 'mountain' || map[y][x] === 'snowmountain') mountainSources.push({x, y})
  }
  const riverSources = []
  for (let i = 0; i < Math.min(cfg.rivers.maxSources, mountainSources.length); i++) {
    const idx = randInt(0, mountainSources.length - 1)
    riverSources.push(mountainSources.splice(idx, 1)[0])
  }
  for (const src of riverSources) {
    let x = src.x, y = src.y
    let previousX = -1, previousY = -1
    if (elev[y][x] < cfg.rivers.minSourceElevation) continue
    for (let step = 0; step < cfg.rivers.maxSteps; step++) {
      if (map[y][x] === 'water') break
      // Keep channels one tile wide. A river may continue through its
      // own previous tile, but must not merge with or run alongside an
      // already-carved channel.
      let besideRiver = false
      for (let dy = -1; dy <= 1 && !besideRiver; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx, ny = y + dy
        if (nx === previousX && ny === previousY) continue
        if (map[ny] && map[ny][nx] === 'river') {
          besideRiver = true
          break
        }
      }
      if (besideRiver) break
      if (map[y][x] !== 'mountain' && map[y][x] !== 'snowmountain' && map[y][x] !== 'cavewall') map[y][x] = (y < SNOW_BAND ? 'frozenriver' : 'river')
      if (y < SNOW_BAND) tileUnderlays[keyXY(x, y)] = 'snow'
      // find lowest neighbor
      let bestX = x, bestY = y, bestE = elev[y][x]
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue
        if (elev[ny][nx] < bestE) {
          bestE = elev[ny][nx]
          bestX = nx
          bestY = ny
        }
      }
      if (bestX === x && bestY === y) break
      previousX = x
      previousY = y
      x = bestX
      y = bestY
    }
  }

  // Guarantee at least one frozen river in the northern snow region.
  // Natural river generation can produce no northern channel in some worlds;
  // carve a short, walkable frozen channel rather than silently omitting it.
  let frozenRiverCount = 0
  for (let yy = 0; yy < SNOW_BAND; yy++) for (let xx = 0; xx < MAP_W; xx++)
    if (map[yy][xx] === 'frozenriver') frozenRiverCount++
  if (cfg.rivers.guaranteeFrozenRiver && frozenRiverCount === 0) {
    const margin = cfg.rivers.frozenFallbackXMargin
    const fx = Math.max(3, Math.min(MAP_W - 4, randInt(margin, MAP_W - margin - 1)))
    const fy = Math.max(3, Math.floor(SNOW_BAND * cfg.rivers.frozenFallbackYFraction))
    const length = Math.max(cfg.rivers.frozenFallbackMinLength, Math.min(cfg.rivers.frozenFallbackMaxLength, SNOW_BAND - fy - 2))
    for (let i = 0; i < length; i++) {
      const yy = fy + i
      if (yy >= SNOW_BAND || yy >= MAP_H - 2) break
      if (map[yy][fx] === 'mountain' || map[yy][fx] === 'snowmountain' || map[yy][fx] === 'water') continue
      map[yy][fx] = 'frozenriver'
      tileUnderlays[keyXY(fx, yy)] = 'snow'
    }
  }

  // NOTE: cave generation ('cavefloor'/'cavewall') used to live here, but those
  // tile keys have no entry in TILE{} (they're commented out above) - any cave
  // tile that scrolled into view would crash render(). Removed until caves are
  // actually supported again.

  // Spawn point: near center, on grass/hill
  let sx = Math.floor(MAP_W / 2), sy = Math.floor(MAP_H / 2)
  let found = false
  for (let r = 0; r < cfg.spawn.searchRadius && !found; r++) {
    for (let dy = -r; dy <= r && !found; dy++) {
      for (let dx = -r; dx <= r && !found; dx++) {
        const nx = sx + dx, ny = sy + dy
        if (nx < cfg.spawn.edgeMargin || ny < cfg.spawn.edgeMargin || nx >= MAP_W - cfg.spawn.edgeMargin || ny >= MAP_H - cfg.spawn.edgeMargin) continue
        if (map[ny][nx] === 'grass' || map[ny][nx] === 'hill') {
          sx = nx
          sy = ny
          found = true
        }
      }
    }
  }
  spawnPoint = {x: sx, y: sy}
  // The Temple is a small walled complex, not a single tile: stamp a
  // random 2x2 / 3x2 / 2x3 footprint of temple ground anchored at the
  // spawn point (skipping any tile that would land on water/mountain,
  // which stay impassable).
  const templeShapes = cfg.temple.shapes
  const [tw, th] = pick(templeShapes)
  const templeTiles = []
  for (let dy = 0; dy < th; dy++) {
    for (let dx = 0; dx < tw; dx++) {
      const tx = sx + dx, ty = sy + dy
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue
      if (map[ty][tx] === 'water' || map[ty][tx] === 'mountain' || map[ty][tx] === 'snowmountain') continue
      map[ty][tx] = 'temple'
      templeTiles.push({x: tx, y: ty})
    }
  }

  // The temple complex includes a bell tower - tucked into a corner of the
  // footprint, away from the player's own start tile - whose bell has gone
  // missing (a small dangling hook for later lore).
  let bellSpots = templeTiles.filter(t => !(t.x === sx && t.y === sy))
  if (!bellSpots.length) {
    // The chosen footprint was hemmed in by water/mountain and only the
    // spawn tile itself qualified as temple ground - find the nearest
    // other non-water/mountain tile next to the spawn point and fold it
    // into the temple complex so the bell tower always has somewhere to go.
    outer:
      for (let r = 1; r <= cfg.temple.bellTowerFallbackRadius; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
            const tx = sx + dx, ty = sy + dy
            if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue
            if (tx === sx && ty === sy) continue
            if (map[ty][tx] === 'water' || map[ty][tx] === 'mountain' || map[ty][tx] === 'snowmountain') continue
            map[ty][tx] = 'temple'
            const spot = {x: tx, y: ty}
            templeTiles.push(spot)
            bellSpots = [spot]
            break outer
          }
        }
      }
  }
  if (bellSpots.length) {
    const spot = pick(bellSpots)
    map[spot.y][spot.x] = 'belltower'
  }

  // Lore landmark: a single black stone pillar tucked into the mountains
  // near the start. It sits close to the mountain's edge (not deep inside),
  // reachable within about one screen of walking from the temple.
  placeBlackPillar()

  // A small village of huts, somewhere out in the walkable countryside -
  // not right on top of the temple, but not absurdly far either.
  placeVillage()

  // Dense ancient woodland is deliberately placed well beyond the village,
  // and only on a broad, already-forested patch of terrain.
  placeAncientForest()
  // The cemetery generates the anomalous dwarven name first; only then are
  // hut names assigned so exactly one hut inherits that name.
  placeCemetery()
  assignVillageHutNames()
  syncMausoleumHutToOddTombstone()

  // Lore landmark: a huge brass bell in/next to the mountains, kept
  // fairly close to the temple (map center), guarded by a pair of brutes.
  placeBigBell()

  // Every world has one volcano, with a chance of a second. Each one is a
  // broad volcanic formation rather than a single recoloured mountain tile.
  placeVolcanoes()
}

function placeVolcanoes() {
  const cfg = WORLD_GEN_CONFIG.surface.volcanoes
  const candidates = []
  for (let y = cfg.candidateEdgeMargin; y < MAP_H - cfg.candidateEdgeMargin; y++) for (let x = cfg.candidateEdgeMargin; x < MAP_W - cfg.candidateEdgeMargin; x++) {
    if (map[y][x] !== 'mountain' && map[y][x] !== 'snowmountain') continue
    if (Math.max(Math.abs(x - spawnPoint.x), Math.abs(y - spawnPoint.y)) < cfg.minTempleDistance) continue
    candidates.push({x, y})
  }
  if (!candidates.length) return // practically impossible on the island generator
  const count = chance(cfg.secondVolcanoChance) ? 2 : 1
  const chosen = []
  while (chosen.length < count && candidates.length) {
    const spot = candidates.splice(randInt(0, candidates.length - 1), 1)[0]
    if (chosen.every(other => Math.max(Math.abs(spot.x - other.x), Math.abs(spot.y - other.y)) >= cfg.minSeparation)) {
      chosen.push(spot)
      map[spot.y][spot.x] = 'volcano'
      for (let dy = -cfg.lavaScanRadius; dy <= cfg.lavaScanRadius; dy++) for (let dx = -cfg.lavaScanRadius; dx <= cfg.lavaScanRadius; dx++) {
        if (dx === 0 && dy === 0 || Math.max(Math.abs(dx), Math.abs(dy)) > cfg.lavaRadius) continue
        const x = spot.x + dx, y = spot.y + dy
        if (map[y] && (map[y][x] === 'mountain' || map[y][x] === 'snowmountain')) map[y][x] = 'lava'
      }
    }
  }
}

// A temple walled in by mountains with no route to any map edge is a dead
// world - the player could never reach the edges or most of the content. We
// don't repair such a map, we throw it away and roll a fresh one.
// Turn an accepted, fully populated world clockwise. No rule/animation RNG is
// consumed while moving generated data; a single seeded roll selects 0/1/2/3.
// Coordinates on every underground map share surface world space.
function rotateGeneratedWorld(quarterTurns) {
  const turns = ((quarterTurns % 4) + 4) % 4
  if (!turns) return
  const width = MAP_W, height = MAP_H
  const point = (x, y) => {
    if (turns === 1) return {x: height - 1 - y, y: x}
    if (turns === 2) return {x: width - 1 - x, y: height - 1 - y}
    return {x: y, y: width - 1 - x}
  }
  const vector = (x, y) => turns === 1 ? {x: -y, y: x} :
    turns === 2 ? {x: -x, y: -y} : {x: y, y: -x}
  const rotatedWidth = turns % 2 ? height : width
  const rotatedHeight = turns % 2 ? width : height
  const visitedGrids = new WeakMap()
  const grid = original => {
    if (!Array.isArray(original) || !original.length || !Array.isArray(original[0])) return original
    if (visitedGrids.has(original)) return visitedGrids.get(original)
    const result = Array.from({length:rotatedHeight}, () => new Array(rotatedWidth))
    visitedGrids.set(original, result)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const to = point(x,y)
      result[to.y][to.x] = original[y][x]
    }
    return result
  }
  // The dungeon key is a deterministic coordinate-derived identifier. Rewrite
  // the leaves as well as the tile positions, so matching keys still unlock.
  const rotatedLockId = id => {
    if (typeof id !== 'string') return id
    const match = id.match(/^(.+?:-\d+:(?:gate|door):)(\d+,\d+(?:\|\d+,\d+)*)$/)
    if (!match) return id
    const leaves = match[2].split('|').map(pair => {
      const [x,y] = pair.split(',').map(Number)
      return point(x,y)
    }).sort((a,b) => a.y - b.y || a.x - b.x)
    return match[1] + leaves.map(p => `${p.x},${p.y}`).join('|')
  }
  const seen = new WeakSet()
  const positions = (value) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      value.forEach(positions)
      return
    }
    // Swap room bounding boxes using their four corners. A 90-degree turn
    // changes width and height, including for non-square map configurations.
    if (Number.isInteger(value.x1) && Number.isInteger(value.y1) &&
        Number.isInteger(value.x2) && Number.isInteger(value.y2)) {
      const corners = [point(value.x1,value.y1), point(value.x2,value.y2),
        point(value.x1,value.y2), point(value.x2,value.y1)]
      value.x1 = Math.min(...corners.map(p => p.x))
      value.x2 = Math.max(...corners.map(p => p.x))
      value.y1 = Math.min(...corners.map(p => p.y))
      value.y2 = Math.max(...corners.map(p => p.y))
    }
    if (Number.isInteger(value.w) && Number.isInteger(value.h) &&
        Number.isInteger(value.x) && Number.isInteger(value.y)) {
      // Room x/y identifies the top-left of a rectangular footprint.
      const corners = [point(value.x,value.y), point(value.x+value.w-1,value.y),
        point(value.x,value.y+value.h-1), point(value.x+value.w-1,value.y+value.h-1)]
      value.x = Math.min(...corners.map(p => p.x))
      value.y = Math.min(...corners.map(p => p.y))
      if (turns % 2) [value.w,value.h] = [value.h,value.w]
    } else if (Number.isInteger(value.x) && Number.isInteger(value.y)) {
      const p = point(value.x,value.y)
      value.x = p.x; value.y = p.y
    }
    for (const [xx,yy] of [['cx','cy'],['homeX','homeY'],['farTargetX','farTargetY'],
      ['forestConcealX','forestConcealY'],['farPrevX','farPrevY'],
      ['lastSeenX','lastSeenY']]) {
      if (!Number.isInteger(value[xx]) || !Number.isInteger(value[yy])) continue
      const p = point(value[xx],value[yy]); value[xx] = p.x; value[yy] = p.y
    }
    if (Number.isInteger(value.dx) && Number.isInteger(value.dy)) {
      const v = vector(value.dx,value.dy); value.dx = v.x; value.dy = v.y
    }
    if (typeof value.keyId === 'string') value.keyId = rotatedLockId(value.keyId)
    if (typeof value.requiresLockId === 'string') value.requiresLockId = rotatedLockId(value.requiresLockId)
    if (typeof value.rotation === 'number' && value.kind === 'web') value.rotation = (value.rotation + turns) % 4
    for (const [name, child] of Object.entries(value)) {
      if (name === 'map' || name === 'caveMaps' || name === 'discovered') continue
      if (name === 'keyId') continue
      positions(child)
    }
  }
  const coordsFromKey = key => {
    const match = key.match(/^(?:(-\d+):)?(\d+),(\d+)$/)
    if (!match) return key
    const p = point(Number(match[2]), Number(match[3]))
    return (match[1] ? match[1] + ':' : '') + keyXY(p.x,p.y)
  }
  const rekeySet = input => new Set([...input].map(coordsFromKey))
  const rekeyObject = obj => Object.fromEntries(Object.entries(obj).map(([key,val]) => [coordsFromKey(key),val]))

  map = grid(map)
  surfaceMap = map
  undergroundMap = grid(undergroundMap)
  caveMaps = caveMaps.map(grid)
  undergroundDiscoveredL1 = grid(undergroundDiscoveredL1)
  discovered = grid(discovered)
  for (const level of deepLevels) {
    level.map = grid(level.map)
    level.caveMaps = (level.caveMaps || []).map(grid)
    level.discovered = grid(level.discovered)
  }
  if (cryptLevel2) {
    cryptLevel2.map = grid(cryptLevel2.map)
    cryptLevel2.discovered = grid(cryptLevel2.discovered)
    positions(cryptLevel2)
  }
  // The local mausoleum template is not a full-world grid. Its playable cells
  // already belong to the rotated z:-1 map; keep the template as a local sketch.
  positions(caves); positions(deepLevels); positions(dungeonShortcuts)
  positions(villageHuts); positions(enemies); positions(groundItems)
  positions(npcs); positions(caveDecorations)
  for (const value of [spawnPoint, villageCenter, mausoleumHutPos,
    dwarvenRuin, bigBellPos, blackPillarPos, cryptCaveExclusionCenter,
    treasureMapSpot, fishermanHut, fishermanQuest, oldHunterQuest]) positions(value)
  grasslandTrees = rekeySet(grasslandTrees)
  tileUnderlays = rekeyObject(tileUnderlays)
  cemeteryTombstones = rekeyObject(cemeteryTombstones)
  if (gravediggerGraveKey) gravediggerGraveKey = coordsFromKey(gravediggerGraveKey)
  foragedTiles = rekeySet(foragedTiles)
  dugSandTiles = rekeySet(dugSandTiles)
  occupied = rekeySet(occupied)
  MAP_W = rotatedWidth; MAP_H = rotatedHeight
  // Discovery and render caches point to the new grids from now on.
  undergroundDiscovered = undergroundDiscoveredL1
  minimapDirty = true
}

function generateMap() {
  const worldAttempts = MAX_WORLD_ATTEMPTS
  for (let attempt = 1; attempt <= worldAttempts; attempt++) {
    generateSurface()
    if (!isTempleConnectedToEdge()) {
      if (attempt === worldAttempts) {
        console.warn(`World generation failed to connect the Temple to a map edge in ${MAX_WORLD_ATTEMPTS} attempts; keeping the last world.`)
        surfaceMap = map.map(row => row.slice())
        if (!generateCaves() || deepLevels[0]?.caves?.length < WORLD_GEN_CONFIG.caves.deep.minimumCaves)
          throw new Error('Could not generate two distinct second-level caves.')
        // Cave generation stamps entrances onto `map`; keep the canonical
        // surface copy in sync even when this is the final fallback world.
        surfaceMap = map.map(row => row.slice())
        break
      }
      console.warn(`Discarding world ${attempt}: the Temple has no walkable route to a map edge. Generating a new world.`)
      continue
    }
    surfaceMap = map.map(row => row.slice())
    const cavesValid = generateCaves()
    // `surfaceMap` was snapshotted before cave generation, but the
    // entrance tiles are stamped during generateCaves(). Without this
    // refresh the minimap can show descriptor-based entrance markers
    // while the game canvas still renders the original mountain tile.
    surfaceMap = map.map(row => row.slice())
    if (cavesValid) {
      break
    }
    if (attempt === worldAttempts) {
      throw new Error(`World generation failed cave/fort clearance validation in ${worldAttempts} attempts.`)
    }
    console.warn(`Discarding world ${attempt}: invalid cave placement near the village/mausoleum or crypt. Generating a new world.`)
  }
  placeTreasureMapSpot()
}

// Picks the sand tile the treasure map's X marks. Chosen once per world so
// the map item is a genuine, resolvable clue rather than decoration.
function placeTreasureMapSpot() {
  treasureMapSpot = null
  const sandTiles = []
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (surfaceMap[y][x] === 'sand') sandTiles.push({
    x,
    y
  })
  if (sandTiles.length) treasureMapSpot = pick(sandTiles)
}

function surfaceReachableFromTemple() {
  const dirs8 = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]]
  const queue = [{x: spawnPoint.x, y: spawnPoint.y}]
  const seen = new Set([keyXY(spawnPoint.x, spawnPoint.y)])
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]
    for (const [dx, dy] of dirs8) {
      const x = p.x + dx, y = p.y + dy
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue
      const key = keyXY(x, y)
      if (seen.has(key) || !TILE[map[y][x]]?.walk) continue
      seen.add(key)
      queue.push({x, y})
    }
  }
  return seen
}

function isSurfacePointReachableFromTemple(x, y) {
  return surfaceReachableFromTemple().has(keyXY(x, y))
}

function isTempleConnectedToEdge() {
  const seen = surfaceReachableFromTemple()
  for (const key of seen) {
    const [x, y] = key.split(',').map(Number)
    if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) return true
  }
  return false
}

function blankCaveMap() {
  return Array.from({length: MAP_H}, () => new Array(MAP_W).fill('cavewall'))
}

// Random z:-1 caves must not be generated against the crypt footprint.
// buildCrypt() occupies roughly x +/-3 and y +/-12 around the ruined chapel;
// this clearance also covers the maximum +/-8 tile random-walk radius, so a
// generated cave blob cannot touch the crypt even if its primary spot is
// outside the exclusion area. Larger chambers may extend farther, so each
// generated map is checked before acceptance. The final connectivity check remains as a
// defensive fallback for any future geometry changes.
let cryptCaveExclusionCenter = null

function isInsideCryptCaveExclusion(x, y) {
  const c = cryptCaveExclusionCenter
  if (!c) return false
  return Math.max(Math.abs(x - c.x) - 3, Math.abs(y - c.y) - 12) <= WORLD_GEN_CONFIG.caves.cryptClearance
}

function isCaveMapTouchingCryptExclusion(cm) {
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (cm[y][x] !== 'cavewall' && isInsideCryptCaveExclusion(x, y)) return true
  }
  return false
}

function isSegmentTouchingCryptExclusion(a, b) {
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0
    const x = Math.round(a.x + (b.x - a.x) * t)
    const y = Math.round(a.y + (b.y - a.y) * t)
    if (isInsideCryptCaveExclusion(x, y)) return true
  }
  return false
}

// A compact winding cave or a broader chamber cave. Bounds and steps vary per
// entrance; the latter uses several connected irregular rooms.
function carveShallowCave(cm, spot, style) {
  const cfg = WORLD_GEN_CONFIG.caves.shallow
  const radiusRange = style === 'chambers' ? cfg.chamberRadiusRange : cfg.walkRadiusRange
  const radius = randInt(radiusRange[0], radiusRange[1])
  const minX = Math.max(2, spot.x - radius), maxX = Math.min(MAP_W - 3, spot.x + radius)
  const minY = Math.max(2, spot.y - radius), maxY = Math.min(MAP_H - 3, spot.y + radius)
  if (style === 'walk') {
    let x = spot.x, y = spot.y
    const steps = randInt(cfg.walkStepsRange[0], cfg.walkStepsRange[1])
    for (let step = 0; step < steps; step++) {
      cm[y][x] = 'cavefloor'
      // Cardinal moves keep the dug path connected, including narrow caves.
      const [dx, dy] = pick([[0, -1], [0, 1], [-1, 0], [1, 0]])
      x = Math.max(minX, Math.min(maxX, x + dx))
      y = Math.max(minY, Math.min(maxY, y + dy))
    }
    return
  }
  const rooms = [{x: spot.x, y: spot.y}]
  const count = randInt(cfg.chamberCountRange[0], cfg.chamberCountRange[1])
  for (let i = 1; i < count; i++) rooms.push({
    x: randInt(minX + 2, maxX - 2), y: randInt(minY + 2, maxY - 2)})
  for (const room of rooms) {
    const rx = randInt(cfg.chamberRadiusXRange[0], cfg.chamberRadiusXRange[1]), ry = randInt(cfg.chamberRadiusYRange[0], cfg.chamberRadiusYRange[1])
    for (let y = Math.max(minY, room.y - ry); y <= Math.min(maxY, room.y + ry); y++)
      for (let x = Math.max(minX, room.x - rx); x <= Math.min(maxX, room.x + rx); x++)
        if (((x - room.x) / rx) ** 2 + ((y - room.y) / ry) ** 2 <= cfg.chamberFillThreshold && chance(cfg.chamberFillChance))
          cm[y][x] = 'cavefloor'
    cm[room.y][room.x] = 'cavefloor'
  }
  for (let i = 1; i < rooms.length; i++) {
    let x = rooms[i - 1].x, y = rooms[i - 1].y
    while (x !== rooms[i].x || y !== rooms[i].y) {
      cm[y][x] = 'cavefloor'
      if (x !== rooms[i].x && (y === rooms[i].y || chance(cfg.corridorHorizontalBias))) x += Math.sign(rooms[i].x - x)
      else y += Math.sign(rooms[i].y - y)
    }
    cm[y][x] = 'cavefloor'
  }
}

function generateCaves() {
  dungeonShortcuts = []
  const cfg = WORLD_GEN_CONFIG.caves.shallow
  cryptCaveExclusionCenter = null
  for (let y = 1; y < MAP_H - 1 && !cryptCaveExclusionCenter; y++) for (let x = 1; x < MAP_W - 1; x++) {
    if (surfaceMap?.[y]?.[x] === 'ruinedchapel') {
      cryptCaveExclusionCenter = {x, y}
      break
    }
  }
  caves = []
  caveMaps = []
  undergroundMap = blankCaveMap()
  const candidates = []
  for (let y = 2; y < MAP_H - 2; y++) for (let x = 2; x < MAP_W - 2; x++) {
    if (map[y][x] !== 'mountain' && map[y][x] !== 'snowmountain') continue
    const edge = DIRS8.some(([dx, dy]) => {
      const t = map[y + dy] && map[y + dy][x + dx]
      return t && TILE[t] && TILE[t].walk
    })
    if (edge && !isInsideCryptCaveExclusion(x, y)) candidates.push({x, y})
  }
  for (let i = 0; i < cfg.attemptedCaves; i++) {
    let spot = null
    for (let tries = 0; tries < cfg.placementTries && !spot; tries++) {
      const c = pick(candidates)
      if (c && caves.every(v => Math.max(Math.abs(v.x - c.x), Math.abs(v.y - c.y)) > cfg.minPrimarySeparation)) spot = c
    }
    if (!spot) continue
    const entrances = [spot]
    if (i === 0 || (cfg.extraEntranceChance > 0 && chance(cfg.extraEntranceChance))) {
      const second = candidates.find(c => c !== spot &&
          Math.max(Math.abs(c.x - spot.x), Math.abs(c.y - spot.y)) >= cfg.secondEntranceMinDistance &&
          Math.max(Math.abs(c.x - spot.x), Math.abs(c.y - spot.y)) <= cfg.secondEntranceMaxDistance &&
          !isSegmentTouchingCryptExclusion(spot, c))
        || candidates.find(c => c !== spot && !isSegmentTouchingCryptExclusion(spot, c))
      if (second) entrances.push(second)
    }
    const style = chance(cfg.walkStyleChance) ? 'walk' : 'chambers'
    const cave = {x: spot.x, y: spot.y, style,
      entrances: entrances.map(p => ({x: p.x, y: p.y}))}
    const cm = blankCaveMap()
    carveShallowCave(cm, spot, style)
    for (const entrance of entrances) {
      for (let yy = entrance.y - cfg.entranceCarveDepth; yy <= entrance.y; yy++) for (let xx = entrance.x - cfg.entranceCarveWidth; xx <= entrance.x + cfg.entranceCarveWidth; xx++) {
        if (xx >= 0 && yy >= 0 && xx < MAP_W && yy < MAP_H) cm[yy][xx] = 'cavefloor'
      }
      cm[entrance.y][entrance.x] = 'caveentrance'
    }
    if (entrances.length > 1) {
      let cx = entrances[0].x, cy = entrances[0].y
      while (cx !== entrances[1].x || cy !== entrances[1].y) {
        cm[cy][cx] = 'cavefloor'
        cx += Math.sign(entrances[1].x - cx)
        cy += Math.sign(entrances[1].y - cy)
      }
      cm[entrances[1].y][entrances[1].x] = 'caveentrance'
    }
    for (const entrance of entrances) cm[entrance.y][entrance.x] = 'caveentrance'
    if (isCaveMapTouchingCryptExclusion(cm)) continue
    for (const entrance of entrances) map[entrance.y][entrance.x] = 'caveentrance'
    caveMaps.push(cm)
    caves.push(cave)
    for (const entrance of entrances) candidates.splice(candidates.indexOf(entrance), 1)
  }
  for (const cm of caveMaps) {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (cm[y][x] !== 'cavewall') undergroundMap[y][x] = cm[y][x]
    }
  }
  undergroundDiscoveredL1 = Array.from({length: MAP_H}, () => new Array(MAP_W).fill(false))
  // Two caves' floor blobs can overlap in world space (they're only kept
  // >10 tiles apart at their primary spot, not along their whole random
  // walk), so the merge above can let one cave's plain floor tile paint
  // over a neighboring cave's entrance tile. Re-stamp every entrance last
  // so you always land on (and can always leave from) the exact tile you
  // came in through.
  for (const cave of caves) {
    for (const entrance of cave.entrances) {
      if (undergroundMap[entrance.y] && undergroundMap[entrance.y][entrance.x] !== undefined) {
        undergroundMap[entrance.y][entrance.x] = 'caveentrance'
      }
    }
  }
  if (isMausoleumAdjacentToRandomCave()) return false
  buildCrypt()
  buildCryptLevel2()
  const cryptInvalid = isCryptConnectedToRandomCave()
  // Try independent placement orders before rejecting the whole world.
  // Work on copies so a failed trial cannot leave orphaned stair tiles behind.
  let deep = null
  for (let trial = 0; trial < WORLD_GEN_CONFIG.caves.deep.generationTrials; trial++) {
    const trialMaps = caveMaps.map(cm => cm.map(row => row.slice()))
    const trialMap = undergroundMap.map(row => row.slice())
    const candidate = generateDeepLevel(caves, trialMaps, trialMap, 'cavefloor', 'cavefloor2', 'cavedown', 'caveup')
    if (candidate.caves.length < 2) continue
    caveMaps = trialMaps
    undergroundMap = trialMap
    deep = candidate
    break
  }
  if (!deep) return false
  deepLevels = [deep]
  // z:-3 is reserved for the Dwarven Fort. It is the third level in the
  // generic chain and is not generated as a random cave blob.
  deepLevels.push({
    map: blankCaveMap(),
    caveMaps: [],
    caves: [],
    discovered: Array.from({length: MAP_H}, () => new Array(MAP_W).fill(false))
  })
  buildDwarvenRuin(deepLevels[1])
  // The surface Fort gate must belong to the Temple's walkable component.
  // Candidate selection already enforces this, and this check remains as a
  // defensive invariant against future terrain/gate-placement changes.
  if (!dwarvenRuin || !isSurfacePointReachableFromTemple(dwarvenRuin.x, dwarvenRuin.y)) return false
  // More cave entrances must never put a random cave mouth next to the gate.
  const fortTooClose = dwarvenRuin && caves.some(c => !c.crypt && (c.entrances || []).some(e =>
    Math.max(Math.abs(e.x - dwarvenRuin.x), Math.abs(e.y - dwarvenRuin.y)) <= 15))
  if (fortTooClose) return false
  if (!buildDwarvenRuinsStratum()) return false
  initializeMausoleum()
  undergroundDiscovered = undergroundDiscoveredL1
  return !cryptInvalid
}

// The crypt must remain a separate z:-1 region. Check the actual merged
// map, since overlapping cave templates can create a route even when the
// cave descriptors themselves are far apart.
function isMausoleumAdjacentToRandomCave() {
  const mausoleumHut = villageHuts.find(h => h.mausoleum)
  if (!mausoleumHut) return false

  // Surface rule: random cave mouths must not spawn right beside the village.
  // A 4-tile Chebyshev clearance keeps entrances visibly outside the settlement
  // instead of allowing cases such as an entrance only two tiles from a hut.
  const VILLAGE_CAVE_CLEARANCE = WORLD_GEN_CONFIG.caves.villageEntranceClearance

  // Underground rule: the mausoleum is a 9x9 template whose walkable/stamped
  // interior occupies x = hut.x-3..hut.x+3 and y = hut.y-6..hut.y.
  // Keep one extra tile of breathing room around that footprint so a random
  // cave cannot touch or bleed into the mausoleum when the maps are merged.
  const mausoleumMinX = mausoleumHut.x - 4
  const mausoleumMaxX = mausoleumHut.x + 4
  const mausoleumMinY = mausoleumHut.y - 7
  const mausoleumMaxY = mausoleumHut.y + 1

  for (let i = 0; i < caves.length; i++) {
    const cave = caves[i]
    if (cave.crypt) continue

    for (const e of (cave.entrances || [])) {
      if (villageHuts.some(h =>
        Math.max(Math.abs(e.x - h.x), Math.abs(e.y - h.y)) <= VILLAGE_CAVE_CLEARANCE
      )) return true
    }

    const cm = caveMaps[i]
    if (!cm) continue
    for (let y = mausoleumMinY; y <= mausoleumMaxY; y++) {
      for (let x = mausoleumMinX; x <= mausoleumMaxX; x++) {
        if (cm[y]?.[x] === 'cavefloor' || cm[y]?.[x] === 'caveentrance') return true
      }
    }
  }
  return false
}

function isCryptConnectedToRandomCave() {
  if (cryptCaveIndex < 0) return false
  const crypt = caves[cryptCaveIndex]
  const entrance = crypt?.entrances?.[0]
  if (!entrance) return false
  const queue = [entrance]
  const seen = new Set([keyXY(entrance.x, entrance.y)])
  while (queue.length) {
    const p = queue.shift()
    for (let i = 0; i < caves.length; i++) {
      if (i === cryptCaveIndex || caves[i]?.crypt) continue
      if ((caves[i].entrances || []).some(e => e.x === p.x && e.y === p.y)) return true
      if (caveMaps[i]?.[p.y]?.[p.x] === 'cavefloor') return true
    }
    for (const [dx, dy] of DIRS8) {
      const x = p.x + dx, y = p.y + dy
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue
      const key = keyXY(x, y)
      if (seen.has(key) || !TILE[undergroundMap[y][x]]?.walk) continue
      seen.add(key)
      queue.push({x, y})
    }
  }
  return false
}

// The chapel's crypt is deliberately compact: a long central aisle with
// coffins pressed into either wall.
function buildCrypt() {
  cryptCaveIndex = -1
  let chapel = null
  for (let y = 1; y < MAP_H - 1 && !chapel; y++) for (let x = 1; x < MAP_W - 1; x++)
    if (surfaceMap[y]?.[x] === 'ruinedchapel') {
      chapel = {x, y}
      break
    }
  if (!chapel) return
  const cm = blankCaveMap(), x0 = chapel.x, y0 = chapel.y
  const minX = Math.max(2, x0 - 3), maxX = Math.min(MAP_W - 3, x0 + 3)
  const minY = Math.max(2, y0 - 12), maxY = Math.min(MAP_H - 3, y0 + 12)
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) cm[y][x] = 'cryptfloor'
  cm[y0][x0] = 'caveentrance'
  const graves = []
  for (let y = minY + 2; y <= maxY - 2; y += 3) {
    for (const x of [minX + 1, maxX - 1]) {
      cm[y][x] = 'coffin'
      graves.push({x, y})
    }
  }
  const shuffledGraves = graves.slice()
  for (let i = shuffledGraves.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [shuffledGraves[i], shuffledGraves[j]] = [shuffledGraves[j], shuffledGraves[i]]
  }
  const inscriptions = {}
  shuffledGraves.forEach((g, i) => {
    if (i < CRYPT_INSCRIPTIONS.length) inscriptions[keyXY(g.x, g.y)] = CRYPT_INSCRIPTIONS[i]
    else if (i === CRYPT_INSCRIPTIONS.length) inscriptions[keyXY(g.x, g.y)] = 'Stone coffin. It\'s empty.'
    else inscriptions[keyXY(g.x, g.y)] = 'Stone coffin. The slab is heavy.'
  })
  const cave = {
    x: x0,
    y: y0,
    entrances: [{x: x0, y: y0}],
    crypt: true,
    graves: graves.map(g => keyXY(g.x, g.y)),
    inscriptions
  }
  cryptCaveIndex = caves.length
  caves.push(cave)
  caveMaps.push(cm)
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (cm[y][x] !== 'cavewall') undergroundMap[y][x] = cm[y][x]
}

// A tighter, darker, more claustrophobic crypt level lives beneath the
// first. Reached only via a dedicated staircase at the southernmost,
// centre tile of the first level's aisle - never via the generic shared
// cavedown/caveup chain (which never touches z:-2, this level's z). Level
// 1 itself is untouched here beyond stamping that one staircase tile.
function buildCryptLevel2() {
  cryptLevel2 = null
  if (cryptCaveIndex < 0) return
  const crypt = caves[cryptCaveIndex]
  const cm1 = caveMaps[cryptCaveIndex]
  if (!crypt || !cm1) return
  const x0 = crypt.x
  let stairY = -1
  for (let y = MAP_H - 1; y >= 0; y--) {
    if (cm1[y] && cm1[y][x0] === 'cryptfloor') {
      stairY = y
      break
    }
  }
  if (stairY < 0) return
  cm1[stairY][x0] = 'cryptstairsdown'
  if (undergroundMap[stairY] && undergroundMap[stairY][x0] !== undefined) undergroundMap[stairY][x0] = 'cryptstairsdown'

  const cm2 = blankCaveMap()
  const minX = Math.max(2, x0 - 2), maxX = Math.min(MAP_W - 3, x0 + 2)
  const minY = Math.max(2, stairY - 16), maxY = Math.min(MAP_H - 3, stairY)
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) cm2[y][x] = 'crypt2floor'
  cm2[stairY][x0] = 'cryptstairsup'

  // Collapsed sections along the edges break up the corridor so it never
  // reads as a clean, uniform hallway like the level above.
  for (let i = 0; i < Math.max(3, Math.round((maxY - minY) * 0.3)); i++) {
    const y = randInt(minY + 1, maxY - 1), x = chance(0.5) ? minX : maxX
    if (cm2[y][x] === 'crypt2floor') cm2[y][x] = 'cryptrubble'
  }
  // A few forced pinch points make the passage genuinely tighter than
  // level 1's open aisle.
  for (let i = 0; i < 3; i++) {
    const y = randInt(minY + 3, maxY - 3)
    if (chance(0.5)) cm2[y][minX] = 'cavewall'
    else cm2[y][maxX] = 'cavewall'
  }
  // Burial niches lining the walls - decorative only.
  for (let y = minY + 1; y < maxY; y += 2) {
    if (cm2[y][minX - 1] !== undefined && cm2[y][minX - 1] === 'cavewall' && chance(0.6)) cm2[y][minX - 1] = 'crypt2niche'
    if (cm2[y][maxX + 1] !== undefined && cm2[y][maxX + 1] === 'cavewall' && chance(0.6)) cm2[y][maxX + 1] = 'crypt2niche'
  }
  // A cluster of sarcophagi down the centre line - one is a trap, the
  // rest are just atmosphere.
  const spots = []
  for (let y = minY + 2; y < maxY - 1; y += 3) if (cm2[y][x0] === 'crypt2floor') spots.push({x: x0, y})
  for (let i = spots.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [spots[i], spots[j]] = [spots[j], spots[i]]
  }
  let trapPos = null
  spots.forEach((spot, i) => {
    if (i === 0) {
      cm2[spot.y][spot.x] = 'crypttrap'
      trapPos = {x: spot.x, y: spot.y}
    } else cm2[spot.y][spot.x] = 'sarcophagus'
  })

  // A forgotten burial chamber at the far, deepest end holds a long-dead
  // explorer and the treasure map.
  const explorerSpot = {x: x0, y: Math.min(maxY, minY + 1)}
  if (cm2[explorerSpot.y] && cm2[explorerSpot.y][explorerSpot.x] === 'crypt2floor' &&
    !(trapPos && trapPos.x === explorerSpot.x && trapPos.y === explorerSpot.y)) {
    groundItems.push({
      x: explorerSpot.x, y: explorerSpot.y, kind: 'explorerremains', level: -2, levelKind: 'crypt2', looted: false,
      description: CRYPT2_EXPLORER_FLAVOR
    })
  }

  cryptLevel2 = {
    map: cm2,
    discovered: Array.from({length: MAP_H}, () => new Array(MAP_W).fill(false)),
    x: x0, y: stairY, trapSprung: false, trapPos,
  }
}

// A constructed ruin deliberately occupies a broad, two-screen footprint.
// The same world coordinates are used on the surface and below, keeping the
// gate's descent intuitive and making the layout persist in saves.
let dwarvenRuin = null

function dungeonRoomHasSeparation(rooms, candidate, separation) {
  return rooms.every(room => candidate.x > room.x + room.w + separation ||
    candidate.x + candidate.w + separation < room.x ||
    candidate.y > room.y + room.h + separation ||
    candidate.y + candidate.h + separation < room.y)
}

function carveDungeonRoomConnection(carveWide, a, b, cfg) {
  const carveCorridor = (x1, y1, x2, y2) => {
    const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1)
    while (x1 !== x2) {
      carveWide(x1, y1, chance(cfg.corridorWideChance) ? 3 : 2)
      x1 += sx
    }
    while (y1 !== y2) {
      carveWide(x1, y1, chance(cfg.corridorWideChance) ? 3 : 2)
      y1 += sy
    }
    carveWide(x2, y2, 2)
  }
  if (chance(cfg.corridorHorizontalFirstChance)) {
    carveCorridor(a.cx, a.cy, b.cx, a.cy)
    carveCorridor(b.cx, a.cy, b.cx, b.cy)
  } else {
    carveCorridor(a.cx, a.cy, a.cx, b.cy)
    carveCorridor(a.cx, b.cy, b.cx, b.cy)
  }
}

function buildDwarvenRuin(targetLevel) {
  const cfg = WORLD_GEN_CONFIG.dwarvenFort
  const DIRS4 = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  const DIRS8 = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]
  const templeReachable = surfaceReachableFromTemple()
  const candidates = []
  for (let y = cfg.candidateEdgeMargin; y < MAP_H - cfg.candidateEdgeMargin; y++) for (let x = cfg.candidateEdgeMargin; x < MAP_W - cfg.candidateEdgeMargin; x++) {
    if (map[y][x] !== 'mountain' && map[y][x] !== 'snowmountain') continue
    if (DIRS8.some(([dx, dy]) => templeReachable.has(keyXY(x + dx, y + dy)))) candidates.push({x, y})
  }
  // The fort is mandatory. Prefer a natural mountain entrance, but if
  // the generated world has no suitable mountain tile, create a small
  // snowy mountain outcrop in the north and place the gate there.
  if (!candidates.length) {
    const fallback = []
    const northLimit = Math.max(cfg.fallbackNorthMinRows, Math.floor(MAP_H * cfg.fallbackNorthFraction))
    for (let y = cfg.candidateEdgeMargin; y < northLimit; y++) for (let x = cfg.candidateEdgeMargin; x < MAP_W - cfg.candidateEdgeMargin; x++) {
      if (!TILE[map[y]?.[x]]?.walk) continue
      if (!templeReachable.has(keyXY(x, y))) continue
      if (!DIRS8.some(([dx, dy]) => templeReachable.has(keyXY(x + dx, y + dy)))) continue
      fallback.push({x, y})
    }
    const gate = fallback.length ? pick(fallback) : {x: Math.floor(MAP_W / 2), y: cfg.fallbackCenterY}
    const {x: fx, y: fy} = gate
    for (let yy = fy - cfg.fallbackOutcropRadius; yy <= fy + cfg.fallbackOutcropRadius; yy++) for (let xx = fx - cfg.fallbackOutcropRadius; xx <= fx + cfg.fallbackOutcropRadius; xx++) {
      if (yy < 1 || yy >= MAP_H - 1 || xx < 1 || xx >= MAP_W - 1) continue
      if (Math.abs(xx - fx) <= cfg.fallbackOutcropCoreRadius && Math.abs(yy - fy) <= cfg.fallbackOutcropCoreRadius) continue
      map[yy][xx] = 'snowmountain'
    }
    candidates.push({x: fx, y: fy})
  }
  const gate = pick(candidates), x0 = gate.x, y0 = gate.y
  map[y0][x0] = 'dwarvengate'
  // Preserve the exact terrain displaced by each surface column, including
  // snowy mountains and other non-grass entrance surroundings.
  for (const sx of [x0 - 1, x0 + 1]) {
    if (sx < 0 || sx >= MAP_W) continue
    tileUnderlays[tileUnderlayKey(sx, y0)] = map[y0][sx]
    map[y0][sx] = 'dwarvenstatue'
  }
  if (surfaceMap) {
    surfaceMap[y0][x0] = 'dwarvengate'
    if (x0 > 0) surfaceMap[y0][x0 - 1] = 'dwarvenstatue'
    if (x0 < MAP_W - 1) surfaceMap[y0][x0 + 1] = 'dwarvenstatue'
  }
  const cm = blankCaveMap(), minX = Math.max(2, x0 - cfg.boundsX), maxX = Math.min(MAP_W - 3, x0 + cfg.boundsX),
    minY = Math.max(2, y0 - cfg.boundsY), maxY = Math.min(MAP_H - 3, y0 + cfg.boundsY)
  // Generate a larger, irregular fort: sealed rooms with single entrances,
  // connected by deliberately non-intersecting 2-3 tile-wide corridors.
  const carve = (x, y) => {
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) cm[y][x] = 'marble'
  }
  const carveWide = (x, y, width = 2) => {
    const span = Math.max(2, width)
    for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) carve(x + dx - Math.floor(span / 2), y + dy - Math.floor(span / 2))
  }
  const rooms = []
  const roomCount = randInt(cfg.roomCountRange[0], cfg.roomCountRange[1])
  for (let attempt = 0; rooms.length < roomCount && attempt < cfg.roomPlacementAttempts; attempt++) {
    const w = randInt(cfg.roomWidthRange[0], cfg.roomWidthRange[1]), h = randInt(cfg.roomHeightRange[0], cfg.roomHeightRange[1])
    const rx = randInt(minX + cfg.roomBoundsMargin, maxX - w - cfg.roomBoundsMargin), ry = randInt(minY + cfg.roomBoundsMargin, maxY - h - cfg.roomBoundsMargin)
    const candidate = {x: rx, y: ry, w, h, cx: rx + Math.floor(w / 2), cy: ry + Math.floor(h / 2)}
    if (dungeonRoomHasSeparation(rooms, candidate, cfg.roomSeparation)) rooms.push(candidate)
  }
  const [entranceW, entranceH] = cfg.entranceRoomSize
  const entranceRoom = {x: x0 - Math.floor(entranceW / 2), y: y0 - Math.floor(entranceH / 2), w: entranceW, h: entranceH, cx: x0, cy: y0}
  rooms.unshift(entranceRoom)
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y)
  const connected = [rooms[0]]
  while (connected.length < rooms.length) {
    let best = null
    for (const r of rooms) if (!connected.includes(r)) for (const c of connected) {
      const d = Math.abs(r.cx - c.cx) + Math.abs(r.cy - c.cy)
      if (!best || d < best.d) best = {r, c, d}
    }
    const {r, c} = best
    carveDungeonRoomConnection(carveWide, c, r, cfg)
    connected.push(r)
  }
  // Give every room exactly one doorway into its corridor network.
  // The doorway is carved AFTER the walls are built: this prevents a room
  // from being sealed by a wall where the corridor enters it.
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i], parent = connected[i - 1] || rooms[0]
    const horizontal = Math.abs(parent.cx - r.cx) >= Math.abs(parent.cy - r.cy)
    let dx = r.cx, dy = r.cy
    if (horizontal) {
      if (parent.cx < r.cx) { dx = r.x; dy = r.cy } else { dx = r.x + r.w - 1; dy = r.cy }
    } else {
      if (parent.cy < r.cy) { dx = r.cx; dy = r.y } else { dx = r.cx; dy = r.y + r.h - 1 }
    }
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      if (xx === r.x || xx === r.x + r.w - 1 || yy === r.y || yy === r.y + r.h - 1) cm[yy][xx] = 'dwarvenwall'
    }
    // Open a genuine two-tile-wide doorway on the side facing the parent.
    // The corridor approaches the room from that same side.
    if (horizontal) {
      const sideX = parent.cx < r.cx ? r.x : r.x + r.w - 1
      const inward = parent.cx < r.cx ? 1 : -1
      for (let oy = -1; oy <= 0; oy++) {
        const yy = Math.max(r.y + 1, Math.min(r.y + r.h - 2, r.cy + oy))
        cm[yy][sideX] = 'marble'
        cm[yy][sideX + inward] = 'marble'
      }
    } else {
      const sideY = parent.cy < r.cy ? r.y : r.y + r.h - 1
      const inward = parent.cy < r.cy ? 1 : -1
      for (let ox = -1; ox <= 0; ox++) {
        const xx = Math.max(r.x + 1, Math.min(r.x + r.w - 2, r.cx + ox))
        cm[sideY][xx] = 'marble'
        cm[sideY + inward][xx] = 'marble'
      }
    }
  }
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (cm[y][x] === 'cavewall' && DIRS8.some(([dx, dy]) => cm[y + dy]?.[x + dx] === 'marble')) cm[y][x] = 'dwarvenwall'
  cm[y0][x0] = targetLevel ? 'dwarvenfortexit' : 'dwarvengate'
  const fortOverlayUnderlays = {}
  for (let i = 0; i < cfg.collapseAttempts; i++) {
    const x = randInt(minX + 2, maxX - 2), y = randInt(minY + 2, maxY - 2)
    if (cm[y][x] === 'marble' && Math.abs(x - x0) + Math.abs(y - y0) > cfg.collapseMinGateDistance) {
      const rubble = chance(cfg.rubbleChance)
      if (rubble) fortOverlayUnderlays[keyXY(x, y)] = cm[y][x]
      cm[y][x] = rubble ? 'dwarvenrubble' : 'dwarvenwall'
    }
  }
  // Final connectivity repair: every outermost walkable fort tile must
  // have a path to the gate.  Room walls and rubble can otherwise seal
  // off a room even when its doorway was carved correctly.
  const fortWalkable = (x, y) => {
    const t = cm[y]?.[x]
    return t === 'marble' || t === 'dwarvenfortexit' || t === 'dwarvengate' || t === 'dwarvenrubble'
  }
  const reachableFromGate = () => {
    const seen = new Set(), queue = [{x: x0, y: y0}]
    seen.add(`${x0},${y0}`)
    for (let qi = 0; qi < queue.length; qi++) {
      const p = queue[qi]
      for (const [dx, dy] of DIRS4) {
        const nx = p.x + dx, ny = p.y + dy, key = `${nx},${ny}`
        if (nx < minX || nx > maxX || ny < minY || ny > maxY || seen.has(key) || !fortWalkable(nx, ny)) continue
        seen.add(key); queue.push({x: nx, y: ny})
      }
    }
    return seen
  }
  const outerFortTiles = []
  for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) {
    if (!fortWalkable(xx, yy)) continue
    if (DIRS4.some(([dx, dy]) => !fortWalkable(xx + dx, yy + dy))) outerFortTiles.push({x: xx, y: yy})
  }
  let reachable = reachableFromGate()
  for (const tile of outerFortTiles) {
    if (reachable.has(`${tile.x},${tile.y}`)) continue
    // Find the nearest reachable tile and carve a two-tile-wide route.
    let best = null
    for (const key of reachable) {
      const [rx, ry] = key.split(',').map(Number)
      const d = Math.abs(rx - tile.x) + Math.abs(ry - tile.y)
      if (!best || d < best.d) best = {x: rx, y: ry, d}
    }
    if (!best) continue
    let cx = tile.x, cy = tile.y
    const step = (x, y) => {
      carve(x, y); carve(x + 1, y); carve(x, y + 1); carve(x + 1, y + 1)
    }
    while (cx !== best.x) { step(cx, cy); cx += Math.sign(best.x - cx) }
    while (cy !== best.y) { step(cx, cy); cy += Math.sign(best.y - cy) }
    step(best.x, best.y)
    reachable = reachableFromGate()
  }
  const ruinCave = {x: x0, y: y0, entrances: [{x: x0, y: y0}]}
  const ruinMap = targetLevel ? targetLevel.map : undergroundMap
  const ruinMaps = targetLevel ? targetLevel.caveMaps : caveMaps
  const ruinCaves = targetLevel ? targetLevel.caves : caves
  ruinMaps.push(cm)
  ruinCaves.push(ruinCave)
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (cm[y][x] !== 'cavewall' && ruinMap[y][x] === 'cavewall') ruinMap[y][x] = cm[y][x]
  ruinMap[y0][x0] = targetLevel ? 'dwarvenfortexit' : 'dwarvengate'
  dwarvenRuin = {x: x0, y: y0, caveIndex: ruinMaps.length - 1, level: targetLevel ? -3 : -1}
  const ghost = ENEMY_TEMPLATES.find(t => t.name === 'Ghost')
  const ruinLevel = targetLevel ? -3 : -1
  for (const [xy, floor] of Object.entries(fortOverlayUnderlays)) {
    const [x, y] = xy.split(',').map(Number)
    if (cm[y]?.[x] === 'dwarvenrubble') tileUnderlays[`${ruinLevel}:${xy}`] = floor
  }
  if (ghost) {
    // Spawn eight ghosts on actual fort floor tiles
    const ghostSpots = []
    for (let gy = minY + 1; gy < maxY; gy++) for (let gx = minX + 1; gx < maxX; gx++) {
      if (cm[gy]?.[gx] !== 'marble') continue
      if (Math.abs(gx - x0) + Math.abs(gy - y0) < cfg.ghostMinGateDistance) continue
      ghostSpots.push({x: gx, y: gy})
    }
    for (let i = 0; i < cfg.ghostCount && ghostSpots.length; i++) {
      const pickIndex = randInt(0, ghostSpots.length - 1)
      const {x: gx, y: gy} = ghostSpots.splice(pickIndex, 1)[0]
      const e = {
        name: 'Ghost',
        baseName: 'Ghost',
        tier: ghost.tier || 2,
        level: ruinLevel,
        levelKind: 'chain',
        caveIndex: dwarvenRuin.caveIndex,
        hp: ghost.hp,
        maxHp: ghost.hp,
        atk: ghost.atk,
        def: ghost.def,
        spd: ghost.spd,
        abilities: [...ghost.abilities, 'evades'],
        humanoid: true,
        aggro: ghost.aggro ?? AGGRO_RANGE,
        x: gx,
        y: gy,
        homeX: gx,
        homeY: gy,
        homeTileType: 'marble',
        alive: true,
        prefix: null,
        equipment: null
      }
      prepareEnemyEquipment(e)
      if (chance(cfg.ghostPrefixChance)) {
        const names = Object.keys(ENEMY_PREFIXES)
        if (names.length) {
          const prefix = pick(names)
          e.prefix = prefix
          e.prefixBase = prefixBaseStats(e)
          applyEnemyPrefix(e, prefix)
          e.name = prefix + ' ' + e.name
        }
      }
      addEnemy(e)
    }
  }
  for (let i = 0; i < cfg.ruinPropAttempts; i++) {
    const x = randInt(minX + 2, maxX - 2), y = randInt(minY + 2, maxY - 2)
    if (cm[y][x] === 'marble') groundItems.push({
      x,
      y,
      kind: 'ruinprop',
      level: ruinLevel,
      levelKind: 'chain',
      caveIndex: dwarvenRuin.caveIndex,
      description: pick(['A snapped pick lies beneath the dust.', 'A cracked keg still smells faintly of ale.', 'A workbench collapsed under its own tools.', 'A dwarven lintel bears a name worn smooth by generations.'])
    })
  }
  // Place the anvil on a valid, reachable marble tile. The old fixed
  // offset could land on a wall or rubble after the fort was randomized.
  const anvilCandidates = []
  for (let y = minY + 1; y < maxY; y++) for (let x = minX + 1; x < maxX; x++) {
    if (cm[y]?.[x] !== 'marble') continue
    if (Math.abs(x - x0) + Math.abs(y - y0) < cfg.anvilMinGateDistance) continue
    if (groundItems.some(i => i.level === ruinLevel && i.caveIndex === dwarvenRuin.caveIndex && i.x === x && i.y === y)) continue
    anvilCandidates.push({x, y})
  }
  const anvilSpot = anvilCandidates.length ? anvilCandidates[randInt(0, anvilCandidates.length - 1)] : null
  if (anvilSpot) groundItems.push({
    x: anvilSpot.x,
    y: anvilSpot.y,
    kind: 'anvil',
    level: ruinLevel,
    levelKind: 'chain',
    caveIndex: dwarvenRuin.caveIndex,
    description: 'The abandoned dwarven anvil is cold; its surface is scarred by a thousand unfinished blades.'
  })
  const ruinFloorSpots = []
  for (let yy = minY + 3; yy < maxY - 2; yy++) for (let xx = minX + 3; xx < maxX - 2; xx++) {
    if (cm[yy][xx] === 'marble') ruinFloorSpots.push({x: xx, y: yy})
  }
  // A seeded Fisher-Yates shuffle keeps fort layout reproducible in saves/replays.
  const shuffledRuinSpots = ruinFloorSpots.slice()
  for (let i = shuffledRuinSpots.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    ;[shuffledRuinSpots[i], shuffledRuinSpots[j]] = [shuffledRuinSpots[j], shuffledRuinSpots[i]]
  }
  const farFrom = (p, q, distance = 10) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) >= distance
  let artifactSpot = shuffledRuinSpots.find(p => farFrom(p, {x: x0, y: y0}, cfg.artifactChestMinGateDistance)) || shuffledRuinSpots[0]
  if (artifactSpot) groundItems.push({
    x: artifactSpot.x,
    y: artifactSpot.y,
    kind: 'chest',
    tier: cfg.artifactChestTier,
    artifactGuaranteed: true,
    opened: false,
    level: ruinLevel,
    levelKind: 'chain',
    caveIndex: dwarvenRuin.caveIndex
  })
  let deepSpot = shuffledRuinSpots.find(p => farFrom(p, artifactSpot || {x: x0, y: y0}, cfg.wheelbarrowMinArtifactDistance) && farFrom(p, {x: x0, y: y0}, cfg.wheelbarrowMinGateDistance))
  if (!deepSpot) deepSpot = shuffledRuinSpots.find(p => farFrom(p, artifactSpot || {x: x0, y: y0}, cfg.wheelbarrowFallbackArtifactDistance))
  if (deepSpot) {
    groundItems.push({
      x: deepSpot.x,
      y: deepSpot.y,
      kind: 'wheelbarrow',
      level: ruinLevel,
      levelKind: 'chain',
      caveIndex: dwarvenRuin.caveIndex,
      description: 'You something resembling a wheelbarrow. This thing has not been used in years. The craftsmanship, however, is of the highest quality and unknown material. It appears to be surprisingly light - you can pick it up if you want to. Though you\'re not sure why you would need it.'
    })
    const coinSpot = [[deepSpot.x - 1, deepSpot.y], [deepSpot.x + 1, deepSpot.y], [deepSpot.x, deepSpot.y - 1], [deepSpot.x, deepSpot.y + 1]]
      .map(([x, y]) => ({x, y})).find(p => cm[p.y]?.[p.x] === 'marble')
    if (coinSpot) groundItems.push({
      x: coinSpot.x,
      y: coinSpot.y,
      kind: 'goldcoin',
      level: ruinLevel,
      levelKind: 'chain',
      caveIndex: dwarvenRuin.caveIndex,
      description: 'You see a single, enormous gold coin. A skeleton lies crushed beneath it, its bones flattened under the weight. Poor greedy soul.'
    })
  }
  // Choose spread-out floor sites from a seeded shuffle; these are searchable
  // skeletons, separate from the decorative dwarven rubble remains.
  const skeletonSites = []
  for (let y = minY + 1; y < maxY; y++) for (let x = minX + 1; x < maxX; x++) {
    if (cm[y]?.[x] !== 'marble') continue
    if (groundItems.some(g => g.level === ruinLevel && g.caveIndex === dwarvenRuin.caveIndex && g.x === x && g.y === y)) continue
    skeletonSites.push({x, y})
  }
  for (let i = skeletonSites.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    ;[skeletonSites[i], skeletonSites[j]] = [skeletonSites[j], skeletonSites[i]]
  }
  const chosenSkeletons = []
  const skeletonCount = randInt(5, 9)
  for (let i = 0; i < skeletonCount && skeletonSites.length; i++) {
    let best = 0, bestDistance = -1
    for (let j = 0; j < skeletonSites.length; j++) {
      const site = skeletonSites[j]
      const distance = chosenSkeletons.length ? Math.min(...chosenSkeletons.map(p =>
        Math.max(Math.abs(p.x - site.x), Math.abs(p.y - site.y)))) : 0
      if (distance > bestDistance) { best = j; bestDistance = distance }
    }
    const site = skeletonSites.splice(best, 1)[0]
    chosenSkeletons.push(site)
    groundItems.push({...site, kind: 'skeleton', looted: false, description: pick(SKELETON_INSPECTIONS), hasLoot: chance(0.10),
      level: ruinLevel, levelKind: 'chain', caveIndex: dwarvenRuin.caveIndex})
  }
  for (let i = 0; i < cfg.remainsAttempts; i++) {
    const x = randInt(minX + 2, maxX - 2), y = randInt(minY + 2, maxY - 2)
    if (cm[y][x] === 'dwarvenrubble') groundItems.push({
      x,
      y,
      kind: 'dwarvenremains',
      looted: false,
      level: ruinLevel,
      levelKind: 'chain',
      caveIndex: dwarvenRuin.caveIndex,
      description: 'The bones are laid where the collapse caught them.'
    })
  }

}

function dungeonWalkDistances(cm, start, blocked = null) {
  const DIRS4 = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  const distances = new Map()
  const queue = [{x: start.x, y: start.y}]
  distances.set(keyXY(start.x, start.y), 0)
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi], nextDistance = distances.get(keyXY(p.x, p.y)) + 1
    for (const [dx, dy] of DIRS4) {
      const x = p.x + dx, y = p.y + dy, key = keyXY(x, y)
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || distances.has(key) || blocked?.has(key)) continue
      if (!TILE[cm[y]?.[x]]?.walk) continue
      distances.set(key, nextDistance)
      queue.push({x, y})
    }
  }
  return distances
}

// Generation-time reachability may look through doors that have a valid future
// interaction (open/unlock/breach). This is deliberately separate from normal
// pathfinding so it cannot make a locked gate traversable during play.
function dungeonWalkDistancesWithDoorTraversal(cm, start, blocked = null, allowDiagonals = false) {
  const traversableDoor = new Set(['dwarvendoorclosed','dwarvendoorlocked','dwarvenprisondoorclosed','dwarvenprisondoorlocked','dwarvengatelocked'])
  const dirs = allowDiagonals
    ? [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]]
    : [[0,-1],[0,1],[-1,0],[1,0]]
  const distances = new Map([[keyXY(start.x, start.y), 0]])
  const queue = [{x:start.x, y:start.y}]
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi], nextDistance = distances.get(keyXY(p.x, p.y)) + 1
    for (const [dx, dy] of dirs) {
      const x = p.x + dx, y = p.y + dy, key = keyXY(x, y)
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || distances.has(key) || blocked?.has(key)) continue
      const tile = cm[y]?.[x]
      if (!TILE[tile]?.walk && !traversableDoor.has(tile)) continue
      distances.set(key, nextDistance)
      queue.push({x, y})
    }
  }
  return distances
}

function dwarvenRoomArchetypeForProgress(progress, finalFloor = false) {
  const roomCfg = WORLD_GEN_CONFIG.dungeons?.dwarvenRuins?.rooms || {}
  const defs = roomCfg.archetypes || {}
  const names = Object.keys(defs)
  if (!names.length) return 'Storage'
  const defensive = new Set(['Barracks', 'Armory', 'Dormitory', 'Prison'])
  return pickWeighted(names, name => {
    const def = defs[name] || {}
    const early = Number(def.weightEarly ?? 1)
    const late = Number(def.weightLate ?? early)
    let weight = Math.max(0.0001, early + (late - early) * progress)
    if (finalFloor && defensive.has(name)) weight *= Number(roomCfg.finalFloorDefensiveWeightMultiplier ?? 1)
    return weight
  })
}

function dwarvenRoomInterior(room) {
  const out = []
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) out.push({x, y})
  }
  return out
}

function dwarvenPrisonCellPoints(room) {
  const region = room?.prisonCellRegion
  if (!region) return []
  const points = []
  for (let y = region.y1; y <= region.y2; y++) for (let x = region.x1; x <= region.x2; x++)
    points.push({x, y})
  return points
}

function dungeonClearProjectileLine(cm, from, to) {
  let x0 = from.x, y0 = from.y
  const x1 = to.x, y1 = to.y
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
    if (x0 === x1 && y0 === y1) return true
    if (TILE[cm[y0]?.[x0]]?.projectileBlock) return false
  }
  return true
}

function dwarvenRoomEntryPoint(cm, room) {
  const leaves = room.doorways?.[0] || []
  if (!leaves.length) return {x: room.cx, y: room.cy}
  const mx = leaves.reduce((sum, p) => sum + p.x, 0) / leaves.length
  const my = leaves.reduce((sum, p) => sum + p.y, 0) / leaves.length
  const candidates = dwarvenRoomInterior(room).filter(p => cm[p.y]?.[p.x] === 'marble')
  if (!candidates.length) return {x: room.cx, y: room.cy}
  return candidates.reduce((best, p) => {
    const d = Math.abs(p.x - mx) + Math.abs(p.y - my)
    return !best || d < best.d ? {...p, d} : best
  }, null)
}

function deriveDwarvenTacticalSlots(cm, room, roleCounts = null) {
  const requested = roleCounts || {backline: 1, frontline: 2, group: 2, champion: 1, any: 2}
  const entry = dwarvenRoomEntryPoint(cm, room)
  const interior = dwarvenRoomInterior(room).filter(p => cm[p.y]?.[p.x] === 'marble')
  const used = new Set()
  const take = (pool, count) => {
    const result = []
    for (const p of pool) {
      const key = keyXY(p.x, p.y)
      if (used.has(key)) continue
      used.add(key)
      result.push({x: p.x, y: p.y})
      if (result.length >= count) break
    }
    return result
  }
  const byEntryDistance = interior.map(p => ({...p, d: Math.abs(p.x - entry.x) + Math.abs(p.y - entry.y)}))
  const zoneKeys = ids => new Set(dungeonZonePoints(room, ids).map(p => keyXY(p.x,p.y)))
  const backlineZones = zoneKeys(['backline','archive','stores','treasure','reliquary','sleeping','rubble','cistern'])
  const frontlineZones = zoneKeys(['frontline','guard','approach','barricade','walkway','aisles'])
  const groupZones = zoneKeys(['guard','cells','sleeping','stores','rubble','treasure'])
  const preferZone = (pool, keys) => {
    if (!keys.size) return pool
    const preferred = pool.filter(p => keys.has(keyXY(p.x,p.y)))
    return preferred.length ? preferred.concat(pool.filter(p => !keys.has(keyXY(p.x,p.y)))) : pool
  }
  const backlinePool = preferZone(byEntryDistance.filter(p => dungeonClearProjectileLine(cm, p, entry))
    .sort((a, b) => b.d - a.d || a.y - b.y || a.x - b.x), backlineZones)
  const frontlinePool = preferZone(byEntryDistance.slice().sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x), frontlineZones)
  const groupPool = preferZone(interior.map(p => ({...p, d: Math.abs(p.x - room.cx) + Math.abs(p.y - room.cy)}))
    .sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x), groupZones)
  const anyPool = interior.slice()
  for (let i = anyPool.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    ;[anyPool[i], anyPool[j]] = [anyPool[j], anyPool[i]]
  }
  return {
    backline: take(backlinePool, Math.max(0, requested.backline || 0)),
    frontline: take(frontlinePool, Math.max(0, requested.frontline || 0)),
    group: take(groupPool, Math.max(0, requested.group || 0)),
    champion: take(backlinePool.length ? backlinePool : groupPool, Math.max(0, requested.champion || 0)),
    any: take(anyPool, Math.max(0, requested.any || 0))
  }
}

function decorateDwarvenRoomTerrain(cm, room, progress = 0, finalFloor = false, reserved = new Set(), overlayUnderlays = {}) {
  if (!room || room.archetype === 'Entrance Hall') return
  const story = dungeonPackageConfig('dwarvenRuins')?.story || {}
  const finalBarricadeMultiplier = finalFloor ? (story.finalFloorBarricadeMultiplier ?? 1) : 1
  const doorwayKeys = new Set((room.doorways || []).flat().map(p => keyXY(p.x, p.y)))
  const protectedTile = p => reserved.has(keyXY(p.x, p.y)) ||
    (room.prisonCellDoorCandidate && p.x === room.prisonCellDoorCandidate.x && p.y === room.prisonCellDoorCandidate.y) ||
    Math.abs(p.x - room.cx) <= 1 && Math.abs(p.y - room.cy) <= 1 ||
    [...doorwayKeys].some(key => {
      const [x, y] = key.split(',').map(Number)
      return Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= 1
    })
  const allInterior = dwarvenRoomInterior(room)
  const edge = allInterior.filter(p => cm[p.y]?.[p.x] === 'marble' && !protectedTile(p) &&
    (p.x <= room.x + 2 || p.x >= room.x + room.w - 3 || p.y <= room.y + 2 || p.y >= room.y + room.h - 3))
  const center = allInterior.filter(p => cm[p.y]?.[p.x] === 'marble' && !protectedTile(p))
  const shuffle = arr => {
    const copy = arr.slice()
    for (let i = copy.length - 1; i > 0; i--) { const j = randInt(0, i); [copy[i], copy[j]] = [copy[j], copy[i]] }
    return copy
  }
  const zonePool = (ids, fallback = center) => {
    const points = dungeonZonePoints(room, ids).filter(p => cm[p.y]?.[p.x] === 'marble' && !protectedTile(p))
    return points.length ? points : fallback
  }
  const place = (tile, count, pool = edge) => {
    let placed = 0
    for (const p of shuffle(pool)) {
      if (cm[p.y]?.[p.x] !== 'marble' || protectedTile(p)) continue
      if (tile === 'dwarvenrubble' || tile === 'dwarvenstatue')
        overlayUnderlays[keyXY(p.x, p.y)] = cm[p.y][p.x]
      cm[p.y][p.x] = tile
      if (++placed >= count) break
    }
    return placed
  }
  const span = Math.max(1, Math.floor((room.w + room.h) / 8))
  if (room.archetype === 'Barracks') place('dwarvenbed', Math.min(5, 2 + span), zonePool(['backline','sleeping'], edge))
  else if (room.archetype === 'Armory') place('dwarvencrate', Math.min(5, 2 + span), zonePool(['stores','treasure'], edge))
  else if (room.archetype === 'Dining Hall') place('dwarventable', Math.min(4, 1 + span), center)
  else if (room.archetype === 'Library') place('dwarvenshelf', Math.min(6, 2 + span), zonePool(['archive','aisles'], edge))
  else if (room.archetype === 'Forge') place('dwarvencrate', Math.min(3, 1 + span), zonePool(['backline'], edge))
  else if (room.archetype === 'Workshop') place('dwarvencrate', Math.min(4, 1 + span), zonePool(['stores'], edge))
  else if (room.archetype === 'Dormitory') place('dwarvenbed', Math.min(7, 3 + span), zonePool(['sleeping'], edge))
  else if (room.archetype === 'Burial Chamber' || room.archetype === 'Temple') place('dwarvenstatue', Math.min(3, span), zonePool(['reliquary'], edge))
  else if (room.archetype === 'Storage') place('dwarvencrate', Math.min(6, 2 + span), zonePool(['stores','treasure'], edge))

  const vaultType = room.vaultType
  if (vaultType === 'collapsedHall') place('dwarvenrubble', Math.min(7, 3 + span), zonePool(['rubble'], center))
  else if (vaultType === 'libraryArchive') place('dwarvenshelf', Math.min(4, 1 + span), zonePool(['archive'], edge))
  else if (vaultType === 'forgeKillzone') place('dwarvencrate', Math.min(4, 1 + span), zonePool(['backline'], center))
  else if (vaultType === 'treasury' || vaultType === 'trappedArmory') place('dwarvencrate', Math.min(4, 1 + span), zonePool(['treasure','stores'], edge))
  else if (vaultType === 'floodedCistern') place('water', Math.min(6, Math.max(2, span + 1)), zonePool(['cistern'], center))

  // Prison architecture is structural rather than decorative: bars divide a
  // far-side cell area from the guard side and leave one real door position.
  // Vault prison blocks always lock it; ordinary Prison rooms can lock it via
  // the archetype's configured internalLockedCellChance.
  if (room.archetype === 'Prison') {
    const entry = dwarvenRoomEntryPoint(cm, room)
    const zones = room.vaultZones?.length ? room.vaultZones : dungeonInternalZones(room, ['guard','cells'], entry)
    if (!room.vaultZones?.length) room.internalZones = structuredClone(zones)
    const cell = zones.find(zone => zone.id === 'cells')
    const horizontalApproach = Math.abs(entry.x - room.cx) >= Math.abs(entry.y - room.cy)
    const split = horizontalApproach
      ? (entry.x <= room.cx ? cell?.x1 : cell?.x2)
      : (entry.y <= room.cy ? cell?.y1 : cell?.y2)
    const towardCell = horizontalApproach
      ? (entry.x <= room.cx ? 1 : -1)
      : (entry.y <= room.cy ? 1 : -1)
    const dividerCoords = [...new Set([split,
      Number.isFinite(split) ? split + towardCell : null,
      horizontalApproach ? room.cx : room.cy].filter(Number.isFinite))]
    const doorwayNear = p => [...doorwayKeys].some(key => {
      const [x,y] = key.split(',').map(Number)
      return Math.max(Math.abs(p.x-x),Math.abs(p.y-y)) <= 1
    })
    let line = [], cellRegion = null
    for (const divider of dividerCoords) {
      const candidateLine = allInterior.filter(p => horizontalApproach ? p.x === divider : p.y === divider)
        .sort((a,b) => Math.abs((horizontalApproach ? a.y : a.x) - (horizontalApproach ? room.cy : room.cx)) -
          Math.abs((horizontalApproach ? b.y : b.x) - (horizontalApproach ? room.cy : room.cx)))
      const expectedLength = horizontalApproach ? room.h - 2 : room.w - 2
      // A partial partition is worse than no cell: actors can walk around a
      // missing end bar (including diagonally) and bypass its locked door.
      if (candidateLine.length !== expectedLength || candidateLine.some(p =>
        cm[p.y]?.[p.x] !== 'marble' || reserved.has(keyXY(p.x,p.y)) || doorwayNear(p))) continue
      const far = horizontalApproach
        ? {x1: towardCell > 0 ? divider + 1 : room.x + 1,
          x2: towardCell > 0 ? room.x + room.w - 2 : divider - 1,
          y1: room.y + 1, y2: room.y + room.h - 2}
        : {x1: room.x + 1, x2: room.x + room.w - 2,
          y1: towardCell > 0 ? divider + 1 : room.y + 1,
          y2: towardCell > 0 ? room.y + room.h - 2 : divider - 1}
      const depth = horizontalApproach ? far.x2 - far.x1 + 1 : far.y2 - far.y1 + 1
      if (depth < 2) continue
      const viable = allInterior.filter(p => p.x >= far.x1 && p.x <= far.x2 &&
        p.y >= far.y1 && p.y <= far.y2 && cm[p.y]?.[p.x] === 'marble' && !reserved.has(keyXY(p.x,p.y)))
      if (viable.length < 3) continue
      line = candidateLine
      cellRegion = far
      break
    }
    if (line.length < 3 || !cellRegion) {
      room.prisonCellGenerationFailed = true
    } else {
      const door = line[0]
      for (const p of line) if (!(p.x === door.x && p.y === door.y) && cm[p.y]?.[p.x] === 'marble') cm[p.y][p.x] = 'dwarvenprisonbars'
      room.prisonCellDoorCandidate = {x:door.x,y:door.y}
      room.prisonCellAxis = horizontalApproach ? 'vertical' : 'horizontal'
      room.prisonCellRegion = cellRegion
    }
  }

  const barricadeChance = Math.min(1, dungeonProgressMultiplier(story.barricadeChanceRange, progress, 0) * finalBarricadeMultiplier)
  if (vaultType === 'fortifiedBarracks' || vaultType === 'barricadedDormitory' ||
      (room.archetype === 'Dormitory' && chance(barricadeChance))) {
    const near = zonePool(['barricade','frontline','guard'], center)
    if (!place('dwarvenbedbarricade', 1, near)) place('dwarvenbedbarricade', 1, center)
    if (finalFloor && finalBarricadeMultiplier > 1.5) place('dwarvenbedbarricade', 1, edge.filter(p => !near.some(n => n.x === p.x && n.y === p.y)))
  }

  // Optional branches acquire gradually heavier defensive debris as the
  // stratum deepens. It never seals the branch doorway or a reserved tile.
  const debrisChance = dungeonProgressMultiplier(story.optionalDefenseDebrisChanceRange, progress, 0)
  if (room.optional && !room.vaultType && chance(debrisChance)) {
    const entry = dwarvenRoomEntryPoint(cm, room)
    const far = center.slice().sort((a,b) =>
      (Math.abs(b.x-entry.x)+Math.abs(b.y-entry.y)) - (Math.abs(a.x-entry.x)+Math.abs(a.y-entry.y)))
    place('dwarvenrubble', finalFloor ? 2 : 1, far.slice(0, Math.max(4, Math.ceil(far.length / 3))))
  }
}

function addDwarvenRoomInternalLocks(cm, roomMetas, vaults, entry, floorZ, ordinaryLocks, ordinaryKeys, reserved) {
  const roomDefs = WORLD_GEN_CONFIG.dungeons?.dwarvenRuins?.rooms?.archetypes || {}
  for (const room of roomMetas) {
    const door = room.prisonCellDoorCandidate
    if (room.archetype !== 'Prison' || !door || cm[door.y]?.[door.x] !== 'marble') continue
    const forceLocked = room.vaultType === 'prisonBlock'
    const lockChance = Math.min(1, Math.max(0, Number(roomDefs.Prison?.internalLockedCellChance ?? 0)))
    const locked = forceLocked || chance(lockChance)
    if (!locked) {
      cm[door.y][door.x] = 'dwarvenprisondoorclosed'
      room.internalDoors = [{leaves:[{x:door.x,y:door.y}],kind:'prisonCell',locked:false}]
      continue
    }
    cm[door.y][door.x] = 'dwarvenprisondoorlocked'
    const keyId = dwarvenDungeonLockId(floorZ, 'door', [door])
    const reachable = dungeonWalkDistances(cm, entry)
    const candidates = []
    for (const [key, distance] of reachable.entries()) {
      if (distance <= 0 || reserved.has(key)) continue
      const [x,y] = key.split(',').map(Number)
      if (cm[y]?.[x] !== 'marble') continue
      if (x > room.x && x < room.x + room.w - 1 && y > room.y && y < room.y + room.h - 1) continue
      candidates.push({x,y,distance})
    }
    if (!candidates.length) return false
    candidates.sort((a,b) => b.distance - a.distance || a.y - b.y || a.x - b.x)
    const keyBand = Math.max(1, Math.floor(roomDefs.Prison?.internalKeyFarCandidateBand ?? 8))
    const band = candidates.slice(0, Math.min(keyBand, candidates.length))
    const keySpot = pick(band)
    ordinaryLocks.push({leaves:[{x:door.x,y:door.y}],keyId,roomId:room.id,
      vaultId:vaults.find(v => v.roomId === room.id)?.id || null,internalRoomLock:true})
    ordinaryKeys.push({x:keySpot.x,y:keySpot.y,keyId,internalRoomKey:true})
    reserved.add(keyXY(keySpot.x,keySpot.y))
    room.internalLocks = [{keyId,leaves:[{x:door.x,y:door.y}],kind:'prisonCell'}]
    const vault = vaults.find(v => v.roomId === room.id)
    if (vault) vault.internalLocks = structuredClone(room.internalLocks)
  }
  // Other doors might open later. Even then, every locked cell must have
  // exactly one entry: its own leaf. Test eight-way movement, including the
  // diagonal corner cases that four-way worldgen reachability misses.
  for (const room of roomMetas) {
    if (room.archetype !== 'Prison' || !room.prisonCellRegion) continue
    const cellDoor = room.prisonCellDoorCandidate
    const withoutCellDoor = dungeonWalkDistancesWithDoorTraversal(cm, entry,
      new Set([keyXY(cellDoor.x, cellDoor.y)]), true)
    if (dwarvenPrisonCellPoints(room).some(p => withoutCellDoor.has(keyXY(p.x, p.y)))) return false
  }
  return true
}

function dungeonInternalZones(room, names = [], entry = null) {
  const x1 = room.x + 1, y1 = room.y + 1
  const x2 = room.x + room.w - 2, y2 = room.y + room.h - 2
  const midX = Math.floor((x1 + x2) / 2), midY = Math.floor((y1 + y2) / 2)
  const from = entry || {x: room.cx, y: room.cy}
  const horizontalApproach = Math.abs(from.x - room.cx) >= Math.abs(from.y - room.cy)
  const entryOnLowSide = horizontalApproach ? from.x <= room.cx : from.y <= room.cy
  const nearRect = horizontalApproach
    ? (entryOnLowSide ? {x1,y1,x2:midX,y2} : {x1:midX,y1,x2,y2})
    : (entryOnLowSide ? {x1,y1,x2,y2:midY} : {x1,y1:midY,x2,y2})
  const farRect = horizontalApproach
    ? (entryOnLowSide ? {x1:midX,y1,x2,y2} : {x1,y1,x2:midX,y2})
    : (entryOnLowSide ? {x1,y1:midY,x2,y2} : {x1,y1,x2,y2:midY})
  const near = new Set(['frontline','guard','approach','barricade','walkway','aisles'])
  const far = new Set(['backline','archive','stores','treasure','reliquary','sleeping','rubble','cells','cistern'])
  return names.map(name => ({id:name, ...(far.has(name) ? farRect : near.has(name) ? nearRect : {x1,y1,x2,y2})}))
}

function dungeonZonePoints(room, zoneIds = []) {
  const zones = Array.isArray(room?.vaultZones) && room.vaultZones.length ? room.vaultZones : room?.internalZones
  if (!Array.isArray(zones) || !zones.length || !zoneIds.length) return []
  const wanted = new Set(zoneIds)
  const out = []
  for (const zone of zones) {
    if (!wanted.has(zone.id)) continue
    for (let y = zone.y1; y <= zone.y2; y++) for (let x = zone.x1; x <= zone.x2; x++) {
      if (x > room.x && x < room.x + room.w - 1 && y > room.y && y < room.y + room.h - 1) out.push({x,y})
    }
  }
  return out
}

function dwarvenVaultInternalZones(cm, room, names = []) {
  return dungeonInternalZones(room, names, dwarvenRoomEntryPoint(cm, room))
}

function selectDungeonVaults(packageId, cm, roomMetas, structuralDoors, gateDoorway, progress, floorZ, finalFloor, hooks = {}) {
  const cfg = dungeonPackageConfig(packageId)?.vaults || {}
  const buildZones = hooks.buildZones || ((grid, room, names) => dungeonInternalZones(room, names, dwarvenRoomEntryPoint(grid, room)))
  const buildSlots = hooks.buildSlots || deriveDwarvenTacticalSlots
  const defs = cfg.definitions || {}
  const entranceClearance = dungeonPackageConfig(packageId)?.encounters?.entranceClearance ?? 0
  const backlineClearOfEntrances = (room, def) => !(def.roles?.backline > 0) ||
    (buildSlots(cm, room, def.roles).backline || []).some(p =>
      (hooks.entrances || []).every(e => Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) > entranceClearance))
  const gateRoom = structuralDoors.find(d => d.leaves === gateDoorway)?.room || null
  const selectable = roomMetas.filter(room => room.index > 0 && room._source !== gateRoom)
  if (!selectable.length) return null

  const selected = []
  const usedRooms = new Set()
  const usedTypes = new Set()
  const definitionFits = (type, room, ignoreArchetype = false, allowFallback = false) => {
    const def = defs[type]
    if (!def || (def.fallbackOnly && !allowFallback)) return false
    const range = def.progressRange || [0, 1]
    const minSize = def.minSize || [1, 1]
    const maxSize = def.maxSize || [Infinity, Infinity]
    const entranceRange = def.requiredEntrances || [1, Infinity]
    const entranceCount = Math.max(1, Number(room.connectionCount) || room.doorways?.length || 0)
    const doorRequirement = def.doorRequirement || 'any'
    const requiresStructuralEntrance = doorRequirement === 'closed' || doorRequirement === 'locked'
    const hasStructuralEntrance = structuralDoors.some(door => door.room === room._source && door.leaves !== gateDoorway)
    return progress >= range[0] && progress <= range[1] &&
      room.w >= minSize[0] && room.h >= minSize[1] && room.w <= maxSize[0] && room.h <= maxSize[1] &&
      entranceCount >= entranceRange[0] && entranceCount <= entranceRange[1] &&
      (!requiresStructuralEntrance || hasStructuralEntrance) &&
      backlineClearOfEntrances(room, def) &&
      (ignoreArchetype || !Array.isArray(def.archetypes) || def.archetypes.includes(room.archetype))
  }
  const attach = (type, room, artifactReserved = false) => {
    const def = defs[type]
    room.vaultType = type
    room.vaultLabel = def.label || type
    if (Array.isArray(def.archetypes) && def.archetypes.length && !def.archetypes.includes(room.archetype)) room.archetype = def.archetypes[0]
    room.vaultZones = buildZones(cm, room, def.internalZones || [])
    const slots = buildSlots(cm, room, def.roles || {})
    room.tacticalSlots = slots
    const vault = {
      id: `${packageId}-vault:${floorZ}:${selected.length}`,
      type,
      label: def.label || type,
      roomId: room.id,
      entrance: dwarvenRoomEntryPoint(cm, room),
      roles: structuredClone(def.roles || {}),
      slots,
      zones: structuredClone(room.vaultZones || []),
      doorRequirement: def.doorRequirement || 'any',
      trapBias: def.trapBias === true,
      trapTypes: Array.isArray(def.trapTypes) ? def.trapTypes.slice() : [],
      lootMultiplier: Number(def.lootMultiplier ?? 1),
      tierBiasBonus: Number(def.tierBiasBonus ?? 0),
      artifactReserved
    }
    selected.push(vault)
    usedRooms.add(room.id)
    usedTypes.add(type)
    return vault
  }

  let artifactRoom = null
  if (finalFloor) {
    const optional = selectable.filter(room => room.optional)
      .sort((a, b) => (Math.abs(b.cx - roomMetas[0].cx) + Math.abs(b.cy - roomMetas[0].cy)) -
        (Math.abs(a.cx - roomMetas[0].cx) + Math.abs(a.cy - roomMetas[0].cy)))
    const configuredArtifactTypes = Array.isArray(cfg.artifactTypes) ? cfg.artifactTypes : []
    artifactRoom = optional.find(room => configuredArtifactTypes.some(type => definitionFits(type, room, true))) || null
    if (artifactRoom) {
      const artifactTypes = configuredArtifactTypes.filter(type => definitionFits(type, artifactRoom, true))
      if (!artifactTypes.length) return null
      const type = pickWeighted(artifactTypes, t => Math.max(0.0001, defs[t]?.weight ?? 1))
      attach(type, artifactRoom, true)
    } else {
      // A final floor must never lose its artifact because the ordinary vault
      // roll produced no suitable room. Promote the farthest spare branch into
      // a dedicated guarded side chamber; it is fallback-only and therefore
      // never enters normal vault selection.
      artifactRoom = optional.find(room => definitionFits('guardedArtifactChamber', room, true, true)) || null
      if (!artifactRoom) return null
      attach('guardedArtifactChamber', artifactRoom, true)
    }
  }

  const rolledTarget = Math.max(1, randInt(cfg.countRange?.[0] ?? 1, cfg.countRange?.[1] ?? 2))
  const target = finalFloor ? Math.max(Math.max(1, Math.floor(cfg.finalFloorMinimumCount ?? 1)), rolledTarget) : rolledTarget
  if (finalFloor) {
    const defensiveTypes = Array.isArray(cfg.finalFloorDefensiveTypes) ? cfg.finalFloorDefensiveTypes : []
    const candidates = []
    for (const room of selectable.filter(room => !usedRooms.has(room.id))) {
      for (const type of defensiveTypes) {
        if (!usedTypes.has(type) && definitionFits(type, room, true)) candidates.push({room, type})
      }
    }
    if (!candidates.length) return null
    const choice = pickWeighted(candidates, entry => Math.max(0.0001, defs[entry.type]?.weight ?? 1))
    attach(choice.type, choice.room, false)
  }
  let guard = 0
  const selectionGuardLimit = Math.max(1, Math.floor(cfg.selectionGuardLimit ?? 50))
  while (selected.length < target && guard++ < selectionGuardLimit) {
    const rooms = selectable.filter(room => !usedRooms.has(room.id))
    if (!rooms.length) break
    const room = pick(rooms)
    let types = Object.keys(defs).filter(type => !defs[type]?.fallbackOnly && !usedTypes.has(type) && definitionFits(type, room, false))
    if (!types.length) types = Object.keys(defs).filter(type => !defs[type]?.fallbackOnly && !usedTypes.has(type) && definitionFits(type, room, true))
    if (!types.length) { usedRooms.add(room.id); continue }
    const type = pickWeighted(types, t => Math.max(0.0001, defs[t]?.weight ?? 1))
    attach(type, room, false)
  }
  if (!selected.length) return null
  return {vaults: selected, artifactRoom}
}

function dungeonRoomGraphDistances(graph, startIndex) {
  const distances = new Map([[startIndex, 0]])
  const queue = [startIndex]
  const adjacency = new Map()
  for (const edge of graph.edges || []) {
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, [])
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, [])
    adjacency.get(edge.a).push(edge.b)
    adjacency.get(edge.b).push(edge.a)
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const current = queue[qi]
    const nextDistance = distances.get(current) + 1
    for (const next of adjacency.get(current) || []) {
      if (distances.has(next)) continue
      distances.set(next, nextDistance)
      queue.push(next)
    }
  }
  return distances
}

// Generic room-graph foundation used by authored dungeon strata. Geography is
// placed first, but no corridor is carved until this graph has selected the
// mandatory route, optional branches and loop edges. That keeps progression
// reasoning independent from tile carving and makes the same graph metadata
// reusable by later dungeon content packages.
function buildDungeonRoomGraph(rooms, cfg = {}) {
  if (!Array.isArray(rooms) || rooms.length < 3) return null
  const minGraphDistance = Math.max(2, Math.floor(cfg.minimumEntranceExitRoomGraphDistance ?? 3))
  if (rooms.length < minGraphDistance + 1) return null
  const branchRange = Array.isArray(cfg.optionalBranchCountRange) ? cfg.optionalBranchCountRange : [1, 3]
  const requestedMinBranches = Math.max(0, Math.floor(branchRange[0] ?? 0))
  const branchCapacity = rooms.length - (minGraphDistance + 1)
  if (branchCapacity < requestedMinBranches) return null
  const maxBranches = Math.max(requestedMinBranches, Math.min(branchCapacity, Math.floor(branchRange[1] ?? branchRange[0] ?? 0)))
  const minBranches = requestedMinBranches
  const branchTarget = maxBranches > 0 ? randInt(minBranches, maxBranches) : 0
  const routeNodeCount = Math.max(minGraphDistance + 1, rooms.length - branchTarget)
  const unused = new Set(rooms.map((_, index) => index).slice(1))
  const mainRoute = [0]
  const treeEdges = []
  const distanceBetween = (a, b) => Math.abs(rooms[a].cx - rooms[b].cx) + Math.abs(rooms[a].cy - rooms[b].cy)

  while (mainRoute.length < routeNodeCount && unused.size) {
    const from = mainRoute[mainRoute.length - 1]
    const candidates = [...unused].map(index => ({index, distance: distanceBetween(from, index)}))
      .sort((a, b) => a.distance - b.distance || a.index - b.index)
    // Prefer nearby rooms so corridors remain readable, while a small seeded
    // candidate band prevents every graph from degenerating into one pattern.
    const band = candidates.slice(0, Math.min(3, candidates.length))
    const chosen = pick(band).index
    treeEdges.push({a: from, b: chosen, kind: 'main'})
    mainRoute.push(chosen)
    unused.delete(chosen)
  }
  if (mainRoute.length < minGraphDistance + 1) return null

  const branchRoots = []
  for (const index of [...unused]) {
    const candidates = mainRoute.slice(0, -1).map(parent => ({parent, distance: distanceBetween(parent, index)}))
      .sort((a, b) => a.distance - b.distance || a.parent - b.parent)
    if (!candidates.length) return null
    const parent = candidates[0].parent
    treeEdges.push({a: parent, b: index, kind: 'branch'})
    branchRoots.push({root: parent, room: index})
    unused.delete(index)
  }

  const graph = {
    entranceRoom: 0,
    exitRoom: mainRoute[mainRoute.length - 1],
    mainRoute: mainRoute.slice(),
    branches: branchRoots,
    edges: treeEdges.map(edge => ({...edge}))
  }
  const existing = new Set(graph.edges.map(edge => edge.a < edge.b ? `${edge.a}:${edge.b}` : `${edge.b}:${edge.a}`))
  const loopPairs = []
  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) {
    if (existing.has(`${a}:${b}`)) continue
    loopPairs.push({a, b, distance: distanceBetween(a, b)})
  }
  loopPairs.sort((a, b) => a.distance - b.distance || a.a - b.a || a.b - b.b)
  const loopLimit = Math.max(0, Math.floor(cfg.loopMaxConnections ?? 0))
  let loopsAdded = 0
  for (const pair of loopPairs) {
    if (loopsAdded >= loopLimit) break
    if (!chance(cfg.loopProbability ?? 0)) continue
    const candidate = {...pair, kind: 'loop'}
    graph.edges.push(candidate)
    const graphDistance = dungeonRoomGraphDistances(graph, graph.entranceRoom).get(graph.exitRoom)
    if (!Number.isFinite(graphDistance) || graphDistance < minGraphDistance) {
      graph.edges.pop()
      continue
    }
    loopsAdded++
  }
  const graphDistance = dungeonRoomGraphDistances(graph, graph.entranceRoom).get(graph.exitRoom)
  if (!Number.isFinite(graphDistance) || graphDistance < minGraphDistance) return null
  graph.graphDistance = graphDistance
  return graph
}

function createDwarvenRuinsFloor(entry, floorIndex, floorCount) {
  const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.layout
  const progress = floorCount <= 1 ? 1 : floorIndex / (floorCount - 1)
  const finalFloor = floorIndex === floorCount - 1
  const storyCfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.story || {}
  const DIRS4 = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  const DIRS8 = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]
  const boundsX = randInt(cfg.boundsXRange[0], cfg.boundsXRange[1])
  const boundsY = randInt(cfg.boundsYRange[0], cfg.boundsYRange[1])
  const minX = Math.max(2, entry.x - boundsX), maxX = Math.min(MAP_W - 3, entry.x + boundsX)
  const minY = Math.max(2, entry.y - boundsY), maxY = Math.min(MAP_H - 3, entry.y + boundsY)
  const cm = blankCaveMap()
  const overlayUnderlays = {}

  const carve = (x, y) => {
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) cm[y][x] = 'marble'
  }
  const carveWide = (x, y, width = 2) => {
    const span = Math.max(2, width)
    for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) {
      carve(x + dx - Math.floor(span / 2), y + dy - Math.floor(span / 2))
    }
  }
  const rooms = []
  const doorways = []
  const [entranceW, entranceH] = cfg.entranceRoomSize
  rooms.push({
    x: Math.max(minX + 1, Math.min(maxX - entranceW, entry.x - Math.floor(entranceW / 2))),
    y: Math.max(minY + 1, Math.min(maxY - entranceH, entry.y - Math.floor(entranceH / 2))),
    w: entranceW, h: entranceH, cx: entry.x, cy: entry.y
  })
  const roomCount = randInt(cfg.roomCountRange[0], cfg.roomCountRange[1])
  for (let attempt = 0; rooms.length < roomCount && attempt < cfg.roomPlacementAttempts; attempt++) {
    const w = randInt(cfg.roomWidthRange[0], cfg.roomWidthRange[1])
    const h = randInt(cfg.roomHeightRange[0], cfg.roomHeightRange[1])
    const minRoomX = minX + cfg.roomBoundsMargin
    const maxRoomX = maxX - w - cfg.roomBoundsMargin
    const minRoomY = minY + cfg.roomBoundsMargin
    const maxRoomY = maxY - h - cfg.roomBoundsMargin
    if (maxRoomX < minRoomX || maxRoomY < minRoomY) continue
    const rx = randInt(minRoomX, maxRoomX), ry = randInt(minRoomY, maxRoomY)
    const candidate = {x: rx, y: ry, w, h, cx: rx + Math.floor(w / 2), cy: ry + Math.floor(h / 2)}
    if (dungeonRoomHasSeparation(rooms, candidate, cfg.roomSeparation)) rooms.push(candidate)
  }
  if (rooms.length < 3) return null
  const roomGraph = buildDungeonRoomGraph(rooms, cfg)
  if (!roomGraph) return null

  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y)
  }

  const connectRoomCenters = (a, b) => carveDungeonRoomConnection(carveWide, a, b, cfg)

  const parentByRoom = new Map()
  for (const edge of roomGraph.edges.filter(edge => edge.kind !== 'loop')) {
    const parent = rooms[edge.a], child = rooms[edge.b]
    if (!parent || !child) return null
    parentByRoom.set(child, parent)
    connectRoomCenters(parent, child)
  }

  // The entrance room stays open. Find the actual corridor crossing each
  // child's perimeter; center-to-center direction alone can point at a wall.
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i], parent = parentByRoom.get(r) || rooms[0]
    const candidates = []
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const vertical = side === 'left' || side === 'right'
      const fixed = side === 'left' ? r.x : side === 'right' ? r.x + r.w - 1 :
        side === 'top' ? r.y : r.y + r.h - 1
      const from = vertical ? r.y + 1 : r.x + 1
      const to = vertical ? r.y + r.h - 3 : r.x + r.w - 3
      const outward = side === 'left' || side === 'top' ? -1 : 1
      for (let offset = from; offset <= to; offset++) {
        const leaves = [offset, offset + 1].map(v => vertical ? {x: fixed, y: v} : {x: v, y: fixed})
        const outside = leaves.map(p => vertical ? {x: p.x + outward, y: p.y} : {x: p.x, y: p.y + outward})
        const inside = leaves.map(p => vertical ? {x: p.x - outward, y: p.y} : {x: p.x, y: p.y - outward})
        if (!outside.every(p => cm[p.y]?.[p.x] === 'marble') ||
            !inside.every(p => cm[p.y]?.[p.x] === 'marble')) continue
        const centerOffset = vertical ? r.cy : r.cx
        const parentFacing = side === 'left' ? parent.cx < r.cx :
          side === 'right' ? parent.cx > r.cx :
          side === 'top' ? parent.cy < r.cy : parent.cy > r.cy
        candidates.push({leaves, score: (parentFacing ? 100 : 0) - Math.abs(offset - centerOffset)})
      }
    }
    if (!candidates.length) return null
    candidates.sort((a, b) => b.score - a.score)
    const doorway = candidates[0].leaves
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      if (xx === r.x || xx === r.x + r.w - 1 || yy === r.y || yy === r.y + r.h - 1) cm[yy][xx] = 'dwarvenwall'
    }
    for (const p of doorway) cm[p.y][p.x] = 'marble'
    doorways.push({leaves: doorway, room: r})
  }

  // Loop decisions were already made in the abstract room graph. Carve them
  // only after primary room walls/doorways exist so the loop creates its own
  // visible secondary connection without changing graph semantics.
  for (const edge of roomGraph.edges.filter(edge => edge.kind === 'loop')) {
    connectRoomCenters(rooms[edge.a], rooms[edge.b])
  }

  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (cm[y][x] === 'cavewall' && DIRS8.some(([dx, dy]) => cm[y + dy]?.[x + dx] === 'marble')) cm[y][x] = 'dwarvenwall'
  }
  cm[entry.y][entry.x] = 'dwarvenstairsup'

  const collapseBase = randInt(cfg.collapseAttemptsRange[0], cfg.collapseAttemptsRange[1])
  const rubbleProgressMultiplier = dungeonProgressMultiplier(storyCfg.rubbleProgressMultiplierRange, progress, 1)
  const rubbleMultiplier = finalFloor ? Math.max(rubbleProgressMultiplier, Number(storyCfg.finalFloorRubbleMultiplier ?? 1)) : rubbleProgressMultiplier
  const collapseAttempts = Math.max(1, Math.round(collapseBase * rubbleMultiplier))
  for (let i = 0; i < collapseAttempts; i++) {
    const x = randInt(minX + 2, maxX - 2), y = randInt(minY + 2, maxY - 2)
    if (cm[y][x] !== 'marble') continue
    if (Math.abs(x - entry.x) + Math.abs(y - entry.y) <= cfg.collapseMinEntranceDistance) continue
    const rubble = chance(cfg.rubbleChance)
    if (rubble) overlayUnderlays[keyXY(x, y)] = cm[y][x]
    cm[y][x] = rubble ? 'dwarvenrubble' : 'dwarvenwall'
  }

  // Repair any collapse/wall combination that detached an outer walkable tile.
  const reachable = () => dungeonWalkDistances(cm, entry)
  const outerTiles = []
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (!TILE[cm[y]?.[x]]?.walk) continue
    if (DIRS4.some(([dx, dy]) => !TILE[cm[y + dy]?.[x + dx]]?.walk)) outerTiles.push({x, y})
  }
  let distances = reachable()
  for (const tile of outerTiles) {
    if (distances.has(keyXY(tile.x, tile.y))) continue
    let best = null
    for (const [key, distance] of distances.entries()) {
      const [rx, ry] = key.split(',').map(Number)
      const d = Math.abs(rx - tile.x) + Math.abs(ry - tile.y)
      if (!best || d < best.d) best = {x: rx, y: ry, d, distance}
    }
    if (!best) return null
    let cx = tile.x, cy = tile.y
    const repair = (x, y) => {
      carve(x, y); carve(x + 1, y); carve(x, y + 1); carve(x + 1, y + 1)
    }
    while (cx !== best.x) { repair(cx, cy); cx += Math.sign(best.x - cx) }
    while (cy !== best.y) { repair(cx, cy); cy += Math.sign(best.y - cy) }
    repair(best.x, best.y)
    cm[entry.y][entry.x] = 'dwarvenstairsup'
    distances = reachable()
  }

  const minimumWalkingDistance = Math.max(1, Math.floor(cfg.minimumEntranceExitWalkingDistance ?? 1))
  const graphExitRoom = rooms[roomGraph.exitRoom]
  if (!graphExitRoom) return null
  const exitCandidates = []
  for (let y = graphExitRoom.y + 1; y < graphExitRoom.y + graphExitRoom.h - 1; y++) {
    for (let x = graphExitRoom.x + 1; x < graphExitRoom.x + graphExitRoom.w - 1; x++) {
      const distance = distances.get(keyXY(x, y))
      if (!Number.isFinite(distance) || distance < minimumWalkingDistance) continue
      if (cm[y]?.[x] !== 'marble') continue
      exitCandidates.push({x, y, distance})
    }
  }
  if (!exitCandidates.length) return null

  // The abstract graph chooses the exit room; tile distance only chooses a
  // sensible stair position within that already-selected destination room.
  const maxDistance = Math.max(...exitCandidates.map(p => p.distance))
  const farCandidates = exitCandidates.filter(p => p.distance >= Math.max(minimumWalkingDistance, maxDistance - cfg.exitFarCandidateBand))
  const exit = pick(farCandidates)
  cm[exit.y][exit.x] = finalFloor ? 'dwarvenminessealed' : 'dwarvenstairsdown'

  const doorCfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.doors || {}
  const floorZ = chainZForDepth(floorIndex + 4)

  // Every Ruins floor has one mandatory progression gate on a two-tile room
  // entrance that genuinely separates the entrance side from the deeper exit.
  // Blocking both leaves and recomputing reachability makes the gate structural,
  // rather than decorative: there must be no alternate corridor around it.
  const structuralDoors = []
  for (const {leaves: doorway, room} of doorways) {
    if (doorway.length !== 2 || doorway.some(p => cm[p.y]?.[p.x] !== 'marble')) continue
    const blocked = new Set(doorway.map(p => keyXY(p.x, p.y)))
    const interior = {x: room.cx, y: room.cy}
    if (!dungeonWalkDistances(cm, entry).has(keyXY(interior.x, interior.y))) continue
    const after = dungeonWalkDistances(cm, entry, blocked)
    if (after.has(keyXY(interior.x, interior.y))) continue
    structuralDoors.push({leaves: doorway, room,
      blocksExit: !after.has(keyXY(exit.x, exit.y))})
  }
  const mainRouteRooms = new Set(roomGraph.mainRoute.map(index => rooms[index]))
  const gateCandidates = structuralDoors.filter(d => d.blocksExit && mainRouteRooms.has(d.room)).map(d => d.leaves)
  if (!gateCandidates.length) return null
  const gateDoorway = pick(gateCandidates)
  const gateKeyId = dwarvenDungeonLockId(floorZ, 'gate', gateDoorway)
  const gatePreBreached = chance(doorCfg.progressionGatePreBreachedChance ?? 0)
  for (const p of gateDoorway) cm[p.y][p.x] = gatePreBreached ? 'dwarvengatebreached' : 'dwarvengatelocked'

  // Intact gates choose a progression-key scenario after rooms/vaults are
  // known. The key can be carried by a champion, hidden in searchable remains,
  // guarded by a trap-side room, or placed behind one reachable local lock.
  let progressionKey = null
  let progressionKeyPlan = gatePreBreached ? null : {keyId: gateKeyId, mode: null}

  const doorwayByRoom = new Map()
  for (const {leaves, room} of doorways) {
    if (!doorwayByRoom.has(room)) doorwayByRoom.set(room, [])
    doorwayByRoom.get(room).push(leaves.map(p => ({x:p.x,y:p.y})))
  }
  const roomMetas = rooms.map((room, index) => ({
    id: `dwarven-room:${floorZ}:${index}`,
    index,
    x: room.x,
    y: room.y,
    w: room.w,
    h: room.h,
    cx: room.cx,
    cy: room.cy,
    archetype: index === 0 ? 'Entrance Hall' : dwarvenRoomArchetypeForProgress(progress, finalFloor),
    doorways: doorwayByRoom.get(room) || [],
    connectionCount: dungeonRoomGraphDegree(roomGraph, index),
    onMainRoute: roomGraph.mainRoute.includes(index),
    optional: index > 0 && !roomGraph.mainRoute.includes(index),
    vaultType: null,
    vaultLabel: null,
    tacticalSlots: null,
    _source: room
  }))
  const roomMetaBySource = new Map(roomMetas.map(room => [room._source, room]))
  const vaultSelection = selectDungeonVaults('dwarvenRuins', cm, roomMetas, structuralDoors, gateDoorway, progress, floorZ, finalFloor, {
    buildZones: dwarvenVaultInternalZones,
    buildSlots: deriveDwarvenTacticalSlots,
    entrances: [entry, exit]
  })
  if (!vaultSelection) return null
  const vaults = vaultSelection.vaults
  const artifactRoom = vaultSelection.artifactRoom
  const roomCfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.rooms?.archetypes || {}
  const vaultCfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.vaults?.definitions || {}
  const keyCfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.progressionKeys || {}

  let progressionSideDoorway = null
  let progressionSideRoom = null
  let progressionForceUnlocked = false
  if (progressionKeyPlan) {
    const modeWeights = keyCfg.modes || {remains: 1}
    const entranceSideReach = dungeonWalkDistances(cm, entry)
    const structuralByRoom = new Map(structuralDoors.filter(d => d.leaves !== gateDoorway).map(d => [d.room, d]))
    const entranceSideRooms = roomMetas.filter(room => room.index > 0 &&
      entranceSideReach.has(keyXY(room.cx, room.cy)) && room._source !== structuralDoors.find(d => d.leaves === gateDoorway)?.room)
    const sideRooms = entranceSideRooms.filter(room => room.optional && structuralByRoom.has(room._source))
    const unlockedSideRooms = sideRooms.filter(room =>
      (vaultCfg[room.vaultType]?.doorRequirement || 'any') !== 'locked')
    const eligibleModes = []
    if (entranceSideRooms.length && Number(modeWeights.championCarrier) > 0) eligibleModes.push('championCarrier')
    if (Number(modeWeights.remains) > 0) eligibleModes.push('remains')
    if (unlockedSideRooms.length && Number(modeWeights.trapGuardedSideRoom) > 0) eligibleModes.push('trapGuardedSideRoom')
    if (sideRooms.length && Number(modeWeights.lockedSideRoom) > 0) eligibleModes.push('lockedSideRoom')
    if (!eligibleModes.length) return null
    const mode = pickWeighted(eligibleModes, value => Math.max(0.0001, Number(modeWeights[value]) || 0))
    progressionKeyPlan.mode = mode
    if (mode === 'championCarrier') {
      const ordered = entranceSideRooms.slice().sort((a, b) =>
        (Math.abs(b.cx-entry.x)+Math.abs(b.cy-entry.y)) - (Math.abs(a.cx-entry.x)+Math.abs(a.cy-entry.y)))
      progressionSideRoom = ordered[0]
      progressionKeyPlan.targetRoomId = progressionSideRoom.id
      const structural = structuralByRoom.get(progressionSideRoom._source)
      if (structural) { progressionSideDoorway = structural.leaves; progressionForceUnlocked = true }
    } else if (mode === 'trapGuardedSideRoom' || mode === 'lockedSideRoom') {
      const pool = mode === 'trapGuardedSideRoom' ? unlockedSideRooms : sideRooms
      progressionSideRoom = pick(pool)
      progressionSideDoorway = structuralByRoom.get(progressionSideRoom._source)?.leaves || null
      if (!progressionSideDoorway) return null
      progressionKeyPlan.targetRoomId = progressionSideRoom.id
      progressionForceUnlocked = mode === 'trapGuardedSideRoom'
      if (mode === 'trapGuardedSideRoom') {
        progressionKeyPlan.trapGuarded = true
        progressionKeyPlan.guardPoint = dwarvenRoomEntryPoint(cm, progressionSideRoom)
      }
    }
  }

  // Ordinary doors roll once per physical two-leaf doorway. If that doorway
  // becomes locked, both leaves share the same derived lock ID so the player
  // cannot bypass the lock by using the adjacent leaf.
  const doorChance = doorCfg.ordinaryDoorChance ?? 0
  const lockedDoorChance = doorCfg.ordinaryLockedDoorChance ?? 0
  const ordinaryLocks = []
  for (const {leaves: doorway, room} of structuralDoors) {
    if (doorway === gateDoorway) continue
    if (doorway.length !== 2 || doorway.some(p => cm[p.y]?.[p.x] !== 'marble')) continue
    const meta = roomMetaBySource.get(room)
    const vault = vaults.find(candidate => candidate.roomId === meta?.id) || null
    const vaultDoorRequirement = vaultCfg[meta?.vaultType]?.doorRequirement || 'any'
    const forcedProgressionLock = progressionKeyPlan?.mode === 'lockedSideRoom' && doorway === progressionSideDoorway
    const forcedProgressionUnlocked = progressionForceUnlocked && doorway === progressionSideDoorway
    const forceLocked = forcedProgressionLock || vaultDoorRequirement === 'locked'
    const forceClosedUnlocked = !forceLocked && (forcedProgressionUnlocked || vaultDoorRequirement === 'closed')
    if (!forceLocked && !forceClosedUnlocked && !chance(doorChance)) continue
    const breachedProgressMultiplier = dungeonProgressMultiplier(storyCfg.breachedDoorProgressMultiplierRange, progress, 1)
    const breachedMultiplier = finalFloor ? Math.max(breachedProgressMultiplier, Number(storyCfg.finalFloorBreachedDoorMultiplier ?? 1)) : breachedProgressMultiplier
    const breachedChance = Math.min(1, (doorCfg.ordinaryBreachedDoorChance ?? 0) * breachedMultiplier)
    if (!forceLocked && !forceClosedUnlocked && chance(breachedChance)) {
      for (const p of doorway) cm[p.y][p.x] = 'dwarvendoorbreached'
      continue
    }
    const archetypeLockMultiplier = Number(roomCfg[meta?.archetype]?.lockMultiplier ?? 1)
    const vaultLockMultiplier = Number(vaultCfg[meta?.vaultType]?.lockMultiplier ?? 1)
    const locked = forceLocked || (!forceClosedUnlocked &&
      chance(Math.min(1, lockedDoorChance * archetypeLockMultiplier * vaultLockMultiplier)))
    for (const p of doorway) cm[p.y][p.x] = locked ? 'dwarvendoorlocked' : 'dwarvendoorclosed'
    if (vault && (vaultDoorRequirement === 'closed' || vaultDoorRequirement === 'locked')) {
      vault.entranceDoorLeaves = doorway.map(p => ({x:p.x,y:p.y}))
    }
    if (locked) ordinaryLocks.push({
      leaves: doorway.map(p => ({x: p.x, y: p.y})),
      keyId: dwarvenDungeonLockId(floorZ, 'door', doorway),
      roomId: meta?.id || null,
      vaultId: vaults.find(vault => vault.roomId === meta?.id)?.id || null,
      progressionSideLock: forcedProgressionLock
    })
  }

  // Ordinary lock keys are chosen only from the component reachable from the
  // floor entrance while *all* generated locks remain closed. This prevents a
  // key from spawning behind its own door or behind another locked doorway,
  // eliminating circular key dependencies.
  const ordinaryKeys = []
  if (ordinaryLocks.length) {
    const reachable = dungeonWalkDistances(cm, entry)
    const reservedKeys = new Set()
    const candidates = []
    for (const [key, distance] of reachable.entries()) {
      if (distance <= 0) continue
      const [x, y] = key.split(',').map(Number)
      if (cm[y]?.[x] !== 'marble') continue
      if (x === exit.x && y === exit.y) continue
      if (doorways.some(({leaves}) => leaves.some(p => p.x === x && p.y === y))) continue
      candidates.push({x, y})
    }
    if (candidates.length < ordinaryLocks.length) return null
    for (const lock of ordinaryLocks) {
      const available = candidates.filter(p => !reservedKeys.has(keyXY(p.x, p.y)))
      if (!available.length) return null
      const spot = pick(available)
      reservedKeys.add(keyXY(spot.x, spot.y))
      ordinaryKeys.push({x: spot.x, y: spot.y, keyId: lock.keyId})
    }
  }

  if (progressionKeyPlan) {
    const usedKeyTiles = new Set(ordinaryKeys.map(key => keyXY(key.x, key.y)))
    const validKeyTile = (x, y) => cm[y]?.[x] === 'marble' && !usedKeyTiles.has(keyXY(x, y)) &&
      !(x === entry.x && y === entry.y) && !(x === exit.x && y === exit.y) &&
      !doorways.some(({leaves}) => leaves.some(p => p.x === x && p.y === y))
    if (progressionKeyPlan.mode === 'lockedSideRoom') {
      const sideLock = ordinaryLocks.find(lock => lock.progressionSideLock)
      if (!sideLock || !progressionSideRoom) return null
      progressionKeyPlan.requiresLockId = sideLock.keyId
      const candidates = dwarvenRoomInterior(progressionSideRoom).filter(p => validKeyTile(p.x, p.y))
      if (!candidates.length) return null
      const spot = pick(candidates)
      progressionKey = {...progressionKeyPlan, x:spot.x, y:spot.y}
    } else if (progressionKeyPlan.mode === 'trapGuardedSideRoom') {
      if (!progressionSideRoom) return null
      const candidates = dwarvenRoomInterior(progressionSideRoom).filter(p => validKeyTile(p.x, p.y))
      if (!candidates.length) return null
      const spot = pick(candidates)
      progressionKey = {...progressionKeyPlan, x:spot.x, y:spot.y}
    } else if (progressionKeyPlan.mode === 'remains') {
      const reachable = dungeonWalkDistances(cm, entry)
      const candidates = [...reachable.keys()].map(key => {
        const [x, y] = key.split(',').map(Number)
        return {x, y, distance:reachable.get(key)}
      }).filter(p => p.distance > 0 && validKeyTile(p.x, p.y))
      if (!candidates.length) return null
      const maxDistance = Math.max(...candidates.map(p => p.distance))
      const farBand = Math.max(0, Math.floor(keyCfg.remainsFarCandidateBand ?? 8))
      const remote = candidates.filter(p => p.distance >= Math.max(1, maxDistance - farBand))
      const spot = pick(remote.length ? remote : candidates)
      progressionKey = {...progressionKeyPlan, x:spot.x, y:spot.y}
    } else if (progressionKeyPlan.mode === 'championCarrier') {
      if (!progressionKeyPlan.targetRoomId) return null
      progressionKey = {...progressionKeyPlan}
    } else return null
  }

  const reserved = new Set([
    keyXY(entry.x, entry.y),
    keyXY(exit.x, exit.y),
    ...(progressionKey && Number.isInteger(progressionKey.x) && Number.isInteger(progressionKey.y)
      ? [keyXY(progressionKey.x, progressionKey.y)] : []),
    ...ordinaryKeys.map(k => keyXY(k.x, k.y))
  ])
  for (const room of roomMetas) {
    decorateDwarvenRoomTerrain(cm, room, progress, finalFloor, reserved, overlayUnderlays)
    if (room.archetype === 'Prison' && (room.prisonCellGenerationFailed || !room.prisonCellDoorCandidate)) return null
  }
  if (!addDwarvenRoomInternalLocks(cm, roomMetas, vaults, entry, floorZ, ordinaryLocks, ordinaryKeys, reserved)) return null
  for (const room of roomMetas.filter(room => room.archetype === 'Prison')) {
    const hasBars = dwarvenRoomInterior(room).some(p => cm[p.y]?.[p.x] === 'dwarvenprisonbars')
    const hasCellDoor = (room.internalLocks || []).some(lock => lock.kind === 'prisonCell') ||
      (room.internalDoors || []).some(door => door.kind === 'prisonCell')
    if (!hasBars || !hasCellDoor) return null
  }
  for (const room of roomMetas) {
    if (room.index === 0) continue
    const vault = vaults.find(v => v.roomId === room.id)
    room.tacticalSlots = deriveDwarvenTacticalSlots(cm, room, vault?.roles || null)
    if (vault) vault.slots = structuredClone(room.tacticalSlots)
    if (vault?.roles?.backline > 0 && !(vault.slots.backline || []).some(p =>
      [entry, exit].every(e => Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) >
        (WORLD_GEN_CONFIG.dungeons.dwarvenRuins.encounters?.entranceClearance ?? 0)))) return null
  }

  // Dressing, rubble and locks may reshape optional spaces, but may never
  // invalidate a mandatory key or the eventual route to the exit.
  const closedReach = dungeonWalkDistances(cm, entry)
  if (progressionKey?.mode === 'remains' && !closedReach.has(keyXY(progressionKey.x, progressionKey.y))) return null
  if (ordinaryKeys.some(key => !closedReach.has(keyXY(key.x, key.y)))) return null
  const eventualReach = dungeonWalkDistancesWithDoorTraversal(cm, entry)
  if (!eventualReach.has(keyXY(exit.x, exit.y))) return null
  for (const room of roomMetas) for (const slots of Object.values(room.tacticalSlots || {})) {
    if ((slots || []).some(p => cm[p.y]?.[p.x] !== 'marble')) return null
  }

  const serializableRooms = roomMetas.map(({_source, ...room}) => room)
  const serializableArtifactRoom = artifactRoom
    ? serializableRooms.find(room => room.id === artifactRoom.id) || null
    : null
  let artifactSpot = null
  if (artifactRoom) {
    const tacticalKeys = new Set(Object.values(artifactRoom.tacticalSlots || {}).flat().map(p => keyXY(p.x, p.y)))
    const artifactCandidates = dwarvenRoomInterior(artifactRoom).filter(p =>
      cm[p.y]?.[p.x] === 'marble' && eventualReach.has(keyXY(p.x, p.y)) &&
      !reserved.has(keyXY(p.x, p.y)) && !tacticalKeys.has(keyXY(p.x, p.y)))
    if (!artifactCandidates.length) return null
    artifactSpot = pick(artifactCandidates)
  }
  const serializableRoomGraph = {
    entranceRoomId: serializableRooms[roomGraph.entranceRoom]?.id || null,
    exitRoomId: serializableRooms[roomGraph.exitRoom]?.id || null,
    graphDistance: roomGraph.graphDistance,
    mainRoute: roomGraph.mainRoute.map(index => serializableRooms[index]?.id).filter(Boolean),
    branches: roomGraph.branches.map(branch => ({
      rootRoomId: serializableRooms[branch.root]?.id || null,
      roomId: serializableRooms[branch.room]?.id || null
    })).filter(branch => branch.rootRoomId && branch.roomId),
    edges: roomGraph.edges.map(edge => ({
      aRoomId: serializableRooms[edge.a]?.id || null,
      bRoomId: serializableRooms[edge.b]?.id || null,
      kind: edge.kind
    })).filter(edge => edge.aRoomId && edge.bRoomId)
  }
  const descriptor = {
    x: entry.x,
    y: entry.y,
    entrances: [{x: entry.x, y: entry.y}, {x: exit.x, y: exit.y}],
    dwarvenRuins: true,
    dungeonPackage: 'dwarvenRuins',
    dungeonFloor: floorIndex + 1,
    floorCount,
    progress,
    rooms: serializableRooms,
    roomGraph: structuredClone(serializableRoomGraph),
    vaults: structuredClone(vaults),
    artifactRoomId: serializableArtifactRoom?.id || null
  }
  const discovered = Array.from({length: MAP_H}, () => new Array(MAP_W).fill(false))
  return {
    map: cm,
    caveMaps: [cm],
    caves: [descriptor],
    discovered,
    kind: 'dwarvenRuins',
    dungeonPackage: 'dwarvenRuins',
    dungeonFloor: floorIndex + 1,
    floorCount,
    progress,
    progressionKey,
    ordinaryKeys,
    rooms: serializableRooms,
    roomGraph: structuredClone(serializableRoomGraph),
    vaults: structuredClone(vaults),
    artifactRoomId: serializableArtifactRoom?.id || null,
    _artifactRoom: serializableArtifactRoom,
    _artifactSpot: artifactSpot,
    // Local, visual-only underlays; committed only after this generated floor
    // has passed validation (failed generation retries must not leak entries).
    _overlayUnderlays: overlayUnderlays,
    // Only needed during world creation; actors themselves persist in saves.
    _encounterRooms: serializableRooms,
    _doorways: structuralDoors.map(d => ({leaves: d.leaves, room: {x:d.room.cx,y:d.room.cy}}))
  }
}

function placeDwarvenRuinsFortDescent() {
  const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.layout
  const fort = deepLevels[1]
  if (!fort || !dwarvenRuin || dwarvenRuin.caveIndex < 0) return null
  const distances = dungeonWalkDistances(fort.map, dwarvenRuin)
  const candidates = []
  for (const [key, distance] of distances.entries()) {
    if (distance < cfg.minimumEntranceExitWalkingDistance) continue
    const [x, y] = key.split(',').map(Number)
    if (fort.map[y]?.[x] !== 'marble') continue
    if (enemies.some(e => e.alive && e.level === -3 && e.x === x && e.y === y)) continue
    if (groundItems.some(g => (g.level ?? 0) === -3 && g.x === x && g.y === y)) continue
    candidates.push({x, y, distance})
  }
  if (!candidates.length) return null
  const maxDistance = Math.max(...candidates.map(p => p.distance))
  const far = candidates.filter(p => p.distance >= Math.max(cfg.minimumEntranceExitWalkingDistance, maxDistance - cfg.exitFarCandidateBand))
  const stair = pick(far)
  fort.map[stair.y][stair.x] = 'dwarvenstairsdown'
  const local = fort.caveMaps[dwarvenRuin.caveIndex]
  if (local?.[stair.y]) local[stair.y][stair.x] = 'dwarvenstairsdown'
  return {x: stair.x, y: stair.y}
}

function placeDwarvenRuinsLift(levelCount) {
  const shortcutCfg = WORLD_GEN_CONFIG.dungeons?.dwarvenRuins?.shortcut || {}
  const progressRange = shortcutCfg.targetFloorProgressRange || [0.5, 1]
  if (levelCount < 2 || !deepLevels[2]) return false

  const minFloor = Math.max(2, Math.min(levelCount, Math.ceil(levelCount * progressRange[0])))
  const maxFloor = Math.max(minFloor, Math.min(levelCount, Math.ceil(levelCount * progressRange[1])))
  const targetFloor = randInt(minFloor, maxFloor)
  const upperIndex = 2
  const lowerIndex = targetFloor + 1
  const upperLevel = deepLevels[upperIndex]
  const lowerLevel = deepLevels[lowerIndex]
  if (!upperLevel || !lowerLevel) return false

  const occupiedGround = (z) => new Set(groundItems.filter(g => (g.level ?? 0) === z).map(g => keyXY(g.x, g.y)))
  const upperZ = chainZForDepth(4)
  const lowerZ = chainZForDepth(targetFloor + 3)
  const upperGround = occupiedGround(upperZ)
  const lowerGround = occupiedGround(lowerZ)

  const endpointCandidates = (level, ground, requireWall, reachable = null) => {
    const out = []
    for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
      if (level.map[y]?.[x] !== 'marble' || ground.has(keyXY(x, y))) continue
      if (reachable && !reachable.has(keyXY(x, y))) continue
      const wallNeighbors = [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => ({x:x+dx,y:y+dy}))
        .filter(p => level.map[p.y]?.[p.x] === 'dwarvenwall')
      if (requireWall && !wallNeighbors.length) continue
      out.push({x, y, wallNeighbors})
    }
    return out
  }

  // The upper platform belongs on the entrance side of D1's intact locks so
  // the unlocked lift is a true shortcut back toward the Fort, not a landing
  // point stranded behind D1's progression gate.
  const upperReachable = dungeonWalkDistances(upperLevel.map, upperLevel.caves[0].entrances[0])
  const upperCandidates = endpointCandidates(upperLevel, upperGround, false, upperReachable)
  const lowerCandidates = endpointCandidates(lowerLevel, lowerGround, true)
  if (!upperCandidates.length || !lowerCandidates.length) return false
  const upper = pick(upperCandidates)
  const lower = pick(lowerCandidates)
  const lever = pick(lower.wallNeighbors)

  upperLevel.map[upper.y][upper.x] = 'dwarvenliftoff'
  lowerLevel.map[lower.y][lower.x] = 'dwarvenliftoff'
  lowerLevel.map[lever.y][lever.x] = 'dwarvenlever'
  dungeonShortcuts.push({
    id: shortcutCfg.id || 'dwarven-ruins-lift-1',
    packageId: 'dwarvenRuins',
    kind: 'lift',
    unlocked: false,
    upper: {floor: 1, z: upperZ, x: upper.x, y: upper.y},
    lower: {floor: targetFloor, z: lowerZ, x: lower.x, y: lower.y},
    lever: {z: lowerZ, x: lever.x, y: lever.y}
  })
  return true
}

function buildDwarvenRuinsStratum() {
  const cfg = WORLD_GEN_CONFIG.dungeons?.dwarvenRuins
  if (!cfg || !deepLevels[1]) return false
  deepLevels[0].kind = 'caves'
  deepLevels[1].kind = 'dwarvenFort'
  deepLevels[1].dungeonFloor = 0
  deepLevels[1].progress = 0

  const levelCount = randInt(cfg.levelCountRange[0], cfg.levelCountRange[1])
  let entry = placeDwarvenRuinsFortDescent()
  if (!entry) return false
  for (let floorIndex = 0; floorIndex < levelCount; floorIndex++) {
    let level = null
    for (let attempt = 0; attempt < cfg.floorGenerationRetries && !level; attempt++) {
      level = createDwarvenRuinsFloor(entry, floorIndex, levelCount)
    }
    if (!level) return false
    const z = chainZForDepth(floorIndex + 4)
    for (const [xy, floor] of Object.entries(level._overlayUnderlays || {})) {
      const [x, y] = xy.split(',').map(Number)
      if (['dwarvenrubble', 'dwarvenstatue'].includes(level.map[y]?.[x]))
        tileUnderlays[`${z}:${xy}`] = floor
    }
    delete level._overlayUnderlays
    deepLevels.push(level)
    if (level.progressionKey) {
      const key = level.progressionKey
      const z = chainZForDepth(floorIndex + 4)
      if (key.mode === 'remains') {
        groundItems.push({
          x:key.x,y:key.y,level:z,levelKind:'chain',caveIndex:-1,kind:'skeleton',looted:false,hasLoot:false,
          dungeonKey:{kind:'dwarvenkey',keyId:key.keyId,progressionKey:true},
          description:'A dead dwarf still grips a small iron key beneath its ribs.'
        })
      } else if (key.mode !== 'championCarrier') {
        groundItems.push({
          x:key.x,y:key.y,level:z,levelKind:'chain',caveIndex:-1,kind:'dwarvenkey',keyId:key.keyId,
          progressionKey:true,progressionKeyMode:key.mode
        })
      }
    }
    for (const ordinaryKey of level.ordinaryKeys || []) {
      groundItems.push({
        x: ordinaryKey.x,
        y: ordinaryKey.y,
        level: chainZForDepth(floorIndex + 4),
        levelKind: 'chain',
        caveIndex: -1,
        kind: 'dwarvenkey',
        keyId: ordinaryKey.keyId,
        ordinaryDoorKey: true
      })
    }
    if (level._artifactSpot) {
      const lootCfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.loot
      groundItems.push({
        x: level._artifactSpot.x,
        y: level._artifactSpot.y,
        level: chainZForDepth(floorIndex + 4),
        levelKind: 'chain',
        caveIndex: -1,
        kind: 'chest',
        tier: lootCfg.artifactTier,
        opened: false,
        artifactGuaranteed: true,
        dwarvenRuinsArtifact: true,
        vaultId: level.vaults.find(vault => vault.artifactReserved)?.id || null
      })
    }
    spawnDwarvenRuinsRoomProps(level, chainZForDepth(floorIndex + 4))
    const descriptor = level.caves[0]
    if (floorIndex < levelCount - 1) {
      const down = descriptor.entrances[1]
      entry = {x: down.x, y: down.y}
    }
  }
  if (!placeDwarvenRuinsLift(levelCount)) return false
  if (!DungeonTraps.generate()) return false
  return true
}

// Organic grotto chambers and winding passages, using the world seed.
function carveDeepDungeon(spot, floorTile, reserved) {
  const cfg = WORLD_GEN_CONFIG.caves.deep.grotto
  const DIRS4 = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  const sizes = cfg.sizes.map(size => size.slice())
  for (let i = sizes.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    ;[sizes[i], sizes[j]] = [sizes[j], sizes[i]]
  }
  for (const [w, h] of sizes) {
    const anchors = [[9, 9], [w - 10, 9], [9, h - 10], [w - 10, h - 10],
      [Math.floor(w / 2), 9], [Math.floor(w / 2), h - 10],
      [9, Math.floor(h / 2)], [w - 10, Math.floor(h / 2)],
      [Math.floor(w / 2), Math.floor(h / 2)]]
    for (let i = anchors.length - 1; i > 0; i--) {
      const j = randInt(0, i)
      ;[anchors[i], anchors[j]] = [anchors[j], anchors[i]]
    }
    for (const [ax, ay] of anchors) {
      const bounds = {x1: spot.x - ax, y1: spot.y - ay}
      bounds.x2 = bounds.x1 + w - 1
      bounds.y2 = bounds.y1 + h - 1
      if (bounds.x1 < 2 || bounds.y1 < 2 || bounds.x2 >= MAP_W - 2 || bounds.y2 >= MAP_H - 2) continue
      if (reserved.some(r => bounds.x1 <= r.x2 + cfg.reservedPadding && bounds.x2 >= r.x1 - cfg.reservedPadding &&
        bounds.y1 <= r.y2 + cfg.reservedPadding && bounds.y2 >= r.y1 - cfg.reservedPadding)) continue

      // Choose separated centers first. Chambers can meet at their ragged
      // edges; this makes open caverns without square room boundaries.
      const targetRooms = Math.max(cfg.minRooms, Math.round(w * h / cfg.roomDensityDivisor) + cfg.roomCountBonus)
      const rooms = [{cx: spot.x, cy: spot.y}]
      for (let tries = 0; tries < cfg.roomPlacementTries && rooms.length < targetRooms; tries++) {
        const cx = randInt(bounds.x1 + cfg.roomCenterMargin, bounds.x2 - cfg.roomCenterMargin)
        const cy = randInt(bounds.y1 + cfg.roomCenterMargin, bounds.y2 - cfg.roomCenterMargin)
        if (rooms.some(r => (r.cx - cx) ** 2 + (r.cy - cy) ** 2 < cfg.minCenterDistanceSquared)) continue
        rooms.push({cx, cy})
      }
      if (rooms.length < Math.max(cfg.minAcceptedRooms, targetRooms - cfg.acceptedRoomShortfall)) continue
      const cm = blankCaveMap()
      for (const room of rooms) {
        const rx = randInt(cfg.roomRadiusXRange[0], cfg.roomRadiusXRange[1]), ry = randInt(cfg.roomRadiusYRange[0], cfg.roomRadiusYRange[1])
        room.x1 = Math.max(bounds.x1 + 1, room.cx - rx)
        room.x2 = Math.min(bounds.x2 - 1, room.cx + rx)
        room.y1 = Math.max(bounds.y1 + 1, room.cy - ry)
        room.y2 = Math.min(bounds.y2 - 1, room.cy + ry)
        // Angular radius changes every few tiles; the center always stays
        // open, while the wall becomes lobed rather than rectangular.
        const edge = Array.from({length: cfg.edgeSamples}, () => randInt(cfg.edgeVariancePercentRange[0], cfg.edgeVariancePercentRange[1]) / 100)
        for (let y = room.y1; y <= room.y2; y++) for (let x = room.x1; x <= room.x2; x++) {
          const dx = (x - room.cx) / rx, dy = (y - room.cy) / ry
          const angle = Math.floor((Math.atan2(dy, dx) + Math.PI) * cfg.edgeSamples / (2 * Math.PI)) % cfg.edgeSamples
          if (dx * dx + dy * dy <= (cfg.baseRadius + edge[angle]) ** 2)
            cm[y][x] = floorTile
        }
        cm[room.cy][room.cx] = floorTile
      }
      // Step toward an offset midpoint and then the target; varied passage
      // widths and turns keep the links from reading as grid-aligned halls.
      const passage = (from, to) => {
        const mid = {x: Math.round((from.cx + to.cx) / 2) + randInt(-cfg.passageMidpointJitter, cfg.passageMidpointJitter),
          y: Math.round((from.cy + to.cy) / 2) + randInt(-cfg.passageMidpointJitter, cfg.passageMidpointJitter)}
        const brush = (x, y, width) => {
          for (let yy = y - 1; yy <= y + width - 2; yy++)
            for (let xx = x - 1; xx <= x + width - 2; xx++)
              if (xx > bounds.x1 && xx < bounds.x2 && yy > bounds.y1 && yy < bounds.y2)
                cm[yy][xx] = floorTile
        }
        let x = from.cx, y = from.cy, step = 0
        for (const goal of [mid, {x: to.cx, y: to.cy}]) {
          while (x !== goal.x || y !== goal.y) {
            const moveX = x !== goal.x && (y === goal.y || chance(cfg.passageHorizontalChance))
            if (moveX) x += Math.sign(goal.x - x)
            else y += Math.sign(goal.y - y)
            brush(x, y, step++ % cfg.passageWideCycle < cfg.passageWideSteps ? 3 : 2)
          }
        }
      }
      const connected = [rooms[0]]
      const remaining = rooms.slice(1)
      while (remaining.length) {
        let best = null, score = Infinity
        for (const r of remaining) for (const parent of connected) {
          const d = (r.cx - parent.cx) ** 2 + (r.cy - parent.cy) ** 2
          if (d < score) { score = d; best = {r, parent} }
        }
        passage(best.parent, best.r)
        connected.push(best.r)
        remaining.splice(remaining.indexOf(best.r), 1)
      }
      for (let i = 0; i < cfg.extraConnections; i++) {
        const a = pick(rooms), b = pick(rooms)
        if (a !== b) passage(a, b)
      }
      // Jagged chamber edges can leave tiny isolated floor fragments. Keep
      // only the continuous grotto reached from the staircase.
      const reachable = new Set([keyXY(spot.x, spot.y)]), flood = [spot]
      for (let i = 0; i < flood.length; i++) for (const [dx, dy] of DIRS4) {
        const x = flood[i].x + dx, y = flood[i].y + dy, key = keyXY(x, y)
        if (cm[y]?.[x] !== floorTile || reachable.has(key)) continue
        reachable.add(key)
        flood.push({x, y})
      }
      for (let y = bounds.y1; y <= bounds.y2; y++)
        for (let x = bounds.x1; x <= bounds.x2; x++)
          if (cm[y][x] === floorTile && !reachable.has(keyXY(x, y))) cm[y][x] = 'cavewall'
      // A water pocket is only accepted if all dry tiles remain reachable.
      let hasWater = false
      if (chance(cfg.waterChance)) {
        const candidates = rooms.slice(1)
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = randInt(0, i)
          ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
        }
        for (const r of candidates) {
          const wx = r.cx + randInt(-cfg.waterCenterJitter, cfg.waterCenterJitter), wy = r.cy + randInt(-cfg.waterCenterJitter, cfg.waterCenterJitter)
          const cells = []
          for (let dy = -cfg.waterRadiusY; dy <= cfg.waterRadiusY; dy++) for (let dx = -cfg.waterRadiusX; dx <= cfg.waterRadiusX; dx++) {
            const x = wx + dx, y = wy + dy
            if (cm[y]?.[x] === floorTile && dx * dx / (cfg.waterRadiusX ** 2) + dy * dy / (cfg.waterRadiusY ** 2) < cfg.waterEllipseThreshold &&
              !(x === spot.x && y === spot.y)) { cells.push({x, y}); cm[y][x] = 'water' }
          }
          if (cells.length < cfg.minWaterCells) { for (const p of cells) cm[p.y][p.x] = floorTile; continue }
          const seen = new Set([keyXY(spot.x, spot.y)]), queue = [spot]
          for (let i = 0; i < queue.length; i++) {
            const p = queue[i]
            for (const [dx, dy] of DIRS4) {
              const x = p.x + dx, y = p.y + dy, key = keyXY(x, y)
              if (cm[y]?.[x] !== floorTile || seen.has(key)) continue
              seen.add(key)
              queue.push({x, y})
            }
          }
          let dryFloor = 0
          for (let y = bounds.y1; y <= bounds.y2; y++)
            for (let x = bounds.x1; x <= bounds.x2; x++)
              if (cm[y][x] === floorTile) dryFloor++
          if (seen.size === dryFloor) { hasWater = true; break }
          for (const p of cells) cm[p.y][p.x] = floorTile
        }
      }
      let dryFloor = 0
      for (let y = bounds.y1; y <= bounds.y2; y++)
        for (let x = bounds.x1; x <= bounds.x2; x++)
          if (cm[y][x] === floorTile) dryFloor++
      if (dryFloor < Math.round(w * h * cfg.minDryFloorFraction)) continue
      return {cm, rooms, bounds, hasWater}
    }
  }
  return null
}

// A second z:-2 layout: branching, narrow dug passages and scattered pockets.
// It can fit around crowded surface entrances where a broad grotto cannot.
function carveBurrowDungeon(spot, floorTile, reserved) {
  const cfg = WORLD_GEN_CONFIG.caves.deep.burrow
  const sizes = cfg.sizes
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  for (const [w, h] of sizes) {
    const edge = cfg.anchorEdgeOffset
    const anchors = [[Math.floor(w / 2), Math.floor(h / 2)], [edge, Math.floor(h / 2)],
      [w - edge - 1, Math.floor(h / 2)], [Math.floor(w / 2), edge],
      [Math.floor(w / 2), h - edge - 1], [edge, edge], [w - edge - 1, h - edge - 1]]
    for (let n = anchors.length - 1; n > 0; n--) {
      const j = randInt(0, n)
      ;[anchors[n], anchors[j]] = [anchors[j], anchors[n]]
    }
    for (const [ax, ay] of anchors) {
      const bounds = {x1: spot.x - ax, y1: spot.y - ay}
      bounds.x2 = bounds.x1 + w - 1
      bounds.y2 = bounds.y1 + h - 1
      if (bounds.x1 < 2 || bounds.y1 < 2 || bounds.x2 >= MAP_W - 2 || bounds.y2 >= MAP_H - 2) continue
      if (reserved.some(r => bounds.x1 <= r.x2 + cfg.reservedPadding && bounds.x2 >= r.x1 - cfg.reservedPadding &&
        bounds.y1 <= r.y2 + cfg.reservedPadding && bounds.y2 >= r.y1 - cfg.reservedPadding)) continue
      const cm = blankCaveMap(), rooms = []
      const brush = (x, y, wide) => {
        const radius = wide ? cfg.wideBrushRadius : cfg.brushRadius
        for (let yy = y - radius; yy <= y + radius; yy++)
          for (let xx = x - radius; xx <= x + radius; xx++)
            if (xx > bounds.x1 && xx < bounds.x2 && yy > bounds.y1 && yy < bounds.y2)
              cm[yy][xx] = floorTile
      }
      brush(spot.x, spot.y, true)
      const tips = [{x: spot.x, y: spot.y}]
      const branches = Math.max(cfg.minBranches, Math.round(w * h / cfg.branchDensityDivisor))
      for (let branch = 0; branch < branches; branch++) {
        const origin = pick(tips)
        let x = origin.x, y = origin.y
        let [dx, dy] = pick(dirs)
        const steps = randInt(Math.max(cfg.minSteps, Math.round((w + h) / 2)), w + h + cfg.stepLengthBonus)
        for (let step = 0; step < steps; step++) {
          if (chance(cfg.turnChance)) [dx, dy] = pick(dirs)
          const nx = x + dx, ny = y + dy
          if (nx <= bounds.x1 + cfg.boundsMargin || nx >= bounds.x2 - cfg.boundsMargin ||
            ny <= bounds.y1 + cfg.boundsMargin || ny >= bounds.y2 - cfg.boundsMargin) {
            ;[dx, dy] = pick(dirs)
            continue
          }
          x = nx; y = ny
          brush(x, y, step % cfg.wideCycle < cfg.wideSteps)
        }
        brush(x, y, true)
        tips.push({x, y})
        rooms.push({cx: x, cy: y, x1: x - cfg.roomHalfSize, x2: x + cfg.roomHalfSize, y1: y - cfg.roomHalfSize, y2: y + cfg.roomHalfSize})
      }
      let floor = 0
      for (let y = bounds.y1; y <= bounds.y2; y++)
        for (let x = bounds.x1; x <= bounds.x2; x++)
          if (cm[y][x] === floorTile) floor++
      if (floor < cfg.minFloorTiles) continue
      return {cm, rooms, bounds, hasWater: false, style: 'burrow'}
    }
  }
  return null
}

// Each world needs a broad grotto and a compact burrow at z:-2. Other
// branches are optional and use either generator, with reserved nonoverlap.
function generateDeepLevel(parentCaves, parentCaveMaps, parentMap, parentFloorTile, floorTile, downTile, upTile) {
  const cfg = WORLD_GEN_CONFIG.caves.deep
  const levelCaves = [], levelCaveMaps = [], reserved = []
  const eligible = parentCaves.map((c, i) => i).filter(i => !parentCaves[i]?.crypt)
  for (let n = eligible.length - 1; n > 0; n--) {
    const j = randInt(0, n)
    ;[eligible[n], eligible[j]] = [eligible[j], eligible[n]]
  }
  const used = new Set()
  const addBranch = (i, style) => {
    const cm = parentCaveMaps[i]
    const entrances = parentCaves[i].entrances || []
    const open = []
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (cm[y][x] === parentFloorTile && parentMap[y]?.[x] === parentFloorTile &&
        !entrances.some(e => e.x === x && e.y === y)) open.push({x, y})
    }
    const carve = style === 'burrow' ? carveBurrowDungeon : carveDeepDungeon
    let spot = null, layout = null
    for (let tries = 0; tries < cfg.placementTriesPerBranch && open.length; tries++) {
      const candidate = open.splice(randInt(0, open.length - 1), 1)[0]
      const result = carve(candidate, floorTile, reserved)
      if (result) { spot = candidate; layout = result; break }
    }
    if (!layout) return false
    cm[spot.y][spot.x] = downTile
    parentMap[spot.y][spot.x] = downTile
    layout.cm[spot.y][spot.x] = upTile
    reserved.push(layout.bounds)
    levelCaveMaps.push(layout.cm)
    levelCaves.push({x: spot.x, y: spot.y, entrances: [{x: spot.x, y: spot.y}],
      rooms: layout.rooms, hasWater: layout.hasWater, style,
      brownFloor: style === 'burrow' && !levelCaves.some(c => c.brownFloor)})
    used.add(i)
    return true
  }
  for (const style of ['grotto', 'burrow']) {
    for (const i of eligible) {
      if (!used.has(i) && addBranch(i, style)) break
    }
  }
  if (levelCaves.length >= 2) for (const i of eligible) {
    if (used.has(i) || !chance(cfg.optionalBranchChance)) continue
    addBranch(i, chance(cfg.optionalGrottoChance) ? 'grotto' : 'burrow')
  }
  const levelMap = blankCaveMap()
  for (const cm of levelCaveMaps)
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++)
      if (cm[y][x] !== 'cavewall') levelMap[y][x] = cm[y][x]
  for (const cave of levelCaves)
    for (const entrance of cave.entrances)
      levelMap[entrance.y][entrance.x] = upTile
  return {map: levelMap, caveMaps: levelCaveMaps, caves: levelCaves,
    discovered: Array.from({length: MAP_H}, () => new Array(MAP_W).fill(false))}
}

let bigBellPos = null

function placeBigBell() {
  const cfg = WORLD_GEN_CONFIG.landmarks
  // Preferred: a mountain tile near the temple, right on the mountain's
  // edge (bordering walkable ground) so the guards have room to stand.
  function search(minR, maxR, requireEdge) {
    for (let r = minR; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = spawnPoint.x + dx, y = spawnPoint.y + dy
          if (x < cfg.placementEdgeMargin || y < cfg.placementEdgeMargin || x >= MAP_W - cfg.placementEdgeMargin || y >= MAP_H - cfg.placementEdgeMargin) continue
          if (map[y][x] !== 'mountain' && map[y][x] !== 'snowmountain') continue
          // Keep well clear of the black pillar - the two landmarks
          // shouldn't spawn side by side.
          if (blackPillarPos && Math.max(Math.abs(x - blackPillarPos.x), Math.abs(y - blackPillarPos.y)) < BELL_PILLAR_MIN_DIST) continue
          if (requireEdge) {
            let onEdge = false
            for (let ny = -1; ny <= 1 && !onEdge; ny++) {
              for (let nx = -1; nx <= 1 && !onEdge; nx++) {
                if (nx === 0 && ny === 0) continue
                const t = map[y + ny] && map[y + ny][x + nx]
                if (t && TILE[t] && TILE[t].walk) onEdge = true
              }
            }
            if (!onEdge) continue
          }
          return {x, y}
        }
      }
    }
    return null
  }

  // At least 20 tiles from the temple, but still "not too far from the
  // center of the map" overall - widening/dropping the edge requirement
  // only if the terrain nearby doesn't offer a clean mountain edge.
  const searches = cfg.bigBellSearches
  const spot = search(searches[0][0], searches[0][1], searches[0][2]) ||
    search(searches[1][0], searches[1][1], searches[1][2]) ||
    search(searches[2][0], searches[2][1] ?? Math.max(MAP_W, MAP_H), searches[2][2])
  if (!spot) return
  map[spot.y][spot.x] = 'bigbell'
  bigBellPos = spot
  // The last-resort fallback above drops the walkable-edge requirement,
  // so the bell can end up fully sealed in by mountains. Guarantee at
  // least one walkable neighbor so it's always reachable.
  let hasWalkableNeighbor = false
  for (let ny = -1; ny <= 1 && !hasWalkableNeighbor; ny++) {
    for (let nx = -1; nx <= 1 && !hasWalkableNeighbor; nx++) {
      if (nx === 0 && ny === 0) continue
      const t = map[spot.y + ny] && map[spot.y + ny][spot.x + nx]
      if (t && TILE[t] && TILE[t].walk) hasWalkableNeighbor = true
    }
  }
  if (!hasWalkableNeighbor) {
    for (const [dx, dy] of DIRS8) {
      const nx = spot.x + dx, ny = spot.y + dy
      if (map[ny] && map[ny][nx] !== undefined) {
        map[ny][nx] = 'grass'
        break
      }
    }
  }
}

function spawnBellGuardians() {
  const cfg = WORLD_GEN_CONFIG.landmarks
  if (!bigBellPos) return
  const guardName = pick(['Ogre', 'Cyclops'])
  const tmpl = ENEMY_TEMPLATES.find(t => t.name === guardName)
  if (!tmpl) return
  const candidates = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const x = bigBellPos.x + dx, y = bigBellPos.y + dy
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue
      if (!isWalkable(x, y)) continue
      if (occupied.has(keyXY(x, y))) continue
      candidates.push({x, y})
    }
  }
  for (let i = 0; i < cfg.bellGuardianCount && candidates.length; i++) {
    const idx = randInt(0, candidates.length - 1)
    const p = candidates.splice(idx, 1)[0]
    const variance = cfg.enemyStatVarianceMin + rng() * cfg.enemyStatVarianceSpan
    const e = {
      name: tmpl.name, tier: tmpl.tier,
      hp: Math.max(1, Math.round(tmpl.hp * variance)),
      atk: Math.max(1, Math.round(tmpl.atk * variance)),
      def: Math.max(0, Math.round(tmpl.def * variance)),
      spd: Math.max(1, Math.round(tmpl.spd * variance)),
      abilities: [...tmpl.abilities],
      humanoid: !!tmpl.humanoid,
      aggro: tmpl.aggro ?? AGGRO_RANGE,
      x: p.x, y: p.y, homeX: p.x, homeY: p.y, alive: true, prefix: null, equipment: null,
    }
    e.maxHp = e.hp
    e.baseName = tmpl.name
    prepareEnemyEquipment(e)
    addEnemy(e)
    occupied.add(keyXY(p.x, p.y))
  }
}

let blackPillarPos = null

function placeBlackPillar() {
  const cfg = WORLD_GEN_CONFIG.landmarks
  // Preferred: a mountain tile 15-45 tiles from the temple, right on the
  // mountain's edge (bordering walkable ground) so it's easy to reach.
  function search(minR, maxR, requireEdge) {
    for (let r = minR; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = spawnPoint.x + dx, y = spawnPoint.y + dy
          if (x < cfg.placementEdgeMargin || y < cfg.placementEdgeMargin || x >= MAP_W - cfg.placementEdgeMargin || y >= MAP_H - cfg.placementEdgeMargin) continue
          if (map[y][x] !== 'mountain' && map[y][x] !== 'snowmountain') continue
          if (requireEdge) {
            let onEdge = false
            for (let ny = -1; ny <= 1 && !onEdge; ny++) {
              for (let nx = -1; nx <= 1 && !onEdge; nx++) {
                if (nx === 0 && ny === 0) continue
                const t = map[y + ny] && map[y + ny][x + nx]
                if (t && TILE[t] && TILE[t].walk) onEdge = true
              }
            }
            if (!onEdge) continue
          }
          return {x, y}
        }
      }
    }
    return null
  }

  // Widen the search and drop the edge requirement if the terrain around
  // the temple doesn't happen to offer a nearby mountain edge.
  const searches = cfg.blackPillarSearches
  const spot = search(searches[0][0], searches[0][1], searches[0][2]) ||
    search(searches[1][0], searches[1][1], searches[1][2]) ||
    search(searches[2][0], searches[2][1] ?? Math.max(MAP_W, MAP_H), searches[2][2])
  if (spot) {
    map[spot.y][spot.x] = 'blackpillar'
    blackPillarPos = spot
  }
}

let villageCenter = null

function syncMausoleumHutToOddTombstone() {
  if (!villageHuts.length) return
  const oddName = Object.values(cemeteryTombstones).find(t => t.odd)?.name
  if (!oddName) return
  // The anomalous tombstone's dwarven name is the source of truth. Do not
  // silently rename an arbitrary hut or pick a central hut if the link is
  // missing; a generated world should already contain the matching name.
  const target = villageHuts.find(h => h.name === oddName)
  if (!target) return
  for (const hut of villageHuts) hut.mausoleum = false
  target.mausoleum = true
  mausoleumHutPos = {x: target.x, y: target.y}
}

function reconcileVillageHuts() {
  // Village huts live on the surface layer only. Use surfaceMap explicitly
  // rather than the currently active `map` - a save made while underground
  // (a cave, the crypt, or the mausoleum) would otherwise have `map` pointing
  // at that underground layer here, wiping out every hut (and with it the
  // mausoleum link) because none of their coordinates read as 'village' there.
  villageHuts = villageHuts.filter(h => surfaceMap[h.y]?.[h.x] === 'village')
  const known = new Set(villageHuts.map(h => keyXY(h.x, h.y)))
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (surfaceMap[y]?.[x] !== 'village' || known.has(keyXY(x, y))) continue
    // Older saves can contain village tiles that were not included in the
    // villageHuts metadata. Give those tiles stable fallback human names so
    // they remain inspectable after loading. Do not invent a mausoleum link.
    const nameIndex = Math.abs((x * 31 + y * 17) % HUMAN_NAMES.length)
    villageHuts.push({x, y, name: HUMAN_NAMES[nameIndex], mausoleum: false})
    known.add(keyXY(x, y))
  }

  // First recover an explicitly persisted mausoleum coordinate; otherwise
  // recover the canonical hut by matching the anomalous tombstone's name.
  let target = null
  if (mausoleumHutPos && surfaceMap[mausoleumHutPos.y]?.[mausoleumHutPos.x] === 'village') {
    target = villageHuts.find(h => h.x === mausoleumHutPos.x && h.y === mausoleumHutPos.y) || null
  }
  if (!target) {
    const oddName = Object.values(cemeteryTombstones).find(t => t.odd)?.name
    target = oddName ? villageHuts.find(h => h.name === oddName) || null : null
  }
  if (target) {
    for (const hut of villageHuts) hut.mausoleum = false
    target.mausoleum = true
    mausoleumHutPos = {x: target.x, y: target.y}
  }
}

function placeVillage() {
  const cfg = WORLD_GEN_CONFIG.village
  // Find a clearing just outside the temple grounds, then grow a small
  // blob of hut tiles outward from it so it reads as a loose little
  // settlement right next door. Forest counts as isBuildable ground too -
  // a village simply clears the trees it needs, so dense woods around
  // the temple no longer block it from appearing at all.
  function isBuildable(x, y) {
    const t = map[y][x]
    return t === 'grass' || t === 'hill' || t === 'forest'
  }

  function findCenter() {
    const primary = cfg.primarySearch
    for (let r = primary.minRadius; r <= primary.maxRadius; r += primary.radiusStep) {
      for (let tries = 0; tries < primary.triesPerRadius; tries++) {
        const ang = rng() * Math.PI * 2
        const x = Math.round(spawnPoint.x + Math.cos(ang) * r)
        const y = Math.round(spawnPoint.y + Math.sin(ang) * r)
        if (x < cfg.edgeMargin || y < cfg.edgeMargin || x >= MAP_W - cfg.edgeMargin || y >= MAP_H - cfg.edgeMargin) continue
        if (!isBuildable(x, y)) continue
        return {x, y}
      }
    }

    // Fallback: widen the search a lot further out so a village always
    // finds somewhere to stand, even in heavily forested/mountainous seeds.
    const fallback = cfg.fallbackSearch
    for (let r = fallback.minRadius; r <= fallback.maxRadius; r += fallback.radiusStep) {
      for (let tries = 0; tries < fallback.triesPerRadius; tries++) {
        const ang = rng() * Math.PI * 2
        const x = Math.round(spawnPoint.x + Math.cos(ang) * r)
        const y = Math.round(spawnPoint.y + Math.sin(ang) * r)
        if (x < cfg.edgeMargin || y < cfg.edgeMargin || x >= MAP_W - cfg.edgeMargin || y >= MAP_H - cfg.edgeMargin) continue
        if (!isBuildable(x, y)) continue
        return {x, y}
      }
    }
    return null
  }

  const center = findCenter()
  if (!center) return
  villageCenter = center
  const huts = [{x: center.x, y: center.y}]
  const targetHuts = cfg.minHuts + Math.floor(rng() * (cfg.maxHuts - cfg.minHuts + 1))
  let guard = 0
  while (huts.length < targetHuts && guard < cfg.growthAttempts) {
    guard++
    const base = huts[randInt(0, huts.length - 1)]
    const dx = randInt(-cfg.growthStepRange, cfg.growthStepRange), dy = randInt(-cfg.growthStepRange, cfg.growthStepRange)
    if (dx === 0 && dy === 0) continue
    const x = base.x + dx, y = base.y + dy
    if (x < cfg.placementEdgeMargin || y < cfg.placementEdgeMargin || x >= MAP_W - cfg.placementEdgeMargin || y >= MAP_H - cfg.placementEdgeMargin) continue
    if (!isBuildable(x, y)) continue
    if (huts.some(h => h.x === x && h.y === y)) continue
    huts.push({x, y})
  }
  // Generate the settlement geometry first. Hut names are assigned only
  // after the cemetery has generated its anomalous dwarven name, so one hut
  // can receive that exact name and become the mausoleum hut.
  villageHuts = huts.map(h => ({x: h.x, y: h.y, name: null, mausoleum: false}))
  for (const h of huts) map[h.y][h.x] = 'village'
  // Keep the woods from crowding right up against the settlement - clear
  // a buffer ring around the huts so no forest tile sits directly next
  // to (or inside) the village.
  const clearRadius = cfg.forestClearRadius
  for (const h of huts) {
    for (let dy = -clearRadius; dy <= clearRadius; dy++) {
      for (let dx = -clearRadius; dx <= clearRadius; dx++) {
        const x = h.x + dx, y = h.y + dy
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue
        if (map[y][x] === 'forest') map[y][x] = 'grass'
      }
    }
  }
}

function placeAncientForest() {
  const cfg = WORLD_GEN_CONFIG.ancientForest
  const size = ANCIENT_FOREST_SIZE
  let best = null
  let bestScore = -1

  function consider(x, y) {
    if (villageCenter && Math.max(Math.abs(x - villageCenter.x), Math.abs(y - villageCenter.y)) < ANCIENT_FOREST_MIN_VILLAGE_DIST) return
    let forestCount = 0
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (map[y + dy][x + dx] === 'forest') forestCount++
      }
    }
    if (forestCount > bestScore) {
      bestScore = forestCount
      best = {x, y}
    }
  }

  for (let y = 2; y < MAP_H - size - 2; y++) {
    for (let x = 2; x < MAP_W - size - 2; x++) consider(x, y)
  }
  // Ancient forest is a special landmark, so don't make its existence depend
  // on finding an unusually dense 10x10 patch of ordinary forest. Recent terrain
  // balancing can legitimately produce thinner woods, which used to make this
  // function silently fail and left Old Hunter with no dialogue.
  // Require a modest forest presence, then let the ancient wood reclaim the
  // remaining suitable temperate ground in the footprint.
  const minForest = Math.max(cfg.minForestTiles, Math.floor(size * size * cfg.minForestFraction))
  if (!best || bestScore < minForest) return
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = best.x + dx, y = best.y + dy
      const tile = map[y][x]
      if (tile === 'forest' || tile === 'grass') map[y][x] = 'ancientForest'
    }
  }

  // Keep the guaranteed 10x10 core, then grow unevenly through adjacent
  // forest so the biome has a natural, branching outline.
  const frontier = []
  const queued = new Set()

  function queueForest(x, y) {
    if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) return
    const key = keyXY(x, y)
    if (queued.has(key) || map[y][x] !== 'forest') return
    queued.add(key)
    frontier.push({x, y})
  }

  for (let y = best.y; y < best.y + size; y++) {
    queueForest(best.x - 1, y)
    queueForest(best.x + size, y)
  }
  for (let x = best.x; x < best.x + size; x++) {
    queueForest(x, best.y - 1)
    queueForest(x, best.y + size)
  }
  let grown = 0
  while (frontier.length && grown < cfg.maxGrowthTiles) {
    const index = randInt(0, frontier.length - 1)
    const tile = frontier.splice(index, 1)[0]
    if (rng() > cfg.growthChance) continue
    map[tile.y][tile.x] = 'ancientForest'
    grown++
    for (const [dx, dy] of DIRS8) {
      if (chance(cfg.neighborQueueChance)) queueForest(tile.x + dx, tile.y + dy)
    }
  }

  // Remove any ordinary-forest pockets trapped inside the new outline.
  let minX = MAP_W, minY = MAP_H, maxX = -1, maxY = -1
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (map[y][x] !== 'ancientForest') continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  const checked = new Set()
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (map[y][x] !== 'forest' || checked.has(keyXY(x, y))) continue
      const component = [], queue = [{x, y}]
      const componentKeys = new Set([keyXY(x, y)])
      let touchesBounds = false
      while (queue.length) {
        const tile = queue.shift()
        component.push(tile)
        if (tile.x === minX || tile.x === maxX || tile.y === minY || tile.y === maxY) touchesBounds = true
        for (const [dx, dy] of DIRS8) {
          const nx = tile.x + dx, ny = tile.y + dy
          const key = keyXY(nx, ny)
          if (nx < minX || nx > maxX || ny < minY || ny > maxY || componentKeys.has(key)) continue
          if (map[ny][nx] !== 'forest') continue
          componentKeys.add(key)
          queue.push({x: nx, y: ny})
        }
      }
      for (const key of componentKeys) checked.add(key)
      if (!touchesBounds) {
        for (const tile of component) map[tile.y][tile.x] = 'ancientForest'
      }
    }
  }
}

/* ============================== ENEMIES / ITEMS ON MAP ============================== */
let enemies = []
let caveDecorations = [] // Cosmetic ordinary-cave overlays, saved separately from loot.
let groundItems = [] // level 0 is surface, level -1 is the shared cave layer
let occupied = new Set() // "x,y" for enemies

function keyXY(x, y) {
  return x + ',' + y
}

function spawnEnemies() {
  const cfg = WORLD_GEN_CONFIG.surfaceEnemies
  const weights = cfg.tierWeights // tier 1..5

  // Index every legal spawn tile by terrain once. Rejection-sampling the whole map
  // would almost never land a Mummy on sand or a Lich on snow, so restricted
  // creatures would silently fail to spawn.
  const tilesByBiome = {}
  const allSpawnTiles = []
  for (let y = cfg.spawnEdgeMargin; y < MAP_H - cfg.spawnEdgeMargin; y++) {
    for (let x = cfg.spawnEdgeMargin; x < MAP_W - cfg.spawnEdgeMargin; x++) {
      const tile = map[y][x]
      if (tile === 'temple' || tile === 'belltower' || tile === 'ancientForest' || tile === 'caveentrance' || !isWalkable(x, y)) continue
      if (Math.abs(x - spawnPoint.x) + Math.abs(y - spawnPoint.y) < cfg.minTempleManhattanDistance) continue
      // Keep the bell's vicinity free of random spawns - the guard pair
      // should be the only threat there.
      if (bigBellPos && Math.max(Math.abs(x - bigBellPos.x), Math.abs(y - bigBellPos.y)) < BELL_GUARD_EXCLUSION_RADIUS) continue
      if (!tilesByBiome[tile]) tilesByBiome[tile] = []
      tilesByBiome[tile].push(x, y)
      allSpawnTiles.push(x, y)
    }
  }
  const total = Math.round(allSpawnTiles.length / 2 / SURFACE_TILES_PER_ENEMY * cfg.populationDensityMultiplier)
  const poolCache = {}

  function poolFor(tmpl) {
    if (poolCache[tmpl.name]) return poolCache[tmpl.name]
    let pool = []
    for (const biome of enemyBiomes(tmpl)) {
      if (tilesByBiome[biome]) pool = pool.concat(tilesByBiome[biome])
    }
    // If this world happens to contain none of the creature's biomes, fall back to
    // anywhere walkable rather than dropping it from the world entirely.
    if (!pool.length) pool = allSpawnTiles
    if (tmpl.tier >= cfg.highTierMinTier) {
      const distantPool = []
      for (let i = 0; i < pool.length; i += 2) {
        const x = pool[i], y = pool[i + 1]
        if (Math.max(Math.abs(x - spawnPoint.x), Math.abs(y - spawnPoint.y)) >= cfg.highTierMinTempleDistance) {
          distantPool.push(x, y)
        }
      }
      pool = distantPool
    }
    poolCache[tmpl.name] = pool
    return pool
  }

  function spawnOneFromTemplate(tmpl, preferredPool = null) {
    const pool = preferredPool || poolFor(tmpl)
    if (!pool.length) return false
    let x = 0, y = 0, tries = 0, placed = false
    while (tries < cfg.placementTries) {
      tries++
      const p = randInt(0, (pool.length >> 1) - 1) * 2
      x = pool[p]
      y = pool[p + 1]
      if (occupied.has(keyXY(x, y))) continue
      placed = true
      break
    }
    if (!placed) return false
    const variance = cfg.statVarianceMin + rng() * cfg.statVarianceSpan
    const e = {
      name: tmpl.name, tier: tmpl.tier, level: 0, ordinarySurface: true,
      hp: Math.max(1, Math.round(tmpl.hp * variance)),
      atk: Math.max(1, Math.round(tmpl.atk * variance)),
      def: Math.max(0, Math.round(tmpl.def * variance)),
      spd: Math.max(1, Math.round(tmpl.spd * variance)),
      abilities: [...tmpl.abilities],
      humanoid: !!tmpl.humanoid,
      aggro: tmpl.aggro ?? AGGRO_RANGE,
      x, y, homeX: x, homeY: y, homeTileType: map[y][x], alive: true, prefix: null, equipment: null,
    }
    e.maxHp = e.hp
    e.baseName = tmpl.name // keep clean name for image lookup, separate from display name
    prepareEnemyEquipment(e)
    if (chance(cfg.prefixChance)) {
      const names = Object.keys(ENEMY_PREFIXES)
      const pfx = pick(names)
      e.prefix = pfx
      e.prefixBase = prefixBaseStats(e)
      applyEnemyPrefix(e, pfx)
      e.name = pfx + ' ' + e.name
    }
    addEnemy(e)
    // Template wandering stays authoritative unless this world explicitly
    // promotes a mobile surface monster. Stationary monsters remain stationary.
    if (e.wander === 'home' || e.wander === 'homeReanchored' || e.wander === 'roam') {
      if (cfg.farPromotionChance > 0 && chance(cfg.farPromotionChance)) e.wander = 'far'
      else if ((e.wander === 'home' || e.wander === 'homeReanchored') && cfg.roamPromotionChance > 0 && chance(cfg.roamPromotionChance)) e.wander = 'roam'
    }
    occupied.add(keyXY(x, y))
    return true
  }

  for (let i = 0; i < total; i++) {
    let r = rng(), tier = 1, acc = 0
    for (let t = 0; t < weights.length; t++) {
      acc += weights[t]
      if (r <= acc) {
        tier = t + 1
        break
      }
    }
    const templates = ENEMY_TEMPLATES.filter(e => e.tier === tier)
    const tmpl = pickWeighted(templates, t => (t.rarity ?? 1) * (t.humanoid ? 1 : cfg.nonHumanoidRarityMultiplier))
    spawnOneFromTemplate(tmpl)
  }

  // Migrant groups start on a world edge. Their far pathfinding targets the
  // opposite edge through the existing wander=far behavior.
  if (cfg.migrationGroups > 0) {
    const edgeWidth = cfg.migrationEdgeWidth
    const edgeSpots = []
    for (let i = 0; i < allSpawnTiles.length; i += 2) {
      const x = allSpawnTiles[i], y = allSpawnTiles[i + 1]
      if (Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y) <= edgeWidth) edgeSpots.push({x, y})
    }
    const migrants = ENEMY_TEMPLATES.filter(t => t.tier <= cfg.migrationMaxTier && t.wander !== false)
    for (let group = 0; group < cfg.migrationGroups && edgeSpots.length && migrants.length; group++) {
      const anchor = pick(edgeSpots)
      const matching = migrants.filter(t => enemyBiomes(t).includes(map[anchor.y][anchor.x]))
      const tmpl = pick(matching.length ? matching : migrants)
      const local = []
      for (const site of edgeSpots) if (Math.max(Math.abs(site.x - anchor.x), Math.abs(site.y - anchor.y)) <= cfg.migrationLocalRadius &&
        enemyBiomes(tmpl).includes(map[site.y][site.x])) local.push(site.x, site.y)
      if (!local.length) for (const site of edgeSpots)
        if (Math.max(Math.abs(site.x - anchor.x), Math.abs(site.y - anchor.y)) <= cfg.migrationLocalRadius) local.push(site.x, site.y)
      if (!local.length) continue
      for (let i = 0; i < cfg.migrationGroupSize; i++) {
        if (!spawnOneFromTemplate(tmpl, local)) break
        const e = enemies[enemies.length - 1]
        e.wander = 'far'
      }
      for (let i = edgeSpots.length - 1; i >= 0; i--)
        if (Math.max(Math.abs(edgeSpots[i].x - anchor.x), Math.abs(edgeSpots[i].y - anchor.y)) < cfg.migrationGroupSpacing) edgeSpots.splice(i, 1)
    }
  }

  // The Lich is the sole source of the rare tombstones, so make sure the world
  // never rolls too few of them - top up to a guaranteed minimum if short.
  const lichTmpl = ENEMY_TEMPLATES.find(t => t.name === 'Lich')
  if (lichTmpl) {
    let lichCount = enemies.filter(e => e.baseName === 'Lich').length
    let guard = 0
    while (lichCount < MIN_LICHES && guard < cfg.lichTopUpAttempts) {
      guard++
      if (spawnOneFromTemplate(lichTmpl)) lichCount++
    }
  }
}

// Shallow caves draw without replacement from eight encounters. The ID and clue
// live on the cave descriptor, which is already saved with the generated world.
// Named story maps (crypt, mausoleum, fort) keep their own populations and loot.
const CAVE_SCENARIOS = [
  {id: 'abandoned_camp', clue: 'Cold smoke and old footprints lead into the dark.',
    intro: 'An abandoned camp lies just beyond the entrance. Something has moved into it.',
    surface: {mobs: [['Giant Bat', 1], ['Giant Rat', 1]], tier: 1, camp: true, supply: 'potion'}},
  {id: 'bat_roost', clue: 'A flurry of wings and the smell of guano drift from below.',
    intro: 'Bats cling to every crack in the ceiling.',
    surface: {mobs: [['Giant Bat', 5]], tier: 1, placement: 'far'}},
  {id: 'rat_warren', clue: 'A chorus of squeaks echoes from the passage.',
    intro: 'The stone is scored with narrow runs. Rats are everywhere.',
    surface: {mobs: [['Giant Rat', 5]], tier: 1, remains: true}},
  {id: 'goblin_cache', clue: 'Small bootprints and a glimmer of stolen metal mark the entrance.',
    intro: 'Goblins have made a guarded cache among the rocks.',
    surface: {mobs: [['Goblin', 3]], tier: 2, placement: 'guard'}},
  {id: 'bone_hollow', clue: 'Dry bones are scattered across the threshold.',
    intro: 'The dead have gathered around a hollow in the stone.',
    surface: {mobs: [['Skeleton', 2]], tier: 2, remains: true, placement: 'guard'}},
  {id: 'chitin_nest', clue: 'A brittle clicking rises from within.',
    intro: 'An insect nest fills the cracks. Its keepers are close.',
    surface: {mobs: [['Giant Bug', 3]], tier: 2, placement: 'far'}},
  {id: 'beast_den', clue: 'Fresh tracks and a strong animal scent lead inside.',
    intro: 'A pack has claimed this cave as its den.',
    surface: {mobs: [['Wolf', 3]], tier: 1, placement: 'far'}},
  {id: 'smugglers_refuge', clue: 'A ragged trail and a discarded torch suggest recent visitors.',
    intro: 'Someone used this passage to hide supplies. Goblins found it first.',
    surface: {mobs: [['Goblin', 2], ['Giant Rat', 1]], tier: 2, camp: true, supply: 'scrollOfInvisibility'}}
]

// Preserve the stronger, single-species z:-2 cave population. The five
// original deep-cave templates now each receive a distinct scenario.
const DEEP_CAVE_SCENARIOS = [
  {id: 'deep_goblin_cache', clue: 'Small armored footsteps echo below.',
    intro: 'Goblins guard a stolen cache in this lower cavern.',
    deep: {mobs: [['Goblin', 4]], tier: 3, placement: 'guard'}},
  {id: 'deep_bone_hollow', clue: 'A dry rattle sounds beneath the stone.',
    intro: 'The lower cavern is occupied by the dead.',
    deep: {mobs: [['Skeleton', 4]], tier: 3, placement: 'guard'}},
  {id: 'kobold_outpost', clue: 'Tiny tools clatter far below.',
    intro: 'Kobolds have built a cramped outpost around their cache.',
    deep: {mobs: [['Kobold', 4]], tier: 3, placement: 'guard', camp: true}},
  {id: 'skink_den', clue: 'The passage smells of damp scales.',
    intro: 'Skinks have made a den deep within the rock.',
    deep: {mobs: [['Skink', 4]], tier: 3, placement: 'far', supply: 'speedpotion'}},
  {id: 'ratling_burrow', clue: 'Small claws scrape against the stone below.',
    intro: 'Ratlings scurry through the lower burrow.',
    deep: {mobs: [['Ratling', 4]], tier: 3, placement: 'far', supply: 'potion'}}
]

function scenarioAt(z, x, y) {
  const descriptors = z === -1 ? caves : z === -2 ? deepLevels[0]?.caves : null
  const cave = descriptors?.find(c => !c.crypt && c.scenario && c.entrances?.some(e => e.x === x && e.y === y))
  return [...CAVE_SCENARIOS, ...DEEP_CAVE_SCENARIOS].find(s => s.id === cave?.scenario)
}

function caveScenarioClue(z, x, y) {
  return scenarioAt(z, x, y)?.clue || null
}

function caveScenarioIntro(z, x, y) {
  return scenarioAt(z, x, y)?.intro || null
}

// One distant underground Vampire, in a crypt or an ordinary cave with bats.
// This runs after cave population so eligibility reflects actual spawned bats.
function undergroundVampireAreas() {
  const areas = []
  const crypt = caves[cryptCaveIndex]
  if (crypt && caveMaps[cryptCaveIndex]) areas.push({
    cm: caveMaps[cryptCaveIndex], shared: undergroundMap, level: -1,
    levelKind: 'chain', caveIndex: cryptCaveIndex, entries: crypt.entrances,
    floor: 'cryptfloor'
  })
  if (cryptLevel2) areas.push({
    cm: cryptLevel2.map, shared: cryptLevel2.map, level: -2, levelKind: 'crypt2',
    entries: [{x: cryptLevel2.x, y: cryptLevel2.y}], floor: 'crypt2floor'
  })
  const layers = [{caves, caveMaps, map: undergroundMap, level: -1},
    ...deepLevels.map((layer, i) => ({...layer, level: -2 - i}))]
  for (const layer of layers) for (let i = 0; i < layer.caveMaps.length; i++) {
    const descriptor = layer.caves[i], cm = layer.caveMaps[i]
    if (!descriptor || descriptor.crypt || !descriptor.scenario) continue
    const area = {cm, shared: layer.map, level: layer.level, levelKind: 'chain',
      caveIndex: i, entries: descriptor.entrances, floor: layer.level === -1 ? 'cavefloor' : 'cavefloor2'}
    if (enemies.some(e => e.alive && (e.baseName || e.name) === 'Giant Bat' && vampireEnemyInArea(e, area))) areas.push(area)
  }
  return areas
}

function vampireEnemyInArea(enemy, area) {
  return enemy.level === area.level && (enemy.levelKind || 'chain') === area.levelKind &&
    (area.caveIndex === undefined || enemy.caveIndex === area.caveIndex) &&
    TILE[area.cm[enemy.y]?.[enemy.x]]?.walk
}

function undergroundVampireSites(area) {
  const entries = [...(area.entries || [])]
  // Every staircase/exit matters for safety, including the crypt's down stairs.
  const transitions = new Set(['caveentrance', 'cavedown', 'caveup', 'cryptstairsdown', 'cryptstairsup'])
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++)
    if (transitions.has(area.cm[y][x])) entries.push({x, y})
  const distances = new Map(), queue = []
  const canWalk = (x, y) => !!TILE[area.cm[y]?.[x]]?.walk && !!TILE[area.shared[y]?.[x]]?.walk
  for (const entry of entries) if (canWalk(entry.x, entry.y)) {
    const key = keyXY(entry.x, entry.y)
    if (!distances.has(key)) {distances.set(key, 0); queue.push(entry)}
  }
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head], nextDistance = distances.get(keyXY(p.x, p.y)) + 1
    for (const [dx, dy] of DIRS8) {
      const x = p.x + dx, y = p.y + dy, key = keyXY(x, y)
      if (!canWalk(x, y) || distances.has(key)) continue
      distances.set(key, nextDistance); queue.push({x, y})
    }
  }
  const sites = []
  const blocked = new Set()
  for (const e of enemies) if (e.alive && vampireEnemyInArea(e, area)) blocked.add(keyXY(e.x, e.y))
  for (const g of groundItems) if (g.level === area.level && (g.levelKind || 'chain') === area.levelKind)
    blocked.add(keyXY(g.x, g.y))
  for (const p of queue) {
    const key = keyXY(p.x, p.y), distance = distances.get(key)
    if (area.cm[p.y][p.x] !== area.floor || area.shared[p.y][p.x] !== area.floor || blocked.has(key)) continue
    if (distance < 8 || entries.some(e => Math.max(Math.abs(p.x - e.x), Math.abs(p.y - e.y)) < 8)) continue
    const walls = DIRS8.filter(([dx, dy]) => area.cm[p.y + dy]?.[p.x + dx] === 'cavewall').length
    sites.push({...p, distance, walls})
  }
  if (!sites.length) return []
  const farthest = Math.max(...sites.map(p => p.distance))
  const far = sites.filter(p => p.distance >= farthest * 0.75)
  const mostWalls = Math.max(...far.map(p => p.walls))
  return far.filter(p => p.walls === mostWalls)
}

function ensureUndergroundVampire() {
  const areas = undergroundVampireAreas()
  if (enemies.some(e => e.alive && (e.baseName || e.name) === 'Vampire' &&
      areas.some(area => vampireEnemyInArea(e, area)))) return
  const eligible = areas.map(area => ({area, sites: undergroundVampireSites(area)})).filter(entry => entry.sites.length)
  if (!eligible.length) throw new Error('No safe distant underground site for the guaranteed Vampire.')
  const {area, sites} = pick(eligible), spot = pick(sites)
  const tmpl = ENEMY_TEMPLATE_BY_NAME.Vampire
  const enemy = {name: tmpl.name, baseName: tmpl.name, tier: tmpl.tier,
    level: area.level, levelKind: area.levelKind, caveIndex: area.caveIndex,
    hp: tmpl.hp, maxHp: tmpl.hp, atk: tmpl.atk, def: tmpl.def, spd: tmpl.spd,
    abilities: [...tmpl.abilities], humanoid: !!tmpl.humanoid, aggro: tmpl.aggro ?? AGGRO_RANGE,
    x: spot.x, y: spot.y, homeX: spot.x, homeY: spot.y, homeTileType: area.floor,
    alive: true, prefix: null, equipment: null}
  prepareEnemyEquipment(enemy)
  addEnemy(enemy)
}

function spawnCaveScenarios() {
  const cfg = WORLD_GEN_CONFIG.cavePopulation
  let surfaceDeck = [], deepDeck = []
  const fungusTopUpSites = []

  function nextScenario(level) {
    let deck = level === -1 ? surfaceDeck : deepDeck
    if (!deck.length) {
      deck = (level === -1 ? CAVE_SCENARIOS : DEEP_CAVE_SCENARIOS).slice()
      for (let i = deck.length - 1; i > 0; i--) {
        const j = randInt(0, i)
        ;[deck[i], deck[j]] = [deck[j], deck[i]]
      }
      if (level === -1) surfaceDeck = deck
      else deepDeck = deck
    }
    return deck.pop()
  }

  function populate(descriptor, cm, caveIndex, level, floorTile) {
    if (descriptor.crypt || descriptor.scenario || !descriptor.entrances?.length) return
    const open = []
    const entries = descriptor.entrances
    const sharedMap = level === -1 ? undergroundMap : deepLevels[0].map
    const allEntrances = (level === -1 ? caves : deepLevels[0].caves)
      .flatMap(c => c.entrances || [])
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (cm[y][x] !== floorTile) continue
      if (sharedMap[y]?.[x] !== floorTile) continue
      if (allEntrances.some(e => e.x === x && e.y === y)) continue
      if (enemies.some(e => e.alive && e.level === level && e.x === x && e.y === y)) continue
      if (groundItems.some(g => g.level === level && g.x === x && g.y === y)) continue
      open.push({x, y})
    }
    // A tiny or malformed cave must not consume a scenario without room for it.
    if (open.length < cfg.minOpenTilesForScenario) return
    const scenario = nextScenario(level)
    descriptor.scenario = scenario.id
    const rules = level === -1 ? scenario.surface : scenario.deep
    const entrance = entries[0]
    const distance = p => Math.abs(p.x - entrance.x) + Math.abs(p.y - entrance.y)
    const ordinaryMobSpots = []
    function takeSpot(mode, target) {
      if (!open.length) return null
      let candidates = open
      if (mode === 'deepMob') {
        const away = open.filter(p => entries.every(e =>
          Math.abs(p.x - e.x) + Math.abs(p.y - e.y) > cfg.deepMobEntranceClearance))
        if (away.length) candidates = away
        const spaced = candidates.filter(p => ordinaryMobSpots.every(m =>
          Math.max(Math.abs(p.x - m.x), Math.abs(p.y - m.y)) >= cfg.deepMobMinSpacing))
        if (spaced.length) candidates = spaced
        if (target) {
          const inRoom = candidates.filter(p => p.x >= target.x1 && p.x <= target.x2 &&
            p.y >= target.y1 && p.y <= target.y2)
          if (inRoom.length) candidates = inRoom
        }
      } else if (mode === 'guard' && target) {
        const near = open.filter(p => Math.abs(p.x - target.x) + Math.abs(p.y - target.y) <= cfg.guardRadius)
        if (near.length) candidates = near
      } else if (mode === 'room' && target) {
        const inRoom = open.filter(p => p.x >= target.x1 && p.x <= target.x2 &&
          p.y >= target.y1 && p.y <= target.y2 && distance(p) > cfg.roomMinEntranceDistance)
        if (inRoom.length) candidates = inRoom
      } else if (mode === 'far') {
        const max = Math.max(...open.map(distance))
        candidates = open.filter(p => distance(p) >= max - cfg.farDistanceSlack)
      } else if (mode === 'corner') {
        const wallCount = p => DIRS8.filter(([dx, dy]) => cm[p.y + dy]?.[p.x + dx] === 'cavewall').length
        const max = Math.max(...open.map(wallCount))
        candidates = open.filter(p => wallCount(p) >= Math.max(cfg.cornerMinWalls, max - 1))
        if (!candidates.length) candidates = open
      }
      const spot = pick(candidates)
      open.splice(open.indexOf(spot), 1)
      return spot
    }
    const roomOrder = level === -2 && descriptor.rooms ? descriptor.rooms.slice(1) : []
    if (roomOrder.length) for (let i = roomOrder.length - 1; i > 0; i--) {
      const j = randInt(0, i)
      ;[roomOrder[i], roomOrder[j]] = [roomOrder[j], roomOrder[i]]
    }
    const makeEnemy = (tmpl, spot, prefix = null) => {
      const e = {name: tmpl.name, baseName: tmpl.name, tier: tmpl.tier, level,
        levelKind: 'chain', caveIndex, hp: tmpl.hp, maxHp: tmpl.hp, atk: tmpl.atk,
        def: tmpl.def, spd: tmpl.spd, abilities: [...tmpl.abilities], humanoid: !!tmpl.humanoid,
        aggro: tmpl.aggro ?? AGGRO_RANGE,
        x: spot.x, y: spot.y, homeX: spot.x, homeY: spot.y, homeTileType: floorTile,
        alive: true, prefix: null, equipment: null}
      if (prefix) {
        e.prefix = prefix
        e.prefixBase = prefixBaseStats(e)
        applyEnemyPrefix(e, prefix)
        e.name = prefix + ' ' + e.name
      }
      addEnemy(e)
    }

    // Fungus can occur naturally in ordinary caves, but it is not guaranteed
    // per cave. A world-wide minimum is enforced after all z:-1/z:-2 caves
    // have been populated.
    const fungusTemplate = ENEMY_TEMPLATES.find(t => t.name === 'Fungus')
    if (fungusTemplate) {
      let fungusCount = 0
      if (chance(cfg.fungusFirstChance)) fungusCount++
      if (chance(cfg.fungusSecondChance)) fungusCount++
      for (let i = 0; i < fungusCount; i++) {
        const spot = takeSpot('random')
        if (!spot) break
        makeEnemy(fungusTemplate, spot)
      }
    }

    const chestCount = level === -2 ? Math.min(cfg.deepChestMax, Math.max(cfg.deepChestMin, Math.ceil(roomOrder.length / 2))) : 1
    let chest = null
    for (let i = 0; i < chestCount; i++) {
      const spot = level === -2 ? takeSpot('room', roomOrder[i] || null) : takeSpot('corner')
      if (!spot) break
      if (!chest) chest = spot
      groundItems.push({x: spot.x, y: spot.y, kind: 'chest',
        tier: level === -2 && i % 2 === 1 ? 2 : rules.tier,
        opened: false, level, levelKind: 'chain', caveIndex})
    }
    if (level === -2) {
      const championTemplate = ENEMY_TEMPLATES.find(t => t.name === rules.mobs[0]?.[0])
      const threatPool = deepCaveThreatTemplates()
      // Choose an open pocket with four immediately adjacent guard positions.
      // Reserve the group before ordinary mobs, so none can displace it.
      const openByPosition = new Map(open.map(p => [keyXY(p.x, p.y), p]))
      const groupSites = open.map(p => ({p, guards: DIRS8.map(([dx, dy]) =>
          openByPosition.get(keyXY(p.x + dx, p.y + dy))).filter(Boolean)}))
        .filter(site => site.guards.length >= cfg.deepChampionGuardCount)
      if (championTemplate && ENEMY_PREFIXES.Champion && groupSites.length) {
        const farthest = Math.max(...groupSites.map(site => distance(site.p)))
        const remote = groupSites.filter(site => distance(site.p) >= Math.max(cfg.deepChampionMinDistance, farthest - cfg.deepChampionDistanceSlack))
        const site = pick(remote)
        const guards = site.guards.slice()
        for (let n = guards.length - 1; n > 0; n--) {
          const j = randInt(0, n)
          ;[guards[n], guards[j]] = [guards[j], guards[n]]
        }
        for (const pos of [site.p, ...guards.slice(0, cfg.deepChampionGuardCount)]) open.splice(open.indexOf(pos), 1)
        makeEnemy(championTemplate, site.p, 'Champion')
        for (const pos of guards.slice(0, cfg.deepChampionGuardCount)) makeEnemy(championTemplate, pos)
      }
      if (threatPool.length) {
        const spot = takeSpot('far')
        if (spot) makeEnemy(pickWeighted(threatPool, t => t.rarity ?? 1), spot)
      }
    }
    for (const [name, count] of rules.mobs) {
      const tmpl = ENEMY_TEMPLATES.find(t => t.name === name)
      if (!tmpl) continue
      const total = level === -2 ? Math.min(cfg.deepMonsterMax, Math.max(cfg.deepMonsterMin, Math.round(open.length / cfg.deepMonsterTilesPerEnemy))) : count
      for (let n = 0; n < total; n++) {
        const spot = level === -2
          ? takeSpot('deepMob', roomOrder.length ? roomOrder[n % roomOrder.length] : null)
          : takeSpot(rules.placement || 'random', chest)
        if (!spot) break
        if (level === -2) ordinaryMobSpots.push(spot)
        let prefix = null
        if (chance(level === -2 ? cfg.deepPrefixChance : cfg.shallowPrefixChance)) {
          const names = Object.keys(ENEMY_PREFIXES)
          if (names.length) prefix = pick(names)
        }
        makeEnemy(tmpl, spot, prefix)
      }
    }
    if (rules.camp) {
      const spot = takeSpot('far')
      if (spot) groundItems.push({x: spot.x, y: spot.y, kind: 'campfire',
        description: pick(CAMPFIRE_INSPECTIONS), level, levelKind: 'chain', caveIndex})
    }
    // Existing skeleton search creates a z:-1 chest, so place remains only there.
    if (rules.remains && level === -1) {
      const spot = takeSpot('far')
      if (spot) groundItems.push({x: spot.x, y: spot.y, kind: 'skeleton', looted: false,
        description: pick(SKELETON_INSPECTIONS), level, levelKind: 'chain', caveIndex})
    }
    if (rules.supply) {
      const spot = takeSpot('far')
      if (spot) groundItems.push({x: spot.x, y: spot.y, kind: rules.supply,
        level, levelKind: 'chain', caveIndex})
    }
    if (level === -2) {
      // Scattered provisions reward searching side rooms after the first chest.
      for (let i = 0; i < cfg.deepProvisionCount; i++) {
        const spot = takeSpot('room', roomOrder[(i + 2) % roomOrder.length] || null)
        if (spot) groundItems.push({x: spot.x, y: spot.y,
          kind: i % 2 === 0 ? 'potion' : 'scrollOfInvisibility', level, levelKind: 'chain', caveIndex})
      }
    }

    // Keep only leftover floor positions for the world-wide Fungus minimum.
    // They are revalidated after every cave has populated because cave blobs can
    // overlap in world coordinates.
    for (const spot of open) fungusTopUpSites.push({
      x: spot.x, y: spot.y, caveIndex, level, floorTile, cm
    })
  }

  for (let i = 0; i < caveMaps.length; i++)
    populate(caves[i], caveMaps[i], i, -1, 'cavefloor')
  // z:-2 has ordinary caves; z:-3 is the purpose-built Dwarven Fort.
  const deep = deepLevels[0]
  if (deep) for (let i = 0; i < deep.caveMaps.length; i++)
    populate(deep.caves[i], deep.caveMaps[i], i, -2, 'cavefloor2')

  // Guarantee at least three Fungus across the whole ordinary underground
  // network, not three per cave. Natural cave rolls above may already satisfy
  // the minimum; only top up the shortfall.
  const fungusTemplate = ENEMY_TEMPLATES.find(t => t.name === 'Fungus')
  if (fungusTemplate) {
    let fungusCount = enemies.filter(e => e.alive && e.baseName === 'Fungus' &&
      e.levelKind === 'chain' && (e.level === -1 || e.level === -2)).length

    while (fungusCount < cfg.minimumFungus && fungusTopUpSites.length) {
      const siteIndex = randInt(0, fungusTopUpSites.length - 1)
      const site = fungusTopUpSites.splice(siteIndex, 1)[0]
      const sharedMap = site.level === -1 ? undergroundMap : deep?.map
      if (!sharedMap || site.cm[site.y]?.[site.x] !== site.floorTile ||
        sharedMap[site.y]?.[site.x] !== site.floorTile ||
        enemies.some(e => e.alive && e.level === site.level && e.x === site.x && e.y === site.y) ||
        groundItems.some(g => g.level === site.level && g.x === site.x && g.y === site.y)) continue

      addEnemy({
        name: fungusTemplate.name, baseName: fungusTemplate.name, tier: fungusTemplate.tier,
        level: site.level, levelKind: 'chain', caveIndex: site.caveIndex,
        hp: fungusTemplate.hp, maxHp: fungusTemplate.hp, atk: fungusTemplate.atk,
        def: fungusTemplate.def, spd: fungusTemplate.spd, abilities: [...fungusTemplate.abilities],
        humanoid: !!fungusTemplate.humanoid, aggro: fungusTemplate.aggro ?? AGGRO_RANGE,
        x: site.x, y: site.y, homeX: site.x, homeY: site.y,
        homeTileType: site.floorTile, alive: true, prefix: null, equipment: null
      })
      fungusCount++
    }
  }
}

function dungeonEncounterTemplatesForDepth(packageId, z, cfg, hooks = {}) {
  const depth = Math.abs(z)
  const nativeBiomes = new Set(Array.isArray(cfg?.nativeBiomes) && cfg.nativeBiomes.length ? cfg.nativeBiomes : ['cave'])
  return ENEMY_TEMPLATES.filter(tmpl => {
    const minDepth = Number(cfg?.minDepthByTier?.[String(tmpl.tier)])
    if (!Number.isFinite(minDepth) || depth < minDepth) return false
    if ((tmpl.aggro ?? AGGRO_RANGE) <= 0) return false
    const biomes = tmpl.biomes || []
    const explicitDepths = biomes
      .map(b => typeof b === 'string' && /^z-\d+$/.test(b) ? Math.abs(Number(b.slice(1))) : null)
      .filter(Number.isFinite)
    // Dungeon packages declare which existing biome memberships count as
    // native. Other species must opt in with an explicit z-* depth tag.
    if (!biomes.some(biome => nativeBiomes.has(biome)) && !explicitDepths.length) return false
    if (explicitDepths.length && depth < Math.min(...explicitDepths)) return false
    if (typeof hooks.templateEligible === 'function' && !hooks.templateEligible(tmpl, {packageId,z,depth,cfg})) return false
    return true
  })
}

function dungeonEncounterFamilies(eligible, cfg) {
  const byName = new Map((eligible || []).map(tmpl => [tmpl.name, tmpl]))
  const families = []
  for (const [id, def] of Object.entries(cfg?.families || {})) {
    const members = (def.members || []).map(name => byName.get(name)).filter(Boolean)
    if (!members.length) continue
    const common = members.filter(tmpl => (tmpl.rarity ?? 1) > (cfg.dominantRarityCutoff ?? 0.1))
    families.push({id, weight: Number(def.weight ?? 1), members, commonMembers: common})
  }
  if (!families.length) {
    for (const tmpl of eligible || []) families.push({id: tmpl.name, weight: Math.max(0.0001, tmpl.rarity ?? 1), members: [tmpl], commonMembers: [tmpl]})
  }
  return families
}

function dungeonEncounterFamiliesForDepth(packageId, z, cfg, hooks = {}) {
  const eligible = dungeonEncounterTemplatesForDepth(packageId, z, cfg, hooks)
  return {eligible, families: dungeonEncounterFamilies(eligible, cfg)}
}

function spawnDungeonPackageEncounters(packageId, hooks = {}) {
  const packageCfg = dungeonPackageConfig(packageId) || {}
  const cfg = packageCfg.encounters
  if (!cfg) return
  const ruins = dungeonPackageLevels(packageId)
  if (!ruins.length) return

  const growthMin = cfg.densityGrowthRange?.[0] ?? 0.10
  const growthMax = cfg.densityGrowthRange?.[1] ?? growthMin
  const densityGrowth = growthMin + rng() * Math.max(0, growthMax - growthMin)
  const prefixNames = Object.keys(ENEMY_PREFIXES).filter(name => name !== 'Champion')
  const minSpacing = Math.max(1, cfg.minSpacing ?? 3)
  const tacticalMinSpacing = Math.max(1, cfg.tacticalMinSpacing ?? 1)
  const entranceClearance = Math.max(0, cfg.entranceClearance ?? 8)
  const shooterAbility = tmpl => (tmpl?.abilities || []).find(ability => Object.hasOwn(RANGED_CONFIG?.abilities || {}, ability)) || null
  const isShooterTemplate = tmpl => !!shooterAbility(tmpl)
  const hasGangPower = tmpl => (tmpl?.abilities || []).includes('gangPower')
  const weightedWithoutReplacement = (pool, count, weightFn) => {
    const available = pool.slice(), chosen = []
    while (available.length && chosen.length < count) {
      const value = pickWeighted(available, item => Math.max(0.0001, weightFn(item)))
      chosen.push(value)
      available.splice(available.indexOf(value), 1)
    }
    return chosen
  }
  const chooseMember = (family, role = 'any') => {
    let pool = family?.members?.slice() || []
    if (!pool.length) return null
    if (role === 'backline') {
      const shooters = pool.filter(isShooterTemplate)
      if (!shooters.length) return null
      pool = shooters
    } else if (role === 'frontline') {
      const preferred = pool.filter(tmpl => hasGangPower(tmpl) || !isShooterTemplate(tmpl))
      if (preferred.length) pool = preferred
    } else if (role === 'group') {
      const gang = pool.filter(hasGangPower)
      if (gang.length) pool = gang
    }
    return pickWeighted(pool, tmpl => Math.max(0.0001, tmpl.rarity ?? 1))
  }

  for (let floorIndex = 0; floorIndex < ruins.length; floorIndex++) {
    const {level, z} = ruins[floorIndex]
    const {eligible, families} = dungeonEncounterFamiliesForDepth(packageId, z, cfg, hooks)
    if (!eligible.length || !families.length) continue

    const descriptor = level.caves?.[0]
    const entrances = descriptor?.entrances || []
    const rooms = Array.isArray(level.rooms) && level.rooms.length ? level.rooms : (level._encounterRooms || [])
    const roomById = new Map(rooms.map(room => [room.id, room]))
    const walkableTiles = [], safeTiles = []
    for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
      const tile = level.map[y]?.[x]
      if (!TILE[tile]?.walk) continue
      walkableTiles.push({x, y})
      if (Array.isArray(cfg.spawnFloorTiles) && cfg.spawnFloorTiles.length && !cfg.spawnFloorTiles.includes(tile)) continue
      if (entrances.some(e => Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) <= entranceClearance)) continue
      if (!DungeonTraps.safeSpawn(x, y, z)) continue
      if (groundItems.some(item => (item.level ?? 0) === z && item.x === x && item.y === y)) continue
      if (enemies.some(enemy => enemy.alive && (enemy.level ?? 0) === z && enemy.x === x && enemy.y === y)) continue
      safeTiles.push({x, y})
    }
    if (!safeTiles.length) continue

    let threatBudget = Math.max(1, Math.round(
      walkableTiles.length / Math.max(1, cfg.baseTilesPerEnemy ?? 75) *
      (1 + floorIndex * densityGrowth)
    ))

    let dominantPool = families.filter(family => family.commonMembers.length)
    if (dominantPool.length < 2) dominantPool = families.slice()
    const requestedFamilies = randInt(cfg.dominantFamilyCountRange?.[0] ?? 2, cfg.dominantFamilyCountRange?.[1] ?? 4)
    let dominant = weightedWithoutReplacement(dominantPool, Math.min(requestedFamilies, dominantPool.length), family =>
      family.weight * family.members.reduce((sum, tmpl) => sum + Math.max(0.0001, tmpl.rarity ?? 1), 0))
    if (!dominant.length) continue

    const vaults = Array.isArray(level.vaults) ? level.vaults : []
    const needsShooterFamily = vaults.some(vault => (vault.roles?.backline || 0) > 0 && (vault.slots?.backline || []).length)
    const shooterFamilies = families.filter(family => family.members.some(isShooterTemplate))
    if (needsShooterFamily && shooterFamilies.length && !dominant.some(family => family.members.some(isShooterTemplate))) {
      const shooterFamily = pickWeighted(shooterFamilies, family => Math.max(0.0001, family.weight))
      if (dominant.length >= Math.max(1, requestedFamilies)) dominant[dominant.length - 1] = shooterFamily
      else dominant.push(shooterFamily)
      dominant = [...new Map(dominant.map(family => [family.id, family])).values()]
    }

    level.encounterFamilies = dominant.map(family => family.id)
    if (descriptor) descriptor.encounterFamilies = level.encounterFamilies.slice()

    const dominantMemberNames = new Set(dominant.flatMap(family => family.members.map(tmpl => tmpl.name)))
    const outsiderPool = eligible.filter(tmpl => !dominantMemberNames.has(tmpl.name))
    const roamerPool = outsiderPool.length ? outsiderPool : eligible
    const championCount = Math.max(1, Math.floor(cfg.championsPerFloor ?? 1))
    const championFamily = pickWeighted(dominant, family => Math.max(0.0001, family.weight))
    const championTemplate = chooseMember(championFamily, 'champion') || eligible[0]
    const cheapestDominant = dominant.reduce((sum, family) => sum + Math.min(...family.members.map(tmpl => Math.max(1, tmpl.tier))), 0)
    const cheapestRoamer = Math.min(...roamerPool.map(tmpl => Math.max(1, tmpl.tier)))
    const guaranteedShooterCost = needsShooterFamily && shooterFamilies.length
      ? Math.min(...shooterFamilies.flatMap(family => family.members.filter(isShooterTemplate).map(tmpl => Math.max(1, tmpl.tier))))
      : 0
    threatBudget = Math.max(threatBudget,
      Math.max(1, championTemplate.tier) * 2 * championCount + cheapestDominant + cheapestRoamer + guaranteedShooterCost)

    const spawned = []
    const spawnedFamilies = new Set()
    const usedPositions = new Set()
    const safeSet = new Set(safeTiles.map(p => keyXY(p.x, p.y)))
    const isSpaced = (p, tactical = false) => spawned.every(s =>
      Math.max(Math.abs(s.x - p.x), Math.abs(s.y - p.y)) >= (tactical ? tacticalMinSpacing : minSpacing))
    const validSpot = (p, tactical = false) => !!p && safeSet.has(keyXY(p.x, p.y)) &&
      !usedPositions.has(keyXY(p.x, p.y)) && isSpaced(p, tactical)
    const claimSpot = (p) => {
      usedPositions.add(keyXY(p.x, p.y))
      spawned.push({x:p.x, y:p.y})
      return {x:p.x, y:p.y}
    }
    const takeRoleSpot = (room, role, required = false) => {
      for (const p of room?.tacticalSlots?.[role] || []) if (validSpot(p, true)) return claimSpot(p)
      if (required) {
        for (const p of room?.tacticalSlots?.[role] || [])
          if (safeSet.has(keyXY(p.x, p.y)) && !usedPositions.has(keyXY(p.x, p.y))) return claimSpot(p)
        const fallback = safeTiles.find(p => !usedPositions.has(keyXY(p.x, p.y)) &&
          p.x > room.x && p.x < room.x + room.w - 1 && p.y > room.y && p.y < room.y + room.h - 1)
        if (fallback) return claimSpot(fallback)
      }
      return null
    }
    const takeSpot = (room = null, far = false, tactical = false) => {
      let candidates = safeTiles.filter(p => validSpot(p, tactical))
      if (room) {
        const inside = candidates.filter(p => p.x > room.x && p.x < room.x + room.w - 1 && p.y > room.y && p.y < room.y + room.h - 1)
        if (inside.length) candidates = inside
      }
      if (!candidates.length) return null
      if (far && entrances[0]) {
        const maxD = Math.max(...candidates.map(p => Math.max(Math.abs(p.x - entrances[0].x), Math.abs(p.y - entrances[0].y))))
        const remoteBand = Math.max(0, Math.floor(cfg.remoteCandidateBand ?? 4))
        const remote = candidates.filter(p => Math.max(Math.abs(p.x - entrances[0].x), Math.abs(p.y - entrances[0].y)) >= maxD - remoteBand)
        if (remote.length) candidates = remote
      }
      return claimSpot(pick(candidates))
    }

    // Do not override wandering for tactical roles: addEnemy applies each
    // species mode and home radius, including underground far -> roam.
    const spawnTemplate = (tmpl, spot, prefix = null, role = 'any', familyId = null, roomId = null, vaultId = null) => {
      if (!tmpl || !spot) return false
      const enemy = {
        name: tmpl.name,
        baseName: tmpl.name,
        tier: tmpl.tier,
        level: z,
        levelKind: 'chain',
        caveIndex: -1,
        hp: tmpl.hp,
        maxHp: tmpl.hp,
        atk: tmpl.atk,
        def: tmpl.def,
        spd: tmpl.spd,
        grace: tmpl.grace,
        abilities: [...tmpl.abilities],
        humanoid: !!tmpl.humanoid,
        aggro: tmpl.aggro ?? AGGRO_RANGE,
        x: spot.x,
        y: spot.y,
        homeX: spot.x,
        homeY: spot.y,
        homeTileType: level.map[spot.y][spot.x],
        alive: true,
        prefix: null,
        equipment: null,
        dungeonRole: role,
        encounterFamily: familyId,
        dungeonRoomId: roomId,
        dungeonVaultId: vaultId
      }
      if (role === 'backline') {
        const ability = shooterAbility(tmpl)
        if (ability) {
          enemy.shooterAbility = ability
          enemy.shotsRemaining = RANGED_CONFIG.startingShots
        }
      } else if (role === 'frontline' || role === 'group') {
        enemy.shooterAbility = null
        enemy.shotsRemaining = 0
      }
      if (prefix) {
        enemy.prefix = prefix
        enemy.prefixBase = prefixBaseStats(enemy)
        applyEnemyPrefix(enemy, prefix)
        enemy.name = prefix + ' ' + enemy.name
      } else {
        const prefixChance = Math.min(cfg.prefixChanceCap ?? 1, (cfg.prefixBaseChance ?? 0) + floorIndex * (cfg.prefixGrowthPerFloor ?? 0))
        if (prefixNames.length && chance(prefixChance)) {
          const rolled = pick(prefixNames)
          enemy.prefix = rolled
          enemy.prefixBase = prefixBaseStats(enemy)
          applyEnemyPrefix(enemy, rolled)
          enemy.name = rolled + ' ' + enemy.name
        }
      }
      addEnemy(enemy)
      if (familyId) spawnedFamilies.add(familyId)
      return enemy
    }

    let spent = 0
    const organizedBudget = Math.max(1, Math.floor(threatBudget * Math.min(1, Math.max(0, cfg.dominantFamilyShare ?? 0.82))))
    const nonEntranceRooms = rooms.filter(room => room.index !== 0 && room.archetype !== 'Entrance Hall')
    const farthestRoom = nonEntranceRooms.length && entrances[0]
      ? nonEntranceRooms.reduce((best, room) => {
          const d = Math.max(Math.abs(room.cx - entrances[0].x), Math.abs(room.cy - entrances[0].y))
          return !best || d > best.d ? {room, d} : best
        }, null)?.room
      : null
    const artifactVault = vaults.find(vault => vault.artifactReserved)
    const championVault = vaults.find(vault => (vault.roles?.champion || 0) > 0) || artifactVault || null
    const keyCarrierPlan = level.progressionKey?.mode === 'championCarrier' ? level.progressionKey : null
    const keyCarrierRoom = keyCarrierPlan ? roomById.get(keyCarrierPlan.targetRoomId) || null : null
    // Vaults spend their most tactical slots first. A backline slot is not a
    // cosmetic label: where the selected family has a ranged-capable member,
    // that spawn is forced to be a shooter and therefore starts with ammo.
    let vaultFamilyCursor = 0
    for (const vault of vaults) {
      const room = roomById.get(vault.roomId)
      if (!room) continue
      let familyChoices = dominant
      if ((vault.roles?.backline || 0) > 0) {
        const shooterDominant = dominant.filter(family => family.members.some(isShooterTemplate))
        if (shooterDominant.length) familyChoices = shooterDominant
      }
      const family = familyChoices[vaultFamilyCursor++ % familyChoices.length]
      vault.encounterFamily = family.id
      room.encounterFamily = family.id
      for (const role of ['backline', 'frontline', 'group', 'any']) {
        const slots = room.tacticalSlots?.[role] || []
        const requested = Math.min(Number(vault.roles?.[role] || 0), slots.length)
        for (let n = 0; n < requested; n++) {
          const tmpl = chooseMember(family, role)
          if (!tmpl) continue
          const cost = Math.max(1, tmpl.tier)
          if (spent + cost > organizedBudget && !(role === 'backline' && n === 0)) break
          const spot = takeRoleSpot(room, role, role === 'backline' && n === 0)
          if (!spot) break
          if (spawnTemplate(tmpl, spot, null, role, family.id, room.id, vault.id)) spent += cost
        }
      }
    }

    for (let championIndex = 0; championIndex < championCount; championIndex++) {
      const family = championIndex === 0
        ? championFamily
        : pickWeighted(dominant, candidate => Math.max(0.0001, candidate.weight))
      const tmpl = chooseMember(family, 'champion') || eligible[0]
      const championRoom = championIndex === 0
        ? (keyCarrierRoom || roomById.get(championVault?.roomId) || farthestRoom)
        : (nonEntranceRooms[championIndex % Math.max(1, nonEntranceRooms.length)] || farthestRoom)
      const championRoomVault = vaults.find(vault => vault.roomId === championRoom?.id) || null
      const vaultId = championIndex === 0 ? championRoomVault?.id || championVault?.id || null : null
      const championSpot = takeRoleSpot(championRoom, 'champion') || takeRoleSpot(championRoom, 'group') ||
        takeRoleSpot(championRoom, 'frontline') || takeRoleSpot(championRoom, 'any') ||
        takeSpot(championRoom, true, true) || takeSpot(null, true)
      if (!championSpot) continue
      const championEnemy = spawnTemplate(tmpl, championSpot, 'Champion', 'champion', family.id,
        championRoom?.id || null, vaultId)
      if (!championEnemy) continue
      if (championIndex === 0 && keyCarrierPlan) {
        const keyItemKind = packageCfg.progressionKeys?.itemKind || hooks.progressionKeyItemKind || 'dungeonkey'
        championEnemy.carriedDungeonKey = {kind:keyItemKind,keyId:keyCarrierPlan.keyId,progressionKey:true}
      }
      spent += Math.max(1, tmpl.tier)
      const escortSpot = takeRoleSpot(championRoom, 'group') || takeRoleSpot(championRoom, 'frontline') ||
        takeSpot(championRoom, false, true) || takeSpot(null, false, true) || takeSpot()
      if (escortSpot && spawnTemplate(tmpl, escortSpot, null, 'group', family.id,
        championRoom?.id || null, vaultId)) spent += Math.max(1, tmpl.tier)
    }

    // Make every selected family visible even if the tactical vaults happened
    // to consume the whole first budget slice with another family.
    let roomCursor = 0
    for (const family of dominant) {
      if (spawnedFamilies.has(family.id)) continue
      const room = nonEntranceRooms.length ? nonEntranceRooms[roomCursor++ % nonEntranceRooms.length] : null
      const tmpl = chooseMember(family, room?.archetype === 'Barracks' ? 'group' : 'any')
      const spot = takeRoleSpot(room, 'group') || takeRoleSpot(room, 'any') || takeSpot(room, false, true)
      if (!tmpl || !spot) continue
      if (spawnTemplate(tmpl, spot, null, 'group', family.id, room?.id || null, null)) spent += Math.max(1, tmpl.tier)
    }

    // Procedural rooms use the same role geometry as authored vaults. Room
    // archetype changes how much of the remaining floor budget it receives.
    const roomDefs = packageCfg.rooms?.archetypes || {}
    const ordinaryRooms = nonEntranceRooms.filter(room => !room.vaultType)
    for (const room of ordinaryRooms) {
      if (spent >= organizedBudget) break
      const family = dominant[roomCursor++ % dominant.length]
      room.encounterFamily = family.id
      const multiplier = Math.max(0.5, Number(roomDefs[room.archetype]?.encounterMultiplier ?? 1))
      const target = Math.max(1, Math.min(4, Math.round(multiplier * 2)))
      const configuredRoleOrder = roomDefs[room.archetype]?.tacticalRoleOrder
      const roleOrder = Array.isArray(configuredRoleOrder) && configuredRoleOrder.length
        ? configuredRoleOrder
        : ['group','any','frontline']
      for (let n = 0; n < target && spent < organizedBudget; n++) {
        const role = roleOrder[n % roleOrder.length]
        const tmpl = chooseMember(family, role)
        const cost = tmpl ? Math.max(1, tmpl.tier) : Infinity
        if (!tmpl || spent + cost > organizedBudget) break
        const spot = takeRoleSpot(room, role) || takeSpot(room, false, true)
        if (!spot) break
        if (spawnTemplate(tmpl, spot, null, role, family.id, room.id, null)) spent += cost
      }
    }

    // Some cells still have an armed prisoner. Use a real ranged-capable
    // species and the ordinary ammo/wandering rules, not a stationary turret.
    const cellShooterChance = 0.65
    const cellShooterPool = eligible.filter(isShooterTemplate)
    for (const room of nonEntranceRooms.filter(room => room.archetype === 'Prison')) {
      const cell = room.prisonCellRegion
      if (!cell || !cellShooterPool.length) continue
      const inCell = p => p.x >= cell.x1 && p.x <= cell.x2 && p.y >= cell.y1 && p.y <= cell.y2
      if (enemies.some(e => e.alive && e.level === z && inCell(e) && enemyIsShooter(e))) continue
      if (!chance(cellShooterChance)) continue
      const candidates = safeTiles.filter(p => inCell(p) && validSpot(p, true))
      if (!candidates.length) continue
      // Prefer a clear lane toward the bars, with the shooter in front of any
      // stored loot/remains rather than stuck firing through those objects.
      const door = room.prisonCellDoorCandidate
      candidates.sort((a,b) =>
        Number(dungeonClearProjectileLine(level.map, b, door)) - Number(dungeonClearProjectileLine(level.map, a, door)) ||
        (Math.abs(a.x-door.x)+Math.abs(a.y-door.y)) - (Math.abs(b.x-door.x)+Math.abs(b.y-door.y)))
      const tmpl = pickWeighted(cellShooterPool, t => Math.max(0.0001, t.rarity ?? 1))
      const spot = claimSpot(candidates[0])
      if (spawnTemplate(tmpl, spot, null, 'backline', null, room.id,
        vaults.find(vault => vault.roomId === room.id)?.id || null)) spent += Math.max(1, tmpl.tier)
    }

    // Ambient roamers remain the broad-pool exception for family selection,
    // but all encounter roles now share normal species wandering behavior.
    let guard = 0
    while (spent < threatBudget && guard++ < 100) {
      const affordable = roamerPool.filter(tmpl => Math.max(1, tmpl.tier) <= threatBudget - spent)
      if (!affordable.length) break
      const tmpl = pickWeighted(affordable, t => Math.max(0.0001, t.rarity ?? 1))
      const spot = takeSpot(null)
      if (!spot) break
      if (spawnTemplate(tmpl, spot, null, 'roamer', null, null, null)) spent += Math.max(1, tmpl.tier)
    }
  }
}

function spawnDwarvenRuinsEncounters() {
  return spawnDungeonPackageEncounters('dwarvenRuins')
}

function spawnDwarvenRuinsRoomProps(level, z) {
  if (!level || level.dungeonPackage !== 'dwarvenRuins') return
  const story = dungeonPackageConfig(level.dungeonPackage)?.story || {}
  const rooms = (level.rooms || []).filter(room => room.index !== 0)
  const occupied = new Set(groundItems.filter(g => (g.level ?? 0) === z).map(g => keyXY(g.x, g.y)))
  const slotKeys = new Set(rooms.flatMap(room => Object.values(room.tacticalSlots || {}).flat().map(p => keyXY(p.x, p.y))))
  // Keep authored shooter lanes clear of decorative ground props as well as
  // terrain. Ground items stop projectiles, so occupying an intermediate lane
  // cell would silently turn a valid backline role into a fake one.
  for (const room of rooms) {
    const entry = dwarvenRoomEntryPoint(level.map, room)
    for (const slot of room.tacticalSlots?.backline || []) {
      let x0 = slot.x, y0 = slot.y
      const dx = Math.abs(entry.x - x0), sx = x0 < entry.x ? 1 : -1
      const dy = -Math.abs(entry.y - y0), sy = y0 < entry.y ? 1 : -1
      let err = dx + dy
      while (!(x0 === entry.x && y0 === entry.y)) {
        const e2 = 2 * err
        if (e2 >= dy) { err += dy; x0 += sx }
        if (e2 <= dx) { err += dx; y0 += sy }
        slotKeys.add(keyXY(x0, y0))
      }
    }
  }
  const inPrisonCell = (room, p) => {
    const c = room.prisonCellRegion
    return !!c && p.x >= c.x1 && p.x <= c.x2 && p.y >= c.y1 && p.y <= c.y2
  }
  const roomSpots = (room, outsideCells = false) => dwarvenRoomInterior(room).filter(p =>
    level.map[p.y]?.[p.x] === 'marble' && !occupied.has(keyXY(p.x, p.y)) &&
    !slotKeys.has(keyXY(p.x, p.y)) &&
    Math.abs(p.x - room.cx) + Math.abs(p.y - room.cy) > 1 &&
    (!outsideCells || !inPrisonCell(room, p)))
  const addProp = (room, kind, description, extra = null, outsideCells = false) => {
    const spots = roomSpots(room, outsideCells)
    if (!spots.length) return false
    const spot = pick(spots)
    groundItems.push({x:spot.x,y:spot.y,kind,looted:false,level:z,levelKind:'chain',caveIndex:-1,
      ...(description ? {description} : {}), ...(extra || {})})
    occupied.add(keyXY(spot.x, spot.y))
    return true
  }
  // Each prison cell gets its own occupant or cache. This is *additional* to
  // the floor's original scattered decorative and searchable remains rolls.
  // A body in a cell does not reduce the number of bodies elsewhere.
  for (const room of rooms.filter(room => room.archetype === 'Prison')) {
    const cell = room.prisonCellRegion
    if (!cell) continue
    const inside = p => p.x >= cell.x1 && p.x <= cell.x2 && p.y >= cell.y1 && p.y <= cell.y2
    // Keep firing lanes clear if possible, but never leave a cell empty just
    // because every good corpse location also overlaps a tactical slot.
    let spots = roomSpots(room).filter(inside)
    if (!spots.length) spots = dwarvenPrisonCellPoints(room).filter(p =>
      level.map[p.y]?.[p.x] === 'marble' && !occupied.has(keyXY(p.x, p.y)))
    if (!spots.length) continue
    const spot = pick(spots)
    if (chance(0.75)) {
      groundItems.push({x:spot.x,y:spot.y,level:z,levelKind:'chain',caveIndex:-1,
        kind:'skeleton',looted:false,hasLoot:chance(0.10),
        description:'A dead prisoner lies behind the old dwarven bars.'})
    } else {
      groundItems.push({x:spot.x,y:spot.y,level:z,levelKind:'chain',caveIndex:-1,
        kind:'chest',opened:false,tier:dungeonLootTier('dwarvenRuins', Math.max(0, (level.dungeonFloor || 1)-1), room),
        dungeonRoomId:room.id})
    }
    occupied.add(keyXY(spot.x, spot.y))
  }
  for (const room of rooms) {
    if (room.archetype === 'Forge') addProp(room, 'anvil', 'A dwarven anvil abandoned in the middle of unfinished work.')
    else if (room.archetype === 'Burial Chamber' || room.archetype === 'Temple')
      addProp(room, 'dwarvenremains', 'Old dwarven remains lie where this chamber was overrun.')
  }
  // Decorative dwarven remains and searchable skeletal remains are separate
  // populations. The former preserve the ruined-fort dressing; the latter are
  // interactive corpses using the normal one-time search/loot rules.
  const remainsRange = story.remainsPerFloorRange || [2, 4]
  const remainsBase = randInt(remainsRange[0], remainsRange[1])
  const remainsProgress = dungeonProgressMultiplier(story.remainsProgressMultiplierRange, level.progress, 1)
  const remainsMultiplier = level.progress >= 1
    ? Math.max(remainsProgress, Number(story.finalFloorRemainsMultiplier ?? 1))
    : remainsProgress
  const remainsTarget = Math.max(1, Math.round(remainsBase * remainsMultiplier))
  for (let n = 0; n < remainsTarget; n++) {
    const candidates = rooms.filter(room => roomSpots(room, true).length)
    if (!candidates.length) break
    const room = pick(candidates)
    addProp(room, 'dwarvenremains', level.progress >= 1
      ? 'Dwarven remains are piled around a failed defensive position.'
      : 'Dwarven remains lie amid the abandoned settlement.', null, true)
  }

  const skeletonRange = story.searchableSkeletonsPerFloorRange || [3, 5]
  const skeletonBase = randInt(skeletonRange[0], skeletonRange[1])
  const skeletonProgress = dungeonProgressMultiplier(story.searchableSkeletonsProgressMultiplierRange, level.progress, 1)
  const skeletonMultiplier = level.progress >= 1
    ? Math.max(skeletonProgress, Number(story.finalFloorSearchableSkeletonsMultiplier ?? 1))
    : skeletonProgress
  const skeletonTarget = Math.max(1, Math.round(skeletonBase * skeletonMultiplier))
  for (let n = 0; n < skeletonTarget; n++) {
    const candidates = rooms.filter(room => roomSpots(room, true).length)
    if (!candidates.length) break
    const room = pick(candidates)
    addProp(room, 'skeleton', level.progress >= 1
      ? 'The bones are piled around a failed defensive position.'
      : 'A dead dwarf lies where the settlement fell.',
      {hasLoot: chance(0.10)}, true)
  }
}

function dungeonLootBudget(packageId, floorIndex, hasMajorVault = false) {
  const cfg = dungeonPackageConfig(packageId)?.loot || {}
  let budget = (cfg.baseBudget ?? 1) * (1 + floorIndex * (cfg.growthPerFloor ?? 0))
  if (hasMajorVault && chance(cfg.majorVaultBonusChance ?? 0)) budget += 1
  return Math.max(1, Math.round(budget))
}

function dungeonLootTier(packageId, floorIndex, room = null, vault = null) {
  const cfg = dungeonPackageConfig(packageId)?.loot || {}
  const bias = Math.min(cfg.tierBiasCap ?? 1,
    floorIndex * (cfg.tierBiasGrowth ?? 0) + Number(room?.tierBiasBonus ?? 0) + Number(vault?.tierBiasBonus ?? 0))
  const tiers = Object.entries(cfg.tierWeights || {'2':1}).map(([tier, weight]) => ({
    tier: Number(tier),
    weight: Math.max(0.0001, Number(weight) * (1 + bias * Math.max(0, Number(tier) - 1)))
  }))
  return pickWeighted(tiers, entry => entry.weight).tier
}

function spawnDwarvenRuinsChests() {
  const packageId = 'dwarvenRuins'
  const packageCfg = dungeonPackageConfig(packageId) || {}
  const cfg = packageCfg.loot || {}
  const roomDefs = packageCfg.rooms?.archetypes || {}
  for (const {level, z} of dungeonPackageLevels(packageId)) {
    const floorIndex = Math.max(0, (level.dungeonFloor || 1) - 1)
    const entry = level.caves[0].entrances[0]
    const safeRoute = DungeonTraps.safeReachable(level.map, entry,
      new Set((level.traps || []).map(t => keyXY(t.trigger.x, t.trigger.y))))
    const rooms = (level.rooms || level._encounterRooms || []).filter(room => room.index !== 0 && room.archetype !== 'Entrance Hall')
    const vaultByRoom = new Map((level.vaults || []).map(vault => [vault.roomId, vault]))
    const candidatesForRoom = room => {
      const spots = []
      for (let y = room.y + 1; y < room.y + room.h - 1; y++) for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
        if (level.map[y]?.[x] !== 'marble' || !safeRoute.has(keyXY(x, y)) ||
            Math.max(Math.abs(x - entry.x), Math.abs(y - entry.y)) <= cfg.entranceClearance ||
            !DungeonTraps.safeSpawn(x, y, z) ||
            enemies.some(e => e.alive && e.level === z && e.x === x && e.y === y) ||
            groundItems.some(g => g.level === z && g.x === x && g.y === y)) continue
        spots.push({x, y})
      }
      return spots
    }

    // The guaranteed Ruins artifact chest is placed during stratum construction
    // so props, traps, and encounters all treat its tile as occupied. Ordinary
    // depth-scaled loot is added here afterward.

    const chestCount = dungeonLootBudget(packageId, floorIndex, !!(level.vaults || []).length)
    const roomUse = new Map()
    for (let n = 0; n < chestCount; n++) {
      const available = rooms.map(room => ({room, spots:candidatesForRoom(room)})).filter(entry => entry.spots.length)
      if (!available.length) break
      const chosen = pickWeighted(available, entry => {
        const room = entry.room, vault = vaultByRoom.get(room.id)
        const roomMultiplier = Number(roomDefs[room.archetype]?.lootMultiplier ?? 1)
        const vaultMultiplier = Number(vault?.lootMultiplier ?? 1)
        const repeatPenalty = 1 / (1 + (roomUse.get(room.id) || 0))
        return Math.max(0.05, roomMultiplier * vaultMultiplier * repeatPenalty)
      })
      const room = chosen.room, vault = vaultByRoom.get(room.id)
      room.tierBiasBonus = Number(roomDefs[room.archetype]?.tierBiasBonus ?? 0)
      const spot = pick(chosen.spots)
      groundItems.push({x:spot.x,y:spot.y,level:z,levelKind:'chain',caveIndex:-1,kind:'chest',
        tier:dungeonLootTier(packageId, floorIndex, room, vault),opened:false,
        dungeonRoomId:room.id,vaultId:vault?.id || null})
      roomUse.set(room.id, (roomUse.get(room.id) || 0) + 1)
    }
  }
}


function dungeonGenerationLockLeavesAt(cm, x, y) {
  const tile = cm[y]?.[x]
  const isGate = tile === 'dwarvengatelocked'
  const isDoor = tile === 'dwarvendoorlocked' || tile === 'dwarvenprisondoorlocked'
  if (!isGate && !isDoor) return []
  const family = isGate
    ? new Set(['dwarvengatelocked','dwarvengateopen','dwarvengatebreached'])
    : tile === 'dwarvenprisondoorlocked'
      ? new Set(['dwarvenprisondoorlocked','dwarvenprisondoorbreached'])
      : new Set(['dwarvendoorlocked','dwarvendoorbreached'])
  const leaves = [{x,y}]
  const adjacent = [[0,-1],[-1,0],[1,0],[0,1]].map(([dx,dy]) => ({x:x+dx,y:y+dy}))
    .filter(p => family.has(cm[p.y]?.[p.x]))
    .sort((a,b) => a.y-b.y || a.x-b.x)
  if (adjacent.length) leaves.push(adjacent[0])
  return leaves.sort((a,b) => a.y-b.y || a.x-b.x)
}

function dungeonGenerationReachableWithKeys(cm, start, z, heldKeys) {
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]]
  const seen = new Set([keyXY(start.x,start.y)]), queue = [{x:start.x,y:start.y}]
  for (let qi=0; qi<queue.length; qi++) {
    const p = queue[qi]
    for (const [dx,dy] of dirs) {
      const x=p.x+dx, y=p.y+dy, key=keyXY(x,y)
      if (x<0 || y<0 || x>=MAP_W || y>=MAP_H || seen.has(key)) continue
      const tile = cm[y]?.[x]
      let passable = !!TILE[tile]?.walk || tile === 'dwarvendoorclosed' || tile === 'dwarvenprisondoorclosed'
      if (!passable && (tile === 'dwarvendoorlocked' || tile === 'dwarvenprisondoorlocked' || tile === 'dwarvengatelocked')) {
        const kind = tile === 'dwarvengatelocked' ? 'gate' : 'door'
        const lockId = dwarvenDungeonLockId(z, kind, dungeonGenerationLockLeavesAt(cm,x,y))
        passable = heldKeys.has(lockId)
      }
      if (!passable) continue
      seen.add(key); queue.push({x,y})
    }
  }
  return seen
}

function validateDwarvenRuinsKeyDependencies(level, z, entry, exit) {
  const plan = level.progressionKey || null
  if (!plan) {
    const hasBreachedGate = level.map.some(row => row.includes('dwarvengatebreached'))
    return {ok:hasBreachedGate, reason:hasBreachedGate ? null : 'missing breached progression gate'}
  }
  const keySources = []
  for (const item of groundItems) {
    if ((item.level ?? 0) !== z) continue
    if (item.kind === 'dwarvenkey' && item.keyId) keySources.push({x:item.x,y:item.y,keyId:item.keyId,kind:'ground'})
    if (item.dungeonKey?.kind === 'dwarvenkey' && item.dungeonKey.keyId)
      keySources.push({x:item.x,y:item.y,keyId:item.dungeonKey.keyId,kind:'remains'})
  }
  for (const enemy of enemies) if (enemy.alive && (enemy.level ?? 0) === z && enemy.carriedDungeonKey?.keyId)
    keySources.push({x:enemy.x,y:enemy.y,keyId:enemy.carriedDungeonKey.keyId,kind:'carrier'})

  const matchingProgressionSources = keySources.filter(source => source.keyId === plan.keyId)
  if (matchingProgressionSources.length !== 1)
    return {ok:false, reason:`progression key has ${matchingProgressionSources.length} live sources`}

  const held = new Set(), collected = new Set()
  let reachable = null, changed = true
  while (changed) {
    changed = false
    reachable = dungeonGenerationReachableWithKeys(level.map, entry, z, held)
    for (let i=0; i<keySources.length; i++) {
      if (collected.has(i) || !reachable.has(keyXY(keySources[i].x,keySources[i].y))) continue
      collected.add(i); held.add(keySources[i].keyId); changed = true
    }
  }
  reachable = dungeonGenerationReachableWithKeys(level.map, entry, z, held)
  if (!held.has(plan.keyId)) return {ok:false, reason:`${plan.mode} progression key is not reachable before its gate`}
  if (!reachable.has(keyXY(exit.x,exit.y))) return {ok:false, reason:'exit remains unreachable after collecting reachable keys'}
  if (plan.mode === 'lockedSideRoom' && plan.requiresLockId && !held.has(plan.requiresLockId))
    return {ok:false, reason:'locked side-room local key is not reachable'}
  return {ok:true, reason:null}
}

function validateDungeonStratumBasics(packageId) {
  const cfg = dungeonPackageConfig(packageId) || {}
  const issues = []
  const levels = deepLevels.map((level, index) => ({level,index}))
    .filter(entry => entry.level?.dungeonPackage === packageId)
  const [minFloors,maxFloors] = cfg.levelCountRange || [0,Infinity]
  if (levels.length < minFloors || levels.length > maxFloors)
    issues.push(`floor count ${levels.length} outside ${minFloors}-${maxFloors}`)

  const contexts = []
  for (let floorIndex=0; floorIndex<levels.length; floorIndex++) {
    const {level,index} = levels[floorIndex]
    const z = chainZForDepth(index + 2)
    const descriptor = level.caves?.[0], entry = descriptor?.entrances?.[0], exit = descriptor?.entrances?.[1]
    const tag = `D${floorIndex+1}`
    const context = {level,index,z,descriptor,entry,exit,tag,floorIndex}
    contexts.push(context)
    if (!entry || !exit) { issues.push(`${tag}: missing entrance/exit`); continue }
    const graph = level.roomGraph || descriptor?.roomGraph
    if (!graph || graph.graphDistance < (cfg.layout?.minimumEntranceExitRoomGraphDistance ?? 1))
      issues.push(`${tag}: room graph distance is too short or missing`)
    if (!graph?.mainRoute?.length || graph.mainRoute[0] !== graph.entranceRoomId || graph.mainRoute.at(-1) !== graph.exitRoomId)
      issues.push(`${tag}: main-route metadata is inconsistent`)

    const eventual = dungeonWalkDistancesWithDoorTraversal(level.map, entry)
    context.eventual = eventual
    const walkingDistance = eventual.get(keyXY(exit.x,exit.y))
    if (!Number.isFinite(walkingDistance) || walkingDistance < (cfg.layout?.minimumEntranceExitWalkingDistance ?? 1))
      issues.push(`${tag}: entrance/exit walking separation is invalid`)

    for (const room of level.rooms || []) {
      if (room.index === 0) continue
      const connected = dwarvenRoomInterior(room).some(p => eventual.has(keyXY(p.x,p.y)))
      if (!connected) issues.push(`${tag}: disconnected room ${room.id}`)
    }
    for (const vault of level.vaults || []) {
      const room = (level.rooms || []).find(candidate => candidate.id === vault.roomId)
      if (!room) { issues.push(`${tag}: vault ${vault.id} has no room`); continue }
      const def = cfg.vaults?.definitions?.[vault.type] || {}
      const entranceRange = def.requiredEntrances || [1, Infinity]
      const connectionCount = Math.max(1, Number(room.connectionCount) || room.doorways?.length || 0)
      if (connectionCount < entranceRange[0] || connectionCount > entranceRange[1])
        issues.push(`${tag}: vault ${vault.id} has ${connectionCount} graph entrances outside ${entranceRange[0]}-${entranceRange[1]}`)
      const requiredZones = new Set(def.internalZones || [])
      const actualZones = new Set((vault.zones || []).map(zone => zone.id))
      for (const zone of requiredZones) if (!actualZones.has(zone)) issues.push(`${tag}: vault ${vault.id} is missing ${zone} zone`)
      if ((vault.roles?.backline || 0) > 0 && !(vault.slots?.backline || []).length)
        issues.push(`${tag}: vault ${vault.id} has no usable backline slot`)
    }

    const trapBlocked = new Set((level.traps || []).map(trap => keyXY(trap.trigger.x,trap.trigger.y)))
    const trapSafe = DungeonTraps.safeReachable(level.map, entry, trapBlocked)
    context.trapSafe = trapSafe
    if (!trapSafe.has(keyXY(exit.x,exit.y))) issues.push(`${tag}: traps block mandatory traversal`)

    const floorEnemies = enemies.filter(enemy => enemy.alive && (enemy.level ?? 0) === z)
    context.floorEnemies = floorEnemies
    const champions = floorEnemies.filter(enemy => enemy.prefix === 'Champion')
    const expectedChampions = Math.max(1,Math.floor(cfg.encounters?.championsPerFloor ?? 1))
    if (champions.length !== expectedChampions) issues.push(`${tag}: expected ${expectedChampions} champion, found ${champions.length}`)
    for (const enemy of floorEnemies) {
      if (!TILE[level.map[enemy.y]?.[enemy.x]]?.walk) issues.push(`${tag}: enemy ${enemy.id || enemy.name} on invalid terrain`)
      if ((level.traps || []).some(trap => Math.max(Math.abs(enemy.x-trap.trigger.x),Math.abs(enemy.y-trap.trigger.y)) <= (cfg.traps?.spawnClearance ?? 0)))
        issues.push(`${tag}: enemy ${enemy.id || enemy.name} spawned too near a trap`)
    }

    const floorGround = groundItems.filter(item => (item.level ?? 0) === z)
    context.floorGround = floorGround
    const occupiedGround = new Set()
    for (const item of floorGround) {
      const key = keyXY(item.x,item.y)
      if (occupiedGround.has(key)) issues.push(`${tag}: multiple ground objects share ${key}`)
      occupiedGround.add(key)
      if ((level.traps || []).some(trap => trap.trigger.x === item.x && trap.trigger.y === item.y))
        issues.push(`${tag}: ground object occupies a trap trigger at ${key}`)
    }
  }
  return {ok:issues.length === 0,issues,contexts,levels:levels.map(entry => entry.level)}
}

function validateDwarvenRuinsStratum() {
  const cfg = dungeonPackageConfig('dwarvenRuins') || {}
  const base = validateDungeonStratumBasics('dwarvenRuins')
  const issues = base.issues.slice()
  let artifactCount = 0

  for (const context of base.contexts) {
    const {level,z,entry,exit,tag,floorIndex,trapSafe,floorGround} = context
    if (!entry || !exit) continue
    if (level.progressionKey && Number.isInteger(level.progressionKey.x) && Number.isInteger(level.progressionKey.y) &&
        !trapSafe.has(keyXY(level.progressionKey.x,level.progressionKey.y)))
      issues.push(`${tag}: traps make the progression key unavoidable/unreachable`)
    if (level.progressionKey?.mode === 'trapGuardedSideRoom') {
      const guard = level.progressionKey.guardPoint
      const radius = cfg.progressionKeys?.trapGuardRadius ?? 4
      if (!guard || !(level.traps || []).some(trap => Math.max(Math.abs(trap.trigger.x-guard.x),Math.abs(trap.trigger.y-guard.y)) <= radius))
        issues.push(`${tag}: trap-guarded key room has no nearby trap`)
    }

    const dependency = validateDwarvenRuinsKeyDependencies(level,z,entry,exit)
    if (!dependency.ok) issues.push(`${tag}: ${dependency.reason}`)

    for (const vault of level.vaults || []) {
      const room = (level.rooms || []).find(candidate => candidate.id === vault.roomId)
      if (!room) continue
      const def = cfg.vaults?.definitions?.[vault.type] || {}
      const entranceDoorLeaves = Array.isArray(vault.entranceDoorLeaves) && vault.entranceDoorLeaves.length
        ? vault.entranceDoorLeaves : (room.doorways || []).flat()
      const doorwayTiles = entranceDoorLeaves.map(p => level.map[p.y]?.[p.x])
      if (def.doorRequirement === 'locked' && (!doorwayTiles.length || !doorwayTiles.every(tile => tile === 'dwarvendoorlocked')))
        issues.push(`${tag}: vault ${vault.id} requires a locked entrance`)
      if (def.doorRequirement === 'closed' && (!doorwayTiles.length || !doorwayTiles.every(tile => tile === 'dwarvendoorclosed' || tile === 'dwarvendoorlocked')))
        issues.push(`${tag}: vault ${vault.id} requires a closed entrance`)
    }
    for (const room of level.rooms || []) {
      if (room.archetype !== 'Prison') continue
      const hasBars = dwarvenRoomInterior(room).some(p => level.map[p.y]?.[p.x] === 'dwarvenprisonbars')
      const hasCellDoor = (room.internalLocks || []).some(lock => lock.kind === 'prisonCell') ||
        (room.internalDoors || []).some(door => door.kind === 'prisonCell')
      if (!hasBars || !hasCellDoor) issues.push(`${tag}: Prison room ${room.id} lacks a functional barred side cell`)
      const cell = room.prisonCellRegion, door = room.prisonCellDoorCandidate
      if (!cell || !door) { issues.push(`${tag}: Prison room ${room.id} is missing cell geometry`); continue }
      const cells = dwarvenPrisonCellPoints(room)
      const content = [...(floorGround || []), ...(context.floorEnemies || [])].some(p =>
        p.x >= cell.x1 && p.x <= cell.x2 && p.y >= cell.y1 && p.y <= cell.y2)
      if (!content) issues.push(`${tag}: Prison room ${room.id} has an empty cell`)
      const reachableAroundCellDoor = dungeonWalkDistancesWithDoorTraversal(level.map, entry,
        new Set([keyXY(door.x, door.y)]), true)
      if (cells.some(p => reachableAroundCellDoor.has(keyXY(p.x, p.y))))
        issues.push(`${tag}: Prison room ${room.id} can be entered without using its barred door`)
    }

    artifactCount += (floorGround || []).filter(item => item.dwarvenRuinsArtifact && item.artifactGuaranteed).length
    if (floorIndex === base.contexts.length-1 && !level.map.some(row => row.includes('dwarvenminessealed')))
      issues.push(`${tag}: sealed Deep Mines continuation is missing`)
  }

  if (artifactCount !== 1) issues.push(`expected exactly one Ruins artifact chest, found ${artifactCount}`)
  const ruinLift = dungeonShortcutsForPackage('dwarvenRuins')[0] || null
  if (!ruinLift?.upper || !ruinLift?.lower || !ruinLift?.lever) issues.push('shortcut lift metadata is incomplete')
  else {
    const upper = deepLevels[chainDepthForZ(ruinLift.upper.z)-2]
    const lower = deepLevels[chainDepthForZ(ruinLift.lower.z)-2]
    if (upper?.map[ruinLift.upper.y]?.[ruinLift.upper.x] !== 'dwarvenliftoff') issues.push('upper lift endpoint is invalid')
    if (!['dwarvenliftoff','dwarvenlifton'].includes(lower?.map[ruinLift.lower.y]?.[ruinLift.lower.x])) issues.push('lower lift endpoint is invalid')
  }
  return {ok:issues.length === 0, issues}
}


function guardedChestSpots(e, used, accept = () => true) {
  const edgeMargin = WORLD_GEN_CONFIG.surfaceLoot.placementEdgeMargin
  const spots = []
  const aggroRange = effectiveAggroRange(e)
  for (let dy = -aggroRange; dy <= aggroRange; dy++) for (let dx = -aggroRange; dx <= aggroRange; dx++) {
    const x = e.x + dx, y = e.y + dy
    if (x < edgeMargin || y < edgeMargin || x >= MAP_W - edgeMargin || y >= MAP_H - edgeMargin || !accept(x, y)) continue
    if (!isWalkable(x, y) || map[y][x] === 'temple' || map[y][x] === 'belltower' || map[y][x] === 'caveentrance') continue
    if (occupied.has(keyXY(x, y)) || used.has(keyXY(x, y))) continue
    spots.push({x, y})
  }
  return spots
}

function spawnRemoteHighTierChests() {
  const cfg = WORLD_GEN_CONFIG.surfaceLoot
  // A few valuable tier-3 chests are deliberately placed in remote areas,
  // inside the aggro range of tier-3+ monsters so reaching them carries risk.
  const candidates = enemies.filter(e => e.alive && e.level === 0 && e.tier >= cfg.guardedChestMinEnemyTier && e.x >= 0 && e.y >= 0)
  let placed = 0
  const used = new Set(groundItems.filter(g => (g.level ?? 0) === 0).map(g => keyXY(g.x, g.y)))
  const shuffled = candidates.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  for (const e of shuffled) {
    if (placed >= cfg.remoteHighTierChestCount) break
    const aggroRange = effectiveAggroRange(e)
    const remote = villageCenter && Math.max(Math.abs(e.x - villageCenter.x), Math.abs(e.y - villageCenter.y)) >= cfg.remoteChestMinVillageDistance
    if (!remote || aggroRange < 1) continue
    const spots = guardedChestSpots(e, used)
    if (!spots.length) continue
    const spot = pick(spots)
    groundItems.push({x: spot.x, y: spot.y, kind: 'chest', tier: cfg.remoteHighTierChestTier, opened: false})
    used.add(keyXY(spot.x, spot.y))
    placed++
  }
}

function spawnEdgeHighTierChests() {
  const cfg = WORLD_GEN_CONFIG.surfaceLoot
  const edgeBand = Math.max(cfg.edgeBandMin, Math.round(Math.min(MAP_W, MAP_H) * cfg.edgeBandFraction))
  const northEdge = (x, y) => y <= edgeBand
  const anyEdge = (x, y) => northEdge(x, y) || x <= edgeBand || x >= MAP_W - 1 - edgeBand || y >= MAP_H - 1 - edgeBand
  const used = new Set(groundItems.filter(g => (g.level ?? 0) === 0).map(g => keyXY(g.x, g.y)))
  for (const n of npcs) used.add(keyXY(n.x, n.y))
  const candidates = enemies.filter(e => e.alive && e.level === 0 && e.tier >= cfg.guardedChestMinEnemyTier)
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  candidates.sort((a, b) => b.tier - a.tier)
  const guarded = new Set()
  let placed = 0
  const placeNear = (accept, limit) => {
    for (const e of candidates) {
      if (placed >= limit) break
      if (guarded.has(e)) continue
      const spots = guardedChestSpots(e, used, accept)
      if (!spots.length) continue
      const spot = pick(spots)
      groundItems.push({x: spot.x, y: spot.y, kind: 'chest', tier: e.tier, opened: false})
      used.add(keyXY(spot.x, spot.y))
      guarded.add(e)
      placed++
    }
  }
  placeNear(northEdge, cfg.northEdgeChestLimit)
  placeNear(anyEdge, cfg.allEdgeChestLimit)
}

function surfaceOrdinaryChestTier(x, y) {
  const cfg = WORLD_GEN_CONFIG.surfaceLoot
  return Math.min(cfg.ordinaryChestMaxTier,
    cfg.ordinaryChestBaseTier + Math.floor((Math.abs(x - spawnPoint.x) + Math.abs(y - spawnPoint.y)) / cfg.chestDistancePerTier))
}

// Submerged treasure requires a real 4–8-step swim to the nearest dry shore.
// Water touching the world border is sea; enclosed water bodies are lakes.
function submergedSurfaceChestCandidates() {
  const cfg = WORLD_GEN_CONFIG.surfaceLoot.submergedChests
  const [minDistance, maxDistance] = cfg.shoreDistanceRange
  const width = MAP_W, height = MAP_H, length = width * height
  const regions = new Int32Array(length).fill(-1)
  const shoreDistances = new Int16Array(length).fill(-1)
  const queue = new Int32Array(length)
  const directions = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]
  const isDryShore = tile => !!TILE[tile]?.walk &&
    tile !== 'water' && tile !== 'river' && tile !== 'frozenriver'
  const seaRegions = []
  let regionId = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const start = y * width + x
    if (map[y][x] !== 'water' || regions[start] !== -1) continue
    let head = 0, tail = 1, sea = false
    queue[0] = start
    regions[start] = regionId
    while (head < tail) {
      const pos = queue[head++], px = pos % width, py = (pos / width) | 0
      if (px === 0 || py === 0 || px === width - 1 || py === height - 1) sea = true
      for (const [dx, dy] of directions) {
        const nx = px + dx, ny = py + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || map[ny][nx] !== 'water') continue
        const next = ny * width + nx
        if (regions[next] === -1) { regions[next] = regionId; queue[tail++] = next }
      }
    }
    seaRegions[regionId++] = sea
  }

  // Multi-source water-only BFS measures shortest swimming distance from a
  // traversable shore. This uses the player's eight-direction movement model.
  let head = 0, tail = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (map[y][x] !== 'water') continue
    if (!directions.some(([dx, dy]) => isDryShore(map[y + dy]?.[x + dx]))) continue
    const index = y * width + x
    shoreDistances[index] = 1
    queue[tail++] = index
  }
  while (head < tail) {
    const pos = queue[head++], x = pos % width, y = (pos / width) | 0
    if (shoreDistances[pos] >= maxDistance) continue
    for (const [dx, dy] of directions) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || map[ny][nx] !== 'water') continue
      const next = ny * width + nx
      if (shoreDistances[next] !== -1) continue
      shoreDistances[next] = shoreDistances[pos] + 1
      queue[tail++] = next
    }
  }
  const used = new Set(groundItems.filter(g => (g.level ?? 0) === 0).map(g => keyXY(g.x,g.y)))
  const pools = {sea: [], lake: []}
  for (let y = cfg.placementEdgeMargin; y < height - cfg.placementEdgeMargin; y++)
    for (let x = cfg.placementEdgeMargin; x < width - cfg.placementEdgeMargin; x++) {
      const index = y * width + x, distance = shoreDistances[index]
      if (distance < minDistance || distance > maxDistance || used.has(keyXY(x, y)) || occupied.has(keyXY(x, y))) continue
      pools[seaRegions[regions[index]] ? 'sea' : 'lake'].push({x, y})
    }
  return pools
}

function spawnSubmergedSurfaceChests() {
  const cfg = WORLD_GEN_CONFIG.surfaceLoot.submergedChests
  if (!cfg?.countRange || !cfg?.shoreDistanceRange) return
  const pools = submergedSurfaceChestCandidates()
  const total = Math.min(pools.sea.length + pools.lake.length, randInt(...cfg.countRange))
  const lakeTarget = Math.min(pools.lake.length, Math.round(total * cfg.lakeShare))
  const seaTarget = Math.min(pools.sea.length, total - lakeTarget)
  const counts = {sea: seaTarget, lake: lakeTarget}
  // When one water class is scarce, fill the remaining budget from the other.
  let remaining = total - seaTarget - lakeTarget
  for (const type of ['sea','lake']) {
    const extra = Math.min(remaining, pools[type].length - counts[type])
    counts[type] += extra
    remaining -= extra
  }
  for (const type of ['sea','lake']) {
    const spots = pools[type]
    for (let i = 0; i < counts[type]; i++) {
      const index = randInt(0, spots.length - 1)
      const {x, y} = spots[index]
      spots[index] = spots[spots.length - 1]
      spots.pop()
      groundItems.push({x, y, kind:'chest', tier:surfaceOrdinaryChestTier(x, y), opened:false})
    }
  }
}

function spawnOrdinarySurfaceChests() {
  const cfg = WORLD_GEN_CONFIG.surfaceLoot
  const usedChests = new Set(groundItems.filter(g => (g.level ?? 0) === 0).map(g => keyXY(g.x, g.y)))
  const spots = []
  for (let y = cfg.placementEdgeMargin; y < MAP_H - cfg.placementEdgeMargin; y++) for (let x = cfg.placementEdgeMargin; x < MAP_W - cfg.placementEdgeMargin; x++) {
    const tile = map[y][x]
    if (isWalkable(x, y) && tile !== 'temple' && tile !== 'belltower' && tile !== 'caveentrance' && !usedChests.has(keyXY(x, y))) {
      spots.push({x, y})
    }
  }
  const total = Math.min(spots.length, Math.round(spots.length / SURFACE_TILES_PER_CHEST))
  for (let i = 0; i < total; i++) {
    const index = randInt(0, spots.length - 1)
    const {x, y} = spots[index]
    spots[index] = spots[spots.length - 1]
    spots.pop()
    groundItems.push({x, y, kind: 'chest', tier: surfaceOrdinaryChestTier(x, y), opened: false})
  }
}

function spawnGroundStuff() {
  const cfg = WORLD_GEN_CONFIG.surfaceLoot
  spawnOrdinarySurfaceChests()
  spawnSubmergedSurfaceChests()
  const used = new Set(groundItems.filter(g => (g.level ?? 0) === 0).map(g => keyXY(g.x, g.y)))
  const spots = []
  for (let y = cfg.placementEdgeMargin; y < MAP_H - cfg.placementEdgeMargin; y++) {
    for (let x = cfg.placementEdgeMargin; x < MAP_W - cfg.placementEdgeMargin; x++) {
      if (!isWalkable(x,y) || ['temple','belltower','caveentrance'].includes(map[y][x]) || used.has(keyXY(x,y))) continue
      spots.push({x,y})
    }
  }
  for (const [kind,count] of [['potion',cfg.loosePotions], ['scrollOfInvisibility',cfg.looseScrolls],
    ['speedpotion',cfg.looseSpeedPotions], ['herb',cfg.looseHerbs], ['mushroom',cfg.looseMushrooms]]) {
    for (let i=0;i<count && spots.length;i++) {
      const index=randInt(0,spots.length-1), spot=spots[index]
      spots[index]=spots[spots.length-1];spots.pop()
      groundItems.push({...spot,kind})
    }
  }
  // A handful of equipment pieces are buried beneath surface sand. Their
  // positions and items are fixed during world generation; digging merely
  // reveals the predetermined object rather than rolling forage loot.
  const occupiedGround = new Set(groundItems.filter(g => (g.level ?? 0) === 0).map(g => keyXY(g.x, g.y)))
  const sandSpots = []
  for (let y = cfg.placementEdgeMargin; y < MAP_H - cfg.placementEdgeMargin; y++) for (let x = cfg.placementEdgeMargin; x < MAP_W - cfg.placementEdgeMargin; x++) {
    if (map[y][x] !== 'sand' || occupiedGround.has(keyXY(x, y)) || occupied.has(keyXY(x, y))) continue
    sandSpots.push({x, y})
  }
  for (let i = 0; i < cfg.buriedGearCount && sandSpots.length; i++) {
    const spot = sandSpots.splice(randInt(0, sandSpots.length - 1), 1)[0]
    const tier = Math.min(cfg.buriedGearMaxTier, 1 + Math.floor((Math.abs(spot.x - spawnPoint.x) + Math.abs(spot.y - spawnPoint.y)) / cfg.chestDistancePerTier))
    const gearRoll = rng()
    const item = gearRoll < cfg.buriedWeaponChance ? makeWeaponItem(tier) : gearRoll < cfg.buriedWeaponChance + cfg.buriedArmorChance ? makeArmorItem(tier) : makeShieldItem(tier)
    groundItems.push({x: spot.x, y: spot.y, kind: 'buriedgear', item})
  }
  // Two rarer buried finds are full artifacts. Their artifact tier is rolled
  // independently during world generation, and they remain hidden until dug up.
  for (let i = 0; i < cfg.buriedArtifactCount && sandSpots.length; i++) {
    const spot = sandSpots.splice(randInt(0, sandSpots.length - 1), 1)[0]
    const item = makeArtifactItem(randInt(cfg.buriedArtifactTierRange[0], cfg.buriedArtifactTierRange[1]))
    groundItems.push({x: spot.x, y: spot.y, kind: 'buriedartifact', item})
  }
}

function assignVillageHutNames() {
  if (!villageHuts.length) return
  const oddName = Object.values(cemeteryTombstones).find(t => t.odd)?.name
  villageHuts.forEach(h => { h.name = null; h.mausoleum = false })

  // The first generated hut is the stable mausoleum hut. Its name comes
  // directly from the anomalous dwarven tombstone; no RNG is used for it.
  const mausoleumHut = villageHuts[0]
  if (oddName) {
    mausoleumHut.name = oddName
    mausoleumHut.mausoleum = true
    mausoleumHutPos = {x: mausoleumHut.x, y: mausoleumHut.y}
  }

  // Draw without replacement, so even duplicate entries in the name list
  // cannot give two peasants the same name. Keep the odd tombstone name reserved.
  const availableNames = [...new Set(HUMAN_NAMES)].filter(name => name !== oddName)
  for (let i = 1; i < villageHuts.length; i++) {
    if (!availableNames.length) throw new Error('Not enough unique human names for the village huts.')
    villageHuts[i].name = availableNames.splice(randInt(0, availableNames.length - 1), 1)[0]
  }
  // Keep the Black Key hut's special inspection separate. The selected
  // ordinary hut holds one fixed improvised weapon until it is claimed.
  const ordinaryHuts = villageHuts.filter(h => !h.mausoleum)
  if (ordinaryHuts.length) {
    const hut = pick(ordinaryHuts)
    hut.startingWeapon = pick(STARTING_WEAPONS)
    hut.startingWeaponTaken = false
  }
  // Keep the guaranteed gold in a different hut from the starting weapon.
  // Amounts and the other huts' 20% rolls are fixed at world creation.
  const goldHuts = ordinaryHuts.filter(h => !h.startingWeapon)
  if (goldHuts.length) {
    const guaranteedHut = pick(goldHuts)
    for (const hut of goldHuts) {
      if (hut !== guaranteedHut && !chance(WORLD_GEN_CONFIG.village.optionalGoldChance)) continue
      hut.goldLoot = randInt(WORLD_GEN_CONFIG.village.goldRange[0], WORLD_GEN_CONFIG.village.goldRange[1])
      hut.goldLootTaken = false
      if (hut === guaranteedHut) hut.guaranteedGold = true
    }
  }
}

function placeCemetery() {
  let forest = null
  for (let y = 3; y < MAP_H - 3 && !forest; y++) for (let x = 3; x < MAP_W - 3 && !forest; x++) if (map[y][x] === 'ancientForest') forest = {
    x,
    y
  }
  if (!forest) return
  cemeteryTombstones = {}
  let placed = 0, oddIndex = randInt(0, 5)
  const shapes = [[[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]], [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]]
  let shape = pick(shapes), origin = null
  for (let attempt = 0; attempt < 100 && !origin; attempt++) {
    const candidate = {x: forest.x + randInt(-8, 8), y: forest.y + randInt(-8, 8)}
    if (shape.every(([sx, sy]) => {
      const x = candidate.x + sx, y = candidate.y + sy
      return x >= 2 && y >= 2 && x < MAP_W - 2 && y < MAP_H - 2 && isWalkable(x, y) && map[y][x] !== 'ancientForest' && map[y][x] !== 'temple' && map[y][x] !== 'belltower' && map[y][x] !== 'ruinedchapel' && map[y][x] !== 'village'
    })) origin = candidate
    else if (attempt === 99) {
      for (const alt of shapes) {
        for (let y = forest.y - 10; y <= forest.y + 15 && !origin; y++) for (let x = forest.x - 10; x <= forest.x + 15 && !origin; x++) if (alt.every(([sx, sy]) => isWalkable(x + sx, y + sy) && map[y + sy][x + sx] !== 'ancientForest' && map[y + sy][x + sx] !== 'village')) {
          shape = alt
          origin = {x, y}
        }
      }
    }
  }
  if (!origin) return
  for (const [sx, sy] of shape) {
    const x = origin.x + sx, y = origin.y + sy
    if (!isWalkable(x, y) || map[y][x] === 'ancientForest' || map[y][x] === 'temple' || map[y][x] === 'ruinedchapel' || map[y][x] === 'village') continue
    const name = pick(ARTIFACT_NAMES_DWARF)
    const n = typeof name === 'string' ? name : (name.name || 'Unknown Dwarf')
    const death = placed === oddIndex ? randInt(701, 780) : randInt(520, 700)
    const birth = placed === oddIndex ? death - 70 : Math.max(120, death - randInt(35, 80))
    tileUnderlays[keyXY(x, y)] = tileUnderlays[keyXY(x, y)] || map[y][x]
    map[y][x] = 'grave'
    cemeteryTombstones[keyXY(x, y)] = {
      name: n,
      birth,
      death,
      odd: placed === oddIndex,
      inscription: `The tombstone bears the name ${n}. Born ${birth}, died ${death}.`
    }
    placed++
  }
  const graveKeys = Object.keys(cemeteryTombstones)
  if (graveKeys.length) {
    const [gx, gy] = graveKeys[0].split(',').map(Number)
    const chapelSpot = DIRS8.map(([dx, dy]) => ({
      x: gx + dx,
      y: gy + dy
    })).find(p => isWalkable(p.x, p.y) && map[p.y][p.x] !== 'grave')
    if (chapelSpot) {
      const key = keyXY(chapelSpot.x, chapelSpot.y)
      tileUnderlays[key] = tileUnderlays[key] || map[chapelSpot.y][chapelSpot.x]
      map[chapelSpot.y][chapelSpot.x] = 'ruinedchapel'
    }
  }
  const gh = ENEMY_TEMPLATES.find(t => t.name === 'Ghoul')
}

function spawnCemeteryGhouls() {
  const gh = ENEMY_TEMPLATES.find(t => t.name === 'Ghoul')
  if (!gh) return
  const graves = Object.keys(cemeteryTombstones).map(k => k.split(',').map(Number))
  if (!graves.length) return
  for (let i = 0; i < 3; i++) {
    const [gx, gy] = graves[i % graves.length]
    const x = gx + 1, y = gy
    if (!isWalkable(x, y) || occupied.has(keyXY(x, y))) continue
    addEnemy({
      name: 'Ghoul',
      baseName: 'Ghoul',
      tier: gh.tier,
      hp: gh.hp,
      maxHp: gh.hp,
      atk: gh.atk,
      def: gh.def,
      spd: gh.spd,
      aggro: gh.aggro ?? AGGRO_RANGE,
      x,
      y,
      homeX: x,
      homeY: y,
      level: 0,
      alive: true,
      humanoid: true,
      abilities: []
    })
    occupied.add(keyXY(x, y))
  }
}

function ensureGravediggerGrave() {
  const digger = npcs.find(n => n.name === 'Gravedigger')
  if (!digger || !surfaceMap) return
  const sx = gravediggerGraveKey && +gravediggerGraveKey.split(',')[0],
    sy = gravediggerGraveKey && +gravediggerGraveKey.split(',')[1]
  if (gravediggerGraveKey && surfaceMap[sy]?.[sx] === 'grave') return
  // Only the saved reference identifies this grave; cemetery graves are unrelated.
  // Use his home so NPC wandering never moves the landmark.
  const homeX = digger.homeX ?? digger.x, homeY = digger.homeY ?? digger.y
  for (let radius = 1; radius <= 20; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
    const gx = homeX + dx, gy = homeY + dy, key = keyXY(gx, gy)
    const walkable = TILE[surfaceMap[gy]?.[gx]]?.walk
    if (!walkable || npcs.some(n => n.x === gx && n.y === gy) || surfaceMap[gy][gx] === 'temple' || surfaceMap[gy][gx] === 'river' || surfaceMap[gy][gx] === 'water' || surfaceMap[gy][gx] === 'belltower' || surfaceMap[gy][gx] === 'grave' || surfaceMap[gy][gx] === 'village') continue
    const blocker = enemies.find(e => e.alive && e.level === 0 && e.x === gx && e.y === gy)
    if (blocker) {
      blocker.alive = false
      occupied.delete(key)
      enemies = enemies.filter(e => e !== blocker)
    }
    tileUnderlays[key] = surfaceMap[gy][gx]
    surfaceMap[gy][gx] = 'grave'
    if (currentZ === 0) map[gy][gx] = 'grave'
    gravediggerGraveKey = key
    return
  }
}

function clearGroundItemsUnderMerchant() {
  const merchant = npcs.find(n => n.name === 'Merchant')
  if (!merchant) return
  groundItems = groundItems.filter(g => !((g.level ?? 0) === 0 && g.x === merchant.x && g.y === merchant.y))
}

function npcCanTraverseSurface(x, y) {
  if (!isWalkable(x, y)) return false
  const tile = map[y][x]
  return tile !== 'river' && tile !== 'water' && tile !== 'forest'
}

function templeNpcCandidates(maxDistance) {
  const distances = new Map([[keyXY(spawnPoint.x, spawnPoint.y), 0]])
  const queue = [{x: spawnPoint.x, y: spawnPoint.y}]
  const candidates = []
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    const distance = distances.get(keyXY(cur.x, cur.y))
    if (distance >= maxDistance) continue
    for (const [dx, dy] of DIRS8) {
      const x = cur.x + dx, y = cur.y + dy
      const key = keyXY(x, y)
      if (distances.has(key) || !npcCanTraverseSurface(x, y)) continue
      const nextDistance = distance + 1
      distances.set(key, nextDistance)
      queue.push({x, y})
      if (nextDistance >= WORLD_GEN_CONFIG.npcs.minOriginDistance && nextDistance <= maxDistance)
        candidates.push({x, y, distance: nextDistance})
    }
  }
  return candidates
}

function spawnNpcs() {
  const cfg = WORLD_GEN_CONFIG.npcs
  npcs = []
  gravediggerGraveKey = null
  const nearTemple = templeNpcCandidates(cfg.templeMaxWalkDistance)
  for (const tmpl of NPC_TEMPLATES) {
    if (tmpl.placement === 'shoreline') continue
    let x, y
    if (tmpl.name === 'Drunk') {
      let tries = 0
      do {
        x = randInt(Math.max(cfg.edgeMargin, spawnPoint.x - cfg.drunkSpread), Math.min(MAP_W - cfg.edgeMargin - 1, spawnPoint.x + cfg.drunkSpread))
        y = randInt(Math.max(cfg.edgeMargin, spawnPoint.y - cfg.drunkSpread), Math.min(MAP_H - cfg.edgeMargin - 1, spawnPoint.y + cfg.drunkSpread))
        tries++
      } while ((!npcCanTraverseSurface(x, y) || grasslandTrees.has(keyXY(x, y)) || map[y][x] === 'temple' || map[y][x] === 'belltower' || map[y][x] === 'village' || occupied.has(keyXY(x, y))) && tries < cfg.placementTries)
      if (tries >= cfg.placementTries) continue
    } else {
      const available = nearTemple.filter(pos => {
        const tile = map[pos.y][pos.x]
        if (tile === 'temple' || tile === 'belltower' || tile === 'village') return false
        if (occupied.has(keyXY(pos.x, pos.y)) || grasslandTrees.has(keyXY(pos.x, pos.y))) return false
        if (tmpl.name === 'Merchant' && groundItems.some(g => (g.level ?? 0) === 0 && g.x === pos.x && g.y === pos.y)) return false
        return true
      })
      if (!available.length) continue
      const chosen = available[randInt(0, available.length - 1)]
      x = chosen.x
      y = chosen.y
    }
    const npc = {
      name: tmpl.name,
      lines: linesForNpcTemplate(tmpl),
      free: !!tmpl.free,
      static: !!tmpl.static,
      trades: !!tmpl.trades,
      services: !!tmpl.services,
      portrait: tmpl.portrait,
      x,
      y,
      homeX: x,
      homeY: y
    }
    npcs.push(npc)
    occupied.add(keyXY(x, y))
    if (tmpl.name === 'Gravedigger') {
      // A lone grave kept right next to him - fitting company for his line
      // of work (and a quiet nod to his own unanswered questions).
      for (const [dx, dy] of DIRS8) {
        const gx = x + dx, gy = y + dy
        if (!isWalkable(gx, gy) || occupied.has(keyXY(gx, gy))) continue
        if (map[gy][gx] === 'grave' || map[gy][gx] === 'river' || map[gy][gx] === 'water' || map[gy][gx] === 'temple' || map[gy][gx] === 'belltower' || map[gy][gx] === 'village') continue
        tileUnderlays[keyXY(gx, gy)] = map[gy][gx]
        map[gy][gx] = 'grave'
        surfaceMap[gy][gx] = 'grave'
        gravediggerGraveKey = keyXY(gx, gy)
        break
      }
    }
  }
  ensureGravediggerGrave()
}

function deepCaveThreatTemplates() {
  const cfg = WORLD_GEN_CONFIG.cavePopulation
  return ENEMY_TEMPLATES.filter(t => cfg.deepThreatTiers.includes(t.tier) &&
    (t.rarity ?? 1) > cfg.deepThreatRarityCutoff)
}

function spawnCaveDecorations() {
  caveDecorations = []
  const cfg = WORLD_GEN_CONFIG.caveDecorations
  // Coordinate hashing keeps purely decorative choices outside gameplay RNG.
  const roll = (x, y, level) => {
    let n = WORLD_SEED ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(level, 1274126177)
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }
  const used = new Set()
  for (const layer of [
    {level: -1, descriptors: caves, maps: caveMaps, shared: undergroundMap},
    {level: -2, descriptors: deepLevels[0]?.caves || [], maps: deepLevels[0]?.caveMaps || [], shared: deepLevels[0]?.map}
  ]) {
    if (!layer.shared) continue
    const entrances = layer.descriptors.flatMap(c => c.entrances || [])
    const occupiedProps = new Set([...groundItems, ...enemies.filter(e => e.alive)]
      .filter(e => e.level === layer.level).map(e => keyXY(e.x, e.y)))
    for (let caveIndex = 0; caveIndex < layer.maps.length; caveIndex++) {
      const descriptor = layer.descriptors[caveIndex], cm = layer.maps[caveIndex]
      if (!descriptor || descriptor.crypt || !descriptor.scenario) continue
      for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
        const floor = layer.level === -1 ? 'cavefloor' : 'cavefloor2'
        const key = `${layer.level}:${x},${y}`
        if (cm[y]?.[x] !== floor || layer.shared[y]?.[x] !== floor || used.has(key) || occupiedProps.has(keyXY(x,y))) continue
        if (entrances.some(e => Math.max(Math.abs(e.x-x), Math.abs(e.y-y)) <= cfg.entranceClearance)) continue
        const wall = (dx, dy) => layer.shared[y+dy]?.[x+dx] === 'cavewall'
        const corner = (wall(0,-1) || wall(0,1)) && (wall(-1,0) || wall(1,0))
        const r = roll(x,y,layer.level)
        let kind = null
        if (corner && r < cfg.webChance) kind = 'web'
        else if (r >= cfg.webChance && r < cfg.webChance + cfg.stalagmiteChance) kind = 'stalagmites'
        else if (r >= cfg.webChance + cfg.stalagmiteChance && r < cfg.webChance + cfg.stalagmiteChance + cfg.mushroomChance) kind = 'mushrooms'
        if (kind) {
          caveDecorations.push({x,y,kind,level:layer.level,levelKind:'chain',caveIndex,
            ...(kind === 'web' ? {rotation: wall(0,-1) ? (wall(-1,0) ? 0 : 1) : (wall(1,0) ? 2 : 3)} : {})})
          used.add(key)
        }
      }
    }
  }

  // Dwarven Fort and deeper Ruins: webs cling to actual masonry corners.
  // Use the same coordinate hash as ordinary caves, preserving game RNG.
  for (let index = 1; index < deepLevels.length; index++) {
    const layer = deepLevels[index]
    if (!layer?.map || !['dwarvenFort','dwarvenRuins'].includes(layer.kind)) continue
    const level = chainZForDepth(index + 2)
    const occupiedProps = new Set([...groundItems, ...enemies.filter(e => e.alive)]
      .filter(entity => entity.level === level).map(entity => keyXY(entity.x,entity.y)))
    const entrances = (layer.caves || []).flatMap(c => c.entrances || [])
    for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
      if (layer.map[y][x] !== 'marble' || occupiedProps.has(keyXY(x,y))) continue
      if (entrances.some(e => Math.max(Math.abs(e.x-x), Math.abs(e.y-y)) <= cfg.entranceClearance)) continue
      const wall = (dx,dy) => layer.map[y+dy]?.[x+dx] === 'dwarvenwall'
      if (!((wall(0,-1) || wall(0,1)) && (wall(-1,0) || wall(1,0)))) continue
      if (roll(x,y,level) >= 0.35) continue
      caveDecorations.push({x,y,kind:'web',level,levelKind:'chain',caveIndex:-1,
        rotation: wall(0,-1) ? (wall(-1,0) ? 0 : 1) : (wall(1,0) ? 2 : 3)})
    }
  }
}
