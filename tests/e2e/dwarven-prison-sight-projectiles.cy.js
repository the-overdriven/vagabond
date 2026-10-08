describe('Dwarven prison bars, doors, and projectile lanes', () => {
  it('keeps barred cells visible and shoot-through without making them walkable', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Dwarven Prison Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.window().then(win => win.eval(`(() => {
      const check = (ok, message) => { if (!ok) throw new Error(message) }
      const art = RENDER_STYLE.terrainTiles
      for (const tile of ['dwarvenprisonbars', 'dwarvenprisondoorclosed', 'dwarvenprisondoorlocked']) {
        check(TILE[tile]?.walk === false, tile + ' blocks movement')
        check(TILE[tile]?.blocksSight !== true, tile + ' does not block FOV')
        check(TILE[tile]?.projectileBlock !== true, tile + ' allows projectiles')
      }
      for (const tile of ['dwarvendoorclosed', 'dwarvendoorlocked', 'dwarvengatelocked']) {
        check(TILE[tile]?.walk === false && TILE[tile]?.blocksSight === true &&
          TILE[tile]?.projectileBlock === true, tile + ' stays solid')
      }
      check(art.dwarvengatelocked?.image === 'img/tiles/dwarven-door-closed.png', 'progression gate uses normal door art')
      check(art.dwarvendoorclosed?.image === 'img/tiles/dwarven-door-closed.png', 'ordinary room uses normal door art')
      check(art.dwarvenprisondoorlocked?.image === 'img/tiles/dwarven-prison-door-locked.png', 'cell lock uses barred door art')
      check(art.dwarvenprisondoorclosed?.image === 'img/tiles/dwarven-prison-door-locked.png', 'unlocked cell door is still barred')
      check(art.dwarvenprisonbars?.image === 'img/tiles/dwarven-prison-bars.png', 'prison wall uses bar art')

      const oldMap = map, oldZ = currentZ, oldX = player.x, oldY = player.y, oldEnemies = enemies
      try {
        currentZ = -4
        player.x = 2
        player.y = 0
        enemies = []
        const shooter = {x:0,y:0}
        for (const tile of ['dwarvenprisonbars', 'dwarvenprisondoorclosed', 'dwarvenprisondoorlocked',
          'dwarvenprisondooropen']) {
          map = [['marble', tile, 'marble']]
          check(UndergroundFov.canSee(map,0,0,2,0,8), 'visibility passes through ' + tile)
          check(clearProjectilePath(shooter)?.length === 3, 'projectiles pass through ' + tile)
        }
        for (const tile of ['dwarvendoorclosed', 'dwarvendoorlocked', 'dwarvengatelocked']) {
          map = [['marble', tile, 'marble']]
          check(!UndergroundFov.canSee(map,0,0,2,0,8), 'solid door blocks visibility: ' + tile)
          check(clearProjectilePath(shooter) === null, 'solid door blocks projectiles: ' + tile)
        }
      } finally {
        map = oldMap
        currentZ = oldZ
        player.x = oldX
        player.y = oldY
        enemies = oldEnemies
      }
    })()`))
  })
})
