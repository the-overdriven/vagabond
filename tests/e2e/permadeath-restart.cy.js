describe('Permadeath restart', () => {
  it('starts a new character in the same world after a permadeath', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('First Wanderer')
    cy.get('#permadeathToggle').check()
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')

    let world, seed, characterId
    cy.window().then(win => {
      world = win.eval('surfaceMap')
      seed = win.eval('WORLD_SEED')
      characterId = win.eval('player.characterId')
      win.eval('die()')
    })
    cy.get('#raceOverlay', {timeout: 12000}).should('have.class', 'show')
    cy.get('script[src*="supabase"]').should('not.exist')
    cy.window().then(win => {
      expect(win.localStorage.getItem('vagabond_online_player_id')).to.equal(null)
    })
    cy.get('#cursedWorldToggle').should('be.disabled')
    cy.get('#permadeathToggle').should('not.be.checked')
    cy.get('#raceName').type('Second Wanderer')
    cy.get('#raceGrid .race-card').eq(1).click()
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')

    cy.window().then(win => {
      expect(win.eval('surfaceMap')).to.equal(world)
      expect(win.eval('WORLD_SEED')).to.equal(seed)
      expect(win.eval('player.characterId')).not.to.equal(characterId)
      expect(win.eval('player.name')).to.equal('Second Wanderer')
      expect(win.eval('player.race')).not.to.equal('human')
      expect(win.eval('player.deaths')).to.equal(0)
      expect(win.eval("groundItems.some(item => item.kind === 'deadbody' && item.name === 'First Wanderer')")).to.equal(true)
    })
    cy.window().its('__VAGABOND_E2E__').invoke('getState').should(state => {
      expect(state.currentZ).to.equal(0)
      expect(state.player).to.deep.equal(state.spawnPoint)
      expect(state.playerTile).to.equal('temple')
    })

    cy.window().then(win => {
      characterId = win.eval('player.characterId')
      win.eval('die()')
    })
    cy.window().should(win => expect(win.eval('deathTransition')).to.equal(null))
    cy.get('script[src*="supabase"]').should('not.exist')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => {
      expect(win.eval('player.characterId')).to.equal(characterId)
      expect(win.eval('surfaceMap')).to.equal(world)
    })
  })
})
