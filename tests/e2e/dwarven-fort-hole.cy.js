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
          chance=()=>true
          placeDwarvenFortHole()
          chance=oldChance
          for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)
            if(deep.map[y][x]==='dwarvenhole')holes.push({x,y})
        }
        check(holes.length===1,'exactly one hole generated')
        const hole=holes[0]
        check(TILE[fort.map[hole.y]?.[hole.x]]?.walk,'the matching fort landing is walkable')
        check(ensureDwarvenFortHoleLanding(hole.x,hole.y),'passage remains connected after generation')
        // The lower passage must physically lead to the Fort entrance.
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
          'save restores carved fort landing')
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
