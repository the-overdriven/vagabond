'use strict'

// An eligible caster casts at most one spell each turn. Below the HP
// thresholds survival takes priority; ordinary magic is rolled if it fails.
const ENEMY_SPELL_CHANCE = 0.20
// Low-HP spells use fixed slices of one seeded turn roll, not relative
// weights: sacrificing stays 30% and teleporting stays 20%, even when
// the other ability has no valid target. Together they occupy 50% of turns.
const ENEMY_SURVIVAL_CAST_CHANCES = {sacrifice: 0.30, lowHpTeleport: 0.20}
const ENEMY_DEBUFF_TURNS = 5
const ENEMY_IMMUNITY_TURNS = 5
const LOW_HP_TELEPORT_THRESHOLD = 0.25
const LOW_HP_TELEPORT_MIN_DISTANCE = 12
const LOW_HP_TELEPORT_SEARCH_STEPS = 20
const SACRIFICE_HP_THRESHOLD = 0.50
const SACRIFICE_RADIUS = 4
const DISPELLABLE_PLAYER_BUFFS = [
  {counter:'berryRegenTurns', label:'Regeneration'},
  {counter:'invisibleTurns', label:'Invisibility'},
  {counter:'speedPotionTurns', bonus:'speedPotionBonus', label:'Speed'},
  {counter:'stoneSkinTurns', bonus:'stoneSkinBonus', label:'Stone Skin'},
  {counter:'berserkTurns', bonus:'berserkBonus', label:'Berserk'},
  {counter:'deathShieldReady', label:'Death Shield', boolean:true}
]

function playerDispelTargets() {
  return DISPELLABLE_PLAYER_BUFFS.filter(buff => player[buff.counter] > 0)
}

function playerDisarmSlots() {
  return ['weapon', 'shield', 'armor'].filter(slot => player.equip[slot])
}

// Teleport only to reachable, unoccupied floor connected to the caster's
// current position. In particular, never blink into isolated sealed chambers
// or sacred ground. Stable BFS order and one seeded destination roll ensure
// current saves and replays choose the same tile.
function lowHpTeleportDestinations(e) {
  if (!enemyHasAbility(e, 'lowHpTeleport') || e.lowHpTeleportUsed ||
      e.hp >= e.maxHp * LOW_HP_TELEPORT_THRESHOLD) return []
  const minDistance = Math.max(LOW_HP_TELEPORT_MIN_DISTANCE, effectiveAggroRange(e) + 2)
  const seen = new Set([keyXY(e.x, e.y)])
  const queue = [{x:e.x, y:e.y, steps:0}]
  const destinations = []
  for (let i = 0; i < queue.length; i++) {
    const pos = queue[i]
    if (pos.steps > 0 && isWalkable(pos.x, pos.y) &&
        DungeonTraps.safeSpawn(pos.x, pos.y, currentZ, currentLevelKind()) &&
        Math.max(Math.abs(player.x-pos.x), Math.abs(player.y-pos.y)) > minDistance) {
      destinations.push({x:pos.x, y:pos.y})
    }
    if (pos.steps >= LOW_HP_TELEPORT_SEARCH_STEPS) continue
    for (const [dx,dy] of DIRS8) {
      const x=pos.x+dx, y=pos.y+dy, key=keyXY(x,y)
      if (seen.has(key) || !enemyTileOpen(e,x,y) ||
          (currentZ === 0 && npcs.some(n => n.x === x && n.y === y))) continue
      seen.add(key)
      queue.push({x,y,steps:pos.steps+1})
    }
  }
  return destinations
}

