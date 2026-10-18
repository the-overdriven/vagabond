'use strict'

// State changes are bound to consumed actions, never frame callbacks.
// Major hazards have dedicated seed/z derived placement decisions, so adding
// visual effects cannot perturb the ordinary dungeon-generation RNG stream.
const DungeonHazards = (() => {
  const around = [[1,0],[-1,0],[0,1],[0,-1]]
  const encode = p => keyXY(p.x,p.y)
  const levelAt = z => z <= -4 && currentLevelKind() === 'chain'
    ? deepLevels[chainDepthForZ(z)-2] : null
  const activeLevel = () => levelAt(currentZ)
  const config = () => WORLD_GEN_CONFIG.dungeons?.dwarvenRuins?.timedHazards
  const crusherConfig = () => config()?.crusher || {}
  const gasConfig = () => config()?.gas || {}
  const contains = (points,x,y) => (points || []).some(p => p.x === x && p.y === y)

  function hash(z, salt, x=0, y=0) {
    let h = (WORLD_SEED >>> 0) ^ Math.imul(z, 0x9e3779b1) ^ salt
    h = Math.imul(h ^ (h >>> 16) ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263), 0x85ebca6b)
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
    return (h ^ (h >>> 16)) >>> 0
  }

  // Only optional, one-port rooms are eligible. The valve and chest must be
  // safely reachable before the mechanism is committed to the generated map.
  function placeGasChamber(level, z) {
    const barred = new Set((level.traps || []).map(t => encode(t.trigger)))
    const entryPoints = (level.caves?.[0]?.entrances || [])
    const occupied = new Set(groundItems.filter(g => g.level === z).map(encode))
    for (const e of enemies) if (e.alive && e.level === z) occupied.add(encode(e))
    const rooms = (level.rooms || []).filter(r => !r.stairRoom && r.optional && !r.onMainRoute && !r.gallery &&
      !r.landmark && !r.vaultType && r.archetype !== 'Prison' && !r.prisonCell &&
      r.w >= 8 && r.h >= 8 && r.doorways?.length === 1 && r.doorways[0].length === 2 &&
      !(level.vaults || []).some(v => v.roomId === r.id))
      .sort((a,b) => hash(z,0x5fac33a1,a.cx,a.cy) - hash(z,0x5fac33a1,b.cx,b.cy))
    for (const room of rooms) {
      const doors = room.doorways[0]
      const doorKeys = new Set(doors.map(encode))
      if (!doors.every(d => ['marble','dwarvendoorclosed','dwarvendooropen'].includes(level.map[d.y]?.[d.x]))) continue
      if (entryPoints.some(p => p.x >= room.x-2 && p.x < room.x+room.w+2 && p.y >= room.y-2 && p.y < room.y+room.h+2)) continue
      const interior = []
      for (let y=room.y+1; y<room.y+room.h-1; y++) for (let x=room.x+1; x<room.x+room.w-1; x++) {
        if (level.map[y]?.[x] === 'marble' && !barred.has(keyXY(x,y)) && !occupied.has(keyXY(x,y)) &&
          !doorKeys.has(keyXY(x,y))) interior.push({x,y})
      }
      // Cardinal BFS is conservative: the real character can use diagonals.
      const walk = new Set(interior.map(encode))
      const search = start => {
        const seen=new Map([[encode(start),0]]),q=[start]
        for(let i=0;i<q.length;i++) for(const [dx,dy] of around) {
          const n={x:q[i].x+dx,y:q[i].y+dy}, k=encode(n)
          if(walk.has(k)&&!seen.has(k)) {seen.set(k,seen.get(encode(q[i]))+1);q.push(n)}
        }
        return seen
      }
      const entranceDistance = p => Math.min(...doors.map(d => Math.abs(p.x-d.x)+Math.abs(p.y-d.y)))
      // Reserve a visible chest 3+ steps beyond the entrance, with a valve
      // 2-3 cardinal walking steps away; valve is activated from an adjacent tile.
      const chests = interior.filter(p => entranceDistance(p)>=4 && entranceDistance(p)<=8)
        .sort((a,b) => hash(z,0x11bf889b,a.x,a.y)-hash(z,0x11bf889b,b.x,b.y))
      for(const chest of chests) {
        const distances = search(chest)
        const valves = interior.filter(p => encode(p)!==encode(chest) &&
          distances.get(encode(p))>=2 && distances.get(encode(p))<=3 &&
          entranceDistance(p)>=2 &&
          around.some(([dx,dy]) => {const n={x:p.x+dx,y:p.y+dy};return encode(n)!==encode(chest)&&
            distances.has(encode(n))}))
          .sort((a,b) => hash(z,0x7ade2983,a.x,a.y)-hash(z,0x7ade2983,b.x,b.y))
        const valve = valves[0]
        if(!valve) continue
        // A valve must not divide a room or block its doorway / the chest.
        const reachable = new Set(interior.filter(p=>encode(p)!==encode(valve)).map(encode))
        const seen = new Set([encode(chest)]),q=[chest]
        for(let i=0;i<q.length;i++) for(const [dx,dy] of around){
          const n={x:q[i].x+dx,y:q[i].y+dy}, k=encode(n)
          if(reachable.has(k)&&!seen.has(k)){seen.add(k);q.push(n)}
        }
        if(!doors.some(d=>around.some(([dx,dy])=>seen.has(keyXY(d.x+dx,d.y+dy))))) continue
        if(seen.size!==reachable.size) continue
        // The chamber substitutes for a discretionary reward. If Prison/
        // gallery chests already spent the floor's baseline chest allowance,
        // replace one ordinary Prison chest with empty prisoner remains.
        // Never displace a gallery prize, throne, artifact, vault or key.
        const loot= WORLD_GEN_CONFIG.dungeons.dwarvenRuins.loot || {}
        const floorIndex=Math.max(0,(level.dungeonFloor||1)-1)
        const allowance=Math.max(1,Math.round((loot.baseBudget||1)*(1+floorIndex*(loot.growthPerFloor||0))))
        const allocated=groundItems.filter(g=>g.level===z && g.kind==='chest' &&
          !g.royalThroneChest && !g.artifactGuaranteed && !g.vaultId).length
        const funding=allocated>=allowance ? groundItems.filter(g=>g.level===z && g.kind==='chest' &&
          !g.galleryReward && !g.gasChamberId && !g.royalThroneChest &&
          !g.artifactGuaranteed && !g.vaultId)
          .sort((a,b)=>{
            // Prefer consuming a Prison bonus chest, then an ordinary bonus
            // chest. Progression, gallery and royal rewards are untouchable.
            const priority=g=>Number(!(level.rooms||[]).some(r=>
              r.id===g.dungeonRoomId && r.archetype==='Prison'))
            return priority(a)-priority(b) ||
              hash(z,0x72b19a23,a.x,a.y)-hash(z,0x72b19a23,b.x,b.y)
          })[0] : null
        if(allocated>=allowance && !funding) continue
        for(const d of doors) if(level.map[d.y][d.x]==='marble') level.map[d.y][d.x]='dwarvendoorclosed'
        level.map[valve.y][valve.x]='dwarvengasvalve'
        // A few vents by the walls communicate the trap BEFORE opening it.
        const vents = interior.filter(p => encode(p)!==encode(chest) && encode(p)!==encode(valve) &&
          (p.x===room.x+1||p.x===room.x+room.w-2||p.y===room.y+1||p.y===room.y+room.h-2) &&
          Math.abs(p.x-chest.x)+Math.abs(p.y-chest.y)>=2)
          .sort((a,b)=>hash(z,0x9fa76b2c,a.x,a.y)-hash(z,0x9fa76b2c,b.x,b.y)).slice(0,2)
        for(const p of vents) level.map[p.y][p.x]='dwarvengasvent'
        if(funding) {
          funding.kind='skeleton';funding.looted=false;funding.hasLoot=false
          funding.description='A dead prisoner lies where the old dwarven treasury was once guarded.'
          delete funding.opened;delete funding.tier
        }
        const id=`dwarven-gas:${z}:${room.id}`
        groundItems.push({x:chest.x,y:chest.y,level:z,levelKind:'chain',caveIndex:-1,kind:'chest',
          opened:false,tier:Math.max(1,Math.min(5,2+(level.dungeonFloor||1))),dungeonRoomId:room.id,
          gasChamberId:id})
        room.gasChamber=true
        level.hazards.push({id,type:'gas',z,roomId:room.id,
          geometry:{room:{x:room.x+1,y:room.y+1,w:room.w-2,h:room.h-2},doors,
            chest:{x:chest.x,y:chest.y},valve,vents},
          state:'dormant',localTurn:0,stateEnteredTurn:0,lastProcessedTurn:-1,
          remainingTurns:gasConfig().durationTurns||15,successfulHits:0,valveProgress:0,exhausted:false})
        return true
      }
    }
    return false
  }

  // A guaranteed Crusher is placed from a pre-reserved empty side room.
  // Gas gets priority on its floor; no ordinary door/loot/prison is removed.
  function placeCrusher(level,z) {
    const banned = new Set((level.caves?.[0]?.entrances || []).map(encode))
    for (const trap of level.traps || []) banned.add(encode(trap.trigger))
    for (const p of groundItems) if (p.level === z) banned.add(encode(p))
    const rooms = (level.rooms || []).filter(r => !r.stairRoom && r.optional && !r.onMainRoute && !r.gallery &&
      !r.landmark && r.archetype !== 'Prison' && !r.prisonCell &&
      !(level.vaults || []).some(v => v.roomId === r.id) &&
      // Between two opposing original room walls, never a tiny isolated tile.
      ((r.w>=7 && r.w<=10 && r.h>=9) || (r.h>=7 && r.h<=10 && r.w>=9)))
    const candidates=[]
    for (const room of rooms) {
      const acrossX = room.w <= room.h
      const width = acrossX ? room.w-2 : room.h-2
      const long = acrossX ? room.h-2 : room.w-2
      // An odd, at-least-five-tile crushing strip along the passage. The
      // jaw travel width stays untouched and both ends have retreat space.
      const stripLength=Math.max(5,Math.floor(crusherConfig().stripLength || 5)|1)
      const halfStrip=Math.floor(stripLength/2)
      if (width < 5 || width > 8 || long < stripLength+4) continue
      for (let centerLong=halfStrip+2; centerLong<=long-halfStrip-3; centerLong++) {
      const footprint=[], stages=[], triggerTiles=[]
      for(let offset=0; offset<Math.ceil(width/2); offset++) {
        const stage=[]
        for(let row=centerLong-halfStrip; row<=centerLong+halfStrip; row++)
          for(const transverse of [offset,width-1-offset]) {
            const p= acrossX ? {x:room.x+1+transverse,y:room.y+1+row} :
              {x:room.x+1+row,y:room.y+1+transverse}
            if (!stage.some(q=>q.x===p.x&&q.y===p.y)) stage.push(p)
          }
        stages.push(stage)
      }
      for(let row=centerLong-halfStrip;row<=centerLong+halfStrip;row++) {
        const center=Math.floor(width/2)
        const p=acrossX ? {x:room.x+1+center,y:room.y+1+row} :
          {x:room.x+1+row,y:room.y+1+center}
        triggerTiles.push(p)
        for(let col=0;col<width;col++)
          footprint.push(acrossX?{x:room.x+1+col,y:room.y+1+row}:
            {x:room.x+1+row,y:room.y+1+col})
      }
      // The central plate must have room to retreat past either end.
      const escape= [-(halfStrip+1),halfStrip+1].some(delta=>{
        const p=acrossX ? {x:triggerTiles[halfStrip].x,y:triggerTiles[halfStrip].y+delta} :
          {x:triggerTiles[halfStrip].x+delta,y:triggerTiles[halfStrip].y}
        return level.map[p.y]?.[p.x]==='marble' && !banned.has(encode(p))
      })
      if (!escape) continue
      const replaceable=new Set(['dwarvenbed','dwarvenbedbarricade','dwarvencrate',
        'dwarvencratepieces','dwarvenrubble','dwarventable','dwarvenshelf'])
      const furniture=footprint.filter(p=>replaceable.has(level.map[p.y]?.[p.x]))
      if (furniture.length>3 || footprint.some(p=>
        (level.map[p.y]?.[p.x]!=='marble' && !replaceable.has(level.map[p.y]?.[p.x])) ||
        banned.has(encode(p)) ||
        (room.doorways||[]).flat().some(d=>p.x===d.x && p.y===d.y))) continue
      // At both ends of the strike strip there are at least two intact
      // walkable rows for retreat. Other mandatory routes never use it.
      candidates.push({room,trigger:triggerTiles[halfStrip],triggerTiles,dangerTiles:footprint,stages,width,furniture})
      }
    }
    if (!candidates.length) return false
    const ordered = candidates.map(c => ({...c,score:hash(z,0xc3dd72a1,c.trigger.x,c.trigger.y)}))
      .sort((a,b)=>Number(b.room.crusherReserved)-Number(a.room.crusherReserved) ||
        a.furniture.length-b.furniture.length || a.score-b.score || a.trigger.y-b.trigger.y || a.trigger.x-b.trigger.x)
    const placed=ordered[0]
    const baseTiles=[]
    const triggerKeys=new Set(placed.triggerTiles.map(encode))
    for(const p of placed.dangerTiles) {
      const col = placed.stages[0].some(q=>q.x===p.x&&q.y===p.y)
      const tile=triggerKeys.has(encode(p))?'dwarvencrusherplate':col?'dwarvencrushertrack':'marble'
      baseTiles.push({...p,tile})
      level.map[p.y][p.x]=tile
    }
    level.hazards.push({id:`dwarven-crusher:${z}:${placed.room.id}`,type:'crusher',z,
      roomId:placed.room.id,geometry:{triggerTiles:placed.triggerTiles,dangerTiles:placed.dangerTiles,
        jawStages:placed.stages,baseTiles},
      state:'idle',stateEnteredTurn:0,localTurn:0,lastProcessedTurn:-1,step:0,
      impactedMonsterIds:[],exhausted:false})
    return true
  }

  function generate() {
    const cfg = config()
    if (!cfg) return false
    const levels = []
    for (let depth = 4; depth <= deepLevels.length + 1; depth++) {
      const level = deepLevels[depth-2], z = chainZForDepth(depth)
      if (level?.dungeonPackage !== 'dwarvenRuins') continue
      level.hazards = []
      if (z <= cfg.minimumZ) levels.push({level,z})
    }
    // A chamber is a guaranteed encounter somewhere in the Ruins, never a
    // per-floor probability. Choose a seed-derived starting floor and try
    // the others if geometry/loot makes the first choice impossible. No extra
    // random draws, no dropping mandatory Prison/vault/progression invariants.
    const required = cfg.guaranteedGasChambersPerStratum ?? 1
    if (required !== 1 || !levels.length) return false
    const start = hash(-4,0x6a5c3a18) % levels.length
    const ordered = [...levels.slice(start),...levels.slice(0,start)]
    const chamberFloor = ordered.find(({level,z}) => placeGasChamber(level,z))
    // The caller rejects and regenerates a whole candidate world on failure.
    // Never accept a Ruins dungeon with no chamber or fabricate a bad room.
    if (!chamberFloor) return false
    // Guarantee a visible Crusher in each dungeon, not merely a chance to
    // attempt one. Reserve candidate rooms early on all eligible floors so a
    // gas room on one floor cannot remove the only possible Crusher.
    const eligible = levels.filter(pair => pair.level !== chamberFloor.level)
    const orderedCrusherFloors = eligible.slice().sort((a,b) =>
      hash(a.z,0x48a9b35f)-hash(b.z,0x48a9b35f))
    const requiredCrusher = cfg.guaranteedCrushersPerStratum ?? 1
    let placedCrushers=0
    for (const {level,z} of orderedCrusherFloors) {
      const guaranteed = placedCrushers < requiredCrusher
      if (!guaranteed && hash(z,0x48a9b35f) / 0x100000000 >= cfg.crusherFloorChance) continue
      if (placeCrusher(level,z)) placedCrushers++
    }
    if (placedCrushers < requiredCrusher) return false
    return true
  }

  function doorHazard(x,y) {
    return (activeLevel()?.hazards || []).find(h => h.type==='gas' &&
      contains(h.geometry.doors,x,y)) || null
  }
  function valveHazard(x,y) {
    return (activeLevel()?.hazards || []).find(h => h.type==='gas' &&
      h.geometry.valve.x===x && h.geometry.valve.y===y) || null
  }
  function exposed(h,x,y) {
    const r=h.geometry.room
    return x>=r.x && x<r.x+r.w && y>=r.y && y<r.y+r.h &&
      !contains(h.geometry.doors,x,y)
  }
  function openOwnedDoors(h, breached=false) {
    const level=activeLevel()
    for (const p of h.geometry.doors) {
      const t=level.map[p.y]?.[p.x]
      if (t==='dwarvendoorbreached') continue
      if (['dwarvendoorlocked','dwarvendoorclosed','dwarvendooropen'].includes(t))
        level.map[p.y][p.x]=breached?'dwarvendoorbreached':'dwarvendooropen'
    }
    minimapDirty=true;invalidateUndergroundFov();clearAutoPath()
  }
  function vent(h,reason) {
    if (h.state==='vented') return
    h.state='vented';h.remainingTurns=0;h.exhausted=true
    openOwnedDoors(h)
    log(reason==='valve'?'The emergency valve vents the poison gas. The sealed doors unlock!':
      'The gas pressure falls. The chamber doors unlock.', 'good')
  }
  function onChestOpened(chest) {
    if (!chest.gasChamberId) return false
    const h=(activeLevel()?.hazards || []).find(h=>h.id===chest.gasChamberId)
    if (!h || h.type!=='gas' || h.state!=='dormant') return false
    h.state='active';h.stateEnteredTurn=h.localTurn+1
    h.remainingTurns=gasConfig().durationTurns||15
    h.successfulHits=0;h.valveProgress=0
    let broken=false
    for (const p of h.geometry.doors) {
      const t=activeLevel().map[p.y]?.[p.x]
      if (t==='dwarvendoorbreached') {broken=true;continue}
      activeLevel().map[p.y][p.x]='dwarvendoorlocked'
    }
    log(broken?'Poison gas hisses from the ancient vents! A broken door cannot seal.':
      'The treasury doors slam shut! Poison gas hisses through the chamber!', 'bad')
    clearAutoPath();minimapDirty=true;invalidateUndergroundFov()
    // Actor standing in a leaf may move OFF the newly closed tile, not into it.
    return true
  }
  function onDoorInteraction(x,y,armed) {
    const h=doorHazard(x,y)
    if (!h) return false
    // Marked doors still work as ordinary doors before the chest is opened.
    if (h.state!=='active') return false
    if (!armed) {
      log('The emergency seal has no key. Find the pressure-release valve, or breach it with a weapon.', 'info')
      return true
    }
    const cfg=gasConfig()
    const succeeded=chance(Math.min(cfg.breachChanceCap||.5,playerBreachAtk()/100))
    if (succeeded) h.successfulHits++
    if (h.successfulHits >= (cfg.breachSuccessfulHits||2)) {
      openOwnedDoors(h,true)
      log('The final blow destroys the emergency seal. The doors break open!', 'good')
    } else {
      log(succeeded?`The mechanism cracks (${h.successfulHits}/${cfg.breachSuccessfulHits||2}). Strike again!`:
        'You strike the emergency seal, but the mechanism holds.', 'info')
      // Standard noisy breaching rules still apply.
      alarmNearestEnemyFromBreach()
    }
    return true
  }
  function onValveInteraction(x,y) {
    const h=valveHazard(x,y)
    if (!h) return false
    if (h.state==='vented') log('The emergency valve is already open.', 'info')
    else if (h.state==='dormant') log('A pressure-release valve. It may vent the pipes if the treasury trap is activated.', 'info')
    else {
      h.valveProgress++
      if (h.valveProgress >= (gasConfig().valveActionTurns||2)) vent(h,'valve')
      else log('You turn the corroded pressure valve. One more turn should release it.', 'info')
    }
    return true
  }
  function onActorEntered(actor, fromX, fromY) {
    if (actor.x === fromX && actor.y === fromY || (actor !== player && !actor.alive)) return
    const level = activeLevel()
    if (!level) return
    for (const hazard of level.hazards || []) {
      if (hazard.type !== 'crusher' || hazard.state !== 'idle' ||
          !contains(hazard.geometry.triggerTiles,actor.x,actor.y)) continue
      hazard.state = 'warning'
      hazard.step = 0
      // Player enters before the action is counted. Monsters enter during
      // enemy resolution, after the action's count has already advanced.
      hazard.stateEnteredTurn = hazard.localTurn + (actor === player ? 1 : 0)
      if (actor === player || enemyIsVisibleOnMainView(actor)) {
        clearAutoPath()
        log('Stone jaws grind out of the opposite walls. Get clear of the passage!', 'bad')
      }
    }
  }

  // Advance one tile of solid masonry from EACH wall per consumed action.
  // Damage is resolved against the advancing tiles and can strike monsters
  // just as reliably as the hero. Newly inserted masonry blocks movement,
  // sight and projectiles until it retracts, independently of animation.
  function advanceCrusher(hazard) {
    const cfg=crusherConfig(),stage=hazard.geometry.jawStages[hazard.step] || []
    const level=activeLevel()
    const caught=actor=>contains(stage,actor.x,actor.y)
    if (caught(player)) {
      const damage=player.godMode?0:Math.ceil(playerMaxHp()*cfg.playerDamageMaxHpFraction)
      if (damage) {player.hp-=damage;absorbPlayerFatalDamage();checkPlayerHealthWarning()}
      log(`The advancing stone walls crush you for ${damage} HP!`,'bad')
      spawnDamageNumber(player.x,player.y,damage||'Immune!',RENDER_STYLE.damage.playerHit)
      if(player.hp<=0) die(null,'dwarven crusher')
    }
    let monsterHits=0
    for (const e of [...enemies]) {
      if (!e.alive || !onCurrentLevel(e) || !caught(e) ||
        hazard.impactedMonsterIds.includes(e.id)) continue
      hazard.impactedMonsterIds.push(e.id)
      if (enemyImmunityActive(e)) continue
      const boss=e.prefix==='Champion'||e.isBoss===true||e.boss===true
      const cap=boss?cfg.bossDamageCapFraction:cfg.normalMonsterDamageCapFraction
      const damage=Math.max(1,Math.ceil(e.maxHp*cap))
      const enraged=enemyIsEnraged(e),visible=enemyIsVisibleOnMainView(e)
      e.hp-=damage;absorbEnemyFatalHit(e);logEnemyEnrageTransition(e,enraged)
      if(visible) {monsterHits++;spawnDamageNumber(e.x,e.y,damage,RENDER_STYLE.damage.enemyHit)}
      if(e.hp<=0) {if(visible)log(`The ${e.name} is crushed between the dwarven walls!`,'info');killEnemy(e,false,'dwarven crusher')}
    }
    // All advancing tiles become temporarily impassable. An actor struck on
    // a newly-solid tile may move OFF on the next action (as with gas doors).
    for(const p of stage) level.map[p.y][p.x]='dwarvencrusherjaw'
    hazard.step++
    minimapDirty=true;invalidateUndergroundFov();clearAutoPath()
    if(hazard.step>=hazard.geometry.jawStages.length) {
      // Hold the terminal strike for one consumed action so the pressure
      // plate visibly becomes opposing stone faces separated by a crack.
      // Damage is already resolved; the held frame never hits twice.
      const middle = new Set(hazard.geometry.triggerTiles.map(encode))
      for(const p of stage) if(middle.has(encode(p)))
        level.map[p.y][p.x]='dwarvencrusherpinch'
      hazard.state='impact';hazard.stateEnteredTurn=hazard.localTurn
      log(monsterHits?'The stone jaws slam together around the crushed creatures!':
        'The opposing stone jaws slam shut!','info')
    }
  }

  function onPlayerTurnConsumed(tick) {
    const level = activeLevel()
    if (!level) return
    for (const hazard of level.hazards || []) {
      if (hazard.lastProcessedTurn === tick) continue
      hazard.lastProcessedTurn = tick
      hazard.localTurn++
      if (hazard.localTurn <= hazard.stateEnteredTurn) continue
      if (hazard.type === 'gas') {
        if (hazard.state !== 'active') continue
        // Movement/valve/door actions have already changed state and position.
        // On the chest-opening action no exposure is dealt.
        const damageFor = actor => Math.max(1,Math.ceil(actor.maxHp * (gasConfig().damageMaxHpFraction||.08)))
        if (exposed(hazard,player.x,player.y)) {
          const damage=player.godMode?0:Math.max(1,Math.ceil(playerMaxHp()*(gasConfig().damageMaxHpFraction||.08)))
          player.hp-=damage;absorbPlayerFatalDamage();checkPlayerHealthWarning()
          log(`Poison gas burns your lungs for ${damage} HP!`, 'bad')
          spawnDamageNumber(player.x,player.y,damage||'Immune!',RENDER_STYLE.damage.playerHit)
          if (player.hp<=0) {die(null,'poison gas');return}
        }
        for(const e of [...enemies]) {
          if (!e.alive || !onCurrentLevel(e) || !exposed(hazard,e.x,e.y) || enemyImmunityActive(e)) continue
          const damage=damageFor(e),wasEnraged=enemyIsEnraged(e),visible=enemyIsVisibleOnMainView(e)
          e.hp-=damage;absorbEnemyFatalHit(e);logEnemyEnrageTransition(e,wasEnraged)
          if(visible) spawnDamageNumber(e.x,e.y,damage,RENDER_STYLE.damage.enemyHit)
          if(e.hp<=0) {if(visible) log(`The ${e.name} falls to poison gas.`, 'info');killEnemy(e,false,'poison gas')}
        }
        hazard.remainingTurns--
        if (hazard.remainingTurns<=0) vent(hazard,'timeout')
        continue
      }
      if (hazard.type !== 'crusher') continue
      if (hazard.state === 'warning') {
        advanceCrusher(hazard)
      } else if (hazard.state === 'impact') {
        for (const p of hazard.geometry.baseTiles) level.map[p.y][p.x]=p.tile
        hazard.state='cooldown';hazard.stateEnteredTurn=hazard.localTurn
        minimapDirty=true;invalidateUndergroundFov();clearAutoPath()
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

  function gasAt(x,y) {
    return (activeLevel()?.hazards || []).some(h=>h.type==='gas' && h.state==='active' && exposed(h,x,y))
  }
  function activeGasStatus() {
    return (activeLevel()?.hazards || []).find(h => h.type==='gas' &&
      h.state==='active' && exposed(h,player.x,player.y)) || null
  }
  function validate(level) {
    for (const h of level.hazards || []) {
      if (h.type==='gas') {
        if (!['dormant','active','vented'].includes(h.state) || !Number.isInteger(h.localTurn) ||
          !Number.isInteger(h.remainingTurns) || !Number.isInteger(h.valveProgress) ||
          !Number.isInteger(h.successfulHits) || h.geometry.doors.length!==2 ||
          level.map[h.geometry.valve.y]?.[h.geometry.valve.x]!=='dwarvengasvalve' ||
          !h.geometry.doors.every(p=> ['dwarvendoorclosed','dwarvendooropen','dwarvendoorlocked','dwarvendoorbreached'].includes(level.map[p.y]?.[p.x]))) return false
        continue
      }
      if (h.type!=='crusher' || h.geometry.dangerTiles.length<15 ||
        h.geometry.triggerTiles.length!==Math.max(5,Math.floor(crusherConfig().stripLength || 5)|1) || !['idle','warning','impact','cooldown'].includes(h.state) ||
        !Array.isArray(h.impactedMonsterIds) || !Number.isInteger(h.localTurn) ||
        !Number.isInteger(h.step) || h.step<0 || h.step>h.geometry.jawStages?.length ||
        !Array.isArray(h.geometry.jawStages) ||
        !Array.isArray(h.geometry.baseTiles) || h.geometry.dangerTiles.length!==h.geometry.baseTiles.length) return false
      const advanced=new Set((['warning','impact'].includes(h.state)?h.geometry.jawStages.slice(0,h.step):[]).flat().map(encode))
      const terminal=h.state==='impact' ? new Set(h.geometry.triggerTiles.map(encode)) : new Set()
      if(!h.geometry.baseTiles.every(p=>level.map[p.y]?.[p.x]===
        (advanced.has(encode(p)) ? terminal.has(encode(p)) ? 'dwarvencrusherpinch' : 'dwarvencrusherjaw' : p.tile))) return false
    }
    return true
  }
  return {generate,onActorEntered,onPlayerTurnConsumed,onChestOpened,onDoorInteraction,onValveInteraction,
    doorHazard,valveHazard,gasAt,activeGasStatus,knownDanger,activeCrusherStatus,validate}
})()
