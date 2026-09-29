// Starts a fresh game with the given character name and waits for the race
// overlay to close after world generation. Callers add their own assertions.
function beginNewGame(name = 'E2E Tester') {
  cy.visit('/')

  cy.get('#raceOverlay .panelbox')
    .should('be.visible')

  cy.get('#raceName')
    .clear()
    .type(name)

  cy.get('#btnBegin').click()

  // Begin now generates the world asynchronously. Give only this expensive
  // startup phase extra time, and retain the failure message in diagnostics.
  cy.get('#loadingOverlay', { timeout: 60000 }).should(($overlay) => {
    expect($overlay.text(), 'world generation status').not.to.include('failed')
    expect($overlay, 'world generation finished').not.to.be.visible
  })
  cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))

  cy.get('#raceOverlay')
    .should('not.have.class', 'show')
}

// Waits until ALL queued log messages have finished typing. This is given
// its own explicit timeout (rather than raising defaultCommandTimeout
// globally) so a slow log doesn't mask real failures elsewhere in the
// suite. The app itself skips the char-by-char animation under
// window.Cypress, so in practice this resolves almost immediately.
function waitForLogIdle() {
  cy.window()
    .its('__VAGABOND_E2E__')
    .invoke({ timeout: 15000 }, 'getLogState')
    .should((logState) => {
      expect(logState.isTyping).to.equal(false)
      expect(logState.queueLength).to.equal(0)
    })
}

function pressKey(overrides) {
  cy.window().trigger('keydown', { bubbles: true, ...overrides })
}

// Space = inspect surroundings.
function pressInspect() {
  pressKey({ key: ' ', code: 'Space', which: 32, keyCode: 32 })
}