// Sacrifice is neither a player kill nor a source of farmable loot/XP.
// Quest targets and carriers of recoverable items must not disappear this way.
function enemySacrificeTargets(e) {
  if (!enemyHasAbility(e, 'sacrifice') || e.hp >= e.maxHp * SACRIFICE_HP_THRESHOLD) return []
  return enemies.filter(other => other !== e && other.alive && other.hp > 0 &&
    onCurrentLevel(other) &&
    Math.max(Math.abs(e.x-other.x), Math.abs(e.y-other.y)) <= SACRIFICE_RADIUS &&
    UndergroundFov.canSee(map,e.x,e.y,other.x,other.y) &&
    !enemyImmunityActive(other) &&
    !other.carriedDungeonKey && !other.stolenItem &&
    !(fishermanQuest?.state === 'active' && fishermanQuest.targetId === other.id) &&
    !(oldHunterQuest?.state === 'active' && (
      oldHunterQuest.targetEnemyId === other.id ||
      oldHunterQuest.targetEnemyIds?.includes(other.id) ||
      (oldHunterQuest.type === 'kill_specific' &&
        (other.baseName === oldHunterQuest.targetName || other.name === oldHunterQuest.targetName)) ||
      (oldHunterQuest.type === 'kill_group' && other.baseName === oldHunterQuest.targetBaseName) ||
      (oldHunterQuest.type === 'recover_item' && other.baseName === oldHunterQuest.targetName))))
}

function availableEnemySpells(e) {
  const spells = []
  if (enemyHasAbility(e, 'weaken') && player.weakenTurns <= 0) spells.push('weaken')
  if (enemyHasAbility(e, 'slow') && player.slowTurns <= 0) spells.push('slow')
  if (enemyHasAbility(e, 'disarm') && playerDisarmSlots().length) spells.push('disarm')
  if (enemyHasAbility(e, 'dispel') && playerDispelTargets().length) spells.push('dispel')
  if (enemyHasAbility(e, 'deathBolt') && clearProjectilePath(e)) spells.push('deathBolt')
  if (enemyHasAbility(e, 'immunity') && !e.immunityUsed && !enemyImmunityActive(e)) spells.push('immunity')
  if (lowHpTeleportDestinations(e).length) spells.push('lowHpTeleport')
  if (enemySacrificeTargets(e).length) spells.push('sacrifice')
  return spells
}

function rollEnemySurvivalSpell(eligible) {
  const roll = rng()
  let cumulative = 0
  for (const [spell, probability] of Object.entries(ENEMY_SURVIVAL_CAST_CHANCES)) {
    cumulative += probability
    if (roll < cumulative) return eligible.includes(spell) ? spell : null
  }
  return null
}

