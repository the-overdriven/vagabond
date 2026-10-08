const {trapFixture,trapRuleChecks,trapPersistenceChecks,trapGenerationChecks} = require('../support/dwarven-trap-checks')

describe('Dwarven Ruins reusable traps', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    // These tests replace the active Ruins floor immediately. Loading the
    // checked-in current-format save gives them a deterministic initialized
    // world without paying for an unrelated random world-generation pass in
    // every beforeEach. The seeded generation cases below still generate the
    // worlds they actually verify.
    cy.readFile('tests/saves/Tester_start.json').then(save => {
      cy.window().then(win => {
        win.__dwarvenTrapBootstrapSave = save
        win.eval(`loadGameFromObject(window.__dwarvenTrapBootstrapSave, {isReplayInit:true})`)
        delete win.__dwarvenTrapBootstrapSave
        win.eval(`raceOpen=false; document.getElementById('raceOverlay').classList.remove('show')`)
        win.eval(trapFixture.toString())
      })
    })
  })

  it('resolves movement, blocking, safe paths, and uncredited deaths', () => {
    cy.window().then(win => win.eval(`(${trapRuleChecks.toString()})()`))
  })

  it('shows raised spikes only while a living creature occupies the trap', () => {
    cy.window().then(win => win.eval(`(() => {
      const check = (ok, msg) => { if (!ok) throw Error(msg) }
      const level = trapFixture()
      level.traps = [{id:'spike', type:'spikes', trigger:{x:11,y:12}}]
      map[12][11] = 'dwarvenspikes'
      const idle = 'img/tiles/dwarven-floor-trap-0.png'
      const raised = 'img/tiles/dwarven-floor-trap-1.png'
      const config = RENDER_STYLE.terrainTiles.dwarvenspikes
      check(config.image === idle && config.activeImage === raised && !config.sourceRect,
        'spike art uses the two full-frame tile assets, not the old atlas')
      const visualImage = () => terrainVisual('dwarvenspikes', 11, 12).image
      const drawnImages = []
      const oldDraw = drawImageVisual
      const oldImages = USE_TILE_IMAGES
      const paint = () => {
        drawnImages.length = 0
        render()
        return drawnImages[drawnImages.length - 1]
      }
      drawImageVisual = (px, py, visual, alpha) => {
        if (visual?.image === idle || visual?.image === raised) drawnImages.push(visual.image)
        return oldDraw(px, py, visual, alpha)
      }
      try {
        USE_TILE_IMAGES = true
        check(visualImage() === idle && paint() === idle, 'empty trap is recessed')
        player.x = 11
        check(visualImage() === raised && paint() === raised, 'player raises the spikes')
        player.x = 10
        check(visualImage() === idle && paint() === idle, 'spikes retract when player leaves')

        const monster = {x:11,y:12,level:-4,levelKind:'chain',alive:true}
        enemies = [monster]
        check(visualImage() === raised, 'living monster also raises the spikes')
        monster.alive = false
        check(visualImage() === idle, 'dead monster does not hold spikes raised')
        monster.alive = true
        monster.level = -3
        check(visualImage() === idle, 'monster on another floor does not activate the image')
        enemies = []

        USE_TILE_IMAGES = false
        paint()
        check(drawnImages.length === 0 && TILE.dwarvenspikes.ch === '^',
          'ASCII mode retains the existing spike glyph instead of drawing either image')
        check(map[12][11] === 'dwarvenspikes' && level.traps.length === 1,
          'image changes do not mutate the mechanism or its terrain')
      } finally {
        drawImageVisual = oldDraw
        USE_TILE_IMAGES = oldImages
      }
      return true
    })()`))
  })

  it('restores mechanisms and replays both trap types with the same RNG tape', () => {
    cy.window().then(win => win.eval(`(${trapPersistenceChecks.toString()})()`))
  })

  for (const [seed,count,traits] of [[12345,3,[]],[24680,4,['hollow_world']],[67890,5,['grand_delving']]]) {
    it(`preserves safe routes and seeded generation across ${count} floors`, () => {
      cy.window().then({timeout:120000}, win => win.eval(`(${trapGenerationChecks.toString()})(${seed},${count},${JSON.stringify(traits)})`))
    })
  }
})
