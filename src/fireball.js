'use strict'

// Targeting and animation are transient; only the committed cast enters replay.
let fireballAim = null
let fireballAnims = []
const FIREBALL_FLIGHT_MS = 280
const FIREBALL_BURST_MS = 780

function fireballPresentationEnd() {
  if (replayAnimationsDisabled || replaySimulationMode) return 0
  return fireballAnims.reduce((end, a) => Math.max(end, a.start + FIREBALL_FLIGHT_MS + FIREBALL_BURST_MS), 0)
}

function fireballOpaque(x, y) {
  const tile = map[y]?.[x]
  return !tile || tile === 'towervoid' || TILE[tile]?.blocksSight === true ||
    ['cavewall','dwarvenwall','mountain','snowmountain','crypt2niche','boulder','blackpillar'].includes(tile)
}

function fireballClearLine(fromX, fromY, toX, toY) {
  const path = projectilePathBetween(fromX, fromY, toX, toY)
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    if (fireballOpaque(b.x, b.y)) return false
    // No diagonal leak between two touching opaque corners.
    if (a.x !== b.x && a.y !== b.y && fireballOpaque(a.x, b.y) && fireballOpaque(b.x, a.y)) return false
  }
  return !fireballOpaque(fromX, fromY)
}

function validFireballTarget(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) &&
    Math.max(Math.abs(x - player.x), Math.abs(y - player.y)) <= itemDefinition('scrollOfFireball').effect.range &&
    undergroundTileVisible(x, y) && fireballClearLine(player.x, player.y, x, y)
}

function fireballBlastTiles(x, y) {
  const tiles = []
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if ((dx === -2 || dx === 2) && (dy === -2 || dy === 2)) continue
    if (fireballClearLine(x, y, x + dx, y + dy)) tiles.push({x:x + dx, y:y + dy})
  }
  return tiles
}

// The flame sprites extend beyond the damage ring. Give them room to curl
// naturally while still masking opaque terrain and blocked sight lines.
function fireballVisualTiles(x, y) {
  const tiles = []
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (fireballClearLine(x, y, x + dx, y + dy)) tiles.push({x:x + dx, y:y + dy})
  }
  return tiles
}

function fireballControls() {
  let bar = document.getElementById('fireballControls')
  if (bar) return bar
  bar = document.createElement('div')
  bar.id = 'fireballControls'
  bar.style.cssText = 'position:fixed;z-index:15000;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom));max-width:calc(100vw - 24px);width:430px;box-sizing:border-box;padding:10px;background:#211812f2;border:1px solid #f89445;border-radius:8px;color:#ffe5c1;display:none;text-align:center;box-shadow:0 4px 20px #0009'
  bar.innerHTML = '<div id="fireballHint" style="margin-bottom:8px" role="status"></div><button id="fireballCast" style="min-height:44px;margin-right:12px">Cast</button><button id="fireballCancel" style="min-height:44px">Cancel</button>'
  document.body.appendChild(bar)
  document.getElementById('fireballCast').onclick = () => void castAimedFireball()
  document.getElementById('fireballCancel').onclick = cancelFireballTargeting
  return bar
}

function beginFireballTargeting(idx) {
  const item = player.inventory[idx]
  if (item?.kind !== 'scrollOfFireball' || !canUseItemsWhileSwimming() || deathTransition ||
      enemyAttackPresentationPending() || onlineRecordsBlockActions()) return false
  if (playerInsideSanctuary()) {
    log('You cannot cast fireball from sacred ground. Step beyond its protection.', 'info')
    return false
  }
  toggleInv(false)
  clearAutoPath(); clearHoveredAutoPath(); bowAimTarget = null
  fireballAim = {item, x:player.x, y:player.y, confirmed:false}
  fireballControls().style.display = window.matchMedia('(pointer: coarse)').matches ? 'block' : 'none'
  setFireballTarget(player.x, player.y)
  return true
}

function setFireballTarget(x, y) {
  if (!fireballAim) return
  fireballAim.x = x; fireballAim.y = y; fireballAim.confirmed = false
  const valid = validFireballTarget(x, y)
  const selfHit = valid && fireballBlastTiles(x, y).some(p => p.x === player.x && p.y === player.y)
  document.getElementById('fireballCast').disabled = !valid
  document.getElementById('fireballHint').textContent = !valid ? 'Choose a visible, unobstructed tile within 6 tiles.'
    : selfHit ? 'Fireball · 10–50 damage · You are in the blast!'
      : 'Fireball · 10–50 damage · Select a tile, then Cast.'
  render()
}

function cancelFireballTargeting() {
  fireballAim = null
  const bar = document.getElementById('fireballControls')
  if (bar) bar.style.display = 'none'
  render()
}

