function beginNewGame(name = 'E2E Tester') {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type(name)
  cy.get('#btnBegin').click()
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

function configureTestGraveyard(enabled = true) {
  cy.intercept('GET', '**/src/graveyard.js', request => {
    request.continue(response => {
      response.body = response.body
        .replace(/^const SUPABASE_URL = .*$/m,
          enabled ? "const SUPABASE_URL = 'https://test.supabase.co'" : "const SUPABASE_URL = ''")
        .replace(/^const SUPABASE_PUBLISHABLE_KEY = .*$/m,
          enabled
            ? "const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_abcdefghijklmnopqrstuvwxyz1234567890'"
            : "const SUPABASE_PUBLISHABLE_KEY = ''")
    })
  })
}

describe('Graveyard', () => {
  it('opens and closes the Graveyard without changing the live game', () => {
    configureTestGraveyard(false)
    beginNewGame()
    cy.window().its('VAGABOND_GAME_VERSION').should('match', /^v\d+$/)
    cy.get('#btnGraveyard').click()
    cy.get('#graveyardOverlay').should('have.class', 'show')
    cy.get('#graveyardStatus').should('have.text', 'Online Graveyard unavailable.')
    cy.get('#graveyardOverlay .panelbox').should('have.css', 'overflow', 'hidden')
    cy.get('#graveyardList').should('have.css', 'overflow-y', 'auto')
    cy.get('#graveyardList').then($list => {
      for (let i = 0; i < 80; i++) {
        const row = $list[0].ownerDocument.createElement('div')
        row.textContent = `Test record ${i}`
        $list[0].appendChild(row)
      }
    })
    cy.get('.graveyard-header').then($header => {
      const top = $header[0].getBoundingClientRect().top
      cy.get('#graveyardList').scrollTo('bottom').should($list => {
        expect($list[0].scrollTop).to.be.greaterThan(0)
        expect($header[0].getBoundingClientRect().top).to.equal(top)
      })
    })
    cy.window().trigger('keydown', {bubbles: true, key: 'ArrowDown', code: 'ArrowDown', which: 40, keyCode: 40})
    cy.window().its('__VAGABOND_E2E__').invoke('getState').should(state => {
      expect(state.player.x).to.equal(state.spawnPoint.x)
      expect(state.player.y).to.equal(state.spawnPoint.y)
    })
    cy.get('#btnGraveyardClose').click()
    cy.get('#graveyardOverlay').should('not.have.class', 'show')
  })

  it('does not load the online SDK or query while offline', () => {
    configureTestGraveyard(false)
    beginNewGame()
    cy.window().then(win => {
      Object.defineProperty(win.navigator, 'onLine', {configurable: true, value: false})
    })
    cy.get('#btnGraveyard').click()
    cy.get('#graveyardStatus').should('have.text', 'Online Graveyard unavailable while offline.')
    cy.get('script[src*="supabase"]').should('not.exist')
    cy.get('#btnGraveyardClose').click()
  })

  it('submits the pre-penalty live death snapshot once and safely renders remote text', () => {
    configureTestGraveyard()
    beginNewGame('E2E Tester')
    const rows = []
    const queries = []
    let expectedVersion
    cy.window().then(win => {
      expectedVersion = win.VAGABOND_GAME_VERSION
      expect(expectedVersion).to.match(/^v\d+$/)
      const remoteRow = {
        character_name: '<img src=x onerror=alert(1)>', race: 'human', level: 1,
        killer_name: '<script>alert(1)</script>', cause_of_death: 'enemy',
        permadeath: false, death_number: 1, killed_at: '2026-09-25T12:00:00Z',
        equipment: {armor: {name: '<svg onload=alert(1)>', stat_line: 'DEF 2'}}, artifacts: []
      }
      win.supabase = {createClient: () => ({from: () => ({
        insert: record => { rows.push(record); return Promise.resolve({error: null}) },
        select: () => ({
          order() { return this },
          limit(n) { queries.push(n); return this },
          eq(mode, value) { queries.push([mode, value]); return this },
          then(resolve) {
            resolve({data: [{...remoteRow, equipment: {
              ...remoteRow.equipment, weapon: rows[0].equipment.weapon,
              shield: rows[0].equipment.shield
            }}], error: null})
          }
        })
      })})}
      win.eval(`player.equip.weapon = {kind:'weapon', name:'Meat Cleaver', base:'Meat Cleaver', atk:1, grace:1, tier:1}
        player.equip.armor = {kind:'armor', name:'Sturdy Mail', base:'Mail', def:3, mod:'def', modAmt:2}
        player.equip.shield = {kind:'shield', name:'Buckler', base:'Buckler', def:1, mod:'spd', modAmt:2}
        die({name:'Minotaur', prefix:'Champion', alive:false})`)
    })
    cy.wrap(rows).should(records => {
      expect(records).to.have.length(1)
      expect(records[0]).to.include({permadeath: false, death_number: 1, max_hp: 50,
        killer_name: 'Minotaur', killer_prefix: 'Champion', game_version: expectedVersion})
      expect(records[0].death_event_id).to.match(/^[0-9a-f-]{36}$/)
      expect(records[0].equipment.weapon).to.include({atk: 1, grace: 1, stat_line: 'ATK 1, GRACE 1'})
      expect(records[0].equipment.armor).to.include({def: 3, modAmt: 2, stat_line: 'DEF 3+2'})
      expect(records[0].equipment.shield).to.include({def: 1, modAmt: 2, stat_line: 'DEF 1, SPD +2'})
    })
    cy.get('#btnGraveyard').click()
    cy.get('#graveyardList').should('contain.text', '<img src=x onerror=alert(1)>')
    cy.get('#graveyardList .graveyard-record').first().click()
    cy.get('#graveyardList').should('contain.text', 'Weapon: Meat Cleaver (ATK 1, GRACE 1)')
    cy.get('#graveyardList').should('contain.text', 'Shield: Buckler (DEF 1, SPD +2)')
    cy.get('#graveyardList').should('contain.text', 'Armor: <svg onload=alert(1)> (DEF 2)')
    cy.get('#graveyardList img, #graveyardList script, #graveyardList svg').should('not.exist')
    cy.get('#graveyardFilters [data-mode="true"]').click()
    cy.wrap(queries).should(q => {
      expect(q).to.include(50)
      expect(q).to.deep.include(['permadeath', true])
    })
  })

  it('submits the final permadeath once before the character is replaced', () => {
    configureTestGraveyard()
    cy.visit('/')
    cy.get('#raceName').clear().type('Final Tester')
    cy.get('#permadeathToggle').check()
    cy.get('#btnBegin').click()
    const rows = []
    cy.window().then(win => {
      win.supabase = {createClient: () => ({from: () => ({
        insert: record => { rows.push(record); return Promise.resolve({error: null}) }
      })})}
      win.eval('die()')
    })
    cy.wrap(rows).should(records => {
      expect(records).to.have.length(1)
      expect(records[0]).to.include({character_name: 'Final Tester', permadeath: true, death_number: 1})
    })
    cy.get('#raceOverlay', {timeout: 12000}).should('have.class', 'show')
    cy.wrap(rows).should('have.length', 1)
  })

  it('skips all online death activity during replay execution', () => {
    configureTestGraveyard()
    beginNewGame()
    const rows = []
    cy.window().then(win => {
      win.supabase = {createClient: () => ({from: () => ({
        insert: record => { rows.push(record); return Promise.resolve({error: null}) }
      })})}
      win.eval('replayPlaying = true; die(); replayPlaying = false')
    })
    cy.wrap(rows).should('have.length', 0)
    cy.get('script[src*="supabase"]').should('not.exist')
  })

  for (const {cause, trigger} of [
    {cause: 'poisonous_mushroom', trigger:
      "player.hp = 1; player.inventory.push({kind:'mushroom', name:'Mushroom'}); chance = () => false; useMushroom(player.inventory.length - 1)"},
    {cause: 'freezing', trigger:
      "player.hp = 1; map[player.y][player.x] = 'snow'; player.freezing = {active:true, turns:4}; tickFreezing()"}
  ]) {
    it(`records ${cause} rather than a generic environmental cause`, () => {
      configureTestGraveyard()
      beginNewGame()
      const rows = []
      cy.window().then(win => {
        expect(win.eval('SUPABASE_URL')).to.equal('https://test.supabase.co')
        win.supabase = {createClient: () => ({from: () => ({
          insert: record => { rows.push(record); return Promise.resolve({error: null}) }
        })})}
        win.eval(trigger)
      })
      cy.wrap(rows).should(records => {
        expect(records).to.have.length(1)
        expect(records[0]).to.include({cause_of_death: cause, killer_name: null, permadeath: false})
      })
    })
  }
})
