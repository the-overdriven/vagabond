function beginNewGame(name) {
  cy.visit('/')
  cy.get('#raceName').clear().type(name)
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Player Short Bow', () => {
  it('sells bow and separate ten-arrow bundles; distant shooter loot remains recoverable on the ground', () => {
    cy.viewport(1440, 900)
    beginNewGame('Bow Merchant Tester')
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const bow=merchantStock.find(i=>i.base==='Short Bow')
      const arrows=merchantStock.find(i=>i.kind==='arrows'&&i.bundleSize===10)
      check(bow?.merchantPrice===300,'Short Bow costs 300 gold')
      check(arrows?.merchantPrice===20,'ten-arrow bundle costs 20 gold')
      check(itemSellValue(bow)===30,'Short Bow resells for 30 gold')
      player.gold=400
      player.inventory=[]
      buyItem(bow)
      check(player.gold===100 && player.inventory.some(i=>i.base==='Short Bow'),'buying bow costs 300')
      check(!player.inventory.some(i=>i.kind==='arrows'),'bow purchase gives no free ammunition')
      buyItem(arrows)
      check(player.gold===80 && player.inventory.find(i=>i.kind==='arrows')?.count===10,
        'one bundle adds exactly ten arrows for 20 gold')
      check(merchantStock.includes(arrows),'arrows remain available for later purchases')

      currentZ=0;map=surfaceMap;enemies=[];npcs=[];groundItems=[];occupied=new Set()
      const template=ENEMY_TEMPLATE_BY_NAME.Kobold
      const shooter=addEnemy({...template,id:'bow-loot-shooter',baseName:'Kobold',name:'Kobold',
        x:player.x+2,y:player.y,level:0,alive:true,hp:1,maxHp:1,
        equipment:null,shooterAbility:'shooterArrows',shotsRemaining:4})
      occupied.add(keyXY(shooter.x,shooter.y))
      const oldChance=chance
      try {
        chance=p=>p===RANGED_CONFIG.shortBowDropChance
        killEnemy(shooter,true,'arrow')
      } finally {chance=oldChance}
      check(player.inventory.find(i=>i.kind==='arrows')?.count===10,
        'distant enemy arrows do not teleport into the inventory')
      const drops=groundItems.filter(g=>g.x===shooter.x&&g.y===shooter.y&&g.kind==='droppeditem')
      check(drops.some(g=>g.item.kind==='arrows'&&g.item.count===4) &&
        drops.some(g=>g.item.base==='Short Bow'),'both bow and arrows stack on one corpse tile')
      player.x=shooter.x;player.y=shooter.y
      lootSkeletonOrForage();lootSkeletonOrForage()
      check(player.inventory.find(i=>i.kind==='arrows')?.count===14 &&
        player.inventory.filter(i=>i.base==='Short Bow').length===2,
        'foraging twice recovers both loot entries')
      check([...document.querySelectorAll('#logpanel')].some(el=>el.textContent.includes('4 arrows')),
        'the recovered ammunition appears in the message log')
      const lootText=document.querySelector('#logpanel')?.textContent || ''
      check(lootText.includes('The Kobold dropped Short Bow.') &&
        !lootText.includes('The Kobold dropped a Short Bow.'),
        'ordinary shooter drops use the same article-free item wording')
    })()`))
  })

  it('checks range/obstructions/ammunition and records deterministic shots against enemy IDs', () => {
    cy.viewport(1440, 900)
    beginNewGame('Bow Combat Tester')
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayPlaying=false;replayRecording=false;replayAnimationsDisabled=true
      currentZ=0;currentCave=-1;map=surfaceMap;deathTransition=null
      enemies=[];npcs=[];groundItems=[];occupied=new Set();turnCount=0
      for(let y=36;y<=47;y++)for(let x=36;x<=50;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      player.x=40;player.y=40;player.hp=1000;player.maxHp=1000
      player.rootTurns=0;player.confusionTurns=0;player.berserkTurns=0
      player.godMode=false;player.invisibleTurns=0
      player.equip={weapon:makeShortBowItem(),armor:null,shield:null}
      player.inventory=[createItem('arrows',{count:3})]
      snapCameraToPlayer()
      const t=ENEMY_TEMPLATE_BY_NAME.Goblin
      const enemy=addEnemy({...t,id:'bow-target',name:'Goblin',baseName:'Goblin',x:44,y:40,
        level:0,alive:true,hp:100,maxHp:100,homeX:44,homeY:40,
        homeTileType:'grass',equipment:null,prefix:null,shooterAbility:null,shotsRemaining:0})
      occupied.add(keyXY(enemy.x,enemy.y))
      const oldEnemyTurn=enemyTurn,oldNpcTurn=npcTurn,oldChance=chance,oldDamage=damageRoll
      try {
        enemyTurn=()=>{turnCount++};npcTurn=()=>{}
        chance=()=>false;damageRoll=()=>5
        check(playerBowShotPath(enemy)?.length>1,'visible enemy in range can be shot')
        map[40][42]='mountain'
        check(!shootEnemy(enemy),'mountain blocks arrow')
        check(player.inventory[0].count===3 && turnCount===0,'blocked shot costs no arrows or turn')
        map[40][42]='grass'
        enemy.x=48
        check(!shootEnemy(enemy),'target more than six tiles away cannot be shot')
        enemy.x=44
        player.inventory=[]
        check(!shootEnemy(enemy) && turnCount===0,'no-ammo shot refuses to fire without consuming turn')
        player.inventory=[createItem('arrows',{count:3})]

        startReplayRecording()
        const beforeHp=enemy.hp
        check(shootEnemy(enemy),'legal shot succeeds')
        const afterHp=enemy.hp
        check(afterHp===beforeHp-5,'ranged damage uses fixed five ATK')
        check(enemy.alarmed,'shot immediately alarms its target')
        check(turnCount===1 && player.inventory[0].count===2,'valid shot costs one turn and one arrow')
        const recorded=structuredClone(replayData)
        check(recorded.actions.length===1 && recorded.actions[0].type==='shoot' &&
          recorded.actions[0].targetId==='bow-target','replay tracks the intended enemy identity')
        replayRecording=false
        loadGameFromObject(recorded.initialState,{isReplayInit:true})
        replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
        const target=enemies.find(e=>e.id==='bow-target')
        check(target?.hp===beforeHp,'replay reset restores target health')
        await runReplayAction(recorded.actions[0])
        check(target.hp===afterHp && player.inventory.find(i=>i.kind==='arrows')?.count===2,
          'replaying the shot preserves damage and ammunition')
      } finally {
        enemyTurn=oldEnemyTurn;npcTurn=oldNpcTurn;chance=oldChance;damageRoll=oldDamage
        replayPlaying=false;replaySimulationMode=false;replayRecording=false
      }
    })()`))
  })

  it('makes distant bow targets advance or retreat on their normal turn, including replay', () => {
    cy.viewport(1440, 900)
    beginNewGame('Bow Reaction Tester')
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const oldChance=chance,oldDamage=damageRoll
      try {
        replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true
        currentZ=0;map=surfaceMap;deathTransition=null
        enemies=[];npcs=[];groundItems=[];occupied=new Set()
        player.x=40;player.y=40;player.hp=1000;player.maxHp=1000
        player.baseAtk=2;player.baseDef=2;player.baseSpd=5;player.lvl=1
        player.race='human';player.godMode=false;player.invisibleTurns=0
        player.equip={weapon:makeShortBowItem(),armor:null,shield:null}
        player.inventory=[createItem('arrows',{count:10})]
        for(let y=35;y<=50;y++)for(let x=35;x<=51;x++){
          map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
        }
        snapCameraToPlayer()
        const spawn=(name,id,x=46)=>{
          const template=ENEMY_TEMPLATE_BY_NAME[name]
          const e=addEnemy({...template,id,name,baseName:name,x,y:40,level:0,
            alive:true,hp:template.hp,maxHp:template.hp,homeX:x,homeY:40,
            homeTileType:'grass',shooterAbility:null,shotsRemaining:0,
            equipment:null,prefix:null,sleeping:false})
          occupied.add(keyXY(e.x,e.y))
          return e
        }
        chance=()=>false;damageRoll=()=>1
        const ogre=spawn('Ogre','response-ogre')
        const turn=turnCount
        check(enemyOutmatchesPlayer(ogre)&&shootEnemy(ogre),'strong distant Ogre can be shot')
        check(ogre.x===45&&ogre.y===40&&turnCount===turn+1,
          'Ogre advances exactly once without an extra enemy action')
        enemies=[];occupied=new Set()
        const rat=spawn('Giant Rat','response-rat')
        chance=()=>true
        check(!enemyOutmatchesPlayer(rat)&&shootEnemy(rat),'weak distant Rat can be shot at')
        check(rat.hp===rat.maxHp&&rat.x===47&&rat.y===40,
          'a miss still prompts one-tile retreat')
        map[40][45]='mountain'
        const ratX=rat.x,ratY=rat.y
        check(rat.bowRetreatHold&&bowCoverBlocksPlayerShot(rat),
          'ranged retreat remembers the weak target and cover blocks line of fire')
        enemyTurn(null,null,null)
        check(rat.x===ratX&&rat.y===ratY&&rat.bowRetreatHold,
          'weak target stays behind cover while bow is equipped')
        player.equip.weapon=null
        enemyTurn(null,null,null)
        check(!rat.bowRetreatHold,'unequipping bow ends the cover standoff')
        player.equip.weapon=makeShortBowItem();map[40][45]='grass'
        enemies=[];occupied=new Set()
        const blockedRat=spawn('Giant Rat','response-blocked-rat')
        for(let y=39;y<=41;y++)map[y][47]='mountain'
        check(shootEnemy(blockedRat)&&blockedRat.x===46&&blockedRat.y===39,
          'blocked retreat takes a legal sideways step toward farther ground')
        check(shootEnemy(blockedRat)&&blockedRat.x===47&&blockedRat.y===38,
          'another shot sends the monster around the obstacle')
        enemies=[];occupied=new Set()
        player.baseSpd=30;chance=()=>true
        const pursuer=spawn('Giant Rat','response-shot-pursuer',43)
        pursuer.aware=true;pursuer.alarmed=true
        check(shootEnemy(pursuer)&&pursuer.aware&&pursuer.x===42,
          'just-shot target cannot lose interest even against much faster player')
        player.baseSpd=5;chance=()=>true
        for(let y=39;y<=41;y++)map[y][47]='grass'
        setDesktopCanvasCursor(pursuer)
        check(canvas.style.cursor.includes('red-arrow.svg?v=20261107-slim-nock'),
          'equipped bow uses the red arrow cursor for a legal shot')
        setDesktopCanvasCursor(rat)
        check(canvas.style.cursor.includes('not-allowed'),
          'out-of-range targets show the disabled bow cursor')
        const heldArrows=player.inventory
        player.inventory=[]
        setDesktopCanvasCursor(pursuer)
        check(canvas.style.cursor.includes('not-allowed'),
          'no ammunition disables the bow cursor')
        player.inventory=heldArrows
        map[40][41]='mountain'
        setDesktopCanvasCursor(pursuer)
        check(canvas.style.cursor.includes('not-allowed'),
          'blocked projectile path disables the bow cursor')
        map[40][41]='grass'

        chance=oldChance;damageRoll=oldDamage
        enemies=[];occupied=new Set()
        const replayOgre=spawn('Ogre','response-replay-ogre')
        rngState=918273;startReplayRecording()
        check(shootEnemy(replayOgre),'recorded bow shot resolves')
        const recorded=structuredClone(replayData)
        const expected={x:replayOgre.x,y:replayOgre.y,hp:replayOgre.hp,
          turn:turnCount,arrows:player.inventory.find(i=>i.kind==='arrows')?.count}
        replayRecording=false
        loadGameFromObject(recorded.initialState,{isReplayInit:true})
        replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
        activeReplay=recorded;replayRngIndex=0
        await runReplayAction(recorded.actions[0])
        const restored=enemies.find(e=>e.id==='response-replay-ogre')
        check(restored.x===expected.x&&restored.y===expected.y&&restored.hp===expected.hp&&
          turnCount===expected.turn&&player.inventory.find(i=>i.kind==='arrows')?.count===expected.arrows,
          'replay restores the same distant response and ammunition')
        check(replayRngIndex===recorded.rng.length,'replay uses identical RNG outcomes')
      } finally {
        chance=oldChance;damageRoll=oldDamage;replayPlaying=false;replaySimulationMode=false
        replayRecording=false;activeReplay=null
      }
    })()`))
  })

  it('clears the mobile inspection target immediately after a fatal ranged hit', () => {
    cy.viewport(390, 844)
    beginNewGame('Mobile Bow Tester')
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const oldChance=chance,oldDamage=damageRoll,oldEnemyTurn=enemyTurn,oldNpcTurn=npcTurn
      try {
        replayAnimationsDisabled=true;currentZ=0;currentCave=-1;map=surfaceMap
        enemies=[];npcs=[];groundItems=[];occupied=new Set();deathTransition=null
        player.x=40;player.y=40;player.godMode=false;player.invisibleTurns=0
        player.equip={weapon:makeShortBowItem(),armor:null,shield:null}
        player.inventory=[createItem('arrows',{count:3})]
        for(let y=37;y<=44;y++)for(let x=37;x<=46;x++){
          map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
        }
        const t=ENEMY_TEMPLATE_BY_NAME.GiantRat || ENEMY_TEMPLATE_BY_NAME['Giant Rat']
        const enemy=addEnemy({...t,id:'mobile-bow-target',name:'Giant Rat',baseName:'Giant Rat',
          x:43,y:40,level:0,alive:true,hp:1,maxHp:1,homeX:43,homeY:40,
          equipment:null,shooterAbility:null,shotsRemaining:0})
        occupied.add(keyXY(43,40))
        updateMobileInfoPanel(43,40)
        check(mobileInfoPanel._inspectedEnemy===enemy,'mobile info panel inspects living target')
        chance=()=>false;damageRoll=()=>5;enemyTurn=()=>{turnCount++};npcTurn=()=>{}
        check(shootEnemy(enemy)&&!enemy.alive,'bow kills inspected monster')
        check(mobileInfoPanel._inspectedEnemy===null,
          'fatal ranged hit clears the stale mobile monster inspection')
      } finally {
        chance=oldChance;damageRoll=oldDamage;enemyTurn=oldEnemyTurn;npcTurn=oldNpcTurn
      }
    })()`))
  })

  it('renders a falling enemy tile after arrow impact and its glyph in ASCII mode', () => {
    cy.viewport(1440, 900)
    beginNewGame('Death Animation Tester')
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const original={drawImageVisual,fillText:ctx.fillText,USE_TILE_IMAGES,replayAnimationsDisabled}
      try {
        currentZ=0;map=surfaceMap;player.x=40;player.y=40
        for(let y=37;y<=45;y++)for(let x=37;x<=47;x++){
          map[y][x]='grass';discovered[y][x]=true;grasslandTrees.delete(keyXY(x,y))
        }
        enemies=[];npcs=[];groundItems=[];occupied=new Set();fxAnims=[];projectileAnims=[]
        replayAnimationsDisabled=true;USE_TILE_IMAGES=true
        const victim={name:'Giant Rat',baseName:'Giant Rat',tier:1,x:43,y:40}
        spawnDeathAnim(victim,350)
        const effect=fxAnims[0];check(!!effect.visual,'death stores a tile visual')
        let spriteDraws=0,glyphDraws=0,visibleAlpha=[]
        drawImageVisual=(x,y,visual,alpha)=>{
          if(visual===effect.visual){spriteDraws++;visibleAlpha.push(ctx.globalAlpha);return true}
          return original.drawImageVisual(x,y,visual,alpha)
        }
        ctx.fillText=(value,...args)=>{
          if(value===effect.ch)glyphDraws++
          return original.fillText.call(ctx,value,...args)
        }
        renderScene(effect.start-1)
        check(spriteDraws>0&&visibleAlpha.at(-1)===1,
          'lethal ranged target remains full-size and visible during arrow flight')
        const heldSpriteDraws=spriteDraws
        renderScene(effect.start+80)
        check(spriteDraws>heldSpriteDraws&&visibleAlpha.at(-1)<1&&glyphDraws===0,
          'tile sprite falls and fades only after impact')
        const beforeAscii=spriteDraws
        USE_TILE_IMAGES=false;renderScene(effect.start+150)
        check(spriteDraws===beforeAscii&&glyphDraws>0,'ASCII mode uses falling glyph only')
      } finally {
        drawImageVisual=original.drawImageVisual;ctx.fillText=original.fillText
        USE_TILE_IMAGES=original.USE_TILE_IMAGES
        replayAnimationsDisabled=original.replayAnimationsDisabled
      }
    })()`))
  })
})
