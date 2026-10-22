'use strict'

// Champion buffs are derived from live positions, not stored on recipients.
// Losing or moving the source removes both bonuses immediately, and two auras never stack.
const INSPIRED_RADIUS = 2
const INSPIRED_ATK = 2
const INSPIRED_DEF = 1
const HASTE_CHANCE = 0.20
const HASTE_COOLDOWN = 5
const HEAL_SELF_CHANCE = 0.25
const HEAL_SELF_FRACTION = 0.25

// Blind creatures sense invisible adjacent targets, but often hesitate during
// pursuit. This runs after an actual path option exists and before Haste.
function blindPursuitHesitates(e, distance) {
  if (!enemyHasAbility(e,'blind') || distance <= ATTACK_RANGE || !enemyFindStep(e)) return false
  if (!chance(BLIND_CONFIG.pursuitHesitationChance ?? 0.5)) return false
  if (enemyIsVisibleOnMainView(e))
    log((BLIND_CONFIG.hesitationMessage || '<enemy> senses you, but is reluctant about the direction.')
      .replace(/<enemy>/g, `The blind ${e.name}`).replace(/([^.!?])$/, '$1.'), 'info')
  return true
}

function inspiringChampionFor(e) {
  if (!e || !e.alive || e.hp <= 0 || e.prefix === 'Champion' || !onCurrentLevel(e)) return null
  return enemies.find(leader => leader !== e && leader.alive && leader.hp > 0 &&
    leader.prefix === 'Champion' && onCurrentLevel(leader) &&
    Math.max(Math.abs(leader.x-e.x), Math.abs(leader.y-e.y)) <= INSPIRED_RADIUS) || null
}

function inspiredAllyCount(leader) {
  if (!leader || !leader.alive || leader.hp <= 0 || leader.prefix !== 'Champion' || !onCurrentLevel(leader)) return 0
  return enemies.filter(other => other !== leader && other.alive && other.hp > 0 &&
    other.prefix !== 'Champion' && onCurrentLevel(other) &&
    Math.max(Math.abs(leader.x-other.x),Math.abs(leader.y-other.y)) <= INSPIRED_RADIUS).length
}

// One-time self heal. The cooldown is persisted like other ability deadlines,
// though its one-use limit means it cannot proc twice even after the cooldown.
function tryEnemyHealSelf(e) {
  if (!enemyHasAbility(e,'healSelf') || !e.alive || e.hp <= 0 || e.healSelfUsed ||
      turnCount < e.healSelfReadyTurn || e.hp >= e.maxHp*0.5 ||
      enemyIsPassive(e) || e.sleeping || enemyInsideSanctuary(e) ||
      playerInsideSanctuary() || playerHiddenFromEnemy(e) || !enemyHasSight(e)) return false
  if (!chance(HEAL_SELF_CHANCE)) return false
  const healed = Math.min(e.maxHp-e.hp, Math.max(1,Math.ceil(e.maxHp*HEAL_SELF_FRACTION)))
  e.hp += healed
  e.healSelfUsed = true
  e.healSelfReadyTurn = turnCount + 6
  log(`The ${e.name} restores ${healed} HP with healing magic!`, 'bad')
  spawnDamageNumber(e.x,e.y,`+${healed} HP`,'#81df98')
  return true
}

