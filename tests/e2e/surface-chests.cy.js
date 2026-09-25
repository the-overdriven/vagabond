describe('Surface edge chests', () => {
  it('keeps ordinary chest density proportional to walkable land', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Chest Density Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')

    cy.window().then(win => {
      const result = win.eval(`(() => {
        const originalItems = groundItems
        const originalRngState = rngState
        const changed = []
        const eligible = () => {
          let count = 0
          for (let y = 2; y < MAP_H - 2; y++) for (let x = 2; x < MAP_W - 2; x++) {
            const tile = map[y][x]
            if (isWalkable(x, y) && tile !== 'temple' && tile !== 'belltower' && tile !== 'caveentrance') count++
          }
          return count
        }
        const place = () => {
          groundItems = []
          spawnOrdinarySurfaceChests()
          return {
            count: groundItems.length,
            unique: new Set(groundItems.map(g => keyXY(g.x, g.y))).size,
            walkable: groundItems.every(g => isWalkable(g.x, g.y))
          }
        }
        try {
          const beforeTiles = eligible()
          const before = place()
          for (let y = 2; y < MAP_H - 2; y++) for (let x = 2; x < MAP_W - 2; x++) {
            const tile = map[y][x]
            if ((x + y) % 2 === 0 && isWalkable(x, y) &&
                tile !== 'temple' && tile !== 'belltower' && tile !== 'caveentrance') {
              changed.push([x, y, tile])
              map[y][x] = 'water'
            }
          }
          const afterTiles = eligible()
          const after = place()
          return {beforeTiles, before, afterTiles, after, tilesPerChest: SURFACE_TILES_PER_CHEST}
        } finally {
          for (const [x, y, tile] of changed) map[y][x] = tile
          groundItems = originalItems
          rngState = originalRngState
        }
      })()`)
      expect(result.tilesPerChest).to.equal(720)
      expect(Math.round(32370 / result.tilesPerChest)).to.equal(45)
      expect(result.before.count).to.equal(Math.round(result.beforeTiles / result.tilesPerChest))
      expect(result.before.unique).to.equal(result.before.count)
      expect(result.before.walkable).to.equal(true)
      expect(result.afterTiles).to.be.lessThan(result.beforeTiles)
      expect(result.after.count).to.equal(Math.round(result.afterTiles / result.tilesPerChest))
      expect(result.after.count).to.be.lessThan(result.before.count)
      expect(result.after.unique).to.equal(result.after.count)
      expect(result.after.walkable).to.equal(true)
    })
  })

  it('places twelve guarded chests along the edges, including five in the north', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Chest Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')

    cy.window().then(win => {
      const result = win.eval(`(() => {
        const previous = {enemies, occupied, groundItems, npcs, rngState}
        const changed = []
        const seen = new Set()
        const positions = [
          ...Array.from({length: 5}, (_, i) => [Math.round(MAP_W * (i + 1) / 6), 8]),
          ...[0.25, 0.5, 0.75].flatMap(fraction => [
            [8, Math.round(MAP_H * fraction)],
            [MAP_W - 9, Math.round(MAP_H * fraction)]
          ]),
          [Math.round(MAP_W * 0.5), MAP_H - 9]
        ]
        try {
          enemies = positions.map(([x, y], i) => ({
            x, y, alive: true, level: 0, tier: i % 3 + 3, aggro: 3
          }))
          occupied = new Set(enemies.map(e => keyXY(e.x, e.y)))
          groundItems = []
          npcs = []
          for (const e of enemies) {
            for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
              const x = e.x + dx, y = e.y + dy, key = keyXY(x, y)
              if (!seen.has(key)) {
                changed.push([x, y, map[y][x]])
                seen.add(key)
              }
              map[y][x] = 'grass'
            }
          }
          spawnEdgeHighTierChests()
          const edgeBand = Math.max(12, Math.round(Math.min(MAP_W, MAP_H) * 0.12))
          return {
            count: groundItems.length,
            north: groundItems.filter(g => g.y <= edgeBand).length,
            allGuarded: groundItems.every(g =>
              g.kind === 'chest' && g.tier >= 3 && map[g.y][g.x] === 'grass' &&
              enemies.some(e => e.tier === g.tier &&
                Math.max(Math.abs(e.x - g.x), Math.abs(e.y - g.y)) <= effectiveAggroRange(e))),
            allAtEdges: groundItems.every(g =>
              g.x <= edgeBand || g.x >= MAP_W - 1 - edgeBand ||
              g.y <= edgeBand || g.y >= MAP_H - 1 - edgeBand),
            unique: new Set(groundItems.map(g => keyXY(g.x, g.y))).size
          }
        } finally {
          for (const [x, y, tile] of changed) map[y][x] = tile
          enemies = previous.enemies
          occupied = previous.occupied
          groundItems = previous.groundItems
          npcs = previous.npcs
          rngState = previous.rngState
        }
      })()`)
      expect(result.count).to.equal(12)
      expect(result.north).to.equal(5)
      expect(result.allGuarded).to.equal(true)
      expect(result.allAtEdges).to.equal(true)
      expect(result.unique).to.equal(12)
    })
  })
})