async function castAimedFireball() {
  if (!fireballAim) return false
  const {item, x, y} = fireballAim
  return castFireball(player.inventory.indexOf(item), x, y)
}

async function castFireball(idx, x, y) {
  const item = player.inventory[idx]
  if (item?.kind !== 'scrollOfFireball' || mapOpen || invOpen || tradeOpen || npcMenuOpen || raceOpen ||
      onlineRecordsBlockActions() || !canUseItemsWhileSwimming() || player.hp <= 0 ||
      deathTransition || playerInsideSanctuary() || !validFireballTarget(x, y) ||
      (!replayAnimationsDisabled && (cameraAnimating || attackAnim || enemyAttackPresentationPending()))) return false
  ensureReplayItemIds()
  const scope = recordReplayAction({type:'castFireball', idx, replayId:item.replayId, x, y})
  try {
    cancelFireballTargeting()
    clearAutoPath(); consecutiveWaitTurns = 0
    if (player.berserkTurns > 0 && frenzyTargets().length && chance(0.25)) {
      await performBerserkFrenzy()
      return true
    }
    item.count = (item.count || 1) - 1
    if (item.count <= 0) player.inventory.splice(idx, 1)
    AdaptivePlayerTrolling.onScrollUsed('scrollOfFireball')
    AdaptivePlayerTrolling.onCombatAttack(turnCount)
    const scrollInvisibleCast = !player.godMode && player.invisibleTurns > 0
    const tiles = fireballBlastTiles(x, y), cells = new Set(tiles.map(p => keyXY(p.x, p.y)))
    const victims = enemies.filter(e => e.alive && e.hp > 0 && onCurrentLevel(e) && cells.has(keyXY(e.x, e.y)))
    const selfHit = cells.has(keyXY(player.x, player.y))
    const effect = itemDefinition('scrollOfFireball').effect
    // Snapshot all rolls before callbacks, rewards, deaths or presentation.
    const hits = victims.map(enemy => ({enemy, damage:randInt(effect.minDamage, effect.maxDamage)}))
    const selfDamage = selfHit ? randInt(effect.minDamage, effect.maxDamage) : 0
    let impactDelay = 0
    if (!replayAnimationsDisabled && !replaySimulationMode) {
      const presentation = queueEnemyAttackPresentation(FIREBALL_FLIGHT_MS + FIREBALL_BURST_MS)
      fireballAnims.push({fromX:player.x, fromY:player.y, x, y, tiles,
        visualTiles:fireballVisualTiles(x, y),
        start:presentation.start, mapKey:currentMapViewKey()})
      impactDelay = presentation.delay + FIREBALL_FLIGHT_MS
    }
    log('You cast a fireball!', 'info')
    for (const {enemy:e, damage} of hits) {
      AdaptivePlayerTrolling.onHungryMonsterAttacked(e)
      // Spell immunity and one-use death protection still work; armor does not.
      if (enemyImmunityActive(e)) {
        spawnDamageNumber(e.x, e.y, 'Immune!', '#c7a5f6', impactDelay)
        continue
      }
      const wasEnraged = enemyIsEnraged(e)
      e.hp -= damage
      if (scrollInvisibleCast) AdaptivePlayerTrolling.onPlayerInvisibleHit(e, turnCount)
      revealEnemyInvisibility(e); breakEnemyFear(e); wakeSleepingEnemy(e)
      absorbEnemyFatalHit(e); AdaptivePlayerTrolling.onPlayerWoundedEnemy(e,damage); triggerEnemyShellRetreat(e)
      alarmEnemy(e); alarmEnemiesNearHit(e)
      spawnDamageNumber(e.x, e.y, damage, RENDER_STYLE.damage.enemyHit, impactDelay)
      log(`Fireball burns the ${e.name} for ${damage} damage.`, 'good')
      logEnemyEnrageTransition(e, wasEnraged)
    }
    // Resolve self damage before XP healing. A lethal simultaneous blast cannot
    // be survived merely by leveling up from one of its kills.
    if (selfHit) {
      player.hp -= selfDamage
      spawnDamageNumber(player.x, player.y, selfDamage, RENDER_STYLE.damage.playerHit || '#ff6655', impactDelay)
      log(`Your fireball burns you for ${selfDamage} damage!`, 'bad')
      absorbPlayerFatalDamage()
    }
    // Count only a committed cast which actually damages its own caster.
    if (selfHit && selfDamage > 0) AdaptivePlayerTrolling.onSelfFireballHit()
    const fatal = player.hp <= 0
    for (const {enemy} of hits) if (enemy.hp <= 0) killEnemy(enemy, true, 'fireball', impactDelay)
    if (fatal) { player.hp = 0; die(null, 'fireball') }
    else consumeItemTurn()
    updateHud(); render(); runAnimationLoop()
    return true
  } finally { finishRecordedReplayAction(scope) }
}

