function beginFleeGame() {
  cy.viewport(1440, 900)
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.window().then(win => win.eval('WORLD_SEED=246813579; rngState=WORLD_SEED'))
  cy.get('#raceName').clear().type('Rare Flee Tester')
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
  cy.window().then(win => win.eval(`(() => {
    window.fleeAssert = (ok, message) => { if (!ok) throw new Error(message) }
    window.fleeGap = e => Math.max(Math.abs(e.x-player.x), Math.abs(e.y-player.y))
    window.resetFleeArena = (speed=5) => {
      replayRecording=false; replayPlaying=false; replaySimulationMode=false; activeReplay=null
      replayAnimationsDisabled=true; currentZ=0; map=surfaceMap; raceOpen=false
      deathTransition=null; cameraAnimating=false; attackAnim=null
      mapOpen=false; invOpen=false; tradeOpen=false
      enemies=[]; groundItems=[]; beastTracks=new Map()
      npcs=[{name:'Merchant',x:120,y:120,homeX:120,homeY:120,talkFreezeTurns:0}]
      occupied=new Set([keyXY(120,120)]); oldHunterQuest=null
      for(let y=20;y<=100;y++) for(let x=20;x<=100;x++) {
        map[y][x]='grass'; discovered[y][x]=true; grasslandTrees.delete(keyXY(x,y))
      }
      player.x=40; player.y=50; player.lvl=1; player.hp=1000; player.maxHp=1000
      player.godMode=false; player.invisibleTurns=0; player.speedPotionTurns=0; player.speedPotionBonus=0
      player.freezing={active:false,turns:0}; player.curseDebuffs=[]; player.inventory=[]
      player.equip.weapon=null; player.equip.shield=null; player.equip.armor=null
      player.baseSpd=speed-raceBonus('spd'); player.baseSpd+=speed-playerSpd(); player.baseDef=0
      spawnPoint={x:120,y:120}; turnCount=0; consecutiveWaitTurns=0
      projectileAnims=[]; damageAnims=[]; fxAnims=[]; soundAnims=[]
      rngState=246813579
    }
    window.makeFleeEnemy = (name='GAUR',distance=6,extra={}) => {
      const t=ENEMY_TEMPLATE_BY_NAME[name], x=player.x+distance, y=player.y
      const e=addEnemy({...t,id:'flee-'+enemies.length,name,baseName:name,x,y,homeX:x,homeY:y,
        homeTileType:'grass',level:0,alive:true,hp:200,maxHp:200,aware:false,alarmed:false,
        prefix:null,equipment:null,evades:false,...extra})
      occupied.add(keyXY(e.x,e.y)); return e
    }
    window.fleeChase = (e,limit=12) => {
      let min=fleeGap(e), caught=false
      for(let i=0;i<limit && e.rareFleeTurns>0;i++) {
        if(fleeGap(e)>1) {player.x+=Math.sign(e.x-player.x);player.y+=Math.sign(e.y-player.y)}
        min=Math.min(min,fleeGap(e))
        enemyTurn()
        if(e.aware || e.alarmed) {caught=true;break}
      }
      return {caught,min,gap:fleeGap(e)}
    }
    resetFleeArena()
  })()`))
}

