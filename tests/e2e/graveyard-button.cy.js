describe('Graveyard HUD button', () => {
  it('is an accessible skull button on desktop and narrow screens', () => {
    cy.viewport(390, 844)
    cy.visit('/')
    cy.get('#raceOverlay .panelbox').should('be.visible')
    cy.window().then(win => {
      Object.defineProperty(win.navigator, 'onLine', {configurable: true, value: false})
    })

    for (const width of [390, 1440]) {
      cy.viewport(width, width === 390 ? 844 : 900)
      cy.get('#btnGraveyard')
        .should('be.visible')
        .and('have.text', '💀')
        .and('have.attr', 'aria-label', 'Graveyard')
        .and('have.attr', 'title', 'Graveyard')
        .click()
      cy.get('#graveyardOverlay').should('have.class', 'show')
      cy.get('#graveyardStatus').should('have.text', 'Online Graveyard unavailable while offline.')
      cy.get('#btnGraveyardClose').click()
      cy.get('#graveyardOverlay').should('not.have.class', 'show')
      cy.get('#raceOverlay').should('have.class', 'show')
    }
  })
})
