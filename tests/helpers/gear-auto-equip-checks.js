function gearAutoEquipShieldConflictCheck() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  setupEnemySpellArena()
  const shield={kind:'shield',base:'Buckler',name:'Buckler',def:2,spd:0}
  player.equip.shield=shield
  const lance={kind:'weapon',base:'Lance',name:'Profound Lance',atk:9,grace:2,twoHanded:true,tier:4}
  // Same conditional used for monster equipment drops, chest loot, and buried gear.
  const before=statSnapshot()
  check(!maybeAutoEquipWeapon(lance),'auto equip rejects a two-handed weapon with shield')
  player.inventory.push(lance)
  check(player.equip.weapon===null&&player.equip.shield===shield&&player.inventory[0]===lance,
    'two-handed loot is retained in backpack and shield unchanged')
  check(JSON.stringify(statSnapshot())===JSON.stringify(before), 'rejected auto equip does not change stats')
  const saved=JSON.parse(JSON.stringify(buildSaveObject()))
  loadGameFromObject(saved,{isReplayInit:true})
  check(player.equip.weapon===null&&player.equip.shield?.name==='Buckler'&&
    player.inventory.some(item=>item.name==='Profound Lance'&&item.twoHanded),
    'save restores valid shield plus unequipped two-handed weapon')
  // Exercise the full enemy-loot path from the reported Lich kill.
  setupEnemySpellArena()
  const lich=makeSpellTestEnemy('Lich',[],39,40)
  const dropped={kind:'weapon',base:'Lance',name:'Profound Lance',atk:9,grace:2,twoHanded:true,tier:4}
  lich.humanoid=true;lich.equipment=dropped
  player.equip.shield={kind:'shield',base:'Buckler',name:'Buckler',def:2}
  const originalChance=chance
  try {
    chance=()=>false // suppress unrelated artifact/tombstone drops
    lootFromEnemy(lich)
  } finally {chance=originalChance}
  check(player.equip.weapon===null && player.equip.shield?.name==='Buckler' &&
    player.inventory.some(i=>i===dropped),'Lich death keeps two-handed drop in inventory')
  setupEnemySpellArena()
  const twoHanded={kind:'weapon',base:'Lance',name:'Profound Lance',atk:9,twoHanded:true}
  check(maybeAutoEquipWeapon(twoHanded,false)&&player.equip.weapon===twoHanded,
    'two-handed loot still auto equips when no shield is worn')
  setupEnemySpellArena()
  const oneHanded={kind:'weapon',base:'Mace',name:'Resilient Mace',atk:6,twoHanded:false}
  player.equip.shield={kind:'shield',base:'Buckler',name:'Buckler'}
  check(maybeAutoEquipWeapon(oneHanded,false)&&player.equip.weapon===oneHanded&&player.equip.shield,
    'one-handed loot auto equips without removing shield')
  check(!maybeAutoEquipWeapon({kind:'weapon',name:'Another Mace'},false),
    'existing equipped weapon is never replaced automatically')
}

function setupQuickEquipKeyboardArena() {
  setupEnemySpellArena()
  player.equip.weapon=makeShortBowItem()
  player.inventory=[
    {kind:'weapon',base:'Long Sword',name:'Long Sword',atk:6,grace:4,tier:2,twoHanded:false},
    {kind:'shield',base:'Buckler',name:'Buckler',def:2,tier:1},
    {kind:'shield',base:'Tower Shield',name:'Tower Shield',def:5,tier:3}
  ]
}

function quickEquipBestLoadoutChecks() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  setupQuickEquipKeyboardArena()
  const weaker={kind:'weapon',base:'Club',name:'Club',atk:3,grace:2,tier:1}
  const unknown={kind:'artifact',artifactSlot:'weapon',identified:false,base:'Secret Sword',
    name:'Unidentified Sword',atk:99,grace:10,tier:5}
  player.inventory.unshift(weaker,unknown)
  const bow=player.equip.weapon
  check(equipBestLoadout('melee') && player.equip.weapon.base==='Long Sword' &&
    player.equip.shield.base==='Tower Shield' && turnCount===2,
    'one keypress selects the best known melee weapon and shield, costing two equip turns')
  check(player.inventory.includes(unknown)&&player.inventory.includes(weaker),
    'unidentified artifacts and weaker melee items remain untouched')
  check(!equipBestLoadout('melee')&&turnCount===2,'already equipped loadout costs no turns')
  check(equipBestLoadout('ranged')&&player.equip.weapon===bow&&
    player.equip.shield===null&&turnCount===3,
    'ranged shortcut re-equips the bow, stows the shield, and consumes one turn')
  check(!equipBestLoadout('ranged')&&turnCount===3,'reselecting equipped bow is free')

  setupQuickEquipKeyboardArena()
  player.equip.weapon=player.inventory.shift()
  player.equip.shield=player.inventory.shift()
  check(equipBestLoadout('melee')&&player.equip.shield?.base==='Tower Shield'&&
    turnCount===1,'keeping the best melee weapon but upgrading its shield takes one turn')

  setupEnemySpellArena()
  player.equip.weapon={kind:'weapon',name:'Mace',base:'Mace',atk:6,grace:2,twoHanded:false}
  player.equip.shield={kind:'shield',name:'Round Shield',base:'Round Shield',def:4}
  const giant={kind:'weapon',name:'Giant Sword',base:'Giant Sword',atk:16,grace:2,twoHanded:true}
  player.inventory=[giant]
  check(equipBestLoadout('melee')&&player.equip.weapon===giant&&!player.equip.shield&&turnCount===1,
    'best two-handed melee weapon removes the shield in a single equipment action')
  check(player.inventory.some(it=>it.base==='Round Shield'),'removed shield stays in inventory')
  check(!equipBestLoadout('ranged')&&turnCount===1,'no ranged weapon spends no turn')

  setupEnemySpellArena()
  player.equip.weapon={kind:'weapon',name:'Mighty Bow',base:'Short Bow',
    atk:20,grace:1,rangedAtk:5,rangedRange:6,twoHanded:true}
  const strongerBow={kind:'weapon',name:'Long Range Bow',base:'Short Bow',
    atk:1,grace:1,rangedAtk:7,rangedRange:6,twoHanded:true}
  player.inventory=[strongerBow]
  check(equipBestLoadout('ranged')&&player.equip.weapon===strongerBow,
    'ranged strength takes priority over a bow melee ATK modifier')

  setupQuickEquipKeyboardArena()
  rngState=81623;startReplayRecording()
  check(equipBestLoadout('melee')&&turnCount===2,'recording includes both equipment turns')
  const record=structuredClone(replayData)
  check(record.actions.length===2&&record.actions.every(action=>action.type==='equip'),
    'quick melee selection records existing equip replay actions in order')
  window.__quickEquipReplay=record
  window.__quickEquipExpected={weapon:player.equip.weapon.base,
    shield:player.equip.shield.base,turn:turnCount}
  replayRecording=false
}
if(typeof module!=='undefined')module.exports={gearAutoEquipShieldConflictCheck,
  setupQuickEquipKeyboardArena,quickEquipBestLoadoutChecks}
