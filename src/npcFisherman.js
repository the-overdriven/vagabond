'use strict'

let fishermanQuest = null
let fishermanHut = null
const FISHERMAN_NAME = 'Fisherman Hermit'
const FISHERMAN_LAND = new Set(['grass', 'sand', 'hill'])
const bankDistance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

function fishermanFootReachable() {
  const seen = new Set([keyXY(spawnPoint.x, spawnPoint.y)])
  const queue = [{...spawnPoint}]
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]
    for (const [dx, dy] of DIRS8) {
      const x = p.x + dx, y = p.y + dy, key = keyXY(x, y)
      if (seen.has(key) || !TILE[surfaceMap[y]?.[x]]?.walk) continue
      seen.add(key)
      queue.push({x, y})
    }
  }
  return seen
}

function fishermanWaterRegions() {
  const regions = new Map(), sizes = []
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const key = keyXY(x, y)
    if (surfaceMap[y][x] !== 'water' || regions.has(key)) continue
    const id = sizes.length, queue = [{x, y}]
    regions.set(key, id)
    for (let head = 0; head < queue.length; head++) for (const [dx, dy] of DIRS8) {
      const nx = queue[head].x + dx, ny = queue[head].y + dy, nk = keyXY(nx, ny)
      if (surfaceMap[ny]?.[nx] !== 'water' || regions.has(nk)) continue
      regions.set(nk, id)
      queue.push({x: nx, y: ny})
    }
    sizes.push(queue.length)
  }
  return {regions, sizes}
}

function fishermanBanks(reachable, water) {
  const banks = []
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    if (!FISHERMAN_LAND.has(surfaceMap[y][x]) || !reachable.has(keyXY(x, y))) continue
    const ids = [...new Set(DIRS8.map(([dx, dy]) => water.regions.get(keyXY(x + dx, y + dy)))
      .filter(id => id !== undefined && water.sizes[id] >= 25))]
    if (ids.length) banks.push({x, y, regions: ids})
  }
  return banks
}

function fishermanTileFree(p) {
  return !occupied.has(keyXY(p.x, p.y)) &&
    !(currentZ === 0 && player.x === p.x && player.y === p.y) &&
    !enemies.some(e => e.alive && (e.level || 0) === 0 && e.x === p.x && e.y === p.y) &&
    !groundItems.some(g => (g.level || 0) === 0 && g.x === p.x && g.y === p.y) &&
    !npcs.some(n => n.x === p.x && n.y === p.y)
}

function fishermanBlockedTiles() {
  const blocked = new Set(occupied)
  if (currentZ === 0) blocked.add(keyXY(player.x, player.y))
  for (const e of enemies) if (e.alive && (e.level || 0) === 0) blocked.add(keyXY(e.x, e.y))
  for (const g of groundItems) if ((g.level || 0) === 0) blocked.add(keyXY(g.x, g.y))
  for (const n of npcs) blocked.add(keyXY(n.x, n.y))
  return blocked
}

function fishermanEligibleTargets(banks, blocked) {
  return banks.filter(p => FISHERMAN_LAND.has(surfaceMap[p.y]?.[p.x]) &&
    !blocked.has(keyXY(p.x, p.y)) &&
    bankDistance(p, villageCenter || spawnPoint) > 20 && bankDistance(p, spawnPoint) > 20)
}

function fishermanBestTarget(site, eligible, water) {
  const homeRegions = new Set(DIRS8.map(([dx, dy]) =>
    water.regions.get(keyXY(site.x + dx, site.y + dy))))
  let best = null, bestSame = false, bestDistance = Infinity
  for (const p of eligible) {
    const distance = bankDistance(p, site)
    if (distance < 25) continue
    const same = p.regions.some(id => homeRegions.has(id))
    if (!best || Number(same) > Number(bestSame) ||
      (same === bestSame && (distance < bestDistance ||
        (distance === bestDistance && (p.y < best.y || (p.y === best.y && p.x < best.x)))))) {
      best = p
      bestSame = same
      bestDistance = distance
    }
  }
  return best
}

function fishermanTargetCandidates(site, banks, water) {
  const homeRegions = new Set(DIRS8.map(([dx, dy]) =>
    water.regions.get(keyXY(site.x + dx, site.y + dy))))
  const same = p => p.regions.some(id => homeRegions.has(id))
  return banks.filter(p => FISHERMAN_LAND.has(surfaceMap[p.y]?.[p.x]) &&
    bankDistance(p, site) >= 25 && fishermanTileFree(p) &&
    bankDistance(p, villageCenter || spawnPoint) > 20 && bankDistance(p, spawnPoint) > 20)
    .sort((a, b) => Number(same(b)) - Number(same(a)) ||
      bankDistance(a, site) - bankDistance(b, site) || a.y - b.y || a.x - b.x)
}

