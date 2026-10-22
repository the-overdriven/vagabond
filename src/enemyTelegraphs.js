'use strict'

// A prepared ability belongs to an enemy instance, not to a species. Its
// warning, target and remaining cooldown are simulation state, never animation.
function enemyTelegraphConfig(type) {
  return ENEMY_TELEGRAPH_CONFIG[type] || null
}

function enemyAbilityCooldown(e, type) {
  return Math.max(0, e.abilityCooldowns?.[type] || 0)
}

function beginEnemyAbilityCooldown(e, type) {
  const turns = Math.max(0, enemyTelegraphConfig(type)?.cooldownTurns || 0)
  e.abilityCooldowns ||= {}
  e.abilityCooldownStartedTurn ||= {}
  e.abilityCooldowns[type] = turns
  e.abilityCooldownStartedTurn[type] = turnCount
}

function tickEnemyAbilityCooldowns() {
  for (const e of enemies) {
    if (!e.alive || !onCurrentLevel(e)) continue
    // Legacy/test-created enemies may not have mine ability state yet.
    for (const type of Object.keys(e.abilityCooldowns || {})) {
      if (turnCount <= (e.abilityCooldownStartedTurn?.[type] ?? -1)) continue
      if (e.abilityCooldowns[type] > 0) e.abilityCooldowns[type]--
    }
  }
}

function cancelPreparedEnemyAbility(e) {
  if (!e?.pendingAbility) return false
  const pending = e.pendingAbility
  e.pendingAbility = null
  if (pending.type === 'burrow' && pending.origin) {
    e.x = pending.origin.x
    e.y = pending.origin.y
  }
  beginEnemyAbilityCooldown(e, pending.type)
  return true
}

function cancelPreparedEnemyAbilitiesOutsideFloor() {
  for (const e of enemies) if (e.pendingAbility && !onCurrentLevel(e)) cancelPreparedEnemyAbility(e)
}

function cancelAllPreparedEnemyAbilities() {
  for (const e of enemies) if (e.pendingAbility) cancelPreparedEnemyAbility(e)
}

function markEnemyAbility(e, type, tiles, extra = {}) {
  e.pendingAbility = {type, preparedTurn: turnCount,
    tiles: tiles.map(({x,y}) => ({x,y})), ...extra}
  clearAutoPath()
}

function enemyWallAmbushWallAt(terrain, x, y) {
  const walls=enemyTelegraphConfig('wallAmbush')?.solidWallTiles || []
  return DIRS8.some(([dx,dy])=>walls.includes(terrain[y+dy]?.[x+dx]))
}

function enemyAbilityTerrainOpen(x, y) {
  return TILE[map[y]?.[x]]?.walk === true
}

function enemyAbilityLandingOpen(e, x, y) {
  return enemyAbilityTerrainOpen(x,y) &&
    !(ENEMY_TELEGRAPH_CONFIG.forbiddenLandingTiles || []).includes(map[y][x]) &&
    !(player.x===x && player.y===y) &&
    !(currentZ===0 && npcs.some(n=>n.x===x && n.y===y)) &&
    !enemies.some(other=>other!==e && other.alive && onCurrentLevel(other) && other.x===x && other.y===y)
}

function enemyAbilityDiagonalCanPass(x, y, dx, dy, canPass) {
  return !dx || !dy || canPass(x+dx,y) || canPass(x,y+dy)
}

// Shortest terrain-only paths deliberately ignore occupants. Occupants do not
// create a teleport across walls or doors, but still block emergence.
function enemyBurrowDestinations(e) {
  const cfg=enemyTelegraphConfig('burrow')
  const queue=[{x:e.x,y:e.y,steps:0}]
  const seen=new Set([keyXY(e.x,e.y)])
  const goals=[]
  for(let i=0;i<queue.length;i++) {
    const from=queue[i]
    if(from.steps>0 && Math.max(Math.abs(from.x-player.x),Math.abs(from.y-player.y))===cfg.targetAdjacentDistance &&
       enemyAbilityLandingOpen(e,from.x,from.y))goals.push(from)
    if(from.steps>=cfg.maxPathSteps)continue
    for(const [dx,dy] of DIRS8) {
      const x=from.x+dx,y=from.y+dy,key=keyXY(x,y)
      if(seen.has(key) || !enemyAbilityTerrainOpen(x,y) ||
          !enemyAbilityDiagonalCanPass(from.x,from.y,dx,dy,enemyAbilityTerrainOpen))continue
      seen.add(key);queue.push({x,y,steps:from.steps+1})
    }
  }
  if(!goals.length)return []
  const shortest=Math.min(...goals.map(p=>p.steps))
  return goals.filter(p=>p.steps===shortest)
}

