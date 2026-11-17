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

test('artifact stat summaries keep bonuses but omit equipment labels', async () => {
  await ready()
  for (const [slot, stat] of [['armor','DEF 4'],['weapon','ATK 7'],['shield','DEF 3']]) {
    const item={kind:'artifact',artifactSlot:slot,noun:'Sample',name:'Sample of Shasar',
      identified:true,def:slot==='weapon'?0:slot==='armor'?4:3,
      atk:slot==='weapon'?7:0,grace:2,bonuses:{mf:2}}
    const line=run(`itemStatLine(${JSON.stringify(item)})`)
    assert.match(line,new RegExp(stat))
    assert.match(line,/MF \+2/)
    assert.doesNotMatch(line,/\b(WEAPON|ARMOR|SHIELD)\b/)
    item.identified=false
    assert.equal(run(`itemStatLine(${JSON.stringify(item)})`),'???')
  }
})

test('domain powers are guaranteed on gear, unique across overlapping domains, and persisted', async () => {
  await ready()
  for (const [slot, gear] of Object.entries(catalogs)) for (const base of gear) {
    const item = artifact(base.name, Math.max(3, base.tier))
    const pool = clone(run(`artifactAbilityPool(${JSON.stringify(item)})`))
    assert(pool.length > 0, `${base.name} must have enabled abilities`)
    assert(pool.includes(item.abilityId), `${base.name} must roll from its own domains`)
    assert.equal(new Set(pool).size, pool.length, `${base.name} duplicate domain powers are unique`)
    assert.equal(run(`artifactAbilityDefinition(${JSON.stringify(item)})?.name`),
      loadJson('artifact_abilities.json').abilities[item.abilityId].name)
    if (base.rangedAtk) assert.deepEqual(pool, ['long_shot'], 'bows cannot roll martial abilities')
  }
  assert.equal(artifact('Amulet', 3).abilityId, null, 'non-gear artifacts have no enabled domain yet')
  assert.deepEqual(clone(run(`(() => {
    ARTIFACT_ABILITIES.domains.shields=['brace','fleetfoot'];
    const pool=artifactAbilityPool({kind:'artifact',artifactSlot:'shield',base:'Buckler'})
    ARTIFACT_ABILITIES.domains.shields=[];
    return pool
  })()`)).filter(x => ['brace','fleetfoot'].includes(x)), ['fleetfoot','brace'],
  'abilities shared by shield and bulwark domains appear once')

  const armor=artifact('Brigandine', 3); armor.identified=true
  run(`player.equip={armor:${JSON.stringify(armor)},weapon:null,shield:null};player.inventory=[];
    player.lastPositionChangeTurn=turnCount-1`)
  assert.match(run('itemStatLine(player.equip.armor)'),
    new RegExp(loadJson('artifact_abilities.json').abilities[armor.abilityId].name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
  const snapshot=clone(run('buildSaveObject()'))
  run(`loadGameFromObject(${JSON.stringify(snapshot)},{isReplayInit:true})`)
  assert.equal(run('player.equip.armor.abilityId'),armor.abilityId)
  assert.equal(run('player.lastPositionChangeTurn'),snapshot.player.lastPositionChangeTurn)
  assert.match(run('artifactInspectionText(player.equip.armor)'),/\w+: /, 'inspecting reveals the ability rules')
  armor.identified=false
  assert.equal(run(`itemStatLine(${JSON.stringify(armor)})`),'???', 'ability name stays secret before identification')
})

test('conditional DEF powers use the unboosted defense and do not stack duplicate abilities', async () => {
  await ready()
  run(`(() => {
    currentZ=0;map=surfaceMap;enemies=[];npcs=[];
    player.x=40;player.y=40;player.baseDef=10;player.hp=playerMaxHp();
    player.equip={weapon:null,shield:null,armor:{kind:'artifact',artifactSlot:'armor',base:'Tunic',def:4,abilityId:null}}
    player.inventory=[];turnCount=200;player.lastPositionChangeTurn=200
  })()`)
  const base=run('playerDef()')
  run("player.equip.armor.abilityId='brace'")
  assert.equal(run('playerDef()'),base,'brace is not ready immediately after moving')
  run('player.lastPositionChangeTurn=198')
  assert.equal(run('playerDef()'),base+Math.max(2,Math.floor(base*.2)))
  run("player.equip.shield={kind:'artifact',artifactSlot:'shield',base:'Buckler',def:0,abilityId:'brace'}")
  assert.equal(run('playerDef()'),base+Math.max(2,Math.floor(base*.2)), 'two Brace artifacts give one bonus')
  run("player.equip.shield=null;player.equip.armor.abilityId='vigorplate'")
  assert.equal(run('playerDef()'),base+Math.max(3,Math.floor(base*.3)))
  run('player.hp=1')
  assert.equal(run('playerDef()'),base,'vigorplate turns off below 75% HP')
  run(`(() => {
    player.equip.armor.abilityId='hold_the_line'
    player.hp=playerMaxHp()
    const tpl=ENEMY_TEMPLATE_BY_NAME.Goblin
    enemies=[]
    for(let i=0;i<4;i++)enemies.push({...tpl,id:'hold'+i,x:40+(i%2?1:-1),y:40+(i>=2?1:0),level:0,hp:10,alive:true})
  })()`)
  assert.equal(run('playerDef()'),base+3,'hold the line caps at 3 and counts current-Z enemies')
  run('enemies.forEach(e=>e.level=-1)')
  assert.equal(run('playerDef()'),base,'monsters on another Z do not contribute')
})

test('Fleetfoot removes equipment SPD penalties and Slow; Long Shot works only with a bow', async () => {
  await ready()
  run(`(() => {
    player.equip={weapon:null,shield:{kind:'shield',base:'Buckler',def:3},
      armor:{kind:'artifact',artifactSlot:'armor',base:'Hauberk',def:9,speedPenalty:3,abilityId:null}}
    player.inventory=[];player.slowTurns=3
  })()`)
  const slowed=run('playerSpdRaw()')
  run("player.equip.armor.abilityId='fleetfoot'")
  const fleet=run('playerSpdRaw()')
  assert(fleet-slowed>=4,'removes penalties plus Slow')
  run('player.slowTurns=0')
  assert.equal(run('playerSpdRaw()'),fleet,'Slow makes no difference with Fleetfoot')
  run(`player.equip.weapon={kind:'artifact',artifactSlot:'weapon',base:'Short Bow',rangedAtk:5,
    rangedRange:6,abilityId:'long_shot'}`)
  assert.equal(run('playerBowRange()'),7)
  run('player.equip.weapon.abilityId=null')
  assert.equal(run('playerBowRange()'),6)
  run('player.equip.weapon=null')
  assert.equal(run('playerBowRange()'),0)
})

test('Dreadful Strike gives five turns of existing fear, which still respects undead immunity', async () => {
  await ready()
  assert.equal(loadJson('artifact_abilities.json').abilities.dreadful_strike.duration,5)
  run(`(() => {
    replayAnimationsDisabled=true;currentZ=0;currentCave=-1;map=surfaceMap
    enemies=[];npcs=[];occupied=new Set();player.x=40;player.y=40;player.hp=1000
    player.equip={weapon:{kind:'artifact',artifactSlot:'weapon',base:'Dagger',name:'Dagger of Dread',
      identified:true,atk:8,grace:0,abilityId:'dreadful_strike'},armor:null,shield:null}
    player.inventory=[];player.invisibleTurns=0
    map[40][40]='grass';map[40][41]='grass'
    const tpl=ENEMY_TEMPLATE_BY_NAME.Goblin
    window.dreadTarget=addEnemy({...tpl,id:'fear-target',baseName:'Goblin',name:'Goblin',
      x:41,y:40,level:0,alive:true,hp:100,maxHp:100,equipment:null})
    occupied.add(keyXY(41,40))
    window.savedDreadFns={chance,damageRoll,log}
    let count=0;chance=()=>++count===3;damageRoll=()=>5;log=()=>{}
  })()`)
  try {
    await run('playerAttackEnemy(dreadTarget)')
    assert.equal(run('dreadTarget.fearTurns'),5,'melee fear uses requested five turns')
    assert.equal(run('dreadTarget.hp'),95)
    assert.equal(run("applyEnemyFear({alive:true,hp:10,baseName:'Skeleton',name:'Skeleton'},5)"),false,
      'the shared fear application refuses undead')
  } finally {
    run('chance=savedDreadFns.chance;damageRoll=savedDreadFns.damageRoll;log=savedDreadFns.log')
  }
})

test('the single artifact RNG draw is deterministic and independent of domain order', async () => {
  await ready()
  run("rngState=897234; replayPlaying=false; replayRecording=false")
  const initial=run('rngState')
  const a=clone(run('makeArtifactItem(4)'))
  const next=run('rngState')
  run(`rngState=${initial}`)
  const b=clone(run('makeArtifactItem(4)'))
  assert.deepEqual(b,a)
  assert.equal(run('rngState'),next, 'a repeat artifact roll has the same RNG consumption')
  run(`(() => {ARTIFACT_ABILITIES.baseDomains.Buckler=['martial']})()`)
  try {
    const pool=clone(run(`artifactAbilityPool({kind:'artifact',artifactSlot:'shield',base:'Buckler'})`))
    assert(pool.includes('brace') && pool.includes('dreadful_strike'),
      'per-base domains augment slot domains instead of replacing them')
  } finally { run('delete ARTIFACT_ABILITIES.baseDomains.Buckler') }
})

test('Shadow Strike and Flurry apply only to eligible strikes and do not alter miss resolution', async () => {
  await ready()
  run(`(() => {
    replayAnimationsDisabled=true;currentZ=0;currentCave=-1;map=surfaceMap
    enemies=[];npcs=[];occupied=new Set();player.x=40;player.y=40;player.hp=1000
    player.equip={weapon:{kind:'artifact',artifactSlot:'weapon',base:'Dagger',name:'Dagger of Shadows',
      identified:true,atk:8,grace:0,abilityId:'shadow_strike'},armor:null,shield:null}
    player.inventory=[];player.godMode=false;player.invisibleTurns=3
    map[40][40]='grass';map[40][41]='grass'
    const tpl=ENEMY_TEMPLATE_BY_NAME.Goblin
    window.strikeTarget=addEnemy({...tpl,id:'strike-target',baseName:'Goblin',name:'Goblin',
      x:41,y:40,level:0,alive:true,hp:200,maxHp:200,equipment:null})
    occupied.add(keyXY(41,40))
    window.savedStrikeFns={chance,damageRoll,log};chance=()=>false;damageRoll=()=>10;log=()=>{}
  })()`)
  try {
    await run('playerAttackEnemy(strikeTarget)')
    assert.equal(run('strikeTarget.hp'),185, 'invisible Shadow Strike gives 15 instead of 10')
    run('player.invisibleTurns=0')
    await run('playerAttackEnemy(strikeTarget)')
    assert.equal(run('strikeTarget.hp'),175, 'visible hits lose the damage bonus')
    run("player.equip.weapon.abilityId='flurry'")
    await run('playerAttackEnemy(strikeTarget,true)')
    assert.equal(run('strikeTarget.hp'),160, 'the GRACE bonus strike gains 50% damage')
    await run('playerAttackEnemy(strikeTarget,false)')
    assert.equal(run('strikeTarget.hp'),150, 'normal strikes do not receive Flurry')
  } finally {run('chance=savedStrikeFns.chance;damageRoll=savedStrikeFns.damageRoll;log=savedStrikeFns.log')}
})

test('God’s Chosen prevents critical multiplier and Immovable cancels displacement', async () => {
  await ready()
  run(`(() => {
    replayAnimationsDisabled=true;currentZ=0;currentCave=-1;map=surfaceMap
    enemies=[];npcs=[];occupied=new Set();player.x=40;player.y=40;player.hp=200
    player.equip={weapon:null,shield:null,armor:null};player.inventory=[]
    const tpl=ENEMY_TEMPLATE_BY_NAME.Goblin
    window.critEnemy=addEnemy({...tpl,id:'crit-target',baseName:'Goblin',name:'Goblin',
      x:41,y:40,level:0,alive:true,hp:100,maxHp:100,equipment:null,summonedTurn:-1})
    critEnemy.shooterAbility=null;critEnemy.shooterMode=null
    window.savedCritFns={chance,damageRoll,log,playerInsideSanctuary,enemyInsideSanctuary}
    playerInsideSanctuary=()=>false;enemyInsideSanctuary=()=>false
    damageRoll=()=>10;log=()=>{}
  })()`)
  try {
    run('window.rolls=0;chance=()=>++window.rolls===2')
    run('enemyAttackPlayer(critEnemy)')
    const lostWithout=200-run('player.hp')
    assert.equal(lostWithout,20,'control attack is critical '+JSON.stringify(clone(run('({rolls:window.rolls,turn:turnCount,msg:window.testCombatMessages,passive:enemyIsPassive(critEnemy),summoned:critEnemy.summonedTurn,hp:player.hp,inside:playerInsideSanctuary(),insideEnemy:enemyInsideSanctuary(critEnemy),mode:critEnemy.shooterMode,shooter:enemyIsShooter(critEnemy)})'))))
    run(`player.hp=200;player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Tunic',def:0,abilityId:'gods_chosen'};
      window.rolls=0`)
    run('enemyAttackPlayer(critEnemy)')
    assert.equal(200-run('player.hp'),10,'the same critical is now ordinary damage')
    run(`player.equip.armor.abilityId='immovable';player.x=40;player.y=40`)
    run('enemyKnockback(critEnemy,{sx:-1,sy:0},true)')
    assert.deepEqual(clone(run('({x:player.x,y:player.y})')),{x:40,y:40})
  } finally {run('chance=savedCritFns.chance;damageRoll=savedCritFns.damageRoll;log=savedCritFns.log;playerInsideSanctuary=savedCritFns.playerInsideSanctuary;enemyInsideSanctuary=savedCritFns.enemyInsideSanctuary')}
})
