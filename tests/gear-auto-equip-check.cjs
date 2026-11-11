const fs=require('node:fs'),path=require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')
async function main(){
  await run('loadContent()')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  run('loadGameFromObject(fixture,{isReplayInit:true});log=()=>{}')
  run(fs.readFileSync(path.join(__dirname,'helpers/enemy-spell-checks.js'),'utf8'))
  run(fs.readFileSync(path.join(__dirname,'helpers/gear-auto-equip-checks.js'),'utf8'))
  run('gearAutoEquipShieldConflictCheck()')
  run('bowRequiresAmmunitionChecks()')
  console.log('PASS gear auto-equip conflict, no-ammo bow equip, save/load and shield cases')
  run('quickEquipBestLoadoutChecks()')
  await run(`(async () => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const record=window.__quickEquipReplay,expected=window.__quickEquipExpected
    loadGameFromObject(record.initialState,{isReplayInit:true})
    replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
    activeReplay=record;replayRngIndex=0
    try {
      for(const action of record.actions)await runReplayAction(action)
      check(player.equip.weapon?.base===expected.weapon&&
        player.equip.shield?.base===expected.shield&&turnCount===expected.turn,
        'replay reconstructs the full melee and shield loadout')
      check(replayRngIndex===record.rng.length,'quick loadout replays the same RNG stream')
    } finally {
      replayPlaying=false;replaySimulationMode=false;activeReplay=null
    }
  })()`)
  console.log('PASS best melee/ranged loadout shortcuts, turn cost, and deterministic replay')
  run(`(() => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const oldChance=chance,oldRng=rng,oldPick=pickEquipmentBase
    try {
      chance=()=>true;rng=()=>0
      pickEquipmentBase=bases=>bases.find(item=>item.name==='Hunting Bow')||bases[0]
      const spawn=species=>{
        const template=ENEMY_TEMPLATE_BY_NAME[species]
        const enemy={...template,baseName:species,abilities:[...template.abilities],
          hp:template.hp,maxHp:template.hp,gearScale:1}
        prepareEnemyEquipment(enemy)
        return enemy
      }
      const gorgon=spawn('Gorgon'),kobold=spawn('Kobold'),goblin=spawn('Goblin')
      check(!gorgon.shooterAbility&&!gorgon.equipment?.rangedAtk,'nonshooter cannot roll a bow')
      check(kobold.shooterAbility==='shooterArrows'&&kobold.equipment?.rangedAtk,
        'arrow shooter can roll a bow')
      check(goblin.shooterAbility==='shooterStones'&&!goblin.equipment?.rangedAtk,
        'stone shooter cannot roll a bow')
      const bow={kind:'weapon',name:'Hunting Bow',base:'Hunting Bow',atk:2,
        grace:1,rangedAtk:7,rangedRange:6}
      check(applyEnemyEquipment(gorgon,bow)===false,'stealing or corpse pickup cannot equip forbidden bow')
      check(applyEnemyEquipment(kobold,bow)===true,'actual arrow shooter may equip a bow')
      // Saved enemies must lose invalid equipment without losing their identity,
      // remaining HP or any loot they stole from the player.
      const invalid={...gorgon,equipment:bow,atk:25,def:8,spd:4,hp:18,maxHp:163,
        gearBonuses:{atk:2,def:0,spd:0,hp:0,maxHp:0},stolenItem:bow,
        stolenItemEquipped:true}
      check(removeInvalidEnemyBow(invalid)&&invalid.atk===23&&invalid.equipment===null&&
        invalid.stolenItem===bow&&!invalid.stolenItemEquipped,'invalid equipment normalized')
      const save=buildSaveObject()
      save.enemies=[{...invalid,equipment:bow,atk:25,
        gearBonuses:{atk:2,def:0,spd:0,hp:0,maxHp:0},
        level:0,alive:true,x:10,y:10,baseName:'Gorgon',name:'Gorgon'}]
      const beforeRng=rngState
      loadGameFromObject(save,{isReplayInit:true})
      check(enemies[0].equipment===null&&enemies[0].atk===23&&
        enemies[0].stolenItem?.name==='Hunting Bow',
        'saved nonshooter is normalized, with stolen loot retained')
      check(rngState===beforeRng,'save normalization consumes no RNG')
    } finally {chance=oldChance;rng=oldRng;pickEquipmentBase=oldPick}
  })()`)
  console.log('PASS monster bow roles, unauthorized equipment and saved enemy normalization')

}
main().catch(err=>{console.error(err.stack);process.exitCode=1})
