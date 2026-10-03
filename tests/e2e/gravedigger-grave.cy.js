describe('Gravedigger unfinished grave', () => {
  it('creates and saves a separate village grave on both surface maps', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Grave Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const key = gravediggerGraveKey
        const [x, y] = key.split(',').map(Number)
        const digger = npcs.find(n => n.name === 'Gravedigger')
        const before = Object.keys(cemeteryTombstones).length
        const rngBefore = rngState
        ensureGravediggerGrave()
        const saved = buildSaveObject()
        loadGameFromObject(saved)
        const restored = gravediggerGraveKey === key && surfaceMap[y][x] === 'grave' && map[y][x] === 'grave'
        return {restored, active: map[y][x], stored: surfaceMap[y][x],
          separate: !cemeteryTombstones[key], keyStable: key === gravediggerGraveKey,
          distance: Math.max(Math.abs(x - digger.homeX), Math.abs(y - digger.homeY)),
          underlay: !!tileUnderlays[key], savedKey: saved.gravediggerGraveKey,
          key, rngStable: rngBefore === rngState,
          cemeteryStable: before === Object.keys(cemeteryTombstones).length}
      })()`)
      expect(result.restored).to.equal(true)
      expect(result.active).to.equal('grave')
      expect(result.stored).to.equal('grave')
      expect(result.separate).to.equal(true)
      expect(result.keyStable).to.equal(true)
      expect(result.distance).to.be.within(1, 20)
      expect(result.underlay).to.equal(true)
      expect(result.savedKey).to.equal(result.key)
      expect(result.rngStable).to.equal(true)
      expect(result.cemeteryStable).to.equal(true)
    })
  })
})
