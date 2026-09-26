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
// Transparent landmark/biome glyphs replace their map tile in storage, so
// remember what terrain was underneath them for rendering and saves.
let tileUnderlays = {}
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
let undergroundDiscovered = [] // ACTIVE underground discovery grid, swapped on every level transition
let currentZ = 0
let currentCave = -1

// The generic cavedown/caveup chain follows the actual underground depth:
// depth 1 = z:-1, depth 2 = z:-2, depth 3 = z:-3. The crypt's dedicated
// second map also uses z:-2, but is identified by its map type when active.
const CHAIN_Z_BY_DEPTH = [-1, -2, -3]
const CHAIN_DEPTH_BY_Z = {[-1]: 1, [-2]: 2, [-3]: 3}
// depth here means "chain position below the surface": 1 = z:-1, 2 = z:-2, 3 = z:-3.

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
  shuffleTombstoneOrder()
  mausoleumMap = null
  mausoleumHutPos = null
  tileUnderlays = {}
  grasslandTrees = new Set()
  map.length = 0 // a retried world must not append onto the discarded one
  const elevationNoiseFunctions = [makeNoise(6, 4), makeNoise(14, 10), makeNoise(30, 22)]
  const elevationNoiseWeights = [0.55, 0.3, 0.15]
  const moistureNoiseFunctions = [makeNoise(5, 5), makeNoise(16, 16)]
  const moistureNoiseWeights = [0.6, 0.4]
  const roughnessNoiseFunction = makeNoise(52, 38)
  const moistureDetailNoiseFunction = makeNoise(44, 32)
  const lakeNoiseFunction = makeNoise(9, 7)
  const boulderNoiseFunction = makeNoise(40, 30)

  const elev = [], moist = []
  for (let y = 0; y < MAP_H; y++) {
    elev.push(new Float32Array(MAP_W))
    moist.push(new Float32Array(MAP_W))
  }
  const cx = MAP_W / 2, cy = MAP_H / 2
  const maxD = Math.sqrt(cx * cx + cy * cy)
  const northernFalloffDepth = MAP_H * 0.22
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      let e = combineWeightedNoise(elevationNoiseFunctions, elevationNoiseWeights, x, y, MAP_W, MAP_H)
      e += (roughnessNoiseFunction(x, y, MAP_W, MAP_H) - 0.5) * 0.16
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD
      e -= Math.pow(d, 2.2) * 0.55 * Math.min(1, y / northernFalloffDepth) // island falloff fades out at the northern edge
      const lk = lakeNoiseFunction(x, y, MAP_W, MAP_H)
      if (lk > 0.72 && e > 0.28 && e < 0.6) e -= 0.4 // carve inland lakes
      if (y < 4) e = Math.max(e, 0.3) // keep the cold northern boundary on land
      elev[y][x] = e
      moist[y][x] = combineWeightedNoise(moistureNoiseFunctions, moistureNoiseWeights, x, y, MAP_W, MAP_H) + (moistureDetailNoiseFunction(x, y, MAP_W, MAP_H) - 0.5) * 0.12
    }
  }

  for (let y = 0; y < MAP_H; y++) {
    const row = []
    for (let x = 0; x < MAP_W; x++) {
      const e = elev[y][x], m = moist[y][x]
      let t
      if (e < 0.24) t = 'water'
      else if (e < 0.29) t = 'sand'
      else if (e < 0.58) {
        if (m > 0.55) t = 'forest'
        else t = 'grass'
      } else if (e < 0.68) t = 'hill'
      else if (e < 0.82) t = 'mountain'
      else t = (m > 0.5) ? 'snow' : 'mountain'
      row.push(t)
    }
    map.push(row)
  }

  // Arctic north: freeze the top of the world into a ragged snow band. Snow used to
  // require elevation > 0.86 AND moisture > 0.5, which the island falloff made
  // almost unreachable, so the biome effectively never generated.
  const SNOW_BAND = Math.round(MAP_H * 0.22)
  const snowEdgeFn = makeNoise(30, 8)
  for (let y = 0; y < SNOW_BAND; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = map[y][x]
      if (t !== 'grass' && t !== 'forest' && t !== 'hill' && t !== 'sand') continue
      const coldness = (SNOW_BAND - y) / SNOW_BAND + (snowEdgeFn(x, y, MAP_W, MAP_H) - 0.5) * 0.55
      if (coldness > 0.32) map[y][x] = 'snow'
    }
  }
  // Snowy north: exposed mountains get a snow cap, with a few more peaks
  // breaking through the tundra. Ordinary forest does NOT grow inside the
  // snow biome; taiga is the only normal tree cover there.
  for (let y = 0; y < SNOW_BAND; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (map[y][x] === 'mountain' && chance(0.85)) map[y][x] = 'snowmountain'
    }
  }

  for (let y = 0; y < SNOW_BAND; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (map[y][x] === 'snow' && chance(0.035)) map[y][x] = 'snowmountain'
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
      if (map[y][x] === 'snow' && chance(0.10)) taigaSeeds.push({x, y})
    }
  }
  for (const seed of taigaSeeds) {
    if (map[seed.y][seed.x] !== 'snow') continue
    tileUnderlays[keyXY(seed.x, seed.y)] = 'snow'
    map[seed.y][seed.x] = 'taiga'
  }
  // Several growth passes make taiga noticeably denser, while retaining
  // holes and ragged edges instead of turning the whole snow band into forest.
  for (let pass = 0; pass < 3; pass++) {
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
        const growChance = nearbyTaiga >= 3 ? 0.58 : nearbyTaiga >= 1 ? 0.28 : 0.04
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
        if (b > 0.80) map[y][x] = 'boulder'
      }
    }
  }

  // Lone trees in broad grassland: scattered visual features with enough
  // density to make large open fields feel naturally wooded.
  for (let y = 4; y < MAP_H - 4; y++) for (let x = 4; x < MAP_W - 4; x++) {
    if (map[y][x] !== 'grass' || chance(0.955)) continue
    let grassCount = 0
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++)
      if (map[y + dy][x + dx] === 'grass') grassCount++
    if (grassCount < 57) continue
    let tooClose = false
    for (const key of grasslandTrees) {
      const [tx, ty] = key.split(',').map(Number)
      if (Math.max(Math.abs(tx - x), Math.abs(ty - y)) < 6) {
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
  for (let y = 4; y < MAP_H - 4; y++) for (let x = 4; x < MAP_W - 4; x++) {
    if (map[y][x] === 'mountain' || map[y][x] === 'snowmountain') mountainSources.push({x, y})
  }
  const riverSources = []
  for (let i = 0; i < Math.min(14, mountainSources.length); i++) {
    const idx = randInt(0, mountainSources.length - 1)
    riverSources.push(mountainSources.splice(idx, 1)[0])
  }
  for (const src of riverSources) {
    let x = src.x, y = src.y
    let previousX = -1, previousY = -1
    if (elev[y][x] < 0.44) continue
    for (let step = 0; step < 350; step++) {
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
  if (frozenRiverCount === 0) {
    const fx = Math.max(3, Math.min(MAP_W - 4, randInt(6, MAP_W - 7)))
    const fy = Math.max(3, Math.floor(SNOW_BAND * 0.45))
    const length = Math.max(5, Math.min(12, SNOW_BAND - fy - 2))
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
  for (let r = 0; r < 40 && !found; r++) {
    for (let dy = -r; dy <= r && !found; dy++) {
      for (let dx = -r; dx <= r && !found; dx++) {
        const nx = sx + dx, ny = sy + dy
        if (nx < 2 || ny < 2 || nx >= MAP_W - 2 || ny >= MAP_H - 2) continue
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
  const templeShapes = [[2, 2], [3, 2], [2, 3]]
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
      for (let r = 1; r <= 6; r++) {
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
  const candidates = []
  for (let y = 3; y < MAP_H - 3; y++) for (let x = 3; x < MAP_W - 3; x++) {
    if (map[y][x] !== 'mountain' && map[y][x] !== 'snowmountain') continue
    if (Math.max(Math.abs(x - spawnPoint.x), Math.abs(y - spawnPoint.y)) < 25) continue
    candidates.push({x, y})
  }
  if (!candidates.length) return // practically impossible on the island generator
  const count = rng() < 0.35 ? 2 : 1
  const chosen = []
  while (chosen.length < count && candidates.length) {
    const spot = candidates.splice(randInt(0, candidates.length - 1), 1)[0]
    if (chosen.every(other => Math.max(Math.abs(spot.x - other.x), Math.abs(spot.y - other.y)) >= 20)) {
      chosen.push(spot)
      map[spot.y][spot.x] = 'volcano'
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (dx === 0 && dy === 0 || Math.max(Math.abs(dx), Math.abs(dy)) > 2) continue
        const x = spot.x + dx, y = spot.y + dy
        if (map[y] && (map[y][x] === 'mountain' || map[y][x] === 'snowmountain')) map[y][x] = 'lava'
      }
    }
  }
}

// A temple walled in by mountains with no route to any map edge is a dead
// world - the player could never reach the edges or most of the content. We
// don't repair such a map, we throw it away and roll a fresh one.
function generateMap() {
  const worldAttempts = Math.max(MAX_WORLD_ATTEMPTS, 40)
  for (let attempt = 1; attempt <= worldAttempts; attempt++) {
    generateSurface()
    if (!isTempleConnectedToEdge()) {
      if (attempt === worldAttempts) {
        console.warn(`World generation failed to connect the Temple to a map edge in ${MAX_WORLD_ATTEMPTS} attempts; keeping the last world.`)
        surfaceMap = map.map(row => row.slice())
        if (!generateCaves() || deepLevels[0]?.caves?.length < 2)
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
      if (deepLevels[0]?.caves?.length < 2)
        throw new Error('Could not generate two distinct second-level caves.')
      console.warn(`World generation failed cave-placement validation in ${worldAttempts} attempts; keeping the last world.`)
      break
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

function isTempleConnectedToEdge() {
  const queue = [{x: spawnPoint.x, y: spawnPoint.y}]
  const seen = new Set([keyXY(spawnPoint.x, spawnPoint.y)])
  while (queue.length) {
    const p = queue.shift()
    if (p.x === 0 || p.y === 0 || p.x === MAP_W - 1 || p.y === MAP_H - 1) return true
    for (const [dx, dy] of DIRS8) {
      const x = p.x + dx, y = p.y + dy
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue
      const key = keyXY(x, y)
      if (seen.has(key) || !TILE[map[y][x]] || !TILE[map[y][x]].walk) continue
      seen.add(key)
      queue.push({x, y})
    }
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
const CRYPT_CAVE_CLEARANCE = 8
let cryptCaveExclusionCenter = null

function isInsideCryptCaveExclusion(x, y) {
  const c = cryptCaveExclusionCenter
  if (!c) return false
  return Math.max(Math.abs(x - c.x) - 3, Math.abs(y - c.y) - 12) <= CRYPT_CAVE_CLEARANCE
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
  const radius = style === 'chambers' ? randInt(9, 15) : randInt(5, 11)
  const minX = Math.max(2, spot.x - radius), maxX = Math.min(MAP_W - 3, spot.x + radius)
  const minY = Math.max(2, spot.y - radius), maxY = Math.min(MAP_H - 3, spot.y + radius)
  if (style === 'walk') {
    let x = spot.x, y = spot.y
    const steps = randInt(90, 300)
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
  const count = randInt(3, 6)
  for (let i = 1; i < count; i++) rooms.push({
    x: randInt(minX + 2, maxX - 2), y: randInt(minY + 2, maxY - 2)})
  for (const room of rooms) {
    const rx = randInt(3, 6), ry = randInt(2, 5)
    for (let y = Math.max(minY, room.y - ry); y <= Math.min(maxY, room.y + ry); y++)
      for (let x = Math.max(minX, room.x - rx); x <= Math.min(maxX, room.x + rx); x++)
        if (((x - room.x) / rx) ** 2 + ((y - room.y) / ry) ** 2 <= 1.05 && chance(0.94))
          cm[y][x] = 'cavefloor'
    cm[room.y][room.x] = 'cavefloor'
  }
  for (let i = 1; i < rooms.length; i++) {
    let x = rooms[i - 1].x, y = rooms[i - 1].y
    while (x !== rooms[i].x || y !== rooms[i].y) {
      cm[y][x] = 'cavefloor'
      if (x !== rooms[i].x && (y === rooms[i].y || chance(0.5))) x += Math.sign(rooms[i].x - x)
      else y += Math.sign(rooms[i].y - y)
    }
    cm[y][x] = 'cavefloor'
  }
}

function generateCaves() {
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
  for (let i = 0; i < 6; i++) {
    let spot = null
    for (let tries = 0; tries < 500 && !spot; tries++) {
      const c = pick(candidates)
      if (c && caves.every(v => Math.max(Math.abs(v.x - c.x), Math.abs(v.y - c.y)) > 10)) spot = c
    }
    if (!spot) continue
    const entrances = [spot]
    if (i === 0) {
      const second = candidates.find(c => c !== spot &&
          Math.max(Math.abs(c.x - spot.x), Math.abs(c.y - spot.y)) >= 8 &&
          Math.max(Math.abs(c.x - spot.x), Math.abs(c.y - spot.y)) <= 18 &&
          !isSegmentTouchingCryptExclusion(spot, c))
        || candidates.find(c => c !== spot && !isSegmentTouchingCryptExclusion(spot, c))
      if (second) entrances.push(second)
    }
    const style = chance(0.5) ? 'walk' : 'chambers'
    const cave = {x: spot.x, y: spot.y, style,
      entrances: entrances.map(p => ({x: p.x, y: p.y}))}
    const cm = blankCaveMap()
    carveShallowCave(cm, spot, style)
    for (const entrance of entrances) {
      for (let yy = entrance.y - 2; yy <= entrance.y; yy++) for (let xx = entrance.x - 1; xx <= entrance.x + 1; xx++) {
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
  for (let trial = 0; trial < 6; trial++) {
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
  const VILLAGE_CAVE_CLEARANCE = 4

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

function buildDwarvenRuin(targetLevel) {
  const DIRS4 = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  const DIRS8 = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]
  const candidates = []
  for (let y = 8; y < MAP_H - 8; y++) for (let x = 8; x < MAP_W - 8; x++) {
    if (map[y][x] !== 'mountain' && map[y][x] !== 'snowmountain') continue
    if (DIRS8.some(([dx, dy]) => TILE[map[y + dy]?.[x + dx]]?.walk)) candidates.push({x, y})
  }
  // The fort is mandatory. Prefer a natural mountain entrance, but if
  // the generated world has no suitable mountain tile, create a small
  // snowy mountain outcrop in the north and place the gate there.
  if (!candidates.length) {
    const fallback = []
    const northLimit = Math.max(12, Math.floor(MAP_H * 0.28))
    for (let y = 8; y < northLimit; y++) for (let x = 8; x < MAP_W - 8; x++) {
      if (!TILE[map[y]?.[x]]?.walk) continue
      if (!DIRS8.some(([dx, dy]) => TILE[map[y + dy]?.[x + dx]]?.walk)) continue
      fallback.push({x, y})
    }
    const gate = fallback.length ? pick(fallback) : {x: Math.floor(MAP_W / 2), y: 10}
    const {x: fx, y: fy} = gate
    for (let yy = fy - 3; yy <= fy + 3; yy++) for (let xx = fx - 3; xx <= fx + 3; xx++) {
      if (yy < 1 || yy >= MAP_H - 1 || xx < 1 || xx >= MAP_W - 1) continue
      if (Math.abs(xx - fx) <= 1 && Math.abs(yy - fy) <= 1) continue
      map[yy][xx] = 'snowmountain'
    }
    candidates.push({x: fx, y: fy})
  }
  const gate = pick(candidates), x0 = gate.x, y0 = gate.y
  map[y0][x0] = 'dwarvengate'
  if (x0 > 0) map[y0][x0 - 1] = 'dwarvenstatue'
  if (x0 < MAP_W - 1) map[y0][x0 + 1] = 'dwarvenstatue'
  if (surfaceMap) {
    surfaceMap[y0][x0] = 'dwarvengate'
    if (x0 > 0) surfaceMap[y0][x0 - 1] = 'dwarvenstatue'
    if (x0 < MAP_W - 1) surfaceMap[y0][x0 + 1] = 'dwarvenstatue'
  }
  const cm = blankCaveMap(), minX = Math.max(2, x0 - 34), maxX = Math.min(MAP_W - 3, x0 + 34),
    minY = Math.max(2, y0 - 24), maxY = Math.min(MAP_H - 3, y0 + 24)
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
  const roomCount = randInt(7, 11)
  for (let attempt = 0; rooms.length < roomCount && attempt < 300; attempt++) {
    const w = randInt(7, 14), h = randInt(6, 11)
    const rx = randInt(minX + 4, maxX - w - 4), ry = randInt(minY + 4, maxY - h - 4)
    const candidate = {x: rx, y: ry, w, h, cx: rx + Math.floor(w / 2), cy: ry + Math.floor(h / 2)}
    if (rooms.every(r => candidate.x > r.x + r.w + 3 || candidate.x + candidate.w + 3 < r.x || candidate.y > r.y + r.h + 3 || candidate.y + candidate.h + 3 < r.y)) rooms.push(candidate)
  }
  const entranceRoom = {x: x0 - 4, y: y0 - 4, w: 9, h: 9, cx: x0, cy: y0}
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
    const horizontalFirst = chance(.5)
    const corridor = (x1, y1, x2, y2) => {
      const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1)
      while (x1 !== x2) { carveWide(x1, y1, chance(.35) ? 3 : 2); x1 += sx }
      while (y1 !== y2) { carveWide(x1, y1, chance(.35) ? 3 : 2); y1 += sy }
      carveWide(x2, y2, 2)
    }
    if (horizontalFirst) { corridor(c.cx, c.cy, r.cx, c.cy); corridor(r.cx, c.cy, r.cx, r.cy) }
    else { corridor(c.cx, c.cy, c.cx, r.cy); corridor(c.cx, r.cy, r.cx, r.cy) }
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
  for (let i = 0; i < 45; i++) {
    const x = randInt(minX + 2, maxX - 2), y = randInt(minY + 2, maxY - 2)
    if (cm[y][x] === 'marble' && Math.abs(x - x0) + Math.abs(y - y0) > 8) cm[y][x] = chance(.65) ? 'dwarvenrubble' : 'dwarvenwall'
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
  if (ghost) {
    // Spawn eight ghosts on actual fort floor tiles
    const ghostSpots = []
    for (let gy = minY + 1; gy < maxY; gy++) for (let gx = minX + 1; gx < maxX; gx++) {
      if (cm[gy]?.[gx] !== 'marble') continue
      if (Math.abs(gx - x0) + Math.abs(gy - y0) < 8) continue
      ghostSpots.push({x: gx, y: gy})
    }
    for (let i = 0; i < 8 && ghostSpots.length; i++) {
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
        fly: true,
        humanoid: true,
        evades: true,
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
      if (chance(0.05)) {
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
  for (let i = 0; i < 18; i++) {
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
    if (Math.abs(x - x0) + Math.abs(y - y0) < 8) continue
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
  let artifactSpot = shuffledRuinSpots.find(p => farFrom(p, {x: x0, y: y0}, 18)) || shuffledRuinSpots[0]
  if (artifactSpot) groundItems.push({
    x: artifactSpot.x,
    y: artifactSpot.y,
    kind: 'chest',
    tier: 5,
    artifactGuaranteed: true,
    opened: false,
    level: ruinLevel,
    levelKind: 'chain',
    caveIndex: dwarvenRuin.caveIndex
  })
  let deepSpot = shuffledRuinSpots.find(p => farFrom(p, artifactSpot || {x: x0, y: y0}, 16) && farFrom(p, {x: x0, y: y0}, 18))
  if (!deepSpot) deepSpot = shuffledRuinSpots.find(p => farFrom(p, artifactSpot || {x: x0, y: y0}, 8))
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
  for (let i = 0; i < 9; i++) {
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

// Organic grotto chambers and winding passages, using the world seed.
function carveDeepDungeon(spot, floorTile, reserved) {
  const DIRS4 = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  const sizes = [[92, 72], [82, 66], [74, 60], [66, 54], [56, 46], [48, 40], [42, 36]]
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
      if (reserved.some(r => bounds.x1 <= r.x2 + 2 && bounds.x2 >= r.x1 - 2 &&
        bounds.y1 <= r.y2 + 2 && bounds.y2 >= r.y1 - 2)) continue

      // Choose separated centers first. Chambers can meet at their ragged
      // edges; this makes open caverns without square room boundaries.
      const targetRooms = Math.max(9, Math.round(w * h / 270) + 4)
      const rooms = [{cx: spot.x, cy: spot.y}]
      for (let tries = 0; tries < 1800 && rooms.length < targetRooms; tries++) {
        const cx = randInt(bounds.x1 + 6, bounds.x2 - 6)
        const cy = randInt(bounds.y1 + 6, bounds.y2 - 6)
        if (rooms.some(r => (r.cx - cx) ** 2 + (r.cy - cy) ** 2 < 145)) continue
        rooms.push({cx, cy})
      }
      if (rooms.length < Math.max(8, targetRooms - 3)) continue
      const cm = blankCaveMap()
      for (const room of rooms) {
        const rx = randInt(5, 8), ry = randInt(4, 7)
        room.x1 = Math.max(bounds.x1 + 1, room.cx - rx)
        room.x2 = Math.min(bounds.x2 - 1, room.cx + rx)
        room.y1 = Math.max(bounds.y1 + 1, room.cy - ry)
        room.y2 = Math.min(bounds.y2 - 1, room.cy + ry)
        // Angular radius changes every few tiles; the center always stays
        // open, while the wall becomes lobed rather than rectangular.
        const edge = Array.from({length: 12}, () => randInt(-22, 16) / 100)
        for (let y = room.y1; y <= room.y2; y++) for (let x = room.x1; x <= room.x2; x++) {
          const dx = (x - room.cx) / rx, dy = (y - room.cy) / ry
          const angle = Math.floor((Math.atan2(dy, dx) + Math.PI) * 12 / (2 * Math.PI)) % 12
          if (dx * dx + dy * dy <= (0.88 + edge[angle]) ** 2)
            cm[y][x] = floorTile
        }
        cm[room.cy][room.cx] = floorTile
      }
      // Step toward an offset midpoint and then the target; varied passage
      // widths and turns keep the links from reading as grid-aligned halls.
      const passage = (from, to) => {
        const mid = {x: Math.round((from.cx + to.cx) / 2) + randInt(-3, 3),
          y: Math.round((from.cy + to.cy) / 2) + randInt(-3, 3)}
        const brush = (x, y, width) => {
          for (let yy = y - 1; yy <= y + width - 2; yy++)
            for (let xx = x - 1; xx <= x + width - 2; xx++)
              if (xx > bounds.x1 && xx < bounds.x2 && yy > bounds.y1 && yy < bounds.y2)
                cm[yy][xx] = floorTile
        }
        let x = from.cx, y = from.cy, step = 0
        for (const goal of [mid, {x: to.cx, y: to.cy}]) {
          while (x !== goal.x || y !== goal.y) {
            const moveX = x !== goal.x && (y === goal.y || chance(0.5))
            if (moveX) x += Math.sign(goal.x - x)
            else y += Math.sign(goal.y - y)
            brush(x, y, step++ % 9 < 3 ? 3 : 2)
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
      for (let i = 0; i < 5; i++) {
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
      if (chance(0.6)) {
        const candidates = rooms.slice(1)
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = randInt(0, i)
          ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
        }
        for (const r of candidates) {
          const wx = r.cx + randInt(-2, 2), wy = r.cy + randInt(-2, 2)
          const cells = []
          for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) {
            const x = wx + dx, y = wy + dy
            if (cm[y]?.[x] === floorTile && dx * dx / 16 + dy * dy / 9 < 0.88 &&
              !(x === spot.x && y === spot.y)) { cells.push({x, y}); cm[y][x] = 'water' }
          }
          if (cells.length < 8) { for (const p of cells) cm[p.y][p.x] = floorTile; continue }
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
      if (dryFloor < Math.round(w * h * 0.13)) continue
      return {cm, rooms, bounds, hasWater}
    }
  }
  return null
}

// A second z:-2 layout: branching, narrow dug passages and scattered pockets.
// It can fit around crowded surface entrances where a broad grotto cannot.
function carveBurrowDungeon(spot, floorTile, reserved) {
  const sizes = [[68, 52], [58, 44], [48, 38], [40, 32], [34, 28], [28, 24]]
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  for (const [w, h] of sizes) {
    const anchors = [[Math.floor(w / 2), Math.floor(h / 2)], [5, Math.floor(h / 2)],
      [w - 6, Math.floor(h / 2)], [Math.floor(w / 2), 5],
      [Math.floor(w / 2), h - 6], [5, 5], [w - 6, h - 6]]
    for (let n = anchors.length - 1; n > 0; n--) {
      const j = randInt(0, n)
      ;[anchors[n], anchors[j]] = [anchors[j], anchors[n]]
    }
    for (const [ax, ay] of anchors) {
      const bounds = {x1: spot.x - ax, y1: spot.y - ay}
      bounds.x2 = bounds.x1 + w - 1
      bounds.y2 = bounds.y1 + h - 1
      if (bounds.x1 < 2 || bounds.y1 < 2 || bounds.x2 >= MAP_W - 2 || bounds.y2 >= MAP_H - 2) continue
      if (reserved.some(r => bounds.x1 <= r.x2 + 2 && bounds.x2 >= r.x1 - 2 &&
        bounds.y1 <= r.y2 + 2 && bounds.y2 >= r.y1 - 2)) continue
      const cm = blankCaveMap(), rooms = []
      const brush = (x, y, wide) => {
        const radius = wide ? 2 : 1
        for (let yy = y - radius; yy <= y + radius; yy++)
          for (let xx = x - radius; xx <= x + radius; xx++)
            if (xx > bounds.x1 && xx < bounds.x2 && yy > bounds.y1 && yy < bounds.y2)
              cm[yy][xx] = floorTile
      }
      brush(spot.x, spot.y, true)
      const tips = [{x: spot.x, y: spot.y}]
      const branches = Math.max(5, Math.round(w * h / 450))
      for (let branch = 0; branch < branches; branch++) {
        const origin = pick(tips)
        let x = origin.x, y = origin.y
        let [dx, dy] = pick(dirs)
        const steps = randInt(Math.max(25, Math.round((w + h) / 2)), w + h + 40)
        for (let step = 0; step < steps; step++) {
          if (chance(0.19)) [dx, dy] = pick(dirs)
          const nx = x + dx, ny = y + dy
          if (nx <= bounds.x1 + 2 || nx >= bounds.x2 - 2 ||
            ny <= bounds.y1 + 2 || ny >= bounds.y2 - 2) {
            ;[dx, dy] = pick(dirs)
            continue
          }
          x = nx; y = ny
          brush(x, y, step % 17 < 3)
        }
        brush(x, y, true)
        tips.push({x, y})
        rooms.push({cx: x, cy: y, x1: x - 3, x2: x + 3, y1: y - 3, y2: y + 3})
      }
      let floor = 0
      for (let y = bounds.y1; y <= bounds.y2; y++)
        for (let x = bounds.x1; x <= bounds.x2; x++)
          if (cm[y][x] === floorTile) floor++
      if (floor < 120) continue
      return {cm, rooms, bounds, hasWater: false, style: 'burrow'}
    }
  }
  return null
}

// Each world needs a broad grotto and a compact burrow at z:-2. Other
// branches are optional and use either generator, with reserved nonoverlap.
function generateDeepLevel(parentCaves, parentCaveMaps, parentMap, parentFloorTile, floorTile, downTile, upTile) {
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
    for (let tries = 0; tries < 64 && open.length; tries++) {
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
    if (used.has(i) || !chance(0.5)) continue
    addBranch(i, chance(0.5) ? 'grotto' : 'burrow')
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
  // Preferred: a mountain tile near the temple, right on the mountain's
  // edge (bordering walkable ground) so the guards have room to stand.
  function search(minR, maxR, requireEdge) {
    for (let r = minR; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = spawnPoint.x + dx, y = spawnPoint.y + dy
          if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) continue
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
  const spot = search(20, 40, true) || search(20, 60, true) || search(20, Math.max(MAP_W, MAP_H), false)
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
  for (let i = 0; i < 2 && candidates.length; i++) {
    const idx = randInt(0, candidates.length - 1)
    const p = candidates.splice(idx, 1)[0]
    const variance = 0.95 + rng() * 0.10
    const e = {
      name: tmpl.name, tier: tmpl.tier,
      hp: Math.max(1, Math.round(tmpl.hp * variance)),
      atk: Math.max(1, Math.round(tmpl.atk * variance)),
      def: Math.max(0, Math.round(tmpl.def * variance)),
      spd: Math.max(1, Math.round(tmpl.spd * variance)),
      fly: !!tmpl.fly,
      humanoid: !!tmpl.humanoid,
      evades: !!tmpl.evades,
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
  // Preferred: a mountain tile 15-45 tiles from the temple, right on the
  // mountain's edge (bordering walkable ground) so it's easy to reach.
  function search(minR, maxR, requireEdge) {
    for (let r = minR; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = spawnPoint.x + dx, y = spawnPoint.y + dy
          if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) continue
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
  const spot = search(15, 45, true) || search(10, 80, true) || search(5, Math.max(MAP_W, MAP_H), false)
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
    for (let r = 3; r <= 15; r += 2) {
      for (let tries = 0; tries < 20; tries++) {
        const ang = rng() * Math.PI * 2
        const x = Math.round(spawnPoint.x + Math.cos(ang) * r)
        const y = Math.round(spawnPoint.y + Math.sin(ang) * r)
        if (x < 4 || y < 4 || x >= MAP_W - 4 || y >= MAP_H - 4) continue
        if (!isBuildable(x, y)) continue
        return {x, y}
      }
    }

    // Fallback: widen the search a lot further out so a village always
    // finds somewhere to stand, even in heavily forested/mountainous seeds.
    for (let r = 17; r <= 60; r += 3) {
      for (let tries = 0; tries < 30; tries++) {
        const ang = rng() * Math.PI * 2
        const x = Math.round(spawnPoint.x + Math.cos(ang) * r)
        const y = Math.round(spawnPoint.y + Math.sin(ang) * r)
        if (x < 4 || y < 4 || x >= MAP_W - 4 || y >= MAP_H - 4) continue
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
  const targetHuts = 11 + Math.floor(rng() * 4) // 11-14 huts
  let guard = 0
  while (huts.length < targetHuts && guard < 400) {
    guard++
    const base = huts[randInt(0, huts.length - 1)]
    const dx = randInt(-2, 2), dy = randInt(-2, 2)
    if (dx === 0 && dy === 0) continue
    const x = base.x + dx, y = base.y + dy
    if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) continue
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
  const clearRadius = 2
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
  const minForest = Math.max(18, Math.floor(size * size * 0.22))
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
  while (frontier.length && grown < 180) {
    const index = randInt(0, frontier.length - 1)
    const tile = frontier.splice(index, 1)[0]
    if (rng() > 0.72) continue
    map[tile.y][tile.x] = 'ancientForest'
    grown++
    for (const [dx, dy] of DIRS8) {
      if (rng() < 0.82) queueForest(tile.x + dx, tile.y + dy)
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
let groundItems = [] // level 0 is surface, level -1 is the shared cave layer
let occupied = new Set() // "x,y" for enemies

function keyXY(x, y) {
  return x + ',' + y
}

function spawnEnemies() {
  const weights = [0.42, 0.26, 0.17, 0.10, 0.05] // tier 1..5

  // Index every legal spawn tile by terrain once. Rejection-sampling the whole map
  // would almost never land a Mummy on sand or a Lich on snow, so restricted
  // creatures would silently fail to spawn.
  const tilesByBiome = {}
  const allSpawnTiles = []
  for (let y = 2; y < MAP_H - 2; y++) {
    for (let x = 2; x < MAP_W - 2; x++) {
      const tile = map[y][x]
      if (tile === 'temple' || tile === 'belltower' || tile === 'ancientForest' || tile === 'caveentrance' || !isWalkable(x, y)) continue
      if (Math.abs(x - spawnPoint.x) + Math.abs(y - spawnPoint.y) < 20) continue
      // Keep the bell's vicinity free of random spawns - the guard pair
      // should be the only threat there.
      if (bigBellPos && Math.max(Math.abs(x - bigBellPos.x), Math.abs(y - bigBellPos.y)) < BELL_GUARD_EXCLUSION_RADIUS) continue
      if (!tilesByBiome[tile]) tilesByBiome[tile] = []
      tilesByBiome[tile].push(x, y)
      allSpawnTiles.push(x, y)
    }
  }
  const total = Math.round(allSpawnTiles.length / 2 / SURFACE_TILES_PER_ENEMY)
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
    if (tmpl.tier >= 3) {
      const distantPool = []
      for (let i = 0; i < pool.length; i += 2) {
        const x = pool[i], y = pool[i + 1]
        if (Math.max(Math.abs(x - spawnPoint.x), Math.abs(y - spawnPoint.y)) >= 50) {
          distantPool.push(x, y)
        }
      }
      pool = distantPool
    }
    poolCache[tmpl.name] = pool
    return pool
  }

  function spawnOneFromTemplate(tmpl) {
    const pool = poolFor(tmpl)
    if (!pool.length) return false
    let x = 0, y = 0, tries = 0, placed = false
    while (tries < 200) {
      tries++
      const p = randInt(0, (pool.length >> 1) - 1) * 2
      x = pool[p]
      y = pool[p + 1]
      if (occupied.has(keyXY(x, y))) continue
      placed = true
      break
    }
    if (!placed) return false
    const variance = 0.95 + rng() * 0.10
    const e = {
      name: tmpl.name, tier: tmpl.tier, level: 0,
      hp: Math.max(1, Math.round(tmpl.hp * variance)),
      atk: Math.max(1, Math.round(tmpl.atk * variance)),
      def: Math.max(0, Math.round(tmpl.def * variance)),
      spd: Math.max(1, Math.round(tmpl.spd * variance)),
      fly: !!tmpl.fly,
      humanoid: !!tmpl.humanoid,
      evades: !!tmpl.evades,
      aggro: tmpl.aggro ?? AGGRO_RANGE,
      x, y, homeX: x, homeY: y, homeTileType: map[y][x], alive: true, prefix: null, equipment: null,
    }
    e.maxHp = e.hp
    e.baseName = tmpl.name // keep clean name for image lookup, separate from display name
    prepareEnemyEquipment(e)
    if (chance(0.05)) {
      const names = Object.keys(ENEMY_PREFIXES)
      const pfx = pick(names)
      e.prefix = pfx
      e.prefixBase = prefixBaseStats(e)
      applyEnemyPrefix(e, pfx)
      e.name = pfx + ' ' + e.name
    }
    addEnemy(e)
    occupied.add(keyXY(x, y))
    return true
  }

  for (let i = 0; i < total; i++) {
    let r = rng(), tier = 1, acc = 0
    for (let t = 0; t < 5; t++) {
      acc += weights[t]
      if (r <= acc) {
        tier = t + 1
        break
      }
    }
    const templates = ENEMY_TEMPLATES.filter(e => e.tier === tier)
    const tmpl = pickWeighted(templates, t => t.rarity ?? 1)
    spawnOneFromTemplate(tmpl)
  }

  // The Lich is the sole source of the rare tombstones, so make sure the world
  // never rolls too few of them - top up to a guaranteed minimum if short.
  const lichTmpl = ENEMY_TEMPLATES.find(t => t.name === 'Lich')
  if (lichTmpl) {
    let lichCount = enemies.filter(e => e.baseName === 'Lich').length
    let guard = 0
    while (lichCount < MIN_LICHES && guard < 200) {
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
    surface: {mobs: [['Goblin', 2], ['Giant Rat', 1]], tier: 2, camp: true, supply: 'scroll'}}
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

function spawnCaveScenarios() {
  let surfaceDeck = [], deepDeck = []
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
    if (open.length < 5) return
    const scenario = nextScenario(level)
    descriptor.scenario = scenario.id
    const rules = level === -1 ? scenario.surface : scenario.deep
    const entrance = entries[0]
    const distance = p => Math.abs(p.x - entrance.x) + Math.abs(p.y - entrance.y)
    function takeSpot(mode, target) {
      if (!open.length) return null
      let candidates = open
      if (mode === 'guard' && target) {
        const near = open.filter(p => Math.abs(p.x - target.x) + Math.abs(p.y - target.y) <= 3)
        if (near.length) candidates = near
      } else if (mode === 'room' && target) {
        const inRoom = open.filter(p => p.x >= target.x1 && p.x <= target.x2 &&
          p.y >= target.y1 && p.y <= target.y2 && distance(p) > 5)
        if (inRoom.length) candidates = inRoom
      } else if (mode === 'far') {
        const max = Math.max(...open.map(distance))
        candidates = open.filter(p => distance(p) >= max - 3)
      } else if (mode === 'corner') {
        const wallCount = p => DIRS8.filter(([dx, dy]) => cm[p.y + dy]?.[p.x + dx] === 'cavewall').length
        const max = Math.max(...open.map(wallCount))
        candidates = open.filter(p => wallCount(p) >= Math.max(2, max - 1))
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
        def: tmpl.def, spd: tmpl.spd, fly: !!tmpl.fly, humanoid: !!tmpl.humanoid,
        evades: !!tmpl.evades, aggro: tmpl.aggro ?? AGGRO_RANGE,
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

    // Ordinary caves always contain at least three passive Fungus. Two extra
    // independent rolls make denser patches possible without making every cave
    // identical. Reserve these tiles before chests and hostile mobs consume the
    // remaining valid cave floor.
    const fungusTemplate = ENEMY_TEMPLATES.find(t => t.name === 'Fungus')
    if (fungusTemplate) {
      let fungusCount = 3
      if (chance(0.4)) fungusCount++
      if (chance(0.4)) fungusCount++
      for (let i = 0; i < fungusCount; i++) {
        const spot = takeSpot('random')
        if (!spot) break
        makeEnemy(fungusTemplate, spot)
      }
    }

    const chestCount = level === -2 ? Math.min(12, Math.max(8, Math.ceil(roomOrder.length / 2))) : 1
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
      const threatPool = ENEMY_TEMPLATES.filter(t => t.tier === 3 || t.tier === 4)
      // Choose an open pocket with four immediately adjacent guard positions.
      // Reserve the group before ordinary mobs, so none can displace it.
      const openByPosition = new Map(open.map(p => [keyXY(p.x, p.y), p]))
      const groupSites = open.map(p => ({p, guards: DIRS8.map(([dx, dy]) =>
          openByPosition.get(keyXY(p.x + dx, p.y + dy))).filter(Boolean)}))
        .filter(site => site.guards.length >= 4)
      if (championTemplate && ENEMY_PREFIXES.Champion && groupSites.length) {
        const farthest = Math.max(...groupSites.map(site => distance(site.p)))
        const remote = groupSites.filter(site => distance(site.p) >= Math.max(10, farthest - 8))
        const site = pick(remote)
        const guards = site.guards.slice()
        for (let n = guards.length - 1; n > 0; n--) {
          const j = randInt(0, n)
          ;[guards[n], guards[j]] = [guards[j], guards[n]]
        }
        for (const pos of [site.p, ...guards.slice(0, 4)]) open.splice(open.indexOf(pos), 1)
        makeEnemy(championTemplate, site.p, 'Champion')
        for (const pos of guards.slice(0, 4)) makeEnemy(championTemplate, pos)
      }
      if (threatPool.length) {
        const spot = takeSpot('far')
        if (spot) makeEnemy(pick(threatPool), spot)
      }
    }
    for (const [name, count] of rules.mobs) {
      const tmpl = ENEMY_TEMPLATES.find(t => t.name === name)
      if (!tmpl) continue
      const total = level === -2 ? Math.min(36, Math.max(24, Math.round(open.length / 75))) : count
      for (let n = 0; n < total; n++) {
        const spot = level === -2 && roomOrder.length
          ? takeSpot('room', roomOrder[n % roomOrder.length])
          : takeSpot(rules.placement || 'random', chest)
        if (!spot) break
        let prefix = null
        if (chance(level === -2 ? 0.11 : 0.05)) {
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
      for (let i = 0; i < 4; i++) {
        const spot = takeSpot('room', roomOrder[(i + 2) % roomOrder.length] || null)
        if (spot) groundItems.push({x: spot.x, y: spot.y,
          kind: i % 2 === 0 ? 'potion' : 'scroll', level, levelKind: 'chain', caveIndex})
      }
    }
  }

  for (let i = 0; i < caveMaps.length; i++)
    populate(caves[i], caveMaps[i], i, -1, 'cavefloor')
  // z:-2 has ordinary caves; z:-3 is the purpose-built Dwarven Fort.
  const deep = deepLevels[0]
  if (deep) for (let i = 0; i < deep.caveMaps.length; i++)
    populate(deep.caves[i], deep.caveMaps[i], i, -2, 'cavefloor2')
}

function guardedChestSpots(e, used, accept = () => true) {
  const spots = []
  const aggroRange = effectiveAggroRange(e)
  for (let dy = -aggroRange; dy <= aggroRange; dy++) for (let dx = -aggroRange; dx <= aggroRange; dx++) {
    const x = e.x + dx, y = e.y + dy
    if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2 || !accept(x, y)) continue
    if (!isWalkable(x, y) || map[y][x] === 'temple' || map[y][x] === 'belltower' || map[y][x] === 'caveentrance') continue
    if (occupied.has(keyXY(x, y)) || used.has(keyXY(x, y))) continue
    spots.push({x, y})
  }
  return spots
}

function spawnRemoteHighTierChests() {
  // A few valuable tier-3 chests are deliberately placed in remote areas,
  // inside the aggro range of tier-3+ monsters so reaching them carries risk.
  const candidates = enemies.filter(e => e.alive && e.level === 0 && e.tier >= 3 && e.x >= 0 && e.y >= 0)
  let placed = 0
  const used = new Set(groundItems.filter(g => g.kind === 'chest' && onCurrentLevel(g)).map(g => keyXY(g.x, g.y)))
  const shuffled = candidates.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  for (const e of shuffled) {
    if (placed >= 4) break
    const aggroRange = effectiveAggroRange(e)
    const remote = villageCenter && Math.max(Math.abs(e.x - villageCenter.x), Math.abs(e.y - villageCenter.y)) >= 35
    if (!remote || aggroRange < 1) continue
    const spots = guardedChestSpots(e, used)
    if (!spots.length) continue
    const spot = pick(spots)
    groundItems.push({x: spot.x, y: spot.y, kind: 'chest', tier: 3, opened: false})
    used.add(keyXY(spot.x, spot.y))
    placed++
  }
}

function spawnEdgeHighTierChests() {
  const edgeBand = Math.max(12, Math.round(Math.min(MAP_W, MAP_H) * 0.12))
  const northEdge = (x, y) => y <= edgeBand
  const anyEdge = (x, y) => northEdge(x, y) || x <= edgeBand || x >= MAP_W - 1 - edgeBand || y >= MAP_H - 1 - edgeBand
  const used = new Set(groundItems.filter(g => (g.level ?? 0) === 0).map(g => keyXY(g.x, g.y)))
  for (const n of npcs) used.add(keyXY(n.x, n.y))
  const candidates = enemies.filter(e => e.alive && e.level === 0 && e.tier >= 3)
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
  placeNear(northEdge, 5)
  placeNear(anyEdge, 12)
}

function spawnOrdinarySurfaceChests() {
  const usedChests = new Set(groundItems.filter(g => g.kind === 'chest' && (g.level ?? 0) === 0).map(g => keyXY(g.x, g.y)))
  const spots = []
  for (let y = 2; y < MAP_H - 2; y++) for (let x = 2; x < MAP_W - 2; x++) {
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
    const distTier = Math.min(5, 1 + Math.floor((Math.abs(x - spawnPoint.x) + Math.abs(y - spawnPoint.y)) / 45))
    groundItems.push({x, y, kind: 'chest', tier: distTier, opened: false})
  }
}

function spawnGroundStuff() {
  spawnOrdinarySurfaceChests()
  // loose potions
  for (let i = 0; i < 15; i++) {
    let x, y, tries = 0
    do {
      x = randInt(2, MAP_W - 3)
      y = randInt(2, MAP_H - 3)
      tries++
    }
    while ((!isWalkable(x, y) || map[y][x] === 'temple' || map[y][x] === 'belltower' || map[y][x] === 'caveentrance') && tries < 200)
    if (tries >= 200) continue
    groundItems.push({x, y, kind: 'potion'})
  }
  // scrolls of invisibility
  for (let i = 0; i < 9; i++) {
    let x, y, tries = 0
    do {
      x = randInt(2, MAP_W - 3)
      y = randInt(2, MAP_H - 3)
      tries++
    }
    while ((!isWalkable(x, y) || map[y][x] === 'temple' || map[y][x] === 'belltower' || map[y][x] === 'caveentrance') && tries < 200)
    if (tries >= 200) continue
    groundItems.push({x, y, kind: 'scroll'})
  }
  // speed potions
  for (let i = 0; i < 3; i++) {
    let x, y, tries = 0
    do {
      x = randInt(2, MAP_W - 3)
      y = randInt(2, MAP_H - 3)
      tries++
    }
    while ((!isWalkable(x, y) || map[y][x] === 'temple' || map[y][x] === 'belltower' || map[y][x] === 'caveentrance') && tries < 200)
    if (tries >= 200) continue
    groundItems.push({x, y, kind: 'speedpotion'})
  }
  // A handful of equipment pieces are buried beneath surface sand. Their
  // positions and items are fixed during world generation; digging merely
  // reveals the predetermined object rather than rolling forage loot.
  const occupiedGround = new Set(groundItems.filter(g => (g.level ?? 0) === 0).map(g => keyXY(g.x, g.y)))
  const sandSpots = []
  for (let y = 2; y < MAP_H - 2; y++) for (let x = 2; x < MAP_W - 2; x++) {
    if (map[y][x] !== 'sand' || occupiedGround.has(keyXY(x, y)) || occupied.has(keyXY(x, y))) continue
    sandSpots.push({x, y})
  }
  for (let i = 0; i < 5 && sandSpots.length; i++) {
    const spot = sandSpots.splice(randInt(0, sandSpots.length - 1), 1)[0]
    const tier = Math.min(4, 1 + Math.floor((Math.abs(spot.x - spawnPoint.x) + Math.abs(spot.y - spawnPoint.y)) / 45))
    const gearRoll = rng()
    const item = gearRoll < 0.5 ? makeWeaponItem(tier) : gearRoll < 0.75 ? makeArmorItem(tier) : makeShieldItem(tier)
    groundItems.push({x: spot.x, y: spot.y, kind: 'buriedgear', item})
  }
  // Two rarer buried finds are full artifacts. Their artifact tier is rolled
  // independently during world generation, and they remain hidden until dug up.
  for (let i = 0; i < 2 && sandSpots.length; i++) {
    const spot = sandSpots.splice(randInt(0, sandSpots.length - 1), 1)[0]
    const item = makeArtifactItem(randInt(3, 5))
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

  // Every remaining hut gets a normal random human name.
  for (let i = 1; i < villageHuts.length; i++) {
    villageHuts[i].name = pick(HUMAN_NAMES)
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
      if (hut !== guaranteedHut && !chance(0.2)) continue
      hut.goldLoot = randInt(2, 9)
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
      fly: false,
      evades: false
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
  // gravediggerGraveKey isn't always known here (e.g. right after loading
  // an older save that predates persisting this key) - before carving a
  // brand new grave, check whether the restored map already has one next
  // to the Gravedigger and adopt it. Without this, reloading a save would
  // stamp a fresh grave near him every time.
  for (let radius = 1; radius <= 20; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
    const gx = digger.x + dx, gy = digger.y + dy
    if (surfaceMap[gy]?.[gx] === 'grave') {
      gravediggerGraveKey = keyXY(gx, gy)
      return
    }
  }
  for (let radius = 1; radius <= 20; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
    const gx = digger.x + dx, gy = digger.y + dy, key = keyXY(gx, gy)
    const walkable = TILE[surfaceMap[gy]?.[gx]]?.walk
    if (!walkable || surfaceMap[gy][gx] === 'belltower' || surfaceMap[gy][gx] === 'grave' || surfaceMap[gy][gx] === 'village') continue
    const blocker = enemies.find(e => e.alive && e.level === 0 && e.x === gx && e.y === gy)
    if (blocker) {
      blocker.alive = false
      occupied.delete(key)
      enemies = enemies.filter(e => e !== blocker)
    }
    tileUnderlays[key] = surfaceMap[gy][gx]
    surfaceMap[gy][gx] = 'grave'
    gravediggerGraveKey = key
    return
  }
}

function clearGroundItemsUnderMerchant() {
  const merchant = npcs.find(n => n.name === 'Merchant')
  if (!merchant) return
  groundItems = groundItems.filter(g => !((g.level ?? 0) === 0 && g.x === merchant.x && g.y === merchant.y))
}

function spawnNpcs() {
  npcs = []
  for (const tmpl of NPC_TEMPLATES) {
    const origin = (tmpl.village && villageCenter) ? villageCenter : spawnPoint
    const spread = (tmpl.village && villageCenter) ? 6 : 8
    let x, y, tries = 0, dist = 0
    do {
      x = randInt(Math.max(2, origin.x - spread), Math.min(MAP_W - 3, origin.x + spread))
      y = randInt(Math.max(2, origin.y - spread), Math.min(MAP_H - 3, origin.y + spread))
      dist = Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y))
      tries++
    } while ((!isWalkable(x, y) || map[y][x] === 'temple' || map[y][x] === 'belltower' || map[y][x] === 'forest' || map[y][x] === 'village' || dist < 2 || occupied.has(keyXY(x, y)) || (tmpl.name === 'Merchant' && groundItems.some(g => (g.level ?? 0) === 0 && g.x === x && g.y === y))) && tries < 300)
    if (tries >= 300) continue // extremely unlikely on a cramped map - just skip this one
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
        if (map[gy][gx] === 'temple' || map[gy][gx] === 'belltower' || map[gy][gx] === 'village') continue
        tileUnderlays[keyXY(gx, gy)] = map[gy][gx]
        map[gy][gx] = 'grave'
        gravediggerGraveKey = keyXY(gx, gy)
        break
      }
    }
  }
  ensureGravediggerGrave()
}
