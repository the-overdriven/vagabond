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

// Rule checks run once per elapsed player turn, before freezing and enemies.
// Animation clocks, rendering and monsters never advance lake ice.
function tickLakeIce(playerMovement = null) {
  if (currentZ !== 0 || player.godMode || raceHas('fly')) return
  const {x, y} = player
  const tile = map[y]?.[x]
  if (!isLakeIce(tile)) return
  const cracking = tile === 'crackingice'
  // An instant break takes priority, even on a step beside cracked ice.
  const cfg = WORLD_GEN_CONFIG.environment
  const instantBreak = !cracking && chance(cfg.iceInstantBreakChance)
  const spreads = !cracking && playerMovement && DIRS8.some(([dx, dy]) =>
    map[y + dy]?.[x + dx] === 'crackingice')
  if (!instantBreak && !spreads && !chance(cracking ? cfg.crackingIceBreakChance : cfg.iceCrackChance)) return

  // Leaving cracking ice puts extra stress on the next intact tile. Only this
  // movement gets a same-turn break recheck; random new cracks keep a warning.
  const stepBreak = !instantBreak && spreads && playerMovement.fromTile === 'crackingice' &&
    chance(cfg.crackingIceBreakChance)
  const breaks = cracking || instantBreak || stepBreak
  const changes = [{x, y, next: breaks ? 'water' : 'crackingice'}]
  let collapsed = 0, spread = 0
  if (breaks) for (const [dx, dy] of DIRS8) {
    const nx = x + dx, ny = y + dy, neighbor = map[ny]?.[nx]
    // Snapshot just the original eight neighbors. Newly cracked tiles survive
    // this turn, and collapsed neighbors never propagate a second collapse.
    if (neighbor === 'crackingice') {
      changes.push({x: nx, y: ny, next: 'water'})
      collapsed++
    } else if (instantBreak && neighbor === 'ice') {
      changes.push({x: nx, y: ny, next: 'crackingice'})
      spread++
    }
  }

  for (const change of changes) {
    map[change.y][change.x] = change.next
    surfaceMap[change.y][change.x] = change.next
    // Keep cold metadata and wash tracks away on every collapsed tile.
    const key = keyXY(change.x, change.y)
    tileUnderlays[key] = 'snow'
    if (change.next === 'water') beastTracks.delete(key)
  }
  clearAutoPath()
  ensureMiniBases()
  for (const change of changes) for (const scale of MINI_SCALES)
    paintMiniTile(miniBases[scale], change.x, change.y)
  mapPreviewBase = null
  minimapDirty = true

  log(breaks ? 'The ice breaks beneath you! You fall into freezing water.'
    : 'The ice cracks beneath your feet! It may give way if you stay.', 'bad')
  if (collapsed) log('The nearby cracked ice also collapses into freezing water.', 'bad')
  if (spread) log('Cracks spread across the nearby ice.', 'bad')
  if (!replayAnimationsDisabled && !replaySimulationMode) {
    spawnDamageNumber(x, y, breaks ? 'Ice breaks!' : 'Ice cracking!',
      breaks ? '#70cce8' : '#ffe2a8', 0, 1000)
  }
  // This is forced entry, not a swimming movement: no practice, but a
  // non-swimmer immediately takes normal drowning damage and can swim out.
  if (breaks) advanceSwimming(false)
}
