describe('Animated terrain rendering', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Water Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
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
              const key = TILE_PX + '|' + (visual.scale ?? 1) + '|' + (visual.filter || '') + '|false'
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
  it('keeps ground blends and diagonal rivers connected without replacing terrain textures', () => {
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const originalMap = map, originalUnderlays = tileUnderlays, originalZ = currentZ
        const ground = RENDER_STYLE.terrainTiles
        const x = 4, y = 4
        const cell = (dx, dy, tile) => {map[y + dy][x + dx] = tile}
        const reset = (tile, fill = tile) => {
          map = Array.from({length:9}, () => Array(9).fill(fill))
          cell(0, 0, tile)
        }
        try {
          currentZ = 0
          tileUnderlays = {}
          reset('sand')
          cell(0, -1, 'grass'); cell(1, 0, 'grass')
          const sand = terrainVisual('sand', x, y)
          const sandBasePreserved = sand.image === ground.sand.image
          const sandBlend = sand.groundBlend

          reset('snow')
          cell(0, -1, 'sand'); cell(1, 0, 'grass')
          const snow = terrainVisual('snow', x, y)
          const snowBasePreserved = snow.image === ground.snow.image
          const snowBlend = snow.groundBlend

          reset('river', 'grass')
          cell(-1, -1, 'river'); cell(1, 1, 'river')
          const river = terrainVisual('river', x, y)
          const riverBasePreserved = river.frames === ground.river.frames && river.image === ground.river.image
          const riverDiagonalArms = river.diagonalRiverArms
          const riverGround = river.baseTileKey
          const riverHasNoTransparentMain = river.frames?.length > 0 && river.image !== null

          // A diagonal-only segment feeds a cardinal river: both ends must
          // retain the same arm, and the cardinal endpoint keeps its full base.
          reset('river', 'grass')
          cell(0, 1, 'river'); cell(1, -1, 'river')
          const junction = terrainVisual('river', x, y)
          const diagonal = terrainVisual('river', x + 1, y - 1)
          const mixedJoin = junction.diagonalRiverJoinArms === 2 && !junction.diagonalRiverArms &&
            diagonal.diagonalRiverArms === 8 && junction.frames === ground.river.frames
          cell(0, 0, 'water')
          const lakeJoin = terrainVisual('water', x, y).diagonalRiverJoinArms === 2
          cell(0, 0, 'frozenriver'); cell(0, 1, 'frozenriver'); cell(1, -1, 'frozenriver')
          const frozenJoin = terrainVisual('frozenriver', x, y).diagonalRiverJoinArms === 2
          const landBridge = diagonalWaterLandCorners(x+1,y).length === 1
          const frozenGround = diagonalRiverGround(x+1,y-1) === 'snow'
          const savedPixels = ctx.getImageData(0,0,TILE_PX,TILE_PX)
          const savedFrameTime = visualFrameTime
          let landBridgePixels
          try {
            visualFrameTime = 0
            drawTerrainVisualStack(0,0,'grass',x+1,y,terrainVisual('grass',x+1,y),'#456c26')
            const actual = ctx.getImageData(2,2,1,1).data
            const expected = scaledVisualCanvas(resolveVisualImage(ground.frozenriver),1)
              .getContext('2d').getImageData(2,2,1,1).data
            landBridgePixels = actual.every((value,index) => value === expected[index])
          } finally {
            visualFrameTime = savedFrameTime
            ctx.putImageData(savedPixels,0,0)
          }
          const opaqueGround = ['grass','sand','snow','water','river','frozenriver']
            .every(key => overlayBaseTileKey(key,x,y) === null)
          cell(1, 0, 'river')
          const ordinaryCorner = !terrainVisual('frozenriver', x, y).diagonalRiverJoinArms

          // Grass/snow/water junction from the reported white corner patch.
          reset('water')
          cell(0,-1,'grass'); cell(-1,-1,'snow')
          const mixedShore = terrainVisual('water',x,y)
          const sharedShoreBiomes = mixedShore.shoreBlend[4] === null &&
            mixedShore.shoreBlend[0] === 'snow' && mixedShore.shoreBlend[1] === 'grass'
          const oldPixels = ctx.getImageData(0,0,TILE_PX,TILE_PX)
          let noWhiteCornerPatch
          try {
            drawTerrainVisualStack(0,0,'water',x,y,mixedShore,'#000')
            const sampleX = Math.max(2,Math.floor(TILE_PX*0.2))
            const pixel = ctx.getImageData(sampleX,0,1,1).data
            // This point belongs to the grass side of the shared shoreline;
            // the old diagonal snow sprite painted an isolated white patch.
            noWhiteCornerPatch = pixel[0] < 160 && pixel[2] < 150
          } finally {ctx.putImageData(oldPixels,0,0)}

          reset('water')
          cell(-1, -1, 'grass')
          const water = terrainVisual('water', x, y)
          const singleCorner = water.overlayImages?.filter(layer => layer.image === ground.water.transitionGrassCornerImage) || []
          const cornerUsesOneRotatedSprite = singleCorner.length === 1 && singleCorner[0].quarterTurns === 0

          currentZ = -1
          const underground = terrainVisual('water', x, y)
          const undergroundNoShore = !underground.overlayImages?.length
          return {sandBasePreserved,sandBlend,snowBasePreserved,snowBlend,riverBasePreserved,riverDiagonalArms,riverGround,
            riverHasNoTransparentMain,cornerUsesOneRotatedSprite,undergroundNoShore,
            mixedJoin,lakeJoin,frozenJoin,ordinaryCorner,landBridge,landBridgePixels,frozenGround,opaqueGround,sharedShoreBiomes,noWhiteCornerPatch}
        } finally {
          map = originalMap
          tileUnderlays = originalUnderlays
          currentZ = originalZ
        }
      })()`)
      expect(result.sandBasePreserved).to.equal(true)
      expect([result.sandBlend[1],result.sandBlend[4],result.sandBlend[5]]).to.deep.equal(['grass','sand','grass'])
      expect(result.snowBasePreserved).to.equal(true)
      expect([result.snowBlend[1],result.snowBlend[4],result.snowBlend[5]]).to.deep.equal(['sand','snow','grass'])
      expect(result.riverBasePreserved).to.equal(true)
      expect(result.riverDiagonalArms).to.equal(5)
      expect(result.riverGround).to.equal('grass')
      expect(result.riverHasNoTransparentMain).to.equal(true)
      expect(result.cornerUsesOneRotatedSprite).to.equal(true)
      expect(result.undergroundNoShore).to.equal(true)
      expect(result.mixedJoin).to.equal(true)
      expect(result.lakeJoin).to.equal(true)
      expect(result.frozenJoin).to.equal(true)
      expect(result.ordinaryCorner).to.equal(true)
      expect(result.landBridge).to.equal(true)
      expect(result.landBridgePixels).to.equal(true)
      expect(result.frozenGround).to.equal(true)
      expect(result.opaqueGround).to.equal(true)
      expect(result.sharedShoreBiomes).to.equal(true)
      expect(result.noWhiteCornerPatch).to.equal(true)
    })
  })

  it('matches transparent hill variants to their ground without breaking mixed rows', () => {
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const previous = {map, tileUnderlays, currentZ, USE_TILE_IMAGES}
        try {
          currentZ = 0; USE_TILE_IMAGES = true; tileUnderlays = {}
          map = Array.from({length:7}, () => Array(7).fill('snow'))
          const hills = RENDER_STYLE.terrainTiles
          for (const x of [2,3,4]) map[3][x] = 'hill'
          tileUnderlays[keyXY(2,3)] = 'grass'
          tileUnderlays[keyXY(3,3)] = 'snow'
          tileUnderlays[keyXY(4,3)] = 'snow'
          const row = [2,3,4].map(x => terrainVisual('hill',x,3).image)
          const bases = [2,3,4].map(x => overlayBaseTileKey('hill',x,3))
          map[3][2] = map[3][4] = 'snow'
          const single = terrainVisual('hill',3,3).image === hills.hillSnow.singleImage
          map[3][3] = 'boulder'
          const snowyBoulder = terrainVisual('boulder',3,3).image === hills.boulderSnow.singleImage
          const boulderAssets = ['leftImage','middleImage','rightImage']
            .every(key => preloadedImages.has(hills.boulderSnow[key]))
          const assetsLoaded = ['singleImage','leftImage','middleImage','rightImage']
            .every(key => preloadedImages.has(hills.hillSnow[key]))
          map[3][3] = 'snowmountain'
          const mountain = terrainVisual('snowmountain',3,3).image === hills.snowmountain.singleImage
          USE_TILE_IMAGES = false
          const ascii = overlayBaseTileKey('hill',3,3) === null
          return {row,bases,single,assetsLoaded,mountain,ascii,snowyBoulder,boulderAssets}
        } finally {
          map = previous.map; tileUnderlays = previous.tileUnderlays
          currentZ = previous.currentZ; USE_TILE_IMAGES = previous.USE_TILE_IMAGES
        }
      })()`)
      expect(result.row).to.deep.equal(['img/tiles/hill-left.png',
        'img/tiles/hill-snow-middle.png','img/tiles/hill-snow-right.png'])
      expect(result.bases).to.deep.equal(['grass','snow','snow'])
      for (const key of ['single','assetsLoaded','mountain','ascii','snowyBoulder','boulderAssets']) expect(result[key],key).to.equal(true)
    })
  })

})
