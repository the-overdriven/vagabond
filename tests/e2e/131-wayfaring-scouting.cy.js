describe('Wayfaring magical scouting', () => {
  it('reveals only connected unknown terrain, opens the remote scene and preserves scouting across save and replay', () => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    // Evaluate the original browser helper, not Babel's transformed function.toString().
    cy.readFile('tests/helpers/wayfaring-scouting-checks.js', 'utf8').then(source => {
      cy.readFile('tests/saves/Tester_start.json').then(save => {
        cy.window().then({timeout:60000}, win => {
          win.__scoutingFixture=save
          return win.eval(`${source}\n;wayfaringScoutingChecks(window.__scoutingFixture)`)
        })
      })
    })
  })
})
