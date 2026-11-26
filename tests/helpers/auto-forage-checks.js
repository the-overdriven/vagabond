async function autoForageChecks() {
  const check = (ok, msg) => { if (!ok) throw Error(msg) }
  currentZ = 0; currentCave = -1; map = surfaceMap
  player.x = 50; player.y = 50; player.race = 'elf'
  player.rootTurns = 0; player.confusionTurns = 0; player.berserkTurns = 0
  player.artifactElusiveReady = false
  enemies = []; groundItems = []; npcs = []; occupied = new Set()
  foragedTiles = new Set()
  for (let x = 50; x <= 55; x++) {
    grasslandTrees.delete(keyXY(x, 50))
    map[50][x] = ['grass', 'forest', 'forest', 'grass', 'taiga', 'forest'][x - 50]
  }
  stopCameraAnimation(); clearAutoPath(); pendingMove = null
  replayRecording = false; replayData = null
  replayAnimationsDisabled = true
  startReplayRecording()
  const start = turnCount
  setAutoForage(true)
  await tryMove(1, 0)
  check(player.x === 51 && foragedTiles.has(keyXY(51, 50)), 'walking searches the forest')
  check(turnCount === start + 2, 'walking and foraging each consume a turn')
  check(replayData.actions.length === 1 && replayData.actions[0].autoForage === true &&
    replayData.actions[0]._rngEnd === replayData.rng.length, 'both turns share the recorded move RNG scope')
  // Auto-pathing delegates to the same movement resolver.
  startPlannedAutoPath([{x: 52, y: 50}])
  check(player.x === 52 && foragedTiles.has(keyXY(52, 50)) && turnCount === start + 4,
    'auto-path step searches the next forest tile')
  clearAutoPath()
  await tryMove(-1, 0)
  check(turnCount === start + 5, 'previously searched forest adds no turn')
  await tryMove(1, 0)
  await tryMove(1, 0)
  await tryMove(1, 0)
  check(turnCount === start + 8 && foragedTiles.size === 2, 'grass and taiga are not searched')
  setAutoForage(false)
  await tryMove(1, 0)
  check(!foragedTiles.has(keyXY(55, 50)) && turnCount === start + 9,
    'disabled mode does not search new forest')
  const expected = JSON.stringify({x: player.x, y: player.y, turn: turnCount,
    tiles: [...foragedTiles], inventory: player.inventory.map(({replayId, ...item}) => item)})
  const record = JSON.parse(JSON.stringify(replayData))
  setAutoForage(true)
  loadGameFromObject(record.initialState, {isReplayInit: true})
  check(!autoForageEnabled, 'loading clears the live mode')
  replayPlaying = true; replaySimulationMode = true; replayAnimationsDisabled = true
  activeReplay = record; replayRngIndex = 0
  try {
    for (const action of record.actions) {
      await runReplayAction(action)
      check(replayRngIndex === action._rngEnd, 'each movement consumes its recorded RNG')
    }
    const actual = JSON.stringify({x: player.x, y: player.y, turn: turnCount, tiles: [...foragedTiles], inventory: player.inventory.map(({replayId, ...item}) => item)})
    check(expected === actual, 'replay reproduces harvests, inventory and turns')
  } finally {
    replayPlaying = false; replaySimulationMode = false; activeReplay = null
  }
  // Unaware short-range enemies must not block distant forest searches.
  const enemy = {name: 'Wretchling', baseName: 'Wretchling', level: 0, alive: true,
    hp: 10, x: player.x + 7, y: player.y, aggro: 1, abilities: [],
    aware: false, alarmed: false}
  enemies = [enemy]
  const before = turnCount
  const tileKey = keyXY(player.x, player.y)
  enemy.aware = true
  check(!autoForageAfterStep(player.x, player.y, 0) && turnCount === before,
    'aware hostile at safety radius suppresses foraging')
  enemy.aware = false; enemy.alarmed = true
  check(!autoForageAfterStep(player.x, player.y, 0) && turnCount === before,
    'alarmed hostile at safety radius suppresses foraging')
  enemy.alarmed = false
  enemy.x = player.x + effectiveAggroRange(enemy) + 1
  check(!autoForageAfterStep(player.x, player.y, 0) && turnCount === before,
    'unaware hostile within aggro plus one tile suppresses foraging')
  check(!foragedTiles.has(tileKey), 'unsafe tile is left unsearched')
  enemy.x = player.x + 7
  check(autoForageAfterStep(player.x, player.y, 0) && turnCount === before + 1,
    'distant unaware short-range enemy does not suppress foraging')
  foragedTiles.delete(tileKey)
  enemy.level = -1; enemy.aware = true; enemy.x = player.x + 1; enemy.y = player.y
  check(autoForageAfterStep(player.x, player.y, 0) && turnCount === before + 2,
    'enemy on another Z level does not suppress forest search')
  replayAnimationsDisabled = false
}
