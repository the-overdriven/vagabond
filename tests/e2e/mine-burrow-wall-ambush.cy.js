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
})
