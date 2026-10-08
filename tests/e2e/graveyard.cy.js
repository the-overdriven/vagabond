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
      win.__VAGABOND_TEST_GRAVEYARD__ = true
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

  it('rounds every uploaded strongest-kill number while preserving exact gameplay ranking', () => {
    configureTestGraveyard()
    beginNewGame('Strength Tester')
    const rows = []
    cy.window().then(win => {
      win.__VAGABOND_TEST_GRAVEYARD__ = true
      win.supabase = {createClient: () => ({from: () => ({
        insert: record => { rows.push(record); return Promise.resolve({error: null}) }
      })})}
      win.eval(`player.strongestEnemyKilled = null
        recordStrongestEnemyKill({name:'First Banshee', baseName:'Banshee', tier:4,
          atk:21.2, def:2, spd:4, grace:1.35})
        recordStrongestEnemyKill({name:'Second Banshee', baseName:'Banshee', tier:4,
          atk:21.289643402164803, def:2, spd:4, grace:1.3976985338144003})`)
      const strongest = win.eval('structuredClone(player.strongestEnemyKilled)')
      expect(strongest.name).to.equal('Second Banshee')
      expect(strongest.strength).to.equal(29)
      expect(strongest.stats.atk).to.equal(21.289643402164803)
      expect(strongest.stats.grace).to.equal(1.3976985338144003)
      win.eval(`die({name:'Lich', alive:false})`)
    })
    cy.wrap(rows).should(records => {
      expect(records).to.have.length(1)
      expect(records[0].strongest_enemy_killed).to.deep.equal({
        name: 'Second Banshee', species: 'Banshee', tier: 4, strength: 29,
        stats: {atk: 21, def: 2, spd: 4, grace: 1}
      })
    })
  })

  it('normalizes a saved fractional-strength Lich trophy at a drowning death without changing saved stats', () => {
    configureTestGraveyard()
    beginNewGame('Saved Trophy Tester')
    const rows = []
    cy.window().then(win => {
      win.__VAGABOND_TEST_GRAVEYARD__ = true
      win.supabase = {createClient: () => ({from: () => ({
        insert: record => {
          // Model the pre-migration database constraint: every trophy number must be an integer.
          const trophy = record.strongest_enemy_killed
          expect([trophy.tier, trophy.strength, ...Object.values(trophy.stats)]
            .every(Number.isInteger)).to.equal(true)
          rows.push(record)
          return Promise.resolve({error: null})
        }
      })})}
      win.eval(`player.strongestEnemyKilled = {
        name: 'Lich', species: 'Lich', tier: 5, strength: 46.45342130316421,
        stats: {atk: 36.45342130316421, def: 6, spd: 3, grace: 1}
      }
      window.__trophySave = buildSaveObject()
      loadGameFromObject(window.__trophySave)`)
      const saved = win.eval('structuredClone(player.strongestEnemyKilled)')
      expect(saved.strength).to.equal(46.45342130316421)
      expect(saved.stats.atk).to.equal(36.45342130316421)
      win.eval(`die(null, 'drowning')`)
      expect(win.eval('player.strongestEnemyKilled.stats.atk')).to.equal(36.45342130316421)
    })
    cy.wrap(rows).should(records => {
      expect(records).to.have.length(1)
      expect(records[0]).to.include({cause_of_death: 'drowning', killer_name: null})
      expect(records[0].strongest_enemy_killed).to.deep.equal({
        name: 'Lich', species: 'Lich', tier: 5, strength: 46,
        stats: {atk: 36, def: 6, spd: 3, grace: 1}
      })
    })
  })

  it('keeps the death submission if a saved strongest-kill snapshot is invalid', () => {
    configureTestGraveyard()
    beginNewGame('Invalid Trophy Tester')
    const rows = []
    cy.window().then(win => {
      win.__VAGABOND_TEST_GRAVEYARD__ = true
      win.supabase = {createClient: () => ({from: () => ({
        insert: record => { rows.push(record); return Promise.resolve({error: null}) }
      })})}
      win.eval(`player.strongestEnemyKilled = {
        name: 'Lich', species: 'Lich', tier: 5, strength: 46,
        stats: {atk: NaN, def: 6, spd: 3, grace: 1}
      }; die()`)
    })
    cy.wrap(rows).should(records => {
      expect(records).to.have.length(1)
      expect(records[0].strongest_enemy_killed).to.equal(null)
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
      win.__VAGABOND_TEST_GRAVEYARD__ = true
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

  it('records drowning in deep water and places the remains on shore only after respawn', () => {
    configureTestGraveyard()
    beginNewGame('Drowning Tester')
    const rows = []
    cy.window().then(win => {
      win.__VAGABOND_TEST_GRAVEYARD__ = true
      win.supabase = {createClient: () => ({from: () => ({
        insert: record => { rows.push(record); return Promise.resolve({error: null}) },
        select: () => ({
          order() { return this },
          limit() { return this },
          then(resolve) { resolve({data: rows, error: null}) }
        })
      })})}
      win.eval(`enemies = []; npcs = []
        for (let y = 48; y <= 52; y++) for (let x = 48; x <= 52; x++) map[y][x] = 'water'
        map[49][50] = 'grass'
        player.x = 50; player.y = 50; player.hp = 1
        player.swimming = 0; player.swimTurns = 1
        player.swimPosition = {x: 50, y: 50, z: 0}
        player.inventory = [{kind: 'fish', name: 'Fish'}]
        advanceSwimming(false)`)
      expect(win.eval('player.x')).to.equal(50)
      expect(win.eval('player.y')).to.equal(50)
      expect(win.eval("groundItems.some(item => item.kind === 'playerremains' && item.x === 50 && item.y === 49)")).to.equal(false)
    })
    cy.wrap(rows).should(records => {
      expect(records).to.have.length(1)
      expect(records[0]).to.include({cause_of_death: 'drowning', killer_name: null})
      expect(records[0].last_position).to.include({x: 50, y: 50, biome: 'water'})
    })
    cy.window().should(win => {
      expect(win.eval('deathTransition')).to.equal(null)
      expect(win.eval('player.x')).to.equal(win.eval('spawnPoint.x'))
      expect(win.eval('player.y')).to.equal(win.eval('spawnPoint.y'))
      expect(win.eval("groundItems.filter(item => item.kind === 'playerremains' && item.x === 50 && item.y === 49)")).to.have.length(1)
    })
    cy.get('#logpanel').should('contain.text', 'You have drown.')
    cy.get('#btnGraveyard').click()
    cy.get('#graveyardList').should('contain.text', 'Cause: Drown')
  })

  it('keeps ordinary death remains hidden until the player returns to the Temple', () => {
    beginNewGame()
    cy.window().then(win => {
      win.eval(`player.inventory = [{kind: 'fish', name: 'Fish'}]; die()`)
      expect(win.eval("groundItems.some(item => item.kind === 'playerremains')")).to.equal(false)
    })
    cy.window().should(win => {
      expect(win.eval('deathTransition')).to.equal(null)
      expect(win.eval("groundItems.some(item => item.kind === 'playerremains')")).to.equal(true)
    })
  })

  it('skips all online death activity during replay execution', () => {
    configureTestGraveyard()
    beginNewGame()
    const rows = []
    cy.window().then(win => {
      win.__VAGABOND_TEST_GRAVEYARD__ = true
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
        win.__VAGABOND_TEST_GRAVEYARD__ = true
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
