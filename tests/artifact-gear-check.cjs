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
    if (base.rangedAtk) assert.deepEqual(pool, ['long_shot','deadeye','crippling_shot'], 'bows cannot roll martial abilities')
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

// Batch 2 uses the same combat entry points as ordinary attacks. No cosmetic
// callbacks are required for these deterministic combat-rule checks.
function setupArtifactCombat(id = 'slow') {
  run(`(() => {
    replayAnimationsDisabled=true;currentZ=0;currentCave=-1;map=surfaceMap
    enemies=[];npcs=[];occupied=new Set();groundItems=[]
    player.x=40;player.y=40;player.hp=playerMaxHp();player.godMode=false
    player.invisibleTurns=0;player.artifactBraveryCharge=false
    player.equip={weapon:{kind:'artifact',artifactSlot:'weapon',base:'Dagger',
      name:'Dagger of Testing',atk:8,grace:0,identified:true,abilityId:${JSON.stringify(id)}},
      armor:null,shield:null};player.inventory=[]
    for(let y=38;y<=44;y++)for(let x=38;x<=46;x++){
      map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
    }
    const t=ENEMY_TEMPLATE_BY_NAME.Goblin
    window.batchTarget=addEnemy({...t,id:'batch-target',baseName:'Goblin',name:'Goblin',
      x:41,y:40,level:0,alive:true,hp:200,maxHp:200,atk:8,def:10,
      spd:8,aggro:6,equipment:null,abilities:[],summonedTurn:-1})
    batchTarget.shooterAbility=null;batchTarget.shooterMode=null;batchTarget.shotsRemaining=0
    occupied.add(keyXY(41,40))
    window.batchSaved={chance,damageRoll,log,playerInsideSanctuary,enemyInsideSanctuary,enemyTurn,npcTurn}
    damageRoll=()=>10;chance=()=>false;log=()=>{}
    playerInsideSanctuary=()=>false;enemyInsideSanctuary=()=>false
  })()`)
}
function restoreArtifactCombat() {
  run(`chance=batchSaved.chance;damageRoll=batchSaved.damageRoll;log=batchSaved.log;
    playerInsideSanctuary=batchSaved.playerInsideSanctuary;
    enemyInsideSanctuary=batchSaved.enemyInsideSanctuary;enemyTurn=batchSaved.enemyTurn;
    npcTurn=batchSaved.npcTurn`)
}

test('martial Slow and archery Crippling Shot share a three-turn enemy SPD penalty', async () => {
  await ready();setupArtifactCombat('slow')
  try {
    const base=run('enemySpd(batchTarget)')
    run('chance=p=>p===0.30')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('enemySlowed(batchTarget)'),true)
    assert(run('enemySpd(batchTarget)')<base)
    const until=run('batchTarget.artifactSlowUntilTurn')
    run(`turnCount=${until-1}`)
    assert.equal(run('enemySlowed(batchTarget)'),true)
    run(`turnCount=${until}`)
    assert.equal(run('enemySpd(batchTarget)'),base)
    // A bow-only shot uses the same status, not a second poison-like status.
    run(`(() => {
      player.equip.weapon={kind:'artifact',artifactSlot:'weapon',base:'Short Bow',
        name:'Bow of Testing',rangedAtk:5,rangedRange:6,abilityId:'crippling_shot'}
      player.inventory=[createItem('arrows',{count:3})]
      batchTarget.x=44;batchTarget.y=40;batchTarget.hp=150
      occupied=new Set([keyXY(44,40)])
      chance=p=>p===0.30;enemyTurn=()=>{};npcTurn=()=>{}
    })()`)
    assert.equal(run('shootEnemy(batchTarget)'),true)
    assert.equal(run('enemySlowed(batchTarget)'),true)
    assert.equal(run('batchTarget.artifactSlowUntilTurn'),run('turnCount')+4)
  } finally {restoreArtifactCombat()}
})

test('Sunder and Blindness alter derived enemy stats without mutating base stats or doubling after save', async () => {
  await ready();setupArtifactCombat('sunder')
  try {
    const def=run('enemyDef(batchTarget)')
    for(let i=0;i<12;i++)await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.artifactSunderStacks'),10)
    assert.equal(run('enemyDef(batchTarget)'),Math.max(0,def-10))
    assert.equal(run('batchTarget.def'),10)
    run("batchTarget.artifactBlindAtkPenalty=0;batchTarget.artifactBlindAggroPenalty=false;player.equip.weapon.abilityId='blindness';chance=p=>p===.1||p===.5")
    const atk=run('enemyAtk(batchTarget)')
    const aggro=run('enemyAggroRange(batchTarget)')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('enemyAggroRange(batchTarget)'),aggro-1)
    run('chance=p=>p===.1')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('enemyAtk(batchTarget)'),atk-1)
    const saved=clone(run('buildSaveObject()'))
    assert.equal(saved.enemies.find(e=>e.id==='batch-target').aggro,aggro,'save raw AGGRO, not penalized AGGRO')
    run(`loadGameFromObject(${JSON.stringify(saved)},{isReplayInit:true})`)
    const target=run('enemies.find(e=>e.id==="batch-target")')
    assert(target)
    assert.equal(run('enemyAggroRange(enemies.find(e=>e.id==="batch-target"))'),aggro-1)
    assert.equal(run('enemyAtk(enemies.find(e=>e.id==="batch-target"))'),atk-1)
    assert.equal(run('enemyDef(enemies.find(e=>e.id==="batch-target"))'),Math.max(0,def-10))
  } finally {restoreArtifactCombat()}
})

test('Poison uses normal venom status and lifesteal heals only from actual enemy HP removed', async () => {
  await ready();setupArtifactCombat('poison')
  try {
    run('chance=p=>p===.2')
    await run('playerAttackEnemy(batchTarget)')
    assert(run('batchTarget.poisonTurns>0'))
    assert.equal(run('batchTarget.poisonDamageRemaining'),40)
    assert.equal(run('batchTarget.poisonAppliedTurn'),run('turnCount'))
    run("player.equip.weapon.abilityId='lifesteal';batchTarget.hp=5;player.hp=10;chance=p=>p===.3")
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('player.hp'),11,'only 5 actual HP removed: floor(5 / 3) = 1 healed')
  } finally {restoreArtifactCombat()}
})

test('critical Knockback moves an enemy through legal world geometry and does not award an extra melee strike', async () => {
  await ready();setupArtifactCombat('knockback')
  try {
    run('chance=p=>p===playerCriticalHitChance(batchTarget)')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.x'),42)
    assert.equal(run('occupied.has(keyXY(42,40))'),true)
    assert.equal(run('occupied.has(keyXY(41,40))'),false)
    run("batchTarget.x=41;batchTarget.hp=100;occupied=new Set([keyXY(41,40)]);map[40][42]='cavewall'")
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.x'),41,'wall prevents the push')
  } finally {restoreArtifactCombat()}
})

test('Enrage, both Braveries and Deadeye use current HP, strength and stationary conditions', async () => {
  await ready();setupArtifactCombat('enrage')
  try {
    run('damageRoll=atk=>atk;chance=()=>false;player.baseAtk=20;player.hp=playerMaxHp()')
    const full=run('artifactMeleeDamageMultiplier(batchTarget)')
    assert.equal(full,1)
    run('player.hp=Math.floor(playerMaxHp()*.2)')
    assert.equal(run('artifactMeleeDamageMultiplier(batchTarget)'),1.25)
    run("player.equip.weapon.abilityId='martial_bravery';batchTarget.atk=100;batchTarget.def=70")
    assert.equal(run('martialBraveryActive(batchTarget)'),true)
    run("player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Tunic',def:0,abilityId:'bulwark_bravery'}")
    run('player.hp=500;player.maxHp=500;batchTarget.hp=200;batchTarget.summonedTurn=-1')
    run('enemyAttackPlayer(batchTarget)')
    assert.equal(run('player.artifactBraveryCharge'),true,'stronger enemy damage prepares next strike')
    run('damageRoll=()=>10;chance=()=>false')
    const old=run('batchTarget.hp')
    await run('playerAttackEnemy(batchTarget)')
    assert(run('batchTarget.hp')<old-10,'Bravery boosts next successful hit')
    assert.equal(run('player.artifactBraveryCharge'),false)
    run("player.equip.weapon={kind:'artifact',artifactSlot:'weapon',base:'Short Bow',rangedAtk:5,rangedRange:6,abilityId:'deadeye'}")
    run('player.inventory=[createItem("arrows",{count:2})];batchTarget.x=44;batchTarget.y=40;occupied=new Set([keyXY(44,40)])')
    const now=run('turnCount')
    run(`player.lastPositionChangeTurn=${now}`)
    assert.equal(run('playerHeldPosition()'),false)
    run('turnCount+=2')
    assert.equal(run('playerHeldPosition()'),true)
    assert.equal(run('artifactRule("deadeye","hitBonus")'),.15)
  } finally {restoreArtifactCombat()}
})

