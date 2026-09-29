'use strict'

function deepSwimmingWater(x, y) {
  return map[y]?.[x] === 'water'
}

function canUseItemsWhileSwimming() {
  if (!deepSwimmingWater(player.x, player.y) || raceHas('swims')) return true
  log('You cannot use items while swimming.', 'info')
  return false
}

function resetSwimming() {
  player.swimTurns = 0
  player.drowning = false
  player.swimPosition = null
}

function isDrowning() {
  return player.hp > 0 && !player.godMode && !raceHas('swims') &&
    deepSwimmingWater(player.x, player.y) && player.swimTurns > (player.swimming || 0)
}

function reconcileSwimming() {
  if (!deepSwimmingWater(player.x, player.y) || player.hp <= 0) resetSwimming()
  if (!isDrowning()) player.drowning = false
}

// Called only by successful movement and waiting, never by drawing or the turn clock.
function advanceSwimming(moved, from = null) {
  const here = {x: player.x, y: player.y, z: currentZ}
  const prior = player.swimPosition
  if (prior && (prior.z !== currentZ || (from
    ? prior.x !== from.x || prior.y !== from.y
    : prior.x !== here.x || prior.y !== here.y))) resetSwimming()
  if (!deepSwimmingWater(here.x, here.y)) {
    if (player.swimPosition || player.swimTurns > 0) log('You reach the bank and catch your breath.', 'info')
    resetSwimming()
    return
  }
  if (from && !deepSwimmingWater(from.x, from.y)) {
    resetSwimming()
    log(raceHas('swims') ? 'You slip into the water and swim with ease.'
      : 'You enter the deep water and begin swimming.', 'info')
  }
  player.swimPosition = here
  if (player.godMode || raceHas('swims')) {
    player.swimTurns = 0
    player.drowning = false
    return
  }
  if (moved && player.swimming > 0) {
    player.swimmingPractice = (player.swimmingPractice || 0) + 1
    while (player.swimmingPractice >= 100) {
      player.swimmingPractice -= 100
      player.swimming++
      log(`Your Swimming improves to ${player.swimming}.`, 'good')
    }
  }
  player.swimTurns = (player.swimTurns || 0) + 1
  if (!isDrowning()) {
    player.drowning = false
    return
  }
  if (!player.drowning) log('You are drowning! Get back to shore!', 'bad')
  player.drowning = true
  const damage = Math.max(1, Math.round(playerMaxHp() * 0.05))
  player.hp = Math.max(0, player.hp - damage)
  spawnDamageNumber(player.x, player.y, damage, RENDER_STYLE.damage.playerHit)
  if (player.hp <= 0) {
    log('You have drown.', 'bad')
    die(null, 'drowning')
    return false
  }
}

function drowningShore() {
  const queue = [{x: player.x, y: player.y}]
  const visited = new Set([keyXY(player.x, player.y)])
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]
    for (const [dx, dy] of DIRS8) {
      const x = p.x + dx, y = p.y + dy, key = keyXY(x, y)
      if (visited.has(key)) continue
      visited.add(key)
      if (deepSwimmingWater(x, y)) queue.push({x, y})
      else if (isWalkable(x, y) && map[y][x] !== 'river' &&
        !enemies.some(e => e.alive && onCurrentLevel(e) && e.x === x && e.y === y) &&
        !(currentZ === 0 && npcs.some(n => n.x === x && n.y === y))) return {x, y}
    }
  }
  return null
}