function enemyTelegraphCommonEligible(e, type, options={}) {
  return !!enemyTelegraphConfig(type) && enemyHasAbility(e,type) && e.alive && e.hp>0 &&
    !e.pendingAbility && !enemyAbilityCooldown(e,type) && !e.sleeping &&
    !enemyIsPassive(e) && !playerInsideSanctuary() && !enemyInsideSanctuary(e) &&
    (options.ignorePlayerVisibility || !playerHiddenFromEnemy(e))
}

function tryPrepareEnemyBurrow(e) {
  const cfg=enemyTelegraphConfig('burrow')
  if(!enemyTelegraphCommonEligible(e,'burrow'))return false
  const dist=Math.max(Math.abs(player.x-e.x),Math.abs(player.y-e.y))
  if(dist<=ATTACK_RANGE || dist>cfg.range)return false
  const options=enemyBurrowDestinations(e)
  if(!options.length || !chance(cfg.activationChance))return false
  const destination=pick(options)
  const origin={x:e.x,y:e.y}
  markEnemyAbility(e,'burrow',[destination],{origin,destination:{x:destination.x,y:destination.y}})
  if(undergroundTileVisible(e.x,e.y))log(cfg.warningMessage.replace(/<enemy>/g,e.name),'bad')
  return true
}

function resolveEnemyBurrow(e,pending) {
  const cfg=enemyTelegraphConfig('burrow')
  const destination=pending.destination
  if (!destination || !enemyAbilityLandingOpen(e,destination.x,destination.y)) {
    if(undergroundTileVisible(e.x,e.y))log(cfg.failedMessage.replace(/<enemy>/g,e.name),'info')
    return
  }
  occupied.delete(keyXY(e.x,e.y))
  e.x=destination.x;e.y=destination.y
  occupied.add(keyXY(e.x,e.y))
  e.animStart=undefined
  if(undergroundTileVisible(e.x,e.y)) {
    log(cfg.emergeMessage.replace(/<enemy>/g,e.name),'bad')
    spawnDamageNumber(e.x,e.y,'Burrow!','#e8b98c')
  }
  if(Math.max(Math.abs(player.x-e.x),Math.abs(player.y-e.y))<=ATTACK_RANGE)
    enemyAttackPlayer(e,true) // suppress weapon-speed follow-up: at most one attack
}

function jumpPathPassable(e, x, y) {
  return enemyAbilityTerrainOpen(x,y) ||
    (enemyTelegraphConfig('jump')?.crossableTiles || []).includes(map[y]?.[x])
}

function enemyJumpDestinations(e, target=player) {
  const cfg=enemyTelegraphConfig('jump')
  const initialDist=Math.max(Math.abs(target.x-e.x),Math.abs(target.y-e.y))
  const options=[]
  for(const [dx,dy] of DIRS8) {
    let bypassed=false
    for(let distance=1;distance<=cfg.maxDistance;distance++) {
      const x=e.x+dx*distance,y=e.y+dy*distance
      if(!jumpPathPassable(e,x,y) ||
        !enemyAbilityDiagonalCanPass(e.x+dx*(distance-1),e.y+dy*(distance-1),dx,dy,
          (tx,ty)=>jumpPathPassable(e,tx,ty)))break
      if((enemyTelegraphConfig('jump')?.crossableTiles || []).includes(map[y][x]) ||
        (distance<cfg.maxDistance && enemies.some(other=>other!==e && other.alive &&
          onCurrentLevel(other) && other.x===x && other.y===y)))bypassed=true
      if(distance<2 || !enemyAbilityLandingOpen(e,x,y))continue
      const newDist=Math.max(Math.abs(target.x-x),Math.abs(target.y-y))
      const gain=initialDist-newDist
      if(gain<cfg.minimumPursuitGain && !(bypassed && gain>0))continue
      options.push({x,y,distance,gain,bypassed})
    }
  }
  options.sort((a,b)=>Number(b.bypassed)-Number(a.bypassed) ||
    b.gain-a.gain || b.distance-a.distance || a.y-b.y || a.x-b.x)
  return options
}

