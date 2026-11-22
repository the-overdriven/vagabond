describe('Frostwalker temporary ice bridges', () => {
  it('keeps terrain, drowning, global floors, save and replay consistent', () => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    // Evaluate the original browser helper, not Babel's transformed function.toString().
    cy.readFile('tests/helpers/frostwalker-checks.js', 'utf8').then(source => {
      cy.readFile('tests/saves/Tester_start.json').then(save => {
        cy.window().then({timeout:60000}, win => {
          win.__frostFixture=save
          return win.eval(`${source}\n;frostwalkerChecks(window.__frostFixture)`)
        })
      })
    })
  })
})
