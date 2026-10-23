'use strict'

// Mining geology is generated once with the mine. Mutable work, removed
// deposits and released water live beside the authoritative mine map.
const Mining = (() => {
  const dirs4 = [[0, -1], [1, 0], [0, 1], [-1, 0]]
  const key = (x, y) => x + ',' + y
  const config = () => MINING_CONFIG
  const types = () => Object.keys(config().minerals)
  const floorLevel = () => currentZ <= -9 ? deepLevels[chainDepthForZ(currentZ) - 2] : null
  const activeLevel = () => floorLevel()?.kind === 'dwarvenMines' ? floorLevel() : null
  const find = (level, x, y) => level?.mineExcavations?.find(t => t.x === x && t.y === y && !t.removed)
  const blocksPathAt = (x, y) => find(activeLevel(), x, y)?.kind === 'exposed'
  const excavatedAt = (level, x, y) => !!level?.mineExcavations?.some(t =>
    t.x === x && t.y === y && t.removed && t.kind !== 'exposed')
  const inSight = (x, y) => currentZ === 0 || !!currentUndergroundFov()?.has(key(x, y))
  const adjacent = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1
  const doorFree = (level, x, y, margin = 4) => [level.mineUpstairs, level.mineDownstairs, level.mineCagePad]
    .filter(Boolean).every(p => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > margin)

  function validateConfig() {
    const cfg = config()
    const bounds = (v, minimum, maximum) => Array.isArray(v) && v.length === 2 &&
      v.every(n => Number.isInteger(n)) && v[0] >= minimum && v[1] <= maximum && v[0] <= v[1]
    const validOpacity = n => Number.isFinite(n) && n >= 0 && n <= 1
    if (!cfg?.skill || !cfg.generation || !cfg.sound || !cfg.minerals || !cfg.lighting ||
      !Number.isInteger(cfg.skill.xpRequiredMultiplier) || cfg.skill.xpRequiredMultiplier < 1 ||
      !Array.isArray(cfg.lighting.fovDarknessByDistance) ||
      cfg.lighting.fovDarknessByDistance.length !== 6 ||
      !cfg.lighting.fovDarknessByDistance.every(validOpacity) ||
      !validOpacity(cfg.lighting.exploredDarkness) ||
      cfg.lighting.exploredDarkness < cfg.lighting.fovDarknessByDistance[5] ||
      !validOpacity(cfg.lighting.tileCenterOpacity) ||
      !validOpacity(cfg.lighting.tileMidOpacity) ||
      !validOpacity(cfg.lighting.darknessReliefMidOpacity) ||
      !Number.isFinite(cfg.lighting.tileDarknessTailTiles) ||
      cfg.lighting.tileDarknessTailTiles <= 0 || cfg.lighting.tileDarknessTailTiles > 3 ||
      !validOpacity(cfg.lighting.tileBloomOpacity) ||
      !validOpacity(cfg.lighting.pulseOpacity) ||
      !validOpacity(cfg.lighting.embeddedRadiusScale) ||
      !validOpacity(cfg.lighting.embeddedOpacityScale) ||
      !Number.isFinite(cfg.lighting.tileMidpoint) ||
      cfg.lighting.tileMidpoint <= 0 || cfg.lighting.tileMidpoint >= 1 ||
      !Number.isFinite(cfg.lighting.tileBloomRadius) ||
      cfg.lighting.tileBloomRadius <= 0 || cfg.lighting.tileBloomRadius > 3 ||
      !Number.isFinite(cfg.lighting.tileRadiusPadding) ||
      cfg.lighting.tileRadiusPadding < 0 || cfg.lighting.tileRadiusPadding > 1 ||
      !Number.isInteger(cfg.lighting.tileFadeMargin) ||
      cfg.lighting.tileFadeMargin < 0 || cfg.lighting.tileFadeMargin > 2 ||
      !Number.isFinite(cfg.lighting.tileVisibilityFeatherWidth) ||
      cfg.lighting.tileVisibilityFeatherWidth <= 0 || cfg.lighting.tileVisibilityFeatherWidth > 1 ||
      !validOpacity(cfg.lighting.tileVisibilityFeatherOpacity) ||
      !Number.isFinite(cfg.lighting.pulsePeriodMs) || cfg.lighting.pulsePeriodMs <= 0 ||
      !bounds(cfg.generation.pocketsPerFloor, 1, 30) ||
      !bounds(cfg.generation.waterReleaseTiles, 0, 10) ||
      cfg.skill.max !== 100 || cfg.skill.strikeMilestones?.length !== 5 ||
      cfg.skill.awarenessThresholds?.length !== 4 ||
      !Number.isFinite(cfg.generation.exposedWideCorridorChance) ||
      cfg.generation.exposedWideCorridorChance < 0 || cfg.generation.exposedWideCorridorChance > 1 ||
      !Number.isInteger(cfg.generation.exposedWideCorridorMinNeighbors) ||
      cfg.generation.exposedWideCorridorMinNeighbors < 4 ||
      cfg.generation.exposedWideCorridorMinNeighbors > 8 ||
      !Number.isInteger(cfg.generation.exposedWideCorridorSpacing) ||
      cfg.generation.exposedWideCorridorSpacing < 2 ||
      cfg.generation.exposedWideCorridorSpacing > 8 ||
      !Number.isInteger(cfg.generation.differentMineralSeparation) ||
      cfg.generation.differentMineralSeparation < 1 ||
      cfg.generation.budgets?.length !== 5 ||
      !cfg.generation.budgets.every(b => bounds(b, 0, 100000)) ||
      Object.keys(cfg.minerals).length !== 7 ||
      Object.values(cfg.minerals).some(m => !Number.isFinite(m.price) || m.price <= 0 ||
        !Number.isFinite(m.radius) || m.radius < 0 || !['weak', 'hard', 'veryHard'].includes(m.hardness)))
      throw new Error('Invalid mining configuration in content/mining_config.json')
  }

  function chooseThreshold(kind) {
    const weights = config().skill.recognitionWeights[kind]
    const threshold = pickWeighted(weights.map((weight, i) => ({weight, i})), t => t.weight).i
    return config().skill.awarenessThresholds[threshold]
  }
  function mark(level, x, y, kind, attrs = {}) {
    if (level.mineExcavations.some(t => t.x === x && t.y === y && !t.removed)) return null
    const deposit = {x, y, kind, progress: 0, removed: false,
      threshold: chooseThreshold(kind === 'embedded' ? 'mineral' : 'crack'), ...attrs}
    level.mineExcavations.push(deposit)
    return deposit
  }
  function choosePocketType(floor) {
    const choices = Object.entries(config().generation.pocketTypes)
      .map(([type, weight]) => ({type, weight: weight * (floor > 1 && type === 'empty'
        ? config().generation.deeperEmptyWeightFactor : 1)}))
    return pickWeighted(choices, v => v.weight).type
  }
  function generatePocket(level, floor, preferred = false) {
    const cfg = config().generation, cm = level.map
    const candidates = []
    for (let y = 7; y < MAP_H - 7; y++) for (let x = 7; x < MAP_W - 7; x++) {
      if (cm[y][x] !== 'cavefloor2' || !doorFree(level, x, y, preferred ? 3 : cfg.minEntranceClearance)) continue
      if (preferred && Math.max(Math.abs(x - level.mineUpstairs.x), Math.abs(y - level.mineUpstairs.y)) > cfg.respiteTrainingDistance) continue
      candidates.push({x, y})
    }
    if (!candidates.length) return false
    for (let attempt = 0; attempt < cfg.pocketRetries; attempt++) {
      const start = pick(candidates), [dx, dy] = pick(dirs4)
      const maxRadius = Math.floor((cfg.pocketMaxDiameter - 1) / 2)
      const rx = Math.min(maxRadius, randInt(...cfg.pocketRadiusX))
      const ry = Math.min(maxRadius, randInt(...cfg.pocketRadiusY))
      const cx = start.x + dx * ((dx ? rx : ry) + 2)
      const cy = start.y + dy * ((dy ? ry : rx) + 2)
      if (cx - rx < cfg.borderClearance || cy - ry < cfg.borderClearance ||
        cx + rx >= MAP_W - cfg.borderClearance || cy + ry >= MAP_H - cfg.borderClearance) continue
      const cells = [], trial = new Set()
      for (let yy = cy - ry; yy <= cy + ry; yy++) for (let xx = cx - rx; xx <= cx + rx; xx++) {
        const metric = ((xx - cx) / Math.max(1, rx)) ** 2 + ((yy - cy) / Math.max(1, ry)) ** 2
        if (metric > 1 + (rng() - 0.5) * cfg.pocketShapeJitter) continue
        cells.push({x: xx, y: yy})
        trial.add(key(xx, yy))
      }
      const entrance = {x: start.x + dx, y: start.y + dy}
      const roomDoor = {x: start.x + 2 * dx, y: start.y + 2 * dy}
      if (!trial.has(key(roomDoor.x, roomDoor.y)) || !cells.length) continue
      const clear = cells.every(p => cm[p.y][p.x] === 'cavewall' && doorFree(level, p.x, p.y, cfg.pocketSpacing) &&
        !level.mineExcavations.some(t => Math.max(Math.abs(p.x - t.x), Math.abs(p.y - t.y)) <= 2) &&
        DIRS8.every(([ax, ay]) => trial.has(key(p.x + ax, p.y + ay)) ||
          !TILE[cm[p.y + ay]?.[p.x + ax]]?.walk))
      if (!clear || cm[entrance.y]?.[entrance.x] !== 'cavewall') continue
      const pocket = {id: level.minePockets.length + 1, type: preferred ? 'minerals' : choosePocketType(floor),
        cells, entrances: [entrance]}
      for (const p of cells) cm[p.y][p.x] = 'cavefloor2'
      level.mineFloorTiles += cells.length
      mark(level, entrance.x, entrance.y, 'wall', {hardness: 'weak', threshold: preferred ? 0 : chooseThreshold('crack'), pocketId: pocket.id})
      level.minePockets.push(pocket)
      if (pocket.type === 'cache') {
        const p = pick(cells)
        groundItems.push({x: p.x, y: p.y, level: -9 - (floor - 1), levelKind: 'chain',
          caveIndex: -1, kind: 'chest', opened: false, tier: Math.min(5, Math.max(1, floor))})
      }
      // Additional approaches are short intentionally mineable chains. Deep
      // isolated rooms may have only their first approach; do not punch an
      // unguarded passage through solid walls to satisfy an entrance quota.
      const entranceRange = cells.length < cfg.sizeThresholds[0] ? cfg.pocketEntranceCounts.small :
        cells.length < cfg.sizeThresholds[1] ? cfg.pocketEntranceCounts.medium : cfg.pocketEntranceCounts.large
      const wanted = cells.length < cfg.sizeThresholds[0]
        ? 1 + (chance(cfg.secondApproachChance) ? 1 : 0)
        : randInt(...entranceRange)
      const approachCandidates = []
      for (const p of cells) for (const [ax, ay] of dirs4) {
        const outer = {x: p.x + ax, y: p.y + ay}
        if (trial.has(key(outer.x, outer.y)) || cm[outer.y]?.[outer.x] !== 'cavewall' ||
          !doorFree(level, outer.x, outer.y, cfg.minEntranceClearance)) continue
        for (let length = 1; length <= cfg.chainLength[1]; length++) {
          const route = Array.from({length}, (_, i) => ({x: outer.x + ax * i, y: outer.y + ay * i}))
          const beyond = {x: outer.x + ax * length, y: outer.y + ay * length}
          if (cm[beyond.y]?.[beyond.x] !== 'cavefloor2' || !route.every(c => cm[c.y]?.[c.x] === 'cavewall' &&
            doorFree(level, c.x, c.y, cfg.minEntranceClearance) && !level.mineExcavations.some(t => t.x === c.x && t.y === c.y))) continue
          if (route.some(c => Math.max(Math.abs(c.x - entrance.x), Math.abs(c.y - entrance.y)) < 3)) continue
          approachCandidates.push(route)
          break
        }
      }
      while (pocket.entrances.length < wanted && approachCandidates.length) {
        const i = randInt(0, approachCandidates.length - 1), route = approachCandidates.splice(i, 1)[0]
        if (route.some(c => level.mineExcavations.some(t => t.x === c.x && t.y === c.y))) continue
        for (const c of route) mark(level, c.x, c.y, 'wall', {
          hardness: route.length > 2 || chance(cfg.hardShortApproachChance) ? 'hard' : 'weak',
          pocketId: pocket.id})
        pocket.entrances.push(route[0])
      }
      return true
    }
    return false
  }

  function connectOccasionalPockets(level) {
    const cfg = config().generation, pockets = level.minePockets
    for (let i = 0; i < pockets.length; i++) for (let j = i + 1; j < pockets.length; j++) {
      if (pockets[i].type === 'water' || pockets[j].type === 'water' ||
        !chance(cfg.interPocketLinkChance)) continue
      const routes = []
      for (const a of pockets[i].cells) for (const b of pockets[j].cells) {
        if (a.x !== b.x && a.y !== b.y) continue
        const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y)
        const gap = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) - 1
        if (gap < 1 || gap > cfg.chainLength[1]) continue
        const route = Array.from({length: gap}, (_, n) => ({x: a.x + dx * (n + 1), y: a.y + dy * (n + 1)}))
        if (route.every(p => level.map[p.y]?.[p.x] === 'cavewall' &&
          !level.mineExcavations.some(t => t.x === p.x && t.y === p.y))) routes.push(route)
      }
      if (!routes.length) continue
      const route = pick(routes)
      for (const p of route) mark(level, p.x, p.y, 'wall', {hardness: 'hard', pocketId: pockets[j].id})
      pockets[i].entrances.push(route[0])
      pockets[j].entrances.push(route[route.length - 1])
    }
  }

  function generateMinerals(level, floor) {
    const cfg = config().generation, cm = level.map
    const [minimum, maximum] = cfg.budgets[Math.min(floor - 1, cfg.budgets.length - 1)]
    const budget = randInt(minimum, maximum)
    const used = new Set(level.mineExcavations.map(t => key(t.x, t.y)))
    const pocketTiles = new Set(level.minePockets.flatMap(p => p.cells.map(c => key(c.x, c.y))))
    const fertile = new Set(level.minePockets.filter(p => ['minerals', 'precious', 'geode'].includes(p.type))
      .flatMap(p => p.cells.map(c => key(c.x, c.y))))
    const corridorWalls = [], pocketWalls = [], safeExposedCorridorWalls = [], wideCorridorFloors = []
    const pocketCells = [...pocketTiles].map(k => {
      const [x, y] = k.split(',').map(Number)
      return {x, y}
    })
    const fertileFloor = [...fertile].map(k => {
      const [x, y] = k.split(',').map(Number)
      return {x, y}
    })
    const safeWideCorridorTile = (x, y) => {
      if (cm[y]?.[x] !== 'cavefloor2' || pocketTiles.has(key(x, y)) ||
          !doorFree(level, x, y, cfg.minEntranceClearance)) return false
      const neighbours = DIRS8.map(([dx, dy]) => ({x: x + dx, y: y + dy}))
        .filter(p => cm[p.y]?.[p.x] === 'cavefloor2')
      if (neighbours.length < cfg.exposedWideCorridorMinNeighbors) return false
      // A crystal occupies its tile until extracted. Every neighbouring open
      // tile must still have a local route around it, including in two-wide
      // passages and at corridor junctions.
      const visited = new Set([key(neighbours[0].x, neighbours[0].y)])
      const queue = [neighbours[0]]
      for (let i = 0; i < queue.length; i++) for (const [dx, dy] of DIRS8) {
        const xx = queue[i].x + dx, yy = queue[i].y + dy, k = key(xx, yy)
        if (Math.abs(xx - x) > 1 || Math.abs(yy - y) > 1 || visited.has(k) ||
            cm[yy]?.[xx] !== 'cavefloor2') continue
        visited.add(k)
        queue.push({x: xx, y: yy})
      }
      return neighbours.every(p => visited.has(key(p.x, p.y)))
    }
    for (let y = 4; y < MAP_H - 4; y++) for (let x = 4; x < MAP_W - 4; x++) {
      if (safeWideCorridorTile(x, y) && !used.has(key(x, y))) wideCorridorFloors.push({x, y})
      if (cm[y][x] !== 'cavewall' || used.has(key(x, y)) || !doorFree(level, x, y, cfg.minEntranceClearance)) continue
      const neighbours = dirs4.map(([dx, dy]) => ({x: x + dx, y: y + dy}))
        .filter(p => cm[p.y]?.[p.x] === 'cavefloor2')
      if (neighbours.some(p => !pocketTiles.has(key(p.x, p.y)))) {
        corridorWalls.push({x, y})
        if (!pocketCells.some(p => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= cfg.exposedPocketClearance))
          safeExposedCorridorWalls.push({x, y})
      }
      if (neighbours.some(p => fertile.has(key(p.x, p.y)))) pocketWalls.push({x, y})
    }
    let earned = 0, deposits = 0, attempts = 0
    // Nearby formations can be part of the same mineral vein, but different
    // minerals always have space between them, including across pocket edges.
    const compatible = (p, mineral) => level.mineExcavations.every(t => !t.mineral || t.mineral === mineral ||
      Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y)) >= cfg.differentMineralSeparation)
    const wideFloorKeys = new Set(wideCorridorFloors.map(p => key(p.x, p.y)))
    const placedFloorCrystals = []
    const available = pool => pool.filter(p => !used.has(key(p.x, p.y)) &&
      (!wideFloorKeys.has(key(p.x, p.y)) || placedFloorCrystals.every(q =>
        Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) >= cfg.exposedWideCorridorSpacing)))
    // A geode is an actual visible cluster, not just a label on an empty
    // cavity. All guaranteed pocket gems draw from the *same* floor budget.
    for (const pocket of level.minePockets) {
      const promised = pocket.type === 'geode' ? randInt(...cfg.geodeCrystals) :
        ['minerals', 'precious'].includes(pocket.type) ? 1 : 0
      if (!promised) continue
      const cells = pocket.cells.filter(p => cm[p.y]?.[p.x] === 'cavefloor2' && !used.has(key(p.x, p.y)))
      let pocketMineral = null
      for (let i = 0; i < promised && cells.length && deposits < cfg.maxDepositsPerFloor; i++) {
        const affordable = (pocketMineral ? [pocketMineral] : types()).filter(t =>
          config().minerals[t].price + earned <= budget &&
          (pocket.type !== 'precious' || config().minerals[t].tier !== 'common') &&
          cells.some(p => compatible(p, t)))
        if (!affordable.length) break
        const mineral = pickWeighted(affordable, t => config().minerals[t].weight)
        pocketMineral = mineral
        const availableCells = cells.filter(p => compatible(p, mineral))
        const spot = pick(availableCells)
        cells.splice(cells.indexOf(spot), 1)
        if (!mark(level, spot.x, spot.y, 'exposed', {mineral,
          hardness: config().minerals[mineral].hardness, threshold: 0})) continue
        used.add(key(spot.x, spot.y))
        earned += config().minerals[mineral].price
        deposits++
      }
    }
    while (earned + config().minerals.quartz.price <= budget && deposits < cfg.maxDepositsPerFloor && attempts++ < cfg.veinPlacementAttempts) {
      const remaining = budget - earned
      const minerals = types().filter(t => config().minerals[t].price <= remaining)
      if (!minerals.length) break
      const mineral = pickWeighted(minerals, t => {
        const type = config().minerals[t]
        return type.weight * (type.tier === 'common' ? 1 : 1 + (floor - 1) * cfg.preciousPoolBonusPerFloor)
      })
      const val = config().minerals[mineral].price
      const wantExposed = chance(cfg.exposedDepositChance)
      const pocketPreference = chance(0.5)
      const corridorExposed = chance(cfg.exposedWideCorridorChance)
        ? wideCorridorFloors : safeExposedCorridorWalls
      const otherCorridorExposed = corridorExposed === wideCorridorFloors
        ? safeExposedCorridorWalls : wideCorridorFloors
      let candidates = (wantExposed
        ? (pocketPreference ? fertileFloor : corridorExposed)
        : (pocketPreference ? pocketWalls : corridorWalls))
      candidates = available(candidates).filter(p => compatible(p, mineral))
      if (!candidates.length) candidates = available(wantExposed
        ? (pocketPreference ? corridorExposed : fertileFloor)
        : (pocketPreference ? corridorWalls : pocketWalls)).filter(p => compatible(p, mineral))
      if (!candidates.length && wantExposed)
        candidates = available(otherCorridorExposed).filter(p => compatible(p, mineral))
      if (!candidates.length) continue
      const start = pick(candidates), veinCount = wantExposed ? 1 : randInt(...cfg.veinLength)
      const existingFloor = cm[start.y][start.x] === 'cavefloor2'
      const vein = [start]
      for (let n = 1; n < veinCount && deposits + vein.length < cfg.maxDepositsPerFloor; n++) {
        const neighbours = dirs4.map(([dx, dy]) => ({x: vein[vein.length - 1].x + dx, y: vein[vein.length - 1].y + dy}))
          .filter(p => cm[p.y]?.[p.x] === 'cavewall' && !used.has(key(p.x, p.y)) &&
            !vein.some(c => c.x === p.x && c.y === p.y) &&
            doorFree(level, p.x, p.y, cfg.minEntranceClearance) && compatible(p, mineral))
        if (!neighbours.length) break
        vein.push(pick(neighbours))
      }
      for (const p of vein) {
        if (earned + val > budget) break
        if (wantExposed && !existingFloor && level.mineDownstairs) {
          cm[p.y][p.x] = 'cavefloor2'
          const route = dungeonWalkDistances(cm, level.mineUpstairs)
            .get(key(level.mineDownstairs.x, level.mineDownstairs.y))
          cm[p.y][p.x] = 'cavewall'
          if ((route ?? Infinity) < minePackageConfig().layout.minStairWalkingDistance) continue
        }
        used.add(key(p.x, p.y))
        if (wantExposed && !existingFloor) cm[p.y][p.x] = 'cavefloor2' // corridor alcove, never the passage
        mark(level, p.x, p.y, wantExposed ? 'exposed' : 'embedded', {
          mineral, hardness: config().minerals[mineral].hardness,
          threshold: wantExposed ? 0 : chooseThreshold('mineral')
        })
        if (wantExposed && wideFloorKeys.has(key(p.x, p.y))) placedFloorCrystals.push(p)
        if (wantExposed && !existingFloor) level.mineFloorTiles++
        earned += val; deposits++
      }
    }
    // A random target near the bottom of its range can leave less than one
    // Quartz of unused value. Do not let that roundoff undershoot the agreed
    // floor minimum; spend a small extra amount from the same floor budget.
    while (earned < minimum && deposits < cfg.maxDepositsPerFloor) {
      const replacement = types().sort((a, b) => config().minerals[a].price - config().minerals[b].price)
        .find(t => earned + config().minerals[t].price <= maximum &&
          corridorWalls.some(p => !used.has(key(p.x, p.y)) && compatible(p, t)))
      if (!replacement) break
      const spaces = corridorWalls.filter(p => !used.has(key(p.x, p.y)) && compatible(p, replacement))
      const p = pick(spaces)
      used.add(key(p.x, p.y))
      mark(level, p.x, p.y, 'embedded', {mineral: replacement,
        hardness: config().minerals[replacement].hardness})
      earned += config().minerals[replacement].price
      deposits++
    }
    level.mineMineralValue = earned
    level.mineMineralBudget = Math.max(budget, earned)
  }

  function generate(levels) {
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i]
      level.mineExcavations = []
      level.minePockets = []
      // The first seam is conspicuous, cheap and off the mandatory route.
      if (i === 0) generatePocket(level, 1, true)
      const count = randInt(...config().generation.pocketsPerFloor)
      for (let j = level.minePockets.length; j < count; j++) generatePocket(level, i + 1)
      connectOccasionalPockets(level)
      generateMinerals(level, i + 1)
    }
  }

  function spawnNests(level, z, floor) {
    const cfg = config().generation
    const poolNames = floor === 1 ? minePackageConfig().encounters.respiteSpecies :
      minePackageConfig().encounters.groups[['early', 'middle', 'late'][Math.min(floor - 2, 2)]]
    const roster = poolNames.map(n => ENEMY_TEMPLATE_BY_NAME[n])
      .filter(t => t && !t.humanoid && t.name !== 'Xibal')
    for (const pocket of level.minePockets || []) {
      if (pocket.type !== 'nest' || !roster.length) continue
      const spots = pocket.cells.filter(p => level.map[p.y]?.[p.x] === 'cavefloor2' &&
        !enemies.some(e => e.alive && e.level === z && e.x === p.x && e.y === p.y))
      const amount = Math.min(spots.length, randInt(...cfg.nestSize))
      const tmpl = pickWeighted(roster, t => t.rarity ?? 1)
      for (let i = 0; i < amount; i++) {
        const spot = spots.splice(randInt(0, spots.length - 1), 1)[0]
        const concealed = tmpl.abilities?.includes('wallAmbush') &&
          enemyWallAmbushWallAt(level.map, spot.x, spot.y)
        addEnemy({name: tmpl.name, baseName: tmpl.name, tier: tmpl.tier, level: z,
          levelKind: 'chain', caveIndex: -1, hp: tmpl.hp, maxHp: tmpl.hp,
          atk: tmpl.atk, def: tmpl.def, spd: tmpl.spd, grace: tmpl.grace,
          abilities: [...tmpl.abilities], humanoid: false, aggro: tmpl.aggro,
          x: spot.x, y: spot.y, homeX: spot.x, homeY: spot.y,
          homeTileType: 'cavefloor2', alive: true, prefix: null, equipment: null,
          wallAmbushHidden: !!concealed,
          wallAmbushSpent: tmpl.abilities?.includes('wallAmbush') && !concealed})
      }
    }
  }

  function visible(deposit, x = deposit.x, y = deposit.y) {
    if (deposit.removed || !inSight(x, y)) return false
    const skill = player.mining || 0
    if (skill < deposit.threshold) return false
    const thresholds = config().skill.awarenessThresholds
    let tier = 0
    for (let i = 0; i < thresholds.length; i++) if (skill >= thresholds[i]) tier = i
    const maxDistance = config().skill.discoveryRadius[tier]
    // Obvious mineral formations stay visible with normal FOV; fine clues
    // require proximity even when the wall is visible in the distance.
    return deposit.threshold === 0 || Math.max(Math.abs(player.x - x), Math.abs(player.y - y)) <= maxDistance
  }

  function clue(level, x, y) {
    const t = find(level, x, y)
    return t && visible(t) ? t : null
  }

  function canTarget(x, y) {
    if (currentZ === 0) return map[y]?.[x] === 'boulder'
    const level = activeLevel()
    if (!level) return false
    // God mode already permits walking through walls. Do not intercept a
    // movement into ordinary solid rock as a futile mining attempt.
    if (player.godMode && map[y]?.[x] === 'cavewall' && !find(level, x, y)) return false
    return map[y]?.[x] === 'cavewall' || find(level, x, y)?.kind === 'exposed'
  }

  function cost(hardness, mining = player.mining) {
    const steps = config().skill.strikes[hardness]
    const rank = config().skill.strikeMilestones.reduce((current, threshold, i) =>
      mining >= threshold ? i : current, 0)
    return steps[rank]
  }

  function grantXp(amount, surface = false) {
    const cfg = config().skill, scale = cfg.surfaceFractionScale
    if (surface) {
      player.minedSurfaceStones++
      amount = player.minedSurfaceStones <= cfg.surfaceFullXpCount ? scale :
        Math.floor(scale / player.minedSurfaceStones)
    } else amount *= scale
    player.miningXpUnits += amount
    let improved = false
    while (player.mining < cfg.max && player.miningXpUnits >=
      (1 + Math.floor(player.mining / cfg.experienceDivisor)) * cfg.xpRequiredMultiplier * scale) {
      player.miningXpUnits -= (1 + Math.floor(player.mining / cfg.experienceDivisor)) * cfg.xpRequiredMultiplier * scale
      player.mining++
      improved = true
    }
    if (improved) log(`Mining improves to ${player.mining}.`, 'good')
  }

  function flood(level, deposit) {
    const pocket = level.minePockets?.find(p => p.id === deposit.pocketId && p.type === 'water')
    if (!pocket || pocket.released) return
    // Opening an outer link of a multi-wall approach is not yet a breach into
    // the chamber. Water escapes only when the last rock touches its interior.
    if (!pocket.cells.some(p => adjacent(p, deposit))) return
    pocket.released = true
    const limit = randInt(...config().generation.waterReleaseTiles)
    const targets = pocket.cells.filter(p => level.map[p.y]?.[p.x] === 'cavefloor2' &&
      !level.mineExcavations.some(d => d.x === p.x && d.y === p.y && !d.removed))
    targets.sort((a, b) => Math.abs(a.x - deposit.x) + Math.abs(a.y - deposit.y) -
      (Math.abs(b.x - deposit.x) + Math.abs(b.y - deposit.y)) || a.y - b.y || a.x - b.x)
    for (const p of targets.slice(0, limit)) level.map[p.y][p.x] = 'water'
    log('Water seeps from the broken rock and fills the nearby hollow!', 'bad')
  }

  function strike(x, y) {
    if (!canTarget(x, y)) return false
    if (!player.inventory.some(i => i.kind === 'pickaxe')) {
      log('You need a Pickaxe to mine stone and crystals.', 'info')
      return 'warn'
    }
    const level = activeLevel(), target = level ? find(level, x, y) : null
    const keyTarget = `${currentZ}:${x},${y}`
    if (!player.miningTutorialSeen) {
      player.miningTutorialSeen = true
      player.miningArmedTarget = keyTarget
      log('Strike again to mine this stone. Each blow takes a turn and may attract monsters.', 'info')
      return 'warn'
    }
    player.miningArmedTarget = null
    const valid = currentZ === 0 || !!target
    const hardness = currentZ === 0 ? 'weak' : target?.hardness || 'hard'
    const surfaceKey = key(x, y)
    if (!valid) {
      log('Your pickaxe rings against solid rock. There is no opening here.', 'info')
    } else {
      const progress = currentZ === 0 ? (miningSurfaceProgress[surfaceKey] || 0) : target.progress
      if (currentZ === 0) miningSurfaceProgress[surfaceKey] = progress + 1
      else target.progress++
      if (progress + 1 >= cost(hardness)) {
        const strainCfg = config().skill.strain
        const strain = Math.max(0, strainCfg[hardness] -
          Math.floor(player.mining / strainCfg.skillReductionEvery) * strainCfg.skillReductionAmount)
        if (strain > 0 && player.hp <= strain) {
          if (currentZ === 0) miningSurfaceProgress[surfaceKey] = progress
          else target.progress = progress
          log('You are too exhausted to finish mining this rock safely.', 'bad')
          return 'warn'
        }
        player.hp -= strain
        if (strain) log(`The work strains you for ${strain} HP.`, 'bad')
        if (currentZ === 0) {
          map[y][x] = 'grass'
          delete miningSurfaceProgress[surfaceKey]
          grantXp(0, true)
          log('You clear the boulder, opening a new route.', 'good')
        } else {
          target.removed = true
          if (target.kind !== 'exposed') map[y][x] = 'cavefloor2'
          if (target.mineral) {
            addInventoryItem(target.mineral)
            const mineral = config().minerals[target.mineral]
            grantXp(config().skill.xp[mineral.tier])
            log(`You extract ${mineral.name}.`, 'loot')
          } else {
            grantXp(config().skill.xp[hardness])
            log('The cracked wall gives way.', 'good')
          }
          flood(level, target)
        }
        player.miningArmedTarget = null
        invalidateUndergroundFov()
      } else log('Your pickaxe chips the stone.', 'info')
    }
    // Rules resolve before enemy movement. Animations never change results.
    sound(x, y, target)
    return 'strike'
  }

  function sound(x, y, deposit) {
    const cfg = config().sound
    const radiusSq = cfg.radius * cfg.radius
    for (const e of enemies) {
      if (!e.alive || !onCurrentLevel(e) || enemyIsPassive(e)) continue
      const distanceSq = (e.x - x) ** 2 + (e.y - y) ** 2
      if (distanceSq > radiusSq) continue
      const d = Math.sqrt(distanceSq)
      let hearing = Math.max(cfg.minimumHearingChance, cfg.maximumHearingChance * (1 - d / cfg.radius) ** 2)
      if (enemyHasAbility(e, 'blind')) hearing *= cfg.blindMultiplier
      if (deposit?.mineral && config().minerals[deposit.mineral].tier === 'rare') hearing *= cfg.rareMineralLoudness
      if (!chance(Math.min(cfg.maximumHearingChance, hearing))) continue
      alarmEnemy(e)
      if (chance(cfg.investigationChance)) {
        e.miningInvestigation = {x, y, steps: randInt(...cfg.investigationSteps), sourceZ: currentZ,
          announced: false}
      }
    }
    if (turnCount - miningLastEchoTurn >= cfg.ambientMessageCooldown && chance(cfg.ambientMessageChance)) {
      miningLastEchoTurn = turnCount
      log('Your blows echo through the shafts. Hopefully nothing heard.', 'info')
    }
  }

  function investigate(e) {
    const job = e.miningInvestigation
    if (!job || job.steps <= 0 || job.sourceZ !== currentZ) return false
    const target = {x: job.x, y: job.y}
    if (adjacent(e, target)) {e.miningInvestigation = null; return false}
    // Local BFS uses the ordinary traversability and occupancy rules. This
    // provides one legal step, not a teleport or an offscreen instant move.
    const queue = [{x: e.x, y: e.y, first: null}]
    const seen = new Set([key(e.x, e.y)])
    let step = null
    const bound = Math.ceil(config().sound.radius)
    for (let head = 0; head < queue.length && !step && head < bound * bound * 4; head++) {
      const cell = queue[head]
      for (const [dx, dy] of DIRS8) {
        const nx = cell.x + dx, ny = cell.y + dy, k = key(nx, ny)
        if (seen.has(k) || Math.max(Math.abs(nx - e.x), Math.abs(ny - e.y)) > bound ||
          !enemyTileOpen(e, nx, ny)) continue
        seen.add(k)
        const first = cell.first || {x: nx, y: ny}
        if (Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y)) <= 1) {step = first; break}
        queue.push({x: nx, y: ny, first})
      }
    }
    if (!step) {e.miningInvestigation = null; return false}
    const fromX = e.x, fromY = e.y
    if (enemyOpenDoorInsteadOfMove(e, step.x, step.y)) {job.steps--; return true}
    occupied.delete(key(fromX, fromY))
    e.x = step.x; e.y = step.y
    occupied.add(key(e.x, e.y))
    finishEnemyMove(e, fromX, fromY)
    job.steps--
    if (!job.announced && enemyIsVisibleOnMainView(e)) {
      log(`The ${e.name} approaches, drawn by your mining!`, 'bad')
      job.announced = true
    }
    if (!job.steps) e.miningInvestigation = null
    return true
  }

  function lightInfo(deposit) {
    if (deposit.removed || !deposit.mineral) return null
    const radius = config().minerals[deposit.mineral]?.radius
    if (!radius) return null
    if (deposit.kind === 'exposed') return {radius, opacity: 1}
    // Only plainly visible crystals protruding from the wall glow. A secret
    // ore seam does not give away its presence with an unexplained light.
    if (deposit.kind === 'embedded' && deposit.threshold === 0) return {
      radius: Math.max(1, Math.round(radius * config().lighting.embeddedRadiusScale)),
      opacity: config().lighting.embeddedOpacityScale
    }
    return null
  }

  function lightCanReach(mapTiles, sx, sy, tx, ty, viewerX, viewerY) {
    if (!UndergroundFov.canSee(mapTiles, sx, sy, tx, ty) ||
      !UndergroundFov.canSee(mapTiles, viewerX, viewerY, tx, ty)) return false
    const opaque = (x, y) => {
      const tile = mapTiles[y]?.[x]
      return !tile || ['cavewall', 'dwarvenwall', 'mountain', 'snowmountain',
        'crypt2niche', 'boulder', 'blackpillar'].includes(tile) || TILE[tile]?.blocksSight === true
    }
    const line = UndergroundFov.traceLine(sx, sy, tx, ty)
    // Sight rays may end on an opaque wall, but a wall's *opposite face*
    // cannot be illuminated. Both the viewer and the light must approach
    // at least one of the wall's four faces from the same side.
    if (opaque(tx, ty) && (sx !== tx || sy !== ty)) {
      const fromLight = line[line.length - 2]
      const viewerLine = UndergroundFov.traceLine(viewerX, viewerY, tx, ty)
      const fromViewer = viewerLine[viewerLine.length - 2]
      if (!fromLight || !fromViewer ||
        !((fromLight.x - tx) * (fromViewer.x - tx) > 0 ||
          (fromLight.y - ty) * (fromViewer.y - ty) > 0)) return false
    }
    for (let i = 1; i < line.length; i++) {
      const from = line[i - 1], to = line[i]
      // A diagonal ray can reach open floor past a single wall through the
      // open neighboring tile. Two walls seal the aperture. Keep the stricter
      // rule for opaque target walls to avoid lighting their hidden corners.
      if (from.x !== to.x && from.y !== to.y) {
        const blockedX = opaque(to.x, from.y)
        const blockedY = opaque(from.x, to.y)
        if ((blockedX && blockedY) ||
          (to.x === tx && to.y === ty && opaque(tx, ty) && (blockedX || blockedY))) return false
      }
    }
    return true
  }

  function lightVisible(mapTiles, px, py, ordinarySet) {
    const level = activeLevel()
    if (!level) return ordinarySet
    const visibleSet = new Set(ordinarySet)
    for (const t of level.mineExcavations || []) {
      const light = lightInfo(t)
      if (!light) continue
      const radius = light.radius
      // Crystal light has its own range around the formation, independent of
      // the player's darkness radius. Distance alone must never hide a light.
      for (let yy = t.y - radius; yy <= t.y + radius; yy++) for (let xx = t.x - radius; xx <= t.x + radius; xx++) {
        if ((xx - t.x) ** 2 + (yy - t.y) ** 2 > radius * radius || !mapTiles[yy]?.[xx]) continue
        if (lightCanReach(mapTiles, t.x, t.y, xx, yy, px, py))
          visibleSet.add(key(xx, yy))
      }
    }
    return visibleSet
  }

  return {validateConfig, generate, spawnNests, find, blocksPathAt, excavatedAt, clue, canTarget, strike, investigate, lightVisible, lightInfo, lightCanReach, activeLevel, visible,
    config}
})()

let miningSurfaceProgress = {}
let miningLastEchoTurn = -100000
