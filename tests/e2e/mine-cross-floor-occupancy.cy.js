describe('Mine pursuit ignores creatures on other floors',()=>{
  it('keeps the chase route open for a blind monster after save/replay initialization',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__crossFloorSave=save
        win.eval(`(() => {
          window.__crossFloorSave.version=SAVE_VERSION
          loadGameFromObject(window.__crossFloorSave,{isReplayInit:true})
          const check=(condition,message)=>{if(!condition)throw Error(message)}
          replayRecording=false
          currentZ=-3;currentCave=-1;map=depthUndergroundMap(3)
          undergroundDiscovered=depthUndergroundDiscovered(3)
          player.x=40;player.y=40;player.godMode=false;player.invisibleTurns=8
          enemies=[];occupied=new Set()
          for(let y=39;y<=41;y++)for(let x=35;x<=45;x++)map[y][x]='dwarvenwall'
          for(let x=35;x<=45;x++)map[40][x]='marble'
          const bat=ENEMY_TEMPLATE_BY_NAME['Giant Bat']
          addEnemy({...bat,baseName:bat.name,x:38,y:40,level:0,levelKind:null,
            hp:bat.hp,maxHp:bat.hp,alive:true,homeX:38,homeY:40,homeTileType:'grass'})
          const tmpl=ENEMY_TEMPLATE_BY_NAME.Duiwel
          const duiwel=addEnemy({...tmpl,baseName:tmpl.name,x:37,y:40,
            level:-3,levelKind:'chain',hp:tmpl.hp,maxHp:tmpl.hp,alive:true,
            homeX:37,homeY:40,homeTileType:'marble',aware:true,alarmed:true,
            alarmedZ:-3,alarmedLevelKind:'chain'})
          rebuildActiveLevelOccupancy()
          check(!occupied.has(keyXY(38,40)),'the overworld bat must not block the mine')
          check(!playerHiddenFromEnemy(duiwel),'Duiwel senses invisible players')
          check(enemyFindStep(duiwel)?.x===38,'Duiwel can chase in the mine corridor')
          const rng=rngState,saved=buildSaveObject()
          loadGameFromObject(saved,{isReplayInit:true})
          // Reapply only the synthetic test corridor; the fort descriptor is unchanged.
          for(let y=39;y<=41;y++)for(let x=35;x<=45;x++)map[y][x]='dwarvenwall'
          for(let x=35;x<=45;x++)map[40][x]='marble'
          const restored=enemies.find(e=>e.id===duiwel.id)
          check(rngState===rng,'restoring occupancy must not consume RNG')
          check(enemyFindStep(restored)?.x===38,'restored chase path stays open')
          check(ENEMY_TEMPLATE_BY_NAME.Glaber.abilities.includes('blind'),
            'the Glaber mole also senses invisible players')
        })()`)
        delete win.__crossFloorSave
      })
    })
  })
})
