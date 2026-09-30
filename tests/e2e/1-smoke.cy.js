// Starts a fresh game with the given character name and waits for the race
// overlay to close after world generation. Callers add their own assertions.
function beginNewGame(name = 'E2E Tester') {
  cy.visit('/')

  cy.get('#raceOverlay .panelbox')
    .should('be.visible')

  cy.get('#raceName')
    .clear()
    .type(name)

  cy.get('#btnBegin').click()

  // Begin now generates the world asynchronously. Give only this expensive
  // startup phase extra time, and retain the failure message in diagnostics.
  cy.get('#loadingOverlay', { timeout: 60000 }).should(($overlay) => {
    expect($overlay.text(), 'world generation status').not.to.include('failed')
    expect($overlay, 'world generation finished').not.to.be.visible
  })
  cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))

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
      .should(($overlay) => {
        expect(Cypress.$('#logpanel .bad').text(), 'save load errors').not.to.include('Failed to load save file')
        expect($overlay).not.to.have.class('show')
      })

    cy.window().its('__VAGABOND_E2E__').invoke('getWorldShape').should(shape => {
      expect(shape.width).to.equal(260)
      expect(shape.height).to.equal(180)
    })
    cy.window().then(win => {
      const dimensions = win.eval(`(() => {
        const save = buildSaveObject()
        loadGameFromObject(save)
        return {savedWidth: save.mapWidth, savedHeight: save.mapHeight, width: MAP_W, height: MAP_H}
      })()`)
      expect(dimensions).to.deep.equal({savedWidth: 260, savedHeight: 180, width: 260, height: 180})
    })

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
    cy.get('#statGrid .row').first().should('contain.text', 'Human').and('not.contain.text', '+20% XP gain rate')
    cy.window().then(win => {
      expect(win.eval('tileInspectInfo(player.x, player.y).html')).to.include('+20% XP gain rate')
    })

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
  it('applies the NPC placement, merchant stock, Herbalist gift, and HUD polish rules', () => {
    beginNewGame('NPC Polish Tester')

    cy.get('#hAtk').parent().should('have.attr', 'title').and('contain', 'Attack')
    cy.get('#hDef').parent().should('have.attr', 'title').and('contain', 'Defense')
    cy.get('#hSpd').parent().should('have.attr', 'title').and('contain', 'Speed')
    cy.get('#hMf').parent().should('have.attr', 'title').and('contain', 'Magic Find')

    cy.window().then(win => {
      const state = win.eval(`(() => {
        const key = (x, y) => x + ',' + y
        const dirs = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]]
        const dist = new Map([[key(spawnPoint.x, spawnPoint.y), 0]])
        const queue = [{x: spawnPoint.x, y: spawnPoint.y}]
        for (let head = 0; head < queue.length; head++) {
          const cur = queue[head]
          const d = dist.get(key(cur.x, cur.y))
          if (d >= 5) continue
          for (const [dx, dy] of dirs) {
            const x = cur.x + dx, y = cur.y + dy
            const k = key(x, y)
            if (dist.has(k) || !isWalkable(x, y)) continue
            const tile = surfaceMap[y][x]
            if (tile === 'river' || tile === 'water' || tile === 'forest') continue
            dist.set(k, d + 1)
            queue.push({x, y})
          }
        }
        const villageNpcNames = new Set(NPC_TEMPLATES
          .filter(t => t.name !== 'Drunk' && !t.placement)
          .map(t => t.name))
        const npcDistances = npcs
          .filter(n => villageNpcNames.has(n.name))
          .map(n => ({name:n.name, tile:surfaceMap[n.y][n.x], distance:dist.get(key(n.x,n.y)) ?? null}))
        const stock = Object.fromEntries(merchantStock
          .filter(i => ['homecomingscroll','idscroll','scrollOfInvisibility'].includes(i.kind))
          .map(i => [i.kind, i.count]))
        const sword = merchantStock.find(i => i.kind === 'weapon' && i.base === 'Two-handed Sword')
        return {npcDistances, stock, swordPrice:sword?.merchantPrice}
      })()`)
      for (const npc of state.npcDistances) {
        expect(npc.tile, npc.name + ' terrain').not.to.be.oneOf(['river', 'water'])
        expect(npc.distance, npc.name + ' walk distance').to.be.at.most(5)
      }
      expect(state.stock.homecomingscroll).to.equal(9)
      expect(state.stock.idscroll).to.equal(6)
      expect(state.stock.scrollOfInvisibility).to.equal(3)
      expect(state.swordPrice).to.equal(600)
    })

    cy.window().then(win => {
      const gift = win.eval(`(() => {
        const herbalist = npcs.find(n => n.name === 'Herbalist')
        player.x = herbalist.x - 1
        player.y = herbalist.y
        const before = player.inventory.filter(i => i.kind === 'herb').reduce((n, i) => n + (i.count || 1), 0)
        tryOpenTrade(herbalist)
        toggleTrade(false)
        const afterFirst = player.inventory.filter(i => i.kind === 'herb').reduce((n, i) => n + (i.count || 1), 0)
        tryOpenTrade(herbalist)
        toggleTrade(false)
        const afterSecond = player.inventory.filter(i => i.kind === 'herb').reduce((n, i) => n + (i.count || 1), 0)
        const saved = buildSaveObject()
        return {before, afterFirst, afterSecond, savedFlag:saved.herbalistGiftGiven}
      })()`)
      expect(gift.afterFirst).to.equal(gift.before + 1)
      expect(gift.afterSecond).to.equal(gift.afterFirst)
      expect(gift.savedFlag).to.equal(true)
    })
  })

})


