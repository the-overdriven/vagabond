describe('Graveyard HUD button', () => {
  it('is an accessible skull button on desktop and narrow screens', () => {
    cy.viewport(390, 844)
    cy.visit('/')
    cy.window().then(win => {
      Object.defineProperty(win.navigator, 'onLine', {configurable: true, value: false})
    })
    // Cypress uses a fine pointer even at phone viewport widths.
    cy.get('#sidePanel').invoke('hide')
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

    cy.viewport(1440, 900)
    cy.get('#btnGraveyard').should('be.visible').and('have.attr', 'title', 'Graveyard')
  })
})
