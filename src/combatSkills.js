'use strict'

// Proficiency is independent of character XP and the GRACE action timer.
// Every combat action trains at most one skill, with progress capped per enemy.
const COMBAT_SKILL_NAMES = Object.freeze({
  oneHanded: 'One-Handed',
  twoHanded: 'Two-Handed',
  shielding: 'Shielding',
  marksmanship: 'Marksmanship'
})
const COMBAT_SKILL_MAX = 100

function freshCombatSkills() {
  return Object.fromEntries(Object.keys(COMBAT_SKILL_NAMES).map(key => [key, 0]))
}

function combatSkillValue(key) {
  return player.combatSkills[key]
}

function combatSkillCost(key) {
  const skill = combatSkillValue(key)
  return skill >= COMBAT_SKILL_MAX ? 0 : 3 * (1 + Math.floor(skill / 25))
}

function combatSkillLabel(key) {
  return `${combatSkillValue(key)} / ${COMBAT_SKILL_MAX}`
}

function combatSkillDescription(key) {
  const skill = combatSkillValue(key)
  const percent = amount => Number(amount.toFixed(2))
  const details = {
    oneHanded: [
      `Your one-handed melee attacks have ${percent(skill * 0.05)} fewer percentage points of miss chance (up to 5).`,
      'Train by damaging enemies with one-handed melee weapons. Unarmed attacks and bows do not count.'
    ],
    twoHanded: [
      `Your two-handed melee attacks ignore ${percent(skill * 0.25)}% of enemy DEF (up to 25%).`,
      'Train by damaging enemies with two-handed melee weapons. Bows do not count.'
    ],
    shielding: [
      `With a shield equipped, you have a ${percent(skill * 0.2)}% chance to block a landed melee hit (up to 20%). Blocks cut damage to one-third and prevent critical damage.`,
      'Train by receiving melee hits while carrying a shield. Misses, arrows and spells do not count.'
    ],
    marksmanship: [
      `Your bows have ${percent(skill * 0.25)}% fewer misses compared with an untrained archer (up to 25%).`,
      'Train by damaging enemies with arrows from any bow.'
    ]
  }
  return [...details[key]].join('\n')
}

// Bows are two-handed items but have their own ranged proficiency. A bow
// swung in melee deliberately trains neither melee category.
function meleeCombatSkill(weapon) {
  if (!isWeaponItem(weapon) || weapon.rangedAtk || weapon.base === 'Short Bow') return null
  return weapon.twoHanded ? 'twoHanded' : 'oneHanded'
}

function oneHandedMissReduction() {
  return meleeCombatSkill(player.equip.weapon) === 'oneHanded'
    ? 0.05 * combatSkillValue('oneHanded') / COMBAT_SKILL_MAX : 0
}

function twoHandedDefence(defence) {
  return meleeCombatSkill(player.equip.weapon) === 'twoHanded'
    ? defence * (1 - 0.25 * combatSkillValue('twoHanded') / COMBAT_SKILL_MAX) : defence
}

function marksmanshipMissChance(normalMissChance) {
  return Math.min(1, normalMissChance * Math.max(1,
    RANGED_CONFIG.dodgeMultiplier - 0.5 * combatSkillValue('marksmanship') / COMBAT_SKILL_MAX))
}

function shieldingBlockChance() {
  return player.equip.shield ? 0.20 * combatSkillValue('shielding') / COMBAT_SKILL_MAX : 0
}

function combatTrainingMinTier() {
  return Math.max(1, Math.min(5, Math.floor(player.lvl / 5)))
}

function trainCombatSkill(key, e, damage = 1) {
  if (!Object.hasOwn(COMBAT_SKILL_NAMES, key) || !e?.alive || damage <= 0 ||
      player.godMode || combatSkillValue(key) >= COMBAT_SKILL_MAX) return false
  const tier = Number(e.tier) || 1
  const minimumTier = combatTrainingMinTier()
  if (tier < minimumTier) return false
  const maxFromEnemy = Math.max(2, Math.min(6, Math.ceil(xpForEnemy(e) / 25)))
  const trained = e.combatSkillXp || (e.combatSkillXp = {})
  const received = trained[key] || 0
  const award = Math.min(maxFromEnemy - received, tier >= minimumTier + 2 ? 2 : 1)
  if (award <= 0) return false
  trained[key] = received + award
  player.combatSkillXp[key] += award
  while (combatSkillValue(key) < COMBAT_SKILL_MAX && player.combatSkillXp[key] >= combatSkillCost(key)) {
    player.combatSkillXp[key] -= combatSkillCost(key)
    player.combatSkills[key]++
    const skill = combatSkillValue(key)
    if (skill === 1 || skill % 25 === 0)
      log(`${COMBAT_SKILL_NAMES[key]} proficiency reaches ${skill}.`, 'good')
  }
  if (combatSkillValue(key) === COMBAT_SKILL_MAX) player.combatSkillXp[key] = 0
  return true
}
