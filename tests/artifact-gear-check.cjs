// Run: node --test tests/artifact-gear-check.cjs
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {run} = require('./helpers/node-game-runtime.cjs')
const root = path.resolve(__dirname, '..')
const loadJson = name => JSON.parse(fs.readFileSync(path.join(root, 'content', name), 'utf8'))
const catalogs = {weapon: loadJson('gear_weapons.json'), shield: loadJson('gear_shields.json'), armor: loadJson('gear_armors.json')}
const nouns = loadJson('artifact_nouns.json')
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/saves/Tester_start.json'), 'utf8'))
const clone = obj => JSON.parse(JSON.stringify(obj))

async function ready() {
  await run('loadContent()')
  run(`loadGameFromObject(${JSON.stringify(fixture)}, {isReplayInit:true})`)
}
function artifact(base, tier) {
  // Select the requested noun and effect tier without changing the generator's rules.
  return clone(run(`(() => {
    const savedPick = pick, savedRng = rng
    try {
      rng = () => .9
      pick = list => {
        if (list.includes(${JSON.stringify(base)})) return ${JSON.stringify(base)}
        const effect = list.find(value => typeof value === 'object' && value.id && value.tier === ${tier})
        return effect || savedPick(list)
      }
      return makeArtifactItem(${tier})
    } finally {pick = savedPick; rng = savedRng}
  })()`))
}

test('artifact noun catalog deduplicates gear and automatically uses all eligible bases', async () => {
  await ready()
  const gear = Object.values(catalogs).flat()
  for (const base of gear) {
    assert.ok(!nouns.includes(base.name), `gear noun duplicated: ${base.name}`)
    const possible = run(`([...ARTIFACT_NOUNS, ...[...WEAPONS,...SHIELDS,...ARMORS].filter(i=>i.tier<=${base.tier}).map(i=>i.name)]).includes(${JSON.stringify(base.name)})`)
    assert.ok(possible, `${base.name} must automatically be eligible at its tier`)
  }
  assert.ok(!run('ARTIFACT_NOUNS.includes("Brigandine")'))
  assert.notEqual(artifact('Titan Warpick', 3).base, 'Titan Warpick', 'tier-3 artifact must not pick a tier-5 base')
})

test('generated artifacts inherit the stats of every available gear base', async () => {
  await ready()
  for (const [slot, gear] of Object.entries(catalogs)) {
    for (const base of gear) {
      const item = artifact(base.name, Math.max(3, base.tier))
      assert.equal(item.kind, 'artifact')
      assert.equal(item.noun, base.name)
      assert.equal(item.artifactSlot, slot)
      assert.equal(item.base, base.name)
      assert(!/^The\s/i.test(item.name), 'generated artifact names omit the leading article')
      assert(run(`itemIconHTML(${JSON.stringify(item)})`).includes('img/icons/' + base.name + '.svg'),
        `artifact ${base.name} uses its specific gear SVG`)
      assert.equal(item.tier, Math.max(3, base.tier))
      if (slot === 'weapon') {
        assert.equal(item.atk, base.atk)
        assert.equal(item.grace, base.grace)
        assert.equal(item.twoHanded, base.twoHanded)
      } else assert.equal(item.def, base.def)
      if (slot === 'armor') {
        assert.equal(item.speedPenalty, base.speedPenalty || 0)
        assert.equal(item.gracePenalty || 0, base.gracePenalty || 0)
      }
    }
  }
})

test('non-gear artifacts keep The, equipment artifacts do not', async () => {
  await ready()
  const amulet = artifact('Amulet', 3)
  const hauberk = artifact('Hauberk', 3)
  assert.match(amulet.name, /^The Amulet of /)
  assert.doesNotMatch(hauberk.name, /^The\s/)
  assert.equal(amulet.artifactSlot, 'trinket')
  assert.equal(hauberk.artifactSlot, 'armor')
  const cursed = clone(run(`(() => {
    const savedPick = pick, savedRng = rng
    try {
      rng=()=>0
      pick=list => list.includes('Amulet') ? 'Amulet' : savedPick(list)
      return makeArtifactItem(3)
    } finally {pick=savedPick;rng=savedRng}
  })()`))
  assert.match(cursed.name, /^The /, 'cursed non-gear artifacts keep The as well')
  assert(cursed.curse, 'cursed non-gear artifact retains its curse')
})

