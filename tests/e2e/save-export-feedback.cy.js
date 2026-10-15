describe('Save export error feedback', () => {
  it('shows a visible error as well as logging when creating the download fails', () => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceName').clear().type('Save Error Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay', {timeout: 60000}).should('not.have.class', 'show')
    cy.window().then(win => {
      cy.stub(win, 'alert').as('saveErrorAlert')
      cy.stub(win.URL, 'createObjectURL').throws(new Error('download blocked'))
      win.eval('saveGame()')
    })
    cy.get('@saveErrorAlert').should('have.been.calledOnceWith', 'Failed to save the game: download blocked')
    cy.get('#logpanel').should('contain.text', 'Failed to save the game.')
  })
})
