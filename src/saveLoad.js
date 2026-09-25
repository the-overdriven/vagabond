'use strict'

/* ============================== SAVE / LOAD ============================== */
const SAVE_VERSION = 13 // v13 preserves enemy levelKind; v11 normalized underground z-depths and distinguished crypt2 from generic z:-2

// Run-length encoding for the save file's map/discovery grids. Every
// such grid (surfaceMap, each cave's full-map-sized caveMaps entry,
// fog-of-war discovered/undergroundDiscovered bitmasks, ...) is MAP_W x
// MAP_H of mostly one repeated character (background cavewall,
// undiscovered '0', ...), so collapsing runs of the same character
// shrinks the save file drastically without touching any of the
// in-memory grid representations - only the encode/decode helpers below
// (and their call sites in buildSaveObject/loadGameFromObject) know
// about it. Each run is written as <char><count> and runs are joined
// with '|', so decoding is unambiguous even if a tile code is itself a
// digit (TILE_CODE's characters are content-defined, not under our control).
function rleEncode(str) {
  const out = []
  let i = 0
  while (i < str.length) {
    const ch = str[i]
    let j = i + 1
    while (j < str.length && str[j] === ch) j++
    out.push(ch + (j - i))
    i = j
  }
  return out.join('|')
}

function rleDecode(str) {
  if (!str) return ''
  let out = ''
  for (const token of str.split('|')) out += token[0].repeat(Number(token.slice(1)))
  return out
}

// Encodes a MAP_H x MAP_W grid of tile names as one RLE string.
function encodeTileGrid(grid, fallbackCode) {
  return rleEncode(grid.map(row => row.map(t => TILE_CODE[t] || fallbackCode).join('')).join(''))
}

// Decodes either the new single-string RLE format or the legacy
// array-of-row-strings format (pre-compression saves) back into a
// MAP_H x MAP_W grid of tile names. Returns null on a dimension
// mismatch so callers can fall back the same way they did before.
function decodeTileGrid(encoded, fallbackTile) {
  if (typeof encoded === 'string') {
    const flat = rleDecode(encoded)
    if (flat.length !== MAP_W * MAP_H) return null
    const rows = []
    for (let y = 0; y < MAP_H; y++) rows.push([...flat.slice(y * MAP_W, (y + 1) * MAP_W)].map(ch => CODE_TILE[ch] || fallbackTile))
    return rows
  }
  if (!Array.isArray(encoded) || encoded.length !== MAP_H) return null
  const rows = []
  for (const rowStr of encoded) {
    const row = []
    for (const ch of rowStr) row.push(CODE_TILE[ch] || fallbackTile)
    if (row.length !== MAP_W) return null
    rows.push(row)
  }
  return rows
}

// Same idea as encodeTileGrid/decodeTileGrid, for the boolean fog-of-war grids.
function encodeBoolGrid(grid) {
  return rleEncode(grid.map(row => row.map(b => b ? '1' : '0').join('')).join(''))
}

function decodeBoolGrid(encoded) {
  if (typeof encoded === 'string') {
    const flat = rleDecode(encoded)
    if (flat.length !== MAP_W * MAP_H) return null
    const rows = []
    for (let y = 0; y < MAP_H; y++) rows.push([...flat.slice(y * MAP_W, (y + 1) * MAP_W)].map(ch => ch === '1'))
    return rows
  }
  if (!Array.isArray(encoded) || encoded.length !== MAP_H) return null
  return encoded.map(rowStr => {
    const row = []
    for (const ch of rowStr) row.push(ch === '1')
    return row
  })
}

