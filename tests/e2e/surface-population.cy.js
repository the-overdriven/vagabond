describe('Surface monster population', () => {
  it('scales random spawns with the walkable land available', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Population Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')

    cy.window().then(win => {
      const result = win.eval(`(() => {
        const originalEnemies = enemies
        const originalOccupied = occupied
        const originalPickWeighted = pickWeighted
        const originalRngState = rngState
        const originalNextEnemyId = nextEnemyId
        const changed = []
        let attempts = 0
        const eligible = () => {
          let count = 0
          for (let y = 2; y < MAP_H - 2; y++) for (let x = 2; x < MAP_W - 2; x++) {
            const tile = map[y][x]
            if (tile === 'temple' || tile === 'belltower' || tile === 'ancientForest' || tile === 'caveentrance' || !isWalkable(x, y)) continue
            if (Math.abs(x - spawnPoint.x) + Math.abs(y - spawnPoint.y) < 20) continue
            if (bigBellPos && Math.max(Math.abs(x - bigBellPos.x), Math.abs(y - bigBellPos.y)) < BELL_GUARD_EXCLUSION_RADIUS) continue
            count++
          }
          return count
        }
        function countAttempts() {
          attempts = 0
          enemies = []
          occupied = new Set()
          spawnEnemies()
          return attempts
        }
        try {
          pickWeighted = (...args) => {
            // Count enemy template selection, excluding weighted equipment/bonus rolls.
            if(args[0].length && args[0].every(entry=>ENEMY_TEMPLATES.includes(entry))) attempts++
            return originalPickWeighted(...args)
          }
          const beforeTiles = eligible()
          const beforeSpawns = countAttempts()
          for (let y = 2; y < MAP_H - 2; y++) for (let x = 2; x < MAP_W - 2; x++) {
            if ((x + y) % 2 === 0 && isWalkable(x, y)) {
              changed.push([x, y, map[y][x]])
              map[y][x] = 'water'
            }
          }
          const afterTiles = eligible()
          const afterSpawns = countAttempts()
          return {beforeTiles, beforeSpawns, afterTiles, afterSpawns, tilesPerEnemy: SURFACE_TILES_PER_ENEMY, density: WORLD_GEN_CONFIG.surfaceEnemies.populationDensityMultiplier}
        } finally {
          for (const [x, y, tile] of changed) map[y][x] = tile
          enemies = originalEnemies
          occupied = originalOccupied
          pickWeighted = originalPickWeighted
          rngState = originalRngState
          nextEnemyId = originalNextEnemyId
        }
      })()`)
      expect(result.tilesPerEnemy).to.equal(260)
      expect(Math.round(31252 / result.tilesPerEnemy)).to.equal(120)
      expect(result.beforeSpawns).to.equal(Math.round(result.beforeTiles / result.tilesPerEnemy * result.density))
      expect(result.afterTiles).to.be.lessThan(result.beforeTiles)
      expect(result.afterSpawns).to.equal(Math.round(result.afterTiles / result.tilesPerEnemy * result.density))
      expect(result.afterSpawns).to.be.lessThan(result.beforeSpawns)
      expect(win.eval("surfaceSpawnEligible(ENEMY_TEMPLATE_BY_NAME.Ghost)"),
        'Ghost is excluded from ordinary surface spawn, migration, and population pools').to.equal(false)
    })
  })

  it('gives natural tier 1–3 surface Champions ordinary same-species escorts', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Champion Pack Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const originalEnemies=enemies,originalOccupied=occupied,originalChance=chance
      const originalPick=pick,originalRng=rngState,originalId=nextEnemyId
      const cfg=WORLD_GEN_CONFIG.surfaceEnemies,oldPrefixChance=cfg.prefixChance
      try {
        enemies=[];occupied=new Set()
        cfg.prefixChance=1
        chance=p=>p===1?true:originalChance(p)
        pick=items=>items.includes('Champion')?'Champion':originalPick(items)
        spawnEnemies()
        const champs=enemies.filter(e=>e.prefix==='Champion'&&e.tier<=3&&e.ordinarySurface)
        check(champs.length>0,'surface generation produces a Champion')
        for(const champion of champs){
          const kin=enemies.filter(e=>e!==champion&&e.baseName===champion.baseName&&
            e.prefix===null&&e.ordinarySurface&&
            Math.max(Math.abs(e.x-champion.x),Math.abs(e.y-champion.y))<=cfg.groupRadius)
          check(kin.length>=2,'Champion has at least two ordinary nearby kin')
        }
      }finally {
        enemies=originalEnemies;occupied=originalOccupied;chance=originalChance
        pick=originalPick;rngState=originalRng;nextEnemyId=originalId;cfg.prefixChance=oldPrefixChance
      }
    })()`))
  })

})