// Cached, softly feathered flame particles. No external sprites or gameplay RNG.
let fireballFlameTexture = null
function fireballTexture() {
  if (fireballFlameTexture) return fireballFlameTexture
  const sheet = document.createElement('canvas')
  sheet.width = sheet.height = 64
  const g = sheet.getContext('2d'), pixels=g.createImageData(64,64)
  const noise=(x,y)=>{
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy
    const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy)
    const a=fireballVisualNoise(ix+iy*73),b=fireballVisualNoise(ix+1+iy*73)
    const c=fireballVisualNoise(ix+(iy+1)*73),d=fireballVisualNoise(ix+1+(iy+1)*73)
    return (a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy
  }
  for(let y=0;y<64;y++)for(let x=0;x<64;x++) {
    const nx=(x-32)/29,ny=(y-34)/28
    const cloud=noise(x/12,y/12)*0.55+noise(x/5,y/5)*0.30+noise(x/2,y/2)*0.15
    const density=1-Math.hypot(nx,ny)+0.65*(cloud-0.5)
    const alpha=Math.max(0,Math.min(1,density*4))
    const heat=Math.max(0,Math.min(1,density*0.6+cloud*0.65))
    const i=(y*64+x)*4
    pixels.data[i]=Math.min(255,175+heat*150)
    pixels.data[i+1]=Math.max(0,Math.min(255,(heat-0.18)*360))
    pixels.data[i+2]=Math.max(0,Math.min(225,(heat-0.5)*650))
    pixels.data[i+3]=Math.round(alpha*255)
  }
  g.putImageData(pixels,0,0)
  fireballFlameTexture=sheet
  return sheet
}

function fireballVisualNoise(n) {
  const value=Math.sin(n*127.1+311.7)*43758.5453
  return value-Math.floor(value)
}

function fireballPuff(x,y,size,stretch,angle,opacity) {
  if (size<=0 || opacity<=0) return
  ctx.save();ctx.translate(x,y);ctx.rotate(angle)
  ctx.globalAlpha=Math.min(1,opacity)
  ctx.drawImage(fireballTexture(),-size/2,-size*stretch/2,size,size*stretch)
  ctx.restore()
}

function fireballGlow(x,y,radius,alpha) {
  if (radius<=0 || alpha<=0) return
  const glow=ctx.createRadialGradient(x,y,0,x,y,radius)
  glow.addColorStop(0,`rgba(255,214,99,${alpha})`)
  glow.addColorStop(0.45,`rgba(255,105,12,${alpha*0.55})`)
  glow.addColorStop(1,'rgba(220,45,0,0)')
  ctx.fillStyle=glow;ctx.fillRect(x-radius,y-radius,radius*2,radius*2)
}

function drawFireballBurst(a, age) {
  const t=Math.min(1,age/FIREBALL_BURST_MS)
  const cx=(a.x-camX+0.5)*TILE_PX,cy=(a.y-camY+0.5)*TILE_PX
  // Damage remains strictly inside a.tiles; visual flames may curl past it.
  // Only opaque barriers and unexplored sight lines trim the presentation.
  ctx.save();ctx.beginPath()
  for (const p of a.visualTiles) if (undergroundTileVisible(p.x,p.y))
    ctx.rect((p.x-camX)*TILE_PX,(p.y-camY)*TILE_PX,TILE_PX,TILE_PX)
  ctx.clip()
  const expansion=Math.min(1,t/0.65)
  const radius=TILE_PX*(0.12+1.98*(1-Math.pow(1-expansion,1.45)))
  const fade=Math.min(1,(1-t)/0.32)
  fireballGlow(cx,cy,radius+TILE_PX*0.65,0.24*fade)
  // Hot impact core collapses as the fire front moves outward, leaving a
  // readable hollow ring rather than a uniformly filled orange disk.
  const coreFade=Math.max(0,1-t/0.40)
  fireballPuff(cx,cy,TILE_PX*(0.7+2*t),1.12,t*2,coreFade)
  if (t<0.18) {
    ctx.save();ctx.globalCompositeOperation='lighter'
    fireballGlow(cx,cy,TILE_PX*(0.55+t*3),0.95*(1-t/0.18))
    ctx.restore()
  }
  // Overlapping turbulent tongues create one continuous, ragged fire front.
  // Each tongue curls outward then rises; the fixed noise only affects pixels.
  for(let i=0;i<120;i++) {
    const seed=fireballVisualNoise(i+1),seed2=fireballVisualNoise(i+101)
    const angle=i*Math.PI*2/120
    const curl=Math.sin(t*18+seed*9)
    const r=radius+TILE_PX*(0.06*Math.sin(angle*9+t*10)+0.07*curl)
    const x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r
    const size=TILE_PX*(0.48+seed*0.27)*(0.75+0.25*Math.sin(t*16+seed2*6))
    fireballPuff(x,y,size,1.1+seed2*0.65,angle+Math.PI/2+curl*0.3,fade*0.95)
    // A smaller, bright root and a thin lifted tip break the beaded outline.
    fireballPuff(x-Math.cos(angle)*size*0.12,y-Math.sin(angle)*size*0.12,
      size*0.36,1.25,angle+Math.PI/2,fade*0.88)
    const lift=TILE_PX*(0.12+0.23*seed2)*(0.5+0.5*Math.sin(t*14+seed*7))
    fireballPuff(x+curl*size*0.16,y-lift,size*0.38,2.2,0.25*curl,fade*0.72)
  }
  // Sparse outward embers fade after the front, with no random draws per frame.
  for(let i=0;i<26;i++) {
    const seed=fireballVisualNoise(i+301),angle=i*2.39996
    const r=radius*(0.8+seed*0.3),x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r-t*TILE_PX*0.3
    ctx.fillStyle=`rgba(255,221,123,${fade*(0.35+seed*0.5)})`
    ctx.fillRect(x,y,Math.max(1,TILE_PX*0.025),Math.max(1,TILE_PX*0.045))
  }
  ctx.restore()
}

