const spellChecks = require('../helpers/enemy-spell-checks.js')

describe('Shared monster spells and Lich loadout', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => cy.window().then(win => {
      win.__spellFixture=save
      win.eval('loadGameFromObject(window.__spellFixture,{isReplayInit:true})')
      delete win.__spellFixture
      for(const [name,fn] of Object.entries(spellChecks))win.eval('window.'+name+' = '+fn.toString())
    }))
  })

  for(const [title,fn] of [
    ['lets a second species cast the same abilities and persists generic statuses','genericEnemySpellChecks'],
    ['moves one exact equipment item to inventory and immediately updates HP','enemyDisarmChecks'],
    ['dispels one temporary buff without affecting permanent powers or debuffs','enemyDispelChecks'],
    ['respects eligibility and uses one spell roll and one action per turn','enemySpellEligibilityChecks'],
    ['replays actual spell turns and restores the same inventory and buffs','enemySpellReplayChecks']
  ])it(title,()=>cy.window().then(win=>win.eval(fn+'()')))

  for(const [label,width,height,ascii] of [
    ['desktop tiles',1280,800,false],['mobile ASCII',390,844,true]
  ])it('shows generic spell status badges and named cast messages on '+label,()=>{
    cy.viewport(width,height)
    cy.window().then(win=>win.eval(`(() => {
      setupEnemySpellArena()
      const caster=makeSpellTestEnemy('Skeleton',['weaken','slow'])
      const old={chance,pick}
      try {
        chance=()=>true;pick=choices=>choices[0]
        tryEnemySpell(caster);tryEnemySpell(caster)
        USE_TILE_IMAGES=${!ascii};updateHud();render()
      } finally {chance=old.chance;pick=old.pick}
    })()`))
    cy.get('#playerStatusList').contains('Weakened').should('be.visible')
    cy.get('#playerStatusList').contains('Slowed').should('be.visible')
    cy.get('#logpanel').should('contain.text','The Skeleton weakens you!')
    cy.get('#logpanel').should('contain.text','The Skeleton slows you!')
  })
})
