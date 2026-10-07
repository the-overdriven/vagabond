function beginNewGame(name = 'Turn Animation Tester') {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type(name)
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', { timeout: 60000 }).should(($overlay) => {
    expect($overlay.text(), 'world generation status').not.to.include('failed')
    expect($overlay, 'world generation finished').not.to.be.visible
  })
  cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Stationary turn animation handoff', () => {
  it('starts the shared animation loop for item, forage, and dig turns', () => {
    beginNewGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const saved = {
          enemyTurn, npcTurn, updateHud, render, renderInventory, updateTooltip,
          runAnimationLoop, rng, randInt, foragedTiles, dugSandTiles, groundItems,
          treasureMapSpot, tile: map[player.y][player.x]
        }
        let loops = 0
        try {
          enemyTurn = () => {}
          npcTurn = () => {}
          updateHud = () => {}
          render = () => {}
          renderInventory = () => {}
          updateTooltip = () => {}
          runAnimationLoop = () => { loops++ }

          consumeItemTurn()
          const itemLoops = loops

          loops = 0
          map[player.y][player.x] = 'forest'
          foragedTiles = new Set()
          rng = () => 0.99
          tryForage()
          const forageLoops = loops

          loops = 0
          map[player.y][player.x] = 'sand'
          dugSandTiles = new Set()
          groundItems = []
          treasureMapSpot = null
          randInt = () => 100
          tryDig({recordReplay:false})
          const digLoops = loops

          return {itemLoops, forageLoops, digLoops}
        } finally {
          enemyTurn = saved.enemyTurn
          npcTurn = saved.npcTurn
          updateHud = saved.updateHud
          render = saved.render
          renderInventory = saved.renderInventory
          updateTooltip = saved.updateTooltip
          runAnimationLoop = saved.runAnimationLoop
          rng = saved.rng
          randInt = saved.randInt
          foragedTiles = saved.foragedTiles
          dugSandTiles = saved.dugSandTiles
          groundItems = saved.groundItems
          treasureMapSpot = saved.treasureMapSpot
          map[player.y][player.x] = saved.tile
          saved.render()
        }
      })()`)
      expect(result).to.deep.equal({itemLoops: 1, forageLoops: 1, digLoops: 1})
    })
  })
})
