'use strict'

const TACTICAL_CONSUMABLE_KINDS = Object.freeze([
  'scrollOfFear', 'scrollOfDeathShield', 'scrollOfChaos', 'scrollOfFireball', 'stoneSkinPotion', 'berserkPotion'
])

function potionGracePenalty() {
  return (player.stoneSkinTurns > 0 ? itemDefinition('stoneSkinPotion').effect.gracePenalty : 0) +
    (player.berserkTurns > 0 ? itemDefinition('berserkPotion').effect.gracePenalty : 0)
}

function tickCombatPotions() {
  for (const [counter, bonus, message] of [
    ['stoneSkinTurns', 'stoneSkinBonus', 'Your stone skin softens.'],
    ['berserkTurns', 'berserkBonus', 'Your berserk fury fades.']
  ]) if (player[counter] > 0 && --player[counter] === 0) {
    player[bonus] = 0
    log(message, 'info')
  }
}

// Called at damage resolution, before death checks, poison, knockback or extra hits.
// A shield protects one damage event, never the rest of the turn.
function absorbPlayerFatalDamage() {
  if (player.hp > 0) return false
  if (ArtifactWayfaring.rescueCastaway()) return true
  if (!player.deathShieldReady) return false
  player.hp = 1
  player.deathShieldReady = false
  log('Your death shield shatters, leaving you barely alive!', 'good')
  spawnDamageNumber(player.x, player.y, 'Shield breaks!', '#a9d5ff')
  return true
}

function breakEnemyFear(enemy) {
  if (!(enemy.fearTurns > 0)) return
  enemy.fearTurns = 0
  if (enemy.alive && enemy.hp > 0 && onCurrentLevel(enemy) && enemyIsVisibleOnMainView(enemy))
    log(`Pain breaks the ${enemy.name}'s fear!`, 'info')
}

// Fear does not use the wounded-flee ability's visibility check, hesitation or
// theft counters. It also suppresses ranged shots, summons, charge and pull.
function takeFearTurn(enemy) {
  const destination = enemyEscapeDestination(enemy)
  if (!destination) {
    if (!playerHiddenFromEnemy(enemy) && !enemyIsPassive(enemy) &&
        Math.max(Math.abs(enemy.x - player.x), Math.abs(enemy.y - player.y)) === ATTACK_RANGE &&
        enemyHasSight(enemy)) return enemyAttackPlayer(enemy)
    return false
  }
  if (enemyOpenDoorInsteadOfMove(enemy, destination.x, destination.y)) return false
  const fromX = enemy.x, fromY = enemy.y
  occupied.delete(keyXY(fromX, fromY))
  enemy.x = destination.x; enemy.y = destination.y
  occupied.add(keyXY(enemy.x, enemy.y))
  enemy.aware = false; enemy.farPath = null; enemy.attackStart = undefined
  leaveBeastTrack(enemy, fromX, fromY)
  finishEnemyMove(enemy, fromX, fromY)
  if (enemy.alive) alertDwarvenRuinsEnemiesFromFlee(enemy)
  return player.hp <= 0 || !!deathTransition
}

function applyEnemyFear(enemy, duration) {
  if (!enemy?.alive || enemy.hp <= 0 ||
      ENEMY_TEMPLATE_BY_NAME[enemy.baseName || enemy.name]?.family === 'undead') return false
  enemy.fearTurns = Math.max(enemy.fearTurns || 0, duration)
  wakeSleepingEnemy(enemy)
  enemy.attackStart = undefined
  enemy.farPath = null
  spawnDamageNumber(enemy.x, enemy.y, 'Fear!', '#d99bff')
  return true
}

function applyFearScroll(effect, context = {}) {
  const origin = context.origin || player
  const duration = consumablePower(effect.durationTurns)
  // Expose dormant mimics before collecting victims of this same Fear cast.
  Mimics.revealBySpell((x,y) => Math.max(Math.abs(x-origin.x),Math.abs(y-origin.y)) <= effect.radius)
  let affected = 0
  for (const enemy of enemies) {
    if (!enemy.alive || enemy.hp <= 0 || !onCurrentLevel(enemy) ||
        ArtifactGeomancy.buried(enemy) || enemy.tier < 1 || enemy.tier > effect.maxTier ||
        Math.max(Math.abs(enemy.x - origin.x), Math.abs(enemy.y - origin.y)) > effect.radius) continue
    if (applyEnemyFear(enemy, duration)) affected++
  }
  log(affected ? `Terror seizes ${affected} creature${affected === 1 ? '' : 's'}!` : context.source==='read' ? 'The scroll finds no creature it can frighten.' : 'The spell finds no creature it can frighten.', 'info')
}

