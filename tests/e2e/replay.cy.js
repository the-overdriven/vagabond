function beginDeterministicReplayGame(name = 'Replay E2E Tester') {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')

  cy.get('#raceName').clear().type(name)
  cy.get('#replayToggle').check()
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay').should('not.be.visible')
  cy.get('#raceOverlay').should('not.have.class', 'show')
  cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))

  // World generation runs after Begin. Set up the deterministic Temple area
  // only once generation finishes, then replace the just-started recording's
  // snapshot so the fixture is part of the replay's initial state.
  cy.window().then(win => {
    win.eval(`(() => {
      const cx = spawnPoint.x
      const cy = spawnPoint.y
      const radius = 12

      player.x = cx
      player.y = cy

      for (let y = Math.max(1, cy - radius); y <= Math.min(MAP_H - 2, cy + radius); y++) {
        for (let x = Math.max(1, cx - radius); x <= Math.min(MAP_W - 2, cx + radius); x++) {
          surfaceMap[y][x] = 'grass'
        }
      }
      map = surfaceMap

      // Keep combat and ground-trigger side effects out of this replay regression.
      // NPC wandering remains active and is intentionally part of the test.
      enemies = enemies.filter(e =>
        e.level !== 0 || Math.max(Math.abs(e.x - cx), Math.abs(e.y - cy)) > radius
      )
      groundItems = groundItems.filter(g =>
        g.level !== 0 || Math.max(Math.abs(g.x - cx), Math.abs(g.y - cy)) > radius
      )

      const positions = {
        'Old Hunter':  [cx + 8, cy],
        'Gravedigger': [cx - 8, cy],
        'Drunk':       [cx, cy + 8],
        'Merchant':    [cx + 8, cy + 8],
        'Herbalist':   [cx - 8, cy + 8],
      }
      for (const npc of npcs) {
        const pos = positions[npc.name]
        if (!pos) continue
        npc.x = pos[0]
        npc.y = pos[1]
        npc.homeX = pos[0]
        npc.homeY = pos[1]
        npc.talkFreezeTurns = 0
      }

      occupied = new Set()
      for (const e of enemies) if (e.alive) occupied.add(keyXY(e.x, e.y))
      for (const npc of npcs) occupied.add(keyXY(npc.x, npc.y))

      oldHunterQuest = null
      oldHunterQuestSerial = 0
      turnCount = 0
      consecutiveWaitTurns = 0
      snapCameraToPlayer()
      render()

      replayRecording = false
      replayData = null
      startReplayRecording()
    })()`)
  })

  cy.window().then(win => {
    expect(win.eval('replayRecording')).to.equal(true)
    expect(win.eval('replayData.actions.length')).to.equal(0)
  })
}

function walkPattern(pattern) {
  const assertIdle = win => {
    expect(win.eval('!!(cameraAnimating || attackAnim || pendingMoveTask !== null || pendingMove)'),
      'movement and deferred input settled').to.equal(false)
  }
  for (const [dx, dy] of pattern) {
    let before
    cy.window().should(assertIdle)
    cy.window().then(win => {
      before = win.eval('({x: player.x, y: player.y, turn: turnCount, actions: replayData.actions.length})')
      return win.eval(`tryMove(${dx}, ${dy})`)
    })
    // An idle animation alone does not prove an input consumed a turn.
    // Retry observations, never the movement itself, and verify each move.
    cy.window().should(win => {
      assertIdle(win)
      expect(win.eval('turnCount'), 'one turn per move').to.equal(before.turn + 1)
      expect(win.eval('player.x'), 'destination x').to.equal(before.x + dx)
      expect(win.eval('player.y'), 'destination y').to.equal(before.y + dy)
      expect(win.eval('replayData.actions.length'), 'one recorded action per move').to.equal(before.actions + 1)
    })
  }
}

function talkToOldHunter() {
  cy.window().then(win => {
    const result = win.eval('interactOldHunter()')
    expect(result).to.equal(true)
  })
}

function saveToDiskAndReload(label) {
  const path = `${Cypress.config('downloadsFolder')}/replay-e2e-${label}.json`
  let snapshot

  cy.window().then(win => {
    // JSON round-trip deliberately mirrors the real .json save boundary instead
    // of reusing the live objects returned by buildSaveObject().
    snapshot = win.eval('JSON.parse(JSON.stringify(buildSaveObject()))')
    expect(snapshot.replay).to.be.an('object')
    expect(snapshot.replay.actions).to.be.an('array').and.not.be.empty
    return cy.writeFile(path, snapshot, {log: false})
  })

  cy.get('#fileLoad').selectFile(path, {force: true})
  cy.get('#logpanel').should('contain.text', 'Game loaded.')

  return cy.wrap(null, {log: false}).then(() => snapshot)
}