test('artifact combat RNG, enemy status and player bravery charge replay exactly from the same save', async () => {
  await ready();setupArtifactCombat('blindness')
  try {
    run('chance=batchSaved.chance;damageRoll=batchSaved.damageRoll;log=()=>{}')
    run(`(() => {
      rngState=987651;player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Tunic',def:0,
        abilityId:'bulwark_bravery'}
      player.artifactBraveryCharge=true
    })()`)
    const snapshot=clone(run('buildSaveObject()'))
    // Compare post-melee states without animation callbacks, not just damage.
    await run('playerAttackEnemy(batchTarget)')
    const first=clone(run(`({rngState,charge:player.artifactBraveryCharge,
      hp:enemies.find(e=>e.id==='batch-target')?.hp,
      blindAtk:enemies.find(e=>e.id==='batch-target')?.artifactBlindAtkPenalty,
      blindAggro:enemies.find(e=>e.id==='batch-target')?.artifactBlindAggroPenalty})`))
    run(`loadGameFromObject(${JSON.stringify(snapshot)},{isReplayInit:true})`)
    run('replayAnimationsDisabled=true;batchTarget=enemies.find(e=>e.id==="batch-target")')
    await run('playerAttackEnemy(batchTarget)')
    const second=clone(run(`({rngState,charge:player.artifactBraveryCharge,
      hp:enemies.find(e=>e.id==='batch-target')?.hp,
      blindAtk:enemies.find(e=>e.id==='batch-target')?.artifactBlindAtkPenalty,
      blindAggro:enemies.find(e=>e.id==='batch-target')?.artifactBlindAggroPenalty})`))
    assert.deepEqual(second,first)
  } finally {restoreArtifactCombat()}
})

test('Deadeye deals extra damage on an actual shot only while holding position', async () => {
  await ready();setupArtifactCombat('long_shot')
  try {
    run(`(() => {
      player.equip.weapon={kind:'artifact',artifactSlot:'weapon',base:'Short Bow',
        rangedAtk:5,rangedRange:6,abilityId:'deadeye'}
      player.inventory=[createItem('arrows',{count:3})]
      batchTarget.x=44;batchTarget.y=40;occupied=new Set([keyXY(44,40)])
      chance=()=>false;damageRoll=()=>10;enemyTurn=()=>{};npcTurn=()=>{}
      player.lastPositionChangeTurn=turnCount-3
    })()`)
    assert.equal(run('shootEnemy(batchTarget)'),true)
    assert.equal(run('batchTarget.hp'),185,'stationary Deadeye shot deals 15 instead of 10 damage')
    run('player.lastPositionChangeTurn=turnCount')
    assert.equal(run('shootEnemy(batchTarget)'),true)
    assert.equal(run('batchTarget.hp'),175,'shot after moving loses Deadeye damage')
    assert.equal(run('player.inventory.find(item=>item.kind==="arrows")?.count'),1)
  } finally {restoreArtifactCombat()}
})

test('Batch 3: shield powers extend the same block roll and bash without weapon procs', async () => {
  await ready();setupArtifactCombat('riposte')
  try {
    run(`(() => {
      player.equip.shield={kind:'artifact',artifactSlot:'shield',base:'Buckler',def:2,
        identified:true,abilityId:'shield_mastery'}
      player.equip.armor=null;player.hp=100;player.maxHp=100
      batchTarget.equipment={kind:'weapon',base:'Club',atk:2,grace:1}
      damageRoll=()=>12;chance=()=>false
    })()`)
    assert.equal(run('shieldingBlockChance(batchTarget)'),.10)
    run("player.equip.shield.abilityId='counterguard'")
    assert.equal(run('shieldingBlockChance(batchTarget)'),.15)
    run('batchTarget.equipment=null')
    assert.equal(run('shieldingBlockChance(batchTarget)'),0)
    run(`(() => {
      player.equip.shield.abilityId='shield_bash'
      chance=p=>p===shieldingBlockChance(batchTarget)||p===.5
      batchTarget.hp=200;batchTarget.equipment=null
      player.combatSkills.shielding=100
    })()`)
    const hp=run('batchTarget.hp'), pHP=run('player.hp')
    run('enemyAttackPlayer(batchTarget)')
    assert(run('batchTarget.hp') < hp, 'successful block triggers shield counterattack')
    assert.equal(run('player.hp'),pHP-4,'shield block still reduces damage to a third')
    assert.equal(run('player.artifactRiposteReady'),true,'block prepares the next Riposte')
    run('chance=()=>false;damageRoll=()=>10')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('player.artifactRiposteReady'),false)
    assert.equal(run('batchTarget.hp'),hp-12-15,'Riposte improves one damaging melee hit')
  } finally {restoreArtifactCombat()}
})

test('Batch 3: HP-loss charges collect from poison and Blood Pact cost charges the next hit', async () => {
  await ready();setupArtifactCombat('blood_pact')
  try {
    run(`(() => {
      player.maxHp=100;player.hp=80;player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Robe',def:0,
        identified:true,abilityId:'blood_reservoir'}
      player.artifactBloodReservoirStored=0;player.artifactRetributionStored=0
      player.artifactPainEaterHits=0
      chance=()=>false;damageRoll=()=>10
    })()`)
    assert.equal(run('artifactLosePlayerHp(8)'),8)
    assert.equal(run('player.artifactBloodReservoirStored'),2)
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.hp'),187,'base 10, stored 2 and blood pact cost 1')
    assert.equal(run('player.hp'),71,'lost eight HP plus pact cost')
    assert.equal(run('player.artifactBloodReservoirStored'),.25,'cost accumulates only for next strike')
    run(`(() => {player.equip.armor.abilityId='pain_eater';player.artifactPainEaterHits=0;
      player.artifactPainAttackBonus=0})()`)
    run('artifactLosePlayerHp(1);artifactLosePlayerHp(2)')
    assert.equal(run('player.artifactPainEaterHits'),2)
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.hp'),174,'pain eater +2 and pact +1 on first strike')
    assert.equal(run('player.artifactPainEaterHits'),1,'pact cost feeds next action')
    assert.equal(run('player.artifactPainAttackBonus'),0)
    run(`(() => {player.equip.weapon.abilityId='retribution';player.equip.armor=null;
      player.artifactRetributionStored=0})()`)
    run('artifactLosePlayerHp(10);artifactLosePlayerHp(4)')
    assert.equal(run('player.artifactRetributionStored'),14)
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.hp'),157,'retribution adds floor(14/2)=7 to base 10')
    assert.equal(run('player.artifactRetributionStored'),0)
  } finally {restoreArtifactCombat()}
})

test('Batch 3: defensive wards retain cooldown after swapping and protect only eligible hits', async () => {
  await ready();setupArtifactCombat('riposte')
  try {
    run(`(() => {player.maxHp=100;player.hp=100;player.equip.armor={kind:'artifact',artifactSlot:'armor',
      base:'Robe',def:0,abilityId:'sacred_aegis',identified:true};chance=()=>false;damageRoll=()=>10})()`)
    assert.equal(run('artifactIncomingHit(10).absorbed'),true)
    assert.equal(run('player.artifactSacredReadyTurn'),run('turnCount')+10)
    assert.equal(run('artifactIncomingHit(10).damage'),10)
    const readyTurn=run('player.artifactSacredReadyTurn')
    run(`(() => {player.equip.armor=null;player.equip.armor={kind:'artifact',artifactSlot:'armor',
      base:'Jacket',def:0,abilityId:'sacred_aegis',identified:true}})()`)
    assert.equal(run('artifactIncomingHit(10).absorbed'),false,'swapping cannot recharge ward')
    run(`turnCount=${readyTurn}`)
    assert.equal(run('artifactIncomingHit(10).absorbed'),true,'ward recharges after ten world turns')
    run(`(() => {player.equip.armor.abilityId='bulwark_evasion';player.artifactEvasionPrepared=true;
      chance=p=>p===.30})()`)
    assert.equal(run('artifactIncomingHit(10).evaded'),true)
    assert.equal(run('player.artifactEvasionPrepared'),false)
    assert.equal(run('artifactIncomingHit(10).evaded'),false,'prepared dodge is one-use')
    run("player.equip.armor.abilityId='rhythm_guard';player.artifactRhythmGuardReady=true")
    assert.equal(run('artifactIncomingHit(10).damage'),5)
    assert.equal(run('player.artifactRhythmGuardReady'),false)
  } finally {restoreArtifactCombat()}
})

