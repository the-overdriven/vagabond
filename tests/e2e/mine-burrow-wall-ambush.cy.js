describe('Mine creatures: hidden Burrow and Wall Ambush',()=>{
  it('hides Marsutal for two complete responses, preserves its state, and keeps its landing secret',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__mineAbilitySave=save
        win.eval(`(() => {
          loadGameFromObject(window.__mineAbilitySave,{isReplayInit:true})
          const check=(ok,msg)=>{if(!ok)throw Error(msg)}
          enemies=[];occupied=new Set();currentZ=0;currentCave=-1;map=surfaceMap
          turnCount=40;player.x=40;player.y=40;player.invisibleTurns=0
          for(let y=36;y<=44;y++)for(let x=36;x<=44;x++)map[y][x]='grass'
          const t=ENEMY_TEMPLATE_BY_NAME.Marsutal
          const m=addEnemy({...t,name:'Marsutal',baseName:'Marsutal',x:42,y:40,
            homeX:42,homeY:40,homeTileType:'grass',alive:true,
            level:0,levelKind:null,hp:t.hp,maxHp:t.hp,equipment:null})
          occupied.add(keyXY(42,40))
          const oldChance=chance,oldHidden=playerHiddenFromEnemy
          const oldAttack=enemyAttackPlayer,oldUnderground=undergroundTileVisible
          const oldSanctuary=playerInsideSanctuary,oldEnemySanctuary=enemyInsideSanctuary
          const oldImages=USE_TILE_IMAGES
          try {
            chance=()=>true;playerHiddenFromEnemy=()=>false;undergroundTileVisible=()=>true
            playerInsideSanctuary=()=>false;enemyInsideSanctuary=()=>false
            let attacks=0;enemyAttackPlayer=()=>{attacks++}
            check(tryPrepareEnemyBurrow(m),'eligible monster prepares a Burrow')
            check(m.x===-1 && m.y===-1 && !occupied.has(keyXY(42,40)),
              'monster instantly leaves its original walkable tile')
            check(!enemyCanBeSeen(m) && m.pendingAbility.tiles.length===0,
              'buried monster is invisible without a landing warning')
            USE_TILE_IMAGES=true;render()
            USE_TILE_IMAGES=false;render()
            const stored=JSON.parse(JSON.stringify(buildSaveObject()))
            loadGameFromObject(stored,{isReplayInit:true})
            const restored=enemies.find(e=>e.id===m.id)
            check(restored && !occupied.has(keyXY(42,40)),
              'restore does not reserve the vacated origin')
            check(!occupied.has(keyXY(-1,-1)) && !enemyCanBeSeen(restored),
              'save restore keeps underground state')
            turnCount=41;resolveEnemyTelegraphIfPending(restored)
            turnCount=42;resolveEnemyTelegraphIfPending(restored)
            check(restored.x===-1 && attacks===0,'both player responses remain safe from eruption')
            turnCount=43;resolveEnemyTelegraphIfPending(restored)
            check(restored.x>=0 && restored.pendingAbility===null,
              'the third enemy phase emerges on a legal tile')
            check(attacks===1,'adjacent emergence grants only one attack')
          } finally {
            chance=oldChance;playerHiddenFromEnemy=oldHidden
            enemyAttackPlayer=oldAttack;undergroundTileVisible=oldUnderground
            playerInsideSanctuary=oldSanctuary;enemyInsideSanctuary=oldEnemySanctuary
            USE_TILE_IMAGES=oldImages
          }
        })()`)
        delete win.__mineAbilitySave
      })
    })
  })

  it('warns before the hidden Trogloraptor strikes and prevents bump counterattacks',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__mineAbilitySave=save
        win.eval(`(() => {
          loadGameFromObject(window.__mineAbilitySave,{isReplayInit:true})
          const check=(ok,msg)=>{if(!ok)throw Error(msg)}
          enemies=[];occupied=new Set();currentZ=0;currentCave=-1;map=surfaceMap
          turnCount=70;player.x=40;player.y=40
          for(let y=36;y<=44;y++)for(let x=36;x<=44;x++)map[y][x]='grass'
          const t=ENEMY_TEMPLATE_BY_NAME.Trogloraptor
          const e=addEnemy({...t,name:'Trogloraptor',baseName:'Trogloraptor',
            x:41,y:40,level:0,alive:true,hp:t.hp,maxHp:t.hp,
            wallAmbushHidden:true,wallAmbushSpent:false,equipment:null})
          const oldSight=enemyHasSight,oldUnderground=undergroundTileVisible
          const oldAttack=enemyAttackPlayer
          const oldSanctuary=playerInsideSanctuary,oldEnemySanctuary=enemyInsideSanctuary
          try {
            enemyHasSight=()=>true;undergroundTileVisible=()=>true
            playerInsideSanctuary=()=>false;enemyInsideSanctuary=()=>false
            let attacks=0;enemyAttackPlayer=()=>{attacks++}
            check(!enemyCanBeSeen(e),'Trogloraptor starts concealed')
            check(tryPrepareEnemyWallAmbush(e),'approach causes a visible warning')
            check(!enemyCanBeSeen(e),'the warning is not a premature reveal')
            const pending=JSON.parse(JSON.stringify(buildSaveObject()))
            loadGameFromObject(pending,{isReplayInit:true})
            const restored=enemies.find(a=>a.id===e.id)
            check(restored.wallAmbushHidden && restored.pendingAbility?.type==='wallAmbush',
              'concealment and warning survive restoration')
            turnCount=71;resolveEnemyTelegraphIfPending(restored)
            check(enemyCanBeSeen(restored) && restored.wallAmbushSpent,
              'monster emerges after the response action')
            check(attacks===1,'emergence makes one immediate attack')
            restored.wallAmbushHidden=true;restored.wallAmbushSpent=false
            restored.pendingAbility=null;turnCount=80;attacks=0
            revealEnemyWallAmbush(restored,true)
            check(restored.wallAmbushNoActionTurn===81 && attacks===0,
              'a player bump exposes the creature but grants no free hit')
          } finally {
            enemyHasSight=oldSight;undergroundTileVisible=oldUnderground
            enemyAttackPlayer=oldAttack
            playerInsideSanctuary=oldSanctuary;enemyInsideSanctuary=oldEnemySanctuary
          }
        })()`)
        delete win.__mineAbilitySave
      })
    })
  })

  it('spawns a concealed Trogloraptor on the thirteenth distinct mineral extraction, once per run',()=>{
    cy.visit('/')
    cy.get('#raceName').clear().type('Mine Ambush Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.window().then(win=>win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const oldPick=pick
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const mine=dungeonPackageLevels('dwarvenMines')
        check(mine.length>=2,'world contains a second mine floor')
        const level=mine[1].level
        currentZ=mine[1].z;currentCave=-1
        map=level.map;undergroundDiscovered=level.discovered
        map=Array.from({length:MAP_H},()=>Array(MAP_W).fill('cavewall'))
        level.map=map;level.caveMaps[0]=map
        for(let y=34;y<=36;y++)for(let x=22;x<=52;x++)map[y][x]='cavefloor2'
        level.mineUpstairs={x:15,y:15};level.mineDownstairs={x:60,y:60}
        level.mineCagePad={x:70,y:70};level.mineExcavations=[]
        player.x=26;player.y=35;player.hp=player.maxHp
        player.inventory.push({kind:'pickaxe'})
        player.miningTutorialSeen=true;player.mining=100
        enemies=enemies.filter(e=>e.level!==currentZ)
        rebuildActiveLevelOccupancy()
        pick=(arr)=>arr[0]
        for(let i=0;i<12;i++)
          check(!AdaptivePlayerTrolling.onMineMineralExtracted(27,35),
            'less than thirteen unique mineral deposits cannot trigger the ambush')
        check(AdaptivePlayerTrolling.serialize().extractedMineralDeposits===12,
          'mineral extraction counter reaches twelve')
        const deferred=AdaptivePlayerTrolling.serialize()
        AdaptivePlayerTrolling.reset()
        AdaptivePlayerTrolling.restore(deferred)
        // The mineral is extracted by the actual gameplay path, not merely by
        // calling the adaptive hook directly.
        map[35][27]='cavewall'
        const mineral={x:27,y:35,kind:'embedded',mineral:'quartz',hardness:'weak',
          progress:0,threshold:0,removed:false}
        level.mineExcavations.push(mineral)
        check(Mining.strike(27,35)==='strike' && mineral.removed,
          'the thirteenth real mineral extraction completes')
        const ambushers=enemies.filter(e=>e.adaptiveEventId==='trogloraptor_ambush')
        check(ambushers.length===1,'one adaptive Trogloraptor emerges')
        const r=ambushers[0]
        check(r.baseName==='Trogloraptor' && r.abilities.includes('wallAmbush') &&
          r.wallAmbushHidden && !r.wallAmbushSpent && !enemyCanBeSeen(r),
          'monster inherits its concealed wall-ambush ability')
        check(enemyWallAmbushWallAt(map,r.x,r.y) &&
          Math.max(Math.abs(r.x-27),Math.abs(r.y-35))<=10,
          'ambusher hides close to the extracted deposit, beside a solid wall')
        check(AdaptivePlayerTrolling.serialize().extractedMineralDeposits===13 &&
          AdaptivePlayerTrolling.serialize().floorThreats['chain:'+currentZ+':-1']===1,
          'event consumes exactly one floor slot')
        const stored=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(stored,{isReplayInit:true})
        const restored=enemies.find(e=>e.adaptiveEventId==='trogloraptor_ambush')
        check(restored?.wallAmbushHidden && restored?.alive &&
          AdaptivePlayerTrolling.completed('trogloraptor_ambush'),
          'save/replay restores ambush concealment and prevents duplicates')
        check(!AdaptivePlayerTrolling.onMineMineralExtracted(27,35) &&
          enemies.filter(e=>e.adaptiveEventId==='trogloraptor_ambush').length===1,
          'continued mining never spawns a second adaptive ambusher')
      } finally {pick=oldPick;loadGameFromObject(before)}
    })()`))
  })


  it('awakens the Depth Guardian only after 30 broken mine walls and five safe turns',()=>{
    cy.visit('/')
    cy.get('#raceName').clear().type('Depth Guardian Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.window().then(win=>win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const mine=dungeonPackageLevels('dwarvenMines')[1]
        check(!!mine?.level,'second mine floor exists')
        const level=mine.level
        currentZ=mine.z;currentCave=-1
        map=Array.from({length:MAP_H},()=>Array(MAP_W).fill('cavewall'))
        for(let y=33;y<=37;y++)for(let x=16;x<=65;x++)map[y][x]='cavefloor2'
        map[35][27]='cavewall'
        level.map=map;level.caveMaps[0]=map
        level.mineUpstairs={x:5,y:5};level.mineDownstairs={x:70,y:70}
        level.mineCagePad={x:73,y:73};level.mineExcavations=[]
        player.x=25;player.y=35;player.mining=100
        player.miningTutorialSeen=true;player.miningArmedTarget=null
        player.inventory.push({kind:'pickaxe'})
        enemies=enemies.filter(e=>e.level!==currentZ)
        rebuildActiveLevelOccupancy()
        for(let i=0;i<29;i++)AdaptivePlayerTrolling.onMineWallBroken()
        check(AdaptivePlayerTrolling.serialize().mineWallsBroken===29 &&
          AdaptivePlayerTrolling.serialize().depthGuardianWarning===null,
          '29 destroyed walls do not awaken the guardian')
        turnCount=250
        const target={x:27,y:35,kind:'wall',hardness:'weak',
          progress:0,threshold:0,removed:false}
        level.mineExcavations.push(target)
        let strikes=0
        while(!target.removed && strikes++<20)
          check(Mining.strike(27,35)==='strike','mine wall can be struck')
        check(target.removed && AdaptivePlayerTrolling.serialize().mineWallsBroken===30 &&
          AdaptivePlayerTrolling.serialize().depthGuardianWarning?.startedAtTurn===250 &&
          AdaptivePlayerTrolling.serialize().triggerFlags.depth_guardian,
          'real mining action arms the five-turn warning on the proper floor')
        const pending=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(pending,{isReplayInit:true})
        check(AdaptivePlayerTrolling.serialize().depthGuardianWarning?.startedAtTurn===250,
          'warning persists through save and replay restoration')
        for(let t=251;t<=254;t++) {
          turnCount=t;AdaptivePlayerTrolling.onWorldTurn()
          check(!enemies.some(e=>e.adaptiveEventId==='depth_guardian'),
            'no guardian before the fifth complete world turn')
        }
        turnCount=255;AdaptivePlayerTrolling.onWorldTurn()
        const golems=enemies.filter(e=>e.adaptiveEventId==='depth_guardian')
        check(golems.length===1 && golems[0].name==='Guardian of the Deep' &&
          golems[0].family==='construct' && golems[0].hp===120,
          'one genuine guardian spawns with the configured construct stats')
        check(!undergroundTileVisible(golems[0].x,golems[0].y) &&
          Math.max(Math.abs(golems[0].x-player.x),Math.abs(golems[0].y-player.y))>=10,
          'guardian spawns on connected terrain outside sight')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        check(AdaptivePlayerTrolling.completed('depth_guardian') &&
          enemies.filter(e=>e.adaptiveEventId==='depth_guardian').length===1,
          'completed special threat survives replay and cannot repeat')
        USE_TILE_IMAGES=true;render()
        USE_TILE_IMAGES=false;render()
      } finally {loadGameFromObject(before)}
    })()`))
  })

})