function playReplayAndAssertClean() {
  cy.get('#btnReplay').should('be.visible').click()

  // lastReplayDiagnostic is populated only when playback either completes or
  // detects a desync, so this assertion also waits for the asynchronous replay.
  cy.window({timeout: 20000}).should(win => {
    const diagnostic = win.lastReplayDiagnostic
    expect(diagnostic, 'replay diagnostic').to.be.an('object')
    expect(diagnostic.message, 'desync marker').not.to.equal('First replay action with different RNG consumption')
    expect(diagnostic.completedActions, 'completed replay actions').to.equal(diagnostic.totalActions)
    expect(diagnostic.consumedRng, 'consumed replay RNG').to.equal(diagnostic.recordedRng)
    expect(diagnostic.remainingActions, 'remaining replay actions').to.deep.equal([])
    expect(win.eval('replayPlaying'), 'playback stopped').to.equal(false)
    expect(win.eval('replayRecording'), 'recording resumed after playback').to.equal(true)
  })

  cy.get('#logpanel').should('not.contain.text', 'Replay desynchronized on action')
}

describe('Replay save/load determinism', () => {
  it('survives replaying a save, continuing the run, saving again, and replaying the extended run', () => {
    beginDeterministicReplayGame()

    // Scripted movement is intentional: "random walking" would make the E2E
    // test flaky while exercising the exact same movement/NPC RNG code paths.
    walkPattern([
      [1, 0], [0, 1], [-1, 0], [0, -1],
      [-1, 0], [0, 1], [1, 0], [0, -1],
    ])

    // This generates the Old Hunter's seeded random quest and, importantly,
    // sets talkFreezeTurns. The first save is taken while that transient NPC
    // state is still non-zero: this is the regression that previously desynced.
    talkToOldHunter()

    let firstActionCount = 0
    let firstHunterFreeze = 0
    saveToDiskAndReload('stage-1').then(save => {
      firstActionCount = save.replay.actions.length
      const hunter = save.npcs.find(n => n.name === 'Old Hunter')
      expect(hunter, 'Old Hunter in save').to.exist
      expect(hunter.talkFreezeTurns, 'saved Old Hunter freeze').to.be.greaterThan(0)
      firstHunterFreeze = hunter.talkFreezeTurns
      expect(save.replay.actions.some(a => a.type === 'talk' && a.npc === 'Old Hunter')).to.equal(true)
    })

    cy.window().then(win => {
      expect(win.eval(`npcs.find(n => n.name === 'Old Hunter').talkFreezeTurns`))
        .to.equal(firstHunterFreeze)
    })

    playReplayAndAssertClean()

    // Continue from the restored live save. These actions must append to the
    // existing recording rather than starting a new replay or silently stopping.
    walkPattern([
      [1, 0], [1, 0], [0, 1], [-1, 0],
      [-1, 0], [0, -1], [0, -1], [0, 1],
    ])
    talkToOldHunter()

    saveToDiskAndReload('stage-2').then(save => {
      expect(save.replay.actions.length, 'extended replay action count').to.be.greaterThan(firstActionCount)
      expect(save.replay.actions.filter(a => a.type === 'talk' && a.npc === 'Old Hunter').length)
        .to.equal(2)
      const hunter = save.npcs.find(n => n.name === 'Old Hunter')
      expect(hunter.talkFreezeTurns, 're-saved Old Hunter freeze').to.be.greaterThan(0)
    })

    playReplayAndAssertClean()
    cy.get('#logpanel').should('not.contain.text', 'Replay desynchronized on action')
  })
})


