const spellHelpers=require('../helpers/enemy-spell-checks.js')
const gearHelpers=require('../helpers/gear-auto-equip-checks.js')
describe('Loot auto equip respects two-handed restrictions',()=>{
  beforeEach(()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>cy.window().then(win=>{
      win.__gearFixture=save
      win.eval('loadGameFromObject(window.__gearFixture,{isReplayInit:true})')
      delete win.__gearFixture
      for(const [name,fn] of Object.entries({...spellHelpers,...gearHelpers}))
        win.eval('window.'+name+' = '+fn.toString())
    }))
  })
  it('keeps dropped two-handed gear in inventory when a shield is equipped and replays safe equip behavior',()=>{
    cy.window().then(win=>win.eval('gearAutoEquipShieldConflictCheck()'))
  })
})
