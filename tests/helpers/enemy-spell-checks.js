// Shared rule scenarios run against the actual game in Node and Cypress.
function setupEnemySpellArena() {
  replayRecording=false;replayPlaying=false;replayData=null;activeReplay=null
  replaySimulationMode=false;replayAnimationsDisabled=true
  currentZ=0;currentCave=-1;map=surfaceMap;spawnPoint={x:5,y:5}
  enemies=[];npcs=[];occupied=new Set();groundItems=[];damageAnims=[]
  turnCount=0;consecutiveWaitTurns=0;deathTransition=null;pendingMove=null
  raceOpen=false;mapOpen=false;invOpen=false;tradeOpen=false;cameraAnimating=false;attackAnim=null
  player.x=40;player.y=40;player.maxHp=1000;player.hp=1000;player.lvl=1;player.race='human'
  player.baseSpd=10;player.baseAtk=2;player.baseDef=0;player.inventory=[]
  player.equip={weapon:null,shield:null,armor:null,blackkey:null};player.curseDebuffs=[]
  player.godMode=false;player.godInvisible=false;player.invisibleTurns=0
  player.weakenTurns=0;player.slowTurns=0;player.rootTurns=0;player.gazeTurns=0
  player.mummyCurseTurns=0;player.confusionTurns=0;player.confusionSourceId=null
  player.speedPotionTurns=0;player.speedPotionBonus=0;player.berryRegenTurns=0
  player.stoneSkinTurns=0;player.stoneSkinBonus=0;player.berserkTurns=0;player.berserkBonus=0
  player.deathShieldReady=false;player.poisonTurns=0;player.freezing={active:false,turns:0}
  resetSwimming()
  for(let y=30;y<=50;y++)for(let x=30;x<=50;x++) {
    map[y][x]='grass';grasslandTrees.delete(keyXY(x,y));discovered[y][x]=true
  }
}

function makeSpellTestEnemy(name, abilities, x=38, y=40) {
  const template=ENEMY_TEMPLATE_BY_NAME[name]
  const enemy=addEnemy({...template,baseName:name,abilities:abilities??template.abilities,
    x,y,hp:template.hp,maxHp:template.hp,alive:true,aware:true,level:0,
    homeX:x,homeY:y,homeTileType:'grass',prefix:null,equipment:null,shooterAbility:null,shotsRemaining:0})
  occupied.add(keyXY(x,y))
  return enemy
}

function genericEnemySpellChecks() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)},original={chance,pick}
  try {
    for(const name of ['Lich','Skeleton']) {
      setupEnemySpellArena()
      const e=makeSpellTestEnemy(name,['weaken','slow'])
      const baseSpeed=playerSpd(),slowedSpeed=Math.max(1,baseSpeed-Math.ceil(baseSpeed*0.10))
      chance=()=>true;pick=choices=>choices[0]
      check(tryEnemySpell(e),'any assigned species can cast Weaken: '+name)
      check(player.weakenTurns===5&&playerMaxHp()===900&&player.hp===900,'10% HP reduction')
      check(tryEnemySpell(e)&&player.slowTurns===5&&playerSpd()===slowedSpeed,'10% SPD reduction')
      check(damageAnims.some(a=>a.amount==='Weakened!')&&damageAnims.some(a=>a.amount==='Slowed!'),'cast popups')
      chance=()=>{throw Error('fully active debuffs must not roll')}
      check(!tryEnemySpell(e),'does not stack or waste a cast')
      const save=JSON.parse(JSON.stringify(buildSaveObject()))
      check(save.player.weakenTurns===5&&save.player.slowTurns===5,'generic counters serialized')
      loadGameFromObject(save,{isReplayInit:true})
      check(player.weakenTurns===5&&player.slowTurns===5,'generic counters restored')
      check(enemies[0].abilities.join(',')==='weaken,slow','assigned abilities restored independently of species')
      for(let i=0;i<4;i++)tickMonsterStatuses()
      check(player.weakenTurns===1&&player.slowTurns===1&&playerSpd()===slowedSpeed,'active through fourth tick')
      tickMonsterStatuses()
      check(playerMaxHp()===1000&&playerSpd()===baseSpeed&&player.hp===900,'expiry restores stats without healing')
    }
    setupEnemySpellArena()
    const lich=makeSpellTestEnemy('Lich')
    check(['summon','deathShield','weaken','slow','disarm','dispel'].every(a=>lich.abilities.includes(a)),'Lich opts into shared abilities')
    lich.hp=0
    check(absorbEnemyFatalHit(lich)&&lich.hp===1&&lich.deathShieldUsed,'shared one-use shield')
    lich.hp=0
    check(!absorbEnemyFatalHit(lich),'spent shield cannot prevent a second lethal hit')
  } finally {chance=original.chance;pick=original.pick}
}

