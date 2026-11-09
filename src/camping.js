'use strict'

// Permanent fireplaces share turn-based cooking and resting rules. The UI
// queues individually recorded actions and waits only for their presentation.
let campOpen = false
const Campfires = (() => {
  const FUEL_LIMIT = 5
  const fireRules = {
    campfire: {name:'Abandoned campfire',burnTurns:12,noiseRadius:8},
    dwarvenstove: {name:'Dwarven stove',burnTurns:18,noiseRadius:4}
  }
  const isFire = fire => !!fireRules[fire?.kind]
  const rule = fire => fireRules[fire?.kind]
  const recipes = {meat:'roastedMeat', potato:'bakedPotato', fish:'cookedFish'}
  let selected = null, queued = false, queueToken = 0, turnContext = null
  const count = kind => player.inventory.filter(it => it.kind === kind)
    .reduce((sum, it) => sum + (it.count || 1), 0)
  const remaining = fire => Math.max(0, (fire?.burnUntil || 0) - turnCount)
  const burning = fire => remaining(fire) > 0
  const rate = () => Math.max(2, Math.ceil(playerMaxHp() * 0.03))
  function foodRecovery(kind) {
    const base = itemDefinition(kind)?.effect?.cookedRecovery
    return base === undefined ? 0 : consumablePower(base + Math.floor(playerMaxHp() * 0.04))
  }
  // The existing timer heals on global multiples of five. Count those exact
  // remaining ticks, including partial progress, rather than rounding duration.
  function foodRemaining(atTurn = turnCount) {
    return Math.max(0, Math.floor((atTurn + player.berryRegenTurns) / 5) - Math.floor(atTurn / 5))
  }
  function reachable(fire) {
    return isFire(fire) && groundItems.includes(fire) && onCurrentLevel(fire) &&
      Math.max(Math.abs(fire.x-player.x), Math.abs(fire.y-player.y)) <= 1 &&
      Mining.lightCanReach(map, fire.x, fire.y, player.x, player.y, player.x, player.y)
  }
  const nearby = () => groundItems.find(fire => isFire(fire) && reachable(fire))
  function warm() { return groundItems.some(f => isFire(f) && burning(f) && reachable(f)) }
  function litAt(x, y) {
    return groundItems.some(f => isFire(f) && onCurrentLevel(f) && burning(f) &&
      (f.x-x)**2+(f.y-y)**2 <= 9 && Mining.lightCanReach(map,f.x,f.y,x,y,x,y))
  }
  function consume(kind) {
    const index = player.inventory.findIndex(it => it.kind === kind)
    if (index < 0) return false
    const item = player.inventory[index]
    item.count = (item.count || 1) - 1
    if (!item.count) player.inventory.splice(index, 1)
    return true
  }
  function gather() {
    if (count('brushwood') >= FUEL_LIMIT) return false
    addInventoryItem('brushwood')
    log('You gather a bundle of dry brushwood.', 'loot')
    return true
  }
  function findFlint(probability) {
    if (!chance(probability)) return false
    addInventoryItem('flint')
    log('You find a Flint Stone.', 'loot')
    return true
  }
  function igniteNoise(fire) {
    const radius = rule(fire).noiseRadius
    for (const e of enemies) {
      if (!e.alive || !onCurrentLevel(e) || enemyIsPassive(e)) continue
      const distance = Math.hypot(e.x-fire.x,e.y-fire.y)
      if (distance > radius) continue
      const hearing = Math.min(0.95, Math.max(0.1, 0.95*(1-distance/radius)**2) *
        (enemyHasAbility(e,'blind') ? 1.5 : 1))
      if (!chance(hearing)) continue
      alarmEnemy(e)
      e.miningInvestigation = {x:fire.x,y:fire.y,steps:randInt(2,6),sourceZ:currentZ,
        announced:false,source:'fire'}
    }
  }
  function unsafe() {
    if (player.hp <= 0 || deathTransition) return 'You cannot continue camping.'
    if (player.poisonTurns > 0 || isDrowning() || DungeonHazards.activeGasStatus() ||
        DungeonHazards.activeCrusherStatus()) return 'It is unsafe to camp here.'
    // Perception must use world geometry, never camera position, viewport size
    // or animation progress: replay and mobile obey the same safety rule.
    if (enemies.some(e => e.alive && onCurrentLevel(e) && !enemyIsPassive(e) &&
        enemyCanBeSeen(e) &&
        UndergroundFov.canSee(map,player.x,player.y,e.x,e.y,UndergroundFov.RADIUS) && enemyHasSight(e))) return 'A visible enemy threatens the camp.'
    return ''
  }
  function tickFood() {
    const before = player.berryRegenTurns
    if (turnContext?.action === 'rest' && foodRemaining(turnCount-1) > 0) {
      const amount = Math.min(rate(), foodRemaining(turnCount-1), playerMaxHp()-player.hp)
      // Advance one ordinary turn, then remove exactly the accelerated ticks.
      player.berryRegenTurns = Math.max(0, before-1-amount*5 + (turnCount%5 === 0 ? 5 : 0))
      if (foodRemaining() === 0) player.berryRegenTurns = 0
      if (amount > 0) healPlayer(amount)
      player.campRestProgress = 0
    } else {
      if (before > 0) {
        player.berryRegenTurns--
        if (turnCount%5 === 0) healPlayer(consumablePower(1))
      }
      if (turnContext?.action === 'rest') {
        player.campRestProgress = (player.campRestProgress+1)%4
        if (player.campRestProgress === 0) healPlayer(1)
      }
    }
  }
  function beginTurn() {
    if (turnContext?.action !== 'rest') player.campRestProgress = 0
    // Expiry uses the global turn counter, including turns spent off this floor.
    if (groundItems.some(f => isFire(f) && f.burnUntil === turnCount)) invalidateUndergroundFov()
  }
  function noteHealing(amount) { if (turnContext) turnContext.healed += amount }
  function eat(index) {
    const item = player.inventory[index]
    if (!foodRecovery(item?.kind) || !canUseItemsWhileSwimming() || enemyAttackPresentationPending()) return false
    ensureReplayItemIds()
    recordReplayAction({type:'useItem',action:'cookedFood',idx:index,replayId:item.replayId})
    const amount = foodRecovery(item.kind), name = item.name
    consume(item.kind)
    player.berryRegenTurns += amount*5
    log(`You eat ${name}. Food will restore up to ${amount} HP.`, 'good')
    consumeItemTurn()
    return true
  }
  function perform(fire, action, ingredient) {
    if (!reachable(fire) || player.hp <= 0 || deathTransition || !canUseItemsWhileSwimming()) return false
    const isRest = action === 'rest', isCook = action === 'cook'
    if (action === 'search') {
      if (fire.kind !== 'campfire' || fire.searched) return false
      recordReplayAction({type:'camp',action,x:fire.x,y:fire.y})
      return searchAbandonedCampfire(fire)
    }
    if (!['light','refuel','rest','cook'].includes(action)) return false
    if ((isRest || isCook) && (!burning(fire) || unsafe())) return false
    if (isRest && player.hp >= playerMaxHp()) return false
    if (isCook && (!recipes[ingredient] || !count(ingredient))) return false
    if (action === 'light' && (burning(fire) || !count('flint') || !count('brushwood'))) return false
    if (action === 'refuel' && (!burning(fire) || remaining(fire) >= rule(fire).burnTurns || !count('brushwood'))) return false
    const scope = recordReplayAction({type:'camp',action,ingredient,x:fire.x,y:fire.y})
    const initialHp = player.hp, deaths = player.deaths, x = player.x, y = player.y
    const hadFood = foodRemaining() > 0
    turnContext = {action,healed:0}
    try {
      clearAutoPath()
      if (action === 'light' || action === 'refuel') {
        consume('brushwood')
        fire.burnUntil = turnCount+rule(fire).burnTurns+1
        if (action === 'light') igniteNoise(fire)
        invalidateUndergroundFov()
        log(action === 'light' ? `You light the ${rule(fire).name.toLowerCase()}.` : 'You feed the fire with brushwood.', 'info')
      } else if (isCook) {
        consume(ingredient)
        const kind = recipes[ingredient]
        addInventoryItem(kind)
        log(`You cook ${itemDefinition(kind).name}.`, 'good')
      }
      enemyTurn()
      npcTurn()
      const damaged = player.hp < initialHp+turnContext.healed || player.deaths !== deaths
      const interrupted = damaged || player.x !== x || player.y !== y || !reachable(fire) ||
        !burning(fire) || !!unsafe()
      if (isRest) {
        log(`You rest and recover ${turnContext.healed} HP.`, 'info')
        if (hadFood && foodRemaining() === 0) {
          queued = false
          log('Your food recovery is complete.', 'info')
        }
      }
      if (interrupted) {
        queued = false
        player.campRestProgress = 0
        log(damaged ? 'Damage interrupts your camping.' : 'Camping stops: the fire, position, or surroundings changed.', 'info')
      }
      updateHud(); render(); runAnimationLoop()
      return true
    } finally { turnContext = null; finishRecordedReplayAction(scope) }
  }
  function close() {
    queued = false; queueToken++; campOpen = false; selected = null
    document.getElementById('campOverlay')?.remove()
    updateTouchControlsVisibility()
  }
  function open(fire) {
    if (replayPlaying || !reachable(fire)) return
    close()
    selected = fire; campOpen = true
    clearAutoPath()
    const overlay = document.createElement('div')
    overlay.id = 'campOverlay'; overlay.className = 'overlay show'
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true')
    overlay.setAttribute('aria-label',rule(fire).name)
    document.body.appendChild(overlay)
    renderPanel(); updateTouchControlsVisibility()
    overlay.querySelector('button:not(:disabled)')?.focus()
  }
  async function queue(action, ingredient, limit) {
    if (queued || enemyAttackPresentationPending()) return
    const token = ++queueToken
    queued = true
    let completed = 0
    while (queued && token === queueToken && campOpen && completed < limit) {
      if (!perform(selected,action,ingredient)) { queued = false; break }
      completed++
      renderPanel()
      // No future action is recorded until all presentation of this turn ends.
      await new Promise(resolve => setTimeout(resolve, 100))
      while (queued && token === queueToken && (enemyAttackPresentationPending() || cameraAnimating || attackAnim))
        await new Promise(resolve => setTimeout(resolve, 40))
    }
    if (token !== queueToken) return
    queued = false
    renderPanel()
  }
  function renderPanel() {
    const overlay = document.getElementById('campOverlay')
    if (!campOpen || !overlay) return
    if (!reachable(selected) || player.hp <= 0 || deathTransition) { close(); return }
    overlay.innerHTML = ''
    const box = document.createElement('div'); box.className = 'panelbox'
    const heading = document.createElement('h2'); heading.textContent = rule(selected).name; box.appendChild(heading)
    const status = document.createElement('p')
    status.textContent = `${burning(selected) ? `Burning · ${remaining(selected)} turns left` : 'Cold'} · Brushwood ${count('brushwood')}/${FUEL_LIMIT}`
    box.appendChild(status)
    const info = document.createElement('p')
    info.textContent = `HP ${player.hp}/${playerMaxHp()} · Food recovery ${foodRemaining()} HP remaining. Rest: ${rate()} HP/turn with food, 1 HP/4 turns without.${raceDef()?.id === 'troll' ? ' Your natural regeneration continues separately.' : ''}`
    box.appendChild(info)
    const warning = unsafe() || (!count('flint') && !burning(selected) ? 'A Flint Stone is required to light this fire.' : '')
    if (warning) { const text = document.createElement('p'); text.textContent = warning; box.appendChild(text) }
    const button = (label, disabled, callback) => {
      const b = document.createElement('button'); b.textContent = label; b.disabled = disabled
      b.onclick = callback; box.appendChild(b)
    }
    if (selected.kind === 'campfire' && !selected.searched)
      button('Search ashes',queued,()=>{ perform(selected,'search');renderPanel() })
    button(burning(selected) ? `Add brushwood · restore ${rule(selected).burnTurns} turns` : 'Light fire · 1 brushwood',
      queued || !count('brushwood') || (!burning(selected) && !count('flint')) || remaining(selected)>=rule(selected).burnTurns,
      ()=>queue(burning(selected)?'refuel':'light',null,1))
    for (const [ingredient,kind] of Object.entries(recipes)) {
      const amount = count(ingredient)
      button(`Cook ${itemDefinition(ingredient).name} (${amount}) → ${foodRecovery(kind)} HP`,
        queued || !burning(selected) || !amount || !!unsafe(),()=>queue('cook',ingredient,1))
      if (amount > 1) button(`Cook up to 3 ${itemDefinition(ingredient).name}`,
        queued || !burning(selected) || !!unsafe(),()=>queue('cook',ingredient,Math.min(3,amount)))
    }
    for (const kind of Object.values(recipes)) if (count(kind))
      button(`Eat ${itemDefinition(kind).name} · ${foodRecovery(kind)} HP`,queued,()=>{
        void ITEM_ACTION_HANDLERS.cookedFood(player.inventory.findIndex(it=>it.kind===kind)).then(renderPanel)
      })
    button('Rest · up to 8 turns',queued || !burning(selected) || !!unsafe() || player.hp>=playerMaxHp(),()=>queue('rest',null,8))
    button(queued ? 'Stop' : 'Close',false,()=>{ if(queued){queued=false;queueToken++;renderPanel()}else close() })
    overlay.appendChild(box)
  }
  function keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key === 'Tab') {
      event.preventDefault()
      const controls = [...document.querySelectorAll('#campOverlay button:not(:disabled)')]
      const index = controls.indexOf(document.activeElement)
      controls[(index+(event.shiftKey?controls.length-1:1))%controls.length]?.focus()
    } else if (!['Enter',' '].includes(event.key)) event.preventDefault()
  }
  function draw(fire,vx,vy) {
    if (!burning(fire)) return false
    const visual = RENDER_STYLE.groundItems[fire.kind]
    if (drawImageVisualWithShadow(vx,vy,visual)) {
      // Small pixel flames over the existing fireplace; cosmetic only.
      ctx.save()
      const flame = fire.kind === 'dwarvenstove'
        ? ['..ooo..','.oyyyo.','.oyyyo.','..ooo..']
        : ['...o...','...o...','..ooo..','.oooo..','.ooyoo.','ooyyyoo','.oyyyo.','..ooo..']
      const pixel = TILE_PX/15
      flame.forEach((row,y)=>[...row].forEach((color,x)=>{
        if(color==='.')return
        ctx.fillStyle=color==='y'?'#ffe58d':'#ed7d27'
        ctx.fillRect(vx+TILE_PX*.27+x*pixel,vy+TILE_PX*(fire.kind === 'dwarvenstove' ? .47 : .2)+y*pixel,pixel,pixel)
      }))
      ctx.restore()
    } else drawTile(vx,vy,'♨','#ffad45',tileBackground(fire.x,fire.y,map[fire.y][fire.x]))
    return true
  }
  return {isFire,count,remaining,burning,nearby,warm,litAt,gather,findFlint,rate,foodRecovery,foodRemaining,
    tickFood,beginTurn,noteHealing,eat,perform,open,close,keydown,draw,FUEL_LIMIT}
})()
