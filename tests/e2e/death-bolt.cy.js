const spellHelpers = require('../helpers/enemy-spell-checks.js')
const boltHelpers = require('../helpers/death-bolt-checks.js')

describe('Generic Death Bolt and skull projectile', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => cy.window().then(win => {
      win.__boltFixture = save
      win.eval('loadGameFromObject(window.__boltFixture,{isReplayInit:true})')
      delete win.__boltFixture
      for (const [name,fn] of Object.entries({...spellHelpers,...boltHelpers}))
        win.eval('window.'+name+' = '+fn.toString())
    }))
  })

  it('uses one generic 10 ATK cast with dodges, armor, death shield and slow impact feedback', () => {
    cy.window().then(win => win.eval('deathBoltRulesCheck()'))
  })

  it('respects terrain, intervening creatures, invisibility, aggro, and sanctuary', () => {
    cy.window().then(win => win.eval('deathBoltBlockersCheck()'))
  })

  it('replays actual Death Bolt combat and restores a current save', () => {
    cy.window().then(win => win.eval('deathBoltReplayCheck()'))
  })

  for (const [name, width, height, tiles] of [
    ['desktop tiles', 1280, 800, true],['mobile ASCII', 390, 844, false]
  ]) it('loads and draws the skull projectile on '+name, () => {
    cy.viewport(width,height)
    cy.request('img/projectiles/death-bolt.png').its('status').should('eq',200)
    cy.window().then(win => win.eval(`(() => {
      setupEnemySpellArena()
      const caster = makeSpellTestEnemy('Skeleton',['deathBolt'],38,40)
      replayAnimationsDisabled=false;replaySimulationMode=false
      USE_TILE_IMAGES=${tiles}
      projectileAnims=[]
      const prevChance=chance
      try {
        chance=p=>p===ENEMY_SPELL_CHANCE
        if(!tryEnemySpell(caster))throw Error('Death Bolt failed to cast')
        if(!projectileAnims.length||projectileAnims[0].duration!==650)throw Error('skull flight absent')
        render()
        if(${tiles}&&!preloadedImages.has('img/projectiles/death-bolt.png'))throw Error('skull image not preloaded')
      }finally{chance=prevChance;replayAnimationsDisabled=true}
    })()`))
    cy.get('#logpanel').should('contain.text','casts a death bolt')
  })
})
