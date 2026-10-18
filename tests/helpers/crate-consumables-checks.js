// Shared by the focused rule runner and browser E2E tests.
function crateLootDistributionChecks() {
  const check = (ok, message) => {if (!ok) throw Error(message)}
  const config = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.crates
  const expected = new Map([[null,84], ['potion',6], ['scrollOfInvisibility',4],
    ['stoneSkinPotion',1.8], ['berserkPotion',1.8], ['scrollOfFear',1.2],
    ['scrollOfChaos',0.9], ['scrollOfDeathShield',0.3]])
  const total = config.loot.reduce((sum, entry) => sum + entry.weight, 0)
  check(Math.abs(total - 100) < 1e-9 && config.loot.length === expected.size, '100-point crate table')
  for (const entry of config.loot) check(expected.get(entry.kind) === entry.weight,
    `configured crate chance: ${entry.kind}`)
  const originalRng = rng, originalCrates = deepLevels.map(level => level.crates)
  try {
    let lower = 0
    for (let i = 0; i < config.loot.length; i++) {
      const entry = config.loot[i], upper = lower + entry.weight
      const cases = [[lower + 1e-7, entry.kind], [upper - 1e-7, entry.kind]]
      if (i + 1 < config.loot.length) cases.push([upper + 1e-7, config.loot[i+1].kind])
      for (const [roll, result] of cases) {
        let draws = 0
        rng = () => {draws++; return roll / total}
        initializeDwarvenCrates()
        const crates = deepLevels.filter(level => level.dungeonPackage === 'dwarvenRuins').flatMap(level => level.crates)
        check(crates.length > 0 && crates.every(crate => crate.lootKind === result),
          `crate generation honors table boundary ${roll}: ${result}`)
        check(draws === crates.length, 'one seeded draw per crate, including empty outcomes')
      }
      lower = upper
    }
  } finally {
    rng = originalRng
    deepLevels.forEach((level, index) => {level.crates = originalCrates[index]})
  }
}

async function crateConsumablesPersistenceChecks() {
  const check = (ok, message) => {if (!ok) throw Error(message)}
  const clone = value => JSON.parse(JSON.stringify(value))
  const start = clone(buildSaveObject())
  const restore = save => {
    loadGameFromObject(clone(save), {isReplayInit:true})
    replayPlaying = false; replayRecording = false; replaySimulationMode = false
    replayAnimationsDisabled = true; raceOpen = false; deathTransition = null
  }
  for (const kind of TACTICAL_CONSUMABLE_KINDS) {
    restore(start)
    player.inventory = []; player.baseAtk = 100
    deepLevels[2].crates[0].lootKind = kind
    deepLevels[2].crates[0].hp = 1
    const intact = clone(buildSaveObject())
    restore(intact)
    check(deepLevels[2].crates[0].lootKind === kind, `${kind}: pre-rolled intact contents restore`)
    startReplayRecording()
    await tryMove(1,0)
    check(map[100][101] === 'dwarvencratepieces', `${kind}: crate destroyed`)
    check(groundItems.filter(g => g.x === 101 && g.y === 100 && g.kind === kind).length === 1,
      `${kind}: exactly one drop`)
    const dropped = clone(buildSaveObject()), savedRng = rngState|0
    restore(dropped)
    check((rngState|0) === savedRng, `${kind}: save restores RNG without rerolling loot`)
    // Continue the recording stored with this save, rather than record a new start.
    replayRecording = true
    check(groundItems.filter(g => g.x === 101 && g.y === 100 && g.kind === kind).length === 1,
      `${kind}: uncollected drop survives save/load`)
    await tryMove(1,0)
    check(player.x === 101 && !groundItems.some(g => g.x === 101 && g.y === 100), `${kind}: normal pickup`)
    check(player.inventory.find(item => item.kind === kind)?.count === 1, `${kind}: one item in inventory`)
    const recording = clone(replayData)
    const state = () => JSON.stringify({x:player.x,y:player.y,turn:turnCount,
      tile:map[100][101],drops:groundItems.filter(g => g.x === 101 && g.y === 100),
      count:player.inventory.find(item => item.kind === kind)?.count})
    const expectedState = state()
    restore(recording.initialState)
    activeReplay = recording; replayPlaying = true; replayRngIndex = 0; replaySimulationMode = true
    try {
      for (const action of recording.actions) await runReplayAction(action)
      check(state() === expectedState, `${kind}: identical break/pickup replay state`)
      // Tape playback consumes recorded draws rather than advancing rngState.
      check(replayRngIndex === recording.rng.length, `${kind}: identical replay RNG consumption`)
    } finally {replayPlaying = false; replayRecording = false; replaySimulationMode = false; activeReplay = null}
    const pickedUp = clone(buildSaveObject())
    restore(pickedUp)
    check(player.inventory.find(item => item.kind === kind)?.count === 1 &&
      !deepLevels[2].crates.some(crate => crate.x === 101 && crate.y === 100) &&
      !groundItems.some(g => g.x === 101 && g.y === 100), `${kind}: picked-up drop cannot respawn`)
  }
}

// Cypress bundles this dependency with the spec; evaluate each exported check
// inside the game window so its gameplay globals resolve in the app context.
// The focused VM runner also reads this source without a CommonJS module.
if (typeof module !== 'undefined') module.exports = {
  crateLootDistributionChecks,
  crateConsumablesPersistenceChecks
}
