describe('Dwarven Ruins rendering paths', () => {
  for (const viewport of [{name:'desktop',w:1280,h:800},{name:'mobile',w:390,h:844}]) {
    it(`renders Ruins mechanical terrain in tiles and ASCII on ${viewport.name}`, () => {
      cy.viewport(viewport.w, viewport.h)
      cy.visit('/')
      cy.get('#raceName').clear().type('Ruins Render Tester')
      cy.get('#btnBegin').click()
      cy.get('#loadingOverlay').should('not.be.visible')
      cy.window().then(win => win.eval(`(async () => {
        const check = (ok,msg) => { if (!ok) throw new Error(msg) }
        const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins
        const oldRange = cfg.levelCountRange.slice()
        cfg.levelCountRange = [3,3]
        WORLD_SEED = 610061
        rngState = WORLD_SEED
        await generateNewWorld()
        cfg.levelCountRange = oldRange
        const level = deepLevels[2]
        map = level.map
        currentZ = -4
        currentCave = -1
        undergroundDiscovered = level.discovered
        for (let y=0;y<MAP_H;y++) undergroundDiscovered[y].fill(true)
        const entry = level.caves[0].entrances[0]
        player.x = entry.x
        player.y = entry.y
        const required = ['dwarvendoorclosed','dwarvendooropen','dwarvendoorlocked','dwarvendoorbreached',
          'dwarvengatelocked','dwarvengateopen','dwarvengatebreached','dwarvenspikes','dwarvenpressureplate',
          'dwarvenarrowwall','dwarvenlever','dwarvenleverpulled','dwarvenliftoff','dwarvenlifton',
          'dwarvenbedbarricade','dwarvenprisonbars']
        for (const key of required) {
          check(typeof TILE[key]?.ch === 'string' && TILE[key].ch.length > 0, key + ' has ASCII representation')
          check(RENDER_STYLE.terrainTiles[key]?.image || ['dwarvendoorlocked','dwarvenspikes','dwarvenpressureplate','dwarvenarrowwall','dwarvenlever','dwarvenliftoff','dwarvenlifton'].includes(key),
            key + ' has tile rendering support or intentional base rendering')
        }
        USE_TILE_IMAGES = true
        render()
        check(document.getElementById('game').width > 0 && document.getElementById('game').height > 0, 'tile canvas renders')
        USE_TILE_IMAGES = false
        render()
        check(document.getElementById('game').width > 0 && document.getElementById('game').height > 0, 'ASCII canvas renders')
        USE_TILE_IMAGES = true
        render()
      })()`))
      cy.get('#game').should('be.visible')
    })
  }
})


describe('Dwarven rubble and column floor layers', () => {
  it('composites over recorded per-level terrain, never a guessed floor', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Dwarven Overlay Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const original = {map, currentZ, tileUnderlays, USE_TILE_IMAGES}
        try {
          USE_TILE_IMAGES = true
          map = Array.from({length: 3}, () => Array(3).fill('marble'))
          tileUnderlays = {
            [tileUnderlayKey(1, 1, -3)]: 'cavefloor',
            [tileUnderlayKey(1, 1, -4)]: 'cavefloor2',
            [tileUnderlayKey(1, 1, 0)]: 'snowmountain'
          }
          const floors = []
          for (const z of [-3, -4]) {
            currentZ = z
            for (const tile of ['dwarvenrubble', 'dwarvenstatue']) {
              map[1][1] = tile
              floors.push(overlayBaseTileKey(tile, 1, 1))
              if (tileBackground(1, 1, tile) !== 'transparent') throw new Error('Overlay fills a background')
            }
          }
          currentZ = -5
          const missingDoesNotGuess = overlayBaseTileKey('dwarvenrubble', 1, 1)
          currentZ = 0
          map[1][1] = 'dwarvenstatue'
          const surface = overlayBaseTileKey('dwarvenstatue', 1, 1)
          USE_TILE_IMAGES = false
          const asciiDoesNotComposite = overlayBaseTileKey('dwarvenstatue', 1, 1)
          const asciiKeepsBackground = tileBackground(1, 1, 'dwarvenstatue') === TILE.snowmountain.bg
          return {floors, missingDoesNotGuess, surface, asciiDoesNotComposite, asciiKeepsBackground}
        } finally {
          map = original.map
          currentZ = original.currentZ
          tileUnderlays = original.tileUnderlays
          USE_TILE_IMAGES = original.USE_TILE_IMAGES
        }
      })()`)
      expect(result.floors).to.deep.equal(['cavefloor','cavefloor','cavefloor2','cavefloor2'])
      expect(result.missingDoesNotGuess).to.equal(null)
      expect(result.surface).to.equal('snowmountain')
      expect(result.asciiDoesNotComposite).to.equal(null)
      expect(result.asciiKeepsBackground).to.equal(true)
    })
  })

  it('captures floor underlays during generation and includes them in saves', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Dwarven Underlay Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const missing = []
        let count = 0
        for (let i = 1; i < deepLevels.length; i++) {
          const level = deepLevels[i], z = -i - 2
          for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
            if (!['dwarvenrubble', 'dwarvenstatue'].includes(level.map[y]?.[x])) continue
            count++
            if (!tileUnderlays[tileUnderlayKey(x, y, z)]) missing.push([z,x,y])
          }
        }
        const persisted = buildSaveObject().tileUnderlays
        const stored = Object.keys(persisted).filter(key => key.startsWith('-'))
        return {count,missing,stored:stored.length,saveHasAll:stored.every(key => persisted[key] === tileUnderlays[key])}
      })()`)
      expect(result.count).to.be.greaterThan(0)
      expect(result.missing).to.deep.equal([])
      expect(result.stored).to.be.greaterThan(0)
      expect(result.saveHasAll).to.equal(true)
    })
  })
})