test('Batch 3: Last Stand triggers on surviving threshold crossing, never triggering hit', async () => {
  await ready();setupArtifactCombat('riposte')
  try {
    run(`(() => {player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Robe',def:0,
      abilityId:'last_stand',identified:true};player.maxHp=100;player.hp=30})()`)
    assert.equal(run('artifactLosePlayerHp(8)'),8)
    assert.equal(run('player.hp'),22)
    assert.equal(run('artifactLastStandActive()'),true)
    assert.equal(run('artifactLosePlayerHp(8)'),4,'periodic/non-direct damage is reduced')
    assert.equal(run('player.hp'),18)
    assert.equal(run('artifactLosePlayerHp(2,{cost:true})'),2,'HP costs bypass the reduction')
    assert.equal(run('artifactIncomingHit(10).damage'),5,'direct hit mitigated at impact')
    const expiry=run('player.artifactLastStandUntilTurn')
    const cd=run('player.artifactLastStandCooldownUntil')
    run(`turnCount=${expiry}`)
    assert.equal(run('artifactLastStandActive()'),false)
    run('player.hp=30;artifactLosePlayerHp(8)')
    assert.equal(run('player.artifactLastStandCooldownUntil'),cd,'cooldown prevents retrigger')
    run(`turnCount=${cd};player.hp=30;artifactLosePlayerHp(8)`)
    assert.equal(run('artifactLastStandActive()'),true)
    run('player.hp=5;player.artifactLastStandUntilTurn=0;player.artifactLastStandCooldownUntil=0')
    assert.equal(run('artifactLosePlayerHp(50)'),5)
    assert.equal(run('artifactLastStandActive()'),false,'lethal damage never grants Last Stand')
  } finally {restoreArtifactCombat()}
})

test('Batch 3: Boneplate and Plague Mail only count current-level nearby creatures', async () => {
  await ready();setupArtifactCombat('riposte')
  try {
    run(`(() => {player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Robe',def:0,
      abilityId:'boneplate',identified:true};batchTarget.hp=5})()`)
    const base=run('playerDef()')
    run('killEnemy(batchTarget,false,"trap")')
    assert.equal(run('artifactBoneplateStacks()'),1)
    assert.equal(run('playerDef()'),base+1)
    const snapshot=clone(run('buildSaveObject()'))
    run(`loadGameFromObject(${JSON.stringify(snapshot)},{isReplayInit:true})`)
    assert.equal(run('artifactBoneplateStacks()'),1)
    run('turnCount=player.artifactBoneplateExpiries[0]')
    assert.equal(run('playerDef()'),base,'Boneplate expires independently')
    run(`(() => {
      player.equip.armor.abilityId='plague_mail';currentZ=0;map=surfaceMap;
      const template=ENEMY_TEMPLATE_BY_NAME.Goblin
      enemies=[{...template,id:'poison-near',alive:true,hp:10,maxHp:10,x:41,y:40,
        level:0,poisonTurns:4},{...template,id:'poison-far',alive:true,hp:10,maxHp:10,
        x:43,y:40,level:0,poisonTurns:4},{...template,id:'poison-below',alive:true,hp:10,
        x:40,y:41,level:-1,poisonTurns:4}]
    })()`)
    assert.equal(run('playerDef()'),base+1)
    run(`(() => {
      const e=enemies[0]
      e.abilities=['poison']
      player.poisonTurns=0
      chance=()=>false
      applyEnemyPoison(e)
    })()`)
    assert(run('player.poisonTurns>0'),'Plague Mail makes eligible venom certain even when normal proc rolls false')
    run('enemies[0].poisonTurns=0')
    assert.equal(run('playerDef()'),base)
    run("player.equip.armor.abilityId='boneplate';enemies[0].hp=0")
    run('killEnemy(enemies[0],false,"trap")')
    assert.equal(run('artifactBoneplateStacks()'),1)
    run('enemies.forEach(e=>e.level=-1);player.artifactBoneplateExpiries=[]')
    assert.equal(run('playerDef()'),base)
  } finally {restoreArtifactCombat()}
})

test('Batch 3: save and replay retain combat charges, independent expiries and recharges', async () => {
  await ready();setupArtifactCombat('retribution')
  try {
    run(`(() => {player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Robe',def:0,
      identified:true,abilityId:'blood_reservoir'};player.artifactRetributionStored=17;
      player.artifactBloodReservoirStored=3.25;player.artifactPainEaterHits=2;
      player.artifactRiposteReady=true;player.artifactRhythmGuardReady=true;
      player.artifactEvasionPrepared=true;player.artifactSacredReadyTurn=turnCount+7;
      player.artifactLastStandCooldownUntil=turnCount+45;
      player.artifactLastStandUntilTurn=turnCount+2;
      player.artifactBoneplateExpiries=[turnCount+4,turnCount+9]})()`)
    const snapshot=clone(run('buildSaveObject()'))
    assert.equal(snapshot.version,181)
    const fields=['artifactRetributionStored','artifactBloodReservoirStored',
      'artifactPainEaterHits','artifactRiposteReady','artifactRhythmGuardReady',
      'artifactEvasionPrepared','artifactSacredReadyTurn','artifactLastStandCooldownUntil',
      'artifactLastStandUntilTurn','artifactBoneplateExpiries']
    run(`loadGameFromObject(${JSON.stringify(snapshot)},{isReplayInit:true})`)
    run('replayAnimationsDisabled=true')
    for (const field of fields) assert.deepEqual(clone(run(`player.${field}`)),snapshot.player[field],field)
    run('chance=()=>false;damageRoll=()=>10')
    const seeded=run('rngState')
    await run('playerAttackEnemy(enemies.find(e=>e.id==="batch-target"))')
    const first=clone(run(`({hp:enemies.find(e=>e.id==='batch-target')?.hp,
      playerHp:player.hp,charge:player.artifactRetributionStored,rngState})`))
    run(`loadGameFromObject(${JSON.stringify(snapshot)},{isReplayInit:true})`)
    run('replayAnimationsDisabled=true;chance=()=>false;damageRoll=()=>10')
    assert.equal(run('rngState'),seeded)
    await run('playerAttackEnemy(enemies.find(e=>e.id==="batch-target"))')
    const second=clone(run(`({hp:enemies.find(e=>e.id==='batch-target')?.hp,
      playerHp:player.hp,charge:player.artifactRetributionStored,rngState})`))
    assert.deepEqual(second,first)
  } finally {restoreArtifactCombat()}
})

test('Batch 3: lethal Blood Pact still kills its target, prevents GRACE follow-up and kills player', async () => {
  await ready();setupArtifactCombat('blood_pact')
  try {
    run(`(() => {player.maxHp=100;player.hp=1;batchTarget.hp=4;damageRoll=()=>10;chance=()=>false;
      window.batch3SavedDie=die;window.batch3DeathCause=null;
      die=(source,cause)=>{window.batch3DeathCause=cause||'enemy'}
    })()`)
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('enemies.some(e=>e.id==="batch-target")'),false,'fatal pact resolves its killing blow')
    assert.equal(run('player.hp'),0,'pact cost can kill the player')
    assert.equal(run('batch3DeathCause'),'blood_pact')
  } finally {
    run('die=batch3SavedDie')
    restoreArtifactCombat()
  }
})

