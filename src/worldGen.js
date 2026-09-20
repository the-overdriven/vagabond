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

function restoreCaveEntrancesOnSurface() {
  if (!surfaceMap || !Array.isArray(caves)) return
  for (const cave of caves) {
    if (cave.crypt) continue
    for (const e of (cave.entrances || [])) {
      if (surfaceMap[e.y]?.[e.x] && surfaceMap[e.y][e.x] !== 'dwarvengate') surfaceMap[e.y][e.x] = 'caveentrance'
    }
  }
}

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
  if (!hut || !undergroundMap || mausoleumMap) return
  if (isMausoleumAdjacentToRandomCave()) return
  mausoleumMap = createMausoleum()
  const ox = hut.x, oy = hut.y
  for (let y = 0; y < mausoleumMap.length; y++) for (let x = 0; x < mausoleumMap[0].length; x++) {
    const wx = ox + x - 4, wy = oy + y - 7
    if (wx >= 0 && wy >= 0 && wx < MAP_W && wy < MAP_H && mausoleumMap[y][x] !== 'mountain') undergroundMap[wy][wx] = mausoleumMap[y][x]
  }
  undergroundMap[oy][ox] = 'mausoleumstairsup'
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
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      let e = combineWeightedNoise(elevationNoiseFunctions, elevationNoiseWeights, x, y, MAP_W, MAP_H)
      e += (roughnessNoiseFunction(x, y, MAP_W, MAP_H) - 0.5) * 0.16
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD
      e -= Math.pow(d, 2.2) * 0.55 // island falloff
      const lk = lakeNoiseFunction(x, y, MAP_W, MAP_H)
      if (lk > 0.72 && e > 0.28 && e < 0.6) e -= 0.4 // carve inland lakes
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
  for (let attempt = 1; attempt <= MAX_WORLD_ATTEMPTS; attempt++) {
    generateSurface()
    if (!isTempleConnectedToEdge()) {
      if (attempt === MAX_WORLD_ATTEMPTS) {
        console.warn(`World generation failed to connect the Temple to a map edge in ${MAX_WORLD_ATTEMPTS} attempts; keeping the last world.`)
        surfaceMap = map.map(row => row.slice())
        generateCaves()
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
    if (attempt === MAX_WORLD_ATTEMPTS) {
      console.warn(`World generation failed to keep the crypt separate from random caves in ${MAX_WORLD_ATTEMPTS} attempts; keeping the last world.`)
      break
    }
    console.warn(`Discarding world ${attempt}: the crypt is connected to a random cave. Generating a new world.`)
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
// outside the exclusion area. The final connectivity check remains as a
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
    const cave = {x: spot.x, y: spot.y, entrances: entrances.map(p => ({x: p.x, y: p.y}))}
    const cm = blankCaveMap()
    let x = spot.x, y = spot.y
    const minX = Math.max(2, spot.x - 8), maxX = Math.min(MAP_W - 3, spot.x + 8)
    const minY = Math.max(2, spot.y - 8), maxY = Math.min(MAP_H - 3, spot.y + 8)
    for (let step = 0; step < 180; step++) {
      cm[y][x] = 'cavefloor'
      const [dx, dy] = pick(DIRS8)
      x = Math.max(minX, Math.min(maxX, x + dx))
      y = Math.max(minY, Math.min(maxY, y + dy))
    }
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
  // z:-2: about half of the z:-1 caves get a stairway down into their own
  // small deeper cave, sharing one map with every other z:-2 cave (same
  // pattern as z:-1 sharing undergroundMap). Written generically so a
  // future generic level is just another generateDeepLevel() call.
  deepLevels = [generateDeepLevel(caves, caveMaps, undergroundMap, 'cavefloor', 'cavefloor2', 'cavedown', 'caveup')]
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
  const hut = villageHuts.find(h => h.mausoleum)
  if (!hut) return false
  for (const cave of caves) {
    if (cave.crypt) continue
    for (const e of (cave.entrances || [])) {
      if (Math.max(Math.abs(e.x - hut.x), Math.abs(e.y - hut.y)) <= 1) return true
    }
    const cm = caveMaps[caves.indexOf(cave)]
    if (cm?.[hut.y]?.[hut.x] === 'cavefloor') return true
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
  cm[y0][x0] = 'dwarvengate'
  for (let i = 0; i < 45; i++) {
    const x = randInt(minX + 2, maxX - 2), y = randInt(minY + 2, maxY - 2)
    if (cm[y][x] === 'marble' && Math.abs(x - x0) + Math.abs(y - y0) > 8) cm[y][x] = chance(.65) ? 'dwarvenrubble' : 'dwarvenwall'
  }
  // Final connectivity repair: every outermost walkable fort tile must
  // have a path to the gate.  Room walls and rubble can otherwise seal
  // off a room even when its doorway was carved correctly.
  const fortWalkable = (x, y) => {
    const t = cm[y]?.[x]
    return t === 'marble' || t === 'dwarvengate' || t === 'dwarvenrubble'
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
  ruinMap[y0][x0] = targetLevel ? 'caveup' : 'dwarvengate'
  dwarvenRuin = {x: x0, y: y0, caveIndex: ruinMaps.length - 1, level: targetLevel ? -3 : -1}
  if (targetLevel) {
    // Connect the surface gate to the reserved fort level through the
    // ordinary cave layers without generating any cave geometry there.
    const link = blankCaveMap()
    link[y0][x0] = 'caveentrance'
    caveMaps.push(link)
    caves.push({x: x0, y: y0, entrances: [{x: x0, y: y0}]})
    undergroundMap[y0][x0] = 'caveentrance'
    deepLevels[0].map[y0][x0] = 'cavedown'
    const linkDeep = blankCaveMap()
    linkDeep[y0][x0] = 'cavedown'
    deepLevels[0].caveMaps.push(linkDeep)
    deepLevels[0].caves.push({x: x0, y: y0, entrances: [{x: x0, y: y0}]})
  }
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
      addEnemy({
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
        humanoid: false,
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
      })
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
  const shuffledRuinSpots = ruinFloorSpots.sort(() => Math.random() - 0.5)
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

// Carves a random-walk blob of `floorTile` into a blank local cave map
// `cm`, starting from `spot` - the same technique generateCaves() uses
// to build z:-1 caves, reused for every deeper level.
function carveCaveBlob(cm, spot, floorTile, steps = 180, radius = 8) {
  let x = spot.x, y = spot.y
  const minX = Math.max(2, spot.x - radius), maxX = Math.min(MAP_W - 3, spot.x + radius)
  const minY = Math.max(2, spot.y - radius), maxY = Math.min(MAP_H - 3, spot.y + radius)
  for (let step = 0; step < steps; step++) {
    cm[y][x] = floorTile
    const [dx, dy] = pick(DIRS8)
    x = Math.max(minX, Math.min(maxX, x + dx))
    y = Math.max(minY, Math.min(maxY, y + dy))
  }
}

// Builds one deeper level from the level above it. For each parent cave
// (~50% chance), stamps a `downTile` stairway on a random open parent
// floor tile, then carves a matching blob of `floorTile` into a brand
// new local map with an `upTile` at the exact same x,y - so entrance and
// exit always share coordinates. All the new local maps are merged into
// one shared map for the level, same as generateCaves() does for z:-1.
// Calling this again with the returned level's own caves/caveMaps/map as
// the "parent" args is all that's needed to add another level further down.
function generateDeepLevel(parentCaves, parentCaveMaps, parentMap, parentFloorTile, floorTile, downTile, upTile) {
  const levelCaves = []
  const levelCaveMaps = []
  for (let i = 0; i < parentCaves.length; i++) {
    if (!chance(0.5)) continue
    const cm = parentCaveMaps[i]
    const entrances = parentCaves[i].entrances || []
    const open = []
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (cm[y][x] === parentFloorTile && !entrances.some(e => e.x === x && e.y === y)) open.push({x, y})
    }
    const spot = pick(open)
    if (!spot) continue
    // Stamp the stairway into both the parent's per-cave template and its
    // already-merged shared map, so a save/reload re-stamp (see
    // loadGameFromObject) rebuilds it the same way.
    cm[spot.y][spot.x] = downTile
    if (parentMap[spot.y] && parentMap[spot.y][spot.x] !== undefined) parentMap[spot.y][spot.x] = downTile

    const cm2 = blankCaveMap()
    carveCaveBlob(cm2, spot, floorTile)
    cm2[spot.y][spot.x] = upTile
    levelCaveMaps.push(cm2)
    levelCaves.push({x: spot.x, y: spot.y, entrances: [{x: spot.x, y: spot.y}]})
  }
  const levelMap = blankCaveMap()
  for (const cm of levelCaveMaps) {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (cm[y][x] !== 'cavewall') levelMap[y][x] = cm[y][x]
    }
  }
  for (const cave of levelCaves) {
    for (const entrance of cave.entrances) {
      if (levelMap[entrance.y] && levelMap[entrance.y][entrance.x] !== undefined) levelMap[entrance.y][entrance.x] = upTile
    }
  }
  return {
    map: levelMap,
    caveMaps: levelCaveMaps,
    caves: levelCaves,
    discovered: Array.from({length: MAP_H}, () => new Array(MAP_W).fill(false)),
  }
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
