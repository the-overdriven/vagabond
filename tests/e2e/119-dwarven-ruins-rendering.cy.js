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
        // Select an actual known, walkable route beyond sight. A one-step
        // preview ending on a monster intentionally has no footprint.
        const reachable = dungeonWalkDistancesWithDoorTraversal(map, entry)
        const distant = [...reachable.keys()].map(key => {
          const [x,y] = key.split(',').map(Number)
          return {x,y}
        }).find(p => undergroundDiscovered[p.y]?.[p.x] && TILE[map[p.y]?.[p.x]]?.walk &&
          !undergroundTileVisible(p.x,p.y) && !enemies.some(e => e.alive && onCurrentLevel(e) && e.x===p.x && e.y===p.y))
        check(distant, 'known route test has an unoccupied walkable tile outside underground FOV')
        const oldFootstep = drawPathFootstepMarker, oldDarkness = drawMineSightDarkness
        const oldAutoPath = autoPath, oldHoverPath = hoveredAutoPath
        const drawOrder = []
        try {
          autoPath = null
          hoveredAutoPath = [distant]
          drawPathFootstepMarker = (...args) => {drawOrder.push('footstep');return oldFootstep(...args)}
          drawMineSightDarkness = (...args) => {drawOrder.push('darkness');return oldDarkness(...args)}
          for (const tileMode of [true,false]) {
            USE_TILE_IMAGES = tileMode
            drawOrder.length = 0
            render()
            check(drawOrder.includes('darkness'), 'darkness pass ran in mode '+tileMode)
            check(drawOrder.includes('footstep'), 'known unoccupied route marker ran in mode '+tileMode)
            check(drawOrder.indexOf('footstep') > drawOrder.indexOf('darkness'),
              'known underground route draws on top of darkness in mode '+tileMode)
            // The very same path must not uncover a tile that has not been explored.
            undergroundDiscovered[distant.y][distant.x] = false
            drawOrder.length = 0
            try {
              render()
              check(!drawOrder.includes('footstep'), 'unknown tile has no route marker in mode '+tileMode)
              check(!undergroundDiscovered[distant.y][distant.x], 'path preview does not reveal terrain')
            } finally {
              undergroundDiscovered[distant.y][distant.x] = true
            }
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
          const asciiKeepsBackground = tileBackground(1, 1, 'dwarvenstatue') === TILE.dwarvenstatue.bg
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
      // Keep the regression on the existing Ruins rendering/persistence path.
      win.eval(`(() => {
        const check=(ok,msg)=>{if(!ok)throw new Error(msg)}
        for(const tile of ['dwarvenrubble','cryptrubble']) {
          check(TILE[tile].walk===false && TILE[tile].blocksSight===true &&
            TILE[tile].projectileBlock===true, tile+' physically blocks passage, sight and shots')
          check(!UndergroundFov.canSee([['marble',tile,'marble']],0,0,2,0),tile+' blocks FOV')
        }
        const index=deepLevels.findIndex((level,i)=>i>=1 &&
          level.map.some(row=>row.includes('dwarvenrubble')))
        check(index>=1,'at least one generated rubble tile')
        const level=deepLevels[index],z=-index-2
        const y=level.map.findIndex(row=>row.includes('dwarvenrubble'))
        const x=level.map[y].indexOf('dwarvenrubble')
        const key=tileUnderlayKey(x,y,z),floor=tileUnderlays[key]
        const owningMasks=(level.caveMaps||[]).filter(caveMap=>caveMap?.[y]?.[x]==='dwarvenrubble')
        check(TILE[floor]?.walk,'rubble has a real walkable underlay')
        const oldMap=map,oldZ=currentZ,oldInventory=player.inventory,oldRng=rngState
        const originalMasks=level.caveMaps
        try {
          map=level.map;currentZ=z;player.inventory=[]
          // Non-carved cave slots may be null on shared Z-levels. The owning
          // mask still updates, and rubble clearing must not dereference null.
          level.caveMaps=[null,...(originalMasks||[])]
          check(!clearRubbleAt(x,y)&&map[y][x]==='dwarvenrubble',
            'without pickaxe, tile and saved underlay remain unchanged')
          player.inventory=[{kind:'pickaxe'}]
          check(clearRubbleAt(x,y)&&map[y][x]===floor,'pickaxe restores original floor')
          check(owningMasks.every(caveMap=>caveMap[y][x]===floor),
            'every matching cave mask follows the authoritative Z-level change')
          check(!Object.hasOwn(tileUnderlays,key),'removed rubble underlay is not retained')
          level.caveMaps=originalMasks
          const saved=buildSaveObject()
          const savedMasks=saved.deepLevels[index].caveMaps.map(cm=>decodeTileGrid(cm,'cavewall'))
          check(savedMasks.some(cm=>cm?.[y]?.[x]===floor) &&
            savedMasks.every(cm=>cm?.[y]?.[x]!=='dwarvenrubble'),
            'serialized cave maps capture the cleared floor')
          check(rngState===oldRng,'clearing rubble consumes no RNG')
          // Crypt 2 is the legacy separate-map exception: its rubble must not
          // rewrite the ordinary cave at the same x/y/z.
          const originalCave=deepLevels[0].caveMaps?.[0]?.[y]?.[x]
          const cryptMap=Array.from({length:MAP_H},()=>new Array(MAP_W).fill('crypt2floor'))
          cryptMap[y][x]='cryptrubble'
          map=cryptMap;currentZ=-2
          check(clearRubbleAt(x,y)&&map[y][x]==='crypt2floor',
            'crypt rubble reveals crypt floor')
          check(deepLevels[0].caveMaps?.[0]?.[y]?.[x]===originalCave,
            'clearing crypt rubble leaves the z:-2 grotto unchanged')
        } finally {
          level.caveMaps=originalMasks
          level.map[y][x]='dwarvenrubble'
          for(const caveMap of owningMasks)
            if(caveMap[y]?.[x]===floor)caveMap[y][x]='dwarvenrubble'
          tileUnderlays[key]=floor
          map=oldMap;currentZ=oldZ;player.inventory=oldInventory
          invalidateUndergroundFov()
        }
      })()`)
    })
  })
})
