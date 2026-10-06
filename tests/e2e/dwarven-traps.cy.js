const {trapFixture,trapRuleChecks,trapPersistenceChecks,trapGenerationChecks} = require('../support/dwarven-trap-checks')

describe('Dwarven Ruins reusable traps', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Dwarven Trap Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
    cy.window().then(win => win.eval(trapFixture.toString()))
  })

  it('resolves movement, blocking, safe paths, and uncredited deaths', () => {
    cy.window().then(win => win.eval(`(${trapRuleChecks.toString()})()`))
  })

  it('restores mechanisms and replays both trap types with the same RNG tape', () => {
    cy.window().then(win => win.eval(`(${trapPersistenceChecks.toString()})()`))
  })

  for (const [seed,count,traits] of [[12345,3,[]],[24680,4,['hollow_world']],[67890,5,['grand_delving']]]) {
    it(`preserves safe routes and seeded generation across ${count} floors`, () => {
      cy.window().then({timeout:120000}, win => win.eval(`(${trapGenerationChecks.toString()})(${seed},${count},${JSON.stringify(traits)})`))
    })
  }
})
