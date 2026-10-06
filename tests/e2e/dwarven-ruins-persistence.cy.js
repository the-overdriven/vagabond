describe('Dwarven Ruins persistence', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Ruins Persistence Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  })

  it('restores room graph, key sources, door mutations, traps, alerts, discovery, and lift state together', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      replayRecording = false
      replayPlaying = false
      currentZ = 0
      currentCave = -1
      map = surfaceMap
      applyWorldTraits([])
      WORLD_SEED = 864209
      rngState = WORLD_SEED
      await generateNewWorld()

      const level = deepLevels[2]
      const z = chainZForDepth(4)
      const roomGraphBefore = JSON.stringify(level.roomGraph)
      const progressionBefore = JSON.stringify(level.progressionKey)
      const trapsBefore = JSON.stringify(level.traps || [])
      const interior = level.rooms.flatMap(room => dwarvenRoomInterior(room))
        .filter(p => level.map[p.y]?.[p.x] === 'marble')
      check(interior.length >= 2, 'test floor has spare interior terrain for persistent door-state mutations')
      const opened = interior[0]
      const breached = interior.find(p => p.x !== opened.x || p.y !== opened.y)
      level.map[opened.y][opened.x] = 'dwarvendooropen'
      level.map[breached.y][breached.x] = 'dwarvendoorbreached'
      level.discovered[opened.y][opened.x] = true

      const heldKeyId = 'test:persistent-local-key'
      addInventoryItem('dwarvenkey', {keyId:heldKeyId,ordinaryDoorKey:true})
      const floorEnemy = enemies.find(enemy => enemy.alive && enemy.level === z)
      check(!!floorEnemy, 'test floor has an enemy to persist Alarmed/key-carrier state')
      floorEnemy.alarmed = true
      floorEnemy.aware = true
      floorEnemy.carriedDungeonKey = {kind:'dwarvenkey',keyId:'test:persistent-carrier-key',progressionKey:true}

      check(setDwarvenLiftPowered(true), 'test can activate persistent lift state')
      const leverDepth = chainDepthForZ(dwarvenRuinsLiftShortcut().lever.z)
      const leverLevel = deepLevels[leverDepth - 2]
      leverLevel.map[dwarvenRuinsLiftShortcut().lever.y][dwarvenRuinsLiftShortcut().lever.x] = 'dwarvenleverpulled'
      const liftBefore = JSON.stringify(dwarvenRuinsLiftShortcut())

      const save = JSON.parse(JSON.stringify(buildSaveObject()))
      check(save.version === self.VAGABOND_SAVE_VERSION, 'complex Ruins state uses current save schema')
      loadGameFromObject(save, {isReplayInit:true})

      const restored = deepLevels[2]
      check(restored.map[opened.y][opened.x] === 'dwarvendooropen', 'opened ordinary door persists')
      check(restored.map[breached.y][breached.x] === 'dwarvendoorbreached', 'breached ordinary door persists')
      check(restored.discovered[opened.y][opened.x] === true, 'Ruins discovery grid persists')
      check(JSON.stringify(restored.roomGraph) === roomGraphBefore, 'room graph persists exactly')
      check(JSON.stringify(restored.progressionKey) === progressionBefore, 'progression-key scenario metadata persists exactly')
      check(JSON.stringify(restored.traps || []) === trapsBefore, 'trap mechanisms persist exactly')
      check(player.inventory.some(item => item.kind === 'dwarvenkey' && item.keyId === heldKeyId), 'collected dungeon key persists in inventory')
      const restoredEnemy = enemies.find(enemy => enemy.id === floorEnemy.id)
      check(restoredEnemy?.alarmed === true && restoredEnemy?.aware === true, 'Alarmed enemy state persists')
      check(restoredEnemy?.carriedDungeonKey?.keyId === 'test:persistent-carrier-key', 'enemy-carried dungeon key persists')
      check(JSON.stringify(dwarvenRuinsLiftShortcut()) === liftBefore && dwarvenRuinsLiftShortcut().unlocked === true, 'paired lift metadata persists')
      const restoredLeverDepth = chainDepthForZ(dwarvenRuinsLiftShortcut().lever.z)
      const restoredLeverLevel = deepLevels[restoredLeverDepth - 2]
      check(restoredLeverLevel.map[dwarvenRuinsLiftShortcut().lever.y][dwarvenRuinsLiftShortcut().lever.x] === 'dwarvenleverpulled', 'pulled lever terrain persists')
      for (const endpoint of [dwarvenRuinsLiftShortcut().upper,dwarvenRuinsLiftShortcut().lower]) {
        const endpointLevel = deepLevels[chainDepthForZ(endpoint.z) - 2]
        check(endpointLevel.map[endpoint.y][endpoint.x] === 'dwarvenlifton', 'powered lift endpoint terrain persists')
      }
    })()`))
  })

  it('replays a breach, noise alert, and reusable trap sequence with the same RNG tape', () => {
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
      WORLD_SEED = 992341
      rngState = WORLD_SEED
      await generateNewWorld()

      const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins
      const oldAlarmChance = cfg.doors.breachAlarmChance
      cfg.doors.breachAlarmChance = 1
      try {
        const level = deepLevels[2]
        const z = chainZForDepth(4)
        const room = level.rooms.find(room => room.index !== 0 && room.w >= 8 && room.h >= 6)
        check(!!room, 'controlled replay has a large enough Ruins room')
        const y = Math.min(room.y + room.h - 3, Math.max(room.y + 2, room.cy))
        const startX = room.x + 2
        const doorX = startX + 1
        const trapX = startX + 2
        const enemyX = Math.min(room.x + room.w - 2, startX + 5)
        for (let x = startX; x <= enemyX; x++) level.map[y][x] = 'marble'
        level.map[y + 1][doorX] = 'dwarvendoorlocked'
        level.map[y][doorX] = 'dwarvendoorlocked'
        level.map[y][trapX] = 'dwarvenspikes'
        level.traps = [{id:'dwarvenRuins-trap:test:replay',type:'spikes',trigger:{x:trapX,y}}]
        groundItems = groundItems.filter(item => item.level !== z || !(
          item.y === y && item.x >= startX && item.x <= enemyX))

        map = level.map
        currentZ = z
        currentCave = -1
        undergroundDiscovered = level.discovered
        for (let yy = 0; yy < MAP_H; yy++) undergroundDiscovered[yy].fill(true)
        player.x = startX
        player.y = y
        player.hp = playerMaxHp()
        player.inventory = player.inventory.filter(item => item.kind !== 'dwarvenkey')
        player.equip.weapon = {kind:'weapon',name:'Replay Breaching Maul',atk:100}
        turnCount = 0
        consecutiveWaitTurns = 0

        const enemy = enemies.find(enemy => enemy.alive && enemy.level === z)
        check(!!enemy, 'controlled replay has a Ruins enemy for the noise alert')
        enemies = [enemy]
        enemy.x = enemyX
        enemy.y = y
        enemy.homeX = enemyX
        enemy.homeY = y
        enemy.level = z
        enemy.levelKind = 'chain'
        enemy.caveIndex = -1
        enemy.alive = true
        enemy.alarmed = false
        enemy.aware = false
        enemy.rareFleeTurns = 0
        enemy.sleeping = false
        enemy.wander = false
        enemy.aggro = 1
        occupied = new Set([keyXY(enemy.x,enemy.y)])
        rngState = 551122

        startReplayRecording()
        await tryMove(1,0)
        check(level.map[y][doorX] === 'dwarvendoorbreached', 'first recorded move breaches the locked door')
        check(enemy.alarmed === true, 'breach noise alarms the controlled enemy')
        await tryMove(1,0)
        const hpBeforeTrap = player.hp
        await tryMove(1,0)
        check(player.x === trapX && player.y === y && player.hp < hpBeforeTrap, 'third move enters and triggers the reusable spike trap')

        const expected = JSON.stringify({
          tile: level.map[y][doorX],
          hp: player.hp,
          x: player.x,
          y: player.y,
          turn: turnCount,
          enemy: enemies[0] ? {id:enemies[0].id,x:enemies[0].x,y:enemies[0].y,alarmed:enemies[0].alarmed,hp:enemies[0].hp} : null,
          traps: level.traps
        })
        const recorded = JSON.parse(JSON.stringify(replayData))
        check(recorded.actions.length === 3 && recorded.actions.every(action => action.type === 'move'),
          'breach plus traversal plus trap are recorded as three movement actions')
        check(recorded.rng.length > 0, 'combined sequence records its gameplay RNG tape')

        loadGameFromObject(recorded.initialState,{isReplayInit:true})
        replayAnimationsDisabled = true
        replaySimulationMode = true
        activeReplay = recorded
        replayPlaying = true
        replayRecording = false
        replayRngIndex = 0
        try {
          for (const action of recorded.actions) await runReplayAction(action)
          const replayLevel = deepLevels[2]
          const replayed = JSON.stringify({
            tile: replayLevel.map[y][doorX],
            hp: player.hp,
            x: player.x,
            y: player.y,
            turn: turnCount,
            enemy: enemies[0] ? {id:enemies[0].id,x:enemies[0].x,y:enemies[0].y,alarmed:enemies[0].alarmed,hp:enemies[0].hp} : null,
            traps: replayLevel.traps
          })
          check(replayRngIndex === recorded.rng.length, 'combined replay consumes exactly the recorded RNG tape')
          check(replayed === expected, 'combined replay reproduces breach, alert, trap damage, actor state, and terrain')
        } finally {
          replayPlaying = false
          replaySimulationMode = false
          activeReplay = null
        }
      } finally {
        cfg.doors.breachAlarmChance = oldAlarmChance
      }
    })()`))
  })

})
