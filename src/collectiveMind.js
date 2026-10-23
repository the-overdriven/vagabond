'use strict'

// The floor alert and regrouping behavior belong to the ability, not to any
// named monster. A pack identifier is optional; singleton holders use their id.
function collectiveMindFloorKey(e) {
  return `${e.levelKind || 'surface'}:${e.level || 0}:${e.caveIndex ?? -1}`
}

function collectiveMindPackId(e) {
  return e.collectiveMindPackId || e.id
}

function collectiveMindCompareIds(a,b) {
  const left=String(a),right=String(b)
  return left===right ? 0 : left<right ? -1 : 1
}

function collectiveMindAllies(e) {
  return enemies.filter(other => other.alive && other.hp > 0 &&
    other !== e && enemyHasAbility(other,'collectiveMind') &&
    collectiveMindFloorKey(other) === collectiveMindFloorKey(e) &&
    (!COLLECTIVE_MIND_CONFIG.requireSameSpecies ||
      (other.baseName || other.name) === (e.baseName || e.name)))
}

// The broadcast continues while its scout lives. Once the scout reaches a
// separate pack, the floor remembers that the warning cannot be undone by
// killing it or leaving the level. An uncompleted broadcast ends on death.
function collectiveMindAlertActive(e) {
  const state=collectiveMindFloors[collectiveMindFloorKey(e)]
  if(!state?.spent)return false
  if(state.secured)return true
  return enemies.some(other=>other.id===state.scoutId && other.alive && other.hp>0)
}

// Build one deterministic shortest-path search. Occupied cells, the player,
// solid terrain and forbidden corners block ordinary retreat movement.
// Treat doors using the regular enemy path permission: opening a legal door
// still consumes a separate movement action.
function collectiveMindRoutes(e) {
  const start={x:e.x,y:e.y,distance:0,first:null}
  const route=new Map([[keyXY(start.x,start.y),start]])
  const queue=[start]
  const canEnter=(x,y)=>x>=0 && y>=0 && x<MAP_W && y<MAP_H &&
    enemyCanPathThrough(e,x,y) && !DungeonHazards.isCrusherTrigger(x,y) &&
    !occupied.has(keyXY(x,y)) && !(x===player.x && y===player.y)
  for(let head=0;head<queue.length;head++) {
    const point=queue[head]
    for(const [dx,dy] of DIRS8) {
      const x=point.x+dx,y=point.y+dy,key=keyXY(x,y)
      if(route.has(key) || !canEnter(x,y) ||
         !enemyAbilityDiagonalCanPass(point.x,point.y,dx,dy,canEnter))continue
      const next={x,y,distance:point.distance+1,first:point.first || {x,y}}
      route.set(key,next)
      queue.push(next)
    }
  }
  return route
}

function collectiveMindAdjacent(e,x,y,ally) {
  const dx=ally.x-x,dy=ally.y-y
  return Math.max(Math.abs(dx),Math.abs(dy))<=1 &&
    (!dx || !dy || enemyCanPathThrough(e,x+dx,y) || enemyCanPathThrough(e,x,y+dy))
}

function collectiveMindBestArrival(e,allies,routes) {
  const candidates=[]
  for(const ally of allies) {
    // Standing beside an ally is already a successful arrival.
    if(collectiveMindAdjacent(e,e.x,e.y,ally))
      candidates.push({ally,distance:0,first:null,x:e.x,y:e.y})
    for(const [dx,dy] of DIRS8) {
      const x=ally.x+dx,y=ally.y+dy
      if(!collectiveMindAdjacent(e,x,y,ally))continue
      const point=routes.get(keyXY(x,y))
      if(point)candidates.push({ally,distance:point.distance,first:point.first,x,y})
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance ||
    collectiveMindCompareIds(a.ally.id,b.ally.id) || a.y-b.y || a.x-b.x)
  return candidates[0] || null
}

function collectiveMindChooseGroup(e) {
  const groups=new Map()
  for(const ally of collectiveMindAllies(e)) {
    const id=collectiveMindPackId(ally)
    if(id===collectiveMindPackId(e))continue
    if(!groups.has(id))groups.set(id,[])
    groups.get(id).push(ally)
  }
  const routes=collectiveMindRoutes(e)
  const candidates=[]
  for(const [groupId,allies] of groups) {
    if(allies.length<(COLLECTIVE_MIND_CONFIG.minimumGroupAllies || 1))continue
    const arrival=collectiveMindBestArrival(e,allies,routes)
    if(arrival)candidates.push({groupId,allies,arrival})
  }
  const preferred=COLLECTIVE_MIND_CONFIG.preferredGroupAllies || 2
  candidates.sort((a,b)=>Number(b.allies.length>=preferred)-Number(a.allies.length>=preferred) ||
    a.arrival.distance-b.arrival.distance ||
    collectiveMindCompareIds(a.groupId,b.groupId))
  return candidates[0] || null
}

function collectiveMindSearchingScout(e) {
  const state=collectiveMindFloors[collectiveMindFloorKey(e)]
  return !!e.alive && !!state?.spent && state.scoutId===e.id && !state.secured &&
    collectiveMindAlertActive(e)
}

function collectiveMindSearchTurn(e) {
  // No group is reachable. Keep searching for one while retreat is possible;
  // a cornered scout may defend itself through the ordinary adjacent melee AI.
  // Search movement is deterministic and consumes no RNG.
  const currentDistance=Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))
  const moves=[]
  const canEnter=(x,y)=>enemyTileOpen(e,x,y) && !DungeonHazards.isCrusherTrigger(x,y)
  for(const [dx,dy] of DIRS8) {
    const x=e.x+dx,y=e.y+dy
    if(!canEnter(x,y) || !enemyAbilityDiagonalCanPass(e.x,e.y,dx,dy,canEnter))continue
    const distance=Math.max(Math.abs(x-player.x),Math.abs(y-player.y))
    if(distance<=currentDistance)continue
    const squared=(x-player.x)**2+(y-player.y)**2
    moves.push({x,y,distance,squared})
  }
  moves.sort((a,b)=>b.distance-a.distance || b.squared-a.squared || a.y-b.y || a.x-b.x)
  if(moves.length) {
    const step=moves[0],fromX=e.x,fromY=e.y
    occupied.delete(keyXY(fromX,fromY))
    e.x=step.x;e.y=step.y
    occupied.add(keyXY(e.x,e.y))
    e.farPath=null
    finishEnemyMove(e,fromX,fromY)
    if(enemyIsVisibleOnMainView(e) && !e.collectiveMindRetreatAnnounced) {
      log((COLLECTIVE_MIND_CONFIG.searchMessage || 'The <enemy> retreats, seeking its kin!')
        .replace(/<enemy>/g,e.name),'info')
      e.collectiveMindRetreatAnnounced=true
    }
  }
  // No legal step away from the player: allow normal combat only when the
  // scout is adjacent. Otherwise wait and look for a group on the next turn.
  return moves.length>0 || currentDistance>1
}