test('Batch 3: two strikes charge one Rhythm Guard and do not re-charge from AoE or missed strikes', async () => {
  await ready();setupArtifactCombat('riposte')
  try {
    run(`(() => {player.equip.armor={kind:'artifact',artifactSlot:'armor',
      base:'Robe',def:0,abilityId:'rhythm_guard',identified:true}})()`)
    run('artifactOnPlayerAttack();artifactOnDirectPlayerHit()')
    assert.equal(run('player.artifactRhythmGuardReady'),false)
    run('artifactOnDirectPlayerHit()')
    assert.equal(run('player.artifactRhythmGuardReady'),true)
    run('artifactOnPlayerAttack()')
    assert.equal(run('player.artifactRhythmGuardReady'),true,'ready guard stays active across actions')
    run('chance=()=>false')
    assert.equal(run('artifactIncomingHit(12).damage'),6)
    assert.equal(run('artifactIncomingHit(12).damage'),12)
    run('artifactOnDirectPlayerHit()')
    assert.equal(run('player.artifactRhythmGuardReady'),false)
  } finally {restoreArtifactCombat()}
})

test('Batch 4: Executioner fires only on the first threshold crossing and Flurry excludes its extra hit', async () => {
  await ready();setupArtifactCombat('executioner')
  run('window.batchExtraAttackOriginal = canGetExtraWeaponAttack')
  try {
    run(`(() => {batchTarget.maxHp=100;batchTarget.hp=26;
      chance=()=>false;damageRoll=()=>7;canGetExtraWeaponAttack=()=>false})()`)
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.hp'),12,'the crossing gives one seven-damage extra strike')
    assert.equal(run('batchTarget.artifactExecutionerUsed'),true)
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.hp'),5,'hitting an already weakened enemy gives no extra strike')
    run('batchTarget.hp=100;batchTarget.maxHp=100;player.equip.weapon.abilityId="flurry";damageRoll=()=>10')
    await run('playerAttackEnemy(batchTarget,"executioner")')
    assert.equal(run('batchTarget.hp'),90,'Executioner bonus strike is not a Flurry strike')
    await run('playerAttackEnemy(batchTarget,true)')
    assert.equal(run('batchTarget.hp'),75,'the original boolean GRACE API still receives Flurry')
  } finally {
    run('canGetExtraWeaponAttack = window.batchExtraAttackOriginal')
    restoreArtifactCombat()
  }
})

test('Batch 4: Cleave hits only shared adjacent targets, using individual DEF without secondary weapon procs', async () => {
  await ready();setupArtifactCombat('cleave')
  try {
    run(`(() => {
      const t=ENEMY_TEMPLATE_BY_NAME.Goblin
      for (const [id,x,y,z] of [['a',41,41,0],['b',40,41,0],['far',42,40,0],['below',40,41,-1]]) {
        const other=addEnemy({...t,id:'cleave-'+id,baseName:'Goblin',name:'Goblin',
          x,y,level:z,alive:true,hp:40,maxHp:40,def:10,equipment:null,
          summonedTurn:-1,abilities:[],meleeHitXpGranted:0})
        if(z===0)occupied.add(keyXY(x,y))
      }
      window.cleaveRolls=[]
      chance=()=>false
      damageRoll=(atk,def)=>{
        cleaveRolls.push({atk,def})
        return cleaveRolls.length===1 ? 20 : Math.round(atk*10/(10+def))
      }
    })()`)
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.hp'),180)
    assert.equal(run('enemies.find(e=>e.id==="cleave-a").hp'),34)
    assert.equal(run('enemies.find(e=>e.id==="cleave-b").hp'),34)
    assert.equal(run('enemies.find(e=>e.id==="cleave-far").hp'),40)
    assert.equal(run('enemies.find(e=>e.id==="cleave-below").hp'),40)
    assert.deepEqual(clone(run('cleaveRolls.slice(1).map(r=>r.atk)')),[12,12],
      'all secondary targets receive 60% before their own DEF')
  } finally {restoreArtifactCombat()}
})

test('Batch 4: Soulburst is wall-blocked, cannot chain, and never damages the player', async () => {
  await ready();setupArtifactCombat('soulburst')
  try {
    run(`(() => {
      batchTarget.hp=5; batchTarget.maxHp=20;player.hp=40
      const t=ENEMY_TEMPLATE_BY_NAME.Goblin
      for (const [id,x,y,hp] of [['near',43,41,3],['near2',42,41,20],
          ['blocked',44,40,20],['chain',45,41,20],['below',42,40,20]]) {
        const other=addEnemy({...t,id:'burst-'+id,baseName:'Goblin',name:'Goblin',
          x,y,level:id==='below'?-1:0,alive:true,hp,maxHp:20,def:0,equipment:null,
          summonedTurn:-1,abilities:[]})
        if(id!=='below')occupied.add(keyXY(x,y))
      }
      map[40][43]='cavewall'
      window.burstRollCount=0
      chance=()=>false
      damageRoll=(atk,def)=> ++burstRollCount===1 ? 20 : Math.max(1,Math.round(atk))
    })()`)
    const hp=run('player.hp')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('enemies.some(e=>e.id==="batch-target")'),false)
    assert.equal(run('enemies.some(e=>e.id==="burst-near")'),false,'one splash victim died')
    assert.equal(run('enemies.find(e=>e.id==="burst-near2").hp'),14,'splash is 30% of finishing damage')
    assert.equal(run('enemies.find(e=>e.id==="burst-blocked").hp'),20,'wall blocks explosion')
    assert.equal(run('enemies.find(e=>e.id==="burst-chain").hp'),20,'blast kills never cause a new blast')
    assert.equal(run('enemies.find(e=>e.id==="burst-below").hp'),20,'blast cannot reach another Z')
    assert.equal(run('player.hp'),hp,'Soulburst does not hit the player')
  } finally {restoreArtifactCombat()}
})

test('Batch 4: Binding suppresses flee/theft temporarily and movement clears all affected enemies', async () => {
  await ready();setupArtifactCombat('binding')
  try {
    run('batchTarget.abilities=["flee","thief"];chance=()=>false;damageRoll=()=>5')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.artifactBound'),true)
    assert.equal(run('enemyHasAbility(batchTarget,"thief")'),false)
    assert.equal(run('enemyHasAbility(batchTarget,"flee")'),false)
    assert.equal(run('enemyIsFleeing(batchTarget)'),false)
    const saved=clone(run('buildSaveObject()'))
    run(`loadGameFromObject(${JSON.stringify(saved)},{isReplayInit:true})`)
    assert.equal(run('enemies.find(e=>e.id==="batch-target").artifactBound'),true)
    run('markPlayerPositionChanged()')
    assert.equal(run('enemies.find(e=>e.id==="batch-target").artifactBound'),false)
    assert.equal(run('enemyHasAbility(enemies.find(e=>e.id==="batch-target"),"thief")'),true)
    assert.equal(run('enemyHasAbility(enemies.find(e=>e.id==="batch-target"),"flee")'),true)
  } finally {restoreArtifactCombat()}
})

test('Batch 4: Death Veil extends only existing invisibility on direct melee kills', async () => {
  await ready();setupArtifactCombat('death_veil')
  try {
    run('player.equip.weapon.abilityId="riposte";player.equip.armor={kind:"artifact",artifactSlot:"armor",base:"Robe",def:0,identified:true,abilityId:"death_veil"};batchTarget.hp=5;player.invisibleTurns=4;chance=()=>false;damageRoll=()=>10')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('player.invisibleTurns'),9)
    run('batchTarget.hp=5;batchTarget.alive=true;enemies.push(batchTarget);occupied.add(keyXY(batchTarget.x,batchTarget.y));player.invisibleTurns=0')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('player.invisibleTurns'),0,'the power cannot grant invisibility from nothing')
  } finally {restoreArtifactCombat()}
})

