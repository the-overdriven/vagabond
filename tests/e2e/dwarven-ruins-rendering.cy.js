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
