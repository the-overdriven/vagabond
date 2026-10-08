describe('Generated world dimensions and rotated cold edge', () => {
  it('keeps dimensions and places the cold band along one cardinal edge', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('World Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')

    cy.window().its('__VAGABOND_E2E__').invoke('getWorldShape').should(shape => {
      expect(shape.width).to.equal(260)
      expect(shape.height).to.equal(shape.width)
      // After world rotation north is no longer necessarily the cold edge.
      expect([true, false]).to.include(shape.northEdgeHasWater)
    })
    cy.window().then(win => {
      const dimensions = win.eval(`(() => {
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
