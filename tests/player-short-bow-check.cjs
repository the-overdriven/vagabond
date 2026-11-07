const fs = require('node:fs')
const path = require('node:path')
const {run, context} = require('./helpers/node-game-runtime.cjs')

async function main() {
  await run('loadContent()')
  context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'saves/Tester_start.json'), 'utf8'))
  run('loadGameFromObject(fixture,{isReplayInit:true});log=()=>{};ensureMerchantStock()')

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
    killEnemy(shooter)
    chance=oldChance
    check(player.inventory.find(i=>i.kind==='arrows')?.count===6,
      'player auto-collects all four arrows remaining in shooter')
    check(player.inventory.some(i=>i.base==='Short Bow'), 'shooter drops bow on seeded roll')
  })()`)
  console.log('PASS shooter ammunition recovery and bow drop')
}

main().catch(error => {console.error(error.stack);process.exitCode = 1})
