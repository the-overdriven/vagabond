describe('Surface monster population', () => {
  it('scales random spawns with the walkable land available', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Population Tester')
    cy.get('#btnBegin').click()
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
            attempts++
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
          return {beforeTiles, beforeSpawns, afterTiles, afterSpawns, tilesPerEnemy: SURFACE_TILES_PER_ENEMY}
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
      expect(result.beforeSpawns).to.equal(Math.round(result.beforeTiles / result.tilesPerEnemy))
      expect(result.afterTiles).to.be.lessThan(result.beforeTiles)
      expect(result.afterSpawns).to.equal(Math.round(result.afterTiles / result.tilesPerEnemy))
      expect(result.afterSpawns).to.be.lessThan(result.beforeSpawns)
    })
  })
})
