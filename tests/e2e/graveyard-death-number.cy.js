describe('Graveyard death numbers after loading', () => {
  it('keeps a character numbered across rewinds without mixing other characters or replays', () => {
    cy.intercept('GET', '**/src/graveyard.js', request => {
      request.continue(response => {
        response.body = response.body
          .replace(/^const SUPABASE_URL = .*$/m, "const SUPABASE_URL = 'https://test.supabase.co'")
          .replace(/^const SUPABASE_PUBLISHABLE_KEY = .*$/m,
            "const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_abcdefghijklmnopqrstuvwxyz1234567890'")
      })
    })
    cy.visit('/')
    cy.get('#raceName').clear().type('Rewind Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')

    const rows = []
    cy.window().then(win => {
      win.supabase = {createClient: () => ({from: () => ({
        insert: record => { rows.push(record); return Promise.resolve({error: null}) }
      })})}
      const saved = win.eval('buildSaveObject()')
      const characterId = saved.player.characterId
      win.eval('die()')
      expect(win.eval('player.deaths')).to.equal(1)
      win.eval('loadGameFromObject')(saved)
      expect(win.eval('player.deaths')).to.equal(1)
      win.eval('die()')
      expect(win.eval('player.deaths')).to.equal(2)

      win.eval('stopDeathTransition(); resetForNewCharacter(); openRaceSelect()')
      win.document.getElementById('raceName').value = 'Rewind Tester'
      win.eval('confirmRaceSelect()')
      expect(win.eval('player.characterId')).not.to.equal(characterId)
      win.eval('die()')
      expect(win.eval('player.deaths')).to.equal(1)

      win.eval('loadGameFromObject')(saved)
      expect(win.eval('player.deaths')).to.equal(2)
      win.eval('replayPlaying = true; die(); replayPlaying = false')
      expect(win.eval('player.deaths')).to.equal(3)
      win.eval('loadGameFromObject')(saved)
      expect(win.eval('player.deaths')).to.equal(2)
    })
    cy.wrap(rows).should(records => {
      expect(records.map(record => record.death_number)).to.deep.equal([1, 2, 1])
      expect(new Set(records.map(record => record.death_event_id)).size).to.equal(3)
    })
  })
})
