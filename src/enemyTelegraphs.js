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
  if (pending.type === 'burrow' && pending.origin) {
    const landing = onCurrentLevel(e) ? enemyBurrowReturnTile(e,pending) : pending.origin
    // A transition/death must never leave a monster stranded outside the map.
    e.x = (landing || pending.origin).x
    e.y = (landing || pending.origin).y
    occupied.add(keyXY(e.x,e.y))
  }
  e.pendingAbility = null
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

function enemyBurrowReturnTile(e,pending) {
  const origin=pending.origin
  if (!origin) return null
  const options=[origin,...DIRS8.map(([dx,dy])=>({x:origin.x+dx,y:origin.y+dy}))]
  return options.find(tile=>enemyAbilityLandingOpen(e,tile.x,tile.y) &&
    enemyAbilityDiagonalCanPass(origin.x,origin.y,tile.x-origin.x,tile.y-origin.y,
      enemyAbilityTerrainOpen)) || null
}

function enemyBurrowShoveTiles(e) {
  const from={x:player.x,y:player.y}
  const open=(x,y)=> (isWalkable(x,y) || deepSwimmingWater(x,y)) &&
    !grasslandTrees.has(keyXY(x,y))
  return DIRS8.map(([dx,dy])=>({x:from.x+dx,y:from.y+dy,dx,dy}))
    .filter(tile=>open(tile.x,tile.y) &&
      enemyAbilityDiagonalCanPass(from.x,from.y,tile.dx,tile.dy,open) &&
      !(currentZ===0 && npcs.some(n=>n.x===tile.x && n.y===tile.y)) &&
      !enemies.some(other=>other!==e && other.alive && onCurrentLevel(other) &&
        other.x===tile.x && other.y===tile.y))
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
  const visible=undergroundTileVisible(origin.x,origin.y)
  // Burrowed monsters occupy no tile. Their origin and private destination
  // remain simulation state; no destination telegraph is exposed to the player.
  markEnemyAbility(e,'burrow',[],{origin,destination:{x:destination.x,y:destination.y}})
  occupied.delete(keyXY(origin.x,origin.y))
  e.x=-1;e.y=-1
  e.animStart=undefined
  if(visible) {
    log(cfg.warningMessage.replace(/<enemy>/g,e.name),'bad')
    spawnDamageNumber(origin.x,origin.y,'Burrow!','#e8b98c')
  }
  return true
}

