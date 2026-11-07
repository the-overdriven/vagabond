const fs = require('node:fs')
const path = require('node:path')
const {run, context} = require('./helpers/node-game-runtime.cjs')

async function main() {
  await run('loadContent()')
  context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'saves/Tester_start.json'), 'utf8'))
  run('loadGameFromObject(fixture,{isReplayInit:true});log=()=>{};ensureMerchantStock()')
  context.realEnemyTurn = run('enemyTurn')
  context.realChance = run('chance')
  context.realDamageRoll = run('damageRoll')

  run(`(() => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const bow=merchantStock.find(i=>i.base==='Short Bow')
    const arrows=merchantStock.find(i=>i.kind==='arrows'&&i.bundleSize===10)
    check(bow?.merchantPrice===300 && itemSellValue(bow)===30,'bow buy/sell prices')
    check(arrows?.merchantPrice===20 && arrows.unlimitedStock,'ten arrows for twenty gold')
    player.gold=400;player.inventory=[]
    buyItem(bow)
    check(player.inventory.some(i=>i.base==='Short Bow') && !player.inventory.some(i=>i.kind==='arrows'),
      'buying a bow does not grant ammunition')
    buyItem(arrows)
    check(player.gold===80 && player.inventory.find(i=>i.kind==='arrows')?.count===10,
      'separate arrow bundle adds ten arrows')
    equipItem(player.inventory.findIndex(i=>i.base==='Short Bow'))
    check(equippedShortBow()?.atk===1 && player.equip.shield===null,'two-handed weak-melee bow equips')
  })()`)
  console.log('PASS bow merchant, inventory and equipment')

  run(`(() => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    currentZ=0;map=surfaceMap;enemies=[];npcs=[];occupied=new Set()
    player.x=40;player.y=40;player.godMode=false;player.hp=1000
    for(let y=36;y<=47;y++)for(let x=36;x<=50;x++){
      map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
    }
    const template=ENEMY_TEMPLATE_BY_NAME.Goblin
    const target=addEnemy({...template,id:'test-bow-target',baseName:'Goblin',name:'Goblin',
      x:44,y:40,level:0,alive:true,hp:100,maxHp:100,
      shooterAbility:null,shotsRemaining:0,equipment:null})
    occupied.add(keyXY(target.x,target.y))
    enemyTurn=()=>{turnCount++};npcTurn=()=>{};chance=()=>false;damageRoll=()=>5
    check(playerBowShotPath(target)?.length>1,'unobstructed target in range')
    map[40][42]='mountain'
    const turnBefore=turnCount
    check(!shootEnemy(target) && turnCount===turnBefore,'terrain blocks shot without cost')
    map[40][42]='grass'
    target.x=48
    check(!shootEnemy(target) && turnCount===turnBefore,'range six limit')
    target.x=44
    player.inventory=[]
    check(!shootEnemy(target) && turnCount===turnBefore,'zero ammo prevents shooting')
    player.inventory=[createItem('arrows',{count:3})]
    startReplayRecording()
    check(shootEnemy(target),'shot succeeded')
    check(target.hp===95 && target.alarmed,'shot damages and alerts target')
    check(player.inventory[0].count===2 && turnCount===turnBefore+1,'shot costs arrow and turn')
    check(replayData.actions.length===1 && replayData.actions[0].type==='shoot' &&
      replayData.actions[0].targetId===target.id,'shot targets stable enemy identity')
    window.__bowRecorded=structuredClone(replayData)
    window.__bowExpected={hp:target.hp,turnCount,
      arrows:player.inventory.find(i=>i.kind==='arrows')?.count}
  })()`)
  await run(`(async () => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const record=window.__bowRecorded, expected=window.__bowExpected
    replayRecording=false
    loadGameFromObject(record.initialState,{isReplayInit:true})
    replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
    const target=enemies.find(e=>e.id===record.actions[0].targetId)
    check(target?.hp===100,'replay restores untouched target')
    await runReplayAction(record.actions[0])
    check(target.hp===expected.hp && turnCount===expected.turnCount &&
      player.inventory.find(i=>i.kind==='arrows')?.count===expected.arrows,
      'replay reproduces health, turn and arrow usage')
    replayPlaying=false;replaySimulationMode=false
  })()`)
  console.log('PASS bow firing, obstruction, range, ammo and replay')

  run(`(() => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const template=ENEMY_TEMPLATE_BY_NAME.Kobold
    const shooter=addEnemy({...template,id:'test-arrow-shooter',baseName:'Kobold',name:'Kobold',
      x:46,y:40,level:0,alive:true,hp:1,maxHp:1,shooterAbility:'shooterArrows',
      shotsRemaining:4,equipment:null})
    occupied.add(keyXY(shooter.x,shooter.y))
    const oldChance=chance
    chance=p=>p===RANGED_CONFIG.shortBowDropChance
    const arrowsBefore=player.inventory.find(i=>i.kind==='arrows')?.count
    killEnemy(shooter,true,'arrow')
    chance=oldChance
    check(player.inventory.find(i=>i.kind==='arrows')?.count===arrowsBefore,
      'distant kills do not teleport ammunition into inventory')
    const drops=groundItems.filter(g=>g.x===46&&g.y===40&&g.kind==='droppeditem')
    check(drops.some(g=>g.item.kind==='arrows'&&g.item.count===4),
      'all four remaining shooter arrows land on the corpse tile')
    check(drops.some(g=>g.item.base==='Short Bow'),
      'seeded distant bow drop lands on the same tile as ammunition')
    const extra=createItem('arrows',{count:3})
    placeEnemyLootOnGround(shooter,extra)
    check(groundItems.filter(g=>g.x===46&&g.y===40&&g.item?.kind==='arrows').length===1&&
      drops.find(g=>g.item.kind==='arrows').item.count===7,
      'matching ground arrow stacks merge instead of obscuring one another')
  })()`)
  console.log('PASS shooter ammunition recovery and bow drop')

  run(`(() => {
    replayAnimationsDisabled=true
    currentZ=0;currentCave=-1;map=surfaceMap;enemies=[];npcs=[];groundItems=[];occupied=new Set()
    player.x=40;player.y=40;player.equip={weapon:makeShortBowItem(),armor:null,shield:null}
    player.inventory=[createItem('arrows',{count:3})]
    for(let y=38;y<=43;y++)for(let x=38;x<=47;x++){
      map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
    }
    const t=ENEMY_TEMPLATE_BY_NAME.Kobold
    const shield={kind:'shield',name:'Round Shield',base:'Round Shield',def:2}
    const e=addEnemy({...t,id:'bow-fatal-loot',name:'Kobold',baseName:'Kobold',
      x:44,y:40,level:0,alive:true,hp:1,maxHp:1,homeX:44,homeY:40,
      equipment:shield,shooterAbility:'shooterArrows',shotsRemaining:2})
    occupied.add(keyXY(44,40))
    const oldEnemyTurn=enemyTurn,oldNpcTurn=npcTurn,oldChance=chance,oldDamage=damageRoll
    try {
      enemyTurn=()=>{turnCount++};npcTurn=()=>{};chance=()=>false;damageRoll=()=>5
      if(!shootEnemy(e)||e.alive)throw Error('fatal ranged shot must kill target')
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      check(player.inventory.find(i=>i.kind==='arrows')?.count===2,
        'a ranged kill cannot auto-collect the victim ammunition')
      const loot=groundItems.filter(g=>g.kind==='droppeditem'&&g.x===44&&g.y===40)
      check(loot.some(g=>g.item.kind==='arrows'&&g.item.count===2)&&
        loot.some(g=>g.item.kind==='shield'),'multiple distinct drops share one corpse tile')
      const saved=buildSaveObject()
      loadGameFromObject(saved,{isReplayInit:true})
      check(groundItems.filter(g=>g.kind==='droppeditem'&&g.x===44&&g.y===40).length===2,
        'corpse item pile survives save and restore')
      player.x=44;player.y=40
      lootSkeletonOrForage();lootSkeletonOrForage()
      check(player.inventory.find(i=>i.kind==='arrows')?.count===4&&
        player.inventory.some(i=>i.kind==='shield')&&
        !groundItems.some(g=>g.kind==='droppeditem'&&g.x===44&&g.y===40),
        'two forage actions recover both drops without losing stack counts')
      const next=addEnemy({...t,id:'bow-adjacent-loot',name:'Kobold',baseName:'Kobold',
        x:45,y:40,level:0,alive:true,hp:1,maxHp:1,homeX:45,homeY:40,
        equipment:null,shooterAbility:'shooterArrows',shotsRemaining:2})
      occupied.add(keyXY(45,40))
      killEnemy(next)
      check(player.inventory.find(i=>i.kind==='arrows')?.count===6,
        'adjacent kills still auto-collect remaining ammunition')
    } finally {enemyTurn=oldEnemyTurn;npcTurn=oldNpcTurn;chance=oldChance;damageRoll=oldDamage}
  })()`)
  console.log('PASS ranged loot piles, pickup, save/restore and adjacent auto-loot')

  run(`(() => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    replayAnimationsDisabled=true
    enemyTurn=realEnemyTurn;chance=()=>false;damageRoll=()=>1
    currentZ=0;map=surfaceMap;enemies=[];npcs=[];occupied=new Set()
    player.x=40;player.y=40;player.hp=1000;player.maxHp=1000
    player.baseAtk=2;player.baseDef=2;player.baseSpd=5;player.lvl=1
    player.godMode=false;player.invisibleTurns=0;player.race='human'
    player.equip={weapon:makeShortBowItem(),armor:null,shield:null}
    player.inventory=[createItem('arrows',{count:12})]
    for(let y=35;y<=50;y++)for(let x=35;x<=51;x++){
      map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
    }
    const spawn=(name,id,x=46)=>{
      const t=ENEMY_TEMPLATE_BY_NAME[name]
      const e=addEnemy({...t,id,baseName:name,x,y:40,level:0,alive:true,
        hp:t.hp,maxHp:t.hp,homeX:x,homeY:40,homeTileType:'grass',
        equipment:null,shooterAbility:null,shotsRemaining:0,sleeping:false})
      occupied.add(keyXY(e.x,e.y))
      return e
    }
    const reset=()=>{enemies=[];occupied=new Set()}
    const strong=spawn('Ogre','bow-strong')
    check(enemyOutmatchesPlayer(strong),'Ogre has higher combat strength')
    const playerHp=player.hp,turnBefore=turnCount
    check(shootEnemy(strong),'shoots Ogre from outside AGGRO')
    check(strong.x===45&&strong.y===40&&player.hp===playerHp&&turnCount===turnBefore+1,
      'stronger monster advances exactly one tile as its normal action')
    reset()
    const weak=spawn('Giant Rat','bow-weak')
    check(!enemyOutmatchesPlayer(weak),'Giant Rat has lower combat strength')
    chance=()=>true
    check(shootEnemy(weak),'shoots at Giant Rat')
    check(weak.hp===weak.maxHp&&weak.x===47&&weak.y===40,
      'even a missed arrow drives a weaker monster one tile away')
    reset();chance=()=>false
    const cornered=spawn('Giant Rat','bow-cornered')
    for(let y=39;y<=41;y++)map[y][47]='mountain'
    check(shootEnemy(cornered)&&cornered.x===46&&cornered.y===39,
      'a blocked weaker monster first moves sideways along a legal escape route')
    check(shootEnemy(cornered)&&cornered.x===47&&cornered.y===38,
      'a second shot drives the monster farther around the obstacle')
    for(let y=39;y<=41;y++)map[y][47]='grass'
    reset()
    const near=spawn('Giant Rat','bow-near',44)
    check(shootEnemy(near)&&near.x===43&&near.y===40,
      'inside effective AGGRO the ordinary chase still takes priority')
    reset()
    const wounded=spawn('Goblin','bow-wounded')
    wounded.maxHp=100;wounded.hp=9
    check(enemyOutmatchesPlayer(wounded)&&enemyIsFleeing(wounded),'wounded Goblin still outmatches player')
    check(shootEnemy(wounded)&&wounded.x===47&&wounded.y===40,
      'wounded flight takes priority over the stronger-monster advance')
    reset()
    const passive=spawn('Fungus','bow-passive')
    check(shootEnemy(passive)&&passive.x===46&&passive.y===40,
      'passive creatures do not react')
    chance=realChance;damageRoll=realDamageRoll
  })()`)
  console.log('PASS distant bow shot response, miss, terrain, AGGRO and passive priority')

  run(`(() => {
    enemies=[];occupied=new Set();player.inventory=[createItem('arrows',{count:3})]
    const t=ENEMY_TEMPLATE_BY_NAME.Ogre
    const e=addEnemy({...t,id:'bow-replay-reactor',baseName:'Ogre',x:46,y:40,
      level:0,alive:true,hp:t.hp,maxHp:t.hp,homeX:46,homeY:40,
      homeTileType:'grass',equipment:null,shooterAbility:null,shotsRemaining:0,sleeping:false})
    occupied.add(keyXY(e.x,e.y))
    rngState=918273;startReplayRecording()
    if(!shootEnemy(e))throw Error('recorded bow shot must be valid')
    window.__bowReactionRecord=structuredClone(replayData)
    window.__bowReactionExpected={x:e.x,y:e.y,hp:e.hp,turn:turnCount,
      arrows:player.inventory.find(item=>item.kind==='arrows')?.count}
    replayRecording=false
  })()`)
  await run(`(async () => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const record=window.__bowReactionRecord,expected=window.__bowReactionExpected
    loadGameFromObject(record.initialState,{isReplayInit:true})
    replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
    activeReplay=record;replayRngIndex=0
    const e=enemies.find(other=>other.id==='bow-replay-reactor')
    await runReplayAction(record.actions[0])
    check(e.x===expected.x&&e.y===expected.y&&e.hp===expected.hp&&
      turnCount===expected.turn&&player.inventory.find(item=>item.kind==='arrows')?.count===expected.arrows,
      'replay reproduces the exact one-step bow reaction')
    check(replayRngIndex===record.rng.length,'replay consumes the same seeded RNG trace')
    replayPlaying=false;replaySimulationMode=false;activeReplay=null
  })()`)
  console.log('PASS deterministic distant bow reaction replay')
}

main().catch(error => {console.error(error.stack);process.exitCode = 1})
