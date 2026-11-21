describe('Dwarven Fort hole — continuous vertical coordinates', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Shaft Tester')
    cy.get('#worldSizeSelect').select('XS')
    cy.window().then(win => win.eval('WORLD_SEED = 12345; rngState = WORLD_SEED'))
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
  })

  it('uses an in-game confirmation and lands at the same x/y on z:-3, including after a save', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,message)=>{if(!ok)throw Error(message)}
      const original=JSON.parse(JSON.stringify(buildSaveObject()))
      const oldChance=chance, oldReplayAnimationsDisabled=replayAnimationsDisabled
      try {
        replayAnimationsDisabled=true
        const deep=deepLevels[0],fort=deepLevels[1]
        check(!!deep && !!fort && !!dwarvenRuin,'fort and deep caves exist')
        let holes=[]
        for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)
          if(deep.map[y][x]==='dwarvenhole')holes.push({x,y})
        if(!holes.length) {
          // A seeded world need not have a natural grotto/Fort intersection.
          // Build that intersection in this test fixture; the production
          // generator itself must never carve a connecting corridor.
          let site=null
          for(let y=2;y<MAP_H-2&&!site;y++)for(let x=2;x<MAP_W-2;x++) {
            if(ensureDwarvenFortHoleLanding(x,y) &&
               !groundItems.some(g=>g.level===-3&&g.x===x&&g.y===y) &&
               !enemies.some(e=>e.alive&&e.level===-3&&e.x===x&&e.y===y)) {
              site={x,y};break
            }
          }
          check(!!site && !!deep.caves[0] && !!deep.caveMaps[0],
            'Fort has a clear real landing for the test fixture')
          const ascent={x:site.x,y:site.y>10?site.y-9:site.y+9}
          const dy=Math.sign(site.y-ascent.y)
          for(let y=ascent.y;y!==site.y+dy;y+=dy) {
            deep.map[y][site.x]='cavefloor2'
            deep.caveMaps[0][y][site.x]='cavefloor2'
          }
          deep.map[ascent.y][ascent.x]='caveup'
          deep.caveMaps[0][ascent.y][ascent.x]='caveup'
          deep.caves[0].entrances.push(ascent)
          const fortBefore=JSON.stringify(fort.map)
          chance=()=>true
          placeDwarvenFortHole()
          chance=oldChance
          check(JSON.stringify(fort.map)===fortBefore,
            'placing a hole never excavates the Fort')
          for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)
            if(deep.map[y][x]==='dwarvenhole')holes.push({x,y})
        }
        check(holes.length===1,'a valid overlap produces exactly one hole')
        const hole=holes[0]
        check(fort.map[hole.y][hole.x]==='marble' &&
          fort.caveMaps[dwarvenRuin.caveIndex][hole.y][hole.x]==='marble',
          'landing is inside pre-existing Fort floor, not an added corridor')
        check(ensureDwarvenFortHoleLanding(hole.x,hole.y),'landing remains gate-accessible')
        // The original Fort corridors must physically lead to the gate.
        const seen=new Set([keyXY(hole.x,hole.y)]),queue=[hole]
        for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const x=queue[i].x+dx,y=queue[i].y+dy,k=keyXY(x,y)
          if(seen.has(k)||!TILE[fort.map[y]?.[x]]?.walk)continue
          seen.add(k);queue.push({x,y})
        }
        check(seen.has(keyXY(dwarvenRuin.x,dwarvenRuin.y)),'landing has a physical route to gate')
        currentZ=-2;currentCave=-1;map=deep.map;undergroundDiscovered=deep.discovered
        player.x=hole.x;player.y=hole.y
        // Eliminate a spawn standing on the landing for this isolated test.
        enemies=enemies.filter(e=>!(e.alive&&e.level===-3&&e.x===hole.x&&e.y===hole.y))
        rebuildActiveLevelOccupancy()
        const rngBefore=rngState,turnsBefore=turnCount
        inspect()
        check(holeJumpOpen && document.getElementById('holeJumpOverlay').classList.contains('show'),
          'in-game confirmation shown')
        check(currentZ===-2,'opening confirmation does not descend')
        document.getElementById('btnHoleJumpCancel').click()
        check(!holeJumpOpen && currentZ===-2 && rngState===rngBefore && turnCount===turnsBefore,
          'cancel changes no gameplay state')
        inspect()
        document.getElementById('btnHoleJumpConfirm').click()
        check(currentZ===-3 && player.x===hole.x && player.y===hole.y,
          'jump changes only z and never relocates x/y')
        check(!holeJumpOpen,'confirmation is closed on descent')
        check(map[player.y][player.x]==='marble','fort landing is an ordinary passable floor')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        check(currentZ===-3 && player.x===hole.x && player.y===hole.y,
          'save restores the exact xyz position')
        check(TILE[deepLevels[1].map[hole.y]?.[hole.x]]?.walk,
          'save restores the original Fort-floor landing')
        check(ensureDwarvenFortHoleLanding(hole.x,hole.y),'restored landing still reaches gate')
        // A blocked landing refuses the jump rather than relocating the hero.
        const blocker={alive:true,level:-3,levelKind:'chain',x:hole.x,y:hole.y}
        enemies.push(blocker)
        currentZ=-2;currentCave=-1;map=deepLevels[0].map
        undergroundDiscovered=deepLevels[0].discovered
        enterCave(true)
        check(currentZ===-2 && player.x===hole.x && player.y===hole.y,
          'occupied destination does not teleport to another location')
        enemies.pop()
      } finally {
        chance=oldChance
        replayAnimationsDisabled=oldReplayAnimationsDisabled
        closeHoleJumpConfirmation()
        loadGameFromObject(original,{isReplayInit:true})
      }
    })()`))
  })
})
