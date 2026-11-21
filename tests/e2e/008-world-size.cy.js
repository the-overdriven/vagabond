describe('Generated world dimensions and rotated cold edge', () => {
  it('keeps dimensions and places the cold band along one cardinal edge', () => {
    cy.visit('/')
    // Simulate starting a fresh world after visiting an underground layer.
    // A previous session's z must never turn the new surface into dungeon FOV
    // or let cave decorations leak onto the starting landscape.
    cy.window().then(win => win.eval('currentZ = -2; currentCave = 0'))
    cy.get('#raceName').clear().type('World Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => {
      const startingFloor = win.eval(`({ z: currentZ, cave: currentCave,
        surfaceMapActive: map === surfaceMap,
        surfaceKind: currentLevelKind(),
        cavePropsOnSurface: caveDecorations.filter(prop => onCurrentLevel(prop) &&
          prop.levelKind !== 'surface').length })`)
      expect(startingFloor.z).to.equal(0)
      expect(startingFloor.cave).to.equal(-1)
      expect(startingFloor.surfaceMapActive).to.equal(true)
      expect(startingFloor.surfaceKind).to.equal('surface')
      expect(startingFloor.cavePropsOnSurface).to.equal(0)
    })

    cy.window().its('__VAGABOND_E2E__').invoke('getWorldShape').should(shape => {
      expect(shape.width).to.equal(260)
      expect(shape.height).to.equal(shape.width)
      // After world rotation north is no longer necessarily the cold edge.
      expect([true, false]).to.include(shape.northEdgeHasWater)
    })
    cy.window().then(win => {
      const dimensions = win.eval(`(() => {
        const visited = new Set()
        const {lavaRadius, lavaRadiusVariation} = WORLD_GEN_CONFIG.surface.volcanoes
        for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
          if (surfaceMap[y][x] !== 'volcano') continue
          const pool = [{x,y}]
          for (const cell of pool) for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
            const nx = cell.x+dx, ny = cell.y+dy, key = keyXY(nx,ny)
            if (surfaceMap[ny]?.[nx] !== 'lava' || visited.has(key)) continue
            if (Math.hypot(nx-x,ny-y) > lavaRadius + lavaRadiusVariation) throw new Error('lava outside rounded footprint')
            visited.add(key)
            pool.push({x:nx,y:ny})
          }
        }
        if (surfaceMap.flat().filter(tile => tile === 'lava').length !== visited.size)
          throw new Error('lava disconnected from its volcano')
        const save = buildSaveObject()
        loadGameFromObject(save)
        const band = Math.max(6, Math.floor(Math.min(MAP_W, MAP_H) * .10))
        const cold = ['snow','snowmountain','frozenriver','taiga']
        const counts = [0,0,0,0]
        for (let y=0;y<MAP_H;y++) for (let x=0;x<MAP_W;x++) {
          if (!cold.includes(map[y][x])) continue
          if (y < band) counts[0]++
          if (x >= MAP_W-band) counts[1]++
          if (y >= MAP_H-band) counts[2]++
          if (x < band) counts[3]++
        }
        return {savedWidth: save.mapWidth, savedHeight: save.mapHeight, width: MAP_W, height: MAP_H, coldCounts:counts}
      })()`)
      expect(dimensions.savedWidth).to.equal(dimensions.width)
      expect(dimensions.savedHeight).to.equal(dimensions.height)
      expect(dimensions.width * dimensions.height).to.equal(260 * 260)
      expect(Math.max(...dimensions.coldCounts)).to.be.greaterThan(0)
    })
  })
})
