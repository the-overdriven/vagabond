// Starts a fresh game with the given character name and waits for the race
// overlay to close. Callers add their own assertions after this.
function beginNewGame(name = 'E2E Tester') {
  cy.visit('/')

  cy.get('#raceOverlay .panelbox')
    .should('be.visible')

  cy.get('#raceName')
    .clear()
    .type(name)

  cy.get('#btnBegin').click()

  cy.get('#raceOverlay')
    .should('not.have.class', 'show')
}

// Waits until ALL queued log messages have finished typing. This is given
// its own explicit timeout (rather than raising defaultCommandTimeout
// globally) so a slow log doesn't mask real failures elsewhere in the
// suite. The app itself skips the char-by-char animation under
// window.Cypress, so in practice this resolves almost immediately.
function waitForLogIdle() {
  cy.window()
    .its('__VAGABOND_E2E__')
    .invoke({ timeout: 15000 }, 'getLogState')
    .should((logState) => {
      expect(logState.isTyping).to.equal(false)
      expect(logState.queueLength).to.equal(0)
    })
}

function pressKey(overrides) {
  cy.window().trigger('keydown', { bubbles: true, ...overrides })
}

// Space = inspect surroundings.
function pressInspect() {
  pressKey({ key: ' ', code: 'Space', which: 32, keyCode: 32 })
}

const ARROW_KEYS = {
  up: { key: 'ArrowUp', code: 'ArrowUp', which: 38, keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', which: 40, keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', which: 37, keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', which: 39, keyCode: 39 },
}

// Moves the player one tile in the given direction ('up' | 'down' | 'left' | 'right').
function pressMove(direction) {
  pressKey(ARROW_KEYS[direction])
}

// Tab = toggle the inventory overlay.
function pressToggleInventory() {
  pressKey({ key: 'Tab', code: 'Tab', which: 9, keyCode: 9 })
}

// M = toggle the map overlay.
function pressToggleMap() {
  pressKey({ key: 'm', code: 'KeyM', which: 77, keyCode: 77 })
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

describe('Vagabond smoke test', () => {
  it('starts the game and inspects the Temple with Space', () => {
    const name = 'E2E Tester'
    beginNewGame(name)

    cy.get('#logpanel .good')
      .should('have.length.at.least', 1)
      .first()
      .should('have.text', `${name} the Human. +20% XP gain rate.`)

    // Verify the player is actually at the Temple.
    cy.window()
      .its('__VAGABOND_E2E__')
      .invoke('getState')
      .should((state) => {
        expect(state.currentZ).to.equal(0)
        expect(state.player.x).to.equal(state.spawnPoint.x)
        expect(state.player.y).to.equal(state.spawnPoint.y)
        expect(state.playerTile).to.equal('temple')
      })

    // Starting HUD stats for a fresh Human character.
    cy.get('#hLvl').should('have.text', '1')
    cy.get('#hptext').should('have.text', '50 / 50')
    cy.get('#hpbar').invoke('attr', 'style').should('include', 'width: 100%')
    cy.get('#xpbar').invoke('attr', 'style').should('include', 'width: 0%')
    cy.get('#hAtk').should('have.text', '2')
    cy.get('#hDef').should('have.text', '0')
    cy.get('#hSpd').should('have.text', '3')
    cy.get('#hMf').should('have.text', '0')
    cy.get('#hGold').should('have.text', '0')
    cy.get('#hDeaths').should('have.text', '0')

    waitForLogIdle()
    pressInspect()

    // Cypress will retry while the inspection text is being typed.
    cy.get('#logpanel .info')
      .should('contain', 'You are standing on the sacred ground of the Temple.')
  })

  it('loads a save and walks onto the dwarven gate', () => {
    cy.visit('/')

    cy.get('#raceOverlay .panelbox')
      .should('be.visible')

    cy.get('#btnRaceLoad').click()

    // Path is resolved relative to the project root by selectFile, not the
    // fixtures folder (that's cy.fixture()'s behavior, not this one).
    cy.get('#fileLoad').selectFile('tests/saves/Tester_start.json', { force: true })

    cy.get('#raceOverlay')
      .should('not.have.class', 'show')

    cy.get('#logpanel .good')
      .should('have.length.at.least', 1)
      .first()
      .should('have.text', 'Game loaded.')

    waitForLogIdle()

    // Walk onto the gate tile - stepping onto a dwarvengate tile is what
    // logs this message, not inspecting it.
    pressMove('down')
    cy.get('#hDef').should('have.text', '1') // hill gives +1 DEF
    pressMove('up')

    cy.get('#logpanel .info')
      .should('contain', 'You stand beneath the open dwarven gates')
  })

  it('opens the inventory and map overlays and switches between them', () => {
    beginNewGame()
    waitForLogIdle()

    cy.get('#invOverlay').should('not.have.class', 'show')
    cy.get('#mapOverlay').should('not.have.class', 'show')

    // Tab opens the inventory.
    pressToggleInventory()
    cy.get('#invOverlay').should('have.class', 'show')
    cy.get('#mapOverlay').should('not.have.class', 'show')

    // The inventory's "View Map" button swaps over to the map overlay.
    cy.get('#btnInvToMap').click()
    cy.get('#mapOverlay').should('have.class', 'show')
    cy.get('#invOverlay').should('not.have.class', 'show')

    // The map's "Inventory" button swaps back.
    cy.get('#btnMapToInv').click()
    cy.get('#invOverlay').should('have.class', 'show')
    cy.get('#mapOverlay').should('not.have.class', 'show')

    // Close the inventory, then open the map directly with 'M'.
    cy.get('#btnInvClose').click()
    cy.get('#invOverlay').should('not.have.class', 'show')

    pressToggleMap()
    cy.get('#mapOverlay').should('have.class', 'show')
    cy.get('#invOverlay').should('not.have.class', 'show')

    // 'M' again toggles the map closed.
    pressToggleMap()
    cy.get('#mapOverlay').should('not.have.class', 'show')
  })

  it('opens and closes the Graveyard without changing the live game', () => {
    configureTestGraveyard(false)
    beginNewGame()
    cy.window().its('VAGABOND_GAME_VERSION').should('equal', 'v23')
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
    pressMove('down')
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
    cy.window().then(win => {
      const remoteRow = {
        character_name: '<img src=x onerror=alert(1)>', race: 'human', level: 1,
        killer_name: '<script>alert(1)</script>', cause_of_death: 'enemy',
        permadeath: false, death_number: 1, killed_at: '2026-09-25T12:00:00Z',
        equipment: {weapon: {name: '<svg onload=alert(1)>'}}, artifacts: []
      }
      win.supabase = {createClient: () => ({from: () => ({
        insert: record => { rows.push(record); return Promise.resolve({error: null}) },
        select: () => ({
          order() { return this },
          limit(n) { queries.push(n); return this },
          eq(mode, value) { queries.push([mode, value]); return this },
          then(resolve) { resolve({data: [remoteRow], error: null}) }
        })
      })})}
      win.eval("die({name:'Minotaur', prefix:'Champion', alive:false})")
    })
    cy.wrap(rows).should(records => {
      expect(records).to.have.length(1)
      expect(records[0]).to.include({permadeath: false, death_number: 1, max_hp: 50,
        killer_name: 'Minotaur', killer_prefix: 'Champion', game_version: 'v23'})
      expect(records[0].death_event_id).to.match(/^[0-9a-f-]{36}$/)
    })
    cy.get('#btnGraveyard').click()
    cy.get('#graveyardList').should('contain.text', '<img src=x onerror=alert(1)>')
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