function resolveEnemyBurrow(e,pending) {
  const cfg=enemyTelegraphConfig('burrow')
  const destination=pending.destination
  // The disturbed origin is an intentional bait tile, while the other tile
  // is secret. Occupying either cannot neutralize the emerging monster.
  const collision=[pending.origin,destination].find(tile=>tile &&
    player.x===tile.x && player.y===tile.y && enemyAbilityTerrainOpen(tile.x,tile.y) &&
    !(ENEMY_TELEGRAPH_CONFIG.forbiddenLandingTiles || []).includes(map[tile.y][tile.x]) &&
    !enemies.some(other=>other!==e && other.alive && onCurrentLevel(other) &&
      other.x===tile.x && other.y===tile.y))
  let triedCollision=false
  if(collision && !playerInsideSanctuary()) {
    const shoves=enemyBurrowShoveTiles(e)
    if(!shoves.length)return false // Never push into a wall or overlap another actor.
    triedCollision=true
    e.x=collision.x;e.y=collision.y
    let pushed=false
    enemyAttackPlayer(e,true,1,null,{
      fixedHitChance:cfg.collisionHitChance,suppressKnockback:true,
      onHit:()=>{
        pushed=true
        const tile=pick(shoves)
        log(cfg.collisionMessage.replace(/<enemy>/g,e.name),'bad')
        forcePlayerPosition(tile.x,tile.y)
      }
    })
    if(pushed || player.hp<=0 || deathTransition) {
      occupied.add(keyXY(e.x,e.y))
      e.animStart=undefined
      return true
    }
    // A missed collision is still the monster's one attack this action.
    // Find a free return point; do not perform a second ordinary attack.
    e.x=-1;e.y=-1
  }
  const reachedDestination=!triedCollision && destination &&
    enemyAbilityLandingOpen(e,destination.x,destination.y)
  const landing=reachedDestination ? destination : enemyBurrowReturnTile(e,pending)
  if (!landing) return false // Remain underground until there is a legal tile.
  e.x=landing.x;e.y=landing.y
  occupied.add(keyXY(e.x,e.y))
  e.animStart=undefined
  if(undergroundTileVisible(e.x,e.y)) {
    log((reachedDestination ? cfg.emergeMessage : cfg.failedMessage).replace(/<enemy>/g,e.name),
      reachedDestination ? 'bad' : 'info')
    spawnDamageNumber(e.x,e.y,'Burrow!','#e8b98c')
  }
  if(reachedDestination && Math.max(Math.abs(player.x-e.x),Math.abs(player.y-e.y))<=ATTACK_RANGE)
    enemyAttackPlayer(e,true) // suppress weapon-speed follow-up: at most one attack
  return true
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

// Rupture feedback is presentation-only: never advance turns or consume game RNG.
function shakeRuptureScreen() {
  if (replayAnimationsDisabled || replaySimulationMode) return
  const canvas = document.getElementById('game')
  if (!canvas) return
  // Animate the visible canvas directly. Independent `translate` preserves
  // desktop centering and mobile sizing, without changing game coordinates.
  if (typeof canvas.animate === 'function') {
    canvas.ruptureShakeAnimation?.cancel()
    const animation=canvas.animate([
      {translate:'0 0'}, {translate:'-22px 12px'},
      {translate:'24px -14px'}, {translate:'-21px -11px'},
      {translate:'18px 12px'}, {translate:'-13px 8px'},
      {translate:'9px -5px'}, {translate:'-4px 3px'}, {translate:'0 0'}
    ],{duration:650,easing:'linear',iterations:1})
    canvas.ruptureShakeAnimation=animation
    animation.onfinish=()=>{
      if(canvas.ruptureShakeAnimation===animation)canvas.ruptureShakeAnimation=null
    }
    return
  }
  const stage=document.getElementById('stage')
  if (!stage) return
  stage.classList.remove('rupture-shake')
  void canvas.offsetWidth // Restart CSS fallback for consecutive eruptions.
  stage.classList.add('rupture-shake')
}

function resolveEnemyRupture(e, pending) {
  const cfg=enemyTelegraphConfig('rupture')
  if (!cfg) return false
  shakeRuptureScreen()
  // Rupture is environmental damage from this Duiwel, not a player attack.
  // Snapshot the targets because killing one removes it from the enemies array.
  const marked=new Set(pending.tiles.map(tile=>keyXY(tile.x,tile.y)))
  for (const target of enemies.slice()) {
    if (target===e || !target.alive || !onCurrentLevel(target) ||
        enemyHasAbility(target,'fly') || enemyHasAbility(target,'ethereal') ||
        !marked.has(keyXY(target.x,target.y))) continue
    const damage=damageRoll(enemyAtk(e)*cfg.damageMultiplier,enemyDef(target))
    target.hp-=damage
    spawnDamageNumber(target.x,target.y,damage,RENDER_STYLE.damage.enemyHit)
    absorbEnemyFatalHit(target)
    triggerEnemyShellRetreat(target)
    if (target.hp<=0) {
      if (enemyIsVisibleOnMainView(target)) log(`The ${target.name} is killed by the eruption.`, 'info')
      killEnemy(target,false,'rupture')
    }
  }
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
  if (pending.type==='burrow') {
    // Each of the two full player responses passes with the monster hidden.
    if (turnCount<=pending.preparedTurn+enemyTelegraphConfig('burrow').undergroundTurns) return true
    if (!resolveEnemyBurrow(e,pending)) return true
    e.pendingAbility=null
    beginEnemyAbilityCooldown(e,'burrow')
    return true
  }
  e.pendingAbility=null
  beginEnemyAbilityCooldown(e,pending.type)
  if (pending.type==='rupture') resolveEnemyRupture(e,pending)
  else if (pending.type==='jump') resolveEnemyJump(e,pending)
  else if (pending.type==='wallAmbush') {
    if (revealEnemyWallAmbush(e) &&
        Math.max(Math.abs(player.x-e.x),Math.abs(player.y-e.y))<=ATTACK_RANGE)
      enemyAttackPlayer(e,true) // one ambush strike, no weapon-speed follow-up
  }
  return true
}

// Warnings are floor-scoped and drawn below actors; a full border plus a small
// upper-right marker survive sprite overlaps and are readable in ASCII mode.
function drawEnemyTelegraphWarnings(undergroundVisible, foreground=false) {
  const warned=new Set()
  for (const e of enemies) {
    if (!e.alive || !onCurrentLevel(e) || !e.pendingAbility) continue
    const type=e.pendingAbility.type
    if (type==='jump') continue // Leap is positioning only: no floor warning overlay.
    if (type==='burrow') {
      // Show disturbed earth at the abandoned origin, never at the secret
      // destination. The clue is drawn beneath actors in tile and ASCII modes.
      const origin=e.pendingAbility.origin
      if (foreground || !origin || !undergroundTileVisible(origin.x,origin.y) || (undergroundVisible && !undergroundVisible.has(keyXY(origin.x,origin.y)))) continue
      const px=Math.round((origin.x-camX)*TILE_PX),py=Math.round((origin.y-camY)*TILE_PX)
      if (px < -TILE_PX || py < -TILE_PX || px > canvas.width || py > canvas.height) continue
      ctx.save()
      ctx.fillStyle='rgba(123,83,48,0.32)'
      ctx.strokeStyle='#b18a62'
      ctx.lineWidth=Math.max(2,Math.round(TILE_PX*0.05))
      ctx.beginPath()
      ctx.ellipse(px+TILE_PX/2,py+TILE_PX/2,TILE_PX*0.33,TILE_PX*0.17,0,0,Math.PI*2)
      ctx.fill();ctx.stroke()
      ctx.restore()
      continue
    }
    for (const tile of e.pendingAbility.tiles || []) {
      const key=keyXY(tile.x,tile.y)
      if (warned.has(key) || !undergroundTileVisible(tile.x,tile.y) || (undergroundVisible && !undergroundVisible.has(key))) continue
      warned.add(key)
      const px=Math.round((tile.x-camX)*TILE_PX),py=Math.round((tile.y-camY)*TILE_PX)
      if (px < -TILE_PX || py < -TILE_PX || px > canvas.width || py > canvas.height) continue
      ctx.save()
      if (type==='rupture') {
        // Cracks are the whole warning: no yellow frame, marker or tint.
        if (!foreground) {
          const image=RENDER_STYLE.overlays?.ruptureWarningImage
          if (USE_TILE_IMAGES && image) drawImageVisual(px,py,{image,scale:1},0.9)
          else {
            const s=TILE_PX
            ctx.strokeStyle='#bd7043'
            ctx.lineWidth=Math.max(2,Math.round(s*0.045))
            ctx.beginPath()
            ctx.moveTo(px+s*0.24,py+s*0.12)
            ctx.lineTo(px+s*0.45,py+s*0.37)
            ctx.lineTo(px+s*0.35,py+s*0.58)
            ctx.lineTo(px+s*0.58,py+s*0.83)
            ctx.moveTo(px+s*0.45,py+s*0.37)
            ctx.lineTo(px+s*0.76,py+s*0.29)
            ctx.moveTo(px+s*0.35,py+s*0.58)
            ctx.lineTo(px+s*0.13,py+s*0.76)
            ctx.stroke()
          }
        }
        ctx.restore()
        continue
      }
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