function buildSaveObject() {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    worldSeed: WORLD_SEED,
    rngState: rngState,
    mapWidth: MAP_W,
    mapHeight: MAP_H,
    map: encodeTileGrid(surfaceMap, 'g'),
    tileUnderlays: tileUnderlays,
    grasslandTrees: [...grasslandTrees],
    caveMaps: caveMaps.map(cm => encodeTileGrid(cm, '#')),
    caves: caves,
    currentZ: currentZ,
    currentLevelKind: currentLevelKind(),
    currentCave: currentCave,
    discovered: encodeBoolGrid(discovered),
    undergroundDiscovered: encodeBoolGrid(undergroundDiscoveredL1),
    // Generic chain levels (z:-2 and z:-3). An array so adding more
    // levels later never needs another save-format field - just another entry.
    deepLevels: deepLevels.map(lvl => ({
      caveMaps: lvl.caveMaps.map(cm => encodeTileGrid(cm, '#')),
      caves: lvl.caves,
      discovered: encodeBoolGrid(lvl.discovered),
    })),
    cryptLevel2: cryptLevel2 ? {
      map: encodeTileGrid(cryptLevel2.map, '#'),
      discovered: encodeBoolGrid(cryptLevel2.discovered),
      x: cryptLevel2.x, y: cryptLevel2.y, trapSprung: cryptLevel2.trapSprung, trapPos: cryptLevel2.trapPos,
    } : null,
    treasureMapSpot: treasureMapSpot,
    treasureMapUnearthed: treasureMapUnearthed,
    spawnPoint: {x: spawnPoint.x, y: spawnPoint.y},
    worldEdgesReached: Object.assign({}, worldEdgesReached),
    oldHunterQuest: oldHunterQuest,
    bellReturnedToChapel: bellReturnedToChapel,
    bellRung: bellRung,
    ancientBellLichSpawned: ancientBellLichSpawned,
    villageHuts: villageHuts,
    mausoleumHutPos: mausoleumHutPos,
    mausoleumDiscovered: isMausoleumDiscovered,
    player: {
      x: player.x, y: player.y,
      name: player.name, race: player.race,
      characterId: player.characterId,
      permadeath: player.permadeath,
      lvl: player.lvl, xp: player.xp,
      totalXpEarned: player.totalXpEarned, lastTempleHealXp: player.lastTempleHealXp,
      maxHp: player.maxHp, hp: player.hp,
      baseAtk: player.baseAtk, baseDef: player.baseDef, baseSpd: player.baseSpd, baseMf: player.baseMf,
      gold: player.gold, deaths: player.deaths, steps: player.steps, kills: player.kills,
      invisibleTurns: player.invisibleTurns,
      godMode: player.godMode,
      speedPotionTurns: player.speedPotionTurns,
      berryRegenTurns: player.berryRegenTurns,
      freezing: player.freezing,
      curseDebuffs: player.curseDebuffs,
      equip: player.equip,
      inventory: player.inventory,
    },
    enemies: enemies.filter(e => e.alive).map(e => ({
      name: e.name,
      baseName: e.baseName,
      tier: e.tier,
      level: e.level || 0,
      levelKind: e.levelKind || null,
      caveIndex: e.caveIndex,
      hp: e.hp,
      maxHp: e.maxHp,
      victoryLevel: e.victoryLevel || 0,
      atk: e.atk,
      def: e.def,
      spd: e.spd,
      aggro: enemyAggroRange(e),
      fly: !!e.fly,
      humanoid: !!e.humanoid,
      evades: !!e.evades,
      equipment: e.equipment || null,
      x: e.x,
      y: e.y,
      homeTileType: e.homeTileType || null,
      prefix: e.prefix || null,
      prefixBase: e.prefixBase || null,
      crit: !!e.crit,
      aware: !!e.aware,
      homeX: e.homeX,
      homeY: e.homeY,
      fleeingHoly: !!e.fleeingHoly,
    })),
    groundItems: groundItems.map(g => ({...g})),
    npcs: npcs.map(n => ({name: n.name, x: n.x, y: n.y, homeX: n.homeX, homeY: n.homeY})),
    tombstonesRemaining: tombstonesRemaining,
    tombstoneOrder: tombstoneOrder,
    merchantStock: merchantStock,
    foragedTiles: [...foragedTiles],
    dugSandTiles: [...dugSandTiles],
    gravediggerGraveKey: gravediggerGraveKey,
    cemeteryTombstones: cemeteryTombstones,
    // Preserve recordings across playback; unrecorded characters have no replay.
    replay: replayForSave(),
  }
}

