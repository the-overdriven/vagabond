const spell=require('../helpers/enemy-spell-checks.js')
const immunity=require('../helpers/enemy-immunity-checks.js')
const {trapFixture}=require('../support/dwarven-trap-checks.js')

describe('Generic five-turn monster immunity',()=>{
  beforeEach(()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>cy.window().then(win=>{
      win.__immunityFixture=save
      win.eval('loadGameFromObject(window.__immunityFixture,{isReplayInit:true})')
      delete win.__immunityFixture
      for(const [name,fn] of Object.entries({...spell,...immunity,trapFixture}))
        win.eval('window.'+name+'='+fn.toString())
    }))
  })
  it('protects five actions without spending death shield and expires for good',()=>{
    cy.window().then(win=>win.eval('enemyImmunityRulesCheck()'))
  })
  it('blocks damage from dungeon traps but not after immunity expires',()=>{
    cy.window().then(win=>win.eval('enemyImmunityTrapCheck()'))
  })
  it('saves and deterministically replays immunity and combat',()=>{
    cy.window().then(win=>win.eval('enemyImmunityReplayCheck()'))
  })
  for(const [label,w,h] of [['desktop',1280,800],['mobile',390,844]])
    it('shows an inspectable immunity counter on '+label,()=>{
      cy.viewport(w,h)
      cy.window().then(win=>win.eval(`(() => {
        setupEnemySpellArena()
        const e=makeSpellTestEnemy('Skeleton',['immunity'],39,40)
        e.immunityUsed=true;e.immunityUntilTurn=turnCount+5
        const html=tileInspectInfo(e.x,e.y).html
        if(!html.includes('Immunity · 5 turns'))throw Error('immunity not shown in inspect view')
      })()`))
    })
})