test('Batch 4: Martial Evasion steps after melee resolution, but Elusive grants a no-turn step', async () => {
  await ready();setupArtifactCombat('martial_evasion')
  try {
    run(`(() => {window.batch4EnemyTurns=0;enemyTurn=()=>{batch4EnemyTurns++};
      chance=p=>p===.3;damageRoll=()=>10})()`)
    await run('tryMove(1,0)')
    assert.equal(run('batchTarget.hp'),190)
    assert.notDeepEqual(clone(run('({x:player.x,y:player.y})')),{x:40,y:40},
      'Evasion moves after the attack, not before damage')
    assert.equal(run('batch4EnemyTurns'),1,'the whole attack still advances the enemy clock only once')
    assert.equal(run('player.artifactMartialEvasionPending'),false)
    run(`(() => {player.x=40;player.y=40;player.equip.weapon.abilityId='riposte';
      player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Robe',def:0,
        identified:true,abilityId:'elusive'};player.artifactElusiveReady=false;
      enemyTurn=()=>{batch4EnemyTurns++};chance=()=>true})()`)
    run('enemyAttackPlayer(batchTarget)')
    assert.equal(run('player.artifactElusiveReady'),true)
    const before=run('batch4EnemyTurns')
    await run('tryMove(0,1)')
    assert.deepEqual(clone(run('({x:player.x,y:player.y})')),{x:40,y:41})
    assert.equal(run('batch4EnemyTurns'),before,'Elusive free step consumes no enemy turn')
    assert.equal(run('player.artifactElusiveReady'),false)
    run('player.artifactElusiveReady=true;recordReplayAction({type:"skipTurn"})')
    assert.equal(run('player.artifactElusiveReady'),false,'another action forfeits the opportunity')
  } finally {restoreArtifactCombat()}
})

test('Batch 4: save and deterministic replay preserve execution markers and movement opportunities', async () => {
  await ready();setupArtifactCombat('executioner')
  try {
    run(`(() => {
      batchTarget.maxHp=100;batchTarget.hp=27;batchTarget.artifactExecutionerUsed=true
      batchTarget.artifactBound=true;player.artifactElusiveReady=true
      player.artifactMartialEvasionPending=true;rngState=91822
    })()`)
    const saved=clone(run('buildSaveObject()'))
    assert.equal(saved.version,181)
    assert.equal(saved.player.artifactElusiveReady,true)
    assert.equal(saved.player.artifactMartialEvasionPending,true)
    assert.equal(saved.enemies.find(e=>e.id==='batch-target').artifactExecutionerUsed,true)
    assert.equal(saved.enemies.find(e=>e.id==='batch-target').artifactBound,true)
    run('chance=batchSaved.chance;damageRoll=batchSaved.damageRoll')
    await run('playerAttackEnemy(batchTarget)')
    const first=clone(run(`({rngState,targetHp:batchTarget.hp,
      used:batchTarget.artifactExecutionerUsed,bound:batchTarget.artifactBound})`))
    run(`loadGameFromObject(${JSON.stringify(saved)},{isReplayInit:true})`)
    run('batchTarget=enemies.find(e=>e.id==="batch-target");replayAnimationsDisabled=true')
    assert.equal(run('player.artifactElusiveReady'),true)
    assert.equal(run('player.artifactMartialEvasionPending'),true)
    await run('playerAttackEnemy(batchTarget)')
    const second=clone(run(`({rngState,targetHp:batchTarget.hp,
      used:batchTarget.artifactExecutionerUsed,bound:batchTarget.artifactBound})`))
    assert.deepEqual(second,first)
  } finally {restoreArtifactCombat()}
})


test('Batch 5: control abilities reuse enemy action, spells and status persistence', async () => {
  await ready(); setupArtifactCombat('petrifying_strike')
  try {
    run(`(() => {chance=p=>p===0.15;damageRoll=()=>4;batchTarget.hp=200;
      batchTarget.abilities=['weaken'];batchTarget.summonedTurn=-1})()`)
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.artifactPetrified'),true)
    const before=clone(run('({x:batchTarget.x,y:batchTarget.y,hp:player.hp})'))
    run('enemyTurn()')
    assert.equal(run('batchTarget.artifactPetrified'),false,'next opportunity is spent')
    assert.deepEqual(clone(run('({x:batchTarget.x,y:batchTarget.y,hp:player.hp})')),before,
      'the petrified enemy cannot attack or move')
    run('player.equip.weapon.abilityId="silence";chance=p=>p===0.30')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.artifactSilencedUntilTurn>turnCount'),true)
    assert.equal(run('tryEnemySpell(batchTarget)'),false,'silence blocks only shared spellcasting')
    const snapshot=clone(run('buildSaveObject()'))
    assert.equal(snapshot.enemies.find(e=>e.id==='batch-target').artifactSilencedUntilTurn,
      run('batchTarget.artifactSilencedUntilTurn'))
    run(`loadGameFromObject(${JSON.stringify(snapshot)},{isReplayInit:true})`)
    assert.equal(run('enemies.find(e=>e.id==="batch-target").artifactSilencedUntilTurn>turnCount'),true)
  } finally {restoreArtifactCombat()}
})

test('Batch 5: confused enemies have 50/25/25 action outcomes with no cross-level attacks', async () => {
  await ready();setupArtifactCombat('confusion')
  try {
    run(`(() => {batchTarget.artifactConfusedUntilTurn=turnCount+4
      window.friend=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,
        id:'confusion-friend',name:'Goblin',baseName:'Goblin',x:42,y:40,level:0,
        alive:true,hp:40,maxHp:40,equipment:null,abilities:[],summonedTurn:-1})
      friend.shooterAbility=null;friend.shooterMode=null;friend.shotsRemaining=0
      occupied.add(keyXY(42,40));window.oldConfusionRng=rng
      rng=()=>.9;damageRoll=()=>8})()`)
    assert.equal(run('artifactConfusedEnemyAction(batchTarget)'),true)
    assert.equal(run('friend.hp'),32)
    run('friend.level=-1;friend.hp=40')
    assert.equal(run('artifactConfusedEnemyAction(batchTarget)'),true,'no enemy target consumes the action')
    assert.equal(run('friend.hp'),40,'the effect never crosses Z')
    run('rng=()=>.1')
    assert.equal(run('artifactConfusedEnemyAction(batchTarget)'),false,'50% preserves normal action')
    const snapshot=clone(run('buildSaveObject()'))
    assert.equal(snapshot.enemies.find(e=>e.id==='batch-target').artifactConfusedUntilTurn,
      run('batchTarget.artifactConfusedUntilTurn'))
  } finally {run('rng=oldConfusionRng');restoreArtifactCombat()}
})

test('Batch 5: disarm drops the exact weapon once and removes equipment stats', async () => {
  await ready();setupArtifactCombat('disarm')
  try {
    run(`(() => {const weapon={kind:'weapon',base:'Club',name:'Heavy Club',tier:2,atk:9,mod:'atk',modAmt:2}
      applyEnemyEquipment(batchTarget,weapon);window.disarmedWeapon=weapon;
      chance=p=>p===0.10;damageRoll=()=>2})()`)
    const before=run('enemyAtk(batchTarget)')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.artifactDisarmed'),true)
    assert.equal(run('batchTarget.equipment'),null)
    assert.ok(run('enemyAtk(batchTarget)') < before)
    assert.equal(run('groundItems.filter(g=>g.item===disarmedWeapon).length'),1)
    assert.equal(run('groundItems.filter(g=>g.item===disarmedWeapon)[0].level'),0)
    assert.equal(run('batchTarget.artifactDisarmed'),true)
    run('chance=()=>false;killEnemy(batchTarget)')
    assert.equal(run('groundItems.filter(g=>g.item===disarmedWeapon).length'),1,
      'ordinary enemy loot cannot duplicate the dropped weapon')
    const item=clone(run('groundItems.find(g=>g.item===disarmedWeapon).item'))
    assert.equal(item.name,'Heavy Club')
  } finally {restoreArtifactCombat()}
})

test('Batch 5: Fear Aura spreads once per turn without chains and Fear Eater boosts ATK', async () => {
  await ready();setupArtifactCombat('dreadful_strike')
  try {
    run(`(() => {player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Tunic',
      def:0,identified:true,abilityId:'fear_aura'}
      window.fearNeighbor=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,id:'fear-neighbor',
      name:'Goblin',baseName:'Goblin',x:42,y:40,level:0,alive:true,hp:50,maxHp:50,
      equipment:null,summonedTurn:-1,abilities:[]})
      fearNeighbor.shooterAbility=null;fearNeighbor.shotsRemaining=0
      occupied.add(keyXY(42,40));batchTarget.fearTurns=3;chance=()=>true})()`)
    run('takeFearTurn(batchTarget)')
    assert.equal(run('fearNeighbor.fearTurns'),3)
    assert.equal(run('fearNeighbor.artifactFearAuraOnly'),true)
    assert.equal(run('fearNeighbor.artifactFearAuraCheckedTurn'),run('turnCount'))
    const checked=run('fearNeighbor.artifactFearAuraCheckedTurn')
    run('artifactFearAuraOnFleeStep(fearNeighbor)')
    assert.equal(run('fearNeighbor.artifactFearAuraCheckedTurn'),checked)
    run('player.equip.armor.abilityId="fear_eater"')
    // Visibility uses the actual viewport and underground FOV.
    run('camX=30;camY=30')
    const atk0=run('playerAtk()')
    assert.ok(atk0 >= run('playerAtk(true)')+1)
    run('fearNeighbor.level=-1;batchTarget.fearTurns=0')
    const atk1=run('playerAtk()')
    assert.ok(atk1<atk0,'fear on other levels gives no boost')
  } finally {restoreArtifactCombat()}
})

