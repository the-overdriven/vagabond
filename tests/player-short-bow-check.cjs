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
    const weak=spawn('Giant Rat','bow-weak')
    check(!enemyOutmatchesPlayer(weak),'Rat is weaker than the player')
    chance=()=>true
    check(shootEnemy(weak),'shoots at Giant Rat')
    check(weak.hp===weak.maxHp&&weak.x===47&&weak.y===40,
      'even a missed arrow drives a weaker target away despite a path to the player')
    reset();chance=()=>false
    const cornered=spawn('Giant Rat','bow-cornered')
    for(let y=30;y<=50;y++)map[y][45]='dwarvenprisonbars'
    for(let y=39;y<=41;y++)map[y][47]='mountain'
    check(playerBowShotPath(cornered)&&!enemyFindStep(cornered,true),
      'bars allow arrows through but prevent approaching the player')
    check(shootEnemy(cornered)&&cornered.x===46&&cornered.y===39,
      'blocked retreat first moves sideways along a legal escape route')
    check(shootEnemy(cornered)&&cornered.x===47&&cornered.y===38,
      'a second shot drives the monster farther around the obstacle')
    for(let y=39;y<=41;y++)map[y][47]='grass'
    reset()
    const isolated=spawn('Giant Rat','bow-isolated')
    for(let y=39;y<=41;y++){
      map[y][46]=y===40?'grass':'mountain'
      map[y][47]='mountain'
    }
    check(!enemyFindStep(isolated,true)&&!rangedRetreatDestination(isolated),
      'fully isolated Rat has neither an approach route nor an escape route')
    check(shootEnemy(isolated)&&isolated.x===46&&isolated.y===40,
      'isolated target cannot move through bars or solid walls')
    for(let y=30;y<=50;y++)map[y][45]='grass'
    for(let y=39;y<=41;y++){
      map[y][46]='grass';map[y][47]='grass'
    }
    reset()
    const trapped=spawn('Ghoul','bow-trapped-ghoul')
    player.baseAtk=70
    trapped.bowRetreatHold=true
    for(let y=39;y<=41;y++){
      map[y][46]=y===40?'grass':'mountain'
      map[y][47]='mountain'
    }
    check(enemyFindStep(trapped,true)&&!rangedRetreatDestination(trapped),
      'cornered Ghoul has a route to the player but no legal retreat')
    check(shootEnemy(trapped)&&trapped.x===45&&trapped.y===40&&
      !trapped.bowRetreatHold,
      'cornered Ghoul abandons cover hold and approaches on the shot turn')
    const corneredSave=buildSaveObject()
    check(corneredSave.enemies.find(e=>e.id===trapped.id).x===45,
      'save preserves the cornered Ghoul position')
    loadGameFromObject(corneredSave,{isReplayInit:true})
    replayAnimationsDisabled=true
    const restoredGhoul=enemies.find(e=>e.id==='bow-trapped-ghoul')
    check(restoredGhoul.x===45&&enemyFindStep(restoredGhoul,true),
      'load restores a Ghoul that can still approach')
    chance=realChance;damageRoll=realDamageRoll
    rngState=617293;startReplayRecording()
    check(shootEnemy(restoredGhoul)&&restoredGhoul.x===45&&restoredGhoul.y===39,
      'a second shot sends the now-escapable weak Ghoul sideways, not back into its dead end')
    window.__corneredBowRecord=structuredClone(replayData)
    window.__corneredBowExpected={x:restoredGhoul.x,y:restoredGhoul.y,
      hp:restoredGhoul.hp,turn:turnCount}
    replayRecording=false;chance=()=>false;damageRoll=()=>1
    for(let y=39;y<=41;y++){
      map[y][46]='grass';map[y][47]='grass'
    }
    player.baseAtk=2
    reset()
    const near=spawn('Giant Rat','bow-near',44)
    check(shootEnemy(near)&&near.x===45&&near.y===40,
      'weak target flees even inside effective AGGRO when escape is possible')
    reset()
    player.baseAtk=70
    const gargoyle=spawn('Gargoyle','bow-gargoyle',44)
    for(let y=30;y<=50;y++)map[y][42]='dwarvenprisonbars'
    check(!enemyFindStep(gargoyle,true)&&playerBowShotPath(gargoyle),
      'bars block the Gargoyle approach without blocking arrows')
    check(shootEnemy(gargoyle)&&gargoyle.x===45&&gargoyle.y===40,
      'shot Gargoyle retreats behind bars even inside AGGRO')
    player.baseAtk=2
    reset()
    const strongerBlocked=spawn('Gargoyle','bow-strong-blocked',44)
    check(!enemyFindStep(strongerBlocked,true)&&shootEnemy(strongerBlocked)&&strongerBlocked.x===45,
      'combat strength does not override an impassable barrier')
    for(let y=30;y<=50;y++)map[y][42]='grass'
    reset()
    const strongNear=spawn('Gargoyle','bow-strong-near',44)
    check(enemyFindStep(strongNear,true)&&shootEnemy(strongNear)&&strongNear.x===43,
      'reachable target inside AGGRO still advances to fight')
    reset()
    player.baseAtk=70
    const shooter=spawn('Kobold','bow-armed-shooter',43)
    shooter.shooterAbility='shooterArrows';shooter.shotsRemaining=2
    check(!enemyOutmatchesPlayer(shooter)&&shootEnemy(shooter)&&shooter.x===44&&shooter.shotsRemaining===2,
      'weaker ranged shooters also withdraw when an escape exists')
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

  await run(`(async () => {
    const check=(ok,msg)=>{if(!ok)throw Error(msg)}
    const record=window.__corneredBowRecord, expected=window.__corneredBowExpected
    loadGameFromObject(record.initialState,{isReplayInit:true})
    replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
    activeReplay=record;replayRngIndex=0
    try {
      const ghoul=enemies.find(e=>e.id==='bow-trapped-ghoul')
      check(ghoul?.x===45&&enemyFindStep(ghoul,true),'replay starts with a reachable Ghoul')
      await runReplayAction(record.actions[0])
      check(ghoul.x===expected.x&&ghoul.y===expected.y&&ghoul.hp===expected.hp&&
        turnCount===expected.turn,
        'replay preserves the cornered Ghoul response')
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
    const t=ENEMY_TEMPLATE_BY_NAME['Giant Rat']
    const rat=addEnemy({...t,id:'shot-disengage',baseName:'Giant Rat',name:'Giant Rat',
      x:43,y:40,level:0,alive:true,hp:60,maxHp:60,aggro:4,
      equipment:null,shooterAbility:null,shotsRemaining:0,
      aware:true,alarmed:true,alarmedZ:0,alarmedLevelKind:currentLevelKind(),wander:false})
    occupied.add(keyXY(rat.x,rat.y))
    const oldChance=chance
    try {
      chance=()=>true
      enemyTurn(null,null,rat)
      check(rat.aware && rat.x===44,'recently shot weaker target flees without disengaging')
      rat.x=43;rat.aware=true;rat.alarmed=true;occupied=new Set([keyXY(43,40)])
      enemyTurn(null,null,null)
      check(!rat.aware&&!rat.alarmed,'ordinary turn still allows SPD disengagement')
    } finally {chance=oldChance}
    enemies=[];occupied=new Set()
    const covered=addEnemy({...t,id:'shot-covered',baseName:'Giant Rat',name:'Giant Rat',
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
      enemyTemplateForSavedEnemy=()=>({lootTable:[{chance:1,items:[{kind:'chitin',count:1}]}]})
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
      enemyTemplateForSavedEnemy=()=>({lootTable:[{chance:1,items:[{kind:'chitin',count:3}]}]})
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
  console.log('PASS deterministic distant bow reaction replay')
}

main().catch(error => {console.error(error.stack);process.exitCode = 1})
