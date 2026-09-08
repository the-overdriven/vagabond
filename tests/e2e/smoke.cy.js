// Starts a fresh game with the given character name and waits for the race
// overlay to close. Callers add their own assertions after this.
function beginNewGame(name = 'E2E Tester') {
  cy.visit('/')

  cy.get('#raceOverlay .panelbox')
    .should('be.visible')

  cy.get('#raceName')
    .clear()
    .type(name)

  cy.get('#btnBegin').click()

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

    cy.get('#logpanel .good')
      .should('have.length.at.least', 1)
      .first()
      .should('have.text', 'Game loaded.')

    waitForLogIdle()

    // Walk onto the gate tile - stepping onto a dwarvengate tile is what
    // logs this message, not inspecting it.
    pressMove('right')
    cy.get('#hDef').should('have.text', '1') // hill gives +1 DEF
    pressMove('left')

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
})