// Flood each movement class's connected component once per cast. Occupants do
// not disconnect terrain; reservations are checked separately for safe landings.
// Chaos can teleport through barred partitions and barred doors (but never
// land on them), while solid walls and ordinary shut doors still divide space.
function chaosPassesBars(tile) {
  return ['dwarvenprisonbars','dwarvenprisondoorclosed','dwarvenprisondoorlocked'].includes(tile)
}

function chaosReachable(actor, cache) {
  const type = actor === player ? 'player' : enemyHasAbility(actor, 'ethereal') ? 'ethereal'
    : enemyHasAbility(actor, 'fly') ? 'fly' : 'walk'
  const startKey = keyXY(actor.x, actor.y)
  const cached = cache.get(type) || []
  const component = cached.find(seen => seen.has(startKey))
  if (component) return component
  const seen = new Set([startKey]), queue = [{x: actor.x, y: actor.y}]
  for (let i = 0; i < queue.length; i++) for (const [dx, dy] of DIRS8) {
    const x = queue[i].x + dx, y = queue[i].y + dy, tile = map[y]?.[x], key = keyXY(x, y)
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || !tile || seen.has(key)) continue
    if (!chaosPassesBars(tile) && (isClosedDungeonDoorTile(tile) || isLockedDungeonDoorTile(tile) ||
        !(actor === player ? isWalkableForPlayer(x, y) : enemyCanTraverse(actor, x, y)))) continue
    seen.add(key); queue.push({x, y})
  }
  cached.push(seen); cache.set(type, cached)
  return seen
}

function applyChaosScroll(effect, context = {}) {
  const origin = context.origin || {x: player.x, y: player.y}
  const actors = [...(context.includePlayer===false ? [] : [player]),
    ...enemies.filter(e => e.alive && e.hp > 0 && onCurrentLevel(e) &&
    !ArtifactGeomancy.buried(e) &&
    Math.max(Math.abs(e.x - origin.x), Math.abs(e.y - origin.y)) <= effect.radius)]
  // Reserve original locations as well: a stranded actor always retains its tile.
  const reserved = new Set(enemies.filter(e => e.alive && onCurrentLevel(e)).map(e => keyXY(e.x, e.y)))
  reserved.add(keyXY(player.x, player.y))
  if (currentZ === 0) for (const npc of npcs) reserved.add(keyXY(npc.x, npc.y))
  const cache = new Map(), moves = []
  for (const actor of actors) {
    const reachable = chaosReachable(actor, cache), options = [], radius = effect.destinationRadius
    for (let y = Math.max(0, actor.y - radius); y <= Math.min(MAP_H - 1, actor.y + radius); y++)
      for (let x = Math.max(0, actor.x - radius); x <= Math.min(MAP_W - 1, actor.x + radius); x++) {
        const tile = map[y]?.[x], key = keyXY(x, y)
        if (!reachable.has(key) || reserved.has(key) || !TILE[tile]?.walk ||
            ['water', 'river', 'lava', 'frozenriver', 'ice', 'crackingice', 'crypttrap'].includes(tile) ||
            isLakeIce(tile) || DungeonTraps.isTrigger(tile) ||
            isClosedDungeonDoorTile(tile) || isLockedDungeonDoorTile(tile)) continue
        if (actor !== player && (currentZ === 0 && sanctuaryDistance(x, y) <= FLEE_DISTANCE)) continue
        options.push({x, y})
      }
    if (!options.length) continue // No RNG or relocation when boxed in.
    const destination = pick(options)
    reserved.add(keyXY(destination.x, destination.y))
    moves.push({actor, fromX: actor.x, fromY: actor.y, ...destination})
  }
  for (const move of moves) {
    const {actor, x, y, fromX, fromY} = move
    if (actor !== player) occupied.delete(keyXY(fromX, fromY))
    spawnDamageNumber(fromX, fromY, 'Chaos!', '#d9a9ff')
    actor.x = x; actor.y = y
    if (actor === player && (x !== fromX || y !== fromY)) markPlayerPositionChanged()
    DungeonHazards.onActorEntered(actor, fromX, fromY)
    actor.animStart = undefined; actor.attackStart = undefined; actor.chargeAnim = null
    if (actor !== player) {
      occupied.add(keyXY(x, y)); actor.farPath = null
      actor.farTargetX = null; actor.farTargetY = null
      actor.forestConcealX = null; actor.forestConcealY = null
    }
  }
  // A completed Chaos swap is one atomic occupancy update. Traps may only
  // fire once the destinations are fully reserved for all participants.
  for (const move of moves) if (move.actor !== player && move.actor.alive)
    ArtifactGeomancy.onEnemyEntered(move.actor,move.fromX,move.fromY)
  // A rune which scrambles only enemies cannot interrupt swimming, camera,
  // player auto-path, or pickup checks. Ordinary reads still update the view.
  if (moves.some(m=>m.actor===player && (m.fromX!==m.x || m.fromY!==m.y))) {
    stopCameraAnimation();stopAttackAnimation()
    clearAutoPath();pendingMove=null;resetSwimming()
    invalidateUndergroundFov();currentUndergroundFov()
    minimapDirty=true;checkGroundAt(player.x,player.y)
  }
  log(moves.length ? 'Space twists. Creatures scatter in chaos!' :
    'Space shudders, but nothing moves.', 'info')
}

