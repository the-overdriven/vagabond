describe('Generated world dimensions and northern edge', () => {
  it('creates a square world with a dry northern boundary', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('World Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')

    cy.window().its('__VAGABOND_E2E__').invoke('getWorldShape').should(shape => {
      expect(shape.width).to.equal(260)
      expect(shape.height).to.equal(shape.width)
      expect(shape.northEdgeHasWater).to.equal(false)
    })
    cy.window().then(win => {
      const dimensions = win.eval(`(() => {
        const save = buildSaveObject()
        loadGameFromObject(save)
        return {savedWidth: save.mapWidth, savedHeight: save.mapHeight, width: MAP_W, height: MAP_H}
      })()`)
      expect(dimensions).to.deep.equal({savedWidth: 260, savedHeight: 260, width: 260, height: 260})
    })
  })
})
