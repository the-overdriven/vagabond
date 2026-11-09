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

describe('Non-gear item catalog', () => {
  it('rolls arrows, rare bows and chitin in normal chests without altering other reward odds', () => {
    beginNewGame('Chest Finds Tester')
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const previous={rng,inventory:player.inventory,groundItems,autoEquip:maybeAutoEquipWeapon}
      const rates={},table=CHEST_LOOT_TABLE.table
      let lower=0
      for(const entry of table){rates[entry.result]=entry.upTo-lower;lower=entry.upTo}
      try {
        check(rates.gold===30.5&&rates.scrollOfFireball===1.5&&
          rates.arrows===8&&rates.shortBow===.5&&rates.chitin===.5,
          'Fireball takes 1.5 percentage points from chest gold only')
        check(rates.gear===22.6&&rates.potion>13.69&&rates.potion<13.71,
          'existing gear and healing chances are unchanged')
        maybeAutoEquipWeapon=()=>false
        player.inventory=[]
        for(const [roll,kind] of [[32,'arrows'],[40,'shortBow'],[40.5,'chitin']]){
          rng=()=>roll/100
          groundItems=[{kind:'chest',x:player.x,y:player.y,level:currentZ,tier:1}]
          checkGroundAt(player.x,player.y)
          check(player.inventory.some(item=>item.kind=== (kind==='shortBow'?'weapon':kind)),
            'chest produces '+kind)
          check(!groundItems.length,'chest consumed exactly once')
        }
        const arrows=player.inventory.find(item=>item.kind==='arrows')
        const chitin=player.inventory.find(item=>item.kind==='chitin')
        const bow=player.inventory.find(item=>item.base==='Short Bow')
        check(arrows.count>=10&&arrows.count<=50,'arrow roll stays inside 10-50')
        check(chitin.count>=1&&chitin.count<=5,'chitin roll stays inside 1-5')
        check(bow?.tier===1&&bow?.rangedAtk===5,'normal chest bow is not an artifact')
      } finally {
        rng=previous.rng;player.inventory=previous.inventory;groundItems=previous.groundItems
        maybeAutoEquipWeapon=previous.autoEquip
      }
    })()`))
  })
  it('respects configured chest boundaries and forage chances on percentage scales', () => {
    beginNewGame('Percentage Loot Tester')
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const previous = {inventory: player.inventory, groundItems, rng, enemyTurn, npcTurn,
          autoEquip: maybeAutoEquipWeapon,
          tile: map[player.y][player.x], foragedTiles,
          multipliers: WORLD_GEN_CONFIG.environment.forageResultMultipliers, fxAnims, replayAnimationsDisabled}
        const chest = []
        const forage = []
        const cases = []
        const consumables = CHEST_LOOT_TABLE.table.filter(entry =>
          itemDefinition(entry.result)?.category === 'supplies')
        for (const entry of consumables) {
          const index = CHEST_LOOT_TABLE.table.indexOf(entry)
          const next = CHEST_LOOT_TABLE.table[index + 1]?.result || CHEST_LOOT_TABLE.elseResult
          cases.push([entry.upTo - 1e-7, entry.result], [entry.upTo, next], [entry.upTo + 1e-7, next])
        }
        cases.push([100 - 1e-7, CHEST_LOOT_TABLE.elseResult])
        try {
          // The boundary test inspects chest rewards in the inventory. A Short Bow
          // otherwise auto-equips, leaving that inventory slot empty.
          maybeAutoEquipWeapon = () => false
          for (const [roll, expected] of cases) {
            player.inventory = []
            rng = () => roll / CHEST_LOOT_TABLE.scale
            groundItems = [{kind: 'chest', x: player.x, y: player.y, level: currentZ, tier: 1}]
            checkGroundAt(player.x, player.y)
            const item = player.inventory[0]
            chest.push({roll, expected, actual:item?.base === 'Short Bow' ? 'shortBow' : item?.kind})
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
              player.inventory = []; foragedTiles = new Set(); fxAnims = []; replayAnimationsDisabled = false
              let previousThreshold = 0, cumulative = 0, expected = 'nothing'
              for (const entry of [{upTo:0.09,result:'berries'},{upTo:0.17,result:'herb'},{upTo:0.25,result:'mushroom'}]) {
                cumulative += (entry.upTo-previousThreshold)*weights[entry.result]
                previousThreshold=entry.upTo
                if (oldRoll<cumulative) {expected=entry.result;break}
              }
              let draws = 0
              rng = () => {draws++;return oldRoll}
              tryForage()
              forage.push((player.inventory[0]?.kind || 'nothing') === expected && draws === 1 &&
                fxAnims.filter(effect => effect.ch === 'found!').length === (expected === 'nothing' ? 0 : 1))
            }
          }
          return {chest,forage,chestScale:CHEST_LOOT_TABLE.scale,forageScale:FORAGE_TABLE.scale,
            scrollResult:CHEST_LOOT_TABLE.table.find(e=>e.result==='scrollOfInvisibility')?.result}
        } finally {
          player.inventory=previous.inventory;groundItems=previous.groundItems;rng=previous.rng
          maybeAutoEquipWeapon=previous.autoEquip
          enemyTurn=previous.enemyTurn;npcTurn=previous.npcTurn
          map[player.y][player.x]=previous.tile;foragedTiles=previous.foragedTiles
          WORLD_GEN_CONFIG.environment.forageResultMultipliers=previous.multipliers
          fxAnims=previous.fxAnims; replayAnimationsDisabled=previous.replayAnimationsDisabled
        }
      })()`)
      expect(result.chestScale).to.equal(100)
      expect(result.forageScale).to.equal(100)
      expect(result.scrollResult).to.equal('scrollOfInvisibility')
      // Arrows and Fireball each add their own three boundary cases.
      expect(result.chest, 'configured chest boundaries').to.have.length(31)
      for (const {roll, expected, actual} of result.chest) {
        expect(actual, 'chest roll ' + roll).to.equal(expected)
      }
      expect(result.forage.every(Boolean), 'normal and trait-adjusted forage results and found feedback preserved').to.equal(true)
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
          for (const roll of [73, 79, 83, 96]) {
            rng = () => { draws++; return roll / 100 }
            groundItems = [{kind: 'chest', x: player.x, y: player.y, level: currentZ, tier: 1}]
            checkGroundAt(player.x, player.y)
            chestKinds.push(player.inventory.at(-1).kind)
          }
          player.inventory = []
          groundItems = ['potion', 'scrollOfInvisibility', 'speedpotion', 'idscroll',
            'homecomingscroll'].map(kind =>
            ({kind, x: player.x, y: player.y, level: currentZ}))
          checkGroundAt(player.x, player.y)
          return {chestKinds, draws, groundKinds: player.inventory.map(it => it.kind).sort(),
            names: player.inventory.map(it => it.name).sort(), remainingGround: groundItems.length}
        } finally {
          player.inventory = previous.inventory; groundItems = previous.groundItems; rng = previous.rng
        }
      })()`)
      expect(result).to.deep.equal({chestKinds: ['potion', 'scrollOfInvisibility', 'speedpotion', 'idscroll'], draws: 4,
        groundKinds: ['homecomingscroll', 'idscroll', 'potion', 'scrollOfInvisibility', 'speedpotion'],
        names: ['Life Potion', 'Potion of Speed', 'Scroll of Homecoming',
          'Scroll of Identification', 'Scroll of Invisibility'], remainingGround: 0})
    })
  })

  it('creates stacks and distinct inscriptions and sells Homecoming for 70g', () => {
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
        homePrice: 70, homeSell: 50, gold: 30, homeCount: 8, potatoValue: 0, amberValue: 20, shellValue: 10})
    })
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw Error(msg) }
      const oldRecord = recordReplayAction
      const oldInventory = player.inventory, oldGold = player.gold
      const savedStock = merchantStock.map(it => ({...it}))
      const recorded = []
      try {
        recordReplayAction = action => recorded.push(action)
        player.inventory = []
        addInventoryItem('arrows', {count:26})
        check(itemDefinition('arrows').category === 'supplies' && isConsumableKind('arrows'),
          'arrows appear in Supplies rather than Other')
        player.gold = 0
        toggleTrade(true)
        const button = [...document.querySelectorAll('#tradeSellList .invitem')]
          .find(row => row.querySelector('.nm')?.textContent.includes('Arrows'))?.querySelector('button')
        check(!!button, 'arrows sell button is available')
        button.dispatchEvent(new MouseEvent('click', {bubbles:true, ctrlKey:true}))
        check(!player.inventory.some(it => it.kind === 'arrows') && player.gold === 26,
          'Ctrl+Sell sells the full arrow stack for the per-unit value')
        const action = recorded.at(-1)
        check(action.type === 'sell' && action.all === true,
          'bulk sale is identified in the replay action')
        player.inventory = [createItem('arrows', {count:26})]
        player.gold = 0
        await runReplayAction(action)
        check(!player.inventory.length && player.gold === 26,
          'replaying Ctrl+Sell sells the same quantity')
        player.inventory = [createItem('arrows', {count:3})]
        player.gold = 0
        sellItem(0)
        check(player.inventory[0]?.count === 2 && player.gold === 1,
          'ordinary Sell continues to sell one unit')
      } finally {
        recordReplayAction = oldRecord
        player.inventory = oldInventory
        player.gold = oldGold
        merchantStock = savedStock
        toggleTrade(false)
      }
    })()`))
  })

  for (const width of [1440, 390]) {
    it(`keeps supply and quest buttons working at ${width}px`, () => {
      // Character creation is setup; the width under test applies to inventory.
      cy.viewport(1440, 900)
      beginNewGame('Catalog UI Tester')
      cy.viewport(width, 900)
      cy.window().then(win => win.eval(`
        player.inventory = []
        addHerb(); addPotato(); addIdScroll(); addInventoryItem('amber')
        addInventoryItem('blackkey'); addInventoryItem('treasurecasket'); addInventoryItem('shovel')
        addInventoryItem('wheelbarrow'); addInventoryItem('bigbell')
        player.hp = playerMaxHp() - 50
        invTab = 'all'; toggleInv(true)
      `))
      cy.get('#invList .invitem').contains('Potato').parent().find('button').should('have.text', 'Drop')
      cy.get('#invList .invitem').contains('Scroll of Identification').parent().find('button').should('have.text', 'Drop')
      cy.get('#invList .invitem').contains('Amber').parent().find('button').should('have.text', 'Drop')
      cy.get('#invList .invitem').contains('Amber').parent().should($row => {
        const drop=$row[0].querySelector('.inventory-drop-btn')
        const name=$row[0].querySelector('.nm')
        expect(name.getBoundingClientRect().right, 'Drop stays after the item name')
          .to.be.at.most(drop.getBoundingClientRect().left)
      })
      cy.get('#invList').should($list => {
        const rows = [...$list[0].querySelectorAll('.invitem')]
        for (const row of rows) {
          const buttons = [...row.querySelectorAll('.inventory-actions button')]
          if (!buttons.length) continue
          const right = Math.max(...buttons.map(button => button.getBoundingClientRect().right))
          const style = getComputedStyle(row)
          const expected = row.getBoundingClientRect().right - parseFloat(style.paddingRight)
          expect(Math.abs(right - expected), 'action group reaches the right edge').to.be.lessThan(1)
        }
        for (const row of rows) {
          const buttons = [...row.querySelectorAll('.inventory-actions button')]
            .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
          for (let i = 1; i < buttons.length; i++) {
            expect(buttons[i].getBoundingClientRect().left - buttons[i - 1].getBoundingClientRect().right,
              'adjacent inventory actions have a gap').to.be.at.least(5)
          }
        }
      })
      cy.get('#invList .invitem').contains('Shovel').parent().contains('button', 'Dig').should('exist')
      cy.get('#invList .invitem').contains('Old Rotten Casket').parent().contains('button', 'Open').should('exist')
      cy.get('#invList .invitem').contains('Wheelbarrow').parent().contains('button', 'Drop').should('not.exist')
      cy.get('#invList .invitem').contains('Brass Bell').parent().contains('button', 'Drop').should('not.exist')
      cy.get('#invOverlay .panelbox').should($panel => {
        expect($panel[0].clientWidth, 'dialog width independent of canvas').to.be.greaterThan(300)
      })
      cy.get('#invList').should($list => {
        expect($list[0].scrollWidth, 'inventory needs no horizontal scrolling').to.be.at.most($list[0].clientWidth)
      })
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

  it('drops and retrieves stacked and unique items with stable save and replay state', () => {
    beginNewGame('Drop Item Tester')
    cy.window().then(win => win.eval(`(async()=>{
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayRecording=false;replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=true
      enemies=[];npcs=[];occupied=new Set();groundItems=[]
      currentZ=0;currentCave=-1;map=surfaceMap
      map[player.y][player.x]='grass'
      player.inventory=[createItem('amber',{count:3})]
      player.equip.blackkey=null
      startReplayRecording()
      const startTurn=turnCount
      dropInventoryItem(0);dropInventoryItem(0)
      check(player.inventory[0].count===1&&groundItems.length===1&&
        groundItems[0].kind==='droppeditem'&&groundItems[0].item.count===2,
        'two amber units merge into one recoverable floor stack')
      const groundSave=JSON.parse(JSON.stringify(buildSaveObject()))
      check(groundSave.groundItems[0].item.count===2,'save includes the floor stack')
      lootSkeletonOrForage()
      check(player.inventory[0].count===3&&groundItems.length===0&&turnCount===startTurn+3,
        'foraging recovers the whole stack and consumes one turn')
      const recorded=JSON.parse(JSON.stringify(replayData))
      check(recorded.actions.map(a=>a.action||a.type).join(',')==='dropItem,dropItem,forage',
        'drop and pickup record their deterministic item actions')
      loadGameFromObject(groundSave,{isReplayInit:true})
      check(groundItems.length===1&&groundItems[0].item.count===2,
        'loading restores the dropped stack on the same tile')
      lootSkeletonOrForage()
      check(player.inventory[0].count===3&&groundItems.length===0,
        'foraging still works after loading the save')
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayRecording=false;replayPlaying=true;replaySimulationMode=true
      activeReplay=recorded;replayRngIndex=0
      try {
        for(const action of recorded.actions)await runReplayAction(action)
        check(player.inventory[0].count===3&&groundItems.length===0,
          'replay reproduces the drop-and-pickup result')
        check(replayRngIndex===recorded.rng.length,'dropping consumes no replay RNG')
      }finally{replayPlaying=false;replaySimulationMode=false;activeReplay=null}

      const artifact={kind:'artifact',name:'Unknown heirloom',noun:'Dagger',artifactSlot:'weapon',
        tier:3,identified:false,atk:6,curse:{everyTurns:8,types:['hp']},curseTimer:3}
      player.inventory=[artifact];groundItems=[]
      dropInventoryItem(0)
      check(groundItems[0].item.curseTimer===3 && !groundItems[0].item.identified &&
        groundItems[0].item.atk===6,'unidentified artifact properties survive dropping')
      const artSaved=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(artSaved,{isReplayInit:true})
      lootSkeletonOrForage()
      check(player.inventory[0].kind==='artifact' && player.inventory[0].curseTimer===3 &&
        !player.inventory[0].identified,'unique artifact is restored intact')
      player.inventory=[createItem('blackkey')];groundItems=[]
      player.equip.blackkey=player.inventory[0]
      dropInventoryItem(0)
      check(player.equip.blackkey===null && groundItems[0].item.kind==='blackkey',
        'dropping the worn Black Key automatically unequips it')
      lootSkeletonOrForage()
      check(player.inventory[0].kind==='blackkey' && !player.equip.blackkey,
        'recovered Black Key remains available but unequipped')

      player.inventory=[createItem('blackkey'),createItem('blackkey')];groundItems=[]
      player.equip.blackkey=player.inventory[0]
      const keySave=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(keySave,{isReplayInit:true})
      check(player.equip.blackkey===player.inventory[0],
        'save restores the worn Black Key as its inventory instance')
      dropInventoryItem(1)
      check(player.equip.blackkey===player.inventory[0] &&
        groundItems[0].item.kind==='blackkey',
        'dropping a different Black Key does not unequip the worn one')

      player.inventory=[createItem('wheelbarrow'),createItem('bigbell')]
      groundItems=[]
      const beforeBlocked=turnCount
      dropInventoryItem(0);dropInventoryItem(1)
      check(turnCount===beforeBlocked&&groundItems.length===0,
        'wheelbarrow and bell are the only prohibited item kinds')
    })()`))
  })

  it('clamps Healing Herb healing to 20-50 HP before the Wyrdling bonus', () => {
    beginNewGame('Herb Bounds Tester')
    cy.window().then(win => {
      const results = win.eval(`(() => {
        const originalRace=player.race, originalMaxHp=player.maxHp
        const run = (race,maxHp) => { player.race=race; player.maxHp=maxHp; return healingHerbAmount() }
        try {
          return {
            low:run('human',40), high:run('human',400),
            wyrdLow:run('wyrdling',40), wyrdHigh:run('wyrdling',400)
          }
        } finally { player.race=originalRace; player.maxHp=originalMaxHp }
      })()`)
      expect(results).to.deep.equal({low:20, high:50, wyrdLow:25, wyrdHigh:63})
    })
  })

  it('brews only affordable whole potions across herb stacks without turns or RNG', () => {
    // Brewing needs the loaded item catalog, not a randomly generated world.
    // Keep world generation out of this unit-like E2E case: failed procedural
    // generation must be diagnosed by the dedicated worldgen tests instead.
    cy.visit('/')
    cy.get('#raceOverlay .panelbox').should('be.visible')
    cy.get('#loadingOverlay').should('not.be.visible')
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
