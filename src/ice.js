'use strict'

function isLakeIce(tile) {
  return tile === 'ice' || tile === 'crackingice'
}

// The snow pass marks cold deep water before mandatory routes are validated.
// Freeze it only afterwards, so required locations never depend on fragile ice.
function freezeSurfaceLakes() {
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (map[y][x] !== 'water' || tileUnderlays[keyXY(x, y)] !== 'snow') continue
    map[y][x] = 'ice'
    surfaceMap[y][x] = 'ice'
  }
}

// One rule roll per elapsed player turn, before freezing and enemy actions.
// Animation clocks, rendering and monsters never advance lake ice.
function tickLakeIce() {
  if (currentZ !== 0 || player.godMode || raceHas('fly')) return
  const {x, y} = player
  const tile = map[y]?.[x]
  if (!isLakeIce(tile)) return
  const cracking = tile === 'crackingice'
  const cfg = WORLD_GEN_CONFIG.environment
  if (!chance(cracking ? cfg.crackingIceBreakChance : cfg.iceCrackChance)) return

  const next = cracking ? 'water' : 'crackingice'
  map[y][x] = next
  surfaceMap[y][x] = next
  // Keep the cold marker after breaking, including across rotation/save/replay.
  tileUnderlays[keyXY(x, y)] = 'snow'
  clearAutoPath()
  ensureMiniBases()
  for (const scale of MINI_SCALES) paintMiniTile(miniBases[scale], x, y)
  mapPreviewBase = null
  minimapDirty = true

  log(cracking ? 'The ice breaks beneath you! You fall into freezing water.'
    : 'The ice cracks beneath your feet! It may give way if you stay.', 'bad')
  if (!replayAnimationsDisabled && !replaySimulationMode) {
    spawnDamageNumber(x, y, cracking ? 'Ice breaks!' : 'Ice cracking!',
      cracking ? '#70cce8' : '#ffe2a8', 0, 1000)
  }
  // This is forced entry, not a swimming movement: no practice, but a
  // non-swimmer immediately takes normal drowning damage and can swim out.
  if (cracking) {
    beastTracks.delete(keyXY(x, y))
    advanceSwimming(false)
  }
}
