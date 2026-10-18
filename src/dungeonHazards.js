'use strict'

// State changes are bound to consumed actions, never frame callbacks.
// Optional hazards have a dedicated seed/z derived placement roll, so adding
// visual effects cannot perturb other dungeon-generation RNG streams.
const DungeonHazards = (() => {
  const around = [[1,0],[-1,0],[0,1],[0,-1]]
  const encode = p => keyXY(p.x,p.y)
  const levelAt = z => z <= -4 && currentLevelKind() === 'chain'
    ? deepLevels[chainDepthForZ(z)-2] : null
  const activeLevel = () => levelAt(currentZ)
  const config = () => WORLD_GEN_CONFIG.dungeons?.dwarvenRuins?.timedHazards
  const crusherConfig = () => config()?.crusher || {}
  const contains = (points,x,y) => (points || []).some(p => p.x === x && p.y === y)

  function hash(z, salt, x=0, y=0) {
    let h = (WORLD_SEED >>> 0) ^ Math.imul(z, 0x9e3779b1) ^ salt
    h = Math.imul(h ^ (h >>> 16) ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263), 0x85ebca6b)
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
    return (h ^ (h >>> 16)) >>> 0
  }

  function generate() {
    const cfg = config()
    if (!cfg) return
    for (let depth = 4; depth <= deepLevels.length + 1; depth++) {
      const level = deepLevels[depth-2], z = chainZForDepth(depth)
      if (level?.dungeonPackage !== 'dwarvenRuins') continue
      level.hazards = []
      if (z > cfg.minimumZ) continue
      // Reserve the poison-gas roll for Batch E instead of inadvertently
      // inflating Crusher frequency while that feature is unfinished.
      const roll = hash(z, 0x48a9b35f) / 0x100000000
      if (roll >= cfg.crusherFloorWeight) continue
      const banned = new Set((level.caves?.[0]?.entrances || []).map(encode))
      for (const trap of level.traps || []) banned.add(encode(trap.trigger))
      for (const p of groundItems) if (p.level === z) banned.add(encode(p))
      const rooms = (level.rooms || []).filter(r => r.optional && !r.onMainRoute && !r.gallery &&
        !r.landmark && r.archetype !== 'Prison' && !r.prisonCell &&
        !(level.vaults || []).some(v => v.roomId === r.id) &&
        r.w >= 7 && r.h >= 6)
      const candidates=[]
      for (const room of rooms) {
        const doorLeaves = (room.doorways || []).flat()
        for (let y=room.y+2; y<room.y+room.h-2; y++)
          for (let x=room.x+2; x<room.x+room.w-2; x++) {
            if (level.map[y]?.[x] !== 'marble' || banned.has(keyXY(x,y))) continue
            if (doorLeaves.some(p => Math.max(Math.abs(x-p.x),Math.abs(y-p.y)) <= 2)) continue
            for (const [dx,dy] of [[1,0],[0,1]]) {
              const dangerTiles=[{x,y},{x:x+dx,y:y+dy},{x:x-dx,y:y-dy}]
              if (!dangerTiles.every(p => p.x>room.x+1 && p.y>room.y+1 &&
                p.x<room.x+room.w-2 && p.y<room.y+room.h-2 &&
                level.map[p.y]?.[p.x]==='marble' && !banned.has(encode(p)))) continue
              // Every threatened position has a reachable one-action sidestep.
              if (!dangerTiles.every(p => around.some(([vx,vy]) =>
                level.map[p.y+vy]?.[p.x+vx] === 'marble' &&
                !contains(dangerTiles,p.x+vx,p.y+vy)))) continue
              candidates.push({room,trigger:{x,y},dangerTiles})
            }
          }
      }
      if (!candidates.length) continue // Optional hazard must never break progression.
      const ordered = candidates.map(c => ({...c,score:hash(z,0xc3dd72a1,c.trigger.x,c.trigger.y)}))
        .sort((a,b)=>a.score-b.score || a.trigger.y-b.trigger.y || a.trigger.x-b.trigger.x)
      const placed=ordered[0]
      for (const p of placed.dangerTiles) level.map[p.y][p.x] =
        p.x===placed.trigger.x && p.y===placed.trigger.y ? 'dwarvencrusherplate' : 'dwarvencrushertrack'
      level.hazards.push({id:`dwarven-crusher:${z}:${placed.room.id}`,type:'crusher',z,
        roomId:placed.room.id,geometry:{triggerTiles:[placed.trigger],dangerTiles:placed.dangerTiles},
        state:'idle',stateEnteredTurn:0,localTurn:0,lastProcessedTurn:-1,impactedMonsterIds:[],exhausted:false})
    }
  }

  function onActorEntered(actor, fromX, fromY) {
    if (actor.x === fromX && actor.y === fromY || (actor !== player && !actor.alive)) return
    const level = activeLevel()
    if (!level) return
    for (const hazard of level.hazards || []) {
      if (hazard.type !== 'crusher' || hazard.state !== 'idle' ||
          !contains(hazard.geometry.triggerTiles,actor.x,actor.y)) continue
      hazard.state = 'warning'
      // Player enters before the action is counted. Monsters enter during
      // enemy resolution, after the action's count has already advanced.
      hazard.stateEnteredTurn = hazard.localTurn + (actor === player ? 1 : 0)
      if (actor === player || enemyIsVisibleOnMainView(actor)) {
        clearAutoPath()
        log('The dwarven pressure plate sinks! A stone crusher groans overhead!', 'bad')
        spawnDamageNumber(actor.x,actor.y,'CRUSHER!', '#eeaa62')
      }
    }
  }

  function impact(hazard) {
    const cfg = crusherConfig(), danger = hazard.geometry.dangerTiles
    if (!replayAnimationsDisabled && !replaySimulationMode)
      for (const p of danger) spawnFxAnim(p.x,p.y,'▰','#d5bba1',-1)
    if (contains(danger,player.x,player.y)) {
      const damage = player.godMode ? 0 : Math.ceil(playerMaxHp() * cfg.playerDamageMaxHpFraction)
      if (damage) {
        player.hp -= damage
        absorbPlayerFatalDamage()
        checkPlayerHealthWarning()
      }
      log(`The dwarven crusher slams down! You take ${damage} damage.`, 'bad')
      spawnDamageNumber(player.x,player.y,damage || 'Immune!',RENDER_STYLE.damage.playerHit)
      if (player.hp<=0) die(null,'dwarven crusher')
    } else log('The stone crusher slams into empty floor, then rises.', 'info')
    for (const e of [...enemies]) {
      if (!e.alive || !onCurrentLevel(e) || !contains(danger,e.x,e.y) ||
          hazard.impactedMonsterIds.includes(e.id)) continue
      hazard.impactedMonsterIds.push(e.id)
      if (enemyImmunityActive(e)) continue
      const boss = e.prefix === 'Champion' || e.isBoss === true || e.boss === true
      const cap = boss ? cfg.bossDamageCapFraction : cfg.normalMonsterDamageCapFraction
      const damage = Math.max(1,Math.ceil(e.maxHp*cap))
      const wasEnraged = enemyIsEnraged(e)
      const visible = enemyIsVisibleOnMainView(e)
      e.hp -= damage
      absorbEnemyFatalHit(e)
      logEnemyEnrageTransition(e,wasEnraged)
      if (visible) spawnDamageNumber(e.x,e.y,damage,RENDER_STYLE.damage.enemyHit)
      if (e.hp<=0) {
        if (visible) log(`The ${e.name} is crushed beneath the dwarven slab!`, 'info')
        killEnemy(e,false,'dwarven crusher')
      }
    }
    minimapDirty = true
  }

  function onPlayerTurnConsumed(tick) {
    const level = activeLevel()
    if (!level) return
    for (const hazard of level.hazards || []) {
      if (hazard.type !== 'crusher' || hazard.lastProcessedTurn === tick) continue
      hazard.lastProcessedTurn = tick
      hazard.localTurn++
      if (hazard.localTurn <= hazard.stateEnteredTurn) continue
      if (hazard.state === 'warning') {
        impact(hazard)
        hazard.state='cooldown'
        hazard.stateEnteredTurn=hazard.localTurn
      } else if (hazard.state === 'cooldown' && hazard.localTurn-hazard.stateEnteredTurn >= crusherConfig().cooldownTurns) {
        hazard.state='idle'
        hazard.stateEnteredTurn=hazard.localTurn
      }
    }
  }

  function knownDanger(x,y) {
    return (activeLevel()?.hazards || []).some(h =>
      h.type==='crusher' && contains(h.geometry.dangerTiles,x,y))
  }

  function activeCrusherStatus() {
    return (activeLevel()?.hazards || []).find(h => h.type==='crusher' &&
      h.state==='warning' && contains(h.geometry.dangerTiles,player.x,player.y)) || null
  }

  function validate(level) {
    for (const h of level.hazards || []) {
      if (h.type !== 'crusher' || h.geometry.dangerTiles.length < 2 ||
        h.geometry.triggerTiles.length !== 1 || !['idle','warning','cooldown'].includes(h.state) ||
        !Array.isArray(h.impactedMonsterIds) || !Number.isInteger(h.localTurn)) return false
      if (!h.geometry.dangerTiles.every(p => ['dwarvencrusherplate','dwarvencrushertrack'].includes(level.map[p.y]?.[p.x]))) return false
    }
    return true
  }
  return {generate,onActorEntered,onPlayerTurnConsumed,knownDanger,activeCrusherStatus,validate}
})()
