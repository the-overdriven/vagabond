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

    cy.window()
      .its('__VAGABOND_E2E__')
      .invoke({ timeout: 15000 }, 'getLogState')
      .should((logState) => {
        expect(logState.isTyping).to.equal(false)
        expect(logState.queueLength).to.equal(0)
      })

    // Space = inspect surroundings.
    cy.window().trigger('keydown', {
      key: ' ',
      code: 'Space',
      which: 32,
      keyCode: 32,
      bubbles: true,
    })

    // Cypress will retry while the inspection text is being typed.
    cy.get('#logpanel .info')
      .should('contain', 'You are standing on the sacred ground of the Temple.')
  })
})