function enemyDisarmChecks() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)},original={chance,pick,equipmentLog}
  let lastDisarmMessage=''
  try {
    for(const slot of ['weapon','shield','armor']) {
      setupEnemySpellArena()
      const e=makeSpellTestEnemy('Skeleton',['disarm'])
      const item={kind:slot,name:'Spell test '+slot,base:'Spell test',tier:3,
        mod:'hp',modAmt:20,identified:false,replayId:1234,atk:2,def:2}
      const key={kind:'blackkey',name:'Black Key'},other={kind:'herb',name:'Healing Herb',count:2}
      player.equip[slot]=item;player.equip.blackkey=key;player.inventory=[other]
      player.hp=playerMaxHp()
      chance=()=>true;pick=choices=>choices[0]
      equipmentLog=(message,...args)=>{lastDisarmMessage=message;original.equipmentLog(message,...args)}
      check(tryEnemySpell(e),'disarms '+slot)
      check(lastDisarmMessage.startsWith(`The ${e.name} casts a disarming spell!`),
        'spell wording names magical cause of disarm')
      check(player.equip[slot]===null&&player.inventory[1]===item,'exact item moved once')
      check(item.replayId===1234&&item.identified===false&&item.modAmt===20,'identity and modifiers preserved')
      check(player.inventory[0]===other&&player.equip.blackkey===key&&groundItems.length===0,'other items and quest slot untouched')
      check(player.hp===1000&&turnCount===0,'HP clamped without advancing a second turn')
      check(damageAnims.some(a=>a.amount==='Disarmed!'),'disarm popup')
      const save=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(save,{isReplayInit:true})
      check(player.equip[slot]===null&&player.inventory.filter(i=>i.replayId===1234).length===1,'save restores exactly one disarmed item')
    }
    setupEnemySpellArena()
    const e=makeSpellTestEnemy('Lich',['disarm'])
    for(const slot of ['weapon','shield','armor'])player.equip[slot]={kind:slot,name:slot,base:slot}
    chance=()=>true;pick=choices=>choices[1]??choices[0]
    check(tryEnemySpell(e)&&player.equip.weapon&&player.equip.armor&&!player.equip.shield,'one random occupied slot, not all equipment')
    check(player.inventory.length===1&&player.inventory[0].kind==='shield','only selected item moved')
  } finally {chance=original.chance;pick=original.pick;equipmentLog=original.equipmentLog}
}

function enemyDispelChecks() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)},original={chance,pick}
  const cases=[['berryRegenTurns',null,'Regeneration'],['invisibleTurns',null,'Invisibility'],
    ['speedPotionTurns','speedPotionBonus','Speed'],['stoneSkinTurns','stoneSkinBonus','Stone Skin'],
    ['berserkTurns','berserkBonus','Berserk'],['deathShieldReady',null,'Death Shield']]
  try {
    for(const [counter,bonus,label] of cases) {
      setupEnemySpellArena()
      const e=makeSpellTestEnemy('Skeleton',['dispel','trueSight'])
      player[counter]=counter==='deathShieldReady'?true:8
      if(bonus)player[bonus]=6
      player.rootTurns=2;player.weakenTurns=3;player.slowTurns=4
      player.curseDebuffs=[{stat:'atk',amt:-1,turnsLeft:3}]
      chance=()=>true;pick=choices=>choices[0]
      check(tryEnemySpell(e),'removes '+label)
      check(counter==='deathShieldReady'?player[counter]===false:player[counter]===0,'clears selected buff')
      check(!bonus||player[bonus]===0,'clears potion magnitude')
      check(player.rootTurns===2&&player.weakenTurns===3&&player.slowTurns===4&&player.curseDebuffs.length===1,'negative effects unchanged')
      check(damageAnims.some(a=>a.amount===label+' dispelled!'),'named dispel popup')
      const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(snapshot,{isReplayInit:true})
      check(!player[counter]&&(!bonus||player[bonus]===0),'removed buff stays removed after save')
    }
    setupEnemySpellArena()
    const e=makeSpellTestEnemy('Lich',['dispel'])
    player.speedPotionTurns=8;player.speedPotionBonus=6;player.deathShieldReady=true
    chance=()=>true;pick=choices=>choices[choices.length-1]
    check(tryEnemySpell(e)&&!player.deathShieldReady&&player.speedPotionTurns===8&&player.speedPotionBonus===6,'only one randomly selected buff removed')
  } finally {chance=original.chance;pick=original.pick}
}

