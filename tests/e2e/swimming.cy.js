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

describe('Swimming-aware auto-pathing', () => {
  it('limits consecutive water tiles, finds safe detours and respects remaining endurance', () => {
    beginGame()
    cy.window().then(win => win.eval(`(() => {
      const check = (ok, message) => {if (!ok) throw Error(message)}
      const previous = {map, discovered, currentZ, enemies, npcs, occupied,
        x: player.x, y: player.y, race: player.race, swimming: player.swimming,
        swimTurns: player.swimTurns, godMode: player.godMode, autoPath,
        autoPathTargetEnemy, surfaceCatchupBusy}
      const startingRng = rngState
      const testMap = () => {
        map = Array.from({length: MAP_H}, () => Array(MAP_W).fill('mountain'))
        discovered = Array.from({length: MAP_H}, () => Array(MAP_W).fill(false))
        currentZ = 0; enemies = []; npcs = []; occupied = new Set()
        player.x = 50; player.y = 50; player.race = 'human'
        player.swimming = 5; player.swimTurns = 0; player.godMode = false
        autoPath = null; autoPathTargetEnemy = null; surfaceCatchupBusy = false
      }
      const put = (x, y, terrain) => {map[y][x] = terrain; discovered[y][x] = true}
      const row = (end, waterX) => {
        for (let x = 50; x <= end; x++) put(x, 50, waterX.includes(x) ? 'water' : 'grass')
      }
      const maxWetRun = path => {
        let longest = 0, run = map[player.y][player.x] === 'water' ? player.swimTurns : 0
        for (const step of path) {
          run = map[step.y][step.x] === 'water' ? run + 1 : 0
          longest = Math.max(longest, run)
        }
        return longest
      }
      try {
        testMap()
        row(56, [51, 52, 53, 54, 55])
        let path = findPlayerPath(56, 50, true)
        check(path?.length === 6 && maxWetRun(path) === 5 && autoPathHasSafeSwim(path),
          'Swimming 5 permits exactly five consecutive deep-water steps')
        put(56, 50, 'water'); put(57, 50, 'grass')
        check(findPlayerPath(57, 50, true) === null,
          'a sixth consecutive water tile is not a viable route')
        player.swimming = 6
        path = findPlayerPath(57, 50, true)
        check(path?.length === 7 && maxWetRun(path) === 6,
          'Swimming 6 permits a six-tile crossing')
        player.race = 'merling'; player.swimming = 0
        check(findPlayerPath(57, 50, true)?.length === 7,
          'Merling can cross with no learned Swimming skill')
        player.race = 'human'; player.godMode = true
        check(findPlayerPath(57, 50, true)?.length === 7,
          'God Mode ignores swimming endurance')
        player.godMode = false
        check(findPlayerPath(57, 50, true) === null,
          'ordinary non-swimmer cannot automatically enter deep water')

        testMap()
        row(57, [51, 52, 53, 54, 55, 56])
        for (let x = 50; x <= 57; x++) put(x, 49, 'grass')
        path = findPlayerPath(57, 50, true)
        check(path?.length > 0 && maxWetRun(path) <= 5,
          'the pathfinder chooses a safe land detour when direct water is too long')
        check(path.every(step => discovered[step.y][step.x]),
          'the large map route stays on explored terrain')
        player.swimming = 0
        check(findPlayerPath(57, 50, true)?.every(step => map[step.y][step.x] !== 'water'),
          'a non-swimmer takes the dry detour')

        testMap()
        player.swimming = 3
        row(58, [51, 52, 53, 55, 56, 57])
        path = findPlayerPath(58, 50, true)
        check(path?.length === 8 && maxWetRun(path) === 3,
          'land between separate three-tile crossings resets endurance')
        player.swimming = 2
        check(findPlayerPath(58, 50, true) === null,
          'insufficient Swimming rejects both crossings')
        testMap()
        row(57, [])
        for (let x = 51; x <= 56; x++) put(x, 50, 'river')
        player.swimming = 0
        check(findPlayerPath(57, 50, true)?.length === 7,
          'ordinary rivers do not consume Swimming endurance')

        testMap()
        player.swimming = 5
        put(50, 50, 'water'); put(51, 50, 'water')
        put(52, 50, 'water'); put(53, 50, 'grass')
        player.swimTurns = 4
        check(findPlayerPath(53, 50, true) === null,
          'starting in water with four spent turns leaves only one safe water step')
        player.swimTurns = 3
        path = findPlayerPath(53, 50, true)
        check(path?.length === 3 && maxWetRun(path) === 5,
          'a water start uses remaining endurance, allowing the exact limit')
        player.swimTurns = 4
        check(!autoPathHasSafeSwim(path), 'an outdated plan becomes unsafe after waiting in water')
        const before = {x: player.x, y: player.y}
        autoPath = path
        flushPendingMove()
        check(autoPath === null && player.x === before.x && player.y === before.y,
          'auto movement cancels a stale unsafe water route before spending a turn')
        player.swimming = 0; player.swimTurns = 5
        put(51, 50, 'grass')
        check(findPlayerPath(51, 50, true)?.length === 1,
          'a drowning swimmer may always auto-path directly onto adjacent shore')
        check(rngState === startingRng, 'planning routes consumes no gameplay RNG')
      } finally {
        ({map, discovered, currentZ, enemies, npcs, occupied,
          surfaceCatchupBusy} = previous)
        player.x = previous.x; player.y = previous.y; player.race = previous.race
        player.swimming = previous.swimming; player.swimTurns = previous.swimTurns
        player.godMode = previous.godMode
        autoPath = previous.autoPath; autoPathTargetEnemy = previous.autoPathTargetEnemy
        render()
      }
      return true
    })()`)).should('equal', true)
  })
})

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