test('Batch 5: Taunt expands detection without overriding fear, and full-health execution frightens witnesses', async () => {
  await ready();setupArtifactCombat('executioner')
  try {
    run(`(() => {player.equip.armor={kind:'artifact',artifactSlot:'armor',base:'Tunic',
      def:0,abilityId:'taunt'};batchTarget.aggro=6})()`)
    const boosted=run('effectiveAggroRange(batchTarget)')
    run('player.equip.armor=null')
    assert.equal(boosted-run('effectiveAggroRange(batchTarget)'),3)
    run('player.equip.armor={kind:"artifact",artifactSlot:"armor",base:"Tunic",def:0,abilityId:"executioners_aura"}')
    run(`(() => {window.witness=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,id:'aura-witness',
      name:'Goblin',baseName:'Goblin',x:42,y:40,level:0,alive:true,hp:80,maxHp:80,
      equipment:null,abilities:[],summonedTurn:-1})
      witness.shooterAbility=null;witness.shotsRemaining=0;occupied.add(keyXY(42,40))
      batchTarget.maxHp=10;batchTarget.hp=10;damageRoll=()=>20;chance=p=>p===0.5})()`)
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.alive'),false)
    assert.equal(run('witness.fearTurns'),3,'single-strike kill from full HP triggers aura')
    const snapshot=clone(run('buildSaveObject()'))
    assert.equal(snapshot.enemies.find(e=>e.id==='aura-witness').fearTurns,3)
  } finally {restoreArtifactCombat()}
})


test('Batch 5: Disarm removes real shields, their bonuses and duplicate death loot', async () => {
  await ready();setupArtifactCombat('disarm')
  try {
    run(`(() => {const shield={kind:'shield',base:'Buckler',name:'Resilient Buckler',tier:2,
      def:8,mod:'def',modAmt:2}; applyEnemyEquipment(batchTarget,shield);
      window.disarmedShield=shield;chance=p=>p===0.10;damageRoll=()=>2})()`)
    const defBefore=run('enemyDef(batchTarget)')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.artifactDisarmed'),true)
    assert.equal(run('batchTarget.equipment'),null)
    assert.ok(run('enemyDef(batchTarget)')<defBefore,'losing a shield lowers DEF')
    assert.equal(run('groundItems.filter(g=>g.item===disarmedShield).length'),1)
    const save=clone(run('buildSaveObject()'))
    assert.equal(save.enemies.find(e=>e.id==='batch-target').artifactRangedDisarmed,false)
    run('chance=()=>false;killEnemy(batchTarget)')
    assert.equal(run('groundItems.filter(g=>g.item===disarmedShield).length'),1)
  } finally {restoreArtifactCombat()}
})

test('Batch 5: a shielded archer can lose either shield or modeled bow without losing both', async () => {
  await ready();setupArtifactCombat('disarm')
  try {
    run(`(() => {const shield={kind:'shield',base:'Tower Shield',name:'Tower Shield',tier:3,def:9};
      applyEnemyEquipment(batchTarget,shield);window.disarmedShield=shield;
      batchTarget.humanoid=true;batchTarget.shooterAbility='shooterArrows';
      batchTarget.shooterMode='ranged';batchTarget.shotsRemaining=7;
      chance=p=>p===0.10;damageRoll=()=>2;window.oldPick=pick;
      pick=list=>list.find(value=>value?.modeledBow===false)||oldPick(list)})()`)
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.equipment'),null)
    assert.equal(run('batchTarget.artifactRangedDisarmed'),false)
    assert.equal(run('enemyIsShooter(batchTarget)'),true,'shield loss preserves a separate bow')
    assert.equal(run('groundItems.filter(g=>g.item===disarmedShield).length'),1)
    run('pick=list=>list.find(value=>value?.modeledBow===true)||oldPick(list)')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.artifactRangedDisarmed'),true)
    assert.equal(run('enemyIsShooter(batchTarget)'),false)
    assert.equal(run('groundItems.filter(g=>g.item?.base==="Short Bow").length'),1)
    const snapshot=clone(run('buildSaveObject()'))
    assert.equal(snapshot.enemies.find(e=>e.id==='batch-target').artifactRangedDisarmed,true)
    run(`loadGameFromObject(${JSON.stringify(snapshot)},{isReplayInit:true})`)
    assert.equal(run('enemies.find(e=>e.id==="batch-target").artifactRangedDisarmed'),true)
    run('batchTarget=enemies.find(e=>e.id==="batch-target")')
    run('chance=()=>false;killEnemy(batchTarget,false)')
    assert.equal(run('groundItems.filter(g=>g.item?.base==="Short Bow").length'),1,
      'a dropped modeled bow cannot also drop as normal shooter loot')
  } finally {run('pick=oldPick');restoreArtifactCombat()}
})


test('Batch 5: shields implemented as artifacts can also be disarmed', async () => {
  await ready();setupArtifactCombat('disarm')
  try {
    run(`(() => {const shield={kind:'artifact',artifactSlot:'shield',base:'Buckler',
      name:'Buckler of Kindred',tier:3,def:11,mod:'def',modAmt:2};
      applyEnemyEquipment(batchTarget,shield);window.artifactShield=shield;
      chance=p=>p===0.10;damageRoll=()=>3})()`)
    const defBefore=run('enemyDef(batchTarget)')
    await run('playerAttackEnemy(batchTarget)')
    assert.equal(run('batchTarget.equipment'),null)
    assert.ok(run('enemyDef(batchTarget)')<defBefore)
    assert.equal(run('groundItems.filter(g=>g.item===artifactShield).length'),1)
  } finally {restoreArtifactCombat()}
})

test('Batch 5: disarm selection, drops and RNG reproduce after save restoration', async () => {
  await ready();setupArtifactCombat('disarm')
  try {
    run(`(() => {const shield={kind:'shield',base:'Buckler',name:'Buckler',tier:1,def:4};
      applyEnemyEquipment(batchTarget,shield);
      batchTarget.humanoid=true;batchTarget.shooterAbility='shooterArrows';
      batchTarget.shotsRemaining=5;batchTarget.shooterMode='ranged';
      chance=p=>p===0.10;damageRoll=()=>2})()`)
    const snapshot=clone(run('buildSaveObject()'))
    await run('playerAttackEnemy(batchTarget)')
    const outcome=clone(run(`({rngState,eq:batchTarget.equipment,
      ranged:batchTarget.artifactRangedDisarmed,ground:groundItems.map(g=>({x:g.x,y:g.y,
        level:g.level,item:g.item?.base}))})`))
    run(`loadGameFromObject(${JSON.stringify(snapshot)},{isReplayInit:true})`)
    run('replayAnimationsDisabled=true;batchTarget=enemies.find(e=>e.id==="batch-target")')
    await run('playerAttackEnemy(batchTarget)')
    const replayed=clone(run(`({rngState,eq:batchTarget.equipment,
      ranged:batchTarget.artifactRangedDisarmed,ground:groundItems.map(g=>({x:g.x,y:g.y,
        level:g.level,item:g.item?.base}))})`))
    assert.deepEqual(replayed,outcome,'same selected gear, ground location and RNG state')
  } finally {restoreArtifactCombat()}
})

