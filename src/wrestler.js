'use strict'

// Wrestle exchanges two adjacent actors as one enemy action. All mechanics
// resolve immediately; the two crossing slides are presentation only.
const WRESTLE_CHANCE = 0.25
const WRESTLE_COOLDOWN = 5

function playerWrestleTileOpen(x, y) {
  // Forced displacement never teaches Swimming or puts an untrained player
  // into deep water. God mode retains its ordinary movement exemption.
  if (deepSwimmingWater(x, y) && !player.godMode && !raceHas('swims') && player.swimming <= 0) return false
  return isWalkableForPlayer(x, y) && !grasslandTrees.has(keyXY(x, y))
}

function enemyWrestleEligible(e) {
  if (!enemyHasAbility(e, 'wrestler') || !e.alive || e.summonedTurn === turnCount ||
      enemyIsPassive(e) || playerHiddenFromEnemy(e) || playerInsideSanctuary() ||
      enemyInsideSanctuary(e) || turnCount < e.wrestleReadyTurn) return false
  const dx = player.x - e.x, dy = player.y - e.y
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false
  if (!enemyHasSight(e) || !playerWrestleTileOpen(e.x, e.y) ||
      !enemyCanTraverse(e, player.x, player.y) ||
      enemySanctuaryTileForbidden(e, player.x, player.y) ||
      grasslandTrees.has(keyXY(player.x, player.y))) return false
  if (currentZ === 0 && npcs.some(n => (n.x === e.x && n.y === e.y) ||
      (n.x === player.x && n.y === player.y))) return false
  // The actors cannot cut through an impassable diagonal corner, even though
  // they are swapping rather than taking separate movement actions.
  if (dx && dy) {
    const sideA = {x:e.x + dx, y:e.y}, sideB = {x:e.x, y:e.y + dy}
    for (const side of [sideA, sideB]) {
      if (!enemyCanTraverse(e, side.x, side.y) || !playerWrestleTileOpen(side.x, side.y)) return false
    }
  }
  return true
}

function tryEnemyWrestle(e) {
  if (!enemyWrestleEligible(e) || !chance(WRESTLE_CHANCE)) return false
  const fromEnemy = {x:e.x, y:e.y}
  const fromPlayer = {x:player.x, y:player.y}
  // Move the monster before the player so occupancy, traps and terrain are
  // consistent for any immediate effects of displacement.
  occupied.delete(keyXY(e.x, e.y))
  e.x = fromPlayer.x
  e.y = fromPlayer.y
  e.farPath = null
  occupied.add(keyXY(e.x, e.y))
  // Both coordinates must be final before any entry trap fires. A projectile
  // trap would otherwise see the player and wrestler occupying one tile.
  player.x = fromEnemy.x
  player.y = fromEnemy.y
  e.wrestleReadyTurn = turnCount + WRESTLE_COOLDOWN + 1
  e.aware = true
  log(`The ${e.name} grabs you and swaps places with you!`, 'bad')
  spawnDamageNumber(fromPlayer.x, fromPlayer.y, 'Swapped!', RENDER_STYLE.damage.playerHit)
  finishEnemyMove(e, fromEnemy.x, fromEnemy.y)
  // A trap may kill the monster; the player entry still resolves independently.
  forcePlayerPosition(fromEnemy.x, fromEnemy.y,
    {kind:'wrestle', duration: MOVE_ANIM_MS}, fromPlayer)
  return true
}