function drawFireballPresentation(now) {
  ctx.save()
  if (fireballAim) {
    for(let y=player.y-6;y<=player.y+6;y++) for(let x=player.x-6;x<=player.x+6;x++) {
      if(!validFireballTarget(x,y))continue
      ctx.fillStyle='rgba(255,160,60,0.07)'
      ctx.fillRect((x-camX)*TILE_PX,(y-camY)*TILE_PX,TILE_PX,TILE_PX)
    }
    const {x,y}=fireballAim,valid=validFireballTarget(x,y)
    if(valid) {
      const tiles=fireballBlastTiles(x,y),cells=new Set(tiles.map(p=>keyXY(p.x,p.y)))
      for(const p of tiles) {
        if(!undergroundTileVisible(p.x,p.y))continue
        const px=(p.x-camX)*TILE_PX,py=(p.y-camY)*TILE_PX
        ctx.fillStyle=p.x===player.x&&p.y===player.y?'rgba(255,45,30,0.40)':'rgba(255,129,30,0.22)'
        ctx.fillRect(px,py,TILE_PX,TILE_PX)
        ctx.strokeStyle='rgba(255,191,93,0.9)';ctx.lineWidth=1.5
        ctx.beginPath()
        for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
          if(cells.has(keyXY(p.x+dx,p.y+dy)))continue
          const sx=px+(dx===1?TILE_PX:0),sy=py+(dy===1?TILE_PX:0)
          ctx.moveTo(sx,sy);ctx.lineTo(sx+(dx===0?TILE_PX:0),sy+(dy===0?TILE_PX:0))
        }
        ctx.stroke()
      }
    }
    const cx=(x-camX+0.5)*TILE_PX,cy=(y-camY+0.5)*TILE_PX
    ctx.strokeStyle=valid?'#ffe9b2':'#ff5555';ctx.lineWidth=2
    ctx.beginPath();ctx.arc(cx,cy,TILE_PX*0.19,0,Math.PI*2)
    ctx.moveTo(cx-TILE_PX*0.3,cy);ctx.lineTo(cx+TILE_PX*0.3,cy)
    ctx.moveTo(cx,cy-TILE_PX*0.3);ctx.lineTo(cx,cy+TILE_PX*0.3);ctx.stroke()
  }
  for(let i=fireballAnims.length-1;i>=0;i--) {
    const a=fireballAnims[i],elapsed=now-a.start
    if(elapsed>=FIREBALL_FLIGHT_MS+FIREBALL_BURST_MS||a.mapKey!==currentMapViewKey()) {
      fireballAnims.splice(i,1);continue
    }
    if(elapsed<0)continue
    if(elapsed<FIREBALL_FLIGHT_MS) {
      const t=elapsed/FIREBALL_FLIGHT_MS,angle=Math.atan2(a.y-a.fromY,a.x-a.fromX)
      for(let tail=14;tail>=0;tail--) {
        const q=Math.max(0,t-tail*0.016)
        const x=(a.fromX+(a.x-a.fromX)*q-camX+0.5)*TILE_PX
        const y=(a.fromY+(a.y-a.fromY)*q-camY+0.5)*TILE_PX
        fireballPuff(x,y,TILE_PX*(0.42-tail*0.022),1.25,angle-Math.PI/2,0.95-tail*0.055)
      }
    } else drawFireballBurst(a,elapsed-FIREBALL_FLIGHT_MS)
  }
  ctx.restore()
}