// Soul Eater uses the same summoning and enemy lifecycle paths as monsters.
function soulEaterArena() {
  run(`(() => {
    replayAnimationsDisabled=true; replayRecording=false; replayPlaying=false
    currentZ=0;currentCave=-1;map=surfaceMap
    enemies=[];npcs=[];groundItems=[];occupied=new Set()
    player.x=40;player.y=40;player.hp=playerMaxHp()
    player.artifactSoulFedExpiries=[]
    player.equip={weapon:{kind:'artifact',artifactSlot:'weapon',base:'Dagger',name:'Dagger of Spirits',
      identified:true,atk:2,grace:0,abilityId:'soul_eater'},armor:null,shield:null}
    for(let y=35;y<=45;y++)for(let x=35;x<=45;x++){
      surfaceMap[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
    }
  })()`)
}
function soulVictim(id,x=41,y=40) {
  return run(`addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,
    id:${JSON.stringify(id)},name:'Wounded Goblin',baseName:'Goblin',
    level:0,levelKind:currentLevelKind(),caveIndex:currentCave,
    x:${x},y:${y},hp:0,maxHp:81,atk:19,def:7,spd:5,grace:3,
    humanoid:true,equipment:null,alive:true})`)
}

test('Batch 6: Soul Eater creates one hostile named ghost with half victim stats and Ghost abilities', async () => {
  await ready()
  soulEaterArena()
  soulVictim('soul-victim')
  run(`(() => {window.soulOriginal={chance,randInt,lootFromEnemy};
    chance=()=>true;randInt=()=>0;lootFromEnemy=()=>{}
  })()`)
  try {
    run(`killEnemy(enemies.find(e=>e.id==='soul-victim'),true,'test')`)
    const ghost=clone(run(`enemies.find(e=>e.artifactSoulGhost)`))
    assert(ghost,'a qualifying humanoid kill can summon a ghost')
    assert.equal(ghost.name,'ghost of Wounded Goblin')
    assert.equal(ghost.baseName,'Ghost')
    assert.equal(ghost.family,'undead')
    assert.deepEqual([ghost.maxHp,ghost.hp,ghost.atk,ghost.def,ghost.spd,ghost.grace],[41,41,10,4,3,2])
    assert(ghost.abilities.includes('ethereal') && ghost.abilities.includes('invisibility'))
    assert(!ghost.abilities.includes('summon') && !ghost.abilities.includes('thief'))
    assert.equal(ghost.level,0)
    assert.equal(ghost.summonedTurn,run('turnCount'))
    assert.equal(ghost.aware,true)
    assert.equal(ghost.alive,true)
    assert.equal(run(`isWalkable(${ghost.x},${ghost.y})`),true)
    assert.equal(run(`occupied.has(keyXY(${ghost.x},${ghost.y}))`),true)
    assert.notDeepEqual([ghost.x,ghost.y],[40,40])
    soulVictim('soul-victim-2',42,40)
    run(`killEnemy(enemies.find(e=>e.id==='soul-victim-2'),true,'test')`)
    assert.equal(run('enemies.filter(e=>e.artifactSoulGhost).length'),1,'only one ghost survives worldwide')
    const xpBefore=run('player.totalXpEarned')
    const inventoryBefore=run('player.inventory.length')
    const goldBefore=run('player.gold')
    run(`(() => {const ghost=enemies.find(e=>e.artifactSoulGhost);ghost.hp=0;killEnemy(ghost,true,'test')})()`)
    assert.equal(run('enemies.filter(e=>e.artifactSoulGhost).length'),0)
    assert.equal(run('artifactSoulFedStacks()'),1)
    assert.equal(run('player.artifactSoulFedExpiries[0]'),run('turnCount+301'))
    assert(run('player.totalXpEarned')>xpBefore,'ghost death grants regular XP')
    assert.equal(run('player.inventory.length'),inventoryBefore,'ghost carries no loot')
    assert.equal(run('player.gold'),goldBefore,'ghost carries no gold')
    assert.equal(run('enemies.filter(e=>e.artifactSoulGhost).length'),0,'ghost death cannot spawn another')
  } finally {
    run('chance=soulOriginal.chance;randInt=soulOriginal.randInt;lootFromEnemy=soulOriginal.lootFromEnemy')
  }
})

test('Batch 6: Soul Eater respects safe global-Z placement and exhausted space', async () => {
  await ready()
  soulEaterArena()
  soulVictim('no-space-victim')
  run(`(() => {
    for(const [dx,dy] of DIRS8) surfaceMap[40+dy][41+dx]='mountain'
    // The player occupies the only ordinary walkable neighboring tile.
    surfaceMap[40][40]='grass'
    window.soulOriginal={chance,randInt,lootFromEnemy}
    chance=()=>true;randInt=()=>0;lootFromEnemy=()=>{}
  })()`)
  try {
    run("killEnemy(enemies.find(e=>e.id==='no-space-victim'),true,'test')")
    assert.equal(run('enemies.filter(e=>e.artifactSoulGhost).length'),0,'no ghost spawns in rock or on the player')
    const differentZ=run(`artifactSoulEaterOnKill({
      name:'Lost Orc',baseName:'Orc',humanoid:true,alive:false,
      x:41,y:40,level:-1,levelKind:'cave',maxHp:80,atk:12,def:2,spd:4,grace:2})`)
    assert.equal(differentZ,false,'off-level deaths cannot spawn ghosts on the player level')
    assert.equal(run('enemies.length'),0)
  } finally {
    run('chance=soulOriginal.chance;randInt=soulOriginal.randInt;lootFromEnemy=soulOriginal.lootFromEnemy')
  }
})

test('Batch 6: Soul Fed gives independent uncapped 300-turn boosts, expires and survives unequipping', async () => {
  await ready()
  soulEaterArena()
  const base=run('playerAtk()')
  const moment=run('turnCount')
  run(`player.artifactSoulFedExpiries=[turnCount+2,turnCount+20,turnCount+301]`)
  assert.equal(run('artifactSoulFedStacks()'),3)
  assert.equal(run('playerAtk()'),base+3)
  assert.equal(run('playerAtk(true)'),run('player.baseAtk + raceBonus("atk") + 2'),
    'temporary Soul Fed never enters permanent ATK')
  run('player.equip.weapon=null')
  assert.equal(run('playerAtk()'),base+1,'already-earned stacks do not vanish when Soul Eater is removed')
  run(`turnCount=${moment+2}`)
  assert.equal(run('artifactSoulFedStacks()'),2)
  run(`turnCount=${moment+20}`)
  assert.equal(run('artifactSoulFedStacks()'),1)
  run(`turnCount=${moment+301}`)
  assert.equal(run('artifactSoulFedStacks()'),0)
  run(`player.artifactSoulFedExpiries=Array.from({length:12},(_,i)=>turnCount+20+i)`)
  assert.equal(run('artifactSoulFedStacks()'),12,'Soul Fed stacks have no cap')
})

test('Batch 6: save and replay restore ghost provenance and independent Soul Fed expiries', async () => {
  await ready()
  soulEaterArena()
  soulVictim('persist-soul')
  run(`(() => {window.soulOriginal={chance,randInt,lootFromEnemy};
    chance=()=>true;randInt=()=>0;lootFromEnemy=()=>{}
  })()`)
  try {
    run(`killEnemy(enemies.find(e=>e.id==='persist-soul'),true,'test')`)
    run(`player.artifactSoulFedExpiries=[turnCount+2,turnCount+300]`)
    const snapshot=clone(run('buildSaveObject()'))
    assert.equal(snapshot.version,181)
    assert.deepEqual(snapshot.player.artifactSoulFedExpiries,[run('turnCount+2'),run('turnCount+300')])
    assert.equal(snapshot.enemies.filter(e=>e.artifactSoulGhost).length,1)
    const ghost=snapshot.enemies.find(e=>e.artifactSoulGhost)
    run(`loadGameFromObject(${JSON.stringify(snapshot)},{isReplayInit:true})`)
    assert.equal(run('artifactSoulFedStacks()'),2)
    assert.equal(run('player.artifactSoulFedExpiries.length'),2)
    assert.deepEqual(clone(run(`enemies.find(e=>e.id===${JSON.stringify(ghost.id)})`)).artifactSoulGhost,true)
    assert.deepEqual(clone(run('buildSaveObject()')).player.artifactSoulFedExpiries,snapshot.player.artifactSoulFedExpiries)
    run(`turnCount=${snapshot.turnCount+3}`)
    assert.equal(run('artifactSoulFedStacks()'),1)
    run('player.artifactSoulFedExpiries=player.artifactSoulFedExpiries.filter(expiry=>expiry>turnCount)')
    assert.equal(run('player.artifactSoulFedExpiries.length'),1)
  } finally {
    run('chance=soulOriginal.chance;randInt=soulOriginal.randInt;lootFromEnemy=soulOriginal.lootFromEnemy')
  }
})

