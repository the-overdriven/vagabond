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

test('artifact noun catalog uses every gear base, including Short Bow', async () => {
  await ready()
  const gear = Object.values(catalogs).flat()
  for (const base of gear) {
    assert.ok(!nouns.includes(base.name), `gear noun duplicated: ${base.name}`)
    const possible = run(`([...ARTIFACT_NOUNS, ...[...WEAPONS,...SHIELDS,...ARMORS].filter(i=>i.tier<=${base.tier}).map(i=>i.name)]).includes(${JSON.stringify(base.name)})`)
    assert.ok(possible, `${base.name} must automatically be eligible at its tier`)
  }
  assert.ok(!run('ARTIFACT_NOUNS.includes("Brigandine")'))
  assert.ok(run('[...ARTIFACT_NOUNS, ...WEAPONS.map(i=>i.name)].includes("Short Bow")'),
    'Short Bow is an eligible artifact weapon base')
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
        if (base.rangedAtk) {
          assert.equal(item.rangedAtk, base.rangedAtk, `${base.name} keeps ranged ATK`)
          assert.equal(item.rangedRange, base.rangedRange, `${base.name} keeps ranged range`)
        }
      } else assert.equal(item.def, base.def)
      if (slot === 'armor') {
        assert.equal(item.speedPenalty, base.speedPenalty || 0)
        assert.equal(item.gracePenalty || 0, base.gracePenalty || 0)
      }
    }
  }
})

test('artifact Short Bow fires at fixed bow damage and consumes ammunition', async () => {
  await ready()
  const bow = artifact('Short Bow', 3)
  assert.equal(bow.kind, 'artifact')
  assert.equal(bow.artifactSlot, 'weapon')
  assert.equal(bow.rangedAtk, 5)
  assert.equal(bow.rangedRange, 6)
  run(`(() => {
    window.artBowOriginal={chance,damageRoll,enemyTurn,npcTurn,log}
    replayAnimationsDisabled=true;currentZ=0;currentCave=-1;map=surfaceMap
    enemies=[];npcs=[];groundItems=[];occupied=new Set()
    player.x=40;player.y=40;player.godMode=false;player.invisibleTurns=0
    player.equip={weapon:${JSON.stringify(bow)},armor:null,shield:null}
    player.inventory=[createItem('arrows',{count:2})]
    for(let y=37;y<=43;y++)for(let x=37;x<=47;x++){
      map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
    }
    const t=ENEMY_TEMPLATE_BY_NAME.Goblin
    window.artBowTarget=addEnemy({...t,id:'artifact-bow-target',name:'Goblin',baseName:'Goblin',
      x:44,y:40,level:0,alive:true,hp:100,maxHp:100,
      equipment:null,shooterAbility:null,shotsRemaining:0})
    occupied.add(keyXY(44,40))
    chance=()=>false;damageRoll=atk=>atk;enemyTurn=()=>{};npcTurn=()=>{};log=()=>{}
  })()`)
  try {
    assert.equal(run('equippedShortBow()?.kind'),'artifact')
    assert.equal(run('shootEnemy(artBowTarget)'),true)
    assert.equal(run('artBowTarget.hp'),95,'artifact bonuses do not increase fixed projectile damage')
    assert.equal(run('player.inventory.find(i=>i.kind==="arrows")?.count'),1)
  } finally {
    run('chance=artBowOriginal.chance;damageRoll=artBowOriginal.damageRoll;enemyTurn=artBowOriginal.enemyTurn;npcTurn=artBowOriginal.npcTurn;log=artBowOriginal.log')
  }
})

