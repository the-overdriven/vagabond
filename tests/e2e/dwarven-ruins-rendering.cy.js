const {checkDwarvenWallVisuals} = require('../support/dwarven-wall-checks.js')

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
        check(RENDER_STYLE.terrainTiles.dwarvenlever.baseTileKey === 'marble' &&
          RENDER_STYLE.terrainTiles.dwarvenleverpulled.baseTileKey === 'marble',
          'both lever states render over marble while blocking terrain is unchanged')
        check(RENDER_STYLE.terrainTiles.dwarvenprisondoorbreached.image ===
          'img/tiles/dwarven-prison-door-locked-breached.png',
          'a breached prison door keeps its distinct barred-door art')
        check(RENDER_STYLE.terrainTiles.dwarvenminesopen.image ===
          'img/tiles/dwarven-mineshaft-cleaned.png',
          'the opened mine entrance uses the cleared mineshaft art')
        const marble = RENDER_STYLE.terrainTiles.marble
        check(marble.variants.length === 4 &&
          marble.variants.filter(path => path === 'img/tiles/marble-floor-cracked.png').length === 1 &&
          marble.variants.filter(path => path === marble.image).length === 3,
          'Ruins marble has a 25% cracked visual variant')
        const marbleSamples = []
        for (let y=0;y<20;y++) for (let x=0;x<20;x++) {
          const chosen = terrainVisual('marble', x, y).image
          check(chosen === terrainVisual('marble', x, y).image, 'marble visuals are stable')
          check(chosen === terrainVisual('dwarvenpressureplate', x, y).image,
            'pressure plates match their floor pattern at every coordinate')
          marbleSamples.push(chosen)
        }
        const crackCount = marbleSamples.filter(path => path === 'img/tiles/marble-floor-cracked.png').length
        check(crackCount > 60 && crackCount < 140, 'roughly one quarter of Ruins tiles are cracked')
        currentZ = 1
        check(terrainVisual('marble', 0, 0).image === marble.image &&
          terrainVisual('marble', 3, 4).image === marble.image,
          'tower marble stays intact')
        currentZ = -4
        for (const path of [
          'img/tiles/dwarven-prison-door-locked-breached.png',
          'img/tiles/dwarven-mineshaft-cleaned.png',
          'img/tiles/marble-floor-cracked.png'
        ]) {
          const art = preloadedImages.get(path)
          check(art?.naturalWidth > 0 && art?.naturalHeight > 0,
            'new dwarven art preloads successfully: ' + path)
        }
        for (const image of ['img/tiles/dwarven-column-indoor.png', 'img/tiles/dwarven-rubble.png', 'img/tiles/dwarven-stone-wall.png', 'img/tiles/dwarven-stone-wall-cracked.png', 'img/tiles/dwarven-stone-wall-moss.png', 'img/tiles/dwarven-stone-wall-ivy.png'])
          check(preloadedImages.has(image), 'Dwarven visual was preloaded: ' + image)
        for (const path of new Set(RENDER_STYLE.terrainTiles.dwarvenwall.variants)) {
          const image = preloadedImages.get(path)
          check(image?.naturalWidth === 100 && image?.naturalHeight === 100,
            'wall artwork is exactly 100x100: ' + path)
        }
        USE_TILE_IMAGES = true
        render()
        check(document.getElementById('game').width > 0 && document.getElementById('game').height > 0, 'tile canvas renders')
        USE_TILE_IMAGES = false
        render()
        check(document.getElementById('game').width > 0 && document.getElementById('game').height > 0, 'ASCII canvas renders')
        // A known route can extend past current sight. Its markers must stay
        // above underground darkness without uncovering unknown terrain.
        const distantX = player.x + 10 < MAP_W ? player.x + 10 : player.x - 10
        check(!undergroundTileVisible(distantX, player.y), 'route test tile is outside underground FOV')
        const oldFootstep = drawPathFootstepMarker, oldDarkness = drawMineSightDarkness
        const oldAutoPath = autoPath, oldHoverPath = hoveredAutoPath
        const drawOrder = []
        try {
          autoPath = null
          hoveredAutoPath = [{x:distantX,y:player.y}]
          drawPathFootstepMarker = (...args) => {drawOrder.push('footstep');return oldFootstep(...args)}
          drawMineSightDarkness = (...args) => {drawOrder.push('darkness');return oldDarkness(...args)}
          for (const tileMode of [true,false]) {
            USE_TILE_IMAGES = tileMode
            drawOrder.length = 0
            render()
            check(drawOrder.includes('darkness') && drawOrder.indexOf('footstep') > drawOrder.indexOf('darkness'),
              'known underground route draws on top of darkness in mode '+tileMode)
          }
        } finally {
          drawPathFootstepMarker = oldFootstep
          drawMineSightDarkness = oldDarkness
          autoPath = oldAutoPath
          hoveredAutoPath = oldHoverPath
        }
        USE_TILE_IMAGES = true
        render()
      })()`))
      cy.window().then(win => expect(win.eval('(' + checkDwarvenWallVisuals.toString() + ')()')).to.equal(true))
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
          currentZ = -2
          map[1][1] = 'cryptrubble'
          const cryptFloor = overlayBaseTileKey('cryptrubble', 1, 1)
          const cryptIsTransparent = tileBackground(1, 1, 'cryptrubble') === 'transparent'
          currentZ = -5
          const missingDoesNotGuess = overlayBaseTileKey('dwarvenrubble', 1, 1)
          currentZ = 0
          map[1][1] = 'dwarvenstatue'
          const surface = overlayBaseTileKey('dwarvenstatue', 1, 1)
          const surfaceColumnImage = terrainVisual('dwarvenstatue', 1, 1).image
          currentZ = -4
          const indoorColumnImage = terrainVisual('dwarvenstatue', 1, 1).image
          const rubbleVariants = RENDER_STYLE.terrainTiles.dwarvenrubble.variants
          const sample = []
          for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
            const chosen = terrainVisual('dwarvenrubble', x, y).image
            if (terrainVisual('dwarvenrubble', x, y).image !== chosen) throw new Error('Rubble variant changed between renders')
            sample.push(chosen)
          }
          const variantCoverage = rubbleVariants.every(path => sample.includes(path))
          currentZ = 0
          USE_TILE_IMAGES = false
          const asciiDoesNotComposite = overlayBaseTileKey('dwarvenstatue', 1, 1)
          const asciiKeepsBackground = tileBackground(1, 1, 'dwarvenstatue') === TILE.snowmountain.bg
          return {floors, cryptFloor, cryptIsTransparent, missingDoesNotGuess, surface, asciiDoesNotComposite, asciiKeepsBackground,
            surfaceColumnImage, indoorColumnImage, rubbleVariants, variantCoverage}
        } finally {
          map = original.map
          currentZ = original.currentZ
          tileUnderlays = original.tileUnderlays
          USE_TILE_IMAGES = original.USE_TILE_IMAGES
        }
      })()`)
      expect(result.floors).to.deep.equal(['cavefloor','cavefloor','cavefloor2','cavefloor2'])
      expect(result.cryptFloor).to.equal('crypt2floor')
      expect(result.cryptIsTransparent).to.equal(true)
      expect(result.missingDoesNotGuess).to.equal(null)
      expect(result.surface).to.equal('snowmountain')
      expect(result.asciiDoesNotComposite).to.equal(null)
      expect(result.asciiKeepsBackground).to.equal(true)
      expect(result.surfaceColumnImage).to.equal('img/tiles/ancient-stone-column.png')
      expect(result.indoorColumnImage).to.equal('img/tiles/dwarven-column-indoor.png')
      expect(result.rubbleVariants).to.deep.equal(['img/tiles/cave-rubble.png', 'img/tiles/dwarven-rubble.png'])
      expect(result.variantCoverage).to.equal(true)
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
