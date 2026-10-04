describe('Enemy abilities data model', () => {
  it('keeps abilities independent and preserves them through saves and replay initial state', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Abilities Tester')
    cy.get('#replayToggle').check()
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => {
      win.eval(`(() => {
        const check = (ok, message) => {if (!ok) throw new Error(message)}
        check(ENEMY_TEMPLATES.every(t => Array.isArray(t.abilities) && !('fly' in t) && !('evades' in t)), 'template schema')
        check(enemies.every(e => Array.isArray(e.abilities) && !('fly' in e) && !('evades' in e)), 'spawn schema')
        const rngBefore = rngState
        const a = addEnemy({name:'Giant Bat',baseName:'Giant Bat',hp:8,maxHp:8,x:player.x,y:player.y,level:0,alive:true})
        const b = addEnemy({name:'Giant Bat',baseName:'Giant Bat',hp:8,maxHp:8,x:player.x,y:player.y,level:0,alive:true,abilities:[]})
        check(enemyHasAbility(a,'fly') && enemyHasAbility(a,'evades'), 'template abilities copied')
        check(!enemyHasAbility(b,'fly') && !enemyHasAbility(b,'evades'), 'empty override respected')
        a.abilities.push('testOnly')
        check(!ENEMY_TEMPLATE_BY_NAME['Giant Bat'].abilities.includes('testOnly'), 'instance independence')
        check(rngBefore === rngState, 'non-shooter creation adds no RNG calls')
        const save = buildSaveObject()
        check(save.version === 26 && save.enemies.every(e => Array.isArray(e.abilities) && !('fly' in e) && !('evades' in e)), 'save schema')
        check(save.replay.initialState.enemies.every(e => Array.isArray(e.abilities)), 'replay initial schema')
        loadGameFromObject(save)
        check(enemies.find(e => e.id === a.id).abilities.includes('testOnly'), 'abilities restored exactly')
        check(enemies.find(e => e.id === b.id).abilities.length === 0, 'empty abilities restored exactly')
      })()`)
    })
  })
})
