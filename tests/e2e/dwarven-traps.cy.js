const {trapFixture,trapRuleChecks,trapPersistenceChecks,trapGenerationChecks} = require('../support/dwarven-trap-checks')

describe('Dwarven Ruins reusable traps', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    // These tests replace the active Ruins floor immediately. Loading the
    // checked-in current-format save gives them a deterministic initialized
    // world without paying for an unrelated random world-generation pass in
    // every beforeEach. The seeded generation cases below still generate the
    // worlds they actually verify.
    cy.readFile('tests/saves/Tester_start.json').then(save => {
      cy.window().then(win => {
        win.__dwarvenTrapBootstrapSave = save
        win.eval(`loadGameFromObject(window.__dwarvenTrapBootstrapSave, {isReplayInit:true})`)
        delete win.__dwarvenTrapBootstrapSave
        win.eval(`raceOpen=false; document.getElementById('raceOverlay').classList.remove('show')`)
        win.eval(trapFixture.toString())
      })
    })
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