const ARROW_KEYS = {
  up: { key: 'ArrowUp', code: 'ArrowUp', which: 38, keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', which: 40, keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', which: 37, keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', which: 39, keyCode: 39 },
}

// Moves the player one tile in the given direction ('up' | 'down' | 'left' | 'right').
function pressMove(direction) {
  pressKey(ARROW_KEYS[direction])
}

// Tab = toggle the inventory overlay.
function pressToggleInventory() {
  pressKey({ key: 'Tab', code: 'Tab', which: 9, keyCode: 9 })
}

// M = toggle the map overlay.
function pressToggleMap() {
  pressKey({ key: 'm', code: 'KeyM', which: 77, keyCode: 77 })
}

describe('Vagabond smoke test', () => {
  it('starts the game and inspects the Temple with Space', () => {
    const name = 'E2E Tester'
    beginNewGame(name)

    cy.get('#logpanel .good')
      .should('have.length.at.least', 1)
      .first()
      .should('have.text', `${name} the Human. +20% XP gain rate.`)

    // Verify the player is actually at the Temple.
    cy.window()
      .its('__VAGABOND_E2E__')
      .invoke('getState')
      .should((state) => {
        expect(state.currentZ).to.equal(0)
        expect(state.player.x).to.equal(state.spawnPoint.x)
        expect(state.player.y).to.equal(state.spawnPoint.y)
        expect(state.playerTile).to.equal('temple')
      })

    // Starting HUD stats for a fresh Human character.
    cy.get('#hLvl').should('have.text', '1')
    cy.get('#hptext').should('have.text', '50 / 50')
    cy.get('#hpbar').invoke('attr', 'style').should('include', 'width: 100%')
    cy.get('#xpbar').invoke('attr', 'style').should('include', 'width: 0%')
    cy.get('#hAtk').should('have.text', '2')
    cy.get('#hDef').should('have.text', '0')
    cy.get('#hSpd').should('have.text', '3')
    cy.get('#hMf').should('have.text', '0')
    cy.get('#hGold').should('have.text', '0')
    cy.get('#hDeaths').should('have.text', '0')

    waitForLogIdle()
    pressInspect()

    // Cypress will retry while the inspection text is being typed.
    cy.get('#logpanel .info')
      .should('contain', 'You are standing on the sacred ground of the Temple.')
  })

  it('loads a save and walks onto the dwarven gate', () => {
    cy.visit('/')

    cy.get('#raceOverlay .panelbox')
      .should('be.visible')

    cy.get('#btnRaceLoad').click()

    // Path is resolved relative to the project root by selectFile, not the
    // fixtures folder (that's cy.fixture()'s behavior, not this one).
    cy.get('#fileLoad').selectFile('tests/saves/Tester_start.json', { force: true })

    cy.get('#raceOverlay')
      .should('not.have.class', 'show')

    cy.window().its('__VAGABOND_E2E__').invoke('getWorldShape').should(shape => {
      expect(shape.width).to.equal(260)
      expect(shape.height).to.equal(180)
    })
    cy.window().then(win => {
      const dimensions = win.eval(`(() => {
        const save = buildSaveObject()
        loadGameFromObject(save)
        return {savedWidth: save.mapWidth, savedHeight: save.mapHeight, width: MAP_W, height: MAP_H}
      })()`)
      expect(dimensions).to.deep.equal({savedWidth: 260, savedHeight: 180, width: 260, height: 180})
    })

    cy.get('#logpanel .good')
      .should('have.length.at.least', 1)
      .first()
      .should('have.text', 'Game loaded.')

    waitForLogIdle()

    // Walk onto the gate tile - stepping onto a dwarvengate tile is what
    // logs this message, not inspecting it.
    pressMove('down')
    cy.get('#hDef').should('have.text', '1') // hill gives +1 DEF
    pressMove('up')

    cy.get('#logpanel .info')
      .should('contain', 'You stand beneath the open dwarven gates')
  })

  it('opens the inventory and map overlays and switches between them', () => {
    beginNewGame()
    waitForLogIdle()

    cy.get('#invOverlay').should('not.have.class', 'show')
    cy.get('#mapOverlay').should('not.have.class', 'show')

    // Tab opens the inventory.
    pressToggleInventory()
    cy.get('#invOverlay').should('have.class', 'show')
    cy.get('#mapOverlay').should('not.have.class', 'show')
    cy.get('#statGrid .row').first().should('contain.text', 'Human').and('not.contain.text', '+20% XP gain rate')
    cy.window().then(win => {
      expect(win.eval('tileInspectInfo(player.x, player.y).html')).to.include('+20% XP gain rate')
    })

    // The inventory's "View Map" button swaps over to the map overlay.
    cy.get('#btnInvToMap').click()
    cy.get('#mapOverlay').should('have.class', 'show')
    cy.get('#invOverlay').should('not.have.class', 'show')

    // The map's "Inventory" button swaps back.
    cy.get('#btnMapToInv').click()
    cy.get('#invOverlay').should('have.class', 'show')
    cy.get('#mapOverlay').should('not.have.class', 'show')

    // Close the inventory, then open the map directly with 'M'.
    cy.get('#btnInvClose').click()
    cy.get('#invOverlay').should('not.have.class', 'show')

    pressToggleMap()
    cy.get('#mapOverlay').should('have.class', 'show')
    cy.get('#invOverlay').should('not.have.class', 'show')

    // 'M' again toggles the map closed.
    pressToggleMap()
    cy.get('#mapOverlay').should('not.have.class', 'show')
  })
  it('applies the NPC placement, merchant stock, Herbalist gift, and HUD polish rules', () => {
    beginNewGame('NPC Polish Tester')

    cy.get('#hAtk').parent().should('have.attr', 'title').and('contain', 'Attack')
    cy.get('#hDef').parent().should('have.attr', 'title').and('contain', 'Defense')
    cy.get('#hSpd').parent().should('have.attr', 'title').and('contain', 'Speed')
    cy.get('#hMf').parent().should('have.attr', 'title').and('contain', 'Magic Find')

    cy.window().then(win => {
      const state = win.eval(`(() => {
        const key = (x, y) => x + ',' + y
        const dirs = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]]
        const dist = new Map([[key(spawnPoint.x, spawnPoint.y), 0]])
        const queue = [{x: spawnPoint.x, y: spawnPoint.y}]
        for (let head = 0; head < queue.length; head++) {
          const cur = queue[head]
          const d = dist.get(key(cur.x, cur.y))
          if (d >= 5) continue
          for (const [dx, dy] of dirs) {
            const x = cur.x + dx, y = cur.y + dy
            const k = key(x, y)
            if (dist.has(k) || !isWalkable(x, y)) continue
            const tile = surfaceMap[y][x]
            if (tile === 'river' || tile === 'water' || tile === 'forest') continue
            dist.set(k, d + 1)
            queue.push({x, y})
          }
        }
        const villageNpcNames = new Set(NPC_TEMPLATES
          .filter(t => t.name !== 'Drunk' && !t.placement)
          .map(t => t.name))
        const npcDistances = npcs
          .filter(n => villageNpcNames.has(n.name))
          .map(n => ({name:n.name, tile:surfaceMap[n.y][n.x], distance:dist.get(key(n.x,n.y)) ?? null}))
        const stock = Object.fromEntries(merchantStock
          .filter(i => ['homecomingscroll','idscroll','scroll'].includes(i.kind))
          .map(i => [i.kind, i.count]))
        const sword = merchantStock.find(i => i.kind === 'weapon' && i.base === 'Two-handed Sword')
        return {npcDistances, stock, swordPrice:sword?.merchantPrice}
      })()`)
      for (const npc of state.npcDistances) {
        expect(npc.tile, npc.name + ' terrain').not.to.be.oneOf(['river', 'water'])
        expect(npc.distance, npc.name + ' walk distance').to.be.at.most(5)
      }
      expect(state.stock.homecomingscroll).to.equal(9)
      expect(state.stock.idscroll).to.equal(6)
      expect(state.stock.scroll).to.equal(3)
      expect(state.swordPrice).to.equal(600)
    })

    cy.window().then(win => {
      const gift = win.eval(`(() => {
        const herbalist = npcs.find(n => n.name === 'Herbalist')
        player.x = herbalist.x - 1
        player.y = herbalist.y
        const before = player.inventory.filter(i => i.kind === 'herb').reduce((n, i) => n + (i.count || 1), 0)
        tryOpenTrade(herbalist)
        toggleTrade(false)
        const afterFirst = player.inventory.filter(i => i.kind === 'herb').reduce((n, i) => n + (i.count || 1), 0)
        tryOpenTrade(herbalist)
        toggleTrade(false)
        const afterSecond = player.inventory.filter(i => i.kind === 'herb').reduce((n, i) => n + (i.count || 1), 0)
        const saved = buildSaveObject()
        return {before, afterFirst, afterSecond, savedFlag:saved.herbalistGiftGiven}
      })()`)
      expect(gift.afterFirst).to.equal(gift.before + 1)
      expect(gift.afterSecond).to.equal(gift.afterFirst)
      expect(gift.savedFlag).to.equal(true)
    })
  })

})
