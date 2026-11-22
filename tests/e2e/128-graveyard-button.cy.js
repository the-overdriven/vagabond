describe('Compact HUD buttons', () => {
  it('has accessible HUD buttons and music credits on desktop and narrow screens', () => {
    cy.viewport(390, 844)
    cy.visit('/')
    cy.get('#raceOverlay .panelbox').should('be.visible')
    cy.window().then(win => {
      Object.defineProperty(win.navigator, 'onLine', {configurable: true, value: false})
    })

    for (const width of [390, 1440]) {
      cy.viewport(width, width === 390 ? 844 : 900)
      cy.get('#btnRaceLoad').should('not.exist')
      cy.get('#btnLoad').should('be.visible')
      cy.get('.race-footer-actions .music-credits-link').scrollIntoView().should('be.visible').should($link => {
        const link = $link[0]
        const footer = link.parentElement
        const bounds = link.getBoundingClientRect()
        const row = footer.getBoundingClientRect()
        const style = link.ownerDocument.defaultView.getComputedStyle(link)
        expect(parseFloat(style.fontSize)).to.be.at.most(10)
        expect(style.color).to.equal('rgb(156, 139, 108)')
        expect(bounds.left).to.be.closeTo(row.left, 1)
        const begin = footer.querySelector('#btnBegin').getBoundingClientRect()
        expect(begin.right).to.be.closeTo(row.right, 1)
        expect(begin.bottom).to.be.closeTo(row.bottom, 1)
        expect(begin.left).to.be.greaterThan(bounds.left)
        for (const control of footer.querySelectorAll('button, label')) {
          const rect = control.getBoundingClientRect()
          if (!rect.width || !rect.height) continue
          const overlaps = bounds.left < rect.right - 1 && bounds.right > rect.left + 1 &&
            bounds.top < rect.bottom - 1 && bounds.bottom > rect.top + 1
          expect(overlaps, `credits overlap ${control.id || control.textContent.trim()}`).to.be.false
        }
      }).and('have.attr', 'href').and('include', '/CREDITS.md')
      cy.get('#btnSound').should('be.visible').and('have.text', '🔊')
        .and('have.attr', 'aria-pressed', 'true').click()
        .should('have.text', '🔇').and('have.attr', 'aria-pressed', 'false')
      cy.window().then(win => expect(win.localStorage.getItem('vagabond_sound_muted')).to.equal('1'))
      cy.get('#btnSound').click().should('have.text', '🔊')
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
      cy.get('#btnHighscores')
        .should('be.visible')
        .and('have.attr', 'title', 'Highscores')
        .click()
      cy.get('#highscoresStatus').should('have.text', 'Online Highscores unavailable while offline.')
      cy.get('#graveyardOverlay').should('not.have.class', 'show')
      cy.get('#btnHighscoresClose').click()
      cy.get('#raceOverlay').should('have.class', 'show')
    }
    cy.get('#btnSound').click().should('have.text', '🔇')
    cy.reload()
    cy.get('#btnSound').should('have.text', '🔇').and('have.attr', 'aria-pressed', 'false')
    cy.get('#btnSound').click().should('have.text', '🔊')
  })
})
