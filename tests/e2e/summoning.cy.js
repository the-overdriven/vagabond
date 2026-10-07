function beginSummonArena() {
  cy.visit('/')
  cy.get('#raceName').clear().type('Summon Tester')
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay').should('not.be.visible')
  cy.get('#raceOverlay').should('not.have.class', 'show')
  cy.window().then(win => win.eval(`(() => {
    window.summonCheck = (ok,msg) => {if (!ok) throw new Error(msg)}
    window.resetSummonArena = () => {
      replayRecording=false; replayPlaying=false; replaySimulationMode=false; activeReplay=null
      replayData=null; replayAnimationsDisabled=true
      currentZ=0; currentCave=-1; map=surfaceMap; raceOpen=false
      mapOpen=false; invOpen=false; tradeOpen=false; deathTransition=null
      cameraAnimating=false; attackAnim=null; pendingMove=null
      for(let y=30;y<=55;y++) for(let x=30;x<=55;x++) {
        map[y][x]='grass'; discovered[y][x]=true; grasslandTrees.delete(keyXY(x,y))
      }
      enemies=[]; groundItems=[]; occupied=new Set(); damageAnims=[]; turnCount=0; consecutiveWaitTurns=0
      player.x=40; player.y=40; player.hp=1000; player.maxHp=1000; player.race='human'
      player.godMode=false; player.invisibleTurns=0; player.poisonTurns=0
      player.freezing={active:false,turns:0}; player.curseDebuffs=[]; player.berryRegenTurns=0
      player.speedPotionTurns=0; player.equip={weapon:null,armor:null,shield:null}; player.inventory=[]
    }
    window.makeSummoner = (name='Lich',distance=3) => {
      const t=ENEMY_TEMPLATE_BY_NAME[name]
      const e=addEnemy({...t,id:'summoner',baseName:name,x:player.x+distance,y:player.y,
        homeX:player.x+distance,homeY:player.y,homeTileType:'grass',level:0,levelKind:null,
        maxHp:t.hp,alive:true,aware:true,prefix:null,equipment:null})
      occupied.add(keyXY(e.x,e.y)); return e
    }
    resetSummonArena()
  })()`))
}

describe('Once-only monster summoning', () => {
  beforeEach(beginSummonArena)

  it('uses direct templates, one-third Wolf HP/ATK/DEF, and unchanged SPD/GRACE', () => {
    cy.window().then(win => win.eval(`(() => {
      const previous={chance,randInt}
      try {
        chance=p=>p===0.10; randInt=(a,b)=>a===1?b:a
        for(const name of ['Lich','Serpent Queen','Wolf']) {
          resetSummonArena()
          const caster=makeSummoner(name)
          caster.hp=999; caster.atk=999; caster.def=999; caster.prefix='Champion'
          summonCheck(tryEnemySummon(caster),'successful summon: '+name)
          const children=enemies.filter(e=>e!==caster), t=ENEMY_TEMPLATE_BY_NAME[caster.summonSpecies]
          const strength=caster.summonStrength ?? 1
          summonCheck(children.length===caster.summonAmount,'maximum count: '+name)
          const summonFx=damageAnims.filter(anim=>anim.amount==='Summoned!')
          summonCheck(SUMMON_ANIM_MS===1000 && SUMMON_ANIM_MS>DAMAGE_ANIM_MS,'summon label lasts longer than ordinary combat text')
          summonCheck(summonFx.slice(-children.length).every(anim=>anim.duration===SUMMON_ANIM_MS),'each summoned creature gets the slower label duration')
          for(const e of children) {
            summonCheck(e.hp===Math.max(1,Math.round(t.hp*strength)) && e.maxHp===e.hp,'template HP')
            summonCheck(e.atk===Math.max(1,Math.round(t.atk*strength)) && e.def===Math.max(0,Math.round(t.def*strength)),'template ATK/DEF')
            summonCheck(e.spd===t.spd && e.grace===t.grace,'unchanged speed/grace')
            summonCheck(e.prefix===null && e.equipment===null,'no prefix or gear')
            summonCheck(!e.abilities.includes('summon'),'no recursive summons')
            summonCheck(e.alarmed && e.alarmedZ===currentZ && e.alarmedLevelKind===currentLevelKind(),'summons immediately Alarmed')
            const hp=player.hp
            enemyAttackPlayer(e)
            enemyRangedAttackPlayer(e)
            summonCheck(player.hp===hp,'no creation-turn attack')
          }
          const count=enemies.length
          summonCheck(!tryEnemySummon(caster) && enemies.length===count,'once-only')
        }
      } finally {chance=previous.chance; randInt=previous.randInt}
    })()`))
  })

  it('keeps a blocked summon unused and reduces the count to free adjacent space', () => {
    cy.window().then(win => win.eval(`(() => {
      const previous={chance,randInt}
      try {
        chance=p=>p===0.10; randInt=(a,b)=>a===1?b:a
        const caster=makeSummoner('Lich')
        for(const [dx,dy] of DIRS8) map[caster.y+dy][caster.x+dx]='mountain'
        summonCheck(!tryEnemySummon(caster) && !caster.summonUsed,'blocked summon stays available')
        map[caster.y-1][caster.x]='grass'
        summonCheck(tryEnemySummon(caster) && enemies.length===2,'partial placement')
        const child=enemies[1]
        summonCheck(child.x===caster.x && child.y===caster.y-1,'only free tile used')
      } finally {chance=previous.chance; randInt=previous.randInt}
    })()`))
  })

  it('summons while chasing, saves the spent flag and delay, and replays the same creatures', () => {
    cy.window().then(win => win.eval(`(async () => {
      const caster=makeSummoner('Lich',3)
      rngState=7
      startReplayRecording()
      const hp=player.hp
      skipTurn()
      summonCheck(caster.summonUsed && enemies.length>1,'summoning while out of attack range')
      summonCheck(player.hp===hp,'summoning turn gives player a reaction window')
      const midway=JSON.parse(JSON.stringify(buildSaveObject()))
      const savedCaster=midway.enemies.find(e=>e.id===caster.id)
      summonCheck(savedCaster.summonUsed && midway.enemies.filter(e=>e.id!==caster.id).every(e=>e.summonedTurn===turnCount&&e.alarmed&&e.alarmedZ===currentZ),'save exact flags')
      const initial=replayData.initialState
      summonCheck(!initial.enemies[0].summonUsed && initial.enemies[0].summonedTurn===null,'replay initial flags')
      for(let i=0;i<3;i++) skipTurn()
      const state=()=>({hp:player.hp,turn:turnCount,enemies:buildSaveObject().enemies,nextEnemyId})
      const expected=JSON.parse(JSON.stringify(state())), recorded=JSON.parse(JSON.stringify(replayData))
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true; replaySimulationMode=true; activeReplay=recorded
      replayPlaying=true; replayRecording=false; replayRngIndex=0
      try {for(const action of recorded.actions) await runReplayAction(action)}
      finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
      summonCheck(replayRngIndex===recorded.rng.length,'same RNG trace')
      summonCheck(JSON.stringify(state())===JSON.stringify(expected),'same summons, actions and HP after replay')
      loadGameFromObject(midway,{isReplayInit:true})
      const restored=enemies.find(e=>e.id===caster.id)
      summonCheck(restored.summonUsed && enemies.length===midway.enemies.length,'restore without repeat summons')
      summonCheck(enemies.filter(e=>e.id!==caster.id).every(e=>e.summonedTurn===midway.turnCount&&e.alarmed&&e.alarmedZ===currentZ),'restore creation-turn delay and Alarmed')
    })()`))
  })
})
