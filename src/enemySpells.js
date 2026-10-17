'use strict'

// Any template can opt into these independent abilities. The AI gives the whole
// eligible spell pool one seeded cast roll, never one roll per known spell.
const ENEMY_SPELL_CHANCE = 0.20
const ENEMY_DEBUFF_TURNS = 5
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

function availableEnemySpells(e) {
  const spells = []
  if (enemyHasAbility(e, 'weaken') && player.weakenTurns <= 0) spells.push('weaken')
  if (enemyHasAbility(e, 'slow') && player.slowTurns <= 0) spells.push('slow')
  if (enemyHasAbility(e, 'disarm') && playerDisarmSlots().length) spells.push('disarm')
  if (enemyHasAbility(e, 'dispel') && playerDispelTargets().length) spells.push('dispel')
  return spells
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
  // No spell/RNG attempt for a dispeller without a buff, or a disarmer without gear.
  if (!spells.length || !chance(ENEMY_SPELL_CHANCE)) return false
  const spell = pick(spells)
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
    equipmentLog(`The ${e.name} disarms you! Your ${item.name} is sent to your inventory.${statDeltaText(before)}`, [item], 'bad')
    spawnDamageNumber(player.x, player.y, 'Disarmed!', '#c7a5f6')
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
