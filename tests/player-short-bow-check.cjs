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
    player.inventory=[createItem('arrows',{count:20})]
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
    const playerHp=player.hp,turnBefore=turnCount
    check(shootEnemy(strong),'shoots Ogre from outside AGGRO')
    check(strong.x===45&&strong.y===40&&player.hp===playerHp&&turnCount===turnBefore+1,
      'stronger monster advances exactly one tile as its normal action')
    reset()
    player.baseAtk=70
    const weak=spawn('Goblin','bow-weak')
    check(!enemyOutmatchesPlayer(weak),'Goblin is weaker than the player')
    chance=()=>true
    check(shootEnemy(weak),'shoots at Goblin')
    check(weak.hp===weak.maxHp&&weak.x===47&&weak.y===40,
      'even a missed arrow drives a weaker target away despite a path to the player')
    reset();chance=()=>false
    const cornered=spawn('Goblin','bow-cornered')
    for(let y=30;y<=50;y++)map[y][45]='dwarvenprisonbars'
    for(let y=39;y<=41;y++)map[y][47]='mountain'
    check(playerBowShotPath(cornered)&&!enemyFindStep(cornered,true),
      'bars allow arrows through but prevent approaching the player')
    check(shootEnemy(cornered)&&cornered.bowEvasion?.kind==='trapped',
      'unarmed humanoid behind bars starts a bounded route away from the bow')
    const corneredFirst={x:cornered.x,y:cornered.y}
    check(shootEnemy(cornered)&&(cornered.x!==corneredFirst.x||cornered.y!==corneredFirst.y),
      'trapped humanoid continues its escape instead of stalling or oscillating')
    for(let y=39;y<=41;y++)map[y][47]='grass'
    reset()
    const isolated=spawn('Goblin','bow-isolated')
    for(let y=39;y<=41;y++){
      map[y][46]=y===40?'grass':'mountain'
      map[y][47]='mountain'
    }
    check(!enemyFindStep(isolated,true)&&!rangedRetreatDestination(isolated),
      'fully isolated Goblin has neither an approach route nor an escape route')
    check(shootEnemy(isolated)&&isolated.x===46&&isolated.y===40,
      'isolated target cannot move through bars or solid walls')
    for(let y=30;y<=50;y++)map[y][45]='grass'
    for(let y=39;y<=41;y++){
      map[y][46]='grass';map[y][47]='grass'
    }
    reset()
    const trapped=spawn('Goblin','bow-trapped-rat')
    player.baseAtk=70
    trapped.bowRetreatHold=true
    for(let y=39;y<=41;y++){
      map[y][46]=y===40?'grass':'mountain'
      map[y][47]='mountain'
    }
    check(enemyFindStep(trapped,true)&&!rangedRetreatDestination(trapped),
      'cornered Goblin has a route to the player but no legal retreat')
    check(shootEnemy(trapped)&&trapped.x===45&&trapped.y===40&&
      !trapped.bowRetreatHold,
      'cornered Goblin abandons cover hold and approaches on the shot turn')
    const corneredSave=buildSaveObject()
    check(corneredSave.enemies.find(e=>e.id===trapped.id).x===45,
      'save preserves the cornered Goblin position')
    loadGameFromObject(corneredSave,{isReplayInit:true})
    replayAnimationsDisabled=true
    const restoredRat=enemies.find(e=>e.id==='bow-trapped-rat')
    check(restoredRat.x===45&&enemyFindStep(restoredRat,true),
      'load restores a Goblin that can still approach')
    chance=realChance;damageRoll=realDamageRoll
    rngState=617293;startReplayRecording()
    check(shootEnemy(restoredRat)&&restoredRat.x===44&&restoredRat.y===40,
      'a second shot makes the Goblin press toward melee instead of fleeing exposed')
    window.__corneredBowRecord=structuredClone(replayData)
    window.__corneredBowExpected={x:restoredRat.x,y:restoredRat.y,
      hp:restoredRat.hp,turn:turnCount}
    replayRecording=false;chance=()=>false;damageRoll=()=>1
    for(let y=39;y<=41;y++){
      map[y][46]='grass';map[y][47]='grass'
    }
    player.baseAtk=2
    reset()
    const near=spawn('Goblin','bow-near',44)
    check(shootEnemy(near)&&near.x===43&&near.y===40,
      'weak target inside AGGRO attacks when no immediately safe retreat exists')
    reset()
    player.baseAtk=70
    const gargoyle=spawn('Gargoyle','bow-gargoyle',44)
    for(let y=30;y<=50;y++)map[y][42]='dwarvenprisonbars'
    check(!enemyFindStep(gargoyle,true)&&playerBowShotPath(gargoyle),
      'bars block the Gargoyle approach without blocking arrows')
    check(shootEnemy(gargoyle)&&gargoyle.x<=44&&!gargoyle.bowRetreatHold,
      'construct ignores ranged threat and never retreats across exposed ground')
    player.baseAtk=2
    reset()
    const strongerBlocked=spawn('Gargoyle','bow-strong-blocked',44)
    check(!enemyFindStep(strongerBlocked,true)&&shootEnemy(strongerBlocked)&&strongerBlocked.x<=44&&!strongerBlocked.bowRetreatHold,
      'construct ignores strength comparison even behind an impassable barrier')
    for(let y=30;y<=50;y++)map[y][42]='grass'
    reset()
    const strongNear=spawn('Gargoyle','bow-strong-near',44)
    check(enemyFindStep(strongNear,true)&&shootEnemy(strongNear)&&strongNear.x===43,
      'reachable target inside AGGRO still advances to fight')
    reset()
    player.baseAtk=70
    const shooter=spawn('Kobold','bow-armed-shooter',43)
    shooter.shooterAbility='shooterArrows';shooter.shotsRemaining=2
    check(!enemyOutmatchesPlayer(shooter)&&shootEnemy(shooter)&&shooter.x===43&&!shooter.bowRetreatHold&&shooter.shotsRemaining===2,
      'weaker ranged shooters ready their weapon rather than flee exposed: '+shooter.x+','+shooter.y+' remaining:'+shooter.shotsRemaining)
    player.baseAtk=2
    reset()
    const wounded=spawn('Goblin','bow-wounded')
    wounded.maxHp=100;wounded.hp=9
    check(enemyIsFleeing(wounded),'wounded Goblin retains its flight behavior')
    check(shootEnemy(wounded)&&wounded.x===47&&wounded.y===40,
      'wounded flight takes priority over the stronger-monster advance')
    reset()
    const passive=spawn('Fungus','bow-passive')
    check(shootEnemy(passive)&&passive.x===46&&passive.y===40,
      'passive creatures do not react (x='+passive.x+', y='+passive.y+', alive='+passive.alive+')')
    chance=realChance;damageRoll=realDamageRoll
  })()`)
  console.log('PASS distant bow shot response, miss, terrain, AGGRO and passive priority')

  run(`(() => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const oldChance=chance,oldDamage=damageRoll
    try {
      replayAnimationsDisabled=true;replaySimulationMode=false
      currentZ=0;map=surfaceMap;enemies=[];npcs=[];occupied=new Set()
      player.x=40;player.y=40;player.hp=1000;player.baseAtk=70;player.baseSpd=5
      player.equip={weapon:makeShortBowItem(),armor:null,shield:null}
      player.inventory=[createItem('arrows',{count:15})]
      for(let y=35;y<=50;y++)for(let x=35;x<=51;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      chance=()=>true;damageRoll=()=>1
      const spawn=(name,id)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name]
        const e=addEnemy({...t,id,baseName:name,name,x:44,y:40,level:0,
          alive:true,hp:500,maxHp:500,homeX:44,homeY:40,
          equipment:null,shooterAbility:null,shotsRemaining:0,wander:false,
          invisibleUntilTurn:0,invisibilityReadyTurn:999999})
        occupied.add(keyXY(e.x,e.y));return e
      }
      for(const name of ['Skeleton','Ghoul','Ghost','Mummy','Gargoyle','Giant Rat']){
        enemies=[];occupied=new Set()
        const e=spawn(name,'fearless-'+name)
        check((e.family==='undead'||e.family==='construct'||!e.humanoid)&&enemyFearlessOfBow(e),
          name+' tagged fearless')
        e.bowRetreatHold=true // even an already-restored state must not force undead into hiding
        const distBefore=Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))
        check(shootEnemy(e),name+' can be targeted with bow')
        const distAfter=Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))
        check(!e.bowRetreatHold && distAfter<distBefore,
          name+' pursues rather than fleeing when outmatched: '+e.x+','+e.y)
      }
      enemies=[];occupied=new Set()
      const ghoul=spawn('Ghoul','fearless-behind-bars')
      for(let y=30;y<=55;y++)map[y][42]='dwarvenprisonbars'
      check(playerBowShotPath(ghoul)&&!enemyFindStep(ghoul,true),
        'arrows pass through bars but undead cannot reach player')
      const blockedShot=shootEnemy(ghoul)
      check(blockedShot&&ghoul.x<=44&&ghoul.y===40&&!ghoul.bowRetreatHold,
        'trapped undead advances or holds instead of fleeing; shot='+blockedShot+',pos='+ghoul.x+','+ghoul.y+',hold='+ghoul.bowRetreatHold)
      for(let y=30;y<=55;y++)map[y][42]='grass'
      enemies=[];occupied=new Set()
      const humanoid=spawn('Goblin','fearful-living-control')
      check(!enemyFearlessOfBow(humanoid)&&shootEnemy(humanoid)&&humanoid.x===43&&!humanoid.bowRetreatHold,
        'ordinary humanoids fight when no safe retreat step exists')
    } finally {chance=oldChance;damageRoll=oldDamage}
  })()`)
  console.log('PASS undead never retreat from bow threat, even outmatched or blocked')


  run(`(() => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const oldChance=chance, oldDamage=damageRoll
    try {
      replayAnimationsDisabled=true;replaySimulationMode=false
      currentZ=0;map=surfaceMap;enemies=[];npcs=[];occupied=new Set()
      player.x=40;player.y=40;player.hp=1000;player.baseAtk=70;player.baseSpd=5
      player.equip={weapon:makeShortBowItem(),armor:null,shield:null}
      player.inventory=[createItem('arrows',{count:20})]
      for(let y=34;y<=52;y++)for(let x=34;x<=52;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      const t=ENEMY_TEMPLATE_BY_NAME['Goblin']
      const spawn=id=>{
        const e=addEnemy({...t,id,name:'Goblin',baseName:'Goblin',x:44,y:40,
          level:0,alive:true,hp:100,maxHp:100,equipment:null,
          shooterAbility:null,shotsRemaining:0,wander:false})
        occupied.add(keyXY(e.x,e.y));return e
      }
      // A mountain protects the south-side tile but leaves the starting
      // tile completely exposed; walking east would simply extend the shot.
      map[41][42]='mountain'
      let rat=spawn('bow-terrain-cover')
      check(!!playerBowShotPath(rat),'initial target is within a clear shot')
      check(!bowCoverBlocksPlayerShotAt(45,40) && bowCoverBlocksPlayerShotAt(44,41),
        'sideways terrain shelter is genuine cover, straight retreat is exposed')
      check(rangedRetreatDestination(rat).x===44 && rangedRetreatDestination(rat).y===41,
        'cover outranks the shorter straight retreat toward bow range')
      chance=()=>true;damageRoll=()=>1
      check(shootEnemy(rat)&&rat.x===44&&rat.y===41&&rat.bowRetreatHold,
        'even a miss sends weaker target toward cover')
      check(!playerBowShotPath(rat),'cover breaks the player shot')
      const protectedX=rat.x,protectedY=rat.y
      enemyTurn(null,null,null)
      check(rat.x===protectedX&&rat.y===protectedY,
        'enemy remains sheltered on a normal turn without another shot')
      const save=buildSaveObject()
      check(save.enemies.find(e=>e.id==='bow-terrain-cover').bowRetreatHold,
        'retreat intent is serialized')
      loadGameFromObject(save,{isReplayInit:true})
      replayAnimationsDisabled=true
      rat=enemies.find(e=>e.id==='bow-terrain-cover')
      check(rat.x===protectedX&&rat.y===protectedY&&rat.bowRetreatHold,
        'saved monster restores cover state')
      player.x=42;player.y=39
      check(!bowCoverBlocksPlayerShot(rat)&&!!playerBowShotPath(rat),
        'player can regain a clear shot by moving around shelter')
      enemyTurn(null,null,null)
      check(!rat.bowRetreatHold&&Math.max(Math.abs(rat.x-player.x),Math.abs(rat.y-player.y))<3,
        're-exposed target resumes closing to fight instead of returning to exposed cover')
      player.x=rat.x-1;player.y=rat.y
      enemyTurn(null,null,null)
      check(!rat.bowRetreatHold,'closing to melee cancels ranged shelter intent')

      // Prison bars do not absorb arrows and must not count as cover.
      enemies=[];occupied=new Set();player.x=40;player.y=40
      map[41][42]='grass';map[41][43]='dwarvenprisonbars'
      check(!bowCoverBlocksPlayerShotAt(44,41),
        'a line through prison bars remains a clear bow shot')
      map[41][43]='grass'

      // Distant cover or out-of-range escape never justifies exposed movement.
      for(let y=34;y<=52;y++)for(let x=34;x<=52;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      rat=spawn('bow-open-field')
      const openDest=rangedRetreatDestination(rat)
      check(!openDest, 'out-of-range destination is invalid when the path crosses open firing range')
      check(shootEnemy(rat)&&rat.x===43&&rat.y===40&&!rat.bowRetreatHold,
        'open-field target approaches immediately instead of granting free shots')
      chance=()=>false
      enemyTurn(null,null,null)
      check(rat.x<=43&&!rat.bowRetreatHold,'open-field enemy does not start an endless retreat')
      // The terrain protects a destination two or more steps away, but its
      // approach remains exposed. No detour through the firing lane is legal.
      enemies=[];occupied=new Set()
      map[42][43]='mountain'
      rat=spawn('bow-distant-cover')
      check(playerBowShotPath(rat)&&bowCoverBlocksPlayerShotAt(44,43)&&
        !bowCoverBlocksPlayerShotAt(44,41),
        'distant terrain cover exists but an intermediate tile is exposed')
      check(!rangedRetreatDestination(rat),
        'farther terrain cover is rejected when its first step is exposed')
      chance=()=>true
      check(shootEnemy(rat)&&rat.x===43&&rat.y===40&&!rat.bowRetreatHold,
        'target attacks instead of crossing exposed ground to distant cover')
      map[42][43]='grass';chance=()=>false
      enemies=[];occupied=new Set()
      rat=spawn('bow-one-step-escape');occupied.delete(keyXY(rat.x,rat.y))
      rat.x=46;occupied.add(keyXY(46,40))
      check(rangedRetreatDestination(rat)?.x===47,
        'leaving bow range on the first movement step is a safe escape')
      check(shootEnemy(rat)&&rat.x===47&&rat.bowRetreatHold,
        'one-step escape occurs without crossing exposed tiles')
      const edgeSave=buildSaveObject()
      loadGameFromObject(edgeSave,{isReplayInit:true})
      rat=enemies.find(e=>e.id==='bow-one-step-escape')
      check(rat?.x===47&&rat.bowRetreatHold,
        'saved range-escape intent survives restoration')
      player.x=41
      enemyTurn(null,null,null)
      check(rat.x===46&&rat.y===40&&!rat.bowRetreatHold,
        'following a range escape makes monster attack instead of kiting again')
    } finally {chance=oldChance;damageRoll=oldDamage}
  })()`)

  run(`(() => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const oldChance=chance,oldDamage=damageRoll
    try {
      replayAnimationsDisabled=true;replaySimulationMode=false
      currentZ=0;map=surfaceMap;enemies=[];npcs=[];occupied=new Set()
      player.x=40;player.y=40;player.hp=1000;player.maxHp=1000
      player.baseAtk=75;player.baseSpd=5;player.godMode=false;player.invisibleTurns=0
      player.equip={weapon:makeShortBowItem(),armor:null,shield:null}
      player.inventory=[createItem('arrows',{count:30})]
      for(let y=30;y<=55;y++)for(let x=28;x<=55;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      chance=()=>false;damageRoll=()=>2
      const spawn=(name,id,x,y)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name]
        const e=addEnemy({...t,id,name,baseName:name,x,y,homeX:x,homeY:y,level:0,
          alive:true,hp:200,maxHp:200,aware:true,alarmed:true,alarmedZ:0,
          alarmedLevelKind:currentLevelKind(),equipment:null,wander:false,sleeping:false,
          shooterAbility:null,shotsRemaining:0})
        occupied.add(keyXY(e.x,e.y));return e
      }
      // Reproduce the supplied save's prison shooter: a clear line through
      // prison bars, but no complete melee path. Shooting must outrank retreat.
      for(let y=30;y<=55;y++)map[y][38]='dwarvenprisonbars'
      let kobold=spawn('Kobold','prison-return-shot',37,42)
      kobold.shooterAbility='shooterArrows';kobold.shotsRemaining=3;kobold.shooterMode='ranged'
      check(!enemyFindStep(kobold,true)&&!!clearProjectilePath(kobold),
        'prison shooter has a valid return shot and no melee route')
      const hp=player.hp
      enemyTurn(null,null,kobold)
      check(kobold.shotsRemaining===2&&player.hp<hp&&kobold.x===37,
        'caged shooter uses one arrow instead of freezing or fleeing')
      kobold.shooterMode='melee'
      enemyTurn(null,null,kobold)
      check(kobold.shooterMode==='ranged'&&kobold.shotsRemaining===2,
        'switching from melee to ranged costs one full enemy action')
      enemyTurn(null,null,kobold)
      check(kobold.shotsRemaining===1,'shooter fires on its next action after switching')
      kobold.shotsRemaining=0
      enemyTurn(null,null,kobold)
      check(kobold.bowEvasion?.kind==='trapped' && kobold.x<37,
        'out-of-ammo prison shooter retreats away from the bow')
      const pending=buildSaveObject()
      check(pending.enemies.find(e=>e.id==='prison-return-shot').bowEvasion?.path.length,
        'trapped retreat route is saved')
      enemyTurn(null,null,kobold)
      const nextPos={x:kobold.x,y:kobold.y}
      loadGameFromObject(pending,{isReplayInit:true})
      kobold=enemies.find(e=>e.id==='prison-return-shot')
      enemyTurn(null,null,kobold)
      check(kobold.x===nextPos.x&&kobold.y===nextPos.y,
        'save restore reproduces the same planned escape step')
      for(let i=0;i<8;i++)enemyTurn(null,null,kobold)
      const outside=Math.max(Math.abs(kobold.x-player.x),Math.abs(kobold.y-player.y))
      check(outside>equippedShortBow().rangedRange && !kobold.bowEvasion,
        'ammo-exhausted shooter stops fleeing once outside bow range')
      const resting=[kobold.x,kobold.y]
      enemyTurn(null,null,kobold)
      check(kobold.x===resting[0]&&kobold.y===resting[1],
        'spent retreat does not turn into endless open-field kiting')

      // A panicked humanoid thief commits to a lateral route around a wall
      // rather than approaching and immediately returning to the same square.
      enemies=[];occupied=new Set()
      for(let y=30;y<=55;y++)map[y][38]='grass'
      for(const [x,y] of [[45,39],[45,40],[45,41]])map[y][x]='mountain'
      let thief=spawn('Imp','cornered-bow-thief',44,40)
      check(!rangedRetreatDestination(thief)&&!!enemyFindStep(thief,true),
        'cornered thief has a melee route but no safe immediate bow escape')
      enemyTurn(null,null,thief)
      check(thief.bowEvasion?.kind==='thief'&&thief.y!==40,
        'thief takes a lateral step instead of one closer toward the archer')
      const visited=[[thief.x,thief.y]]
      for(let i=0;i<3;i++){
        enemyTurn(null,null,thief)
        visited.push([thief.x,thief.y])
      }
      check(visited.every((v,i)=>i<2||v[0]!==visited[i-2][0]||v[1]!==visited[i-2][1]),
        'thief never repeats the approach-retreat two-tile loop during evasion')
      check(Math.max(Math.abs(thief.x-player.x),Math.abs(thief.y-player.y))>4 ||
        bowCoverBlocksPlayerShot(thief),
        'short frantic flank gains distance or real terrain cover')
      const escapeEnd=buildSaveObject()
      check(escapeEnd.enemies.find(e=>e.id==='cornered-bow-thief').bowEvasionSpent,
        'limited thief evasion cannot restart indefinitely when shot again')
      // The same path applies to a thief actually carrying a stolen item.
      enemies=[];occupied=new Set()
      thief=spawn('Imp','stolen-item-thief',44,40)
      thief.stolenItem={kind:'potion',name:'Life Potion',count:1}
      enemyTurn(null,null,thief)
      check(thief.y!==40&&thief.theftEscapeSteps===1,
        'stolen-item thief flanks and counts the action toward its normal escape budget')
    } finally {chance=oldChance;damageRoll=oldDamage}
  })()`)
  console.log('PASS prison shooter retaliation, depleted-ammo escape, and thief flanking')

  await run(`(async () => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    currentZ=0;map=surfaceMap;enemies=[];npcs=[];occupied=new Set()
    replayPlaying=false;replayRecording=false;replaySimulationMode=false;replayAnimationsDisabled=true
    player.x=40;player.y=40;player.hp=1000;player.maxHp=1000
    player.baseAtk=2;player.godMode=false;player.invisibleTurns=0
    player.equip={weapon:makeShortBowItem(),armor:null,shield:null}
    player.inventory=[createItem('arrows',{count:6})]
    for(let y=35;y<=50;y++)for(let x=35;x<=51;x++){
      map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
    }
    for(let y=0;y<map.length;y++)map[y][42]='dwarvenprisonbars'
    const t=ENEMY_TEMPLATE_BY_NAME.Kobold
    const e=addEnemy({...t,id:'replay-shooter-gallery',name:'Kobold',baseName:'Kobold',
      level:0,x:44,y:40,homeX:44,homeY:40,alive:true,hp:300,maxHp:300,
      equipment:null,shooterAbility:'shooterArrows',shotsRemaining:3,
      shooterMode:'ranged',wander:false,sleeping:false})
    occupied.add(keyXY(e.x,e.y))
    check(!!playerBowShotPath(e)&&!!clearProjectilePath(e)&&!enemyFindStep(e,true),
      'replay case: shot '+!!playerBowShotPath(e)+' returns '+!!clearProjectilePath(e)+' route '+JSON.stringify(enemyFindStep(e,true))+' visible '+undergroundTileVisible(e.x,e.y)+' enemy '+enemyCanBeSeen(e))
    rngState=718123;startReplayRecording()
    check(shootEnemy(e)&&e.shotsRemaining===2,
      'a recorded shot provokes shooter return fire behind bars')
    const record=structuredClone(replayData)
    const expected={shots:e.shotsRemaining,hp:e.hp,x:e.x,y:e.y,
      playerHp:player.hp,turn:turnCount}
    replayRecording=false
    loadGameFromObject(record.initialState,{isReplayInit:true})
    replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
    activeReplay=record;replayRngIndex=0
    try {
      await runReplayAction(record.actions[0])
      const restored=enemies.find(other=>other.id==='replay-shooter-gallery')
      check(restored.shotsRemaining===expected.shots&&restored.hp===expected.hp&&
        restored.x===expected.x&&restored.y===expected.y&&player.hp===expected.playerHp&&
        turnCount===expected.turn,'firing and receiving a retaliatory arrow replay exactly')
      check(replayRngIndex===record.rng.length,'return fire uses the identical seeded rolls')
    } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
  })()`)
  console.log('PASS shooter return-fire replay reproduces arrows and damage')


  console.log('PASS terrain cover selection, changing fire angle, pursuit and saved retreat intent')



  await run(`(async () => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const record=window.__corneredBowRecord, expected=window.__corneredBowExpected
    loadGameFromObject(record.initialState,{isReplayInit:true})
    replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
    activeReplay=record;replayRngIndex=0
    try {
      const rat=enemies.find(e=>e.id==='bow-trapped-rat')
      check(rat?.x===45&&enemyFindStep(rat,true),'replay starts with a reachable Goblin')
      await runReplayAction(record.actions[0])
      check(rat.x===expected.x&&rat.y===expected.y&&rat.hp===expected.hp&&
        turnCount===expected.turn,
        'replay preserves the cornered Goblin response')
      check(replayRngIndex===record.rng.length,'cornered response replays all RNG outcomes')
    } finally {
      replayPlaying=false;replaySimulationMode=false;activeReplay=null
    }
  })()`)
  console.log('PASS cornered bow pursuit save, load and replay')

  run(`(() => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    replayAnimationsDisabled=true;replaySimulationMode=false
    enemies=[];occupied=new Set();npcs=[];currentZ=0;map=surfaceMap
    player.x=40;player.y=40;player.baseSpd=30;player.hp=1000
    player.equip.weapon=makeShortBowItem()
    const t=ENEMY_TEMPLATE_BY_NAME['Goblin']
    const rat=addEnemy({...t,id:'shot-disengage',baseName:'Goblin',name:'Goblin',
      x:43,y:40,level:0,alive:true,hp:60,maxHp:60,aggro:4,
      equipment:null,shooterAbility:null,shotsRemaining:0,
      aware:true,alarmed:true,alarmedZ:0,alarmedLevelKind:currentLevelKind(),wander:false})
    occupied.add(keyXY(rat.x,rat.y))
    const oldChance=chance
    try {
      chance=()=>true
      enemyTurn(null,null,rat)
      check(rat.aware && rat.x===42&&!rat.bowRetreatHold,'recently shot weaker target stays engaged without retreat: '+rat.x+','+rat.y)
      rat.x=43;rat.aware=true;rat.alarmed=true;occupied=new Set([keyXY(43,40)])
      rat.bowRetreatHold=false // model an ordinary unprovoked pursuer
      enemyTurn(null,null,null)
      check(!rat.aware&&!rat.alarmed,'ordinary turn still allows SPD disengagement')
    } finally {chance=oldChance}
    enemies=[];occupied=new Set()
    const covered=addEnemy({...t,id:'shot-covered',baseName:'Goblin',name:'Goblin',
      x:46,y:40,level:0,alive:true,hp:60,maxHp:60,aggro:2,
      equipment:null,shooterAbility:null,shotsRemaining:0,aware:true,wander:false})
    occupied.add(keyXY(46,40))
    for(let x=40;x<=48;x++)map[40][x]='grass'
    for(let y=30;y<=50;y++)map[y][45]='dwarvenprisonbars'
    check(!enemyFindStep(covered,true)&&retreatFromBowShot(covered)&&covered.bowRetreatHold,
      'unreachable target enters bow-retreat state only after moving')
    map[40][45]='mountain'
    check(bowCoverBlocksPlayerShot(covered),'terrain blocks line of fire from cover')
    const holdX=covered.x,holdY=covered.y
    enemyTurn(null,null,null)
    check(covered.x===holdX&&covered.y===holdY&&covered.bowRetreatHold,
      'monster holds the cover position while bow is equipped')
    const saved=buildSaveObject()
    check(saved.enemies.find(e=>e.id==='shot-covered').bowRetreatHold,
      'save records the cover state')
    loadGameFromObject(saved,{isReplayInit:true})
    const restored=enemies.find(e=>e.id==='shot-covered')
    check(restored.bowRetreatHold,'save restoration preserves cover')
    player.equip.weapon=null
    enemyTurn(null,null,null)
    check(!restored.bowRetreatHold,'switching weapons releases cover hold')
    map[40][45]='grass'
    for(let y=30;y<=50;y++)map[y][45]='grass'
    player.equip.weapon=makeShortBowItem();player.baseSpd=5
  })()`)
  console.log('PASS shot-target pursuit and deterministic cover hold with save/restore')

  run(`(() => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    currentZ=0;map=surfaceMap;enemies=[];occupied=new Set();npcs=[]
    player.x=40;player.y=40;player.hp=1000;player.equip.weapon=makeShortBowItem()
    player.inventory=[createItem('arrows',{count:4})]
    for(let x=40;x<=45;x++)map[40][x]='grass'
    const t=ENEMY_TEMPLATE_BY_NAME['Giant Rat']
    const e=addEnemy({...t,id:'animated-bow-victim',baseName:'Giant Rat',name:'Giant Rat',
      x:43,y:40,level:0,alive:true,hp:1,maxHp:1,
      equipment:null,shooterAbility:null,shotsRemaining:0})
    occupied.add(keyXY(e.x,e.y))
    const old={enemyTurn,npcTurn,chance,damageRoll,lootLog}
    try {
      replayAnimationsDisabled=false;replaySimulationMode=false
      fxAnims=[];projectileAnims=[];damageAnims=[];enemyAttackVisualEnd=0
      enemyTurn=()=>{turnCount++};npcTurn=()=>{};chance=()=>false;damageRoll=()=>5
      check(shootEnemy(e)&&!e.alive,'fatal animated shot')
      const arrow=projectileAnims.find(p=>p.projectile==='arrow')
      const death=fxAnims.find(p=>p.dir===1)
      check(arrow&&death&&Math.abs(death.start-(arrow.start+arrow.duration))<2,
        'falling animation starts when projectile reaches target')
      check(death.holdUntilImpact,'killed monster remains visible until arrow impact')
      check(damageAnims.some(p=>p.amount===5 && Math.abs(p.delay-(death.start-p.start))<2),
        'damage number appears at arrow impact rather than at release')
      check(death.visual===RENDER_STYLE.enemies.tiles['Giant Rat'],
        'tile death effect stores creature sprite instead of only glyph')
      const oldVisualDraw=drawImageVisual,oldGlyphDraw=ctx.fillText,oldTileMode=USE_TILE_IMAGES
      const oldStatuses=updatePlayerStatuses,oldMinimap=renderMinimap
      let tileDeathDraws=0,asciiDeathDraws=0
      try {
        drawImageVisual=(x,y,visual,alpha)=>{
          if(visual===death.visual){tileDeathDraws++;return true}
          return oldVisualDraw(x,y,visual,alpha)
        }
        ctx.fillText=(glyph,...args)=>{
          if(glyph===death.ch)asciiDeathDraws++
          return oldGlyphDraw(glyph,...args)
        }
        updatePlayerStatuses=()=>{};renderMinimap=()=>{}
        USE_TILE_IMAGES=true;renderScene(death.start-1)
        check(tileDeathDraws>0&&!asciiDeathDraws,
          'death tile holds visibly in place while the arrow is in flight')
        const heldDraws=tileDeathDraws
        renderScene(death.start+80)
        check(tileDeathDraws>heldDraws&&!asciiDeathDraws,'tile death falls as its sprite')
        USE_TILE_IMAGES=false;renderScene(death.start-1)
        check(asciiDeathDraws>0,'ASCII victim remains visible before arrow impact')
        const heldGlyphs=asciiDeathDraws
        renderScene(death.start+150)
        check(asciiDeathDraws>heldGlyphs,'ASCII death still falls as a glyph')
        spawnDeathAnim({name:'Giant Rat',baseName:'Giant Rat',x:44,y:40})
        check(!fxAnims.at(-1).holdUntilImpact,
          'ordinary melee deaths are still animated immediately without a hold')
        fxAnims.pop()
      } finally {
        drawImageVisual=oldVisualDraw;ctx.fillText=oldGlyphDraw;USE_TILE_IMAGES=oldTileMode
        updatePlayerStatuses=oldStatuses;renderMinimap=oldMinimap
      }
      const messages=[];lootLog=(message)=>messages.push(message)
      const lootTarget={name:'Skeleton',baseName:'Skeleton',tier:1,humanoid:true,
        equipment:{kind:'weapon',base:'Crescent Blades',name:'Mighty Crescent Blades'}}
      lootFromEnemy(lootTarget)
      check(messages.some(m=>m.includes('dropped Mighty Crescent Blades.'))&&
        !messages.some(m=>m.includes('dropped a Mighty Crescent Blades.')),
        'prefixed equipment names omit the article')
    } finally {
      enemyTurn=old.enemyTurn;npcTurn=old.npcTurn;chance=old.chance
      damageRoll=old.damageRoll;lootLog=old.lootLog;replayAnimationsDisabled=true
    }
  })()`)
  console.log('PASS delayed ranged death sprite and equipment drop grammar')

  run(`(() => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const old={log,lootLog,chance,template:enemyTemplateForSavedEnemy,
      makeArtifactItem,tombstonesRemaining,tombstoneOrder,inventory:player.inventory}
    const messages=[]
    try {
      log=message=>messages.push(message);lootLog=message=>messages.push(message)
      chance=()=>true;makeArtifactItem=()=>null
      enemyTemplateForSavedEnemy=()=>({lootTable:[{kind:'chitin',chance:1,count:1}]})
      player.inventory=[]
      lootFromEnemy({name:'Kobold',baseName:'Kobold',tier:2,humanoid:true,
        shooterAbility:'shooterArrows',shotsRemaining:0,
        equipment:{kind:'weapon',base:'Mace',name:'Mace'}})
      check(messages.some(m=>m.startsWith('The Kobold dropped ') && m.endsWith('Short Bow.')),
        'short bow drops with a valid name and no article')
      check(messages.includes('The Kobold dropped Chitin.'),'single biological loot without article')
      check(messages.includes('The Kobold dropped Mace.'),'ordinary gear without article')
      check(messages.every(m=>!m.includes('dropped a ')&&!m.includes('dropped an ')),
        'no dropped-item message has indefinite article')
      tombstonesRemaining=1;tombstoneOrder=[0]
      maybeDropTombstone({name:'Lich',baseName:'Lich',tier:5})
      check(messages.includes('The Lich dropped Mysterious Tombstone.'),
        'special tombstone drops without article')
      enemyTemplateForSavedEnemy=()=>({lootTable:[{kind:'chitin',chance:1,count:3}]})
      lootFromEnemy({name:'Scarab',baseName:'Scarab',tier:1,humanoid:false})
      check(messages.includes('The Scarab dropped 3 × Chitin.'),
        'multiple biological drops retain quantity')
    } finally {
      log=old.log;lootLog=old.lootLog;chance=old.chance
      enemyTemplateForSavedEnemy=old.template;makeArtifactItem=old.makeArtifactItem
      tombstonesRemaining=old.tombstonesRemaining;tombstoneOrder=old.tombstoneOrder
      player.inventory=old.inventory
    }
  })()`)
  console.log('PASS all enemy drop wording and stacked quantities')

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
  run(`(() => {
    damageAnims=[]
    const before=rngState
    spawnDamageNumber(40,40,'Enraged!','#fff')
    spawnDamageNumber(40,41,'Hit!','#fff')
    layoutDamageNumbers(performance.now())
    const [upper,lower]=damageAnims
    if(Math.abs(upper.displayY-lower.displayY)<24)throw Error('adjacent combat labels visually overlap')
    damageAnims=[]
    for(const zoom of [16,32,64]) {
      const originalSize=TILE_PX
      TILE_PX=zoom
      damageAnims=[]
      spawnDamageNumber(40,40,'Old','#fff')
      spawnDamageNumber(40,40,'New','#fff')
      layoutDamageNumbers(performance.now())
      if(damageAnims[1].displayY-damageAnims[0].displayY!==24)throw Error('newest must be one line below')
      spawnDamageNumber(40,40,'Delayed','#fff',300)
      layoutDamageNumbers(performance.now())
      if(damageAnims[2].displayY!==undefined)throw Error('pending impact entered layout')
      layoutDamageNumbers(damageAnims[2].start+300)
      if(damageAnims[2].displayY-damageAnims[1].displayY!==24 ||
         damageAnims[1].displayY-damageAnims[0].displayY!==24)throw Error('delayed impact order')
      TILE_PX=originalSize
    }
    if(rngState!==before)throw Error('combat label layout consumed gameplay RNG')
  })()`)
  console.log('PASS staggered combat popups avoid adjacent-tile overlap without RNG')
  console.log('PASS deterministic distant bow reaction replay')
}

main().catch(error => {console.error(error.stack);process.exitCode = 1})