// A species may carry one emergency consumable. A successful roll spends its
// action and its lifetime charge; eligibility and healing are template-driven.
function tryEnemyConsumableHealing(e) {
  if (!enemyHasAbility(e,'consumeHealingItem') || !e.alive || e.hp <= 0 ||
      e.consumableHealUsed || enemyIsPassive(e) || e.sleeping ||
      enemyInsideSanctuary(e) || playerInsideSanctuary() ||
      playerHiddenFromEnemy(e) || !enemyHasSight(e)) return false
  const cfg = enemyTemplateForSavedEnemy(e)?.consumableHealing
  if (!cfg?.items?.length) return false
  const hpFraction = e.hp / e.maxHp
  const options = cfg.items.filter(item => hpFraction < item.belowHp &&
    Number(item.weight ?? 1) > 0)
  if (!options.length || !chance(cfg.chance ?? 0)) return false
  const selected = pickWeighted(options, item => Number(item.weight ?? 1))
  const def = itemDefinition(selected.kind)
  if (!def?.effect) return false
  const effect = def.effect
  let amount = effect.fullHeal ? e.maxHp-e.hp :
    Math.max(1,Math.round(e.maxHp * (effect.maxHpFraction || 0)))
  if (!effect.fullHeal && selected.kind === 'herb') amount = Math.max(20,Math.min(50,amount))
  if (!effect.fullHeal && effect.consumableBonus)
    amount = Math.max(1,Math.round(amount * (cfg.bonusMultiplier ?? 1)))
  const healed = Math.min(e.maxHp-e.hp,amount)
  if (healed <= 0) return false
  e.hp += healed
  e.consumableHealUsed = true
  const verb = selected.kind === 'potion' ? 'drinks' : 'eats'
  log(`The ${e.name} ${verb} a ${def.name} and recovers ${healed} HP!`,'bad')
  spawnDamageNumber(e.x,e.y,`+${healed} HP`,'#81df98')
  return true
}

// Haste is movement-only: no strike can occur between or after its steps.
// Normal natural-speed pursuit remains a separate rule (max two actions).
function tryEnemyHaste(e, distance) {
  if (!enemyHasAbility(e,'haste') || turnCount < e.hasteReadyTurn ||
      !e.alive || e.hp <= 0 || distance < 3 || enemyIsPassive(e) ||
      enemyInsideSanctuary(e) || playerInsideSanctuary()) return false
  const step = enemyFindStep(e)
  if (!step) return false
  if (isClosedDungeonDoorTile(map[step.y]?.[step.x]) || isLockedDungeonDoorTile(map[step.y]?.[step.x])) return false
  if (!chance(HASTE_CHANCE)) return false
  const fromX=e.x, fromY=e.y
  if (!enemyStepTowardPlayer(e)) return false
  // Doors count as the action they require to open; do not bypass them.
  const moved = e.x !== fromX || e.y !== fromY
  e.hasteReadyTurn = turnCount + HASTE_COOLDOWN + 1
  if (moved && e.alive) {
    const midX=e.x, midY=e.y
    const remaining = Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))
    if (remaining > ATTACK_RANGE) {
      const next = enemyFindStep(e)
      if (next && !isClosedDungeonDoorTile(map[next.y]?.[next.x]) &&
          !isLockedDungeonDoorTile(map[next.y]?.[next.x])) enemyStepTowardPlayer(e)
    }
    if (e.alive && !replayAnimationsDisabled && (e.x !== midX || e.y !== midY)) {
      // Multiple tile moves are already resolved; only the presentation slides
      // tile-by-tile. No gameplay or RNG depends on this clock.
      e.animStart = undefined
      e.hasteAnim = {fromX,fromY,midX,midY,toX:e.x,toY:e.y,
        start:performance.now(), duration:MOVE_ANIM_MS*2}
    }
  }
  if (e.alive) {
    log(`The ${e.name} bursts forward with unnatural haste!`, 'bad')
    spawnDamageNumber(e.x,e.y,'Haste!','#f5cd63')
  }
  return true
}

// A successful nearby aura activation displays one readable event, rather than
// repeatedly announcing the same continuous buff on every turn.
function announceInspiredLeader(leader) {
  if (leader.prefix !== 'Champion' || !inspiredAllyCount(leader) || !enemyIsVisibleOnMainView(leader)) return
  log(`The ${leader.name} inspires its nearby allies! (+2 ATK, +1 DEF)`, 'bad')
  spawnDamageNumber(leader.x,leader.y,'Inspired!','#f4d176')
}