test('Batch 6: ghost summoning consumes the same deterministic RNG after save restoration', async () => {
  await ready()
  soulEaterArena()
  soulVictim('deterministic-soul')
  run(`(() => {
    player.xp=0;player.lvl=50
    enemies.find(e=>e.id==='deterministic-soul').hp=1
    rngState=4921847
    window.soulRngOriginal={lootFromEnemy,probability:ARTIFACT_ABILITIES.abilities.soul_eater.chance}
    lootFromEnemy=()=>{}
    ARTIFACT_ABILITIES.abilities.soul_eater.chance=1
  })()`)
  try {
    const initial=clone(run('buildSaveObject()'))
    const kill=()=>{
      run(`(() => {const victim=enemies.find(e=>e.id==='deterministic-soul');victim.hp=0;
        killEnemy(victim,true,'test')})()`)
      return {ghost:clone(run('enemies.find(e=>e.artifactSoulGhost)')),
        rng:run('rngState'),nextId:run('nextEnemyId')}
    }
    const first=kill()
    assert(first.ghost,'100% configured summon should create a ghost')
    run(`loadGameFromObject(${JSON.stringify(initial)},{isReplayInit:true})`)
    const second=kill()
    assert.deepEqual(second,first,'save restoration must replay the same summon location and RNG consumption')
  } finally {
    run('lootFromEnemy=soulRngOriginal.lootFromEnemy;ARTIFACT_ABILITIES.abilities.soul_eater.chance=soulRngOriginal.probability')
  }
})

test('Batch 6: ordinary monster summons retain the shared pre-existing rules', async () => {
  await ready()
  soulEaterArena()
  run(`(() => {
    const wolf=ENEMY_TEMPLATE_BY_NAME.Wolf
    window.summonWolf=addEnemy({...wolf,id:'original-summoner',name:'Wolf',baseName:'Wolf',
      x:43,y:42,level:0,levelKind:currentLevelKind(),caveIndex:currentCave,
      hp:wolf.hp,maxHp:wolf.hp,alive:true})
    occupied.add(keyXY(43,42))
    window.summonOriginal={chance,randInt}
    chance=()=>true;randInt=(low,high)=>low
  })()`)
  try {
    assert.equal(run('tryEnemySummon(summonWolf)'),true)
    const all=clone(run('enemies'))
    const summoned=all.filter(e=>e.id!=='original-summoner')
    assert.equal(summoned.length,1)
    assert.equal(summoned[0].baseName,'Wolf')
    assert.equal(summoned[0].maxHp,Math.max(1,Math.round(run('ENEMY_TEMPLATE_BY_NAME.Wolf.hp')*.5)))
    assert.equal(summoned[0].artifactSoulGhost,false)
    assert.equal(summoned[0].summonedTurn,run('turnCount'))
    assert.equal(run('summonWolf.summonUsed'),true)
    assert.equal(run('tryEnemySummon(summonWolf)'),false,'a monster can summon only once')
  } finally {
    run('chance=summonOriginal.chance;randInt=summonOriginal.randInt')
  }
})

test('artifact pricing is identification-dependent, capped and non-profitable on immediate resale', async () => {
  await ready()
  const result = run(`(() => {
    const powers = ARTIFACT_ABILITIES.abilities
    const cfg = ARTIFACT_ABILITIES.pricing
    const items = ARTIFACT_EFFECTS.flatMap(effect => Object.keys(powers).map(abilityId => ({
      kind:'artifact',tier:effect.tier,baseValue:effect.baseValue,merchantPrice:effect.baseValue,
      artifactSlot:'weapon',abilityId,identified:false,curse:null
    })))
    let examined = 0
    for (const item of items) {
      const hiddenBuy = itemBuyValue(item)
      const hiddenSell = itemSellValue(item)
      if (hiddenBuy !== Math.min(cfg.maxBuyPrice, item.baseValue + 200)) throw Error('hidden buy')
      if (hiddenSell > hiddenBuy) throw Error('hidden resale profit')
      item.identified = true
      const premium = powers[item.abilityId].priceBonus
      const identifiedBuy = itemBuyValue(item)
      const identifiedSell = itemSellValue(item)
      if (identifiedBuy !== Math.min(cfg.maxBuyPrice, item.baseValue + premium)) throw Error('identified buy')
      if (identifiedSell !== SELL_VALUE_BY_TIER[item.tier] + Math.floor(premium * .25))
        throw Error('identified sale')
      if (identifiedSell > identifiedBuy) throw Error('identified resale profit')
      item.curse={everyTurns:10,types:['hp']}
      if (itemSellValue(item) !== Math.floor(SELL_VALUE_BY_TIER[item.tier] / 4) + Math.floor(premium * .25))
        throw Error('cursed identified sale')
      if (item.merchantPrice !== item.baseValue) throw Error('base price mutated')
      examined++
    }
    const empty = {kind:'artifact',artifactSlot:'trinket',baseValue:280,identified:false}
    if (itemBuyValue(empty) !== 280) throw Error('trinket gambling surcharge')
    return {examined, powerCount:Object.keys(powers).length}
  })()`)
  assert.equal(result.powerCount, 51)
  assert.equal(result.examined, 51 * 14)
})

test('artifact activations log and animate while concealing unidentified powers', async () => {
  await ready()
  const feedback = run(`(() => {
    player.equip={weapon:{kind:'artifact',artifactSlot:'weapon',abilityId:'shadow_strike',identified:true},
      shield:null,armor:null}
    replayAnimationsDisabled=false;replaySimulationMode=false
    damageAnims=[]
    const previousLog=log, messages=[]
    try {
      log=(message,cls)=>messages.push({message,cls})
      artifactAbilityMessage('shadow_strike','Shadow Strike awakens!','Your weapon stirs!')
      const known={message:messages.at(-1).message,popup:damageAnims.at(-1)?.amount}
      player.equip.weapon.identified=false
      artifactAbilityMessage('shadow_strike','Shadow Strike awakens!','Your weapon stirs!')
      const hidden={message:messages.at(-1).message,popup:damageAnims.at(-1)?.amount}
      return {known,hidden}
    } finally {log=previousLog}
  })()`)
  assert.deepEqual(JSON.parse(JSON.stringify(feedback)), {
    known: {message:'Shadow Strike awakens!',popup:'Shadow Strike'},
    hidden: {message:'Your weapon stirs!',popup:'Magic!'}
  })
})

test('god mode activation includes the 5000-gold grant', () => {
  // Browser-driven activation is covered by the existing god-mode E2E spec.
  assert.match(run('useGodModeKey.toString()'), /player\.gold\s*=\s*5000/)
})

test('ability selection filters equipment slots and weapon classes before rolling', async () => {
  await ready()
  const result = run(`(() => {
    const config = ARTIFACT_ABILITIES
    const abilityId = '__restricted_test__'
    config.abilities[abilityId]={enabled:true,priceBonus:100,slots:['weapon'],weaponTypes:['twoHandedMelee']}
    config.domains.martial.push(abilityId,abilityId)
    config.domains.archery.push(abilityId)
    config.domains.bulwark.push(abilityId)
    const artifact = values => ({kind:'artifact',base:'Test Base',...values})
    try {
      const twoHanded=artifactAbilityPool(artifact({artifactSlot:'weapon',twoHanded:true}))
      const oneHanded=artifactAbilityPool(artifact({artifactSlot:'weapon',twoHanded:false}))
      const bow=artifactAbilityPool(artifact({artifactSlot:'weapon',twoHanded:true,rangedAtk:5}))
      const armor=artifactAbilityPool(artifact({artifactSlot:'armor'}))
      config.abilities[abilityId].enabled=false
      const disabled=artifactAbilityPool(artifact({artifactSlot:'weapon',twoHanded:true}))
      return {count:twoHanded.filter(id=>id===abilityId).length,
        oneHanded:oneHanded.includes(abilityId),bow:bow.includes(abilityId),
        armor:armor.includes(abilityId),disabled:disabled.includes(abilityId)}
    } finally {
      for(const list of Object.values(config.domains))
        for(let i=list.length-1;i>=0;i--)if(list[i]===abilityId)list.splice(i,1)
      delete config.abilities[abilityId]
    }
  })()`)
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    count:1,oneHanded:false,bow:false,armor:false,disabled:false
  })
})