function tryEnemySpell(e) {
  if (!e.alive || e.hp <= 0 || !onCurrentLevel(e) || enemyIsPassive(e) ||
      e.summonedTurn === turnCount || e.fearTurns > 0 || e.sleeping ||
      player.hp <= 0 || playerHiddenFromEnemy(e) || playerInsideSanctuary() ||
      enemyInsideSanctuary(e) || !enemyHasSight(e)) return false
  const distance = Math.max(Math.abs(e.x - player.x), Math.abs(e.y - player.y))
  if (distance > effectiveAggroRange(e) || (forestHideChance(e, distance) > 0 &&
      e.forestConcealX === player.x && e.forestConcealY === player.y)) return false
  const spells = availableEnemySpells(e)
  // A separate seeded roll assigns fixed 30%/20% low-HP cast chances.
  // If its selected spell has no valid target, normal magic can still fire;
  // the unused chance never boosts the other survival ability.
  if (!spells.length) return false
  const survival = spells.filter(spell => spell in ENEMY_SURVIVAL_CAST_CHANCES)
  const ordinary = spells.filter(spell => !(spell in ENEMY_SURVIVAL_CAST_CHANCES))
  const survivalSpell = survival.length ? rollEnemySurvivalSpell(survival) : null
  let spell = survivalSpell
  if (!spell) {
    if (!ordinary.length || !chance(ENEMY_SPELL_CHANCE)) return false
    spell = pick(ordinary)
  }
  if (spell === 'weaken') {
    player.weakenTurns = ENEMY_DEBUFF_TURNS
    player.hp = Math.min(player.hp, playerMaxHp())
    log(`The ${e.name} weakens you! Your maximum HP falls by 10% for ${ENEMY_DEBUFF_TURNS} turns.`, 'bad')
    spawnDamageNumber(player.x, player.y, 'Weakened!', '#c7a5f6')
  } else if (spell === 'slow') {
    player.slowTurns = ENEMY_DEBUFF_TURNS
    log(`The ${e.name} slows you! Your SPD falls by 10% for ${ENEMY_DEBUFF_TURNS} turns.`, 'bad')
    spawnDamageNumber(player.x, player.y, 'Slowed!', '#c7a5f6')
  } else if (spell === 'disarm') {
    const slot = pick(playerDisarmSlots()), item = player.equip[slot]
    const before = statSnapshot()
    player.equip[slot] = null
    player.inventory.push(item)
    // Removing HP gear affects subsequent monsters now, even in headless replay.
    player.hp = Math.min(player.hp, playerMaxHp())
    equipmentLog(`The ${e.name} casts a disarming spell! Your ${item.name} is sent to your inventory.${statDeltaText(before)}`, [item], 'bad')
    spawnDamageNumber(player.x, player.y, 'Disarmed!', '#c7a5f6')
  } else if (spell === 'immunity') {
    e.immunityUsed = true
    e.immunityUntilTurn = turnCount + ENEMY_IMMUNITY_TURNS
    log(`The ${e.name} becomes immune to all attacks for ${ENEMY_IMMUNITY_TURNS} turns!`, 'bad')
    spawnDamageNumber(e.x, e.y, 'Immune!', '#c7a5f6')
  } else if (spell === 'lowHpTeleport') {
    const destinations = lowHpTeleportDestinations(e)
    if (!destinations.length) return false
    const destination = pick(destinations)
    const fromX=e.x, fromY=e.y
    occupied.delete(keyXY(fromX,fromY))
    e.x=destination.x; e.y=destination.y
    // A blink must never reuse a previous slide/lunge animation and appear to
    // travel across the whole map. Gameplay position is already final.
    e.animStart=undefined; e.attackStart=undefined
    e.hasteAnim=null; e.chargeAnim=null
    occupied.add(keyXY(e.x,e.y))
    e.homeX=e.x; e.homeY=e.y; e.homeTileType=map[e.y][e.x]
    e.aware=false
    e.forestConcealX=null; e.forestConcealY=null
    e.lowHpTeleportUsed=true
    log(`The ${e.name} vanishes in a burst of dark magic!`, 'bad')
    spawnDamageNumber(fromX,fromY,'Vanished!','#c7a5f6')
    spawnDamageNumber(e.x,e.y,'Teleported!','#c7a5f6')
  } else if (spell === 'sacrifice') {
    const targets = enemySacrificeTargets(e)
    if (!targets.length) return false
    const victim = pick(targets)
    const healing = Math.min(Math.max(0,e.maxHp-e.hp),victim.hp)
    // Removal, no XP or loot; preserve the normal death animation/cleanup.
    killEnemy(victim,false,'sacrifice')
    e.hp += healing
    log(`The ${e.name} sacrifices ${victim.name} and absorbs ${healing} HP!`, 'bad')
    spawnDamageNumber(victim.x,victim.y,'Sacrificed!','#c7a5f6')
    spawnDamageNumber(e.x,e.y,`+${healing} HP`,'#81df98')
  } else if (spell === 'deathBolt') {
    // Resolves this game turn, not when the skull reaches its target.
    enemyRangedAttackPlayer(e, null, DEATH_BOLT_CONFIG)
  } else if (spell === 'dispel') {
    const buff = pick(playerDispelTargets())
    player[buff.counter] = buff.boolean ? false : 0
    if (buff.bonus) player[buff.bonus] = 0
    log(`The ${e.name} dispels your ${buff.label}!`, 'bad')
    spawnDamageNumber(player.x, player.y, `${buff.label} dispelled!`, '#c7a5f6', 0, SUMMON_ANIM_MS)
  }
  clearAutoPath()
  checkPlayerHealthWarning()
  return true
}

// Absolute expiry is checked independently of rendering or animation frames.
// The five actions after casting are protected; the sixth spent action expires it.
function enemyImmunityActive(e) {
  return e.alive !== false && e.hp > 0 && e.immunityUntilTurn > turnCount
}

function expireEnemyImmunities() {
  for (const e of enemies) {
    if (!e.immunityUntilTurn || turnCount < e.immunityUntilTurn) continue
    e.immunityUntilTurn = 0
    if (e.alive && onCurrentLevel(e) && enemyIsVisibleOnMainView(e)) {
      log(`The ${e.name}'s immunity fades.`, 'good')
      spawnDamageNumber(e.x, e.y, 'Immunity fades!', '#b9e6bc')
    }
  }
}
