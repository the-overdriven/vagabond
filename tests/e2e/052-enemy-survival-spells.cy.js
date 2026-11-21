const spell=require('../helpers/enemy-spell-checks.js')
const survival=require('../helpers/enemy-survival-spells-checks.js')

describe('Generic monster low-HP teleport and sacrifice',()=>{
  beforeEach(()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>cy.window().then(win=>{
      win.__survivalFixture=save
      win.eval('loadGameFromObject(window.__survivalFixture,{isReplayInit:true})')
      delete win.__survivalFixture
      for(const [name,fn] of Object.entries({...spell,...survival}))
        win.eval('window.'+name+'='+fn.toString())
    }))
  })
  it('escapes once to a reachable safe tile beyond effective aggro',()=>{
    cy.window().then(win=>win.eval('enemySurvivalTeleportCheck()'))
  })
  it('sacrifices only eligible monsters without player credit',()=>{
    cy.window().then(win=>win.eval('enemySurvivalSacrificeCheck()'))
  })
  it('prioritizes a 50% survival cast (30% sacrifice, 20% teleport)',()=>{
    cy.window().then(win=>win.eval('enemySurvivalWeightsCheck()'))
  })
  it('replays both spells without RNG desync',()=>{
    cy.window().then(win=>win.eval('enemySurvivalReplayCheck()'))
  })
  for(const [label,w,h] of [['desktop',1280,800],['mobile',390,844]])
    it('shows both abilities and the spent teleport on '+label,()=>{
      cy.viewport(w,h)
      cy.window().then(win=>win.eval(`(() => {
        setupEnemySpellArena()
        const e=makeSpellTestEnemy('Skeleton',['lowHpTeleport','sacrifice'],39,40)
        let text=tileInspectInfo(e.x,e.y).html
        if(!text.includes('ready below 25% HP')||!text.includes('below 50% HP'))
          throw Error('survival spell tooltip missing')
        e.lowHpTeleportUsed=true
        text=tileInspectInfo(e.x,e.y).html
        if(!text.includes('Low-HP Teleport · used'))throw Error('spent teleport not visible')
      })()`))
    })
})
