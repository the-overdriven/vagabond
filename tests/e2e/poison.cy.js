describe('Monster poison', () => {
  it('refreshes without stacking, persists, ticks, and is cured at full HP', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Poison Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(() => {
      const check = (ok, message) => {if (!ok) throw new Error(message)}
      const oldChance = chance, oldRng = rng
      enemies = []; player.hp = playerMaxHp(); player.poisonTurns = 0
      try {
        chance = () => true; rng = () => 0.5
        applyEnemyPoison({name:'Scorpion',abilities:['poison']})
        const duration = Math.max(1, Math.min(40, Math.floor(playerMaxHp()*0.20)))
        check(player.poisonTurns === duration, 'base duration')
        player.poisonTurns = 1
        applyEnemyPoison({name:'Scorpion',abilities:['poison']})
        check(player.poisonTurns === duration, 'refresh replaces duration')
      } finally {chance = oldChance; rng = oldRng}
      const hp = player.hp
      const save = JSON.parse(JSON.stringify(buildSaveObject()))
      check(save.player.poisonTurns === player.poisonTurns, 'serialized poison')
      loadGameFromObject(save)
      check(player.poisonTurns === save.player.poisonTurns, 'restored poison')
      tickPlayerPoison()
      check(player.hp === hp-1 && player.poisonTurns === save.player.poisonTurns-1, 'one damage and one tick')
      for (const kind of ['herb','potion']) {
        player.hp = playerMaxHp(); player.poisonTurns = 5
        player.inventory.push({kind,count:1})
        const idx = player.inventory.length-1
        if (kind === 'herb') useHerb(idx); else usePotion(idx)
        check(player.poisonTurns === 0, 'cure at full HP: '+kind)
      }
    })()`))
  })

  for (const width of [1440, 390]) {
    it('shows poison in the active-status strip at '+width+'px', () => {
      cy.viewport(width, 900)
      cy.visit('/')
      cy.get('#raceName').clear().type('Poison UI')
      cy.get('#btnBegin').click()
      cy.get('#raceOverlay').should('not.have.class','show')
      cy.window().then(win => win.eval('player.poisonTurns=20; updateHud()'))
      cy.get('[data-status="poison"]').should('be.visible').and('contain','Poisoned').and('contain','20t')
      cy.window().then(win => win.eval('curePlayerPoison(); updateHud()'))
      cy.get('[data-status="poison"]').should('not.exist')
    })
  }
})
