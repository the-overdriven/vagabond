describe('Low-HP enrage', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Rush Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(() => {
      window.rushCheck=(ok,msg)=>{if(!ok) throw new Error(msg)}
      replayRecording=false; replayPlaying=false; replayData=null; replayAnimationsDisabled=true
      currentZ=0; currentCave=-1; map=surfaceMap; deathTransition=null
      enemies=[]; npcs=[]; occupied=new Set(); turnCount=0
      for(let y=30;y<=50;y++) for(let x=30;x<=50;x++) {
        map[y][x]='grass'; grasslandTrees.delete(keyXY(x,y))
      }
      player.x=40; player.y=40; player.hp=1000; player.maxHp=1000; player.race='human'
      player.godMode=false; player.invisibleTurns=0; player.poisonTurns=0
      player.equip={weapon:null,armor:null,shield:null}; resetSwimming()
      player.swimming=0; player.swimmingPractice=0
      window.rushEnemy=(name,x=38,y=40)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name]
        const e=addEnemy({...t,baseName:name,x,y,hp:t.hp,maxHp:t.hp,alive:true,
          level:0,homeX:x,homeY:y,homeTileType:'grass',prefix:null,equipment:null})
        occupied.add(keyXY(x,y)); return e
      }
    })()`))
  })

  it('logs threshold crossings once, uses effective ATK, and restores from saves/replay', () => {
    cy.window().then(win => win.eval(`(async () => {
      const oldChance=chance,oldDamage=damageRoll,oldLog=log
      const messages=[];let attackAtk=null
      try {
        chance=()=>false;damageRoll=atk=>{attackAtk=atk;return 2};log=msg=>messages.push(msg)
        for(const name of ['Orc','Minotaur','Owlbear','Lion','GAUR']) {
          enemies=[];occupied.clear();const e=rushEnemy(name,39,40)
          e.maxHp=100;e.hp=31
          // Test established combat: unalarmed GAUR intercepts the first rare sighting's attacks.
          e.aware=true;alarmEnemy(e)
          rushCheck(e.abilities.includes('enrage'),'template enrage '+name)
          rushCheck(!enemyIsEnraged(e),'above threshold')
          const base=e.atk
          const rageLogsBefore=messages.filter(m=>m.startsWith('Pain drives ')).length
          await playerAttackEnemy(e,true)
          rushCheck(e.hp===29,'threshold-crossing damage: '+name)
          rushCheck(enemyIsEnraged(e) && enemyAtk(e)===base*1.25 && e.atk===base,'derived bonus: '+name)
          rushCheck(messages.filter(m=>m.startsWith('Pain drives ')).length===rageLogsBefore+1 &&
            messages.includes('Pain drives '+name+' into a rage!'),'first crossing logs once: '+name)
          const before=messages.filter(m=>m.startsWith('Pain drives ')).length
          await playerAttackEnemy(e,true)
          rushCheck(messages.filter(m=>m.startsWith('Pain drives ')).length===before,'no duplicate rage log')
          enemyAttackPlayer(e,true)
          rushCheck(attackAtk===base*1.25,'effective melee ATK')
          const info=tileInspectInfo(e.x,e.y).html
          rushCheck(info.includes('Enraged (ATK +25%)'),'inspection status')
          e.hp=30;rushCheck(!enemyIsEnraged(e),'exact threshold inactive')
          e.hp=1;const logsBefore=messages.length
          await playerAttackEnemy(e,true)
          rushCheck(!messages.slice(logsBefore).some(m=>m.startsWith('Pain drives ')),'fatal hit no enrage')
        }
        enemies=[];occupied.clear();const e=rushEnemy('Minotaur',39,40);e.hp=1
        const save=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(save)
        const restored=enemies.find(other=>other.id===e.id)
        rushCheck(enemyIsEnraged(restored) && restored.atk===e.atk,'restore without stacking')
        startReplayRecording()
        rushCheck(enemyIsEnraged(replayData.initialState.enemies.find(other=>other.id===e.id)),'replay snapshot derived status')
        replayRecording=false
      } finally {chance=oldChance;damageRoll=oldDamage;log=oldLog}
    })()`))
  })

  it('keeps GAUR first-sighting escape separate from enrage after it turns to fight', () => {
    cy.window().then(win => win.eval(`(async () => {
      const e=rushEnemy('GAUR',39,40);e.maxHp=100;e.hp=31
      const oldChance=chance,oldDamage=damageRoll
      try {
        chance=()=>false;damageRoll=()=>2
        rushCheck(rareFleeEligible(e),'unalarmed GAUR uses rare flight')
        rushCheck(await playerAttackEnemy(e,true)===false && e.hp===31 && !enemyIsEnraged(e),
          'first sighting intercepts damage before enrage')
        rareCatch(e)
        rushCheck(!rareFleeEligible(e),'cornered GAUR is now in combat')
        await playerAttackEnemy(e,true)
        rushCheck(e.hp===29 && enemyIsEnraged(e),'combat hit crosses enrage threshold')
      } finally {chance=oldChance;damageRoll=oldDamage}
    })()`))
  })

  it('combines with Charge and ends on healing', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldChance=chance,oldDamage=damageRoll,oldLog=log
      let calls=0,atk=null;const messages=[]
      try {
        const e=rushEnemy('Minotaur');e.hp=1
        chance=()=>++calls===1;damageRoll=a=>{atk=a;return 2};log=m=>messages.push(m)
        rushCheck(tryEnemyRush(e) && atk===e.atk*1.25*1.25,'charge and rage multiply')
        e.abilities.push('lifesteal');e.hp=Math.floor(e.maxHp*.30)-1
        chance=()=>true;applyEnemyLifesteal(e,12)
        rushCheck(!enemyIsEnraged(e) && enemyAtk(e)===e.atk,'healing ends rage')
        rushCheck(messages.some(m=>m.includes('rage subsides')),'recovery log')
        rushCheck(!enemyIsEnraged({...e,hp:0}),'dead enemy not enraged')
      } finally {chance=oldChance;damageRoll=oldDamage;log=oldLog}
    })()`))
  })
  it('replays combat with an enraged Minotaur without changing its base ATK', () => {
    cy.window().then(win => win.eval(`(async () => {
      const e=rushEnemy('Minotaur',38,40);e.hp=Math.floor(e.maxHp*.20)
      player.freezing={active:false,turns:0};player.curseDebuffs=[]
      player.berryRegenTurns=0;player.speedPotionTurns=0
      consecutiveWaitTurns=0;rngState=917
      startReplayRecording()
      for(let i=0;i<3;i++) skipTurn()
      const state=()=>({hp:player.hp,x:player.x,y:player.y,turn:turnCount,enemies:buildSaveObject().enemies})
      const expected=JSON.parse(JSON.stringify(state())),recorded=JSON.parse(JSON.stringify(replayData))
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true;replaySimulationMode=true;activeReplay=recorded
      replayPlaying=true;replayRecording=false;replayRngIndex=0
      try {
        for(const action of recorded.actions) await runReplayAction(action)
        rushCheck(replayRngIndex===recorded.rng.length,'same RNG trace')
        rushCheck(JSON.stringify(state())===JSON.stringify(expected),'same enraged combat outcome')
      } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
    })()`))
  })

})