// target is an optional generic movement objective, reserved for future group
// behavior; this batch uses the player only.
function tryPrepareEnemyJump(e, target=player, options={}) {
  if(!enemyTelegraphCommonEligible(e,'jump',options))return false
  const candidates=enemyJumpDestinations(e,target)
  if(!candidates.length)return false
  const destination=candidates[0]
  markEnemyAbility(e,'jump',[destination],{origin:{x:e.x,y:e.y},
    destination:{x:destination.x,y:destination.y}})
  if(undergroundTileVisible(e.x,e.y))
    log(enemyTelegraphConfig('jump').warningMessage.replace(/<enemy>/g,e.name),'bad')
  return true
}

function resolveEnemyJump(e,pending) {
  const cfg=enemyTelegraphConfig('jump')
  const destination=pending.destination
  if(!destination || !enemyAbilityLandingOpen(e,destination.x,destination.y)) {
    if(enemyIsVisibleOnMainView(e))log(cfg.failedMessage.replace(/<enemy>/g,e.name),'info')
    return
  }
  occupied.delete(keyXY(e.x,e.y))
  e.x=destination.x;e.y=destination.y
  occupied.add(keyXY(e.x,e.y))
  e.animStart=undefined
  if(enemyIsVisibleOnMainView(e)) {
    log(cfg.landMessage.replace(/<enemy>/g,e.name),'bad')
    spawnDamageNumber(e.x,e.y,'Jump!','#d6b4f2')
  }
}

function tryPrepareEnemyWallAmbush(e) {
  const cfg=enemyTelegraphConfig('wallAmbush')
  if(!cfg || !enemyHasAbility(e,'wallAmbush') || !e.wallAmbushHidden ||
    e.wallAmbushSpent || e.pendingAbility)return false
  const dist=Math.max(Math.abs(player.x-e.x),Math.abs(player.y-e.y))
  if(dist>cfg.triggerRange || !undergroundTileVisible(e.x,e.y) || !enemyHasSight(e))return false
  markEnemyAbility(e,'wallAmbush',[{x:e.x,y:e.y}])
  log(cfg.warningMessage,'bad')
  return true
}

function revealEnemyWallAmbush(e, byBump=false) {
  if(!e.wallAmbushHidden)return false
  e.wallAmbushHidden=false
  e.wallAmbushSpent=true
  e.pendingAbility=null
  if(byBump)e.wallAmbushNoActionTurn=turnCount+1
  const cfg=enemyTelegraphConfig('wallAmbush')
  log((byBump?cfg.bumpMessage:cfg.revealMessage).replace(/<enemy>/g,e.name),'bad')
  spawnDamageNumber(e.x,e.y,'Revealed!','#e8ba82')
  return true
}

function ruptureMarkedTiles() {
  const marked = new Set()
  for (const enemy of enemies) {
    if (!enemy.alive || !onCurrentLevel(enemy) || enemy.pendingAbility?.type !== 'rupture') continue
    for (const tile of enemy.pendingAbility.tiles) marked.add(keyXY(tile.x,tile.y))
  }
  return marked
}

function ruptureLegalFloor(x, y) {
  return TILE[map[y]?.[x]]?.walk === true
}

function ruptureCandidateTiles() {
  const candidates = []
  for (const [dx,dy] of DIRS8) {
    const x = player.x + dx, y = player.y + dy
    if (!ruptureLegalFloor(x,y)) continue
    // Diagonals may not propagate through a solid wall corner.
    if (dx && dy && !ruptureLegalFloor(player.x+dx,player.y) &&
        !ruptureLegalFloor(player.x,player.y+dy)) continue
    candidates.push({x,y})
  }
  return candidates
}

function ruptureHasHypotheticalEscape(newTiles) {
  const warned = ruptureMarkedTiles()
  for (const tile of newTiles) warned.add(keyXY(tile.x,tile.y))
  for (const [dx,dy] of DIRS8) {
    const x=player.x+dx,y=player.y+dy
    if (!isWalkableForPlayer(x,y) || warned.has(keyXY(x,y))) continue
    if (dx && dy && !ruptureLegalFloor(player.x+dx,player.y) &&
        !ruptureLegalFloor(player.x,player.y+dy)) continue
    if (enemies.some(other=>other.alive && onCurrentLevel(other) && other.x===x && other.y===y)) continue
    if (currentZ===0 && npcs.some(n=>n.x===x && n.y===y)) continue
    return true
  }
  return false
}

