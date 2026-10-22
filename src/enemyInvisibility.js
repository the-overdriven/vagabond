'use strict'

// Monster invisibility is decided entirely on the deterministic game turn.
// No wall-clock time or render callback changes stealth, RNG, or combat.
const MONSTER_INVISIBILITY_CHANCE = 0.25
const MONSTER_INVISIBILITY_TURNS = 3
const MONSTER_INVISIBILITY_COOLDOWN = 8
const MONSTER_SHIMMER_RADIUS = 2
const MONSTER_INVISIBILITY_MISS_CHANCE = 0.80

function enemyInvisibleActive(e) {
  return !!e && enemyHasAbility(e, 'invisibility') &&
    e.invisibleUntilTurn > turnCount && e.alive && e.hp > 0
}

function enemyInvisibleShimmer(e) {
  // The activation turn is the only turn with a nearby translucent outline.
  // Derive it from the existing saved deadline; no additional state or RNG.
  return enemyInvisibleActive(e) &&
    turnCount < e.invisibleUntilTurn - MONSTER_INVISIBILITY_TURNS &&
    Math.max(Math.abs(e.x - player.x), Math.abs(e.y - player.y)) <= MONSTER_SHIMMER_RADIUS
}

function enemyCanBeSeen(e) {
  return !e.wallAmbushHidden && e.pendingAbility?.type !== 'burrow' &&
    (!enemyInvisibleActive(e) || enemyInvisibleShimmer(e))
}

function tryEnemyVanish(e) {
  if (!enemyHasAbility(e, 'invisibility') || !e.alive || e.hp <= 0 ||
      enemyInvisibleActive(e) || turnCount < e.invisibilityReadyTurn ||
      enemyIsPassive(e) || e.sleeping || enemyInsideSanctuary(e) ||
      playerInsideSanctuary() || playerHiddenFromEnemy(e) || !enemyHasSight(e)) return false
  if (!chance(MONSTER_INVISIBILITY_CHANCE)) return false
  // Activation consumes this action; three future enemy turns remain invisible.
  e.invisibleUntilTurn = turnCount + MONSTER_INVISIBILITY_TURNS + 1
  e.invisibilityReadyTurn = turnCount + MONSTER_INVISIBILITY_COOLDOWN + 1
  log(`The ${e.name} fades from sight!`, 'bad')
  spawnDamageNumber(e.x, e.y, 'Vanished!', '#b8a0e6')
  return true
}

function revealEnemyInvisibility(e) {
  if (!enemyInvisibleActive(e)) return false
  e.invisibleUntilTurn = 0
  if (undergroundTileVisible(e.x, e.y)) {
    log(`The ${e.name} becomes visible again!`, 'info')
    spawnDamageNumber(e.x, e.y, 'Revealed!', '#c6addf')
  }
  return true
}

function expireEnemyInvisibility(e) {
  if (!e.invisibleUntilTurn || turnCount < e.invisibleUntilTurn) return
  e.invisibleUntilTurn = 0
  if (undergroundTileVisible(e.x, e.y)) {
    log(`The ${e.name} reappears as its invisibility fades.`, 'info')
    spawnDamageNumber(e.x, e.y, 'Visible!', '#c6addf')
  }
}