describe('Non-gear item catalog', () => {
  it('preserves chest boundaries and forage chances on percentage scales', () => {
    beginNewGame('Percentage Loot Tester')
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const previous = {inventory: player.inventory, groundItems, rng, enemyTurn, npcTurn,
          tile: map[player.y][player.x], foragedTiles,
          multipliers: WORLD_GEN_CONFIG.environment.forageResultMultipliers}
        const chest = []
        const forage = []
        const cases = [[85-1e-7,'potion'],[85,'scrollOfInvisibility'],[90-1e-7,'scrollOfInvisibility'],
          [90,'speedpotion'],[100-1e-7,'speedpotion'],[100,'idscroll'],[110-1e-7,'idscroll']]
        try {
          for (const [oldRoll, expected] of cases) {
            player.inventory = []
            rng = () => oldRoll / 110
            groundItems = [{kind: 'chest', x: player.x, y: player.y, level: currentZ, tier: 1}]
            checkGroundAt(player.x, player.y)
            chest.push(player.inventory[0]?.kind === expected)
          }
          enemyTurn = () => {}; npcTurn = () => {}
          map[player.y][player.x] = 'forest'
          groundItems = []
          const variants = [
            {berries:1,herb:1,mushroom:1},
            {berries:1,herb:2,mushroom:1.5},
            {berries:0.5,herb:0.6,mushroom:0.4}
          ]
          for (const weights of variants) {
            WORLD_GEN_CONFIG.environment.forageResultMultipliers = weights
            for (const oldRoll of [0,0.089999,0.09,0.169999,0.17,0.249999,0.25,0.999999]) {
              player.inventory = []; foragedTiles = new Set()
              let previousThreshold = 0, cumulative = 0, expected = 'nothing'
              for (const entry of [{upTo:0.09,result:'berries'},{upTo:0.17,result:'herb'},{upTo:0.25,result:'mushroom'}]) {
                cumulative += (entry.upTo-previousThreshold)*weights[entry.result]
                previousThreshold=entry.upTo
                if (oldRoll<cumulative) {expected=entry.result;break}
              }
              let draws = 0
              rng = () => {draws++;return oldRoll}
              tryForage()
              forage.push((player.inventory[0]?.kind || 'nothing') === expected && draws === 1)
            }
          }
          return {chest,forage,chestScale:CHEST_LOOT_TABLE.scale,forageScale:FORAGE_TABLE.scale,
            scrollResult:CHEST_LOOT_TABLE.table.find(e=>e.result==='scrollOfInvisibility')?.result}
        } finally {
          player.inventory=previous.inventory;groundItems=previous.groundItems;rng=previous.rng
          enemyTurn=previous.enemyTurn;npcTurn=previous.npcTurn
          map[player.y][player.x]=previous.tile;foragedTiles=previous.foragedTiles
          WORLD_GEN_CONFIG.environment.forageResultMultipliers=previous.multipliers
        }
      })()`)
      expect(result.chestScale).to.equal(100)
      expect(result.forageScale).to.equal(100)
      expect(result.scrollResult).to.equal('scrollOfInvisibility')
      expect(result.chest.every(Boolean), 'old chest boundaries preserved').to.equal(true)
      expect(result.forage.every(Boolean), 'normal and trait-adjusted forage preserved').to.equal(true)
    })
  })

  it('keeps ground pickups and all consumable chest outcomes on the catalog path', () => {
    beginNewGame('Catalog Loot Tester')
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const previous = {inventory: player.inventory, groundItems, rng}
        let draws = 0
        try {
          player.inventory = []
          const chestKinds = []
          for (const roll of [73, 79, 86, 95]) {
            rng = () => { draws++; return roll / 100 }
            groundItems = [{kind: 'chest', x: player.x, y: player.y, level: currentZ, tier: 1}]
            checkGroundAt(player.x, player.y)
            chestKinds.push(player.inventory.at(-1).kind)
          }
          player.inventory = []
          groundItems = ['potion', 'scrollOfInvisibility', 'speedpotion'].map(kind =>
            ({kind, x: player.x, y: player.y, level: currentZ}))
          checkGroundAt(player.x, player.y)
          return {chestKinds, draws, groundKinds: player.inventory.map(it => it.kind).sort(),
            names: player.inventory.map(it => it.name).sort(), remainingGround: groundItems.length}
        } finally {
          player.inventory = previous.inventory; groundItems = previous.groundItems; rng = previous.rng
        }
      })()`)
      expect(result).to.deep.equal({chestKinds: ['potion', 'scrollOfInvisibility', 'speedpotion', 'idscroll'], draws: 4,
        groundKinds: ['potion', 'scrollOfInvisibility', 'speedpotion'],
        names: ['Life Potion', 'Potion of Speed', 'Scroll of Invisibility'], remainingGround: 0})
    })
  })

  it('creates stacks and distinct inscriptions and keeps Homecoming at 100g', () => {
    beginNewGame('Catalog Tester')
    cy.window().then(win => {
      const result = win.eval(`(() => {
        player.inventory = []
        addHerb(); addHerb(); addFishermanFish(); addPotato()
        addInventoryItem('tombstone', {inscription: 'First'})
        addInventoryItem('tombstone', {inscription: 'Second'})
        const herbs = player.inventory.find(it => it.kind === 'herb')
        const home = merchantStock.find(it => it.kind === 'homecomingscroll')
        const before = player.gold
        player.gold = 100
        buyItem(home)
        const bought = player.inventory.find(it => it.kind === 'homecomingscroll')
        const result = {herbs: herbs.count, fishName: player.inventory.find(it => it.kind === 'fish').name,
          inscriptions: player.inventory.filter(it => it.kind === 'tombstone').map(it => it.inscription),
          homePrice: home.merchantPrice, homeSell: itemSellValue(bought), gold: player.gold,
          homeCount: home.count, potatoValue: itemSellValue(player.inventory.find(it => it.kind === 'potato')),
          amberValue: itemSellValue(createItem('amber')), shellValue: itemSellValue(createItem('seashell'))}
        player.gold = before
        return result
      })()`)
      expect(result).to.deep.equal({herbs: 2, fishName: 'Fresh Fish', inscriptions: ['First', 'Second'],
        homePrice: 100, homeSell: 50, gold: 0, homeCount: 8, potatoValue: 0, amberValue: 20, shellValue: 10})
    })
  })

  for (const width of [1440, 390]) {
    it(`keeps supply and quest buttons working at ${width}px`, () => {
      // This test covers inventory controls after character creation. Use a
      // desktop viewport for setup, then apply the width under test.
      cy.viewport(1440, 900)
      beginNewGame('Catalog UI Tester')
      cy.viewport(width, 900)
      cy.window().then(win => win.eval(`
        player.inventory = []
        addHerb(); addPotato(); addIdScroll(); addInventoryItem('amber')
        addInventoryItem('blackkey'); addInventoryItem('treasurecasket'); addInventoryItem('shovel')
        player.hp = playerMaxHp() - 50
        invTab = 'all'; toggleInv(true)
      `))
      cy.get('#invList .invitem').contains('Potato').parent().find('button').should('not.exist')
      cy.get('#invList .invitem').contains('Scroll of Identification').parent().find('button').should('not.exist')
      cy.get('#invList .invitem').contains('Amber').parent().find('button').should('not.exist')
      cy.get('#invList .invitem').contains('Shovel').parent().find('button').should('have.text', 'Dig')
      cy.get('#invList .invitem').contains('Old Rotten Casket').parent().find('button').should('have.text', 'Open')
      let turn
      cy.window().then(win => { turn = win.eval('turnCount') })
      cy.get('#invList .invitem').contains('Black Key').parent().contains('button', 'Equip').click()
      cy.get('#invList .invitem').contains('Black Key').parent().contains('button', 'Unequip').should('be.visible')
      cy.window().then(win => {
        expect(win.eval("player.inventory.some(it => it.kind === 'blackkey')")).to.equal(true)
        expect(win.eval('turnCount')).to.equal(turn)
      })
      cy.get('#invList .invitem').contains('Healing Herb').parent().contains('button', 'Eat').click()
      cy.window().then(win => {
        expect(win.eval("player.inventory.some(it => it.kind === 'herb')")).to.equal(false)
        expect(win.eval('turnCount')).to.equal(turn + 1)
      })
      cy.get('#invList .invitem').contains('Old Rotten Casket').parent().contains('button', 'Open').click()
      cy.window().then(win => {
        expect(win.eval("player.inventory.some(it => it.kind === 'treasurecasket')")).to.equal(false)
        expect(win.eval("player.inventory.filter(it => it.kind === 'blackkey').length")).to.equal(2)
      })
    })
  }
})

  it('brews only affordable whole potions across herb stacks without turns or RNG', () => {
    beginNewGame('Brewing Tester')
    cy.window().then(win => {
      const results = win.eval(`(() => {
        const cases = [
          {stacks:[7], gold:30, all:true, potions:2, herbs:1, leftGold:10},
          {stacks:[8], gold:10, all:true, potions:1, herbs:5, leftGold:0},
          {stacks:[2], gold:100, all:true, potions:0, herbs:2, leftGold:100},
          {stacks:[3], gold:9, all:true, potions:0, herbs:3, leftGold:9},
          {stacks:[2,4,1], gold:20, all:true, potions:2, herbs:1, leftGold:0},
          {stacks:[6], gold:20, all:false, potions:1, herbs:3, leftGold:10}
        ]
        const count = kind => player.inventory.filter(i => i.kind === kind).reduce((s,i) => s+(i.count || 1),0)
        return cases.map(c => {
          player.inventory = c.stacks.map(count => createItem('herb', {count}))
          player.gold = c.gold
          const turns = turnCount, state = rngState
          makeHerbalistPotion(c.all)
          return count('potion') === c.potions && count('herb') === c.herbs &&
            player.gold === c.leftGold && turns === turnCount && state === rngState
        })
      })()`)
      expect(results).to.deep.equal([true,true,true,true,true,true])
    })
  })
})
