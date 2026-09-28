describe('Animated terrain rendering', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Water Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
  })

  it('uses one animation frame throughout a moving water repaint', () => {
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const previous = {map, currentZ, moveAnim, resolveVisualImage}
        const water = RENDER_STYLE.terrainTiles.water
        const duration = water.frameDuration || 120
        const selected = []
        const clock = performance.now.bind(performance)
        let reads = 0
        try {
          map = Array.from({length: MAP_H}, () => Array(MAP_W).fill('water'))
          currentZ = 0
          moveAnim = {fromX: player.x - 1, fromY: player.y, toX: player.x,
            toY: player.y, start: duration - 70, duration: MOVE_ANIM_MS}
          performance.now = () => duration + (++reads) * duration
          resolveVisualImage = visual => {
            const image = previous.resolveVisualImage(visual)
            if (visual?.frames === water.frames) selected.push(image)
            return image
          }
          render(duration - 1)
          const first = selected.splice(0)
          render(duration)
          return {
            count: first.length,
            first: first.every(image => image === preloadedImages.get(water.frames[0])),
            next: selected.length > 0 && selected.every(image => image === preloadedImages.get(water.frames[1])),
            clockRestored: visualFrameTime === null
          }
        } finally {
          performance.now = clock
          resolveVisualImage = previous.resolveVisualImage
          map = previous.map
          currentZ = previous.currentZ
          moveAnim = previous.moveAnim
          render()
        }
      })()`)
      expect(result.count).to.be.greaterThan(1)
      expect(result.first).to.equal(true)
      expect(result.next).to.equal(true)
      expect(result.clockRestored).to.equal(true)
    })
  })

  it('prepares all terrain frames before drawing, including after zoom', () => {
    cy.window().then(win => {
      const result = win.eval(`(() => {
        function prepared() {
          return Object.values(RENDER_STYLE.terrainTiles)
            .filter(visual => visual.frames?.length)
            .every(visual => visual.frames.every(path => {
              const image = preloadedImages.get(path)
              const key = TILE_PX + '|' + (visual.scale ?? 1) + '|' + (visual.filter || '')
              return !!image && scaledVisualCache.get(image)?.has(key)
            }))
        }
        const before = prepared()
        const originalSize = requestedTilePx
        try {
          changeTileSize(1)
          return {before, after: prepared()}
        } finally {
          setTileSize(originalSize)
        }
      })()`)
      expect(result.before).to.equal(true)
      expect(result.after).to.equal(true)
    })
  })
})