function saveGame() {
  if (replayPlaying) {
    log('Cannot save while watching a replay.', 'info')
    return
  }
  try {
    const data = buildSaveObject()
    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    a.href = url
    a.download = `vagabond-save-${ts}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    log('Game saved to file.', 'good')
  } catch (err) {
    console.error(err)
    log('Failed to save the game.', 'bad')
  }
}

function loadGameFromObject(data, opts = {}) {
  const isReplayInit = !!opts.isReplayInit
  if (!data || typeof data !== 'object' || (!Array.isArray(data.map) && typeof data.map !== 'string')) {
    throw new Error('That does not look like a Vagabond save file.')
  }
  // A load (manual, or the internal rewind-to-start a replay performs)
  // always supersedes whatever playback might currently be running.
  stopReplayPlayback()
  if (!isReplayInit && !opts.isReplayRestore) {
    preReplaySnapshot = null
    preReplayCounters = null
  }

  // Older saves predate dimension metadata; their worlds share the current
  // width, while the encoded map length determines their original height.
  const savedWidth = data.mapWidth ?? (Array.isArray(data.map) ? data.map[0]?.length : MAP_W)
  const savedHeight = data.mapHeight ?? (Array.isArray(data.map)
    ? data.map.length
    : rleDecode(data.map).length / savedWidth)
  if (!Number.isInteger(savedWidth) || !Number.isInteger(savedHeight) ||
      savedWidth <= 0 || savedHeight <= 0) {
    throw new Error('Save file map dimensions do not match.')
  }
  const configuredWidth = MAP_W, configuredHeight = MAP_H
  MAP_W = savedWidth
  MAP_H = savedHeight
  const decoded = decodeTileGrid(data.map, 'grass')
  if (!decoded) {
    MAP_W = configuredWidth
    MAP_H = configuredHeight
  }
  if (!decoded) throw new Error('Save file map dimensions do not match.')
  surfaceMap = decoded
  dwarvenRuin = null
  for (let y = 0; y < MAP_H && !dwarvenRuin; y++) for (let x = 0; x < MAP_W; x++) {
    if (surfaceMap[y][x] === 'dwarvengate') {
      dwarvenRuin = {x, y, caveIndex: -1}
      break
    }
  }
  tileUnderlays = (data.tileUnderlays && typeof data.tileUnderlays === 'object')
    ? Object.assign({}, data.tileUnderlays) : {}
  grasslandTrees = new Set(Array.isArray(data.grasslandTrees) ? data.grasslandTrees : [])
  // Saves from before v8 did not record the transparent tile's base terrain.
  // Taiga is always generated from snow; old graves get a nearby hill/terrain
  // fallback so they do not render as a solid black square.
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tileKey = surfaceMap[y][x]
      const k = keyXY(x, y)
      if (tileKey === 'taiga' && !tileUnderlays[k]) tileUnderlays[k] = 'snow'
      if (tileKey === 'grave' && !tileUnderlays[k]) {
        let fallback = null
        for (const [dx, dy] of DIRS8) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue
          const neighbor = surfaceMap[ny][nx]
          if (neighbor === 'hill') {
            fallback = 'hill'
            break
          }
          if (!fallback && TILE[neighbor] && TILE[neighbor].walk) fallback = neighbor
        }
        tileUnderlays[k] = fallback || 'grass'
      }
    }
  }
  caves = Array.isArray(data.caves) ? data.caves : []
  caves = caves.map(c => ({
    ...c,
    entrances: Array.isArray(c.entrances) && c.entrances.length
      ? c.entrances
      : [{x: c.x, y: c.y}],
  }))
  cryptCaveIndex = caves.findIndex(c => c.crypt)
  if (cryptCaveIndex >= 0) {
    const cryptEntrance = caves[cryptCaveIndex].entrances[0]
    if (surfaceMap[cryptEntrance.y]?.[cryptEntrance.x]) surfaceMap[cryptEntrance.y][cryptEntrance.x] = 'ruinedchapel'
  }
  // The surface gate still has a z:-1 link cave, but the fort itself lives
  // on chain depth 3 (z:-3). Its real caveIndex is restored after deepLevels
  // have been decoded below.
  if (dwarvenRuin) {
    dwarvenRuin.caveIndex = -1
    dwarvenRuin.level = -3
  }
  caveMaps = (data.caveMaps || []).map(cm => decodeTileGrid(cm, 'cavewall') || blankCaveMap())
  if (cryptCaveIndex >= 0 && caveMaps[cryptCaveIndex]) {
    const crypt = caves[cryptCaveIndex]
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const key = keyXY(x, y), tile = caveMaps[cryptCaveIndex][y][x]
      if (tile === 'grave') caveMaps[cryptCaveIndex][y][x] = 'coffin'
      else if (tile === 'cavefloor') caveMaps[cryptCaveIndex][y][x] = 'cryptfloor'
    }
    // Re-stamp all declared crypt burial positions from the current world
    // descriptor so the merged map always matches the generated layout.
    const cryptInscriptions = {}
    for (let i = 0; i < (crypt.graves || []).length; i++) {
      const key = crypt.graves[i], [x, y] = key.split(',').map(Number)
      if (caveMaps[cryptCaveIndex][y]?.[x] !== undefined) caveMaps[cryptCaveIndex][y][x] = 'coffin'
      if (i < CRYPT_INSCRIPTIONS.length) cryptInscriptions[key] = CRYPT_INSCRIPTIONS[i]
      else if (i === CRYPT_INSCRIPTIONS.length) cryptInscriptions[key] = 'Stone coffin. It\'s empty.'
      else cryptInscriptions[key] = 'Stone coffin. The slab is heavy.'
    }
    crypt.inscriptions = cryptInscriptions
  }
  for (let i = 0; i < caveMaps.length; i++) {
    const entrances = caves[i] && caves[i].entrances ? caves[i].entrances : []
    for (const entrance of entrances) {
      if (caveMaps[i][entrance.y] && caveMaps[i][entrance.y][entrance.x] !== undefined) {
        caveMaps[i][entrance.y][entrance.x] = surfaceMap[entrance.y]?.[entrance.x] === 'dwarvengate' ? 'dwarvengate' : 'caveentrance'
      }
    }
  }
  undergroundMap = blankCaveMap()
  for (const cm of caveMaps) {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (cm[y][x] !== 'cavewall') undergroundMap[y][x] = cm[y][x]
    }
  }
  // Crypt burial positions are authoritative descriptor data. Re-stamp
  // them after merging so the final map matches the crypt layout.
  if (cryptCaveIndex >= 0) {
    for (const key of caves[cryptCaveIndex].graves || []) {
      const [x, y] = key.split(',').map(Number)
      if (undergroundMap[y]?.[x] !== undefined) undergroundMap[y][x] = 'coffin'
    }
  }
  // See generateCaves(): overlapping cave floors can clobber a
  // neighboring cave's entrance tile during the merge above, so re-stamp
  // every declared entrance last.
  for (const cave of caves) {
    for (const entrance of cave.entrances || []) {
      if (undergroundMap[entrance.y] && undergroundMap[entrance.y][entrance.x] !== undefined) {
        undergroundMap[entrance.y][entrance.x] = surfaceMap[entrance.y]?.[entrance.x] === 'dwarvengate' ? 'dwarvengate' : 'caveentrance'
      }
    }
  }
  // Re-stamp declared entrances after decoding, including old saves whose
  // fort exit was encoded as a generic caveup tile.
  deepLevels = (Array.isArray(data.deepLevels) ? data.deepLevels : []).map((lvlData, levelIndex) => {
    const entranceTile = (x, y) => levelIndex === 1 && dwarvenRuin &&
      x === dwarvenRuin.x && y === dwarvenRuin.y ? 'dwarvenfortexit' : 'caveup'
    const lvlCaveMaps = (lvlData.caveMaps || []).map(cm => decodeTileGrid(cm, 'cavewall') || blankCaveMap())
    let lvlCaves = Array.isArray(lvlData.caves) ? lvlData.caves : []
    lvlCaves = lvlCaves.map(c => ({
      ...c,
      entrances: Array.isArray(c.entrances) && c.entrances.length ? c.entrances : [{x: c.x, y: c.y}],
    }))
    for (let i = 0; i < lvlCaveMaps.length; i++) {
      const entrances = lvlCaves[i] ? lvlCaves[i].entrances : []
      for (const entrance of entrances) {
        if (lvlCaveMaps[i][entrance.y] && lvlCaveMaps[i][entrance.y][entrance.x] !== undefined) {
          lvlCaveMaps[i][entrance.y][entrance.x] = entranceTile(entrance.x, entrance.y)
        }
      }
    }
    const lvlMap = blankCaveMap()
    for (const cm of lvlCaveMaps) {
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        if (cm[y][x] !== 'cavewall') lvlMap[y][x] = cm[y][x]
      }
    }
    for (const cave of lvlCaves) {
      for (const entrance of cave.entrances || []) {
        if (lvlMap[entrance.y] && lvlMap[entrance.y][entrance.x] !== undefined) lvlMap[entrance.y][entrance.x] = entranceTile(entrance.x, entrance.y)
      }
    }
    const lvlDiscovered = decodeBoolGrid(lvlData.discovered) || Array.from({length: MAP_H}, () => new Array(MAP_W).fill(false))
    return {map: lvlMap, caveMaps: lvlCaveMaps, caves: lvlCaves, discovered: lvlDiscovered}
  })

  if (dwarvenRuin && deepLevels[1]) {
    const fortCaveIndex = deepLevels[1].caves.findIndex(c =>
      (c.entrances || []).some(e => e.x === dwarvenRuin.x && e.y === dwarvenRuin.y)
    )
    dwarvenRuin.caveIndex = fortCaveIndex
    dwarvenRuin.level = -3
  }

  cryptLevel2 = null
  if (data.cryptLevel2) {
    const lvlMap = decodeTileGrid(data.cryptLevel2.map, 'cavewall')
    if (lvlMap) {
      const lvlDiscovered = decodeBoolGrid(data.cryptLevel2.discovered) || Array.from({length: MAP_H}, () => new Array(MAP_W).fill(false))
      cryptLevel2 = {
        map: lvlMap, discovered: lvlDiscovered,
        x: data.cryptLevel2.x, y: data.cryptLevel2.y,
        trapSprung: !!data.cryptLevel2.trapSprung, trapPos: data.cryptLevel2.trapPos || null,
      }
    }
  }
  treasureMapSpot = (data.treasureMapSpot && Number.isFinite(data.treasureMapSpot.x)) ? data.treasureMapSpot : null
  treasureMapUnearthed = !!data.treasureMapUnearthed
  const decodedDiscovered = decodeBoolGrid(data.discovered)
  if (decodedDiscovered) {
    discovered = decodedDiscovered
  } else {
    // older save from before fog-of-war existed - start fresh, the player's
    // current surroundings get marked seen automatically by the render() below
    initDiscovered()
  }
  undergroundDiscoveredL1 = decodeBoolGrid(data.undergroundDiscovered) || Array.from({length: MAP_H}, () => new Array(MAP_W).fill(false))

  // Resolve currentZ/map/currentCave for whatever z the save was on.
  // New saves also record currentLevelKind because z:-2 is shared by the
  // generic deep cave map and the crypt's dedicated second map. Older saves
  // used z:-2 exclusively for crypt2, so they retain that interpretation.
  let savedZ = typeof data.currentZ === 'number' ? data.currentZ : 0
  const savedKind = typeof data.currentLevelKind === 'string' ? data.currentLevelKind : null
  // Migrate the old generic chain numbering: z:-3 -> z:-2, z:-4 -> z:-3.
  if (!savedKind && savedZ === -3) savedZ = -2
  else if (!savedKind && savedZ === -4) savedZ = -3
  const savedChainDepth = CHAIN_DEPTH_BY_Z[savedZ]
  const savedChainMap = savedChainDepth ? depthUndergroundMap(savedChainDepth) : null
  const loadCrypt2 = savedKind === 'crypt2' || (!savedKind && data.currentZ === -2)
  if (loadCrypt2 && cryptLevel2) {
    currentZ = -2
    map = cryptLevel2.map
    currentCave = -1
    undergroundDiscovered = cryptLevel2.discovered
  } else if (savedChainDepth && savedChainMap) {
    currentZ = savedZ
    map = savedChainMap
    currentCave = savedChainDepth === 1 ? data.currentCave : -1
    undergroundDiscovered = depthUndergroundDiscovered(savedChainDepth)
  } else {
    currentZ = 0
    map = surfaceMap
    currentCave = -1
    undergroundDiscovered = undergroundDiscoveredL1
  }
  // Foraged forest tiles affect minimap colors, so restore them before
  // rebuilding the cached minimap bases.
  foragedTiles = new Set(Array.isArray(data.foragedTiles) ? data.foragedTiles : [])
  rebuildMinimapBases()

  spawnPoint = {x: data.spawnPoint.x, y: data.spawnPoint.y}
  rngState = data.rngState | 0
  if (Number.isInteger(data.worldSeed)) WORLD_SEED = data.worldSeed
  Object.assign(worldEdgesReached, data.worldEdgesReached || {})
  oldHunterQuest = data.oldHunterQuest || null
  hunterEnsureIds()
  // Recover-item quests can survive older saves where enemy IDs were not persisted.
  // Repair legacy specific-kill quests whose target ID was lost or changed.
  if (oldHunterQuest?.type === 'kill_specific' && oldHunterQuest.state === 'active') {
    const byId = enemies.find(e => e.alive && e.id === oldHunterQuest.targetEnemyId)
    const named = enemies.filter(e => e.alive && (e.name === oldHunterQuest.targetName || e.baseName === oldHunterQuest.targetName))
    if (byId) {
      oldHunterQuest.targetEnemyId = byId.id
    } else if (named.length === 1) {
      oldHunterQuest.targetEnemyId = named[0].id
    } else if (named.length === 0) {
      // All enemies are persisted in saves; no living target means it was killed.
      oldHunterQuest.progress = 1
      oldHunterQuest.state = 'ready'
    }
  }
  if (oldHunterQuest?.type === 'recover_item' && oldHunterQuest.state === 'active') {
    const carried = player.inventory?.some(i => i && (i.name === oldHunterQuest.targetItemName || i.base === oldHunterQuest.targetItemName))
    if (carried) {
      oldHunterQuest.progress = 1
      oldHunterQuest.state = 'ready'
    } else {
      const match = enemies.find(e => e.alive && e.baseName === oldHunterQuest.targetName && e.equipment && (e.equipment.name === oldHunterQuest.targetItemName || e.equipment.base === oldHunterQuest.targetItemName))
      if (match) oldHunterQuest.targetEnemyId = match.id
    }
  }
  if (oldHunterQuest && ['kill_specific', 'recover_item'].includes(oldHunterQuest.type)) hunterTargetEnemy(oldHunterQuest)
  if (oldHunterQuest) oldHunterQuestSerial = Math.max(oldHunterQuestSerial, parseInt(String(oldHunterQuest.id).split('_')[1]) || 0)

  // villageCenter isn't stored explicitly - it's just wherever 'village'
  // tiles ended up in the restored map.
  villageCenter = null
  outer:
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (map[y][x] === 'village') {
          villageCenter = {x, y}
          break outer
        }
      }
    }

  // bigBellPos likewise isn't stored explicitly - recover it from the
  // restored map so the Drunk's rumor line still points the right way.
  bigBellPos = null
  outer2:
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (map[y][x] === 'bigbell') {
          bigBellPos = {x, y}
          break outer2
        }
      }
    }

  Object.assign(player, data.player)
  player.characterId = typeof data.player.characterId === 'string' ? data.player.characterId : null
  player.totalXpEarned = Number.isFinite(data.player.totalXpEarned) ? data.player.totalXpEarned : 0
  player.lastTempleHealXp = Number.isFinite(data.player.lastTempleHealXp) ? data.player.lastTempleHealXp : player.totalXpEarned
  bellReturnedToChapel = !!data.bellReturnedToChapel
  bellRung = !!data.bellRung
  ancientBellLichSpawned = !!data.ancientBellLichSpawned
  isMausoleumDiscovered = !!(data.mausoleumDiscovered ?? data.isMausoleumDiscovered)
  mausoleumHutPos = data.mausoleumHutPos && Number.isFinite(data.mausoleumHutPos.x) && Number.isFinite(data.mausoleumHutPos.y)
    ? {x: data.mausoleumHutPos.x, y: data.mausoleumHutPos.y}
    : null
  // Tombstone metadata must be restored before hut reconciliation so the
  // anomalous dwarven name can identify the matching hut.
  cemeteryTombstones = (data.cemeteryTombstones && typeof data.cemeteryTombstones === 'object') ? data.cemeteryTombstones : {}
  villageHuts = Array.isArray(data.villageHuts) ? data.villageHuts : villageHuts
  reconcileVillageHuts()
  syncMausoleumHutToOddTombstone()
  // The mausoleum is generated as part of the world. Rebuild its deterministic
  // structure while reconstructing undergroundMap from the saved cave layers;
  // entering it never creates terrain or loot.
  mausoleumMap = null
  initializeMausoleum()
  // Reconcile progression for saves made before the explicit quest fields
  // existed, or saves where only one side of the event was serialized.
  if (!bellRung && Array.isArray(data.npcs) && data.npcs.some(n => n.name === 'Ancient Lich')) bellRung = true
  if (bellRung) bellReturnedToChapel = true
  // pre-v7 saves have no race/name - those characters were all plain humans
  if (!RACES.some(r => r.id === player.race)) player.race = DEFAULT_RACE
  if (typeof player.name !== 'string' || !player.name.trim()) player.name = 'Vagabond'
  if (!isReplayInit) Graveyard.reconcileDeathCount(player, WORLD_SEED)
  player.equip = (data.player && data.player.equip) || {weapon: null, shield: null, armor: null}
  player.inventory = (data.player && data.player.inventory) || []
  // Migrate saves from the earlier Black Key implementation, which
  // removed the key from inventory when it was equipped.
  player.equip.blackkey = player.equip.blackkey || null
  if (player.equip.blackkey && !player.inventory.some(i => i.kind === 'blackkey')) {
    player.inventory.push({kind: 'blackkey', name: 'Black Key'})
  }
  player.invisibleTurns = Number.isFinite(player.invisibleTurns) ? Math.max(0, player.invisibleTurns | 0) : 0
  player.godMode = !!player.godMode
  player.speedPotionTurns = Number.isFinite(player.speedPotionTurns) ? Math.max(0, player.speedPotionTurns | 0) : 0
  player.berryRegenTurns = Number.isFinite(player.berryRegenTurns) ? Math.max(0, player.berryRegenTurns | 0) : 0
  player.curseDebuffs = Array.isArray(player.curseDebuffs) ? player.curseDebuffs : []
  player.permadeath = !!player.permadeath
  tombstonesRemaining = Number.isFinite(data.tombstonesRemaining) ? Math.max(0, data.tombstonesRemaining | 0) : TOMBSTONE_INSCRIPTIONS.length
  tombstoneOrder = (Array.isArray(data.tombstoneOrder) && data.tombstoneOrder.length === TOMBSTONE_INSCRIPTIONS.length) ? data.tombstoneOrder.slice() : TOMBSTONE_INSCRIPTIONS.map((_, i) => i)
  merchantStock = Array.isArray(data.merchantStock) ? data.merchantStock : []
  // Replay's initialState is a snapshot of an already-current-version live
  // game - it never needs backfilling, and doing so here would call rng()
  // outside the recorded action stream (replayPlaying/replayRecording are
  // still false at this point), silently diverging merchant stock from
  // what the recorded buy/sell actions expect. Only genuine save-file
  // loads (pre-this-field saves) need this.
  if (!isReplayInit) ensureMerchantStock()
  dugSandTiles = new Set(Array.isArray(data.dugSandTiles) ? data.dugSandTiles : [])

  enemies = (data.enemies || []).map(e => {
    const tmpl = enemyTemplateForSavedEnemy(e)
    let level = e.level || 0
    let levelKind = e.levelKind || null
    // v13+ saves preserve levelKind directly. v11/v12 already use the new
    // z:-1/-2/-3 chain numbering but accidentally omitted enemy.levelKind,
    // so never remap their z values. For z:-2, distinguish the dedicated
    // crypt map by its saved home tile. Only pre-v11 saves need the old
    // z:-3 -> -2 and z:-4 -> -3 migration.
    if (!levelKind) {
      if ((data.version || 0) >= 11) {
        levelKind = (level === -2 && e.homeTileType === 'crypt2floor') ? 'crypt2' : (level < 0 ? 'chain' : null)
      } else if (level === -3) {
        level = -2
        levelKind = 'chain'
      } else if (level === -4) {
        level = -3
        levelKind = 'chain'
      } else if (level === -2) {
        levelKind = 'crypt2'
      } else if (level < 0) {
        levelKind = 'chain'
      }
    }
    return ({
      name: e.name, baseName: e.baseName, tier: e.tier, level, levelKind, caveIndex: e.caveIndex,
      hp: e.hp, maxHp: e.maxHp, victoryLevel: e.victoryLevel || 0, atk: e.atk, def: e.def, spd: e.spd,
      aggro: typeof e.aggro === 'number' ? e.aggro : AGGRO_RANGE,
      fly: typeof e.fly === 'boolean' ? e.fly : !!(tmpl && tmpl.fly),
      humanoid: typeof e.humanoid === 'boolean' ? e.humanoid : !!(tmpl && tmpl.humanoid),
      evades: typeof e.evades === 'boolean' ? e.evades : !!(tmpl && tmpl.evades),
      equipment: e.equipment || null,
      x: e.x, y: e.y, homeTileType: e.homeTileType || null, alive: true,
      prefix: e.prefix || null, prefixBase: e.prefixBase || null, crit: !!e.crit, aware: !!e.aware,
      homeX: e.homeX, homeY: e.homeY, fleeingHoly: !!e.fleeingHoly,
    })
  })
  occupied = new Set()
  for (const e of enemies) occupied.add(keyXY(e.x, e.y))

  if (Array.isArray(data.npcs) && data.npcs.length) {
    npcs = data.npcs.map(n => {
      if (n.name === 'Ancient Lich') return {
        ...ANCIENT_BELL_LICH,
        x: n.x,
        y: n.y,
        homeX: n.homeX ?? n.x,
        homeY: n.homeY ?? n.y
      }
      const tmpl = NPC_TEMPLATES.find(t => t.name === n.name)
      return {
        name: n.name,
        lines: tmpl ? linesForNpcTemplate(tmpl) : ['...'],
        free: tmpl ? !!tmpl.free : false,
        static: tmpl ? !!tmpl.static : false,
        trades: tmpl ? !!tmpl.trades : false,
        services: tmpl ? !!tmpl.services : false,
        portrait: tmpl ? tmpl.portrait : slug(n.name),
        x: n.x,
        y: n.y,
        homeX: n.homeX ?? n.x,
        homeY: n.homeY ?? n.y,
      }
    })
    for (const n of npcs) occupied.add(keyXY(n.x, n.y))
  } else {
    spawnNpcs() // older save from before NPCs existed
  }
  if (treasureMapUnearthed) completeTreasureMapBurial()
  if (bellRung) {
    const lich = npcs.find(n => n.name === 'Ancient Lich')
    if (lich) ancientBellLichSpawned = true
    else {
      // A saved bell event must always have its awakened lich available.
      ancientBellLichSpawned = false
      spawnAncientBellLich()
    }
  }
  // Restore the grave key so ensureGravediggerGrave() recognizes the grave
  // that's already sitting in the restored map instead of placing a new
  // one. Older saves (pre this field) fall back to the map scan inside
  // ensureGravediggerGrave() itself.
  gravediggerGraveKey = typeof data.gravediggerGraveKey === 'string' ? data.gravediggerGraveKey : null
  // Cemetery tombstone names/dates/inscriptions live only in this dict -
  // they cannot be reconstructed from the map's plain 'grave' tiles.
  // Older saves predating this field will show generic grave text for
  // existing tombstones (data genuinely wasn't saved), but going forward
  // this keeps inscriptions intact across save/load.
  cemeteryTombstones = (data.cemeteryTombstones && typeof data.cemeteryTombstones === 'object') ? data.cemeteryTombstones : {}
  ensureGravediggerGrave()

  groundItems = (data.groundItems || []).map(g => {
    const item = {...g}
    if (!item.levelKind && item.level === -3) {
      item.level = -2
      item.levelKind = 'chain'
    } else if (!item.levelKind && item.level === -4) {
      item.level = -3
      item.levelKind = 'chain'
    } else if (!item.levelKind && item.level === -2) item.levelKind = 'crypt2'
    // Same rng()-outside-the-action-stream hazard as ensureMerchantStock
    // above - skip this backfill for replay restores.
    if (!isReplayInit) {
      if (!item.description && item.kind === 'campfire') item.description = pick(CAMPFIRE_INSPECTIONS)
      if (!item.description && item.kind === 'skeleton') item.description = pick(SKELETON_INSPECTIONS)
    }
    return item
  })
  clearGroundItemsUnderMerchant()
  if (dwarvenRuin && dwarvenRuin.caveIndex >= 0 && deepLevels[1]) {
    const fortMap = deepLevels[1].caveMaps[dwarvenRuin.caveIndex]
    // Repair saves made while the fort transition was being changed: locate
    // an unopened chest that is actually on this fort's marble floor, then
    // normalize its level metadata and restore the guaranteed artifact flag.
    let chest = groundItems.find(g =>
      g.kind === 'chest' && !g.opened && g.level === -3 && g.levelKind === 'chain' &&
      g.caveIndex === dwarvenRuin.caveIndex
    )
    if (!chest && fortMap) {
      chest = groundItems.find(g =>
        g.kind === 'chest' && !g.opened && fortMap[g.y]?.[g.x] === 'marble' &&
        (g.level === -3 || g.level === -1)
      )
    }
    if (chest) {
      chest.level = -3
      chest.levelKind = 'chain'
      chest.caveIndex = dwarvenRuin.caveIndex
      chest.artifactGuaranteed = true
    } else {
      const spots = []
      if (fortMap) for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        if (fortMap[y][x] === 'marble') spots.push({x, y})
      }
      if (spots.length) {
        const p = spots[Math.floor(spots.length / 2)]
        groundItems.push({
          x: p.x,
          y: p.y,
          kind: 'chest',
          tier: 5,
          artifactGuaranteed: true,
          opened: false,
          level: -3,
          levelKind: 'chain',
          caveIndex: dwarvenRuin.caveIndex
        })
      }
    }
  }

  // Restore whatever replay recording state this save carries. A save
  // made with "Save replay" off simply has no data.replay, so this
  // correctly clears any replay from whatever was previously loaded.
  if (data.replay && typeof data.replay === 'object' && data.replay.initialState &&
    Array.isArray(data.replay.actions) && Array.isArray(data.replay.rng)) {
    replayData = RNG_DEBUG ? data.replay : {
      version: data.replay.version,
      initialState: data.replay.initialState,
      actions: data.replay.actions,
      rng: data.replay.rng
    }
    replayRecording = true
  } else {
    replayData = null
    replayRecording = false
  }
  replayRngCallers = []
  updateReplayButton()

  toggleInv(false)
  toggleMap(false)
  closeRaceSelect() // a loaded character already has a name and a race

  stopCameraAnimation()
  stopAttackAnimation()
  stopDeathTransition()
  snapCameraToPlayer()
  updateHud()
  render()
  log('Game loaded.', 'good')
}

function loadGame(file) {
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result)
      loadGameFromObject(data)
    } catch (err) {
      console.error(err)
      log('Failed to load save file: ' + err.message, 'bad')
    }
  }
  reader.onerror = () => {
    log('Failed to read the file.', 'bad')
  }
  reader.readAsText(file)
}

document.getElementById('btnSave').addEventListener('click', saveGame)
document.getElementById('btnLoad').addEventListener('click', () => {
  document.getElementById('fileLoad').click()
})
document.getElementById('fileLoad').addEventListener('change', (event) => {
  const file = event.target.files[0]
  if (file) loadGame(file)
  event.target.value = '' // allow re-selecting the same file later
})
document.getElementById('btnRaceLoad').addEventListener('click', () => {
  document.getElementById('fileLoad').click()
})
