const {installOnlineMock,levelUpChecks,modeChecks,exclusionChecks,offlineChecks} = require('../support/highscores-checks')

function loadFixture(options = {}) {
  cy.visit('/',{onBeforeLoad:win=>installOnlineMock(win,options)})
  cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
  cy.readFile('tests/saves/Tester_start.json').then(save=>cy.window().then(win=>{
    win.__highscoresFixture=save
    win.eval('loadGameFromObject(window.__highscoresFixture,{isReplayInit:true})')
    delete win.__highscoresFixture
  }))
}

describe('Highscores level-up milestones and permanent exclusion',()=>{
  it('captures one final permanent-stat milestone and suppresses non-level and replay writes',()=>{
    loadFixture()
    cy.window().then(win=>win.eval(`(${levelUpChecks.toString()})()`))
  })
  it('keeps permadeath and non-permadeath eligibility independent',()=>{
    loadFixture({fullPermadeath:true})
    cy.window().then(win=>win.eval(`(${modeChecks.toString()})()`))
  })
  it('persists god-mode exclusion through saves and rollback without polluting replay',()=>{
    loadFixture()
    cy.window().then(win=>win.eval(`(${exclusionChecks.toString()})()`))
  })
  it('supports offline startup and leveling without queueing old milestones',()=>{
    loadFixture({offline:true})
    cy.window().then(win=>win.eval(`(${offlineChecks.toString()})()`))
  })
})
