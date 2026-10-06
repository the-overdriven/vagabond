describe('Dwarven Ruins shortcut lift', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Dwarven Lift Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  })

  it('places a seeded D1-to-deeper lift in the configured range and powers it from the deeper lever', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      replayRecording = false
      replayPlaying = false
      currentZ = 0
      currentCave = -1
      map = surfaceMap
      applyWorldTraits([])

      const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins
      const oldRange = cfg.levelCountRange.slice()
      const oldShortcut = cfg.shortcut.targetFloorProgressRange.slice()
      cfg.levelCountRange = [5, 5]
      cfg.shortcut.targetFloorProgressRange = [0.5, 1]
      WORLD_SEED = 54321
      rngState = WORLD_SEED
      await generateNewWorld()
      cfg.levelCountRange = oldRange
      cfg.shortcut.targetFloorProgressRange = oldShortcut

      const lift = dwarvenRuinsLiftShortcut()
      check(lift && lift.id === 'dwarven-ruins-lift-1', 'lift metadata exists')
      check(lift.upper.floor === 1 && lift.upper.z === -4, 'upper platform is fixed on D1')
      const upperReachable = dungeonWalkDistances(deepLevels[2].map, deepLevels[2].caves[0].entrances[0])
      check(upperReachable.has(keyXY(lift.upper.x, lift.upper.y)),
        'D1 platform stays on the entrance side of intact locks')
      check(lift.lower.floor >= 3 && lift.lower.floor <= 5, 'five-floor target is chosen from D3-D5')
      check(lift.lower.z === chainZForDepth(lift.lower.floor + 3), 'lower floor z matches floor metadata')
      check(!lift.unlocked, 'lift begins unpowered')
      check(depthUndergroundMap(4)[lift.upper.y][lift.upper.x] === 'dwarvenliftoff', 'upper platform begins off')
      const lowerDepth = chainDepthForZ(lift.lower.z)
      check(depthUndergroundMap(lowerDepth)[lift.lower.y][lift.lower.x] === 'dwarvenliftoff', 'lower platform begins off')
      check(depthUndergroundMap(lowerDepth)[lift.lever.y][lift.lever.x] === 'dwarvenlever', 'deeper lever is generated beside lower platform')
      check(Math.abs(lift.lever.x - lift.lower.x) + Math.abs(lift.lever.y - lift.lower.y) === 1,
        'lever is cardinally adjacent to lower platform')
      check(TILE.dwarvenlever.walk === false && TILE.dwarvenlever.projectileBlock === true && TILE.dwarvenlever.blocksSight === true,
        'wall-mounted lever preserves wall blocking behavior')

      enemies = []
      npcs = []
      occupied = new Set()
      currentZ = lift.upper.z
      map = depthUndergroundMap(chainDepthForZ(currentZ))
      undergroundDiscovered = depthUndergroundDiscovered(chainDepthForZ(currentZ))
      currentCave = -1
      player.x = lift.upper.x
      player.y = lift.upper.y
      const beforeUpperInspect = turnCount
      inspect()
      check(currentZ === lift.upper.z && player.x === lift.upper.x && player.y === lift.upper.y,
        'D1 platform cannot activate or travel while unpowered')
      check(turnCount === beforeUpperInspect, 'checking an unpowered lift costs no turn')

      currentZ = lift.lower.z
      map = depthUndergroundMap(lowerDepth)
      undergroundDiscovered = depthUndergroundDiscovered(lowerDepth)
      player.x = lift.lower.x
      player.y = lift.lower.y
      const dx = lift.lever.x - player.x
      const dy = lift.lever.y - player.y
      const beforeLever = turnCount
      await tryMove(dx, dy)
      check(turnCount === beforeLever + 1, 'lever activation costs exactly one turn')
      check(player.x === lift.lower.x && player.y === lift.lower.y, 'bumping lever does not move player')
      check(lift.unlocked, 'lever permanently powers lift')
      check(depthUndergroundMap(4)[lift.upper.y][lift.upper.x] === 'dwarvenlifton' &&
        depthUndergroundMap(lowerDepth)[lift.lower.y][lift.lower.x] === 'dwarvenlifton',
        'activation powers both endpoints')
      check(depthUndergroundMap(lowerDepth)[lift.lever.y][lift.lever.x] === 'dwarvenleverpulled',
        'activated lever changes to its persistent pulled terrain state')
      check(RENDER_STYLE.terrainTiles.dwarvenleverpulled?.image === 'img/tiles/dwarven-lever-pulled.png', 'pulled lever uses its dedicated sprite')

      const beforeTravelTurn = turnCount
      inspect()
      check(currentZ === lift.upper.z && player.x === lift.upper.x && player.y === lift.upper.y,
        'lower lift arrives at exact D1 endpoint')
      check(turnCount === beforeTravelTurn, 'lift travel follows transition convention and costs no combat turn')
      inspect()
      check(currentZ === lift.lower.z && player.x === lift.lower.x && player.y === lift.lower.y,
        'upper lift returns to exact deeper endpoint')
    })()`))
  })

  it('persists and replays lift activation deterministically', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      replayRecording = false
      replayPlaying = false
      replayData = null
      replayAnimationsDisabled = true
      currentZ = 0
      currentCave = -1
      map = surfaceMap
      applyWorldTraits([])
      WORLD_SEED = 12345
      rngState = WORLD_SEED
      await generateNewWorld()

      const lift = dwarvenRuinsLiftShortcut()
      const lowerDepth = chainDepthForZ(lift.lower.z)
      currentZ = lift.lower.z
      map = depthUndergroundMap(lowerDepth)
      undergroundDiscovered = depthUndergroundDiscovered(lowerDepth)
      currentCave = -1
      enemies = []
      npcs = []
      occupied = new Set()
      player.x = lift.lower.x
      player.y = lift.lower.y
      turnCount = 0
      consecutiveWaitTurns = 0
      const dx = lift.lever.x - player.x
      const dy = lift.lever.y - player.y

      startReplayRecording()
      await tryMove(dx, dy)
      const recorded = JSON.parse(JSON.stringify(replayData))
      check(recorded.actions.length === 1 && recorded.actions[0].type === 'move', 'lever bump records as one move action')
      check(recorded.rng.length === 0, 'lift activation consumes no gameplay RNG')
      check(dwarvenRuinsLiftShortcut().unlocked && turnCount === 1, 'recorded activation powers lift in one turn')

      const save = JSON.parse(JSON.stringify(buildSaveObject()))
      check(save.version === SAVE_VERSION && save.dungeonShortcuts.find(shortcut => shortcut.id === WORLD_GEN_CONFIG.dungeons.dwarvenRuins.shortcut.id)?.unlocked === true, 'current save schema stores powered lift metadata')
      loadGameFromObject(save, {isReplayInit:true})
      check(dwarvenRuinsLiftShortcut().unlocked, 'powered state restores')
      check(depthUndergroundMap(4)[dwarvenRuinsLiftShortcut().upper.y][dwarvenRuinsLiftShortcut().upper.x] === 'dwarvenlifton',
        'powered upper platform terrain restores')
      check(depthUndergroundMap(chainDepthForZ(dwarvenRuinsLiftShortcut().lower.z))[dwarvenRuinsLiftShortcut().lower.y][dwarvenRuinsLiftShortcut().lower.x] === 'dwarvenlifton',
        'powered lower platform terrain restores')
      check(depthUndergroundMap(chainDepthForZ(dwarvenRuinsLiftShortcut().lever.z))[dwarvenRuinsLiftShortcut().lever.y][dwarvenRuinsLiftShortcut().lever.x] === 'dwarvenleverpulled',
        'pulled lever terrain remains pulled after load')

      loadGameFromObject(recorded.initialState, {isReplayInit:true})
      replayAnimationsDisabled = true
      replaySimulationMode = true
      activeReplay = recorded
      replayPlaying = true
      replayRecording = false
      replayRngIndex = 0
      try {
        for (const action of recorded.actions) await runReplayAction(action)
        check(dwarvenRuinsLiftShortcut().unlocked && turnCount === 1, 'replay reaches identical powered state and turn count')
        check(replayRngIndex === recorded.rng.length, 'replay consumes identical zero-length RNG trace')
      } finally {
        replayPlaying = false
        replaySimulationMode = false
        activeReplay = null
      }
    })()`))
  })
})
