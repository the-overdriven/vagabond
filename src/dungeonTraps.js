'use strict'

// Mechanisms are generated once and saved with their existing deep-level maps.
// Entry events resolve synchronously; projectile animations only show the result.
const DungeonTraps = (() => {
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]]
  const configForLevel = level => dungeonPackageConfig(level?.dungeonPackage)?.traps || null
  const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
  const activeLevel = () => currentLevelKind() === 'chain' && currentZ < 0
    ? deepLevels[chainDepthForZ(currentZ) - 2] : null
  const isTrigger = tile => Object.values(WORLD_GEN_CONFIG.dungeons || {}).some(pkg => {
    const tiles = pkg?.traps?.tileKeys
    return tile === tiles?.spikes || tile === tiles?.pressurePlate
  })

  function safeSpawn(x, y, z, levelKind = 'chain') {
    if (levelKind !== 'chain' || z >= 0) return true
    const level = deepLevels[chainDepthForZ(z) - 2]
    const cfg = configForLevel(level)
    if (!cfg) return true
    return !(level?.traps || []).some(trap =>
      distance({x, y}, trap.trigger) <= cfg.spawnClearance ||
      (trap.emitter && distance({x, y}, trap.emitter) <= cfg.spawnClearance))
  }

  // Generation checks routes with all doors unlocked, while treating every
  // trigger as avoidable terrain. Keys themselves remain on their original side.
  function safeReachable(terrain, start, blocked) {
    const seen = new Set([keyXY(start.x, start.y)]), queue = [start]
    for (let i = 0; i < queue.length; i++) for (const [dx, dy] of directions) {
      const x = queue[i].x + dx, y = queue[i].y + dy, tile = terrain[y]?.[x], key = keyXY(x, y)
      if (seen.has(key) || blocked.has(key)) continue
      if (!TILE[tile]?.walk && !isClosedDungeonDoorTile(tile) && !isLockedDungeonDoorTile(tile)) continue
      seen.add(key); queue.push({x, y})
    }
    return seen
  }

  function generate() {
    for (let i = 0; i < deepLevels.length; i++) {
      const level = deepLevels[i]
      const cfg = configForLevel(level)
      if (!cfg?.tileKeys) continue
      level.traps = []
      const terrain = level.map, z = chainZForDepth(i + 2)
      const entrances = level.caves[0].entrances
      const rooms = level._encounterRooms || []
      const inRoom = (x, y) => rooms.some(r =>
        x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)
      const ground = groundItems.filter(g => g.level === z)
      const keyGround = ground.filter(g => g.kind === 'dwarvenkey')
      const keyRemains = ground.filter(g => g.dungeonKey?.kind === 'dwarvenkey')
      const required = [...entrances, ...keyGround, ...keyRemains]
      for (const shortcut of dungeonShortcutsForPackage(level.dungeonPackage)) for (const p of [shortcut.upper, shortcut.lower]) {
        if (p?.z === z) required.push(p)
      }
      const trapBiasedVaults = (level.vaults || []).filter(v => v.trapBias && v.entrance)
      const progressionGuard = level.progressionKey?.mode === 'trapGuardedSideRoom'
        ? level.progressionKey.guardPoint || null : null
      const trapGuardRadius = dungeonPackageConfig(level.dungeonPackage)?.progressionKeys?.trapGuardRadius ?? 4
      const blocked = new Set(), candidates = []
      for (let y = 2; y < MAP_H - 2; y++) for (let x = 2; x < MAP_W - 2; x++) {
        if (terrain[y][x] !== 'marble' || inRoom(x, y) ||
            required.some(p => distance(p, {x,y}) <= cfg.entranceClearance)) continue
        const nearDoor = directions.some(([dx,dy]) => isClosedDungeonDoorTile(terrain[y+dy]?.[x+dx]) || isLockedDungeonDoorTile(terrain[y+dy]?.[x+dx]))
        const walls = directions.filter(([dx,dy]) => terrain[y+dy]?.[x+dx] === 'dwarvenwall')
        if (nearDoor || walls.length) {
          const preferredVault = trapBiasedVaults.find(v => distance(v.entrance, {x,y}) <= 4) || null
          const progressionPreferred = !!progressionGuard && distance(progressionGuard, {x,y}) <= trapGuardRadius
          candidates.push({x, y, walls,
            preferred: progressionPreferred || !!preferredVault,
            progressionPreferred,
            allowedTypes: preferredVault?.trapTypes || []})
        }
      }
      // One seeded shuffle, then bounded attempts; never reroll at runtime.
      for (let n = candidates.length - 1; n > 0; n--) {
        const j = randInt(0, n); [candidates[n], candidates[j]] = [candidates[j], candidates[n]]
      }
      candidates.sort((a, b) => Number(b.progressionPreferred) - Number(a.progressionPreferred) ||
        Number(b.preferred) - Number(a.preferred))
      const count = randInt(cfg.countRange[0], cfg.countRange[1])
      for (const candidate of candidates) {
        if (level.traps.length >= count) break
        const allowedTypes = Array.isArray(candidate.allowedTypes) && candidate.allowedTypes.length
          ? candidate.allowedTypes : ['spikes','projectile']
        const type = allowedTypes[level.traps.length % allowedTypes.length]
        let trigger = {x:candidate.x, y:candidate.y}, emitter = null, direction = null
        if (type === 'projectile') {
          const wall = candidate.walls.find(([dx,dy]) =>
            [1,2].every(n => terrain[candidate.y-dy*n]?.[candidate.x-dx*n] === 'marble'))
          if (!wall) continue
          emitter = {x:candidate.x+wall[0], y:candidate.y+wall[1]}
          direction = {dx:-wall[0], dy:-wall[1]}
          trigger = {x:candidate.x+direction.dx, y:candidate.y+direction.dy}
        }
        if (terrain[trigger.y]?.[trigger.x] !== 'marble' || inRoom(trigger.x, trigger.y) ||
            required.some(p => distance(p, trigger) <= cfg.entranceClearance)) continue
        if (level.traps.some(t => distance(t.trigger, trigger) <= cfg.minimumSeparation)) continue
        if (enemies.some(e => e.level === z && (distance(e, trigger) <= cfg.spawnClearance || (emitter && distance(e, emitter) <= cfg.spawnClearance)))) continue
        const nextBlocked = new Set(blocked).add(keyXY(trigger.x, trigger.y))
        const reachable = safeReachable(terrain, entrances[0], nextBlocked)
        if (required.some(p => !reachable.has(keyXY(p.x, p.y)))) continue
        // Preserve all currently reachable keys with intact locks too.
        const before = dungeonWalkDistances(terrain, entrances[0])
        const after = dungeonWalkDistances(terrain, entrances[0], nextBlocked)
        if (keyGround.some(p => before.has(keyXY(p.x,p.y)) && !after.has(keyXY(p.x,p.y)))) continue
        const trap = {id:`${level.dungeonPackage}-trap:${z}:${level.traps.length}`, type, trigger,
          ...(emitter ? {emitter, direction, range:cfg.projectileRange} : {})}
        level.traps.push(trap); blocked.add(keyXY(trigger.x, trigger.y))
        terrain[trigger.y][trigger.x] = type === 'spikes' ? cfg.tileKeys.spikes : cfg.tileKeys.pressurePlate
        if (emitter) terrain[emitter.y][emitter.x] = cfg.tileKeys.projectileEmitter
      }
      if (progressionGuard && !level.traps.some(trap => distance(trap.trigger, progressionGuard) <= trapGuardRadius)) return false
    }
    return true
  }

  function hit(target, trap) {
    const level = activeLevel()
    const cfg = configForLevel(level), isPlayer = target === player
    if (!cfg) return {damage:0, missed:false}
    if (isPlayer && player.godMode) return {damage:0, missed:false}
    const speed = isPlayer ? playerSpd() : enemySpd(target)
    const missed = trap.type === 'projectile' && chance(Math.min(1,
      missChance(cfg.speed, speed) * RANGED_CONFIG.dodgeMultiplier))
    if (missed) return {damage:0, missed:true}
    const armor = equippedArmor(isPlayer ? player.equip.armor : target.equipment)
    const glancing = !!armor && chance(missChance(cfg.speed, speed))
    let damage = damageRoll(trap.type === 'spikes' ? cfg.spikeAtk : cfg.projectileAtk,
      isPlayer ? playerDef() : enemyDef(target))
    const critical = chance(BASE_CRIT_CHANCE)
    if (glancing) damage = Math.floor(damage / 3)
    else if (critical) damage *= 2
    const wasEnraged = !isPlayer && enemyIsEnraged(target)
    target.hp -= damage
    if (isPlayer) {
      checkPlayerHealthWarning()
      if (target.hp <= 0) die(null, 'dungeon trap')
    } else {
      absorbEnemyFatalHit(target)
      logEnemyEnrageTransition(target, wasEnraged)
      if (target.hp <= 0) killEnemy(target, false)
    }
    return {damage, missed:false, glancing, critical:critical && !glancing}
  }

  function triggerTrap(trap, actor) {
    let target = actor, path = null
    if (trap.type === 'projectile') {
      target = null; path = [{...trap.emitter}]
      for (let step = 1; step <= trap.range; step++) {
        const x = trap.emitter.x + trap.direction.dx * step
        const y = trap.emitter.y + trap.direction.dy * step
        const tile = map[y]?.[x]
        if (!tile || TILE[tile]?.projectileBlock) break
        path.push({x, y})
        if (groundItems.some(g => onCurrentLevel(g) && g.x === x && g.y === y)) break
        target = player.x === x && player.y === y ? player :
          enemies.find(e => e.alive && onCurrentLevel(e) && e.x === x && e.y === y)
        if (target) break
      }
    }
    const at = target ? {x:target.x, y:target.y} : null
    const result = target ? hit(target, trap) : null
    // Nothing below changes gameplay or consumes gameplay RNG.
    if (path && path.length > 1) spawnProjectileAnim(path, 'arrow')
    if (!target) { log('A wall mechanism fires an arrow through the ruins.', 'info'); return }
    spawnDamageNumber(at.x, at.y, result.missed ? 'Miss!' : result.damage,
      target === player ? RENDER_STYLE.damage.playerHit : RENDER_STYLE.damage.enemyHit)
    const who = target === player ? 'You' : target.name
    log(result.missed ? `${who} dodge${target === player ? '' : 's'} the wall arrow.` :
      `${who} take${target === player ? '' : 's'} ${result.damage} damage from ${trap.type === 'spikes' ? 'the spikes' : 'a wall arrow'}${result.glancing ? ' (glancing)' : result.critical ? ' (critical)' : ''}.`,
      target === player ? 'bad' : 'info')
  }

  function onEntry(actor, fromX, fromY) {
    if (actor.x === fromX && actor.y === fromY) return
    if (actor !== player && !actor.alive) return
    const trap = activeLevel()?.traps?.find(t => t.trigger.x === actor.x && t.trigger.y === actor.y)
    if (trap) triggerTrap(trap, actor)
  }

  return {generate, onEntry, safeSpawn, isTrigger, safeReachable}
})()
