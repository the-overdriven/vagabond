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

// Remove isolated frozen pixels only when all eight original neighbors are
// water. Evaluate from a snapshot so one conversion cannot melt another tile.
function meltSurroundedLakeIce() {
  const surrounded = []
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    if (!isLakeIce(map[y][x]) || Frostwalker.at(x,y)) continue
    if (DIRS8.every(([dx, dy]) => map[y + dy][x + dx] === 'water'))
      surrounded.push({x, y})
  }
  for (const {x, y} of surrounded) {
    map[y][x] = 'water'
    surfaceMap[y][x] = 'water'
  }
  return surrounded
}

// Rule checks run once per elapsed player turn, before freezing and enemies.
// Animation clocks, rendering and monsters never advance lake ice.
function tickLakeIce(playerMovement = null) {
  if (currentZ !== 0 || player.godMode || raceHas('fly')) return
  const {x, y} = player
  const tile = map[y]?.[x]
  if (!isLakeIce(tile) || Frostwalker.at(x,y)) return
  const cracking = tile === 'crackingice'
  // An instant break takes priority, even on a step beside cracked ice.
  const cfg = WORLD_GEN_CONFIG.environment
  const instantBreak = !cracking && chance(cfg.iceInstantBreakChance)
  const spreads = !cracking && playerMovement && DIRS8.some(([dx, dy]) =>
    map[y + dy]?.[x + dx] === 'crackingice' && !Frostwalker.at(x+dx,y+dy))
  const transitionChance = cracking ? cfg.crackingIceBreakChance
    : spreads ? cfg.iceSpreadChance : cfg.iceCrackChance
  if (!instantBreak && !chance(transitionChance)) return

  // Leaving cracking ice puts extra stress on the next intact tile. Only this
  // movement gets a same-turn break recheck; random new cracks keep a warning.
  const stepBreak = !instantBreak && spreads && playerMovement.fromTile === 'crackingice' &&
    chance(cfg.crackingIceBreakChance)
  const breaks = cracking || instantBreak || stepBreak
  const changes = [{x, y, next: breaks ? 'water' : 'crackingice'}]
  let collapsed = 0, spread = 0
  if (breaks) for (const [dx, dy] of DIRS8) {
    const nx = x + dx, ny = y + dy, neighbor = map[ny]?.[nx]
    if (Frostwalker.at(nx,ny)) continue
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
  // Breaking ice can leave isolated intact or cracked tiles surrounded by
  // water. The same eight-neighbor rule also applies during play.
  const isolated = meltSurroundedLakeIce()
  for (const {x: ix, y: iy} of isolated) {
    changes.push({x:ix, y:iy, next:'water'})
    beastTracks.delete(keyXY(ix, iy))
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
  // Forced entry grants no practice. Apply one icy-plunge hit (rather than
  // ordinary drowning damage on this turn), then use normal swimming rules.
  if (breaks) advanceSwimming(false, null, true)
}

// Magical ice uses the same real terrain and presentation as natural lake ice,
// but its ownership and deadlines are independent of the natural random rolls.
const Frostwalker = (() => {
  const state = () => player.wayfaring
  const rule = key => artifactRule('frostwalker',key)
  const has = () => playerHasArtifactAbility('frostwalker')
  const water = tile => tile === 'water' || tile === 'river'
  const kindOf = e => e.levelKind || ((e.level??0)===0?'surface':e.level>0?'tower':'chain')
  const terrain = b => b.kind==='surface'?surfaceMap:b.kind==='crypt2'?cryptLevel2?.map:
    b.kind==='tower'?towerLevels[b.z-1]?.map:depthUndergroundMap(chainDepthForZ(b.z))
  const same = b => b.z===currentZ && b.kind===currentLevelKind()
  const active = () => state().frostBridges.find(b=>b.id===state().frostActive && same(b))
  function at(x,y) {
    for (const b of state()?.frostBridges || []) if(same(b)) {
      const tile=b.tiles.find(p=>p.x===x&&p.y===y)
      if(tile)return {bridge:b,tile}
    }
    return null
  }
  function validState(s) {
    if(!Number.isInteger(s.frostSerial)||s.frostSerial<0||
       !(s.frostActive===null || Number.isInteger(s.frostActive)&&s.frostActive>0&&s.frostActive<=s.frostSerial)||
       !Array.isArray(s.frostBridges)||!Array.isArray(s.frostStranded)||
       !s.frostStranded.every(id=>typeof id==='string'||Number.isInteger(id))||new Set(s.frostStranded).size!==s.frostStranded.length)return false
    const ids=new Set(),cells=new Set()
    return s.frostBridges.every(b=>{
      if(!b||!Number.isInteger(b.id)||b.id<1||b.id>s.frostSerial||ids.has(b.id)||
         !Number.isInteger(b.z)||!['surface','chain','tower','crypt2'].includes(b.kind)||
         !(b.kind==='surface'?b.z===0:b.kind==='tower'?b.z>0:b.z<0)||
         !Number.isInteger(b.started)||b.started<0||!Array.isArray(b.tiles)||!b.tiles.length)return false
      ids.add(b.id)
      return b.tiles.every(p=>{
        if(!p||!Number.isInteger(p.x)||p.x<0||!Number.isInteger(p.y)||p.y<0||!water(p.original))return false
        const key=`${b.kind}:${b.z}:${p.x},${p.y}`
        if(cells.has(key))return false
        cells.add(key);return true
      })
    })
  }
  function invalidate(points) {
    if(!points.length)return
    repaintMinimapTiles(points)
    invalidateUndergroundFov()
    clearAutoPath()
  }
  // Called after map reconstruction, which does not retain shared connector
  // edits in its local cave maps. The saved coordinates are the authority.
  function restore() {
    for(const b of state().frostBridges){
      const grid=terrain(b),age=turnCount-b.started
      if(age<0||age>=rule('meltAfter'))throw Error('Invalid Frostwalker deadline')
      for(const p of b.tiles){
        const old=grid?.[p.y]?.[p.x],next=age>=rule('crackAfter')?'crackingice':'ice'
        if(old!==p.original&&old!==next)throw Error('Invalid Frostwalker terrain')
        grid[p.y][p.x]=next
      }
    }
  }
  function canFreeze(x,y) {
    if(!has()||!water(map[y]?.[x]))return false
    if(!water(map[player.y]?.[player.x])&&!at(player.x,player.y))return true
    // A melted or fully broken crossing cannot be renewed from the water.
    // A floor change or solid shore resets the reservation.
    return state().frostActive===null||!!active()
  }
  function reconcileCrossing() {
    const b=state().frostBridges.find(b=>b.id===state().frostActive)
    if(b&&!same(b))state().frostActive=null
    const tile=map[player.y]?.[player.x]
    if(!water(tile)&&!at(player.x,player.y))state().frostActive=null
  }
  function enter(from,teleport=false) {
    const s=state()
    // Only actual steps make ice: no teleport/forced displacement or waiting.
    if(teleport){reconcileCrossing();return}
    if(!water(map[from.y]?.[from.x])&&!at(from.x,from.y))s.frostActive=null
    const existing=at(player.x,player.y)
    if(existing){if(s.frostActive===null)s.frostActive=existing.bridge.id;return}
    if(!canFreeze(player.x,player.y)){reconcileCrossing();return}
    let b=active()
    const first=!b
    if(first){b={id:++s.frostSerial,z:currentZ,kind:currentLevelKind(),started:turnCount,tiles:[]};s.frostActive=b.id;s.frostBridges.push(b)}
    const {x,y}=player
    b.tiles.push({x,y,original:map[y][x]})
    map[y][x]=turnCount-b.started>=rule('crackAfter')?'crackingice':'ice'
    if(currentZ===0){surfaceMap[y][x]=map[y][x];beastTracks.delete(keyXY(x,y))}
    // A new traversable tile need not cancel the route already being followed.
    repaintMinimapTiles([{x,y}]);invalidateUndergroundFov()
    if(first)artifactAbilityMessage('frostwalker','Frostwalker freezes the water beneath you.','A strange power freezes the water beneath you.')
  }
  function waterCapable(e) {return enemyHasAbility(e,'swim')||enemyHasAbility(e,'fly')||enemyHasAbility(e,'ethereal')}
  function stranded(e) {return state().frostStranded.includes(e.id)}
  function forget(e) {const list=state().frostStranded,i=list.indexOf(e.id);if(i!==-1)list.splice(i,1)}
  function strand(e) {
    if(waterCapable(e)||stranded(e))return
    state().frostStranded.push(e.id)
    e.farPath=null;e.bowEvasion=null;e.bowRetreatHold=false
    if(onCurrentLevel(e)){
      cancelPreparedEnemyAbility(e);wakeSleepingEnemy(e)
      if(enemyIsVisibleOnMainView(e))log(`The ${e.name} falls into the water!`,'good')
    }
  }
  function plunge() {
    if(raceHas('fly'))return
    // A collapsing bridge takes priority over a second water-walking power.
    ArtifactWayfaring.exhaustWaterWalking()
    resetSwimming()
    advanceSwimming(false,null,true)
  }
  function breakTiles(b,tiles) {
    const grid=terrain(b), local=same(b), points=[]
    let playerFalls=false
    for(const p of tiles){
      if(!grid?.[p.y]||!isLakeIce(grid[p.y][p.x]))continue
      grid[p.y][p.x]=p.original
      if(b.kind==='surface')beastTracks.delete(keyXY(p.x,p.y))
      if(p.original==='water'){
        for(const e of enemies)if(e.alive&&(e.level??0)===b.z&&kindOf(e)===b.kind&&e.x===p.x&&e.y===p.y)strand(e)
        if(local&&player.x===p.x&&player.y===p.y)playerFalls=true
      }
      points.push(p)
    }
    b.tiles=b.tiles.filter(p=>!tiles.includes(p))
    if(!b.tiles.length)state().frostBridges=state().frostBridges.filter(other=>other!==b)
    if(local){invalidate(points);if(playerFalls){log('The magical ice gives way beneath you!','bad');spawnDamageNumber(player.x,player.y,'Ice breaks!','#70cce8');plunge()}}
    else if(points.length){mapPreviewBase=null;minimapDirty=true}
    return playerFalls
  }
  function forcedEntry(actor) {
    const info=at(actor.x,actor.y)
    if(!info||map[actor.y][actor.x]!=='crackingice')return false
    return breakTiles(info.bridge,[info.tile])
  }
  function tick() {
    for(const b of state().frostBridges.slice()){
      const age=turnCount-b.started,grid=terrain(b)
      if(!grid)throw Error('Missing Frostwalker level')
      if(age>=rule('meltAfter')){
        if(same(b)&&b.tiles.some(p=>currentZ===0?discovered[p.y]?.[p.x]:undergroundDiscovered[p.y]?.[p.x]))log('The magical ice melts away.','info')
        breakTiles(b,b.tiles.slice())
      }else if(age>=rule('crackAfter')){
        const changed=b.tiles.filter(p=>grid[p.y][p.x]==='ice')
        for(const p of changed)grid[p.y][p.x]='crackingice'
        if(same(b)&&changed.length){invalidate(changed);if(changed.some(p=>Math.max(Math.abs(p.x-player.x),Math.abs(p.y-player.y))<=8)){log('The magical ice begins to crack!','bad');spawnDamageNumber(player.x,player.y,'Ice cracking!','#ffe2a8')}}
        else if(changed.length){mapPreviewBase=null;minimapDirty=true}
      }
    }
  }
  // BFS through unoccupied water to a legal shore; never attack, open a
  // door or teleport out of the water. Recompute as other actors move.
  function escapeStep(e) {
    const queue=[{x:e.x,y:e.y,first:null}],seen=new Set([keyXY(e.x,e.y)])
    const open=(x,y)=>!!map[y]?.[x]&&!occupied.has(keyXY(x,y))&&!(x===player.x&&y===player.y)&&
      !(currentZ===0&&grasslandTrees.has(keyXY(x,y)))&&!enemySanctuaryTileForbidden(e,x,y)
    const shore=(x,y)=>isWalkable(x,y)&&enemyCanTraverse(e,x,y)&&!DungeonTraps.isTrigger(map[y][x])&&!DungeonHazards.knownDanger(x,y)&&!DungeonHazards.gasAt(x,y)
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of DIRS8){
      const cur=queue[i],x=cur.x+dx,y=cur.y+dy,key=keyXY(x,y)
      if(seen.has(key)||!open(x,y))continue
      seen.add(key)
      const first=cur.first||{x,y}
      if(map[y][x]==='water'||(at(x,y)&&shore(x,y)))queue.push({x,y,first})
      else if(shore(x,y))return first
    }
    return null
  }
  function normalizeStranded(e) {
    if(!stranded(e))return false
    if(waterCapable(e)||map[e.y]?.[e.x]!=='water'){forget(e);return false}
    return true
  }
  function tickStranded() {
    if(!state().frostStranded.length)return
    const living=new Set(enemies.filter(e=>e.alive).map(e=>e.id))
    state().frostStranded=state().frostStranded.filter(id=>living.has(id))
    for(const e of enemies.slice()){
      if(!e.alive||!onCurrentLevel(e)||!normalizeStranded(e))continue
      if(enemyImmunityActive(e))continue
      if(escapeStep(e))continue
      const damage=Math.max(1,Math.round(e.maxHp*rule('drowningFraction')))
      e.hp-=damage;absorbEnemyFatalHit(e)
      if(enemyIsVisibleOnMainView(e)){log(`The ${e.name} is drowning!`,'info');spawnDamageNumber(e.x,e.y,damage,RENDER_STYLE.damage.enemyHit)}
      if(e.hp<=0)killEnemy(e,false,'drowning')
    }
  }
  function enemyAction(e) {
    if(ArtifactGeomancy.petrified(e))return false
    if(!normalizeStranded(e))return false
    const next=escapeStep(e)
    if(next){
      const x=e.x,y=e.y
      occupied.delete(keyXY(x,y));e.x=next.x;e.y=next.y;occupied.add(keyXY(e.x,e.y))
      e.farPath=null;finishEnemyMove(e,x,y)
      if(map[e.y]?.[e.x]!=='water')forget(e)
    }
    return true
  }
  // Existing temporary ice can disappear even without a Frostwalker trinket.
  function crossingAge() {
    const b=active()||at(player.x,player.y)?.bridge
    return b ? turnCount-b.started : state().frostActive!==null ? rule('meltAfter') : 0
  }
  function description(x,y) {
    return at(x,y) ? (map[y][x]==='crackingice'?'cracking magical ice':'temporary magical ice') : null
  }
  function safePath(path) {
    let start=active()?.started??at(player.x,player.y)?.bridge.started??null,locked=state().frostActive!==null&&start===null
    for(let i=0;i<path.length;i++){
      const {x,y}=path[i],tile=map[y]?.[x],info=at(x,y),arrival=turnCount+i+1
      if(info){if(arrival>=info.bridge.started+rule('meltAfter'))return false;if(start===null&&!locked)start=info.bridge.started;continue}
      if(water(tile)&&has()){
        if(locked)return false
        if(start===null)start=arrival-1
        if(arrival>=start+rule('meltAfter'))return false
      }else{start=null;locked=false}
    }
    return true
  }
  return {description,crossingAge,at,has,canFreeze,enter,reconcileCrossing,validState,restore,forcedEntry,tick,tickStranded,enemyAction,stranded,forget,safePath}
})()
