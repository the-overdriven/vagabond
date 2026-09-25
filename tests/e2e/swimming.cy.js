function beginGame() {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type('Swimming Tester')
  cy.get('#btnBegin').click()
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Swimming visuals', () => {
  it('masks the lower half of characters over liquid water, including mid-move', () => {
    beginGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const x = player.x, y = player.y
        const original = map[y][x]
        const next = map[y][x + 1]
        const px = Math.round((x - camX) * TILE_PX)
        const py = Math.round((y - camY) * TILE_PX)
        const samples = {}
        function sample(label, drawX) {
          const testX = Math.round(drawX + TILE_PX / 2)
          ctx.clearRect(testX, py, 1, TILE_PX)
          drawSwimmingCreature(drawX, py, () => {
            ctx.fillStyle = '#ff0000'
            ctx.fillRect(drawX, py, TILE_PX, TILE_PX)
          })
          samples[label] = [
            ctx.getImageData(testX, py + Math.floor(TILE_PX / 4), 1, 1).data[3],
            ctx.getImageData(testX, py + Math.floor(TILE_PX * 3 / 4), 1, 1).data[3]
          ]
        }
        try {
          map[y][x] = 'water'
          sample('water', px)
          map[y][x] = 'river'
          sample('river', px)
          map[y][x] = 'frozenriver'
          sample('frozen', px)
          map[y][x] = 'grass'
          map[y][x + 1] = 'water'
          sample('moving', px + Math.round(TILE_PX * 0.6))
          return samples
        } finally {
          map[y][x] = original
          map[y][x + 1] = next
          render()
        }
      })()`)
      expect(result.water).to.deep.equal([255, 0])
      expect(result.river).to.deep.equal([255, 0])
      expect(result.frozen).to.deep.equal([255, 255])
      expect(result.moving).to.deep.equal([255, 0])
    })
  })
})
