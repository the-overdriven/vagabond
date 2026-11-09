// Run: node tests/highscores-ranking-check.cjs
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.join(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const context = vm.createContext({})
vm.runInContext(fs.readFileSync(path.join(root, 'src/highscores.js'), 'utf8') +
  '\nglobalThis.rules = Highscores', context)
const rules = context.rules

// Extract actual game functions, not copies of their implementations.
function gameFunction(name) {
  const start = html.indexOf(`  function ${name}(`)
  assert.notEqual(start, -1, `missing game function ${name}`)
  const end = html.indexOf('\n  }', start)
  return html.slice(start, end + 4)
}

function statsFixture() {
  const player = {x:0, y:0, lvl:10, race:'elf', baseAtk:2, baseDef:0, baseSpd:3,
    speedPotionTurns:0, speedPotionBonus:0, curseDebuffs:[], inventory:[],
    equip:{weapon:{kind:'weapon', base:'Sword', atk:4.25, grace:3.5},
      shield:{kind:'shield', base:'Kite Shield', def:2.5, mod:'spd', modAmt:0.5},
      armor:{kind:'armor', base:'Hauberk', def:9, speedPenalty:3}}}
  const ctx = vm.createContext({player,
    DEFAULT_RACE:'human', RACES:JSON.parse(fs.readFileSync(path.join(root, 'content/races.json'))),
    ARMORS:JSON.parse(fs.readFileSync(path.join(root, 'content/gear_armors.json'))),
    map:[['grass']], TERRAIN_DEFENSE:{hill:1}, TERRAIN_SPEED:{snow:-1,hill:-1}, tileUnderlays:{},
    keyXY:(x,y)=>`${x},${y}`, itemDefinition:kind=>({carryStats:kind==='bigbell'?{spd:-2}:{}}),
    rng:()=>{throw new Error('ranking must not consume RNG')},
    Math:Object.assign(Object.create(Math), {random:()=>{throw new Error('no random ranking')}})})
  const functions = ['raceDef','raceBonus','raceHas','raceGrace','isWeaponItem','weaponGrace','armorGracePenalty',
    'gearGracePenalty','playerGracePenalty','levelGrace','playerGraceBonus','playerGrace',
    'forEachActiveArtifact','artifactBonusSum','curseDebuffSum','carriedItemStat',
    'playerTerrainEffects','playerAtk','playerDef','playerSpdRaw','playerSpd',
    'playerEffectiveTerrainStatChanges','playerPermanentStats']
  vm.runInContext(functions.map(gameFunction).join('\n'), ctx)
  return ctx
}

function plain(value) { return JSON.parse(JSON.stringify(value)) }

test('permanent snapshot keeps fractional equipment, racial/level bonuses and penalties', () => {
  const ctx = statsFixture()
  // SPD = 3 + 5 - 2 - 3 + .5; GRACE = 3.5 + 2 + 2 - 1 - 1.
  assert.deepEqual(plain(ctx.playerPermanentStats()), {atk:6.25,def:11.5,spd:3.5,grace:5.5})
  assert.equal(rules.strength(ctx.playerPermanentStats()), 26.75)
  ctx.player.race = 'catling'
  assert.equal(ctx.playerPermanentStats().spd, 8.5)
  ctx.player.race = 'orc'
  assert.equal(ctx.playerPermanentStats().atk, 11.25)
  ctx.player.race = 'dwarf'
  assert.equal(ctx.playerPermanentStats().def, 16.5)
})

test('transient terrain, curses, potion and bell affect live stats but not ranking', () => {
  const ctx = statsFixture()
  const expected = plain(ctx.playerPermanentStats())
  const before = JSON.stringify(ctx.player)
  ctx.playerPermanentStats()
  assert.equal(JSON.stringify(ctx.player), before, 'snapshot must not mutate character state')
  ctx.player.speedPotionTurns = 5; ctx.player.speedPotionBonus = 4
  ctx.player.curseDebuffs = [{stat:'atk',amt:-2},{stat:'def',amt:-3},{stat:'spd',amt:-1}]
  ctx.player.inventory.push({kind:'bigbell'})
  for (const tile of ['hill','snow','frozenriver','river']) {
    ctx.map[0][0] = tile; ctx.tileUnderlays['0,0'] = 'snow'
    assert.deepEqual(plain(ctx.playerPermanentStats()), expected)
    assert.equal(ctx.playerAtk(), 4.25)
    assert.equal(ctx.playerDef(), tile === 'hill' ? 9.5 : 8.5)
    assert.equal(ctx.playerSpd(), ['hill','snow','frozenriver','river'].includes(tile) ? 3.5 : 4.5)
  }
})

test('terrain highlighting reads effective changes, including cold river penalties', () => {
  const tileRules = JSON.parse(fs.readFileSync(path.join(root, 'content/tiles.json')))
  assert.equal(tileRules.terrainSpeed.grass ?? 0, 0, 'grass has no speed bonus')
  assert.equal(tileRules.terrainSpeed.hill, -1, 'hills reduce speed by one')
  assert.equal(tileRules.terrainDefense.hill, 1, 'hills still add one defense')
  const ctx = statsFixture()
  ctx.map[0][0] = 'hill'
  assert.deepEqual(plain(ctx.playerEffectiveTerrainStatChanges()), {defense:1,speed:-1})
  ctx.map[0][0] = 'snow'
  assert.deepEqual(plain(ctx.playerEffectiveTerrainStatChanges()), {defense:0,speed:-1})
  ctx.map[0][0] = 'river'; ctx.tileUnderlays['0,0'] = 'snow'
  assert.deepEqual(plain(ctx.playerEffectiveTerrainStatChanges()), {defense:0,speed:-1})
  ctx.map[0][0] = 'grass'
  assert.deepEqual(plain(ctx.playerEffectiveTerrainStatChanges()), {defense:0,speed:0})
  ctx.player.lvl = 1; ctx.player.race = 'human'; ctx.player.baseSpd = 0
  ctx.player.equip.shield = null; ctx.player.equip.armor = null
  ctx.map[0][0] = 'snow'
  assert.equal(ctx.playerSpd(), 1)
  assert.equal(ctx.playerEffectiveTerrainStatChanges().speed, 0, 'clamped speed is not falsely marked as reduced')

  ctx.TERRAIN_SPEED.river = -2; ctx.TERRAIN_SPEED.water = -2
  ctx.player.baseSpd = 5
  const terrainSpeedFor = (race, tile, snowy = false) => {
    ctx.player.race = race
    ctx.map[0][0] = tile
    if (snowy) ctx.tileUnderlays['0,0'] = 'snow'
    else delete ctx.tileUnderlays['0,0']
    return ctx.playerTerrainEffects().speed
  }
  assert.equal(terrainSpeedFor('human', 'river'), -2)
  assert.equal(terrainSpeedFor('human', 'water'), -2)
  assert.equal(terrainSpeedFor('human', 'river', true), -3)
  assert.equal(terrainSpeedFor('merling', 'river'), 0)
  assert.equal(terrainSpeedFor('merling', 'water'), 0)
  assert.equal(terrainSpeedFor('merling', 'river', true), -1)
  assert.equal(terrainSpeedFor('merling', 'frozenriver'), -1)
  assert.equal(ctx.playerEffectiveTerrainStatChanges().speed, -1, 'cold-river penalty remains visible to Merlings')
})

test('only active artifact bonuses used by combat contribute, without mutation', () => {
  const ctx = statsFixture()
  ctx.player.inventory = [
    {kind:'artifact',artifactSlot:'trinket',bonuses:{atk:1.5,def:2.25,mf:999,hp:999,spd:99}},
    {kind:'artifact',artifactSlot:'weapon',bonuses:{atk:1000,def:1000}}]
  ctx.player.equip.weapon = {kind:'artifact',artifactSlot:'weapon',bonuses:{atk:2.5,def:0.25}}
  const before = JSON.stringify(ctx.player)
  // Legacy artifact fixtures have no weapon GRACE; an active trinket SPD
  // enchantment must also contribute to the permanent strength score.
  assert.deepEqual(plain(ctx.playerPermanentStats()), {atk:6,def:14,spd:102.5,grace:2})
  assert.equal(JSON.stringify(ctx.player), before)
})

test('SPD and GRACE retain live minimums; buckler and heavy armor differ', () => {
  const ctx = statsFixture()
  ctx.player.lvl = 1; ctx.player.race = 'human'; ctx.player.baseSpd = 0
  ctx.player.equip.weapon = {kind:'weapon',grace:1,mod:'grace',modAmt:0.25}
  assert.equal(ctx.playerPermanentStats().spd, 1)
  assert.equal(ctx.playerPermanentStats().grace, 0)
  ctx.player.equip.shield = {kind:'shield',base:'Buckler'}
  assert.equal(ctx.playerPermanentStats().grace, 0.25)
  ctx.player.equip.armor = null
  assert.equal(ctx.playerPermanentStats().grace, 1.25)
})

test('invalid or non-finite permanent stats do not become a score', () => {
  for (const bad of [undefined, null, NaN, Infinity, -Infinity, '4']) {
    assert.equal(rules.strength({atk:bad,def:0,spd:1,grace:0}), null)
  }
  assert.equal(rules.strength({atk:1e308,def:1e308,spd:1,grace:0}), null)
  assert.equal(rules.strength({atk:-1,def:0,spd:1,grace:0}), 0)
})

function row(id, level, strength, permadeath = false, created_at = '2026-10-15T12:00:00.000001+00:00') {
  return {id,character_id:id,level,strength,permadeath,created_at}
}

test('ranking is level first, then exact strength, then microsecond timestamp and ID', () => {
  const rows = [row('b',5,20),row('c',6,1),row('d',5,20.01),
    row('a',5,20),row('e',5,20,false,'2026-10-15T12:00:00.000002+00:00')]
  assert.deepEqual(rows.sort(rules.compare).map(r=>r.id), ['c','d','a','b','e'])
})

test('eligibility distinguishes full/partial/unknown boards and keeps modes independent', () => {
  const board = Array.from({length:10}, (_,i)=>row(`r${i}`,5,100-i))
  assert.equal(rules.eligible(row('new',2,1), null), true)
  assert.equal(rules.eligible(row('new',2,1), []), true)
  assert.equal(rules.eligible(row('new',2,1), board.slice(0,9)), true)
  assert.equal(rules.eligible(row('new',4,999), board), false)
  assert.equal(rules.eligible(row('new',5,91), board), false)
  assert.equal(rules.eligible(row('new',5,91.01), board), true)
  assert.equal(rules.eligible(row('new',6,1), board), true)
  assert.equal(rules.eligible(row('new',2,1,true), board), true)
  assert.equal(rules.eligible(row('new',1,999), null), false)
  assert.equal(rules.eligible(row('new',2,NaN), null), false)
  assert.equal(rules.eligible({...row('new',2,1),permadeath:null}, null), false)
})
