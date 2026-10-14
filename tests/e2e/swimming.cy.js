function beginGame() {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type('Swimming Tester')
  // These cases test mechanics, not random world-generation attempts.
  cy.get('#worldSizeSelect').select('XS')
  cy.window().then(win => win.eval('WORLD_SEED = 12345; rngState = WORLD_SEED'))
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout:60000}).should($overlay => {
    expect($overlay.text(), 'world generation status').not.to.include('failed')
    expect($overlay, 'world generation finished').not.to.be.visible
  })
  cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
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
    it(`bobs only in deep water without stronger drowning motion at ${width}px`, () => {
      cy.viewport(width,height)
      beginGame()
      cy.window().then(win => win.eval(`(() => {
        const check = (ok, msg) => { if (!ok) throw Error(msg) }
        const x = player.x, y = player.y
        const before = {
          terrain: map[y][x], tileImages: USE_TILE_IMAGES,
          swimming: player.swimming, swimTurns: player.swimTurns, drowning: player.drowning
        }
        const originalBob = swimmingPlayerBobOffset
        const times = [0,170,430,900,1330,1990,2350]
        const normal = times.map(t => originalBob(t, 'water'))
        const maximum = Math.max(...normal.map(({dx,dy}) => Math.hypot(dx,dy)))
        check(maximum > 1 && maximum < TILE_PX / 10, 'deep-water bob stays gentle')
        check(normal.every(({dy}) => dy >= 0), 'sprite never moves above the clip and cuts off its head')
        const fullCycle = Array.from({length: 271}, (_, i) => originalBob(i * 10, 'water').dy)
        check(Math.min(...fullCycle) >= 0 && Math.min(...fullCycle) < TILE_PX / 100,
          'bob returns to the normal sprite height without rising above it')
        check(Math.max(...fullCycle) > TILE_PX / 20 && Math.max(...fullCycle) < TILE_PX / 10,
          'bob visibly dips downward without disappearing beneath the waterline')
        check(new Set(normal.map(({dx,dy}) => dx + ',' + dy)).size > 1,
          'water movement changes with render timestamp')
        for (const terrain of ['river','frozenriver','grass']) {
          check(times.every(t => {
            const {dx,dy} = originalBob(t, terrain)
            return dx === 0 && dy === 0
          }), terrain + ' has no bob')
        }
        const savedState = () => {
          const state = buildSaveObject()
          delete state.savedAt // Wall-clock metadata is not gameplay state.
          return JSON.stringify(state)
        }
        const saved = savedState()
        for (const t of times) originalBob(t, 'water')
        check(savedState() === saved, 'bob computation has no saved effects')
        const called = []
        try {
          USE_TILE_IMAGES = true
          swimmingPlayerBobOffset = (time, terrain) => {
            called.push({time, terrain, ...originalBob(time, terrain)})
            return originalBob(time, terrain)
          }
          map[y][x] = 'river'
          renderScene(675)
          check(called.length === 0, 'river player remains still in tile rendering')
          map[y][x] = 'water'
          player.swimming = 3
          player.swimTurns = 2
          renderScene(675)
          check(called.length === 1, 'swimming player bobs in deep water')
          player.swimTurns = 8
          renderScene(675)
          check(called.length === 2 && called[0].dx === called[1].dx &&
            called[0].dy === called[1].dy, 'drowning keeps the same gentle bob')
          map[y][x] = 'frozenriver'
          renderScene(675)
          check(called.length === 2, 'frozen river has no bob')
          map[y][x] = 'grass'
          renderScene(675)
          check(called.length === 2, 'land has no bob')
          map[y][x] = 'water'
          USE_TILE_IMAGES = false
          renderScene(675)
          check(called.length === 2, 'ASCII mode has no bob')
        } finally {
          swimmingPlayerBobOffset = originalBob
          map[y][x] = before.terrain
          USE_TILE_IMAGES = before.tileImages
          player.swimming = before.swimming
          player.swimTurns = before.swimTurns
          player.drowning = before.drowning
          render()
        }
      })()`))
    })
  }

})