function fishermanRelocation(enemy, site, hut, reachable, reserved) {
  if (!enemy.ordinarySurface) return null
  const biomes = enemyBiomes(ENEMY_TEMPLATE_BY_NAME[enemy.baseName || enemy.name])
  const queue = [{x: enemy.x, y: enemy.y}], seen = new Set([keyXY(enemy.x, enemy.y)])
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head], key = keyXY(p.x, p.y)
    const tile = surfaceMap[p.y]?.[p.x]
    if (reachable.has(key) && biomes.includes(tile) &&
      ['grass', 'sand', 'hill', 'forest', 'snow', 'taiga'].includes(tile) &&
      bankDistance(p, site) > Math.max(12, (enemy.aggro || 0) + 5) &&
      bankDistance(p, hut) > Math.max(12, (enemy.aggro || 0) + 5) &&
      bankDistance(p, spawnPoint) > 20 && bankDistance(p, villageCenter || spawnPoint) > 20 &&
      fishermanTileFree(p) && !reserved.has(key)) return p
    for (const [dx, dy] of DIRS8) {
      const x = p.x + dx, y = p.y + dy, next = keyXY(x, y)
      const nextTile = surfaceMap[y]?.[x]
      if (seen.has(next) || !(TILE[nextTile]?.walk ||
        (enemy.fly && (nextTile === 'water' || nextTile === 'boulder')))) continue
      seen.add(next)
      queue.push({x, y})
    }
  }
  return null
}

function placeFisherman() {
  const tmpl = NPC_TEMPLATES.find(t => t.name === FISHERMAN_NAME)
  fishermanQuest = null
  fishermanHut = null
  const reachable = fishermanFootReachable(), water = fishermanWaterRegions()
  const banks = fishermanBanks(reachable, water)
  const origin = villageCenter || spawnPoint
  const preferred = [40, 80, 140][Math.abs(WORLD_SEED | 0) % 3]
  // No world objects move until a complete placement plan has been accepted.
  const blocked = fishermanBlockedTiles()
  const eligible = fishermanEligibleTargets(banks, blocked)
  if (!eligible.length) return false
  const threats = enemies.filter(e => e.alive && (e.level || 0) === 0)
  const threatened = (e, p) => bankDistance(e, p) <= Math.max(8, (e.aggro || 0) + 3)
  const sites = banks.filter(p => bankDistance(p, origin) >= 25 && !blocked.has(keyXY(p.x, p.y)) &&
    !threats.some(e => !e.ordinarySurface && threatened(e, p)))
  sites.sort((a, b) => Math.abs(bankDistance(a, origin) - preferred) -
    Math.abs(bankDistance(b, origin) - preferred) || a.y - b.y || a.x - b.x)
  // Try every naturally safe footprint before planning any ordinary-enemy moves.
  for (const relocate of [false, true]) for (const p of sites) {
    if (!relocate && threats.some(e => threatened(e, p))) continue
    const hut = DIRS8.map(([dx, dy]) => ({x: p.x + dx, y: p.y + dy}))
      .find(h => FISHERMAN_LAND.has(surfaceMap[h.y]?.[h.x]) && !blocked.has(keyXY(h.x, h.y)) &&
        !threats.some(e => (!relocate || !e.ordinarySurface) && threatened(e, h)))
    if (!hut) continue
    const target = fishermanBestTarget(p, eligible, water)
    if (!target) continue
    const moves = [], reserved = new Set([keyXY(target.x, target.y)])
    const nearby = threats.filter(e => threatened(e, p) || threatened(e, hut))
    for (const e of nearby) {
      const destination = fishermanRelocation(e, p, hut, reachable, reserved)
      if (!destination) break
      moves.push({e, destination})
      reserved.add(keyXY(destination.x, destination.y))
    }
    if (moves.length !== nearby.length) continue
    for (const {e, destination} of moves) {
      occupied.delete(keyXY(e.x, e.y))
      e.x = e.homeX = destination.x
      e.y = e.homeY = destination.y
      e.homeTileType = surfaceMap[e.y][e.x]
      occupied.add(keyXY(e.x, e.y))
    }
    fishermanHut = hut
    tileUnderlays[keyXY(hut.x, hut.y)] = surfaceMap[hut.y][hut.x]
    surfaceMap[hut.y][hut.x] = 'fishermanhut'
    if (currentZ === 0) map[hut.y][hut.x] = 'fishermanhut'
    npcs.push({...tmpl, lines: linesForNpcTemplate(tmpl),
      x: p.x, y: p.y, homeX: p.x, homeY: p.y})
    occupied.add(keyXY(p.x, p.y))
    return true
  }
  return false
}