function enemySpellEligibilityChecks() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)},original={chance,pick,enemyHasSight}
  try {
    setupEnemySpellArena()
    const e=makeSpellTestEnemy('Lich',['disarm','dispel'])
    chance=()=>{throw Error('ineligible spell consumed RNG')}
    check(!tryEnemySpell(e),'no gear or buff means no roll')
    e.abilities=['weaken']
    const cases=[
      [()=>player.invisibleTurns=5,()=>player.invisibleTurns=0],
      [()=>spawnPoint={x:40,y:40},()=>spawnPoint={x:5,y:5}],
      [()=>e.summonedTurn=turnCount,()=>e.summonedTurn=null],
      [()=>e.fearTurns=3,()=>e.fearTurns=0],
      [()=>e.sleeping=true,()=>e.sleeping=false],
      [()=>e.aggro=0,()=>e.aggro=4],
      [()=>e.level=-1,()=>e.level=0],
      [()=>e.x=20,()=>e.x=38],
      [()=>enemyHasSight=()=>false,()=>enemyHasSight=original.enemyHasSight],
      [()=>e.alive=false,()=>e.alive=true]
    ]
    for(const [block,restore] of cases) {
      block();check(!tryEnemySpell(e),'invalid actor or target does not cast');restore()
    }
    // Ordinary Lich cannot dispel its way through a player's invisibility.
    e.abilities=['dispel'];player.invisibleTurns=8
    check(!tryEnemySpell(e)&&player.invisibleTurns===8,'invisibility protects against ordinary casters')
    setupEnemySpellArena()
    const caster=makeSpellTestEnemy('Lich',['weaken','slow','disarm','dispel'],37,40)
    let castRolls=0
    chance=p=>{if(p===0.20)castRolls++;return false}
    enemyTurn()
    check(castRolls===1,'chase offers exactly one spell roll, not a second roll after Haste')
    setupEnemySpellArena();makeSpellTestEnemy('Skeleton',['disarm'],39,40)
    player.equip.weapon={kind:'weapon',name:'Test sword',base:'Test sword',atk:2}
    const hp=player.hp
    chance=p=>p===0.20;pick=choices=>choices[0]
    enemyTurn()
    check(turnCount===1&&!player.equip.weapon&&player.inventory.length===1&&player.hp===hp,'cast replaces melee and consumes one enemy turn')
  } finally {chance=original.chance;pick=original.pick;enemyHasSight=original.enemyHasSight}
}

async function enemySpellReplayChecks() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  setupEnemySpellArena()
  makeSpellTestEnemy('Lich',['disarm'],39,40)
  makeSpellTestEnemy('Skeleton',['dispel'],40,39)
  makeSpellTestEnemy('Goblin',['weaken','slow'],41,39)
  player.hp=5000;player.maxHp=5000;player.baseSpd=3
  player.equip.weapon={kind:'weapon',name:'Test sword',base:'Test sword',atk:2,grace:2,tier:1}
  player.equip.armor={kind:'armor',name:'Test armor',base:'Test armor',def:1,tier:1}
  player.deathShieldReady=true;player.berryRegenTurns=200
  rngState=7
  const state=()=>JSON.stringify({hp:player.hp,turn:turnCount,
    equip:player.equip,inventory:player.inventory,shield:player.deathShieldReady,regen:player.berryRegenTurns,
    weaken:player.weakenTurns,slow:player.slowTurns,maxHp:playerMaxHp(),speed:playerSpd(),
    enemies:enemies.map(e=>[e.id,e.x,e.y,e.hp,e.abilities])})
  startReplayRecording()
  const trace=[]
  for(let i=0;i<16;i++){await tryMove(i%2===0?1:-1,0);trace.push(state())}
  check(player.inventory.some(i=>i.name==='Test sword'||i.name==='Test armor'),'seeded actual turns include Disarm')
  check(!player.deathShieldReady||player.berryRegenTurns===0,'seeded actual turns include Dispel')
  check(trace.some(s=>JSON.parse(s).weaken>0)&&trace.some(s=>JSON.parse(s).slow>0),'seeded actual turns include both generic debuffs')
  const expected=state(),saved=JSON.parse(JSON.stringify(buildSaveObject()))
  const recording=JSON.parse(JSON.stringify(replayData))
  loadGameFromObject(recording.initialState,{isReplayInit:true})
  replayPlaying=true;replayRecording=false;replaySimulationMode=true;replayAnimationsDisabled=true
  activeReplay=recording;replayRngIndex=0
  try {
    const replayTrace=[]
    for(const action of recording.actions){await runReplayAction(action);replayTrace.push(state())}
    check(JSON.stringify(replayTrace)===JSON.stringify(trace),'each recorded spell turn replays exactly')
    check(state()===expected,'actual movement and spells replay exactly')
    check(replayRngIndex===recording.rng.length,'replay consumes identical RNG trace')
  } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
  loadGameFromObject(saved,{isReplayInit:true})
  check(state()===expected,'post-cast inventory and buffs restore exactly')
  check(rngState===saved.rngState,'save restores the current seeded RNG state')
}

if(typeof module!=='undefined')module.exports={setupEnemySpellArena,makeSpellTestEnemy,
  genericEnemySpellChecks,enemyDisarmChecks,enemyDispelChecks,enemySpellEligibilityChecks,enemySpellReplayChecks}
