function beginNewGame(name) {
  cy.visit('/')
  cy.get('#raceName').clear().type(name)
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Player Short Bow', () => {
  it('loads both bows from the ranged catalog and gives the tier-three Hunting Bow seven ranged ATK', () => {
    beginNewGame('Hunting Bow Tester')
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const short=WEAPONS.find(w=>w.name==='Short Bow')
      const hunting=WEAPONS.find(w=>w.name==='Hunting Bow')
      check(short?.tier===1&&short.rangedAtk===5&&short.rangedRange===6,'short bow is unchanged')
      check(hunting?.tier===3&&hunting.rangedAtk===7&&hunting.rangedRange===6,'Hunting Bow stats')
      const bow=makeBowItem('Hunting Bow')
      check(bow.twoHanded&&bow.rangedAtk===7&&bow.atk===2&&bow.baseValue===600,'Hunting Bow item')
      player.equip={weapon:bow,armor:null,shield:null}
      check(equippedShortBow()===bow,'all ranged bows activate shooting')
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(saved,{isReplayInit:true})
      check(player.equip.weapon.base==='Hunting Bow'&&equippedShortBow()?.rangedAtk===7,
        'Hunting Bow survives save and replay restoration')
    })()`))
  })
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
        lastMousePx=(enemy.x-camX+0.5)*TILE_PX
        lastMousePy=(enemy.y-camY+0.5)*TILE_PX
        updateTooltip()
        check(canvas.style.cursor.includes('red-arrow.svg'),
          'cursor is enabled before a valid shot')
        check(shootEnemy(enemy),'legal shot succeeds')
        const afterHp=enemy.hp
        check(afterHp===beforeHp-5,'ranged damage uses fixed five ATK')
        check(canvas.style.cursor.includes('red-arrow.svg'),
          'cursor refreshes immediately after a shot if ammunition and line of fire remain')
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
        player.inventory=[createItem('arrows',{count:30})]
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
        check(shootEnemy(ogre),'distant Ogre can be shot')
        check(ogre.x===45&&ogre.y===40&&turnCount===turn+1,
          'Ogre advances exactly once without an extra enemy action')
        enemies=[];occupied=new Set()
        const rat=spawn('Giant Rat','response-rat')
        chance=()=>true
        check(!enemyOutmatchesPlayer(rat),'Rat is weaker than the player')
        check(shootEnemy(rat),'distant Rat can be shot at')
        check(rat.hp===rat.maxHp&&rat.x===47&&rat.y===40,
          'an immediate one-step escape beyond range is safe even on a miss')
        enemies=[];occupied=new Set()
        const covered=spawn('Giant Rat','response-covered-rat')
        for(let y=30;y<=50;y++)map[y][45]='dwarvenprisonbars'
        check(!enemyFindStep(covered,true)&&shootEnemy(covered)&&covered.x===47,
          'Rat behind bars retreats even without a strength disadvantage')
        map[40][45]='mountain'
        const ratX=covered.x,ratY=covered.y
        check(covered.bowRetreatHold&&bowCoverBlocksPlayerShot(covered),
          'ranged retreat remembers the blocked target and cover blocks line of fire')
        enemyTurn(null,null,null)
        check(covered.x===ratX&&covered.y===ratY&&covered.bowRetreatHold,
          'blocked target stays behind cover while bow is equipped')
        player.equip.weapon=null
        enemyTurn(null,null,null)
        check(!covered.bowRetreatHold,'unequipping bow ends the cover standoff')
        player.equip.weapon=makeShortBowItem()
        for(let y=30;y<=50;y++)map[y][45]='grass'
        enemies=[];occupied=new Set()
        const blockedRat=spawn('Giant Rat','response-blocked-rat')
        for(let y=30;y<=50;y++)map[y][45]='dwarvenprisonbars'
        for(let y=39;y<=41;y++)map[y][47]='mountain'
        check(playerBowShotPath(blockedRat)&&!enemyFindStep(blockedRat,true),
          'prison bars pass arrows but block a complete pursuit route')
        check(shootEnemy(blockedRat)&&blockedRat.x===46&&blockedRat.y===40,
          'blocked target refuses an exposed sideways escape route')
        check(shootEnemy(blockedRat)&&blockedRat.x===46&&blockedRat.y===40,
          'repeated bow shots do not trigger futile exposed retreat')
        enemies=[];occupied=new Set()
        const isolated=spawn('Giant Rat','response-isolated-rat')
        for(let y=39;y<=41;y++)map[y][46]=y===40?'grass':'mountain'
        check(!enemyFindStep(isolated,true)&&!rangedRetreatDestination(isolated),
          'Rat isolated behind bars has no approach or retreat path')
        check(shootEnemy(isolated)&&isolated.x===46&&isolated.y===40,
          'isolated Rat cannot walk through bars or solid walls')
        for(let y=30;y<=50;y++)map[y][45]='grass'
        for(let y=39;y<=41;y++){
          map[y][46]='grass';map[y][47]='grass'
        }
        enemies=[];occupied=new Set()
        const trappedRat=spawn('Giant Rat','response-trapped-rat')
        player.baseAtk=70;chance=()=>false
        trappedRat.bowRetreatHold=true
        for(let y=39;y<=41;y++){
          map[y][46]=y===40?'grass':'mountain'
          map[y][47]='mountain'
        }
        check(enemyFindStep(trappedRat,true)&&!rangedRetreatDestination(trappedRat),
          'cornered Rat has a route to the player but no way to escape')
        check(shootEnemy(trappedRat)&&trappedRat.x===45&&trappedRat.y===40&&
          !trappedRat.bowRetreatHold,
          'trapped Rat turns toward the player on the first shot')
        check(shootEnemy(trappedRat)&&trappedRat.x===44&&trappedRat.y===40,
          'Rat continues advancing when the alternative requires an exposed first step')
        for(let y=39;y<=41;y++){
          map[y][46]='grass';map[y][47]='grass'
        }
        // Undead ignore ranged threat strength even when hopelessly outmatched.
        player.baseAtk=70
        for(const name of ['Skeleton','Ghoul','Ghost']){
          enemies=[];occupied=new Set()
          const undead=spawn(name,'fearless-'+name,44)
          undead.invisibleUntilTurn=0;undead.invisibilityReadyTurn=999999
          undead.bowRetreatHold=true
          check(shootEnemy(undead)&&undead.x===43&&!undead.bowRetreatHold,
            name+' advances instead of seeking cover from an overpowered archer')
        }
        enemies=[];occupied=new Set()
        const blockedUndead=spawn('Ghoul','fearless-blocked',44)
        for(let y=30;y<=55;y++)map[y][42]='dwarvenprisonbars'
        check(!enemyFindStep(blockedUndead,true)&&playerBowShotPath(blockedUndead),
          'undead cannot cross bars but can be targeted with arrows')
        check(shootEnemy(blockedUndead)&&blockedUndead.x<=44&&!blockedUndead.bowRetreatHold,
          'blocked undead stays fearless and does not retreat')
        for(let y=30;y<=55;y++)map[y][42]='grass'
        player.baseAtk=2
        enemies=[];occupied=new Set()
        const gargoyle=spawn('Gargoyle','response-gargoyle',44)
        player.baseAtk=70
        for(let y=30;y<=50;y++)map[y][42]='dwarvenprisonbars'
        check(!enemyFindStep(gargoyle,true)&&playerBowShotPath(gargoyle),
          'the Gargoyle is behind bars, though arrows reach it')
        check(shootEnemy(gargoyle)&&gargoyle.x===44,
          'Gargoyle cannot retreat through exposed tiles behind bars')
        player.baseAtk=2
        enemies=[];occupied=new Set()
        const strongerBlocked=spawn('Gargoyle','response-strong-blocked-gargoyle',44)
        check(!enemyFindStep(strongerBlocked,true)&&shootEnemy(strongerBlocked)&&strongerBlocked.x===44,
          'even a stronger Gargoyle stays blocked without safe retreat')
        for(let y=30;y<=50;y++)map[y][42]='grass'
        enemies=[];occupied=new Set()
        const strongNear=spawn('Gargoyle','response-strong-gargoyle',44)
        check(enemyFindStep(strongNear,true)&&shootEnemy(strongNear)&&strongNear.x===43,
          'Gargoyle with a route pursues within AGGRO')
        enemies=[];occupied=new Set()
        player.baseSpd=30;chance=()=>true
        const pursuer=spawn('Giant Rat','response-shot-pursuer',43)
        pursuer.aware=true;pursuer.alarmed=true
        check(shootEnemy(pursuer)&&pursuer.aware&&pursuer.x===42,
          'just-shot weaker target approaches without an immediate safe escape')
        player.baseSpd=5;chance=()=>true
        for(let y=39;y<=41;y++)map[y][47]='grass'
        setDesktopCanvasCursor(pursuer)
        check(canvas.style.cursor.includes('red-arrow.svg?v=20261107-slim-nock'),
          'equipped bow uses the red arrow cursor for a legal shot')
        const farAway=spawn('Giant Rat','response-far-rat',49)
        setDesktopCanvasCursor(farAway)
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

        // Cover, not distance, is the preferred response to a player arrow.
        enemies=[];occupied=new Set();player.baseAtk=70;player.baseSpd=5
        for(let y=35;y<=50;y++)for(let x=35;x<=51;x++){
          map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
        }
        map[41][42]='mountain'
        const shelterRat=spawn('Giant Rat','response-shelter-rat',44)
        chance=()=>true
        check(!!playerBowShotPath(shelterRat),'shot begins with clear line to rat')
        check(rangedRetreatDestination(shelterRat).x===44&&
          rangedRetreatDestination(shelterRat).y===41,
          'rat selects hiding behind mountain instead of fleeing east in full view')
        check(shootEnemy(shelterRat)&&shelterRat.x===44&&shelterRat.y===41&&
          !playerBowShotPath(shelterRat),'even a miss sends rat out of line of fire')
        enemyTurn(null,null,null)
        check(shelterRat.x===44&&shelterRat.y===41,'rat keeps its cover')
        player.x=42;player.y=39
        check(!!playerBowShotPath(shelterRat),'new shooting angle exposes the rat')
        enemyTurn(null,null,null);enemyTurn(null,null,null)
        check(!shelterRat.bowRetreatHold,
          're-exposed rat gives up retreat when the path to cover is exposed')
        player.x=40;player.y=40;map[41][42]='grass'
        // Distant mountain shelter cannot justify a first step through a
        // tile the player can still shoot. Fight instead of fleeing endlessly.
        enemies=[];occupied=new Set()
        map[42][43]='mountain'
        const exposedRat=spawn('Giant Rat','response-distant-cover-rat',44)
        check(playerBowShotPath(exposedRat)&&bowCoverBlocksPlayerShotAt(44,43)&&
          !bowCoverBlocksPlayerShotAt(44,41),
          'a sheltered tile exists but the approach is in the bow firing lane')
        check(!rangedRetreatDestination(exposedRat),
          'a retreat path crossing an exposed step is not considered safe')
        check(shootEnemy(exposedRat)&&exposedRat.x===43&&exposedRat.y===40&&
          !exposedRat.bowRetreatHold,
          'weaker monster closes to fight instead of giving free shots')
        map[42][43]='grass'
        enemies=[];occupied=new Set()
        const edgeRat=spawn('Giant Rat','response-edge-rat',46)
        check(shootEnemy(edgeRat)&&edgeRat.x===47&&edgeRat.bowRetreatHold,
          'first range escape takes exactly one safe step')
        player.x=41
        enemyTurn(null,null,null)
        check(edgeRat.x===46&&!edgeRat.bowRetreatHold,
          'moving after a range escape causes pursuit, not endless open-field flight')
        player.x=40

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
