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

// Space = inspect surroundings.
function pressInspect() {
  cy.window().trigger('keydown', {
    key: ' ',
    code: 'Space',
    which: 32,
    keyCode: 32,
    bubbles: true,
  })
}

const ARROW_KEYS = {
  up: { key: 'ArrowUp', code: 'ArrowUp', which: 38, keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', which: 40, keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', which: 37, keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', which: 39, keyCode: 39 },
}

// Moves the player one tile in the given direction ('up' | 'down' | 'left' | 'right').
function pressMove(direction) {
  cy.window().trigger('keydown', {
    ...ARROW_KEYS[direction],
    bubbles: true,
  })
}

describe('Vagabond smoke test', () => {
  it('starts the game and inspects the Temple with Space', () => {
    cy.visit('/')

    cy.get('#raceOverlay .panelbox')
      .should('be.visible')

    const name = 'E2E Tester'

    cy.get('#raceName')
      .clear()
      .type(name)

    cy.get('#btnBegin').click()

    cy.get('#raceOverlay')
      .should('not.have.class', 'show')

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
    pressMove('left')

    cy.get('#logpanel .info')
      .should('contain', 'You stand beneath the open dwarven gates')
  })
})
