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
if(typeof module!=='undefined')module.exports={gearAutoEquipShieldConflictCheck}
