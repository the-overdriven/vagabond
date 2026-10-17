'use strict'

// Each status starts on the monster's action and ticks at the start of the
// following world turns. Absolute cooldown deadlines avoid animation races.
function applyEnemyContactStatuses(e) {
  if (enemyHasAbility(e, 'root') && turnCount >= e.rootReadyTurn && chance(0.25)) {
    player.rootTurns = 3
    e.rootReadyTurn = turnCount + 6
    clearAutoPath()
    log(`The ${e.name}'s tendrils bind your feet!`, 'bad')
    spawnDamageNumber(player.x, player.y, 'Rooted!', '#a4cf70')
  }
  if (enemyHasAbility(e, 'mummyCurse') && chance(0.25)) {
    player.mummyCurseTurns = 4
    log(`The ${e.name} lays a curse upon you! (−2 ATK)`, 'bad')
    spawnDamageNumber(player.x, player.y, 'Cursed!', '#c7a5f6')
  }
}

function tryEnemyGazeOrWail(e) {
  if (!e.alive || enemyIsPassive(e) || e.summonedTurn === turnCount ||
      playerHiddenFromEnemy(e) || playerInsideSanctuary() || enemyInsideSanctuary(e) ||
      !enemyHasSight(e)) return false
  const distance = Math.max(Math.abs(e.x - player.x), Math.abs(e.y - player.y))
  if (enemyHasAbility(e, 'petrifyingGaze') && distance <= 3 &&
      turnCount >= e.gazeReadyTurn && chance(0.25)) {
    e.gazeReadyTurn = turnCount + 6
    player.gazeTurns = 3
    clearAutoPath()
    log(`The ${e.name}'s petrifying gaze stiffens your limbs! (−3 SPD, −3 GRACE)`, 'bad')
    spawnDamageNumber(player.x, player.y, 'Petrified!', '#b8b8b8')
    return true
  }
  if (enemyHasAbility(e, 'wail') && distance <= 4 && turnCount >= e.wailReadyTurn && chance(0.25)) {
    e.wailReadyTurn = turnCount + 8
    player.confusionTurns = 5
    player.confusionSourceId = e.id
    clearAutoPath()
    log(`The ${e.name} unleashes a piercing wail! You are confused!`, 'bad')
    spawnDamageNumber(player.x, player.y, 'Confused!', '#dba3fa')
    return true
  }
  return false
}

function clearBansheeConfusion(e) {
  if (!e || player.confusionSourceId !== e.id || player.confusionTurns <= 0) return
  player.confusionTurns = 0
  player.confusionSourceId = null
  log(`The ${e.name}'s death clears your mind.`, 'good')
  spawnDamageNumber(player.x, player.y, 'Clear mind!', '#b9e6bc')
}

function tickMonsterStatuses() {
  for (const [key, message] of [
    ['rootTurns','The roots release your feet.'],
    ['gazeTurns','Your limbs regain their flexibility.'],
    ['mummyCurseTurns','The Mummy’s curse fades.'],
    ['confusionTurns','The Banshee’s wail fades from your mind.'],
    ['weakenTurns','The weakening spell fades.'],
    ['slowTurns','The slowing spell fades.']
  ]) if (player[key] > 0 && --player[key] === 0) {
    if (key === 'confusionTurns') player.confusionSourceId = null
    log(message, 'good')
  }
}

function confusionDirection(dx, dy) {
  // Confusion applies only to walking, not deliberate melee attacks.
  if (player.confusionTurns <= 0 || player.rootTurns > 0 || enemies.some(e => e.alive && onCurrentLevel(e) &&
      e.x === player.x + dx && e.y === player.y + dy) || !chance(0.40)) return {dx, dy}
  const choices = DIRS8.filter(([sx, sy]) => {
    if (sx === dx && sy === dy) return false
    const x = player.x + sx, y = player.y + sy
    return isWalkableForPlayer(x, y) && !grasslandTrees.has(keyXY(x,y)) &&
      !enemies.some(e => e.alive && onCurrentLevel(e) && e.x === x && e.y === y) &&
      !(currentZ === 0 && npcs.some(n => n.x === x && n.y === y)) &&
      !isClosedDungeonDoorTile(map[y]?.[x]) && !isLockedDungeonDoorTile(map[y]?.[x])
  })
  if (!choices.length) return {dx,dy}
  const [nextDx,nextDy] = pick(choices)
  // The planned route is no longer valid after an involuntary side-step.
  clearAutoPath()
  log('You stumble in confusion!', 'bad')
  spawnDamageNumber(player.x, player.y, 'Confused!', '#dba3fa')
  return {dx:nextDx,dy:nextDy}
}

function frenzyTargets() {
  if (playerInsideSanctuary()) return []
  return enemies.filter(e => e.alive && onCurrentLevel(e) &&
    Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y)) === 1)
}

async function performBerserkFrenzy() {
  const targets = frenzyTargets()
  if (!targets.length) return false
  const target = pick(targets)
  clearAutoPath()
  consecutiveWaitTurns = 0
  log(`Berserk rage overwhelms you! You lash out at the ${target.name}!`, 'bad')
  spawnDamageNumber(player.x, player.y, 'Frenzy!', '#f48a55')
  const invisibleAttack = playerHiddenFromEnemy(target), targetHp = target.hp
  const hit = await playerAttackEnemy(target)
  if (invisibleAttack && target.alive && hit) reactToInvisibleAttack(target,Math.max(0,targetHp-target.hp))
  enemyTurn(invisibleAttack && hit ? target : null)
  npcTurn()
  updateHud();render();runAnimationLoop();updateTooltip();flushPendingMove()
  return true
}

function tryBerserkFrenzy() {
  return player.berserkTurns > 0 && frenzyTargets().length > 0 && chance(0.25)
    ? performBerserkFrenzy() : false
}