test('non-equipment artifacts retain the generic icon', async () => {
  await ready()
  const icon = run('itemIconHTML({kind:"artifact",artifactSlot:"trinket",noun:"Amulet",name:"Amulet of Ermis"})')
  assert(icon.includes('img/icons/artifact.svg'))
  assert(!icon.includes('img/icons/Amulet.svg'))
})

test('artifact base stats and enchantments stack; penalties, GRACE, inventory and save/load work', async () => {
  await ready()
  const brigandine = artifact('Brigandine', 3)
  brigandine.identified = true
  brigandine.bonuses = {def:4, atk:2, spd:3}
  const normal = {kind:'armor', base:'Brigandine', def:12, speedPenalty:2}
  run(`player.inventory=[]; player.equip={weapon:null,shield:null,armor:null}`)
  const baseline = run('playerPermanentStats()')
  run(`player.equip.armor=${JSON.stringify(normal)}`)
  const normalStats = run('playerPermanentStats()')
  run(`player.equip.armor=${JSON.stringify(brigandine)}`)
  const artifactStats = run('playerPermanentStats()')
  assert.equal(artifactStats.def - baseline.def, 16)
  assert.equal(artifactStats.def - normalStats.def, 4)
  assert.equal(artifactStats.atk - normalStats.atk, 2)
  assert.equal(artifactStats.spd - normalStats.spd, 3, 'artifact SPD bonus adds to base armor penalty')
  assert.equal(artifactStats.grace, normalStats.grace)
  assert.match(run('itemStatLine(player.equip.armor)'), /DEF 12/)
  assert.match(run('itemStatLine(player.equip.armor)'), /DEF \+4/)
  assert.match(run('itemStatLine(player.equip.armor)'), /SPD -2/)
  const saved = clone(run('buildSaveObject()'))
  run(`loadGameFromObject(${JSON.stringify(saved)}, {isReplayInit:true})`)
  assert.deepEqual(clone(run('player.equip.armor')), brigandine)
  assert.deepEqual(clone(run('playerPermanentStats()')), clone(artifactStats))

  const hauberk = artifact('Hauberk',3); hauberk.identified = true
  assert.match(run(`itemStatLine(${JSON.stringify(hauberk)})`), /SPD -3/)
  assert.match(run(`itemStatLine(${JSON.stringify(hauberk)})`), /GRACE -1/)

  const buckler = artifact('Buckler',3); buckler.identified = true
  const tower = artifact('Tower Shield',4); tower.identified = true
  run(`player.equip.armor=null; player.equip.weapon=${JSON.stringify(artifact('Dagger', 3))}; player.equip.shield=${JSON.stringify(buckler)}`)
  const bucklerStats = run('playerPermanentStats()')
  run(`player.equip.shield=${JSON.stringify(tower)}`)
  const towerStats = run('playerPermanentStats()')
  assert.equal(bucklerStats.spd - towerStats.spd, 1)
  assert.equal(bucklerStats.grace - towerStats.grace, 1)
  assert.match(run('itemStatLine(player.equip.shield)'), /GRACE -1/)

  const dagger = artifact('Dagger',3); dagger.identified = true
  const sword = artifact('Two-handed Sword',4); sword.identified = true
  run(`player.equip.shield=null; player.equip.weapon=${JSON.stringify(dagger)}`)
  assert.equal(run('weaponGrace(player.equip.weapon)'), catalogs.weapon[0].grace)
  assert.ok(Number.isFinite(run('combatDelay(player.equip.weapon, true)')))
  assert.equal(sword.twoHanded, true)
  assert.equal(dagger.twoHanded, false)
  run(`player.inventory=[${JSON.stringify(sword)},${JSON.stringify(tower)}]`)
  assert.equal(run('filterVisibleInventory().length'), 2)
  run("invTab='weapon'")
  assert.equal(run('filterVisibleInventory().length'), 1)
  run("invTab='shield'")
  assert.equal(run('filterVisibleInventory().length'), 1)
})
