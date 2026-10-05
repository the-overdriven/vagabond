'use strict'

let RARE_FLEE = {}

function rareFleeTemplate(e) {
  const template = e && ENEMY_TEMPLATE_BY_NAME[e.baseName]
  return template && Number(template.rarity ?? 1) <= RARE_FLEE.maxRarity ? template : null
}

function rareFleeEligible(e) {
  return currentZ === 0 && e?.alive && (e.level || 0) === 0 && !e.alarmed && !!rareFleeTemplate(e)
}

function rareFleeDefaults(e) {
  return {
    rareSightings: Number.isFinite(e.rareSightings) ? Math.max(0, Math.floor(e.rareSightings)) : 0,
    rareFleeTurns: Number.isFinite(e.rareFleeTurns) ? Math.max(0, Math.floor(e.rareFleeTurns)) : 0,
    rareFleeAcc: Number.isFinite(e.rareFleeAcc) ? Math.max(0, e.rareFleeAcc % 1) : 0,
    rareArmed: e.rareArmed !== false
  }
}

// Omitted fields are defaults in current-format saves, not an old-save migration.
function rareFleeSaveState(e) {
  const state = rareFleeDefaults(e)
  return {
    ...(state.rareSightings ? {rareSightings: state.rareSightings} : {}),
    ...(state.rareFleeTurns ? {rareFleeTurns: state.rareFleeTurns} : {}),
    ...(state.rareFleeAcc ? {rareFleeAcc: state.rareFleeAcc} : {}),
    ...(state.rareArmed ? {} : {rareArmed: false})
  }
}

function rareStartledBonus(e, ordinarySpeed = Math.max(1, e.spd + enemyTileEffects(e).speed)) {
  return e.rareFleeTurns > 0 && rareFleeEligible(e)
    ? Math.max(0, RARE_FLEE.startledMinSpd - ordinarySpeed) : 0
}

function rareFleePace(e) {
  const pace = Math.max(RARE_FLEE.paceMin, Math.min(RARE_FLEE.paceMax, enemySpd(e) / playerSpd()))
  return e.rareSightings === 1 ? Math.max(pace, RARE_FLEE.paceFloorFirst) : pace
}

function rareStartFlee(e, dist, attacked = false) {
  if (dist > RARE_FLEE.sightRange || e.rareFleeTurns > 0 || e.aware ||
      (e.rareSightings || 0) >= RARE_FLEE.sightings || e.rareArmed === false || !rareFleeEligible(e)) return false
  if (!attacked && (playerHiddenFromEnemy(e) || forestConcealsPlayer(e, dist))) return false
  e.rareSightings = (e.rareSightings || 0) + 1
  e.rareArmed = false
  e.rareFleeTurns = RARE_FLEE.fleeTurns[Math.min(e.rareSightings - 1, RARE_FLEE.fleeTurns.length - 1)]
  e.rareFleeAcc = 0
  e.aware = false
  e.fleeingHoly = false
  e.forestConcealX = e.forestConcealY = null
  e.attackStart = undefined
  if (enemyWanderMode(e) === 'far') {
    e.farTargetX = e.farTargetY = null
    e.farPath = null
  }
  log(e.rareSightings === 1
    ? `Something huge breaks cover - a ${e.name}! It senses you, and is gone.`
    : `The ${e.name} again. It hesitates a moment too long, then bolts.`, 'good')
  return true
}

function rareCatch(e) {
  e.rareFleeTurns = 0
  e.rareFleeAcc = 0
  e.rareArmed = false
  e.aware = true
  alarmEnemy(e)
  log(`The ${e.name} is cornered and turns to fight!`, 'good')
}

// Attack interception precedes animation, evasion, damage and Alarmed. An unseen
// attacker provokes flight too; it cannot bypass the first two sightings.
function rareFleeBlocksAttack(e) {
  if (!rareFleeEligible(e)) return false
  const dist = Math.max(Math.abs(e.x - player.x), Math.abs(e.y - player.y))
  rareStartFlee(e, dist, true)
  if (!(e.rareFleeTurns > 0)) return false
  if (e.rareSightings === 1 || playerHiddenFromEnemy(e)) {
    log(`The ${e.name} slips past your blow.`, 'good')
    return true
  }
  rareCatch(e)
  return false
}

