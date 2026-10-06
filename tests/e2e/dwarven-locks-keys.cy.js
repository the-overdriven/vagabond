describe('Dwarven Ruins locks, keys, gates and breaching', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Dwarven Lock Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  })

  it('places a reachable mandatory key, consumes it to open the gate, and preserves the result', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      replayRecording = false
      replayPlaying = false
      currentZ = 0
      currentCave = -1
      map = surfaceMap
      applyWorldTraits([])

      const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins
      const oldLevelRange = cfg.levelCountRange.slice()
      const oldPreBreached = cfg.doors.progressionGatePreBreachedChance
      cfg.levelCountRange = [3, 3]
      cfg.doors.progressionGatePreBreachedChance = 0
      WORLD_SEED = 13579
      rngState = WORLD_SEED
      await generateNewWorld()
      cfg.levelCountRange = oldLevelRange
      cfg.doors.progressionGatePreBreachedChance = oldPreBreached

      const level = deepLevels[2]
      const floorZ = chainZForDepth(4)
      const positions = tile => {
        const found = []
        for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++)
          if (level.map[y]?.[x] === tile) found.push({x, y})
        return found
      }
      const gate = positions('dwarvengatelocked')
      check(gate.length === 2, 'forced intact progression gate has two leaves')
      const keyGround = groundItems.filter(g => g.kind === 'dwarvenkey' && g.progressionKey && g.level === floorZ)
      check(keyGround.length === 1, 'intact progression gate has exactly one ground key')
      check(keyGround[0].keyId === dwarvenDungeonLockId(floorZ, 'gate', gate), 'progression key ID matches gate pair')

      map = level.map
      currentZ = floorZ
      currentCave = -1
      undergroundDiscovered = level.discovered
      for (let y = 0; y < MAP_H; y++) undergroundDiscovered[y].fill(true)
      enemies = []
      occupied = new Set()

      const approach = gate.flatMap(leaf => [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({
        x: leaf.x + dx, y: leaf.y + dy, dx: -dx, dy: -dy, leaf
      }))).find(p => TILE[map[p.y]?.[p.x]]?.walk)
      check(approach, 'locked gate has a walkable approach')
      player.x = approach.x
      player.y = approach.y
      player.inventory = player.inventory.filter(item => item.kind !== 'dwarvenkey')
      player.equip.weapon = {kind:'weapon', name:'Test Maul', atk:100}
      const blockedTurn = turnCount
      await tryMove(approach.dx, approach.dy)
      check(turnCount === blockedTurn, 'mandatory gate without key consumes no turn')
      check(map[approach.leaf.y][approach.leaf.x] === 'dwarvengatelocked', 'mandatory gate cannot be weapon-breached')

      player.x = keyGround[0].x
      player.y = keyGround[0].y
      checkGroundAt(player.x, player.y)
      check(player.inventory.some(item => item.kind === 'dwarvenkey' && item.keyId === keyGround[0].keyId),
        'walking over the key stores its persistent lock ID')
      check(!groundItems.includes(keyGround[0]), 'picked-up key leaves the ground')

      player.x = approach.x
      player.y = approach.y
      const openTurn = turnCount
      await tryMove(approach.dx, approach.dy)
      check(turnCount === openTurn + 1, 'unlocking/opening the gate costs exactly one turn')
      check(player.x === approach.x && player.y === approach.y, 'opening the gate does not also move the player')
      check(gate.every(p => map[p.y][p.x] === 'dwarvengateopen'), 'one matching key opens both gate leaves without marking them ruined')
      check(!player.inventory.some(item => item.kind === 'dwarvenkey' && item.keyId === keyGround[0].keyId),
        'gate key is consumed on opening')

      const save = JSON.parse(JSON.stringify(buildSaveObject()))
      check(save.version === self.VAGABOND_SAVE_VERSION, 'gate state uses the current save schema')
      loadGameFromObject(save, {isReplayInit:true})
      const restored = deepLevels[2]
      check(gate.every(p => restored.map[p.y][p.x] === 'dwarvengateopen'), 'intact opened gate survives save/replay restoration')
      check(!player.inventory.some(item => item.kind === 'dwarvenkey' && item.keyId === keyGround[0].keyId),
        'consumed key stays consumed after restoration')

      check(TILE.dwarvengatelocked.projectileBlock === true && TILE.dwarvengatelocked.blocksSight === true,
        'locked gate blocks projectiles and sight')
      check(TILE.dwarvengateopen.walk === true && TILE.dwarvengateopen.projectileBlock !== true &&
        TILE.dwarvengateopen.blocksSight !== true, 'intact opened gate is fully passable')
      check(TILE.dwarvengatebreached.walk === true && TILE.dwarvengatebreached.projectileBlock !== true &&
        TILE.dwarvengatebreached.blocksSight !== true, 'pre-breached ruined gate remains fully passable')
      check(RENDER_STYLE.terrainTiles.dwarvengateopen?.image === 'img/tiles/dwarven-gate-open.png', 'intact open gate uses its dedicated sprite')
      check(itemIconPath('dwarvenkey') === 'img/tiles/dwarven-key.png', 'Dwarven Key uses the PNG path')
    })()`))
  })

  it('supports keyed ordinary locks, weapon breaching, no-turn bare fists, and deterministic noise targeting', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      replayRecording = false
      replayPlaying = false
      currentZ = 0
      currentCave = -1
      map = surfaceMap
      applyWorldTraits([])
      WORLD_SEED = 12345
      rngState = WORLD_SEED
      await generateNewWorld()
      const level = deepLevels[2]
      check(level, 'first Dwarven Ruins floor exists')
      map = level.map
      currentZ = chainZForDepth(4)
      currentCave = -1
      undergroundDiscovered = level.discovered
      for (let y = 0; y < MAP_H; y++) undergroundDiscovered[y].fill(true)
      enemies = []
      occupied = new Set()

      const closed = []
      for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++)
        if (map[y][x] === 'dwarvendoorclosed') closed.push({x, y})
      check(closed.length >= 2, 'generated floor has an ordinary door pair for lock mechanics')
      let pair = null
      for (const p of closed) {
        const q = closed.find(other => Math.abs(other.x - p.x) + Math.abs(other.y - p.y) === 1)
        if (q) { pair = [p, q].sort((a,b) => a.y - b.y || a.x - b.x); break }
      }
      check(pair, 'ordinary doorway has adjacent leaves')
      for (const p of pair) map[p.y][p.x] = 'dwarvendoorlocked'

      const approach = pair.flatMap(leaf => [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({
        x: leaf.x + dx, y: leaf.y + dy, dx: -dx, dy: -dy, leaf
      }))).find(p => TILE[map[p.y]?.[p.x]]?.walk)
      check(approach, 'ordinary locked door has a walkable approach')
      player.x = approach.x
      player.y = approach.y
      player.inventory = player.inventory.filter(item => item.kind !== 'dwarvenkey')
      player.equip.weapon = null
      const fistTurn = turnCount
      await tryMove(approach.dx, approach.dy)
      check(turnCount === fistTurn, 'bare-fist breach attempt consumes no turn')
      check(map[approach.leaf.y][approach.leaf.x] === 'dwarvendoorlocked', 'bare fists do not alter the lock')

      const lockId = dwarvenDungeonLockId(currentZ, 'door', pair)
      addInventoryItem('dwarvenkey', {keyId: lockId})
      const keyTurn = turnCount
      await tryMove(approach.dx, approach.dy)
      check(turnCount === keyTurn + 1, 'matching ordinary key unlocks in one turn')
      check(pair.every(p => map[p.y][p.x] === 'dwarvendooropen'), 'matching key opens both ordinary lock leaves')
      check(!player.inventory.some(item => item.kind === 'dwarvenkey' && item.keyId === lockId), 'ordinary key is consumed')

      for (const p of pair) map[p.y][p.x] = 'dwarvendoorlocked'
      player.x = approach.x
      player.y = approach.y
      player.equip.weapon = {kind:'weapon', name:'Test Pick', atk:100}
      const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.doors
      const oldAlarmChance = cfg.breachAlarmChance
      cfg.breachAlarmChance = 0
      const breachTurn = turnCount
      await tryMove(approach.dx, approach.dy)
      check(turnCount === breachTurn + 1, 'weapon breach attempt consumes exactly one turn')
      check(map[approach.leaf.y][approach.leaf.x] === 'dwarvendoorbreached', '100 ATK weapon guarantees that struck leaf breaches')
      const otherLeaf = pair.find(p => p.x !== approach.leaf.x || p.y !== approach.leaf.y)
      check(map[otherLeaf.y][otherLeaf.x] === 'dwarvendoorlocked', 'breaching one physical leaf does not destroy the other')

      addInventoryItem('dwarvenkey', {keyId: lockId})
      const otherApproach = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({
        x: otherLeaf.x + dx, y: otherLeaf.y + dy, dx: -dx, dy: -dy
      })).find(p => TILE[map[p.y]?.[p.x]]?.walk)
      check(otherApproach, 'remaining locked leaf has a walkable approach')
      player.x = otherApproach.x
      player.y = otherApproach.y
      await tryMove(otherApproach.dx, otherApproach.dy)
      check(map[otherLeaf.y][otherLeaf.x] === 'dwarvendooropen',
        'original pair key still identifies the remaining leaf after its sibling is breached')
      check(!player.inventory.some(item => item.kind === 'dwarvenkey' && item.keyId === lockId),
        'pair key is consumed after opening the remaining leaf')

      cfg.breachAlarmChance = 1
      const makeNoiseEnemy = (id, x, y) => ({
        id, name:id, baseName:id, alive:true, hp:10, maxHp:10, atk:1, def:0, spd:1,
        grace:1, tier:1, aggro:5, abilities:[], humanoid:false, level:currentZ,
        levelKind:'chain', caveIndex:-1, x, y, homeX:x, homeY:y, aware:false, alarmed:false
      })
      const near = makeNoiseEnemy('enemy_10', player.x + 2, player.y)
      const far = makeNoiseEnemy('enemy_20', player.x + 8, player.y)
      enemies = [far, near]
      occupied = new Set(enemies.map(e => keyXY(e.x, e.y)))
      const first = alarmNearestEnemyFromBreach()
      check(first === near && near.alarmed && !far.alarmed, 'first noise roll alarms nearest eligible non-Alarmed monster')
      const second = alarmNearestEnemyFromBreach()
      check(second === far && far.alarmed, 'later noise roll skips the already Alarmed monster')

      const tieHigh = makeNoiseEnemy('enemy_20', player.x + 2, player.y)
      const tieLow = makeNoiseEnemy('enemy_10', player.x - 2, player.y)
      enemies = [tieHigh, tieLow]
      occupied = new Set(enemies.map(e => keyXY(e.x, e.y)))
      const tied = alarmNearestEnemyFromBreach()
      check(tied === tieLow, 'equal-distance breach noise ties resolve by stable enemy ID')
      cfg.breachAlarmChance = oldAlarmChance

      check(TILE.dwarvendoorlocked.ch === 'X' && TILE.dwarvendoorbreached.ch === ';', 'ordinary lock ASCII states')
      check(TILE.dwarvendoorlocked.projectileBlock === true && TILE.dwarvendoorlocked.blocksSight === true,
        'locked ordinary door blocks projectiles and sight')
      check(TILE.dwarvendoorbreached.walk === true, 'breached ordinary door is walkable')
      check(RENDER_STYLE.terrainTiles.dwarvendoorlocked?.image === 'img/tiles/dwarven-door-locked.png', 'locked-door art')
      check(RENDER_STYLE.terrainTiles.dwarvendoorbreached?.image === 'img/tiles/dwarven-door-breached.png', 'breached-door art')
      check(WORLD_GEN_CONFIG.dungeons.dwarvenRuins.doors.ordinaryLockedDoorChance === 0.10,
        'ordinary procedural lock frequency is 10% per doorway pair')
    })()`))
  })
  it('generates ordinary locks as shared two-leaf locks with entrance-reachable matching keys', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      replayRecording = false
      replayPlaying = false
      currentZ = 0
      currentCave = -1
      map = surfaceMap
      applyWorldTraits([])

      const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins
      const oldLevelRange = cfg.levelCountRange.slice()
      const oldDoorChance = cfg.doors.ordinaryDoorChance
      const oldLockedChance = cfg.doors.ordinaryLockedDoorChance
      const oldPreBreached = cfg.doors.progressionGatePreBreachedChance
      cfg.levelCountRange = [3, 3]
      cfg.doors.ordinaryDoorChance = 1
      cfg.doors.ordinaryLockedDoorChance = 1
      cfg.doors.progressionGatePreBreachedChance = 1
      WORLD_SEED = 24680
      rngState = WORLD_SEED
      await generateNewWorld()
      cfg.levelCountRange = oldLevelRange
      cfg.doors.ordinaryDoorChance = oldDoorChance
      cfg.doors.ordinaryLockedDoorChance = oldLockedChance
      cfg.doors.progressionGatePreBreachedChance = oldPreBreached

      let level = null, floorZ = null, locked = []
      for (let i = 2; i < deepLevels.length && !level; i++) {
        const candidate = deepLevels[i]
        const found = []
        for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++)
          if (candidate.map[y]?.[x] === 'dwarvendoorlocked') found.push({x, y})
        if (found.length) { level = candidate; floorZ = chainZForDepth(i + 2); locked = found }
      }
      check(level && locked.length >= 2 && locked.length % 2 === 0,
        'forced ordinary locks generate at least one complete leaf pair across the Ruins stratum')

      const seen = new Set()
      const pairs = []
      for (const p of locked) {
        const pk = keyXY(p.x, p.y)
        if (seen.has(pk)) continue
        const adjacent = locked.filter(q => !seen.has(keyXY(q.x, q.y)) &&
          Math.abs(q.x - p.x) + Math.abs(q.y - p.y) === 1)
        check(adjacent.length === 1, 'each locked leaf has exactly one locked sibling')
        const pair = [p, adjacent[0]].sort((a,b) => a.y - b.y || a.x - b.x)
        pair.forEach(q => seen.add(keyXY(q.x, q.y)))
        pairs.push(pair)
      }
      check(seen.size === locked.length, 'all locked leaves belong to a two-leaf shared lock')

      const ordinaryKeys = groundItems.filter(g => g.kind === 'dwarvenkey' && g.ordinaryDoorKey && g.level === floorZ)
      check(ordinaryKeys.length === pairs.length, 'every ordinary lock pair has exactly one generated key')
      const expectedIds = new Set(pairs.map(pair => dwarvenDungeonLockId(floorZ, 'door', pair)))
      check(ordinaryKeys.every(k => expectedIds.has(k.keyId)), 'ordinary keys use the shared pair lock ID')
      check(new Set(ordinaryKeys.map(k => k.keyId)).size === ordinaryKeys.length, 'ordinary lock keys are one-to-one')

      const reachable = dungeonWalkDistances(level.map, level.caves[0].entrances[0])
      check(ordinaryKeys.every(k => reachable.has(keyXY(k.x, k.y))),
        'every ordinary key is reachable from the entrance with all locks closed')

      map = level.map
      currentZ = floorZ
      currentCave = -1
      undergroundDiscovered = level.discovered
      enemies = []
      occupied = new Set()
      const pair = pairs[0]
      const key = ordinaryKeys.find(k => k.keyId === dwarvenDungeonLockId(floorZ, 'door', pair))
      check(key, 'test pair has its matching generated key')
      const approach = pair.flatMap(leaf => [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({
        x: leaf.x + dx, y: leaf.y + dy, dx: -dx, dy: -dy, leaf
      }))).find(p => TILE[map[p.y]?.[p.x]]?.walk)
      check(approach, 'generated ordinary lock has a walkable approach')
      player.x = key.x
      player.y = key.y
      player.inventory = player.inventory.filter(item => item.kind !== 'dwarvenkey')
      checkGroundAt(key.x, key.y)
      check(player.inventory.some(item => item.kind === 'dwarvenkey' && item.keyId === key.keyId),
        'generated ordinary key can be picked up')
      player.x = approach.x
      player.y = approach.y
      const before = turnCount
      await tryMove(approach.dx, approach.dy)
      check(turnCount === before + 1, 'using the shared ordinary key costs one turn')
      check(pair.every(p => map[p.y][p.x] === 'dwarvendooropen'),
        'unlocking either leaf opens both leaves of the shared lock')
    })()`))
  })

  it('replays a weapon breach with identical RNG consumption and terrain state', () => {
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
      const level = deepLevels[2]
      map = level.map
      currentZ = chainZForDepth(4)
      currentCave = -1
      undergroundDiscovered = level.discovered
      enemies = []
      npcs = []
      occupied = new Set()
      turnCount = 0
      consecutiveWaitTurns = 0

      const closed = []
      for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++)
        if (map[y][x] === 'dwarvendoorclosed') closed.push({x, y})
      let pair = null
      for (const p of closed) {
        const q = closed.find(other => Math.abs(other.x - p.x) + Math.abs(other.y - p.y) === 1)
        if (q) { pair = [p, q].sort((a,b) => a.y - b.y || a.x - b.x); break }
      }
      check(pair, 'replay fixture has ordinary door pair')
      for (const p of pair) map[p.y][p.x] = 'dwarvendoorlocked'
      const approach = pair.flatMap(leaf => [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({
        x: leaf.x + dx, y: leaf.y + dy, dx: -dx, dy: -dy, leaf
      }))).find(p => TILE[map[p.y]?.[p.x]]?.walk)
      check(approach, 'replay fixture has door approach')
      player.x = approach.x
      player.y = approach.y
      player.inventory = player.inventory.filter(item => item.kind !== 'dwarvenkey')
      player.equip.weapon = {kind:'weapon', name:'Replay Pick', atk:3}
      rngState = 91731

      startReplayRecording()
      await tryMove(approach.dx, approach.dy)
      const expected = JSON.stringify({
        tile: map[approach.leaf.y][approach.leaf.x],
        turn: turnCount,
        x: player.x,
        y: player.y
      })
      const recorded = JSON.parse(JSON.stringify(replayData))
      check(recorded.actions.length === 1 && recorded.actions[0].type === 'move', 'breach records one move action')
      check(recorded.rng.length >= 2, 'breach attempt records success and noise RNG rolls')

      loadGameFromObject(recorded.initialState, {isReplayInit:true})
      replayAnimationsDisabled = true
      replaySimulationMode = true
      activeReplay = recorded
      replayPlaying = true
      replayRecording = false
      replayRngIndex = 0
      try {
        for (const action of recorded.actions) await runReplayAction(action)
        check(replayRngIndex === recorded.rng.length, 'replay consumes the identical breach RNG trace')
        check(JSON.stringify({
          tile: map[approach.leaf.y][approach.leaf.x],
          turn: turnCount,
          x: player.x,
          y: player.y
        }) === expected, 'replay reproduces breach terrain and turn outcome')
      } finally {
        replayPlaying = false
        replaySimulationMode = false
        activeReplay = null
      }
    })()`))
  })


  it('generates all four controlled progression-key scenarios with solvable dependencies', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins
      const modes = ['championCarrier','remains','trapGuardedSideRoom','lockedSideRoom']
      const savedModes = {...cfg.progressionKeys.modes}
      const savedGateChance = cfg.doors.progressionGatePreBreachedChance
      const savedRange = cfg.levelCountRange.slice()
      cfg.doors.progressionGatePreBreachedChance = 0
      cfg.levelCountRange = [3,3]
      for (let modeIndex = 0; modeIndex < modes.length; modeIndex++) {
        const mode = modes[modeIndex]
        for (const key of modes) cfg.progressionKeys.modes[key] = key === mode ? 1 : 0
        replayRecording = false
        replayPlaying = false
        currentZ = 0
        currentCave = -1
        map = surfaceMap
        applyWorldTraits([])
        WORLD_SEED = 73001 + modeIndex * 101
        rngState = WORLD_SEED
        await generateNewWorld()

        for (let i = 0; i < deepLevels.slice(2).length; i++) {
          const level = deepLevels[i + 2]
          const z = chainZForDepth(i + 4)
          check(level.progressionKey?.mode === mode, mode + ': intact floor uses forced progression-key mode')
          const entry = level.caves[0].entrances[0]
          const exit = level.caves[0].entrances[1]
          const dependency = validateDwarvenRuinsKeyDependencies(level, z, entry, exit)
          check(dependency.ok, mode + ': key dependency is solvable: ' + dependency.reason)
          const keyId = level.progressionKey.keyId
          const direct = groundItems.filter(item => item.level === z && item.kind === 'dwarvenkey' && item.keyId === keyId)
          const remains = groundItems.filter(item => item.level === z && item.dungeonKey?.keyId === keyId)
          const carriers = enemies.filter(enemy => enemy.alive && enemy.level === z && enemy.carriedDungeonKey?.keyId === keyId)
          check(direct.length + remains.length + carriers.length === 1, mode + ': exactly one live progression-key source exists')

          if (mode === 'championCarrier') {
            check(carriers.length === 1 && carriers[0].prefix === 'Champion', 'champion-carrier key is held by the guaranteed champion')
            check(carriers[0].dungeonRoomId === level.progressionKey.targetRoomId, 'key champion occupies the selected reachable encounter room')
          } else if (mode === 'remains') {
            check(remains.length === 1 && remains[0].kind === 'skeleton', 'remains scenario hides key in searchable dwarven remains')
          } else if (mode === 'trapGuardedSideRoom') {
            check(direct.length === 1, 'trap-guarded side room contains the progression key')
            const guard = level.progressionKey.guardPoint
            const radius = cfg.progressionKeys.trapGuardRadius
            check((level.traps || []).some(trap => Math.max(Math.abs(trap.trigger.x - guard.x), Math.abs(trap.trigger.y - guard.y)) <= radius),
              'trap-guarded side room has an active nearby trap mechanism')
          } else if (mode === 'lockedSideRoom') {
            check(direct.length === 1 && !!level.progressionKey.requiresLockId, 'locked side room contains the progression key behind a local lock')
            const localKey = groundItems.find(item => item.level === z && item.kind === 'dwarvenkey' && item.keyId === level.progressionKey.requiresLockId)
            check(!!localKey, 'locked side-room lock has one separately reachable local key')
          }
        }
      }
      cfg.progressionKeys.modes = savedModes
      cfg.doors.progressionGatePreBreachedChance = savedGateChance
      cfg.levelCountRange = savedRange
    })()`))
  })

})
