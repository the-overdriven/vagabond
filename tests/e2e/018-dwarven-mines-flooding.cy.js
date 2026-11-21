describe('Dwarven Mines flooded side chambers',()=>{
  it('keeps stairs dry and Xibal in swimming pools across four and five levels',()=>{
    cy.visit('/')
    cy.get('#raceName').clear().type('Mine Flood Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.window().then(win=>win.eval(`(()=>{
      const check=(ok,message)=>{if(!ok)throw Error(message)}
      for(const [seed,count] of [[610061,4],[610063,5]]){
        WORLD_SEED=seed;rngState=seed
        enemies=[];occupied=new Set()
        const levels=[]
        for(let i=0;i<count;i++){
          let floor=null
          for(let attempt=0;attempt<80&&!floor;attempt++)floor=mineFloorCandidate(i,count)
          check(floor,'mine floor generated')
          levels.push(floor)
        }
        check(mineAlignCageShaft(levels),'the shared haulage shaft is aligned')
        check(mineFloodSideChambers(levels),'flooded side chamber carved')
        Mining.generate(levels)
        deepLevels=Array.from({length:7},()=>mineUnusedChainLevel()).concat(levels)
        spawnDwarvenMinesEncounters()
        const fourth=levels[3]
        check(fourth.map.flat().filter(t=>t==='water').length===9,
          'mine floor 4 contains its guaranteed deep-water chamber')
        for(const floor of levels){
          const paths=dungeonWalkDistances(floor.map,floor.mineUpstairs)
          const sealed=new Set((floor.minePockets||[]).flatMap(p=>p.cells.map(c=>keyXY(c.x,c.y))))
          check(floor.map.every((row,y)=>row.every((tile,x)=>
            !TILE[tile]?.walk||sealed.has(keyXY(x,y))||paths.has(keyXY(x,y)))),
            'original dry corridors remain connected despite sealed mining pockets')
          check(floor.map[floor.mineUpstairs.y][floor.mineUpstairs.x]==='minestairsup',
            'stairs are never flooded')
        }
        const xibal=enemies.filter(e=>e.alive&&e.baseName==='Xibal'&&e.level<=-9)
        check(xibal.some(e=>e.level===-12),'the guaranteed late species appears on floor 4')
        check(xibal.every(e=>e.abilities.includes('swim')&&
          levels[-9-e.level].map[e.y][e.x]==='water'),
          'all Xibal begin in the flooded chamber')
        const saved=structuredClone(buildSaveObject()),random=rngState
        loadGameFromObject(saved,{isReplayInit:true})
        check(rngState===random,'restore consumes no RNG')
        check(dungeonPackageLevels('dwarvenMines')[3].level.map.flat()
          .filter(t=>t==='water').length===9,'the water tiles survive save/replay')
      }
    })()`))
  })
})
