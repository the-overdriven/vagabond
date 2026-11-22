describe('Wayfaring concealment and forest truce', () => {
  it('preserves observer results, cover, dodges and peace across movement, combat, save and replay', () => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    // Evaluate the original browser helper, not Babel's transformed function.toString().
    cy.readFile('tests/helpers/wayfaring-stealth-checks.js', 'utf8').then(source => {
      cy.readFile('tests/saves/Tester_start.json').then(save => {
        cy.window().then({timeout:60000}, win => {
          win.__stealthFixture=save
          return win.eval(`${source}\n;wayfaringStealthChecks(window.__stealthFixture)`)
        })
      })
    })
  })
})