function fishermanHasNewDialogue() {
  return !fishermanQuest || fishermanQuest.state === 'ready' ||
    (fishermanQuest.state === 'completed' && !player.fishermanRewardClaimed && !player.fishermanLessonPending)
}

function fishermanSupervisedEntry(x, y, from = player) {
  const npc = npcs.find(n => n.name === FISHERMAN_NAME)
  return !!(player.fishermanLessonPending && !player.fishermanRewardClaimed &&
    fishermanQuest?.state === 'completed' && !player.godMode && !raceHas('swims') &&
    currentZ === 0 && npc && bankDistance(from, {x, y}) === 1 &&
    bankDistance(from, npc) <= 3 && bankDistance({x, y}, npc) <= 3 &&
    TILE[map[from.y]?.[from.x]]?.walk && !deepSwimmingWater(from.x, from.y) &&
    deepSwimmingWater(x, y))
}

function completeFishermanLesson(from) {
  if (!fishermanSupervisedEntry(player.x, player.y, from)) return
  player.fishermanLessonPending = false
  player.fishermanRewardClaimed = true
  player.swimming = Math.max(5, player.swimming || 0)
  log('You learned Swimming.', 'good')
}

function activateFishermanQuest(npc) {
  const water = fishermanWaterRegions()
  const banks = fishermanBanks(fishermanFootReachable(), water)
  const p = fishermanBestTarget(npc,
    fishermanEligibleTargets(banks, fishermanBlockedTiles()), water)
  if (!p) return false
  const t = ENEMY_TEMPLATE_BY_NAME.Slurper
  const target = addEnemy({...t, name: 'Fat Slurper', baseName: 'Slurper', prefix: 'fat',
    hp: t.hp * 2, maxHp: t.hp * 2, level: 0, x: p.x, y: p.y,
    homeX: p.x, homeY: p.y, homeTileType: surfaceMap[p.y][p.x], alive: true,
    fly: false, wander: false, equipment: null})
  occupied.add(keyXY(p.x, p.y))
  fishermanQuest = {type: 'fish_predator', title: 'Empty Nets', state: 'active',
    targetId: target.id, targetX: p.x, targetY: p.y}
  return true
}

function interactFisherman(record = true) {
  const npc = npcs.find(n => n.name === FISHERMAN_NAME)
  if (!npc || currentZ !== 0 || bankDistance(player, npc) > 1) return false
  if (record) recordReplayAction({type: 'talk', npc: FISHERMAN_NAME})
  if (!fishermanQuest) {
    if (activateFishermanQuest(npc)) log('Fisherman Hermit says: My nets have come up empty for days. The fish are disappearing, and something heavy has been dragging itself along the bank. Follow the shore, find it, and deal with it.', 'info')
    else log('Fisherman Hermit says: Quiet water today. Come back later.', 'info')
  } else if ((fishermanQuest.state === 'ready' || fishermanQuest.state === 'completed') &&
    !player.fishermanRewardClaimed && !player.fishermanLessonPending) {
    fishermanQuest.state = 'completed'
    if (!player.fishermanFishGiftGiven) {
      player.fishermanFishGiftGiven = true
      addFishermanFish()
    }
    if (raceHas('swims')) {
      player.fishermanRewardClaimed = true
      player.fishermanLessonPending = false
      log('Fisherman Hermit says: The fish are back, and the nets are filling again. You need no swimming lesson, but I can show you how to read a current and spot a good fishing ground. A useful trade for your help.', 'info')
      gainXp(100)
    } else {
      player.fishermanLessonPending = true
      log('Fisherman Hermit says: The fish are back, and the nets are filling again. I noticed you avoid the water like it\'s fire. Come, let me show you how to enter the water safely.', 'info')
    }
    reconcileSwimming()
  } else if (fishermanQuest.state === 'completed') {
    freezeNpcFromWandering(npc)
    serviceNpc = npc
    if (!replayPlaying) toggleTrade(true)
  } else log('Fisherman Hermit says: The nets are still empty. Someone or something is meddling with the waters. Follow the shore and keep your feet dry.', 'info')
  updateHud()
  render()
  return true
}

function addFishermanFish() {
  consolidateConsumableStacks()
  addInventoryItem('fish')
}

function buyFishermanFish() {
  const npc = npcs.find(n => n.name === FISHERMAN_NAME)
  if (!npc || serviceNpc !== npc || currentZ !== 0 ||
    bankDistance(player, npc) > 1 || fishermanQuest?.state !== 'completed') return
  if (player.gold < 5) return log('You need 5g to buy a fish.', 'info')
  recordReplayAction({type: 'fisherman', action: 'buyFish'})
  player.gold -= 5
  addFishermanFish()
  log('You buy a Fresh Fish for 5g.', 'good')
  updateHud()
  renderTrade()
  renderInventory()
}
