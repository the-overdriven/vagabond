'use strict'

// A rush consumes no RNG unless the entire straight grass route is usable.
function enemyChargeLine(e) {
  const dx = player.x - e.x, dy = player.y - e.y
  const distance = Math.max(Math.abs(dx), Math.abs(dy))
  if (distance < 2 || distance > effectiveAggroRange(e) ||
      (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy))) return null
  const sx = Math.sign(dx), sy = Math.sign(dy)
  const cornerOpen = (x, y) => isWalkable(x, y) && !grasslandTrees.has(keyXY(x, y))
  const clear = (x, y) => map[y]?.[x] === 'grass' &&
    cornerOpen(x, y) &&
    !enemies.some(other => other !== e && other.alive && onCurrentLevel(other) && other.x === x && other.y === y) &&
    !(currentZ === 0 && npcs.some(n => n.x === x && n.y === y))
  for (let i = 0; i <= distance; i++) {
    const x = e.x + sx * i, y = e.y + sy * i
    if (!clear(x, y)) return null
    if (i > 0 && sx && sy && (!cornerOpen(x - sx, y) || !cornerOpen(x, y - sy))) return null
  }
  return {sx, sy, distance}
}

function forcePlayerPosition(x, y) {
  const from = {x: player.x, y: player.y}
  clearAutoPath()
  player.x = x; player.y = y
  // Forced movement spends water endurance, but never earns swimming practice.
  advanceSwimming(false, from)
  if (player.hp <= 0 || deathTransition) return
  currentUndergroundFov()
  animateCameraToPlayer(from)
  updateHud()
  updateTooltip()
}

function chargeKnockback(e, line) {
  const x = player.x + line.sx, y = player.y + line.sy
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ||
      !(isWalkable(x, y) || deepSwimmingWater(x, y)) ||
      grasslandTrees.has(keyXY(x, y)) ||
      enemies.some(other => other.alive && onCurrentLevel(other) && other.x === x && other.y === y) ||
      (currentZ === 0 && npcs.some(n => n.x === x && n.y === y))) return
  if (line.sx && line.sy &&
      (!(isWalkable(player.x + line.sx, player.y) || deepSwimmingWater(player.x + line.sx, player.y)) ||
       !(isWalkable(player.x, player.y + line.sy) || deepSwimmingWater(player.x, player.y + line.sy)))) return
  log(`The ${e.name}'s charge knocks you back!`, 'bad')
  forcePlayerPosition(x, y)
}

function tryEnemyRush(e) {
  const charge = enemyHasAbility(e, 'charge')
  if ((!charge && !enemyHasAbility(e, 'pull')) || playerHiddenFromEnemy(e) ||
      enemyIsPassive(e) || e.summonedTurn === turnCount) return false
  const line = enemyChargeLine(e)
  if (!line || !chance(charge ? 0.60 : 0.70)) return false
  e.aware = true
  e.forestConcealX = null; e.forestConcealY = null
  alarmEnemy(e)
  if (charge) {
    log(`${e.name} is charging at you with incredible speed!`, 'bad')
    const fromX = e.x, fromY = e.y
    occupied.delete(keyXY(e.x, e.y))
    e.x = player.x - line.sx; e.y = player.y - line.sy
    e.farPath = null
    occupied.add(keyXY(e.x, e.y))
    finishEnemyMove(e, fromX, fromY)
    enemyAttackPlayer(e, true, 1, {atkMultiplier: 1 + 0.25 * (line.distance - 1), line})
  } else {
    log(`${e.name} throws a web at you and drags you closer!`, 'bad')
    spawnDamageNumber(player.x, player.y, 'Web!', RENDER_STYLE.damage.miss)
    forcePlayerPosition(e.x + line.sx, e.y + line.sy)
    if (player.hp > 0 && !deathTransition) enemyAttackPlayer(e, true)
  }
  return true
}
