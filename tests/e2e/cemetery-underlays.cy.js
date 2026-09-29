describe('Cemetery terrain underlays', () => {
  it('keeps graves and the chapel on their original biome without false snow edges', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Cemetery Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')

    cy.window().then(win => {
      const result = win.eval(`(() => {
        const previous = {map, tileUnderlays, cemeteryTombstones, rngState}
        function sample(terrain) {
          map = Array.from({length: MAP_H}, () => Array(MAP_W).fill(terrain))
          map[40][40] = 'ancientForest'
          tileUnderlays = {}
          placeCemetery()
          // The Ancient Forest tile is only an anchor for cemetery placement. Restore it
          // before checking snow edges so this test isolates cemetery overlays instead
          // of depending on whether RNG happened to place the cemetery beside the anchor.
          map[40][40] = terrain
          const graves = Object.keys(cemeteryTombstones).map(key => key.split(',').map(Number))
          const chapel = graves.flatMap(([x, y]) => DIRS8.map(([dx, dy]) => [x + dx, y + dy]))
            .find(([x, y]) => map[y]?.[x] === 'ruinedchapel')
          const landmarks = chapel ? [...graves, chapel] : graves
          const neighbors = landmarks.flatMap(([x, y]) =>
            [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]])
            .filter(([x, y]) => map[y]?.[x] === terrain)
          return {
            graveCount: graves.length,
            chapel: !!chapel,
            underlays: landmarks.every(([x, y]) => tileUnderlays[keyXY(x, y)] === terrain),
            bases: landmarks.every(([x, y]) => overlayBaseTileKey(map[y][x], x, y) === terrain),
            snowEdges: terrain !== 'snow' || neighbors.every(([x, y]) =>
              terrainVisual('snow', x, y).image === RENDER_STYLE.terrainTiles.snow.image)
          }
        }
        try {
          return {snow: sample('snow'), grass: sample('grass')}
        } finally {
          map = previous.map
          tileUnderlays = previous.tileUnderlays
          cemeteryTombstones = previous.cemeteryTombstones
          rngState = previous.rngState
        }
      })()`)
      for (const biome of [result.snow, result.grass]) {
        expect(biome.graveCount).to.be.greaterThan(0)
        expect(biome.chapel).to.equal(true)
        expect(biome.underlays).to.equal(true)
        expect(biome.bases).to.equal(true)
      }
      expect(result.snow.snowEdges).to.equal(true)
    })
  })
})
