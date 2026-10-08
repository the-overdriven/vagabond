describe('Big Bell Temple reachability', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Bell Reachability Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 90000}).should('not.be.visible')
    cy.get('#raceOverlay', {timeout: 90000}).should('not.have.class', 'show')
  })

  it('ignores isolated mountain pockets even when they border snow, and never fabricates a disconnected grass tile', () => {
    cy.window().then(win => win.eval(`(() => {
      const previous = {map, surfaceMap, spawnPoint, blackPillarPos, bigBellPos}
      const check = (ok, message) => { if (!ok) throw Error(message) }
      try {
        // An apparently valid bell at (130,98) borders snow that cannot be
        // reached. The mountain edge beside the grass corridor is reachable.
        map = Array.from({length: MAP_H}, () => Array(MAP_W).fill('mountain'))
        spawnPoint = {x:140, y:118}
        blackPillarPos = null
        map[118][140] = 'temple'
        for (let x = 141; x < 170; x++) map[118][x] = 'grass'
        map[99][130] = 'snow'
        placeBigBell()
        check(!!bigBellPos && isBigBellReachableFromTemple(), 'bell selected from Temple-connected terrain')
        check(bigBellPos.x !== 130 || bigBellPos.y !== 98, 'isolated pocket skipped')
        check(map[99][130] === 'snow', 'isolated snow unchanged')

        // With no reachable mountain edge beyond the minimum radius, do not
        // produce a bell in a completely disconnected pocket.
        map = Array.from({length: MAP_H}, () => Array(MAP_W).fill('mountain'))
        map[118][140] = 'temple'
        map[99][130] = 'snow'
        placeBigBell()
        check(bigBellPos === null, 'no inaccessible bell fallback')
        check(map[98][130] === 'mountain', 'mountains are not carved to fake accessibility')
      } finally {
        map = previous.map
        surfaceMap = previous.surfaceMap
        spawnPoint = previous.spawnPoint
        blackPillarPos = previous.blackPillarPos
        bigBellPos = previous.bigBellPos
      }
      return true
    })()`))
  })

  for (const seed of [498206493, 12345, 424242]) {
    it(`generates a Temple-reachable bell, including after rotation and save/load, seed ${seed}`, () => {
      cy.window().then(win => win.eval(`(async () => {
        const check = (ok, message) => { if (!ok) throw Error(message) }
        WORLD_SEED = ${seed}
        rngState = WORLD_SEED
        applyWorldTraits([])
        await generateNewWorld()
        check(isBigBellReachableFromTemple(), 'generated bell reachable from Temple')
        check(surfaceReachableFromTemple().has(keyXY(bigBellPos.x, bigBellPos.y)), 'bell in Temple walking component')
        rotateGeneratedWorld(1)
        check(isBigBellReachableFromTemple(), 'bell remains reachable after an additional quarter-turn')
        const save = buildSaveObject()
        loadGameFromObject(save, {isReplayInit:true})
        check(isBigBellReachableFromTemple(), 'bell still reachable after save restoration')
        return true
      })()`))
    })
  }
})