// Called by ordinary target acquisition, including nonvisual sensing.
function tryTriggerCollectiveMind(e) {
  if(!e.alive || !enemyHasAbility(e,'collectiveMind') ||
     playerHiddenFromEnemy(e))return false
  const key=collectiveMindFloorKey(e)
  if(collectiveMindFloors[key]?.spent)return false
  collectiveMindFloors[key]={spent:true,scoutId:e.id,secured:false}
  const members=[e,...collectiveMindAllies(e)]
  // Alarmed intentionally retains the existing short-range sensing/chase AI,
  // even around a corner. No separate follow-target coordinates are stored.
  for(const member of members)alarmEnemy(member)
  const target=collectiveMindChooseGroup(e)
  if(target) {
    e.collectiveMindRetreat={groupId:target.groupId,
      allyIds:target.allies.map(a=>a.id).sort(),startedTurn:turnCount}
    e.collectiveMindRetreatAnnounced=false
  }
  if(enemyIsVisibleOnMainView(e)) {
    log((COLLECTIVE_MIND_CONFIG.alertMessage || 'The <enemy> alerts its kin!')
      .replace(/<enemy>/g,e.name),'bad')
  }
  return true
}

function endCollectiveMindRetreat(e,succeeded) {
  if(!e.collectiveMindRetreat)return
  if(succeeded) {
    const state=collectiveMindFloors[collectiveMindFloorKey(e)]
    if(state?.scoutId===e.id)state.secured=true
  }
  e.collectiveMindRetreat=null
  if(enemyIsVisibleOnMainView(e))log(
    (succeeded?COLLECTIVE_MIND_CONFIG.regroupMessage:COLLECTIVE_MIND_CONFIG.fallbackMessage)
      .replace(/<enemy>/g,e.name), 'info')
}

// True means the scout spent its action on regrouping. False means the target
// became invalid before any action and regular AI may resume immediately.
function takeCollectiveMindRetreatTurn(e) {
  if(!collectiveMindSearchingScout(e))return false
  if(!e.collectiveMindRetreat) {
    const target=collectiveMindAllies(e).some(ally=>collectiveMindPackId(ally)!==collectiveMindPackId(e))
      ? collectiveMindChooseGroup(e) : null
    if(target) {
      e.collectiveMindRetreat={groupId:target.groupId,
        allyIds:target.allies.map(ally=>ally.id).sort(),startedTurn:turnCount}
    } else return collectiveMindSearchTurn(e)
  }
  const selected=new Set(e.collectiveMindRetreat.allyIds)
  const allies=collectiveMindAllies(e).filter(other=>selected.has(other.id) &&
    collectiveMindPackId(other)===e.collectiveMindRetreat.groupId)
  if(allies.length<(COLLECTIVE_MIND_CONFIG.minimumGroupAllies || 1)) {
    endCollectiveMindRetreat(e,false)
    return collectiveMindSearchTurn(e)
  }
  const goal=collectiveMindBestArrival(e,allies,collectiveMindRoutes(e))
  if(!goal) {
    endCollectiveMindRetreat(e,false)
    return collectiveMindSearchTurn(e)
  }
  if(goal.distance===0) {
    endCollectiveMindRetreat(e,true)
    return true
  }
  if(COLLECTIVE_MIND_CONFIG.allowRetreatJump && enemyHasAbility(e,'jump') &&
     tryPrepareEnemyJump(e,goal.ally,{ignorePlayerVisibility:true}))return true
  const step=goal.first
  if(!step || !enemyTileOpen(e,step.x,step.y)) {
    endCollectiveMindRetreat(e,false)
    return collectiveMindSearchTurn(e)
  }
  if(enemyOpenDoorInsteadOfMove(e,step.x,step.y))return true
  const fromX=e.x,fromY=e.y
  occupied.delete(keyXY(fromX,fromY))
  e.x=step.x;e.y=step.y
  occupied.add(keyXY(e.x,e.y))
  e.farPath=null
  finishEnemyMove(e,fromX,fromY)
  if(collectiveMindAdjacent(e,e.x,e.y,goal.ally))
    endCollectiveMindRetreat(e,true)
  else if(enemyIsVisibleOnMainView(e) && !e.collectiveMindRetreatAnnounced) {
    log((COLLECTIVE_MIND_CONFIG.retreatMessage || 'The <enemy> retreats toward its kin!')
      .replace(/<enemy>/g,e.name),'info')
    e.collectiveMindRetreatAnnounced=true
  }
  return true
}