describe('Rare monster sightings and flight', () => {
  beforeEach(beginFleeGame)

  it('guarantees the first escape even at speed 99 with a potion and blocks damage before animation', () => {
    cy.window().then(win => win.eval(`(async () => {
      resetFleeArena(99)
      player.inventory=[createItem('speedpotion')]; useSpeedPotion(0)
      const e=makeFleeEnemy('GAUR',1), hp=player.hp, beastHp=e.hp
      await playerAttackEnemy(e)
      fleeAssert(e.rareSightings===1 && e.hp===beastHp, 'first strike starts protected flight')
      let previous=fleeGap(e)
      for(let i=0;i<8;i++) {
        enemyTurn()
        fleeAssert(fleeGap(e)>=previous, 'first-sighting gap never shrinks after a chase turn')
        fleeAssert(!e.aware && !e.alarmed && player.hp===hp, 'no combat during first sighting')
        previous=fleeGap(e)
        if(!e.rareFleeTurns) break
        player.x+=Math.sign(e.x-player.x); player.y+=Math.sign(e.y-player.y)
        await playerAttackEnemy(e)
        fleeAssert(e.hp===beastHp, 'first flight blocks damage')
      }
      fleeAssert(e.rareSightings===1 && !e.rareFleeTurns && fleeGap(e)>=RARE_FLEE.rearmDistance, 'first escape completes')
      fleeAssert(beastTracks.size===0, 'flight leaves no tracks')
    })()`))
  })

  it('stampedes out of an enclosed component without damage and keeps occupancy and home consistent', () => {
    cy.window().then(win => win.eval(`(() => {
      resetFleeArena()
      const e=makeFleeEnemy('Vampire',1,{homeRadius:0}), old=keyXY(e.x,e.y), hp=player.hp
      map[e.y][e.x]='forest'
      for(const [dx,dy] of DIRS8) map[e.y+dy][e.x+dx]='wall'
      map[50][60]='forest'
      rareStartFlee(e,1,true); rareFlee(e,1)
      fleeAssert(!e.rareFleeTurns && fleeGap(e)>=RARE_FLEE.rearmDistance, 'boxed first sighting relocates')
      fleeAssert(!occupied.has(old) && occupied.has(keyXY(e.x,e.y)), 'occupancy follows slip')
      fleeAssert(e.homeX===e.x && e.homeY===e.y && enemyBiomes(ENEMY_TEMPLATE_BY_NAME.Vampire).includes(e.homeTileType), 'home reanchored in native biome')
      fleeAssert(e.animStart===undefined && e.hp===200 && player.hp===hp && !e.aware && !e.alarmed, 'no slide or combat')
      fleeAssert(document.getElementById('logpanel').textContent.includes('stampedes through you'), 'stampede message')
      const home={x:e.homeX,y:e.homeY}; e.x++; map[e.y][e.x]='grass'
      occupied=new Set([keyXY(e.x,e.y)])
      player.x=20; player.y=20
      for(let i=0;i<20 && (e.x!==home.x || e.y!==home.y);i++) enemyWander(e)
      fleeAssert(e.x===home.x && e.y===home.y, 'home-return resumes')
    })()`))
  })

  it('makes the second sighting a speed chase and restores ordinary speed on catch or escape', () => {
    cy.window().then(win => win.eval(`(() => {
      for(const potion of [false,true]) {
        resetFleeArena(5)
        if(potion) {player.inventory=[createItem('speedpotion')];useSpeedPotion(0)}
        const e=makeFleeEnemy('DRUSK',6,{rareSightings:1})
        rareStartFlee(e,6,true)
        fleeAssert(enemySpd(e)===RARE_FLEE.startledMinSpd && e.spd===2, 'temporary Startled, base SPD unchanged')
        const result=fleeChase(e)
        fleeAssert(result.caught===potion, 'potion catches from six tiles; normal speed escapes')
        fleeAssert(!e.rareFleeTurns && enemySpd(e)===Math.max(1,e.spd+enemyTileEffects(e).speed) && rareStartledBonus(e)===0, 'temporary speed ends with flight')
      }
      resetFleeArena()
      const e=makeFleeEnemy('GAUR',2,{rareSightings:1})
      rareStartFlee(e,2,true)
      for(const [dx,dy] of DIRS8) map[e.y+dy][e.x+dx]='wall'
      fleeAssert(!rareFlee(e,2) && e.aware && e.alarmed, 'visible second sighting can be cornered')
    })()`))
  })

  it('honors re-arm distance, third encounters, surface scope, concealment and invisible attacks', () => {
    cy.window().then(win => win.eval(`(async () => {
      resetFleeArena()
      let e=makeFleeEnemy('GAUR',6,{rareSightings:1,rareArmed:false,aggro:0,wander:false})
      enemyTurn(); fleeAssert(e.rareSightings===1 && !e.rareArmed, 'nearby cannot rearm')
      player.x=e.x-RARE_FLEE.rearmDistance; enemyTurn()
      fleeAssert(e.rareArmed, 'distance rearms')
      player.x=e.x-6; enemyTurn(); fleeAssert(e.rareSightings===2 && e.rareFleeTurns>0, 'second encounter starts')
      resetFleeArena(); e=makeFleeEnemy('GAUR',1,{rareSightings:2})
      enemyTurn(); fleeAssert(!e.rareFleeTurns && e.aware && e.alarmed, 'third approach fights')
      for(const [name,extra,z] of [['Kveld',{rareFleeTurns:8,rareSightings:1},0],['GAUR',{},-1],['GAUR',{alarmed:true},0]]) {
        resetFleeArena(); e=makeFleeEnemy(name,6,extra); currentZ=z
        fleeAssert(!rareFleeEligible(e) && !rareFleeBlocksAttack(e), 'ineligible stale flags never grant immunity')
      }
      resetFleeArena(); e=makeFleeEnemy('Vampire',6)
      map[player.y][player.x]='forest'; e.forestConcealX=player.x;e.forestConcealY=player.y
      fleeAssert(!rareStartFlee(e,6), 'forest concealment prevents sighting')
      map[player.y][player.x]='grass'; player.invisibleTurns=20
      fleeAssert(!rareStartFlee(e,6), 'invisibility prevents visual sighting')
      e.x=player.x+1; occupied=new Set([keyXY(e.x,e.y)])
      await playerAttackEnemy(e); enemyTurn()
      fleeAssert(e.rareSightings===1 && e.rareFleeTurns>0 && !e.aware && !e.alarmed && e.hp===200, 'invisible first strike flees safely')
      resetFleeArena(); player.invisibleTurns=20
      e=makeFleeEnemy('Vampire',1,{rareSightings:1})
      await playerAttackEnemy(e); enemyTurn()
      fleeAssert(e.rareSightings===2 && e.rareFleeTurns>0 && !e.aware && !e.alarmed, 'invisible second strike flees too')
      const turns=e.rareFleeTurns; currentZ=-1; enemyTurn()
      fleeAssert(e.rareFleeTurns===turns, 'off-level flight pauses')
      currentZ=0; e.alive=false; enemyTurn()
      fleeAssert(e.rareFleeTurns===turns, 'dead monsters do not flee')
    })()`))
  })

  it('persists compact mid-flight state and replays a recorded chase including its seeded slip', () => {
    cy.window().then(win => win.eval(`(async () => {
      resetFleeArena()
      let e=makeFleeEnemy('GAUR',4)
      const untouched=buildSaveObject().enemies.find(v=>v.id===e.id)
      fleeAssert(!Object.keys(untouched).some(k=>k.startsWith('rare')), 'defaults omitted')
      enemyTurn()
      const save=JSON.parse(JSON.stringify(buildSaveObject())), id=e.id
      fleeAssert(save.version===22, 'current save version')
      const saved=save.enemies.find(v=>v.id===id)
      fleeAssert(saved.rareSightings===1 && saved.rareFleeTurns===7 && saved.rareFleeAcc===0.5 && saved.rareArmed===false, 'exact mid-flight fields')
      loadGameFromObject(save,{isReplayInit:true}); replayAnimationsDisabled=true
      e=enemies.find(v=>v.id===id)
      fleeAssert(JSON.stringify(rareFleeSaveState(e))===JSON.stringify(rareFleeSaveState(saved)), 'mid-flight round trip')
      const state=()=>({x:enemies[0].x,y:enemies[0].y,rare:rareFleeSaveState(enemies[0]),
        target:[enemies[0].farTargetX,enemies[0].farTargetY],turn:turnCount,hp:player.hp})
      startReplayRecording()
      for(let i=0;i<7;i++) {
        e=enemies[0]
        await tryMove(Math.sign(e.x-player.x),Math.sign(e.y-player.y))
      }
      const expected=state(), recorded=JSON.parse(JSON.stringify(replayData))
      fleeAssert(!enemies[0].rareFleeTurns && enemies[0].farTargetX!=null, 'escape resumes far route')
      fleeAssert(recorded.actions.length===7, 'real chase actions recorded')
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true; replaySimulationMode=true; activeReplay=recorded
      replayPlaying=true; replayRecording=false; replayRngIndex=0
      try {for(const action of recorded.actions) await runReplayAction(action)}
      finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
      fleeAssert(replayRngIndex===recorded.rng.length, 'replay consumes the exact RNG trace')
      fleeAssert(JSON.stringify(state())===JSON.stringify(expected), 'chase, slip and route replay identically: '+JSON.stringify({expected,actual:state()}))
    })()`))
  })

  it('prioritizes flight over temple retreat, survives nearby alarms, and resumes tracks independently of animation', () => {
    cy.window().then(win => win.eval(`(() => {
      const runs=[]
      for(const animate of [false,true]) {
        resetFleeArena()
        replayAnimationsDisabled=!animate
        map[player.y][player.x]='temple'
        const e=makeFleeEnemy('GAUR',4), positions=[]
        for(let i=0;i<8;i++) {
          enemyTurn()
          positions.push([e.x,e.y,e.rareFleeTurns,e.rareFleeAcc])
          if(e.rareFleeTurns) {
            alarmEnemiesNearHit({x:e.x,y:e.y})
            fleeAssert(!e.alarmed && !e.fleeingHoly && !e.aware, 'flight precedes temple and nearby combat')
          }
        }
        fleeAssert(beastTracks.size===0 && e.farTargetX!=null, 'flight suppresses tracks and then selects route')
        const previousChance=TRACK_CONFIG.chance
        try {
          TRACK_CONFIG.chance=1
          for(let i=0;i<20 && !beastTracks.size;i++) enemyFarWander(e)
          fleeAssert(beastTracks.size===1, 'normal far travel resumes track creation')
        } finally {TRACK_CONFIG.chance=previousChance}
        runs.push({positions,rng:rngState,x:e.x,y:e.y})
      }
      fleeAssert(JSON.stringify(runs[0])===JSON.stringify(runs[1]), 'animation enabled/disabled has identical gameplay')
      replayAnimationsDisabled=true
    })()`))
  })

  for(const width of [1440,390]) it('shows temporary Startled status in the shared enemy tooltip at '+width+'px', () => {
    cy.viewport(width,900)
    cy.window().then(win => win.eval(`(() => {
      resetFleeArena()
      const e=makeFleeEnemy('DRUSK',4)
      rareStartFlee(e,4,true)
      const info=tileInspectInfo(e.x,e.y)
      fleeAssert(info.html.includes('Fleeing (1/2)') && info.html.includes('Startled (+'+rareStartledBonus(e)+' SPD)') && rareStartledBonus(e)>0, 'flight status explains SPD bonus')
      e.rareFleeTurns=0
      fleeAssert(!tileInspectInfo(e.x,e.y).html.includes('Startled'), 'status ends with flight')
    })()`))
  })
})