test('non-gear artifacts keep The, equipment artifacts do not', async () => {
  await ready()
  const amulet = artifact('Amulet', 3)
  assert.equal(run(`visibleItemTier(${JSON.stringify(amulet)})`),null,
    'unidentified artifacts cannot leak their tier through display colors')
  assert.equal(run(`visibleItemTierTag(${JSON.stringify(amulet)})`),'',
    'unidentified artifacts cannot leak a [T3] inventory label')
  amulet.identified = true
  assert.equal(run(`visibleItemTier(${JSON.stringify(amulet)})`),3,
    'identification reveals the tier again')
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

test('unidentified artifact gear can be equipped without exposing its secret identity', async () => {
  await ready()
  run(`player.equip={weapon:null,shield:null,armor:null,blackkey:null};player.inventory=[];
    currentZ=0;currentCave=-1;map=surfaceMap;enemies=[];npcs=[];
    unknownGear={kind:'artifact',noun:'Dagger',name:'Dagger of Durvak',artifactSlot:'weapon',
      base:'Dagger',atk:7,grace:3,bonuses:{atk:5},curse:{everyTurns:8,types:['hp']},curseTimer:0,
      identified:false,tier:4,twoHanded:false};
    player.inventory.push(unknownGear);
    consumeItemTurn=()=>{};log=()=>{}`)
  const before=run('playerAtk()')
  run("invTab='weapon'")
  assert.equal(run('filterVisibleInventory().length'),1,'unknown weapon is accessible from its equipment tab')
  run('equipItem(0)')
  assert.equal(run('player.equip.weapon.identified'),false,'equipping does not identify')
  assert.equal(run('playerAtk()-' + before),12,'hidden base ATK and bonus both apply')
  assert.equal(run('artifactDisplayName(player.equip.weapon)'),'Unidentified Dagger')
  assert.equal(run('itemStatLine(player.equip.weapon)'),'???')
  assert.equal(run('player.equip.weapon.curse.everyTurns'),8,'curse remains active and unidentified')
  const snapshot=clone(run('buildSaveObject()'))
  run(`loadGameFromObject(${JSON.stringify(snapshot)}, {isReplayInit:true})`)
  assert.equal(run('player.equip.weapon.identified'),false,'save/replay initialization keeps identity hidden')
  assert.equal(run('player.equip.weapon.name'),'Dagger of Durvak','true name remains stored but hidden')
})

test('unidentified equipment never leaks its true name in combat logs; artifact weapons hit ghosts', async () => {
  await ready()
  run(`(() => {
    replayAnimationsDisabled=true;currentZ=0;currentCave=-1;map=surfaceMap
    enemies=[];npcs=[];occupied=new Set();player.x=40;player.y=40;player.hp=1000
    map[40][40]='grass';map[40][41]='grass';player.godMode=false
    player.equip={weapon:null,armor:null,shield:null};player.inventory=[]
    window.testCombatMessages=[];log=msg=>window.testCombatMessages.push(msg)
    chance=()=>false;damageRoll=()=>7;consumeItemTurn=()=>{}
    const ghostTemplate=ENEMY_TEMPLATE_BY_NAME.Ghost
    window.testGhost=addEnemy({...ghostTemplate,id:'unknown-gear-ghost',baseName:'Ghost',name:'Ghost',
      x:41,y:40,level:0,alive:true,hp:100,maxHp:100,equipment:null})
    occupied.add(keyXY(41,40))
    window.testUnknownWeapon={kind:'artifact',artifactSlot:'weapon',name:'Dagger of Secret Flames',
      noun:'Dagger',base:'Dagger',identified:false,atk:8,grace:3,twoHanded:false}
    window.testUnknownArmor={kind:'artifact',artifactSlot:'armor',name:'Mail of Secret Flames',
      noun:'Mail',base:'Mail',identified:false,def:8,speedPenalty:0}
    window.testUnknownShield={kind:'artifact',artifactSlot:'shield',name:'Buckler of Secret Flames',
      noun:'Buckler',base:'Buckler',identified:false,def:4}
    player.inventory.push(testUnknownWeapon,testUnknownArmor,testUnknownShield)
    equipItem(0);equipItem(0);equipItem(0)
  })()`)
  assert.equal(run('player.equip.weapon?.kind'),'artifact')
  assert.equal(run('player.equip.armor?.kind'),'artifact')
  assert.equal(run('player.equip.shield?.kind'),'artifact')
  await run('playerAttackEnemy(testGhost)')
  assert.equal(run('testGhost.hp'),93,'an unprefixed artifact weapon damages an ethereal Ghost')
  const messages = run('window.testCombatMessages.join(" | ")')
  assert.match(messages,/Unidentified Dagger/)
  assert.match(messages,/Unidentified Mail/)
  assert.match(messages,/Unidentified Buckler/)
  assert.doesNotMatch(messages,/Secret Flames|of Secret/i,'actual equipment names stay secret')
  run(`player.equip.weapon={kind:'weapon',name:'Dagger',base:'Dagger',atk:4,grace:3}`)
  await run('playerAttackEnemy(testGhost)')
  assert.equal(run('testGhost.hp'),93,'a mundane unmodified weapon cannot harm the Ghost')
  run(`(() => {
    player.equip.weapon=testUnknownWeapon;player.equip.shield=null;player.equip.armor=null
    testGhost.abilities=['disarm'];testGhost.sleeping=false
    testGhost.aware=true;testGhost.summonedTurn=-1
    chance=()=>true;testCombatMessages.length=0
  })()`)
  assert.equal(run('tryEnemySpell(testGhost)'),true,'caster disarms an unknown artifact weapon')
  const disarmLog=run('window.testCombatMessages.join(" | ")')
  assert.match(disarmLog,/Unidentified Dagger/)
  assert.doesNotMatch(disarmLog,/Secret Flames/,'disarming also preserves hidden equipment names')
})