function rareSlipAway(e, minDistance, stampede = false) {
  const template = rareFleeTemplate(e)
  const allowed = new Set(enemyBiomes(template))
  const seen = new Uint8Array(MAP_W * MAP_H)
  const queue = new Int32Array(MAP_W * MAP_H)
  const start = e.y * MAP_W + e.x
  let head = 0, tail = 0
  seen[start] = 1
  queue[tail++] = start
  while (head < tail) {
    const cur = queue[head++], x = cur % MAP_W, y = Math.floor(cur / MAP_W)
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue
      const index = ny * MAP_W + nx
      if (seen[index] || !TILE[surfaceMap[ny]?.[nx]]?.walk) continue
      seen[index] = 1
      queue[tail++] = index
    }
  }
  const blocked = new Set(occupied)
  for (const npc of npcs) blocked.add(keyXY(npc.x, npc.y))
  const reachable = [], outside = []
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const tile = surfaceMap[y]?.[x]
    if (!TILE[tile]?.walk || !allowed.has(tile) || blocked.has(keyXY(x, y)) ||
        Math.max(Math.abs(x - player.x), Math.abs(y - player.y)) < minDistance) continue
    ;(seen[y * MAP_W + x] ? reachable : outside).push({x, y})
  }
  // The cinematic stampede is the last resort for an enclosed component.
  // It never moves the player, crosses turns, damages anything, or edits terrain.
  let candidates = reachable.length ? reachable : outside
  if (!candidates.length) return false
  const homeBound = ['homeReturn', 'homeReanchored'].includes(enemyWanderMode(e))
  if (homeBound) {
    const distance = p => Math.max(Math.abs(p.x - e.homeX), Math.abs(p.y - e.homeY))
    const nearest = candidates.reduce((best, p) => Math.min(best, distance(p)), Infinity)
    candidates = candidates.filter(p => distance(p) === nearest)
  }
  const spot = pick(candidates)
  if (stampede || !reachable.length) log(`The enclosed ${e.name} stampedes through you! You dodge aside, but it escapes!`, 'good')
  else log(`The ${e.name} slips away beyond your reach.`, 'good')
  occupied.delete(keyXY(e.x, e.y))
  e.x = spot.x
  e.y = spot.y
  occupied.add(keyXY(e.x, e.y))
  e.animStart = undefined
  e.animFromX = e.x
  e.animFromY = e.y
  e.attackStart = undefined
  e.rareFleeTurns = 0
  e.rareFleeAcc = 0
  // Relocation itself establishes the separation; a following player need not
  // wait one more turn at the boundary to enable the next encounter.
  e.rareArmed = true
  if (homeBound) {
    e.homeX = e.x
    e.homeY = e.y
    e.homeTileType = surfaceMap[e.y][e.x]
  }
  if (enemyWanderMode(e) === 'far') enemyChooseFarTarget(e)
  return true
}

function rareStepAwayFromPlayer(e) {
  const destination = enemyEscapeDestination(e)
  if (!destination) return false
  const fromX = e.x, fromY = e.y
  occupied.delete(keyXY(fromX, fromY))
  e.x = destination.x
  e.y = destination.y
  occupied.add(keyXY(e.x, e.y))
  finishEnemyMove(e, fromX, fromY)
  return true
}

// True spends this enemy's turn fleeing. False permits ordinary combat after a
// second-sighting catch. Invisible players can cause flight but are not chased.
function rareFlee(e, dist, hidden = playerHiddenFromEnemy(e)) {
  if (!(e.rareFleeTurns > 0) || !rareFleeEligible(e)) return false
  if (e.rareSightings > 1 && !hidden && dist <= ATTACK_RANGE) {
    rareCatch(e)
    return false
  }
  e.aware = false
  e.rareFleeAcc = (e.rareFleeAcc || 0) + rareFleePace(e)
  const steps = Math.floor(e.rareFleeAcc)
  e.rareFleeAcc -= steps
  e.rareFleeTurns--
  for (let step = 0; step < steps; step++) {
    if (rareStepAwayFromPlayer(e)) continue
    if (e.rareSightings > 1 && !hidden) {
      rareCatch(e)
      return false
    }
    if (rareSlipAway(e, Math.max(RARE_FLEE.slipMinDistance, RARE_FLEE.rearmDistance, dist + 1), true)) return true
    break
  }
  if (e.rareFleeTurns <= 0) {
    const gap = Math.max(Math.abs(e.x - player.x), Math.abs(e.y - player.y))
    if (!rareSlipAway(e, Math.max(RARE_FLEE.slipMinDistance, RARE_FLEE.rearmDistance, gap))) {
      // A degenerate map with no legal destination must not drop first-sighting
      // protection. Retry the escape next turn; never manufacture an invalid tile.
      e.rareFleeTurns = 1
      e.rareFleeAcc = 0
    }
  }
  return true
}
