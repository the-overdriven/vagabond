/* Wayfaring trinkets: shared stat, terrain and curse rules. */
const ArtifactWayfaring = (() => {
  const has = id => playerHasArtifactAbility(id)
  const rule = (id, key) => artifactRule(id, key)
  function coldTerrain(x = player.x, y = player.y) {
    if (Frostwalker.at(x,y)) return true
    if (currentZ !== 0) return false
    const tile = map?.[y]?.[x]
    return tile === 'snow' || tile === 'taiga' || isLakeIce(tile) || tile === 'frozenriver' ||
      ((tile === 'river' || tile === 'water') && tileUnderlays[keyXY(x, y)] === 'snow')
  }
  function exileBonus() {
    if (!has('exile') || !spawnPoint || !surfaceMap?.length) return 0
    const start = rule('exile','startDistance')
    const farthest = Math.max(spawnPoint.x, surfaceMap[0].length - 1 - spawnPoint.x,
      spawnPoint.y, surfaceMap.length - 1 - spawnPoint.y)
    const maxAt = Math.max(start + 1, farthest * rule('exile','maxMapFraction'))
    const distance = Math.max(Math.abs(player.x - spawnPoint.x), Math.abs(player.y - spawnPoint.y)) +
      Math.abs(currentZ) * rule('exile','depthDistance')
    return Math.floor(rule('exile','maxBonus') * Math.max(0, Math.min(1, (distance - start) / (maxAt - start))))
  }
  function troglodyteSteps() {
    if (!has('troglodyte')) return 0
    const limit = rule('troglodyte','maxSteps')
    return Math.max(-limit, Math.min(limit, rule('troglodyte','neutralZ') - currentZ))
  }
  function positionStats() { return exileBonus() + troglodyteSteps() }
  function maxHpPct() { const steps = troglodyteSteps(); return steps ? steps * rule('troglodyte','hpPctPerStep') : 0 }
  function adrenalineSpeed(permanentSpeed) {
    return has('adrenaline') && player.hp < playerMaxHp() * rule('adrenaline','hpThreshold')
      ? rule('adrenaline','speedBonus') + Math.round(Math.max(1, permanentSpeed) * rule('adrenaline','speedFraction')) : 0
  }
  function homecomingBlocker() {
    const blockers = ['exile', 'drifter'].filter(has)
    if (!blockers.length) return null
    return blockers.find(playerKnowsArtifactAbility) || blockers[0]
  }
  function drifterMagicFind() {
    let total = 0
    forEachActiveArtifact(item => { if (item.abilityId === 'drifter') total += item.drifterMf })
    return total
  }
  function terrainDefense(tile, baseDefense, ordinary) {
    let bonus = ordinary
    if (tile === 'hill' && has('highlander')) {
      bonus = Math.min(rule('highlander','hillDefCap'), rule('highlander','hillDefBase') +
        Math.floor(baseDefense / rule('highlander','hillDefDivisor')))
    }
    if (has('permafrost')) {
      if (coldTerrain()) bonus += rule('permafrost','coldDefense')
      if (tile === 'sand') bonus += rule('permafrost','sandDefense')
    }
    return bonus
  }
  function terrainSpeed(tile, ordinary) {
    if (tile==='water' && walkingOnWater()) return Math.max(0,ordinary)
    return tile === 'hill' && has('highlander') ? Math.max(0, ordinary) : ordinary
  }
  function extraDownhillPush(e, x, y) {
    return currentZ === 0 && has('highlander') && map?.[player.y]?.[player.x] === 'hill' &&
      map?.[e.y]?.[e.x] === 'hill' && map?.[y]?.[x] !== 'hill' ? rule('highlander','extraPush') : 0
  }
  function syncHealth() {
    player.hp = Math.min(player.hp, playerMaxHp())
    artifactAlchemistClamp()
  }
  function clearFreezing() {
    if (!player.freezing?.active) return
    player.freezing = {active:false, turns:0}
    artifactAbilityMessage('permafrost','Permafrost protects you from the freezing cold.','A strange power protects you from the freezing cold.')
  }
  function inventoryChanged(item) {
    if (item?.abilityId === 'one_with_the_wild') reconcileTruce()
    if (item?.abilityId === 'forestwalker' && !has('forestwalker')) clearForestwalk()
    if (item?.abilityId === 'unseen' && !has('unseen')) clearUnseen()
    if (item?.abilityId === 'troglodyte') syncHealth()
    if (item?.abilityId === 'water_walking') reconcileSwimming()
    if (item?.abilityId === 'permafrost' && has('permafrost')) clearFreezing()
    if (item?.abilityId === 'endurance' && !has('endurance')) resetEndurance()
    if (item?.abilityId === 'escape_artist' && has('escape_artist')) clearRoot()
    for (const id of ['windwalker','skirmisher','tidefang'])
      if (item?.abilityId === id && !has(id)) state()[id+'Ready']=false
    ArtifactGeomancy.syncLodestone()
  }
  // Character-owned counters. Absolute expiry turns continue off-floor.
  function freshState(world = null) {
    return {stealth:{position:null,moved:false,fought:false,forestGap:0,dodgeReady:false,unseenActive:false,unseenGap:0,observers:[]}, pilgrimTiles:0, trailblazerTiles:0, visitedZ:[], prospectedZ:[],
      miningUntil:0, lastVisitedZ:0, enduranceSteps:0, ordinaryStep:false, discoveredPrevious:false,
      discoveredPending:0, cooldowns:{}, longstriderSteps:0, longstriderThreshold:0,
      longstriderSkip:false, windwalkerReady:false, skirmisherReady:false, tidefangReady:false, history:[], rush:null, farsight:null, phantom:null, phantomSurprise:[], waterWalkingUsed:0, lavaPaid:false, castawaySpent:false, frostBridges:world?.frostBridges || [], frostActive:null, frostSerial:world?.frostSerial || 0, frostStranded:world?.frostStranded || []}
  }
  const state = () => player.wayfaring
  function validate(saved) {
    if (!saved || !validStealth(saved.stealth) || !Frostwalker.validState(saved) || !Number.isInteger(saved.lastVisitedZ) || !['pilgrimTiles','trailblazerTiles','miningUntil','enduranceSteps','discoveredPending','longstriderSteps','longstriderThreshold','waterWalkingUsed'].every(k=>Number.isInteger(saved[k]) && saved[k]>=0) ||
        !['ordinaryStep','discoveredPrevious','longstriderSkip','windwalkerReady','skirmisherReady','tidefangReady','lavaPaid','castawaySpent'].every(k=>typeof saved[k]==='boolean') ||
        !['visitedZ','prospectedZ'].every(k=>Array.isArray(saved[k]) && saved[k].every(z=>Number.isInteger(z)&&z<0) && new Set(saved[k]).size===saved[k].length) ||
        (saved.longstriderThreshold !== 0 && (saved.longstriderThreshold < rule('longstrider','minSteps') ||
          saved.longstriderThreshold > rule('longstrider','maxSteps'))) || saved.longstriderSteps >= (saved.longstriderThreshold || 1) ||
        saved.waterWalkingUsed>rule('water_walking','duration') || !Array.isArray(saved.history) || saved.history.length>rule('backtrack','historyTurns')+1 || !saved.history.every(p=>validPosition(p)&&Number.isInteger(p.turn)&&p.turn>=0) ||
        (saved.rush!==null && (!Number.isInteger(saved.rush?.steps) || saved.rush.steps<0 || saved.rush.steps>=rule('rush','maxSteps') || typeof saved.rush.iceChecked!=='boolean')) ||
        (saved.farsight!==null && (!validPosition(saved.farsight) || saved.farsight.x<0 || saved.farsight.y<0 ||
          !Number.isInteger(saved.farsight.size) || saved.farsight.size<rule('farsight','baseSize') || saved.farsight.size>rule('farsight','maxSize') ||
          !Number.isInteger(saved.farsight.until) || saved.farsight.until<0)) ||
        (saved.phantom!==null && (!validPosition(saved.phantom) || !Number.isInteger(saved.phantom.until) || saved.phantom.until<0)) ||
        !Array.isArray(saved.phantomSurprise) || !saved.phantomSurprise.every(id=>typeof id==='string'||Number.isInteger(id)) ||
        !saved.cooldowns || typeof saved.cooldowns!=='object' || Array.isArray(saved.cooldowns) ||
        !Object.values(saved.cooldowns).every(t=>Number.isInteger(t)&&t>=0)) throw Error('Invalid saved Wayfaring state')
  }
  function templeCap() {
    return Math.min(playerMaxHp(), has('pilgrim') ? rule('pilgrim','templeBase') +
      Math.floor(rule('pilgrim','templeHpFraction')*playerMaxHp()) : 70)
  }
  function discover(count, source='sight') {
    if (source!=='sight' || count<=0 || player.hp<=0 || deathTransition) return
    const s=state()
    s.discoveredPending+=count
    if (has('pilgrim')) {
      s.pilgrimTiles+=count
      const threshold=rule('pilgrim','tilesPerReward')
      while(s.pilgrimTiles>=threshold){
        s.pilgrimTiles-=threshold
        const restored=healPlayer(Math.max(1,Math.floor(playerMaxHp()*rule('pilgrim','healFraction'))))
        artifactAbilityMessage('pilgrim',
          restored>0 ? `Pilgrim rewards your exploration: +${restored} HP.` : 'Pilgrim rewards your exploration.',
          restored>0 ? `A strange power rewards your exploration: +${restored} HP.` : 'A strange power rewards your exploration.')
        gainXp(rule('pilgrim','xpPerLevel')*player.lvl)
      }
    }
    if (has('trailblazer')) {
      s.trailblazerTiles+=count
      const threshold=rule('trailblazer','tilesPerReduction')
      while(s.trailblazerTiles>=threshold) {
        s.trailblazerTiles-=threshold
        // Only running cooldowns of Wayfaring powers qualify. The future
        // activations use the shared character-owned expiry registry.
        // A power can explicitly opt out; no running cooldown means no RNG.
        const active=Object.keys(s.cooldowns).filter(id=>ARTIFACT_ABILITIES.domains.wayfaring.includes(id) &&
          rule(id,'trailblazerEligible')!==false && s.cooldowns[id]>turnCount)
        if (!active.length) continue
        const bonus=artifactXpBonusPP()/100
        const reduction=1+(bonus>0 && chance(Math.min(1,bonus))?1:0)
        reduceCooldowns(id => active.includes(id), reduction)
      }
    }
  }
  function visitDepth() {
    if(player.hp<=0 || deathTransition) return
    const s=state()
    if(s.lastVisitedZ===currentZ) return
    s.lastVisitedZ=currentZ
    if(currentZ>=0) return
    if(!s.visitedZ.includes(currentZ)) {
      s.visitedZ.push(currentZ)
      if(has('expedition')) {
        healPlayer(Math.max(1,Math.floor(playerMaxHp()*rule('expedition','healFraction'))))
        artifactAbilityMessage('expedition','Expedition rewards your descent.','A strange power rewards your descent.')
        gainXp(rule('expedition','xp'))
      }
    }
    if(Mining.activeLevel() && has('prospector') && !s.prospectedZ.includes(currentZ)) {
      s.prospectedZ.push(currentZ)
      s.miningUntil=turnCount+rule('prospector','duration')
      artifactAbilityMessage('prospector','Prospector sharpens your mining skills.','A strange power sharpens your mining skills.')
    }
  }
  function cooldownRemaining(id) { return Math.max(0,(state().cooldowns[id] || 0)-turnCount) }
  function startCooldown(id,duration=rule(id,'cooldown')) {
    if(!Number.isInteger(duration) || duration<=0 || cooldownRemaining(id)) return false
    state().cooldowns[id]=turnCount+duration
    return true
  }
  // Cooldowns belong to the character. Both domain-specific reductions use
  // this operation, leaving activation triggers and RNG entirely independent.
  function reduceCooldowns(eligible, turns) {
    if (!Number.isInteger(turns) || turns <= 0) return 0
    let changed = 0
    for (const [id, expiry] of Object.entries(state().cooldowns)) {
      if (expiry <= turnCount || !eligible(id)) continue
      state().cooldowns[id] = Math.max(turnCount, expiry - turns)
      changed++
    }
    return changed
  }
  function effectiveMining() {
    const bonus=has('prospector') && state().miningUntil>turnCount ? rule('prospector','miningBonus') : 0
    return Math.min(MINING_CONFIG.skill.max,player.mining+bonus)
  }
  function restEvery() { return has('firekeeper') ? rule('firekeeper','restEvery') : 4 }
  function regenAmount(amount) {
    return has('nomads_curse') ? (state().discoveredPrevious ? amount*rule('nomads_curse','regenMultiplier') : 0) : amount
  }
  function damage() { state().enduranceSteps=0; state().ordinaryStep=false }
  function ordinaryStep() { state().ordinaryStep=has('endurance') }
  function finishTurn() {
    const s=state()
    Frostwalker.reconcileCrossing()
    waterTurn()
    if(player.hp>0 && !deathTransition && has('endurance') && s.ordinaryStep) {
      if(++s.enduranceSteps>=rule('endurance','steps')) {
        s.enduranceSteps=0
        healPlayer(Math.max(1,Math.floor(playerMaxHp()*rule('endurance','healFraction'))))
        if(raceDef()?.regenEvery) healPlayer(regenAmount(1))
        Campfires.extraFoodPulse()
        artifactAbilityMessage('endurance','Endurance restores your strength.','A strange power restores your strength.')
      }
    } else s.enduranceSteps=0
    s.ordinaryStep=false
    s.lavaPaid=false
    s.discoveredPrevious=s.discoveredPending>0
    s.discoveredPending=0
    rememberPosition()
    s.stealth.moved=false;s.stealth.fought=false
    if(s.phantom && s.phantom.until<=turnCount) s.phantom=null
    if(s.farsight && s.farsight.until<=turnCount) s.farsight=null
  }
  function resetEndurance() { damage() }
  function rootImmune() { return has('escape_artist') }
  function clearRoot() {
    if (!player.rootTurns) return
    player.rootTurns=0; player.rootSourceId=null; player.rootFlavor=null
    artifactAbilityMessage('escape_artist','Escape Artist frees you from the grip!', 'A strange power frees you from the grip!')
  }
  function webPullDistance(e, ordinaryDistance) {
    if (!has('escape_artist')) return ordinaryDistance
    const percent=randInt(rule('escape_artist','pullMinPercent'),rule('escape_artist','pullMaxPercent'))
    const advantage=Math.floor(Math.max(0,playerAtk()-enemyAtk(e))/rule('escape_artist','atkPerTile'))
    return Math.max(0,Math.min(ordinaryDistance,Math.round(ordinaryDistance*percent/100)-advantage))
  }
  function countOrdinaryStep() {
    if (!has('longstrider')) return
    const s=state()
    const threshold=()=>randInt(rule('longstrider','minSteps'),rule('longstrider','maxSteps'))
    if (!s.longstriderThreshold) s.longstriderThreshold=threshold()
    if (++s.longstriderSteps >= s.longstriderThreshold) {
      s.longstriderSteps=0; s.longstriderThreshold=threshold(); s.longstriderSkip=true
      artifactAbilityMessage('longstrider','Longstrider grants a swift step!', 'A strange power quickens your step!')
    }
  }
  function enemyPhases() {
    const s=state()
    let phases=1-(s.longstriderSkip?1:0)
    s.longstriderSkip=false
    if (has('never_look_back')) {
      if (s.discoveredPrevious && chance(rule('never_look_back','skipChance'))) {
        phases--
        artifactAbilityMessage('never_look_back','Never Look Back quickens your actions!', 'A strange power quickens your actions!')
      } else if (!s.discoveredPrevious && chance(rule('never_look_back','extraChance'))) {
        phases++
        artifactAbilityMessage('never_look_back','Never Look Back gives enemies an additional turn!', 'A strange power gives enemies an additional turn!', 'bad')
      }
    }
    return Math.max(0,phases)
  }
  function onDodge() {
    if (!has('windwalker') || state().windwalkerReady || !chance(rule('windwalker','chance'))) return
    state().windwalkerReady=true
    artifactAbilityMessage('windwalker','Windwalker: a free step is ready!', 'You spot an opening to slip away!')
  }
  function clearFreeStep() { state().windwalkerReady=false }
  function clearCombat() {
    clearForestwalk(); clearUnseen(); state().stealth.position=null; state().stealth.moved=false; state().stealth.fought=false;
    state().rush=null; state().farsight=null; state().phantom=null; state().phantomSurprise=[]; state().history=[];
    clearFreeStep(); state().skirmisherReady=false; state().tidefangReady=false; state().longstriderSkip=false
  }
  function adjacentEnemy(x,y) {
    return enemies.some(e=>e.alive && e.hp>0 && onCurrentLevel(e) && !enemyIsPassive(e) && Math.max(Math.abs(e.x-x),Math.abs(e.y-y))===1)
  }
  function stepContext(x,y) {
    // Sample before tile entry; a trap or an ambush cannot retroactively create a retreat.
    return {swimming:has('tidefang') && isActuallySwimming(x,y), neighbors:has('skirmisher') ? enemies.filter(e=>e.alive&&e.hp>0&&onCurrentLevel(e)&&!enemyIsPassive(e)&&Math.max(Math.abs(e.x-x),Math.abs(e.y-y))===1) : []}
  }
  function onStep(context) {
    const ready=(id)=>{
      if (state()[id+'Ready']) return
      state()[id+'Ready']=true
      artifactAbilityMessage(id, `${ARTIFACT_ABILITIES.abilities[id].name} prepares your next strike!`, 'A strange power prepares your next strike!')
    }
    if (has('skirmisher') && context.neighbors.some(e=>e.alive&&onCurrentLevel(e)&&Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))>1)) ready('skirmisher')
    const tile=map[player.y]?.[player.x]
    if (has('tidefang') && context.swimming && !isActuallySwimming(player.x,player.y) && tile!=='river' && tile!=='frozenriver' && !isLakeIce(tile) && adjacentEnemy(player.x,player.y)) ready('tidefang')
  }
  function takeCritBonus(id) {
    const ready=state()[id+'Ready']; state()[id+'Ready']=false
    return ready && has(id) ? rule(id,'critBonusPP')/100 : 0
  }
  function ruleWaterDuration() { return has('water_walking') ? rule('water_walking','duration') : 0 }
  function waterRemaining() { return Math.max(0,ruleWaterDuration()-state().waterWalkingUsed) }
  function walkingOnWater(x=player.x,y=player.y) { return deepSwimmingWater(x,y) && waterRemaining()>0 }
  function exhaustWaterWalking() { if(has('water_walking'))state().waterWalkingUsed=rule('water_walking','duration') }
  function waterLand() { state().waterWalkingUsed=0 }
  function lavaImmune() { return has('ashen_wanderer') }
  function lavaWalk() { return lavaImmune() || has('emberwalker') }
  function lavaAt(x,y) { return map[y]?.[x]==='lava' }
  function environmentDamage(id,fraction,cause) {
    const damage=artifactLosePlayerHp(Math.max(1,Math.round(playerMaxHp()*fraction)))
    if(damage){
      log(id==='emberwalker'?`The lava burns you for ${damage} HP.`:`Swimming burns you for ${damage} HP.`,'bad')
      spawnDamageNumber(player.x,player.y,damage,RENDER_STYLE.damage.playerHit)
    }
    absorbPlayerFatalDamage();checkPlayerHealthWarning()
    if(player.hp<=0)die(null,cause)
  }
  // Paid per entered lava tile, including free steps and Rush. Stationary
  // world turns pay once; the pending flag is saved for a partial Rush.
  function lavaEntry(from) {
    if(!lavaAt(player.x,player.y)||lavaImmune()||!has('emberwalker') || (from.x===player.x&&from.y===player.y))return
    state().lavaPaid=true
    environmentDamage('emberwalker',rule('emberwalker','damageFraction'),'lava')
  }
  function environmentalTurn() {
    if(player.hp<=0||deathTransition)return
    if(lavaAt(player.x,player.y)&&!lavaImmune()&&!state().lavaPaid&&(has('emberwalker')||!player.godMode))
      environmentDamage('emberwalker',rule('emberwalker','damageFraction'),'lava')
  }
  // One elapsed world turn, including enemy displacement and ice collapse.
  // Exhaustion applies after the complete protected turn, not before its enemies.
  function waterTurn() {
    if(player.hp<=0||deathTransition)return
    const wasSwimming=isActuallySwimming()
    if(walkingOnWater()){
      state().waterWalkingUsed++
      if(!waterRemaining()){
        artifactAbilityMessage('water_walking','Water Walking expires! You begin swimming.','The magic beneath your feet fades!','bad')
        // All eight protected turns have been spent; the next action spends swimming endurance.
        resetSwimming();player.swimPosition={x:player.x,y:player.y,z:currentZ}
      }
    } else if(!deepSwimmingWater(player.x,player.y)) waterLand()
    if(player.hp>0&&!deathTransition&&wasSwimming&&isActuallySwimming()&&has('ashen_wanderer'))
      environmentDamage('ashen_wanderer',rule('ashen_wanderer','swimDamageFraction'),'ashen curse')
  }
  function rechargeCastaway() { state().castawaySpent=false }
  function rescueCastaway() {
    if(player.hp>0||!has('castaway')||state().castawaySpent||!isActuallySwimming())return false
    const shore=drowningShore(true)
    if(!shore)return false
    state().castawaySpent=true
    const skill=raceHas('swims')?100:player.swimming
    const fraction=Math.min(rule('castaway','maxHealFraction'),Math.floor(skill/rule('castaway','skillPerHeal'))*rule('castaway','healFractionPerStep'))
    clearAutoPath();pendingMove=null;clearSpiderWeb();player.miningArmedTarget=null
    player.x=shore.x;player.y=shore.y
    resetSwimming();waterLand();markPlayerPositionChanged()
    player.hp=Math.min(playerMaxHp(),1+Math.floor(playerMaxHp()*fraction))
    stopCameraAnimation();snapCameraToPlayer();invalidateUndergroundFov();minimapDirty=true
    artifactAbilityMessage('castaway','Castaway saves you! You wash up on the shore.','A strange power carries you to safety!')
    discoverPlayerSight()
    return true
  }
  function validPosition(p) {
    return p && Number.isInteger(p.x)&&Number.isInteger(p.y)&&Number.isInteger(p.z)&&
      ['surface','chain','tower','crypt2'].includes(p.kind)
  }
  function position() { return {x:player.x,y:player.y,z:currentZ,kind:currentLevelKind()} }
  function sameLevel(p) { return p && p.z===currentZ && p.kind===currentLevelKind() }
  function rememberPosition() {
    if(player.hp<=0 || deathTransition) return
    const h=state().history, entry={...position(),turn:turnCount}
    if(h.at(-1)?.turn===turnCount) h[h.length-1]=entry
    else h.push(entry)
    while(h.length>rule('backtrack','historyTurns')+1) h.shift()
  }
  function baselinePosition() { if(!state().history.length) rememberPosition() }
  // Strict terrain even in God Mode. No doors, mechanisms, mining, occupants or hidden mimics.
  function dryOpen(x,y) { return !deepSwimmingWater(x,y) && isWalkable(x,y) && artifactFreeStepTileOpen(x,y) }
  function blinkTargets() {
    return reachableTeleportTiles(player.x,player.y,rule('blink','range'),dryOpen)
  }
  function backtrackTarget() {
    const p=state().history.find(p=>p.turn===turnCount-rule('backtrack','historyTurns'))
    return sameLevel(p) && (p.x!==player.x||p.y!==player.y) && dryOpen(p.x,p.y) ? p:null
  }
  // The two concealment sources have independent lifetimes. Unseen caches
  // BOTH results by stable enemy identity; Forestwalker carries only successful
  // ordinary forest checks across the gap, never creates new checks there.
  function validStealth(s) {
    return !!s && (s.position===null || validPosition(s.position)) &&
      ['moved','fought','dodgeReady','unseenActive'].every(k=>typeof s[k]==='boolean') &&
      ['forestGap','unseenGap'].every(k=>Number.isInteger(s[k])&&s[k]>=0) &&
      s.forestGap<=rule('forestwalker','openTiles') && s.unseenGap<=rule('unseen','openTiles') &&
      Array.isArray(s.observers) && s.observers.every(o=>(typeof o.id==='string'||Number.isInteger(o.id))&&typeof o.hidden==='boolean') &&
      new Set(s.observers.map(o=>o.id)).size===s.observers.length
  }
  const stealth=()=>state().stealth
  function forestTile(x,y) {return currentZ===0 && ['forest','ancientForest'].includes(map[y]?.[x])}
  function nearCover() {
    return [[0,0],...DIRS8].some(([dx,dy])=>{
      const x=player.x+dx,y=player.y+dy,tile=map[y]?.[x]
      if(!tile)return false
      if(currentZ===0 && (grasslandTrees.has(keyXY(x,y)) || ['forest','ancientForest','taiga'].includes(tile)&&!foragedTiles.has(keyXY(x,y))))return true
      return /wall$/.test(tile)||['mountain','snowmountain','boulder','blackpillar','crypt2niche','towerwindow','dwarvenliftshaft'].includes(tile)
    }) && !Campfires.litAt(player.x,player.y)
  }
  function clearForestwalk() {stealth().forestGap=0;stealth().dodgeReady=false}
  function clearUnseen() {const s=stealth();s.unseenActive=false;s.unseenGap=0;s.observers=[]}
  function samePosition(a,b) {return !!a&&!!b&&a.x===b.x&&a.y===b.y&&a.z===b.z&&a.kind===b.kind}
  function clearForestChecks() {
    for(const e of enemies)if(onCurrentLevel(e)){e.forestConcealX=null;e.forestConcealY=null}
  }
  function moved(teleport=false) {
    const s=stealth(), from=s.position, to=position();s.moved=true;s.position=to
    if(teleport||!sameLevel(from)||Math.max(Math.abs(from.x-to.x),Math.abs(from.y-to.y))!==1){clearForestwalk();clearUnseen();if(has('forestwalker'))clearForestChecks();return}
    if(has('forestwalker')) {
      if(playerHasForestCover()){s.forestGap=0;clearForestChecks()}
      else if(!Campfires.litAt(player.x,player.y) && !s.forestGap && forestTile(from.x,from.y) && !foragedTiles.has(keyXY(from.x,from.y)) && !Campfires.litAt(from.x,from.y)) {
        s.forestGap=1
        for(const e of enemies)if(onCurrentLevel(e)&&e.forestConcealX===from.x&&e.forestConcealY===from.y){e.forestConcealX=to.x;e.forestConcealY=to.y}
      } else {clearForestwalk();clearForestChecks()}
    }
    if(has('unseen')&&s.unseenActive) {
      if(nearCover())s.unseenGap=0
      else if(Campfires.litAt(player.x,player.y)||s.unseenGap>=rule('unseen','openTiles'))clearUnseen()
      else s.unseenGap++
    }
  }
  function beginStealthTurn() {
    const s=stealth(),p=position()
    if(s.position&&!samePosition(s.position,p))moved()
    if(!playerHasForestCover()&&(!forestGap()||Campfires.litAt(player.x,player.y)))clearForestwalk()
    if(!has('unseen')||Campfires.litAt(player.x,player.y))clearUnseen()
    else if(!s.moved&&!s.fought&&nearCover()&&!s.unseenActive){s.unseenActive=true;s.unseenGap=0;s.observers=[]}
    s.position=p;s.moved=false;s.fought=false
    reconcileTruce()
  }
  function fighting() {stealth().fought=true;clearUnseen()}
  function forestGap() {return has('forestwalker')&&stealth().forestGap>0&&!Campfires.litAt(player.x,player.y)}
  function unseenActive() {return has('unseen')&&stealth().unseenActive&&!Campfires.litAt(player.x,player.y)}
  function ignoresCover(e) {return (has('forestwalker')||unseenActive())&&(enemyHasAbility(e,'trueSight')||enemyHasAbility(e,'blind'))}
  function coverAvailable() {return playerHasForestCover()||forestGap()||unseenActive()}
  function cachedUnseen(e) {return unseenActive()?stealth().observers.find(o=>o.id===e.id):undefined}
  function rememberUnseen(e,hidden) {if(unseenActive()&&!cachedUnseen(e))stealth().observers.push({id:e.id,hidden})}
  function exposedTo(e) {const existing=cachedUnseen(e);if(existing)existing.hidden=false}
  function forestBonus() {return has('forestwalker')&&playerHasForestCover()?rule('forestwalker','hideBonusPP')/100:0}
  function ambushChance(base) {return has('forestwalker')?base*rule('forestwalker','ambushMultiplier'):base}
  function forestSuccess() {
    const s=stealth()
    if(!has('forestwalker')||!playerHasForestCover()||s.dodgeReady||cooldownRemaining('forestwalker')||!(raceDef()?.id==='halfling'||raceHas('noForestAmbush')))return
    s.dodgeReady=true;startCooldown('forestwalker',rule('forestwalker','dodgeCooldown'))
    artifactAbilityMessage('forestwalker','Forestwalker prepares a guaranteed dodge!','You sense an opening to evade!')
  }
  function takeForestDodge() {
    const s=stealth()
    if(!has('forestwalker')||!s.dodgeReady||(!playerHasForestCover()&&!forestGap()))return false
    s.dodgeReady=false
    artifactAbilityMessage('forestwalker','Forestwalker evades the attack!','You evade the attack!')
    return true
  }
  function beast(e) {
    const t=ENEMY_TEMPLATE_BY_NAME[e.baseName||e.name]||e
    return t.family==='living'&&!t.humanoid
  }
  function truce(e) {
    const t=ENEMY_TEMPLATE_BY_NAME[e.baseName||e.name]||e
    return has('one_with_the_wild')&&!cooldownRemaining('one_with_the_wild')&&forestTile(player.x,player.y)&&beast(e)&&
      (t.aggro??e.aggro??0)>0&&!e.adaptiveEventId&&!t.adaptiveOnly&&!t.ultraRare&&!AdaptivePlayerTrolling.forestBeastAgitated(e)
  }
  function playerAggression(e) {
    fighting()
    if(!has('one_with_the_wild')||!beast(e)||!(forestTile(player.x,player.y)||forestTile(e.x,e.y))||cooldownRemaining('one_with_the_wild'))return
    startCooldown('one_with_the_wild')
    artifactAbilityMessage('one_with_the_wild','You break your truce with the wild!','The wild turns against you!', 'bad')
  }
  function endPursuit(e) {
    e.aware=false;e.alarmed=false;e.alarmedZ=null;e.alarmedLevelKind=null
    e.bowRetreatHold=false;e.bowEvasion=null
    cancelPreparedEnemyAbility(e)
  }
  function reconcileTruce() {
    if(!has('one_with_the_wild')||!forestTile(player.x,player.y))return
    for(const e of enemies)if(e.alive&&onCurrentLevel(e)&&truce(e))endPursuit(e)
  }
  function stopTrucePursuit(e) {if(!truce(e))return false;endPursuit(e);return true}
  function peace(e) {
    if(!stopTrucePursuit(e))return false
    if(enemyWanderMode(e)==='far'||enemyIsOnScreen(e))enemyWander(e)
    return true
  }
  // Geological connectivity, not movement permission. Never cross solid rock,
  // structural walls or map void; water, fixtures, and doors do not split rooms.
  const surveyObstacles = new Set(['water','lava','boulder','dwarvenrubble','cryptrubble',
    'dwarvendoorclosed','dwarvendoorlocked','dwarvenprisondoorclosed','dwarvenprisondoorlocked',
    'dwarvengateclosed','dwarvengatelocked','dwarvenstatue','dwarvenbed','dwarvenbedbarricade',
    'dwarvenshelf','dwarventable','dwarvencrate','dwarventhrone','dwarvenprisonbars',
    'dwarvenlever','dwarvenleverpulled','dwarvengasvalve','dwarvencrusherjaw','dwarvencrusherpinch',
    'mazegatesealed','towerentrancesealed'])
  function surveyPassable(tile) {return !!TILE[tile]?.walk || surveyObstacles.has(tile)}
  function surveyComponent(terrain,x,y) {
    const w=terrain[0]?.length||0,h=terrain.length, cells=new Uint8Array(w*h), queue=[]
    const pass=(x,y)=>surveyPassable(terrain[y]?.[x])
    if(!pass(x,y))return {cells,queue,w,h}
    cells[y*w+x]=1;queue.push(y*w+x)
    for(let i=0;i<queue.length;i++) {
      const index=queue[i], px=index%w, py=Math.floor(index/w)
      for(const [dx,dy] of DIRS8) {
        const nx=px+dx,ny=py+dy,n=ny*w+nx
        if(nx<0||nx>=w||ny<0||ny>=h||cells[n]||!pass(nx,ny))continue
        // Diagonal contact between two solid corners is not a passage.
        if(dx&&dy&&!pass(px+dx,py)&&!pass(px,py+dy))continue
        cells[n]=1;queue.push(n)
      }
    }
    return {cells,queue,w,h}
  }
  function farsightSize() {
    return Math.min(rule('farsight','maxSize'),rule('farsight','baseSize')+
      Math.floor(Math.max(0,playerMf())/rule('farsight','mfPerSize')))
  }
  function farsightTargets() {
    const seen=currentZ===0?discovered:undergroundDiscovered, size=farsightSize()
    const w=map[0]?.length||0,h=map.length, result=[]
    if(!seen||w<size||h<size)return result
    const component=currentZ<0?surveyComponent(map,player.x,player.y):null
    // Integral grids make every square check constant time and keep the scan
    // independent of viewport, actor positions and RNG.
    const stride=w+1, bad=new Int32Array(stride*(h+1)), connected=component?new Int32Array(bad.length):null
    const walkable=component?new Int32Array(bad.length):null
    for(let y=0;y<h;y++) {
      let b=0,c=0,f=0
      for(let x=0;x<w;x++) {
        const tile=map[y][x], reachable=component?.cells[y*w+x]||0
        b+=Number(!!seen[y]?.[x]||!tile||tile==='towervoid'||(!!component&&surveyPassable(tile)&&!reachable))
        c+=reachable
        const i=(y+1)*stride+x+1
        bad[i]=bad[i-stride]+b
        if(connected) {
          connected[i]=connected[i-stride]+c
          f+=Number(!!reachable&&!!TILE[tile]?.walk)
          walkable[i]=walkable[i-stride]+f
        }
      }
    }
    const sum=(grid,x,y)=>grid[(y+size)*stride+x+size]-grid[y*stride+x+size]-grid[(y+size)*stride+x]+grid[y*stride+x]
    const preferred=component?Math.ceil(size*size*rule('farsight','minWalkableFraction')):0
    let best=-1
    for(let y=0;y<=h-size;y++)for(let x=0;x<=w-size;x++) {
      if(sum(bad,x,y)||(connected&&!sum(connected,x,y)))continue
      // Choose uniformly among sufficiently open squares. In narrow caverns,
      // keep only the best available density instead of disabling the power.
      const score=walkable?Math.min(preferred,sum(walkable,x,y)):0
      if(score<best)continue
      if(score>best){result.length=0;best=score}
      result.push(y*w+x)
    }
    return result
  }
  function farsightRegion() {
    const r=state().farsight
    return sameLevel(r)&&r.until>turnCount?r:null
  }
  function farsightEnemies() {
    const r=farsightRegion()
    if(!r||currentZ>=0)return []
    return enemies.filter(e=>e.alive&&e.hp>0&&onCurrentLevel(e)&&e.pendingAbility?.type!=='burrow'&&
      e.x>=r.x&&e.x<r.x+r.size&&e.y>=r.y&&e.y<r.y+r.size)
  }
  function revealFarsight(index) {
    const size=farsightSize(),x=index%map[0].length,y=Math.floor(index/map[0].length)
    // Mark directly: magical knowledge is not physical exploration.
    for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++)markDiscovered(x+dx,y+dy)
    state().farsight={...position(),x,y,size,until:turnCount+1+rule('farsight','visionTurns')}
  }
  function caveSurvey(x=player.x,y=player.y) {
    if(!has('spelunker'))return null
    const tile=map[y]?.[x]
    let depth, arrival
    if(currentZ===0&&tile==='caveentrance'&&caves.some(c=>!c.crypt&&c.entrances?.some(e=>e.x===x&&e.y===y))) {
      depth=1;arrival='caveentrance'
    } else if(currentZ<0&&currentLevelKind()==='chain'&&tile==='cavedown') {
      depth=chainDepthForZ(currentZ)+1;arrival='caveup'
    } else return null
    const terrain=depthUndergroundMap(depth)
    if(terrain?.[y]?.[x]!==arrival)return null
    const {queue,w}=surveyComponent(terrain,x,y)
    const count=queue.length
    if(!count)return null
    let deeper=false,otherExit=false
    for(const index of queue) {
      const px=index%w,py=Math.floor(index/w),t=terrain[py][px]
      if(t==='cavedown'&&depthUndergroundMap(depth+1)?.[py]?.[px]==='caveup')deeper=true
      if(t==='dwarvenhole'&&depth===2&&TILE[depthUndergroundMap(3)?.[py]?.[px]]?.walk)deeper=true
      if(px===x&&py===y)continue
      if(t==='caveentrance'&&depth===1&&surfaceMap[py]?.[px]==='caveentrance')otherExit=true
      if(t==='caveup'&&depth>1&&depthUndergroundMap(depth-1)?.[py]?.[px]==='cavedown')otherExit=true
    }
    const sizes=rule('spelunker','sizes')
    const size=sizes.find(s=>count<=s.max)?.name||'Vast'
    return {size,deeper,otherExit}
  }
  function describeCave(x,y) {
    const r=caveSurvey(x,y)
    if(r) log(`${playerKnowsArtifactAbility('spelunker')?'Spelunker:':'You sense a'} ${r.size.toLowerCase()} cave. ${r.deeper?'A passage leads deeper.':'No deeper passage.'} ${r.otherExit?'There is another way out.':'No other exit.'}`,'info')
  }
  function activeItem(item) { return item?.kind==='artifact' && item.artifactSlot==='trinket' &&
    ARTIFACT_ABILITIES.domains.wayfaring.includes(item.abilityId) &&
    ARTIFACT_ABILITIES.abilities[item.abilityId]?.enabled && rule(item.abilityId,'active')===true }
  function activationTargets(id) {
    return id==='farsight'?farsightTargets():id==='blink'?blinkTargets():id==='backtrack'?[backtrackTarget()].filter(Boolean):id==='phantom_trail'?[position()]:DIRS8.map(([dx,dy])=>({x:player.x+dx,y:player.y+dy})).filter(p=>rushOpen(p.x,p.y))
  }
  function canActivate(idx) {
    const item=player.inventory[idx],id=item?.abilityId
    return activeItem(item)&&item.identified&&!state().rush&&player.hp>0&&!deathTransition&&!cooldownRemaining(id)&&
      !(id==='rush'&&player.rootTurns>0)&&activationTargets(id).length>0
  }
  function activate(idx) {
    const item=player.inventory[idx], id=item?.abilityId
    if(!activeItem(item)||!item.identified||state().rush||player.hp<=0||deathTransition||!canUseItemsWhileSwimming()) return false
    if(cooldownRemaining(id)) {log('This power is still recovering.','info');return false}
    if(id==='rush' && player.rootTurns>0) {log('You cannot sprint while rooted.','info');return false}
    const targets=activationTargets(id)
    if(!targets.length){log('There is no valid destination for this power.','info');return false}
    ensureReplayItemIds(); const scope=recordReplayAction({type:'useItem',action:'wayfaringPower',idx,replayId:item.replayId})
    try {
      baselinePosition(); clearAutoPath(); pendingMove=null; bowAimTarget=null; toggleInv(false)
      if(id==='rush') {hoveredAutoPath=null;state().rush={steps:0,iceChecked:false};render();return true}
      startCooldown(id)
      const dest=id==='backtrack'||id==='phantom_trail'?targets[0]:pick(targets)
      if(id==='farsight') revealFarsight(dest)
      else if(id==='phantom_trail') state().phantom={...dest,until:turnCount+rule(id,'duration')}
      else {
        finishPlayerStep(dest.x,dest.y,{voluntary:false,teleport:true})
        stopCameraAnimation(); snapCameraToPlayer(); invalidateUndergroundFov(); minimapDirty=true
      }
      artifactAbilityMessage(id,`${rule(id,'name')} activated!`,'Magic!')
      if(player.hp>0&&!deathTransition)consumeItemTurn()
      if(id==='farsight'&&player.hp>0&&!deathTransition&&!replayPlaying&&!replaySimulationMode) {
        const r=farsightRegion()
        if(r)openFarsightView(r)
      }
      return true
    } finally {finishRecordedReplayAction(scope)}
  }
  function rushOpen(x,y) {return artifactFreeStepTileOpen(x,y) && (isWalkable(x,y)||deepSwimmingWater(x,y)||(lavaAt(x,y)&&lavaWalk()))}
  function rushStep(dx,dy) {
    const r=state().rush
    if(!r||!Number.isInteger(dx)||!Number.isInteger(dy)||Math.max(Math.abs(dx),Math.abs(dy))!==1) return false
    if(player.rootTurns>0||!has('rush')) return finishRush()
    const x=player.x+dx,y=player.y+dy
    if(!rushOpen(x,y)) return false
    const scope=recordReplayAction({type:'rushStep',dx,dy})
    try {
      // The first actual step commits the power. Cancellation before moving is free.
      if(!r.steps){startCooldown('rush');artifactAbilityMessage('rush','Rush activated!','Magic!')}
      r.steps++
      const fromTile=map[player.y]?.[player.x]
      const trapped=DungeonTraps.isTrigger(map[y]?.[x]) || DungeonHazards.isCrusherTrigger(x,y)
      const moved=finishPlayerStep(x,y)
      const displaced=player.x!==x||player.y!==y
      r.iceChecked=moved && isLakeIce(map[player.y]?.[player.x])
      if(r.iceChecked)tickLakeIce({fromTile})
      const iceCollapsed=r.iceChecked && !isLakeIce(map[player.y]?.[player.x])
      stopCameraAnimation();snapCameraToPlayer()
      if(!state().rush || player.hp<=0||deathTransition){state().rush=null;return true}
      if(!moved||displaced||trapped||iceCollapsed||player.rootTurns>0||r.steps>=rule('rush','maxSteps')) finishRush(false)
      else {updateHud();render()}
      return true
    } finally {finishRecordedReplayAction(scope)}
  }
  function finishRush(record=true) {
    const r=state().rush;if(!r)return false
    const scope=record?recordReplayAction({type:'rushEnd'}):undefined
    try {state().rush=null;if(r.steps&&player.hp>0&&!deathTransition) consumeItemTurn({iceAlreadyChecked:r.iceChecked});else render();return true}
    finally {if(record)finishRecordedReplayAction(scope)}
  }
  function rushRemaining() {
    const r=state().rush
    return r ? rule('rush','maxSteps')-r.steps : 0
  }
  function phantomPosition() {const p=state().phantom;return sameLevel(p)&&p.until>=turnCount?p:null}
  function phantomTarget(e,range,projectile=false) {
    const p=phantomPosition()
    if(!p||!onCurrentLevel(e)||enemyHasAbility(e,'trueSight')||enemyHasAbility(e,'blind')||
       Math.max(Math.abs(e.x-p.x),Math.abs(e.y-p.y))>range||(e.x===p.x&&e.y===p.y)||
       (p.x===player.x&&p.y===player.y)||occupied.has(keyXY(p.x,p.y))||isTempleGround(map[p.y]?.[p.x])||
       (currentZ===0&&(sanctuaryDistance(p.x,p.y)<=FLEE_DISTANCE||npcs.some(n=>n.x===p.x&&n.y===p.y))))return null
    const path=projectilePathBetween(e.x,e.y,p.x,p.y)
    if(projectile && (!UndergroundFov.canSee(map,e.x,e.y,p.x,p.y) || path.slice(1,-1).some(q=>projectileTerrainBlocks(e,q.x,q.y)||projectileCreatureBlocks(e,q.x,q.y)||(q.x===player.x&&q.y===player.y))))return null
    return {p,path}
  }
  function fooled(e,target,delay=0) {
    if(!state().phantomSurprise.includes(e.id))state().phantomSurprise.push(e.id)
    log(`The ${e.name} attacks your phantom!`,'good')
    spawnDamageNumber(target.p.x,target.p.y,'Phantom!','#c7a5f6',delay)
  }
  function divert(e,range,projectile=false,feedback=true) {
    const target=phantomTarget(e,range,projectile)
    if(!target||!chance(rule('phantom_trail','decoyChance')))return null
    if(feedback)fooled(e,target)
    return target
  }
  // An active pursuer can spend its action attacking the abandoned position,
  // even if it no longer has a legal attack against the real player.
  function distractPursuer(e) {
    if(!phantomPosition()||playerInsideSanctuary()||enemyInsideSanctuary(e)||
       enemyIsPassive(e)||enemyIsFleeing(e)||truce(e))return false
    const shot=enemyIsShooter(e)?shooterDefinition(e):null
    const melee=phantomTarget(e,ATTACK_RANGE)
    const ranged=shot&&phantomTarget(e,shot.range||effectiveAggroRange(e),true)
    const useRanged=!!ranged&&(!melee||e.shooterMode==='ranged')
    const target=useRanged?ranged:melee
    if(!target||!chance(rule('phantom_trail','decoyChance')))return false
    if(switchEnemyShooterMode(e,useRanged?'ranged':'melee'))return true
    if(useRanged){
      e.shotsRemaining=Math.max(0,e.shotsRemaining-1)
      attackPhantomRanged(e,target,shot.projectile,RANGED_CONFIG.projectileAnimationMs,true)
    }else{
      attackPhantomMelee(e,target)
    }
    return true
  }
  function attackPhantomMelee(e,target){
    revealEnemyInvisibility(e)
    const presentation=beginEnemyAttackAnim(e,target.p)
    exposeEnemyAfterMelee(e)
    fooled(e,target,presentation.delay+Math.floor(ENEMY_MELEE_ANIM_MS/2))
  }
  function attackPhantomRanged(e,target,projectile,ms,volley){
    const presentation=queueEnemyAttackPresentation(ms,volley)
    spawnProjectileAnim(target.path,projectile,ms,presentation.delay)
    fooled(e,target,presentation.delay+ms)
  }
  function takeSurprise(e) {
    const i=state().phantomSurprise.indexOf(e.id)
    if(i<0)return false
    state().phantomSurprise.splice(i,1);return true
  }
  function forgetEnemy(e) {state().stealth.observers=state().stealth.observers.filter(o=>o.id!==e.id);const i=state().phantomSurprise.indexOf(e.id);if(i>=0)state().phantomSurprise.splice(i,1)}
  return {farsightSize,farsightTargets,farsightRegion,farsightEnemies,caveSurvey,describeCave,moved,reconcileTruce,stopTrucePursuit,exposedTo,beginStealthTurn,fighting,coverAvailable,forestGap,unseenActive,ignoresCover,cachedUnseen,rememberUnseen,forestBonus,ambushChance,forestSuccess,takeForestDodge,truce,playerAggression,peace,exhaustWaterWalking,ruleWaterDuration,waterRemaining,walkingOnWater,waterLand,lavaEntry,lavaWalk,lavaImmune,environmentalTurn,rechargeCastaway,rescueCastaway,baselinePosition,rememberPosition,activeItem,canActivate,activate,rushStep,finishRush,rushRemaining,phantomPosition,divert,distractPursuer,attackPhantomMelee,attackPhantomRanged,takeSurprise,forgetEnemy,blinkTargets,backtrackTarget,freshState, validate, templeCap, discover, visitDepth, effectiveMining, restEvery,
    rootImmune, clearRoot, webPullDistance, countOrdinaryStep, enemyPhases, onDodge, clearFreeStep, clearCombat, stepContext, onStep, takeCritBonus,
    cooldownRemaining, startCooldown, reduceCooldowns, regenAmount, damage, ordinaryStep, finishTurn, resetEndurance, coldTerrain, positionStats, maxHpPct, adrenalineSpeed, homecomingBlocker, drifterMagicFind,
    terrainDefense, terrainSpeed, extraDownhillPush, syncHealth, clearFreezing, inventoryChanged}
})()
