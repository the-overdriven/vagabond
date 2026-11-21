describe('Naledi scout alert lifecycle',()=>{
  it('holds an alert while the scout lives and secures it after regrouping',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__nalediAlertSave=save
        win.eval(`(()=>{
          const check=(condition,message)=>{if(!condition)throw Error(message)}
          loadGameFromObject(window.__nalediAlertSave,{isReplayInit:true})
          enemies=[];occupied=new Set();collectiveMindFloors={}
          player.x=40;player.y=40;player.invisibleTurns=0;player.godInvisible=false
          for(let y=30;y<=65;y++)for(let x=30;x<=65;x++)map[y][x]='grass'
          const template=ENEMY_TEMPLATE_BY_NAME.Naledi
          const create=(x,y,pack)=>addEnemy({...template,baseName:template.name,x,y,
            level:0,levelKind:null,hp:template.hp,maxHp:template.hp,
            homeX:x,homeY:y,homeTileType:'grass',alive:true,equipment:null,
            collectiveMindPackId:pack})
          let scout=create(42,40,'scout-pack')
          let ally=create(51,40,'other-pack')
          occupied=new Set(enemies.map(e=>keyXY(e.x,e.y)))
          check(tryTriggerCollectiveMind(scout),'scout starts the floor warning')
          player.x=90;player.y=90
          updateAlarmedEnemies()
          check(ally.alarmed,'distant ally remains Alarmed while scout lives')
          const stateBefore=structuredClone(buildSaveObject())
          const randomBefore=rngState
          scout.alive=false;enemies=enemies.filter(e=>e!==scout)
          updateAlarmedEnemies()
          check(!ally.alarmed,'killing the scout before regrouping ends the broadcast')
          loadGameFromObject(stateBefore,{isReplayInit:true})
          scout=enemies.find(e=>e.id===stateBefore.collectiveMindFloors['surface:0:-1'].scoutId)
          ally=enemies.find(e=>e.collectiveMindPackId==='other-pack')
          check(rngState===randomBefore,'restoring the alert does not consume RNG')
          occupied.delete(keyXY(scout.x,scout.y))
          scout.x=ally.x-1;scout.y=ally.y
          occupied.add(keyXY(scout.x,scout.y))
          check(takeCollectiveMindRetreatTurn(scout),'scout finishes its retreat')
          check(collectiveMindFloors[collectiveMindFloorKey(scout)].secured,
            'reaching a different pack permanently secures the floor broadcast')
          scout.alive=false;enemies=enemies.filter(e=>e!==scout)
          currentZ=-1;updateAlarmedEnemies()
          currentZ=0;updateAlarmedEnemies()
          check(ally.alarmed,'secured floor alert survives scout death and level travel')

          // A lone scout also spends its turns fleeing, not attacking, and
          // can adopt a newly reachable group later.
          enemies=[];occupied=new Set();collectiveMindFloors={}
          player.x=40;player.y=40
          const lone=create(42,40,'alone')
          occupied.add(keyXY(lone.x,lone.y))
          check(tryTriggerCollectiveMind(lone),'lone scout starts a broadcast')
          const before=Math.max(Math.abs(lone.x-player.x),Math.abs(lone.y-player.y))
          check(takeCollectiveMindRetreatTurn(lone),'lone scout consumes a searching turn')
          check(Math.max(Math.abs(lone.x-player.x),Math.abs(lone.y-player.y))>before,
            'scout runs away from the player')
          check(!lone.collectiveMindRetreat,'no non-existent group was invented')
          const group=create(55,44,'new-group')
          occupied.add(keyXY(group.x,group.y))
          check(takeCollectiveMindRetreatTurn(lone),'a new group can be pursued')
          check(lone.collectiveMindRetreat?.groupId==='new-group',
            'searching changes to real group retreat when reachable')
        })()`)
        delete win.__nalediAlertSave
      })
    })
  })

  it('lets a cornered Naledi defend itself and resume fleeing when an exit opens',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__nalediCornerSave=save
        win.eval(`(()=>{
          const check=(condition,message)=>{if(!condition)throw Error(message)}
          loadGameFromObject(window.__nalediCornerSave,{isReplayInit:true})
          enemies=[];occupied=new Set();collectiveMindFloors={}
          player.x=41;player.y=40;player.hp=1000;player.invisibleTurns=0
          player.godInvisible=false;turnCount=400
          for(let y=36;y<=44;y++)for(let x=37;x<=46;x++)map[y][x]='cavewall'
          map[40][41]='grass';map[40][42]='grass'
          const template=ENEMY_TEMPLATE_BY_NAME.Naledi
          let scout=addEnemy({...template,baseName:template.name,x:42,y:40,
            level:0,levelKind:null,hp:template.hp,maxHp:template.hp,
            homeX:42,homeY:40,homeTileType:'grass',alive:true,
            collectiveMindPackId:'isolated'})
          occupied=new Set([keyXY(scout.x,scout.y)])
          check(tryTriggerCollectiveMind(scout),'isolated scout raises the alert')
          check(takeCollectiveMindRetreatTurn(scout)===false,
            'adjacent scout cannot spend a turn waiting when cornered')
          const originalAttack=enemyAttackPlayer
          let attacks=0
          try {
            enemyAttackPlayer=e=>{if(e===scout)attacks++;return false}
            enemyTurn()
            check(attacks===1,'cornered scout attempts ordinary melee')
            check(!collectiveMindFloors[collectiveMindFloorKey(scout)].secured,
              'fighting back does not secure the shared alert')
            const saved=structuredClone(buildSaveObject())
            const randomBefore=rngState
            loadGameFromObject(saved,{isReplayInit:true})
            scout=enemies.find(e=>e.id===saved.enemies[0].id)
            check(rngState===randomBefore,'save restoration consumes no RNG')
            check(takeCollectiveMindRetreatTurn(scout)===false,
              'saved cornered scout still defends itself')
            map[40][43]='grass';attacks=0
            enemyTurn()
            check(attacks===0,'escaping scout does not attack')
            check(scout.x===43,'scout takes an open escape route')
          } finally { enemyAttackPlayer=originalAttack }
        })()`)
        delete win.__nalediCornerSave
      })
    })
  })
})