function tryPrepareEnemyRupture(e) {
  const cfg=enemyTelegraphConfig('rupture')
  if (!cfg || !enemyHasAbility(e,'rupture') || e.pendingAbility || enemyAbilityCooldown(e,'rupture') ||
      !e.alive || e.hp<=0 || enemyIsPassive(e) || e.sleeping ||
      playerHiddenFromEnemy(e) || playerInsideSanctuary() || enemyInsideSanctuary(e)) return false
  const distance=Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))
  if (distance>cfg.range || !(enemyHasSight(e) || e.aware || e.alarmed)) return false
  if (!chance(cfg.activationChance)) return false
  const tiles=[{x:player.x,y:player.y}]
  const options=ruptureCandidateTiles()
  for (let i=0;i<cfg.extraTiles && options.length;i++) {
    const chosen=Math.floor(rng()*options.length)
    tiles.push(options.splice(chosen,1)[0])
  }
  // Never deliberately seal every currently free escape tile; later movement
  // or another effect may still make a previously viable escape unsafe.
  if (!ruptureHasHypotheticalEscape(tiles)) return false
  markEnemyAbility(e,'rupture',tiles)
  if (undergroundTileVisible(e.x,e.y) || undergroundTileVisible(player.x,player.y))
    log(cfg.warningMessage,'bad')
  return true
}

function resolveEnemyRupture(e, pending) {
  const cfg=enemyTelegraphConfig('rupture')
  if (!cfg) return false
  const struck=pending.tiles.some(tile=>tile.x===player.x && tile.y===player.y)
  if (!struck) {
    if (enemyIsVisibleOnMainView(e))log(cfg.missMessage.replace(/<enemy>/g,e.name),'good')
    return false
  }
  const damage=damageRoll(enemyAtk(e)*cfg.damageMultiplier,playerDef())
  player.hp-=damage
  spawnDamageNumber(player.x,player.y,damage,RENDER_STYLE.damage.playerHit)
  log(cfg.hitMessage.replace(/<enemy>/g,e.name).replace(/<damage>/g,String(damage)),'bad')
  absorbPlayerFatalDamage()
  checkPlayerHealthWarning()
  updateHud()
  if (player.hp<=0) { die(e); return true }
  return false
}

function resolveEnemyTelegraphIfPending(e) {
  const pending=e.pendingAbility
  if (!pending || pending.preparedTurn>=turnCount) return false
  e.pendingAbility=null
  beginEnemyAbilityCooldown(e,pending.type)
  if (pending.type==='rupture') resolveEnemyRupture(e,pending)
  else if (pending.type==='burrow') resolveEnemyBurrow(e,pending)
  else if (pending.type==='jump') resolveEnemyJump(e,pending)
  else if (pending.type==='wallAmbush') revealEnemyWallAmbush(e)
  return true
}

// Warnings are floor-scoped and drawn below actors; a full border plus a small
// upper-right marker survive sprite overlaps and are readable in ASCII mode.
function drawEnemyTelegraphWarnings(undergroundVisible, foreground=false) {
  const warned=new Set()
  for (const e of enemies) {
    if (!e.alive || !onCurrentLevel(e) || !e.pendingAbility) continue
    const type=e.pendingAbility.type
    for (const tile of e.pendingAbility.tiles || []) {
      const key=keyXY(tile.x,tile.y)
      if (warned.has(key) || (undergroundVisible && !undergroundVisible.has(key))) continue
      warned.add(key)
      const px=Math.round((tile.x-camX)*TILE_PX),py=Math.round((tile.y-camY)*TILE_PX)
      if (px < -TILE_PX || py < -TILE_PX || px > canvas.width || py > canvas.height) continue
      ctx.save()
      if (!foreground) {
        ctx.fillStyle='rgba(229,88,44,0.25)'
        ctx.fillRect(px,py,TILE_PX,TILE_PX)
        const name=type+'WarningImage'
        const image=RENDER_STYLE.overlays?.[name]
        if (USE_TILE_IMAGES && image) drawImageVisual(px,py,{image,scale:1},0.9)
      }
      ctx.strokeStyle='#ffcc61';ctx.lineWidth=Math.max(2,Math.round(TILE_PX*0.06))
      ctx.strokeRect(px+1,py+1,TILE_PX-2,TILE_PX-2)
      ctx.font=`bold ${Math.max(12,Math.round(TILE_PX*0.38))}px Consolas,monospace`
      ctx.textAlign='right';ctx.textBaseline='top';ctx.fillStyle='#fff1a6'
      ctx.fillText('!',px+TILE_PX-2,py+1)
      ctx.restore()
    }
  }
}
