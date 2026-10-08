describe('Submerged surface treasure', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => {
      cy.window().then(win => {
        win.__underwaterTestSave = save
        win.eval('loadGameFromObject(window.__underwaterTestSave, {isReplayInit:true})')
        delete win.__underwaterTestSave
      })
    })
  })

  it('places normal-tier chests 4–8 swimming steps from shore in seas and lakes', () => {
    cy.window().then(win => win.eval(`(() => {
      const previous = {map, groundItems, occupied, rngState}
      const cfg = WORLD_GEN_CONFIG.surfaceLoot.submergedChests
      const originalConfig = {countRange: cfg.countRange, lakeShare: cfg.lakeShare}
      const check = (condition, message) => { if (!condition) throw Error(message) }
      const rectangularSea = ({x,y}) => x >= 0 && x <= 24 && y >= 8 && y <= 58
      const rectangularLake = ({x,y}) => x >= 66 && x <= 110 && y >= 35 && y <= 75
      try {
        map = Array.from({length:MAP_H}, () => Array(MAP_W).fill('grass'))
        groundItems = []
        occupied = new Set()
        for (let y=8; y<=58; y++) for (let x=0; x<=24; x++) map[y][x] = 'water'
        for (let y=35; y<=75; y++) for (let x=66; x<=110; x++) map[y][x] = 'water'
        const eligible = submergedSurfaceChestCandidates()
        check(eligible.sea.length > 50 && eligible.lake.length > 50, 'both pools have eligible deep water')
        const positions = new Set([...eligible.sea,...eligible.lake].map(({x,y}) => keyXY(x,y)))
        cfg.countRange = [15,30]
        cfg.lakeShare = 0.35
        const initialSeed = rngState
        spawnSubmergedSurfaceChests()
        const first = groundItems.map(({x,y,tier,kind}) => ({x,y,tier,kind}))
        check(first.length >= 15 && first.length <= 30, '15–30 chests on eligible world')
        check(first.some(rectangularSea) && first.some(rectangularLake), 'both sea and lake contain chests')
        check(new Set(first.map(({x,y}) => keyXY(x,y))).size === first.length, 'no duplicate tiles')
        for (const item of first) {
          check(map[item.y][item.x] === 'water', 'chest is in deep water')
          check(positions.has(keyXY(item.x,item.y)), 'chest is in the 4–8-step candidate set')
          check(item.kind === 'chest' && item.tier === surfaceOrdinaryChestTier(item.x,item.y),
            'chests use ordinary surface tiers')
          const distance = rectangularSea(item)
            ? Math.min(25-item.x, item.y-7, 59-item.y)
            : Math.min(item.x-65, 111-item.x, item.y-34, 76-item.y)
          check(distance >= 4 && distance <= 8, 'chest is 4–8 moves from its nearest shore')
        }
        groundItems = []
        rngState = initialSeed
        spawnSubmergedSurfaceChests()
        check(JSON.stringify(groundItems.map(({x,y,tier,kind}) => ({x,y,tier,kind}))) === JSON.stringify(first),
          'same RNG state reproduces all placements and tiers')
        // A world config knob can place all eligible chests in lakes.
        cfg.countRange = [15,15]
        cfg.lakeShare = 1
        groundItems = []
        spawnSubmergedSurfaceChests()
        check(groundItems.length === 15 && groundItems.every(rectangularLake), 'count and lake-share config honored')
        // Tiny ponds can never make close-to-shore exceptions to the rule.
        map = Array.from({length:MAP_H}, () => Array(MAP_W).fill('grass'))
        for (let y=20; y<24; y++) for (let x=20; x<24; x++) map[y][x]='water'
        groundItems = []
        spawnSubmergedSurfaceChests()
        check(groundItems.length === 0, 'pond too shallow for a 4-step swim is skipped')
      } finally {
        map = previous.map
        groundItems = previous.groundItems
        occupied = previous.occupied
        rngState = previous.rngState
        cfg.countRange = originalConfig.countRange
        cfg.lakeShare = originalConfig.lakeShare
      }
      return true
    })()`))
  })
})