describe('Status counters through save and replay', () => {
  it('restores active effects and reproduces their counters without desync', () => {
    beginDeterministicReplayGame('Status Replay Tester')
    cy.window().then(win => win.eval(`
      player.berryRegenTurns = 100
      player.invisibleTurns = 20
      player.speedPotionTurns = 15
      player.curseDebuffs = [{stat:'def',amt:-1,turnsLeft:8}]
      replayRecording = false
      replayData = null
      startReplayRecording()
      updateHud()
    `))
    walkPattern([[1,0], [-1,0]])
    cy.window().then(win => {
      expect(win.eval('turnCount'), 'two completed turns before saving').to.equal(2)
      expect(win.eval('[player.berryRegenTurns, player.invisibleTurns, player.speedPotionTurns]'))
        .to.deep.equal([98, 18, 13])
    })
    let expected
    cy.window().then(win => { expected = win.eval('JSON.stringify(activePlayerStatuses())') })
    saveToDiskAndReload('status-counters')
    cy.window().then(win => expect(win.eval('JSON.stringify(activePlayerStatuses())')).to.equal(expected))
    cy.get('[data-status="regen"]').should('contain.text', '98t')
    playReplayAndAssertClean()
    cy.window().then(win => expect(win.eval('JSON.stringify(activePlayerStatuses())')).to.equal(expected))
    cy.get('[data-status="invisible"]').should('contain.text', '18t')
    cy.get('[data-status="speed"]').should('contain.text', '13t')
  })
})


describe('Catalog food through save and replay', () => {
  it('preserves stacked Wyrdling food duration, unique items, and depleted scroll stock', () => {
    beginDeterministicReplayGame('Catalog Replay Tester')
    cy.window().then(win => win.eval(`
      player.race = 'wyrdling'
      player.berryRegenTurns = 0
      player.inventory = []
      addBerries(); addFishermanFish()
      addInventoryItem('oddTombstone', {inscription: 'A unique inscription', tombName: 'Test', tombBirth: 600, tombDeath: 650})
      merchantStock.find(it => it.kind === 'scrollOfInvisibility').count = 0
      replayRecording = false; replayData = null; startReplayRecording()
      useBerries(player.inventory.findIndex(it => it.kind === 'berries'))
      useFish(player.inventory.findIndex(it => it.kind === 'fish'))
    `))
    let expected
    cy.window().then(win => {
      expect(win.eval('player.berryRegenTurns')).to.equal(248)
      expect(win.eval('replayData.actions.map(a => a.action)')).to.deep.equal(['berries', 'fish'])
      expected = win.eval('JSON.stringify({inventory: player.inventory, regen: player.berryRegenTurns, turns: turnCount})')
    })
    saveToDiskAndReload('catalog-food')
    cy.window().then(win => {
      expect(win.eval('JSON.stringify({inventory: player.inventory, regen: player.berryRegenTurns, turns: turnCount})')).to.equal(expected)
      expect(win.eval("merchantStock.find(it => it.kind === 'scrollOfInvisibility').count")).to.equal(0)
    })
    playReplayAndAssertClean()
    cy.window().then(win => {
      expect(win.eval('JSON.stringify({inventory: player.inventory, regen: player.berryRegenTurns, turns: turnCount})')).to.equal(expected)
      expect(win.eval("merchantStock.find(it => it.kind === 'scrollOfInvisibility').count")).to.equal(0)
    })
  })
})

describe('Batch brewing through save and replay', () => {
  it('records one batch action and reproduces its ingredients, potions, and gold', () => {
    let expected
    beginDeterministicReplayGame('Brewing Replay Tester')
    cy.window().then(win => win.eval(`
      player.inventory = []; addInventoryItem('herb', {count: 7}); player.gold = 30
      replayRecording = false; replayData = null; startReplayRecording()
      makeHerbalistPotion(true)
      window.brewState = () => JSON.stringify({inventory: player.inventory.map(i => ({kind:i.kind,count:i.count})), gold:player.gold, turns:turnCount})
      window.expectedBrewState = brewState()
    `))
    cy.window().then(win => {
      expect(win.eval('replayData.actions.map(a => a.action)')).to.deep.equal(['makeAllPotions'])
      expect(win.eval('replayData.rng.length')).to.equal(0)
      expected = win.expectedBrewState
    })
    saveToDiskAndReload('batch-brewing')
    cy.window().then(win => {
      expect(win.eval("JSON.stringify({inventory: player.inventory.map(i => ({kind:i.kind,count:i.count})), gold:player.gold, turns:turnCount})")).to.equal(expected)
      return win.eval(`
      window.brewState = () => JSON.stringify({inventory: player.inventory.map(i => ({kind:i.kind,count:i.count})), gold:player.gold, turns:turnCount})
      window.expectedBrewState = brewState()
      window.restoreAfterBrewingReplay = restoreLiveAfterReplay
      restoreLiveAfterReplay = () => { window.reconstructedBrewState = brewState(); restoreAfterBrewingReplay() }
    `)
    })
    playReplayAndAssertClean()
    cy.window().then(win => {
      expect(win.reconstructedBrewState).to.equal(win.expectedBrewState)
      expect(win.eval('brewState()')).to.equal(win.expectedBrewState)
    })
  })
})
