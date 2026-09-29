function beginStatusGame() {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type('Status Tester')
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay').should('not.be.visible')
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Active player statuses', () => {
  it('clears temporary effects on death without clearing them on a living Temple return', () => {
    beginStatusGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        replayAnimationsDisabled = true
        player.berryRegenTurns = 67
        returnPlayerToTemple()
        const livingReturnPreservesRegen = player.berryRegenTurns === 67
        player.invisibleTurns = 12
        player.speedPotionTurns = 8
        player.speedPotionBonus = 5
        player.freezing = {active: true, turns: 2}
        player.curseDebuffs = [{stat: 'atk', amt: -1, turnsLeft: 3}]
        player.hp = 0
        die()
        return {livingReturnPreservesRegen, berryRegenTurns: player.berryRegenTurns,
          invisibleTurns: player.invisibleTurns, speedPotionTurns: player.speedPotionTurns,
          speedPotionBonus: player.speedPotionBonus, freezing: player.freezing,
          curseDebuffs: player.curseDebuffs, statuses: activePlayerStatuses()}
      })()`)
      expect(result).to.deep.equal({
        livingReturnPreservesRegen: true, berryRegenTurns: 0, invisibleTurns: 0,
        speedPotionTurns: 0, speedPotionBonus: 0, freezing: {active: false, turns: 0},
        curseDebuffs: [], statuses: []
      })
    })
    cy.get('#playerStatuses').should('not.be.visible')
  })

  it('shows resolved counters, handles freezing cycles and expiry, and consumes no gameplay state', () => {
    beginStatusGame()
    cy.get('#playerStatuses').should('not.be.visible')
    cy.window().then(win => win.eval(`
      player.freezing = {active:true, turns:2}
      player.berryRegenTurns = 67
      player.invisibleTurns = 12
      player.speedPotionTurns = 8
      player.curseDebuffs = [{stat:'atk',amt:-1,turnsLeft:3}, {stat:'atk',amt:-2,turnsLeft:3}, {stat:'atk',amt:-1,turnsLeft:5}]
      updateHud()
    `))
    cy.get('[data-status="freezing"]').should('contain.text', '3t').and('not.contain.text', 'hit')
    cy.get('[data-status="regen"]').should('contain.text', '67t')
    cy.get('[data-status="invisible"]').should('contain.text', '12t')
    cy.get('[data-status="speed"]').should('contain.text', '8t')
    cy.get('[data-status="penalty-atk-3"]').should('contain.text', 'ATK -3')
    cy.get('[data-status="penalty-atk-5"]').should('contain.text', '5t')
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const before = JSON.stringify({player, rngState, turnCount})
        for(let i=0;i<10;i++) updatePlayerStatuses()
        return before === JSON.stringify({player, rngState, turnCount})
      })()`)
      expect(result).to.equal(true)
    })
    cy.get('[data-status="freezing"]').click()
    cy.get('#playerStatusDetail').should('be.visible').and('contain.text', '−1 HP in 3 turns')
    cy.get('[data-status="freezing"]').click()
    cy.get('#playerStatusDetail').should('not.be.visible')
    cy.window().then(win => win.eval(`
      currentZ = 0
      map = surfaceMap
      map[player.y][player.x] = 'snow'
      player.freezing.turns = 4
      tickFreezing()
      updateHud()
    `))
    cy.get('[data-status="freezing"]').should('contain.text', '5t').and('not.contain.text', 'hit')
    cy.window().then(win => win.eval(`
      map[player.y][player.x] = 'grass'
      tickFreezing()
      player.invisibleTurns = 1
      player.berryRegenTurns = 1
      player.speedPotionTurns = 1
      player.curseDebuffs = [{stat:'atk',amt:-1,turnsLeft:1}]
      enemyTurn()
      updateHud()
    `))
    cy.get('#playerStatuses').should('not.be.visible')
    cy.window().then(win => win.eval('player.godMode = true; player.godInvisible = true; updateHud()'))
    cy.get('[data-status="invisible"]').should('contain.text', '∞')
    cy.window().then(win => win.eval('player.godInvisible = false; updateHud()'))
    cy.get('#playerStatuses').should('not.be.visible')
  })

  it('fits desktop and narrow canvases in tile and ASCII modes and keeps inspection turn-free', () => {
    beginStatusGame()
    cy.window().then(win => win.eval(`
      player.freezing = {active:true, turns:2}
      player.berryRegenTurns = 67
      player.invisibleTurns = 12
      player.speedPotionTurns = 8
      updateHud()
    `))
    for (const width of [1440, 390, 320]) {
      cy.viewport(width, 900)
      for (const tiles of [true, false]) {
        cy.window().then(win => win.eval(`USE_TILE_IMAGES = ${tiles}; render()`))
        cy.get('#playerStatusList').then(list => {
          const canvas = list[0].ownerDocument.getElementById('game').getBoundingClientRect()
          for (const badge of list[0].children) {
            const rect = badge.getBoundingClientRect()
            expect(rect.left).to.be.at.least(canvas.left)
            expect(rect.right).to.be.at.most(canvas.right)
            expect(rect.bottom).to.be.at.most(canvas.bottom)
          }
        })
      }
    }
    let turn
    cy.window().then(win => { turn = win.eval('turnCount') })
    cy.get('[data-status="regen"]').click()
    cy.get('#playerStatusDetail').should('be.visible')
    cy.get('[data-status="regen"]').trigger('keydown', {key:'Escape'})
    cy.get('#playerStatusDetail').should('not.be.visible')
    cy.window().then(win => expect(win.eval('turnCount')).to.equal(turn))
  })
})