// The scroll effect core is independent of inventory, turn count, cooldowns
// and replay. Prepared runes/shields/cairns can reuse the same rules later.
// Validation must never change RNG or world state.
function validateScrollEffect(payload, context = {}) {
  const kind=payload?.kind
  if (kind==='scrollOfDeathShield') return {valid:!player.deathShieldReady,
    reason:'Your death shield is already ready.'}
  if (['scrollOfFear','scrollOfChaos','scrollOfInvisibility'].includes(kind))
    return {valid:true}
  if (kind==='scrollOfFireball') return {valid:Number.isInteger(context.x) &&
    Number.isInteger(context.y) && (context.source==='rune'
      ? !!map[context.y]?.[context.x] : validFireballTarget(context.x,context.y))}
  return {valid:false,reason:'This scroll needs a different action.'}
}

function resolveScrollEffect(payload, context = {}) {
  const validation=validateScrollEffect(payload,context)
  if (!validation.valid) return {executed:false,blocked:true,reason:validation.reason}
  const kind=payload.kind,effect=itemDefinition(kind).effect
  if (kind==='scrollOfFear') applyFearScroll(effect,context)
  else if (kind==='scrollOfChaos') applyChaosScroll(effect,context)
  else if (kind==='scrollOfDeathShield') {
    player.deathShieldReady=true
    log('A death shield surrounds you.','good')
    spawnDamageNumber(player.x,player.y,'Shield ready!','#a9d5ff')
  } else if (kind==='scrollOfInvisibility') {
    player.invisibleTurns=itemEffectPower(kind,effect.durationTurns)
    log(context.source==='read' ? 'You read the Scroll of Invisibility. The shadows swallow you.' : 'The shadows swallow you.','good')
  } else if (kind==='scrollOfFireball') return {executed:true,blocked:false,
    ...resolveFireballEffect(context)}
  else return {executed:false,blocked:true,reason:'A target is required.'}
  return {executed:true,blocked:false}
}

function useTacticalConsumable(idx, kind) {
  const item = player.inventory[idx]
  if (!item || item.kind !== kind || !canUseItemsWhileSwimming()) return
  if (kind.startsWith('scrollOf')) {
    const validation=validateScrollEffect({kind})
    if(!validation.valid){if(validation.reason) log(validation.reason,'info');return}
  }
  ensureReplayItemIds()
  recordReplayAction({type: 'useItem', action: kind, idx, replayId: item.replayId})
  item.count = (item.count || 1) - 1
  if (item.count <= 0) player.inventory.splice(idx, 1)
  if (kind.startsWith('scrollOf')) AdaptivePlayerTrolling.onScrollUsed(kind)
  else AdaptivePlayerTrolling.onPotionDrunk()
  const effect = itemDefinition(kind).effect
  if (kind.startsWith('scrollOf')) resolveScrollEffect({kind},{source:'read'})
  else {
    const stone = kind === 'stoneSkinPotion'
    const stat = Math.max(0, stone ? playerDef(false, true) : playerAtk(false, true))
    // Sample without either potion; refreshing never scales from itself.
    const bonus = consumablePower(effect.baseBonus + Math.floor(stat / effect.statDivisor))
    player[stone ? 'stoneSkinBonus' : 'berserkBonus'] = bonus
    player[stone ? 'stoneSkinTurns' : 'berserkTurns'] = consumablePower(effect.durationTurns)
    log(stone ? `Your skin hardens like stone. (+${bonus} DEF, −3 GRACE)`
      : `Berserk fury fills you. (+${bonus} ATK, −3 DEF, −2 GRACE)`, 'good')
  }
  consumeItemTurn()
}
