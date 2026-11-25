/* Geomancy: domain-owned cooldown impulses and buried-treasure proximity. */
const ArtifactGeomancy = (() => {
  const rule = (id, key) => artifactRule(id, key)
  let lodestoneNearby = null // derived state; never serialized or advanced by rendering
  let stones = [] // temporary world obstacles, keyed by exact (x,y,z,levelKind)
  let nextStoneId = 1
  let pressSlide = null
  const pressStepMs = 300
  const quakeLeadMs = 650 // full Rupture shake before the first victim sinks
  const sinkMs = 500
  let earthmawCast = null // transient feedback on the cast floor
  let sounding = null // one-turn movement echoes, owned by world turns
  let aftershocks = [] // permanent-world positions and pre-rolled spell profile
  let rune = null // one world-anchored proximity trap per character
  let cairnReleaseBusy = false // transient lock during asynchronous world travel
  const activePowers = new Set(['stonemaker', 'stone_circle', 'stonepress', 'cragbowl',
    'sounding_stone', 'grounding', 'earthmaw', 'runic_fuse', 'runebound_aegis', 'spell_cairn'])
  const floorTiles = new Set(['grass','forest','taiga','snow','sand','hill',
    'cavefloor','cavefloor2','marble','cryptfloor','crypt2floor'])
  const atCurrentLevel = stone => stone.z === currentZ && stone.levelKind === currentLevelKind()
  const here = (x,y) => ({x,y,z:currentZ,levelKind:currentLevelKind()})

  function serialize() { return {nextStoneId, stones:stones.map(stone=>({...stone})),
    sounding:sounding ? {...sounding, traces:sounding.traces.map(p=>({...p}))} : null,
    aftershocks:aftershocks.map(p=>({...p,tiles:p.tiles.map(t=>({...t}))})),
    rune:rune ? structuredClone(rune) : null} }
  function restore(data) {
    pressSlide=null
    earthmawCast=null
    const echo=data?.sounding
    if (echo !== null && (!echo || !Number.isInteger(echo.until) ||
        !Number.isInteger(echo.z) || !['surface','chain','tower','crypt2'].includes(echo.levelKind) ||
        !Number.isInteger(echo.x) || !Number.isInteger(echo.y) ||
        !Array.isArray(echo.traces) || echo.traces.some(p=>
          !Number.isInteger(p.x) || !Number.isInteger(p.y) ||
          typeof p.id !== 'string' || !p.id)))
      throw Error('Invalid saved Geomancy sounding state')
    if (!data || !Number.isSafeInteger(data.nextStoneId) || data.nextStoneId < 1 ||
        !Array.isArray(data.stones) || data.stones.some(s=>
          !Number.isSafeInteger(s.id) || s.id<1 || !Number.isInteger(s.x) ||
          !Number.isInteger(s.y) || !Number.isInteger(s.z) ||
          !['surface','chain','crypt2','tower'].includes(s.levelKind) ||
          !floorTiles.has(s.underlay) || !Number.isInteger(s.expiresAtTurn) ||
          s.expiresAtTurn<0 || !Number.isInteger(s.progress) || s.progress<0 ||
          s.progress>=6) || new Set(data.stones.map(s=>s.id)).size!==data.stones.length ||
        data.stones.some(s=>s.id>=data.nextStoneId)) throw Error('Invalid saved Geomancy stone state')
    if (!Array.isArray(data.aftershocks) || data.aftershocks.some(p=>
        !Number.isSafeInteger(p.dueTurn) || p.dueTurn<0 ||
        !Number.isInteger(p.z) ||
        !['surface','chain','crypt2','tower'].includes(p.levelKind) ||
        !Number.isInteger(p.minDamage) || p.minDamage<0 ||
        !Number.isInteger(p.maxDamage) || p.maxDamage<p.minDamage ||
        !Array.isArray(p.tiles) || p.tiles.length>MAP_W*MAP_H ||
        p.tiles.some(t=>!Number.isInteger(t.x) || !Number.isInteger(t.y) ||
          t.x<0 || t.y<0 || t.x>=MAP_W || t.y>=MAP_H)))
      throw Error('Invalid saved Geomancy aftershock state')
    const savedRune=data.rune
    const validRune=savedRune===null || (savedRune && typeof savedRune==='object' &&
      Number.isInteger(savedRune.x) && savedRune.x>=0 && savedRune.x<MAP_W &&
      Number.isInteger(savedRune.y) && savedRune.y>=0 && savedRune.y<MAP_H &&
      Number.isInteger(savedRune.z) &&
      ['surface','chain','crypt2','tower'].includes(savedRune.levelKind) &&
      ARTIFACT_ABILITIES.abilities.runic_fuse.scrolls.includes(savedRune.kind) &&
      typeof savedRune.cross==='boolean' && typeof savedRune.aftershock==='boolean' &&
      (savedRune.kind!=='scrollOfFireball' || (Array.isArray(savedRune.tiles) &&
        savedRune.tiles.length<=MAP_W*MAP_H && savedRune.tiles.length>0 &&
        savedRune.tiles.every(t=>Number.isInteger(t.x) && Number.isInteger(t.y) &&
          t.x>=0 && t.x<MAP_W && t.y>=0 && t.y<MAP_H))))
    if (!validRune) throw Error('Invalid saved Geomancy rune state')
    rune=savedRune ? structuredClone(savedRune) : null
    cairnReleaseBusy=false
    stones=data.stones.map(s=>({...s})); nextStoneId=data.nextStoneId
    sounding=echo ? {...echo, traces:echo.traces.map(p=>({...p}))} : null
    aftershocks=data.aftershocks.map(p=>({...p,tiles:p.tiles.map(t=>({...t}))}))
  }
  function resetWorld() {pressSlide=null;earthmawCast=null;stones=[];nextStoneId=1;sounding=null;aftershocks=[];rune=null;
    cairnReleaseBusy=false;lodestoneNearby=null}
  function temporaryAt(x,y) {
    return stones.find(stone=>stone.x===x && stone.y===y && atCurrentLevel(stone)) || null
  }
  function removeTemporaryAt(x,y) {
    const stone=temporaryAt(x,y)
    if (!stone || !mutateGeomancyTile(stone,'boulder',stone.underlay)) return false
    stones=stones.filter(s=>s.id!==stone.id)
    return true
  }
  // Cast geometry is frozen at cast time: later artifact swaps, player moves,
  // or a change of viewed global Z cannot alter a waiting fracture pattern.
  function scheduleAftershock(tiles, effect, enabled = playerHasArtifactAbility('aftershock')) {
    if (!enabled || !tiles.length) return false
    aftershocks.push({dueTurn:turnCount+rule('aftershock','delay')+1,
      z:currentZ,levelKind:currentLevelKind(),
      minDamage:effect.minDamage,maxDamage:effect.maxDamage,
      tiles:tiles.map(p=>({x:p.x,y:p.y}))})
    return true
  }
  function pendingAftershockTiles() {
    return aftershocks.filter(p=>p.dueTurn>turnCount && p.z===currentZ &&
      p.levelKind===currentLevelKind()).flatMap(p=>p.tiles)
  }
  function drawAftershockWarnings(visible) {
    const marked=new Set()
    for(const p of pendingAftershockTiles()) {
      const key=keyXY(p.x,p.y)
      if(marked.has(key) || !undergroundTileVisible(p.x,p.y) ||
          (visible && !visible.has(key))) continue
      marked.add(key)
      const px=Math.round((p.x-camX)*TILE_PX),py=Math.round((p.y-camY)*TILE_PX)
      if(px < -TILE_PX || py < -TILE_PX || px > canvas.width || py > canvas.height) continue
      ctx.save()
      const image=RENDER_STYLE.overlays?.ruptureWarningImage
      if (USE_TILE_IMAGES && image) drawImageVisual(px,py,{image,scale:1},0.85)
      else {
        const s=TILE_PX
        ctx.strokeStyle='#c18a62';ctx.lineWidth=Math.max(2,Math.round(s*0.045))
        ctx.beginPath();ctx.moveTo(px+s*.15,py+s*.15)
        ctx.lineTo(px+s*.52,py+s*.43);ctx.lineTo(px+s*.33,py+s*.81)
        ctx.moveTo(px+s*.52,py+s*.43);ctx.lineTo(px+s*.84,py+s*.29)
        ctx.stroke()
      }
      ctx.restore()
    }
  }
  function resolveAftershock(p) {
    const cells=new Set(p.tiles.map(t=>keyXY(t.x,t.y)))
    const onLevel=currentZ===p.z && currentLevelKind()===p.levelKind
    // No active-map lookup for offscreen victims: every floor has its own
    // globally addressable enemies and the delay belongs to world turns.
    const targets=enemies.filter(e=>e.alive && e.hp>0 &&
      (e.level||0)===p.z && (e.levelKind|| (p.z===0?'surface':p.z>0?'tower':'chain'))===p.levelKind &&
      cells.has(keyXY(e.x,e.y)))
    const impactDelay=onLevel ? queueAftershockShake() : 0
    const affected=targets.map(e=>({enemy:e,damage:randInt(p.minDamage,p.maxDamage)}))
    const hitsPlayer=onLevel && cells.has(keyXY(player.x,player.y))
    const playerDamage=hitsPlayer?randInt(p.minDamage,p.maxDamage):0
    let hurt=0
    for(const {enemy:e,damage} of affected) {
      if (enemyImmunityActive(e)) continue
      const amount=Math.floor(damage*rule('aftershock','damageFraction'))
      if(amount<=0)continue
      const actual=Math.min(e.hp,amount)
      e.hp-=amount;hurt+=actual>0?1:0
      if (onLevel) {
        revealEnemyInvisibility(e);breakEnemyFear(e);wakeSleepingEnemy(e)
        alarmEnemy(e);alarmEnemiesNearHit(e)
        spawnDamageNumber(e.x,e.y,amount,RENDER_STYLE.damage.enemyHit,impactDelay)
      }
      absorbEnemyFatalHit(e)
    }
    if(hitsPlayer){
      const amount=Math.floor(playerDamage*rule('aftershock','damageFraction'))
      if(amount>0){
        artifactLosePlayerHp(amount)
        spawnDamageNumber(player.x,player.y,amount,RENDER_STYLE.damage.playerHit||'#ff6655',impactDelay)
        absorbPlayerFatalDamage()
      }
    }
    const fatal=player.hp<=0
    for(const {enemy:e} of affected) if(e.alive && e.hp<=0)
      killEnemy(e,true,'aftershock',impactDelay)
    if(fatal) {player.hp=0;die(null,'aftershock',impactDelay)}
    if(onLevel){
      log(hurt || hitsPlayer ? 'The fractured earth erupts in a second shock!':
        'The fractured earth settles.', 'info')
      if (!replayAnimationsDisabled && !replaySimulationMode && (hurt||hitsPlayer))
        spawnDamageNumber(player.x,player.y,
          playerKnowsArtifactAbility('aftershock')?'Aftershock!':'Tremor!', '#c18a62',impactDelay)
    }
  }
  function tick() {
    // Remove before resolving: a kill callback cannot re-trigger an aftershock.
    const due=aftershocks.filter(p=>p.dueTurn<=turnCount)
    aftershocks=aftershocks.filter(p=>p.dueTurn>turnCount)
    for(const p of due) resolveAftershock(p)
    if (sounding && turnCount > sounding.until) sounding=null
    for (const e of enemies) if (e.geomancyBuriedUntil &&
        turnCount >= e.geomancyBuriedUntil) {
      e.geomancyBuriedUntil=0
      // Buried actors reserve the same tile they emerge into. No shoving,
      // alternate square or virtual floor is ever involved.
      if (e.alive && onCurrentLevel(e) && enemyIsVisibleOnMainView(e)) {
        log(`The ${e.name} erupts from the earth!`, 'bad')
        spawnDamageNumber(e.x,e.y,'Emerged!','#c9ad87')
      }
    }
    for (const e of enemies) if (e.geomancyPetrifiedUntil &&
        turnCount >= e.geomancyPetrifiedUntil) {
      e.geomancyPetrifiedUntil=0
      if (e.alive && onCurrentLevel(e) && enemyIsVisibleOnMainView(e))
        log(`The ${e.name} stirs as the stone cracks away.`, 'info')
    }
    let localCount=0
    for (const stone of stones) if (stone.expiresAtTurn<=turnCount) {
      if (mutateGeomancyTile(stone,'boulder',stone.underlay) && atCurrentLevel(stone)) localCount++
    }
    stones=stones.filter(stone=>stone.expiresAtTurn>turnCount)
    if (localCount) log(localCount===1?'A summoned boulder crumbles away.':
      'The summoned stones crumble away.', 'info')
  }
  // A struck stone listens only for actual ground movement on its own
  // global Z level. Traces are independent of discovered, FOV, and animation.
  function recordEnemyMove(e, fromX, fromY) {
    if (!sounding || turnCount !== sounding.until || !e?.alive ||
        !onCurrentLevel(e) || currentZ !== sounding.z ||
        currentLevelKind() !== sounding.levelKind ||
        (fromX === e.x && fromY === e.y) ||
        enemyHasAbility(e,'fly') || enemyHasAbility(e,'ethereal') ||
        map[e.y]?.[e.x] === 'water' ||
        Math.max(Math.abs(e.x-sounding.x),Math.abs(e.y-sounding.y)) >
          rule('sounding_stone','radius')) return
    const existing=sounding.traces.find(p=>p.id===e.id)
    if (existing) {existing.x=e.x;existing.y=e.y}
    else sounding.traces.push({id:e.id,x:e.x,y:e.y})
  }
  function soundingTraces() {
    return sounding && sounding.until===turnCount && sounding.z===currentZ &&
      sounding.levelKind===currentLevelKind() ? sounding.traces : []
  }

  // Earthmaw reserves the creature's actual cell, not a virtual tile or map.
  // The actor is absent from combat, vision and AI until its world-turn deadline.
  function buried(e) {
    return !!e && e.alive !== false && e.hp > 0 &&
      (e.geomancyBuriedUntil || 0) > turnCount
  }
  function earthmawEligible(e) {
    return !!e && e.alive && e.hp > 0 && onCurrentLevel(e) &&
      !petrified(e) && !buried(e) && !e.wallAmbushHidden &&
      e.pendingAbility?.type !== 'burrow' &&
      Number.isInteger(e.tier) && e.tier >= 1 && e.tier <= rule('earthmaw','maxTier') &&
      !enemyHasAbility(e,'ethereal') && !enemyHasAbility(e,'fly') &&
      !['water','river','frozenriver'].includes(map[e.y]?.[e.x]) &&
      Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y)) <= rule('earthmaw','radius')
  }
  function earthmawTargets() {
    // Stable ordering, including independent rolls for adjacent duplicates.
    return enemies.filter(earthmawEligible).sort((a,b)=>
      a.y-b.y || a.x-b.x || String(a.id).localeCompare(String(b.id)))
  }
  // Lookup does not mutate currentZ/map. The crypt is an isolated legacy
  // exception at -2; neither its source nor its destination is used here.
  function earthmawLowerLanding(e) {
    if (currentLevelKind()==='crypt2') return null
    const z=currentZ-1
    const kind=z>0?'tower':z===0?'surface':'chain'
    const terrain=z>0?towerLevels[z-1]?.map:z===0?surfaceMap:
      depthUndergroundMap(chainDepthForZ(z))
    const tile=terrain?.[e.y]?.[e.x]
    if (!tile || !TILE[tile]?.walk || CAVE_TRANSITION_TILES.has(tile) ||
        !floorTiles.has(tile) || TowerMaze.isProtectedWall(z,e.x,e.y) ||
        (z===0 && grasslandTrees.has(keyXY(e.x,e.y)))) return null
    if (player.x===e.x && player.y===e.y && currentZ===z &&
        currentLevelKind()===kind) return null
    if (z===0 && npcs.some(n=>n.x===e.x && n.y===e.y)) return null
    if (enemies.some(other=>other!==e && other.alive && other.hp>0 &&
        (other.level||0)===z && (other.levelKind || kind)===kind &&
        other.pendingAbility?.type!=='burrow' && other.x===e.x && other.y===e.y)) return null
    if (groundItems.some(g=>(g.level||0)===z &&
        (g.levelKind || (z===0?'surface':'chain'))===kind && g.x===e.x && g.y===e.y)) return null
    // Cave identity follows the actual carved subregion, but every cave
    // remains in its shared global Z grid. Fort/mine interiors use -1.
    const submaps=z===-1?caveMaps:z<-1?
      deepLevels[chainDepthForZ(z)-2]?.caveMaps:null
    const caveIndex=submaps?.findIndex(cm=>floorTiles.has(cm?.[e.y]?.[e.x])) ?? -1
    if (z===-1 && caveIndex<0) return null
    return {z,kind,caveIndex,tile}
  }
  function drawEarthmawCast(now, visible) {
    if (!earthmawCast) return
    const cast=earthmawCast
    const elapsed=Math.max(0,now-cast.start)
    const t=elapsed/(quakeLeadMs+sinkMs+200)
    const sink=Math.min(1,Math.max(0,(elapsed-quakeLeadMs)/sinkMs))
    if (t>=1 || !atCurrentLevel(cast)) {earthmawCast=null;return}
    const radius=rule('earthmaw','radius'),size=TILE_PX
    const cx=(cast.x-camX+0.5)*size,cy=(cast.y-camY+0.5)*size
    ctx.save()
    ctx.beginPath()
    for (let y=Math.max(0,cast.y-radius);y<=Math.min(MAP_H-1,cast.y+radius);y++)
      for (let x=Math.max(0,cast.x-radius);x<=Math.min(MAP_W-1,cast.x+radius);x++)
        if (undergroundTileVisible(x,y) && (!visible || visible.has(keyXY(x,y))))
          ctx.rect((x-camX)*size,(y-camY)*size,size,size)
    ctx.clip()
    // A shock front runs to the exact outer edge, then lingers and fades.
    const half=(radius+0.5)*size*Math.min(1,t/0.32)
    ctx.globalAlpha=1-t
    ctx.fillStyle='rgba(204,151,88,0.18)'
    ctx.fillRect(cx-half,cy-half,2*half,2*half)
    ctx.strokeStyle='#e9be80';ctx.lineWidth=Math.max(2,size*0.07)
    ctx.strokeRect(cx-half,cy-half,2*half,2*half)
    for (const p of cast.holes) {
      const x=(p.x-camX+0.5)*size,y=(p.y-camY+0.6)*size
      if (sink>0 && sink<1) {
        ctx.save()
        ctx.globalAlpha=1
        drawRuptureCracks(x-size/2,y-size*.6)
        ctx.restore()
      }
      if (sink<1) {
        ctx.save()
        const left=x-size/2,top=y-size*.6
        ctx.beginPath();ctx.rect(left,top,size,size*(1-.24*sink));ctx.clip()
        ctx.globalAlpha=p.shimmers?0.28:1
        drawEnemyVisual(left,top+size*sink,p.enemy,p.shimmers)
        ctx.restore()
      }
    }
    ctx.restore()
  }
  function swallowEarthmaw() {
    const targets=earthmawTargets()
    const animate=targets.length && !replayAnimationsDisabled && !replaySimulationMode
    if (animate) {
      earthmawCast={...here(player.x,player.y),start:performance.now(),holes:[]}
      shakeRuptureScreen()
      runAnimationLoop()
    }
    let swallowed=0,descended=0,resisted=0,killed=0
    const [minDamage,maxDamage]=rule('earthmaw','damage')
    for (const e of targets) {
      const seen=animate && enemyIsVisibleOnMainView(e)
      ArtifactWayfaring.playerAggression(e)
      wakeSleepingEnemy(e)
      alarmEnemy(e)
      if (chance(rule('earthmaw','resistChance'))) {
        if (seen) spawnDamageNumber(e.x,e.y,e.name+' resisted','#d7c6a9',quakeLeadMs,1100)
        resisted++;continue
      }
      const damage=randInt(minDamage,maxDamage)
      if (!enemyImmunityActive(e)) {
        e.hp-=damage
        absorbEnemyFatalHit(e)
        if (seen) spawnDamageNumber(e.x,e.y,damage,RENDER_STYLE.damage.enemyHit,quakeLeadMs)
        if (e.hp<=0) {
          killEnemy(e,true,'earthmaw',animate?quakeLeadMs:0)
          killed++
          continue
        }
        breakEnemyFear(e)
        triggerEnemyShellRetreat(e)
      }
      const landing=earthmawLowerLanding(e)
      // No chance roll for descent unless the exact lower cell is legal.
      const descends=!!landing && chance(rule('earthmaw','depthTransferChance'))
      if (seen) {
        earthmawCast.holes.push({x:e.x,y:e.y,enemy:{...e},shimmers:enemyInvisibleShimmer(e)})
        spawnDamageNumber(e.x,e.y,e.name+' swallowed','#ffd58e',quakeLeadMs,1100)
      }
      cancelPreparedEnemyAbility(e)
      e.farPath=null;e.chargeAnim=undefined;e.hasteAnim=undefined
      e.animStart=undefined;e.attackVisualQueue=[];e.attackVisualTargets=null
      e.geomancyBuriedUntil=turnCount+rule('earthmaw','duration')+1
      if (descends) {
        occupied.delete(keyXY(e.x,e.y))
        e.level=landing.z;e.levelKind=landing.kind;e.caveIndex=landing.caveIndex
        if (e.alarmed) {e.alarmedZ=landing.z;e.alarmedLevelKind=landing.kind}
        e.homeX=e.x;e.homeY=e.y;e.homeTileType=landing.tile
        descended++
      }
      swallowed++
    }
    return {swallowed,descended,resisted,killed}
  }
  function petrified(e) {
    return !!e && e.alive !== false && e.hp > 0 &&
      (e.geomancyPetrifiedUntil || 0) > turnCount
  }
  function petrifyOnMelee(e,damage) {
    // Bare hands, a bow wielded in melee and indirect/extra splash damage
    // do not qualify. A boss uses the exact same chance and duration.
    const weapon=player.equip.weapon
    if (!(damage>0) || !e?.alive || e.hp<=0 || !weapon ||
        (weapon.rangedRange || 0)>0 || equippedShortBow() ||
        !playerHasArtifactAbility('petrify') || petrified(e) ||
        !chance(rule('petrify','chance'))) return false
    e.geomancyPetrifiedUntil=turnCount+rule('petrify','duration')+1
    cancelPreparedEnemyAbility(e)
    if (enemyIsVisibleOnMainView(e)) {
      artifactAbilityMessage('petrify',
        `Petrify turns the ${e.name} to stone!`,
        `The ${e.name} turns to stone!`)
      spawnDamageNumber(e.x,e.y,'Petrified!','#c5c5cc')
    }
    return true
  }

  // Grounding suppresses exactly one *active* ability on the struck instance.
  // Passive species traits, innate immunities and equipped ranged weapons are
  // intentionally absent from the data whitelist. The decision consumes one
  // charge regardless of whether that opponent has a suppressible ability.
  function groundingHit(e, damage, impactDelay = 0) {
    if (!player.groundingArmed || !(damage > 0) || !e || buried(e)) return false
    player.groundingArmed = false
    const allowed = rule('grounding', 'suppressibleAbilities')
    const candidates = (e.abilities || []).filter(id =>
      allowed.includes(id) && !e.groundingLostAbilities?.includes(id))
    const lost = candidates.length && e.alive && e.hp>0 ? pick(candidates) : null
    if (lost) {
      e.groundingLostAbilities.push(lost)
      // Resolve an in-progress telegraph before it can use the removed skill.
      if (e.pendingAbility?.type === lost) cancelPreparedEnemyAbility(e)
      if (lost === 'immunity') e.immunityUntilTurn = 0
      if (lost === 'invisibility') e.invisibleUntilTurn = 0
      if (lost === 'wallAmbush') e.wallAmbushHidden = false
    }
    if (enemyIsVisibleOnMainView(e)) {
      log(playerKnowsArtifactAbility('grounding')
        ? (lost ? `Grounding strips the ${e.name} of ${enemyAbilityDisplayName(lost)}!` :
          `Grounding discharges against the ${e.name}, but finds no active power.`)
        : (lost ? `The ${e.name} suddenly falters!` : 'A faint tremor fades away.'),
        lost ? 'good' : 'info')
      if (!replayAnimationsDisabled && !replaySimulationMode)
        spawnDamageNumber(e.x,e.y,lost ? 'Grounded!' : 'Fizzle!','#c5b9a4',impactDelay)
    }
    return true
  }

  function clearGround(x,y) {
    const tile=map[y]?.[x]
    return floorTiles.has(tile) && TILE[tile]?.walk &&
      !(x===player.x && y===player.y) &&
      !enemies.some(e=>e.alive && onCurrentLevel(e) && e.x===x && e.y===y) &&
      !groundItems.some(g=>onCurrentLevel(g) && g.x===x && g.y===y) &&
      !npcs.some(n=>currentZ===0 && n.x===x && n.y===y) &&
      !TowerMaze.isProtectedWall(currentZ,x,y) &&
      !(currentZ===0 && grasslandTrees.has(keyXY(x,y)))
  }
  function candidates() {
    return DIRS8.map(([dx,dy])=>({x:player.x+dx,y:player.y+dy,dx,dy}))
      .filter(p=>clearGround(p.x,p.y))
  }
  function circleLayout(direction) {
    if (!Array.isArray(direction) || direction.length!==2 ||
        !direction.every(v=>Number.isInteger(v) && Math.abs(v)<=1) ||
        (!direction[0] && !direction[1])) return null
    const [dx,dy]=direction,x=player.x+dx,y=player.y+dy
    if (!clearGround(x,y)) return null
    const ring=[]
    for(const [ax,ay] of DIRS8) {
      if(ax===dx && ay===dy) continue
      const xx=player.x+ax,yy=player.y+ay
      if (!TILE[map[yy]?.[xx]]?.walk) continue // wall/stone already forms the ring
      if (!clearGround(xx,yy)) return null // do not entomb a creature/fixture
      ring.push({x:xx,y:yy})
    }
    return ring.length ? ring : null
  }
  const validDirection = direction => Array.isArray(direction) && direction.length===2 &&
    direction.every(v=>Number.isInteger(v) && Math.abs(v)<=1) &&
    (direction[0]!==0 || direction[1]!==0)

  function naturalUnderlay(x,y) { return tileUnderlays[tileUnderlayKey(x,y,currentZ)] }
  const stoneProgressKey = (x,y) => currentZ===0 ? keyXY(x,y) :
    `${currentZ}:${keyXY(x,y)}`
  function stoneUnderlay(x,y) { return temporaryAt(x,y)?.underlay ?? naturalUnderlay(x,y) }
  function canMoveBoulderAt(x,y) {
    return map[y]?.[x]==='boulder' && floorTiles.has(stoneUnderlay(x,y))
  }
  function canOccupyStone(x,y) {
    const tile=map[y]?.[x]
    return floorTiles.has(tile) && !!TILE[tile]?.walk &&
      !(x===player.x && y===player.y) &&
      !groundItems.some(g=>onCurrentLevel(g) && g.x===x && g.y===y) &&
      !(currentZ===0 && npcs.some(n=>n.x===x && n.y===y)) &&
      !TowerMaze.isProtectedWall(currentZ,x,y) &&
      !(currentZ===0 && grasslandTrees.has(keyXY(x,y)))
  }
  function activeEnemyAt(x,y) {
    return enemies.find(e=>e.alive && e.hp>0 && onCurrentLevel(e) &&
      e.pendingAbility?.type!=='burrow' && e.x===x && e.y===y) || null
  }
  function forceTileOpen(e,fromX,fromY,dx,dy,positions=null) {
    const x=fromX+dx,y=fromY+dy
    const free = (xx,yy) => enemyKnockbackTerrainOpen(e,xx,yy) &&
      !(xx===player.x && yy===player.y) &&
      !(currentZ===0 && npcs.some(n=>n.x===xx && n.y===yy)) &&
      !(positions ? [...positions.values()].some(p=>p.x===xx && p.y===yy) :
        occupied.has(keyXY(xx,yy)))
    return !petrified(e) && !buried(e) && free(x,y) &&
      (!dx || !dy || (free(fromX+dx,fromY) && free(fromX,fromY+dy)))
  }

  // Preview the entire push without RNG or mutations. Only a successful cast
  // may consume time, even when the first victim is crushed into a wall.
  function stonepressPlan(direction) {
    if (!validDirection(direction)) return null
    const [dx,dy]=direction,firstX=player.x+dx,firstY=player.y+dy
    if (!canMoveBoulderAt(firstX,firstY)) return null
    const positions=new Map(enemies.filter(e=>e.alive && e.hp>0 && onCurrentLevel(e) &&
      e.pendingAbility?.type!=='burrow').map(e=>[e,{x:e.x,y:e.y}]))
    const moves=[];let x=firstX,y=firstY
    for(let i=0;i<rule('stonepress','maxSteps');i++) {
      const nx=x+dx,ny=y+dy
      if (dx && dy && (!isWalkable(x+dx,y) || !isWalkable(x,y+dy) ||
          (currentZ===0 && (grasslandTrees.has(keyXY(x+dx,y)) ||
            grasslandTrees.has(keyXY(x,y+dy)))))) break
      const victim=[...positions].find(([,p])=>p.x===nx && p.y===ny)?.[0] || null
      if (victim) {
        if (petrified(victim) || buried(victim)) break
        // When the path is blocked the boulder slams its victim against the
        // obstacle, but cannot move onto the creature's occupied tile.
        const push=forceTileOpen(victim,nx,ny,dx,dy,positions)
        moves.push({fromX:x,fromY:y,toX:nx,toY:ny,victim,
          push,crush:!push})
        if (!push) break
        positions.set(victim,{x:nx+dx,y:ny+dy})
      } else {
        if (!canOccupyStone(nx,ny)) break
        moves.push({fromX:x,fromY:y,toX:nx,toY:ny,victim:null,push:false,crush:false})
      }
      x=nx;y=ny
    }
    return moves.length ? moves : null
  }

  // The boulder and the enemy are chosen independently, with deterministic
  // distance/y/x ties. A blocked path never selects a convenient substitute.
  function cragbowlPlan() {
    const visibleRocks=[]
    const yMin=Math.max(0,Math.floor(camY)), yMax=Math.min(map.length,yMin+VIEW_H+1)
    const xMin=Math.max(0,Math.floor(camX)), xMax=Math.min(map[0]?.length||0,xMin+VIEW_W+1)
    for(let y=yMin;y<yMax;y++) for(let x=xMin;x<xMax;x++)
      if (canMoveBoulderAt(x,y) && undergroundTileVisible(x,y))
        visibleRocks.push({x,y})
    const distance=({x,y})=>Math.max(Math.abs(x-player.x),Math.abs(y-player.y))
    const sort=(a,b)=>distance(a)-distance(b)||a.y-b.y||a.x-b.x
    visibleRocks.sort(sort)
    const targets=enemies.filter(e=>e.alive && e.hp>0 && onCurrentLevel(e) &&
      !petrified(e) && !buried(e) && enemyIsVisibleOnMainView(e)).sort(sort)
    const rock=visibleRocks[0],target=targets[0]
    if (!rock || !target) return null
    const path=projectilePathBetween(rock.x,rock.y,target.x,target.y)
    if (!path || path.length<2 || path.at(-1).x!==target.x || path.at(-1).y!==target.y) return null
    for(let i=1;i<path.length;i++) {
      const p=path[i],prev=path[i-1],sx=Math.sign(p.x-prev.x),sy=Math.sign(p.y-prev.y)
      if (i<path.length-1 &&
          (TILE[map[p.y]?.[p.x]]?.projectileBlock ||
          (currentZ===0 && grasslandTrees.has(keyXY(p.x,p.y))) ||
          activeEnemyAt(p.x,p.y) || (p.x===player.x && p.y===player.y) ||
          (currentZ===0 && npcs.some(n=>n.x===p.x && n.y===p.y)))) return null
      // The trace may pass diagonally through a sealed two-corner gap.
      if (sx && sy && TILE[map[prev.y]?.[p.x]]?.projectileBlock &&
          TILE[map[p.y]?.[prev.x]]?.projectileBlock) return null
    }
    const prev=path[path.length-2],dx=Math.sign(target.x-prev.x),dy=Math.sign(target.y-prev.y)
    if (!dx && !dy) return null
    const chain=[target],seen=new Set([target])
    for(let step=1;step<map.length;step++) {
      const e=activeEnemyAt(target.x+dx*step,target.y+dy*step)
      if (!e || seen.has(e) || petrified(e) || buried(e)) break
      chain.push(e);seen.add(e)
    }
    return {rock,target,path,dx,dy,chain}
  }

  function moveStone(fromX,fromY,toX,toY) {
    const underlay=stoneUnderlay(fromX,fromY),destination=map[toY]?.[toX]
    if (!floorTiles.has(underlay) || !canOccupyStone(toX,toY) ||
        activeEnemyAt(toX,toY)) return false
    const source=here(fromX,fromY),dest=here(toX,toY)
    if (!mutateGeomancyTile(source,'boulder',underlay)) return false
    if (!mutateGeomancyTile(dest,destination,'boulder')) {
      mutateGeomancyTile(source,underlay,'boulder')
      return false
    }
    const transient=temporaryAt(fromX,fromY)
    if (transient) {
      transient.x=toX;transient.y=toY;transient.underlay=destination
    } else {
      delete tileUnderlays[tileUnderlayKey(fromX,fromY,currentZ)]
      tileUnderlays[tileUnderlayKey(toX,toY,currentZ)]=destination
      const oldKey=stoneProgressKey(fromX,fromY)
      const nextKey=stoneProgressKey(toX,toY)
      const progress=miningSurfaceProgress[oldKey]
      delete miningSurfaceProgress[oldKey]
      if (progress!==undefined) miningSurfaceProgress[nextKey]=progress
    }
    return true
  }
  function destroyStone(x,y) {
    if (temporaryAt(x,y)) return removeTemporaryAt(x,y)
    const underlay=naturalUnderlay(x,y)
    if (!floorTiles.has(underlay) ||
        !mutateGeomancyTile(here(x,y),'boulder',underlay)) return false
    delete tileUnderlays[tileUnderlayKey(x,y,currentZ)]
    delete miningSurfaceProgress[stoneProgressKey(x,y)]
    return true
  }
  function boulderDamage(victim,damage,source,impactDelay=0) {
    if (!victim.alive || victim.hp<=0 || !onCurrentLevel(victim) || enemyImmunityActive(victim)) return false
    ArtifactWayfaring.playerAggression(victim)
    victim.hp-=damage
    absorbEnemyFatalHit(victim)
    groundingHit(victim,damage,impactDelay)
    if (enemyIsVisibleOnMainView(victim))
      spawnDamageNumber(victim.x,victim.y,damage,RENDER_STYLE.damage.enemyHit,impactDelay)
    if (victim.hp<=0) killEnemy(victim,true,source,impactDelay)
    else {
      breakEnemyFear(victim)
      triggerEnemyShellRetreat(victim)
      alarmEnemy(victim)
    }
    return true
  }
  function stonepressFrame(now) {
    if (!pressSlide) return null
    const slide=pressSlide
    const progress=Math.max(0,(now-slide.start)/pressStepMs)
    if (!atCurrentLevel(slide) || progress>=slide.steps.length) {
      pressSlide=null
      return null
    }
    const index=Math.floor(progress),step=slide.steps[index],t=progress-index
    const distance=step.crush ? 0.36*Math.sin(Math.PI*t) : t
    return {slide,index,t,x:step.fromX+(step.toX-step.fromX)*distance,
      y:step.fromY+(step.toY-step.fromY)*distance}
  }

  function throwStonepress(moves) {
    // Announce the committed attack before its first possible kill/XP/drop.
    artifactAbilityMessage('stonepress','Stonepress drives a boulder forward!',
      'A boulder surges forward!')
    let fromX=moves[0].fromX,fromY=moves[0].fromY
    const animated=!replayAnimationsDisabled && !replaySimulationMode
    const timing=animated ? queueEnemyAttackPresentation(moves.length*pressStepMs) : null
    const steps=[]
    const struck=new Set();let impacts=0,moved=0,crushed=0
    for(const step of moves) {
      const victim=step.victim
      const impactDelay=timing ? timing.delay+(steps.length+0.5)*pressStepMs : 0
      if (victim?.alive && victim.hp>0 && !struck.has(victim)) {
        struck.add(victim);impacts++
        const [lo,hi]=rule('stonepress','hitDamage')
        boulderDamage(victim,randInt(lo,hi),'stonepress',impactDelay)
      }
      if (step.crush) {
        steps.push(step)
        if (victim?.alive && victim.hp>0) {
          const [lo,hi]=rule('stonepress','crushDamage')
          if (boulderDamage(victim,randInt(lo,hi),'stonepress',impactDelay)) crushed++
        }
        break
      }
      if (victim?.alive && victim.hp>0 && step.push) {
        const nx=victim.x+Math.sign(step.toX-step.fromX)
        const ny=victim.y+Math.sign(step.toY-step.fromY)
        const dx=nx-victim.x,dy=ny-victim.y
        if (!forceTileOpen(victim,victim.x,victim.y,dx,dy)) break
        const vx=victim.x,vy=victim.y
        occupied.delete(keyXY(vx,vy));victim.x=nx;victim.y=ny
        occupied.add(keyXY(nx,ny));victim.farPath=null
        finishEnemyMove(victim,vx,vy,true)
      }
      if (victim?.alive && victim.hp>0 && victim.x===step.toX && victim.y===step.toY) break
      if (!moveStone(fromX,fromY,step.toX,step.toY)) break
      steps.push(step)
      moved++
      fromX=step.toX;fromY=step.toY
    }
    if (timing && steps.length) pressSlide={...here(fromX,fromY),underlay:stoneUnderlay(fromX,fromY),
      start:timing.start,steps}
    return {impacts,moved,crushed}
  }
  function throwCragbowl(plan) {
    if (!destroyStone(plan.rock.x,plan.rock.y)) return null
    // Combat resolves immediately and deterministically. Only its visual
    // flight and damage/death presentation are delayed until impact.
    const flightMs=Math.min(450,plan.path.length*45)
    const presentation=queueEnemyAttackPresentation(flightMs)
    const impactDelay=presentation.delay+flightMs
    if (!replayAnimationsDisabled && !replaySimulationMode)
      spawnProjectileAnim(plan.path,'bigStone',flightMs,presentation.delay)
    artifactAbilityMessage('cragbowl',
      `Cragbowl hurls a boulder! The stone strikes ${plan.chain.length} creature${plan.chain.length===1?'':'s'}!`,
      'A boulder flies toward the enemy!')
    const [lo,hi]=rule('cragbowl','damage'),damage=randInt(lo,hi)
    for(const [index,e] of plan.chain.entries())
      boulderDamage(e,index===0?damage:Math.floor(damage*rule('cragbowl','chainFraction')),
        'cragbowl',impactDelay)
    // Move each surviving chain atomically one tile per step. Traps and other
    // entry effects run only after occupancy is coherent for the whole row.
    let shifted=0
    for(let i=0;i<rule('cragbowl','knockback');i++) {
      const alive=plan.chain.filter(e=>e.alive && e.hp>0 && onCurrentLevel(e))
      if (!alive.length) break
      const group=new Set(alive.map(e=>keyXY(e.x,e.y)))
      const free=(e,x,y)=>enemyKnockbackTerrainOpen(e,x,y) &&
        !(x===player.x && y===player.y) &&
        !(currentZ===0 && npcs.some(n=>n.x===x && n.y===y)) &&
        (!occupied.has(keyXY(x,y)) || group.has(keyXY(x,y)))
      if (alive.some(e=>petrified(e) || buried(e) ||
          !free(e,e.x+plan.dx,e.y+plan.dy) ||
          (plan.dx && plan.dy && (!free(e,e.x+plan.dx,e.y) || !free(e,e.x,e.y+plan.dy))))) break
      const old=alive.map(e=>({e,x:e.x,y:e.y}))
      for(const entry of old) occupied.delete(keyXY(entry.x,entry.y))
      for(const entry of old) {
        entry.e.x+=plan.dx;entry.e.y+=plan.dy
        entry.e.farPath=null
        occupied.add(keyXY(entry.e.x,entry.e.y))
      }
      shifted++
      for(const entry of old) if(entry.e.alive) finishEnemyMove(entry.e,entry.x,entry.y,true)
    }
    return {targets:plan.chain.length,damage,shifted}
  }

  function canActivate(idx,direction) {
    const item=player.inventory[idx],id=item?.abilityId
    if (item?.kind!=='artifact' || item.artifactSlot!=='trinket' || !item.identified ||
        !activePowers.has(id) || !rule(id,'enabled') || player.hp<=0 ||
        deathTransition || player.wayfaring?.rush || cooldownRemaining(id) ||
        !canUseItemsWhileSwimming() ||
        (['stonepress','cragbowl'].includes(id) && playerInsideSanctuary())) return false
    if (id==='runic_fuse' || id==='runebound_aegis') {
      const scroll=selectedScroll(id,direction)
      return !!scroll && (id==='runic_fuse' ? !!TILE[map[player.y]?.[player.x]]?.walk :
        !!equippedInscribeShield() && !equippedInscribeShield().geomancyAegis)
    }
    if (id==='earthmaw') return earthmawTargets().length>0
    if (id==='sounding_stone' || id==='grounding') return id!=='grounding' ||
      !player.groundingArmed
    if (id==='stonemaker') return candidates().length>0
    if (id==='stone_circle') return !!circleLayout(direction)
    if (id==='stonepress') return !!stonepressPlan(direction)
    return id==='cragbowl' && !!cragbowlPlan()
  }
  function availableCircleDirections() {
    return DIRS8.filter(([dx,dy])=>circleLayout([dx,dy]))
  }
  function availablePressDirections() {
    return DIRS8.filter(([dx,dy])=>stonepressPlan([dx,dy]))
  }
  function summon(x,y,duration) {
    const point=here(x,y),underlay=map[y]?.[x]
    if (!clearGround(x,y) || !mutateGeomancyTile(point,underlay,'boulder')) return false
    stones.push({...point,id:nextStoneId++,underlay,progress:0,
      expiresAtTurn:turnCount+duration+1})
    return true
  }
  function activate(idx,direction=null) {
    const item=player.inventory[idx],id=item?.abilityId
    // Direction selection and item previews consume no RNG, turns or cooldowns.
    if ((id==='stone_circle' || id==='stonepress') && !direction) return false
    if (id==='runic_fuse' || id==='runebound_aegis') return inscribe(idx,direction)
    if (id==='spell_cairn') return cairnAction(idx,direction)
    if (!canActivate(idx,direction)) {
      log(['stonepress','cragbowl'].includes(id) && playerInsideSanctuary()
        ? 'You cannot attack from sacred ground.'
        : 'There is no valid path for this power.', 'info')
      return false
    }
    const layout=id==='stone_circle'?circleLayout(direction):null
    const press=id==='stonepress'?stonepressPlan(direction):null
    const bowl=id==='cragbowl'?cragbowlPlan():null
    ensureReplayItemIds()
    const scope=recordReplayAction({type:'useItem',action:'geomancyPower',idx,
      replayId:item.replayId,...(direction?{direction}: {})})
    try {
      // Close the inventory before resolving the action or queueing its
      // visuals, so the flight/death FX are painted on the actual game view.
      // No timeout, RNG or turn logic depends on a browser animation frame.
      toggleInv(false)
      clearAutoPath();pendingMove=null;bowAimTarget=null
      let count=0
      if (id==='grounding') {
        player.groundingArmed=true
        count=1
      } else if (id==='sounding_stone') {
        sounding={x:player.x,y:player.y,z:currentZ,levelKind:currentLevelKind(),
          until:turnCount+1,traces:[]}
        alarmNearestEnemyFromNoise(player.x,player.y,1)
        count=1
      } else if (id==='earthmaw') {
        const result=swallowEarthmaw()
        count=result.swallowed+result.resisted+result.killed
        if (count) artifactAbilityMessage(id,
          `Earthmaw shakes the ground! ${result.swallowed} creature${result.swallowed===1?'':'s'} swallowed${result.killed ? `, ${result.killed} crushed` : ''}.`,
          'The earth heaves!')
      } else if (id==='stonemaker') {
        const spot=pick(candidates())
        count=Number(summon(spot.x,spot.y,rule(id,'duration')))
      } else if (id==='stone_circle') {
        for(const p of layout) count+=Number(summon(p.x,p.y,rule(id,'duration')))
      } else if (id==='stonepress') {
        const result=throwStonepress(press)
        count=result.impacts+result.moved
      } else if (id==='cragbowl') {
        const result=throwCragbowl(bowl)
        count=Number(!!result)
      }
      if (!count) return false
      if (!commitCooldown(id)) throw Error('Geomancy cooldown was not committed')
      const named={grounding:'Grounding gathers power for your next direct strike!',
        sounding_stone:'Sounding Stone sends a deep rumble through the ground!',
        stonemaker:'Stonemaker raises a boulder from the earth!',
        stone_circle:'Stone Circle rises around you!',
        stonepress:'Stonepress drives a boulder forward!',
        cragbowl:'Cragbowl hurls a boulder!'}
      // Rock attacks already announced the throw before any hit/death logs.
      if (!['stonepress','cragbowl','earthmaw'].includes(id)) artifactAbilityMessage(id,named[id],
        'The earth trembles!')
      consumeItemTurn()
      return true
    } finally {finishRecordedReplayAction(scope)}
  }

  // Prepared scrolls are selected by a stable replay item ID. The player may
  // inspect/cancel the selection without consuming an RNG call or a turn.
  function eligibleScrolls(id) {
    const kinds=ARTIFACT_ABILITIES.abilities[id]?.scrolls || []
    return player.inventory.filter(item=>kinds.includes(item.kind) && (item.count||1)>0)
  }
  function selectedScroll(id, option) {
    if (!option || option.op!=='inscribe' || typeof option.scrollReplayId!=='string') return null
    return eligibleScrolls(id).find(item=>item.replayId===option.scrollReplayId) || null
  }
  function equippedInscribeShield() {
    const shield=player.equip?.shield
    return shield && (shield.kind==='shield' || shield.artifactSlot==='shield') ? shield : null
  }
  function prepareRune(item) {
    const cross=playerHasArtifactAbility('burst_bending')
    return {x:player.x,y:player.y,z:currentZ,levelKind:currentLevelKind(),
      kind:item.kind,cross,aftershock:playerHasArtifactAbility('aftershock'),
      ...(item.kind==='scrollOfFireball' ? {tiles:fireballBlastTiles(player.x,player.y,cross)} : {})}
  }
  function inscribe(idx,option) {
    const item=player.inventory[idx],id=item?.abilityId
    if (!['runic_fuse','runebound_aegis'].includes(id)) return false
    if (!canActivate(idx,option)) return false
    const scroll=selectedScroll(id,option)
    if (!scroll) return false
    const shield=id==='runebound_aegis'?equippedInscribeShield():null
    const prepared=id==='runic_fuse'?prepareRune(scroll):null
    // No partial mutations until both the trinket and scroll have been checked.
    ensureReplayItemIds()
    const scope=recordReplayAction({type:'useItem',action:'geomancyPower',idx,
      replayId:item.replayId,direction:{op:'inscribe',scrollReplayId:scroll.replayId}})
    try {
      toggleInv(false)
      clearAutoPath();pendingMove=null;bowAimTarget=null
      if (id==='runic_fuse') rune=prepared
      else shield.geomancyAegis={kind:scroll.kind}
      scroll.count=(scroll.count||1)-1
      if (scroll.count<=0) player.inventory.splice(player.inventory.indexOf(scroll),1)
      AdaptivePlayerTrolling.onScrollUsed(scroll.kind)
      if (!commitCooldown(id)) throw Error('Geomancy inscription cooldown was not committed')
      artifactAbilityMessage(id,
        id==='runic_fuse' ? 'Runic Fuse inscribes a dormant rune into the stone.' :
          'Runebound Aegis binds a spell to your shield.',
        id==='runic_fuse' ? 'A faint symbol glimmers on the ground.' :
          'A strange shimmer passes across your shield.')
      consumeItemTurn()
      return true
    } finally {finishRecordedReplayAction(scope)}
  }
  function runeAtCurrentLevel() {
    return rune && rune.z===currentZ && rune.levelKind===currentLevelKind() ? rune : null
  }
  function onEnemyEntered(e,fromX,fromY) {
    const active=runeAtCurrentLevel()
    if (!active || !e?.alive || e.hp<=0 || !onCurrentLevel(e) ||
        !enemies.includes(e) || !Number.isInteger(e.x) || !Number.isInteger(e.y) ||
        (fromX===e.x && fromY===e.y) ||
        Math.max(Math.abs(e.x-active.x),Math.abs(e.y-active.y))>1 || buried(e)) return false
    // Disarm BEFORE resolving a potentially recursive Chaos relocation.
    rune=null
    log('A carved rune flares as something approaches!', 'info')
    if (!replayAnimationsDisabled && !replaySimulationMode)
      spawnDamageNumber(active.x,active.y,'Rune!','#c9a5e8')
    const result=resolveScrollEffect({kind:active.kind},{source:'rune',
      origin:{x:active.x,y:active.y},x:active.x,y:active.y,
      includePlayer:active.kind!=='scrollOfChaos',providedTiles:active.tiles,
      cross:active.cross,aftershock:active.aftershock})
    if (result.fatal) {player.hp=0;die(null,'fireball')}
    return true
  }
  function releaseAegis(blockingShield = equippedInscribeShield()) {
    // Resolve against the same shield that actually blocked the strike;
    // status effects from that strike may unequip the item afterward.
    const shield=blockingShield
    const payload=shield?.geomancyAegis
    if (!payload || !ARTIFACT_ABILITIES.abilities.runebound_aegis.scrolls.includes(payload.kind)) return false
    delete shield.geomancyAegis // release before secondary combat effects
    log('The runes on your shield flare and release their magic!', 'good')
    if (!replayAnimationsDisabled && !replaySimulationMode)
      spawnDamageNumber(player.x,player.y,'Aegis!','#c9a5e8')
    resolveScrollEffect(payload,{source:'aegis',origin:{x:player.x,y:player.y}})
    return true
  }
  // The cairn owns exactly two ordered scroll payloads. Transport scrolls
  // retain their destination, but never leave behind a second loose copy.
  const travelKinds=new Set(['homecomingscroll','wayfaringscroll'])
  function cairnSlots(item) {
    return Array.isArray(item?.geomancyCairn) ? item.geomancyCairn : []
  }
  function boundCairn(item) {
    return item?.abilityId==='spell_cairn' && cairnSlots(item).some(p=>p.kind==='wayfaringscroll')
  }
  function carriedWayfaring() {
    const loose=player.inventory.find(it=>it.kind==='wayfaringscroll')
    if(loose)return {item:loose}
    for(const cairn of player.inventory) for(const payload of cairnSlots(cairn))
      if(payload.kind==='wayfaringscroll')return {cairn,payload}
    return null
  }
  function verifyCairnInventory(items, equipment = {}) {
    if(!Array.isArray(items))throw Error('Invalid saved Spell Cairn inventory')
    let wayfaring=0
    for(const item of items) {
      if(item.kind==='wayfaringscroll')wayfaring++
      if(item.abilityId==='spell_cairn') {
        if(item.kind!=='artifact' || item.artifactSlot!=='trinket' ||
          !Array.isArray(item.geomancyCairn) || item.geomancyCairn.length>2 ||
          item.geomancyCairn.some(payload=>!payload ||
            !ARTIFACT_ABILITIES.abilities.spell_cairn.scrolls.includes(payload.kind) ||
            (payload.kind==='wayfaringscroll' && !validWayfaringDestinationData(payload.destination))) ||
          item.geomancyCairn.filter(p=>travelKinds.has(p.kind)).length>1)
          throw Error('Invalid saved Spell Cairn slots')
        wayfaring+=item.geomancyCairn.filter(p=>p.kind==='wayfaringscroll').length
      }
    }
    if(wayfaring>1)throw Error('Duplicate Scroll of Wayfaring in inventory or Spell Cairn')
    for(const shield of [...items, equipment?.shield].filter(Boolean)) {
      if(shield.geomancyAegis !== undefined &&
        (!ARTIFACT_ABILITIES.abilities.runebound_aegis.scrolls.includes(shield.geomancyAegis?.kind) ||
          !['shield','artifact'].includes(shield.kind) ||
          (shield.kind==='artifact' && shield.artifactSlot!=='shield')))
        throw Error('Invalid saved Runebound Aegis charge')
    }
  }
  function validWayfaringDestinationData(d) {
    return !!d && Number.isInteger(d.x) && d.x>=0 && d.x<MAP_W &&
      Number.isInteger(d.y) && d.y>=0 && d.y<MAP_H &&
      Number.isInteger(d.z) && Number.isInteger(d.caveIndex) &&
      ['surface','chain','tower','crypt2'].includes(d.levelKind)
  }
  function compatibleCairnScrolls(item) {
    const slots=cairnSlots(item)
    if(slots.length>=2)return []
    return eligibleScrolls('spell_cairn').filter(scroll=>
      (!travelKinds.has(scroll.kind) || !slots.some(p=>travelKinds.has(p.kind))) &&
      (scroll.kind!=='wayfaringscroll' ||
        validWayfaringDestinationData(scroll.destination) &&
        carriedWayfaring()?.item===scroll))
  }
  function validateCairnEffect(payload) {
    if(!payload)return false
    if(payload.kind==='homecomingscroll')return !surfaceCatchupBusy &&
      !ArtifactWayfaring.homecomingBlocker() && canUseItemsWhileSwimming()
    if(payload.kind==='wayfaringscroll') {
      if(surfaceCatchupBusy || !canUseItemsWhileSwimming())return false
      const target=wayfaringDestination(payload)
      if(!target || (payload.destination.z===currentZ &&
        payload.destination.levelKind===currentLevelKind() &&
        payload.destination.x===player.x && payload.destination.y===player.y))return false
      return clearTransitionLanding(payload.destination,target.terrain,payload.destination.levelKind,true)
    }
    return validateScrollEffect(payload,{source:'cairn'}).valid
  }
  function cairnAction(idx,option) {
    const item=player.inventory[idx]
    if(!item || item.kind!=='artifact' || item.artifactSlot!=='trinket' ||
      item.abilityId!=='spell_cairn' || !item.identified ||
      !rule('spell_cairn','enabled') || player.hp<=0 || deathTransition ||
      player.wayfaring?.rush || !canUseItemsWhileSwimming())return false
    const op=option?.op
    const slots=cairnSlots(item)
    if(op==='load') {
      ensureReplayItemIds()
      const scroll=compatibleCairnScrolls(item).find(it=>it.replayId===option.scrollReplayId)
      if(!scroll)return false
      const prepared=scroll.kind==='wayfaringscroll'
        ? {kind:scroll.kind,destination:structuredClone(scroll.destination)}
        : {kind:scroll.kind}
      const scope=recordReplayAction({type:'useItem',action:'geomancyPower',idx,
        replayId:item.replayId,direction:{op:'load',scrollReplayId:scroll.replayId}})
      try {
        item.geomancyCairn=[...slots,prepared]
        if(scroll.kind==='wayfaringscroll')player.inventory.splice(player.inventory.indexOf(scroll),1)
        else {
          scroll.count=(scroll.count||1)-1
          if(scroll.count===0)player.inventory.splice(player.inventory.indexOf(scroll),1)
        }
        toggleInv(false)
        log(`You place a Scroll of ${prepared.kind==='homecomingscroll'?'Homecoming':
          prepared.kind==='wayfaringscroll'?'Wayfaring':itemDefinition(prepared.kind).name.replace(/^Scroll of /,'')} into your Spell Cairn.`, 'info')
        spawnDamageNumber(player.x,player.y,'Inscribed!','#c9a5e8')
        consumeItemTurn()
        return true
      } finally {finishRecordedReplayAction(scope)}
    }
    if(op!=='release' || cairnReleaseBusy || cooldownRemaining('spell_cairn') || !slots.length ||
      !validateCairnEffect(slots[0])) {
      if(op==='release' && slots.length && !cooldownRemaining('spell_cairn'))
        log('The stored magic remains dormant.', 'info')
      return false
    }
    ensureReplayItemIds()
    const scope=recordReplayAction({type:'useItem',action:'geomancyPower',idx,
      replayId:item.replayId,direction:{op:'release'}})
    // Release may cross global Z and wait on asynchronous surface catch-up;
    // finish the replay transaction and spend exactly one turn either way.
    cairnReleaseBusy=true
    const execute=async()=>{
      toggleInv(false)
      clearAutoPath();pendingMove=null;bowAimTarget=null
      let completed=0
      try {
        for(let n=0;n<2;n++) {
          const payload=cairnSlots(item)[0]
          if(!validateCairnEffect(payload) || player.hp<=0 || deathTransition)break
          if(completed===0)artifactAbilityMessage('spell_cairn',
            'Spell Cairn releases its stored magic!', 'A stone sigil flares in your hands.')
          let result
          if(payload.kind==='homecomingscroll')result=await commitHomecomingEffect()
          else if(payload.kind==='wayfaringscroll')result=await commitWayfaringEffect(payload)
          else result=resolveScrollEffect(payload,{source:'cairn',origin:{x:player.x,y:player.y}})
          if(result===false || result?.blocked || result?.executed===false)break
          item.geomancyCairn.shift()
          AdaptivePlayerTrolling.onScrollUsed(payload.kind)
          completed++
          if(completed===1) {
            if(!commitCooldown('spell_cairn'))throw Error('Spell Cairn failed to start cooldown')
          }
        }
        if(completed)consumeItemTurn()
        return completed>0
      } finally {cairnReleaseBusy=false;finishRecordedReplayAction(scope)}
    }
    return execute()
  }
  function cooldownRemaining(id) {
    return ArtifactWayfaring.cooldownRemaining(id)
  }

  // Called only by a successful active Geomancy action when its cooldown
  // actually begins. Multiple trinkets with the same power share one expiry.
  function commitCooldown(id) {
    if (!ARTIFACT_ABILITIES?.domains?.geomancy?.includes(id) ||
        !ARTIFACT_ABILITIES.abilities[id]?.enabled ||
        ARTIFACT_ABILITIES.abilities[id]?.active !== true ||
        !ArtifactWayfaring.startCooldown(id)) return false
    if (playerHasArtifactAbility('resonance')) {
      const reduction = rule('resonance', 'baseReduction') +
        Math.floor(playerDef() / rule('resonance', 'defDivisor'))
      const affected = ArtifactWayfaring.reduceCooldowns(other => other !== id &&
        ARTIFACT_ABILITIES.domains.geomancy.includes(other), reduction)
      // A real cooldown change is a meaningful activation. Do not display a
      // passive popup merely for owning Resonance or inspecting cooldowns.
      if (affected) artifactAbilityMessage('resonance',
        'Resonance hastens the recovery of your other Geomancy powers!',
        'A faint pulse passes through your pack.', 'info')
    }
    return true
  }

  // Only excavatable records with known coordinates count. Random potential
  // loot from generic sand digs is not a placed treasure and does not pulse.
  function buriedTreasureNearby() {
    if (currentZ === 0 && !treasureMapUnearthed && treasureMapSpot &&
        !dugSandTiles.has(keyXY(treasureMapSpot.x, treasureMapSpot.y)) &&
        Math.max(Math.abs(treasureMapSpot.x-player.x),
          Math.abs(treasureMapSpot.y-player.y)) <= rule('lodestone','radius')) return true
    return groundItems.some(g =>
      (g.kind === 'buriedgear' || g.kind === 'buriedartifact' || g.kind === 'gear') &&
      onCurrentLevel(g) && !dugSandTiles.has(keyXY(g.x, g.y)) &&
      Math.max(Math.abs(g.x-player.x), Math.abs(g.y-player.y)) <= rule('lodestone','radius'))
  }

  function syncLodestone(silent = false) {
    const active = playerHasArtifactAbility('lodestone')
    const next = active && buriedTreasureNearby()
    if (!active) { lodestoneNearby = false; return false }
    const previous = lodestoneNearby
    lodestoneNearby = next
    if (!silent && previous !== null && previous !== next) {
      // The signal is deliberately directional-free. Conceal unidentified
      // powers without leaking hidden item information.
      if (next) artifactAbilityMessage('lodestone',
        'Your Lodestone grows heavy.', 'Something in your pack grows heavy.')
      else log('The strange weight in your pack fades.', 'info')
    }
    return next
  }

  function resetDerivedState() { lodestoneNearby = false }
  return {cooldownRemaining, commitCooldown, buriedTreasureNearby,
    syncLodestone, resetDerivedState, serialize, restore, resetWorld,
    temporaryAt, removeTemporaryAt, tick, scheduleAftershock,
    stonepressFrame,
    earthmawAnimating:()=>!!earthmawCast,
    hidingEarthmawMound:e=>atCurrentLevel(earthmawCast || {}) &&
      earthmawCast.holes.some(p=>p.enemy.id===e.id) &&
      performance.now()<earthmawCast.start+quakeLeadMs+sinkMs,
    pendingAftershockTiles, drawAftershockWarnings, drawEarthmawCast,
    buried, earthmawEligible, earthmawTargets,
    petrified, petrifyOnMelee, groundingHit,
    recordEnemyMove, soundingTraces,
    eligibleScrolls, runeAtCurrentLevel, onEnemyEntered, releaseAegis,
    cairnSlots, boundCairn, carriedWayfaring, verifyCairnInventory, compatibleCairnScrolls,
    canActivate, activate,
    availableCircleDirections, availablePressDirections}
})()
