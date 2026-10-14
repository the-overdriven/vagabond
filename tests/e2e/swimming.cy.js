function beginGame() {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type('Swimming Tester')
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
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
  for (const [width, height] of [[1280,800],[390,844]]) {
    it(`gives drowning a stronger visual-only bob at ${width}px`, () => {
      cy.viewport(width,height)
      beginGame()
      cy.window().then(win => win.eval(`(() => {
        const check=(ok,msg)=>{if(!ok)throw Error(msg)}
        const times=[0,170,430,900,1330,1990,2350]
        const normal=times.map(t=>swimmingPlayerBobOffset(t,false))
        const drowning=times.map(t=>swimmingPlayerBobOffset(t,true))
        check(JSON.stringify(normal)===JSON.stringify(times.map(t=>swimmingPlayerBobOffset(t,false))),
          'bob deterministic for the same render timestamp')
        const max=values=>Math.max(...values.map(p=>Math.hypot(p.dx,p.dy)))
        check(max(drowning)>max(normal)*2,'drowning moves more dramatically')
        const saved=JSON.stringify(buildSaveObject())
        for(const t of times) {swimmingPlayerBobOffset(t,false);swimmingPlayerBobOffset(t,true)}
        check(JSON.stringify(buildSaveObject())===saved,'bob has no gameplay or save effects')
        check(!!document.getElementById('game'),'canvas present')
      })()`))
    })
  }

})
