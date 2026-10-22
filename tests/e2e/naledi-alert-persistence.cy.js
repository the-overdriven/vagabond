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
        })()`)
        delete win.__nalediAlertSave
      })
    })
  })
})
