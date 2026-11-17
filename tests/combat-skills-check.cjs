const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../src/combatSkills.js'), 'utf8')
const messages = []
const context = {
  player: {lvl:1, godMode:false, equip:{weapon:null, shield:null}},
  isWeaponItem: item => !!item && (item.kind === 'weapon' ||
    item.kind === 'artifact' && item.artifactSlot === 'weapon'),
  xpForEnemy: () => 150,
  log: msg => messages.push(msg),
  RANGED_CONFIG: {dodgeMultiplier:2}
}
// This standalone skill harness mocks the artifact registry. The combined
// artifact suite exercises the real shared lookup and terrain conditions.
context.artifactEquippedInSlot = (slot,id) => context.player.equip[slot]?.abilityId === id
context.artifactRule = (id,key) => ({shield_mastery:{blockBonus:.1},
  counterguard:{blockBonus:.15},tideguard:{blockBonus:.15}})[id]?.[key]
context.artifactWaterPosition = () => false
vm.createContext(context)
vm.runInContext(source, context)
const run = expression => vm.runInContext(expression, context)

context.player.combatSkills = run('freshCombatSkills()')
context.player.combatSkillXp = run('freshCombatSkills()')
for (const skill of ['oneHanded','twoHanded','shielding','marksmanship']) {
  assert.equal(run(`combatSkillLabel('${skill}')`), '0 / 100',
    'the character sheet should not expose hidden XP counters')
  assert.match(run(`combatSkillDescription('${skill}')`), /Train by/,
    'the skill explanation should tell the player how to improve it')
  assert.match(run(`combatSkillDescription('${skill}')`), /up to/,
    'the skill explanation should identify the maximum benefit')
}
const sword = {kind:'weapon',twoHanded:false,base:'Scimitar'}
const hammer = {kind:'artifact',artifactSlot:'weapon',twoHanded:true,base:'War Hammer'}
const bow = {kind:'weapon',twoHanded:true,rangedAtk:5,base:'Short Bow'}
context.player.equip.weapon = sword
assert.equal(run('meleeCombatSkill(player.equip.weapon)'), 'oneHanded')
context.player.equip.weapon = hammer
assert.equal(run('meleeCombatSkill(player.equip.weapon)'), 'twoHanded')
context.player.equip.weapon = bow
assert.equal(run('meleeCombatSkill(player.equip.weapon)'), null, 'a bow does not train two-handed melee')
context.player.equip.weapon = null
assert.equal(run('meleeCombatSkill(player.equip.weapon)'), null, 'bare hands train neither category')

context.player.combatSkills.oneHanded = 100
context.player.combatSkills.twoHanded = 100
context.player.combatSkills.marksmanship = 100
context.player.combatSkills.shielding = 100
for (const skill of ['oneHanded','twoHanded','shielding','marksmanship']) {
  assert.equal(run(`combatSkillLabel('${skill}')`), '100 / 100')
}
assert.match(run("combatSkillDescription('oneHanded')"), /5 fewer percentage points/)
assert.match(run("combatSkillDescription('twoHanded')"), /25% of enemy DEF/)
assert.match(run("combatSkillDescription('shielding')"), /20% chance to block/)
assert.match(run("combatSkillDescription('marksmanship')"), /25% fewer misses/)
context.player.equip.weapon = sword
assert.equal(run('oneHandedMissReduction()'), 0.05)
context.player.equip.weapon = hammer
assert.equal(run('oneHandedMissReduction()'), 0)
assert.equal(run('twoHandedDefence(20)'), 15)
context.player.equip.weapon = bow
assert.equal(run('twoHandedDefence(20)'), 20)
assert(Math.abs(run('marksmanshipMissChance(0.15)') - 0.225) < 1e-10)
assert.equal(run('shieldingBlockChance()'), 0)
context.player.equip.shield = {kind:'shield',base:'Buckler'}
assert.equal(run('shieldingBlockChance()'), 0.20)
context.player.equip.shield.abilityId = 'shield_mastery'
assert(Math.abs(run('shieldingBlockChance()')-.30)<1e-10)
context.player.equip.shield.abilityId = 'counterguard'
assert.equal(run('shieldingBlockChance({equipment:{kind:"weapon"}})'),.35)
assert.equal(run('shieldingBlockChance({equipment:null})'),.20)
context.player.equip.shield.abilityId = null

context.player.combatSkills = run('freshCombatSkills()')
context.player.combatSkillXp = run('freshCombatSkills()')
const enemy = {alive:true, tier:4}
context.enemy = enemy
for (let n = 0; n < 3; n++) assert.equal(run("trainCombatSkill('oneHanded',enemy)"), true)
assert.equal(enemy.combatSkillXp.oneHanded, 6, 'dangerous opponent grants two XP per hit, up to its budget')
assert.equal(context.player.combatSkills.oneHanded, 2, 'three 2-XP hits raise proficiency by two')
assert.equal(context.player.combatSkillXp.oneHanded, 0)
for (let n = 0; n < 10; n++) assert.equal(run("trainCombatSkill('oneHanded',enemy)"), false)
assert.equal(context.player.combatSkills.oneHanded, 2, 'same enemy cannot be farmed further')
assert.deepEqual(messages, ['One-Handed proficiency reaches 1.'])

// The persistent per-enemy budget must survive the same JSON serialization
// used by current-format saves and replay initial snapshots.
context.enemy = JSON.parse(JSON.stringify(enemy))
assert.equal(run("trainCombatSkill('oneHanded',enemy)"), false)
context.player.lvl = 25
context.enemy = {alive:true,tier:4}
assert.equal(run("trainCombatSkill('marksmanship',enemy)"), false,
  'high-level characters do not train on substantially weaker enemies')
context.enemy = {alive:true,tier:5}
assert.equal(run("trainCombatSkill('marksmanship',enemy,0)"), false,
  'zero damage gives no offensive training')
context.player.godMode = true
assert.equal(run("trainCombatSkill('marksmanship',enemy)"), false,
  'God Mode does not train combat')

console.log('PASS combat skill labels, explanations, effects, XP caps, save state and anti-grinding')
